/**
 * Tests for core/accounts-kpis.js (Phase-1 accounts decomp).
 * Run: node tests/core-accounts-kpis.test.mjs
 */
import {
  calcWalletBalanceTotal, calcPeriodFlow,
  calcPendingRevenue, calcEarnedRevenue,
  calcShippingDebt, calcClientDebt,
  calcTotalOrderCosts, calcSupplierDue, calcSupplierDueBreakdown, calcShippingCollected,
  calcTotalPrinting,
  auditWalletBalances,
} from '../core/accounts-kpis.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

const ts = (d) => ({ seconds: Math.floor(d.getTime() / 1000) });
const inRange = (range) => (t) => {
  const sec = t?.seconds || 0;
  if (!sec) return false;
  const d = new Date(sec * 1000);
  return d >= range.from && d <= range.to;
};
const RANGE = { from: new Date(2026, 4, 1), to: new Date(2026, 4, 31, 23, 59, 59) };
const NOW = ts(new Date(2026, 4, 15));

// ── calcWalletBalanceTotal ─────────────────────────────────────────
test('calcWalletBalanceTotal: empty → 0', () => {
  assertEq(calcWalletBalanceTotal([]), 0);
});

test('calcWalletBalanceTotal: sums balances', () => {
  assertEq(calcWalletBalanceTotal([{ balance: 100 }, { balance: 200.5 }, { balance: '50' }]), 350.5);
});

test('calcWalletBalanceTotal: handles NaN/missing', () => {
  assertEq(calcWalletBalanceTotal([{ balance: 100 }, {}, { balance: 'abc' }]), 100);
});

// ── calcPeriodFlow ──────────────────────────────────────────────────
test('calcPeriodFlow: empty → zeros', () => {
  const r = calcPeriodFlow([], inRange(RANGE));
  assertEq(r.income, 0);
  assertEq(r.expense, 0);
  assertEq(r.profit, 0);
});

test('calcPeriodFlow: sums in/out within range', () => {
  const txs = [
    { type: 'in', amount: 1000, createdAt: NOW },
    { type: 'in', amount: 500, createdAt: NOW },
    { type: 'out', amount: 300, createdAt: NOW },
  ];
  const r = calcPeriodFlow(txs, inRange(RANGE));
  assertEq(r.income, 1500);
  assertEq(r.expense, 300);
  assertEq(r.profit, 1200);
});

test('calcPeriodFlow: excludes out-of-range', () => {
  const txs = [
    { type: 'in', amount: 999, createdAt: ts(new Date(2026, 3, 1)) },
    { type: 'in', amount: 100, createdAt: NOW },
  ];
  const r = calcPeriodFlow(txs, inRange(RANGE));
  assertEq(r.income, 100);
});

// ── calcPendingRevenue ──────────────────────────────────────────────
test('calcPendingRevenue: zero when empty', () => {
  const r = calcPendingRevenue([]);
  assertEq(r.pendTotal, 0);
  assertEq(r.pendCount, 0);
  assertEq(r.remTotal, 0);
});

test('calcPendingRevenue: counts orders with sale or paid', () => {
  const orders = [
    { salePrice: 1000, totalPaid: 500 },  // pending
    { salePrice: 200, totalPaid: 0 },     // pending (has sale)
    { salePrice: 0, totalPaid: 100 },     // pending (has paid)
    { salePrice: 0, totalPaid: 0 },       // not counted
  ];
  const r = calcPendingRevenue(orders, (o) => Math.max(0, o.salePrice - o.totalPaid));
  assertEq(r.pendCount, 3);
  assertEq(r.pendTotal, 600); // 500 + 0 + 100
  assertEq(r.remTotal, 700);   // 500 + 200 + 0
});

// ── calcEarnedRevenue ───────────────────────────────────────────────
test('calcEarnedRevenue: counts orders with salePrice > 0', () => {
  const orders = [
    { salePrice: 1000, totalPaid: 1000 },
    { salePrice: 500, totalPaid: 200 },  // partial archived
    { salePrice: 0, totalPaid: 0 },       // excluded
  ];
  const r = calcEarnedRevenue(orders, (o) => o.salePrice - o.totalPaid);
  assertEq(r.earnCount, 2);
  assertEq(r.earnTotal, 1200);  // 1000 + 200 (actual paid)
});

// ── calcShippingDebt ────────────────────────────────────────────────
test('calcShippingDebt: only unsettled non-pickup shipping/archived', () => {
  const orders = [
    { stage: 'shipping', shipCompanyName: 'X', shipSettled: false, salePrice: 1000, totalPaid: 200, discount: 0 },
    { stage: 'shipping', shipCompanyName: 'X', shipSettled: true, salePrice: 1000, totalPaid: 0 },  // excluded
    { stage: 'design', shipCompanyName: 'X', shipSettled: false, salePrice: 1000, totalPaid: 0 },   // excluded (not shipping/archived)
    { stage: 'shipping', shipMethod: 'pickup', shipCompanyName: 'X', shipSettled: false, salePrice: 1000 },  // pickup excluded
  ];
  // Only first: 1000 - 0 - 200 = 800
  assertEq(calcShippingDebt(orders), 800);
});

// ── calcClientDebt ──────────────────────────────────────────────────
test('calcClientDebt: excludes shipping-debt-covered orders', () => {
  const orders = [
    { stage: 'design', salePrice: 1000, totalPaid: 200 },  // included (no shipping debt)
    { stage: 'shipping', shipCompanyName: 'X', shipSettled: false, salePrice: 1000, totalPaid: 0 },  // excluded
  ];
  // Only first: rem=800 (calcRem)
  assertEq(calcClientDebt(orders, (o) => o.salePrice - o.totalPaid), 800);
});

// ── calcTotalOrderCosts ─────────────────────────────────────────────
test('calcTotalOrderCosts: sums cost items across orders', () => {
  const orders = [
    { costItems: [{ total: 100 }, { total: 200 }] },
    { costItems: [{ total: 50 }] },
    {},  // no costItems
  ];
  assertEq(calcTotalOrderCosts(orders), 350);
});

// ── calcTotalPrinting ───────────────────────────────────────────────
test('calcTotalPrinting: sums only printing-type cost items', () => {
  const orders = [
    { costItems: [{ type: 'طباعة', total: 100 }, { type: 'ورق', total: 50 }] },
    { costItems: [{ type: 'طباعة', total: 200, paid: true }] },
    { costItems: [{ type: 'تصميم', total: 999 }] },  // excluded
    {},  // no costItems
  ];
  const r = calcTotalPrinting(orders);
  assertEq(r.total, 300);  // 100 + 200
  assertEq(r.paid, 200);   // only the paid printing item
  assertEq(r.due, 100);    // 300 - 200
  assertEq(r.count, 2);
});

test('calcTotalPrinting: empty → zeros', () => {
  const r = calcTotalPrinting([]);
  assertEq(r.total, 0);
  assertEq(r.paid, 0);
  assertEq(r.due, 0);
  assertEq(r.count, 0);
});

// ── calcSupplierDue ─────────────────────────────────────────────────
test('calcSupplierDue: totalCost - totalPaid (clamped ≥ 0)', () => {
  const orders = [{ costItems: [{ total: 1000 }] }];
  const payments = [{ amount: 300 }];
  assertEq(calcSupplierDue(orders, payments), 700);
});

test('calcSupplierDue: clamps at 0 when overpaid', () => {
  const orders = [{ costItems: [{ total: 100 }] }];
  const payments = [{ amount: 500 }];
  assertEq(calcSupplierDue(orders, payments), 0);
});

// ── calcSupplierDueBreakdown (مصدر واحد لكل شاشات مستحق الموردين) ────
test('breakdown: clamp لكل مورد على حدة — زيادة مورد لا تُخصم من مستحق آخر', () => {
  const orders = [{ costItems: [
    { supplierId: 's1', total: 500 },
    { supplierId: 's2', total: 200 },
  ] }];
  const payments = [
    { supplierId: 's1', amount: 100 },
    { supplierId: 's2', amount: 900 }, // زيادة 700 لمورد s2
  ];
  const bd = calcSupplierDueBreakdown(orders, payments);
  // النمط القديم (netting إجمالي): 700-1000 → 0. الصحيح: s1 لسه له 400.
  assertEq(bd.total, 400);
});

test('breakdown: البنود الملغاة (voided) مستبعدة', () => {
  const orders = [{ costItems: [
    { supplierId: 's1', total: 300 },
    { supplierId: 's1', total: 999, status: 'voided' },
  ] }];
  const bd = calcSupplierDueBreakdown(orders, []);
  assertEq(bd.total, 300);
});

test('breakdown: بنود بلا مورد تتجمّع في bucket منفصل وتدخل الإجمالي', () => {
  const orders = [{ costItems: [
    { supplierId: 's1', total: 500 },
    { total: 250 },                    // بدون مورد
    { supplierId: '', total: 50 },     // بدون مورد
  ] }];
  const payments = [{ supplierId: 's1', amount: 200 }];
  const bd = calcSupplierDueBreakdown(orders, payments);
  assertEq(bd.assigned, 300);
  assertEq(bd.unassigned, 300);
  assertEq(bd.total, 600);
  // الإجمالي = مجموع صفوف التفصيل بالضبط (سبب بلاغ 60 ألف مقابل 39 ألف)
  assertEq(bd.total, bd.entries.reduce((s, e) => s + e.due, 0));
});

test('breakdown: calcSupplierDue = breakdown.total (نفس الرقم في كل الشاشات)', () => {
  const orders = [{ costItems: [
    { supplierId: 's1', total: 500 },
    { total: 100 },
    { supplierId: 's2', total: 80, status: 'voided' },
  ] }];
  const payments = [{ supplierId: 's1', amount: 150 }];
  assertEq(calcSupplierDue(orders, payments), calcSupplierDueBreakdown(orders, payments).total);
  assertEq(calcSupplierDue(orders, payments), 450);
});

// ── calcShippingCollected ───────────────────────────────────────────
test('calcShippingCollected: sums settlements in range', () => {
  const settlements = [
    { amount: 100, createdAt: NOW },
    { amount: 200, createdAt: ts(new Date(2026, 3, 1)) },  // out
    { amount: 50, createdAt: NOW },
  ];
  assertEq(calcShippingCollected(settlements, inRange(RANGE)), 150);
});

// ── auditWalletBalances ─────────────────────────────────────────────
test('auditWalletBalances: computes ins-outs and drift', () => {
  const wallets = [{ _id: 'w1', balance: 500 }];
  const transactions = [
    { walletId: 'w1', type: 'in', amount: 700 },
    { walletId: 'w1', type: 'out', amount: 200 },
  ];
  const audit = auditWalletBalances(wallets, transactions);
  assertEq(audit.length, 1);
  assertEq(audit[0].computed, 500);
  assertEq(audit[0].balance, 500);
  assertEq(audit[0].drift, 0);
});

test('auditWalletBalances: detects drift', () => {
  const wallets = [{ _id: 'w1', balance: 100 }];
  const transactions = [{ walletId: 'w1', type: 'in', amount: 50 }];
  const audit = auditWalletBalances(wallets, transactions);
  assertEq(audit[0].drift, 50);  // 100 - 50
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
