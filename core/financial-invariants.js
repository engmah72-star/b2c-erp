/**
 * Business2Card ERP — core/financial-invariants.js
 *
 * ━━━ FINANCIAL DRIFT DETECTION (PR-7 G3) ━━━
 *
 * Invariants تفحص كل أوردر/كيان مالي للتأكد من سلامة الأرصدة الحسابية.
 * تُستخدم في:
 *   - banner تحذير على صفحات الشحن/الحسابات عند drift
 *   - audit job دوري (Cloud Function) — مستقبلاً
 *   - manual triggers من admin
 *
 * Invariants المُطبَّقة على وثيقة order:
 *   I1: paid >= 0
 *   I2: remaining >= 0
 *   I3: salePrice >= 0
 *   I4: paid <= total + ε (لا overpayment إلا بـ tolerance بسيط)
 *   I5: paid + remaining ≈ total  (الـ canonical equality)
 *   I6: shipSettledAmount <= shipCollected + ε  (لا تسوية أكثر من المُحصَّل)
 *   I7: لو returned_full → totalPaid=0 + remaining=0 (state-machine consistency)
 *   I8: لو shipSettled=true → walletId محدد (إلا للـ manual settle)
 *   I9: لو paymentStatus='paid' → remaining <= ε
 *
 * كل invariant violation = { code, severity, message, fields }.
 *
 * هذا الـ module *لا يكتب* — مجرد detection. الإصلاح في detectOrderIssues
 * + applyOrderHealPatch (orders.js — موجود مسبقاً).
 */

const EPS = 0.02; // tolerance للأخطاء العائمة (2 piasters)

/** @returns {Array<{code, severity, message, fields}>} */
export function detectFinancialDrift(order) {
  if (!order) return [];
  const violations = [];

  const sale     = num(order.salePrice);
  const shipFee  = order.priceIncludesShipping ? 0 : num(order.customerShipFee);
  const discount = num(order.discount);
  const total    = Math.max(0, sale + shipFee - discount);
  const paid     = num(order.totalPaid) || num(order.paid) || num(order.deposit);
  const remaining = num(order.remaining);
  const shipCollected = num(order.shipCollected);
  const shipSettledAmount = num(order.shipSettledAmount);
  const shipStage = normalizeShipStageLocal(order.shipStage);
  const paymentStatus = order.paymentStatus || '';

  // I1: paid >= 0
  if (paid < -EPS) violations.push(v('PAID_NEGATIVE', 'crit', `totalPaid سالب: ${paid}`, ['totalPaid']));

  // I2: remaining >= 0
  if (remaining < -EPS) violations.push(v('REMAINING_NEGATIVE', 'crit', `remaining سالب: ${remaining}`, ['remaining']));

  // I3: salePrice >= 0
  if (sale < -EPS) violations.push(v('SALE_NEGATIVE', 'crit', `salePrice سالب: ${sale}`, ['salePrice']));

  // I4: paid <= total + ε
  if (paid > total + EPS && shipStage !== 'returned_partial' && shipStage !== 'returned_full') {
    violations.push(v('OVERPAID', 'warn',
      `المدفوع (${paid.toFixed(2)}) أكبر من الإجمالي (${total.toFixed(2)})`,
      ['totalPaid', 'salePrice']));
  }

  // I5: paid + remaining ≈ total
  const expectedRem = Math.max(0, total - paid);
  if (Math.abs(remaining - expectedRem) > EPS &&
      paymentStatus !== 'returned' && shipStage !== 'returned_full') {
    violations.push(v('PAID_REMAINING_TOTAL_MISMATCH', 'warn',
      `paid+remaining لا يساوي total: paid=${paid}, remaining=${remaining}, expected_rem=${expectedRem.toFixed(2)}`,
      ['totalPaid', 'remaining', 'salePrice']));
  }

  // I6: shipSettledAmount <= shipCollected + ε
  if (shipSettledAmount > shipCollected + EPS && !order.shipSettledManual) {
    violations.push(v('SETTLED_GT_COLLECTED', 'warn',
      `shipSettledAmount (${shipSettledAmount.toFixed(2)}) > shipCollected (${shipCollected.toFixed(2)})`,
      ['shipSettledAmount', 'shipCollected']));
  }

  // I7: returned_full → totals zero
  if (shipStage === 'returned_full' && (paid > EPS || remaining > EPS)) {
    violations.push(v('RETURNED_BUT_TOTALS_NONZERO', 'crit',
      `أوردر مرتجع لكن totalPaid=${paid} و remaining=${remaining}`,
      ['shipStage', 'totalPaid', 'remaining']));
  }

  // I8: shipSettled=true requires walletId (إلا manual)
  if (order.shipSettled === true && !order.shipSettledWalletId && !order.shipSettledManual) {
    violations.push(v('SETTLED_NO_WALLET', 'warn',
      'shipSettled=true لكن لا walletId مرتبط (وليس manual)',
      ['shipSettled', 'shipSettledWalletId']));
  }

  // I9: paymentStatus=paid → remaining ≈ 0
  if (paymentStatus === 'paid' && remaining > EPS) {
    violations.push(v('PAID_STATUS_BUT_REMAINING', 'warn',
      `paymentStatus='paid' لكن remaining=${remaining}`,
      ['paymentStatus', 'remaining']));
  }

  // ─── PR-7.5 R5 — Advanced invariants ──────────────────────────────────
  const refundAmount = num(order.returnRefundAmount) + num(order.partialReturnRefund);

  // I10: refund <= paid  (لا يصح استرداد أكثر من المُحصَّل)
  if (refundAmount > paid + EPS && shipStage !== 'returned_full') {
    violations.push(v('REFUND_EXCEEDS_PAID', 'crit',
      `الاسترداد (${refundAmount.toFixed(2)}) يتجاوز المدفوع (${paid.toFixed(2)})`,
      ['returnRefundAmount', 'totalPaid']));
  }

  // I11: shipSettledAmount + reversed history — لو order.shipSettled=false لكن
  //      shipSettledAmount != 0 → drift
  if (order.shipSettled === false && shipSettledAmount > EPS) {
    violations.push(v('SETTLED_FLAG_FALSE_BUT_AMOUNT', 'warn',
      `shipSettled=false لكن shipSettledAmount=${shipSettledAmount}`,
      ['shipSettled', 'shipSettledAmount']));
  }

  // I12: لو returned_partial → returnedItems[] غير فاضي + salePrice تم تعديله
  if (shipStage === 'returned_partial') {
    const items = Array.isArray(order.returnedItems) ? order.returnedItems : [];
    if (items.length === 0) {
      violations.push(v('PARTIAL_RETURN_NO_ITEMS', 'warn',
        'shipStage=returned_partial لكن returnedItems فارغة',
        ['shipStage', 'returnedItems']));
    }
    // I13: مجموع returnedItems[].qty <= مجموع products[].qty الأصلي
    const totalReturnedQty = items.reduce((s, it) => s + (Number(it.returnedQty || it.qty) || 0), 0);
    // الـ original qty صعب نعرفه بدون snapshot — هنا فقط الـ sanity check
    if (totalReturnedQty < 0) {
      violations.push(v('PARTIAL_RETURN_NEGATIVE_QTY', 'crit',
        `returnedItems quantity سالب: ${totalReturnedQty}`,
        ['returnedItems']));
    }
  }

  // I14: لو closed (مغلق) → stage يجب يكون archived
  if (shipStage === 'closed' && order.stage !== 'archived') {
    violations.push(v('CLOSED_NOT_ARCHIVED', 'warn',
      `shipStage='closed' لكن stage='${order.stage}' (ليس archived)`,
      ['shipStage', 'stage']));
  }

  return violations;
}

/**
 * يفحص قائمة أوردرات + يُرجع summary: { total, withDrift, byCode, criticalCount }.
 * مفيد لـ banner عام في صفحات الشحن.
 */
export function summarizeFinancialDrift(orders) {
  let withDrift = 0, criticalCount = 0;
  const byCode = {};
  const samples = {};
  for (const o of (orders || [])) {
    const vs = detectFinancialDrift(o);
    if (vs.length) withDrift++;
    for (const x of vs) {
      byCode[x.code] = (byCode[x.code] || 0) + 1;
      if (x.severity === 'crit') criticalCount++;
      if (!samples[x.code]) samples[x.code] = { orderId: o._id || o.orderId, message: x.message };
    }
  }
  return {
    total: (orders || []).length,
    withDrift,
    criticalCount,
    byCode,
    samples,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────
function num(x) {
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : 0;
}
function v(code, severity, message, fields) {
  return { code, severity, message, fields: fields || [] };
}
// local mirror of normalizeShipStage to avoid circular import with orders.js
function normalizeShipStageLocal(value) {
  switch (value) {
    case 'wait_delivery':   return 'shipped';
    case 'wait_collection': return 'delivered';
    case 'returned':        return 'returned_full';
    case 'completed':       return 'closed';
    default:                return value || 'ready';
  }
}
