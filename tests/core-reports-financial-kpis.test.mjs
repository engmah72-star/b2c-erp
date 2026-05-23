/**
 * Tests for core/reports-financial-kpis.js (reports Phase-1B).
 * Run: node tests/core-reports-financial-kpis.test.mjs
 */
import {
  calcPeriodFlow, calcOrderStats, calcNewClientsInRange,
  calcSupplierDue, calcStageDistribution,
  calcTopClientsByRevenue, calcTopProductsByRevenue, calcTopDesignersByCount,
  calcMonthlyRevenueChart, diffHTML,
} from '../core/reports-financial-kpis.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

const ts = (d) => ({ createdAt: { seconds: Math.floor(d.getTime() / 1000) } });
const NOW = new Date(2026, 4, 15);
const RANGE = { from: new Date(2026, 4, 1), to: new Date(2026, 4, 31, 23, 59, 59) };

// ── calcPeriodFlow ─────────────────────────────────────────────────
test('empty transactions → all zeros', () => {
  const r = calcPeriodFlow([], RANGE);
  assertEq(r.periodIn, 0);
  assertEq(r.periodOut, 0);
  assertEq(r.profit, 0);
});

test('sums in/out within range, computes profit', () => {
  const txs = [
    { ...ts(NOW), type: 'in', amount: 1000 },
    { ...ts(NOW), type: 'in', amount: 500 },
    { ...ts(NOW), type: 'out', amount: 300 },
  ];
  const r = calcPeriodFlow(txs, RANGE);
  assertEq(r.periodIn, 1500);
  assertEq(r.periodOut, 300);
  assertEq(r.profit, 1200);
});

test('excludes out-of-range transactions', () => {
  const txs = [
    { ...ts(new Date(2026, 3, 1)), type: 'in', amount: 9999 }, // April
    { ...ts(NOW), type: 'in', amount: 100 },
  ];
  const r = calcPeriodFlow(txs, RANGE);
  assertEq(r.periodIn, 100);
});

// ── calcOrderStats ─────────────────────────────────────────────────
test('counts active vs total, sums remaining', () => {
  const orders = [
    { stage: 'design',   remaining: 100 },
    { stage: 'printing', remaining: 50 },
    { stage: 'archived', remaining: 200 },  // not active
    { stage: 'cancelled', remaining: 999 },  // not active
  ];
  const r = calcOrderStats(orders);
  assertEq(r.totalOrders, 4);
  assertEq(r.activeCount, 2);
  assertEq(r.totalRem, 150);
});

test('counts late orders (past deadline, not archived/shipping)', () => {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const orders = [
    { stage: 'design', deadline: yesterday.toISOString().slice(0,10) },
    { stage: 'archived', deadline: yesterday.toISOString().slice(0,10) },  // excluded
    { stage: 'shipping', deadline: yesterday.toISOString().slice(0,10) },  // excluded
  ];
  const r = calcOrderStats(orders);
  assertEq(r.lateCount, 1);
});

test('custom calcRem function used', () => {
  const orders = [{ stage: 'design', salePrice: 100, paid: 30 }];
  const r = calcOrderStats(orders, (o) => o.salePrice - o.paid);
  assertEq(r.totalRem, 70);
});

// ── calcNewClientsInRange ──────────────────────────────────────────
test('counts clients within range only', () => {
  const clients = [
    { ...ts(NOW) },
    { ...ts(new Date(2026, 3, 1)) }, // out of range
    { ...ts(NOW) },
  ];
  assertEq(calcNewClientsInRange(clients, RANGE), 2);
});

// ── calcSupplierDue ────────────────────────────────────────────────
test('supplier due = cost - paid (clamp ≥0)', () => {
  const suppliers = [{ _id: 's1' }, { _id: 's2' }];
  const orders = [
    { costItems: [{ supplierId: 's1', total: 500 }] },
    { costItems: [{ supplierId: 's2', total: 200 }] },
  ];
  const payments = [
    { supplierId: 's1', amount: 100 },
    { supplierId: 's2', amount: 500 },  // overpaid → clamps to 0
  ];
  assertEq(calcSupplierDue(suppliers, orders, payments), 400);
});

// ── calcStageDistribution ──────────────────────────────────────────
test('counts orders per stage', () => {
  const orders = [
    { stage: 'design' }, { stage: 'design' }, { stage: 'printing' }, { stage: 'archived' },
  ];
  const r = calcStageDistribution(orders, ['design', 'printing', 'archived', 'shipping']);
  assertEq(r.design, 2);
  assertEq(r.printing, 1);
  assertEq(r.archived, 1);
  assertEq(r.shipping, 0);
});

// ── calcTopClientsByRevenue ────────────────────────────────────────
test('groups by clientId, sums revenue, sorts desc, limits', () => {
  const orders = [
    { clientId: 'c1', clientName: 'A', salePrice: 100 },
    { clientId: 'c1', clientName: 'A', salePrice: 200 },
    { clientId: 'c2', clientName: 'B', salePrice: 500 },
  ];
  const r = calcTopClientsByRevenue(orders, 5);
  assertEq(r[0].name, 'B');
  assertEq(r[0].revenue, 500);
  assertEq(r[1].name, 'A');
  assertEq(r[1].revenue, 300);
  assertEq(r[1].count, 2);
});

test('limit truncates result', () => {
  const orders = Array.from({length: 10}, (_, i) => ({ clientId: 'c'+i, salePrice: 100-i }));
  assertEq(calcTopClientsByRevenue(orders, 3).length, 3);
});

// ── calcTopProductsByRevenue ───────────────────────────────────────
test('aggregates products across orders', () => {
  const orders = [
    { products: [{ name: 'A', qty: 2, price: 50 }] },
    { products: [{ name: 'A', qty: 1, price: 50 }, { name: 'B', qty: 3, price: 100 }] },
  ];
  const r = calcTopProductsByRevenue(orders, 5);
  assertEq(r[0].name, 'B');
  assertEq(r[0].revenue, 300);
  assertEq(r[1].name, 'A');
  assertEq(r[1].qty, 3);
});

// ── calcTopDesignersByCount ────────────────────────────────────────
test('only counts archived orders with designerId', () => {
  const orders = [
    { stage: 'archived', designerId: 'd1', designerName: 'A' },
    { stage: 'archived', designerId: 'd1', designerName: 'A' },
    { stage: 'archived', designerId: 'd2', designerName: 'B' },
    { stage: 'design',   designerId: 'd1' },  // not archived
    { stage: 'archived' },                     // no designerId
  ];
  const r = calcTopDesignersByCount(orders, 5);
  assertEq(r[0].designerId, 'd1');
  assertEq(r[0].count, 2);
  assertEq(r.length, 2);
});

// ── calcMonthlyRevenueChart ────────────────────────────────────────
test('only counts in-type OR collection/advance/deposit categories', () => {
  const txs = [
    { ...ts(new Date(2026, 4, 10)), type: 'in', amount: 100 },
    { ...ts(new Date(2026, 4, 10)), category: 'collection', amount: 50 },
    { ...ts(new Date(2026, 4, 10)), type: 'out', category: 'other', amount: 999 },  // excluded
  ];
  const { keys, data, max } = calcMonthlyRevenueChart(txs, 6);
  assertEq(keys.length, 1);
  assertEq(data['2026-05'].rev, 150);
  assertEq(max, 150);
});

test('truncates to last N months', () => {
  const txs = [];
  for (let m = 0; m < 12; m++) txs.push({ ...ts(new Date(2026, m, 10)), type: 'in', amount: 10 });
  const r = calcMonthlyRevenueChart(txs, 3);
  assertEq(r.keys.length, 3);
});

test('empty input → no keys, max=1', () => {
  const r = calcMonthlyRevenueChart([], 6);
  assertEq(r.keys.length, 0);
  assertEq(r.max, 1);
});

// ── diffHTML ───────────────────────────────────────────────────────
test('zero prev → empty string', () => {
  assertEq(diffHTML(100, 0), '');
});

test('positive change → up arrow', () => {
  const h = diffHTML(150, 100);
  if (!h.includes('↑') || !h.includes('50%')) throw new Error('wrong diff: ' + h);
});

test('negative change → down arrow', () => {
  const h = diffHTML(80, 100);
  if (!h.includes('↓') || !h.includes('20%')) throw new Error('wrong diff: ' + h);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
