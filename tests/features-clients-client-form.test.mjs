/**
 * Tests for features/clients/client-form.js (clients Phase-2D).
 * Run: node tests/features-clients-client-form.test.mjs
 */
import {
  validateIntlPhone, buildClientPayload,
} from '../features/clients/client-form.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── validateIntlPhone ──────────────────────────────────────────────
test('both empty → ok, intlPhone empty', () => {
  const r = validateIntlPhone('', '');
  assertEq(r.ok, true);
  assertEq(r.intlPhone, '');
});

test('phone without cc → error', () => {
  const r = validateIntlPhone('', '5551234');
  assertEq(r.ok, false);
  if (!r.errors[0].includes('اختر دولة')) throw new Error('wrong msg');
});

test('cc without phone → error', () => {
  const r = validateIntlPhone('+1', '');
  assertEq(r.ok, false);
  if (!r.errors[0].includes('أدخل الرقم')) throw new Error('wrong msg');
});

test('cc +20 (Egypt) rejected', () => {
  const r = validateIntlPhone('+20', '1000000000');
  assertEq(r.ok, false);
  if (!r.errors[0].includes('+20')) throw new Error('wrong msg');
});

test('phone too short (<6) → error', () => {
  const r = validateIntlPhone('+1', '12345');
  assertEq(r.ok, false);
  if (!r.errors[0].includes('غير صحيح')) throw new Error('wrong msg');
});

test('phone too long (>15) → error', () => {
  const r = validateIntlPhone('+1', '1234567890123456');  // 16 digits
  assertEq(r.ok, false);
});

test('valid US phone → composes intlPhone', () => {
  const r = validateIntlPhone('+1', '5551234567');
  assertEq(r.ok, true);
  assertEq(r.intlPhone, '+15551234567');
});

test('strips non-digits from phone', () => {
  const r = validateIntlPhone('+44', '555-123-4567');
  assertEq(r.ok, true);
  assertEq(r.intlPhone, '+445551234567');
});

test('trims cc whitespace', () => {
  const r = validateIntlPhone('  +44  ', '5551234567');
  assertEq(r.ok, true);
  assertEq(r.intlPhone, '+445551234567');
});

// ── buildClientPayload ─────────────────────────────────────────────
test('basic payload — trims name/phone1, defaults to active', () => {
  const p = buildClientPayload({
    form: { name: '  Ahmed  ', phone1: ' 01000000000 ' },
    isLegacy: false,
  });
  assertEq(p.name, 'Ahmed');
  assertEq(p.phone1, '01000000000');
  assertEq(p.status, 'active');
  assertEq(p.tags.length, 0);
});

test('legacy → status:legacy + legacy fields included', () => {
  const p = buildClientPayload({
    form: {
      name: 'X',
      legacyNotes: 'old client',
      legacySpent: '500',
      legacyLastOrder: '2024-01-01',
      legacyProjects: '3',
    },
    isLegacy: true,
  });
  assertEq(p.status, 'legacy');
  assertEq(p.legacyNotes, 'old client');
  assertEq(p.totalSpentLegacy, 500);
  assertEq(p.lastOrderDateLegacy, '2024-01-01');
  assertEq(p.legacyProjects, '3');
});

test('non-legacy excludes legacy fields', () => {
  const p = buildClientPayload({
    form: { name: 'X', legacyNotes: 'should not appear' },
    isLegacy: false,
  });
  assertEq('legacyNotes' in p, false);
  assertEq('totalSpentLegacy' in p, false);
});

test('legacySpent NaN → 0', () => {
  const p = buildClientPayload({
    form: { legacySpent: 'abc' },
    isLegacy: true,
  });
  assertEq(p.totalSpentLegacy, 0);
});

test('tags array preserved', () => {
  const p = buildClientPayload({
    form: { tags: ['vip', 'wholesale'] },
    isLegacy: false,
  });
  assertEq(p.tags.length, 2);
  assertEq(p.tags[0], 'vip');
});

test('internalNotes trimmed', () => {
  const p = buildClientPayload({
    form: { internalNotes: '  secret  ' },
    isLegacy: false,
  });
  assertEq(p.internalNotes, 'secret');
});

test('internalNotesLastEdit added when changed AND meta provided', () => {
  const p = buildClientPayload({
    form: { internalNotes: 'new' },
    isLegacy: false,
    prevClient: { internalNotes: 'old' },
    internalNotesLastEdit: { by: 'u1', byName: 'admin', at: 'TS' },
  });
  if (!p.internalNotesLastEdit) throw new Error('missing edit meta');
  assertEq(p.internalNotesLastEdit.by, 'u1');
});

test('internalNotesLastEdit NOT added when unchanged', () => {
  const p = buildClientPayload({
    form: { internalNotes: 'same' },
    isLegacy: false,
    prevClient: { internalNotes: 'same' },
    internalNotesLastEdit: { by: 'u1', byName: 'admin', at: 'TS' },
  });
  assertEq('internalNotesLastEdit' in p, false);
});

test('internalNotesLastEdit NOT added when meta missing even if changed', () => {
  const p = buildClientPayload({
    form: { internalNotes: 'new' },
    isLegacy: false,
    prevClient: { internalNotes: 'old' },
    internalNotesLastEdit: null,
  });
  assertEq('internalNotesLastEdit' in p, false);
});

test('missing form keys → empty string defaults (not undefined)', () => {
  const p = buildClientPayload({ form: {}, isLegacy: false });
  assertEq(p.email, '');
  assertEq(p.job, '');
  assertEq(p.notes, '');
  assertEq(p.birthday, '');
  assertEq(p.source, '');
});

test('intlPhone passes through (validated separately)', () => {
  const p = buildClientPayload({
    form: { intlCountryCode: '+44', intlPhone: '+445551234567' },
    isLegacy: false,
  });
  assertEq(p.intlCountryCode, '+44');
  assertEq(p.intlPhone, '+445551234567');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
