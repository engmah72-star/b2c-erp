/**
 * Business2Card ERP — core/projection.js
 *
 * ━━━ FINANCIAL PROJECTION FROM LEDGER (PR-7.5 R3) ━━━
 *
 * المشكلة:
 *   الحقول الحالية على وثيقة order:
 *     totalPaid, remaining, paymentStatus, shipSettledAmount, shipCollected
 *   هي *projections* — مُستنتجة من تراكم events.
 *   لو حصل drift بين الـ projection والـ ledger truth، الأوردر يكذب.
 *
 * الحل:
 *   rebuildFinancialProjection(orderId) يقرأ كل entries من
 *   financial_ledger للأوردر، يحسب الإجماليات من الـ events، ويُرجع
 *   الـ canonical projection. ثم نقارن بـ projection المُخزَّن.
 *
 * Ledger events معتبرة (للـ orderId المرتبط):
 *   IN  (يُضاف للـ paid):
 *     CUSTOMER_PAYMENT, SHIPPING_SETTLEMENT
 *   OUT (يُطرح من paid أو يُسجَّل كـ refund):
 *     CUSTOMER_REFUND, SHIPPING_SETTLEMENT_REVERSAL,
 *     RETURN_LOSS (لا يؤثر paid، فقط loss)
 *   GENERAL_EXPENSE (cost item) → لا يؤثر على paid أو remaining، فقط total cost
 *
 * Reversed entries (isDeleted=true) يجب أن تكون مستبعدة (لكن FSE
 * يستخدم append-only، فالـ reversal دائماً = entry مستقلة بـ direction=out).
 */

import { collection, query, where, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/**
 * يبني projection من ledger entries.
 * Returns {
 *   ok: bool,
 *   orderId,
 *   derivedPaid,         // sum(IN) - sum(OUT) من events المعتبرة لـ paid
 *   totalRefund,         // sum(CUSTOMER_REFUND)
 *   totalSettled,        // sum(SHIPPING_SETTLEMENT) - sum(REVERSAL)
 *   totalReturnLoss,     // sum(RETURN_LOSS)
 *   totalGeneralExpense, // sum(GENERAL_EXPENSE direction=out) - sum(direction=in)
 *   ledgerEntries,       // count
 *   reversedOps          // count of reversal entries
 * }
 */
export async function rebuildFinancialProjection(db, orderId) {
  if (!db || !orderId) {
    return { ok: false, errors: ['db + orderId مطلوبان'], orderId };
  }

  // CHAOS HOTFIX (T8): SHIPPING_SETTLEMENT ledger entries span multiple
  // orders and store orderIds[] (not a single orderId). We MUST query
  // both paths to find all ledger entries that touch this order.
  // Firestore doesn't support OR queries — execute both and de-dup.
  const [byOrderId, byOrderIds] = await Promise.all([
    getDocs(query(
      collection(db, 'financial_ledger'),
      where('orderId', '==', orderId),
    )),
    getDocs(query(
      collection(db, 'financial_ledger'),
      where('orderIds', 'array-contains', orderId),
    )),
  ]);
  // De-dup by doc id (entries with single orderId may also have orderIds[orderId])
  const seen = new Set();
  const allDocs = [];
  for (const snap of [byOrderId, byOrderIds]) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      allDocs.push(d);
    }
  }

  let derivedPaid = 0;
  let totalRefund = 0;
  let totalSettled = 0;
  let totalSettlementReversed = 0;
  let totalReturnLoss = 0;
  let generalExpenseOut = 0;
  let generalExpenseIn = 0;
  let reversedOps = 0;

  // CHAOS HOTFIX (T8): for multi-order events, compute THIS order's share:
  //   1) If e.orderAllocations[orderId] exists, use that (per-order share)
  //   2) Else if e.orderId === orderId, use full amount (single-order legacy entry)
  //   3) Else if orderIds[orderId] is the only one, use full amount
  //   4) Else fallback to amount/orderIds.length (best-effort proportional)
  function shareFor(e, fullAmount) {
    if (e.orderAllocations && Number.isFinite(parseFloat(e.orderAllocations[orderId]))) {
      return parseFloat(e.orderAllocations[orderId]);
    }
    if (e.orderId === orderId) return fullAmount;
    const ids = Array.isArray(e.orderIds) ? e.orderIds : [];
    if (ids.length === 1 && ids[0] === orderId) return fullAmount;
    if (ids.includes(orderId)) return fullAmount / ids.length; // last-resort fallback
    return 0;
  }

  for (const d of allDocs) {
    const e = d.data();
    if (e.isDeleted === true) continue; // soft-deleted (rare — FSE is append-only)
    const amount = parseFloat(e.amount) || 0;
    const evt = e.eventType || '';
    const dir = e.direction || '';

    switch (evt) {
      case 'CUSTOMER_PAYMENT':
        derivedPaid += amount;
        break;
      case 'CUSTOMER_REFUND':
        derivedPaid -= amount;
        totalRefund += amount;
        if (e.reversalOf) reversedOps++;
        break;
      case 'SHIPPING_SETTLEMENT': {
        const share = shareFor(e, amount);
        derivedPaid += share;
        totalSettled += share;
        break;
      }
      case 'SHIPPING_SETTLEMENT_REVERSAL': {
        const share = shareFor(e, amount);
        derivedPaid -= share;
        totalSettlementReversed += share;
        reversedOps++;
        break;
      }
      case 'RETURN_LOSS':
        totalReturnLoss += amount;
        break;
      case 'GENERAL_EXPENSE':
        if (dir === 'in') generalExpenseIn += amount;
        else generalExpenseOut += amount;
        break;
      case 'GENERAL_EXPENSE_REVERSAL':
        generalExpenseIn += amount;
        reversedOps++;
        break;
      case 'SHIPPING_EXPENSE':
        // shipping cost ≠ paid by customer — لا يؤثر على paid
        break;
      default:
        // unknown event — لا نُغيّر شيء
        break;
    }
  }

  return {
    ok: true,
    orderId,
    derivedPaid: round2(derivedPaid),
    totalRefund: round2(totalRefund),
    totalSettled: round2(totalSettled),
    totalSettlementReversed: round2(totalSettlementReversed),
    totalReturnLoss: round2(totalReturnLoss),
    netGeneralExpense: round2(generalExpenseOut - generalExpenseIn),
    ledgerEntries: ledgerSnap.size,
    reversedOps,
  };
}

/**
 * يقارن الـ projection المُخزَّن على وثيقة order بالـ ledger-derived truth.
 * Returns { ok, drift: [{field, projected, derived, delta, severity}], ... }.
 *
 * يُستخدم في:
 *   - admin panel لفحص أوردر معين
 *   - cloud function دورية (مستقبلاً)
 *   - banner تحذير على صفحات الشحن
 */
export async function compareProjectionVsLedger(db, order) {
  if (!order || !order._id) return { ok: false, errors: ['order + _id مطلوبان'] };
  const proj = await rebuildFinancialProjection(db, order._id);
  if (!proj.ok) return proj;

  const drift = [];
  const EPS = 0.02;

  const storedPaid = parseFloat(order.totalPaid) || 0;
  if (Math.abs(storedPaid - proj.derivedPaid) > EPS) {
    drift.push({
      field: 'totalPaid',
      projected: storedPaid,
      derived: proj.derivedPaid,
      delta: round2(storedPaid - proj.derivedPaid),
      severity: 'crit', // money lying = critical
    });
  }

  const storedSettled = parseFloat(order.shipSettledAmount) || 0;
  const netSettled = proj.totalSettled - proj.totalSettlementReversed;
  if (Math.abs(storedSettled - netSettled) > EPS && !order.shipSettledManual) {
    drift.push({
      field: 'shipSettledAmount',
      projected: storedSettled,
      derived: round2(netSettled),
      delta: round2(storedSettled - netSettled),
      severity: 'warn',
    });
  }

  return {
    ok: true,
    orderId: order._id,
    drift,
    projection: proj,
    hasCorruption: drift.some(d => d.severity === 'crit'),
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
