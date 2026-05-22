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

import { runTransaction, doc, getDoc, writeBatch, serverTimestamp }
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
import { dispatchFinancialEvent, FE } from './financial-sync-engine.js';

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
  },

  /**
   * إلغاء تسوية شحن سابقة → SHIPPING_SETTLEMENT_REVERSAL.
   *
   * @param {Object} args.settlement — وثيقة shipping_settlements/{id} كاملة
   * @param {Object[]} [args.orderUpdates] — overrides لبعض الحقول على الأوردرات
   */
  async reverseSettlement({
    db, settlement, role, userId, userName,
    orderUpdates = [], note = '',
  }) {
    if (!settlement || !settlement.id) {
      return { ok:false, errors:['⛔ التسوية غير محددة'], warnings:[] };
    }

    // حمّل أول أوردر كـ context للـ validator
    const firstOrderId = (settlement.orderIds || [])[0];
    const ctxOrder = firstOrderId ? await _loadOrder(db, firstOrderId) : null;

    const v = validateReverseSettle({ settlement, order: ctxOrder, role });
    if (!v.ok) return { ...v };

    try {
      const eventResult = await dispatchFinancialEvent(db, FE.SHIPPING_SETTLEMENT_REVERSAL, {
        settlementId: settlement.id,
        walletId: settlement.walletId,
        walletName: settlement.walletName || '',
        amount: parseFloat(settlement.amount) || 0,
        companyName: settlement.companyName || '',
        orderIds: settlement.orderIds || [],
        orderUpdates,
        note,
        userId: userId || '', userName: userName || '',
      });
      return {
        ok:true, errors:[], warnings:v.warnings,
        settlementId: settlement.id,
        action:'reverse_settlement', eventResult,
      };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل إلغاء التسوية'], warnings:[] };
    }
  },

  /**
   * تسجيل مرتجع كامل → RETURN_LOSS (+ optional CUSTOMER_REFUND, SHIPPING_SETTLEMENT_REVERSAL).
   * يضع shipStage='returned_full' (terminal).
   *
   * @param {string} args.lossParty — 'client' | 'company' | 'shipper'
   * @param {number} args.cost      — تكلفة الخسارة
   * @param {string} [args.walletId] — للـ RETURN_LOSS
   * @param {string} [args.refundAmount] — لو نسترد للعميل
   * @param {string} [args.refundWalletId] — محفظة الاسترداد
   */
  async markFullReturn({
    db, orderId, role, userId, userName,
    reason = '', lossParty = '', cost = 0, note = '',
    walletId = '', walletName = '',
    refundAmount = 0, refundWalletId = '', refundWalletName = '',
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };

    const v = validateReturn({ order, reason, lossParty, cost, returnType: 'full', note, role });
    if (!v.ok) return { ...v, orderId };

    const now = nowStr();
    const lossAmt = parseFloat(cost) || 0;
    const refAmt = parseFloat(refundAmount) || 0;

    try {
      // 1) خسارة المرتجع (لو cost>0 و walletId)
      if (lossAmt > 0 && walletId) {
        await dispatchFinancialEvent(db, FE.RETURN_LOSS, {
          orderId,
          amount: lossAmt,
          walletId, walletName,
          clientId: order.clientId || '', clientName: order.clientName || '',
          note: `خسارة مرتجع — ${reason || ''}`,
          userId: userId || '', userName: userName || '',
        });
      }

      // 2) استرداد العميل (لو refundAmount>0)
      if (refAmt > 0 && refundWalletId) {
        await dispatchFinancialEvent(db, FE.CUSTOMER_REFUND, {
          orderId,
          clientId: order.clientId || '', clientName: order.clientName || '',
          walletId: refundWalletId, walletName: refundWalletName,
          amount: refAmt,
          orderData: {
            totalPaid: parseFloat(order.totalPaid) || 0,
            salePrice: parseFloat(order.salePrice) || 0,
            discount: parseFloat(order.discount) || 0,
            customerShipFee: parseFloat(order.customerShipFee) || 0,
          },
          note: `استرداد مرتجع — ${reason || ''}`,
          userId: userId || '', userName: userName || '',
        });
      }

      // 3) update الأوردر — shipStage='returned_full' + paymentStatus='returned'
      const batch = writeBatch(db);
      batch.update(order._ref, {
        shipStage: 'returned_full',
        paymentStatus: 'returned',
        returnReason: reason || '',
        returnLossParty: lossParty,
        returnCost: lossAmt,
        returnRefundAmount: refAmt,
        returnNote: note || '',
        returnedAt: now,
        returnedBy: userName || '',
        timeline: [
          ...(order.timeline || []),
          {
            date: now,
            action: `↩️ مرتجع كامل — ${reason || ''} — خسارة ${lossAmt.toLocaleString('ar-EG')} ج على ${lossParty}${refAmt > 0 ? ` — استرداد ${refAmt.toLocaleString('ar-EG')} ج` : ''}`,
            by: userName || '', byId: userId || '',
          },
        ],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      return {
        ok:true, errors:[], warnings:v.warnings,
        orderId, action:'mark_full_return',
        lossAmount: lossAmt, refundAmount: refAmt,
      };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل تسجيل المرتجع الكامل'], warnings:[], orderId };
    }
  },

  /**
   * تسجيل مرتجع جزئي → RETURN_LOSS (+ optional salePrice delta).
   * يضع shipStage='returned_partial' (غير terminal — الأوردر يكمل على الباقي).
   *
   * @param {Array<{idx, qty, reason?}>} args.returnedItems
   * @param {number} args.lossCost
   * @param {string} args.lossParty
   * @param {number} [args.salePriceDelta] — مقدار خصم السعر (سالب)
   */
  async markPartialReturn({
    db, orderId, role, userId, userName,
    returnedItems = [], lossCost = 0, lossParty = '', salePriceDelta = 0,
    walletId = '', walletName = '', note = '',
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok:false, errors:['الأوردر غير موجود'], warnings:[], orderId };

    const v = validatePartialReturn({
      order, returnedItems, lossCost, lossParty, salePriceDelta, role,
    });
    if (!v.ok) return { ...v, orderId };

    const now = nowStr();
    const lossAmt = parseFloat(lossCost) || 0;
    const delta = parseFloat(salePriceDelta) || 0;

    try {
      // 1) خسارة المرتجع الجزئي (لو cost>0)
      if (lossAmt > 0 && walletId) {
        await dispatchFinancialEvent(db, FE.RETURN_LOSS, {
          orderId,
          amount: lossAmt,
          walletId, walletName,
          clientId: order.clientId || '', clientName: order.clientName || '',
          note: `خسارة مرتجع جزئي — ${returnedItems.length} منتج`,
          userId: userId || '', userName: userName || '',
        });
      }

      // 2) update الأوردر — shipStage='returned_partial' + cumulative returnedItems + salePrice adjust
      const oldSale = parseFloat(order.salePrice) || 0;
      const newSale = Math.max(0, oldSale + delta); // delta عادة سالبة
      const oldItems = Array.isArray(order.returnedItems) ? order.returnedItems : [];
      const mergedItems = [...oldItems, ...returnedItems.map(it => ({
        idx: Number(it.idx),
        qty: Number(it.qty) || 0,
        reason: it.reason || '',
        at: now,
      }))];
      const oldPartialLoss = parseFloat(order.partialReturnLoss) || 0;

      const batch = writeBatch(db);
      batch.update(order._ref, {
        shipStage: 'returned_partial',
        salePrice: newSale,
        returnedItems: mergedItems,
        partialReturnLoss: oldPartialLoss + lossAmt,
        timeline: [
          ...(order.timeline || []),
          {
            date: now,
            action: `↩️ مرتجع جزئي — ${returnedItems.length} منتج — خسارة ${lossAmt.toLocaleString('ar-EG')} ج${delta !== 0 ? ` — تعديل السعر ${delta.toLocaleString('ar-EG')} ج` : ''}${note ? ' — ' + note : ''}`,
            by: userName || '', byId: userId || '',
          },
        ],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      return {
        ok:true, errors:[], warnings:v.warnings,
        orderId, action:'mark_partial_return',
        itemsCount: returnedItems.length, lossAmount: lossAmt, salePriceDelta: delta,
        newSalePrice: newSale,
      };
    } catch (e) {
      return { ok:false, errors:[e.message || 'فشل تسجيل المرتجع الجزئي'], warnings:[], orderId };
    }
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
