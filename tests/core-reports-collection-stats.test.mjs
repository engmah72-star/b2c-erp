/**
 * Tests for core/reports-collection-stats.js (reports Phase-1F).
 * Run: node tests/core-reports-collection-stats.test.mjs
 */
import { buildCollectionStats, buildCollectionByClient } from '../core/reports-collection-stats.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

const ts = (d) => ({ createdAt: { seconds: Math.floor(d.getTime() / 1000) } });
const inRange = new Date(2026, 4, 15);

// ── buildCollectionStats ────────────────────────────────────────────
test('empty orders → isEmpty true', () => {
  const r = buildCollectionStats({ orders: [] });
  assertEq(r.isEmpty, true);
  assertEq(r.sorted.length, 0);
});

test('filters orders without salePrice', () => {
  const orders = [
    { salePrice: 0 }, { salePrice: 100 },
  ];
  const r = buildCollectionStats({ orders, calcRem: () => 0 });
  assertEq(r.sorted.length, 1);
});

test('computes totals (sale/paid/rem/cost/profit)', () => {
  const orders = [{
    salePrice: 1000, totalPaid: 800,
    costItems: [{ total: 200 }, { total: 300 }],
  }];
  const r = buildCollectionStats({ orders, calcRem: (o) => 200 });
  assertEq(r.totals.sale, 1000);
  assertEq(r.totals.paid, 800);
  assertEq(r.totals.rem, 200);
  assertEq(r.totals.cost, 500);
  assertEq(r.totals.profit, 300);
});

test('counts fullPaid/partial/noPay correctly', () => {
  const orders = [
    { salePrice: 100, totalPaid: 100 },  // fullPaid (rem=0)
    { salePrice: 200, totalPaid: 50 },   // partial
    { salePrice: 300, totalPaid: 0 },    // noPay
  ];
  const r = buildCollectionStats({
    orders, calcRem: (o) => Math.max(0, o.salePrice - o.totalPaid),
  });
  assertEq(r.counts.fullPaid, 1);
  assertEq(r.counts.partial, 1);
  assertEq(r.counts.noPay, 1);
});

test('stage counts', () => {
  const orders = [
    { salePrice: 100, stage: 'design' },
    { salePrice: 100, stage: 'design' },
    { salePrice: 100, stage: 'printing' },
    { salePrice: 100, stage: 'archived' },
  ];
  const r = buildCollectionStats({ orders, calcRem: () => 0 });
  assertEq(r.stageCounts.design, 2);
  assertEq(r.stageCounts.printing, 1);
  assertEq(r.stageCounts.archived, 1);
});

test('postDesignWithRem: only printing/production/shipping + rem > 0', () => {
  const orders = [
    { salePrice: 100, stage: 'design',   totalPaid: 50 },  // excluded (design)
    { salePrice: 100, stage: 'printing', totalPaid: 50 },  // included
    { salePrice: 100, stage: 'shipping', totalPaid: 100 }, // excluded (rem=0)
  ];
  const r = buildCollectionStats({
    orders, calcRem: (o) => Math.max(0, o.salePrice - o.totalPaid),
  });
  assertEq(r.postDesignWithRem.length, 1);
  assertEq(r.postDesignAmount, 50);
});

test('aging buckets — by daysSince', () => {
  const orders = [
    { salePrice: 100, totalPaid: 50, createdAt: { seconds: 1 } },  // very old
    { salePrice: 100, totalPaid: 50, createdAt: { seconds: 2 } },  // recent
  ];
  const fakeDaysSince = (ts) => ts.seconds === 1 ? 120 : 10;
  const r = buildCollectionStats({
    orders,
    calcRem: (o) => o.salePrice - o.totalPaid,
    daysSince: fakeDaysSince,
  });
  assertEq(r.aging['0-30'].n, 1);
  assertEq(r.aging['0-30'].a, 50);
  assertEq(r.aging['90+'].n, 1);
  assertEq(r.aging['90+'].a, 50);
});

test('sort by client name asc', () => {
  const orders = [
    { salePrice: 100, clientName: 'ب' },
    { salePrice: 100, clientName: 'أ' },
  ];
  const r = buildCollectionStats({ orders, calcRem: () => 0, sortKey: 'client', sortDir: 'asc' });
  // 'أ' (alif-hamza) should come before 'ب' in Arabic
  assertEq(r.sorted[0].clientName, 'أ');
});

test('sort by sale desc (default)', () => {
  const orders = [
    { salePrice: 100 }, { salePrice: 500 }, { salePrice: 300 },
  ];
  const r = buildCollectionStats({ orders, calcRem: () => 0, sortKey: 'sale', sortDir: 'desc' });
  assertEq(r.sorted[0].salePrice, 500);
  assertEq(r.sorted[2].salePrice, 100);
});

test('staleCount + noCostCount filtered by predicates', () => {
  const orders = [
    { salePrice: 100, isStale: true, hasCost: false },
    { salePrice: 100, isStale: false, hasCost: true },
  ];
  const r = buildCollectionStats({
    orders, calcRem: () => 0,
    isStaleOrder: (o) => o.isStale,
    isMissingCost: (o) => !o.hasCost,
  });
  assertEq(r.counts.staleCount, 1);
  assertEq(r.counts.noCostCount, 1);
});

// ── buildCollectionByClient ─────────────────────────────────────────
test('groups by clientId, sums sale/paid/rem', () => {
  const orders = [
    { clientId: 'c1', clientName: 'A', salePrice: 100, totalPaid: 50 },
    { clientId: 'c1', clientName: 'A', salePrice: 200, totalPaid: 200 },
    { clientId: 'c2', clientName: 'B', salePrice: 300, totalPaid: 100 },
  ];
  const r = buildCollectionByClient({
    orders, calcRem: (o) => o.salePrice - o.totalPaid,
  });
  assertEq(r.length, 2);
  // Sorted by rem desc: B has rem=200, A has rem=50
  assertEq(r[0].name, 'B');
  assertEq(r[0].rem, 200);
  assertEq(r[1].name, 'A');
  assertEq(r[1].count, 2);
  assertEq(r[1].rem, 50);
});

test('tracks lastTs (max of updatedAt/createdAt seconds)', () => {
  const orders = [
    { clientId: 'c1', createdAt: { seconds: 100 } },
    { clientId: 'c1', updatedAt: { seconds: 200 } },
  ];
  const r = buildCollectionByClient({ orders, calcRem: () => 0 });
  assertEq(r[0].lastTs, 200);
});

test('counts stale and noCost flags per client', () => {
  const orders = [
    { clientId: 'c1', clientName: 'A', salePrice: 100, _stale: true, _noCost: true },
    { clientId: 'c1', clientName: 'A', salePrice: 100, _stale: false, _noCost: false },
  ];
  const r = buildCollectionByClient({
    orders, calcRem: () => 0,
    isStaleOrder: (o) => o._stale,
    isMissingCost: (o) => o._noCost,
  });
  assertEq(r[0].stale, 1);
  assertEq(r[0].noCost, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
