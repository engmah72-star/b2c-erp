/**
 * Tests for core/reports-timeseries.js (reports Phase-1A).
 * Run: node tests/core-reports-timeseries.test.mjs
 */
import { dailySeries, sparklineHTML } from '../core/reports-timeseries.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assertArrEq(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
  }
}

const ts = (d) => ({ createdAt: { seconds: Math.floor(d.getTime() / 1000) } });

const NOW = new Date(2026, 4, 15, 14, 0, 0); // Fri 2026-05-15 14:00

// ── dailySeries ────────────────────────────────────────────────────
test('empty items → all zeros', () => {
  assertArrEq(dailySeries({ items: [], days: 5, now: NOW }), [0, 0, 0, 0, 0]);
});

test('newest day → last bucket', () => {
  const items = [
    { ...ts(new Date(2026, 4, 15, 10, 0)), amount: 100 },
  ];
  const r = dailySeries({
    items, days: 3, now: NOW,
    filterFn: () => true,
    valueFn: (t) => t.amount,
  });
  assertArrEq(r, [0, 0, 100]);
});

test('oldest in-range day → first bucket', () => {
  const items = [
    { ...ts(new Date(2026, 4, 13, 10, 0)), amount: 50 },
  ];
  const r = dailySeries({
    items, days: 3, now: NOW,
    filterFn: () => true,
    valueFn: (t) => t.amount,
  });
  assertArrEq(r, [50, 0, 0]);
});

test('items outside range excluded', () => {
  const items = [
    { ...ts(new Date(2026, 4, 1)), amount: 999 }, // 14 days ago — outside 3-day window
    { ...ts(new Date(2026, 4, 15)), amount: 5 },
  ];
  const r = dailySeries({
    items, days: 3, now: NOW,
    filterFn: () => true,
    valueFn: (t) => t.amount,
  });
  assertArrEq(r, [0, 0, 5]);
});

test('items future-dated → excluded (negative age)', () => {
  const items = [
    { ...ts(new Date(2026, 4, 20)), amount: 100 }, // 5 days in future
  ];
  const r = dailySeries({
    items, days: 3, now: NOW,
    valueFn: (t) => t.amount,
  });
  assertArrEq(r, [0, 0, 0]);
});

test('filterFn excludes items', () => {
  const items = [
    { ...ts(new Date(2026, 4, 15)), amount: 10, type: 'in' },
    { ...ts(new Date(2026, 4, 15)), amount: 5,  type: 'out' },
  ];
  const r = dailySeries({
    items, days: 2, now: NOW,
    filterFn: (t) => t.type === 'in',
    valueFn: (t) => t.amount,
  });
  assertArrEq(r, [0, 10]);
});

test('default valueFn = 1 (counts)', () => {
  const items = [
    { ...ts(new Date(2026, 4, 15)) },
    { ...ts(new Date(2026, 4, 15)) },
    { ...ts(new Date(2026, 4, 14)) },
  ];
  const r = dailySeries({ items, days: 2, now: NOW });
  assertArrEq(r, [1, 2]);
});

test('missing createdAt → excluded', () => {
  const items = [
    { amount: 5 }, // no createdAt
    { createdAt: { seconds: 0 }, amount: 7 }, // zero seconds
    { ...ts(new Date(2026, 4, 15)), amount: 3 },
  ];
  const r = dailySeries({
    items, days: 2, now: NOW,
    valueFn: (t) => t.amount,
  });
  assertArrEq(r, [0, 3]);
});

// ── sparklineHTML ──────────────────────────────────────────────────
test('empty array → empty string', () => {
  assertEq(sparklineHTML([]), '');
  assertEq(sparklineHTML(null), '');
});

test('returns div.sparkline with bars', () => {
  const html = sparklineHTML([1, 2, 3]);
  if (!html.includes('class="sparkline"')) throw new Error('missing class');
  // Should have 3 spans
  const count = (html.match(/<span/g) || []).length;
  assertEq(count, 3);
});

test('normalizes bar heights — max → 100%', () => {
  const html = sparklineHTML([1, 10]);
  if (!html.includes('height:100%')) throw new Error('max not 100%');
});

test('zero bars get minimum height 2%', () => {
  const html = sparklineHTML([0, 10]);
  if (!html.includes('height:2%')) throw new Error('zero not 2%');
});

test('custom color applied', () => {
  const html = sparklineHTML([1, 2], '#ff0000');
  if (!html.includes('background:#ff0000')) throw new Error('color not applied');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
