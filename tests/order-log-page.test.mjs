/**
 * Tests — order-log.html (صفحة سجل النشاط)
 *
 * يتحقق من:
 *   - وجود الصفحة في SIDEBAR_PAGES بالحقول الصحيحة
 *   - تضمين sidebar.js + viewas.js داخل الصفحة (متطلبات PR Quality Gate)
 *   - أن الصفحة لا تحتوي على onSnapshot بدون limit() (RULE G3)
 *   - أن الأدوار المصرَّح لها (admin/ops) ترى الصفحة في السايدبار
 *   - أن الأدوار الأخرى لا ترى الصفحة (لا perm: order-rail)
 *
 * Run: node tests/order-log-page.test.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getRoleDefaultPermissions, ROLE_PAGES } from '../core/permissions-matrix.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg = '') { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── شِم DOM/window مصغّر (مطابق لما في sidebar-permissions.test.mjs) ──
function classList() {
  const s = new Set();
  return {
    add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c),
    toggle: (c, f) => { const h = s.has(c); const w = f === undefined ? !h : !!f; w ? s.add(c) : s.delete(c); return w; },
  };
}
function makeEnv() {
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
  const window = {};
  window.self = window;
  window.top = window;
  return { window, document, location: { pathname: '/order-log.html', search: '', href: '' }, localStorage, navEl };
}
function loadScript(rel, env) {
  const code = readFileSync(join(ROOT, rel), 'utf8');
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'document', 'location', 'localStorage', code);
  fn(env.window, env.document, env.location, env.localStorage);
}
function pagesFor(role) {
  const env = makeEnv();
  env.window.ROLE_PAGES = ROLE_PAGES;
  loadScript('sidebar-config.js', env);
  loadScript('sidebar.js', env);
  const perms = getRoleDefaultPermissions(role);
  env.window.B2CSidebar.build({ role, permissions: perms }, 'order-log.html');
  return [...env.navEl.innerHTML.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
}

const PAGE_SRC = existsSync(join(ROOT, 'order-log.html'))
  ? readFileSync(join(ROOT, 'order-log.html'), 'utf8')
  : '';

// ── وجود الملف ──
test('order-log.html موجود في الريبو', () => {
  assert(existsSync(join(ROOT, 'order-log.html')), 'order-log.html غير موجود');
});

// ── بنية الصفحة ──
test('order-log.html تحمّل sidebar.js', () => {
  assert(/src="\.?\/?sidebar\.js(\?[^"]*)?"/.test(PAGE_SRC), 'sidebar.js مفقود');
});

test('order-log.html تحمّل viewas.js (اشتراط PR Quality Gate)', () => {
  assert(/viewas\.js/.test(PAGE_SRC), 'viewas.js مفقود — مطلوب لـ impersonation banner');
});

test('order-log.html لا تحتوي على onSnapshot بدون limit() (RULE G3)', () => {
  /* نحسب استدعاءات حقيقية فقط (onSnapshot مع قوس) — لا import declarations */
  const snapshots = (PAGE_SRC.match(/\bonSnapshot\s*\(/g) || []).length;
  const limits    = (PAGE_SRC.match(/\blimit\s*\(/g) || []).length;
  assert(
    snapshots === 0 || limits >= snapshots,
    `onSnapshot (${snapshots}) > limit() (${limits}) — قد يكون الـ listener غير مُقيَّد`
  );
});

test('order-log.html تحمّل sidebar-config.js', () => {
  assert(/sidebar-config\.js/.test(PAGE_SRC), 'sidebar-config.js مفقود');
});

// ── sidebar-config.js: وجود الإدخال بالحقول الصحيحة ──
test('sidebar-config.js يحتوي على إدخال order-log.html', () => {
  const cfg = readFileSync(join(ROOT, 'sidebar-config.js'), 'utf8');
  assert(/file\s*:\s*['"]order-log\.html['"]/.test(cfg), 'إدخال order-log.html مفقود من sidebar-config.js');
});

test('إدخال order-log.html له perm: order-rail (مطابق للأذونات المتوقعة)', () => {
  const env = makeEnv();
  loadScript('sidebar-config.js', env);
  const pages = env.window.SIDEBAR_PAGES || [];
  const entry = pages.find(p => p.file === 'order-log.html');
  assert(entry, 'order-log.html غير موجود في SIDEBAR_PAGES');
  assertEq(entry.perm, 'order-rail', 'perm غير صحيح');
  assert(entry.group === 'orders', `group يجب أن يكون 'orders' (وجد: ${entry.group})`);
});

// ── صلاحيات العرض في السايدبار ──
test('admin يرى order-log.html في السايدبار (pages:["*"])', () => {
  const pages = pagesFor('admin');
  assert(pages.includes('order-log.html'), 'admin لا يرى order-log.html');
});

test('operation_manager يرى order-log.html في السايدبار (pages:["*"])', () => {
  const pages = pagesFor('operation_manager');
  assert(pages.includes('order-log.html'), 'operation_manager لا يرى order-log.html');
});

test('graphic_designer لا يرى order-log.html (لا perm order-rail)', () => {
  const pages = pagesFor('graphic_designer');
  assert(!pages.includes('order-log.html'), 'graphic_designer يجب ألا يرى order-log.html');
});

test('production_agent لا يرى order-log.html (لا perm order-rail)', () => {
  const pages = pagesFor('production_agent');
  assert(!pages.includes('order-log.html'), 'production_agent يجب ألا يرى order-log.html');
});

test('shipping_officer لا يرى order-log.html (لا perm order-rail)', () => {
  const pages = pagesFor('shipping_officer');
  assert(!pages.includes('order-log.html'), 'shipping_officer يجب ألا يرى order-log.html');
});

// ── order-log يظهر بعد order-rail في السايدبار (ترتيب مقصود) ──
test('order-log.html يظهر بعد order-rail.html مباشرةً في SIDEBAR_PAGES', () => {
  const env = makeEnv();
  loadScript('sidebar-config.js', env);
  const pages = (env.window.SIDEBAR_PAGES || []).map(p => p.file);
  const iRail = pages.indexOf('order-rail.html');
  const iLog  = pages.indexOf('order-log.html');
  assert(iRail !== -1, 'order-rail.html غير موجود في SIDEBAR_PAGES');
  assert(iLog  !== -1, 'order-log.html غير موجود في SIDEBAR_PAGES');
  assertEq(iLog, iRail + 1, 'order-log.html يجب أن يكون مباشرةً بعد order-rail.html');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
