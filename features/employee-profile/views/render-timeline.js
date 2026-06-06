/**
 * Business2Card ERP — features/employee-profile/views/render-timeline.js
 *
 * ━━━ TIMELINE VIEW (البند 2 — السجل الموحّد للتواصل) ━━━
 *
 * Pure HTML builder للسلسلة الزمنية الموحّدة. يستهلك مخرجات المُجمِّع النقي
 * `core/employee-timeline.js` (buildEmployeeTimeline) — هذا الملف عرض فقط: لا
 * قراءة Firestore ولا منطق أعمال، يبني HTML من أحداث جاهزة.
 */

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function monthHeader(ts) {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * @param {Object} args
 * @param {Array} args.events — مخرجات buildEmployeeTimeline (مرتّبة تنازلياً)
 * @param {number} [args.limit=120] — حد الأحداث المعروضة (تفادي DOM ضخم)
 * @returns {string} HTML
 */
export function buildTimelineHTML({ events = [], limit = 120 } = {}) {
  if (!events.length) {
    return `<div class="empty"><div class="empty-icon">🗓️</div>
      <div class="empty-text">لا أحداث بعد بينك وبين هذا الموظف</div></div>`;
  }

  const shown = events.slice(0, limit);
  let lastMonth = '';
  const rows = shown.map(e => {
    const mh = monthHeader(e.ts);
    const sep = mh !== lastMonth ? `<div class="ep-tl-month">${esc(mh)}</div>` : '';
    lastMonth = mh;
    const dirCls = e.dir === 'in' ? 'ep-tl-in' : 'ep-tl-out';
    const dirLbl = e.dir === 'in' ? 'من الموظف' : 'من الإدارة';
    return `${sep}<div class="ep-tl-item tone-${esc(e.tone || 'neutral')} ${dirCls}">
      <div class="ep-tl-ico">${e.ico || '•'}</div>
      <div class="ep-tl-body">
        <div class="ep-tl-title">${esc(e.title)}</div>
        ${e.sub ? `<div class="ep-tl-sub">${esc(e.sub)}</div>` : ''}
        <div class="ep-tl-meta">${esc(dirLbl)} · ${esc(fmtDate(e.ts))}</div>
      </div>
    </div>`;
  }).join('');

  const more = events.length > limit
    ? `<div class="ep-tl-more">عُرض أحدث ${limit} من ${events.length} حدثاً</div>`
    : '';

  return `<div class="ep-tl">${rows}${more}</div>`;
}
