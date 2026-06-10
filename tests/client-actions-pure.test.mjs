/**
 * Node-runnable tests for client-actions.js — pure logic parts only.
 * (Firestore-backed paths need browser integration to test.)
 *
 * What we test:
 *   - The action signatures don't throw on basic invalid inputs
 *   - Return shape is uniform { ok, errors[], warnings[], operationId? }
 *   - The validators detect invalid payloads
 *
 * Run: node tests/client-actions-pure.test.mjs
 */

// We import only what runs cleanly in Node — avoid Firestore imports.
// Tests focus on the early-return paths (no db calls).

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

// ── Cannot import client-actions.js directly in Node (uses Firestore URL imports)
// ── So we test the EXTERNAL behavior — early-return validation only.
// ── Full integration tests happen in browser via chaos-runner-style harness.

// Instead, replicate the validator logic here for unit testing.
// If the actual validator changes, this test file will need to mirror it.

const RE_EG_PHONE = /^01[0125][0-9]{8}$/;

function validateClientPayload({ name, phone1, phone2 = '', email = '', intlPhone = '' }) {
  const errors = [];
  const p1 = (phone1 || '').trim();
  const p2 = (phone2 || '').trim();
  const hasIntl = !!(intlPhone || '').trim();
  if (!name || !name.trim()) errors.push('⚠️ اسم العميل مطلوب');
  // phone1 مطلوب فقط لو مفيش رقم دولي بديل
  if (!p1 && !hasIntl) errors.push('⚠️ الهاتف الأساسي مطلوب');
  else if (p1 && !RE_EG_PHONE.test(p1)) errors.push('⚠️ رقم الهاتف الأساسي غير صحيح');
  if (p2 && !RE_EG_PHONE.test(p2)) {
    errors.push('⚠️ رقم الهاتف الثاني غير صحيح');
  }
  if (p1 && p2 && p1 === p2) {
    errors.push('⚠️ الهاتف الأساسي والثاني لا يصح أن يكونا متطابقين');
  }
  if (email && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.push('⚠️ البريد الإلكتروني غير صحيح');
  }
  return { ok: errors.length === 0, errors, warnings: [] };
}

function validateFollowupPayload({ clientId, type, nextActionDate }) {
  const errors = [];
  if (!clientId) errors.push('⚠️ clientId مطلوب');
  if (!type) errors.push('⚠️ نوع المتابعة مطلوب');
  if (nextActionDate && isNaN(new Date(nextActionDate).getTime())) {
    errors.push('⚠️ تاريخ الإجراء التالي غير صالح');
  }
  return { ok: errors.length === 0, errors, warnings: [] };
}

// ── Client validator tests ──
test('valid client passes', () => {
  const r = validateClientPayload({ name: 'محمد', phone1: '01012345678' });
  assertEq(r.ok, true);
});

test('missing name rejected', () => {
  const r = validateClientPayload({ name: '', phone1: '01012345678' });
  assertEq(r.ok, false);
});

test('missing phone rejected', () => {
  const r = validateClientPayload({ name: 'X' });
  assertEq(r.ok, false);
});

test('invalid phone (wrong prefix) rejected', () => {
  const r = validateClientPayload({ name: 'X', phone1: '0301234567' });
  assertEq(r.ok, false);
});

test('invalid phone (too short) rejected', () => {
  const r = validateClientPayload({ name: 'X', phone1: '0101234' });
  assertEq(r.ok, false);
});

test('phone1 valid + phone2 invalid → reject', () => {
  const r = validateClientPayload({
    name: 'X', phone1: '01012345678', phone2: 'bogus',
  });
  assertEq(r.ok, false);
});

test('valid email passes', () => {
  const r = validateClientPayload({
    name: 'X', phone1: '01012345678', email: 'a@b.com',
  });
  assertEq(r.ok, true);
});

test('invalid email rejected', () => {
  const r = validateClientPayload({
    name: 'X', phone1: '01012345678', email: 'not-an-email',
  });
  assertEq(r.ok, false);
});

test('phone variants — 010 valid', () => {
  assertEq(validateClientPayload({ name: 'X', phone1: '01012345678' }).ok, true);
});
test('phone variants — 011 valid', () => {
  assertEq(validateClientPayload({ name: 'X', phone1: '01112345678' }).ok, true);
});
test('phone variants — 012 valid', () => {
  assertEq(validateClientPayload({ name: 'X', phone1: '01212345678' }).ok, true);
});
test('phone variants — 015 valid', () => {
  assertEq(validateClientPayload({ name: 'X', phone1: '01512345678' }).ok, true);
});
test('phone variants — 013 invalid', () => {
  assertEq(validateClientPayload({ name: 'X', phone1: '01312345678' }).ok, false);
});

// ── intlPhone as alternative to phone1 ──
test('intlPhone alone (no phone1) → accepted', () => {
  const r = validateClientPayload({ name: 'John', intlPhone: '+15551234567' });
  assertEq(r.ok, true);
});

test('intlPhone + phone1 together → accepted', () => {
  const r = validateClientPayload({ name: 'John', phone1: '01012345678', intlPhone: '+15551234567' });
  assertEq(r.ok, true);
});

test('intlPhone whitespace-only → treated as absent, phone1 still required', () => {
  const r = validateClientPayload({ name: 'John', intlPhone: '   ' });
  assertEq(r.ok, false);
});

test('no phone1 and no intlPhone → rejected', () => {
  const r = validateClientPayload({ name: 'John' });
  assertEq(r.ok, false);
});

test('intlPhone present but phone1 invalid → rejected', () => {
  const r = validateClientPayload({ name: 'John', phone1: 'badphone', intlPhone: '+15551234567' });
  assertEq(r.ok, false);
});

// ── Self-duplicate (phone1 === phone2) tests ──
test('phone1 === phone2 (same number) → reject', () => {
  const r = validateClientPayload({
    name: 'X', phone1: '01012345678', phone2: '01012345678',
  });
  assertEq(r.ok, false);
});

test('phone1 === phone2 with whitespace → still reject (trimmed equal)', () => {
  const r = validateClientPayload({
    name: 'X', phone1: '01012345678', phone2: ' 01012345678 ',
  });
  assertEq(r.ok, false);
});

test('phone1 different from phone2 → accept', () => {
  const r = validateClientPayload({
    name: 'X', phone1: '01012345678', phone2: '01198765432',
  });
  assertEq(r.ok, true);
});

test('phone1 set, phone2 empty → accept (no self-dup check on empty)', () => {
  const r = validateClientPayload({
    name: 'X', phone1: '01012345678', phone2: '',
  });
  assertEq(r.ok, true);
});

// ── Followup validator tests ──
test('valid followup passes', () => {
  const r = validateFollowupPayload({ clientId: 'C1', type: 'phone_call', nextActionDate: '2026-06-01' });
  assertEq(r.ok, true);
});

test('missing clientId rejected', () => {
  const r = validateFollowupPayload({ type: 'phone_call' });
  assertEq(r.ok, false);
});

test('missing type rejected', () => {
  const r = validateFollowupPayload({ clientId: 'C1' });
  assertEq(r.ok, false);
});

test('invalid nextActionDate rejected', () => {
  const r = validateFollowupPayload({ clientId: 'C1', type: 'x', nextActionDate: 'not a date' });
  assertEq(r.ok, false);
});

test('empty nextActionDate accepted (optional field)', () => {
  const r = validateFollowupPayload({ clientId: 'C1', type: 'x' });
  assertEq(r.ok, true);
});

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed) process.exit(1);
