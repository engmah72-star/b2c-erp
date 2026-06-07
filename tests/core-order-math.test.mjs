/**
 * Tests for core/order-math.js
 * Run: node tests/core-order-math.test.mjs
 */
import { calcRem, orderGrossTotal, expectedFromCompany, isFullyPaid, isPostDesignWithRem, POST_DESIGN_STAGES } from '../core/order-math.js';

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

// ── orderGrossTotal ────────────────────────────────────────────────
test('orderGrossTotal: sale + shipFee − discount', () => {
  assertEq(orderGrossTotal({ salePrice: 1000, customerShipFee: 50, discount: 100 }), 950);
});
test('orderGrossTotal: clamps at 0', () => {
  assertEq(orderGrossTotal({ salePrice: 100, discount: 500 }), 0);
});
test('orderGrossTotal: missing fields → 0', () => {
  assertEq(orderGrossTotal({}), 0);
});

// ── expectedFromCompany ────────────────────────────────────────────
// المتوقَّع من شركة الشحن = shipCollected − shippingCost
test('expectedFromCompany: collected − cost', () => {
  assertEq(expectedFromCompany({ shipCollected: 700, shippingCost: 65 }), 635);
});
test('expectedFromCompany: collected with no cost (شامل/المتبقي كامل)', () => {
  assertEq(expectedFromCompany({ shipCollected: 2850, shippingCost: 0 }), 2850);
});
// الـ fallback الحرج (سبب bug «التسوية تطلع صفر» — PR #1344):
// لو shipCollected=0 بينما العميل عليه متبقّي، نستخدم المتبقي.
test('expectedFromCompany: fallback to customer remaining when shipCollected=0', () => {
  assertEq(expectedFromCompany({ shipCollected: 0, salePrice: 2850, totalPaid: 0, shippingCost: 0 }), 2850);
});
test('expectedFromCompany: fallback minus cost', () => {
  assertEq(expectedFromCompany({ shipCollected: 0, salePrice: 1000, totalPaid: 0, shippingCost: 65 }), 935);
});
test('expectedFromCompany: fallback respects prior payments', () => {
  assertEq(expectedFromCompany({ shipCollected: 0, salePrice: 1000, totalPaid: 400, shippingCost: 0 }), 600);
});
test('expectedFromCompany: fallback with deposit (no totalPaid)', () => {
  assertEq(expectedFromCompany({ shipCollected: 0, salePrice: 1000, deposit: 300, shippingCost: 0 }), 700);
});
test('expectedFromCompany: recorded collected takes precedence over remaining', () => {
  // shipCollected موجود → يُستخدم هو، لا الـ fallback
  assertEq(expectedFromCompany({ shipCollected: 500, salePrice: 9999, totalPaid: 0, shippingCost: 100 }), 400);
});
test('expectedFromCompany: clamps at 0 when cost exceeds collected', () => {
  assertEq(expectedFromCompany({ shipCollected: 50, shippingCost: 200 }), 0);
});
test('expectedFromCompany: empty order → 0', () => {
  assertEq(expectedFromCompany({}), 0);
});

// ── isFullyPaid ────────────────────────────────────────────────────
// يحرس bug «التسوية تطلع صفر / إضافة مكررة للمحفظة»: أوردر مدفوع بالكامل
// عبر المحفظة لا يدخل التسوية (لا فلوس عند الشركة).
test('isFullyPaid: paid covers gross → true', () => {
  assertEq(isFullyPaid({ salePrice: 2850, totalPaid: 2850 }), true);
});
test('isFullyPaid: partial payment → false', () => {
  assertEq(isFullyPaid({ salePrice: 2850, totalPaid: 1000 }), false);
});
test('isFullyPaid: nothing paid → false', () => {
  assertEq(isFullyPaid({ salePrice: 2850, totalPaid: 0 }), false);
});
test('isFullyPaid: zero gross → false (nothing to pay)', () => {
  assertEq(isFullyPaid({ salePrice: 0, totalPaid: 0 }), false);
});
test('isFullyPaid: deposit fallback when no totalPaid', () => {
  assertEq(isFullyPaid({ salePrice: 500, deposit: 500 }), true);
});
test('isFullyPaid: respects discount in gross', () => {
  assertEq(isFullyPaid({ salePrice: 1000, discount: 200, totalPaid: 800 }), true);
});
test('isFullyPaid: tiny rounding tolerance', () => {
  assertEq(isFullyPaid({ salePrice: 1000, totalPaid: 999.995 }), true);
});

// ── isPostDesignWithRem ────────────────────────────────────────────
test('isPostDesignWithRem: priced, post-design, owes → true', () => {
  assertEq(isPostDesignWithRem({ salePrice: 1000, stage: 'production', totalPaid: 300 }), true);
});
test('isPostDesignWithRem: design stage → false', () => {
  assertEq(isPostDesignWithRem({ salePrice: 1000, stage: 'design', totalPaid: 0 }), false);
});
test('isPostDesignWithRem: fully paid → false', () => {
  assertEq(isPostDesignWithRem({ salePrice: 1000, stage: 'shipping', totalPaid: 1000 }), false);
});
test('isPostDesignWithRem: zero sale price → false', () => {
  assertEq(isPostDesignWithRem({ salePrice: 0, stage: 'printing', totalPaid: 0 }), false);
});
test('POST_DESIGN_STAGES: exact set', () => {
  assertEq(POST_DESIGN_STAGES.join(','), 'printing,production,shipping');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
