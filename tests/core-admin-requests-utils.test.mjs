/**
 * Node-runnable tests for core/admin-requests-utils.js.
 * Run: node tests/core-admin-requests-utils.test.mjs
 *
 * Pure tests — يقفل عقد التوحيد (normalize) لكل مصدر طلبات، فلترة الحالات
 * غير المعلّقة، حساب التقادم، والعدّادات/الترتيب.
 */
import {
  REQUEST_KINDS, KIND_ORDER,
  tsToMs, computeAging,
  normalizePayment, normalizeTransaction, normalizeAppeal,
  normalizeAttendance, normalizeLeave, normalizeReturn, normalizeOrderRequest,
  normalizeDecidedAppeal, normalizeDecidedAttendance, normalizeDecidedLeave,
  summarizeCounts, sortByAgeDesc, sortByDecidedDesc, filterByKind, matchesSearch,
} from '../core/admin-requests-utils.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assert(c, hint = '') { if (!c) throw new Error(`assertion failed ${hint}`); }

const NOW = Date.UTC(2026, 5, 6, 12, 0, 0); // ثابت لاختبارات التقادم

// ── tsToMs ──
test('tsToMs handles number / string / Timestamp / seconds', () => {
  assertEq(tsToMs(1000), 1000);
  assertEq(tsToMs({ toMillis: () => 5000 }), 5000);
  assertEq(tsToMs({ seconds: 2 }), 2000);
  assertEq(tsToMs(null), 0);
  assert(tsToMs('2026-06-06T00:00:00Z') > 0, 'iso string parses');
});

// ── computeAging ──
test('computeAging buckets hours/days', () => {
  assertEq(computeAging(NOW - 30 * 60_000, NOW).label, 'منذ أقل من ساعة');
  assertEq(computeAging(NOW - 5 * 3_600_000, NOW).label, 'منذ 5 ساعة');
  assertEq(computeAging(NOW - 3 * 86_400_000, NOW).label, 'منذ 3 يوم');
  assertEq(computeAging(0, NOW).label, '—');
});

// ── payment ──
test('normalizePayment keeps only pending statuses', () => {
  assert(normalizePayment({ status: 'requested', amount: 100, type: 'general', reason: 'x' }, 'p1', NOW));
  assertEq(normalizePayment({ status: 'approved' }, 'p2', NOW), null);
  assertEq(normalizePayment({ status: 'rejected' }, 'p3', NOW), null);
});
test('normalizePayment maps fields + deepLink (not decidable)', () => {
  const it = normalizePayment(
    { status: 'pending', amount: 250, type: 'supplier_payment', supplierName: 'مطبعة', reason: 'دفعة', requestedByName: 'سامي', orderId: 'O9' },
    'pay1', NOW);
  assertEq(it.kind, 'payment');
  assertEq(it.amount, 250);
  assertEq(it.subtitle, 'مطبعة');
  assertEq(it.decidable, false);
  assertEq(it.deepLink.page, 'approvals.html');
  assertEq(it.deepLink.query.focus, 'pay1');
});

// ── transaction ──
test('normalizeTransaction filters locked + non-pending', () => {
  assert(normalizeTransaction({ approvalStatus: 'pending', amount: 1 }, 't1', NOW));
  assert(normalizeTransaction({ approvalStatus: 'confirmed', amount: 1 }, 't2', NOW));
  assertEq(normalizeTransaction({ approvalStatus: 'approved' }, 't3', NOW), null);
  assertEq(normalizeTransaction({ approvalStatus: 'pending', isLocked: true }, 't4', NOW), null);
});

// ── appeal (nested appeal.status) ──
test('normalizeAppeal only when appeal.status pending + decidable', () => {
  const it = normalizeAppeal(
    { employeeName: 'منى', reasonLabel: 'تأخير', severity: 'high', appeal: { status: 'pending', reason: 'كنت بإذن' } },
    'inc1', NOW);
  assert(it);
  assertEq(it.decidable, true);
  assertEq(it.deepLink, null);
  assert(it.lines.some(l => l.value === 'كنت بإذن'), 'appeal reason shown');
  assertEq(normalizeAppeal({ appeal: { status: 'accepted' } }, 'inc2', NOW), null);
  assertEq(normalizeAppeal({}, 'inc3', NOW), null);
});

// ── attendance ──
test('normalizeAttendance only pending + decidable', () => {
  const it = normalizeAttendance(
    { status: 'pending', type: 'late', date: '2026-06-06', employeeName: 'علي', minutes: 30, reason: 'زحمة' },
    'ap1', NOW);
  assert(it);
  assertEq(it.decidable, true);
  assertEq(normalizeAttendance({ status: 'approved' }, 'ap2', NOW), null);
});

// ── leave ──
test('normalizeLeave only pending + decidable + range', () => {
  const it = normalizeLeave(
    { status: 'pending', type: 'annual', startDate: '2026-06-10', endDate: '2026-06-12', days: 3, employeeName: 'هند', reason: 'سفر' },
    'lv1', NOW);
  assert(it);
  assertEq(it.decidable, true);
  assert(it.lines.some(l => l.value === '2026-06-10 → 2026-06-12'), 'range');
  assertEq(normalizeLeave({ status: 'approved' }, 'lv2', NOW), null);
  assertEq(normalizeLeave({}, 'lv3', NOW), null);
});

// ── return ──
test('normalizeReturn only requested/inspecting + deepLink', () => {
  assert(normalizeReturn({ status: 'requested', ticketNo: 'RT-1', clientName: 'عميل' }, 'r1', NOW));
  assert(normalizeReturn({ status: 'inspecting' }, 'r2', NOW));
  assertEq(normalizeReturn({ status: 'refunded' }, 'r3', NOW), null);
  const it = normalizeReturn({ status: 'requested', orderId: 'O1' }, 'r4', NOW);
  assertEq(it.deepLink.page, 'returns.html');
  assertEq(it.decidable, false);
});

// ── order request ──
test('normalizeOrderRequest only new/requested + deepLink', () => {
  assert(normalizeOrderRequest({ status: 'new', clientName: 'عميل' }, 'or1', NOW));
  assert(normalizeOrderRequest({ status: 'requested', clientName: 'عميل' }, 'or2', NOW));
  assertEq(normalizeOrderRequest({ status: 'converted' }, 'or3', NOW), null);
  assertEq(normalizeOrderRequest({ status: 'rejected' }, 'or4', NOW), null);
  const it = normalizeOrderRequest({ status: 'new', clientName: 'منى', items: [1, 2] }, 'or5', NOW);
  assertEq(it.kind, 'orderRequest');
  assertEq(it.decidable, false);
  assertEq(it.deepLink.page, 'portal-orders.html');
  assert(it.lines.some(l => l.value === '2'), 'items count');
});

// ── done normalizers ──
test('normalizeDecidedAppeal only accepted/rejected', () => {
  const it = normalizeDecidedAppeal({ employeeName: 'سامي', appeal: { status: 'accepted', decidedByName: 'المدير', decisionNote: 'مقبول' } }, 'd1');
  assert(it);
  assertEq(it.decision, 'accepted');
  assertEq(it.decidedBy, 'المدير');
  assertEq(normalizeDecidedAppeal({ appeal: { status: 'pending' } }, 'd2'), null);
});
test('normalizeDecidedLeave excludes admin-direct (no requestedBy)', () => {
  assertEq(normalizeDecidedLeave({ status: 'approved', employeeName: 'x' }, 'l1'), null);
  assert(normalizeDecidedLeave({ status: 'approved', requestedBy: 'u1', employeeName: 'x' }, 'l2'));
});
test('normalizeDecidedAttendance only approved/rejected', () => {
  assert(normalizeDecidedAttendance({ status: 'rejected', type: 'late' }, 'a1'));
  assertEq(normalizeDecidedAttendance({ status: 'pending' }, 'a2'), null);
});

// ── search + sort ──
test('matchesSearch matches title/subtitle/who, empty = all', () => {
  const it = normalizePayment({ status: 'pending', amount: 1, type: 'supplier_payment', supplierName: 'مطبعة النور', reason: 'x', requestedByName: 'علي' }, 'p', NOW);
  assertEq(matchesSearch(it, ''), true);
  assertEq(matchesSearch(it, 'النور'), true);
  assertEq(matchesSearch(it, 'علي'), true);
  assertEq(matchesSearch(it, 'غير موجود'), false);
});
test('sortByDecidedDesc newest decision first', () => {
  const a = { decidedAtMs: 100 }, b = { decidedAtMs: 500 }, c = { decidedAtMs: 300 };
  const s = sortByDecidedDesc([a, b, c]);
  assertEq(s[0].decidedAtMs, 500);
  assertEq(s[2].decidedAtMs, 100);
});

// ── aggregation ──
test('summarizeCounts counts per kind + total', () => {
  const items = [
    normalizePayment({ status: 'pending', amount: 1, type: 'general', reason: 'x' }, 'a', NOW),
    normalizeLeave({ status: 'pending', startDate: '2026-06-10', reason: 'x' }, 'b', NOW),
    normalizeLeave({ status: 'pending', startDate: '2026-06-11', reason: 'y' }, 'c', NOW),
  ];
  const c = summarizeCounts(items);
  assertEq(c.all, 3);
  assertEq(c.payment, 1);
  assertEq(c.leave, 2);
  assertEq(c.return, 0);
});

test('sortByAgeDesc puts oldest first', () => {
  const items = [
    normalizePayment({ status: 'pending', amount: 1, type: 'general', reason: 'new', requestedAt: NOW - 3_600_000 }, 'new', NOW),
    normalizePayment({ status: 'pending', amount: 1, type: 'general', reason: 'old', requestedAt: NOW - 100 * 3_600_000 }, 'old', NOW),
  ];
  const sorted = sortByAgeDesc(items);
  assertEq(sorted[0].id, 'old');
});

test('filterByKind all vs specific', () => {
  const items = [
    normalizePayment({ status: 'pending', amount: 1, type: 'general', reason: 'x' }, 'a', NOW),
    normalizeLeave({ status: 'pending', startDate: '2026-06-10', reason: 'x' }, 'b', NOW),
  ];
  assertEq(filterByKind(items, 'all').length, 2);
  assertEq(filterByKind(items, 'leave').length, 1);
  assertEq(filterByKind(items, 'leave')[0].kind, 'leave');
});

test('KIND_ORDER covers all REQUEST_KINDS', () => {
  assertEq(KIND_ORDER.length, Object.keys(REQUEST_KINDS).length);
  for (const k of KIND_ORDER) assert(REQUEST_KINDS[k], `kind ${k} defined`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
