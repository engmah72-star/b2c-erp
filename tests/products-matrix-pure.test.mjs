/**
 * Node-runnable tests for product-actions.js — matrix pricing logic (pure parts).
 * (Firestore-backed paths need browser integration to test.)
 *
 * What we test:
 *   - _resolvePricingMode: backward-compatible mode inference
 *   - _validateMatrix: rejects empty axes / unpriced grids / negative prices
 *   - _deriveMatrixFields: defaultPrice = min priced cell (توافق خلفي)
 *   - getMatrixPrice: exact (size × printType × qty) lookup
 *
 * Run: node tests/products-matrix-pure.test.mjs
 *
 * ── ملاحظة الصيانة ──
 * لا يمكن استيراد product-actions.js مباشرة في Node (يستورد Firestore من URL).
 * لذا نُكرِّر المنطق هنا — لو تغيّر الأصل، حدِّث هذا الملف ليبقى مرآةً له.
 * (نفس نمط tests/client-actions-pure.test.mjs)
 */

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}\n    ${e.message}`);
    failed++;
  }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ══ مرآة لمنطق product-actions.js ══
const PRICING_MODES = { SIMPLE: 'simple', VARIANTS: 'variants', MATRIX: 'matrix' };
const _PRICING_MODE_VALUES = Object.values(PRICING_MODES);

function _resolvePricingMode(data) {
  if (data && _PRICING_MODE_VALUES.includes(data.pricingMode)) return data.pricingMode;
  return data && data.hasVariants ? PRICING_MODES.VARIANTS : PRICING_MODES.SIMPLE;
}

function _validateMatrix(data) {
  const errors = [];
  const sizes = Array.isArray(data.matrixSizes) ? data.matrixSizes.filter(s => String(s || '').trim()) : [];
  const types = Array.isArray(data.matrixPrintTypes) ? data.matrixPrintTypes.filter(Boolean) : [];
  const qtys = Array.isArray(data.matrixQuantities) ? data.matrixQuantities.map(q => parseFloat(q)).filter(q => q > 0) : [];
  if (!sizes.length) errors.push('أضف مقاساً واحداً على الأقل');
  if (!types.length) errors.push('اختر نوع طباعة واحداً على الأقل');
  if (!qtys.length) errors.push('أضف كمية واحدة على الأقل');
  const matrix = Array.isArray(data.priceMatrix) ? data.priceMatrix : [];
  if (matrix.some(r => (parseFloat(r.price) || 0) < 0)) errors.push('السعر لا يمكن أن يكون سالباً');
  const priced = matrix.filter(r => (parseFloat(r.price) || 0) > 0);
  if (!priced.length) errors.push('أدخل سعراً واحداً على الأقل في جدول الأسعار');
  return errors;
}

function _deriveMatrixFields(data) {
  if (_resolvePricingMode(data) !== PRICING_MODES.MATRIX) return {};
  const priced = (data.priceMatrix || []).map(r => parseFloat(r.price) || 0).filter(p => p > 0);
  const minPrice = priced.length ? Math.min(...priced) : 0;
  const maxPrice = priced.length ? Math.max(...priced) : 0;
  return { defaultPrice: minPrice, matrixMinPrice: minPrice, matrixMaxPrice: maxPrice };
}

function getMatrixPrice(product, { size, printType, qty } = {}) {
  if (!product || _resolvePricingMode(product) !== PRICING_MODES.MATRIX) return null;
  const rows = Array.isArray(product.priceMatrix) ? product.priceMatrix : [];
  const row = rows.find(r => r.size === size && r.printType === printType && Number(r.qty) === Number(qty));
  if (!row) return null;
  const p = parseFloat(row.price);
  return Number.isFinite(p) ? p : null;
}

// مثال واقعي: ملفات محامين (مقاسان × نوعا طباعة × كميتان)
const lawyerFiles = {
  name: 'ملفات محامين',
  pricingMode: 'matrix',
  matrixSizes: ['35×50', '33×44'],
  matrixPrintTypes: ['offset', 'digital'],
  matrixQuantities: [200, 500],
  priceMatrix: [
    { size: '35×50', printType: 'offset',  qty: 200, price: 800 },
    { size: '35×50', printType: 'offset',  qty: 500, price: 1500 },
    { size: '33×44', printType: 'digital', qty: 200, price: 950 },
  ],
};

// ── _resolvePricingMode ──
test('mode: explicit matrix respected', () => {
  assertEq(_resolvePricingMode({ pricingMode: 'matrix' }), 'matrix');
});
test('mode: legacy hasVariants → variants', () => {
  assertEq(_resolvePricingMode({ hasVariants: true }), 'variants');
});
test('mode: legacy plain doc → simple', () => {
  assertEq(_resolvePricingMode({ defaultPrice: 300 }), 'simple');
});
test('mode: unknown pricingMode falls back to inference', () => {
  assertEq(_resolvePricingMode({ pricingMode: 'bogus' }), 'simple');
});

// ── _validateMatrix ──
test('validate: full valid matrix → no errors', () => {
  assertEq(_validateMatrix(lawyerFiles).length, 0);
});
test('validate: no sizes rejected', () => {
  const errs = _validateMatrix({ ...lawyerFiles, matrixSizes: [] });
  assertEq(errs.length > 0, true);
});
test('validate: no print types rejected', () => {
  const errs = _validateMatrix({ ...lawyerFiles, matrixPrintTypes: [] });
  assertEq(errs.length > 0, true);
});
test('validate: no quantities rejected', () => {
  const errs = _validateMatrix({ ...lawyerFiles, matrixQuantities: [] });
  assertEq(errs.length > 0, true);
});
test('validate: empty/zero-only price grid rejected', () => {
  const errs = _validateMatrix({ ...lawyerFiles, priceMatrix: [{ size: '35×50', printType: 'offset', qty: 200, price: 0 }] });
  assertEq(errs.length > 0, true);
});
test('validate: negative price rejected', () => {
  const errs = _validateMatrix({ ...lawyerFiles, priceMatrix: [{ size: '35×50', printType: 'offset', qty: 200, price: -5 }] });
  assertEq(errs.length > 0, true);
});

// ── _deriveMatrixFields ──
test('derive: defaultPrice = min priced cell', () => {
  assertEq(_deriveMatrixFields(lawyerFiles).defaultPrice, 800);
});
test('derive: matrixMaxPrice = max priced cell', () => {
  assertEq(_deriveMatrixFields(lawyerFiles).matrixMaxPrice, 1500);
});
test('derive: non-matrix product → no derived fields', () => {
  assertEq(Object.keys(_deriveMatrixFields({ defaultPrice: 300 })).length, 0);
});

// ── getMatrixPrice ──
test('lookup: exact combination returns price', () => {
  assertEq(getMatrixPrice(lawyerFiles, { size: '35×50', printType: 'offset', qty: 500 }), 1500);
});
test('lookup: qty as string still matches (Number coercion)', () => {
  assertEq(getMatrixPrice(lawyerFiles, { size: '35×50', printType: 'offset', qty: '200' }), 800);
});
test('lookup: unpriced combination returns null', () => {
  assertEq(getMatrixPrice(lawyerFiles, { size: '33×44', printType: 'offset', qty: 500 }), null);
});
test('lookup: non-matrix product returns null', () => {
  assertEq(getMatrixPrice({ defaultPrice: 300 }, { size: 'A4', printType: 'offset', qty: 200 }), null);
});

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed) process.exit(1);
