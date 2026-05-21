/**
 * Business2Card ERP — order-actions.js
 *
 * ━━━ CENTRAL ACTIONS LAYER (RULE A1) ━━━
 *
 * طبقة الأفعال المركزية للأوردر. كل workflow action تمر من هنا.
 *
 * الصفحات لا تكتب على Firestore مباشرة — تنادي action واحد:
 *   await orderActions.submitToPrinting({ db, orderId, role, userId, userName });
 *   if (!result.ok) toast(result.errors[0], 'err');
 *
 * كل action:
 *   1. يحمّل الأوردر من Firestore
 *   2. يستدعي validator + buildSpec من orders.js
 *   3. يكتب ذرّياً (transaction أو writeBatch)
 *   4. يمر عبر financial-sync-engine للأحداث المالية
 *   5. يُرجع { ok, errors, warnings, orderId, ... }
 *
 * هذا الملف بديل آمن لـ inline writes في الصفحات.
 */

import { runTransaction, doc, getDoc, writeBatch, serverTimestamp, collection, increment }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  buildArchiveSpec,
  buildStageAdvance,
  validatePayment,
  validateRefund,
  validateCostItem,
  advanceOrderStageWithLock,
  nowStr,
} from './orders.js';
import { dispatchFinancialEvent, addLedgerToBatch, FE } from './financial-sync-engine.js';

// ══════════════════════════════════════════
// INTERNAL HELPERS
// ══════════════════════════════════════════

/** يحمّل أوردر من Firestore مع reference جاهز. يُرجع null لو غير موجود. */
async function _loadOrder(db, orderId) {
  if (!db || !orderId) return null;
  const ref = doc(db, 'orders', orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { ...snap.data(), _id: orderId, _ref: ref };
}

/**
 * wrapper موحَّد للـ stage transitions — يستدعي advanceOrderStageWithLock.
 *
 * Pre-flight: يحمّل الأوردر ويبني الـ spec بـ buildStageAdvance (pure) لاكتشاف
 * الـ errors والـ warnings قبل الـ transaction. لو في warnings والـ caller لم يمرّر
 * bypassWarnings=true، يُرجع { ok:false, needsConfirmation:true, warnings:[...] }
 * بدون أي كتابة — نفس pattern archiveOrder.
 *
 * هذا يسمح للـ UI أن يعرض dialog: "في warnings، تأكيد؟" ثم يعيد النداء
 * بـ bypassWarnings:true ليكتمل التقديم.
 */
async function _advanceFromStage({
  db, orderId, expectedCurrentStage,
  role, userId, userName,
  nextAssigneeId = '', nextAssigneeName = '',
  bypassWarnings = false, extraFields = {},
}) {
  // Pre-flight — اكتشاف الـ warnings بدون كتابة
  const order = await _loadOrder(db, orderId);
  if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
  if (expectedCurrentStage && order.stage !== expectedCurrentStage) {
    return {
      ok: false,
      errors: [`الـ stage تغيّر — متوقع "${expectedCurrentStage}"، الحالي "${order.stage}"`],
      warnings: [],
      orderId,
    };
  }
  const preview = buildStageAdvance({
    order, role, userId, userName,
    nextAssigneeId, nextAssigneeName,
    bypassWarnings, extraFields,
  });
  if (!preview.ok) {
    return {
      ok: false,
      errors: preview.errors || [],
      warnings: preview.warnings || [],
      needsConfirmation: preview.needsConfirmation || false,
      orderId,
    };
  }

  // OK — atomic transaction with stage lock
  try {
    const result = await advanceOrderStageWithLock({
      db, runTransaction, doc,
      orderId, expectedCurrentStage,
      role, userId, userName,
      nextAssigneeId, nextAssigneeName,
      bypassWarnings, extraFields,
    });
    return {
      ok: true,
      errors: [],
      warnings: result?.warnings || [],
      orderId,
      newStage: result?.to || null,
      action: `advance_${expectedCurrentStage}_to_${result?.to || 'next'}`,
    };
  } catch (e) {
    return {
      ok: false,
      errors: [e.message || 'فشل تقديم المرحلة'],
      warnings: [],
      orderId,
    };
  }
}

// ══════════════════════════════════════════
// ACTIONS — Central Workflow Operations
// ══════════════════════════════════════════

export const orderActions = {

  // ─── Stage Transitions ───────────────────

  /**
   * design → printing
   * يتطلب موافقة التصميم (validateStageRequirements في buildStageAdvance).
   */
  async submitToPrinting(args) {
    return _advanceFromStage({ ...args, expectedCurrentStage: 'design' });
  },

  /**
   * printing → production
   * يتطلب تجهيز الطباعة (validate في buildStageAdvance).
   */
  async submitToProduction(args) {
    return _advanceFromStage({ ...args, expectedCurrentStage: 'printing' });
  },

  /**
   * production → shipping
   * يتطلب إنهاء التنفيذ (costItems معلَّمة، products done).
   */
  async submitToShipping(args) {
    return _advanceFromStage({ ...args, expectedCurrentStage: 'production' });
  },

  // ─── Archive ─────────────────────────────

  /**
   * any active stage → archived
   * يستخدم buildArchiveSpec (نفس الفحوصات المركزية).
   *
   * @param {string} args.source — 'shipping'|'production'|'bulk_admin'|'status_change'|'manual'
   */
  async archiveOrder({
    db, orderId, role, userId, userName,
    source = 'manual', reason = '',
    bypassWarnings = false, extraFields = {},
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const spec = buildArchiveSpec({
      order, role, userId, userName,
      source, reason, bypassWarnings, extraFields,
    });

    if (!spec.ok) {
      return {
        ok: false,
        errors: spec.errors,
        warnings: spec.warnings,
        needsConfirmation: spec.needsConfirmation || false,
        orderId,
      };
    }

    try {
      const batch = writeBatch(db);
      batch.update(order._ref, {
        ...spec.fields,
        timeline: [...(order.timeline || []), spec.timelineEntry],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return {
        ok: true,
        errors: [],
        warnings: spec.warnings,
        orderId,
        action: 'archive',
        source,
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.message || 'فشل تنفيذ الأرشفة'],
        warnings: [],
        orderId,
      };
    }
  },

  // ─── Shipping Sub-Workflow ────────────────

  /**
   * shipStage: wait_delivery → wait_collection
   * تسجيل تسليم الأوردر للعميل (قبل التحصيل).
   *
   * يحفظ deliveredAt + deliveredBy + timeline entry.
   * لا يحدث `stage` الرئيسي (يبقى 'shipping').
   * لا يولّد أي حدث مالي.
   */
  async markDelivered({ db, orderId, role, userId, userName }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    if (order.stage === 'archived') {
      return { ok: false, errors: ['الأوردر مؤرشف'], warnings: [], orderId };
    }
    if (order.shipStage === 'returned') {
      return { ok: false, errors: ['الأوردر مرتجع'], warnings: [], orderId };
    }
    if ((order.shipStage || 'ready') !== 'wait_delivery') {
      return { ok: false, errors: ['الأوردر ليس في حالة "في الطريق"'], warnings: [], orderId };
    }
    try {
      const now = nowStr();
      const batch = writeBatch(db);
      batch.update(order._ref, {
        shipStage: 'wait_collection',
        deliveredAt: now,
        deliveredBy: userName || '',
        timeline: [
          ...(order.timeline || []),
          { date: now, action: '✅ تم التسليم — انتظار التحصيل', by: userName || '', byId: userId || '' },
        ],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { ok: true, errors: [], warnings: [], orderId, action: 'mark_delivered' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل تسجيل التسليم'], warnings: [], orderId };
    }
  },

  // ─── Financial Actions ────────────────────

  /**
   * تسجيل دفعة عميل (CUSTOMER_PAYMENT).
   * يمر عبر validatePayment + financial-sync-engine (atomic, audit-tracked).
   *
   * @param {string} args.walletId       — المحفظة المستلِمة
   * @param {string} [args.walletName]
   * @param {number} args.amount
   * @param {string} [args.source='customer']  — 'customer' | 'refund'
   * @param {string} [args.note]
   */
  async recordPayment({
    db, orderId, amount, walletId, walletName = '',
    role, userId, userName,
    note = '', source = 'customer',
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const v = validatePayment({ order, amount, source, role });
    if (!v.ok) return { ...v, orderId };

    const eventType = source === 'refund' ? FE.CUSTOMER_REFUND : FE.CUSTOMER_PAYMENT;

    try {
      const eventResult = await dispatchFinancialEvent(db, eventType, {
        orderId,
        clientId:   order.clientId   || '',
        clientName: order.clientName || '',
        walletId,
        walletName,
        amount:     parseFloat(amount) || 0,
        note,
        createdBy:     userId   || '',
        createdByName: userName || '',
      });
      return {
        ok: true,
        errors: [],
        warnings: v.warnings,
        orderId,
        eventType,
        action: 'payment',
        eventResult,
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.message || 'فشل تسجيل الدفعة'],
        warnings: [],
        orderId,
      };
    }
  },

  /**
   * استرداد مبلغ للعميل (CUSTOMER_REFUND).
   * يمر عبر validateRefund + financial-sync-engine.
   *
   * @param {string} args.walletId  — المحفظة المسحوب منها
   * @param {number} args.amount
   * @param {string} [args.reason]  — سبب الاسترداد (للـ audit)
   */
  async refundOrder({
    db, orderId, amount, walletId, walletName = '',
    role, userId, userName,
    note = '', reason = '',
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const v = validateRefund({ order, amount, role });
    if (!v.ok) return { ...v, orderId };

    try {
      const eventResult = await dispatchFinancialEvent(db, FE.CUSTOMER_REFUND, {
        orderId,
        clientId:   order.clientId   || '',
        clientName: order.clientName || '',
        walletId,
        walletName,
        amount:     parseFloat(amount) || 0,
        note:       note || reason || '',
        createdBy:     userId   || '',
        createdByName: userName || '',
      });
      return {
        ok: true,
        errors: [],
        warnings: v.warnings,
        orderId,
        eventType: FE.CUSTOMER_REFUND,
        action: 'refund',
        eventResult,
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.message || 'فشل تنفيذ الاسترداد'],
        warnings: [],
        orderId,
      };
    }
  },

  /**
   * recordCostItem — تسجيل أو تعديل بند تكلفة على الأوردر (RULE A1).
   *
   * المركزي الوحيد لتسجيل بنود التكلفة في النظام. الصفحات (production.html،
   * features/cost-items/drawer.js، exec-cost-entry.html...) كلها تنادي هذا
   * الـ action بدل كتابة writeBatch مباشرة.
   *
   * يبني batch واحد ذرّي يحوي:
   *   • تحديث order.costItems + timeline (+ productionAgent لو غير محدد)
   *   • خصم من المحفظة + transaction record (لو walletId && !isEdit)
   *   • supplier_payments (لو walletId && supplierId && !isEdit)
   *   • supplier_orders (جديد/تحديث/إبطال حسب التغيير)
   *   • addLedgerToBatch بـ FE.VENDOR_PAYMENT أو FE.GENERAL_EXPENSE (لو !isEdit)
   *
   * @param {Object} args
   * @param {Object} args.db                  — Firestore instance
   * @param {string} args.orderId
   * @param {number} args.prodIdx             — index في order.products أو -1 (عام)
   * @param {Object} args.payload             — { type, total, supplierId, supplierName, note, walletId, paperMeta, isExternal }
   * @param {string} args.role
   * @param {string} args.userId
   * @param {string} args.userName
   * @param {Array}  [args.wallets=[]]        — قائمة المحافظ للـ validation
   * @param {boolean}[args.isEdit=false]
   * @param {number} [args.editIdx=-1]        — index في order.costItems للتعديل
   * @returns {{ ok, errors, warnings, orderId, costItemId, eventType, action }}
   */
  async recordCostItem({
    db, orderId, prodIdx,
    payload,
    role, userId, userName,
    wallets = [],
    isEdit = false, editIdx = -1,
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const v = validateCostItem({ order, payload, role, wallets, isEdit });
    if (!v.ok) return { ...v, orderId };

    const {
      type, total: rawTotal,
      supplierId = '', supplierName = '',
      note = '', walletId = '',
      paperMeta = {},
    } = payload;
    const total = parseFloat(rawTotal) || 0;

    // ── prepare refs + ids ────────────────────────────────
    const orderRef = order._ref;
    const txRef    = (walletId && !isEdit) ? doc(collection(db, 'transactions_v2')) : null;
    const spRef    = (walletId && !isEdit && supplierId) ? doc(collection(db, 'supplier_payments')) : null;

    const existingItem = isEdit ? (order.costItems || [])[editIdx] : null;
    const existingId   = existingItem?.costItemId;
    const costItemId   = existingId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));

    // supplier_orders handling (RULE 7 — formal supplier record)
    const existingSoId    = existingItem?.supplierOrderId || '';
    const supplierChanged = isEdit && !!existingSoId && (existingItem?.supplierId || '') !== supplierId;
    const needNewSo       = !!supplierId && (!isEdit || !existingSoId || supplierChanged);
    const soRef           = needNewSo ? doc(collection(db, 'supplier_orders')) : null;
    const supplierOrderId = soRef ? soRef.id : (!supplierChanged && existingSoId && supplierId ? existingSoId : '');

    // ── build new item ────────────────────────────────────
    const newItem = {
      costItemId,
      orderId,
      isExternal: !!supplierId,
      ...(supplierOrderId ? { supplierOrderId } : {}),
      type,
      supplierId,
      supplierName,
      prodIdx: prodIdx >= 0 ? prodIdx : null,
      total,
      note,
      ...(paperMeta && Object.keys(paperMeta).length ? { paperMeta } : {}),
      date: new Date().toISOString().slice(0, 10),
      addedAt: nowStr(),
      addedBy: userName,
      ...(txRef ? { txId: txRef.id, walletId } : {}),
      ...(spRef ? { spId: spRef.id } : {}),
    };

    // ── splice into costItems ─────────────────────────────
    const newCi = [...(order.costItems || [])];
    if (isEdit && editIdx >= 0) newCi.splice(editIdx, 1, newItem);
    else newCi.push(newItem);

    // ── build atomic batch ────────────────────────────────
    const batch = writeBatch(db);
    const action = isEdit
      ? `✏️ تعديل بند ${type}: ${total.toLocaleString('ar-EG')} ج`
      : `💰 ${type}: ${total.toLocaleString('ar-EG')} ج${note ? ' — ' + note : ''}`;

    // 1) order update
    batch.update(orderRef, {
      costItems: newCi,
      ...(!order.productionAgent && userId ? { productionAgent: userId, productionAgentName: userName } : {}),
      timeline: [...(order.timeline || []), { date: nowStr(), action, by: userName }],
      updatedAt: serverTimestamp(),
    });

    // 2) wallet debit + transaction (only new items)
    if (txRef) {
      batch.update(doc(db, 'wallets', walletId), { balance: increment(-total) });
      const walletName = (wallets.find(x => x._id === walletId) || {}).name || '';
      batch.set(txRef, {
        type: 'out',
        walletId, walletName,
        amount: total,
        category: type === 'تصميم' ? 'designer_fee' : 'printer_payment',
        description: `${type}${note ? ' — ' + note : ''} · ${order.clientName || orderId}`,
        supplierId, supplierName,
        orderId, orderClient: order.clientName || '',
        date: new Date().toISOString().slice(0, 10),
        createdAt: serverTimestamp(),
        createdBy: userName,
        source: 'production',
      });
      if (spRef) {
        batch.set(spRef, {
          supplierId, supplierName,
          amount: total,
          orderId, orderClient: order.clientName || '',
          note: `${type}${note ? ' — ' + note : ''}`,
          walletId, walletName,
          date: new Date().toISOString().slice(0, 10),
          createdAt: serverTimestamp(),
          createdBy: userName,
          source: 'production',
        });
      }
    }

    // 3) ledger entry — only new items (edits don't re-emit financial events)
    const eventType = supplierId ? FE.VENDOR_PAYMENT : FE.GENERAL_EXPENSE;
    if (!isEdit) {
      const walletName = walletId ? (wallets.find(x => x._id === walletId) || {}).name || '' : '';
      addLedgerToBatch(batch, db, eventType, {
        amount: total,
        orderId,
        clientName: order.clientName || '',
        vendorId: supplierId,
        vendorName: supplierName,
        walletId, walletName,
        notes: `تكلفة تنفيذ — ${type}${note ? ' — ' + note : ''} · ${order.clientName || ''}`,
        userId: userId || '',
        userName,
      });
    }

    // 4) supplier_orders — new / update / void
    if (existingSoId && (supplierChanged || (isEdit && !supplierId))) {
      batch.update(doc(db, 'supplier_orders', existingSoId), {
        isDeleted: true,
        voidedAt: serverTimestamp(),
        voidReason: supplierId ? 'تغيير المورد' : 'تحويل إلى داخلي',
      });
    }
    if (soRef) {
      batch.set(soRef, {
        costItemId,
        orderId, orderRef: order.orderId || orderId.slice(-6),
        clientName: order.clientName || '',
        supplierId, supplierName,
        type, total,
        note: note || '',
        status: 'pending',
        deliveryStatus: 'awaiting',
        paidAmount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId || '',
        createdByName: userName,
        isDeleted: false,
      });
    } else if (!supplierChanged && isEdit && existingSoId && supplierId) {
      batch.update(doc(db, 'supplier_orders', existingSoId), {
        type, total, note: note || '',
        updatedAt: serverTimestamp(),
      });
    }

    // ── commit ────────────────────────────────────────────
    try {
      await batch.commit();
      return {
        ok: true,
        errors: [],
        warnings: v.warnings,
        orderId,
        costItemId,
        eventType: isEdit ? null : eventType,
        action: isEdit ? 'edit_cost_item' : 'record_cost_item',
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.message || 'فشل حفظ البند'],
        warnings: [],
        orderId,
      };
    }
  },
};

// ══════════════════════════════════════════
// DEFAULT EXPORT (للتوافق مع import default)
// ══════════════════════════════════════════
export default orderActions;
