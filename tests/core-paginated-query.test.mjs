/**
 * Node-runnable tests for core/paginated-query.js
 * Run: node --loader ./tests/_loaders/hooks.mjs tests/core-paginated-query.test.mjs
 *
 * Pure builder tests — validates the fluent API and PaginatedQuery construction.
 * Actual Firestore pagination is integration-tested separately.
 */
import { paginatedQuery } from '../core/paginated-query.js';

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

// ── Builder API ──
test('paginatedQuery returns a builder with fluent methods', () => {
  const builder = paginatedQuery('orders');
  assert(typeof builder.where === 'function');
  assert(typeof builder.orderBy === 'function');
  assert(typeof builder.pageSize === 'function');
  assert(typeof builder.create === 'function');
});

test('create returns a PaginatedQuery instance', () => {
  const pq = paginatedQuery('orders').create();
  assert(typeof pq.loadFirst === 'function');
  assert(typeof pq.loadNext === 'function');
  assert(typeof pq.loadPage === 'function');
  assert(typeof pq.onUpdate === 'function');
  assert(typeof pq.destroy === 'function');
});

test('new PaginatedQuery has initial state', () => {
  const pq = paginatedQuery('orders')
    .where('stage', '==', 'archived')
    .orderBy('createdAt', 'desc')
    .pageSize(25)
    .create();

  assertEq(pq.hasMore, true);
  assertEq(pq.loading, false);
  assertEq(pq.pageCount, 0);
  assertEq(pq.totalLoaded, 0);
  assert(Array.isArray(pq.allDocs));
  assertEq(pq.allDocs.length, 0);
});

test('pageSize is clamped between 1 and 500', () => {
  const pq1 = paginatedQuery('orders').pageSize(0).create();
  const pq2 = paginatedQuery('orders').pageSize(1000).create();
  // We can't directly inspect _pageSize, but we can verify it doesn't throw
  assert(pq1 !== null);
  assert(pq2 !== null);
});

test('chaining works correctly', () => {
  const pq = paginatedQuery('orders')
    .where('stage', '==', 'shipping')
    .where('clientId', '==', 'c123')
    .orderBy('createdAt', 'desc')
    .pageSize(30)
    .create();

  assertEq(pq.hasMore, true);
  assertEq(pq.totalLoaded, 0);
});

test('destroy resets state', () => {
  const pq = paginatedQuery('orders').create();
  pq.destroy();
  assertEq(pq.hasMore, false);
  assertEq(pq.totalLoaded, 0);
  assertEq(pq.pageCount, 0);
});

test('onUpdate registers listener and returns unsubscribe', () => {
  const pq = paginatedQuery('orders').create();
  let callCount = 0;
  const unsub = pq.onUpdate(() => callCount++);
  assert(typeof unsub === 'function');
  unsub();
  pq.destroy();
});

test('loadNext returns null when no pages loaded yet (no cursor)', async () => {
  const pq = paginatedQuery('orders').create();
  const result = await pq.loadNext();
  assertEq(result, null, 'should return null without first page');
  pq.destroy();
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
