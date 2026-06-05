/**
 * Tests for core/env-config.js — منطق عزل بيانات التجارب (prod/test)
 * Run: node tests/core-env-config.test.mjs
 */
import { ENV_KEY, resolveEnv, testConfigUnset, pickConfig } from '../core/env-config.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

const PROD = { projectId: 'business2card-c041b' };
const PLACEHOLDER = { projectId: 'REPLACE_WITH_TEST_PROJECT_ID' };
const REAL_TEST = { projectId: 'business2card-test' };

// ── ENV_KEY ───────────────────────────────────────────────────────
test('ENV_KEY: stable storage key', () => {
  assertEq(ENV_KEY, 'b2c_env');
});

// ── resolveEnv: الإنتاج هو الافتراضي الصارم ─────────────────────────
test('resolveEnv: defaults to prod when no signal', () => {
  assertEq(resolveEnv(null, null), 'prod');
  assertEq(resolveEnv(undefined, undefined), 'prod');
});

test('resolveEnv: unknown url value falls back (not test)', () => {
  assertEq(resolveEnv('staging', null), 'prod');
  assertEq(resolveEnv('', null), 'prod');
});

test('resolveEnv: url ?env=test wins', () => {
  assertEq(resolveEnv('test', null), 'test');
});

test('resolveEnv: url ?env=prod wins even over stored test', () => {
  assertEq(resolveEnv('prod', 'test'), 'prod');
});

test('resolveEnv: stored test applies when no url signal', () => {
  assertEq(resolveEnv(null, 'test'), 'test');
});

test('resolveEnv: stored prod stays prod', () => {
  assertEq(resolveEnv(null, 'prod'), 'prod');
});

// ── testConfigUnset: fail-closed detection ─────────────────────────
test('testConfigUnset: placeholder is unset', () => {
  assertEq(testConfigUnset(PLACEHOLDER, PROD.projectId), true);
});

test('testConfigUnset: null / missing projectId is unset', () => {
  assertEq(testConfigUnset(null, PROD.projectId), true);
  assertEq(testConfigUnset({}, PROD.projectId), true);
});

test('testConfigUnset: matching prod projectId is unset (not isolation)', () => {
  assertEq(testConfigUnset({ projectId: 'business2card-c041b' }, PROD.projectId), true);
});

test('testConfigUnset: a real distinct test project is configured', () => {
  assertEq(testConfigUnset(REAL_TEST, PROD.projectId), false);
});

// ── pickConfig ─────────────────────────────────────────────────────
test('pickConfig: prod env -> prod config', () => {
  assertEq(pickConfig('prod', PROD, REAL_TEST), PROD);
});

test('pickConfig: test env -> test config', () => {
  assertEq(pickConfig('test', PROD, REAL_TEST), REAL_TEST);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
