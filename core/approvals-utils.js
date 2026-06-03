/**
 * Business2Card ERP — core/approvals-utils.js
 *
 * ━━━ APPROVALS PURE UTILITIES (Phase-1 · approvals decomp) ━━━
 *
 * Pure helpers extracted from approvals.html:
 *   - computeWalletState — derive balance before/after for a specific tx
 *   - detectRisks       — flag risky payment requests (large amount, duplicates, ...)
 *   - computeSupplierDues — aggregate unpaid supplier dues across all orders
 */

import { resolveFinancialPolicy } from './financial-policy.js';

/**
 * Compute wallet balance state around a specific transaction.
 *
 * Strategy:
 *   1) If tx has balanceBefore/balanceAfter stored → use them directly.
 *   2) Otherwise, walk back from current wallet balance reversing newer txs.
 *   3) Fallback: build forward from zero (legacy behavior).
 *
 * @param {Object} tx                     — the transaction to compute state for
 * @param {Object} args
 * @param {Array}  args.wallets
 * @param {Array}  args.transactions      — all wallet transactions, oldest→newest
 *
 * @returns {{before, after, walletCurrent}|null}
 */
export function computeWalletState(tx, { wallets = [], transactions = [] } = {}) {
  if (!tx) return null;
  if (tx.balanceBefore != null && tx.balanceAfter != null) {
    return {
      before: parseFloat(tx.balanceBefore) || 0,
      after: parseFloat(tx.balanceAfter) || 0,
      walletCurrent: null,
    };
  }
  if (!tx.walletId) return null;
  const wallet = wallets.find(w => w._id === tx.walletId);
  const walletCurrent = wallet ? (parseFloat(wallet.balance) || 0) : 0;
  let afterCurrent = walletCurrent;
  let foundCurrent = false;
  // Walk from newest backward, reversing each subsequent tx
  for (let i = transactions.length - 1; i >= 0; i--) {
    const x = transactions[i];
    if (x.walletId !== tx.walletId) continue;
    if (x._id === tx._id) { foundCurrent = true; break; }
    const amt = parseFloat(x.amount) || 0;
    const reverseSign = (x.type === 'in' ? -1 : 1);
    afterCurrent += reverseSign * amt;
  }
  if (!foundCurrent) {
    // Fallback: forward from zero
    let after = 0;
    for (const x of transactions) {
      if (x.walletId !== tx.walletId) continue;
      const amt = parseFloat(x.amount) || 0;
      const sign = (x.type === 'in' ? 1 : -1);
      after += sign * amt;
      if (x._id === tx._id) break;
    }
    const sign = (tx.type === 'in' ? 1 : -1);
    return { before: after - sign * (parseFloat(tx.amount) || 0), after, walletCurrent };
  }
  const after = afterCurrent;
  const sign = (tx.type === 'in' ? 1 : -1);
  const before = after - sign * (parseFloat(tx.amount) || 0);
  return { before, after, walletCurrent };
}

/**
 * Detect risky patterns in a payment request before approval.
 *
 * @param {Object} request                 — { _id, amount, supplierId, employeeId, type, costItemIndex, orderId, requestedAt }
 * @param {Object} args
 * @param {Array}  args.allRequests
 * @param {Map}    args.ordersMap          — orderId → order doc
 * @param {Function} args.format           — number formatter (defaults to .toLocaleString('ar-EG'))
 * @param {Date}   [args.now=new Date()]
 *
 * @returns {Array<{lvl:'high'|'med', txt:string}>}
 */
export function detectRisks(request, { allRequests = [], ordersMap = new Map(), format, now = new Date(), policy = null } = {}) {
  const fmt = format || ((n) => (parseFloat(n) || 0).toLocaleString('ar-EG'));
  const risks = [];
  if (!request) return risks;
  // الحدود من السياسة المالية (مصدر واحد) — افتراضياً 5,000 / 10,000.
  const _p = resolveFinancialPolicy(policy);
  const medT = _p.outflow.advisoryMed, highT = _p.outflow.advisoryHigh;
  // Large amount
  if (request.amount > highT) {
    risks.push({ lvl: 'high', txt: `💰 مبلغ كبير: ${fmt(request.amount)} ج (> ${fmt(highT)})` });
  } else if (request.amount > medT) {
    risks.push({ lvl: 'med', txt: `⚠️ مبلغ متوسط: ${fmt(request.amount)} ج (> ${fmt(medT)})` });
  }
  // Same-day duplicates (same amount + supplier + employee, not rejected)
  const todayStr = now.toDateString();
  const dupes = allRequests.filter(x => x._id !== request._id
    && x.amount === request.amount
    && x.supplierId === request.supplierId
    && x.employeeId === request.employeeId
    && x.requestedAt?.seconds && new Date(x.requestedAt.seconds * 1000).toDateString() === todayStr
    && !['rejected'].includes(x.status));
  if (dupes.length) {
    risks.push({ lvl: 'high', txt: `🔁 طلب مماثل في نفس اليوم (×${dupes.length}) — تحقق من التكرار` });
  }
  // Supplier had recent rejection (7 days)
  if (request.supplierId) {
    const recentRej = allRequests.filter(x => x.supplierId === request.supplierId && x.status === 'rejected'
      && x.rejectedAt?.seconds && (now.getTime() - x.rejectedAt.seconds * 1000) < 7 * 24 * 60 * 60 * 1000);
    if (recentRej.length) {
      risks.push({ lvl: 'med', txt: '⚠️ هذا المورد رُفض له طلب آخر خلال 7 أيام' });
    }
  }
  // Order is archived/cancelled
  if (request.orderId) {
    const o = ordersMap.get(request.orderId);
    if (o && ['archived', 'cancelled'].includes(o.stage)) {
      risks.push({ lvl: 'high', txt: `🚫 الأوردر ${o.stage === 'archived' ? 'مؤرشَف' : 'ملغي'} — تحقق من السبب` });
    }
  }
  // Cost item already paid
  if (request.type === 'supplier_payment' && request.costItemIndex !== undefined && request.orderId) {
    const o = ordersMap.get(request.orderId);
    if (o?.costItems?.[request.costItemIndex]?.paid) {
      const paidTxId = o.costItems[request.costItemIndex].paidTxId;
      risks.push({ lvl: 'high', txt: `🔴 بند التكلفة المرتبط مدفوع بالفعل (paidTxId: ${paidTxId?.slice(-8) || '—'})` });
    }
  }
  return risks;
}

/**
 * Aggregate unpaid supplier dues across all orders (excluding archived/cancelled).
 * Splits each supplier's amount into `totalPending` (has request) vs `totalUnpaid`.
 *
 * @param {Object} args
 * @param {Map}    args.ordersMap
 * @returns {Array<{id, name, type, totalUnpaid, totalPending, items}>}  sorted desc
 */
export function computeSupplierDues({ ordersMap = new Map() } = {}) {
  const map = new Map();
  for (const o of ordersMap.values()) {
    if (['archived', 'cancelled'].includes(o.stage)) continue;
    const items = o.costItems || [];
    items.forEach((c, idx) => {
      if (c.paid || !c.supplierId) return;
      const amt = parseFloat(c.total) || 0;
      if (amt <= 0) return;
      if (!map.has(c.supplierId)) {
        map.set(c.supplierId, {
          id: c.supplierId,
          name: c.supplierName || '—',
          type: c.supplierType || '',
          totalUnpaid: 0,
          totalPending: 0,
          items: [],
        });
      }
      const row = map.get(c.supplierId);
      if (c.pendingPaymentRequestId) row.totalPending += amt;
      else row.totalUnpaid += amt;
      row.items.push({
        orderId: o._id,
        orderRefId: o.orderId || o._id.slice(-6),
        clientName: o.clientName || '—',
        costItemIndex: idx,
        type: c.type || '',
        amount: amt,
        note: c.note || '',
        pendingReqId: c.pendingPaymentRequestId || null,
        pendingRequestedBy: c.pendingRequestedBy || '',
        orderStage: o.stage || '',
      });
    });
  }
  return [...map.values()].sort((a, b) =>
    (b.totalUnpaid + b.totalPending) - (a.totalUnpaid + a.totalPending)
  );
}

// ══════════════════════════════════════════════════════════
// APPROVAL AGING / SLA (تقادم الطلبات المعلّقة)
// ══════════════════════════════════════════════════════════

/** حالات الطلب المعلّقة (تنتظر إجراءً). */
export const PENDING_REQUEST_STATES = ['requested', 'awaiting_receipt', 'pending', 'confirmed'];

/**
 * يحسب عمر طلب معلّق وهل تجاوز عتبة الـ SLA (متأخّر).
 *
 * @param {Object} request — payment_request (status, requestedAt{seconds})
 * @param {Object} [opts] — { now=new Date(), staleHours=48 }
 * @returns {{ pending:boolean, ageHours:number, isStale:boolean }}
 */
export function computeRequestAging(request, { now = new Date(), staleHours = 48 } = {}) {
  const status = request && request.status;
  if (!PENDING_REQUEST_STATES.includes(status)) {
    return { pending: false, ageHours: 0, isStale: false };
  }
  const sec = request && request.requestedAt && request.requestedAt.seconds;
  if (!sec) return { pending: true, ageHours: 0, isStale: false };
  const ageHours = Math.max(0, (now.getTime() - sec * 1000) / 3600000);
  return { pending: true, ageHours, isStale: ageHours >= staleHours };
}

/**
 * يلخّص الطلبات المتأخّرة عبر قائمة.
 * @returns {{ staleCount:number, oldestHours:number }}
 */
export function summarizeStaleRequests(requests = [], opts = {}) {
  let staleCount = 0, oldestHours = 0;
  for (const r of (requests || [])) {
    const a = computeRequestAging(r, opts);
    if (a.isStale) { staleCount++; if (a.ageHours > oldestHours) oldestHours = a.ageHours; }
  }
  return { staleCount, oldestHours };
}

// ══════════════════════════════════════════════════════════
// SUPPLIER PAYMENT ANOMALY (كشف الشذوذ في دفعات الموردين)
// ══════════════════════════════════════════════════════════

/**
 * يكشف إن كانت دفعة المورد شاذّة مقارنةً بتاريخه:
 *   - مبلغ ≈ factor× متوسط دفعاته السابقة → high
 *   - أعلى دفعة لهذا المورد تاريخياً → med
 * يتطلّب تاريخاً كافياً (minHistory) وإلا لا يُطلِق شيئاً (يتجنّب الإنذار الكاذب).
 *
 * @param {Object} request — payment_request (type='supplier_payment', supplierId, amount, _id)
 * @param {Object} args
 * @param {Array}  args.allTxns — transactions_v2 (لاشتقاق تاريخ المورد)
 * @param {number} [args.factor=3]      — مضاعف المتوسط لاعتبار الشذوذ عالياً
 * @param {number} [args.minHistory=3]  — أقل عدد دفعات سابقة مطلوب
 * @param {Function} [args.format]
 * @returns {Array<{lvl:'high'|'med', txt:string}>}
 */
export function detectSupplierAnomaly(request, { allTxns = [], factor = 3, minHistory = 3, format } = {}) {
  const fmt = format || ((n) => (parseFloat(n) || 0).toLocaleString('ar-EG'));
  const risks = [];
  if (!request || request.type !== 'supplier_payment' || !request.supplierId) return risks;
  const amt = parseFloat(request.amount) || 0;
  if (!(amt > 0)) return risks;

  const hist = [];
  for (const t of (allTxns || [])) {
    if (!t || t.type !== 'out') continue;
    if (t.supplierId !== request.supplierId) continue;
    if (t.isReversal || t.isReversed) continue;
    if (request._id && t.paymentRequestId === request._id) continue; // استبعاد الحركة الحالية
    const a = parseFloat(t.amount) || 0;
    if (a > 0) hist.push(a);
  }
  if (hist.length < minHistory) return risks;

  const avg = hist.reduce((s, n) => s + n, 0) / hist.length;
  const max = Math.max(...hist);
  if (avg > 0 && amt > factor * avg) {
    risks.push({ lvl: 'high', txt: `📈 شاذّ: ${fmt(amt)} ج ≈ ${(amt / avg).toFixed(1)}× متوسط دفعات هذا المورد (${fmt(Math.round(avg))} ج)` });
  } else if (amt > max) {
    risks.push({ lvl: 'med', txt: `📊 أعلى دفعة لهذا المورد تاريخياً (الأعلى سابقاً ${fmt(max)} ج)` });
  }
  return risks;
}
