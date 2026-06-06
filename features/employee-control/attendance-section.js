// ════════════════════════════════════════════════════════════════════
// features/employee-control/attendance-section.js
// Attendance board for the Employee Control Center («لوحة الموظفين»):
//   • SELF punch (the logged-in manager records their OWN check-in/out), and
//   • a full MANAGER board of every employee's day — status + times + overtime
//     — with manager actions: record-for-absent, set work hours (🕐), approve a
//     self-started overtime (✅), and approve/reject pending permissions.
// Pure HTML builder — no DOM, no Firestore. The day-status comes from the
// single source attendance-core.resolveDayStatus; rows are rendered by the
// shared attendance-board builder so the board looks the same everywhere.
// ════════════════════════════════════════════════════════════════════

import { resolveDayStatus } from '../../core/attendance-core.js';
import { buildBoardSummaryHTML, buildAttendanceBoardHTML } from '../attendance-board/render.js';
import { ROLE_LABELS } from './render.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * @param {Object} args
 * @param {Object} [args.myEmp]     — the logged-in user's employee doc (or null → no self punch)
 * @param {Object} [args.myRecord]  — today's attendance record for the user (or null)
 * @param {Array}  args.employees   — all employees (for the board + summary)
 * @param {Array}  args.attToday    — today's attendance records
 * @param {Array}  [args.leaves]    — leaves (for resolveDayStatus)
 * @param {Array}  [args.permsToday]— today's permissions (for resolveDayStatus + pending)
 * @param {boolean}[args.canManage] — show the manager board actions
 * @returns {string} HTML
 */
export function buildAttendanceSectionHTML({ myEmp, myRecord, employees = [], attToday = [], leaves = [], permsToday = [], canManage = false }) {
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

  // ── per-employee rows (status from the single source) + summary counts ──
  const counts = {};
  const rows = employees
    .filter(e => (e.status || 'active') === 'active')
    .map(e => {
      const uid = e.authUid || e._id;
      const rec = attToday.find(a => a.employeeUid === uid || a.employeeId === e._id || a.employeeId === uid) || null;
      const lvs = leaves.filter(lv => lv.employeeId === e._id || lv.employeeUid === uid);
      const prm = permsToday.filter(p => p.employeeId === e._id || p.employeeUid === uid);
      const ds = resolveDayStatus({ date: today, today, record: rec, leaves: lvs, permissions: prm, workSchedule: e.workSchedule });
      counts[ds.status] = (counts[ds.status] || 0) + 1;
      const pending = prm.filter(p => p.date === today && p.status === 'pending');
      counts.pending = (counts.pending || 0) + pending.length;
      return {
        empId: e._id, authUid: uid, name: e.name || '—', role: ROLE_LABELS[e.role] || e.role || '',
        status: ds.status, lateMinutes: ds.lateMinutes || 0,
        checkInStr: ds.checkInStr || '', checkOutStr: ds.checkOutStr || '',
        overtime: !!(rec && rec.overtime), overtimeNote: (rec && rec.overtimeNote) || '',
        overtimeApproved: !!(rec && rec.overtimeApproved),
        expectedStart: e.workSchedule?.startTime || '',
        canCheckin: ds.status === 'absent',
        pending,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  const board = canManage
    ? `<details class="ec-att-board" open>
         <summary class="ec-att-board-sum">👥 بورد اليوم — حضور · انصراف · أوفر تايم</summary>
         <div class="ec-att-board-body">${buildAttendanceBoardHTML({ rows, canManage: true, showHours: true })}</div>
       </details>`
    : '';

  return `<section class="ec-att-section">
    <div class="ec-att-head">
      <span class="ec-att-title">🕐 الحضور والانصراف</span>
      ${myEmp ? `<div class="ec-att-self">${punch}</div>` : `<span class="ec-att-hint">سجّل حضورك من حسابك كموظف</span>`}
    </div>
    <div class="ec-att-summary">${buildBoardSummaryHTML(counts)}</div>
    ${board}
  </section>`;
}
