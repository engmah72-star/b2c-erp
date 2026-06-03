/**
 * Characterization tests for the (currently-running) sidebar permission layer.
 * Pins the behavior of `sidebar.js` (build/guard/isAllowed) reading the page
 * list + role landing map from `sidebar-config.js`.
 *
 * هدف الملف: تثبيت "اللي شغّال حالياً" كمرجع رسمي. لا يغيّر أي سلوك — أي تعديل
 * مستقبلي يخالف السلوك الحالي للسايد بار سيكسر هذه الـ tests فوراً.
 *
 * sidebar.js / sidebar-config.js عبارة عن IIFE plain-script تكتب على window
 * (ليست ES modules)، لذلك نحمّلها في بيئة DOM وهمية مصغّرة عبر new Function.
 *
 * Run: node tests/sidebar-permissions.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getRoleDefaultPermissions, ROLE_PAGES } from '../core/permissions-matrix.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assertHas(arr, item) {
  if (!arr.includes(item)) throw new Error(`expected list to include "${item}" — got [${arr.join(', ')}]`);
}
function assertHasNot(arr, item) {
  if (arr.includes(item)) throw new Error(`expected list to NOT include "${item}" — got [${arr.join(', ')}]`);
}

// ── Minimal DOM/window shim (fresh per scenario) ──────────────────
function classList() {
  const s = new Set();
  return {
    add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c),
    toggle: (c, f) => { const h = s.has(c); const w = f === undefined ? !h : !!f; w ? s.add(c) : s.delete(c); return w; },
  };
}
function makeEnv({ pathname = '/order.html', search = '' } = {}) {
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const navEl = { innerHTML: '' };
  const els = { 'nav-links': navEl };
  const mkEl = () => ({ setAttribute() {}, addEventListener() {}, appendChild() {}, classList: classList(), style: {}, id: '' });
  const document = {
    readyState: 'complete',
    documentElement: { classList: classList() },
    body: { classList: classList(), appendChild() {} },
    head: { appendChild() {} },
    getElementById: id => (id in els ? els[id] : null),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: mkEl,
    addEventListener() {},
  };
  const location = { pathname, search, href: '' };
  const window = {};
  return { window, document, location, localStorage, navEl };
}
function loadScript(rel, env) {
  const code = readFileSync(join(ROOT, rel), 'utf8');
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'document', 'location', 'localStorage', code);
  fn(env.window, env.document, env.location, env.localStorage);
}
// Build a fresh sidebar API bound to its own env + render the link list for a role.
function sidebarFor(role, { pathname = '/order.html', search = '' } = {}) {
  const env = makeEnv({ pathname, search });
  loadScript('sidebar-config.js', env);
  loadScript('sidebar.js', env);
  const userData = { role, permissions: getRoleDefaultPermissions(role) };
  return { env, api: env.window.B2CSidebar, userData };
}
function pagesFor(role, opts) {
  const { env, api, userData } = sidebarFor(role, opts);
  const cur = '/order.html'.split('/').pop();
  api.build(userData, cur);
  return [...env.navEl.innerHTML.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
}

const PUBLIC_PAGES = ['my-home.html', 'my-requests.html', 'my-profile.html', 'inbox.html'];
// صفحات الأدمن الإدارية الصرفة — admin فقط (operation_manager لا يراها بعد إصلاح #1).
const ADMIN_ONLY_PAGES = ['employees.html', 'role-viewer.html', 'report-bug.html', 'employee-control.html'];
// settings صفحة تشغيلية: يراها admin + operation_manager، وتُحجب عن باقي الأدوار.

// ══ build() — link visibility per role (pins current behavior) ════

test('build: every role sees the 4 public pages', () => {
  for (const role of ['admin', 'operation_manager', 'customer_service', 'graphic_designer',
    'design_operator', 'production_agent', 'shipping_officer', 'wallet_manager']) {
    const pages = pagesFor(role);
    PUBLIC_PAGES.forEach(p => assertHas(pages, p));
  }
});

test('build: admin sees admin-only management pages + settings', () => {
  const pages = pagesFor('admin');
  ADMIN_ONLY_PAGES.forEach(p => assertHas(pages, p));
  ['settings.html', 'accounts.html', 'reports.html', 'suppliers.html', 'products.html', 'approvals.html']
    .forEach(p => assertHas(pages, p));
});

// ── FINDING #1 — FIXED ──
// operation_manager no longer bypasses adminOnly. It loses the admin-management
// pages (employees/employee-control/role-viewer/report-bug) but KEEPS settings,
// which was reclassified as an operational (perm-based) page.
test('build: operation_manager does NOT see admin-management pages (finding #1 fixed)', () => {
  const pages = pagesFor('operation_manager');
  ADMIN_ONLY_PAGES.forEach(p => assertHasNot(pages, p));
});

test('build: operation_manager DOES keep settings (operational page)', () => {
  assertHas(pagesFor('operation_manager'), 'settings.html');
});

// ── Kill switch (reversible — RULE E1) ──
// feat.opsAdminPages=1 restores pre-fix behavior: ops sees adminOnly pages again.
test('build: kill switch feat.opsAdminPages=1 restores adminOnly pages for ops', () => {
  const pages = pagesFor('operation_manager', { search: '?feat.opsAdminPages=1' });
  ADMIN_ONLY_PAGES.forEach(p => assertHas(pages, p));
});

test('build: settings stays hidden from non-admin roles (e.g. customer_service)', () => {
  assertHasNot(pagesFor('customer_service'), 'settings.html');
});

test('build: customer_service sees clients/design, NOT admin pages', () => {
  const pages = pagesFor('customer_service');
  ['clients.html', 'design.html', 'designer-hub.html'].forEach(p => assertHas(pages, p));
  ['employees.html', 'settings.html', 'accounts.html', 'reports.html',
    'suppliers.html', 'production.html', 'shipping.html'].forEach(p => assertHasNot(pages, p));
});

test('build: graphic_designer sees design only (no clients/accounts/production)', () => {
  const pages = pagesFor('graphic_designer');
  ['design.html', 'designer-hub.html'].forEach(p => assertHas(pages, p));
  ['clients.html', 'accounts.html', 'production.html'].forEach(p => assertHasNot(pages, p));
});

test('build: design_operator mirrors graphic_designer page set', () => {
  assertEq(JSON.stringify(pagesFor('design_operator')), JSON.stringify(pagesFor('graphic_designer')));
});

test('build: production_agent sees production + supplier-requests only', () => {
  const pages = pagesFor('production_agent');
  ['production.html', 'supplier-requests.html'].forEach(p => assertHas(pages, p));
  ['clients.html', 'design.html', 'accounts.html', 'shipping.html'].forEach(p => assertHasNot(pages, p));
});

test('build: shipping_officer sees shipping + clients (via canViewClients)', () => {
  const pages = pagesFor('shipping_officer');
  ['shipping.html', 'shipping-accounts.html', 'clients.html'].forEach(p => assertHas(pages, p));
  ['design.html', 'accounts.html', 'production.html'].forEach(p => assertHasNot(pages, p));
});

test('build: wallet_manager sees accounts/reports + clients (via canViewClients)', () => {
  const pages = pagesFor('wallet_manager');
  ['accounts.html', 'reports.html', 'clients.html'].forEach(p => assertHas(pages, p));
  ['design.html', 'production.html', 'shipping.html', 'employees.html'].forEach(p => assertHasNot(pages, p));
});

// ══ guard() — page access redirect logic ═════════════════════════

test('guard: admin allowed on any page', () => {
  const { api, userData } = sidebarFor('admin', { pathname: '/employees.html' });
  assertEq(api.guard(userData, 'employees.html'), true);
});

test('guard: operation_manager denied on employees.html → redirect (finding #1 fixed)', () => {
  const { env, api, userData } = sidebarFor('operation_manager', { pathname: '/employees.html' });
  assertEq(api.guard(userData, 'employees.html'), false);
  assertEq(env.location.href, 'ops-dashboard.html', '(role landing page)');
});

test('guard: operation_manager still allowed on settings.html', () => {
  const { api, userData } = sidebarFor('operation_manager', { pathname: '/settings.html' });
  assertEq(api.guard(userData, 'settings.html'), true);
});

test('guard: kill switch feat.opsAdminPages=1 re-allows ops on employees.html', () => {
  const { api, userData } = sidebarFor('operation_manager', { pathname: '/employees.html', search: '?feat.opsAdminPages=1' });
  assertEq(api.guard(userData, 'employees.html'), true);
});

test('guard: customer_service denied on employees.html → redirect to role home', () => {
  const { env, api, userData } = sidebarFor('customer_service', { pathname: '/employees.html' });
  assertEq(api.guard(userData, 'employees.html'), false);
  assertEq(env.location.href, 'cs-dashboard.html', '(role landing page)');
});

test('guard: customer_service allowed on clients.html', () => {
  const { api, userData } = sidebarFor('customer_service', { pathname: '/clients.html' });
  assertEq(api.guard(userData, 'clients.html'), true);
});

test('guard: graphic_designer denied on accounts.html → redirect to designer-dashboard', () => {
  const { env, api, userData } = sidebarFor('graphic_designer', { pathname: '/accounts.html' });
  assertEq(api.guard(userData, 'accounts.html'), false);
  assertEq(env.location.href, 'designer-dashboard.html');
});

test('guard: page not present in sidebar config is NOT guarded (returns true)', () => {
  const { api, userData } = sidebarFor('customer_service', { pathname: '/some-utility.html' });
  assertEq(api.guard(userData, 'some-utility.html'), true);
});

test('guard: missing userData → true (no guard before auth resolves)', () => {
  const { api } = sidebarFor('customer_service');
  assertEq(api.guard(null, 'employees.html'), true);
});

// ══ Legacy-user fallback (finding #3) ════════════════════════════
// permissions.pages مفقودة → fallback على ROLE_PAGES (window). مصفوفة
// فارغة [] تُحترم كقفل مقصود.
function buildWith(role, permissions, { exposeRolePages = true } = {}) {
  const env = makeEnv({ pathname: '/order.html' });
  loadScript('sidebar-config.js', env);
  loadScript('sidebar.js', env);
  if (exposeRolePages) env.window.ROLE_PAGES = ROLE_PAGES;
  env.window.B2CSidebar.build({ role, permissions }, 'order.html');
  return [...env.navEl.innerHTML.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
}
function guardWith(role, permissions, page) {
  const env = makeEnv({ pathname: '/' + page });
  loadScript('sidebar-config.js', env);
  loadScript('sidebar.js', env);
  env.window.ROLE_PAGES = ROLE_PAGES;
  return { result: env.window.B2CSidebar.guard({ role, permissions }, page), env };
}

test('build: legacy user with NO permissions.pages → falls back to role defaults', () => {
  const pages = buildWith('customer_service', {});  // no pages key
  assertHas(pages, 'clients.html');
  assertHas(pages, 'design.html');
});

test('build: explicit empty pages [] is respected (locked, not re-granted)', () => {
  const pages = buildWith('customer_service', { pages: [] });
  assertHasNot(pages, 'clients.html');
  assertHasNot(pages, 'design.html');
  assertHas(pages, 'inbox.html'); // public pages still visible
});

test('build: missing pages + ROLE_PAGES unavailable → no regression (public only)', () => {
  const pages = buildWith('customer_service', {}, { exposeRolePages: false });
  assertHasNot(pages, 'clients.html');
  assertHas(pages, 'inbox.html');
});

test('guard: legacy user (no pages) allowed on a role-default page via fallback', () => {
  assertEq(guardWith('customer_service', {}, 'clients.html').result, true);
});

test('guard: legacy user (no pages) denied on a non-default page', () => {
  const { result, env } = guardWith('customer_service', {}, 'accounts.html');
  assertEq(result, false);
  assertEq(env.location.href, 'cs-dashboard.html');
});

// ══ Accessibility (finding #6) ═══════════════════════════════════
test('build: decorative nav-ico emoji are aria-hidden', () => {
  const { env, api, userData } = sidebarFor('admin');
  api.build(userData, 'order.html');
  const icos = [...env.navEl.innerHTML.matchAll(/<span class="nav-ico"([^>]*)>/g)];
  if (!icos.length) throw new Error('no nav-ico spans rendered');
  icos.forEach(m => {
    if (!/aria-hidden="true"/.test(m[1])) {
      throw new Error('nav-ico missing aria-hidden: <span class="nav-ico"' + m[1] + '>');
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
