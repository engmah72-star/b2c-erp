/**
 * Node-runnable tests for scripts/seed-sample-client.js — pure logic only.
 * (The Firestore-backed seedSampleClient() path needs an emulator/admin SDK.)
 *
 * What we test:
 *   - validateClientPayload detects invalid payloads (name/phone/email/dup)
 *   - buildClientDoc produces the same system-field shape as addClient
 *   - SAMPLE_CLIENT is itself valid
 *
 * Run: node tests/seed-sample-client.test.mjs
 */

import {
  SAMPLE_CLIENT,
  validateClientPayload,
  buildClientDoc,
} from '../scripts/seed-sample-client.js';

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
function assert(cond, hint = '') {
  if (!cond) throw new Error(`assertion failed ${hint}`);
}

// ── validateClientPayload ──────────────────────────────────────────────

test('SAMPLE_CLIENT is valid', () => {
  assertEq(validateClientPayload(SAMPLE_CLIENT).ok, true);
});

test('missing name → invalid', () => {
  const r = validateClientPayload({ phone1: '01012345678' });
  assertEq(r.ok, false);
  assert(r.errors.some((e) => e.includes('اسم العميل مطلوب')), 'name error');
});

test('missing phone1 → invalid', () => {
  const r = validateClientPayload({ name: 'x' });
  assertEq(r.ok, false);
  assert(r.errors.some((e) => e.includes('الهاتف الأساسي مطلوب')), 'phone required error');
});

test('malformed phone1 → invalid', () => {
  const r = validateClientPayload({ name: 'x', phone1: '12345' });
  assertEq(r.ok, false);
  assert(r.errors.some((e) => e.includes('رقم الهاتف الأساسي غير صحيح')), 'phone format error');
});

test('malformed phone2 → invalid', () => {
  const r = validateClientPayload({ name: 'x', phone1: '01012345678', phone2: '999' });
  assertEq(r.ok, false);
  assert(r.errors.some((e) => e.includes('رقم الهاتف الثاني غير صحيح')), 'phone2 format error');
});

test('phone1 === phone2 → invalid', () => {
  const r = validateClientPayload({ name: 'x', phone1: '01012345678', phone2: '01012345678' });
  assertEq(r.ok, false);
  assert(r.errors.some((e) => e.includes('لا يصح أن يكونا متطابقين')), 'self-dup error');
});

test('malformed email → invalid; empty email → valid', () => {
  assertEq(validateClientPayload({ name: 'x', phone1: '01012345678', email: 'not-an-email' }).ok, false);
  assertEq(validateClientPayload({ name: 'x', phone1: '01012345678', email: '' }).ok, true);
});

test('all EG prefixes 010/011/012/015 accepted', () => {
  for (const pre of ['010', '011', '012', '015']) {
    assertEq(validateClientPayload({ name: 'x', phone1: `${pre}12345678` }).ok, true, pre);
  }
});

// ── buildClientDoc (must mirror addClient system fields) ────────────────

test('buildClientDoc sets system fields like addClient', () => {
  const doc = buildClientDoc(SAMPLE_CLIENT, { userId: 'u1', userName: 'Tester' });
  assertEq(doc.status, 'active');
  assertEq(doc.isDeleted, false);
  assertEq(doc.createdBy, 'u1');
  assertEq(doc.createdByName, 'Tester');
  assert(doc.createdAt != null && doc.updatedAt != null, 'timestamps set');
});

test('buildClientDoc normalizes email/phone/name (trim + lowercase email)', () => {
  const doc = buildClientDoc(
    { name: '  Sara  ', phone1: ' 01012345678 ', phone2: ' 01198765432 ', email: '  Sara@EXAMPLE.com ' },
    { userId: 'u', userName: 'n' },
  );
  assertEq(doc.name, 'Sara');
  assertEq(doc.phone1, '01012345678');
  assertEq(doc.phone2, '01198765432');
  assertEq(doc.email, 'sara@example.com');
});

test('buildClientDoc honors legacy status', () => {
  const doc = buildClientDoc({ ...SAMPLE_CLIENT, status: 'legacy' }, {});
  assertEq(doc.status, 'legacy');
});

// ── summary ─────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
