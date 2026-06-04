/**
 * Node-runnable tests for core/employee-salary-calc.js (Phase-1C god-page decomp).
 * Run: node tests/core-employee-salary-calc.test.mjs
 *
 * Pure tests — no Firestore, no DOM. Locks the salary-suggestion algorithm.
 */
import { computeSalarySuggestion } from '../core/employee-salary-calc.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
const ts = (d) => ({ toDate: () => d });

// build a full-month attendance array (default Fri/Sat off)
function fullMonthPresent(mKey) {
  const [ys, ms] = mKey.split('-').map(Number);
  const dim = new Date(ys, ms, 0).getDate();
  const out = [];
  for (let d = 1; d <= dim; d++) {
    const ds = mKey + '-' + String(d).padStart(2, '0');
    const dow = new Date(ds).getDay();
    if (dow !== 5 && dow !== 6) out.push({ date: ds, lateMinutes: 0 });
  }
  return out;
}

// ── empty / missing inputs ─────────────────────────────────────────
test('returns zero-shape when employee missing', () => {
  const r = computeSalarySuggestion({ mKey: '2026-05', employeeId: 'x' });
  assertEq(r.suggested, 0);
  assertEq(r.base, 0);
  assertEq(r.commission, 0);
});

test('returns zero-shape when mKey missing', () => {
  const r = computeSalarySuggestion({ employee: { baseSalary: 5000 }, employeeId: 'x' });
  assertEq(r.suggested, 0);
});

// ── attendance arithmetic ──────────────────────────────────────────
test('perfect attendance → suggested = base + attendanceBonus', () => {
  const r = computeSalarySuggestion({
    mKey: '2026-01',
    employee: { baseSalary: 5000, attendanceBonus: 500, role: 'admin' },
    employeeId: 'a1',
    attendance: fullMonthPresent('2026-01'),
  });
  assertEq(r.daysAbsent, 0);
  assertEq(r.tardinessDays, 0);
  assertEq(r.attendanceBonus, 500);
  assertEq(r.absenceDeduction, 0);
  assertEq(r.tardinessDeduction, 0);
  assertEq(r.suggested, 5500);
});

test('no attendance → absence deduction equals base (rate × all work days)', () => {
  const r = computeSalarySuggestion({
    mKey: '2026-01',
    employee: { baseSalary: 5000, role: 'admin' },
    employeeId: 'a1',
    attendance: [],
  });
  assertEq(r.daysPresent, 0);
  assertEq(r.daysAbsent, r.workDays);
  // dailyRate × workDays should equal base; absenceDeduction = round(base) = 5000
  assertEq(r.suggested, 0);
});

test('attendanceBonus only when zero absent AND zero tardiness', () => {
  // present every day but one record is late >30 min
  const att = fullMonthPresent('2026-01');
  att[0].lateMinutes = 60; // 31-120 → 0.25 day
  const r = computeSalarySuggestion({
    mKey: '2026-01',
    employee: { baseSalary: 5000, attendanceBonus: 500, role: 'admin' },
    employeeId: 'a1',
    attendance: att,
  });
  assertEq(r.attendanceBonus, 0);
  assertEq(r.tardinessDays, 0.25);
  assertEq(r.lateRecords, 1);
});

// ── tardiness ladder ──────────────────────────────────────────────
test('tardiness ladder: 30/120/240 thresholds', () => {
  const att = fullMonthPresent('2026-01').slice(0, 4);
  att[0].lateMinutes = 30;   // grace
  att[1].lateMinutes = 31;   // → 0.25
  att[2].lateMinutes = 121;  // → 0.5
  att[3].lateMinutes = 241;  // → 1.0
  const r = computeSalarySuggestion({
    mKey: '2026-01',
    employee: { baseSalary: 5000, role: 'admin' },
    employeeId: 'a1',
    attendance: att,
  });
  assertEq(r.tardinessDays, 1.75);  // 0 + 0.25 + 0.5 + 1.0
  assertEq(r.lateRecords, 4);       // any lateMinutes > 0 counts (grace included)
});

// ── permissions forgive tardiness (Phase-3) ───────────────────────
test('approved late_in fully forgives a day; approved partial reduces it', () => {
  const att = fullMonthPresent('2026-01').slice(0, 2);
  att[0].lateMinutes = 121;  // without excuse → 0.5
  att[1].lateMinutes = 121;  // without excuse → 0.5
  const permissions = [
    { date: att[0].date, type: 'late_in', status: 'approved' },               // full → 0
    { date: att[1].date, type: 'partial', status: 'approved', minutes: 60 },   // 121-60=61 → 0.25
  ];
  const r = computeSalarySuggestion({
    mKey: '2026-01', employee: { baseSalary: 5000, role: 'admin' }, employeeId: 'a1',
    attendance: att, permissions,
  });
  assertEq(r.tardinessDays, 0.25);  // 0 (forgiven) + 0.25 (reduced)
  assertEq(r.lateRecords, 1);       // forgiven day no longer counts late
});

test('pending permission does NOT forgive tardiness', () => {
  const att = fullMonthPresent('2026-01').slice(0, 1);
  att[0].lateMinutes = 121;  // → 0.5
  const r = computeSalarySuggestion({
    mKey: '2026-01', employee: { baseSalary: 5000, role: 'admin' }, employeeId: 'a1',
    attendance: att, permissions: [{ date: att[0].date, type: 'late_in', status: 'pending' }],
  });
  assertEq(r.tardinessDays, 0.5);
});

// ── commission ─────────────────────────────────────────────────────
test('designer commission: pct × salePrice on paid orders this month', () => {
  const monthDate = new Date(2026, 4, 10);
  const allOrders = [
    { paymentStatus: 'paid', paidAt: ts(monthDate), salePrice: 1000, designerId: 'auth1' },
    { paymentStatus: 'paid', paidAt: ts(monthDate), salePrice: 500,  designerId: 'auth1' },
    { paymentStatus: 'partial', paidAt: ts(monthDate), salePrice: 999, designerId: 'auth1' },
  ];
  const r = computeSalarySuggestion({
    mKey: '2026-05',
    employee: { role: 'graphic_designer', authUid: 'auth1', commissionPct: 10, baseSalary: 0 },
    employeeId: 'd1',
    allOrders,
  });
  assertEq(r.commission, 150); // 1500 × 10%
});

test('production commission: per-order × count', () => {
  const monthDate = new Date(2026, 4, 10);
  const allOrders = [
    { paymentStatus: 'paid', paidAt: ts(monthDate), productionAgent: 'auth1' },
    { paymentStatus: 'paid', paidAt: ts(monthDate), productionAgent: 'auth1' },
  ];
  const r = computeSalarySuggestion({
    mKey: '2026-05',
    employee: { role: 'production_agent', authUid: 'auth1', commissionPerOrder: 25, baseSalary: 3000 },
    employeeId: 'p1',
    attendance: fullMonthPresent('2026-05'),
    allOrders,
  });
  assertEq(r.commission, 50);
  // suggested = 3000 (base) + 0 (no bonus configured) + 50 = 3050
  assertEq(r.suggested, 3050);
});

test('commission month-filtered (other months excluded)', () => {
  const monthDate = new Date(2026, 4, 10);
  const otherDate = new Date(2026, 3, 10);
  const allOrders = [
    { paymentStatus: 'paid', paidAt: ts(monthDate), salePrice: 1000, designerId: 'auth1' },
    { paymentStatus: 'paid', paidAt: ts(otherDate), salePrice: 9999, designerId: 'auth1' },
  ];
  const r = computeSalarySuggestion({
    mKey: '2026-05',
    employee: { role: 'graphic_designer', authUid: 'auth1', commissionPct: 10, baseSalary: 0 },
    employeeId: 'd1',
    allOrders,
  });
  assertEq(r.commission, 100);
});

// ── leaves don't reduce work days when employee was present on leave-overlap ───
test('leaves reduce expected work days', () => {
  // entire January = leave → workDays drops to fallback (26)
  const r = computeSalarySuggestion({
    mKey: '2026-01',
    employee: { baseSalary: 5000, role: 'admin' },
    employeeId: 'a1',
    attendance: [],
    leaves: [{ startDate: '2026-01-01', endDate: '2026-01-31' }],
  });
  assertEq(r.workDays, 26); // fallbackWorkDays
});

// ── suggested floor at zero ────────────────────────────────────────
test('suggested never goes below 0', () => {
  const r = computeSalarySuggestion({
    mKey: '2026-01',
    employee: { baseSalary: 1000, role: 'admin' },
    employeeId: 'a1',
    attendance: [], // zero present → absence deduction = base
  });
  assertEq(r.suggested, 0);
});

// ── full breakdown shape ───────────────────────────────────────────
test('result includes all breakdown fields', () => {
  const r = computeSalarySuggestion({
    mKey: '2026-01',
    employee: { baseSalary: 5000, role: 'admin' },
    employeeId: 'a1',
  });
  const expected = [
    'base', 'commission', 'suggested', 'month',
    'workDays', 'daysPresent', 'daysAbsent', 'dailyRate',
    'absenceDeduction', 'tardinessDays', 'tardinessDeduction', 'lateRecords',
    'attendanceBonus',
  ];
  for (const k of expected) {
    if (!(k in r)) throw new Error(`missing field: ${k}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
