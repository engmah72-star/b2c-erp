/**
 * Tests for text-select.js (double-click → select full cell text)
 * Run: node tests/features-text-select.test.mjs
 *
 * shouldSelectElement is pure (no DOM) — fully testable via mock elements.
 * The DOM listener is guarded behind `typeof document` so importing here
 * does not require a browser.
 */
import { shouldSelectElement } from '../text-select.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// mock element factory
const el = (over = {}) => ({
  nodeType: 1, tagName: 'TD', isContentEditable: false,
  closest: () => null, textContent: 'hello', ...over,
});

// ── حالات يجب أن تُحدَّد ──────────────────────────────────────────
test('table cell with text → true', () => {
  assertEq(shouldSelectElement(el({ tagName: 'TD' })), true);
});
test('div cell with text → true', () => {
  assertEq(shouldSelectElement(el({ tagName: 'DIV' })), true);
});
test('span with text → true', () => {
  assertEq(shouldSelectElement(el({ tagName: 'SPAN' })), true);
});

// ── حالات يجب تجاهلها ────────────────────────────────────────────
test('null/undefined → false', () => {
  assertEq(shouldSelectElement(null), false);
  assertEq(shouldSelectElement(undefined), false);
});
test('text node (nodeType 3) → false', () => {
  assertEq(shouldSelectElement(el({ nodeType: 3 })), false);
});
test('interactive tags → false', () => {
  ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'OPTION', 'LABEL', 'IMG'].forEach(t => {
    assertEq(shouldSelectElement(el({ tagName: t })), false, `tag=${t}`);
  });
});
test('contentEditable element → false', () => {
  assertEq(shouldSelectElement(el({ isContentEditable: true })), false);
});
test('inside contentEditable/input (closest hit) → false', () => {
  assertEq(shouldSelectElement(el({ closest: () => ({}) })), false);
});
test('empty / whitespace-only text → false', () => {
  assertEq(shouldSelectElement(el({ textContent: '' })), false);
  assertEq(shouldSelectElement(el({ textContent: '   \n ' })), false);
});
test('missing tagName but has text → true (defensive)', () => {
  assertEq(shouldSelectElement(el({ tagName: undefined })), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
