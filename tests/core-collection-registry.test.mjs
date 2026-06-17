/**
 * Node-runnable tests for core/collection-registry.js
 * Run: node --loader ./tests/_loaders/hooks.mjs tests/core-collection-registry.test.mjs
 */
import { collectionRegistry, DATA_STATE } from '../core/collection-registry.js';

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

// Reset between tests
function reset() { collectionRegistry.clear(); }

// ── DATA_STATE constants ──
test('DATA_STATE has all expected values', () => {
  assertEq(DATA_STATE.IDLE, 'idle');
  assertEq(DATA_STATE.LOADING, 'loading');
  assertEq(DATA_STATE.SYNCED, 'synced');
  assertEq(DATA_STATE.STALE, 'stale');
  assertEq(DATA_STATE.ERROR, 'error');
});

// ── Basic registration ──
test('get returns null for unregistered collection', () => {
  reset();
  assertEq(collectionRegistry.get('unknown'), null);
});

test('markLoading sets state to loading', () => {
  reset();
  collectionRegistry.markLoading('orders');
  const meta = collectionRegistry.get('orders');
  assertEq(meta.state, DATA_STATE.LOADING);
  assertEq(meta.name, 'orders');
});

test('markSynced updates state and docCount', () => {
  reset();
  collectionRegistry.markSynced('clients', 150, 45);
  const meta = collectionRegistry.get('clients');
  assertEq(meta.state, DATA_STATE.SYNCED);
  assertEq(meta.docCount, 150);
  assertEq(meta.estimatedSizeKB, 45);
  assert(meta.lastSyncAt > 0, 'lastSyncAt should be set');
  assertEq(meta.syncCount, 1);
});

test('markSynced increments syncCount', () => {
  reset();
  collectionRegistry.markSynced('orders', 10);
  collectionRegistry.markSynced('orders', 12);
  collectionRegistry.markSynced('orders', 15);
  assertEq(collectionRegistry.get('orders').syncCount, 3);
});

test('markStale sets state to stale', () => {
  reset();
  collectionRegistry.markSynced('orders', 10);
  collectionRegistry.markStale('orders');
  assertEq(collectionRegistry.get('orders').state, DATA_STATE.STALE);
});

test('markError records error message', () => {
  reset();
  collectionRegistry.markError('wallets', 'permission denied');
  const meta = collectionRegistry.get('wallets');
  assertEq(meta.state, DATA_STATE.ERROR);
  assertEq(meta.lastError, 'permission denied');
});

test('markError accepts Error objects', () => {
  reset();
  collectionRegistry.markError('wallets', new Error('network timeout'));
  assertEq(collectionRegistry.get('wallets').lastError, 'network timeout');
});

// ── Subscriber tracking ──
test('addSubscriber/removeSubscriber tracks count', () => {
  reset();
  collectionRegistry.markLoading('orders');
  collectionRegistry.addSubscriber('orders');
  collectionRegistry.addSubscriber('orders');
  assertEq(collectionRegistry.get('orders').subscriberCount, 2);
  collectionRegistry.removeSubscriber('orders');
  assertEq(collectionRegistry.get('orders').subscriberCount, 1);
});

test('removeSubscriber does not go below 0', () => {
  reset();
  collectionRegistry.markLoading('orders');
  collectionRegistry.removeSubscriber('orders');
  assertEq(collectionRegistry.get('orders').subscriberCount, 0);
});

// ── State queries ──
test('isSynced returns true only when synced', () => {
  reset();
  assert(!collectionRegistry.isSynced('orders'));
  collectionRegistry.markLoading('orders');
  assert(!collectionRegistry.isSynced('orders'));
  collectionRegistry.markSynced('orders', 5);
  assert(collectionRegistry.isSynced('orders'));
});

test('needsRefresh returns true for idle/stale/error', () => {
  reset();
  assert(collectionRegistry.needsRefresh('orders'), 'idle → needs refresh');
  collectionRegistry.markStale('orders');
  assert(collectionRegistry.needsRefresh('orders'), 'stale → needs refresh');
  collectionRegistry.markError('orders', 'err');
  assert(collectionRegistry.needsRefresh('orders'), 'error → needs refresh');
  collectionRegistry.markSynced('orders', 10);
  assert(!collectionRegistry.needsRefresh('orders'), 'synced → no refresh');
});

test('needsRefresh with maxAge detects expired', () => {
  reset();
  collectionRegistry.markSynced('orders', 10);
  const meta = collectionRegistry.get('orders');
  meta.lastSyncAt = Date.now() - 60001;
  assert(collectionRegistry.needsRefresh('orders', 60000), 'expired → needs refresh');
});

// ── getAll / getSummary ──
test('getAll returns all registered collections', () => {
  reset();
  collectionRegistry.markSynced('orders', 10);
  collectionRegistry.markSynced('clients', 20);
  collectionRegistry.markLoading('wallets');
  assertEq(collectionRegistry.getAll().length, 3);
});

test('getSummary aggregates correctly', () => {
  reset();
  collectionRegistry.markSynced('orders', 100, 50);
  collectionRegistry.markSynced('clients', 200, 30);
  collectionRegistry.markLoading('wallets');
  collectionRegistry.markError('tasks', 'err');
  const summary = collectionRegistry.getSummary();
  assertEq(summary.totalCollections, 4);
  assertEq(summary.synced, 2);
  assertEq(summary.loading, 1);
  assertEq(summary.errors, 1);
  assertEq(summary.totalDocs, 300);
  assertEq(summary.totalSizeKB, 80);
});

// ── State change listeners ──
test('onStateChange fires on update', () => {
  reset();
  let fired = false;
  const unsub = collectionRegistry.onStateChange('orders', (meta) => {
    fired = true;
    assertEq(meta.state, DATA_STATE.SYNCED);
  });
  collectionRegistry.markSynced('orders', 5);
  assert(fired, 'listener should have fired');
  unsub();
});

test('onStateChange with * fires for any collection', () => {
  reset();
  const names = [];
  const unsub = collectionRegistry.onStateChange('*', (meta) => {
    names.push(meta.name);
  });
  collectionRegistry.markSynced('orders', 5);
  collectionRegistry.markSynced('clients', 10);
  assertEq(names.length, 2);
  assertEq(names[0], 'orders');
  assertEq(names[1], 'clients');
  unsub();
});

test('unsubscribe stops notifications', () => {
  reset();
  let count = 0;
  const unsub = collectionRegistry.onStateChange('orders', () => count++);
  collectionRegistry.markLoading('orders');
  assertEq(count, 1);
  unsub();
  collectionRegistry.markSynced('orders', 5);
  assertEq(count, 1, 'should not fire after unsub');
});

// ── touch ──
test('touch updates lastAccessAt', () => {
  reset();
  collectionRegistry.markSynced('orders', 10);
  const before = collectionRegistry.get('orders').lastAccessAt;
  collectionRegistry.touch('orders');
  assert(collectionRegistry.get('orders').lastAccessAt >= before);
});

// ── clear ──
test('clear removes all entries', () => {
  reset();
  collectionRegistry.markSynced('orders', 10);
  collectionRegistry.markSynced('clients', 20);
  collectionRegistry.clear();
  assertEq(collectionRegistry.getAll().length, 0);
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
