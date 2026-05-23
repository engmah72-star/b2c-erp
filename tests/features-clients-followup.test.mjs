/**
 * Tests for features/clients/followup-form.js (clients Phase-2B).
 * Run: node tests/features-clients-followup.test.mjs
 */
import {
  buildFollowupOrderOptions,
  buildFollowupPayload,
  getFollowupRatingLabel,
} from '../features/clients/followup-form.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── getFollowupRatingLabel ─────────────────────────────────────────
test('rating 0 → غير مُقيَّم label', () => {
  assertEq(getFollowupRatingLabel(0), '— غير مُقيَّم —');
});
test('rating 1 → ضعيف', () => {
  if (!getFollowupRatingLabel(1).includes('ضعيف')) throw new Error('missing label');
});
test('rating 3 → جيد', () => {
  if (!getFollowupRatingLabel(3).includes('جيد')) throw new Error('missing label');
});
test('rating 5 → رائع', () => {
  if (!getFollowupRatingLabel(5).includes('رائع')) throw new Error('missing label');
});
test('rating > 5 clamps to 5', () => {
  assertEq(getFollowupRatingLabel(10), getFollowupRatingLabel(5));
});
test('rating < 0 clamps to 0', () => {
  assertEq(getFollowupRatingLabel(-1), getFollowupRatingLabel(0));
});
test('rating NaN falls back to 0', () => {
  assertEq(getFollowupRatingLabel('xyz'), getFollowupRatingLabel(0));
});

// ── buildFollowupOrderOptions ──────────────────────────────────────
test('empty orders → only sentinel option', () => {
  const html = buildFollowupOrderOptions([]);
  if (!html.includes('— لا يخص أوردر معيّن —')) throw new Error('missing sentinel');
  // Count <option>
  const count = (html.match(/<option/g) || []).length;
  assertEq(count, 1);
});

test('orders sorted by createdAt.seconds desc', () => {
  const orders = [
    { _id: 'old', orderId: 'O-old', product: 'A', stage: 's', createdAt: { seconds: 100 } },
    { _id: 'new', orderId: 'O-new', product: 'B', stage: 's', createdAt: { seconds: 200 } },
  ];
  const html = buildFollowupOrderOptions(orders, { s: 'مرحلة' });
  // Newer should appear first (after sentinel)
  const idxNew = html.indexOf('O-new');
  const idxOld = html.indexOf('O-old');
  if (idxNew > idxOld) throw new Error('expected newer order first');
});

test('uses product name OR products[].name×qty', () => {
  const orders = [
    { _id: 'a', orderId: 'A1', stage: 'x', products: [{ name: 'كارت', qty: 100 }, { name: 'بنر', qty: 2 }] },
  ];
  const html = buildFollowupOrderOptions(orders);
  if (!html.includes('كارت×100')) throw new Error('missing first product');
  if (!html.includes('بنر×2'))   throw new Error('missing second product');
  if (!html.includes(' + '))       throw new Error('missing joiner');
});

test('uses stageAr mapping for stage label', () => {
  const orders = [{ _id: 'a', orderId: 'A1', product: 'X', stage: 'design' }];
  const html = buildFollowupOrderOptions(orders, { design: '🎨 تصميم' });
  if (!html.includes('🎨 تصميم')) throw new Error('stage label not used');
});

test('escapes attributes from order data', () => {
  const orders = [{ _id: 'a"b', orderId: '<script>', product: 'p&q', stage: 'x' }];
  const html = buildFollowupOrderOptions(orders);
  if (html.includes('"')) {
    // Ensure quotes are escaped within attributes
    if (!html.includes('&quot;')) throw new Error('quotes not escaped');
  }
  if (html.includes('<script>')) throw new Error('script tag not escaped');
});

// ── buildFollowupPayload ────────────────────────────────────────────
test('basic payload — no linked order', () => {
  const p = buildFollowupPayload({
    clientId: 'c1', clientName: 'Ahmed',
    type: 'call', note: '  hi  ',
    assignedTo: 'u1', assignedToName: 'Admin',
  });
  assertEq(p.clientId, 'c1');
  assertEq(p.clientName, 'Ahmed');
  assertEq(p.type, 'call');
  assertEq(p.note, 'hi'); // trimmed
  assertEq(p.orderId, '');
  assertEq(p.orderCode, '');
  assertEq(p.productName, '');
  assertEq(p.assignedTo, 'u1');
});

test('linked order snapshot — orderCode + productName extracted', () => {
  const p = buildFollowupPayload({
    clientId: 'c1', type: 'visit', assignedTo: 'u1',
    orderId: 'o1',
    linkedOrder: { _id: 'o1', orderId: 'O-100', product: 'كارت' },
  });
  assertEq(p.orderCode, 'O-100');
  assertEq(p.productName, 'كارت');
});

test('linked order with products[] → builds composed name', () => {
  const p = buildFollowupPayload({
    clientId: 'c1', type: 'call', assignedTo: 'u1',
    orderId: 'o1',
    linkedOrder: { _id: 'o1', orderId: 'O-2', products: [{ name: 'A', qty: 1 }, { name: 'B', qty: 5 }] },
  });
  assertEq(p.productName, 'A×1 + B×5');
});

test('nextActionDate converts local to ISO; empty stays empty', () => {
  const p = buildFollowupPayload({
    clientId: 'c1', type: 'call', assignedTo: 'u1',
    nextActionDateRaw: '2026-12-31T10:30',
  });
  if (!/2026-12-31/.test(p.nextActionDate)) throw new Error('expected ISO with date');
});

test('nextActionDone true when explicitly set OR when no nextActionDate', () => {
  const a = buildFollowupPayload({ clientId: 'c1', type: 'call', assignedTo: 'u1', nextActionDateRaw: '', nextActionDone: false });
  assertEq(a.nextActionDone, true); // empty date → done
  const b = buildFollowupPayload({ clientId: 'c1', type: 'call', assignedTo: 'u1', nextActionDateRaw: '2026-12-31T10:30', nextActionDone: false });
  assertEq(b.nextActionDone, false); // date set + not done → false
  const c = buildFollowupPayload({ clientId: 'c1', type: 'call', assignedTo: 'u1', nextActionDateRaw: '2026-12-31T10:30', nextActionDone: true });
  assertEq(c.nextActionDone, true); // explicit done
});

test('rating coerced to int', () => {
  const p = buildFollowupPayload({
    clientId: 'c1', type: 'call', assignedTo: 'u1',
    productRating: '4.7',
  });
  assertEq(p.productRating, 4);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
