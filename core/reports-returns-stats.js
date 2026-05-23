/**
 * Business2Card ERP — core/reports-returns-stats.js
 *
 * ━━━ RETURNS TAB AGGREGATOR (Phase-1E · reports god-page decomp) ━━━
 *
 * Pure aggregator for the returns tab — KPIs, reasons breakdown, blamed-party,
 * top clients, time-to-refund avg.
 */

const inRangeTx = (t, range) => {
  if (!range) return false;
  const sec = t?.createdAt?.seconds || 0;
  if (!sec) return false;
  const d = new Date(sec * 1000);
  return d >= range.from && d <= range.to;
};

/**
 * Aggregate return tickets within a period.
 *
 * @param {Array} allReturns       — full returns_tickets array (used to detect "no data ever")
 * @param {Array} filteredOrders   — orders filtered to the same range (for return rate denominator)
 * @param {{from: Date, to: Date}} range
 *
 * @returns {{
 *   hasAnyData: boolean,
 *   periodRets: Array,
 *   totalReturns, returnRate, refundedAmt, active, slaBreached, pendingValue,
 *   reasonsSorted: [[reason, count]],
 *   maxReasonCount: number,
 *   blameSorted: [[party, count]],
 *   topClients: [{name, count, amount}],
 *   avgTimeToRefundDays: number,
 *   hasRefundTimes: boolean,
 *   recent: Array (last 10 of periodRets, ordered as input)
 * }}
 */
export function buildReturnsStats(allReturns = [], filteredOrders = [], range) {
  const hasAnyData = (allReturns || []).length > 0;
  const periodRets = (allReturns || []).filter(t => inRangeTx(t, range));

  const totalOrders = filteredOrders.length || 1;
  const refunded = periodRets.filter(t => t.status === 'refunded');
  const refundedAmt = refunded.reduce((s, t) => s + (parseFloat(t.refundAmount) || 0), 0);

  const totalReturns = periodRets.length;
  const returnRate = (totalReturns / totalOrders * 100).toFixed(1);
  const slaBreached = periodRets.filter(t =>
    t.slaBreached === true && !['cancelled', 'closed'].includes(t.status)
  ).length;
  const active = periodRets.filter(t =>
    !['cancelled', 'closed', 'refunded', 'rejected'].includes(t.status)
  ).length;
  const pendingValue = periodRets
    .filter(t => ['approved'].includes(t.status))
    .reduce((s, t) => s + (parseFloat(t.refundAmount) || 0), 0);

  // reasons map
  const reasonsMap = {};
  for (const t of periodRets) {
    const r = t.reason || 'other';
    reasonsMap[r] = (reasonsMap[r] || 0) + 1;
  }
  const reasonsSorted = Object.entries(reasonsMap).sort((a, b) => b[1] - a[1]);
  const maxReasonCount = reasonsSorted[0]?.[1] || 1;

  // blamed party
  const blameMap = {};
  for (const t of periodRets) {
    const b = t.blamedParty || 'unknown';
    blameMap[b] = (blameMap[b] || 0) + 1;
  }
  const blameSorted = Object.entries(blameMap).sort((a, b) => b[1] - a[1]);

  // avg time to refund (days)
  let avgTimeToRefundDays = 0;
  const refundedWithTimes = refunded.filter(t => t.requestedAt?.seconds && t.refundedAt?.seconds);
  if (refundedWithTimes.length) {
    const totalSec = refundedWithTimes.reduce(
      (s, t) => s + (t.refundedAt.seconds - t.requestedAt.seconds), 0
    );
    avgTimeToRefundDays = totalSec / refundedWithTimes.length / 86400;
  }

  // top clients by return count
  const clientMap = {};
  for (const t of periodRets) {
    const k = t.clientId || t.clientName || 'unknown';
    if (!clientMap[k]) clientMap[k] = { name: t.clientName || k, count: 0, amount: 0 };
    clientMap[k].count++;
    clientMap[k].amount += parseFloat(t.refundAmount) || 0;
  }
  const topClients = Object.values(clientMap).sort((a, b) => b.count - a.count).slice(0, 5);

  return {
    hasAnyData,
    periodRets,
    totalReturns,
    returnRate,
    refundedAmt,
    active,
    slaBreached,
    pendingValue,
    reasonsSorted,
    maxReasonCount,
    blameSorted,
    topClients,
    avgTimeToRefundDays,
    hasRefundTimes: refundedWithTimes.length > 0,
    recent: periodRets.slice(0, 10),
  };
}
