/**
 * Node-runnable tests for core/data-cache.js
 * Run: node --loader ./tests/_loaders/hooks.mjs tests/core-data-cache.test.mjs
 *
 * Pure logic tests — validates serialization, query key generation,
 * the cachedQuery builder, data state tracking, and stats.
 */
import { cachedQuery, dataCache, collectionRegistry } from '../core/data-cache.js';

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

test('cachedQuery supports where with in operator for arrays', () => {
  const spec = cachedQuery('orders')
    .where('stage', 'in', ['production', 'shipping'])
    .limit(1000)
    .build();

  assertEq(spec.collection, 'orders');
  assertEq(spec.descriptors.length, 2);
  assertEq(spec.descriptors[0][0], 'where');
  assertEq(spec.descriptors[0][1], 'stage');
  assertEq(spec.descriptors[0][2], 'in');
  assertEq(spec.descriptors[0][3], 'production,shipping');
  assertEq(spec.descriptors[1][0], 'limit');
  assertEq(spec.descriptors[1][1], '1000');
});

test('cachedQuery with in produces different key than == query', () => {
  const s1 = cachedQuery('orders')
    .where('stage', 'in', ['production', 'shipping'])
    .build();
  const s2 = cachedQuery('orders')
    .where('stage', '==', 'production')
    .build();

  const k1 = JSON.stringify(s1.descriptors);
  const k2 = JSON.stringify(s2.descriptors);
  assert(k1 !== k2, 'in vs == should produce different keys');
});
// ── dataCache API existence ──

test('dataCache exports required methods', () => {
  assert(typeof dataCache.getDoc === 'function', 'getDoc');
  assert(typeof dataCache.subscribe === 'function', 'subscribe');
  assert(typeof dataCache.lazyLoad === 'function', 'lazyLoad');
  assert(typeof dataCache.invalidateDoc === 'function', 'invalidateDoc');
  assert(typeof dataCache.invalidateCollection === 'function', 'invalidateCollection');
  assert(typeof dataCache.clearAll === 'function', 'clearAll');
  assert(typeof dataCache.unsubscribeAll === 'function', 'unsubscribeAll');
  assert(typeof dataCache.getStats === 'function', 'getStats');
  assert(typeof dataCache.getQueryState === 'function', 'getQueryState');
  assert(typeof dataCache.getAllQueryStates === 'function', 'getAllQueryStates');
  assert(typeof dataCache.evictStaleEntries === 'function', 'evictStaleEntries');
  assert(typeof dataCache.enforceIDBLimit === 'function', 'enforceIDBLimit');
});

// ── Stats structure ──

test('getStats returns expected fields', () => {
  const stats = dataCache.getStats();
  assert('cacheHits' in stats, 'cacheHits');
  assert('cacheMisses' in stats, 'cacheMisses');
  assert('serverSyncs' in stats, 'serverSyncs');
  assert('activeListeners' in stats, 'activeListeners');
  assert('dedupSaves' in stats, 'dedupSaves');
  assert('evictions' in stats, 'evictions');
  assert('memoryCacheSize' in stats, 'memoryCacheSize');
  assert('pendingReads' in stats, 'pendingReads');
  assert('registry' in stats, 'registry');
});

// ── Query state ──

test('getQueryState returns idle for unknown query', () => {
  const state = dataCache.getQueryState('nonexistent', []);
  assertEq(state.state, 'idle');
});

test('getAllQueryStates returns object', () => {
  const states = dataCache.getAllQueryStates();
  assert(typeof states === 'object');
});

// ── collectionRegistry re-export ──

test('collectionRegistry is re-exported from data-cache', () => {
  assert(collectionRegistry !== null);
  assert(typeof collectionRegistry.markSynced === 'function');
  assert(typeof collectionRegistry.getSummary === 'function');
});

// ── activeListenerCount ──

test('activeListenerCount starts at 0', () => {
  assertEq(dataCache.activeListenerCount, 0);
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
