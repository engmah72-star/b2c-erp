/**
 * Tests for core/order-leadtime.js (Average Order Completion Time KPI).
 * Run: node tests/order-leadtime.test.mjs
 * Pure — no Firestore, no DOM.
 */
import { tsToMillis, completionMillis, orderCompletionHours, summarizeCompletion, formatDuration } from '../core/order-leadtime.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(c, h = '') { if (!c) throw new Error(`assertion failed ${h}`); }
function assertEq(a, b, h = '') { if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${h}`); }
function near(a, b, eps = 0.01) { return Math.abs(a - b) <= eps; }

const day = 86400 * 1000;
const base = Date.parse('2026-05-01T00:00:00Z');

// ── tsToMillis: حالات متعددة ──
test('tsToMillis: Date', () => assertEq(tsToMillis(new Date(base)), base));
test('tsToMillis: ISO string', () => assertEq(tsToMillis('2026-05-01T00:00:00Z'), base));
test('tsToMillis: Firestore {seconds}', () => assertEq(tsToMillis({ seconds: base / 1000 }), base));
test('tsToMillis: {_seconds}', () => assertEq(tsToMillis({ _seconds: base / 1000 }), base));
test('tsToMillis: .toMillis()', () => assertEq(tsToMillis({ toMillis: () => base }), base));
test('tsToMillis: seconds number → *1000', () => assertEq(tsToMillis(base / 1000), base));
test('tsToMillis: ms number', () => assertEq(tsToMillis(base), base));
test('tsToMillis: null', () => assertEq(tsToMillis(null), null));

// ── completion point precedence ──
test('completionMillis: deliveredAt يفوز', () => {
  assertEq(completionMillis({ deliveredAt: new Date(base + day), archivedAt: new Date(base + 5 * day) }), base + day);
});
test('completionMillis: fallback لـ archivedAt', () => {
  assertEq(completionMillis({ archivedAt: new Date(base + 2 * day) }), base + 2 * day);
});
test('completionMillis: fallback لـ shipCollectedAt', () => {
  assertEq(completionMillis({ shipCollectedAt: new Date(base + 3 * day) }), base + 3 * day);
});

// ── completion hours ──
test('orderCompletionHours: 2 يوم = 48 ساعة', () => {
  assert(near(orderCompletionHours({ createdAt: new Date(base), deliveredAt: new Date(base + 2 * day) }), 48), 'should be 48h');
});
test('orderCompletionHours: غير مكتمل → null', () => {
  assertEq(orderCompletionHours({ createdAt: new Date(base) }), null);
});
test('orderCompletionHours: تواريخ سالبة → null', () => {
  assertEq(orderCompletionHours({ createdAt: new Date(base + day), deliveredAt: new Date(base) }), null);
});

// ── summarize ──
test('summarizeCompletion: متوسط/وسيط/min/max', () => {
  const orders = [
    { createdAt: new Date(base), deliveredAt: new Date(base + 24 * 3600 * 1000) }, // 24h
    { createdAt: new Date(base), deliveredAt: new Date(base + 48 * 3600 * 1000) }, // 48h
    { createdAt: new Date(base), deliveredAt: new Date(base + 72 * 3600 * 1000) }, // 72h
    { createdAt: new Date(base) }, // غير مكتمل — يُتجاهل
  ];
  const s = summarizeCompletion(orders);
  assertEq(s.count, 3);
  assert(near(s.avgHours, 48), 'avg 48');
  assert(near(s.medianHours, 48), 'median 48');
  assert(near(s.minHours, 24), 'min 24');
  assert(near(s.maxHours, 72), 'max 72');
});
test('summarizeCompletion: فارغ → count 0', () => assertEq(summarizeCompletion([]).count, 0));

// ── format ──
test('formatDuration: دقائق', () => assertEq(formatDuration(0.5), '30 د'));
test('formatDuration: ساعات', () => assertEq(formatDuration(5), '5.0 س'));
test('formatDuration: أيام', () => assertEq(formatDuration(48), '2.0 يوم'));
test('formatDuration: null', () => assertEq(formatDuration(null), '—'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
