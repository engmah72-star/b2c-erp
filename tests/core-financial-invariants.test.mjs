/**
 * Tests for core/financial-invariants.js
 * Run: node tests/core-financial-invariants.test.mjs
 */
import { detectFinancialDrift, summarizeFinancialDrift } from '../core/financial-invariants.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assertHasViolation(violations, code) {
  if (!violations.some(v => v.code === code)) {
    throw new Error(`expected violation code "${code}" in [${violations.map(v=>v.code).join(', ') || '(empty)'}]`);
  }
}
function assertNoViolation(violations, code) {
  if (violations.some(v => v.code === code)) {
    throw new Error(`unexpected violation "${code}" present`);
  }
}

// ── detectFinancialDrift ──────────────────────────────────────────
test('null order → empty array', () => {
  assertEq(detectFinancialDrift(null).length, 0);
});

test('healthy order → no violations', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 1000, remaining: 0,
  });
  assertEq(v.length, 0);
});

test('I1: paid negative → PAID_NEGATIVE crit', () => {
  const v = detectFinancialDrift({ salePrice: 1000, totalPaid: -10 });
  assertHasViolation(v, 'PAID_NEGATIVE');
  assertEq(v.find(x => x.code === 'PAID_NEGATIVE').severity, 'crit');
});

test('I2: remaining negative → REMAINING_NEGATIVE crit', () => {
  const v = detectFinancialDrift({ salePrice: 1000, totalPaid: 1000, remaining: -50 });
  assertHasViolation(v, 'REMAINING_NEGATIVE');
});

test('I3: salePrice negative → SALE_NEGATIVE crit', () => {
  const v = detectFinancialDrift({ salePrice: -100 });
  assertHasViolation(v, 'SALE_NEGATIVE');
});

test('I4: overpaid → OVERPAID warn', () => {
  const v = detectFinancialDrift({ salePrice: 1000, totalPaid: 1500, remaining: 0 });
  assertHasViolation(v, 'OVERPAID');
  assertEq(v.find(x => x.code === 'OVERPAID').severity, 'warn');
});

test('I4: overpaid but returned_full → no OVERPAID', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 1500, remaining: 0, shipStage: 'returned_full',
  });
  assertNoViolation(v, 'OVERPAID');
});

test('I5: paid + remaining ≠ total → PAID_REMAINING_TOTAL_MISMATCH', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 400, remaining: 500, // expected rem = 600
  });
  assertHasViolation(v, 'PAID_REMAINING_TOTAL_MISMATCH');
});

test('I7: returned_full but totals non-zero → RETURNED_BUT_TOTALS_NONZERO', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 500, remaining: 0, shipStage: 'returned_full',
  });
  assertHasViolation(v, 'RETURNED_BUT_TOTALS_NONZERO');
});

test('I8: shipSettled=true without walletId → SETTLED_NO_WALLET', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 1000, remaining: 0,
    shipSettled: true,
  });
  assertHasViolation(v, 'SETTLED_NO_WALLET');
});

test('I8: shipSettled=true with manual → no SETTLED_NO_WALLET', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 1000, remaining: 0,
    shipSettled: true, shipSettledManual: true,
  });
  assertNoViolation(v, 'SETTLED_NO_WALLET');
});

test('I9: paymentStatus=paid but remaining > 0 → PAID_STATUS_BUT_REMAINING', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 800, remaining: 200, paymentStatus: 'paid',
  });
  assertHasViolation(v, 'PAID_STATUS_BUT_REMAINING');
});

test('I10: refund > paid → REFUND_EXCEEDS_PAID crit', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 200, remaining: 800,
    returnRefundAmount: 500,
  });
  assertHasViolation(v, 'REFUND_EXCEEDS_PAID');
  assertEq(v.find(x => x.code === 'REFUND_EXCEEDS_PAID').severity, 'crit');
});

test('I11: shipSettled=false but shipSettledAmount > 0 → SETTLED_FLAG_FALSE_BUT_AMOUNT', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 1000, remaining: 0,
    shipSettled: false, shipSettledAmount: 500,
  });
  assertHasViolation(v, 'SETTLED_FLAG_FALSE_BUT_AMOUNT');
});

test('I12: returned_partial but no items → PARTIAL_RETURN_NO_ITEMS', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 800, remaining: 200,
    shipStage: 'returned_partial',
  });
  assertHasViolation(v, 'PARTIAL_RETURN_NO_ITEMS');
});

test('I14: closed but stage != archived → CLOSED_NOT_ARCHIVED', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 1000, remaining: 0,
    shipStage: 'closed', stage: 'shipping',
  });
  assertHasViolation(v, 'CLOSED_NOT_ARCHIVED');
});

test('I15: settled but no collection (company) → SETTLED_WITHOUT_COLLECTION', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, totalPaid: 1000, remaining: 0,
    shipSettled: true, shipSettledWalletId: 'w1',
    shipMethod: 'company', shipCollected: 0,
  });
  assertHasViolation(v, 'SETTLED_WITHOUT_COLLECTION');
});

test('priceIncludesShipping → ignores customerShipFee in total', () => {
  const v = detectFinancialDrift({
    salePrice: 1000, customerShipFee: 50, totalPaid: 1000, remaining: 0,
    priceIncludesShipping: true,
  });
  assertEq(v.length, 0); // total = 1000, paid = 1000, no overpaid
});

// ── summarizeFinancialDrift ──────────────────────────────────────
test('summarize: empty array → all zeros', () => {
  const s = summarizeFinancialDrift([]);
  assertEq(s.total, 0);
  assertEq(s.withDrift, 0);
  assertEq(s.criticalCount, 0);
});

test('summarize: counts orders with drift + critical', () => {
  const orders = [
    { salePrice: 1000, totalPaid: 1000, remaining: 0 }, // healthy
    { salePrice: 1000, totalPaid: -10 }, // PAID_NEGATIVE crit
    { salePrice: -50 }, // SALE_NEGATIVE crit
  ];
  const s = summarizeFinancialDrift(orders);
  assertEq(s.total, 3);
  assertEq(s.withDrift, 2);
  if (s.criticalCount < 2) throw new Error(`expected ≥ 2 critical, got ${s.criticalCount}`);
  if (!s.byCode.PAID_NEGATIVE) throw new Error('missing PAID_NEGATIVE in byCode');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
