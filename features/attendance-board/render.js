/**
 * Business2Card ERP — features/attendance-board/render.js
 *
 * ━━━ DAILY ATTENDANCE BOARD — PURE VIEW BUILDERS (Phase-4) ━━━
 *
 * Pure HTML builders for attendance.html (the manager-only daily roster).
 * No DOM, no Firestore, no globals. Status comes pre-resolved by
 * core/attendance-core.resolveDayStatus; this module only paints it and
 * exposes the manager actions (central check-in + permission approve/reject)
 * as data-act buttons the page wires by delegation.
 */

export const STATUS_META = {
  present:  { lbl: 'حاضر',    ico: '🟢', color: 'var(--g)' },
  late:     { lbl: 'متأخر',   ico: '🟠', color: 'var(--y)' },
  absent:   { lbl: 'غائب',    ico: '🔴', color: 'var(--r)' },
  leave:    { lbl: 'إجازة',   ico: '🏖️', color: 'var(--b)' },
  mission:  { lbl: 'مأمورية', ico: '🚗', color: 'var(--b)' },
  remote:   { lbl: 'عن بُعد', ico: '🏠', color: 'var(--b)' },
  off:      { lbl: 'عطلة',    ico: '⚪', color: 'var(--dim2)' },
  upcoming: { lbl: '—',       ico: '⚪', color: 'var(--dim2)' },
};

const PERM_LBL = {
  late_in: 'تأخير', early_out: 'انصراف مبكر',
  mission: 'مأمورية', remote: 'عن بُعد', partial: 'جزئي',
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Summary chips (counts per status).
 * @param {Object} counts — { present, late, absent, leave, off, ... }
 */
export function buildBoardSummaryHTML(counts = {}) {
  const order = ['present', 'late', 'absent', 'leave', 'mission', 'remote', 'off'];
  const chips = order
    .filter(k => (counts[k] || 0) > 0)
    .map(k => {
      const m = STATUS_META[k] || STATUS_META.off;
      return `<span class="ab-chip" style="border-color:${m.color};color:${m.color}">${m.ico} ${m.lbl} <strong>${counts[k]}</strong></span>`;
    }).join('');
  const pend = (counts.pending || 0) > 0
    ? `<span class="ab-chip" style="border-color:var(--y);color:var(--y)">🟡 أذونات معلّقة <strong>${counts.pending}</strong></span>`
    : '';
  return chips + pend || '<span class="txt-meta-sm">لا بيانات لهذا اليوم</span>';
}

/**
 * Build the roster.
 *
 * @param {Object} args
 * @param {Array}   args.rows     — [{ empId, authUid, name, role, status,
 *                                     lateMinutes, checkInStr, checkOutStr,
 *                                     overtime, overtimeNote,
 *                                     expectedStart, canCheckin, pending:[] }]
 * @param {boolean} [args.canManage] — show check-in / approve / reject actions
 * @returns {string} HTML
 */
export function buildAttendanceBoardHTML({ rows = [], canManage = false, showHours = false }) {
  if (!rows.length) {
    return `<div class="empty-cta"><div class="empty-icon">🕐</div>
      <div class="empty-text">لا يوجد موظفون لعرضهم</div></div>`;
  }
  return rows.map(r => {
    const m = STATUS_META[r.status] || STATUS_META.off;
    const timeBit = r.checkInStr
      ? `<span class="txt-meta-sm">${esc(r.checkInStr)}${r.checkOutStr ? ' → ' + esc(r.checkOutStr) : ''}</span>`
      : '';
    const lateBit = (r.lateMinutes > 0)
      ? `<span class="txt-meta-sm" style="color:var(--y)">⏰ ${r.lateMinutes}د</span>` : '';
    const otBit = r.overtime
      ? `<span class="txt-meta-sm" style="color:var(--y)" title="${esc(r.overtimeNote || '')}">⏱️ أوفر تايم${r.overtimeNote ? ' · ' + esc(r.overtimeNote) : ''}</span>` : '';
    const checkinBtn = (canManage && r.canCheckin)
      ? `<button type="button" class="btn btn-b btn-xs" data-act="board-checkin" data-emp="${esc(r.empId)}" data-uid="${esc(r.authUid)}" data-name="${esc(r.name)}" data-start="${esc(r.expectedStart || '')}">✓ حضور</button>`
      : '';
    // overtime confirmation (manager): approve the self-started overtime
    const otOk = (canManage && r.overtime && !r.overtimeApproved)
      ? `<button type="button" class="btn btn-g btn-xs" data-act="board-overtime-ok" data-emp="${esc(r.empId)}" data-uid="${esc(r.authUid)}" title="تأكيد الأوفر تايم">✅ أكّد الأوفر تايم</button>`
      : '';
    const otDone = (r.overtime && r.overtimeApproved)
      ? `<span class="txt-meta-sm" style="color:var(--g)">✓ أوفر تايم معتمد</span>` : '';
    // set work hours (employee-control only — opens the schedule editor)
    const hoursBtn = (canManage && showHours)
      ? `<button type="button" class="btn btn-ghost btn-xs" data-act="board-hours" data-emp="${esc(r.empId)}" title="تحديد ساعات العمل">🕐 ساعات</button>`
      : '';
    const pend = (r.pending || []).map(p =>
      `<div class="ab-pend">
        <span class="bdg-mini">🟡 ${PERM_LBL[p.type] || esc(p.type)}${(parseInt(p.minutes) || 0) > 0 ? ' · ' + (parseInt(p.minutes) || 0) + 'د' : ''}</span>
        ${p.reason ? `<span class="txt-meta-sm">${esc(p.reason)}</span>` : ''}
        ${canManage ? `<button type="button" class="btn btn-g btn-xs" data-act="board-approve" data-perm="${esc(p._id)}" title="اعتماد">✅</button>
        <button type="button" class="btn btn-ghost btn-xs" data-act="board-reject" data-perm="${esc(p._id)}" title="رفض">🚫</button>` : ''}
      </div>`).join('');
    return `<div class="ab-row">
      <div class="ab-main">
        <div class="ab-id">
          <span class="ab-status" style="color:${m.color}">${m.ico}</span>
          <div class="min-w-0">
            <div class="ab-name">${esc(r.name || '—')}</div>
            <div class="txt-meta-sm">${esc(r.role || '')}</div>
          </div>
        </div>
        <div class="ab-meta">
          <span class="ab-badge" style="border-color:${m.color};color:${m.color}">${m.lbl}</span>
          ${timeBit}${lateBit}${otBit}${otDone}${checkinBtn}${otOk}${hoursBtn}
        </div>
      </div>
      ${pend}
    </div>`;
  }).join('');
}
