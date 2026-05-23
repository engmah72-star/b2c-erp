/**
 * Node-runnable tests for core/employee-kpis.js (Phase-1B god-page decomp).
 * Run: node tests/core-employee-kpis.test.mjs
 *
 * Pure tests — no Firestore, no DOM. Locks role-based KPI shapes and
 * commission computation against future regressions.
 */
import { computeRoleKpis } from '../core/employee-kpis.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// helper: mock Timestamp-like object
const ts = (d) => ({ toDate: () => d });
// Latin-digit formatter for predictable string assertions
const latinFmt = (n) => String(parseFloat(n) || 0);

// ── empty / missing inputs ──────────────────────────────────────────
test('returns empty kpis when employee missing', () => {
  const r = computeRoleKpis({ employeeId: 'x', mKey: '2026-05' });
  assertEq(r.kpis.length, 0);
  assertEq(r.income.total, 0);
});

test('default role returns 4-item KPI array', () => {
  const r = computeRoleKpis({
    employee: { role: 'admin', baseSalary: 5000, startDate: '2024-01-01', status: 'active' },
    employeeId: 'a1', mKey: '2026-05',
  });
  assertEq(r.kpis.length, 4);
  assertEq(r.kpis[0].lbl, 'المرتب ج');
  assertEq(r.kpis[0].val, 5000);
  assertEq(r.kpis[2].val, '✅');
});

// ── designer KPIs ──────────────────────────────────────────────────
test('designer: counts assigned/printed/rejected/rate', () => {
  const myOrders = [
    { stage: 'design' }, { stage: 'printing' }, { stage: 'archived' },
    { stage: 'design', designStatus: 'rejected' },
  ];
  const r = computeRoleKpis({
    employee: { role: 'graphic_designer' }, employeeId: 'd1',
    myOrders, allOrders: [], mKey: '2026-05',
  });
  assertEq(r.kpis[0].val, 4);             // assigned
  assertEq(r.kpis[1].val, 2);             // printed (printing + archived)
  assertEq(r.kpis[2].val, 1);             // rejected
  assertEq(r.kpis[3].val, '50%');         // rate = 2/4
});

test('designer: zero assigned → rate 0%', () => {
  const r = computeRoleKpis({
    employee: { role: 'design_operator' }, employeeId: 'd1',
    myOrders: [], allOrders: [], mKey: '2026-05',
  });
  assertEq(r.kpis[3].val, '0%');
});

// ── sales/ops KPIs ─────────────────────────────────────────────────
test('customer_service: counts orders, distinct clients, sales total, close-rate', () => {
  const myOrders = [
    { clientId: 'c1', salePrice: 100, stage: 'archived' },
    { clientId: 'c1', salePrice: 200, stage: 'archived' }, // dup client
    { clientId: 'c2', salePrice: 50,  stage: 'design'  },
  ];
  const r = computeRoleKpis({
    employee: { role: 'customer_service' }, employeeId: 'u1',
    myOrders, allOrders: [], mKey: '2026-05',
    format: latinFmt,
  });
  assertEq(r.kpis[0].val, 3);              // orders
  assertEq(r.kpis[1].val, 2);              // unique clients
  assertEq(r.kpis[2].val, '350');          // sales
  assertEq(r.kpis[3].val, '67%');          // close rate = 2/3
});

test('sales: zero orders → close rate "—"', () => {
  const r = computeRoleKpis({
    employee: { role: 'operation_manager' }, employeeId: 'u1',
    myOrders: [], allOrders: [], mKey: '2026-05',
  });
  assertEq(r.kpis[3].val, '—');
});

// ── production KPIs ────────────────────────────────────────────────
test('production_agent: counts orders/done/wip + sums cost items by author', () => {
  const myOrders = [
    { stage: 'shipping', costItems: [{ addedBy: 'Ahmed', total: 100 }, { addedBy: 'X', total: 50 }] },
    { stage: 'production', costItems: [{ addedBy: 'Ahmed', total: 200 }] },
    { stage: 'production' }, // no costItems
  ];
  const r = computeRoleKpis({
    employee: { role: 'production_agent', name: 'Ahmed' }, employeeId: 'p1',
    myOrders, allOrders: [], mKey: '2026-05',
    format: latinFmt,
  });
  assertEq(r.kpis[0].val, 3);              // total orders
  assertEq(r.kpis[1].val, 1);              // done (shipping/archived)
  assertEq(r.kpis[2].val, 2);              // wip (production)
  assertEq(r.kpis[3].val, '300');          // 100 (Ahmed) + 200 (Ahmed) — X excluded
});

// ── shipping KPIs ──────────────────────────────────────────────────
test('shipping_officer: counts shipped, collected sum, done, completion-rate', () => {
  const myOrders = [
    { stage: 'shipping', totalPaid: 100 },
    { stage: 'archived', totalPaid: 250 },
    { stage: 'production' },
  ];
  const r = computeRoleKpis({
    employee: { role: 'shipping_officer' }, employeeId: 's1',
    myOrders, allOrders: [], mKey: '2026-05',
    format: latinFmt,
  });
  assertEq(r.kpis[0].val, 2);              // shipped (shipping+archived)
  assertEq(r.kpis[1].val, '350');
  assertEq(r.kpis[2].val, 1);              // done (archived only)
  assertEq(r.kpis[3].val, '50%');          // 1/2
});

// ── commission: designer (pct on paid orders this month) ───────────
test('designer commission: pct × salePrice on paid orders this month (matched by designerId)', () => {
  const monthDate = new Date(2026, 4, 15); // May 2026
  const otherMonth = new Date(2026, 3, 15);
  const allOrders = [
    { paymentStatus: 'paid', paidAt: ts(monthDate), salePrice: 1000, designerId: 'auth1' },
    { paymentStatus: 'paid', paidAt: ts(monthDate), salePrice: 500,  designerId: 'auth1' },
    { paymentStatus: 'paid', paidAt: ts(otherMonth), salePrice: 9999, designerId: 'auth1' }, // wrong month
    { paymentStatus: 'paid', paidAt: ts(monthDate), salePrice: 200, designerId: 'other' },     // wrong designer
    { paymentStatus: 'partial', paidAt: ts(monthDate), salePrice: 999, designerId: 'auth1' },  // not paid
  ];
  const r = computeRoleKpis({
    employee: { role: 'graphic_designer', authUid: 'auth1', commissionPct: 10 },
    employeeId: 'd1',
    myOrders: [], allOrders, mKey: '2026-05',
  });
  assertEq(r.income.commission, 150); // (1000+500) × 10%
  assertEq(r.income.base, 0);
  assertEq(r.income.total, 150);
});

test('production commission: per-order × count of paid orders this month (matched by productionAgent)', () => {
  const monthDate = new Date(2026, 4, 10);
  const allOrders = [
    { paymentStatus: 'paid', paidAt: ts(monthDate), productionAgent: 'auth1' },
    { paymentStatus: 'paid', paidAt: ts(monthDate), productionAgent: 'auth1' },
    { paymentStatus: 'paid', paidAt: ts(monthDate), productionAgent: 'other' },
  ];
  const r = computeRoleKpis({
    employee: { role: 'production_agent', authUid: 'auth1', commissionPerOrder: 50, baseSalary: 3000 },
    employeeId: 'p1',
    myOrders: [], allOrders, mKey: '2026-05',
  });
  assertEq(r.income.commission, 100);  // 2 × 50
  assertEq(r.income.base, 3000);
  assertEq(r.income.total, 3100);
});

test('commission falls back to createdAt when paidAt missing', () => {
  const monthDate = new Date(2026, 4, 10);
  const allOrders = [
    { paymentStatus: 'paid', createdAt: ts(monthDate), shippingOfficerId: 'auth1' },
  ];
  const r = computeRoleKpis({
    employee: { role: 'shipping_officer', authUid: 'auth1', commissionPerOrder: 25 },
    employeeId: 's1',
    myOrders: [], allOrders, mKey: '2026-05',
  });
  assertEq(r.income.commission, 25);
});

test('admin role → no commission', () => {
  const allOrders = [
    { paymentStatus: 'paid', paidAt: ts(new Date(2026, 4, 10)), salePrice: 1000 },
  ];
  const r = computeRoleKpis({
    employee: { role: 'admin', baseSalary: 10000 },
    employeeId: 'a1', myOrders: [], allOrders, mKey: '2026-05',
  });
  assertEq(r.income.commission, 0);
});

// ── income.total = base + commission ───────────────────────────────
test('income.total = base + commission', () => {
  const r = computeRoleKpis({
    employee: { role: 'admin', baseSalary: 7000 },
    employeeId: 'a1', myOrders: [], allOrders: [], mKey: '2026-05',
  });
  assertEq(r.income.total, 7000);
  assertEq(r.income.base, 7000);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
