/**
 * Regression guard for "السايد بار مش بيفتح" (sidebar won't open) bugs.
 *
 * أي صفحة بترسم <aside class="sidenav"> لازم تقدر تشغّل القائمة فعلياً:
 *   - تحمّل sidebar.js  → window.toggleNav + window.B2CSidebar، أو
 *   - تعرّف window.toggleNav inline.
 * غير كده، زرّ ☰ على الموبايل ما يفتحش الدرج، والسايد بار ما يتبنيش.
 *
 * كمان: ممنوع استدعاء toggle function غير معرّفة في أي مكان (toggleMobMenu
 * كان متنادى في shipping.html بدون تعريف).
 *
 * Run: node tests/sidebar-wiring.test.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}

const htmlFiles = readdirSync(ROOT).filter(f => f.endsWith('.html'));

test('every .sidenav page has a toggleNav source (sidebar.js or inline)', () => {
  const offenders = [];
  for (const f of htmlFiles) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    if (!/class="sidenav"/.test(src)) continue;
    const loadsSidebarJs = /src="\.?\/?sidebar\.js(\?[^"]*)?"/.test(src);
    const inlineToggle = /window\.toggleNav\s*=|function\s+toggleNav/.test(src);
    if (!loadsSidebarJs && !inlineToggle) offenders.push(f);
  }
  if (offenders.length) {
    throw new Error('pages with .sidenav but no toggleNav source: ' + offenders.join(', '));
  }
});

test('no page calls the undefined toggleMobMenu()', () => {
  const offenders = [];
  for (const f of htmlFiles) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    // call site without a definition in the same file
    if (/toggleMobMenu\s*\(/.test(src) && !/function\s+toggleMobMenu|toggleMobMenu\s*=/.test(src)) {
      offenders.push(f);
    }
  }
  if (offenders.length) {
    throw new Error('pages calling undefined toggleMobMenu(): ' + offenders.join(', '));
  }
});

test('the three reported pages load sidebar.js', () => {
  for (const f of ['designer-hub.html', 'shipping.html']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    if (!/src="\.?\/?sidebar\.js(\?[^"]*)?"/.test(src)) {
      throw new Error(`${f} must load sidebar.js`);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
