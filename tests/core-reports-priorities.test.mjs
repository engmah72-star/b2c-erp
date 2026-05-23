/**
 * Tests for core/reports-priorities.js (reports Phase-1D).
 * Run: node tests/core-reports-priorities.test.mjs
 */
import {
  buildPriorityItems, buildSalesTabStats, buildExpenseBreakdown,
} from '../core/reports-priorities.js';

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

// ── buildPriorityItems ─────────────────────────────────────────────
test('empty → []', () => {
  const r = buildPriorityItems({ orders: [], suppliers: [], payments: [] });
  assertEq(r.length, 0);
});

test('post-design with remaining → 🚨 item', () => {
  const r = buildPriorityItems({
    orders: [{ _id: 'o1', clientName: 'A', salePrice: 1000, stage: 'printing' }],
    calcRem: () => 500,
    daysSince: () => 3,
  });
  assertEq(r.length, 1);
  assertEq(r[0].type, 'post-design');
  assertEq(r[0].amount, 500);
});

test('late delivery → ⏰ item with daysLate', () => {
  const yesterday = new Date(NOW); yesterday.setDate(NOW.getDate() - 5);
  const r = buildPriorityItems({
    orders: [{ _id: 'o1', clientName: 'A', salePrice: 100, stage: 'design', deadline: yesterday.toISOString().slice(0, 10) }],
    calcRem: () => 0,
    now: NOW,
  });
  assertEq(r[0].type, 'late');
  if (!r[0].subtitle.includes('5 يوم')) throw new Error('daysLate not in subtitle');
});

test('archived orders excluded from late', () => {
  const yesterday = new Date(NOW); yesterday.setDate(NOW.getDate() - 5);
  const r = buildPriorityItems({
    orders: [{ _id: 'o1', stage: 'archived', deadline: yesterday.toISOString().slice(0, 10) }],
    calcRem: () => 0,
    now: NOW,
  });
  assertEq(r.length, 0);
});

test('isMissingCost → 🚫 item', () => {
  const r = buildPriorityItems({
    orders: [{ _id: 'o1', clientName: 'A', salePrice: 1000 }],
    calcRem: () => 0,
    isMissingCost: () => true,
  });
  assertEq(r[0].type, 'no-cost');
});

test('vendor due > 500 → 🏭 item, ≤500 excluded', () => {
  const r = buildPriorityItems({
    orders: [
      { _id: 'o1', costItems: [{ supplierId: 'sup1', total: 1000 }] },
      { _id: 'o2', costItems: [{ supplierId: 'sup2', total: 200 }] },
    ],
    suppliers: [{ _id: 'sup1', name: 'Big' }, { _id: 'sup2', name: 'Small' }],
    payments: [{ supplierId: 'sup1', amount: 100 }],
  });
  const vendors = r.filter(x => x.type === 'vendor');
  assertEq(vendors.length, 1);
  assertEq(vendors[0].title, 'Big');
  assertEq(vendors[0].amount, 900);
});

test('dedup: same orderId in multiple categories appears once', () => {
  const yesterday = new Date(NOW); yesterday.setDate(NOW.getDate() - 5);
  // Same order: post-design + late
  const order = {
    _id: 'o1', clientName: 'A', salePrice: 1000, stage: 'printing',
    deadline: yesterday.toISOString().slice(0, 10),
  };
  const r = buildPriorityItems({
    orders: [order],
    calcRem: () => 500,
    now: NOW,
  });
  // Should pick the highest score one (post-design) only
  assertEq(r.length, 1);
});

test('limit truncates output', () => {
  const orders = Array.from({ length: 20 }, (_, i) => ({
    _id: 'o' + i, clientName: 'A', salePrice: 1000, stage: 'printing',
  }));
  const r = buildPriorityItems({
    orders,
    calcRem: () => 100,
    limit: 5,
  });
  assertEq(r.length, 5);
});

// ── buildSalesTabStats ─────────────────────────────────────────────
test('empty → zero stats', () => {
  const s = buildSalesTabStats([], []);
  assertEq(s.tot, 0);
  assertEq(s.costs, 0);
  assertEq(s.profit, 0);
  assertEq(s.margin, 0);
});

test('computes revenue + costs + profit + margin', () => {
  const orders = [
    {
      salePrice: 1000, totalPaid: 800,
      costItems: [{ total: 200 }, { total: 300 }],
    },
  ];
  const s = buildSalesTabStats(orders, []);
  assertEq(s.tot, 800);
  assertEq(s.costs, 500);
  assertEq(s.profit, 300);
  assertEq(s.margin, 38);  // round(300/800*100)=38
});

test('excludes orders without salePrice/totalPaid', () => {
  const orders = [
    { salePrice: 0, totalPaid: 0 },
    { salePrice: 100, totalPaid: 100, costItems: [{ total: 20 }] },
  ];
  const s = buildSalesTabStats(orders, []);
  assertEq(s.tot, 100);
});

test('products aggregated across orders', () => {
  const orders = [
    { salePrice: 100, products: [{ name: 'A', qty: 2, salePrice: 50 }] },
    { salePrice: 200, products: [{ name: 'A', qty: 1, salePrice: 50 }, { name: 'B', qty: 5 }] },
  ];
  const s = buildSalesTabStats(orders, []);
  const a = s.sortedProducts.find(([n]) => n === 'A');
  assertEq(a[1].count, 2);
  assertEq(a[1].qty, 3);
});

// ── buildExpenseBreakdown ──────────────────────────────────────────
test('empty → zero buckets', () => {
  const r = buildExpenseBreakdown([], { from: new Date(2026,4,1), to: new Date(2026,4,31) });
  assertEq(r.total, 0);
  assertEq(r.buckets.vendor, 0);
});

test('only out-type in-range transactions counted', () => {
  const range = { from: new Date(2026,4,1), to: new Date(2026,4,31) };
  const txs = [
    { ...ts(NOW), type: 'in', amount: 999, category: 'collection' },  // wrong type
    { ...ts(new Date(2026,3,1)), type: 'out', amount: 500, category: 'expense' },  // wrong range
    { ...ts(NOW), type: 'out', amount: 100, category: 'general_expense' },
  ];
  const r = buildExpenseBreakdown(txs, range);
  assertEq(r.data.length, 1);
  assertEq(r.total, 100);
});

test('categorizes into buckets correctly', () => {
  const range = { from: new Date(2026,4,1), to: new Date(2026,4,31) };
  const txs = [
    { ...ts(NOW), type: 'out', amount: 100, category: 'vendor_payment' },
    { ...ts(NOW), type: 'out', amount: 50,  category: 'shipper_payment' },
    { ...ts(NOW), type: 'out', amount: 200, category: 'salary_payment' },
    { ...ts(NOW), type: 'out', amount: 30,  category: 'expense' },
    { ...ts(NOW), type: 'out', amount: 20,  category: 'misc' },
  ];
  const r = buildExpenseBreakdown(txs, range);
  assertEq(r.buckets.vendor, 100);
  assertEq(r.buckets.shipper, 50);
  assertEq(r.buckets.salary, 200);
  assertEq(r.buckets.general, 30);
  assertEq(r.buckets.other, 20);
});

test('data sorted by createdAt desc', () => {
  const range = { from: new Date(2026,4,1), to: new Date(2026,4,31) };
  const txs = [
    { ...ts(new Date(2026,4,10)), type: 'out', amount: 10 },
    { ...ts(new Date(2026,4,20)), type: 'out', amount: 20 },
    { ...ts(new Date(2026,4,15)), type: 'out', amount: 15 },
  ];
  const r = buildExpenseBreakdown(txs, range);
  assertEq(r.data[0].amount, 20);
  assertEq(r.data[1].amount, 15);
  assertEq(r.data[2].amount, 10);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
