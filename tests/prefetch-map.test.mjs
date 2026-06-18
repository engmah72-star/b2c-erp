/**
 * Tests for core/prefetch-map.js
 * Run: node --loader ./tests/_loaders/hooks.mjs tests/prefetch-map.test.mjs
 */
import { prefetchForPage } from '../core/prefetch-map.js';

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
function assert(v, hint = '') {
  if (!v) throw new Error(`assertion failed ${hint}`);
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── prefetchForPage existence ──

test('prefetchForPage is a function', () => {
  assertEq(typeof prefetchForPage, 'function');
});

test('prefetchForPage does not throw for unknown page', () => {
  prefetchForPage('unknown-page.html');
  prefetchForPage('');
  prefetchForPage(null);
});

test('prefetchForPage does not throw for known pages', () => {
  const pages = [
    'shipping.html', 'production.html', 'print.html',
    'design.html', 'clients.html', 'accounts.html',
    'returns.html', 'suppliers.html', 'approvals.html',
    'order-rail.html', 'employees.html',
  ];
  for (const page of pages) {
    prefetchForPage(page);
  }
});

test('prefetchForPage handles URLs with query strings', () => {
  prefetchForPage('shipping.html?id=123&tab=details');
  prefetchForPage('production.html?embed=1');
});

test('prefetchForPage handles URLs with path prefix', () => {
  prefetchForPage('/app/shipping.html');
  prefetchForPage('https://example.com/erp/production.html?v=1');
});

test('global hook skipped in non-browser env (window undefined)', () => {
  assertEq(typeof globalThis.__prefetchForPage, 'undefined');
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
