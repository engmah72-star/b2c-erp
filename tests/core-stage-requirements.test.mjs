/**
 * Tests for validateStageRequirements (orders.js) — focus on the
 * production → shipping guard added after the shipping restructure.
 * Run: node tests/core-stage-requirements.test.mjs
 */
import { validateStageRequirements } from '../orders.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, hint = '') {
  if (!cond) throw new Error(`assertion failed ${hint}`);
}
const hasWarn = (r, sub) => r.warnings.some(w => w.includes(sub));

// ── production → shipping: shipping-data guard (warning, bypassable) ──

test('production: missing shipMethod → warning, but ok (no error)', () => {
  const r = validateStageRequirements({ stage: 'production', costItems: [{}] }, 'production');
  assert(r.ok === true, 'must not hard-block');
  assert(hasWarn(r, 'طريقة الشحن'), 'expected ship-method warning');
});

test('production: company method without address → address warning', () => {
  const r = validateStageRequirements(
    { stage: 'production', costItems: [{}], shipMethod: 'company' }, 'production');
  assert(r.ok === true);
  assert(hasWarn(r, 'عنوان التوصيل'), 'expected address warning');
});

test('production: pickup needs no address → no shipping warning', () => {
  const r = validateStageRequirements(
    { stage: 'production', costItems: [{}], shipMethod: 'pickup' }, 'production');
  assert(!hasWarn(r, 'طريقة الشحن'));
  assert(!hasWarn(r, 'عنوان التوصيل'));
});

test('production: company + gov present → no shipping warning', () => {
  const r = validateStageRequirements(
    { stage: 'production', costItems: [{}], shipMethod: 'company',
      deliveryAddress: { gov: 'القاهرة' } }, 'production');
  assert(!hasWarn(r, 'طريقة الشحن'));
  assert(!hasWarn(r, 'عنوان التوصيل'));
});

test('production: missing costItems still warns (existing behavior intact)', () => {
  const r = validateStageRequirements(
    { stage: 'production', shipMethod: 'pickup' }, 'production');
  assert(hasWarn(r, 'بنود تكلفة'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
