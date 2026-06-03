/**
 * Parity contract: the new <app-sidebar> nav model (core/sidebar-model.js)
 * MUST produce the exact same link list (same order) as the legacy sidebar.js
 * build() for every role + edge case. لا يجوز ترحيل أي صفحة قبل أن يمر هذا.
 *
 * Run: node tests/app-sidebar-parity.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getRoleDefaultPermissions, ROLE_PAGES } from '../core/permissions-matrix.js';
import { computeNavModel } from '../core/sidebar-model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`mismatch ${hint}\n   legacy: ${b}\n   model:  ${a}`);
}

// ── minimal DOM/window shim to run the legacy plain-scripts ──
function classList() {
  const s = new Set();
  return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c),
    toggle: (c, f) => { const h = s.has(c); const w = f === undefined ? !h : !!f; w ? s.add(c) : s.delete(c); return w; } };
}
function makeEnv({ search = '' } = {}) {
  const store = {};
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const navEl = { innerHTML: '' };
  const els = { 'nav-links': navEl };
  const mkEl = () => ({ setAttribute() {}, addEventListener() {}, appendChild() {}, classList: classList(), style: {}, id: '' });
  const document = {
    readyState: 'complete', documentElement: { classList: classList() },
    body: { classList: classList(), appendChild() {} }, head: { appendChild() {} },
    getElementById: id => (id in els ? els[id] : null),
    querySelector: () => null, querySelectorAll: () => [], createElement: mkEl, addEventListener() {},
  };
  const window = {};
  window.self = window; window.top = window;
  return { window, document, location: { pathname: '/order.html', search, href: '' }, localStorage, navEl };
}
function loadScript(rel, env) {
  const fn = new Function('window', 'document', 'location', 'localStorage', readFileSync(join(ROOT, rel), 'utf8'));
  fn(env.window, env.document, env.location, env.localStorage);
}

// Legacy link list (the contract reference).
function legacyHrefs(role, { search = '', permissions } = {}) {
  const env = makeEnv({ search });
  env.window.ROLE_PAGES = ROLE_PAGES;            // mirror sidebar-mount exposing it in prod
  loadScript('sidebar-config.js', env);
  loadScript('sidebar.js', env);
  const perms = permissions !== undefined ? permissions : getRoleDefaultPermissions(role);
  env.window.B2CSidebar.build({ role, permissions: perms }, 'order.html');
  return [...env.navEl.innerHTML.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
}

// New model link list.
function modelFiles(role, { search = '', permissions, opsAdminPages = false } = {}) {
  const env = makeEnv({ search });
  loadScript('sidebar-config.js', env);          // populate window.SIDEBAR_PAGES/ROLE_HOME/GROUP_LABELS
  const perms = permissions !== undefined ? permissions : getRoleDefaultPermissions(role);
  const model = computeNavModel({ role, permissions: perms }, 'order.html', {
    SIDEBAR_PAGES: env.window.SIDEBAR_PAGES, ROLE_HOME: env.window.ROLE_HOME,
    GROUP_LABELS: env.window.GROUP_LABELS, rolePages: ROLE_PAGES, opsAdminPages,
  });
  return model.items.filter(i => i.type === 'link').map(i => i.file);
}

const ROLES = ['admin', 'operation_manager', 'customer_service', 'graphic_designer',
  'design_operator', 'production_agent', 'shipping_officer', 'wallet_manager'];

for (const role of ROLES) {
  test(`parity: ${role} — identical link list & order`, () => {
    assertEq(JSON.stringify(modelFiles(role)), JSON.stringify(legacyHrefs(role)), `(role=${role})`);
  });
}

test('parity: operation_manager with kill switch feat.opsAdminPages=1', () => {
  assertEq(
    JSON.stringify(modelFiles('operation_manager', { search: '?feat.opsAdminPages=1', opsAdminPages: true })),
    JSON.stringify(legacyHrefs('operation_manager', { search: '?feat.opsAdminPages=1' })),
    '(ops + killswitch)');
});

test('parity: legacy user (no permissions.pages) → fallback to ROLE_PAGES', () => {
  assertEq(
    JSON.stringify(modelFiles('customer_service', { permissions: {} })),
    JSON.stringify(legacyHrefs('customer_service', { permissions: {} })),
    '(legacy user)');
});

test('parity: explicit empty pages [] respected (locked)', () => {
  assertEq(
    JSON.stringify(modelFiles('customer_service', { permissions: { pages: [] } })),
    JSON.stringify(legacyHrefs('customer_service', { permissions: { pages: [] } })),
    '(locked user)');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
