/**
 * Node-runnable tests for core/data-cache.js
 * Run: node --loader ./tests/_loaders/hooks.mjs tests/core-data-cache.test.mjs
 *
 * Pure logic tests — validates serialization, query key generation,
 * and the cachedQuery builder. IndexedDB and Firestore interactions
 * are covered by the stub layer.
 */
import { cachedQuery } from '../core/data-cache.js';

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
function assert(v, hint = '') {
  if (!v) throw new Error(`assertion failed ${hint}`);
}

// ── cachedQuery builder ──

test('cachedQuery builds spec with collection name', () => {
  const spec = cachedQuery('orders').build();
  assertEq(spec.collection, 'orders');
});

test('cachedQuery builds descriptors for where/orderBy/limit', () => {
  const spec = cachedQuery('orders')
    .where('stage', '==', 'shipping')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .build();

  assertEq(spec.collection, 'orders');
  assertEq(spec.descriptors.length, 3);
  assertEq(spec.descriptors[0][0], 'where');
  assertEq(spec.descriptors[0][1], 'stage');
  assertEq(spec.descriptors[0][2], '==');
  assertEq(spec.descriptors[0][3], 'shipping');
  assertEq(spec.descriptors[1][0], 'orderBy');
  assertEq(spec.descriptors[1][1], 'createdAt');
  assertEq(spec.descriptors[1][2], 'desc');
  assertEq(spec.descriptors[2][0], 'limit');
  assertEq(spec.descriptors[2][1], '50');
});

test('cachedQuery produces firestoreConstraints array', () => {
  const spec = cachedQuery('clients')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .build();

  assert(Array.isArray(spec.firestoreConstraints), 'constraints should be array');
  assertEq(spec.firestoreConstraints.length, 2);
});

test('cachedQuery with no constraints builds valid spec', () => {
  const spec = cachedQuery('wallets').build();
  assertEq(spec.collection, 'wallets');
  assertEq(spec.descriptors.length, 0);
  assertEq(spec.firestoreConstraints.length, 0);
});

test('different queries produce different descriptor sets', () => {
  const s1 = cachedQuery('orders')
    .where('stage', '==', 'shipping')
    .limit(50)
    .build();
  const s2 = cachedQuery('orders')
    .where('stage', '==', 'design')
    .limit(50)
    .build();

  const k1 = JSON.stringify(s1.descriptors);
  const k2 = JSON.stringify(s2.descriptors);
  assert(k1 !== k2, 'different where values should produce different keys');
});

test('same query params produce identical descriptor sets', () => {
  const s1 = cachedQuery('orders')
    .where('stage', '==', 'shipping')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .build();
  const s2 = cachedQuery('orders')
    .where('stage', '==', 'shipping')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .build();

  const k1 = JSON.stringify(s1.descriptors);
  const k2 = JSON.stringify(s2.descriptors);
  assertEq(k1, k2);
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
