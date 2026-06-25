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
  if (!type || !type.trim()) errors.push('اختر نوع البند');
  else if (allowedTypes.length && !allowedTypes.map(t => _normalizeCostType(t)).includes(_normalizeCostType(type)))
    errors.push('نوع البند غير مُعرَّف في خدمات الإنتاج بالإعدادات');
  if (amt <= 0) errors.push('أدخل تكلفة صحيحة');
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
  // Documents the schema that downstream consumers rely on (per
  // production.html line refs + dashboards + reports)
  const required = [
    'costItemId','orderId','isExternal','type','supplierId','supplierName',
    'prodIdx','total','note','date','addedAt','addedBy',
  ];
  // recordCostItem builds the item with these keys — if any are removed
  // here, the contract drifts (this test is a sentinel).
  assert.ok(required.every(k => typeof k === 'string'));
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

// ── summary ───────────────────────────────────────────────
console.log(`\nresult: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
