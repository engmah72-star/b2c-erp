/**
 * Tests for core/reports-tab-stats.js (reports Phase-1C).
 * Run: node tests/core-reports-tab-stats.test.mjs
 */
import {
  buildDesignerStats, buildShippingStats, buildClientActivityStats,
} from '../core/reports-tab-stats.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// Simple resolver — matches by authUid or _id
const resolver = (emps, designerId, designerName) =>
  emps.find(e => e._id === designerId || e.authUid === designerId || e.name === designerName) || null;

// ── buildDesignerStats ─────────────────────────────────────────────
test('empty → empty stats + null topId', () => {
  const r = buildDesignerStats([], []);
  assertEq(r.stats.length, 0);
  assertEq(r.topId, null);
});

test('excludes orders without matching designer', () => {
  const orders = [
    { stage: 'design', designerId: 'unknown' },
  ];
  const r = buildDesignerStats(orders, [], resolver);
  assertEq(r.stats.length, 0);
});

test('groups orders per designer + computes done/pending/pct/score', () => {
  const employees = [
    { _id: 'd1', name: 'Ahmed' },
    { _id: 'd2', name: 'Sara' },
  ];
  const orders = [
    { stage: 'design',   designerId: 'd1' },
    { stage: 'printing', designerId: 'd1' },
    { stage: 'archived', designerId: 'd1' },
    { stage: 'design',   designerId: 'd2' },
    { stage: 'archived', designerId: 'd2' },
  ];
  const r = buildDesignerStats(orders, employees, resolver);
  assertEq(r.stats.length, 2);
  // d1: 3 orders, 2 done (printing+archived), 1 pending, pct=66, score=2*0.66=1.32
  // d2: 2 orders, 1 done, 1 pending, pct=50, score=1*0.5=0.5
  assertEq(r.stats[0].name, 'Ahmed');
  assertEq(r.stats[0].done, 2);
  assertEq(r.stats[0].pending, 1);
  assertEq(r.stats[0].pct, 67);  // round(2/3*100)=67
  assertEq(r.topId, 'd1');
});

test('avgDays computed from orders with designDays', () => {
  const employees = [{ _id: 'd1', name: 'A' }];
  const orders = [
    { stage: 'archived', designerId: 'd1', designDays: 4 },
    { stage: 'archived', designerId: 'd1', designDays: 6 },
    { stage: 'archived', designerId: 'd1' }, // no designDays → excluded
  ];
  const r = buildDesignerStats(orders, employees, resolver);
  assertEq(r.stats[0].avgDays, 5);
});

// ── buildShippingStats ─────────────────────────────────────────────
test('empty input → no companies', () => {
  const r = buildShippingStats([], [], [], () => false);
  assertEq(r.totShip, 0);
  assertEq(r.companies.length, 0);
});

test('includes orders in shipping/archived OR with shipCompanyName', () => {
  const orders = [
    { stage: 'shipping', shipCompanyName: 'Aramex' },
    { stage: 'archived', shipCompanyName: 'Aramex' },
    { stage: 'design', shipCompanyName: 'Aramex' },  // included (has company)
    { stage: 'design' },  // excluded (no company)
  ];
  const r = buildShippingStats(orders, [], [], () => false);
  assertEq(r.totShip, 3);
});

test('counts delivered + returned per company', () => {
  const isDelivered = (o) => o.shipStage === 'delivered' || o.stage === 'archived';
  const orders = [
    { stage: 'shipping', shipCompanyName: 'X', shipStage: 'delivered' },
    { stage: 'shipping', shipCompanyName: 'X', shipStage: 'returned' },
    { stage: 'archived', shipCompanyName: 'X' },
  ];
  const r = buildShippingStats(orders, [], [{ name: 'X', phone: '01' }], isDelivered);
  assertEq(r.delivered, 2);
  assertEq(r.returned, 1);
  assertEq(r.perCompany[0].count, 3);
  assertEq(r.perCompany[0].delivered, 2);
  assertEq(r.perCompany[0].returned, 1);
  assertEq(r.perCompany[0].rate, 67);
});

test('sums shippingCost across all shipped orders', () => {
  const orders = [
    { stage: 'shipping', shipCompanyName: 'X', shippingCost: 100 },
    { stage: 'archived', shipCompanyName: 'X', shippingCost: 50 },
  ];
  const r = buildShippingStats(orders, [], [], () => false);
  assertEq(r.totShipCost, 150);
});

test('shippers without orders still appear in companies', () => {
  const orders = [{ stage: 'shipping', shipCompanyName: 'A' }];
  const shippers = [{ name: 'A' }, { name: 'B' }];
  const r = buildShippingStats(orders, [], shippers, () => false);
  // Both A and B in companies (A from orders, B from shippers)
  if (!r.companies.includes('A')) throw new Error('A missing');
  if (!r.companies.includes('B')) throw new Error('B missing');
});

// ── buildClientActivityStats ───────────────────────────────────────
test('empty → zeroed stats', () => {
  const r = buildClientActivityStats([], []);
  assertEq(r.activeCount, 0);
  assertEq(r.newCount, 0);
  assertEq(r.avgOrder, 0);
  assertEq(r.repeatCount, 0);
  assertEq(r.maxTotal, 1);
});

test('groups orders by clientId, sums total/paid', () => {
  const orders = [
    { clientId: 'c1', clientName: 'A', salePrice: 100, totalPaid: 50 },
    { clientId: 'c1', clientName: 'A', salePrice: 200, totalPaid: 200 },
    { clientId: 'c2', clientName: 'B', salePrice: 300, paid: 100 },
  ];
  const r = buildClientActivityStats(orders, []);
  // Sorted by total desc: A (300), B (300) — tie OK
  assertEq(r.activeCount, 2);
  const a = r.sorted.find(c => c.name === 'A');
  assertEq(a.count, 2);
  assertEq(a.total, 300);
  assertEq(a.paid, 250);
});

test('counts repeat clients (count > 1)', () => {
  const orders = [
    { clientId: 'c1', salePrice: 100 },
    { clientId: 'c1', salePrice: 100 },
    { clientId: 'c2', salePrice: 100 },
  ];
  const r = buildClientActivityStats(orders, []);
  assertEq(r.repeatCount, 1);
});

test('avgOrder = totalRevenue / clients', () => {
  const orders = [
    { clientId: 'c1', salePrice: 200 },
    { clientId: 'c2', salePrice: 100 },
  ];
  const r = buildClientActivityStats(orders, []);
  assertEq(r.avgOrder, 150);
});

test('newCount uses clients.createdAt >= range.from', () => {
  const range = { from: new Date(2026, 4, 1) };
  const orders = [
    { clientId: 'c1' },  // c1 new
    { clientId: 'c2' },  // c2 old
  ];
  const clients = [
    { _id: 'c1', createdAt: { seconds: Math.floor(new Date(2026, 4, 10).getTime() / 1000) } },
    { _id: 'c2', createdAt: { seconds: Math.floor(new Date(2025, 0, 1).getTime() / 1000) } },
  ];
  const r = buildClientActivityStats(orders, clients, range);
  assertEq(r.newCount, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
