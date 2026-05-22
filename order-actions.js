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

import { runTransaction, doc, getDoc, getDocs, collection, query, where, writeBatch, serverTimestamp, increment }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  buildArchiveSpec,
  buildStageAdvance,
  validatePayment,
  validateRefund,
  advanceOrderStageWithLock,
  nowStr,
  // PR-3 imports (scalable-drifting-ember)
  validateDispatch,
  validatePrepareShipping,
  validateMarkDelivered,
  validateCollect,
  validateCompanyCollect,
  validateSettle,
  validateReturn,
  validatePartialReturn,
  validateReverseSettle,
  buildSettlementUpdates,
  normalizeShipStage,
} from './orders.js';
import { dispatchFinancialEvent, FE, addLedgerToBatch, approvalFields } from './financial-sync-engine.js';
import { withIdempotency } from './core/idempotency.js';

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
    if (!orderId) return { ok:false, errors:['⚠️ orderId مطلوب'], warnings:[] };
    // G1: idempotency
    return withIdempotency(db, {
      actionType: source === 'refund' ? 'refund_payment' : 'record_payment',
      entityId: orderId,
      actorId: userId || '',
      payload: { walletId, amount: Number(amount) || 0, source },
    }, async (operationId) => {
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
        operationId, // PR-7.5 R2
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
    }); // end withIdempotency
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
    if (!orderId) return { ok:false, errors:['⚠️ orderId مطلوب'], warnings:[] };
    return withIdempotency(db, {
      actionType: 'refund_order',
      entityId: orderId,
      actorId: userId || '',
      payload: { walletId, amount: Number(amount) || 0 },
    }, async (operationId) => {
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
        operationId, // PR-7.5 R2
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
    }); // end withIdempotency
  },
  // ══════════════════════════════════════════
  // PR-3 SHIPPING LIFECYCLE (scalable-drifting-ember)
  // كل actions الشحن المركزية — تستبدل الـ inline writes في
  // shipping.html / shipping-followup.html / shipping-accounts.html
  // ══════════════════════════════════════════

  /**
   * تجهيز الأوردر للشحن — يحفظ العنوان والطريقة وخيارات السعر.
   * لا يغيّر shipStage (يبقى 'ready'). لا يولّد حدث مالي.
   */
  async prepareForShipping({
    db, orderId, role, userId, userName,
    deliveryAddress = null, customerPhoneShip = '',
    shipMethod = '', shipCompanyId = '', shipCompanyName = '',
    priceIncludesShipping = false, customerShipFee = 0,
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };

    const v = validatePrepareShipping({
      order, deliveryAddress, shipMethod, shipCompanyId,
      priceIncludesShipping, customerShipFee, role,
    });
    if (!v.ok) return { ...v, orderId };

    try {
      const now = nowStr();
      const batch = writeBatch(db);
      const fields = {
        shipMethod,
        shipCompanyId: shipCompanyId || '',
        shipCompanyName: shipCompanyName || '',
        priceIncludesShipping: !!priceIncludesShipping,
        customerShipFee: parseFloat(customerShipFee) || 0,
        updatedAt: serverTimestamp(),
      };
      if (deliveryAddress) fields.deliveryAddress = deliveryAddress;
      if (customerPhoneShip) fields.customerPhoneShip = customerPhoneShip;

      batch.update(order._ref, {
        ...fields,
        timeline: [
          ...(order.timeline || []),
          { date: now, action: '🧾 تجهيز للشحن — تم حفظ العنوان والطريقة', by: userName || '', byId: userId || '' },
        ],
      });
      await batch.commit();
      return { ok:true, errors:[], warnings:v.warnings, orderId, action:'prepare_shipping' };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل تجهيز الأوردر للشحن'], warnings:[], orderId };
    }
  },

  /**
   * تأكيد الشحن — يحرّك shipStage من 'ready' إلى 'shipped' (أو 'delivered' لو pickup).
   * لو cost>0 و walletId موجود → يولّد SHIPPING_EXPENSE atomic عبر FSE.
   *
   * @param {number} args.shippingCost — تكلفة الشحن (اختياري، افتراضي 0)
   * @param {string} [args.walletId]   — المحفظة التي تُخصم منها التكلفة
   * @param {string} [args.shipCompanyId]   — لو لم تُحفظ في prepareForShipping
   * @param {string} [args.shipCompanyName]
   * @param {string} [args.shipMethod] — لو يحتاج override
   */
  async confirmShipped({
    db, orderId, role, userId, userName,
    shippingCost = 0, walletId = '', walletName = '',
    shipCompanyId = '', shipCompanyName = '',
    shipMethod = '', note = '',
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };

    const effectiveMethod = shipMethod || order.shipMethod || '';
    const effectiveCompanyId = shipCompanyId || order.shipCompanyId || '';
    const cost = parseFloat(shippingCost) || 0;

    const v = validateDispatch({
      order, companyId: effectiveCompanyId, method: effectiveMethod,
      cost, walletId, role,
    });
    if (!v.ok) return { ...v, orderId };

    const now = nowStr();
    const isPickup = effectiveMethod === 'pickup';
    const newShipStage = isPickup ? 'delivered' : 'shipped';
    const fieldsBase = {
      shipMethod: effectiveMethod,
      shipCompanyId: effectiveCompanyId,
      shipCompanyName: shipCompanyName || order.shipCompanyName || '',
      shippingCost: cost,
      shipStage: newShipStage,
      shipDispatchedAt: now,
      shipDispatchedBy: userName || '',
      ...(isPickup ? { deliveredAt: now, deliveredBy: userName || '' } : {}),
      updatedAt: serverTimestamp(),
    };
    const timelineEntry = {
      date: now,
      action: isPickup
        ? '📦 استلام من المكتب — العميل استلم'
        : `🚚 تم الشحن — ${shipCompanyName || order.shipCompanyName || 'شركة شحن'}${cost > 0 ? ` (تكلفة ${cost.toLocaleString('ar-EG')} ج)` : ''}`,
      by: userName || '', byId: userId || '',
    };

    try {
      if (cost > 0 && walletId) {
        // مع تكلفة + محفظة → SHIPPING_EXPENSE atomic عبر FSE + orderUpdate
        await dispatchFinancialEvent(db, FE.SHIPPING_EXPENSE, {
          orderId, amount: cost,
          walletId, walletName,
          clientId: order.clientId || '', clientName: order.clientName || '',
          note: note || `تكلفة شحن — ${shipCompanyName || order.shipCompanyName || ''}`,
          userId: userId || '', userName: userName || '',
          orderUpdate: {
            orderId,
            fields: {
              ...fieldsBase,
              timeline: [...(order.timeline || []), timelineEntry],
            },
          },
        });
      } else {
        // بدون تكلفة أو بدون محفظة → updateDoc فقط
        const batch = writeBatch(db);
        batch.update(order._ref, {
          ...fieldsBase,
          timeline: [...(order.timeline || []), timelineEntry],
        });
        await batch.commit();
      }
      return {
        ok:true, errors:[], warnings:v.warnings,
        orderId, action:'confirm_shipped', newShipStage,
      };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل تأكيد الشحن'], warnings:[], orderId };
    }
  },

  /**
   * تأكيد التسليم للعميل — shipped → delivered.
   * لا حركة مالية. مجرد marker زمني.
   */
  async confirmDelivered({ db, orderId, role, userId, userName }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };

    const v = validateMarkDelivered({ order, role });
    if (!v.ok) return { ...v, orderId };

    try {
      const now = nowStr();
      const batch = writeBatch(db);
      batch.update(order._ref, {
        shipStage: 'delivered',
        deliveredAt: now,
        deliveredBy: userName || '',
        timeline: [
          ...(order.timeline || []),
          { date: now, action: '✅ تم التسليم — انتظار التحصيل', by: userName || '', byId: userId || '' },
        ],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { ok:true, errors:[], warnings:v.warnings, orderId, action:'confirm_delivered' };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل تسجيل التسليم'], warnings:[], orderId };
    }
  },

  /**
   * تسجيل "تحت التحصيل" — العميل دفع للشركة لكن الفلوس لسه ما وصلتش لنا.
   * marker فقط — لا حركة محفظة. الدخول الفعلي يحصل عبر settleFromCompany.
   *
   * @param {number} args.amount — المبلغ المُحصَّل من العميل (CoD)
   */
  async markUnderCollection({ db, orderId, role, userId, userName, amount, note = '' }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };

    const v = validateCompanyCollect({ order, amount, role });
    if (!v.ok) return { ...v, orderId };

    try {
      const now = nowStr();
      const amt = parseFloat(amount) || 0;
      const batch = writeBatch(db);
      batch.update(order._ref, {
        shipStage: 'under_collection',
        shipCollected: amt,
        shipCollectedAt: now,
        shipCollectedBy: userName || '',
        timeline: [
          ...(order.timeline || []),
          { date: now, action: `📞 تحت التحصيل — العميل دفع ${amt.toLocaleString('ar-EG')} ج للشركة${note ? ' — ' + note : ''}`, by: userName || '', byId: userId || '' },
        ],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { ok:true, errors:[], warnings:v.warnings, orderId, action:'mark_under_collection' };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل تسجيل التحصيل من الشركة'], warnings:[], orderId };
    }
  },

  /**
   * تحصيل من العميل (pickup / courier) → CUSTOMER_PAYMENT.
   * يدخل المبلغ المحفظة عبر FSE. لو remaining=0 → ينقل shipStage إلى 'collected'.
   *
   * @param {string} args.walletId — المحفظة المستلِمة
   * @param {number} args.amount
   */
  async collectFromCustomer({
    db, orderId, amount, walletId, walletName = '',
    role, userId, userName, note = '',
  }) {
    if (!orderId) return { ok:false, errors:['⚠️ orderId مطلوب'], warnings:[] };
    // G1: idempotency — نفس orderId + walletId + amount خلال دقيقة = no-op
    return withIdempotency(db, {
      actionType: 'collect_from_customer',
      entityId: orderId,
      actorId: userId || '',
      payload: { walletId, amount: Number(amount) || 0 },
    }, async (operationId) => {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };

    // احسب remaining للـ validator
    const sale = parseFloat(order.salePrice) || 0;
    const shipFee = order.priceIncludesShipping ? 0 : (parseFloat(order.customerShipFee) || 0);
    const discount = parseFloat(order.discount) || 0;
    const paid = parseFloat(order.totalPaid) || 0;
    const remaining = Math.max(0, sale + shipFee - discount - paid);

    const v = validateCollect({ order, amount, walletId, remaining, role });
    if (!v.ok) return { ...v, orderId };

    const amt = parseFloat(amount) || 0;

    try {
      // 1) دفعة العميل عبر FSE (atomic: wallet + tx + ledger + order payment fields)
      const eventResult = await dispatchFinancialEvent(db, FE.CUSTOMER_PAYMENT, {
        orderId,
        clientId:   order.clientId   || '',
        clientName: order.clientName || '',
        walletId, walletName,
        amount: amt,
        orderData: {
          totalPaid:       paid,
          salePrice:       sale,
          discount,
          customerShipFee: shipFee,
        },
        note,
        userId: userId || '', userName: userName || '',
        operationId, // PR-7.5 R2 forensic linkage
      });

      // 2) لو remaining بعد الدفعة = 0 → نقل shipStage إلى 'collected' + timeline
      const willBeFullyPaid = amt >= remaining - 0.01;
      const now = nowStr();
      const followBatch = writeBatch(db);
      followBatch.update(order._ref, {
        ...(willBeFullyPaid ? { shipStage: 'collected', shipCollectedAt: now, shipCollectedBy: userName || '' } : {}),
        timeline: [
          ...(order.timeline || []),
          {
            date: now,
            action: willBeFullyPaid
              ? `💵 تم التحصيل بالكامل — ${amt.toLocaleString('ar-EG')} ج${note ? ' — ' + note : ''}`
              : `💵 تحصيل جزئي — ${amt.toLocaleString('ar-EG')} ج (المتبقي ${(remaining - amt).toLocaleString('ar-EG')} ج)${note ? ' — ' + note : ''}`,
            by: userName || '', byId: userId || '',
          },
        ],
        updatedAt: serverTimestamp(),
      });
      await followBatch.commit();

      return {
        ok:true, errors:[], warnings:v.warnings,
        orderId, action:'collect_from_customer',
        fullyCollected: willBeFullyPaid,
        eventResult,
      };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل التحصيل من العميل'], warnings:[], orderId };
    }
    }); // end withIdempotency
  },

  /**
   * تسوية مع شركة الشحن (single أو bulk).
   * يستخدم buildSettlementUpdates للصيغة الـ canonical (shipCollected − shippingCost)
   * ويوزّع المبلغ الفعلي بالتناسب على الأوردرات.
   *
   * @param {string[]} args.orderIds — IDs الأوردرات في الـ batch
   * @param {number}   args.amount   — المبلغ الفعلي المُسلَّم من الشركة
   * @param {string}   args.walletId — المحفظة المستلِمة
   * @param {string}   [args.companyName]
   * @param {string}   [args.diffReason]
   * @param {string}   [args.diffReasonLabel]
   * @param {string}   [args.diffNote]
   * @param {boolean}  [args.prepaid] — الشركة دفعتنا قبل التسليم (تكتب shipPrepaid:true)
   */
  async settleFromCompany({
    db, orderIds = [], amount, walletId, walletName = '',
    role, userId, userName,
    companyName = '', diffReason = '', diffReasonLabel = '', diffNote = '',
    prepaid = false, note = '',
  }) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return { ok:false, errors:['⚠️ لم تحدد أوردرات للتسوية'], warnings:[] };
    }
    // G1: idempotency guard — نفس orderIds + walletId + amount + prepaid + minute = no-op
    return withIdempotency(db, {
      actionType: 'settle_from_company',
      entityId: [...orderIds].sort().join(','),
      actorId: userId || '',
      payload: { walletId, amount: Number(amount) || 0, prepaid: !!prepaid },
    }, async (operationId) => {
    // 1) حمّل كل الأوردرات
    const loaded = [];
    for (const id of orderIds) {
      const o = await _loadOrder(db, id);
      if (!o) return { ok:false, errors:[`⚠️ الأوردر ${id} غير موجود`], warnings:[] };
      loaded.push(o);
    }

    // 2) احسب الـ expected الكلي
    const sumExpected = loaded.reduce((s, o) => {
      const c = parseFloat(o.shipCollected) || 0;
      const k = parseFloat(o.shippingCost)  || 0;
      return s + (c - k);
    }, 0);

    // 3) Validate (مع isNoopClose للحالة 0=0)
    const v = validateSettle({
      orders: loaded, amount, expectedAmount: sumExpected,
      walletId, diffReason, diffNote, role,
    });
    if (!v.ok) return { ...v };

    // 4) ابنِ per-order updates
    const build = buildSettlementUpdates({
      orders: loaded,
      actualAmount: parseFloat(amount) || 0,
      userName: userName || '',
      companyName,
      diffReasonLabel,
      diffNote,
    });
    if (!build.ok) return { ...build };

    // 5) جهّز orderUpdates للـ FSE (الـ handler يقرأ totalPaid/remaining/paymentStatus/dueByCo)
    const orderUpdates = build.updates.map(u => {
      const original = loaded.find(o => o._id === u.orderId);
      return {
        orderId: u.orderId,
        totalPaid: u.fields.totalPaid,
        remaining: u.fields.remaining,
        paymentStatus: u.fields.paymentStatus,
        dueByCo: u.share,
        timelineEntry: u.timelineEntry,
        timeline: [...(original?.timeline || []), u.timelineEntry],
      };
    });

    try {
      // 6) FSE event — atomic: wallet + tx + settlement doc + per-order payment fields
      const eventResult = await dispatchFinancialEvent(db, FE.SHIPPING_SETTLEMENT, {
        walletId, walletName,
        amount: parseFloat(amount) || 0,
        companyName,
        orderIds,
        expectedAmount: sumExpected,
        difference: (parseFloat(amount) || 0) - sumExpected,
        diffReason, diffReasonLabel, diffNote,
        note,
        userId: userId || '', userName: userName || '',
        orderUpdates,
        operationId, // PR-7.5 R2 forensic linkage
      });

      // 7) Follow-up batch: shipStage + shipPrepaid + shipSettledAt (الـ handler لا يكتبها)
      const followBatch = writeBatch(db);
      const now = nowStr();
      for (const id of orderIds) {
        followBatch.update(doc(db, 'orders', id), {
          shipStage: 'collected',
          shipSettledAt: now,
          ...(prepaid ? { shipPrepaid: true } : {}),
          updatedAt: serverTimestamp(),
        });
      }
      await followBatch.commit();

      return {
        ok:true, errors:[], warnings:[...(v.warnings || []), ...(build.warnings || [])],
        orderIds, action:'settle_from_company', prepaid, eventResult,
        summary: build.summary,
      };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل تسوية الشركة'], warnings:[], orderIds };
    }
    }); // end withIdempotency
  },

  /**
   * إلغاء تسوية شحن سابقة → SHIPPING_SETTLEMENT_REVERSAL.
   * يُحمِّل الأوردرات داخلياً ويحسب per-order reversal (totalPaid -= shipSettledAmount).
   *
   * @param {Object} [args.settlement] — وثيقة shipping_settlements/{id} كاملة (اختياري لو settlementId موجود)
   * @param {string} [args.settlementId] — أو الـ id مباشرة (الـ action يحمّل الباقي)
   */
  async reverseSettlement({
    db, settlement, settlementId, role, userId, userName, note = '',
  }) {
    const sid0 = (settlement && settlement.id) || settlementId;
    if (!sid0) {
      return { ok:false, errors:['⛔ التسوية غير محددة'], warnings:[] };
    }
    // G1: idempotency — نفس settlementId + actor = no-op
    return withIdempotency(db, {
      actionType: 'reverse_settlement',
      entityId: sid0,
      actorId: userId || '',
      payload: {},
    }, async (operationId) => {
    // 1) حمّل التسوية لو لم تُمرَّر
    let s = settlement;
    const sid = sid0;
    if (!sid) {
      return { ok:false, errors:['⛔ التسوية غير محددة'], warnings:[] };
    }
    if (!s) {
      const snap = await getDoc(doc(db, 'shipping_settlements', sid));
      if (!snap.exists()) {
        return { ok:false, errors:['⛔ التسوية غير موجودة (محذوفة سابقاً؟)'], warnings:[] };
      }
      s = { id: sid, ...snap.data() };
    } else if (!s.id) {
      s = { ...s, id: sid };
    }

    // 2) Validate (مع تحميل أول أوردر كـ context)
    const orderIds = Array.isArray(s.orderIds) ? s.orderIds : [];
    const firstOrder = orderIds[0] ? await _loadOrder(db, orderIds[0]) : null;
    const v = validateReverseSettle({ settlement: s, order: firstOrder, role });
    if (!v.ok) return { ...v };

    // 3) idempotency check: لو settlement reversed بالفعل، ارفض
    if (s.reversed === true) {
      return { ok:false, errors:['⛔ التسوية ملغاة بالفعل'], warnings:[], settlementId: s.id };
    }

    // 4) حمّل كل الأوردرات وابنِ orderUpdates (totalPaid -= shipSettledAmount)
    const orderUpdates = [];
    for (const oid of orderIds) {
      const o = oid === orderIds[0] ? firstOrder : await _loadOrder(db, oid);
      if (!o) continue;
      const settled = parseFloat(o.shipSettledAmount) || 0;
      const oldPaid = parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;
      const newPaid = Math.max(0, oldPaid - settled);
      const sale    = parseFloat(o.salePrice)        || 0;
      const shipFee = o.priceIncludesShipping ? 0 : (parseFloat(o.customerShipFee) || 0);
      const disc    = parseFloat(o.discount)         || 0;
      const newRem  = Math.max(0, sale + shipFee - disc - newPaid);
      orderUpdates.push({
        orderId: oid,
        totalPaid: newPaid,
        remaining: newRem,
        paymentStatus: newRem <= 0.01 ? 'paid' : newPaid > 0 ? 'partial' : 'pending',
      });
    }

    try {
      const eventResult = await dispatchFinancialEvent(db, FE.SHIPPING_SETTLEMENT_REVERSAL, {
        settlementId: s.id,
        walletId: s.walletId,
        walletName: s.walletName || '',
        amount: parseFloat(s.amount) || 0,
        companyName: s.companyName || '',
        orderIds,
        orderUpdates,
        note,
        userId: userId || '', userName: userName || '',
        reversalReason: note || '',
        reversalOperationId: operationId,  // PR-7 G2 audit
      });
      return {
        ok:true, errors:[], warnings:v.warnings,
        settlementId: s.id,
        action:'reverse_settlement',
        orderIds,
        orderUpdates,
        eventResult,
      };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل إلغاء التسوية'], warnings:[] };
    }
    }); // end withIdempotency
  },

  /**
   * تسجيل مرتجع كامل — ATOMIC single-batch operation (RULE F3).
   * يجمع في batch واحد:
   *   1. shipping_returns audit doc
   *   2. order update (shipStage='returned_full', paymentStatus='returned', flags reset)
   *   3. settlement reversal (لو shipSettled=true) — wallet + tx + ledger
   *   4. deposit reversal (لو في deposit/totalPaid مدفوع للأوردر) — wallet + tx + ledger
   *   5. all-collections reversal — يستعلم transactions_v2 (category in [collection,
   *      collection_adjustment]) ويعكس كل tx على محفظتها
   *   6. RETURN_LOSS ledger (لو cost>0)
   *
   * @param {string} args.lossParty — 'client' | 'company' | 'shipper'
   * @param {number} args.cost      — تكلفة الخسارة (لـ RETURN_LOSS)
   * @param {string} [args.companyName] — اسم شركة الشحن (للـ description)
   * @param {string} [args.reasonLabel] — Arabic label للسبب (للـ audit)
   */
  async markFullReturn({
    db, orderId, role, userId, userName,
    reason = '', reasonLabel = '', lossParty = '', cost = 0, note = '',
    companyName = '',
  }) {
    if (!orderId) return { ok:false, errors:['⚠️ orderId مطلوب'], warnings:[] };
    // G1: idempotency — full return لنفس orderId من نفس الـ actor خلال دقيقة = no-op
    return withIdempotency(db, {
      actionType: 'mark_full_return',
      entityId: orderId,
      actorId: userId || '',
      payload: { reason, lossParty, cost: Number(cost) || 0 },
    }, async (operationId) => {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };

    const v = validateReturn({ order, reason, lossParty, cost, returnType: 'full', note, role });
    if (!v.ok) return { ...v, orderId };

    const now = nowStr();
    const lossAmt = parseFloat(cost) || 0;
    const settledAmt = parseFloat(order.shipSettledAmount) || 0;
    const isManualSettled = order.shipSettled && order.shipSettledManual;
    const isRealSettled = order.shipSettled && !isManualSettled;

    try {
      // ── PRE-FETCH (queries لا تعمل داخل writeBatch) ──
      // عربون: مبلغ مدفوع للأوردر باستثناء التسوية
      const totalPaidNow = parseFloat(order.totalPaid) || parseFloat(order.deposit) || 0;
      const depAmt = Math.max(0, totalPaidNow - settledAmt);
      let depWalletId = order.depositWalletId || order.walletId || '';
      if (!depWalletId && depAmt > 0) {
        const depSnap = await getDocs(query(
          collection(db, 'transactions_v2'),
          where('orderId', '==', orderId),
          where('category', '==', 'deposit'),
        ));
        depWalletId = depSnap.docs[0]?.data()?.walletId || '';
      }
      // كل التحصيلات + تعديلاتها لعكسها
      const colSnap = await getDocs(query(
        collection(db, 'transactions_v2'),
        where('orderId', '==', orderId),
        where('category', '==', 'collection'),
      ));
      const adjSnap = await getDocs(query(
        collection(db, 'transactions_v2'),
        where('orderId', '==', orderId),
        where('category', '==', 'collection_adjustment'),
      ));
      const colTxDocs = [...colSnap.docs, ...adjSnap.docs];

      const lossLabel = lossParty === 'client' ? 'العميل'
                      : lossParty === 'company' ? 'الشركة'
                      : 'شركة الشحن';
      const coName = companyName || order.shipCompanyName || '';

      // ── BUILD SINGLE ATOMIC BATCH ──
      const batch = writeBatch(db);

      // 1. shipping_returns audit
      const retRef = doc(collection(db, 'shipping_returns'));
      const fullNote = [reasonLabel, note].filter(Boolean).join(' — ');
      batch.set(retRef, {
        orderId, companyName: coName,
        clientName: order.clientName || '',
        cost: lossAmt, note: fullNote,
        reason, reasonLabel, lossParty,
        returnType: 'full',
        status: 'returned', date: now,
        createdBy: userId || '', createdByName: userName || '',
        createdAt: serverTimestamp(),
      });

      // 2. order update
      batch.update(order._ref, {
        shipStage: 'returned_full',
        paymentStatus: 'returned',
        totalPaid: 0, deposit: 0, remaining: 0,
        ...(order.shipSettled ? { shipSettled: false, shipSettledAmount: 0, shipSettledManual: false } : {}),
        returnReason: reason || '',
        returnLossParty: lossParty,
        returnCost: lossAmt,
        returnNote: note || '',
        returnedAt: now,
        returnedBy: userName || '',
        timeline: [
          ...(order.timeline || []),
          { date: now, action: `↩️ مرتجع من ${coName} — ${reasonLabel || reason || ''} — يتحمل: ${lossLabel}${note ? ' — ' + note : ''}`, by: userName || '', byId: userId || '' },
        ],
        updatedAt: serverTimestamp(),
      });

      // 3. settlement reversal (real settlement = wallet movement happened)
      if (isRealSettled && settledAmt > 0) {
        const settledWId = order.shipSettledWalletId || '';
        if (settledWId) {
          batch.update(doc(db, 'wallets', settledWId), { balance: increment(-settledAmt) });
        }
        const revTxRef = doc(collection(db, 'transactions_v2'));
        batch.set(revTxRef, {
          type: 'out', amount: settledAmt,
          description: `↩️ عكس تسوية مرتجع — ${order.clientName || ''} — ${order.orderId || ''}`,
          category: 'settlement_reversal',
          orderId,
          clientName: order.clientName || '',
          shipCompanyName: coName,
          walletId: settledWId,
          date: now,
          createdBy: userId || '', createdByName: userName || '',
          createdAt: serverTimestamp(),
        });
        addLedgerToBatch(batch, db, 'SHIPPING_SETTLEMENT_REVERSAL', {
          amount: settledAmt,
          walletId: settledWId,
          walletName: '',
          orderId,
          clientName: order.clientName || '',
          notes: `عكس تسوية مرتجع — ${order.clientName || ''} — ${coName}`,
          userId: userId || '', userName: userName || '',
          operationId, // PR-7.5 R2
        });
      } else if (isManualSettled && settledAmt > 0) {
        // Manual settled (لم تمر بمحفظة) → ledger flag-reversal فقط
        addLedgerToBatch(batch, db, 'SHIPPING_SETTLEMENT_REVERSAL', {
          amount: settledAmt,
          walletId: '', walletName: '',
          orderId,
          clientName: order.clientName || '',
          vendorId: '', vendorName: coName,
          notes: `عكس تسوية يدوية (manual) لمرتجع — ${order.clientName || ''} — ${coName}`,
          userId: userId || '', userName: userName || '',
          operationId, // PR-7.5 R2
        });
      }

      // 4. deposit reversal
      if (depAmt > 0 && depWalletId) {
        batch.update(doc(db, 'wallets', depWalletId), { balance: increment(-depAmt) });
        batch.set(doc(collection(db, 'transactions_v2')), {
          type: 'out', amount: depAmt,
          description: `استرداد عربون مرتجع — ${order.clientName || ''}`,
          category: 'deposit_reversal',
          orderId,
          clientName: order.clientName || '',
          walletId: depWalletId,
          date: now,
          createdBy: userId || '', createdByName: userName || '',
          createdAt: serverTimestamp(),
        });
        addLedgerToBatch(batch, db, 'CUSTOMER_REFUND', {
          amount: depAmt,
          walletId: depWalletId, walletName: '',
          orderId,
          clientName: order.clientName || '',
          notes: `استرداد عربون مرتجع — ${order.clientName || ''} — ${coName}`,
          userId: userId || '', userName: userName || '',
          operationId, // PR-7.5 R2
        });
      }

      // 5. all-collections reversal (type-aware للـ collection_adjustment السالب)
      for (const tx of colTxDocs) {
        const d = tx.data();
        const amt = parseFloat(d.amount) || 0;
        const wid = d.walletId;
        if (amt > 0 && wid) {
          const isIn = d.type === 'in';
          batch.update(doc(db, 'wallets', wid), { balance: increment(isIn ? -amt : amt) });
          const rRef = doc(collection(db, 'transactions_v2'));
          batch.set(rRef, {
            type: isIn ? 'out' : 'in', amount: amt,
            description: `↩️ عكس ${d.category === 'collection_adjustment' ? 'تعديل تحصيل' : 'تحصيل'} مرتجع — ${order.clientName || ''} — ${order.orderId || ''}`,
            category: 'collection_reversal',
            orderId,
            clientName: order.clientName || '',
            walletId: wid,
            walletName: d.walletName || '',
            isReversal: true, reversesTxId: tx.id,
            date: now,
            createdBy: userId || '', createdByName: userName || '',
            createdAt: serverTimestamp(),
            ...approvalFields(),
          });
          addLedgerToBatch(batch, db, isIn ? 'CUSTOMER_REFUND' : 'CUSTOMER_PAYMENT', {
            amount: amt,
            walletId: wid, walletName: d.walletName || '',
            orderId,
            clientName: order.clientName || '',
            notes: `عكس ${d.category || 'collection'} (مرتجع) — ${order.clientName || ''} — ${coName}`,
            userId: userId || '', userName: userName || '',
            operationId,            // PR-7.5 R2 — this reversal entry's op
            reversalOf: tx.id,      // points at the original ledger/tx being undone
          });
        }
      }

      // 6. RETURN_LOSS (لو cost>0)
      if (lossAmt > 0) {
        batch.set(doc(collection(db, 'transactions_v2')), {
          type: 'out', amount: lossAmt,
          description: `تكلفة مرتجع — ${order.clientName || ''} — ${coName}`,
          category: 'return_cost',
          orderId,
          clientName: order.clientName || '',
          date: now,
          createdBy: userId || '', createdByName: userName || '',
          createdAt: serverTimestamp(),
        });
        addLedgerToBatch(batch, db, 'RETURN_LOSS', {
          amount: lossAmt,
          walletId: '', walletName: '',
          orderId,
          clientName: order.clientName || '',
          notes: `تكلفة مرتجع — ${order.clientName || ''} — ${coName}`,
          userId: userId || '', userName: userName || '',
          operationId, // PR-7.5 R2
        });
      }

      // ── COMMIT ATOMIC ──
      await batch.commit();

      return {
        ok:true, errors:[], warnings:v.warnings,
        orderId, action:'mark_full_return',
        lossAmount: lossAmt,
        settlementReversed: isRealSettled || isManualSettled,
        settlementReversedAmount: settledAmt,
        depositReversed: depAmt > 0,
        depositReversedAmount: depAmt,
        collectionsReversed: colTxDocs.length,
      };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل تسجيل المرتجع الكامل'], warnings:[], orderId };
    }
    }); // end withIdempotency
  },

  /**
   * تسجيل مرتجع جزئي — ATOMIC single-batch operation (RULE F3).
   * يجمع في batch واحد:
   *   1. shipping_returns audit doc (returnType='partial' + returnedItems)
   *   2. order update: products[] (qty مخفضة)، salePrice، totalPaid، remaining
   *   3. refund للعميل (لو refundFromWallet>0) — wallet + tx + CUSTOMER_REFUND ledger
   *   4. RETURN_LOSS ledger (لو cost>0)
   * الأوردر يبقى نشط (غير terminal) — shipStage='returned_partial'.
   *
   * @param {Array<{prodIdx, name, productId, unitPrice, returnedQty, lineTotal}>} args.returnedItems
   * @param {Object[]} [args.newProducts] — قائمة المنتجات بعد تخفيض الكمية (يحسبها الـ caller)
   * @param {number}   [args.newSale]     — السعر الجديد بعد المرتجع
   * @param {number}   args.refundAmount  — إجمالي المرتجع المالي
   * @param {number}   [args.refundFromWallet] — كم منه يُسترد فعلياً من المحفظة
   * @param {string}   [args.refundWalletId]   — محفظة الاسترداد
   * @param {number}   [args.cost]        — تكلفة الخسارة (للـ RETURN_LOSS)
   * @param {string}   [args.lossParty]
   * @param {string}   [args.companyName]
   */
  async markPartialReturn({
    db, orderId, role, userId, userName,
    returnedItems = [], newProducts = null, newSale = null,
    refundAmount = 0, refundFromWallet = 0, refundWalletId = '', refundWalletName = '',
    cost = 0, lossParty = '', reason = '', reasonLabel = '', note = '',
    companyName = '',
  }) {
    if (!orderId) return { ok:false, errors:['⚠️ orderId مطلوب'], warnings:[] };
    // G1: idempotency — نفس orderId + items + refund signature خلال دقيقة = no-op
    return withIdempotency(db, {
      actionType: 'mark_partial_return',
      entityId: orderId,
      actorId: userId || '',
      payload: {
        items: (returnedItems || []).map(it => `${it.prodIdx ?? it.idx}:${it.returnedQty ?? it.qty}`).sort().join(','),
        refundAmount: Number(refundAmount) || 0,
        refundWalletId,
      },
    }, async (operationId) => {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };

    // Validator يقبل {idx, qty} — نبني shape مبسط من الـ returnedItems الأصلية
    const simpleItems = returnedItems.map(it => ({
      idx: Number(it.prodIdx ?? it.idx),
      qty: Number(it.returnedQty ?? it.qty) || 0,
      reason: it.reason || '',
    }));
    const v = validatePartialReturn({
      order, returnedItems: simpleItems,
      lossCost: cost, lossParty, salePriceDelta: -(parseFloat(refundAmount) || 0),
      role,
    });
    if (!v.ok) return { ...v, orderId };

    const now = nowStr();
    const lossAmt = parseFloat(cost) || 0;
    const refAmt = parseFloat(refundAmount) || 0;
    const refFromWallet = parseFloat(refundFromWallet) || 0;
    const coName = companyName || order.shipCompanyName || '';

    // حسب payment fields الجديدة (لو الـ caller لم يمررها)
    const oldPaid = parseFloat(order.totalPaid) || parseFloat(order.paid) || parseFloat(order.deposit) || 0;
    const newPaid = Math.max(0, oldPaid - refFromWallet);
    const computedNewSale = newSale != null ? Math.max(0, parseFloat(newSale)) : Math.max(0, (parseFloat(order.salePrice) || 0) - refAmt);
    const custFee = parseFloat(order.customerShipFee) || 0;
    const disc = parseFloat(order.discount) || 0;
    const newTotal = Math.max(0, computedNewSale + custFee - disc);
    const newRem = Math.max(0, newTotal - newPaid);
    const paymentStatus = newRem <= 0 ? (newPaid > 0 ? 'paid' : 'pending') : (newPaid > 0 ? 'partial' : 'pending');

    try {
      const batch = writeBatch(db);

      // 1) shipping_returns audit
      const retRef = doc(collection(db, 'shipping_returns'));
      const fullNote = [reasonLabel, note].filter(Boolean).join(' — ');
      batch.set(retRef, {
        orderId, companyName: coName,
        clientName: order.clientName || '',
        cost: lossAmt, note: fullNote,
        reason, reasonLabel, lossParty,
        returnType: 'partial',
        returnedItems,
        refundAmount: refAmt, refundFromWallet: refFromWallet,
        walletId: refundWalletId || '',
        status: 'returned', date: now,
        createdBy: userId || '', createdByName: userName || '',
        createdAt: serverTimestamp(),
      });

      // 2) order update — يفضل نشط
      const lossLabel = lossParty === 'client' ? 'العميل'
                      : lossParty === 'company' ? 'الشركة'
                      : 'شركة الشحن';
      const orderUpdateFields = {
        salePrice: computedNewSale,
        totalPaid: newPaid,
        remaining: newRem,
        paymentStatus,
        shipStage: 'returned_partial',
        timeline: [
          ...(order.timeline || []),
          { date: now, action: `↩️ مرتجع جزئي (${returnedItems.length} منتج · ${refAmt.toLocaleString('ar-EG')} ج) — ${reasonLabel || reason || ''} — ${lossLabel}${note ? ' — ' + note : ''}`, by: userName || '', byId: userId || '' },
        ],
        updatedAt: serverTimestamp(),
      };
      if (Array.isArray(newProducts)) orderUpdateFields.products = newProducts;
      batch.update(order._ref, orderUpdateFields);

      // 3) refund للعميل (لو refundFromWallet > 0)
      if (refFromWallet > 0 && refundWalletId) {
        batch.update(doc(db, 'wallets', refundWalletId), { balance: increment(-refFromWallet) });
        batch.set(doc(collection(db, 'transactions_v2')), {
          type: 'out', amount: refFromWallet,
          description: `استرداد مرتجع جزئي — ${order.clientName || ''}`,
          category: 'partial_return_refund',
          orderId,
          clientName: order.clientName || '',
          walletId: refundWalletId, walletName: refundWalletName || '',
          date: now,
          createdBy: userId || '', createdByName: userName || '',
          createdAt: serverTimestamp(),
          ...approvalFields(),
        });
        addLedgerToBatch(batch, db, 'CUSTOMER_REFUND', {
          amount: refFromWallet,
          walletId: refundWalletId, walletName: refundWalletName || '',
          orderId,
          clientName: order.clientName || '',
          notes: `استرداد مرتجع جزئي — ${order.clientName || ''}`,
          userId: userId || '', userName: userName || '',
          operationId, // PR-7.5 R2
        });
      }

      // 4) RETURN_LOSS (لو cost>0)
      if (lossAmt > 0) {
        addLedgerToBatch(batch, db, 'RETURN_LOSS', {
          amount: lossAmt,
          walletId: '', walletName: '',
          orderId,
          clientName: order.clientName || '',
          notes: `تكلفة مرتجع جزئي — ${returnedItems.length} منتج`,
          userId: userId || '', userName: userName || '',
          operationId, // PR-7.5 R2
        });
      }

      await batch.commit();

      return {
        ok:true, errors:[], warnings:v.warnings,
        orderId, action:'mark_partial_return',
        itemsCount: returnedItems.length,
        refundAmount: refAmt,
        refundFromWallet: refFromWallet,
        lossAmount: lossAmt,
        newSalePrice: computedNewSale,
      };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل تسجيل المرتجع الجزئي'], warnings:[], orderId };
    }
    }); // end withIdempotency
  },

  /**
   * تسوية يدوية (manual) — لم تمر بمحفظة، الفلوس وصلت من بره النظام.
   * يضع shipSettled=true + shipSettledManual=true + audit entry + ledger
   * (amount شكلي للـ audit، لا حركة على wallet).
   *
   * Atomic single batch (RULE F3).
   */
  async manualSettle({ db, orderId, role, userId, userName, reason = '' }) {
    if (!orderId) return { ok:false, errors:['⚠️ orderId مطلوب'], warnings:[] };
    // G1: idempotency — نفس orderId + actor + reason-hash خلال دقيقة = no-op
    return withIdempotency(db, {
      actionType: 'manual_settle',
      entityId: orderId,
      actorId: userId || '',
      payload: { reasonLen: (reason || '').length },
    }, async (operationId) => {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };
    if (order.stage === 'archived')  return { ok:false, errors:['⛔ الأوردر مؤرشف'], warnings:[], orderId };
    if (order.stage === 'cancelled') return { ok:false, errors:['⛔ الأوردر ملغي'], warnings:[], orderId };
    if (order.shipSettled === true)  return { ok:false, errors:['✅ مسوّى بالفعل'], warnings:[], orderId };
    const r = (reason || '').trim();
    if (r.length < 5)                return { ok:false, errors:['⚠️ السبب لازم ≥ 5 أحرف'], warnings:[], orderId };

    const now = nowStr();
    const sale     = parseFloat(order.salePrice)        || 0;
    const cust     = order.priceIncludesShipping ? 0 : (parseFloat(order.customerShipFee) || 0);
    const disc     = parseFloat(order.discount)         || 0;
    const totalDue = Math.max(0, sale + cust - disc);
    const paid     = parseFloat(order.totalPaid) || parseFloat(order.paid) || parseFloat(order.deposit) || 0;
    const needsTotalPaidUpdate = paid + 0.01 < totalDue;
    const newTotalPaid = needsTotalPaidUpdate ? totalDue : paid;
    const newRemaining = Math.max(0, totalDue - newTotalPaid);
    const ledgerAmt = Math.max(totalDue, paid);

    const auditEntry = {
      type: 'manual_settle',
      changedBy: userName || '', changedById: userId || '',
      date: now, reason: r,
      changes: [{ field: 'shipSettled', label: 'تسوية شركة الشحن', before: 'false', after: 'true (يدوي)' }],
      requiresReview: true,
    };

    try {
      const batch = writeBatch(db);
      batch.update(order._ref, {
        shipSettled: true,
        shipSettledAmount: ledgerAmt,
        shipSettledManual: true,
        shipSettledManualBy: userName || '',
        shipSettledManualByUid: userId || '',
        shipSettledManualAt: now,
        shipSettledManualReason: r,
        ...(needsTotalPaidUpdate ? {
          totalPaid: newTotalPaid,
          remaining: newRemaining,
          paymentStatus: 'paid',
        } : {}),
        auditLog: [...(order.auditLog || []), auditEntry],
        hasUnreviewedAudit: true,
        timeline: [
          ...(order.timeline || []),
          { date: now, action: `🏁 تسوية يدوية (مسوّى من بره النظام) — ${r}${needsTotalPaidUpdate ? ` · ضبط المحصّل ${paid.toLocaleString('ar-EG')} → ${newTotalPaid.toLocaleString('ar-EG')} ج` : ''}`, by: userName || '', byId: userId || '' },
        ],
        updatedAt: serverTimestamp(),
      });
      addLedgerToBatch(batch, db, 'SHIPPING_SETTLEMENT', {
        amount: ledgerAmt,
        walletId: '', walletName: '',
        orderId,
        clientId: order.clientId || '', clientName: order.clientName || '',
        vendorId: '', vendorName: order.shipCompanyName || '',
        notes: `🏁 تسوية يدوية (manual): ${r}${needsTotalPaidUpdate ? ` · totalPaid ${paid}→${newTotalPaid}` : ''}`,
        userId: userId || '', userName: userName || '',
        operationId, // PR-7.5 R2
      });
      await batch.commit();
      return {
        ok:true, errors:[], warnings:[],
        orderId, action:'manual_settle',
        totalPaidAdjusted: needsTotalPaidUpdate,
        newTotalPaid,
      };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل التسوية اليدوية'], warnings:[], orderId };
    }
    }); // end withIdempotency
  },

  /**
   * تعديل تكلفة الشحن (shipCost) و رسوم العميل (customerShipFee) على أوردر نشط.
   * لو في delta على shipCost → ينشئ adjustment tx + SHIPPING_EXPENSE ledger.
   * يعيد حساب remaining + paymentStatus.
   *
   * Atomic single batch.
   */
  async editShipFee({
    db, orderId, role, userId, userName,
    newShipCost, newCustomerShipFee,
  }) {
    if (!orderId) return { ok:false, errors:['⚠️ orderId مطلوب'], warnings:[] };
    return withIdempotency(db, {
      actionType: 'edit_ship_fee',
      entityId: orderId,
      actorId: userId || '',
      payload: { newShipCost: Number(newShipCost) || 0, newCustomerShipFee: Number(newCustomerShipFee) || 0 },
    }, async (operationId) => {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };
    if (order.stage === 'archived')        return { ok:false, errors:['⛔ الأوردر مؤرشف — لا يمكن تعديله'], warnings:[], orderId };
    if (normalizeShipStage(order.shipStage) === 'returned_full') return { ok:false, errors:['⛔ الأوردر مرتجع — لا يمكن تعديله'], warnings:[], orderId };

    const oldCost = parseFloat(order.shipCost) || 0;
    const oldCust = parseFloat(order.customerShipFee) || 0;
    const newCost = parseFloat(newShipCost);
    const newCust = parseFloat(newCustomerShipFee);
    if (!Number.isFinite(newCost) || newCost < 0) return { ok:false, errors:['⚠️ تكلفة الشحن غير صالحة'], warnings:[], orderId };
    if (!Number.isFinite(newCust) || newCust < 0) return { ok:false, errors:['⚠️ رسوم العميل غير صالحة'], warnings:[], orderId };

    const sale = parseFloat(order.salePrice) || 0;
    const disc = parseFloat(order.discount)  || 0;
    const paid = parseFloat(order.totalPaid) || parseFloat(order.paid) || parseFloat(order.deposit) || 0;
    const newDue = Math.max(0, sale + newCust - disc);
    if (paid > newDue + 0.01) {
      return { ok:false, errors:[`⛔ رسوم الشحن الجديدة تجعل الإجمالي (${newDue}) أقل من المحصّل (${paid}). عدّل التحصيل أولاً.`], warnings:[], orderId };
    }
    const newRem = Math.max(0, newDue - paid);
    const costDelta = newCost - oldCost;
    const now = nowStr();

    try {
      const batch = writeBatch(db);
      if (costDelta !== 0) {
        batch.set(doc(collection(db, 'transactions_v2')), {
          type: costDelta > 0 ? 'out' : 'in',
          amount: Math.abs(costDelta),
          description: `تعديل تكلفة الشحن (${costDelta > 0 ? '+' : '-'}${Math.abs(costDelta).toLocaleString('ar-EG')} ج) — ${order.clientName || ''} — ${order.shipCompanyName || ''}`,
          category: costDelta > 0 ? 'shipping_cost' : 'shipping_cost_reversal',
          orderId,
          clientName: order.clientName || '',
          walletId: '',
          date: now,
          createdBy: userId || '', createdByName: userName || '',
          createdAt: serverTimestamp(),
          ...approvalFields(),
        });
        addLedgerToBatch(batch, db, 'SHIPPING_EXPENSE', {
          amount: Math.abs(costDelta),
          walletId: '', walletName: '',
          orderId,
          clientId: order.clientId || '', clientName: order.clientName || '',
          notes: `تعديل تكلفة شحن (${costDelta > 0 ? '+' : '-'}${Math.abs(costDelta).toLocaleString('ar-EG')} ج) — ${order.shipCompanyName || ''}`,
          userId: userId || '', userName: userName || '',
          direction: costDelta > 0 ? 'out' : 'in',
          operationId, // PR-7.5 R2
        });
      }
      const tlAction = `✏️ تعديل شحن: ${oldCost !== newCost ? `تكلفة ${oldCost}→${newCost} ج` : ''}${oldCost !== newCost && oldCust !== newCust ? ' · ' : ''}${oldCust !== newCust ? `رسوم العميل ${oldCust}→${newCust} ج` : ''}`;
      batch.update(order._ref, {
        shipCost: newCost,
        customerShipFee: newCust,
        remaining: newRem,
        paymentStatus: newRem <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending',
        timeline: [...(order.timeline || []), { date: now, action: tlAction, by: userName || '', byId: userId || '' }],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { ok:true, errors:[], warnings:[], orderId, action:'edit_ship_fee', costDelta };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل تعديل رسوم الشحن'], warnings:[], orderId };
    }
    }); // end withIdempotency
  },

  /**
   * إضافة/تعديل بند تكلفة على الأوردر (costItems).
   * لو إضافة جديدة (مش edit) → ينشئ tx execution_cost + GENERAL_EXPENSE ledger.
   *
   * @param {string} [args.editIdx] — لو موجود، يعدّل البند بدلاً من إضافته
   */
  async addOrderCost({
    db, orderId, role, userId, userName,
    type = '', total = 0, note = '', supplierId = '', supplierName = '',
    editIdx = -1, prodIdx = null,
  }) {
    if (!orderId) return { ok:false, errors:['⚠️ orderId مطلوب'], warnings:[] };
    return withIdempotency(db, {
      actionType: 'add_order_cost',
      entityId: orderId,
      actorId: userId || '',
      payload: { type, total: Number(total) || 0, editIdx: Number(editIdx) },
    }, async (operationId) => {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };
    if (!type)   return { ok:false, errors:['⚠️ اختر نوع البند'], warnings:[], orderId };
    const amt = parseFloat(total) || 0;
    if (amt <= 0) return { ok:false, errors:['⚠️ أدخل التكلفة'], warnings:[], orderId };

    const now = nowStr();
    const isEdit = editIdx >= 0 && editIdx < (order.costItems || []).length;
    const txRef = isEdit ? null : doc(collection(db, 'transactions_v2'));
    const newItem = {
      type, total: amt, note,
      addedAt: now, addedBy: userName || '',
      supplierId, supplierName,
      prodIdx,
      ...(txRef ? { txId: txRef.id } : {}),
    };
    const ci = [...(order.costItems || [])];
    let actionText;
    if (isEdit) {
      ci[editIdx] = { ...ci[editIdx], ...newItem, editedAt: now };
      actionText = `✏️ تعديل ${type}: ${amt.toLocaleString('ar-EG')} ج`;
    } else {
      ci.push(newItem);
      actionText = `💰 ${type}: ${amt.toLocaleString('ar-EG')} ج`;
    }

    try {
      const batch = writeBatch(db);
      batch.update(order._ref, {
        costItems: ci,
        timeline: [...(order.timeline || []), { date: now, action: actionText, by: userName || '', byId: userId || '' }],
        updatedAt: serverTimestamp(),
      });
      if (txRef) {
        batch.set(txRef, {
          type: 'out', amount: amt, category: 'execution_cost',
          description: `تكلفة ${type} — ${order.clientName || ''} — ${order.orderId || ''}`,
          orderId,
          clientName: order.clientName || '',
          walletId: '',
          date: now,
          createdBy: userId || '', createdByName: userName || '',
          createdAt: serverTimestamp(),
        });
        addLedgerToBatch(batch, db, 'GENERAL_EXPENSE', {
          amount: amt,
          walletId: '', walletName: '',
          orderId,
          clientId: order.clientId || '', clientName: order.clientName || '',
          notes: `تكلفة ${type} — ${order.clientName || ''} — ${order.orderId || ''}`,
          userId: userId || '', userName: userName || '',
          operationId, // PR-7.5 R2
        });
      }
      await batch.commit();
      return { ok:true, errors:[], warnings:[], orderId, action: isEdit ? 'edit_cost_item' : 'add_cost_item', costItems: ci };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل حفظ البند'], warnings:[], orderId };
    }
    }); // end withIdempotency
  },

  /**
   * حذف بند تكلفة من الأوردر. ينشئ ledger entry للعكس (direction='in' للـ refund).
   * لا يحذف tx الأصلية من Firestore (نتركها للـ audit، الـ ledger بيوضّح أنها انعكست).
   *
   * NOTE: behavior الحالي في الصفحة يستخدم batch.delete على tx — هنا نسجّل ledger
   * counter-entry بدل المسح، يقترب من RULE F2 (append-only) لكن بدون كسر الـ
   * legacy data (الـ tx القديمة تبقى موجودة كـ historical record).
   */
  async removeOrderCost({
    db, orderId, role, userId, userName, idx,
  }) {
    if (!orderId) return { ok:false, errors:['⚠️ orderId مطلوب'], warnings:[] };
    return withIdempotency(db, {
      actionType: 'remove_order_cost',
      entityId: orderId,
      actorId: userId || '',
      payload: { idx: Number(idx) },
    }, async (operationId) => {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };
    const items = order.costItems || [];
    if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) {
      return { ok:false, errors:['⚠️ فهرس بند غير صالح'], warnings:[], orderId };
    }
    const item = items[idx];
    const amt = parseFloat(item.total) || 0;
    const ci = [...items]; ci.splice(idx, 1);
    const now = nowStr();

    try {
      const batch = writeBatch(db);
      batch.update(order._ref, {
        costItems: ci,
        timeline: [...(order.timeline || []), { date: now, action: `🗑️ حذف بند ${item.type || ''} (${amt.toLocaleString('ar-EG')} ج)`, by: userName || '', byId: userId || '' }],
        updatedAt: serverTimestamp(),
      });
      // append-only: counter-ledger بدل deleteDoc على الـ tx
      addLedgerToBatch(batch, db, 'GENERAL_EXPENSE', {
        amount: amt,
        walletId: '', walletName: '',
        orderId,
        clientId: order.clientId || '', clientName: order.clientName || '',
        notes: `إلغاء تكلفة ${item.type || ''} — ${order.clientName || ''}`,
        userId: userId || '', userName: userName || '',
        direction: 'in',
        operationId,                         // PR-7.5 R2
        reversalOf: item.txId || null,       // counter-ledger يشير لـ tx الأصلية
      });
      await batch.commit();
      return { ok:true, errors:[], warnings:[], orderId, action:'remove_cost_item', costItems: ci, removedItem: item };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل حذف البند'], warnings:[], orderId };
    }
    }); // end withIdempotency
  },

  /**
   * إغلاق الشحنة → stage='archived' + shipStage='closed'.
   * wrapper مبسّط حول archiveOrder({source:'shipping'}).
   */
  async closeShipment({ db, orderId, role, userId, userName, reason = '', bypassWarnings = false }) {
    // archiveOrder يستخدم buildArchiveSpec — نضيف shipStage='closed' كـ extraFields
    return this.archiveOrder({
      db, orderId, role, userId, userName,
      source: 'shipping',
      reason,
      bypassWarnings,
      extraFields: { shipStage: 'closed' },
    });
  },

};

// ══════════════════════════════════════════
// DEFAULT EXPORT (للتوافق مع import default)
// ══════════════════════════════════════════
export default orderActions;
