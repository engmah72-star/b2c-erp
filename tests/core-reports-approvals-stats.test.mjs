/**
 * Tests for core/reports-approvals-stats.js (approvals reporting aggregator).
 * Run: node tests/core-reports-approvals-stats.test.mjs
 */
import { buildApprovalsStats, inRangeRequest } from '../core/reports-approvals-stats.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, h = '') { if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${h}`); }
function assert(c, h = '') { if (!c) throw new Error(`assertion failed ${h}`); }

const sec = (d) => ({ seconds: Math.floor(d / 1000) });
const DAY = 86400000;
const base = Date.parse('2026-06-01T00:00:00Z');

const sample = [
  { _id: 'a', type: 'supplier_payment', amount: 1000, status: 'approved',
    requestedAt: sec(base), approvedAt: sec(base + 2 * 3600000), requestedByName: 'سارة' },
  { _id: 'b', type: 'supplier_payment', amount: 500, status: 'rejected',
    requestedAt: sec(base), rejectedAt: sec(base + 3600000), rejectReason: 'مبلغ خاطئ', requestedByName: 'سارة' },
  { _id: 'c', type: 'salary', amount: 3000, status: 'pending',
    requestedAt: sec(base + DAY), requestedByName: 'أحمد' },
  { _id: 'd', type: 'client_refund', amount: 200, status: 'rejected',
    requestedAt: sec(base + DAY), rejectedAt: sec(base + DAY + 7200000), rejectReason: 'مبلغ خاطئ', requestedByName: 'أحمد' },
  { _id: 'e', type: 'general', amount: 800, status: 'requested',
    requestedAt: sec(base + 2 * DAY), requestedByName: 'سارة' },
];

// ── inRangeRequest ──
test('inRangeRequest: no range → true', () => assertEq(inRangeRequest(sample[0], null), true));
test('inRangeRequest: outside range → false', () => {
  const range = { from: new Date(base + 10 * DAY), to: new Date(base + 11 * DAY) };
  assertEq(inRangeRequest(sample[0], range), false);
});
test('inRangeRequest: missing requestedAt → false (with range)', () => {
  assertEq(inRangeRequest({ amount: 1 }, { from: new Date(base), to: new Date(base + DAY) }), false);
});

// ── buildApprovalsStats (no range = all) ──
const s = buildApprovalsStats(sample, null);

test('total counts all in-range requests', () => assertEq(s.total, 5));
test('hasAnyData true', () => assertEq(s.hasAnyData, true));

test('byStatus counts correct', () => {
  assertEq(s.byStatus.approved, 1);
  assertEq(s.byStatus.rejected, 2);
  assertEq(s.byStatus.pending, 1);
  assertEq(s.byStatus.requested, 1);
});

test('amount by status', () => {
  assertEq(s.amtByStatus.approved, 1000);
  assertEq(s.amtByStatus.rejected, 700);
});

test('byType aggregates count+amount', () => {
  assertEq(s.byType.supplier_payment.count, 2);
  assertEq(s.byType.supplier_payment.amount, 1500);
  assertEq(s.byType.salary.amount, 3000);
});

test('rejection reasons sorted desc', () => {
  assertEq(s.reasonsSorted[0][0], 'مبلغ خاطئ');
  assertEq(s.reasonsSorted[0][1], 2);
});

test('approval + rejection rates', () => {
  assertEq(s.approvalRate, 1 / 5);
  assertEq(s.rejectionRate, 2 / 5);
});

test('avg approval latency = 2h (single approved)', () => {
  assertEq(s.avgApprovalLatencyMs, 2 * 3600000);
});

test('avg reject latency = avg(1h, 2h) = 1.5h', () => {
  assertEq(s.avgRejectLatencyMs, Math.round((3600000 + 7200000) / 2));
});

test('pending backlog = pending + requested (4 states), value summed', () => {
  // pending(3000) + requested(800) → count 2, value 3800
  assertEq(s.pendingCount, 2);
  assertEq(s.pendingValue, 3800);
});

test('top requesters sorted', () => {
  assertEq(s.requestersSorted[0][0], 'سارة');
  assertEq(s.requestersSorted[0][1], 3);
});

// ── range filtering ──
test('range filter narrows to one day', () => {
  const range = { from: new Date(base + DAY - 1000), to: new Date(base + DAY + DAY - 1000) };
  const r = buildApprovalsStats(sample, range);
  assertEq(r.total, 2, '(c + d on day+1)');
});

// ── empty ──
test('empty input → hasAnyData false, total 0', () => {
  const r = buildApprovalsStats([], null);
  assertEq(r.hasAnyData, false);
  assertEq(r.total, 0);
  assertEq(r.avgApprovalLatencyMs, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
