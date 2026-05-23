/**
 * Tests for features/clients/new-order-form.js (clients Phase-2C).
 * Run: node tests/features-clients-new-order.test.mjs
 */
import {
  buildDesignerOptions, computeDesignerLoad,
  buildWalletOptionsHTML,
  getOrderTypePriceHint, getOrderTypeCardClasses,
  validateNewOrderForm, generateOrderId,
} from '../features/clients/new-order-form.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── computeDesignerLoad ────────────────────────────────────────────
test('computeDesignerLoad counts only design-stage orders with designerId', () => {
  const load = computeDesignerLoad([
    { designerId: 'd1', stage: 'design' },
    { designerId: 'd1', stage: 'design' },
    { designerId: 'd1', stage: 'printing' },  // wrong stage → excluded
    { designerId: 'd2', stage: 'design' },
    { stage: 'design' },                       // no designerId → excluded
  ]);
  assertEq(load.d1, 2);
  assertEq(load.d2, 1);
});

test('computeDesignerLoad empty → {}', () => {
  const load = computeDesignerLoad([]);
  assertEq(Object.keys(load).length, 0);
});

// ── buildDesignerOptions ───────────────────────────────────────────
test('buildDesignerOptions includes sentinel option', () => {
  const html = buildDesignerOptions([]);
  if (!html.includes('— بدون مصمم —')) throw new Error('missing sentinel');
});

test('load indicators: 0=🟢, 1-3=🟡, >3=🔴', () => {
  const designers = [
    { _id: 'd1', name: 'A' },
    { _id: 'd2', name: 'B' },
    { _id: 'd3', name: 'C' },
  ];
  const load = { d1: 0, d2: 2, d3: 5 };
  const html = buildDesignerOptions(designers, load);
  if (!html.includes('🟢 A')) throw new Error('🟢 missing for d1');
  if (!html.includes('🟡 B')) throw new Error('🟡 missing for d2');
  if (!html.includes('🔴 C')) throw new Error('🔴 missing for d3');
});

test('falls back to email if no name', () => {
  const html = buildDesignerOptions([{ _id: 'd1', email: 'x@y.com' }], {});
  if (!html.includes('x@y.com')) throw new Error('email fallback missing');
});

// ── buildWalletOptionsHTML ─────────────────────────────────────────
test('buildWalletOptionsHTML includes sentinel + balance label', () => {
  const html = buildWalletOptionsHTML([
    { _id: 'w1', name: 'كاش', balance: 1500 },
  ], (n) => String(n));
  if (!html.includes('— اختر المحفظة —')) throw new Error('missing sentinel');
  if (!html.includes('كاش')) throw new Error('missing wallet name');
  if (!html.includes('1500')) throw new Error('missing balance');
});

// ── getOrderTypePriceHint ──────────────────────────────────────────
test('design hint mentions اختياري', () => {
  if (!getOrderTypePriceHint('design').includes('اختياري')) throw new Error('missing');
});
test('printing hint mentions إجباري', () => {
  if (!getOrderTypePriceHint('printing').includes('إجباري')) throw new Error('missing');
});
test('unknown stage → empty hint', () => {
  assertEq(getOrderTypePriceHint('whatever'), '');
});

// ── getOrderTypeCardClasses ────────────────────────────────────────
test('design selected → sel-design only', () => {
  const cls = getOrderTypeCardClasses('design');
  if (!cls.design.includes('sel-design')) throw new Error('design class missing');
  if (cls.printing.includes('sel-printing')) throw new Error('printing should not be selected');
});
test('printing selected → sel-printing only', () => {
  const cls = getOrderTypeCardClasses('printing');
  if (cls.design.includes('sel-design')) throw new Error('design should not be selected');
  if (!cls.printing.includes('sel-printing')) throw new Error('printing class missing');
});
test('neither selected → no sel-* classes', () => {
  const cls = getOrderTypeCardClasses('');
  if (cls.design.includes('sel-')) throw new Error('design has sel-');
  if (cls.printing.includes('sel-')) throw new Error('printing has sel-');
});

// ── validateNewOrderForm ───────────────────────────────────────────
test('reject empty stage', () => {
  const r = validateNewOrderForm({ stage: '', products: [{}], salePrice: 100 });
  assertEq(r.ok, false);
  if (!r.errors[0].includes('اختر نوع الأوردر')) throw new Error('wrong msg');
});

test('reject empty products', () => {
  const r = validateNewOrderForm({ stage: 'design', products: [], salePrice: 100 });
  assertEq(r.ok, false);
  if (!r.errors[0].includes('منتج')) throw new Error('wrong msg');
});

test('printing requires salePrice > 0 + focusField', () => {
  const r = validateNewOrderForm({ stage: 'printing', products: [{}], salePrice: 0 });
  assertEq(r.ok, false);
  assertEq(r.focusField, 'no-sale-price');
});

test('design allows salePrice = 0', () => {
  const r = validateNewOrderForm({ stage: 'design', products: [{}], salePrice: 0 });
  assertEq(r.ok, true);
});

test('deposit > 0 requires walletId', () => {
  const r = validateNewOrderForm({ stage: 'design', products: [{}], salePrice: 0, deposit: 100, walletId: '' });
  assertEq(r.ok, false);
  if (!r.errors[0].includes('المحفظة')) throw new Error('wrong msg');
});

test('deposit > 0 with walletId passes', () => {
  const r = validateNewOrderForm({ stage: 'design', products: [{}], salePrice: 0, deposit: 100, walletId: 'w1' });
  assertEq(r.ok, true);
});

test('all valid → ok:true', () => {
  const r = validateNewOrderForm({ stage: 'printing', products: [{}], salePrice: 500 });
  assertEq(r.ok, true);
});

// ── generateOrderId ────────────────────────────────────────────────
test('generateOrderId format ORD- + last 8 digits of timestamp', () => {
  const id = generateOrderId(() => 1234567890123);
  assertEq(id, 'ORD-67890123');  // last 8 of '1234567890123'
});

test('generateOrderId with custom timestamp', () => {
  const id = generateOrderId(() => 99999999);  // 8 digits → last 8 = same
  assertEq(id, 'ORD-99999999');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
