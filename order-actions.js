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

import { runTransaction, doc, getDoc, updateDoc, writeBatch, serverTimestamp, collection, increment, getDocs, query, where }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  buildArchiveSpec,
  buildStageAdvance,
  buildStageRevert,
  buildOrderSplit,
  validatePayment,
  validateRefund,
  validateCostItem,
  advanceOrderStageWithLock,
  nowStr,
  fmtDateAr,
  validateOrderResponsibility,
  ORDER_DESIGN_STAGES,
  matchCostItemProduct,
  resolveCostItemCategory,
  isActiveCostItem,
  COST_ITEM_STATUSES,
} from './orders.js';
import { dispatchFinancialEvent, addLedgerToBatch, FE } from './financial-sync-engine.js';
import { db as defaultDb } from './core/firebase-init.js';
import { withIdempotency } from './core/idempotency.js';
import { auditEntry, persistAuditLog } from './core/audit.js';
import { normalizeCostType } from './core/cost-type-normalize.js';
// طبقة المراسلة: «بدء التصميم» يفتح مجموعة العميل بعد تعيين المصمم (side-effect تواصلي).
// استيراد أعمال→مراسلة مسموح (قفل الحدود يقيّد المراسلة فقط من لمس الأعمال، لا العكس).
import { inboxActions } from './inbox-actions.js';

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
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, errors: ['لا يوجد اتصال بالإنترنت — يرجى المحاولة لاحقاً'], warnings: [], orderId };
  }
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
   * إنشاء أوردر جديد + (deposit optional) في atomic batch واحد.
   *
   * Flow:
   *   1. Validate inputs (products, stage, deposit-wallet consistency)
   *   2. Build single writeBatch:
   *      a) orders/{auto-id}.set(orderData) — full doc
   *      b) لو deposit > 0:
   *         wallets/{walletId}.update(balance: +deposit)
   *         transactions_v2/{auto-id}.set(deposit tx)
   *         financial_ledger/{auto-id}.set(CUSTOMER_PAYMENT entry)
   *   3. Commit atomically
   *
   * Files upload (Firebase Storage) is the caller's responsibility — the
   * action receives pre-uploaded URLs (designFileUrl + designFiles[]).
   *
   * Wrapped in withIdempotency to prevent double-submit creating two orders.
   *
   * @returns { ok, errors, warnings, operationId, orderId (human), orderDocId }
   */
  async createOrder({
    db = defaultDb,
    clientId, clientName = '', clientPhone = '',
    products = [], stage,
    salePrice = 0, deposit = 0,
    walletId = '', walletName = '',
    designerId = '', designerName = '',
    deadline = '', notes = '', designNote = '',
    designFileUrl = '', designFiles = [],
    depositReceiptUrl = '', depositReceiptFiles = [],
    deliveryAddress = null, customerPhoneShip = '',
    orderId = '', // human-readable ID, generated by caller
    userId, userName,
  }) {
    // Pre-flight validation
    if (!stage) return { ok: false, errors: ['⚠️ اختر مرحلة الأوردر'], warnings: [] };
    if (!Array.isArray(products) || !products.length) {
      return { ok: false, errors: ['⚠️ أضف منتجاً على الأقل'], warnings: [] };
    }
    if (!clientId) return { ok: false, errors: ['⚠️ clientId مطلوب'], warnings: [] };
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
    if (stage === 'printing' && salePrice <= 0) {
      return { ok: false, errors: ['⚠️ يجب إدخال سعر الأوردر لمرحلة الطباعة'], warnings: [] };
    }
    const dep = parseFloat(deposit) || 0;
    if (dep < 0) return { ok: false, errors: ['⚠️ العربون لا يصح أن يكون سالباً'], warnings: [] };
    if (dep > 0 && !walletId) {
      return { ok: false, errors: ['⚠️ اختر المحفظة للعربون'], warnings: [] };
    }
    if (dep > 0 && !depositReceiptUrl && (!Array.isArray(depositReceiptFiles) || !depositReceiptFiles.length)) {
      return { ok: false, errors: ['⚠️ صورة الإيصال مطلوبة عند تسجيل عربون'], warnings: [] };
    }

    // Idempotency fingerprint includes products signature + deposit
    // → double-click within minute returns cached result, no duplicate order.
    const productsHash = products.map(p => `${p.productId}:${p.qty}`).sort().join(',');
    return withIdempotency(db, {
      actionType: 'create_order',
      entityId: orderId || `new:${clientId}`,
      actorId: userId,
      payload: {
        stage,
        salePrice: parseFloat(salePrice) || 0,
        deposit: dep,
        walletId,
        products: productsHash,
      },
    }, async (operationId) => {

      const sale = parseFloat(salePrice) || 0;
      const productName = products.map(p => p.name).join(' + ');
      const totalQty = products.reduce((s, p) => s + (parseInt(p.qty) || 0), 0);
      const remaining = Math.max(0, sale - dep);
      const paymentStatus =
        sale <= 0 ? (dep > 0 ? 'partial' : 'pending') :
        (dep > 0 && dep >= sale ? 'paid' : dep > 0 ? 'partial' : 'pending');

      const timelineEntry = auditEntry({
        action: `🆕 طلب جديد — ${productName}${dep > 0 ? ' · عربون ' + dep + ' ج' : ''}${designerName ? ' · ' + designerName : ''}`,
        userId, userName,
        kind: 'op',
        meta: { stage, designerId },
      });
      // Preserve legacy timeline fields used by other consumers (assigneeId/Name)
      const fullTimelineEntry = {
        ...timelineEntry,
        stage,
        assigneeId: designerId || '',
        assigneeName: designerName || '',
      };

      const orderRef = doc(collection(db, 'orders'));
      const nowIso = new Date().toISOString();
      const nowAr = new Date().toLocaleDateString('ar-EG');

      const orderData = {
        orderId,
        stage,
        designStage: stage === 'design' ? ORDER_DESIGN_STAGES.PENDING : '',
        clientId, clientName, clientPhone,
        products,
        product: productName,
        qty: totalQty,
        salePrice: sale,
        deposit: dep,
        totalPaid: dep,
        remaining,
        paymentStatus,
        depositWallet: dep > 0 ? walletName : '',
        depositWalletId: dep > 0 ? walletId : '',
        designerId, designerName,
        deadline, notes,
        // عنوان التوصيل: يُنسخ من كارت العميل وقت الإنشاء (محافظة/مدينة) عشان
        // يظهر جاهز في الشحن ولا يتفوّت. يكمّله مسؤول الطباعة/الشحن بالتفصيل.
        // اختياري وbackward-compatible — يُكتب فقط لو فيه محافظة على الأقل.
        ...((deliveryAddress && typeof deliveryAddress === 'object' && deliveryAddress.gov)
          ? { deliveryAddress } : {}),
        ...(customerPhoneShip ? { customerPhoneShip } : {}),
        stageEnteredAt: { [stage]: nowIso },
        stageCompletedAt: {},
        // موعد تسليم التصميم اليدوي (الحقل الإجباري في الفورم) — نهاية اليوم المُدخَل.
        // يُخزَّن كـ stageDeadline.design فيتوحّد مع مفهوم مواعيد المراحل (يفوز على حساب SLA).
        stageDeadline: deadline ? { design: fmtDateAr(new Date(deadline + 'T23:59:59')) } : {},
        designFileUrl, designFiles, designFileNote: designNote,
        depositReceiptUrl, depositReceiptFiles,
        costItems: [],
        printAddons: [],
        createdDate: nowAr,
        createdBy: userId, createdByName: userName || '',
        timeline: [fullTimelineEntry],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // قاعدة المسؤولية العامة (R): مفيش أوردر بدون مسؤول + تاريخ.
      // createdBy=userId و createdDate مضمونان أعلاه، فالحارس دفاعي (fail-closed).
      const respChk = validateOrderResponsibility({ ...orderData, createdAt: nowAr });
      if (!respChk.ok) {
        return { ok: false, errors: respChk.errors, warnings: [], orderId };
      }

      try {
        const batch = writeBatch(db);
        batch.set(orderRef, orderData);

        if (dep > 0 && walletId) {
          batch.update(doc(db, 'wallets', walletId), {
            balance: increment(dep),
          });
          batch.set(doc(collection(db, 'transactions_v2')), {
            walletId, walletName,
            type: 'in', amount: dep, fees: 0,
            description: `عربون — ${clientName} — ${orderId}`,
            category: 'client_payment',
            orderId: orderRef.id,
            clientId, clientName,
            date: nowAr,
            receiptUrl: depositReceiptUrl,
            receiptFiles: depositReceiptFiles,
            createdBy: userId, createdByName: userName || '',
            createdAt: serverTimestamp(),
            approvalStatus: 'pending',
            confirmedBy: '', confirmedByName: '', confirmedAt: null,
            approvedBy: '', approvedByName: '', approvedAt: null,
            rejectedBy: '', rejectedByName: '', rejectedAt: null,
            rejectReason: '', isLocked: false,
          });
          addLedgerToBatch(batch, db, 'CUSTOMER_PAYMENT', {
            amount: dep,
            orderId: orderRef.id,
            clientId, clientName,
            walletId, walletName,
            notes: `عربون — ${clientName} — ${orderId}`,
            userId, userName,
            operationId, // PR-7.5 R2 forensic linkage
          });
        }

        await batch.commit();

        return {
          ok: true, errors: [], warnings: [],
          operationId,
          orderId,           // human-readable (caller-generated)
          orderDocId: orderRef.id, // Firestore auto-id
          action: 'create_order',
          deposit: dep,
          paymentStatus,
        };
      } catch (e) {
        return {
          ok: false,
          errors: [e.code === 'permission-denied'
            ? '🔒 ليس لديك صلاحية إنشاء أوردرات — راجع الأدمن'
            : (e.message || 'فشل إنشاء الأوردر')],
          warnings: [],
          operationId,
        };
      }
    });
  },

  /**
   * تحويل طلب بوابة مُهيكل (order_requests) إلى أوردر رسمي — يُغلِق حلقة العملية.
   *
   * يقرأ المستند من order_requests، يُنشئ أوردراً حقيقياً عبر createOrder (نفس
   * المسار الذرّي/المالي)، ثم يُعلّم الطلب `converted` ويربطه بالأوردر. الطلب هو
   * نقطة البداية الرسمية — لا رسالة محادثة (Order = SSoT).
   *
   * Returns: { ok, errors[], warnings[], orderId?, orderDocId?, requestId }
   */
  async createOrderFromRequest({
    db = defaultDb, requestId, role, userId, userName,
    salePrice = 0, deadline = '', notes = '',
  }) {
    if (!requestId) return { ok: false, errors: ['⚠️ requestId مطلوب'], warnings: [] };
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };

    const reqRef = doc(db, 'order_requests', requestId);
    let rq;
    try {
      const snap = await getDoc(reqRef);
      if (!snap.exists()) return { ok: false, errors: ['⚠️ الطلب غير موجود'], warnings: [], requestId };
      rq = snap.data();
    } catch (e) {
      return { ok: false, errors: [e.message || 'تعذّر قراءة الطلب'], warnings: [], requestId };
    }
    if (rq.status === 'converted') {
      return { ok: false, errors: ['⚠️ الطلب مُحوّل لأوردر بالفعل'], warnings: [], requestId, orderDocId: rq.convertedOrderId || '' };
    }
    if (!rq.clientUid) return { ok: false, errors: ['⚠️ الطلب بلا عميل'], warnings: [], requestId };

    // اربط الأوردر بمنتج الشركة الفعلي الذي اختاره العميل (productId من البوابة)؛
    // وإلا (طلب «منتج آخر» أو طلب قديم) استخدم المُعرّف الوهمي portal_request.
    const products = [{
      productId: rq.productId || 'portal_request',
      name: rq.product || 'طلب من البوابة',
      qty: parseInt(rq.qty, 10) || 1,
    }];
    const orderId = 'ORD-' + Date.now().toString().slice(-8);

    const res = await orderActions.createOrder({
      db,
      clientId: rq.clientUid, clientName: rq.clientName || '', clientPhone: rq.clientPhone || '',
      products, stage: 'design',
      salePrice: parseFloat(salePrice) || 0,
      deadline, notes: notes || rq.notes || '',
      orderId, userId, userName,
    });
    if (!res.ok) return { ...res, requestId };

    // علّم الطلب «مُحوّل» — الأوردر أُنشئ بالفعل، ففشل هذا التعليم غير قاتل.
    try {
      await updateDoc(reqRef, {
        status: 'converted',
        convertedOrderId: res.orderDocId,
        reviewedBy: userId, reviewedByName: userName || '',
        convertedAt: serverTimestamp(),
        timeline: [
          ...(Array.isArray(rq.timeline) ? rq.timeline : []),
          auditEntry({ action: `🔄 حُوِّل الطلب لأوردر ${orderId}`, userId, userName, kind: 'op', meta: { orderDocId: res.orderDocId } }),
        ],
      });
    } catch (_) { /* non-fatal: order exists; request flag can be reconciled */ }

    return {
      ok: true, errors: [], warnings: res.warnings || [],
      orderId: res.orderId, orderDocId: res.orderDocId, requestId,
    };
  },

  /**
   * رفض طلب بوابة مُهيكل (order_requests) — حالة نهائية، بلا أثر مالي.
   * Returns: { ok, errors[], warnings[], requestId }
   */
  async rejectOrderRequest({ db = defaultDb, requestId, userId, userName, reason = '' }) {
    if (!requestId) return { ok: false, errors: ['⚠️ requestId مطلوب'], warnings: [] };
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
    const reqRef = doc(db, 'order_requests', requestId);
    try {
      const snap = await getDoc(reqRef);
      if (!snap.exists()) return { ok: false, errors: ['⚠️ الطلب غير موجود'], warnings: [], requestId };
      const rq = snap.data();
      if (rq.status === 'converted') return { ok: false, errors: ['⚠️ الطلب مُحوّل لأوردر — لا يُرفض'], warnings: [], requestId };
      await updateDoc(reqRef, {
        status: 'rejected',
        reviewedBy: userId, reviewedByName: userName || '',
        rejectedAt: serverTimestamp(), rejectReason: reason || '',
        timeline: [
          ...(Array.isArray(rq.timeline) ? rq.timeline : []),
          auditEntry({ action: `🚫 رُفض الطلب${reason ? ' — ' + reason : ''}`, userId, userName, kind: 'op' }),
        ],
      });
      return { ok: true, errors: [], warnings: [], requestId };
    } catch (e) {
      return { ok: false, errors: [e.code === 'permission-denied' ? '🔒 لا صلاحية' : (e.message || 'فشل الرفض')], warnings: [], requestId };
    }
  },

  /**
   * any active stage → archived
   * يستخدم buildArchiveSpec (نفس الفحوصات المركزية).
   *
   * @param {string} args.source — 'shipping'|'production'|'bulk_admin'|'status_change'|'manual'
   */

  /**
   * تعديل حقول الأوردر (مع side-effect مالي لو totalPaid تغيّر).
   *
   * Use cases:
   *   - cgridSaveFinancial — single field edit (salePrice/totalPaid/discount)
   *   - cgridSaveRowEdit   — multi-field edit (name/business/sale/paid/assignee)
   *
   * إذا تغيّر totalPaid:
   *   - يفتح batch ذرّي يكتب: order + wallets (increment delta) +
   *     transactions_v2 (admin_edit) + financial_ledger (CUSTOMER_PAYMENT
   *     أو CUSTOMER_REFUND حسب إشارة الـ delta)
   *   - يحتاج walletId — لو ما فيش، يرفض
   *
   * إذا totalPaid لم يتغيّر:
   *   - updateDoc بسيط للحقول
   *
   * Locked-tx warning: الـ caller (clients.html) يفحص قبل النداء.
   * editReason يُمرَّر من الـ caller لو موجود، يُسجَّل في ledger + timeline.
   *
   * @param {string} args.changesLabel  — human-readable text للـ timeline
   *                                       (caller يبني الـ format)
   */

  /**
   * Generic single-field/multi-field order update with timeline entry.
   * No financial semantics — for admin field edits, status flags, etc.
   * For financial fields use editOrderPayment. For stage changes use moveStage.
   *
   * @param {Object} changes — fields to update (excluding timeline)
   * @param {string} timelineAction — line to append to timeline
   */
  async updateOrderField({
    db = defaultDb, orderId,
    changes = {},
    timelineAction = '',
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    if (!changes || typeof changes !== 'object' || !Object.keys(changes).length) {
      return { ok: false, errors: ['⚠️ لا توجد تغييرات'], warnings: [], orderId };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    try {
      const upd = { ...changes, updatedAt: serverTimestamp() };
      if (timelineAction) {
        const entry = auditEntry({
          action: timelineAction,
          userId, userName, kind: 'edit',
          meta: { fields: Object.keys(changes) },
        });
        upd.timeline = [...(order.timeline || []), entry];
      }
      await updateDoc(order._ref, upd);
      return { ok: true, errors: [], warnings: [], orderId, action: 'update_order_field' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [], orderId };
    }
  },

  async editOrderPayment({
    db = defaultDb,
    orderId,
    changes = {},          // { salePrice?, totalPaid?, discount?, customerShipFee?, clientName?, clientBusiness?, assignedTo?, csName? }
    walletId = '',
    walletName = '',
    changesLabel = '',
    editReason = '',
    userId, userName,
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
    if (!changes || typeof changes !== 'object' || !Object.keys(changes).length) {
      return { ok: false, errors: ['⚠️ لا توجد تغييرات'], warnings: [] };
    }

    // Idempotency fingerprint covers the changes signature
    const changesHash = Object.keys(changes).sort().map(k => `${k}:${changes[k]}`).join('|');
    return withIdempotency(db, {
      actionType: 'edit_order_payment',
      entityId: orderId,
      actorId: userId,
      payload: { changesHash, walletId },
    }, async (operationId) => {

      const order = await _loadOrder(db, orderId);
      if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId, operationId };

      // Resolve old vs new for the 4 financial fields
      const oldSale  = parseFloat(order.salePrice)        || 0;
      const oldPaid  = parseFloat(order.totalPaid) || parseFloat(order.paid) || parseFloat(order.deposit) || 0;
      const oldDisc  = parseFloat(order.discount)         || 0;
      const oldCFee  = parseFloat(order.customerShipFee)  || 0;

      const newSale  = changes.salePrice        != null ? (parseFloat(changes.salePrice)        || 0) : oldSale;
      const newPaid  = changes.totalPaid        != null ? (parseFloat(changes.totalPaid)        || 0) : oldPaid;
      const newDisc  = changes.discount         != null ? (parseFloat(changes.discount)         || 0) : oldDisc;
      const newCFee  = changes.customerShipFee  != null ? (parseFloat(changes.customerShipFee)  || 0) : oldCFee;

      const newRem        = Math.max(0, newSale + newCFee - newDisc - newPaid);
      const newPayStatus  = newRem <= 0.01 ? 'paid' : newPaid > 0 ? 'partial' : 'pending';
      const paidDiff      = newPaid - oldPaid;

      if (Math.abs(paidDiff) > 0.01 && !walletId) {
        return {
          ok: false,
          errors: ['⚠️ تغيير totalPaid يحتاج walletId للـ wallet sync'],
          warnings: [], orderId, operationId,
        };
      }

      // Timeline entry — universal audit (H3)
      const tlAction = changesLabel || (editReason
        ? `💰 [أدمن] تعديل أوردر · سبب: ${editReason}`
        : '💰 [أدمن] تعديل أوردر');
      const tlEntry = auditEntry({
        action: tlAction,
        userId, userName,
        kind: editReason ? 'edit' : 'edit',
        meta: {
          changedFields: Object.keys(changes),
          paidDiff: Math.round(paidDiff * 100) / 100,
          editReason: editReason || null,
        },
      });

      const orderUpdates = {
        ...changes,
        remaining: newRem,
        paymentStatus: newPayStatus,
        timeline: [...(order.timeline || []), tlEntry],
        updatedAt: serverTimestamp(),
        ...(newPayStatus === 'paid' ? { paidAt: serverTimestamp() } : {}),
      };

      try {
        if (Math.abs(paidDiff) > 0.01 && walletId) {
          // Financial path — atomic batch with wallet/tx/ledger
          const batch = writeBatch(db);
          batch.update(order._ref, orderUpdates);
          batch.update(doc(db, 'wallets', walletId), {
            balance: increment(paidDiff),
          });
          const isIn = paidDiff > 0;
          batch.set(doc(collection(db, 'transactions_v2')), {
            walletId, walletName,
            type: isIn ? 'in' : 'out',
            amount: Math.abs(paidDiff),
            description: `تعديل أدمن — ${isIn ? 'دفعة' : 'استرداد'} — ${order.clientName || ''}`,
            category: 'admin_edit',
            orderId,
            clientName: order.clientName || '',
            date: new Date().toLocaleDateString('ar-EG'),
            createdAt: serverTimestamp(),
            createdBy: userId, createdByName: userName || 'admin',
            approvalStatus: 'pending',
            confirmedBy: '', confirmedByName: '', confirmedAt: null,
            approvedBy: '', approvedByName: '', approvedAt: null,
            rejectedBy: '', rejectedByName: '', rejectedAt: null,
            rejectReason: '', isLocked: false,
          });
          addLedgerToBatch(batch, db, isIn ? 'CUSTOMER_PAYMENT' : 'CUSTOMER_REFUND', {
            amount: Math.abs(paidDiff),
            orderId,
            clientId: order.clientId || '',
            clientName: order.clientName || '',
            walletId, walletName,
            notes: editReason
              ? `[أدمن] ${changesLabel || 'تعديل'} · سبب: ${editReason}`
              : `[أدمن] ${changesLabel || 'تعديل أوردر'}`,
            adminEditReason: editReason || '',
            userId, userName: userName || 'admin',
            operationId, // R2 forensic linkage
          });
          await batch.commit();
        } else {
          // Non-financial path — single updateDoc
          await updateDoc(order._ref, orderUpdates);
        }

        return {
          ok: true, errors: [], warnings: [],
          orderId, operationId,
          action: 'edit_order_payment',
          paidDiff: Math.round(paidDiff * 100) / 100,
          newRem, newPayStatus,
        };
      } catch (e) {
        return {
          ok: false,
          errors: [e.code === 'permission-denied'
            ? '🔒 ليس لديك صلاحية تعديل الأوردرات'
            : (e.message || 'فشل التعديل')],
          warnings: [],
          orderId, operationId,
        };
      }
    });
  },

  // ─── Bulk Operations (P1.8) ───────────────
  //
  // Admin bulk actions on selected orders from the Control Grid.
  // Each handler:
  //   - loads all orders in parallel
  //   - chunks writes into batches of 400 (Firestore 500-write cap, headroom)
  //   - emits auditEntry() timeline entries (RULE H3 — actor required)
  //   - returns { ok, count, blocked?, blockedReasons?, orderIds }
  //
  // Archive paths delegate to buildArchiveSpec → same central validation as
  // single-order archive (no duplicated logic — RULE C1.3).

  async bulkArchive({
    db = defaultDb,
    orderIds = [],
    role = '',
    userId, userName,
    source = 'bulk_admin', reason = '',
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
    if (!Array.isArray(orderIds) || !orderIds.length) {
      return { ok: false, errors: ['⚠️ orderIds مطلوب'], warnings: [] };
    }
    try {
      const refs = orderIds.map(id => doc(db, 'orders', id));
      const snaps = await Promise.all(refs.map(r => getDoc(r)));
      const loaded = snaps
        .map((s, i) => s.exists() ? { ...s.data(), _id: orderIds[i], _ref: refs[i] } : null)
        .filter(Boolean);
      const specs = loaded.map(o => ({
        o,
        spec: buildArchiveSpec({
          order: o, role, userId, userName,
          source, reason, bypassWarnings: true,
        }),
      }));
      const archivable = specs.filter(x => x.spec.ok);
      const blocked    = specs.filter(x => !x.spec.ok);
      if (!archivable.length) {
        const reasons = [...new Set(blocked.flatMap(x => x.spec.errors))].slice(0, 3);
        return {
          ok: false,
          errors: [reasons.length
            ? `⛔ لا يمكن أرشفة أي أوردر — ${reasons.join(' · ')}`
            : '⛔ لا يمكن أرشفة أي أوردر'],
          warnings: [],
          count: 0,
          blocked: blocked.length,
          blockedReasons: reasons,
        };
      }
      for (let i = 0; i < archivable.length; i += 400) {
        const chunk = archivable.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(({ o, spec }) => batch.update(o._ref, {
          ...spec.fields,
          timeline: [...(o.timeline || []), spec.timelineEntry],
          updatedAt: serverTimestamp(),
        }));
        await batch.commit();
      }
      return {
        ok: true,
        errors: [],
        warnings: blocked.length ? [`⚠️ ${blocked.length} مستثنى (لا يستوفي شروط الأرشفة)`] : [],
        action: 'bulk_archive',
        count: archivable.length,
        blocked: blocked.length,
        orderIds: archivable.map(x => x.o._id),
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.code === 'permission-denied'
          ? '🔒 ليس لديك صلاحية الأرشفة'
          : (e.message || 'فشل الأرشفة الجماعية')],
        warnings: [],
      };
    }
  },

  async bulkReopen({
    db = defaultDb,
    orderIds = [],
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
    if (!Array.isArray(orderIds) || !orderIds.length) {
      return { ok: false, errors: ['⚠️ orderIds مطلوب'], warnings: [] };
    }
    try {
      const refs = orderIds.map(id => doc(db, 'orders', id));
      const snaps = await Promise.all(refs.map(r => getDoc(r)));
      const loaded = snaps
        .map((s, i) => s.exists() ? { ...s.data(), _id: orderIds[i], _ref: refs[i] } : null)
        .filter(Boolean);
      const now = nowStr();
      for (let i = 0; i < loaded.length; i += 400) {
        const chunk = loaded.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(o => {
          const targetStage = o.stage === 'archived' ? 'design' : o.stage;
          const entry = auditEntry({
            action: `🔄 [أدمن] إعادة فتح → ${targetStage}`,
            userId, userName, kind: 'op',
          });
          batch.update(o._ref, {
            stage: targetStage,
            [`stageEnteredAt.${targetStage}`]: now,
            timeline: [...(o.timeline || []), entry],
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      return {
        ok: true, errors: [], warnings: [],
        action: 'bulk_reopen',
        count: loaded.length,
        orderIds: loaded.map(o => o._id),
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.code === 'permission-denied'
          ? '🔒 ليس لديك صلاحية إعادة الفتح'
          : (e.message || 'فشل إعادة الفتح الجماعية')],
        warnings: [],
      };
    }
  },

  /**
   * Bulk stage move. If mapping.stage==='archived' delegates to buildArchiveSpec
   * for proper validation; otherwise applies mapping fields directly with a
   * stageEnteredAt update when stage changes.
   *
   * @param {string} target  — human-readable label for timeline + audit
   * @param {Object} mapping — { stage?, shipStage?, paymentStatus?, returnType?, hasProblem? }
   */
  async bulkStageMove({
    db = defaultDb,
    orderIds = [],
    target = '',
    mapping = {},
    role = '',
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
    if (!Array.isArray(orderIds) || !orderIds.length) {
      return { ok: false, errors: ['⚠️ orderIds مطلوب'], warnings: [] };
    }
    if (!mapping || typeof mapping !== 'object' || !Object.keys(mapping).length) {
      return { ok: false, errors: ['⚠️ mapping مطلوب'], warnings: [] };
    }
    try {
      const refs = orderIds.map(id => doc(db, 'orders', id));
      const snaps = await Promise.all(refs.map(r => getDoc(r)));
      const loaded = snaps
        .map((s, i) => s.exists() ? { ...s.data(), _id: orderIds[i], _ref: refs[i] } : null)
        .filter(Boolean);

      // Archive → central spec
      if (mapping.stage === 'archived') {
        const specs = loaded.map(o => ({
          o,
          spec: buildArchiveSpec({
            order: o, role, userId, userName,
            source: 'bulk_admin',
            reason: `نقل جماعي → ${target || 'أرشيف'}`,
            bypassWarnings: true,
          }),
        }));
        const archivable = specs.filter(x => x.spec.ok);
        const blocked    = specs.filter(x => !x.spec.ok);
        if (!archivable.length) {
          const reasons = [...new Set(blocked.flatMap(x => x.spec.errors))].slice(0, 3);
          return {
            ok: false,
            errors: [reasons.length
              ? `⛔ لا يمكن أرشفة أي أوردر — ${reasons.join(' · ')}`
              : '⛔ لا يمكن أرشفة أي أوردر'],
            warnings: [],
            count: 0,
            blocked: blocked.length,
            blockedReasons: reasons,
          };
        }
        for (let i = 0; i < archivable.length; i += 400) {
          const chunk = archivable.slice(i, i + 400);
          const batch = writeBatch(db);
          chunk.forEach(({ o, spec }) => batch.update(o._ref, {
            ...spec.fields,
            timeline: [...(o.timeline || []), spec.timelineEntry],
            updatedAt: serverTimestamp(),
          }));
          await batch.commit();
        }
        return {
          ok: true,
          errors: [],
          warnings: blocked.length ? [`⚠️ ${blocked.length} مستثنى`] : [],
          action: 'bulk_stage_move',
          target,
          count: archivable.length,
          blocked: blocked.length,
          orderIds: archivable.map(x => x.o._id),
        };
      }

      // Non-archive — direct field mapping
      const now = nowStr();
      for (let i = 0; i < loaded.length; i += 400) {
        const chunk = loaded.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(o => {
          const entry = auditEntry({
            action: `🔄 [أدمن] نقل جماعي → ${target || 'مرحلة جديدة'}`,
            userId, userName, kind: 'op',
          });
          const upd = {
            ...mapping,
            timeline: [...(o.timeline || []), entry],
            updatedAt: serverTimestamp(),
          };
          if (mapping.stage && mapping.stage !== o.stage) {
            upd[`stageEnteredAt.${mapping.stage}`] = now;
          }
          batch.update(o._ref, upd);
        });
        await batch.commit();
      }
      return {
        ok: true, errors: [], warnings: [],
        action: 'bulk_stage_move',
        target,
        count: loaded.length,
        orderIds: loaded.map(o => o._id),
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.code === 'permission-denied'
          ? '🔒 ليس لديك صلاحية النقل الجماعي'
          : (e.message || 'فشل النقل الجماعي')],
        warnings: [],
      };
    }
  },

  async bulkAssign({
    db = defaultDb,
    orderIds = [],
    employeeId = '', employeeName = '',
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
    if (!Array.isArray(orderIds) || !orderIds.length) {
      return { ok: false, errors: ['⚠️ orderIds مطلوب'], warnings: [] };
    }
    if (!employeeId && !employeeName) {
      return { ok: false, errors: ['⚠️ بيانات الموظف مطلوبة'], warnings: [] };
    }
    try {
      const refs = orderIds.map(id => doc(db, 'orders', id));
      const snaps = await Promise.all(refs.map(r => getDoc(r)));
      const loaded = snaps
        .map((s, i) => s.exists() ? { ...s.data(), _id: orderIds[i], _ref: refs[i] } : null)
        .filter(Boolean);
      for (let i = 0; i < loaded.length; i += 400) {
        const chunk = loaded.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(o => {
          const entry = auditEntry({
            action: `👤 [أدمن] تعيين ${employeeName}`,
            userId, userName, kind: 'op',
          });
          batch.update(o._ref, {
            assignedTo: employeeId,
            csName: employeeName,
            timeline: [...(o.timeline || []), entry],
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      return {
        ok: true, errors: [], warnings: [],
        action: 'bulk_assign',
        count: loaded.length,
        employeeId, employeeName,
        orderIds: loaded.map(o => o._id),
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.code === 'permission-denied'
          ? '🔒 ليس لديك صلاحية التعيين'
          : (e.message || 'فشل التعيين الجماعي')],
        warnings: [],
      };
    }
  },

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
    receiptUrl = '',
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const v = validatePayment({ order, amount, source, role });
    if (!v.ok) return { ...v, orderId };

    // 📷 Receipt إجباري للدفعات الواردة (مش للـ refund).
    const amt = parseFloat(amount) || 0;
    if (source !== 'refund' && amt > 0 && !receiptUrl) {
      return { ok: false, errors: ['⚠️ صورة الإيصال مطلوبة لكل دفعة فلوس'], warnings: [], orderId };
    }

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
        receiptUrl,
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
   * @param {number} args.prodIdx             — index في order.products (إلزامي)
   * @param {Object} args.payload             — { type, total, supplierId, supplierName, note, walletId, paperMeta }
   * @param {string} args.role
   * @param {string} args.userId
   * @param {string} args.userName
   * @param {Array}  [args.wallets=[]]        — قائمة المحافظ للـ validation
   * @param {boolean}[args.isEdit=false]
   * @param {number} [args.editIdx=-1]        — index في order.costItems للتعديل
   * @returns {{ ok, errors, warnings, orderId, costItemId, eventType, action }}
   */
  /**
   * Admin-only: حذف أوردر نهائي مع استرداد المبلغ المدفوع للمحفظة.
   * يُستخدم من cgridDeleteOrder في clients.html (force-delete).
   *
   * Flow (atomic writeBatch + idempotency):
   *   1. حساب paid (totalPaid/paid/deposit fallback) + identify wallet
   *   2. لو paid > 0 + wallet موجود:
   *      a) wallet.balance -= paid
   *      b) transactions_v2 reversal (type=out, isReversal=true, approvalStatus=pending)
   *      c) financial_ledger entry (FE.CUSTOMER_REFUND) عبر addLedgerToBatch
   *   3. orders/{orderId}.delete()
   *
   * @param {Object} args
   * @param {Object} args.db
   * @param {string} args.orderId
   * @param {string} args.userId
   * @param {string} args.userName
   * @returns {{ ok, errors, warnings, orderId, refundedAmount, walletId, walletName }}
   */
  async deleteOrderWithRefund({ db = defaultDb, orderId, userId, userName = '' }) {
    if (!orderId) return { ok: false, errors: ['orderId مطلوب'], warnings: [] };
    if (!userId)  return { ok: false, errors: ['userId مطلوب'],  warnings: [] };

    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const paid =
      parseFloat(order.totalPaid) ||
      parseFloat(order.paid) ||
      parseFloat(order.deposit) || 0;
    const wId = order.depositWalletId || order.walletId || '';

    return withIdempotency(db, {
      actionType: 'delete_order_with_refund',
      entityId: orderId,
      actorId: userId,
      payload: { orderId, refund: paid, walletId: wId },
    }, async () => {
      let walletName = '';
      if (wId) {
        const wSnap = await getDoc(doc(db, 'wallets', wId));
        if (wSnap.exists()) walletName = wSnap.data().name || '';
      }

      const batch = writeBatch(db);

      if (paid > 0 && wId) {
        batch.update(doc(db, 'wallets', wId), { balance: increment(-paid) });

        const txRef = doc(collection(db, 'transactions_v2'));
        batch.set(txRef, {
          walletId: wId, walletName,
          type: 'out', amount: paid, fees: 0,
          description: `استرداد — حذف أوردر — ${order.clientName || ''}`,
          category: 'refund',
          orderId, clientId: order.clientId || '', clientName: order.clientName || '',
          isReversal: true,
          date: new Date().toLocaleDateString('ar-EG'),
          createdBy: userId, createdByName: userName || 'admin',
          createdAt: serverTimestamp(),
          approvalStatus: 'pending', confirmedBy: '', confirmedByName: '', confirmedAt: null,
          approvedBy: '', approvedByName: '', approvedAt: null,
          rejectedBy: '', rejectedByName: '', rejectedAt: null, rejectReason: '',
          isLocked: false,
        });

        addLedgerToBatch(batch, db, FE.CUSTOMER_REFUND, {
          amount: paid,
          orderId,
          clientId: order.clientId || null,
          clientName: order.clientName || null,
          walletId: wId, walletName,
          notes: `[أدمن] حذف أوردر نهائي — استرداد ${paid} ج`,
          createdBy: userId, createdByName: userName || 'admin',
          label: 'استرداد (حذف أوردر)',
          icon: '↩️',
        });
      }

      batch.delete(doc(db, 'orders', orderId));
      await batch.commit();

      return {
        ok: true,
        errors: [], warnings: [],
        orderId,
        refundedAmount: paid,
        walletId: wId,
        walletName,
      };
    });
  },

  /**
   * Admin-only: حذف أوردر نهائي من صفحة التقارير. يتعامل مع كل أنواع المعاملات
   * المرتبطة (دفعات عملاء + مصروفات + دفعات موردين) وtxs supplier_payments.
   *
   * Flow:
   *   0. تحقق من عدم وجود shipping_settlements للأوردر (block إذا وُجدت)
   *   1. اقرأ كل transactions_v2 للأوردر
   *   2. لكل tx:
   *      - type='in', amount>0, walletId → wallet.balance -= amt + ledger CUSTOMER_REFUND
   *      - type='out', amount>0, walletId, مع spId → wallet+= + delete supplier_payment + ledger VENDOR_PAYMENT_REVERSAL
   *      - type='out', amount>0, walletId, بدون spId → wallet+= + ledger GENERAL_EXPENSE_REVERSAL
   *      - حذف الـ tx نفسه
   *   3. حذف الأوردر
   *
   * @param {Object} args
   * @param {Object} [args.db=defaultDb]
   * @param {string} args.orderId
   * @param {string} args.reason         — سبب الحذف (مطلوب)
   * @param {string} [args.note]         — ملاحظة إضافية
   * @param {string} args.userId
   * @param {string} [args.userName]
   * @param {Array}  [args.wallets=[]]   — قائمة محافظ لاسمائها (اختياري)
   *
   * @returns {{ok, errors, warnings, orderId, refunded, vendorReversed, generalReversed, operationId, idempotent}}
   */
  async adminDeleteOrder({
    db = defaultDb,
    orderId, reason, note = '',
    userId, userName = '',
    wallets = [],
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    if (!userId)  return { ok: false, errors: ['⚠️ userId مطلوب'],  warnings: [] };
    if (!reason)  return { ok: false, errors: ['⚠️ اختر سبب الحذف أولاً'], warnings: [] };

    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    return withIdempotency(db, {
      actionType: 'admin_delete_order',
      entityId: orderId,
      actorId: userId,
      payload: { orderId, reason },
    }, async () => {
      // 0) shipping_settlements guard (RULE 4 — لا تتجاوز flow الشحن)
      const stSnap = await getDocs(query(
        collection(db, 'shipping_settlements'),
        where('orderId', '==', orderId)
      ));
      if (!stSnap.empty) {
        return {
          ok: false,
          errors: ['الأوردر مرتبط بتسوية شحن — أَلغِ التسوية أولاً من صفحة حسابات الشحن'],
          warnings: [], orderId,
        };
      }

      // 1) اجمع كل المعاملات المرتبطة
      const txSnap = await getDocs(query(
        collection(db, 'transactions_v2'),
        where('orderId', '==', orderId)
      ));

      const batch = writeBatch(db);
      const ledgerBase = {
        orderId, clientName: order.clientName || '',
        notes: `حذف أوردر [${reason}]${note ? ' — ' + note : ''}`,
        userId, userName: userName || 'admin',
        createdBy: userId, createdByName: userName || 'admin',
      };
      const walletNameOf = (wid) => wallets.find(w => w._id === wid)?.name || '';

      let refunded = 0, vendorReversed = 0, generalReversed = 0;
      for (const txDoc of txSnap.docs) {
        const tx = txDoc.data();
        const amt = parseFloat(tx.amount) || 0;
        const wid = tx.walletId || '';
        if (amt > 0 && wid) {
          if (tx.type === 'in') {
            // دفعة عميل → استرداد للمحفظة الأصلية
            batch.update(doc(db, 'wallets', wid), { balance: increment(-amt) });
            addLedgerToBatch(batch, db, FE.CUSTOMER_REFUND, {
              ...ledgerBase,
              amount: amt, walletId: wid,
              walletName: walletNameOf(wid) || tx.walletName || '',
            });
            refunded++;
          } else if (tx.type === 'out') {
            batch.update(doc(db, 'wallets', wid), { balance: increment(amt) });
            if (tx.spId) {
              // دفعة مورد → احذف payment record + ledger reversal
              batch.delete(doc(db, 'supplier_payments', tx.spId));
              addLedgerToBatch(batch, db, FE.VENDOR_PAYMENT_REVERSAL, {
                ...ledgerBase,
                amount: amt, walletId: wid,
                walletName: walletNameOf(wid) || tx.walletName || '',
                vendorId:   tx.supplierId   || '',
                vendorName: tx.supplierName || '',
              });
              vendorReversed++;
            } else {
              // مصروف عام بدون مورد
              addLedgerToBatch(batch, db, FE.GENERAL_EXPENSE_REVERSAL, {
                ...ledgerBase,
                amount: amt, walletId: wid,
                walletName: walletNameOf(wid) || tx.walletName || '',
              });
              generalReversed++;
            }
          }
        }
        batch.delete(txDoc.ref);
      }

      // 2) حذف الأوردر
      batch.delete(doc(db, 'orders', orderId));
      await batch.commit();

      return {
        ok: true, errors: [], warnings: [],
        orderId, refunded, vendorReversed, generalReversed,
      };
    });
  },

  /**
   * Admin-only: **تصفير نهائي** للأوردر — حذف كل أثره من السجلات.
   *
   * بخلاف adminDeleteOrder (الذي يترك قيود عكس reversal في financial_ledger
   * كأثر تدقيقي)، هذه العملية تمحو الأوردر **بالكامل**: المستند + معاملاته +
   * قيوده في الـ ledger + تذاكر مرتجعاته + أوامر مورديه — مع عكس أرصدة المحافظ
   * فقط (wallets = مصدر الحقيقة، RULE 1) كي تبقى الأرصدة صحيحة "وكأن الأوردر
   * لم يوجد". تُكتب فقط سطر مساءلة واحد في audit_logs (مَن/متى — ليس بيانات
   * الأوردر) لأن عملية حذف لا رجعة فيها يجب أن تُسجَّل (H3).
   *
   * Flow (atomic writeBatch + idempotency):
   *   0. block إذا وُجدت shipping_settlements (قد تشمل أوردرات أخرى — أَلغِها أولاً)
   *   1. اعكس رصيد المحفظة لكل معاملة (in → نقص، out → زيادة) واحذف المعاملة
   *      + احذف supplier_payment المرتبط (tx.spId)
   *   2. احذف كل financial_ledger للأوردر (orderId == — لا يلمس قيود orderIds[]
   *      المشتركة مع أوردرات أخرى)
   *   3. احذف returns_tickets (orderId ==) و supplier_orders (من costItems)
   *   4. احذف الأوردر — ثم سطر audit_logs (best-effort بعد الـ commit)
   *
   * @param {Object} args
   * @param {Object} [args.db=defaultDb]
   * @param {string} args.orderId
   * @param {string} args.reason            — سبب التصفير (مطلوب)
   * @param {string} [args.note]
   * @param {string} args.role
   * @param {string} args.userId
   * @param {string} [args.userName]
   * @returns {{ok, errors, warnings, orderId, walletsReversed, txDeleted,
   *            ledgerDeleted, returnsDeleted, supplierOrdersDeleted,
   *            operationId, idempotent}}
   */
  async purgeOrder({
    db = defaultDb,
    orderId, reason, note = '',
    role = '', userId, userName = '',
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    if (!userId)  return { ok: false, errors: ['⚠️ userId مطلوب'],  warnings: [] };
    if (!reason)  return { ok: false, errors: ['⚠️ اختر سبب التصفير أولاً'], warnings: [] };

    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    return withIdempotency(db, {
      actionType: 'purge_order',
      entityId: orderId,
      actorId: userId,
      payload: { orderId, reason },
    }, async () => {
      // 0) shipping_settlements guard (RULE 4 — قد تشمل أوردرات أخرى)
      const stSnap = await getDocs(query(
        collection(db, 'shipping_settlements'),
        where('orderId', '==', orderId)
      ));
      if (!stSnap.empty) {
        return {
          ok: false,
          errors: ['الأوردر مرتبط بتسوية شحن — أَلغِ التسوية أولاً من صفحة حسابات الشحن'],
          warnings: [], orderId,
        };
      }

      // اجمع كل المستندات المرتبطة (قبل بناء الـ batch لفحص الحجم)
      const [txSnap, ledgerSnap, returnsSnap] = await Promise.all([
        getDocs(query(collection(db, 'transactions_v2'), where('orderId', '==', orderId), limit(500))),
        getDocs(query(collection(db, 'financial_ledger'), where('orderId', '==', orderId), limit(500))),
        getDocs(query(collection(db, 'returns_tickets'), where('orderId', '==', orderId), limit(100))),
      ]);
      const supplierOrderIds = [...new Set(
        (order.costItems || []).map(ci => ci?.supplierOrderId).filter(Boolean)
      )];

      // حارس حجم الدفعة (Firestore batch limit = 500). تقدير متحفّظ.
      const estOps =
        txSnap.size * 3 + ledgerSnap.size + returnsSnap.size +
        supplierOrderIds.length + 1;
      if (estOps > 450) {
        return {
          ok: false,
          errors: [`الأوردر مرتبط ببيانات كثيرة (${estOps} عملية) تتجاوز حد الدفعة — استخدم سكربت سيرفر-سايد للتصفير`],
          warnings: [], orderId,
        };
      }

      const batch = writeBatch(db);
      let walletsReversed = 0;

      // 1) معاملات: عكس رصيد المحفظة + حذف tx + حذف supplier_payment المرتبط
      for (const txDoc of txSnap.docs) {
        const tx = txDoc.data();
        const amt = parseFloat(tx.amount) || 0;
        const wid = tx.walletId || '';
        if (amt > 0 && wid) {
          // in (دفعة عميل) → اخصم من المحفظة ؛ out (مصروف) → أعِد للمحفظة
          const delta = tx.type === 'in' ? -amt : amt;
          batch.update(doc(db, 'wallets', wid), { balance: increment(delta) });
          walletsReversed++;
        }
        if (tx.spId) batch.delete(doc(db, 'supplier_payments', tx.spId));
        batch.delete(txDoc.ref);
      }

      // 2) قيود الـ ledger الخاصة بالأوردر فقط
      for (const lDoc of ledgerSnap.docs) batch.delete(lDoc.ref);

      // 3) تذاكر المرتجعات + أوامر الموردين
      for (const rDoc of returnsSnap.docs) batch.delete(rDoc.ref);
      for (const soId of supplierOrderIds) batch.delete(doc(db, 'supplier_orders', soId));

      // 4) الأوردر نفسه
      batch.delete(doc(db, 'orders', orderId));
      await batch.commit();

      persistAuditLog({
        db, action: 'order.purge',
        details: {
          orderId,
          clientName: order.clientName || '',
          reason, note,
          walletsReversed,
          txDeleted: txSnap.size,
          ledgerDeleted: ledgerSnap.size,
          returnsDeleted: returnsSnap.size,
          supplierOrdersDeleted: supplierOrderIds.length,
        },
        userId, userName: userName || '',
        userRole: role || '',
        source: 'orderActions.purgeOrder',
      });

      return {
        ok: true, errors: [], warnings: [],
        orderId,
        walletsReversed,
        txDeleted: txSnap.size,
        ledgerDeleted: ledgerSnap.size,
        returnsDeleted: returnsSnap.size,
        supplierOrdersDeleted: supplierOrderIds.length,
      };
    });
  },

  async recordCostItem({
    db, orderId, prodIdx,
    payload,
    role, userId, userName,
    wallets = [],
    isEdit = false, editIdx = -1,
    allowedTypes = [],
    masterCats = [],
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const v = validateCostItem({ order, payload, role, wallets, isEdit, allowedTypes, masterCats });
    if (!v.ok) return { ...v, orderId };

    // Reference price lookup (non-blocking — enriches warnings only)
    let refPrice = 0;
    if (!isEdit) {
      try {
        const { getReferencePrice } = await import('./core/cost-library-actions.js');
        const ref = await getReferencePrice({ db, type: payload.type, supplierId: payload.supplierId || '', productName: (order.products || [])[prodIdx >= 0 ? prodIdx : 0]?.name || '' });
        refPrice = ref.price || 0;
      } catch (_) { /* non-blocking */ }
      if (refPrice > 0) {
        const rv = validateCostItem({ order, payload, role, wallets, isEdit, allowedTypes, refPrice });
        if (rv.warnings.length) v.warnings.push(...rv.warnings);
      }
    }

    const {
      type: rawType, total: rawTotal,
      supplierId = '', supplierName: rawSupplierName = '',
      note = '', walletId = '',
      paperMeta = {},
      itemQty: rawQty, unitPrice: rawUnitPrice, unit: rawUnit = '',
    } = payload;
    const type = normalizeCostType(rawType) || rawType;
    const total = parseFloat(rawTotal) || 0;
    const itemQty   = parseFloat(rawQty) || 0;
    const unitPrice = parseFloat(rawUnitPrice) || 0;
    const unit      = (rawUnit || '').trim();

    // resolve fresh supplier name (non-blocking fallback to payload name)
    let supplierName = rawSupplierName;
    if (supplierId) {
      try {
        const { resolveSupplierName } = await import('./core/supplier-resolve.js');
        supplierName = await resolveSupplierName(db, supplierId, rawSupplierName);
      } catch (_) { /* keep rawSupplierName */ }
    }

    const _doRecord = async () => {
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

    // ── resolve stable productId alongside legacy prodIdx ──
    const _prod = prodIdx >= 0 ? (order.products || [])[prodIdx] : null;
    const _productId = _prod?.productId || existingItem?.productId || null;

    // ── T4: auto-derive printType from product ──
    const _printType = _prod?.printType || '';

    // ── T3+T5: resolve category/subcategory/defaultUnit from master categories ──
    const _resolved = masterCats.length ? resolveCostItemCategory(type, masterCats) : null;
    const _category = _resolved?.category || '';
    const _subcategory = _resolved?.subcategory || '';

    // ── build new item ────────────────────────────────────
    const newItem = {
      costItemId,
      orderId,
      status: isEdit ? (existingItem?.status || COST_ITEM_STATUSES.ACTIVE) : COST_ITEM_STATUSES.ACTIVE,
      ...(supplierOrderId ? { supplierOrderId } : {}),
      type,
      supplierId,
      supplierName,
      prodIdx: prodIdx >= 0 ? prodIdx : null,
      ...(_productId ? { productId: _productId } : {}),
      total,
      ...(itemQty > 0 ? { itemQty } : {}),
      ...(unitPrice > 0 ? { unitPrice } : {}),
      ...(unit ? { unit } : ((_resolved?.defaultUnit && !isEdit) ? { unit: _resolved.defaultUnit } : {})),
      ...(_category ? { category: _category } : {}),
      ...(_subcategory ? { subcategory: _subcategory } : {}),
      ...(_printType ? { printType: _printType } : {}),
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
      timeline: [
        ...(order.timeline || []),
        auditEntry({
          action,
          userId, userName,
          kind: isEdit ? 'edit' : 'op',
          meta: { costItemId, type, total, supplierId: supplierId || '', supplierOrderId: supplierOrderId || '' },
        }),
      ],
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
          ...(supplierOrderId ? { supplierOrderId } : {}),
          costItemId,
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
      const paidInSameBatch = !!spRef;
      batch.set(soRef, {
        costItemId,
        orderId, orderRef: order.orderId || orderId.slice(-6),
        clientName: order.clientName || '',
        supplierId, supplierName,
        type, total,
        note: note || '',
        status: 'pending',
        deliveryStatus: 'awaiting',
        paidAmount: paidInSameBatch ? total : 0,
        ...(paidInSameBatch ? { lastPaymentId: spRef.id, lastPaymentAt: serverTimestamp() } : {}),
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

      // Fire-and-forget: auto-index in cost_item_library (non-blocking)
      if (!isEdit && type) {
        const _libProd = prodIdx >= 0 ? (order.products || [])[prodIdx] : (order.products || [])[0];
        const _libQty = itemQty > 0 ? itemQty : (parseFloat(_libProd?.qty || 0) || 0);
        import('./core/cost-library-actions.js')
          .then(({ upsertCostLibraryItem }) => upsertCostLibraryItem({
            db, type,
            productName: _libProd?.name || '',
            supplierId: supplierId || '',
            supplierName: supplierName || '',
            qty: _libQty,
            total, orderId,
            userId: userId || '',
          }).catch(() => {}))
          .catch(() => {});

        // T7: fire-and-forget — update usageCount + lastUsedAt on master category
        if (_resolved?.subcategory) {
          import('./master-lists-actions.js')
            .then(({ updateCategoryUsage }) => updateCategoryUsage({
              db, categoryLabel: _resolved.subcategory,
            }).catch(() => {}))
            .catch(() => {});
        }
      }

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
    }; // end _doRecord

    if (isEdit) return _doRecord();

    return withIdempotency(db, {
      actionType: 'record_cost_item',
      entityId: `${orderId}|${type}|${supplierId}`,
      actorId: userId,
      actorName: userName,
      payload: { total, type, supplierId, walletId },
    }, _doRecord);
  },

  /**
   * removeCostItem — حذف بند تكلفة غير مدفوع
   *
   * للبنود المدفوعة: استخدم adminDeletePaidCostItem من production-actions.js
   * (يعمل wallet reversal + ledger + supplier cascade).
   *
   * هذا الـ action للبنود غير المدفوعة فقط:
   *   - يحذف من order.costItems
   *   - يحذف supplier_orders المرتبط (لو وُجد)
   *   - audit trail
   */
  async removeCostItem({
    db = defaultDb, orderId, costItemIdx,
    role, userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    if (!['admin', 'operation_manager', 'production_agent'].includes(role)) {
      return { ok: false, errors: ['⛔ ليس لديك صلاحية حذف بنود التكلفة'], warnings: [] };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [] };
    const items = [...(order.costItems || [])];
    if (costItemIdx < 0 || costItemIdx >= items.length) {
      return { ok: false, errors: ['البند غير موجود'], warnings: [] };
    }
    const item = items[costItemIdx];
    if (item.status === COST_ITEM_STATUSES.VOIDED) {
      return { ok: false, errors: ['⚠️ البند محذوف بالفعل'], warnings: [] };
    }
    if (item.paid || item.walletId || item.txId || item.spId) {
      return { ok: false, errors: ['⛔ هذا البند مرتبط بدفعة — استخدم حذف البند المدفوع من الحسابات'], warnings: [] };
    }
    // T8: soft-delete — mark as voided instead of removing from array
    items[costItemIdx] = {
      ...item,
      status: COST_ITEM_STATUSES.VOIDED,
      voidedAt: new Date().toISOString(),
      voidedBy: userId,
      voidedByName: userName,
    };
    try {
      const batch = writeBatch(db);
      batch.update(order._ref, {
        costItems: items,
        timeline: [...(order.timeline || []), auditEntry({
          action: `🗑️ إلغاء بند تكلفة: ${item.type || ''} — ${parseFloat(item.total) || 0} ج${item.supplierName ? ' — ' + item.supplierName : ''}`,
          userId, userName, kind: 'edit',
          meta: { costItemIndex: costItemIdx, type: item.type, total: item.total, supplierId: item.supplierId, status: 'voided' },
        })],
        updatedAt: serverTimestamp(),
      });
      if (item.supplierOrderId) {
        batch.update(doc(db, 'supplier_orders', item.supplierOrderId), {
          isDeleted: true, voidedAt: serverTimestamp(), voidedBy: userId,
          voidReason: 'حذف بند التكلفة',
        });
      }
      if (item.pendingPaymentRequestId) {
        batch.update(doc(db, 'payment_requests', item.pendingPaymentRequestId), {
          status: 'cancelled', cancelledBy: userId, cancelledByName: userName || '',
          cancelledAt: serverTimestamp(), cancelReason: 'حذف البند',
        });
      }
      await batch.commit();
      return { ok: true, errors: [], warnings: [], orderId, action: 'remove_cost_item' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [] };
    }
  },

  async toggleProductCostComplete({
    db = defaultDb, orderId, prodIdx,
    role, userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['userId مطلوب'], warnings: [] };
    if (!orderId) return { ok: false, errors: ['orderId مطلوب'], warnings: [] };
    if (prodIdx == null || prodIdx < 0) return { ok: false, errors: ['prodIdx مطلوب'], warnings: [] };
    if (!['admin', 'operation_manager', 'production_agent'].includes(role)) {
      return { ok: false, errors: ['ليس لديك صلاحية إغلاق/فتح تسجيل بنود التكلفة'], warnings: [] };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [] };
    const prods = order.products || [];
    if (prodIdx >= prods.length) return { ok: false, errors: ['المنتج غير موجود'], warnings: [] };

    const map = { ...(order.costCompletedProds || {}) };
    const key = String(prodIdx);
    const wasComplete = !!map[key];

    if (wasComplete) {
      delete map[key];
    } else {
      map[key] = { at: new Date().toISOString(), by: userId, byName: userName || '' };
    }

    const prodName = prods[prodIdx].name || `منتج ${prodIdx + 1}`;
    const action = wasComplete
      ? `🔓 إعادة فتح تسجيل بنود: ${prodName}`
      : `✅ إنهاء تسجيل بنود: ${prodName}`;

    try {
      await updateDoc(order._ref, {
        costCompletedProds: map,
        timeline: [...(order.timeline || []), auditEntry({
          action, userId, userName, kind: 'edit',
          meta: { prodIdx, prodName, completed: !wasComplete },
        })],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], completed: !wasComplete, prodIdx };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [] };
    }
  },

  // ─── Production Actions (P2.1) ────────────
  //
  // Order-level operations triggered from production.html. All follow the
  // same shape as the other actions: load → optional validate → atomic
  // batch → return uniform result. Timeline entries use auditEntry().

  /**
   * نقل قسري بين المراحل — أدمن only (override المسار العادي).
   * يخالف buildStageAdvance قواعد التحقق فبيُستخدم بحذر.
   */
  async moveStage({
    db = defaultDb, orderId, targetStage,
    role, userId, userName,
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    if (!['admin', 'operation_manager'].includes(role)) {
      return { ok: false, errors: ['⛔ القفز بين المراحل متاح للأدمن فقط'], warnings: [], orderId };
    }
    if (!targetStage) return { ok: false, errors: ['⚠️ targetStage مطلوب'], warnings: [], orderId };
    if (targetStage === order.stage) return { ok: false, errors: ['⚠️ نفس المرحلة الحالية'], warnings: [], orderId };
    if (targetStage === 'archived' && !(order.costItems || []).filter(isActiveCostItem).length) {
      return { ok: false, errors: ['⚠️ لا يمكن الأرشفة — سجّل تكلفة الأوردر أولاً'], warnings: [], orderId };
    }
    const labels = { design: 'تصميم', printing: 'طباعة', production: 'تنفيذ', shipping: 'شحن', archived: 'أرشيف' };
    try {
      const fromStage = order.stage;
      const entry = auditEntry({
        action: `🔄 [أدمن] نُقل ${labels[fromStage] || fromStage} → ${labels[targetStage] || targetStage}`,
        userId, userName, kind: 'op',
        meta: { fromStage, toStage: targetStage },
      });
      entry.stage = targetStage;
      await updateDoc(order._ref, {
        stage: targetStage,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      persistAuditLog({
        db,
        action: fromStage === 'archived' ? 'order.restore_from_archive' : 'order.admin_stage_override',
        details: {
          orderId,
          clientName: order.clientName || '',
          fromStage: fromStage || '',
          toStage: targetStage,
        },
        userId, userName: userName || '',
        userRole: role || '',
        source: 'orderActions.moveStage',
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'move_stage', from: fromStage, to: targetStage };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل النقل'], warnings: [], orderId };
    }
  },

  /**
   * حذف entry من timeline الأوردر بفهرس.
   */
  async removeTimelineEntry({
    db = defaultDb, orderId, entryIndex,
    userId,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const tl = [...(order.timeline || [])];
    if (entryIndex < 0 || entryIndex >= tl.length) {
      return { ok: false, errors: ['⚠️ فهرس غير صالح'], warnings: [], orderId };
    }
    tl.splice(entryIndex, 1);
    try {
      await updateDoc(order._ref, { timeline: tl, updatedAt: serverTimestamp() });
      return { ok: true, errors: [], warnings: [], orderId, action: 'remove_timeline_entry' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [], orderId };
    }
  },

  /**
   * إضافة مصروف مندوب (agent expense) إلى الأوردر — للنقل/الطعام/إلخ.
   */
  async addAgentExpense({
    db = defaultDb, orderId,
    type, amount, note = '',
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return { ok: false, errors: ['⚠️ أدخل مبلغ صحيح'], warnings: [], orderId };
    const newExp = { type, amount: amt, note, addedAt: nowStr(), addedBy: userId, addedByName: userName };
    const exps = [...(order.agentExpenses || []), newExp];
    try {
      await updateDoc(order._ref, { agentExpenses: exps, updatedAt: serverTimestamp() });
      return { ok: true, errors: [], warnings: [], orderId, action: 'add_agent_expense' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [], orderId };
    }
  },

  /**
   * تعيين مندوب التنفيذ — يستخدم لـ doAssignAgent + pickupOrder.
   * @param {boolean} [pickup=false] — true لو من pickupOrder
   */
  async assignProductionAgent({
    db = defaultDb, orderId,
    agentId, agentName,
    userId, userName,
    pickup = false,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!agentId) return { ok: false, errors: ['⚠️ agentId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    if (pickup && order.productionAgent) {
      return { ok: false, errors: ['⚠️ هذا الأوردر له مالك بالفعل'], warnings: [], orderId };
    }
    try {
      const entry = auditEntry({
        action: pickup ? `📥 ${agentName} التقط الأوردر` : `👷 تعيين مندوب التنفيذ: ${agentName}`,
        userId, userName, kind: 'op',
        meta: { agentId, pickup },
      });
      if (pickup) {
        entry.stage = order.stage;
        entry.assigneeId = agentId;
        entry.assigneeName = agentName;
      }
      await updateDoc(order._ref, {
        productionAgent: agentId,
        productionAgentName: agentName,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: pickup ? 'pickup' : 'assign_agent' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التعيين'], warnings: [], orderId };
    }
  },

  /**
   * تحديث `prodStatus` المستقل للأوردر (المُجمَّع) + يلتقطه كمندوب لو غير محدد.
   */
  async setProductionStatus({
    db = defaultDb, orderId, status,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const labels = { received: '📥 استلمت', wip: '🔄 جاري', done: '✅ خلصت', problem: '⚠️ مشكلة' };
    if (!labels[status]) return { ok: false, errors: ['⚠️ status غير صالح'], warnings: [], orderId };
    try {
      const entry = auditEntry({ action: labels[status], userId, userName, kind: 'op' });
      const upd = {
        prodStatus: status,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      };
      if (!order.productionAgent && userId) {
        upd.productionAgent = userId;
        upd.productionAgentName = userName;
      }
      await updateDoc(order._ref, upd);
      return { ok: true, errors: [], warnings: [], orderId, action: 'set_production_status', status };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [], orderId };
    }
  },

  /**
   * تحديث execStatus لمنتج بعينه داخل الأوردر (toggle).
   * يُمرَّر `derivedProdStatus` من الـ caller (الـ derive يحتاج EXEC_STATUS labels من الصفحة).
   *
   * 🔄 productStatus / execStatus sync (post-PR fix-exec-product-status-sync):
   *   - execStatus = 'done'  → productStatus = 'done' (مكتمل تماماً)
   *   - execStatus يعود من 'done' → productStatus = 'printed' (لازالت تستطيع
   *     الانتقال للشحن لكن مش "مكتملة")
   *   - execStatus = 'wip'/'pending'/'problem' (من غير 'done') → productStatus
   *     يفضّل كما هو (الـ catalog status لا يتأثر بالـ exec details)
   */
  async setProductExecStatus({
    db = defaultDb, orderId, prodIdx, execStatus,
    derivedProdStatus, statusLabel,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const prods = [...(order.products || [])];
    if (prodIdx < 0 || prodIdx >= prods.length) {
      return { ok: false, errors: ['⚠️ فهرس المنتج غير صالح'], warnings: [], orderId };
    }
    const prevProduct = prods[prodIdx] || {};
    const prevExec = prevProduct.execStatus || 'pending';
    const prevProdStatus = prevProduct.productStatus || '';
    // Sync productStatus بحسب الانتقال:
    let productStatusUpdate = {};
    if (execStatus === 'done') {
      productStatusUpdate = { productStatus: 'done' };
    } else if (prevExec === 'done' && prevProdStatus === 'done') {
      // الـ user revertedh من done → نرجّع productStatus لـ printed
      // (مفترض إنه طُبع قبل ما يدخل التنفيذ — صالح للـ stage transition)
      productStatusUpdate = { productStatus: 'printed' };
    }
    prods[prodIdx] = {
      ...prevProduct,
      execStatus,
      ...(execStatus === 'done' ? { execDoneAt: nowStr(), execDoneBy: userName } : {}),
      ...(execStatus === 'cancelled' ? { cancelledAt: nowStr(), cancelledBy: userId, cancelledByName: userName } : {}),
      ...productStatusUpdate,
    };
    try {
      const entry = auditEntry({
        action: `${statusLabel || execStatus} — ${prods[prodIdx].name || 'منتج'}`,
        userId, userName, kind: 'op',
        meta: { prodIdx, execStatus, prevExec, productStatusChange: productStatusUpdate.productStatus || '' },
      });
      const upd = {
        products: prods,
        prodStatus: derivedProdStatus,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      };
      if (!order.productionAgent && userId) {
        upd.productionAgent = userId;
        upd.productionAgentName = userName;
      }
      await updateDoc(order._ref, upd);
      return { ok: true, errors: [], warnings: [], orderId, action: 'set_product_exec_status', prodIdx, execStatus };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [], orderId };
    }
  },

  /**
   * تحديد المورد لمنتج بعينه داخل الأوردر.
   */
  async setProductSupplier({
    db = defaultDb, orderId, prodIdx,
    supplierId, supplierName, supplierPhone = '',
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const prods = [...(order.products || [])];
    if (prodIdx < 0 || prodIdx >= prods.length) {
      return { ok: false, errors: ['⚠️ فهرس المنتج غير صالح'], warnings: [], orderId };
    }
    const before = prods[prodIdx].supplierName || '—';
    prods[prodIdx] = { ...prods[prodIdx], supplierId, supplierName, supplierPhone };
    try {
      const entry = auditEntry({
        action: `🏭 مورد ${prods[prodIdx].name || 'منتج'}: ${before} → ${supplierName || 'بدون'}`,
        userId, userName, kind: 'op',
        meta: { prodIdx, supplierId },
      });
      await updateDoc(order._ref, {
        products: prods,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'set_product_supplier' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [], orderId };
    }
  },

  /**
   * حذف منتج من الأوردر — يحذف بنود تكلفته ويعيد ترقيم البنود الباقية،
   * ويعيد حساب الـ salePrice + remaining.
   */
  async removeProductFromOrder({
    db = defaultDb, orderId, prodIdx,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const prods = [...(order.products || [])];
    if (prodIdx < 0 || prodIdx >= prods.length) {
      return { ok: false, errors: ['⚠️ فهرس المنتج غير صالح'], warnings: [], orderId };
    }
    const removedProd = prods[prodIdx];
    prods.splice(prodIdx, 1);
    const ci = [...(order.costItems || [])];
    const removedProductId = removedProd?.productId || null;
    const newCi = ci
      .filter(c => {
        if (removedProductId && c.productId === removedProductId) return false;
        return c.prodIdx !== prodIdx;
      })
      .map(c => ({ ...c, prodIdx: c.prodIdx > prodIdx ? c.prodIdx - 1 : c.prodIdx }));
    const removedPrice = parseFloat(removedProd?.salePrice || removedProd?.price || 0);
    const newSalePrice = Math.max(0, (parseFloat(order.salePrice) || 0) - removedPrice);
    const paidOrDep = parseFloat(order.totalPaid) || parseFloat(order.deposit) || 0;
    const newRemaining = Math.max(0, newSalePrice - (parseFloat(order.discount) || 0) - paidOrDep);
    try {
      const entry = auditEntry({
        action: `🗑 حُذف منتج: ${removedProd?.name || '—'} × ${removedProd?.qty || 0}`,
        userId, userName, kind: 'op',
        meta: { prodIdx, removedPrice },
      });
      const upd = {
        products: prods,
        costItems: newCi,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      };
      if (removedPrice > 0) {
        upd.salePrice = newSalePrice;
        upd.remaining = newRemaining;
      }
      await updateDoc(order._ref, upd);
      return { ok: true, errors: [], warnings: [], orderId, action: 'remove_product', productName: removedProd?.name || '' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [], orderId };
    }
  },

  /**
   * تحديث ملاحظة الإنتاج (prodNote) — حقل واحد بدون timeline.
   */
  async updateProductionNote({
    db = defaultDb, orderId, note,
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        prodNote: note || '',
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'update_production_note' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [], orderId };
    }
  },

  /**
   * تعيين رابط الصورة النهائية للمنتج (بعد رفعها إلى Storage).
   */
  async setFinalProductImage({
    db = defaultDb, orderId, imageUrl,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    try {
      const entry = auditEntry({ action: '📸 صورة المنتج النهائي', userId, userName, kind: 'op' });
      await updateDoc(order._ref, {
        finalImageUrl: imageUrl,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'set_final_image' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [], orderId };
    }
  },

  /**
   * حذف بند تكلفة غير مدفوع — يعكس tx + supplier_payments + supplier_orders.
   * الـ caller يحقق إن البند `!item.paid` قبل النداء.
   * (المسار المدفوع admin destructive ولسه فيه inline — pending separate PR).
   */
  async removeUnpaidCostItem({
    db = defaultDb, orderId, itemIndex,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const ci = [...(order.costItems || [])];
    const item = ci[itemIndex];
    if (!item) return { ok: false, errors: ['⚠️ البند غير موجود'], warnings: [], orderId };
    if (item.paid) {
      return { ok: false, errors: ['⛔ هذا البند مدفوع — استخدم مسار الأدمن'], warnings: [], orderId };
    }
    ci.splice(itemIndex, 1);
    try {
      const batch = writeBatch(db);
      batch.update(order._ref, { costItems: ci, updatedAt: serverTimestamp() });
      const total = parseFloat(item.total) || 0;
      if (item?.txId && item?.walletId) {
        batch.update(doc(db, 'wallets', item.walletId), { balance: increment(total) });
        batch.delete(doc(db, 'transactions_v2', item.txId));
        addLedgerToBatch(batch, db, FE.GENERAL_EXPENSE_REVERSAL, {
          amount: total,
          walletId: item.walletId, walletName: item.walletName || '',
          orderId,
          notes: `إلغاء تكلفة إنتاج — ${item.type || ''} ${item.supplierName ? '· ' + item.supplierName : ''}`,
          userId, userName,
        });
      }
      if (item?.spId) batch.delete(doc(db, 'supplier_payments', item.spId));
      if (item?.supplierOrderId) batch.delete(doc(db, 'supplier_orders', item.supplierOrderId));
      await batch.commit();
      return {
        ok: true, errors: [], warnings: [],
        orderId, action: 'remove_unpaid_cost_item',
        refundedToWallet: !!(item?.txId && item?.walletId),
        amount: total,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [], orderId };
    }
  },

  /**
   * إغلاق بنود تكلفة منتج وحفظها في سجل products_v2.costHistory.
   * Atomic: يحدّث الكتالوج + الأوردر معاً.
   *
   * @param {string} productId        — productId من الكتالوج
   * @param {number} prodIdx          — index في order.products (أو -1 = عام)
   */
  async finalizeProductCosts({
    db = defaultDb, orderId, productId, prodIdx = -1,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!productId) return { ok: false, errors: ['⚠️ المنتج غير مرتبط بالكتالوج'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const prods = order.products || [];
    const prod = prodIdx >= 0 ? prods[prodIdx] : prods[0];
    if (!prod) return { ok: false, errors: ['⚠️ المنتج غير موجود'], warnings: [], orderId };
    const ci = (order.costItems || []).filter(isActiveCostItem);
    const prodCi = prodIdx >= 0
      ? ci.filter(c => {
          const m = matchCostItemProduct(c, prods);
          return m.index === prodIdx || m.index < 0;
        })
      : ci;
    if (!prodCi.length) return { ok: false, errors: ['⚠️ لا توجد بنود للحفظ'], warnings: [], orderId };
    const total = prodCi.reduce((s, c) => s + (parseFloat(c.total) || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const entry = {
      date: today,
      qty: parseFloat(prod.qty) || 0,
      paper: [prod.paper, prod.weight ? prod.weight + 'جم' : ''].filter(Boolean).join(' '),
      notes: `أوردر ${order.orderId || orderId.slice(-6)} · ${order.clientName || ''}`,
      items: prodCi.map(c => ({
        type: c.type || '—',
        supplierId: c.supplierId || '', supplierName: c.supplierName || '',
        total: parseFloat(c.total) || 0,
      })),
      total,
      orderId,
      clientName: order.clientName || '',
      source: 'production',
    };
    try {
      const prodDocRef = doc(db, 'products_v2', productId);
      const prodSnap = await getDoc(prodDocRef);
      if (!prodSnap.exists()) return { ok: false, errors: ['⚠️ المنتج غير موجود في الكتالوج'], warnings: [], orderId };
      const history = [...(prodSnap.data()?.costHistory || [])].filter(h => h.orderId !== orderId);
      history.push(entry);
      const tlEntry = auditEntry({
        action: `✅ تم إغلاق تكاليف "${prod.name || 'المنتج'}": ${total.toLocaleString('ar-EG')} ج → حُفظ في الكتالوج`,
        userId, userName, kind: 'op',
        meta: { productId, total, itemCount: prodCi.length },
      });
      const batch = writeBatch(db);
      batch.update(prodDocRef, { costHistory: history, lastCostTotal: total, updatedAt: serverTimestamp() });
      batch.update(order._ref, {
        costFinalized: true,
        costFinalizedAt: serverTimestamp(),
        costFinalizedBy: userId,
        costFinalizedByName: userName,
        timeline: [...(order.timeline || []), tlEntry],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { ok: true, errors: [], warnings: [], orderId, action: 'finalize_product_costs', total, itemCount: prodCi.length };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [], orderId };
    }
  },

  /**
   * استيراد بنود تكلفة من products_v2.costHistory إلى الأوردر الحالي.
   * Atomic: order.costItems + ledger entries لكل بند جديد.
   *
   * @param {Array} items  — بنود مُحضَّرة من الـ caller (بعد deduplication)
   * @param {string} catalogProductName  — اسم المنتج في الكتالوج (للتي timeline)
   * @param {number} prodIdx
   */
  async importCostsFromCatalog({
    db = defaultDb, orderId, items, catalogProductName = '', prodIdx = -1,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!Array.isArray(items) || !items.length) {
      return { ok: false, errors: ['⚠️ لا توجد بنود للاستيراد'], warnings: [], orderId };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const total = items.reduce((s, it) => s + (parseFloat(it.total) || 0), 0);
    try {
      const tlEntry = auditEntry({
        action: `🤖 استيراد ${items.length} بند من كتالوج "${catalogProductName}" · ${total.toLocaleString('ar-EG')} ج`,
        userId, userName, kind: 'op',
        meta: { count: items.length, total, prodIdx },
      });
      const batch = writeBatch(db);
      const updatedCi = [...(order.costItems || []), ...items];
      const upd = {
        costItems: updatedCi,
        timeline: [...(order.timeline || []), tlEntry],
        updatedAt: serverTimestamp(),
      };
      if (!order.productionAgent && userId) {
        upd.productionAgent = userId;
        upd.productionAgentName = userName;
      }
      batch.update(order._ref, upd);
      for (const item of items) {
        const ev = item.supplierId ? FE.VENDOR_PAYMENT : FE.GENERAL_EXPENSE;
        addLedgerToBatch(batch, db, ev, {
          amount: parseFloat(item.total) || 0,
          orderId,
          clientName: order.clientName || '',
          vendorId: item.supplierId,
          vendorName: item.supplierName,
          notes: `تكلفة مستوردة من الكتالوج — ${item.type} · ${order.clientName || ''}`,
          userId, userName,
        });
      }
      await batch.commit();
      return { ok: true, errors: [], warnings: [], orderId, action: 'import_costs_from_catalog', count: items.length, total };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الاستيراد'], warnings: [], orderId };
    }
  },

  /**
   * نقل أوردر التنفيذ بالكامل إلى الشحن.
   *
   * يحفظ تكلفة كل منتج في الكتالوج (داخل نفس الـ batch) + يستدعي
   * buildStageAdvance للتحويل الفعلي.
   *
   * @param {Array} catalogUpdates  — caller-prepared updates: [{productId, history, lastCostTotal}]
   * @param {string} shipId
   * @param {string} shipName
   * @param {boolean} bypassWarnings
   */
  async submitProductionToShipping({
    db = defaultDb, orderId,
    shipId = '', shipName = '',
    catalogUpdates = [],
    role, userId, userName,
    bypassWarnings = false,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const adv = buildStageAdvance({
      order, role, userId, userName,
      nextAssigneeId: shipId, nextAssigneeName: shipName,
      bypassWarnings,
      extraFields: {
        prodStatus: 'done',
        prodDoneAt: nowStr(),
        productionAgent: userId || order.productionAgent || '',
        productionAgentName: userName,
      },
    });
    if (!adv.ok) {
      return {
        ok: false, errors: adv.errors || [], warnings: adv.warnings || [],
        needsConfirmation: adv.needsConfirmation || false,
        orderId,
      };
    }
    try {
      const batch = writeBatch(db);
      for (const cu of catalogUpdates) {
        batch.update(doc(db, 'products_v2', cu.productId), {
          costHistory: cu.history,
          lastCostTotal: cu.lastCostTotal,
          lastCostDate: cu.lastCostDate || nowStr(),
        });
      }
      batch.update(order._ref, {
        ...adv.fields,
        timeline: [...(order.timeline || []), adv.timelineEntry],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return {
        ok: true, errors: [], warnings: adv.warnings || [],
        orderId, action: 'submit_production_to_shipping',
        newStage: 'shipping',
        catalogUpdatesCount: catalogUpdates.length,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل النقل'], warnings: [], orderId };
    }
  },

  /**
   * شحن جزئي — إنشاء أوردر فرعي يحوي المنتجات المنفّذة + تحديث الأصلي.
   * Atomic. يستخدم buildOrderSplit للتحقق + بناء الفرعي.
   *
   * @param {number[]} doneIdx — indices للمنتجات الـ done في الأوردر الأصلي
   * @param {string} shipId
   * @param {string} shipName
   */
  async splitOrderForShipping({
    db = defaultDb, orderId, doneIdx = [],
    shipId = '', shipName = '',
    role, userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!Array.isArray(doneIdx) || !doneIdx.length) {
      return { ok: false, errors: ['⚠️ لا يوجد منتج منفّذ للشحن'], warnings: [], orderId };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const split = buildOrderSplit({
      order, productIndices: doneIdx, role, userId, userName, targetStage: 'shipping',
    });
    if (!split.ok) {
      return { ok: false, errors: split.errors || [], warnings: split.warnings || [], orderId };
    }
    try {
      const prods = order.products || [];
      const ci = (order.costItems || []).filter(isActiveCostItem);
      const now = nowStr();
      const idxSet = new Set(doneIdx);
      const idxRemap = new Map();
      let newI = 0;
      prods.forEach((_, i) => { if (!idxSet.has(i)) idxRemap.set(i, newI++); });
      const childCi = ci
        .filter(c => {
          const m = matchCostItemProduct(c, prods);
          return m.index >= 0 && idxSet.has(m.index);
        })
        .map(c => {
          const m = matchCostItemProduct(c, prods);
          const childIdx = doneIdx.indexOf(m.index);
          return { ...c, prodIdx: childIdx >= 0 ? childIdx : null };
        });
      const parentCi = ci
        .filter(c => {
          const m = matchCostItemProduct(c, prods);
          return m.index < 0 || !idxSet.has(m.index);
        })
        .map(c => {
          const m = matchCostItemProduct(c, prods);
          if (m.index < 0) return c;
          return { ...c, prodIdx: idxRemap.get(m.index) ?? null };
        });

      const childData = {
        ...split.childOrderData,
        costItems: childCi,
        prodStatus: 'done',
        prodDoneAt: now,
        shippingOfficerId: shipId || '',
        shippingOfficerName: shipName || '',
        clientId: order.clientId || '',
        clientName: order.clientName || '',
        clientPhone: order.clientPhone || '',
        salePrice: 0, deposit: 0, totalPaid: 0, remaining: 0, paymentStatus: 'parent_holds',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const childRef = doc(collection(db, 'orders'));
      const batch = writeBatch(db);
      batch.set(childRef, childData);
      const remainingProds = prods.filter((_, i) => !idxSet.has(i));
      const childIds = [...(order.childOrderIds || []), childRef.id];
      // Re-derive prodStatus for the parent (caller has the helper; we mirror logic safely)
      let newProdStatus = 'pending';
      if (!remainingProds.length) newProdStatus = 'pending';
      else if (remainingProds.every(p => p.execStatus === 'done')) newProdStatus = 'done';
      else if (remainingProds.some(p => p.execStatus === 'problem')) newProdStatus = 'problem';
      else if (remainingProds.some(p => ['wip', 'done'].includes(p.execStatus))) newProdStatus = 'wip';
      const tlEntry = auditEntry({
        action: `🔀 شحن جزئي: ${doneIdx.length}/${prods.length} بند → ${split.childOrderId}`,
        userId, userName, kind: 'op',
        meta: { childOrderId: split.childOrderId, doneCount: doneIdx.length },
      });
      tlEntry.stage = order.stage;
      batch.update(order._ref, {
        products: remainingProds,
        costItems: parentCi,
        childOrderIds: childIds,
        prodStatus: newProdStatus,
        timeline: [...(order.timeline || []), tlEntry],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return {
        ok: true, errors: [], warnings: [],
        orderId, action: 'split_order_for_shipping',
        childOrderId: split.childOrderId,
        childOrderDocId: childRef.id,
        doneCount: doneIdx.length,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التقسيم'], warnings: [], orderId };
    }
  },

  // ─── Design Workflow Actions (P2.2) ───────
  //
  // Actions used by design.html. Most are simple order-field updates with a
  // timeline entry; splitDesignOrder is the complex multi-write case.

  /**
   * تحديث ملاحظات الأوردر (notes / designNote) — مع timeline.
   * يستخدم لـ saveDesignNotes في design.html.
   */
  async updateOrderNotes({
    db = defaultDb, orderId,
    notes,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const newNotes = (notes || '').trim();
    const oldLen = (order.notes || '').length;
    const newLen = newNotes.length;
    const action = order.notes
      ? `✏️ تعديل بيانات التصميم (${oldLen}→${newLen} حرف)`
      : `📝 إضافة بيانات التصميم (${newLen} حرف)`;
    try {
      const entry = auditEntry({ action, userId, userName, kind: 'edit' });
      await updateDoc(order._ref, {
        notes: newNotes,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'update_order_notes' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [], orderId };
    }
  },

  /**
   * حفظ ملف التصميم النهائي على الأوردر + إضافة سطر timeline.
   * إذا كان `autoTransitionFromWip` true والـ designStage='wip' حالياً،
   * ينقله إلى 'awaiting_payment' ويعلّم designFinishedAt.
   */
  async saveDesignFile({
    db = defaultDb, orderId,
    fileUrl, fileNote = '',
    autoTransitionFromWip = false,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!fileUrl) return { ok: false, errors: ['⚠️ fileUrl مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const wasInWip = order.designStage === ORDER_DESIGN_STAGES.WIP;
    const willTransition = autoTransitionFromWip && wasInWip;
    try {
      const tl = [...(order.timeline || []), auditEntry({
        action: '🖼️ رُفعت صورة التصميم النهائي',
        userId, userName, kind: 'op',
      })];
      const updates = {
        designFileUrl: fileUrl,
        designFileNote: fileNote,
        timeline: tl,
        updatedAt: serverTimestamp(),
      };
      if (willTransition) {
        updates.designStage = ORDER_DESIGN_STAGES.AWAITING_PAYMENT;
        updates.designFinishedAt = nowStr();
        updates.timeline = [...tl, auditEntry({
          action: '📤 المصمم خلّص — في انتظار تحويل العميل',
          userId, userName, kind: 'op',
        })];
      }
      await updateDoc(order._ref, updates);
      return {
        ok: true, errors: [], warnings: [],
        orderId, action: 'save_design_file',
        transitioned: willTransition,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [], orderId };
    }
  },

  /**
   * إضافة صورة/ملف تصميم إلى designFiles[] على الأوردر (مصدر الحقيقة لملف تصميم
   * العميل). يُستدعى تلقائياً عند إرسال المصمم صورةً في محادثة الأوردر (من inbox.html
   * كـ view → فعل أعمال؛ يحترم حدّ Messaging↔Business — لا trigger ولا كتابة من
   * طبقة المراسلة). idempotent بالـ url.
   * @param {{url:string,name?:string,mime?:string,type?:string}} file
   */
  async addDesignFile({
    db = defaultDb, orderId, file, userId, userName = '', source = '',
  }) {
    if (!orderId || !file || !file.url) return { ok: false, errors: ['⚠️ بيانات ناقصة'], warnings: [], orderId };
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const existing = Array.isArray(order.designFiles) ? order.designFiles : [];
    if (existing.some(x => (x && (x.url || x)) === file.url)) {
      return { ok: true, errors: [], warnings: ['موجود سلفاً'], orderId, action: 'add_design_file', duplicate: true };
    }
    const entry = {
      url: file.url, name: file.name || 'تصميم', type: file.mime || file.type || '',
      by: userId, byName: userName || '', source: source || '', at: nowStr(),
    };
    try {
      await updateDoc(order._ref, {
        designFiles: [...existing, entry],
        designFileUrl: entry.url, // أحدث ملف — توافق مع القراءة الحالية (proofUrl)
        timeline: [...(order.timeline || []), auditEntry({
          action: '🖼️ أُضيفت صورة تصميم' + (source === 'chat' ? ' من المحادثة' : ''),
          userId, userName, kind: 'op', meta: { source: source || '' },
        })],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'add_design_file' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [], orderId };
    }
  },

  /**
   * ربط الأوردر بمحادثته (order.conversationId) — back-pointer للوصول من الأوردر
   * للخيط. additive · idempotent. الاتجاه الآخر (conversation.orderId) موجود سلفاً.
   */
  async linkOrderConversation({ db = defaultDb, orderId, conversationId, userId = '' }) {
    if (!orderId || !conversationId) return { ok: false, errors: ['⚠️ بيانات ناقصة'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    if (order.conversationId === conversationId) return { ok: true, errors: [], warnings: [], orderId };
    try {
      await updateDoc(order._ref, { conversationId, updatedAt: serverTimestamp() });
      return { ok: true, errors: [], warnings: [], orderId };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الربط'], warnings: [], orderId };
    }
  },

  /**
   * تعيين رابط الملف المرجعي بعد رفعه إلى Storage — يُستخدم في الـ
   * post-createOrder callback من design.html.
   */
  async setRefFileUrl({
    db = defaultDb, orderId, url, mimeType,
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    if (!url) return { ok: false, errors: ['⚠️ url مطلوب'], warnings: [], orderId };
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        refFileUrl: url,
        refFileType: mimeType || '',
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'set_ref_file_url' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [], orderId };
    }
  },

  /**
   * تعيين/إلغاء تعيين المصمم على الأوردر.
   * تمرير `designerId=''` يفصل التعيين.
   */
  async assignDesigner({
    db = defaultDb, orderId,
    designerId = '', designerName = '',
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    try {
      const entry = auditEntry({
        action: designerId
          ? `👤 تم تعيين المصمم: ${designerName} — بانتظار تأكيد الاستلام`
          : '👤 إلغاء تعيين المصمم',
        userId, userName, kind: 'op',
        meta: { designerId },
      });
      const updates = {
        designerId,
        designerName: designerId ? designerName : '',
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
        designerAcceptedAt: null,
        designerAcceptedBy: '',
      };
      if (designerId) {
        updates.designerAssignedAt = serverTimestamp();
        updates.designerAssignedBy = userId;
      } else {
        updates.designerAssignedAt = null;
        updates.designerAssignedBy = '';
      }
      await updateDoc(order._ref, updates);
      return { ok: true, errors: [], warnings: [], orderId, action: 'assign_designer' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التعيين'], warnings: [], orderId };
    }
  },

  /**
   * «بدء تصميم فعّال»: تعيين المصمم (أعمال) + فتح مجموعة العميل (مصمم + عميل +
   * خدمة العملاء/الفريق) + إعلان داخلها (تواصل). المجموعة = نفس clord_{orderId}
   * المشتركة مع العميل. الإعلان يزيد unread لكل المشاركين = إشعار ضمني.
   * يجمع فعلين مركزيين: assignDesigner (هنا) + inboxActions.ensureClientOrderThread (مراسلة).
   * Returns: { ok, errors[], warnings[], orderId, convId?, designerId? }
   */
  async startDesign({
    db = defaultDb, orderId, designerId = '', designerName = '', userId, userName = '',
  }) {
    if (!orderId || !designerId) return { ok: false, errors: ['⚠️ الأوردر والمصمم مطلوبان'], warnings: [], orderId };
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    // 1) تعيين المصمم (أعمال — مصدر الحقيقة على الأوردر).
    const a = await orderActions.assignDesigner({ db, orderId, designerId, designerName, userId, userName });
    if (!a.ok) return a;
    // 2) جهّز الأوردر بالمصمم الجديد لبناء المشاركين.
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    order.designerId = designerId; order.designerName = designerName;
    if (!order.clientId) {
      return { ok: true, errors: [], warnings: ['⚠️ الأوردر بلا عميل مسجّل — لم تُفتح مجموعة العميل'], orderId, designerId };
    }
    // 3) افتح مجموعة العميل (مصمم + عميل + منشئ/CS + المُنفِّذ) — طبقة المراسلة.
    const t = await inboxActions.ensureClientOrderThread({
      db, order, currentUserId: userId, currentUserName: userName,
    });
    // اربط الأوردر بمحادثته (back-pointer) — additive.
    try { await orderActions.linkOrderConversation({ db, orderId, conversationId: t.convId, userId }); } catch (_) {}
    // 4) إعلان «بدأ التصميم» داخل المجموعة (unread لكل المشاركين = إشعار ضمني).
    try {
      await inboxActions.sendMessage({
        db, convId: t.convId, senderId: userId, senderName: userName || 'النظام',
        conv: { participants: t.participants, archivedBy: [] },
        payload: { type: 'text', text: '🎨 بدأ التصميم — المصمم: ' + (designerName || '—') + '. خدمة العملاء والمصمم والعميل في هذه المجموعة.' },
      });
    } catch (_) { /* الإعلان ثانوي — التعيين والمجموعة تمّا */ }
    return { ok: true, errors: [], warnings: a.warnings || [], orderId, convId: t.convId, designerId };
  },

  /**
   * المصمم يأكد استلام الأوردر المُعيَّن له.
   */
  async acceptDesignAssignment({
    db = defaultDb, orderId,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    if (!order.designerId) return { ok: false, errors: ['⚠️ الأوردر غير مكلّف'], warnings: [], orderId };
    if (order.designerId !== userId) return { ok: false, errors: ['⚠️ الأوردر غير مُعيَّن لك'], warnings: [], orderId };
    if (order.designerAcceptedAt) return { ok: false, errors: ['ℹ️ تم تأكيد الاستلام مسبقاً'], warnings: [], orderId };
    try {
      const entry = auditEntry({
        action: '✓ المصمم أكّد استلام الأوردر',
        userId, userName, kind: 'op',
      });
      await updateDoc(order._ref, {
        designerAcceptedAt: serverTimestamp(),
        designerAcceptedBy: userId,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'accept_design_assignment' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التأكيد'], warnings: [], orderId };
    }
  },

  /**
   * المصمم يبدأ العمل (designStage → 'wip' + designStartedAt).
   * يفترض أن الـ caller تحقق إن designerAcceptedAt موجود.
   */
  async startDesignWork({
    db = defaultDb, orderId,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    if (order.designerId && !order.designerAcceptedAt) {
      return { ok: false, errors: ['⚠️ أكّد استلام الأوردر أولاً'], warnings: [], orderId };
    }
    try {
      const entry = auditEntry({
        action: '▶ بدأ المصمم العمل',
        userId, userName, kind: 'op',
      });
      await updateDoc(order._ref, {
        designStage: ORDER_DESIGN_STAGES.WIP,
        designStartedAt: nowStr(),
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'start_design_work' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل البدء'], warnings: [], orderId };
    }
  },

  /**
   * تغيير designStage مع timeline + حقول مرتبطة (إجباري — قائمة محصورة).
   *
   * @param {string} stage  — 'pending' | 'wip' | 'awaiting_payment' | 'rejected' | 'approved' | 'paused'
   * @param {string} [rejectReason]  — لو stage='rejected'
   * @param {boolean} [isPause]  — مجرد action label hint
   * @param {boolean} [isReturnToWip]  — مجرد action label hint
   */
  async setDesignStage({
    db = defaultDb, orderId, stage,
    rejectReason = '',
    isPause = false, isReturnToWip = false,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const valid = Object.values(ORDER_DESIGN_STAGES);
    if (!valid.includes(stage)) {
      return { ok: false, errors: [`⚠️ designStage '${stage}' غير صالح`], warnings: [], orderId };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const lblMap = { pending: 'في الانتظار', wip: 'جاري التصميم', awaiting_payment: 'انتظار التحويل', rejected: 'مرفوض', approved: 'معتمد' };
    const lbl = lblMap[stage] || stage;
    let actionText = `🔄 ${lbl}`;
    if (stage === 'rejected' && rejectReason) actionText = '✕ رُفض: ' + rejectReason;
    else if (isPause) actionText = '⏸ إيقاف مؤقت للتصميم';
    else if (isReturnToWip) actionText = '↩ أُعيد للمصمم لتعديل التصميم';
    try {
      const entry = auditEntry({ action: actionText, userId, userName, kind: 'op', meta: { stage } });
      const upd = {
        designStage: stage,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      };
      if (stage === 'rejected' && rejectReason) upd.rejectReason = rejectReason;
      await updateDoc(order._ref, upd);
      return { ok: true, errors: [], warnings: [], orderId, action: 'set_design_stage', stage };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [], orderId };
    }
  },

  /**
   * تحديث productStatus لمنتج بعينه (workflow الكتالوج، يختلف عن execStatus
   * المستخدم في production).
   */
  async setProductCatalogStatus({
    db = defaultDb, orderId, prodIdx, status,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const prods = [...(order.products || [])];
    if (prodIdx < 0 || prodIdx >= prods.length) {
      return { ok: false, errors: ['⚠️ فهرس المنتج غير صالح'], warnings: [], orderId };
    }
    const oldStatus = prods[prodIdx].productStatus || 'pending';
    if (oldStatus === status) {
      return { ok: false, errors: ['⚠️ نفس الحالة'], warnings: [], orderId };
    }
    prods[prodIdx] = {
      ...prods[prodIdx],
      productStatus: status,
      statusUpdatedAt: nowStr(),
      statusUpdatedBy: userName,
    };
    const sLblMap = { pending: 'في الانتظار', in_progress: 'جاري', ready: 'جاهز للطباعة', on_hold: 'مؤجَّل', printed: 'مطبوع', done: 'منتهي' };
    const sLbl = sLblMap[status] || status;
    try {
      const entry = auditEntry({
        action: `📦 ${prods[prodIdx].name}: ${sLbl}`,
        userId, userName, kind: 'op',
        meta: { prodIdx, status, oldStatus },
      });
      entry.stage = order.stage;
      await updateDoc(order._ref, {
        products: prods,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'set_product_catalog_status', label: sLbl };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [], orderId };
    }
  },

  /**
   * شحن جزئي من design → printing (مماثل لـ splitOrderForShipping).
   *
   * @param {number[]} indices — indices للمنتجات المُختارة للنقل
   */
  async splitDesignOrder({
    db = defaultDb, orderId, indices = [],
    role, userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!Array.isArray(indices) || !indices.length) {
      return { ok: false, errors: ['⚠️ اختر منتجاً واحداً على الأقل'], warnings: [], orderId };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const split = buildOrderSplit({
      order, productIndices: indices, role, userId, userName, targetStage: 'printing',
    });
    if (!split.ok) {
      return { ok: false, errors: split.errors || [], warnings: split.warnings || [], orderId };
    }
    try {
      const childRef = doc(collection(db, 'orders'));
      const batch = writeBatch(db);
      batch.set(childRef, {
        ...split.childOrderData,
        parentOrderId: orderId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(order._ref, {
        ...split.parentUpdate.fields,
        childOrderIds: [...(order.childOrderIds || []), childRef.id],
        timeline: [...(order.timeline || []), { ...split.parentUpdate.timelineEntry, childOrderId: childRef.id }],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return {
        ok: true, errors: [], warnings: [],
        orderId, action: 'split_design_order',
        childOrderId: split.childOrderId,
        childOrderDocId: childRef.id,
        splitCount: split.splitCount,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التقسيم'], warnings: [], orderId };
    }
  },

  /**
   * Admin override لاعتماد التصميم → طباعة بدون استيفاء شروط submitToPrinting.
   * Escape hatch موثَّق — يكتب override:true + overrideReason في الـ timeline.
   */
  async adminOverrideToPrinting({
    db = defaultDb, orderId,
    printerId = '', printerName = '',
    overrideReason = '',
    role, userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!['admin', 'operation_manager'].includes(role)) {
      return { ok: false, errors: ['⛔ صلاحية أدمن فقط'], warnings: [], orderId };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    try {
      const entry = auditEntry({
        action: '⚠️ اعتُمد التصميم بـ admin override — ' + (overrideReason || 'بدون استيفاء الشروط'),
        userId, userName, kind: 'op',
        meta: { override: true, overrideReason },
      });
      entry.stage = 'printing';
      entry.override = true;
      entry.overrideReason = overrideReason;
      const upd = {
        stage: 'printing',
        designStage: ORDER_DESIGN_STAGES.APPROVED,
        approvedAt: nowStr(),
        approvedBy: userName,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      };
      if (printerId) {
        upd.printerId = printerId;
        upd.printerName = printerName;
      }
      await updateDoc(order._ref, upd);
      return { ok: true, errors: [], warnings: [], orderId, action: 'admin_override_to_printing' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الـ override'], warnings: [], orderId };
    }
  },

  /**
   * Admin override للتحويل من printing → production مع تجاوز صلب الـ
   * validators (مواصفات الطباعة الناقصة). يُسجَّل سبب صريح في الـ timeline.
   *
   * Phase 4 Operational Guards: نفس فلسفة adminOverrideToPrinting.
   * RULE H3 — audit kind:'op' + override flag + reason.
   */
  async adminOverrideToProduction({
    db = defaultDb, orderId,
    nextAssigneeId = '', nextAssigneeName = '',
    overrideReason = '',
    role, userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!['admin', 'operation_manager'].includes(role)) {
      return { ok: false, errors: ['⛔ صلاحية أدمن فقط'], warnings: [], orderId };
    }
    if (!overrideReason || !overrideReason.trim()) {
      return { ok: false, errors: ['⛔ سبب الـ override مطلوب'], warnings: [], orderId };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    if (order.stage !== 'printing') {
      return { ok: false, errors: [`الأوردر في مرحلة ${order.stage}، لا يمكن التحويل من الـ override`], warnings: [], orderId };
    }
    try {
      const entry = auditEntry({
        action: '⚠️ تحويل للتنفيذ بـ admin override — ' + overrideReason.trim(),
        userId, userName, kind: 'op',
        meta: { override: true, overrideReason: overrideReason.trim() },
      });
      entry.stage = 'production';
      entry.override = true;
      entry.overrideReason = overrideReason.trim();
      if (nextAssigneeId) {
        entry.assigneeId = nextAssigneeId;
        entry.assigneeName = nextAssigneeName || '';
      }
      const upd = {
        stage: 'production',
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      };
      if (nextAssigneeId) {
        upd.productionAgent = nextAssigneeId;
        upd.productionAgentName = nextAssigneeName || '';
      }
      // Track stage entry timestamp (matches normal advance path)
      const stageEnteredAt = order.stageEnteredAt || {};
      stageEnteredAt.production = new Date().toISOString();
      upd.stageEnteredAt = stageEnteredAt;

      await updateDoc(order._ref, upd);
      return { ok: true, errors: [], warnings: [], orderId, action: 'admin_override_to_production' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الـ override'], warnings: [], orderId };
    }
  },

  /**
   * Admin override للتحويل من production → shipping مع تجاوز صلب الـ
   * validators (cost items مفقودة، منتجات بـ status pending/in_progress).
   * يُسجَّل سبب صريح في الـ timeline.
   *
   * Phase A Production Guards: نفس فلسفة adminOverrideToProduction.
   * RULE H3 — audit kind:'op' + override flag + reason.
   */
  async adminOverrideToShipping({
    db = defaultDb, orderId,
    nextAssigneeId = '', nextAssigneeName = '',
    overrideReason = '',
    role, userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!['admin', 'operation_manager'].includes(role)) {
      return { ok: false, errors: ['⛔ صلاحية أدمن فقط'], warnings: [], orderId };
    }
    if (!overrideReason || !overrideReason.trim()) {
      return { ok: false, errors: ['⛔ سبب الـ override مطلوب'], warnings: [], orderId };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    if (order.stage !== 'production') {
      return { ok: false, errors: [`الأوردر في مرحلة ${order.stage}، لا يمكن التحويل من الـ override`], warnings: [], orderId };
    }
    try {
      const entry = auditEntry({
        action: '⚠️ تحويل للشحن بـ admin override — ' + overrideReason.trim(),
        userId, userName, kind: 'op',
        meta: { override: true, overrideReason: overrideReason.trim() },
      });
      entry.stage = 'shipping';
      entry.override = true;
      entry.overrideReason = overrideReason.trim();
      if (nextAssigneeId) {
        entry.assigneeId = nextAssigneeId;
        entry.assigneeName = nextAssigneeName || '';
      }
      const upd = {
        stage: 'shipping',
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      };
      if (nextAssigneeId) {
        upd.shippingAgent = nextAssigneeId;
        upd.shippingAgentName = nextAssigneeName || '';
      }
      const stageEnteredAt = order.stageEnteredAt || {};
      stageEnteredAt.shipping = new Date().toISOString();
      upd.stageEnteredAt = stageEnteredAt;

      await updateDoc(order._ref, upd);
      return { ok: true, errors: [], warnings: [], orderId, action: 'admin_override_to_shipping' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الـ override'], warnings: [], orderId };
    }
  },

  // ─── Printing Workflow Actions (P2.4) ─────

  /** تحديث order.printType (single field). */
  async setPrintType({ db = defaultDb, orderId, printType }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        printType,
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'set_print_type', printType };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [], orderId };
    }
  },

  /** تحديث order.printNotes (single field). */
  async savePrintNotes({ db = defaultDb, orderId, notes }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        printNotes: notes || '',
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'save_print_notes' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [], orderId };
    }
  },

  /**
   * pickup أوردر طباعة بدون مالك — يعيّن printerId/printerName.
   * الـ caller يتحقق إن `!order.printerId` قبل النداء.
   */
  async assignPrinter({
    db = defaultDb, orderId,
    printerId, printerName,
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!printerId) return { ok: false, errors: ['⚠️ printerId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    if (order.printerId) return { ok: false, errors: ['⚠️ هذا الأوردر له مالك بالفعل'], warnings: [], orderId };
    try {
      const entry = auditEntry({
        action: `📥 ${printerName} التقط الأوردر`,
        userId, userName, kind: 'op',
        meta: { printerId },
      });
      entry.stage = order.stage;
      entry.assigneeId = printerId;
      entry.assigneeName = printerName;
      await updateDoc(order._ref, {
        printerId,
        printerName,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'assign_printer' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الالتقاط'], warnings: [], orderId };
    }
  },

  /**
   * شحن جزئي من printing → production (مماثل لـ splitDesignOrder).
   */
  async splitPrintOrder({
    db = defaultDb, orderId, indices = [],
    role, userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!Array.isArray(indices) || !indices.length) {
      return { ok: false, errors: ['⚠️ اختر منتجاً واحداً على الأقل'], warnings: [], orderId };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const split = buildOrderSplit({
      order, productIndices: indices, role, userId, userName, targetStage: 'production',
    });
    if (!split.ok) {
      return { ok: false, errors: split.errors || [], warnings: split.warnings || [], orderId };
    }
    try {
      const childRef = doc(collection(db, 'orders'));
      const batch = writeBatch(db);
      batch.set(childRef, {
        ...split.childOrderData,
        parentOrderId: orderId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(order._ref, {
        ...split.parentUpdate.fields,
        childOrderIds: [...(order.childOrderIds || []), childRef.id],
        timeline: [...(order.timeline || []), { ...split.parentUpdate.timelineEntry, childOrderId: childRef.id }],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return {
        ok: true, errors: [], warnings: [],
        orderId, action: 'split_print_order',
        childOrderId: split.childOrderId,
        childOrderDocId: childRef.id,
        splitCount: split.splitCount,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التقسيم'], warnings: [], orderId };
    }
  },

  /**
   * تطبيق patch على منتج بعينه داخل الأوردر (يستخدم لـ:
   * applyBriefTemplate, updateProductBriefField debounced save).
   *
   * @param {Object} patch  — حقول لتطبيقها على product[idx]
   * @param {string} [timelineAction]  — لو موجود، يُضاف entry للـ timeline
   */
  async applyProductBriefPatch({
    db = defaultDb, orderId, prodIdx, patch,
    timelineAction = '',
    userId, userName,
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    if (!patch || typeof patch !== 'object') {
      return { ok: false, errors: ['⚠️ patch مطلوب'], warnings: [], orderId };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const prods = [...(order.products || [])];
    if (prodIdx < 0 || prodIdx >= prods.length) {
      return { ok: false, errors: ['⚠️ فهرس المنتج غير صالح'], warnings: [], orderId };
    }
    prods[prodIdx] = { ...prods[prodIdx], ...patch };
    try {
      const upd = { products: prods, updatedAt: serverTimestamp() };
      if (timelineAction && userId) {
        const entry = auditEntry({
          action: timelineAction, userId, userName, kind: 'op',
          meta: { prodIdx, fields: Object.keys(patch) },
        });
        upd.timeline = [...(order.timeline || []), entry];
      }
      await updateDoc(order._ref, upd);
      return { ok: true, errors: [], warnings: [], orderId, action: 'apply_product_brief_patch' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [], orderId };
    }
  },

  /**
   * تسجيل إرسال brief المنتج للمطبعة — يكتب briefSentAt/By + timeline.
   * (الـ caller هو اللي يفتح WhatsApp بعد النداء).
   */
  async markProductBriefSent({
    db = defaultDb, orderId, prodIdx,
    pressName = '',
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const prods = [...(order.products || [])];
    if (prodIdx < 0 || prodIdx >= prods.length) {
      return { ok: false, errors: ['⚠️ فهرس المنتج غير صالح'], warnings: [], orderId };
    }
    const p = prods[prodIdx];
    prods[prodIdx] = { ...p, briefSentAt: nowStr(), briefSentBy: userId, briefSentByName: userName };
    try {
      const entry = auditEntry({
        action: `📤 إرسال بيانات الإنتاج للمطبعة (${p.name || ''} → ${pressName || ''})`,
        userId, userName, kind: 'op',
        meta: { prodIdx, pressName },
      });
      await updateDoc(order._ref, {
        products: prods,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'mark_product_brief_sent' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [], orderId };
    }
  },

  /**
   * Reject من printing → design (stage revert) مع reason.
   * يستخدم buildStageRevert المركزي.
   */
  async rejectFromPrinting({
    db = defaultDb, orderId, reason,
    role, userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!reason || !reason.trim()) return { ok: false, errors: ['⚠️ أدخل سبب الإرجاع'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const rev = buildStageRevert({
      order, role, userId, userName,
      targetStage: 'design', reason,
      extraFields: { designStage: ORDER_DESIGN_STAGES.REJECTED, printRejectNote: reason },
    });
    if (!rev.ok) return { ok: false, errors: rev.errors || [], warnings: rev.warnings || [], orderId };
    try {
      await updateDoc(order._ref, {
        ...rev.fields,
        timeline: [...(order.timeline || []), rev.timelineEntry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'reject_from_printing' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الإرجاع'], warnings: [], orderId };
    }
  },

  /**
   * إرجاع الأوردر مرحلة واحدة للخلف (أو لمرحلة هدف محددة) — stage revert مُمَركَز.
   * يستخدم buildStageRevert (نقي) ثم يكتب ذرّياً عبر updateDoc واحد.
   * - السبب (reason) إلزامي.
   * - الصلاحية + ضمان مسؤول المرحلة الهدف + إعادة ضبط ساعة الدخول: داخل buildStageRevert (قاعدة R).
   * - لو targetStage فاضي → يرجع للمرحلة السابقة مباشرةً (STAGES[cur].prev).
   */
  async revertStage({
    db = defaultDb, orderId, role, userId, userName,
    targetStage = null, reason = '',
    nextAssigneeId = '', nextAssigneeName = '', extraFields = {},
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!reason || !reason.trim()) return { ok: false, errors: ['⚠️ أدخل سبب الإرجاع'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const rev = buildStageRevert({
      order, role, userId, userName,
      targetStage, reason: reason.trim(),
      nextAssigneeId, nextAssigneeName, extraFields,
    });
    if (!rev.ok) return { ok: false, errors: rev.errors || [], warnings: rev.warnings || [], orderId };
    try {
      await updateDoc(order._ref, {
        ...rev.fields,
        timeline: [...(order.timeline || []), rev.timelineEntry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'revert_stage', newStage: rev.newStage };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الإرجاع'], warnings: [], orderId };
    }
  },

  /** تعيين رابط الملف النهائي للطباعة (printFinalUrl + printFinalType). */
  async setPrintFinalFile({
    db = defaultDb, orderId, fileUrl, fileType = '',
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!fileUrl) return { ok: false, errors: ['⚠️ fileUrl مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    try {
      const entry = auditEntry({
        action: '📁 رُفع الملف النهائي للمطبعة',
        userId, userName, kind: 'op',
      });
      await updateDoc(order._ref, {
        printFinalUrl: fileUrl,
        printFinalType: fileType,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'set_print_final_file' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [], orderId };
    }
  },

  /**
   * تسجيل مقدم طباعة — financial atomic batch.
   * يحدث order.printAdvance + paymentStatus + wallet + tx + ledger.
   */
  async recordPrintAdvance({
    db = defaultDb, orderId,
    amount, walletId, walletName,
    note = '',
    receiptUrl = '',
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return { ok: false, errors: ['⚠️ أدخل مبلغاً'], warnings: [], orderId };
    if (!walletId) return { ok: false, errors: ['⚠️ اختر المحفظة'], warnings: [], orderId };
    // 📷 Receipt إجباري لتسجيل أي مقدم
    if (!receiptUrl) return { ok: false, errors: ['⚠️ صورة الإيصال مطلوبة'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const sale = parseFloat(order.salePrice) || 0;
    const discount = parseFloat(order.discount) || 0;
    const net = Math.max(0, sale - discount);
    const oldPaid = parseFloat(order.totalPaid) || 0;
    const newPaid = oldPaid + amt;
    const newRem = Math.max(0, net - newPaid);
    if (amt > net - oldPaid + 0.01) {
      return { ok: false, errors: [`⚠️ يتجاوز الباقي (${(net - oldPaid).toLocaleString('ar-EG')} ج)`], warnings: [], orderId };
    }
    const status = newRem <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'pending';
    const newPrintAdvance = (parseFloat(order.printAdvance) || 0) + amt;
    const label = note ? `مقدم طباعة — ${note}` : 'مقدم طباعة';
    try {
      const batch = writeBatch(db);
      const tlEntry = auditEntry({
        action: `💵 ${label} ${amt.toLocaleString('ar-EG')} ج عبر ${walletName}`,
        userId, userName, kind: 'op',
        meta: { amount: amt, walletId, walletName, note },
      });
      batch.update(order._ref, {
        totalPaid: newPaid,
        remaining: newRem,
        paymentStatus: status,
        printAdvance: newPrintAdvance,
        timeline: [...(order.timeline || []), tlEntry],
        updatedAt: serverTimestamp(),
        ...(status === 'paid' ? { paidAt: serverTimestamp() } : {}),
      });
      batch.update(doc(db, 'wallets', walletId), { balance: increment(amt) });
      batch.set(doc(collection(db, 'transactions_v2')), {
        type: 'in',
        category: 'print_advance',
        amount: amt,
        walletId, walletName,
        orderId,
        orderRef: order.orderId || orderId.slice(-6),
        clientId: order.clientId || '',
        clientName: order.clientName || '',
        description: `${label} — ${order.clientName || ''}`,
        note: `${label} — ${order.clientName || ''}`,
        receiptUrl,
        date: nowStr(),
        createdBy: userId,
        createdByName: userName || '',
        by: userName || '',
        createdAt: serverTimestamp(),
        approvalStatus: 'pending',
        confirmedBy: '', confirmedByName: '', confirmedAt: null,
        approvedBy: '', approvedByName: '', approvedAt: null,
        rejectedBy: '', rejectedByName: '', rejectedAt: null,
        rejectReason: '', isLocked: false,
      });
      addLedgerToBatch(batch, db, FE.CUSTOMER_PAYMENT, {
        amount: amt, walletId, walletName,
        orderId,
        clientId: order.clientId || '',
        clientName: order.clientName || '',
        notes: `${label} — ${order.clientName || ''}`,
        userId, userName,
      });
      await batch.commit();
      return {
        ok: true, errors: [], warnings: [],
        orderId, action: 'record_print_advance',
        amount: amt, newRem, newStatus: status, newPrintAdvance,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [], orderId };
    }
  },

  /**
   * حفظ مصفوفة المنتجات على الأوردر مع إعادة حساب مالية اختيارية.
   * يُستخدم لـ saveEditProds + image uploads/deletes على products[].
   *
   * @param {Array} products  — الـ products array الكاملة
   * @param {boolean} [recalcFinancials=false]  — لو true يحسب salePrice + remaining + paymentStatus
   * @param {number} [overrideSalePrice]  — لو محدد، يستخدم بدل auto-sum
   * @param {string} [timelineAction]  — لو موجود، يُضاف للـ timeline
   */
  async saveOrderProducts({
    db = defaultDb, orderId, products,
    recalcFinancials = false,
    overrideSalePrice,
    timelineAction = '',
    userId, userName,
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    if (!Array.isArray(products)) {
      return { ok: false, errors: ['⚠️ products array مطلوب'], warnings: [], orderId };
    }
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    const upd = { products, updatedAt: serverTimestamp() };
    if (recalcFinancials) {
      const autoSum = products.reduce((s, p) => s + (parseFloat(p.unitPrice || p.price || 0)), 0);
      const salePrice = (overrideSalePrice != null) ? parseFloat(overrideSalePrice) || autoSum : autoSum;
      const productName = products.map(p => p.name).join(' + ');
      const totalQty = products.reduce((s, p) => s + parseInt(p.qty || 1), 0);
      const paid = parseFloat(order.totalPaid) || 0;
      const discount = parseFloat(order.discount) || 0;
      const rem = Math.max(0, salePrice - discount - paid);
      const status = rem <= 0 && salePrice > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
      upd.product = productName;
      upd.qty = totalQty;
      upd.salePrice = salePrice;
      upd.remaining = rem;
      upd.paymentStatus = status;
    }
    if (timelineAction && userId) {
      const entry = auditEntry({
        action: timelineAction, userId, userName, kind: 'op',
        meta: { productCount: products.length, recalc: recalcFinancials },
      });
      upd.timeline = [...(order.timeline || []), entry];
    }
    try {
      await updateDoc(order._ref, upd);
      return {
        ok: true, errors: [], warnings: [],
        orderId, action: 'save_order_products',
        salePrice: upd.salePrice, remaining: upd.remaining,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [], orderId };
    }
  },

  // ─── Cancel Order ─────────────────────────────────────────────────
  async cancelOrder({
    db = defaultDb, orderId,
    reason = '', note = '',
    userId, userName,
  }) {
    if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [], orderId };
    if (!reason) return { ok: false, errors: ['⛔ سبب الإلغاء مطلوب'], warnings: [], orderId };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    if (order.stage === 'cancelled') {
      return { ok: false, errors: ['الأوردر ملغي بالفعل'], warnings: [], orderId };
    }
    if (order.stage === 'archived') {
      return { ok: false, errors: ['لا يمكن إلغاء أوردر مؤرشف'], warnings: [], orderId };
    }
    try {
      const entry = auditEntry({
        action: `❌ إلغاء الأوردر — ${reason}${note ? ' · ' + note : ''}`,
        userId, userName, kind: 'op',
        meta: { cancelReason: reason, cancelNote: note || '', previousStage: order.stage },
      });
      entry.stage = 'cancelled';
      const stageEnteredAt = order.stageEnteredAt || {};
      stageEnteredAt.cancelled = new Date().toISOString();
      await updateDoc(order._ref, {
        stage: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelReason: reason,
        cancelNote: note || '',
        cancelledBy: userId,
        cancelledByName: userName || '',
        previousStage: order.stage,
        stageEnteredAt,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'cancel_order' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الإلغاء'], warnings: [], orderId };
    }
  },
};

// ══════════════════════════════════════════
// DEFAULT EXPORT (للتوافق مع import default)
// ══════════════════════════════════════════
export default orderActions;

// P1.4: expose to window so compat-SDK pages (clients.html) can call
// orderActions.* without converting to type="module". Mirror of the
// pattern in client-actions.js / shipping-actions.js.
if (typeof window !== 'undefined') {
  window.orderActions = orderActions;
}
