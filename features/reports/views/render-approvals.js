/**
 * Business2Card ERP — features/reports/views/render-approvals.js
 *
 * ━━━ APPROVALS TAB VIEW (reports god-page decomp) ━━━
 *
 * Pure HTML builder لتبويب «الاعتمادات». يستقبل stats مُحسَبة مسبقاً من
 * core/reports-approvals-stats.js + formatter اختياري.
 */

export const APPROVAL_STATUS_LABEL = {
  requested: '📤 مُرسَل', awaiting_receipt: '🧾 بانتظار إيصال',
  pending: '🔍 قيد المراجعة', confirmed: '✔️ مؤكَّد',
  approved: '✅ معتمد', rejected: '❌ مرفوض',
};
export const APPROVAL_TYPE_LABEL = {
  supplier_payment: '🏭 دفعة مورد', salary: '👤 مرتب',
  client_refund: '↩️ استرداد عميل', general: '🧾 مصروف عام', other: '📦 أخرى',
};

const defaultFormat = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

/** ms → نص عربي مختصر (يوم/ساعة/دقيقة). */
function fmtDur(msVal) {
  const m = Math.max(0, Math.round((parseFloat(msVal) || 0) / 60000));
  if (m < 1) return 'لحظي';
  if (m < 60) return `${m} دقيقة`;
  const h = Math.floor(m / 60), rm = m % 60;
  if (h < 24) return rm ? `${h} س ${rm} د` : `${h} ساعة`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d} ي ${rh} س` : `${d} يوم`;
}

const pct = (x) => `${Math.round((x || 0) * 100)}%`;

// ترتيب عرض الحالات (مطابق للدورة)
const APPROVAL_STATUSES_ORDER = ['requested', 'awaiting_receipt', 'pending', 'confirmed', 'approved', 'rejected'];

/**
 * يبني HTML تبويب الاعتمادات.
 * @param {Object} args — { stats, format? }
 */
export function buildApprovalsTabHTML({ stats, format } = {}) {
  const fmt = format || defaultFormat;
  if (!stats || !stats.hasAnyData) {
    return `<div class="rep-empty" style="padding:32px;text-align:center;color:var(--dim)">
      📋 لا توجد طلبات دفع بعد.</div>`;
  }
  if (stats.total === 0) {
    return `<div class="rep-empty" style="padding:32px;text-align:center;color:var(--dim)">
      📋 لا توجد طلبات دفع في هذه الفترة.</div>`;
  }

  const kpi = (label, value, sub = '') => `
    <div class="kpi-card" style="flex:1;min-width:140px;background:var(--card-2,#1e293b);border:1px solid var(--line,#334155);border-radius:var(--rad,12px);padding:14px">
      <div style="font-size:var(--fs-sm);color:var(--dim)">${label}</div>
      <div style="font-size:var(--fs-xl,22px);font-weight:var(--fw-bold,700)">${value}</div>
      ${sub ? `<div style="font-size:var(--fs-xs,11px);color:var(--dim)">${sub}</div>` : ''}
    </div>`;

  const kpis = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
    ${kpi('إجمالي الطلبات', fmt(stats.total))}
    ${kpi('معتمدة', `${fmt(stats.byStatus.approved || 0)} <span style="font-size:var(--fs-sm);color:var(--dim)">(${pct(stats.approvalRate)})</span>`)}
    ${kpi('مرفوضة', `${fmt(stats.byStatus.rejected || 0)} <span style="font-size:var(--fs-sm);color:var(--dim)">(${pct(stats.rejectionRate)})</span>`)}
    ${kpi('معلّقة الآن', fmt(stats.pendingCount), `${fmt(stats.pendingValue)} ج`)}
    ${kpi('متوسط زمن الاعتماد', fmtDur(stats.avgApprovalLatencyMs), 'من الإرسال للاعتماد')}
  </div>`;

  // status breakdown (بترتيب الدورة)
  const statusRows = APPROVAL_STATUSES_ORDER
    .filter(s => (stats.byStatus[s] || 0) > 0)
    .map(s => `<tr style="border-top:1px solid var(--line,#334155)">
      <td>${APPROVAL_STATUS_LABEL[s] || s}</td>
      <td style="text-align:left">${fmt(stats.byStatus[s] || 0)}</td>
      <td style="text-align:left">${fmt(stats.amtByStatus[s] || 0)} ج</td></tr>`).join('');

  const typeRows = Object.entries(stats.byType)
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([t, v]) => `<tr style="border-top:1px solid var(--line,#334155)">
      <td>${APPROVAL_TYPE_LABEL[t] || t}</td>
      <td style="text-align:left">${fmt(v.count)}</td>
      <td style="text-align:left">${fmt(v.amount)} ج</td></tr>`).join('');

  const reasonRows = stats.reasonsSorted.length
    ? stats.reasonsSorted.map(([r, c]) => `<tr style="border-top:1px solid var(--line,#334155)">
        <td>${r}</td><td style="text-align:left">${fmt(c)}</td></tr>`).join('')
    : `<tr><td colspan="2" style="color:var(--dim);padding:8px">لا رفض في هذه الفترة 🎉</td></tr>`;

  const requesterRows = stats.requestersSorted
    .map(([n, c]) => `<tr style="border-top:1px solid var(--line,#334155)">
      <td>${n}</td><td style="text-align:left">${fmt(c)}</td></tr>`).join('');

  const tbl = (title, head, body) => `
    <div style="flex:1;min-width:280px">
      <h3 style="font-size:var(--fs-md);margin:0 0 8px">${title}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">
        <tr style="color:var(--dim);text-align:right">${head}</tr>${body}
      </table>
    </div>`;

  return `<div class="rep-approvals">
    ${kpis}
    <div style="display:flex;gap:24px;flex-wrap:wrap">
      ${tbl('التوزّع بالحالة', '<th>الحالة</th><th style="text-align:left">عدد</th><th style="text-align:left">قيمة</th>', statusRows)}
      ${tbl('التوزّع بالنوع', '<th>النوع</th><th style="text-align:left">عدد</th><th style="text-align:left">قيمة</th>', typeRows)}
    </div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:18px">
      ${tbl('أسباب الرفض', '<th>السبب</th><th style="text-align:left">مرّات</th>', reasonRows)}
      ${tbl('أكثر الطالبين', '<th>المستخدم</th><th style="text-align:left">طلبات</th>', requesterRows)}
    </div>
    ${stats.avgRejectLatencyMs ? `<div style="margin-top:14px;font-size:var(--fs-sm);color:var(--dim)">⏱️ متوسط زمن الرفض: ${fmtDur(stats.avgRejectLatencyMs)}</div>` : ''}
  </div>`;
}
