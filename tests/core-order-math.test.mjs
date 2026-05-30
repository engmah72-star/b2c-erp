/**
 * Tests for core/order-math.js
 * Run: node tests/core-order-math.test.mjs
 */
import { calcRem } from '../core/order-math.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── calcRem ────────────────────────────────────────────────────────
test('calcRem: simple sale - paid', () => {
  assertEq(calcRem({ salePrice: 1000, totalPaid: 300 }), 700);
});

test('calcRem: with shipping fee', () => {
  assertEq(calcRem({ salePrice: 500, customerShipFee: 50, totalPaid: 200 }), 350);
});

test('calcRem: with discount', () => {
  assertEq(calcRem({ salePrice: 1000, discount: 100, totalPaid: 200 }), 700);
});

test('calcRem: full equation (sale + ship - discount - paid)', () => {
  assertEq(calcRem({
    salePrice: 1000, customerShipFee: 50, discount: 100, totalPaid: 200,
  }), 750);
});

test('calcRem: zero salePrice → 0', () => {
  assertEq(calcRem({ salePrice: 0, totalPaid: 0 }), 0);
});

test('calcRem: overpaid clamps to 0', () => {
  assertEq(calcRem({ salePrice: 500, totalPaid: 700 }), 0);
});

test('calcRem: paymentStatus returned → 0', () => {
  assertEq(calcRem({ paymentStatus: 'returned', salePrice: 1000, totalPaid: 0 }), 0);
});

test('calcRem: shipStage returned → 0', () => {
  assertEq(calcRem({ shipStage: 'returned', salePrice: 1000, totalPaid: 0 }), 0);
});

test('calcRem: paid fallback (no totalPaid)', () => {
  assertEq(calcRem({ salePrice: 1000, paid: 400 }), 600);
});

test('calcRem: deposit fallback (no totalPaid or paid)', () => {
  assertEq(calcRem({ salePrice: 1000, deposit: 250 }), 750);
});

test('calcRem: totalPaid wins over paid wins over deposit', () => {
  assertEq(calcRem({ salePrice: 1000, totalPaid: 100, paid: 200, deposit: 300 }), 900);
});

test('calcRem: string numbers parsed', () => {
  assertEq(calcRem({ salePrice: '500', totalPaid: '200' }), 300);
});

test('calcRem: missing fields treat as 0', () => {
  assertEq(calcRem({}), 0);
});

test('calcRem: NaN values treat as 0', () => {
  assertEq(calcRem({ salePrice: 'abc', totalPaid: 'def' }), 0);
});

// ── Step 3: courierDirectFee must NOT enter the customer receivable ──
// "غير شامل الشحن" = العميل يدفع للمندوب مباشرة؛ الرسوم خارج حسابات الشركة.
// prepareForShipping يكتب customerShipFee=0 + courierDirectFee=fee، فيجب أن
// لا يتأثر المتبقي بـ courierDirectFee إطلاقاً.
test('calcRem: courierDirectFee is ignored (outside company accounts)', () => {
  assertEq(calcRem({ salePrice: 1000, courierDirectFee: 65, totalPaid: 300 }), 700);
});

test('calcRem: courierDirectFee + customerShipFee=0 → only sale counts', () => {
  assertEq(calcRem({ salePrice: 500, customerShipFee: 0, courierDirectFee: 50, totalPaid: 200 }), 300);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
