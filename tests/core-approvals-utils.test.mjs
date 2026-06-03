/**
 * Tests for core/approvals-utils.js (financial-critical risk detection + dues).
 * Run: node tests/core-approvals-utils.test.mjs
 */
import {
  computeWalletState, detectRisks, computeSupplierDues,
} from '../core/approvals-utils.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── computeWalletState ──────────────────────────────────────────────
test('null tx → null', () => assertEq(computeWalletState(null), null));

test('tx with stored balanceBefore/After → uses them directly', () => {
  const r = computeWalletState({
    balanceBefore: 100, balanceAfter: 250,
  });
  assertEq(r.before, 100);
  assertEq(r.after, 250);
  assertEq(r.walletCurrent, null);
});

test('tx without walletId → null', () => {
  assertEq(computeWalletState({ amount: 100, type: 'in' }), null);
});

test('walks back from current balance reversing newer txs', () => {
  const wallets = [{ _id: 'w1', balance: 500 }];
  const txs = [
    { _id: 't1', walletId: 'w1', type: 'in', amount: 100 },  // older
    { _id: 't2', walletId: 'w1', type: 'in', amount: 200 },  // target
    { _id: 't3', walletId: 'w1', type: 'in', amount: 200 },  // newer
  ];
  // current=500, reverse t3 → 300 = state after t2
  // before t2: 300 - 200 = 100
  const r = computeWalletState(txs[1], { wallets, transactions: txs });
  assertEq(r.after, 300);
  assertEq(r.before, 100);
  assertEq(r.walletCurrent, 500);
});

test('out tx reversed correctly (out increases when reversing)', () => {
  const wallets = [{ _id: 'w1', balance: 100 }];
  const txs = [
    { _id: 't1', walletId: 'w1', type: 'out', amount: 50 },  // target
    { _id: 't2', walletId: 'w1', type: 'out', amount: 30 },  // newer, reversing adds back 30
  ];
  // current=100, reverse t2 (was out 30 → add 30) → 130 after t1
  // before t1: 130 + 50 = 180 (out tx: before-after=50 → before=after+50)
  const r = computeWalletState(txs[0], { wallets, transactions: txs });
  assertEq(r.after, 130);
  assertEq(r.before, 180);
});

test('fallback when tx not in transactions list', () => {
  const wallets = [{ _id: 'w1', balance: 0 }];
  const txs = [
    { _id: 'other', walletId: 'w1', type: 'in', amount: 100 },
  ];
  const targetTx = { _id: 'missing', walletId: 'w1', type: 'in', amount: 50 };
  const r = computeWalletState(targetTx, { wallets, transactions: txs });
  // Falls back to forward-from-zero: tx not found, after stays after walking, before = after - 50
  assertEq(r !== null, true);
});

// ── detectRisks ─────────────────────────────────────────────────────
test('empty request → no risks', () => {
  assertEq(detectRisks(null).length, 0);
});

test('large amount → high risk (>10k)', () => {
  const r = detectRisks({ amount: 15000 }, {});
  if (!r.some(x => x.lvl === 'high' && x.txt.includes('مبلغ كبير'))) {
    throw new Error('expected high large-amount risk');
  }
});

test('medium amount → med risk (5k-10k)', () => {
  const r = detectRisks({ amount: 7000 }, {});
  if (!r.some(x => x.lvl === 'med' && x.txt.includes('مبلغ متوسط'))) {
    throw new Error('expected med amount risk');
  }
});

test('small amount → no amount risk', () => {
  const r = detectRisks({ amount: 1000 }, {});
  if (r.some(x => x.txt.includes('مبلغ'))) {
    throw new Error('should not flag small amounts');
  }
});

test('thresholds come from policy (DRY single source)', () => {
  // policy override يشدّد الحدود: med=1000, high=2000.
  const policy = { mode: 'advisory', outflow: { advisoryMed: 1000, advisoryHigh: 2000 } };
  // 1500 لا يُعَدّ خطراً افتراضياً (< 5k) لكنه med مع السياسة المشدّدة.
  const r = detectRisks({ amount: 1500 }, { policy });
  if (!r.some(x => x.lvl === 'med' && x.txt.includes('مبلغ متوسط'))) {
    throw new Error('expected med risk from policy threshold (1000)');
  }
  // 3000 يصبح high مع السياسة المشدّدة (> 2000).
  const r2 = detectRisks({ amount: 3000 }, { policy });
  if (!r2.some(x => x.lvl === 'high' && x.txt.includes('مبلغ كبير'))) {
    throw new Error('expected high risk from policy threshold (2000)');
  }
});

test('same-day duplicate detected', () => {
  const now = new Date(2026, 4, 15);
  const today = Math.floor(now.getTime() / 1000);
  const req = {
    _id: 'r1', amount: 500, supplierId: 's1', employeeId: 'e1',
    requestedAt: { seconds: today },
  };
  const r = detectRisks(req, {
    allRequests: [
      { _id: 'r1', amount: 500, supplierId: 's1', employeeId: 'e1', requestedAt: { seconds: today }, status: 'requested' },
      { _id: 'r2', amount: 500, supplierId: 's1', employeeId: 'e1', requestedAt: { seconds: today }, status: 'requested' },
    ],
    now,
  });
  if (!r.some(x => x.txt.includes('طلب مماثل'))) throw new Error('expected duplicate detection');
});

test('rejected supplier in last 7 days → med risk', () => {
  const now = new Date(2026, 4, 15);
  const recent = Math.floor((now.getTime() - 3 * 24 * 3600 * 1000) / 1000);
  const r = detectRisks({ supplierId: 's1', amount: 100 }, {
    allRequests: [
      { supplierId: 's1', status: 'rejected', rejectedAt: { seconds: recent } },
    ],
    now,
  });
  if (!r.some(x => x.txt.includes('رُفض له طلب'))) throw new Error('expected rejected-supplier risk');
});

test('archived order → high risk', () => {
  const ordersMap = new Map([['o1', { stage: 'archived' }]]);
  const r = detectRisks({ orderId: 'o1', amount: 100 }, { ordersMap });
  if (!r.some(x => x.lvl === 'high' && x.txt.includes('مؤرشَف'))) {
    throw new Error('expected archived-order risk');
  }
});

test('cancelled order → high risk', () => {
  const ordersMap = new Map([['o1', { stage: 'cancelled' }]]);
  const r = detectRisks({ orderId: 'o1', amount: 100 }, { ordersMap });
  if (!r.some(x => x.txt.includes('ملغي'))) throw new Error('expected cancelled risk');
});

test('cost item already paid → high risk', () => {
  const ordersMap = new Map([['o1', {
    stage: 'production',
    costItems: [{ paid: true, paidTxId: 'tx-12345678' }],
  }]]);
  const r = detectRisks({
    type: 'supplier_payment', orderId: 'o1', costItemIndex: 0, amount: 100,
  }, { ordersMap });
  if (!r.some(x => x.txt.includes('مدفوع بالفعل'))) {
    throw new Error('expected already-paid risk');
  }
});

// ── computeSupplierDues ────────────────────────────────────────────
test('empty orders → no dues', () => {
  assertEq(computeSupplierDues({ ordersMap: new Map() }).length, 0);
});

test('excludes archived/cancelled orders', () => {
  const ordersMap = new Map([
    ['o1', { stage: 'archived', costItems: [{ supplierId: 's1', supplierName: 'A', total: 1000 }] }],
    ['o2', { stage: 'cancelled', costItems: [{ supplierId: 's1', supplierName: 'A', total: 500 }] }],
  ]);
  assertEq(computeSupplierDues({ ordersMap }).length, 0);
});

test('groups unpaid items per supplier', () => {
  const ordersMap = new Map([
    ['o1', { _id: 'o1', stage: 'design', costItems: [{ supplierId: 's1', supplierName: 'A', total: 100 }, { supplierId: 's2', supplierName: 'B', total: 200 }] }],
    ['o2', { _id: 'o2', stage: 'printing', costItems: [{ supplierId: 's1', supplierName: 'A', total: 50 }] }],
  ]);
  const dues = computeSupplierDues({ ordersMap });
  assertEq(dues.length, 2);
  // Sorted by total desc — A has 150, B has 200 → B first
  assertEq(dues[0].name, 'B');
  assertEq(dues[0].totalUnpaid, 200);
  assertEq(dues[1].name, 'A');
  assertEq(dues[1].totalUnpaid, 150);
  assertEq(dues[1].items.length, 2);
});

test('separates pending from unpaid based on pendingPaymentRequestId', () => {
  const ordersMap = new Map([
    ['o1', { _id: 'o1', stage: 'design', costItems: [
      { supplierId: 's1', total: 100, pendingPaymentRequestId: 'req1' },
      { supplierId: 's1', total: 200 },
    ]}],
  ]);
  const dues = computeSupplierDues({ ordersMap });
  assertEq(dues[0].totalPending, 100);
  assertEq(dues[0].totalUnpaid, 200);
});

test('excludes paid items', () => {
  const ordersMap = new Map([
    ['o1', { stage: 'design', costItems: [{ supplierId: 's1', total: 1000, paid: true }] }],
  ]);
  assertEq(computeSupplierDues({ ordersMap }).length, 0);
});

test('excludes items without supplierId', () => {
  const ordersMap = new Map([
    ['o1', { stage: 'design', costItems: [{ total: 100 }] }],
  ]);
  assertEq(computeSupplierDues({ ordersMap }).length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
