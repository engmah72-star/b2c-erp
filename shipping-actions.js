/**
 * Business2Card ERP — shipping-actions.js
 *
 * ━━━ CENTRAL SHIPPING ACTIONS LAYER (RULE A1 + L1) ━━━
 *
 * طبقة الأفعال المركزية للشحن. كل عملية شحن تمر من هنا.
 *
 * الصفحات لا تكتب على Firestore مباشرة — تنادي action واحد:
 *   await shippingActions.dispatchOrder({ db, orderId, companyId, method, cost, walletId, ... });
 *   if (!result.ok) toast(result.errors[0], 'err');
 *
 * كل action:
 *   1. يحمّل الأوردر من Firestore
 *   2. يستدعي validator (orders.js) — يرجع errors/warnings
 *   3. يكتب ذرّياً عبر writeBatch أو dispatchFinancialEvent (FSE)
 *   4. يُضيف timeline entry للـ audit
 *   5. يُرجع { ok, errors, warnings, orderId, ... }
 *
 * الأفعال المتاحة:
 *   - dispatchOrder       : تسليم لشركة شحن (company/pickup/courier)
 *   - quickPickupDispatch : استلام من المطبعة بضغطة واحدة
 *   - markDelivered       : تسليم → بانتظار التحصيل
 *   - collectFromCustomer : تحصيل مباشر (pickup/courier) → محفظة
 *   - markCompanyCollected: تأكيد التحصيل لشركة شحن (marker فقط)
 *   - settleWithCompany   : تسوية مع شركة الشحن (فردي أو جماعي)
 *   - reverseSettlement   : إلغاء تسوية
 *   - registerReturn      : تسجيل مرتجع
 */

import {
  doc, getDoc, updateDoc, writeBatch, increment,
  serverTimestamp, collection,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  validateDispatch, validateCollect, validateCompanyCollect,
  validateSettle, validateReturn, buildSettlementUpdates, nowStr,
  // PR-2 (scalable-drifting-ember) validators:
  validatePrepareShipping, validateMarkDelivered,
  validatePartialReturn, validateReverseSettle,
  // PR-1 helper:
  normalizeShipStage,
  // Phase 2 / B6 — block reversal on archived orders:
  ORDER_STAGES,
  // role gate لتعديل تكلفة الشحن (editShippingCost):
  SHIPPING_DISPATCH_ROLES,
} from './orders.js';
import {
  dispatchFinancialEvent, addLedgerToBatch, approvalFields, FE,
} from './financial-sync-engine.js';
import { orderActions } from './order-actions.js';
import { withIdempotency } from './core/idempotency.js'; // PR-7-salvage G1

// ══════════════════════════════════════════
// INTERNAL HELPERS
// ══════════════════════════════════════════

async function _loadOrder(db, orderId) {
  if (!db || !orderId) return null;
  const ref = doc(db, 'orders', orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { ...snap.data(), _id: orderId, _ref: ref };
}

function _ts() {
  return new Date().toLocaleDateString('ar-EG') + ' ' +
    new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function _tlEntry(action, userName, userId) {
  return { date: _ts(), action, by: userName || 'system', byId: userId || '' };
}

// ══════════════════════════════════════════
// CENTRAL SHIPPING ACTIONS
// ══════════════════════════════════════════

export const shippingActions = {

  /**
   * تسليم الأوردر لشركة شحن أو تسجيل طريقة الشحن.
   * يحدث shipMethod, shipCompanyId/Name, shippingCost, shipStage, shipDispatchedAt
   * + يسجل SHIPPING_EXPENSE لو cost>0 وwalletId موجود.
   */
  async dispatchOrder({
    db, orderId,
    companyId = '', companyName = '',
    method, cost = 0, walletId = '', walletName = '',
    note = '',
    deliveryAddress = null, customerPhoneShip = '',
    role, userId, userName,
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    // PR-7-salvage G1: idempotency — dispatch may issue SHIPPING_EXPENSE
    return withIdempotency(db, {
      actionType: 'dispatch_order',
      entityId: orderId,
      actorId: userId || '',
      payload: { companyId, method, cost: Number(cost) || 0, walletId },
    }, async (operationId) => {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const v = validateDispatch({ order, companyId, method, cost, walletId, role });
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, orderId };

    const amt = parseFloat(cost) || 0;
    const newShipStage = method === 'pickup' ? 'ready' : 'wait_delivery';
    const actionLabel = method === 'pickup'
      ? '🏬 جاهز للاستلام من المطبعة'
      : `🚚 تسليم لشركة شحن — ${companyName || ''}${amt > 0 ? ` (تكلفة: ${amt} ج)` : ''}`;

    // العنوان: لو اتمرّر عنوان جديد (لأن الأوردر مفيهوش عنوان مُسجَّل من
    // مرحلة الطباعة) نكتبه على الأوردر. اختياري وbackward-compatible —
    // pickup لا يحتاج عنوان، والأوردرات اللي ليها عنوان مسبقاً لا تتأثر.
    const addrProvided = method !== 'pickup' && deliveryAddress
      && typeof deliveryAddress === 'object' && (deliveryAddress.gov || deliveryAddress.street || deliveryAddress.city);

    const orderFields = {
      shipCompanyId: companyId || '',
      shipCompanyName: companyName || '',
      shipMethod: method,
      shippingCost: amt,
      shipStage: newShipStage,
      shipDispatchedAt: serverTimestamp(),
      shipDispatchedBy: userName || '',
      shipDispatchedById: userId || '',
      ...(addrProvided ? { deliveryAddress } : {}),
      ...(customerPhoneShip ? { customerPhoneShip } : {}),
      timeline: [...(order.timeline || []), _tlEntry(
        actionLabel + (addrProvided ? ` — 📍 ${deliveryAddress.gov || ''}` : ''),
        userName, userId
      )],
    };

    try {
      if (amt > 0 && walletId) {
        // Atomic path: ledger + wallet + order update via FSE
        await dispatchFinancialEvent(db, FE.SHIPPING_EXPENSE, {
          walletId, walletName,
          amount: amt,
          description: `تكلفة شحن — طلب #${order.orderNumber || orderId.slice(0, 6)} — ${companyName || ''}`,
          note: note || '',
          orderId, orderNumber: order.orderNumber || '',
          vendorId: companyId, vendorName: companyName,
          userId: userId || '', userName: userName || '',
          date: new Date().toLocaleDateString('ar-EG'),
          orderUpdate: { orderId, fields: orderFields },
          operationId, // PR-7-salvage R2 forensic linkage
        });
      } else {
        // No expense — single update
        await updateDoc(order._ref, { ...orderFields, updatedAt: serverTimestamp() });
      }

      return {
        ok: true, errors: [], warnings: v.warnings,
        orderId, action: 'dispatch', method, newShipStage,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التسليم'], warnings: [], orderId };
    }
    }); // end withIdempotency
  },

  /**
   * استلام من المطبعة بضغطة واحدة (بدون modal/form).
   */
  async quickPickupDispatch({ db, orderId, role, userId, userName }) {
    return shippingActions.dispatchOrder({
      db, orderId, method: 'pickup', cost: 0, walletId: '',
      role, userId, userName,
    });
  },

  /**
   * تسجيل تسليم الأوردر للعميل (wait_delivery → wait_collection).
   * بدون أي حدث مالي.
   */
  async markDelivered({ db, orderId, role, userId, userName }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };
    if (order.stage === 'archived') return { ok: false, errors: ['الأوردر مؤرشف'], warnings: [], orderId };
    if (order.shipStage === 'returned') return { ok: false, errors: ['الأوردر مرتجع'], warnings: [], orderId };
    if ((order.shipStage || 'ready') !== 'wait_delivery') {
      return { ok: false, errors: ['الأوردر ليس في حالة "في الطريق"'], warnings: [], orderId };
    }
    try {
      const batch = writeBatch(db);
      batch.update(order._ref, {
        shipStage: 'wait_collection',
        deliveredAt: serverTimestamp(),
        deliveredBy: userName || '',
        timeline: [...(order.timeline || []), _tlEntry('✅ تم التسليم للعميل — بانتظار التحصيل', userName, userId)],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { ok: true, errors: [], warnings: [], orderId, action: 'mark_delivered' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل تسجيل التسليم'], warnings: [], orderId };
    }
  },

  /**
   * تحصيل مبلغ من العميل مباشرة (pickup/courier/internal).
   * يدخل المحفظة فوراً عبر CUSTOMER_PAYMENT في FSE.
   */
  async collectFromCustomer({
    db, orderId, amount, walletId, walletName = '',
    note = '', role, userId, userName,
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    // PR-7-salvage G1: idempotency
    return withIdempotency(db, {
      actionType: 'collect_from_customer',
      entityId: orderId,
      actorId: userId || '',
      payload: { walletId, amount: Number(amount) || 0 },
    }, async (operationId) => {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const amt = parseFloat(amount) || 0;
    const sale = parseFloat(order.salePrice) || 0;
    const cust = parseFloat(order.customerShipFee) || 0;
    const disc = parseFloat(order.discount) || 0;
    const paid = parseFloat(order.totalPaid) || parseFloat(order.deposit) || 0;
    const totalDue = Math.max(0, sale + cust - disc);
    const remaining = Math.max(0, totalDue - paid);
    const newPaid = paid + amt;
    const newRem = Math.max(0, totalDue - newPaid);

    const v = validateCollect({ order, amount: amt, walletId, remaining, role });
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, orderId };

    const curSS = order.shipStage || 'ready';
    const autoCollected = newRem <= 0.01 && curSS === 'wait_collection';

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'wallets', walletId), { balance: increment(amt) });

      const txRef = doc(collection(db, 'transactions_v2'));
      batch.set(txRef, {
        walletId, walletName: walletName || '',
        type: 'in', amount: amt,
        description: `تحصيل شحن — ${order.clientName || ''} — ${order.orderNumber || ''}`,
        category: 'collection',
        orderId, clientId: order.clientId || '', clientName: order.clientName || '',
        date: _ts(), createdBy: userId || '', createdByName: userName || '',
        createdAt: serverTimestamp(),
        ...approvalFields(),
      });

      batch.update(order._ref, {
        totalPaid: newPaid, remaining: newRem,
        paymentStatus: newRem <= 0.01 ? 'paid' : newPaid > 0 ? 'partial' : 'pending',
        ...(autoCollected ? { shipStage: 'collected', shipCollectedAt: serverTimestamp() } : {}),
        ...(note ? { shipCollectNote: note } : {}),
        timeline: [...(order.timeline || []), _tlEntry(
          `💰 تحصيل ${amt} ج عبر ${walletName || ''}${autoCollected ? ' — ✅ محصّل بالكامل' : ''}`,
          userName, userId
        )],
        updatedAt: serverTimestamp(),
      });

      addLedgerToBatch(batch, db, FE.CUSTOMER_PAYMENT, {
        amount: amt, walletId, walletName: walletName || '',
        orderId, clientId: order.clientId || '', clientName: order.clientName || '',
        notes: `تحصيل شحن — ${order.clientName || ''} — ${order.orderNumber || ''}`,
        userId: userId || '', userName: userName || '',
      });

      await batch.commit();

      // Auto-archive: pickup/courier بعد تحصيل كامل = أوردر منتهي تشغيلياً.
      // (الـ method != 'company' لذا لا تسوية مطلوبة — جاهز للأرشفة فوراً).
      let archiveResult = null;
      if (autoCollected) {
        try {
          archiveResult = await orderActions.archiveOrder({
            db, orderId,
            role, userId, userName,
            source: 'shipping', reason: 'auto-archive بعد تحصيل كامل',
            bypassWarnings: true,
          });
        } catch (e) {
          archiveResult = { ok: false, errors: [e.message || 'فشل الأرشفة'] };
        }
      }

      return {
        ok: true, errors: [], warnings: v.warnings,
        orderId, action: 'collect_customer', autoCollected,
        archived: archiveResult,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحصيل'], warnings: [], orderId };
    }
    }); // end withIdempotency
  },

  /**
   * تأكيد تحصيل شحنة من شركة شحن (marker فقط — لا يدخل المحفظة بعد).
   * المحفظة تستقبل الفلوس لاحقاً عبر settleWithCompany.
   */
  async markCompanyCollected({
    db, orderId, amount, note = '',
    role, userId, userName,
    bypassWarnings = false,
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const amt = parseFloat(amount) || 0;
    const sale = parseFloat(order.salePrice) || 0;
    const cust = parseFloat(order.customerShipFee) || 0;
    const disc = parseFloat(order.discount) || 0;
    const paid = parseFloat(order.totalPaid) || parseFloat(order.deposit) || 0;
    const expectedFromCustomer = Math.max(0, sale + cust - disc - paid);

    const v = validateCompanyCollect({ order, amount: amt, expectedFromCustomer, role });
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, orderId };
    if (v.warnings.length && !bypassWarnings) {
      return { ok: false, errors: [], warnings: v.warnings, needsConfirmation: true, orderId };
    }

    try {
      await updateDoc(order._ref, {
        shipCollected: amt,
        shipCollectedAt: serverTimestamp(),
        shipCollectedBy: userName || '',
        shipStage: 'collected',
        shipCollectNote: note || '',
        timeline: [...(order.timeline || []), _tlEntry(
          `📦 تأكيد تحصيل من شركة الشحن — ${amt} ج — بانتظار التسوية`,
          userName, userId
        )],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: v.warnings, orderId, action: 'mark_company_collected' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل تأكيد التحصيل'], warnings: [], orderId };
    }
  },

  /**
   * تسوية مع شركة شحن (فردي أو جماعي).
   * أمر مالي عبر FSE → wallet + ledger + shipping_settlements + per-order updates.
   *
   * Per RULE A1: orderIds[] قد يكون فيها order واحد أو أكثر — pattern موحَّد.
   */
  async settleWithCompany({
    db, orderIds, amount, walletId, walletName = '',
    companyName = '', diffReason = '', diffReasonLabel = '', diffNote = '', note = '',
    receiptUrl = '',
    role, userId, userName,
    bypassWarnings = false,
  }) {
    if (!Array.isArray(orderIds) || !orderIds.length) {
      return { ok: false, errors: ['اختر أوردر واحد على الأقل'], warnings: [] };
    }
    // 📷 Receipt إجباري — أكبر تحويل مالي في الـ flow بدون proof = خطر audit.
    if (!receiptUrl) {
      return { ok: false, errors: ['⚠️ صورة إيصال إيداع الفلوس مطلوبة لكل تسوية'], warnings: [] };
    }
    // PR-7-salvage G1: idempotency — settle-fingerprint = orderIds + walletId + amount
    return withIdempotency(db, {
      actionType: 'settle_with_company',
      entityId: [...orderIds].sort().join(','),
      actorId: userId || '',
      payload: { walletId, amount: Number(amount) || 0 },
    }, async (operationId) => {

    // Load all orders fresh from Firestore (atomic snapshot for the spec)
    const loaded = await Promise.all(orderIds.map(id => _loadOrder(db, id)));
    const orders = loaded.filter(Boolean);
    if (!orders.length) {
      return { ok: false, errors: ['لا توجد أوردرات صالحة'], warnings: [] };
    }

    // Pre-flight validators
    const amt = parseFloat(amount) || 0;
    const spec = buildSettlementUpdates({
      orders, actualAmount: amt,
      userName: userName || '', companyName,
      diffReasonLabel, diffNote,
    });
    if (!spec.ok) return { ok: false, errors: spec.errors, warnings: spec.warnings };

    const expectedAmount = spec.summary.sumExpected;
    const v = validateSettle({
      orders, amount: amt, expectedAmount, walletId,
      diffReason, diffNote, role,
    });
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };
    if (v.warnings.length && !bypassWarnings) {
      return { ok: false, errors: [], warnings: v.warnings, needsConfirmation: true };
    }

    try {
      const result = await dispatchFinancialEvent(db, FE.SHIPPING_SETTLEMENT, {
        walletId, walletName,
        amount: amt,
        companyName,
        orderIds: orders.map(o => o._id),
        expectedAmount,
        difference: spec.summary.diff,
        diffReason, diffReasonLabel, diffNote,
        note: note || '',
        receiptUrl,
        date: new Date().toLocaleDateString('ar-EG'),
        userId: userId || '', userName: userName || '',
        operationId, // CHAOS HOTFIX T8: forensic linkage to op
        orderUpdates: spec.updates.map((u, i) => ({
          orderId: u.orderId,
          totalPaid: u.fields.totalPaid,
          remaining: u.fields.remaining,
          paymentStatus: u.fields.paymentStatus,
          dueByCo: u.fields.shipSettledAmount,
          timeline: [...((orders[i]?.timeline) || []), u.timelineEntry],
          timelineEntry: u.timelineEntry,
        })),
      });

      // Auto-archive كل الأوردرات المُسوَّاة — الأوردر اكتمل تشغيلياً + مالياً.
      // buildArchiveSpec في orders.js يحقق إن shipSettled=true قبل الكتابة.
      // فشل الأرشفة لأي سبب لا يُلغي التسوية (الكتابة المالية كاملة).
      const archiveResults = [];
      for (const id of orders.map(o => o._id)) {
        try {
          const ar = await orderActions.archiveOrder({
            db, orderId: id,
            role, userId, userName,
            source: 'shipping', reason: 'auto-archive بعد تسوية شركة الشحن',
            bypassWarnings: true,
          });
          archiveResults.push({ orderId: id, ok: ar.ok, errors: ar.errors });
        } catch (e) {
          archiveResults.push({ orderId: id, ok: false, errors: [e.message || 'فشل الأرشفة'] });
        }
      }

      return {
        ok: true, errors: [], warnings: v.warnings,
        orderIds: orders.map(o => o._id),
        settlementId: result.settleId,
        action: 'settle',
        summary: spec.summary,
        archived: archiveResults,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التسوية'], warnings: [] };
    }
    }); // end withIdempotency
  },

  /**
   * إلغاء تسوية مع شركة شحن.
   * (PR-7-salvage G2): append-only — settlement.reversed=true بدل deleteDoc.
   */
  async reverseSettlement({
    db, settlementId, walletId, walletName = '',
    amount, companyName = '', orderIds = [],
    role, userId, userName,
  }) {
    if (!settlementId) return { ok: false, errors: ['settlementId مطلوب'], warnings: [] };
    // PR-7-salvage G1: idempotency
    return withIdempotency(db, {
      actionType: 'reverse_settlement',
      entityId: settlementId,
      actorId: userId || '',
      payload: {},
    }, async (operationId) => {

    // Load orders to compute reversal updates
    const orders = await Promise.all((orderIds || []).map(id => _loadOrder(db, id)));

    // B6 (Phase 2): block reversal on archived orders.
    // Per PHASE_2_DIAGNOSIS issue #6: reversing settlement on an archived
    // order allows backward state-machine transitions (un-archives implicitly)
    // and corrupts financial integrity. Hard block here — re-open the order
    // first via a separate action if reversal is truly needed.
    const archivedIds = orders
      .filter(Boolean)
      .filter(o => o.stage === ORDER_STAGES.ARCHIVED)
      .map(o => o._id);
    if (archivedIds.length > 0) {
      return {
        ok: false,
        errors: [
          `⛔ لا يمكن إلغاء التسوية — ${archivedIds.length} أوردر مؤرشف. ` +
          `أعد فتحه أولاً قبل إلغاء التسوية. (${archivedIds.join(', ')})`,
        ],
        warnings: [],
      };
    }

    const orderUpdates = orders.filter(Boolean).map(o => {
      const settledAmt = parseFloat(o.shipSettledAmount) || 0;
      const paid = parseFloat(o.totalPaid) || 0;
      const sale = parseFloat(o.salePrice) || 0;
      const cust = parseFloat(o.customerShipFee) || 0;
      const disc = parseFloat(o.discount) || 0;
      const newPaid = Math.max(0, paid - settledAmt);
      const totalDue = Math.max(0, sale + cust - disc);
      const newRem = Math.max(0, totalDue - newPaid);
      return {
        orderId: o._id,
        totalPaid: newPaid,
        remaining: newRem,
        paymentStatus: newRem <= 0.01 ? 'paid' : newPaid > 0 ? 'partial' : 'pending',
        reverseShare: settledAmt, // CHAOS HOTFIX T8: per-order amount being reversed
      };
    });
    // CHAOS HOTFIX T8: build orderAllocations for ledger so reversal sums by order
    const reverseAllocations = orderUpdates.reduce((acc, u) => {
      acc[u.orderId] = u.reverseShare || 0;
      return acc;
    }, {});

    try {
      await dispatchFinancialEvent(db, FE.SHIPPING_SETTLEMENT_REVERSAL, {
        settlementId, walletId, walletName,
        amount: parseFloat(amount) || 0,
        companyName, orderIds,
        orderAllocations: reverseAllocations,
        date: new Date().toLocaleDateString('ar-EG'),
        userId: userId || '', userName: userName || '',
        orderUpdates,
        reversalOperationId: operationId, // PR-7-salvage G2 forensic linkage
      });
      return { ok: true, errors: [], warnings: [], action: 'reverse_settlement', settlementId };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل إلغاء التسوية'], warnings: [] };
    }
    }); // end withIdempotency
  },

  /**
   * تسجيل مرتجع كامل/جزئي.
   * يحدث shipStage='returned' + يسجل RETURN_LOSS لو cost>0 ولا lossParty='client'.
   */
  async registerReturn({
    db, orderId, reason, lossParty, cost = 0, returnType = 'full', note = '',
    walletId = '', walletName = '',
    role, userId, userName,
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    // PR-7-salvage G1: idempotency — return per order per minute
    return withIdempotency(db, {
      actionType: `register_return_${returnType}`,
      entityId: orderId,
      actorId: userId || '',
      payload: { lossParty, cost: Number(cost) || 0, returnType },
    }, async (operationId) => {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const v = validateReturn({ order, reason, lossParty, cost, returnType, note, role });
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, orderId };

    const lossAmt = parseFloat(cost) || 0;
    const REASON_LABELS = {
      damaged: 'تلف', wrong_design: 'خطأ تصميم', wrong_item: 'منتج خاطئ',
      late: 'تأخير', refused: 'العميل رفض', other: 'أخرى',
    };
    const reasonLabel = REASON_LABELS[reason] || reason;

    try {
      const batch = writeBatch(db);
      batch.update(order._ref, {
        shipStage: 'returned',
        returnReason: reason,
        returnReasonLabel: reasonLabel,
        returnLossParty: lossParty,
        returnLossAmount: lossAmt,
        returnNote: note || '',
        returnedAt: serverTimestamp(),
        returnedBy: userName || '',
        ...(returnType === 'partial' ? { returnType: 'partial' } : {}),
        timeline: [...(order.timeline || []), _tlEntry(
          `↩️ تسجيل مرتجع — ${reasonLabel} — خسارة ${lossAmt} ج (${lossParty === 'client' ? 'العميل' : lossParty === 'company' ? 'الشركة' : 'شركة الشحن'})`,
          userName, userId
        )],
        updatedAt: serverTimestamp(),
      });

      // RETURN_LOSS event — only if the company bears the loss (not client)
      if (lossAmt > 0 && lossParty !== 'client' && walletId) {
        addLedgerToBatch(batch, db, FE.RETURN_LOSS, {
          amount: lossAmt, walletId, walletName,
          orderId, clientId: order.clientId || '', clientName: order.clientName || '',
          notes: `خسارة مرتجع — ${order.clientName || ''} — ${reasonLabel}`,
          userId: userId || '', userName: userName || '',
        });
      }

      await batch.commit();
      return { ok: true, errors: [], warnings: v.warnings, orderId, action: 'register_return' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل تسجيل المرتجع'], warnings: [], orderId };
    }
    }); // end withIdempotency
  },

  // ════════════════════════════════════════════════════════════
  // PR-3 (scalable-drifting-ember) — Central actions, parallel layer
  // ════════════════════════════════════════════════════════════
  // Actions below use canonical names from the new state machine.
  // The 2 truly-new actions (prepareForShipping, markPartialReturn)
  // implement fresh logic. The 6 renames are thin aliases that delegate
  // to the existing legacy-named actions — UI pages migrating in PR-4..6
  // call the canonical names so the legacy names can be removed in PR-7.

  /**
   * prepareForShipping — تجهيز الأوردر للشحن قبل confirmShipped.
   * يكتب: shipMethod, shipCompanyId/Name, deliveryAddress, courierDirectFee,
   * priceIncludesShipping, customerPhoneShip. لا حدث مالي.
   *
   * ملاحظة مالية (RULE 4): رسوم الشحن في حالة «غير شامل» = يدفعها العميل
   * للمندوب مباشرة. تُخزَّن في courierDirectFee (معلوماتي فقط) ولا تدخل
   * حسابات الشركة. customerShipFee (الذي يُضاف لمطلوب التحصيل) يبقى 0 دائماً.
   */
  async prepareForShipping({
    db, orderId,
    shipMethod, shipCompanyId = '', shipCompanyName = '',
    deliveryAddress = null,
    customerShipFee = 0,
    priceIncludesShipping = false,
    customerPhoneShip = '',
    note = '',
    role, userId, userName,
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const v = validatePrepareShipping({
      order, shipMethod, shipCompanyName,
      deliveryAddress, customerShipFee, priceIncludesShipping, role,
    });
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, orderId };

    const fee = parseFloat(customerShipFee) || 0;
    // غير شامل → courierDirectFee (معلوماتي، خارج الحسابات). شامل → لا رسوم منفصلة.
    const courierFee = priceIncludesShipping ? 0 : fee;
    const feeNote = !priceIncludesShipping && courierFee > 0
      ? ` — الشحن على العميل: ${courierFee} ج للمندوب مباشرة`
      : (priceIncludesShipping ? ' — السعر شامل الشحن' : '');
    const fields = {
      shipMethod,
      shipCompanyId: shipMethod === 'company' ? (shipCompanyId || '') : '',
      shipCompanyName: shipMethod === 'company' ? (shipCompanyName || '') : '',
      deliveryAddress: shipMethod === 'pickup' ? null : (deliveryAddress || null),
      // RULE 4: رسوم الشحن المباشرة لا تدخل حسابات الشركة — customerShipFee يبقى 0.
      customerShipFee: 0,
      courierDirectFee: courierFee,
      priceIncludesShipping: !!priceIncludesShipping,
      customerPhoneShip: customerPhoneShip || order.customerPhoneShip || order.clientPhone || '',
      shipStage: order.shipStage || 'ready',
      timeline: [...(order.timeline || []), _tlEntry(
        `📋 تجهيز للشحن — ${shipMethod}${shipMethod === 'company' && shipCompanyName ? ' (' + shipCompanyName + ')' : ''}${feeNote}`,
        userName, userId
      )],
      updatedAt: serverTimestamp(),
      ...(note ? { shipPrepareNote: note } : {}),
    };

    try {
      await updateDoc(order._ref, fields);
      return {
        ok: true, errors: [], warnings: v.warnings,
        orderId, action: 'prepare_for_shipping', shipMethod,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التجهيز'], warnings: [], orderId };
    }
  },

  /**
   * editShippingCost — تعديل تكلفة الشحن علينا (shippingCost) قبل التسوية.
   *
   * تكلفة الشحن = ما ندفعه لشركة الشحن. تدخل في حساب التسوية لحظياً
   * (المحصّل لنا = shipCollected − shippingCost)، فتعديلها قبل التسوية كافٍ
   * ولا يحتاج أي حدث مالي منفصل — التأثير المالي يتحقق وقت settleWithCompany.
   *
   * تعمل في حالتي «شامل / غير شامل الشحن» سواء — لا تمسّ salePrice ولا
   * customerShipFee (الذي يبقى 0). لا تُسمح بعد التسوية (shipSettled) لأن
   * shipSettledAmount يكون قد سُجِّل على القيمة القديمة.
   */
  async editShippingCost({ db, orderId, newCost, note = '', role, userId, userName }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const cost = parseFloat(newCost);
    const errors = [];
    if (!Number.isFinite(cost) || cost < 0) errors.push('⚠️ تكلفة الشحن غير صالحة');
    if (order.stage === ORDER_STAGES.ARCHIVED) errors.push('⛔ الأوردر مؤرشف — لا يمكن تعديله');
    if (normalizeShipStage(order.shipStage) === 'returned_full') errors.push('⛔ الأوردر مرتجع — لا يمكن تعديله');
    if (order.shipSettled === true) errors.push('⛔ الأوردر مسوّى مع شركة الشحن — ألغِ التسوية أولاً لتعديل التكلفة');
    if (role && !SHIPPING_DISPATCH_ROLES.includes(role)) errors.push('ليس لديك صلاحية تعديل تكلفة الشحن');
    if (errors.length) return { ok: false, errors, warnings: [], orderId };

    const oldCost = parseFloat(order.shippingCost) || 0;
    if (Math.abs(cost - oldCost) < 0.005) {
      return { ok: true, errors: [], warnings: ['لا توجد تغييرات'], orderId, action: 'edit_shipping_cost', shippingCost: oldCost };
    }

    try {
      await updateDoc(order._ref, {
        shippingCost: cost,
        timeline: [...(order.timeline || []), _tlEntry(
          `✏️ تعديل تكلفة الشحن: ${oldCost} → ${cost} ج${note ? ' — ' + note : ''}`,
          userName, userId
        )],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], orderId, action: 'edit_shipping_cost', shippingCost: cost, oldCost };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل تعديل تكلفة الشحن'], warnings: [], orderId };
    }
  },

  /**
   * markPartialReturn — تسجيل مرتجع جزئي (NEW).
   * يضيف items[] إلى returnedItems[]، يحسم salePriceDelta من salePrice،
   * يجمّع partialReturnLoss، ويسجّل FE.RETURN_LOSS لو lossParty != 'client'
   * وlossCost>0 وwalletId موجود.
   * الـ shipStage يصبح 'returned_partial' (لا يقفل الأوردر).
   */
  async markPartialReturn({
    db, orderId,
    items = [], lossCost = 0, salePriceDelta = 0,
    reason, lossParty, note = '',
    walletId = '', walletName = '',
    role, userId, userName,
  }) {
    if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
    return withIdempotency(db, {
      actionType: 'mark_partial_return',
      entityId: orderId,
      actorId: userId || '',
      payload: {
        itemIdx: (items || []).map(i => i?.idx).join(','),
        itemQty: (items || []).map(i => i?.qty).join(','),
        lossCost: Number(lossCost) || 0,
        salePriceDelta: Number(salePriceDelta) || 0,
      },
    }, async (operationId) => {
      const order = await _loadOrder(db, orderId);
      if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

      const v = validatePartialReturn({
        order, items, lossCost, salePriceDelta,
        reason, lossParty, note, role,
      });
      if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, orderId };

      const loss  = parseFloat(lossCost)       || 0;
      const delta = parseFloat(salePriceDelta) || 0;
      const prevSale = parseFloat(order.salePrice) || 0;
      const newSale  = Math.max(0, prevSale - delta);
      const prevLoss = parseFloat(order.partialReturnLoss) || 0;
      const newLoss  = prevLoss + loss;
      const prevReturnedItems = Array.isArray(order.returnedItems) ? order.returnedItems : [];
      const ts = nowStr();
      const newReturnedItems = [
        ...prevReturnedItems,
        ...items.map(it => ({
          idx: it.idx, qty: parseFloat(it.qty) || 0,
          reason: it.reason || reason || '',
          at: ts, byId: userId || '', by: userName || '',
        })),
      ];

      const REASON_LABELS = {
        damaged: 'تلف', wrong_design: 'خطأ تصميم', wrong_item: 'منتج خاطئ',
        late: 'تأخير', refused: 'العميل رفض', other: 'أخرى',
      };
      const reasonLabel = REASON_LABELS[reason] || reason;
      const totalReturnedQty = items.reduce((s, it) => s + (parseFloat(it.qty) || 0), 0);

      const orderFields = {
        shipStage: 'returned_partial',
        salePrice: newSale,
        partialReturnLoss: newLoss,
        returnedItems: newReturnedItems,
        returnReason: reason,
        returnReasonLabel: reasonLabel,
        returnLossParty: lossParty,
        returnNote: note || '',
        partialReturnedAt: serverTimestamp(),
        partialReturnedBy: userName || '',
        partialReturnedById: userId || '',
        timeline: [...(order.timeline || []), _tlEntry(
          `↪️ مرتجع جزئي — ${totalReturnedQty} قطعة — خصم ${delta} ج — خسارة ${loss} ج (${reasonLabel})`,
          userName, userId
        )],
        updatedAt: serverTimestamp(),
      };

      try {
        const batch = writeBatch(db);
        batch.update(order._ref, orderFields);
        if (loss > 0 && lossParty !== 'client' && walletId) {
          addLedgerToBatch(batch, db, FE.RETURN_LOSS, {
            amount: loss, walletId, walletName: walletName || '',
            orderId, clientId: order.clientId || '', clientName: order.clientName || '',
            notes: `خسارة مرتجع جزئي — ${order.clientName || ''} — ${reasonLabel}`,
            userId: userId || '', userName: userName || '',
            operationId,
          });
        }
        await batch.commit();
        return {
          ok: true, errors: [], warnings: v.warnings,
          orderId, action: 'mark_partial_return', operationId,
          newSalePrice: newSale, accumulatedLoss: newLoss,
        };
      } catch (e) {
        return { ok: false, errors: [e.message || 'فشل تسجيل المرتجع الجزئي'], warnings: [], orderId };
      }
    });
  },

  // ─── Renames (thin aliases — delegate to existing legacy-named actions) ───
  // UI pages migrating in PR-4..6 call the canonical names below.
  // Existing pages keep calling the legacy names. PR-7 may consolidate.

  /** confirmShipped — alias for dispatchOrder (will write 'shipped' once PR-7 migrates) */
  async confirmShipped(args) { return shippingActions.dispatchOrder(args); },

  /** confirmDelivered — alias for markDelivered */
  async confirmDelivered(args) { return shippingActions.markDelivered(args); },

  /** markUnderCollection — alias for markCompanyCollected */
  async markUnderCollection(args) { return shippingActions.markCompanyCollected(args); },

  /** settleFromCompany — alias for settleWithCompany */
  async settleFromCompany(args) { return shippingActions.settleWithCompany(args); },

  /** markFullReturn — registerReturn with returnType='full' */
  async markFullReturn(args) {
    return shippingActions.registerReturn({ ...args, returnType: 'full' });
  },

  /** closeShipment — delegates to orderActions.archiveOrder */
  async closeShipment(args) {
    return orderActions.archiveOrder({ ...args, source: args?.source || 'shipping' });
  },
};

export default shippingActions;
