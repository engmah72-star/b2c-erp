/**
 * Tests for core/shipping-utils.js (Phase-1 shipping decomp).
 * Run: node tests/core-shipping-utils.test.mjs
 */
import {
  getDeliveryAddress, isCreatedToday, getCustomerContext,
  isUrgentOrder, renderSmartBadges, fmtTimestamp,
} from '../core/shipping-utils.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

const ts = (d) => ({ toDate: () => d });
const NOW = new Date(2026, 4, 15, 14, 0, 0);

// ── getDeliveryAddress ─────────────────────────────────────────────
test('getDeliveryAddress: null order → empty', () => {
  const r = getDeliveryAddress(null);
  assertEq(r.gov, '');
  assertEq(r.full, '');
});

test('getDeliveryAddress: uses shipGov + shipAddress', () => {
  const r = getDeliveryAddress({ shipGov: 'القاهرة', shipAddress: '5 شارع كذا' });
  assertEq(r.gov, 'القاهرة');
  assertEq(r.addr, '5 شارع كذا');
  assertEq(r.full, 'القاهرة — 5 شارع كذا');
});

test('getDeliveryAddress: falls back to clientGov', () => {
  const r = getDeliveryAddress({ clientGov: 'الجيزة' });
  assertEq(r.gov, 'الجيزة');
  assertEq(r.full, 'الجيزة');
});

test('getDeliveryAddress: prefers deliveryAddress object (print operator)', () => {
  const r = getDeliveryAddress({
    deliveryAddress: { gov: 'القاهرة', city: 'مدينة نصر', street: '5 ش كذا' },
    shipGov: 'الإسكندرية', shipAddress: 'عنوان قديم',
  });
  assertEq(r.gov, 'القاهرة');
  assertEq(r.addr, 'مدينة نصر، 5 ش كذا');
});

test('getDeliveryAddress: deliveryAddress.gov only → falls back for addr', () => {
  const r = getDeliveryAddress({
    deliveryAddress: { gov: 'القاهرة' }, shipAddress: 'عنوان قديم',
  });
  assertEq(r.gov, 'القاهرة');
  assertEq(r.addr, 'عنوان قديم');
});

// ── isCreatedToday ─────────────────────────────────────────────────
test('isCreatedToday: today → true', () => {
  assertEq(isCreatedToday(ts(new Date(2026, 4, 15, 8, 0)), NOW), true);
});

test('isCreatedToday: yesterday → false', () => {
  assertEq(isCreatedToday(ts(new Date(2026, 4, 14)), NOW), false);
});

test('isCreatedToday: null → false', () => {
  assertEq(isCreatedToday(null, NOW), false);
});

test('isCreatedToday: accepts string date', () => {
  assertEq(isCreatedToday('2026-05-15T10:00:00Z', NOW), true);
});

test('isCreatedToday: invalid date → false', () => {
  assertEq(isCreatedToday('not-a-date', NOW), false);
});

// ── getCustomerContext ─────────────────────────────────────────────
test('getCustomerContext: no clientId → new + active=0', () => {
  const r = getCustomerContext({});
  assertEq(r.isNew, true);
  assertEq(r.activeCount, 0);
});

test('getCustomerContext: single order → isNew', () => {
  const r = getCustomerContext({ clientId: 'c1' }, [{ clientId: 'c1', stage: 'shipping' }]);
  assertEq(r.count, 1);
  assertEq(r.isNew, true);
  assertEq(r.isLoyal, false);
});

test('getCustomerContext: 5+ orders → loyal', () => {
  const orders = Array.from({ length: 5 }, () => ({ clientId: 'c1', stage: 'archived' }));
  const r = getCustomerContext({ clientId: 'c1' }, orders);
  assertEq(r.isLoyal, true);
  assertEq(r.isNew, false);
});

test('getCustomerContext: active count excludes archived/cancelled', () => {
  const orders = [
    { clientId: 'c1', stage: 'shipping' },
    { clientId: 'c1', stage: 'shipping' },
    { clientId: 'c1', stage: 'archived' },
    { clientId: 'c1', stage: 'cancelled' },
  ];
  const r = getCustomerContext({ clientId: 'c1' }, orders);
  assertEq(r.count, 4);
  assertEq(r.activeCount, 2);
  assertEq(r.multipleActive, true);
});

// ── isUrgentOrder ──────────────────────────────────────────────────
test('isUrgentOrder: not shipping → false', () => {
  assertEq(isUrgentOrder({ stage: 'design' }), false);
});

test('isUrgentOrder: returned → false', () => {
  assertEq(isUrgentOrder({ stage: 'shipping', shipStage: 'returned' }), false);
});

test('isUrgentOrder: no reference timestamp → false', () => {
  assertEq(isUrgentOrder({ stage: 'shipping' }), false);
});

test('isUrgentOrder: ready > 2 days → urgent', () => {
  const ref = new Date(NOW); ref.setDate(NOW.getDate() - 3);
  const r = isUrgentOrder({
    stage: 'shipping', shipStage: 'ready',
    shipDispatchedAt: ts(ref),
  }, NOW.getTime());
  assertEq(r, true);
});

test('isUrgentOrder: ready < 2 days → not urgent', () => {
  const ref = new Date(NOW); ref.setHours(NOW.getHours() - 12);
  const r = isUrgentOrder({
    stage: 'shipping', shipStage: 'ready',
    shipDispatchedAt: ts(ref),
  }, NOW.getTime());
  assertEq(r, false);
});

test('isUrgentOrder: wait_delivery threshold 7 days', () => {
  const ref = new Date(NOW); ref.setDate(NOW.getDate() - 8);
  const r = isUrgentOrder({
    stage: 'shipping', shipStage: 'wait_delivery',
    shipDispatchedAt: ts(ref),
  }, NOW.getTime());
  assertEq(r, true);
});

// ── renderSmartBadges ──────────────────────────────────────────────
test('renderSmartBadges: today badge', () => {
  const html = renderSmartBadges({
    createdAt: ts(NOW),
  }, { allOrders: [], now: NOW });
  if (!html.includes('اليوم')) throw new Error('missing today badge');
});

test('renderSmartBadges: new client badge', () => {
  const html = renderSmartBadges({
    clientId: 'c1', createdAt: ts(NOW),
  }, { allOrders: [{ clientId: 'c1' }], now: NOW });
  if (!html.includes('عميل جديد')) throw new Error('missing new badge');
});

test('renderSmartBadges: loyal client badge', () => {
  const orders = Array.from({ length: 6 }, () => ({ clientId: 'c1' }));
  const html = renderSmartBadges({
    clientId: 'c1', createdAt: ts(NOW),
  }, { allOrders: orders, now: NOW });
  if (!html.includes('🔁')) throw new Error('missing loyal badge');
});

test('renderSmartBadges: urgent badge', () => {
  const ref = new Date(NOW); ref.setDate(NOW.getDate() - 5);
  const html = renderSmartBadges({
    stage: 'shipping', shipStage: 'ready',
    shipDispatchedAt: ts(ref),
    createdAt: ts(new Date(2025, 1, 1)),
  }, { allOrders: [], now: NOW });
  if (!html.includes('عاجل')) throw new Error('missing urgent badge');
});

test('renderSmartBadges: no badges → empty string', () => {
  // Order: not today, no clientId (would be "new" but renderSmartBadges falls through since
  // isNew triggers when no clientId — actually it DOES set isNew=true. Let me set clientId
  // with 2 orders so neither new nor loyal applies)
  const html = renderSmartBadges({
    clientId: 'c1', createdAt: ts(new Date(2025, 1, 1)),
  }, { allOrders: [{ clientId: 'c1' }, { clientId: 'c1' }], now: NOW });
  // Neither new (count=2 not 1) nor loyal (not 5+) nor multipleActive (no active stages)
  if (html.includes('عميل جديد') || html.includes('🔁') || html.includes('عاجل')) {
    throw new Error('unexpected badge in: ' + html);
  }
});

// ── fmtTimestamp ───────────────────────────────────────────────────
test('fmtTimestamp: null → "—"', () => {
  assertEq(fmtTimestamp(null), '—');
});

test('fmtTimestamp: invalid → "—"', () => {
  assertEq(fmtTimestamp('not-a-date'), '—');
});

test('fmtTimestamp: Timestamp → ar-EG date string', () => {
  const r = fmtTimestamp(ts(new Date(2026, 4, 15)));
  // Should be a non-empty date string (Arabic-Indic or Latin digits)
  if (!r || r === '—') throw new Error('expected date string, got: ' + r);
});

test('fmtTimestamp: ISO string accepted', () => {
  const r = fmtTimestamp('2026-05-15T10:00:00Z');
  if (!r || r === '—') throw new Error('expected date string');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
