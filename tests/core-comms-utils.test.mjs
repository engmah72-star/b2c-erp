/**
 * Tests for core/comms-utils.js
 * Run: node tests/core-comms-utils.test.mjs
 */
import { cleanPhone, waLink, telLink } from '../core/comms-utils.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── cleanPhone ─────────────────────────────────────────────────────
test('cleanPhone: empty / null → ""', () => {
  assertEq(cleanPhone(''), '');
  assertEq(cleanPhone(null), '');
  assertEq(cleanPhone(undefined), '');
});
test('cleanPhone: local 0-prefixed → 20…', () => {
  assertEq(cleanPhone('01012345678'), '201012345678');
});
test('cleanPhone: already 20… → unchanged', () => {
  assertEq(cleanPhone('201012345678'), '201012345678');
});
test('cleanPhone: 00 international prefix stripped', () => {
  assertEq(cleanPhone('00201012345678'), '201012345678');
});
test('cleanPhone: bare 10-digit starting 1 → prefix 20', () => {
  assertEq(cleanPhone('1012345678'), '201012345678');
});
test('cleanPhone: strips separators/spaces', () => {
  assertEq(cleanPhone('010-1234 5678'), '201012345678');
});
test('cleanPhone: too short → ""', () => {
  assertEq(cleanPhone('12345'), '');
});

// ── waLink ─────────────────────────────────────────────────────────
test('waLink: builds wa.me from normalized number', () => {
  assertEq(waLink('01012345678'), 'https://wa.me/201012345678');
});
test('waLink: empty when not normalizable', () => {
  assertEq(waLink('123'), '');
  assertEq(waLink(''), '');
});

// ── telLink ────────────────────────────────────────────────────────
test('telLink: keeps digits and +, strips the rest', () => {
  assertEq(telLink('+20 (010) 1234-5678'), 'tel:+2001012345678');
});
test('telLink: empty → ""', () => {
  assertEq(telLink(''), '');
  assertEq(telLink(null), '');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
