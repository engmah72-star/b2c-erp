/**
 * Tests for core/client-orders-index.js (clients god-page Phase-1).
 * Run: node tests/core-client-orders-index.test.mjs
 */
import {
  buildClientOrdersIndex,
  createClientOrdersIndexCache,
} from '../core/client-orders-index.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assertArrEq(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
  }
}

// ── buildClientOrdersIndex ─────────────────────────────────────────
test('empty clients + orders → empty map', () => {
  const idx = buildClientOrdersIndex([], []);
  assertEq(idx.size, 0);
});

test('every client gets an empty array entry even without orders', () => {
  const idx = buildClientOrdersIndex(
    [{ _id: 'c1' }, { _id: 'c2' }],
    []
  );
  assertEq(idx.size, 2);
  assertArrEq(idx.get('c1'), []);
  assertArrEq(idx.get('c2'), []);
});

test('match by clientId (primary)', () => {
  const idx = buildClientOrdersIndex(
    [{ _id: 'c1', phone1: '010', name: 'A' }],
    [{ clientId: 'c1', _id: 'o1' }]
  );
  assertEq(idx.get('c1').length, 1);
  assertEq(idx.get('c1')[0]._id, 'o1');
});

test('match by clientPhone fallback', () => {
  const idx = buildClientOrdersIndex(
    [{ _id: 'c1', phone1: '010xyz' }],
    [{ clientPhone: '010xyz', _id: 'o1' }]
  );
  assertEq(idx.get('c1').length, 1);
});

test('match by clientName fallback', () => {
  const idx = buildClientOrdersIndex(
    [{ _id: 'c1', name: 'Ahmed' }],
    [{ clientName: 'Ahmed', _id: 'o1' }]
  );
  assertEq(idx.get('c1').length, 1);
});

test('clientId takes precedence over phone/name', () => {
  // Order has matching phone for c2 but clientId points to c1
  const idx = buildClientOrdersIndex(
    [{ _id: 'c1', phone1: 'abc' }, { _id: 'c2', phone1: 'xyz' }],
    [{ clientId: 'c1', clientPhone: 'xyz', _id: 'o1' }]
  );
  assertEq(idx.get('c1').length, 1);
  assertEq(idx.get('c2').length, 0);
});

test('orders without any match are dropped (not orphaned)', () => {
  const idx = buildClientOrdersIndex(
    [{ _id: 'c1', phone1: '010' }],
    [{ clientId: 'unknown', clientPhone: 'unknown', clientName: 'Unknown', _id: 'oX' }]
  );
  assertEq(idx.get('c1').length, 0);
});

test('multiple orders per client preserved', () => {
  const idx = buildClientOrdersIndex(
    [{ _id: 'c1' }],
    [
      { clientId: 'c1', _id: 'o1' },
      { clientId: 'c1', _id: 'o2' },
      { clientId: 'c1', _id: 'o3' },
    ]
  );
  assertEq(idx.get('c1').length, 3);
});

// ── createClientOrdersIndexCache ───────────────────────────────────
test('cache returns same Map on repeat calls (when lengths unchanged)', () => {
  const cache = createClientOrdersIndexCache();
  const clients = [{ _id: 'c1' }];
  const orders = [{ clientId: 'c1' }];
  const a = cache.get(clients, orders);
  const b = cache.get(clients, orders);
  if (a !== b) throw new Error('expected same reference');
});

test('cache invalidates when clients length changes', () => {
  const cache = createClientOrdersIndexCache();
  const a = cache.get([{ _id: 'c1' }], []);
  const b = cache.get([{ _id: 'c1' }, { _id: 'c2' }], []);
  if (a === b) throw new Error('expected fresh Map');
});

test('cache invalidates when orders length changes', () => {
  const cache = createClientOrdersIndexCache();
  const a = cache.get([{ _id: 'c1' }], []);
  const b = cache.get([{ _id: 'c1' }], [{ clientId: 'c1' }]);
  if (a === b) throw new Error('expected fresh Map');
});

test('cache.invalidate() forces fresh build', () => {
  const cache = createClientOrdersIndexCache();
  const clients = [{ _id: 'c1' }];
  const orders = [{ clientId: 'c1' }];
  const a = cache.get(clients, orders);
  cache.invalidate();
  const b = cache.get(clients, orders);
  if (a === b) throw new Error('expected fresh Map after invalidate');
});

test('getForClient returns [] for null client', () => {
  const cache = createClientOrdersIndexCache();
  assertArrEq(cache.getForClient([{ _id: 'c1' }], [], null), []);
});

test('getForClient returns the client orders', () => {
  const cache = createClientOrdersIndexCache();
  const c = { _id: 'c1' };
  const arr = cache.getForClient([c], [{ clientId: 'c1', _id: 'o1' }], c);
  assertEq(arr.length, 1);
  assertEq(arr[0]._id, 'o1');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
