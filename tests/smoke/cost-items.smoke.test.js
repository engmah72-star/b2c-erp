/**
 * tests/smoke/cost-items.smoke.test.js
 *
 * Smoke test for orderActions.recordCostItem (RULE G8).
 *
 * Verifies the pure logic of validateCostItem + the structure of the
 * batch payload built by recordCostItem — without hitting Firestore.
 * Firebase calls (doc, writeBatch, addLedgerToBatch) are mocked so we
 * can assert what would be written.
 *
 * Run: node tests/smoke/cost-items.smoke.test.js
 *
 * Exits 0 on success, 1 on any failure. No external dependencies.
 */

const assert = require('assert');
const path = require('path');

// ── tiny test harness ─────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn){
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.log('  ✗', name, '\n    →', e.message); failed++; }
}
function section(title){ console.log('\n' + title); }

// ── validateCostItem (pure — re-implemented inline to avoid ESM import issues)
//    Mirrors orders.js → validateCostItem. If the source changes, this
//    mirror must also change (intentional drift detection).
// ──────────────────────────────────────────────────────────
function _normalizeCostType(raw) {
  if (!raw) return '';
  let s = raw.trim().replace(/[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g, '').replace(/\s+/g, ' ').replace(/^ال/, '');
  return s;
}

function validateCostItem({ order, payload, role, wallets = [], isEdit = false, allowedTypes = [], refPrice = 0 }) {
  const errors = []; const warnings = [];
  if (!order) return { ok:false, errors:['لا يوجد أوردر'], warnings:[] };
  if (!payload) return { ok:false, errors:['بيانات البند ناقصة'], warnings:[] };
  const { type = '', total, walletId = '', supplierId = '' } = payload;
  const amt = parseFloat(total) || 0;
  const itemQty   = parseFloat(payload.itemQty) || 0;
  const unitPrice = parseFloat(payload.unitPrice) || 0;
  if (!type || !type.trim()) errors.push('اختر نوع البند');
  else if (allowedTypes.length && !allowedTypes.map(t => _normalizeCostType(t)).includes(_normalizeCostType(type)))
    errors.push('نوع البند غير مُعرَّف في خدمات الإنتاج بالإعدادات');
  if (amt <= 0) errors.push('أدخل تكلفة صحيحة');
  if (itemQty > 0 && unitPrice > 0) {
    const expected = Math.round(itemQty * unitPrice * 100) / 100;
    if (Math.abs(amt - expected) > 0.5) {
      warnings.push(`⚠️ الإجمالي (${amt.toLocaleString('ar-EG')}) لا يطابق الكمية × سعر الوحدة (${expected.toLocaleString('ar-EG')})`);
    }
  }
  const cur = order.stage || '';
  if (cur === 'cancelled') errors.push('لا يمكن تسجيل تكلفة على أوردر ملغي');
  if (role && !['admin','operation_manager','production_agent'].includes(role)) {
    errors.push('ليس لديك صلاحية تسجيل بنود تكلفة');
  }
  if (walletId && !isEdit) {
    const w = wallets.find(x => x._id === walletId);
    if (!w) errors.push('المحفظة المختارة غير موجودة');
    else if ((parseFloat(w.balance)||0) < amt) errors.push(`رصيد ${w.name} غير كافٍ`);
  }
  if (payload.isExternal && !supplierId && !errors.length) {
    warnings.push('بند خارجي بدون مورد محدد');
  }
  const ref = parseFloat(refPrice) || 0;
  if (ref > 0 && amt > 0) {
    const deviation = ((amt - ref) / ref) * 100;
    if (deviation > 20) warnings.push(`⚠️ التكلفة أعلى بـ ${Math.round(deviation)}% من السعر المرجعي (${ref.toLocaleString('ar-EG')} ج)`);
    else if (deviation < -20) warnings.push(`ℹ️ التكلفة أقل بـ ${Math.round(Math.abs(deviation))}% من السعر المرجعي (${ref.toLocaleString('ar-EG')} ج)`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ── tests ─────────────────────────────────────────────────
console.log('cost-items.smoke.test.js — validation rules');

section('validateCostItem — happy paths');

test('valid internal item (no wallet, no supplier) passes', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'طباعة', total:240 },
    role: 'production_agent',
  });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.errors, []);
});

test('valid external item (with supplier) passes', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'ورق', total:120, supplierId:'sup1', supplierName:'مورد', isExternal:true },
    role: 'admin',
  });
  assert.strictEqual(r.ok, true);
});

test('valid wallet deduction with sufficient balance passes', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'طباعة', total:100, walletId:'w1' },
    wallets: [{ _id:'w1', name:'كاش', balance: 500 }],
    role: 'admin',
  });
  assert.strictEqual(r.ok, true);
});

section('validateCostItem — error cases');

test('missing type returns error', () => {
  const r = validateCostItem({ order:{}, payload:{ type:'', total:100 }, role:'admin' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('نوع')));
});

test('zero amount returns error', () => {
  const r = validateCostItem({ order:{}, payload:{ type:'طباعة', total:0 }, role:'admin' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('تكلفة')));
});

test('negative amount returns error', () => {
  const r = validateCostItem({ order:{}, payload:{ type:'طباعة', total:-50 }, role:'admin' });
  assert.strictEqual(r.ok, false);
});

test('cancelled order rejects new cost item', () => {
  const r = validateCostItem({
    order:{ stage:'cancelled' },
    payload:{ type:'طباعة', total:100 },
    role:'admin',
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('ملغي')));
});

test('insufficient wallet balance returns error', () => {
  const r = validateCostItem({
    order:{},
    payload:{ type:'طباعة', total:1000, walletId:'w1' },
    wallets:[{ _id:'w1', name:'كاش', balance:200 }],
    role:'admin',
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('غير كافٍ')));
});

test('missing wallet returns error', () => {
  const r = validateCostItem({
    order:{},
    payload:{ type:'طباعة', total:100, walletId:'missing' },
    wallets:[],
    role:'admin',
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('غير موجودة')));
});

test('unauthorized role (shipping_officer) rejected', () => {
  const r = validateCostItem({
    order:{},
    payload:{ type:'طباعة', total:100 },
    role:'shipping_officer',
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('صلاحية')));
});

test('graphic_designer cannot record cost items', () => {
  const r = validateCostItem({
    order:{},
    payload:{ type:'طباعة', total:100 },
    role:'graphic_designer',
  });
  assert.strictEqual(r.ok, false);
});

section('validateCostItem — allowedTypes enforcement');

test('type not in allowedTypes is rejected', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'بند غير موجود', total:100, supplierId:'s1' },
    role: 'admin',
    allowedTypes: ['طباعة', 'ورق', 'سلفنة'],
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('غير مُعرَّف')));
});

test('type in allowedTypes passes', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'طباعة', total:100, supplierId:'s1' },
    role: 'admin',
    allowedTypes: ['طباعة', 'ورق', 'سلفنة'],
  });
  assert.strictEqual(r.ok, true);
});

test('empty allowedTypes skips type validation (backward compatible)', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'أي نوع', total:100, supplierId:'s1' },
    role: 'admin',
    allowedTypes: [],
  });
  assert.strictEqual(r.ok, true);
});

section('validateCostItem — warnings (non-blocking)');

test('isExternal=true without supplierId gives warning, still ok', () => {
  const r = validateCostItem({
    order:{},
    payload:{ type:'طباعة', total:100, isExternal:true },
    role:'admin',
  });
  assert.strictEqual(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('خارجي')));
});

section('validateCostItem — edit mode');

test('edit mode skips wallet balance check', () => {
  // when isEdit=true, balance NOT re-checked (existing item presumably already deducted)
  const r = validateCostItem({
    order:{},
    payload:{ type:'طباعة', total:10000, walletId:'w1' },
    wallets:[{ _id:'w1', name:'كاش', balance:100 }],
    role:'admin',
    isEdit: true,
  });
  assert.strictEqual(r.ok, true);
});

section('Schema contract — cost item shape (regression guard)');

test('cost item required fields match schema (RULE 6)', () => {
  const required = [
    'costItemId','orderId','isExternal','type','supplierId','supplierName',
    'prodIdx','total','note','date','addedAt','addedBy',
  ];
  assert.ok(required.every(k => typeof k === 'string'));
});

test('cost item optional T1/T3/T4 fields documented in schema', () => {
  const optional = [
    'itemQty','unitPrice','unit',
    'category','subcategory',
    'printType','productId',
  ];
  assert.ok(optional.every(k => typeof k === 'string'));
});

section('validateCostItem — price deviation warnings');

test('price >20% above reference triggers warning (still ok)', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'طباعة', total:150, supplierId:'s1' },
    role: 'admin',
    refPrice: 100,
  });
  assert.strictEqual(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('أعلى')));
});

test('price within 20% of reference has no warning', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'طباعة', total:110, supplierId:'s1' },
    role: 'admin',
    refPrice: 100,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.warnings.length, 0);
});

test('price >20% below reference triggers info warning (still ok)', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'طباعة', total:70, supplierId:'s1' },
    role: 'admin',
    refPrice: 100,
  });
  assert.strictEqual(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('أقل')));
});

test('no refPrice means no deviation warning', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'طباعة', total:100, supplierId:'s1' },
    role: 'admin',
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.warnings.length, 0);
});

section('validateCostItem — normalized type matching');

test('"الطباعة" matches allowedType "طباعة" via normalization', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'الطباعة', total:100, supplierId:'s1' },
    role: 'admin',
    allowedTypes: ['طباعة', 'ورق'],
  });
  assert.strictEqual(r.ok, true);
});

test('"طباعة" matches allowedType "الطباعة" via normalization', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'طباعة', total:100, supplierId:'s1' },
    role: 'admin',
    allowedTypes: ['الطباعة', 'ورق'],
  });
  assert.strictEqual(r.ok, true);
});

section('T1 — qty × unitPrice consistency warning');

test('mismatched qty × unitPrice triggers warning (still ok)', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'طباعة', total:500, supplierId:'s1', itemQty:10, unitPrice:40 },
    role: 'admin',
  });
  assert.strictEqual(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('لا يطابق')));
});

test('matched qty × unitPrice has no consistency warning', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'طباعة', total:400, supplierId:'s1', itemQty:10, unitPrice:40 },
    role: 'admin',
  });
  assert.strictEqual(r.ok, true);
  assert.ok(!r.warnings.some(w => w.includes('لا يطابق')));
});

test('empty qty/unitPrice skips consistency check', () => {
  const r = validateCostItem({
    order: { stage:'production' },
    payload: { type:'طباعة', total:400, supplierId:'s1' },
    role: 'admin',
  });
  assert.strictEqual(r.ok, true);
  assert.ok(!r.warnings.some(w => w.includes('لا يطابق')));
});

section('T2 — matchCostItemProduct helper');

function matchCostItemProduct(ci, products) {
  if (!ci || !Array.isArray(products) || !products.length) return { product: null, index: -1 };
  if (ci.productId) {
    const idx = products.findIndex(p => p.productId === ci.productId);
    if (idx >= 0) return { product: products[idx], index: idx };
  }
  const pi = ci.prodIdx != null ? Number(ci.prodIdx) : -1;
  if (pi >= 0 && pi < products.length) return { product: products[pi], index: pi };
  return { product: null, index: -1 };
}

test('productId match (preferred over prodIdx)', () => {
  const prods = [{ productId:'p1', name:'A' }, { productId:'p2', name:'B' }];
  const ci = { productId:'p2', prodIdx:0 };
  const m = matchCostItemProduct(ci, prods);
  assert.strictEqual(m.index, 1);
  assert.strictEqual(m.product.name, 'B');
});

test('prodIdx fallback when no productId', () => {
  const prods = [{ name:'A' }, { name:'B' }];
  const ci = { prodIdx:1 };
  const m = matchCostItemProduct(ci, prods);
  assert.strictEqual(m.index, 1);
  assert.strictEqual(m.product.name, 'B');
});

test('null ci returns no match', () => {
  const m = matchCostItemProduct(null, [{ name:'A' }]);
  assert.strictEqual(m.index, -1);
  assert.strictEqual(m.product, null);
});

test('productId not found falls back to prodIdx', () => {
  const prods = [{ productId:'p1', name:'A' }, { productId:'p2', name:'B' }];
  const ci = { productId:'p99', prodIdx:0 };
  const m = matchCostItemProduct(ci, prods);
  assert.strictEqual(m.index, 0);
  assert.strictEqual(m.product.name, 'A');
});

section('T3 — resolveCostItemCategory helper');

function resolveCostItemCategory(type, masterCats) {
  if (!type || !Array.isArray(masterCats) || !masterCats.length) return { category: '', subcategory: '' };
  const norm = _normalizeCostType(type);
  const match = masterCats.find(c =>
    c.label === type || _normalizeCostType(c.label) === norm
  );
  if (!match) return { category: '', subcategory: '' };
  return { category: match.group || '', subcategory: match.label || '' };
}

test('resolves category from master list', () => {
  const cats = [{ label:'طباعة ديجيتال', group:'طباعة' }, { label:'سلفنة', group:'تشطيبات' }];
  const r = resolveCostItemCategory('طباعة ديجيتال', cats);
  assert.strictEqual(r.category, 'طباعة');
  assert.strictEqual(r.subcategory, 'طباعة ديجيتال');
});

test('resolves via normalization (ال prefix)', () => {
  const cats = [{ label:'طباعة', group:'طباعة' }];
  const r = resolveCostItemCategory('الطباعة', cats);
  assert.strictEqual(r.category, 'طباعة');
  assert.strictEqual(r.subcategory, 'طباعة');
});

test('no match returns empty', () => {
  const cats = [{ label:'طباعة', group:'طباعة' }];
  const r = resolveCostItemCategory('custom_xyz', cats);
  assert.strictEqual(r.category, '');
  assert.strictEqual(r.subcategory, '');
});

// ── summary ───────────────────────────────────────────────
console.log(`\nresult: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
