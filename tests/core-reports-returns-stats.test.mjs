/**
 * Tests for core/reports-returns-stats.js (reports Phase-1E).
 * Run: node tests/core-reports-returns-stats.test.mjs
 */
import { buildReturnsStats } from '../core/reports-returns-stats.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

const ts = (d) => ({ createdAt: { seconds: Math.floor(d.getTime() / 1000) } });
const RANGE = { from: new Date(2026, 4, 1), to: new Date(2026, 4, 31, 23, 59, 59) };
const inRange = new Date(2026, 4, 15);

// ── hasAnyData ─────────────────────────────────────────────────────
test('empty returns → hasAnyData false', () => {
  const r = buildReturnsStats([], [], RANGE);
  assertEq(r.hasAnyData, false);
});

test('returns outside range → hasAnyData true, periodRets empty', () => {
  const rets = [{ ...ts(new Date(2026, 3, 1)), status: 'refunded' }];
  const r = buildReturnsStats(rets, [], RANGE);
  assertEq(r.hasAnyData, true);
  assertEq(r.totalReturns, 0);
});

// ── KPIs ───────────────────────────────────────────────────────────
test('counts refunded amount + returnRate', () => {
  const rets = [
    { ...ts(inRange), status: 'refunded', refundAmount: 100 },
    { ...ts(inRange), status: 'refunded', refundAmount: 50 },
    { ...ts(inRange), status: 'open', refundAmount: 0 },
  ];
  const orders = [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}]; // 10 orders
  const r = buildReturnsStats(rets, orders, RANGE);
  assertEq(r.refundedAmt, 150);
  assertEq(r.totalReturns, 3);
  assertEq(r.returnRate, '30.0');
});

test('slaBreached counts only non-closed/cancelled', () => {
  const rets = [
    { ...ts(inRange), status: 'open', slaBreached: true },
    { ...ts(inRange), status: 'closed', slaBreached: true },  // excluded
    { ...ts(inRange), status: 'cancelled', slaBreached: true },  // excluded
  ];
  const r = buildReturnsStats(rets, [], RANGE);
  assertEq(r.slaBreached, 1);
});

test('active = not in [cancelled/closed/refunded/rejected]', () => {
  const rets = [
    { ...ts(inRange), status: 'open' },
    { ...ts(inRange), status: 'approved' },
    { ...ts(inRange), status: 'refunded' },  // excluded
    { ...ts(inRange), status: 'closed' },  // excluded
  ];
  const r = buildReturnsStats(rets, [], RANGE);
  assertEq(r.active, 2);
});

test('pendingValue = sum of refundAmount for approved status', () => {
  const rets = [
    { ...ts(inRange), status: 'approved', refundAmount: 100 },
    { ...ts(inRange), status: 'approved', refundAmount: 200 },
    { ...ts(inRange), status: 'open', refundAmount: 999 },  // excluded
  ];
  const r = buildReturnsStats(rets, [], RANGE);
  assertEq(r.pendingValue, 300);
});

// ── reasons + blame ────────────────────────────────────────────────
test('reasonsSorted by count desc, maxReasonCount = top count', () => {
  const rets = [
    { ...ts(inRange), reason: 'damaged' },
    { ...ts(inRange), reason: 'damaged' },
    { ...ts(inRange), reason: 'damaged' },
    { ...ts(inRange), reason: 'late_delivery' },
  ];
  const r = buildReturnsStats(rets, [], RANGE);
  assertEq(r.reasonsSorted[0][0], 'damaged');
  assertEq(r.reasonsSorted[0][1], 3);
  assertEq(r.maxReasonCount, 3);
});

test('missing reason defaults to "other"', () => {
  const rets = [{ ...ts(inRange) }];
  const r = buildReturnsStats(rets, [], RANGE);
  assertEq(r.reasonsSorted[0][0], 'other');
});

test('blameSorted groups by blamedParty, missing → unknown', () => {
  const rets = [
    { ...ts(inRange), blamedParty: 'designer' },
    { ...ts(inRange), blamedParty: 'designer' },
    { ...ts(inRange) }, // → unknown
  ];
  const r = buildReturnsStats(rets, [], RANGE);
  assertEq(r.blameSorted[0][0], 'designer');
  assertEq(r.blameSorted[0][1], 2);
});

// ── avgTimeToRefund ────────────────────────────────────────────────
test('avgTimeToRefund computed from requestedAt → refundedAt', () => {
  const t0 = Math.floor(new Date(2026, 4, 10).getTime() / 1000);
  const t1 = Math.floor(new Date(2026, 4, 13).getTime() / 1000); // 3 days later
  const rets = [{
    ...ts(inRange),
    status: 'refunded', refundAmount: 100,
    requestedAt: { seconds: t0 }, refundedAt: { seconds: t1 },
  }];
  const r = buildReturnsStats(rets, [], RANGE);
  assertEq(r.hasRefundTimes, true);
  assertEq(Math.round(r.avgTimeToRefundDays), 3);
});

test('hasRefundTimes false when no refunded tickets have timestamps', () => {
  const rets = [{ ...ts(inRange), status: 'refunded', refundAmount: 50 }];
  const r = buildReturnsStats(rets, [], RANGE);
  assertEq(r.hasRefundTimes, false);
});

// ── topClients ─────────────────────────────────────────────────────
test('topClients groups by clientId, sorts by count desc, limit 5', () => {
  const rets = [
    { ...ts(inRange), clientId: 'c1', clientName: 'A', refundAmount: 100 },
    { ...ts(inRange), clientId: 'c1', clientName: 'A', refundAmount: 50 },
    { ...ts(inRange), clientId: 'c2', clientName: 'B', refundAmount: 200 },
  ];
  const r = buildReturnsStats(rets, [], RANGE);
  assertEq(r.topClients[0].name, 'A');
  assertEq(r.topClients[0].count, 2);
  assertEq(r.topClients[0].amount, 150);
});

// ── recent ─────────────────────────────────────────────────────────
test('recent = first 10 of periodRets', () => {
  const rets = Array.from({ length: 15 }, (_, i) => ({ ...ts(inRange), _id: 'r' + i }));
  const r = buildReturnsStats(rets, [], RANGE);
  assertEq(r.recent.length, 10);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
