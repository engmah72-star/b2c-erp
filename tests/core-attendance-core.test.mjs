/**
 * Node-runnable tests for core/attendance-core.js (Phase-0 de-dup).
 * Run: node tests/core-attendance-core.test.mjs
 *
 * Pure tests — no Firestore, no DOM. Locks the day-status primitives that
 * were unified from three byte-identical inline copies (salary-calc,
 * scoring, render-attendance) so the single source can't regress.
 */
import { isWorkDayFor, isLeaveDayFor, computeLateMinutes } from '../core/attendance-core.js';

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
