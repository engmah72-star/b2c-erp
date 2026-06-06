/**
 * Node-runnable tests for core/employee-scoring.js (Phase-1A god-page decomp).
 * Run: node tests/core-employee-scoring.test.mjs
 *
 * Pure tests — no Firestore, no DOM. Locks the scoring algorithm so future
 * refactors of employee-profile.html can't regress the result shape.
 */
import { computeScore } from '../core/employee-scoring.js';

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
function assertNear(a, b, tol = 1, hint = '') {
  if (Math.abs(a - b) > tol) throw new Error(`expected ~${b} (±${tol}) got ${a} ${hint}`);
}

// ── shape contract ─────────────────────────────────────────────────
test('returns zero-shape on missing mKey', () => {
  const r = computeScore({ employee: { role: 'admin' } });
  assertEq(r.score, 0);
  assertEq(r.grade, '—');
});

test('returns zero-shape on missing employee', () => {
  const r = computeScore({ mKey: '2026-05' });
  assertEq(r.score, 0);
  assertEq(r.grade, '—');
});

test('result has expected top-level keys', () => {
  const r = computeScore({
    mKey: '2026-01', now: new Date(2026, 0, 31),
    employee: { role: 'admin' },
  });
  ['score', 'grade', 'col', 'breakdown', 'meta'].forEach(k => {
    if (!(k in r)) throw new Error(`missing key: ${k}`);
  });
  ['att', 'prod', 'qual'].forEach(k => {
    if (!(k in r.breakdown)) throw new Error(`breakdown.${k} missing`);
  });
});

// ── attendance scoring ─────────────────────────────────────────────
test('perfect attendance past month → att score = 35', () => {
  // January 2026 has 31 days; default Fri/Sat off → ~22 work days
  const attendance = [];
  for (let d = 1; d <= 31; d++) {
    const ds = '2026-01-' + String(d).padStart(2, '0');
    const dow = new Date(ds).getDay();
    if (dow !== 5 && dow !== 6) attendance.push({ date: ds, lateMinutes: 0 });
  }
  const r = computeScore({
    mKey: '2026-01', now: new Date(2026, 1, 15), // viewing from Feb → past month
    employee: { role: 'admin' },
    attendance,
  });
  assertEq(r.breakdown.att.score, 35);
  assertEq(r.breakdown.att.lateMins, 0);
});

test('zero attendance past month → att score = 0', () => {
  const r = computeScore({
    mKey: '2026-01', now: new Date(2026, 1, 15),
    employee: { role: 'admin' },
    attendance: [],
  });
  assertEq(r.breakdown.att.score, 0);
});

test('late penalty caps at 7 (over 7×60 = 420 min)', () => {
  // present every workday but 600 min late aggregate
  const attendance = [
    { date: '2026-01-04', lateMinutes: 600 }, // Sunday
  ];
  // fill the rest as present on time
  for (let d = 5; d <= 29; d++) {
    const ds = '2026-01-' + String(d).padStart(2, '0');
    const dow = new Date(ds).getDay();
    if (dow !== 5 && dow !== 6) attendance.push({ date: ds, lateMinutes: 0 });
  }
  const r = computeScore({
    mKey: '2026-01', now: new Date(2026, 1, 15),
    employee: { role: 'admin' },
    attendance,
  });
  assertEq(r.breakdown.att.latePenalty, 7, '(cap)');
});

// ── productivity scoring ──────────────────────────────────────────
test('no goal + no orders past month → prodPct = 0.5 baseline', () => {
  const r = computeScore({
    mKey: '2026-01', now: new Date(2026, 1, 15),
    employee: { role: 'admin' },
  });
  assertEq(r.breakdown.prod.score, 20); // round(0.5 * 40) = 20
});

test('with goal met → prod score full 40', () => {
  const orders = Array.from({ length: 10 }, (_, i) => ({ stage: 'archived' }));
  const r = computeScore({
    mKey: '2026-01', now: new Date(2026, 1, 15),
    employee: { role: 'admin' },
    monthOrders: orders,
    goals: [{ month: '2026-01', targetOrdersMonthly: 10 }],
  });
  assertEq(r.breakdown.prod.score, 40);
});

test('proration on current month (mid-month)', () => {
  // We're on day 15 of 30 → expected = target × 0.5
  const orders = Array.from({ length: 5 }, () => ({ stage: 'archived' }));
  const r = computeScore({
    mKey: '2026-04', now: new Date(2026, 3, 15), // April 15
    employee: { role: 'admin' },
    monthOrders: orders,
    goals: [{ month: '2026-04', targetOrdersMonthly: 10 }],
  });
  // expected = 10 * (15/30) = 5 → prodPct = 1.0 → prodScore = 40
  assertEq(r.breakdown.prod.score, 40);
  assertEq(r.breakdown.prod.prorated, true);
});

// ── quality scoring ───────────────────────────────────────────────
test('designer with no rejections → qual ~0.8 baseline', () => {
  const orders = [{ stage: 'archived' }, { stage: 'archived' }];
  const r = computeScore({
    mKey: '2026-01', now: new Date(2026, 1, 15),
    employee: { role: 'graphic_designer' },
    monthOrders: orders,
  });
  // total=2, rej=0 → qualPct = 1 → score = round(1*25) = 25
  assertEq(r.breakdown.qual.score, 25);
});

test('designer with rejection → qual reduced', () => {
  const orders = [
    { stage: 'archived', designStatus: 'rejected' },
    { stage: 'archived' },
    { stage: 'archived' },
    { stage: 'archived' },
  ];
  const r = computeScore({
    mKey: '2026-01', now: new Date(2026, 1, 15),
    employee: { role: 'graphic_designer' },
    monthOrders: orders,
  });
  // 1/4 rejected → qualPct = 0.75 → score = round(0.75*25) = 19
  assertEq(r.breakdown.qual.score, 19);
});

test('incident penalty caps at 0.6', () => {
  const incidents = Array.from({ length: 20 }, () => ({ date: '2026-01-15' }));
  const r = computeScore({
    mKey: '2026-01', now: new Date(2026, 1, 15),
    employee: { role: 'customer_service' },
    monthOrders: [{ stage: 'archived' }, { stage: 'archived' }],
    incidents,
  });
  // CS qualPct base for 2 archived/2 total = 1.0
  // 20 incidents × 0.05 = 1.0, capped at 0.6
  // qualPct = max(0, 1.0 - 0.6) = 0.4 → score = 10
  assertEq(r.breakdown.qual.incidents, 20);
  assertEq(r.breakdown.qual.score, 10);
});

test('appeal-accepted (voided) incidents are excluded from the penalty', () => {
  const incidents = [
    { date: '2026-01-10' },                                  // active
    { date: '2026-01-12', appeal: { status: 'accepted' } },  // voided → ignored
    { date: '2026-01-13', appeal: { status: 'pending' } },   // still counts
  ];
  const r = computeScore({
    mKey: '2026-01', now: new Date(2026, 1, 15),
    employee: { role: 'customer_service' },
    monthOrders: [{ stage: 'archived' }, { stage: 'archived' }],
    incidents,
  });
  // 2 active (voided excluded) → penalty 0.10 → qualPct 0.9 → round(0.9*25)=23
  assertEq(r.breakdown.qual.incidents, 2);
  assertEq(r.breakdown.qual.score, 23);
});

// ── grade thresholds ──────────────────────────────────────────────
test('grade boundaries: 85 → ممتاز, 70 → جيد جداً, 50 → متوسط, else → يحتاج تطوير', () => {
  // Build inputs that yield specific scores by tuning attendance only.
  const mkAttendance = (presentDays) => {
    const arr = [];
    for (let d = 1; d <= presentDays; d++) {
      const ds = '2026-01-' + String(d).padStart(2, '0');
      const dow = new Date(ds).getDay();
      if (dow !== 5 && dow !== 6) arr.push({ date: ds, lateMinutes: 0 });
    }
    return arr;
  };
  // Past month, default baselines: prod=20, qual=20 → att determines grade
  const eval_ = (n) => computeScore({
    mKey: '2026-01', now: new Date(2026, 1, 15),
    employee: { role: 'admin' },
    attendance: mkAttendance(n),
  });
  const r45 = eval_(31);  // all days present → att=35; total=35+20+20=75 → جيد جداً
  assertEq(r45.grade, 'جيد جداً');
  const r0 = eval_(0);     // att=0 → total=40 → يحتاج تطوير
  assertEq(r0.grade, 'يحتاج تطوير');
});

// ── leaves exclude work days ───────────────────────────────────────
test('leaves reduce expected work days (so present/work ratio stays high)', () => {
  // Whole month off as annual leave
  const r = computeScore({
    mKey: '2026-01', now: new Date(2026, 1, 15),
    employee: { role: 'admin' },
    attendance: [],
    leaves: [{ startDate: '2026-01-01', endDate: '2026-01-31' }],
  });
  // workDays = 0 → attPct = 0.5 fallback → attScore = round(0.5*35) = 18
  assertEq(r.breakdown.att.score, 18);
});

// ── meta / breakdown ───────────────────────────────────────────────
test('isCurMonth flag computed against now', () => {
  const r1 = computeScore({
    mKey: '2026-05', now: new Date(2026, 4, 23),
    employee: { role: 'admin' },
  });
  assertEq(r1.meta.isCurMonth, true);
  const r2 = computeScore({
    mKey: '2026-04', now: new Date(2026, 4, 23),
    employee: { role: 'admin' },
  });
  assertEq(r2.meta.isCurMonth, false);
});

// ── summary ───────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
