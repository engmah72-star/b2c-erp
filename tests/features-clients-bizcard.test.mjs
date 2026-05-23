/**
 * Tests for features/clients/bizcard-form.js (clients god-page Phase-2A).
 * Run: node tests/features-clients-bizcard.test.mjs
 */
import {
  BIZCARD_FIELDS, BIZCARD_KEY_MAP,
  readBizCardFromForm, formatBizCardText,
} from '../features/clients/bizcard-form.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// Mock form element factory
const mkEl = (value) => ({ value });
function mkGetEl(map) {
  return (fieldId) => map.has(fieldId) ? mkEl(map.get(fieldId)) : null;
}

// ── BIZCARD_FIELDS / BIZCARD_KEY_MAP ─────────────────────────────────
test('BIZCARD_FIELDS includes core identity fields', () => {
  ['name-ar', 'name-en', 'mobile-phone', 'email', 'design-notes']
    .forEach(f => { if (!BIZCARD_FIELDS.includes(f)) throw new Error('missing ' + f); });
});

test('BIZCARD_KEY_MAP maps kebab → camel correctly', () => {
  assertEq(BIZCARD_KEY_MAP['name-ar'], 'nameAr');
  assertEq(BIZCARD_KEY_MAP['mobile-phone'], 'mobilePhone');
  assertEq(BIZCARD_KEY_MAP['design-notes'], 'designNotes');
  assertEq(BIZCARD_KEY_MAP['fb'], 'facebook');
});

// ── readBizCardFromForm ─────────────────────────────────────────────
test('reads non-empty form values + maps keys', () => {
  const m = new Map([
    ['name-ar', 'أحمد'],
    ['mobile-phone', '01000000000'],
    ['email', 'a@b.com'],
    ['design-notes', '  notes  '],  // trimmed
  ]);
  const bc = readBizCardFromForm(mkGetEl(m));
  assertEq(bc.nameAr, 'أحمد');
  assertEq(bc.mobilePhone, '01000000000');
  assertEq(bc.email, 'a@b.com');
  assertEq(bc.designNotes, 'notes');
});

test('skips empty/whitespace-only values', () => {
  const m = new Map([
    ['name-ar', ''],
    ['nickname', '   '],
    ['email', 'x@y.com'],
  ]);
  const bc = readBizCardFromForm(mkGetEl(m));
  assertEq('nameAr' in bc, false);
  assertEq('nickname' in bc, false);
  assertEq(bc.email, 'x@y.com');
});

test('missing elements skipped silently', () => {
  // getEl returns null for unknown fields
  const bc = readBizCardFromForm(() => null);
  assertEq(Object.keys(bc).length, 0);
});

test('uses kebab→camel fallback for unmapped keys', () => {
  // 'whatsapp' is in BIZCARD_FIELDS but not in BIZCARD_KEY_MAP — should fall back to camel
  const m = new Map([['whatsapp', '01999999999']]);
  const bc = readBizCardFromForm(mkGetEl(m));
  assertEq(bc.whatsapp, '01999999999');
});

// ── formatBizCardText ──────────────────────────────────────────────
test('empty bizCard → empty string', () => {
  assertEq(formatBizCardText({ bc: {} }), '');
});

test('formats basic identity + contact', () => {
  const text = formatBizCardText({
    bc: {
      prefix: 'م.', nameAr: 'أحمد', nameEn: 'Ahmed',
      jobTitleAr: 'مهندس', companyAr: 'شركتي',
      mobilePhone: '01000000000', email: 'a@b.com',
    },
    mode: 'export',
  });
  if (!text.includes('م. أحمد')) throw new Error('missing prefix+name');
  if (!text.includes('Ahmed')) throw new Error('missing nameEn');
  if (!text.includes('موبايل/واتساب: 01000000000')) throw new Error('missing mobile label');
  if (!text.includes('Email: a@b.com')) throw new Error('missing email label');
});

test('export mode labels address fields with prefixes', () => {
  const text = formatBizCardText({
    bc: { addressAr: 'القاهرة', addressEn: 'Cairo' },
    mode: 'export',
  });
  if (!text.includes('العنوان: القاهرة')) throw new Error('addressAr label missing');
  if (!text.includes('Address: Cairo')) throw new Error('addressEn label missing');
});

test('order-note mode omits address prefix labels', () => {
  const text = formatBizCardText({
    bc: { addressAr: 'القاهرة' },
    mode: 'order-note',
  });
  if (text.includes('العنوان:')) throw new Error('order-note should not prefix address');
  if (!text.includes('القاهرة')) throw new Error('address content missing');
});

test('joins social links with separator', () => {
  const text = formatBizCardText({
    bc: { facebook: 'fb.com/x', instagram: '@x', linkedin: 'in/x' },
  });
  if (!text.includes('FB: fb.com/x')) throw new Error('FB missing');
  if (!text.includes('IG: @x')) throw new Error('IG missing');
  if (!text.includes('LinkedIn: in/x')) throw new Error('LinkedIn missing');
  if (!text.includes(' · ')) throw new Error('separator missing');
});

test('collapses consecutive empty lines', () => {
  const text = formatBizCardText({
    bc: { nameAr: 'أ', email: 'x@y.com' },  // no jobtitle etc. → multiple empty rows
  });
  if (text.includes('\n\n\n')) throw new Error('triple newlines not collapsed');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
