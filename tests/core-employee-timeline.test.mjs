/**
 * Node-runnable tests for core/employee-timeline.js (البند 2 — السجل الموحّد).
 * Run: node tests/core-employee-timeline.test.mjs
 *
 * Pure tests — no Firestore, no DOM. Locks the aggregator contract:
 * normalization of mixed time formats, sort order, dir/tone tagging, and
 * the incident→appeal→decision fan-out.
 */
import { buildEmployeeTimeline, toMs } from '../core/employee-timeline.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assert(cond, hint = '') { if (!cond) throw new Error(hint || 'assertion failed'); }

// ── toMs normalization ─────────────────────────────────────────────
test('toMs handles Timestamp-like, Date, ISO, YYYY-MM-DD, seconds', () => {
  assertEq(toMs({ seconds: 1000 }), 1000 * 1000);
  assertEq(toMs({ toMillis: () => 42 }), 42);
  const d = new Date(2026, 0, 1);
  assertEq(toMs(d), d.getTime());
  assert(toMs('2026-06-06') > 0, 'date string');
  assertEq(toMs(null), 0);
  assertEq(toMs(''), 0);
  assertEq(toMs('not-a-date'), 0);
});

// ── empty / shape ──────────────────────────────────────────────────
test('empty inputs → empty array', () => {
  assertEq(buildEmployeeTimeline().length, 0);
  assertEq(buildEmployeeTimeline({}).length, 0);
});

test('events without a usable timestamp are dropped (ts>0 only)', () => {
  const ev = buildEmployeeTimeline({ tasks: [{ title: 'X' /* no createdAt */ }] });
  assertEq(ev.length, 0);
});

// ── sort: newest first ─────────────────────────────────────────────
test('sorted descending by ts', () => {
  const ev = buildEmployeeTimeline({
    payments: [
      { amount: 1, month: '2026-01', createdAt: { seconds: 1000 } },
      { amount: 2, month: '2026-03', createdAt: { seconds: 3000 } },
      { amount: 3, month: '2026-02', createdAt: { seconds: 2000 } },
    ],
  });
  assertEq(ev.length, 3);
  assert(ev[0].ts >= ev[1].ts && ev[1].ts >= ev[2].ts, 'desc order');
  assertEq(ev[0].ts, 3000 * 1000);
});

// ── incident → appeal → decision fan-out ───────────────────────────
test('incident with accepted appeal yields 3 events with right dir/tone', () => {
  const ev = buildEmployeeTimeline({
    incidents: [{
      title: 'تأخير', date: '2026-05-01', createdAt: { seconds: 100 },
      appeal: { status: 'accepted', reason: 'عذر', submittedAt: { seconds: 200 }, decidedAt: { seconds: 300 } },
    }],
  });
  assertEq(ev.length, 3);
  const inc = ev.find(e => e.kind === 'incident');
  const ap = ev.find(e => e.kind === 'appeal');
  const dec = ev.find(e => e.kind === 'appeal_decision');
  assertEq(inc.dir, 'out'); assertEq(inc.tone, 'neg');
  assertEq(ap.dir, 'in'); assertEq(ap.tone, 'warn');
  assertEq(dec.dir, 'out'); assertEq(dec.tone, 'pos');
});

test('incident without appeal yields a single event', () => {
  const ev = buildEmployeeTimeline({
    incidents: [{ title: 'X', date: '2026-05-01' }],
  });
  assertEq(ev.length, 1);
  assertEq(ev[0].kind, 'incident');
});

// ── leave request + decision ───────────────────────────────────────
test('leave request+rejection → in then out, neg decision', () => {
  const ev = buildEmployeeTimeline({
    leaves: [{
      type: 'annual', days: 3, startDate: '2026-06-10', reason: 'سفر',
      status: 'rejected', createdAt: { seconds: 10 }, decidedAt: { seconds: 20 },
    }],
  });
  assertEq(ev.length, 2);
  const req = ev.find(e => e.kind === 'leave');
  const dec = ev.find(e => e.kind === 'leave_decision');
  assertEq(req.dir, 'in');
  assertEq(dec.dir, 'out'); assertEq(dec.tone, 'neg');
});

// ── payment tone: deduction vs payout ──────────────────────────────
test('deduction payment is neg, normal payout is pos', () => {
  const ev = buildEmployeeTimeline({
    payments: [
      { amount: 500, month: '2026-04', isDeduction: true, createdAt: { seconds: 5 } },
      { amount: 9000, month: '2026-04', salaryType: 'salary', createdAt: { seconds: 6 } },
    ],
  });
  const ded = ev.find(e => e.tone === 'neg');
  const pay = ev.find(e => e.tone === 'pos');
  assert(ded && ded.kind === 'payment', 'deduction neg');
  assert(pay && pay.kind === 'payment', 'payout pos');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
