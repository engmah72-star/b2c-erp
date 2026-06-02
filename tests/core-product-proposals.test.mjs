/**
 * Tests for core/product-proposals-validate.js (pure validation + normalization)
 * Run: node tests/core-product-proposals.test.mjs
 */
import {
  validateProductProposal,
  normalizeProposalLines,
  proposalTotal,
} from '../core/product-proposals-validate.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assert(cond, hint = '') { if (!cond) throw new Error(`assertion failed ${hint}`); }

const orderWith = (n = 1) => ({ products: Array.from({ length: n }, (_, i) => ({ name: `P${i}` })) });

// ── normalizeProposalLines ─────────────────────────────────────────
test('normalize: coerces totals + trims type + assigns lineId', () => {
  const out = normalizeProposalLines([{ type: ' طباعة ', supplierId: 's1', supplierName: 'A', total: '50' }]);
  assertEq(out.length, 1);
  assertEq(out[0].type, 'طباعة');
  assertEq(out[0].total, 50);
  assert(!!out[0].lineId, 'lineId assigned');
});

test('normalize: preserves existing lineId', () => {
  const out = normalizeProposalLines([{ lineId: 'fixed', type: 'x', supplierId: 's', total: 1 }]);
  assertEq(out[0].lineId, 'fixed');
});

test('normalize: drops empty paperMeta, keeps populated', () => {
  const a = normalizeProposalLines([{ type: 'x', supplierId: 's', total: 1, paperMeta: {} }]);
  assert(!('paperMeta' in a[0]), 'empty paperMeta dropped');
  const b = normalizeProposalLines([{ type: 'x', supplierId: 's', total: 1, paperMeta: { sheets: 5 } }]);
  assertEq(b[0].paperMeta.sheets, 5);
});

test('normalize: non-array → []', () => {
  assertEq(normalizeProposalLines(null).length, 0);
  assertEq(normalizeProposalLines(undefined).length, 0);
});

// ── proposalTotal ──────────────────────────────────────────────────
test('proposalTotal: sums multi-supplier lines', () => {
  assertEq(proposalTotal([
    { type: 'طباعة', supplierId: 's1', total: 100 },
    { type: 'سلفنة', supplierId: 's2', total: 40 },
  ]), 140);
});

// ── validateProductProposal ────────────────────────────────────────
test('validate: happy path — multi-supplier product proposal', () => {
  const r = validateProductProposal({
    order: orderWith(2), prodIdx: 1,
    lines: [
      { type: 'طباعة', supplierId: 's1', supplierName: 'مطبعة', total: 200 },
      { type: 'سلفنة', supplierId: 's2', supplierName: 'تشطيب', total: 60 },
    ],
  });
  assert(r.ok, JSON.stringify(r.errors));
  assertEq(r.errors.length, 0);
});

test('validate: rejects when no lines', () => {
  const r = validateProductProposal({ order: orderWith(1), prodIdx: 0, lines: [] });
  assert(!r.ok);
  assert(r.errors.some(e => e.includes('بند واحد على الأقل')));
});

test('validate: rejects line without supplier (each line needs a supplier)', () => {
  const r = validateProductProposal({
    order: orderWith(1), prodIdx: 0,
    lines: [{ type: 'طباعة', total: 100 }],
  });
  assert(!r.ok);
  assert(r.errors.some(e => e.includes('المورد مطلوب')));
});

test('validate: rejects non-positive total', () => {
  const r = validateProductProposal({
    order: orderWith(1), prodIdx: 0,
    lines: [{ type: 'طباعة', supplierId: 's1', total: 0 }],
  });
  assert(!r.ok);
  assert(r.errors.some(e => e.includes('أكبر من صفر')));
});

test('validate: rejects out-of-range prodIdx (proposal is per complete product)', () => {
  const r = validateProductProposal({
    order: orderWith(1), prodIdx: 5,
    lines: [{ type: 'طباعة', supplierId: 's1', total: 100 }],
  });
  assert(!r.ok);
  assert(r.errors.some(e => e.includes('المنتج غير محدد')));
});

test('validate: missing order → error', () => {
  const r = validateProductProposal({ order: null, prodIdx: 0, lines: [] });
  assert(!r.ok);
  assert(r.errors.some(e => e.includes('الأوردر غير موجود')));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
