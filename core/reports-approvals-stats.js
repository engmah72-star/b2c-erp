/**
 * Business2Card ERP — core/reports-approvals-stats.js
 *
 * ━━━ APPROVALS TAB AGGREGATOR (Phase · reports god-page decomp) ━━━
 *
 * Pure aggregator لتبويب «الاعتمادات» في reports.html — يلخّص payment_requests
 * خلال فترة: التوزّع بالحالة/النوع، أسباب الرفض، معدّلات الاعتماد/الرفض،
 * متوسط زمن الاعتماد (SLA)، والمتراكم المعلّق. لا I/O — قابل للاختبار.
 */

const ms = (v) => (v && v.seconds) ? v.seconds * 1000 : (typeof v === 'number' ? v : 0);

/** هل الطلب داخل الفترة (حسب requestedAt)؟ بلا range → الكل. */
export function inRangeRequest(r, range) {
  if (!range) return true;
  const t = ms(r && r.requestedAt);
  if (!t) return false;
  const d = new Date(t);
  return d >= range.from && d <= range.to;
}

export const APPROVAL_STATUSES = ['requested', 'awaiting_receipt', 'pending', 'confirmed', 'approved', 'rejected'];
const PENDING_STATES = ['requested', 'awaiting_receipt', 'pending', 'confirmed'];

/**
 * يلخّص طلبات الدفع خلال فترة.
 *
 * @param {Array} allRequests — payment_requests (كامل، لكشف "لا بيانات")
 * @param {{from:Date,to:Date}|null} range
 * @returns {Object} stats
 */
export function buildApprovalsStats(allRequests = [], range = null) {
  const reqs = (allRequests || []).filter(r => inRangeRequest(r, range));

  const byStatus = {}; const amtByStatus = {};
  APPROVAL_STATUSES.forEach(s => { byStatus[s] = 0; amtByStatus[s] = 0; });
  const byType = {};        // type -> { count, amount }
  const reasons = {};       // rejectReason -> count
  const requesters = {};    // requestedByName -> count
  let approvalLatSum = 0, approvalLatN = 0;   // requested→approved
  let rejectLatSum = 0, rejectLatN = 0;       // requested→rejected
  let pendingCount = 0, pendingValue = 0;

  for (const r of reqs) {
    const amt = parseFloat(r.amount) || 0;
    const s = r.status || 'requested';
    if (byStatus[s] === undefined) { byStatus[s] = 0; amtByStatus[s] = 0; }
    byStatus[s]++; amtByStatus[s] += amt;

    const t = r.type || 'other';
    if (!byType[t]) byType[t] = { count: 0, amount: 0 };
    byType[t].count++; byType[t].amount += amt;

    if (s === 'rejected') {
      const reason = (r.rejectReason || '').trim() || '— بدون سبب';
      reasons[reason] = (reasons[reason] || 0) + 1;
      const lat = ms(r.rejectedAt) - ms(r.requestedAt);
      if (lat > 0) { rejectLatSum += lat; rejectLatN++; }
    }
    if (s === 'approved') {
      const lat = ms(r.approvedAt) - ms(r.requestedAt);
      if (lat > 0) { approvalLatSum += lat; approvalLatN++; }
    }
    if (PENDING_STATES.includes(s)) { pendingCount++; pendingValue += amt; }

    const who = r.requestedByName || '—';
    requesters[who] = (requesters[who] || 0) + 1;
  }

  const total = reqs.length;
  const rejected = byStatus.rejected || 0;
  const approved = byStatus.approved || 0;

  return {
    hasAnyData: (allRequests || []).length > 0,
    total,
    byStatus, amtByStatus,
    byType,
    reasonsSorted: Object.entries(reasons).sort((a, b) => b[1] - a[1]),
    requestersSorted: Object.entries(requesters).sort((a, b) => b[1] - a[1]).slice(0, 10),
    rejectionRate: total ? rejected / total : 0,
    approvalRate: total ? approved / total : 0,
    avgApprovalLatencyMs: approvalLatN ? Math.round(approvalLatSum / approvalLatN) : 0,
    avgRejectLatencyMs: rejectLatN ? Math.round(rejectLatSum / rejectLatN) : 0,
    pendingCount, pendingValue,
  };
}
