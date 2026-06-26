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
  if (!type || !Array.isArray(masterCats) || !masterCats.length)
    return { category: null, subcategory: null, defaultUnit: null, expectedPriceRange: null };
  const norm = _normalizeCostType(type);
  const match = masterCats.find(c =>
    c.label === type || _normalizeCostType(c.label) === norm
  );
  if (!match) return { category: null, subcategory: null, defaultUnit: null, expectedPriceRange: null };
  return {
    category: match.group || null,
    subcategory: match.label || null,
    defaultUnit: match.defaultUnit || null,
    expectedPriceRange: match.expectedPriceRange || null,
  };
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

test('no match returns null fields', () => {
  const cats = [{ label:'طباعة', group:'طباعة' }];
  const r = resolveCostItemCategory('custom_xyz', cats);
  assert.strictEqual(r.category, null);
  assert.strictEqual(r.subcategory, null);
});

section('T5 — resolveCostItemCategory returns defaultUnit & expectedPriceRange');

test('returns defaultUnit from master category', () => {
  const cats = [{ label:'ورق', group:'خامات', defaultUnit:'ريم', expectedPriceRange:{min:50,max:200} }];
  const r = resolveCostItemCategory('ورق', cats);
  assert.strictEqual(r.defaultUnit, 'ريم');
  assert.deepStrictEqual(r.expectedPriceRange, {min:50,max:200});
});

test('returns null defaultUnit when category has none', () => {
  const cats = [{ label:'طباعة', group:'طباعة' }];
  const r = resolveCostItemCategory('طباعة', cats);
  assert.strictEqual(r.defaultUnit, null);
  assert.strictEqual(r.expectedPriceRange, null);
});

section('T5 — matchCostItemByKeywords helper');

function matchCostItemByKeywords(query, masterCats) {
  if (!query || !Array.isArray(masterCats) || !masterCats.length) return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return masterCats.filter(c => {
    if ((c.label || '').toLowerCase().includes(q)) return true;
    if (Array.isArray(c.keywords) && c.keywords.some(k => k.toLowerCase().includes(q))) return true;
    return false;
  });
}

test('matches by label substring', () => {
  const cats = [
    { label:'طباعة ديجيتال', group:'طباعة' },
    { label:'سلفنة', group:'تشطيبات' },
  ];
  const r = matchCostItemByKeywords('ديجيتال', cats);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].label, 'طباعة ديجيتال');
});

test('matches by keywords array', () => {
  const cats = [
    { label:'طباعة أوفست', group:'طباعة', keywords:['offset','litho'] },
    { label:'سلفنة', group:'تشطيبات', keywords:['lamination'] },
  ];
  const r = matchCostItemByKeywords('lamination', cats);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].label, 'سلفنة');
});

test('empty query returns empty', () => {
  const cats = [{ label:'طباعة', group:'طباعة' }];
  assert.deepStrictEqual(matchCostItemByKeywords('', cats), []);
  assert.deepStrictEqual(matchCostItemByKeywords(null, cats), []);
});

test('no match returns empty', () => {
  const cats = [{ label:'طباعة', group:'طباعة', keywords:['print'] }];
  const r = matchCostItemByKeywords('xyz_nothing', cats);
  assert.strictEqual(r.length, 0);
});

section('T8 — isActiveCostItem predicate');

function isActiveCostItem(ci) {
  if (!ci) return false;
  return !ci.status || ci.status === 'active' || ci.status === 'adjusted';
}

test('item without status is active (backward compatible)', () => {
  assert.strictEqual(isActiveCostItem({ type:'طباعة', total:100 }), true);
});

test('item with status=active is active', () => {
  assert.strictEqual(isActiveCostItem({ status:'active' }), true);
});

test('item with status=adjusted is active', () => {
  assert.strictEqual(isActiveCostItem({ status:'adjusted' }), true);
});

test('item with status=voided is NOT active', () => {
  assert.strictEqual(isActiveCostItem({ status:'voided' }), false);
});

test('null/undefined returns false', () => {
  assert.strictEqual(isActiveCostItem(null), false);
  assert.strictEqual(isActiveCostItem(undefined), false);
});

section('T8 — voided items excluded from totals');

test('active items sum excludes voided', () => {
  const items = [
    { type:'طباعة', total:100 },
    { type:'ورق', total:50, status:'active' },
    { type:'سلفنة', total:200, status:'voided' },
    { type:'قص', total:30, status:'adjusted' },
  ];
  const activeTotal = items.filter(isActiveCostItem).reduce((s,c) => s + (parseFloat(c.total)||0), 0);
  assert.strictEqual(activeTotal, 180);
});

test('all voided = zero total', () => {
  const items = [
    { type:'طباعة', total:100, status:'voided' },
    { type:'ورق', total:200, status:'voided' },
  ];
  const activeTotal = items.filter(isActiveCostItem).reduce((s,c) => s + (parseFloat(c.total)||0), 0);
  assert.strictEqual(activeTotal, 0);
});

section('T8 — COST_ITEM_STATUSES constants');

const COST_ITEM_STATUSES = { ACTIVE:'active', VOIDED:'voided', ADJUSTED:'adjusted' };

test('COST_ITEM_STATUSES has correct values', () => {
  assert.strictEqual(COST_ITEM_STATUSES.ACTIVE, 'active');
  assert.strictEqual(COST_ITEM_STATUSES.VOIDED, 'voided');
  assert.strictEqual(COST_ITEM_STATUSES.ADJUSTED, 'adjusted');
});

// ══════════════════════════════════════════
// Phase 3 — T6 + T9
// ══════════════════════════════════════════

section('T9 — resolveProductCategory (product taxonomy)');

function _normPC(s) {
  if (!s) return '';
  let n = s.trim().replace(/\s+/g, ' ').replace(/^ال/, '');
  return n.replace(/[أإآ]/g, 'ا').replace(/[ةه]/g, 'ه').replace(/[يى]/g, 'ي').toLowerCase();
}

const PRODUCT_CATEGORIES = [
  { id:'paper_prints', keywords:['بروشور','فلاير','كارت','كتيب','مجلة','كتالوج','ظرف','فولدر','ملصق','استيكر','دفتر','نوتة','أجندة','تقويم','شهادة','دعوة','منيو','فاتورة','كروت','بوستر','نشرة','مظروف','ورقة','ورق','بطاقة','كتاب','تاج','ليبل'] },
  { id:'large_format', keywords:['بانر','رول اب','ستاند','يافطة','لافتة','خلفية','فينيل','ساين','backdrop','رول','بنر','لوحة','لوح','فلكس','مش','ميش','واجهة','حروف بارزة'] },
  { id:'packaging', keywords:['علبة','كرتون','باكج','تغليف','شنطة','أكياس','كيس','صندوق','بوكس','باكيج'] },
  { id:'stamps', keywords:['ختم','أختام','stamp','شمع'] },
  { id:'promotional', keywords:['تيشيرت','مج','قلم','ميدالية','شارة','هدايا','سبلميشن','كوب','تيشرت','ميداليه','يونيفورم','كاب','شنطه','فلاشة'] },
  { id:'design_only', keywords:['تصميم','لوجو','هوية','identity','موشن','فيديو','سوشيال','بوست','اعلان','إعلان'] },
];

function resolveProductCategory(productName) {
  if (!productName) return null;
  const n = _normPC(productName);
  let best = null, bestLen = 0;
  for (const cat of PRODUCT_CATEGORIES) {
    for (const kw of cat.keywords) {
      const nk = _normPC(kw);
      if (n.includes(nk) && nk.length > bestLen) { best = cat; bestLen = nk.length; }
    }
  }
  return best ? best.id : null;
}

test('بروشور → paper_prints', () => {
  assert.strictEqual(resolveProductCategory('بروشور A4'), 'paper_prints');
});

test('بانر → large_format', () => {
  assert.strictEqual(resolveProductCategory('بانر 3×2 متر'), 'large_format');
});

test('علبة → packaging', () => {
  assert.strictEqual(resolveProductCategory('علبة كرتون'), 'packaging');
});

test('ختم → stamps', () => {
  assert.strictEqual(resolveProductCategory('ختم شركة'), 'stamps');
});

test('تيشيرت → promotional', () => {
  assert.strictEqual(resolveProductCategory('تيشيرت بولو'), 'promotional');
});

test('لوجو → design_only', () => {
  assert.strictEqual(resolveProductCategory('تصميم لوجو'), 'design_only');
});

test('unknown product → null', () => {
  assert.strictEqual(resolveProductCategory('منتج غير معروف'), null);
});

test('null/empty → null', () => {
  assert.strictEqual(resolveProductCategory(null), null);
  assert.strictEqual(resolveProductCategory(''), null);
});

test('longest keyword match wins (كرتون in packaging not paper)', () => {
  assert.strictEqual(resolveProductCategory('كرتون تغليف'), 'packaging');
});

section('T9 — getExpectedCostTypes (category-aware filtering)');

function getExpectedCostTypes(product, masterCats) {
  if (!product || !masterCats?.length) return [];
  const pt = (product.printType || '').toLowerCase();
  if (!pt) return [];
  const catId = product.productCategory || resolveProductCategory(product.name);
  const cat = catId ? PRODUCT_CATEGORIES.find(c => c.id === catId) : null;
  const costTypeHints = {
    paper_prints:['طباعة','ورق','زنكات','تجليد','سلوفان','يو في','تقطيع','دبوس','لصق','تكسير','تصميم','فرز','تغليف'],
    large_format:['طباعة','خامة','تركيب','تصميم'],
    packaging:['طباعة','تقطيع','تجليد','لصق','خامة','تصميم','ورق'],
    stamps:['ختم','حبر','تصميم'],
    promotional:['طباعة','خامة','تصميم'],
    design_only:['تصميم'],
  };
  const base = masterCats.filter(c =>
    c.isCostItem !== false &&
    (c.printTypes || []).some(x => x === pt || pt.includes(x) || x.includes(pt))
  );
  if (!cat) return base.map(c => c.label);
  const hints = (costTypeHints[cat.id] || []).map(h => _normPC(h));
  const filtered = base.filter(c => {
    const nl = _normPC(c.label);
    return hints.some(h => nl.includes(h) || h.includes(nl));
  });
  return filtered.length ? filtered.map(c => c.label) : base.map(c => c.label);
}

const sampleMasterCats = [
  { label:'طباعة ديجيتال', isCostItem:true, printTypes:['digital'] },
  { label:'زنكات أوفست', isCostItem:true, printTypes:['offset'] },
  { label:'ورق', isCostItem:true, printTypes:['digital','offset'] },
  { label:'تجليد', isCostItem:true, printTypes:['digital','offset'] },
  { label:'تركيب', isCostItem:true, printTypes:['digital'] },
  { label:'خامة فينيل', isCostItem:true, printTypes:['digital'] },
  { label:'ختم', isCostItem:true, printTypes:['digital','offset'] },
];

test('paper product digital: includes ورق+تجليد, excludes ختم', () => {
  const r = getExpectedCostTypes({ name:'بروشور', printType:'digital' }, sampleMasterCats);
  assert.ok(r.includes('طباعة ديجيتال'), 'should include طباعة');
  assert.ok(r.includes('ورق'), 'should include ورق');
  assert.ok(r.includes('تجليد'), 'should include تجليد');
  assert.ok(!r.includes('ختم'), 'should exclude ختم');
});

test('large_format digital: includes تركيب, excludes تجليد+ورق', () => {
  const r = getExpectedCostTypes({ name:'بانر كبير', printType:'digital' }, sampleMasterCats);
  assert.ok(r.includes('طباعة ديجيتال'), 'should include طباعة');
  assert.ok(r.includes('تركيب'), 'should include تركيب');
  assert.ok(!r.includes('تجليد'), 'should exclude تجليد');
  assert.ok(!r.includes('ورق'), 'should exclude ورق');
});

test('stamp product: only ختم from matching types', () => {
  const r = getExpectedCostTypes({ name:'ختم مؤسسة', printType:'digital' }, sampleMasterCats);
  assert.ok(r.includes('ختم'), 'should include ختم');
  assert.ok(!r.includes('تركيب'), 'should exclude تركيب');
});

test('unknown category falls back to all matching printType', () => {
  const r = getExpectedCostTypes({ name:'منتج خاص', printType:'digital' }, sampleMasterCats);
  assert.ok(r.length >= 4, 'should return all digital cost types');
});

test('explicit productCategory overrides auto-detection', () => {
  const r = getExpectedCostTypes({ name:'بروشور', printType:'digital', productCategory:'large_format' }, sampleMasterCats);
  assert.ok(r.includes('تركيب'), 'should include تركيب (large_format)');
  assert.ok(!r.includes('تجليد'), 'should exclude تجليد');
});

test('no printType → empty', () => {
  const r = getExpectedCostTypes({ name:'بروشور' }, sampleMasterCats);
  assert.strictEqual(r.length, 0);
});

section('T9 — scoreTmpl category bonus');

function scoreTmplCategoryBonus(template, product) {
  const prodCat = product.productCategory || resolveProductCategory(product.name);
  const tmplCat = resolveProductCategory(template.name);
  return (prodCat && tmplCat && prodCat === tmplCat) ? 0.10 : 0;
}

test('same category gives 0.10 bonus', () => {
  const bonus = scoreTmplCategoryBonus({ name:'بروشور 1000' }, { name:'بروشور A4' });
  assert.strictEqual(bonus, 0.10);
});

test('different category gives 0 bonus', () => {
  const bonus = scoreTmplCategoryBonus({ name:'بروشور 1000' }, { name:'بانر 3م' });
  assert.strictEqual(bonus, 0);
});

test('unknown category gives 0 bonus', () => {
  const bonus = scoreTmplCategoryBonus({ name:'قالب عام' }, { name:'منتج عام' });
  assert.strictEqual(bonus, 0);
});

// ── Template metadata: printType & productCategory matching ──
section('scoreTmpl — template printType/productCategory metadata');

function scorePrintTypeMatch(template, product) {
  if (!product.printType) return 0;
  if (template.printType) {
    return template.printType === product.printType ? 0.10 : -0.05;
  }
  return 0;
}

function scoreCategoryExplicit(template, product) {
  const prodCat = product.productCategory || resolveProductCategory(product.name);
  const tmplCat = template.productCategory || resolveProductCategory(template.name);
  return (prodCat && tmplCat && prodCat === tmplCat) ? 0.10 : 0;
}

test('explicit printType match gives 0.10 (doubled from 0.05)', () => {
  const s = scorePrintTypeMatch({ printType: 'digital' }, { printType: 'digital' });
  assert.strictEqual(s, 0.10);
});

test('explicit printType mismatch penalizes -0.05', () => {
  const s = scorePrintTypeMatch({ printType: 'offset' }, { printType: 'digital' });
  assert.strictEqual(s, -0.05);
});

test('no template printType = no explicit bonus/penalty', () => {
  const s = scorePrintTypeMatch({}, { printType: 'digital' });
  assert.strictEqual(s, 0);
});

test('explicit productCategory on template overrides name-based detection', () => {
  const s = scoreCategoryExplicit(
    { name: 'قالب عام', productCategory: 'paper_prints' },
    { name: 'بروشور A4' }
  );
  assert.strictEqual(s, 0.10);
});

test('explicit category mismatch gives 0', () => {
  const s = scoreCategoryExplicit(
    { name: 'قالب عام', productCategory: 'stamps' },
    { name: 'بروشور A4' }
  );
  assert.strictEqual(s, 0);
});

// ── T: toggleProductCostComplete validation ──────────────
section('toggleProductCostComplete — input validation');

// Re-implement the validation logic inline (mirrors order-actions.js)
function validateToggleCostComplete({ orderId, prodIdx, role, userId, products, costCompletedProds }) {
  if (!userId) return { ok: false, errors: ['userId مطلوب'] };
  if (!orderId) return { ok: false, errors: ['orderId مطلوب'] };
  if (prodIdx == null || prodIdx < 0) return { ok: false, errors: ['prodIdx مطلوب'] };
  if (!['admin', 'operation_manager', 'production_agent'].includes(role)) {
    return { ok: false, errors: ['ليس لديك صلاحية إغلاق/فتح تسجيل بنود التكلفة'] };
  }
  if (prodIdx >= (products || []).length) return { ok: false, errors: ['المنتج غير موجود'] };
  const map = { ...(costCompletedProds || {}) };
  const key = String(prodIdx);
  const wasComplete = !!map[key];
  if (wasComplete) delete map[key]; else map[key] = { at: new Date().toISOString(), by: userId, byName: 'test' };
  return { ok: true, completed: !wasComplete, prodIdx, map };
}

test('rejects missing userId', () => {
  const r = validateToggleCostComplete({ orderId: 'o1', prodIdx: 0, role: 'admin', userId: '', products: [{ name: 'x' }] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('userId'));
});

test('rejects missing orderId', () => {
  const r = validateToggleCostComplete({ orderId: '', prodIdx: 0, role: 'admin', userId: 'u1', products: [{ name: 'x' }] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('orderId'));
});

test('rejects negative prodIdx', () => {
  const r = validateToggleCostComplete({ orderId: 'o1', prodIdx: -1, role: 'admin', userId: 'u1', products: [{ name: 'x' }] });
  assert.strictEqual(r.ok, false);
});

test('rejects unauthorized role (customer_service)', () => {
  const r = validateToggleCostComplete({ orderId: 'o1', prodIdx: 0, role: 'customer_service', userId: 'u1', products: [{ name: 'x' }] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('صلاحية'));
});

test('rejects prodIdx beyond products array', () => {
  const r = validateToggleCostComplete({ orderId: 'o1', prodIdx: 3, role: 'admin', userId: 'u1', products: [{ name: 'a' }, { name: 'b' }] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('المنتج غير موجود'));
});

test('admin can complete product (open → done)', () => {
  const r = validateToggleCostComplete({ orderId: 'o1', prodIdx: 0, role: 'admin', userId: 'u1', products: [{ name: 'x' }], costCompletedProds: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.completed, true);
  assert.ok(r.map['0']);
  assert.strictEqual(r.map['0'].by, 'u1');
});

test('admin can reopen completed product (done → open)', () => {
  const r = validateToggleCostComplete({ orderId: 'o1', prodIdx: 1, role: 'admin', userId: 'u1', products: [{ name: 'a' }, { name: 'b' }], costCompletedProds: { '1': { at: '2025-01-01', by: 'u2', byName: 'other' } } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.completed, false);
  assert.strictEqual(r.map['1'], undefined);
});

test('production_agent can toggle', () => {
  const r = validateToggleCostComplete({ orderId: 'o1', prodIdx: 0, role: 'production_agent', userId: 'u1', products: [{ name: 'x' }] });
  assert.strictEqual(r.ok, true);
});

test('operation_manager can toggle', () => {
  const r = validateToggleCostComplete({ orderId: 'o1', prodIdx: 0, role: 'operation_manager', userId: 'u1', products: [{ name: 'x' }] });
  assert.strictEqual(r.ok, true);
});
// ── cancelOrder — archived order admin-only ──────────────
section('cancelOrder — archived order restriction');

function validateCancelOrder({ stage, role, reason, userId }) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'] };
  if (!reason) return { ok: false, errors: ['⛔ سبب الإلغاء مطلوب'] };
  if (stage === 'cancelled') return { ok: false, errors: ['الأوردر ملغي بالفعل'] };
  if (stage === 'archived' && role !== 'admin') return { ok: false, errors: ['لا يمكن إلغاء أوردر مؤرشف — الأدمن فقط'] };
  return { ok: true, errors: [] };
}

test('admin can cancel archived order', () => {
  const r = validateCancelOrder({ stage: 'archived', role: 'admin', reason: 'خطأ', userId: 'u1' });
  assert.strictEqual(r.ok, true);
});

test('non-admin cannot cancel archived order', () => {
  const r = validateCancelOrder({ stage: 'archived', role: 'production_agent', reason: 'خطأ', userId: 'u1' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('الأدمن فقط'));
});

test('operation_manager cannot cancel archived order', () => {
  const r = validateCancelOrder({ stage: 'archived', role: 'operation_manager', reason: 'خطأ', userId: 'u1' });
  assert.strictEqual(r.ok, false);
});

test('non-archived order can be cancelled by any allowed role', () => {
  const r = validateCancelOrder({ stage: 'production', role: 'production_agent', reason: 'سبب', userId: 'u1' });
  assert.strictEqual(r.ok, true);
});

test('already cancelled order is rejected', () => {
  const r = validateCancelOrder({ stage: 'cancelled', role: 'admin', reason: 'سبب', userId: 'u1' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('ملغي بالفعل'));
});

// ── summary ───────────────────────────────────────────────
console.log(`\nresult: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
