/**
 * Tests for core/wallet-ledger.js — single-writer helpers + balance integrity.
 * Run: node tests/core-wallet-ledger.test.mjs
 *
 * الكاتبون (addWalletDeltaToBatch/setWalletBalanceInBatch) يعتمدون Firestore
 * FieldValue sentinels — نختبر التحقّق من المدخلات عبر batch وهمي (نلتقط
 * الـ update المُسجَّل) دون Firestore حقيقي. الدوال النقية تُختبر مباشرة.
 */
import {
  addWalletDeltaToBatch,
  setWalletBalanceInBatch,
  computeWalletBalanceFromTxns,
  checkWalletBalanceIntegrity,
} from '../core/wallet-ledger.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assert(c, h = '') { if (!c) throw new Error(`assertion failed ${h}`); }

// fake batch + db: record update() calls
function fakeBatch() {
  const calls = [];
  return { calls, update: (ref, data) => calls.push({ ref, data }) };
}
const fakeDb = {}; // doc() only needs db passed through; we don't inspect ref shape

// ── addWalletDeltaToBatch ───────────────────────────────────────────
test('delta: rejects missing walletId', () => {
  const r = addWalletDeltaToBatch(fakeBatch(), fakeDb, { delta: 100 });
  assertEq(r.ok, false);
});

test('delta: rejects non-finite delta', () => {
  const r = addWalletDeltaToBatch(fakeBatch(), fakeDb, { walletId: 'w1', delta: NaN });
  assertEq(r.ok, false);
});

test('delta: zero is a safe no-op (no batch write)', () => {
  const b = fakeBatch();
  const r = addWalletDeltaToBatch(b, fakeDb, { walletId: 'w1', delta: 0 });
  assertEq(r.ok, true);
  assertEq(b.calls.length, 0, '(no write for zero delta)');
});

test('delta: valid → one batch.update with increment + trace', () => {
  const b = fakeBatch();
  const r = addWalletDeltaToBatch(b, fakeDb, { walletId: 'w1', delta: -250, event: 'VENDOR_PAYMENT', refId: 'req9' });
  assertEq(r.ok, true);
  assertEq(b.calls.length, 1);
  const d = b.calls[0].data;
  assert('balance' in d, '(writes balance)');
  assert('_balUpdatedAt' in d, '(writes trace timestamp)');
  assertEq(d._balLastEvent, 'VENDOR_PAYMENT');
  assertEq(d._balLastRef, 'req9');
});

test('delta: omits trace fields when not provided', () => {
  const b = fakeBatch();
  addWalletDeltaToBatch(b, fakeDb, { walletId: 'w1', delta: 50 });
  const d = b.calls[0].data;
  assert(!('_balLastEvent' in d), '(no event field)');
  assert(!('_balLastRef' in d), '(no ref field)');
});

// ── setWalletBalanceInBatch ─────────────────────────────────────────
test('set: rejects non-finite target', () => {
  assertEq(setWalletBalanceInBatch(fakeBatch(), fakeDb, { walletId: 'w1', target: undefined }).ok, false);
});

test('set: target 0 is valid (absolute set, not no-op)', () => {
  const b = fakeBatch();
  const r = setWalletBalanceInBatch(b, fakeDb, { walletId: 'w1', target: 0 });
  assertEq(r.ok, true);
  assertEq(b.calls.length, 1, '(zero target still writes)');
  assertEq(b.calls[0].data.balance, 0);
});

// ── computeWalletBalanceFromTxns ────────────────────────────────────
test('compute: sums in minus out for matching wallet only', () => {
  const txs = [
    { walletId: 'w1', type: 'in',  amount: 1000 },
    { walletId: 'w1', type: 'out', amount: 300 },
    { walletId: 'w2', type: 'in',  amount: 999 }, // other wallet ignored
    { walletId: 'w1', type: 'in',  amount: 50 },
  ];
  assertEq(computeWalletBalanceFromTxns('w1', txs), 750);
});

test('compute: adds opening balance', () => {
  const txs = [{ walletId: 'w1', type: 'out', amount: 200 }];
  assertEq(computeWalletBalanceFromTxns('w1', txs, { openingBalance: 500 }), 300);
});

test('compute: reversal pair nets to zero', () => {
  const txs = [
    { walletId: 'w1', type: 'out', amount: 400, isReversed: true }, // original
    { walletId: 'w1', type: 'in',  amount: 400, isReversal: true }, // reversal
  ];
  assertEq(computeWalletBalanceFromTxns('w1', txs), 0);
});

// ── checkWalletBalanceIntegrity ─────────────────────────────────────
test('integrity: balanced wallet → ok, zero drift', () => {
  const wallet = { _id: 'w1', balance: 750 };
  const txs = [
    { walletId: 'w1', type: 'in', amount: 1000 },
    { walletId: 'w1', type: 'out', amount: 250 },
  ];
  const r = checkWalletBalanceIntegrity(wallet, txs);
  assertEq(r.ok, true);
  assertEq(r.drift, 0);
  assertEq(r.expected, 750);
  assertEq(r.actual, 750);
});

test('integrity: drift detected when balance disagrees with txns', () => {
  const wallet = { _id: 'w1', balance: 900 }; // but txns say 750
  const txs = [
    { walletId: 'w1', type: 'in', amount: 1000 },
    { walletId: 'w1', type: 'out', amount: 250 },
  ];
  const r = checkWalletBalanceIntegrity(wallet, txs);
  assertEq(r.ok, false);
  assertEq(r.drift, 150);
});

test('integrity: respects opening balance', () => {
  const wallet = { _id: 'w1', balance: 300, openingBalance: 500 };
  const txs = [{ walletId: 'w1', type: 'out', amount: 200 }];
  assertEq(checkWalletBalanceIntegrity(wallet, txs).ok, true);
});

test('integrity: tolerance absorbs sub-cent rounding', () => {
  const wallet = { _id: 'w1', balance: 100.004 };
  const txs = [{ walletId: 'w1', type: 'in', amount: 100 }];
  assertEq(checkWalletBalanceIntegrity(wallet, txs).ok, true, '(within 0.01)');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
