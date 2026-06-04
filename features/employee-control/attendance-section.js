// ════════════════════════════════════════════════════════════════════
// features/employee-control/attendance-section.js
// Attendance section for the Employee Control Center — SELF (decentralised),
// not central: the logged-in user punches their OWN check-in/out; the section
// also shows a read-only daily summary of the team. No "record for someone
// else" here (that lives on attendance.html / the employees board).
// Pure HTML builder — no DOM, no Firestore.
// ════════════════════════════════════════════════════════════════════

import { resolveDayStatus } from '../../core/attendance-core.js';
import { buildBoardSummaryHTML } from '../attendance-board/render.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * @param {Object} args
 * @param {Object} [args.myEmp]     — the logged-in user's employee doc (or null → no self punch)
 * @param {Object} [args.myRecord]  — today's attendance record for the user (or null)
 * @param {Array}  args.employees   — all employees (for the summary)
 * @param {Array}  args.attToday    — today's attendance records
 * @param {Array}  [args.leaves]    — leaves (for resolveDayStatus)
 * @param {Array}  [args.permsToday]— today's permissions (for resolveDayStatus + pending count)
 * @returns {string} HTML
 */
export function buildAttendanceSectionHTML({ myEmp, myRecord, employees = [], attToday = [], leaves = [], permsToday = [] }) {
  const today = new Date().toISOString().slice(0, 10);

  // ── self punch (decentralised — the user records their own) ──
  let punch = '';
  if (myEmp) {
    if (!myRecord || !myRecord.checkIn) {
      punch = `<button type="button" class="btn btn-g btn-sm ec-self-punch" data-att="in">🟢 تسجيل حضوري</button>`;
    } else if (!myRecord.checkOut) {
      const late = (parseInt(myRecord.lateMinutes) || 0) > 0 ? ` · متأخر ${parseInt(myRecord.lateMinutes) || 0}د` : '';
      punch = `<button type="button" class="btn btn-r btn-sm ec-self-punch" data-att="out">🔴 تسجيل انصرافي</button>`
            + `<span class="ec-self-since">حاضر منذ ${esc(myRecord.checkInStr || '')}${late}</span>`;
    } else {
      punch = `<span class="ec-self-done">✓ سجّلت اليوم · ${esc(myRecord.checkInStr || '')} → ${esc(myRecord.checkOutStr || '')}</span>`;
    }
  }

  // ── team daily summary (monitoring, read-only) ──
  const counts = {};
  employees.filter(e => (e.status || 'active') === 'active').forEach(e => {
    const uid = e.authUid || e._id;
    const rec = attToday.find(a => a.employeeUid === uid || a.employeeId === e._id || a.employeeId === uid) || null;
    const lvs = leaves.filter(lv => lv.employeeId === e._id || lv.employeeUid === uid);
    const prm = permsToday.filter(p => p.employeeId === e._id || p.employeeUid === uid);
    const ds = resolveDayStatus({ date: today, today, record: rec, leaves: lvs, permissions: prm, workSchedule: e.workSchedule });
    counts[ds.status] = (counts[ds.status] || 0) + 1;
    counts.pending = (counts.pending || 0) + prm.filter(p => p.status === 'pending').length;
  });

  return `<section class="ec-att-section">
    <div class="ec-att-head">
      <span class="ec-att-title">🕐 الحضور والانصراف</span>
      ${myEmp ? `<div class="ec-att-self">${punch}</div>` : `<span class="ec-att-hint">سجّل حضورك من حسابك كموظف</span>`}
    </div>
    <div class="ec-att-summary">${buildBoardSummaryHTML(counts)}</div>
  </section>`;
}
