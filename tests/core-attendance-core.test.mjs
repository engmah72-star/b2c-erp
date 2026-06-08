/**
 * Node-runnable tests for core/attendance-core.js (Phase-0 de-dup).
 * Run: node tests/core-attendance-core.test.mjs
 *
 * Pure tests — no Firestore, no DOM. Locks the day-status primitives that
 * were unified from three byte-identical inline copies (salary-calc,
 * scoring, render-attendance) so the single source can't regress.
 */
import {
  isWorkDayFor, isLeaveDayFor, computeLateMinutes,
  excusedLateMinutes, PERMISSION_TYPES, PERMISSION_STATUS,
  resolveDayStatus,
  computeWorkedMinutes, scheduledMinutes, computeOvertimeMinutes,
  attendanceDocId,
} from '../core/attendance-core.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}\n    ${e.message}`);
    failed++;
  }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// Weekday anchors (verified): 2026-06-03 Wed, 06-05 Fri, 06-06 Sat, 06-07 Sun

// ── isWorkDayFor: default week (no schedule) ────────────────────────
test('default week: Wednesday is a work day', () => {
  assertEq(isWorkDayFor('2026-06-03'), true);
});
test('default week: Friday is OFF', () => {
  assertEq(isWorkDayFor('2026-06-05'), false);
});
test('default week: Saturday is OFF', () => {
  assertEq(isWorkDayFor('2026-06-06'), false);
});
test('default week: Sunday is a work day', () => {
  assertEq(isWorkDayFor('2026-06-07'), true);
});
test('empty days list falls back to default week', () => {
  assertEq(isWorkDayFor('2026-06-05', { days: [] }), false);
  assertEq(isWorkDayFor('2026-06-03', { days: [] }), true);
});

// ── isWorkDayFor: explicit schedule ─────────────────────────────────
test('explicit days list is authoritative', () => {
  // Sun..Thu (0-4): Friday off, Saturday off
  const ws = { days: [0, 1, 2, 3, 4] };
  assertEq(isWorkDayFor('2026-06-07', ws), true);  // Sun
  assertEq(isWorkDayFor('2026-06-05', ws), false); // Fri
});
test('explicit list can make Saturday a work day', () => {
  const ws = { days: [6] }; // Saturday only
  assertEq(isWorkDayFor('2026-06-06', ws), true);  // Sat
  assertEq(isWorkDayFor('2026-06-07', ws), false); // Sun
});

// ── isLeaveDayFor ───────────────────────────────────────────────────
test('no leaves → never a leave day', () => {
  assertEq(isLeaveDayFor('2026-06-03', []), false);
  assertEq(isLeaveDayFor('2026-06-03'), false);
});
test('single-day leave (endDate omitted) matches startDate only', () => {
  const leaves = [{ startDate: '2026-06-03' }];
  assertEq(isLeaveDayFor('2026-06-03', leaves), true);
  assertEq(isLeaveDayFor('2026-06-04', leaves), false);
});
test('range leave covers inclusive bounds', () => {
  const leaves = [{ startDate: '2026-06-03', endDate: '2026-06-07' }];
  assertEq(isLeaveDayFor('2026-06-03', leaves), true);  // start
  assertEq(isLeaveDayFor('2026-06-05', leaves), true);  // middle
  assertEq(isLeaveDayFor('2026-06-07', leaves), true);  // end
  assertEq(isLeaveDayFor('2026-06-08', leaves), false); // after
  assertEq(isLeaveDayFor('2026-06-02', leaves), false); // before
});
test('matches if any leave in the list covers the date', () => {
  const leaves = [
    { startDate: '2026-06-01', endDate: '2026-06-02' },
    { startDate: '2026-06-10', endDate: '2026-06-12' },
  ];
  assertEq(isLeaveDayFor('2026-06-11', leaves), true);
  assertEq(isLeaveDayFor('2026-06-05', leaves), false);
});

// ── computeLateMinutes ──────────────────────────────────────────────
// Dates built from local components; the helper also reads local components,
// so results are timezone-independent.
const at = (h, m) => new Date(2026, 5, 3, h, m); // 2026-06-03 local

test('no expectedStart → 0 (never penalise on missing schedule)', () => {
  assertEq(computeLateMinutes(at(10, 0), ''), 0);
  assertEq(computeLateMinutes(at(10, 0), undefined), 0);
});
test('unparseable expectedStart → 0', () => {
  assertEq(computeLateMinutes(at(10, 0), 'abc'), 0);
});
test('on-time (exact start, no grace) → 0', () => {
  assertEq(computeLateMinutes(at(9, 0), '09:00', 0), 0);
});
test('early arrival → 0', () => {
  assertEq(computeLateMinutes(at(8, 45), '09:00', 0), 0);
});
test('late beyond zero grace counts every minute', () => {
  assertEq(computeLateMinutes(at(9, 45), '09:00', 0), 45);
});
test('within grace window → 0', () => {
  assertEq(computeLateMinutes(at(9, 10), '09:00', 15), 0);
});
test('past grace window counts overflow only', () => {
  assertEq(computeLateMinutes(at(9, 20), '09:00', 15), 5);
});
test('respects HH:MM minutes component', () => {
  assertEq(computeLateMinutes(at(10, 0), '09:30', 0), 30);
});
test('legacy parity: 09:00 start, 09:20 arrival, 15 grace → 5', () => {
  // matches the old inline employee-profile.html formula (actual-expected-15)
  assertEq(computeLateMinutes(at(9, 20), '09:00', 15), 5);
});
test('accepts a timestamp/ISO input, not just Date', () => {
  assertEq(computeLateMinutes(at(9, 30).getTime(), '09:00', 0), 30);
});

// ── excusedLateMinutes (permissions) ────────────────────────────────
const D = '2026-06-03';
const approved = (type, extra = {}) => ({ date: D, type, status: 'approved', ...extra });

test('enums are frozen with expected members', () => {
  assertEq(PERMISSION_TYPES.LATE_IN, 'late_in');
  assertEq(PERMISSION_STATUS.APPROVED, 'approved');
  assertEq(Object.isFrozen(PERMISSION_TYPES), true);
});
test('no permissions → 0 excused', () => {
  assertEq(excusedLateMinutes(D, []), 0);
  assertEq(excusedLateMinutes(D), 0);
});
test('pending late_in does NOT excuse (only approved counts)', () => {
  assertEq(excusedLateMinutes(D, [{ date: D, type: 'late_in', status: 'pending' }]), 0);
});
test('rejected mission does NOT excuse', () => {
  assertEq(excusedLateMinutes(D, [{ date: D, type: 'mission', status: 'rejected' }]), 0);
});
test('approved late_in / mission / remote fully excuse (Infinity)', () => {
  assertEq(excusedLateMinutes(D, [approved('late_in')]), Infinity);
  assertEq(excusedLateMinutes(D, [approved('mission')]), Infinity);
  assertEq(excusedLateMinutes(D, [approved('remote')]), Infinity);
});
test('approved partial returns its minutes', () => {
  assertEq(excusedLateMinutes(D, [approved('partial', { minutes: 30 })]), 30);
});
test('partial minutes sum across multiple same-day permissions', () => {
  assertEq(excusedLateMinutes(D, [approved('partial', { minutes: 20 }), approved('partial', { minutes: 15 })]), 35);
});
test('a full excuse wins over partials on the same day', () => {
  assertEq(excusedLateMinutes(D, [approved('partial', { minutes: 20 }), approved('mission')]), Infinity);
});
test('early_out is ignored for late arrival', () => {
  assertEq(excusedLateMinutes(D, [approved('early_out', { minutes: 60 })]), 0);
});
test('permission on a different date does not apply', () => {
  assertEq(excusedLateMinutes(D, [{ date: '2026-06-04', type: 'late_in', status: 'approved' }]), 0);
});

// ── resolveDayStatus (daily board) ──────────────────────────────────
// 2026-06-03 Wed (work day), 06-05 Fri (off), today anchor 2026-06-10
const ST = (args) => resolveDayStatus({ today: '2026-06-10', ...args }).status;

test('check-in record on time → present', () => {
  assertEq(ST({ date: '2026-06-03', record: { checkIn: true, lateMinutes: 0 } }), 'present');
});
test('check-in record late → late (with minutes)', () => {
  const r = resolveDayStatus({ date: '2026-06-03', today: '2026-06-10', record: { checkIn: true, lateMinutes: 45 } });
  assertEq(r.status, 'late');
  assertEq(r.lateMinutes, 45);
});
test('late record forgiven by approved late_in → present', () => {
  const r = resolveDayStatus({
    date: '2026-06-03', today: '2026-06-10',
    record: { checkIn: true, lateMinutes: 45 },
    permissions: [{ date: '2026-06-03', type: 'late_in', status: 'approved' }],
  });
  assertEq(r.status, 'present');
  assertEq(r.lateMinutes, 0);
});
test('no record + leave → leave', () => {
  assertEq(ST({ date: '2026-06-03', leaves: [{ startDate: '2026-06-03' }] }), 'leave');
});
test('no record + approved mission → mission', () => {
  assertEq(ST({ date: '2026-06-03', permissions: [{ date: '2026-06-03', type: 'mission', status: 'approved' }] }), 'mission');
});
test('no record on a non-work day → off', () => {
  assertEq(ST({ date: '2026-06-05' }), 'off'); // Friday
});
test('no record on a future work day → upcoming', () => {
  assertEq(ST({ date: '2026-06-11' }), 'upcoming'); // after today anchor
});
test('no record on a past work day → absent', () => {
  assertEq(ST({ date: '2026-06-03' }), 'absent');
});

// ── worked hours / overtime (Phase-5) ───────────────────────────────
const rec = (h1, m1, h2, m2) => ({
  checkInAt: new Date(2026, 5, 3, h1, m1),
  checkOutAt: new Date(2026, 5, 3, h2, m2),
});

test('computeWorkedMinutes: missing timestamps → 0', () => {
  assertEq(computeWorkedMinutes(null), 0);
  assertEq(computeWorkedMinutes({ checkIn: true }), 0); // legacy record, no checkInAt
  assertEq(computeWorkedMinutes({ checkInAt: new Date() }), 0); // no checkout
});
test('computeWorkedMinutes: 09:00→18:00 = 540', () => {
  assertEq(computeWorkedMinutes(rec(9, 0, 18, 0)), 540);
});
test('computeWorkedMinutes: deducts break', () => {
  assertEq(computeWorkedMinutes(rec(9, 0, 18, 0), { breakMinutes: 60 }), 480);
});
test('computeWorkedMinutes: checkout before checkin → 0', () => {
  assertEq(computeWorkedMinutes(rec(18, 0, 9, 0)), 0);
});
test('computeWorkedMinutes: accepts {seconds} timestamps', () => {
  const base = Math.floor(new Date(2026, 5, 3, 9, 0).getTime() / 1000);
  assertEq(computeWorkedMinutes({ checkInAt: { seconds: base }, checkOutAt: { seconds: base + 3600 } }), 60);
});
test('scheduledMinutes: 09:00–17:00 = 480 (− break)', () => {
  assertEq(scheduledMinutes({ startTime: '09:00', endTime: '17:00' }), 480);
  assertEq(scheduledMinutes({ startTime: '09:00', endTime: '17:00' }, { breakMinutes: 60 }), 420);
  assertEq(scheduledMinutes({ startTime: '09:00' }), 0); // no end
  assertEq(scheduledMinutes(null), 0);
});
test('computeOvertimeMinutes: only beyond scheduled', () => {
  assertEq(computeOvertimeMinutes(540, 480), 60);
  assertEq(computeOvertimeMinutes(400, 480), 0);
  assertEq(computeOvertimeMinutes(0, 480), 0);
});

// ── attendanceDocId — the central identity that fixes "نص نص" ────────
// The whole point: every surface must land on ONE doc per employee/day. A
// role dashboard passes authUid as employeeId; the control center/profile pass
// the employees doc id — they MUST still converge on the same record.
test('attendanceDocId: keyed on authUid when present (canonical)', () => {
  assertEq(attendanceDocId({ employeeUid: 'U123', employeeId: 'EMP9', date: '2026-06-03' }), 'U123_2026-06-03');
});
test('attendanceDocId: dashboard (uid) and control center (emp id) CONVERGE', () => {
  // dashboard call: employeeId=uid, employeeUid=uid
  const fromDashboard = attendanceDocId({ employeeUid: 'U123', employeeId: 'U123', date: '2026-06-03' });
  // control center / profile call: employeeId=emp doc id, employeeUid=uid
  const fromControl   = attendanceDocId({ employeeUid: 'U123', employeeId: 'EMP9', date: '2026-06-03' });
  assertEq(fromDashboard, fromControl, '(same employee/day → one record)');
});
test('attendanceDocId: falls back to employees id for manual files (no authUid)', () => {
  assertEq(attendanceDocId({ employeeUid: '', employeeId: 'EMP9', date: '2026-06-03' }), 'EMP9_2026-06-03');
  assertEq(attendanceDocId({ employeeId: 'EMP9', date: '2026-06-03' }), 'EMP9_2026-06-03');
});
test('attendanceDocId: check-in and check-out derive the SAME id', () => {
  const args = { employeeUid: 'U123', employeeId: 'EMP9', date: '2026-06-03' };
  assertEq(attendanceDocId(args), attendanceDocId(args), '(checkout reuses checkin id)');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
