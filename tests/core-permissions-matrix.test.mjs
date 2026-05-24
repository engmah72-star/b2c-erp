/**
 * Tests for core/permissions-matrix.js
 * Run: node tests/core-permissions-matrix.test.mjs
 */
import {
  canSeeField, maskPhone, canDo,
  getRoleDefaultPermissions,
  CAPABILITIES, ROLE_CAN_SEE_PHONE,
} from '../core/permissions-matrix.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── maskPhone ─────────────────────────────────────────────────────
test('maskPhone: null/empty → ""', () => {
  assertEq(maskPhone(null), '');
  assertEq(maskPhone(''), '');
  assertEq(maskPhone(undefined), '');
});

test('maskPhone: canShow=true → returns raw phone', () => {
  assertEq(maskPhone('01234567890', true), '01234567890');
});

test('maskPhone: default canShow=false → masks middle', () => {
  assertEq(maskPhone('01234567890'), '012****890');
});

test('maskPhone: short phone (< 6 digits) → ****', () => {
  assertEq(maskPhone('12345'), '****');
});

test('maskPhone: strips non-digits before masking', () => {
  assertEq(maskPhone('+20 (12) 3456-7890'), '201****890');
});

// ── canSeeField ───────────────────────────────────────────────────
test('canSeeField: admin sees client_phone', () => {
  assertEq(canSeeField('client_phone', 'admin'), true);
});

test('canSeeField: graphic_designer cannot see client_phone', () => {
  assertEq(canSeeField('client_phone', 'graphic_designer'), false);
});

test('canSeeField: customer_service can see client_phone', () => {
  assertEq(canSeeField('client_phone', 'customer_service'), true);
});

test('canSeeField: shipping_officer can see client_phone (delivery)', () => {
  assertEq(canSeeField('client_phone', 'shipping_officer'), true);
});

test('canSeeField: user override wins over role default', () => {
  // graphic_designer default: cannot see — but user override grants it
  assertEq(canSeeField('client_phone', 'graphic_designer', { client_phone: true }), true);
});

test('canSeeField: user override can deny what role default allows', () => {
  // admin default: yes — but user override denies
  assertEq(canSeeField('client_phone', 'admin', { client_phone: false }), false);
});

test('canSeeField: unknown field → default behavior (not sensitive = true)', () => {
  assertEq(canSeeField('some_random_field', 'graphic_designer'), true);
});

// ── ROLE_CAN_SEE_PHONE — sanity check ────────────────────────────
test('ROLE_CAN_SEE_PHONE: includes admin/cs/ops/shipping', () => {
  assertEq(ROLE_CAN_SEE_PHONE.has('admin'), true);
  assertEq(ROLE_CAN_SEE_PHONE.has('customer_service'), true);
  assertEq(ROLE_CAN_SEE_PHONE.has('shipping_officer'), true);
});

test('ROLE_CAN_SEE_PHONE: excludes graphic_designer', () => {
  assertEq(ROLE_CAN_SEE_PHONE.has('graphic_designer'), false);
});

// ── canDo (RULE P1 capability check) ─────────────────────────────
test('canDo: admin can archive_orders', () => {
  assertEq(canDo(CAPABILITIES.ARCHIVE_ORDERS, 'admin'), true);
});

test('canDo: graphic_designer cannot manage_employees', () => {
  assertEq(canDo(CAPABILITIES.MANAGE_EMPLOYEES, 'graphic_designer'), false);
});

test('canDo: user override grants a capability', () => {
  assertEq(canDo(
    CAPABILITIES.APPROVE_DESIGNS,
    'graphic_designer',
    { capabilities: { approve_designs: true } },
  ), true);
});

test('canDo: user override denies what role default allows', () => {
  assertEq(canDo(
    CAPABILITIES.ARCHIVE_ORDERS,
    'admin',
    { capabilities: { archive_orders: false } },
  ), false);
});

test('canDo: unknown capability → false (fail-closed)', () => {
  assertEq(canDo('some_made_up_action', 'admin'), false);
});

test('canDo: empty capability → false', () => {
  assertEq(canDo('', 'admin'), false);
  assertEq(canDo(null, 'admin'), false);
});

// ── getRoleDefaultPermissions ────────────────────────────────────
test('getRoleDefaultPermissions: returns mutable copy', () => {
  const a = getRoleDefaultPermissions('admin');
  const b = getRoleDefaultPermissions('admin');
  assertEq(a === b, false); // different references
  // Should not throw when mutating
  a.someNewKey = 'test';
});

test('getRoleDefaultPermissions: unknown role → falls back to customer_service', () => {
  const r = getRoleDefaultPermissions('nonexistent_role');
  const cs = getRoleDefaultPermissions('customer_service');
  // Both should have same shape (deep equal would be ideal but JSON-stringify match works)
  assertEq(JSON.stringify(r), JSON.stringify(cs));
});

// ── CAPABILITIES enum integrity ──────────────────────────────────
test('CAPABILITIES: all values are strings', () => {
  Object.values(CAPABILITIES).forEach(v => {
    if (typeof v !== 'string' || !v.length) throw new Error(`invalid capability: ${v}`);
  });
});

test('CAPABILITIES: frozen (cannot be mutated)', () => {
  const original = CAPABILITIES.VIEW_ORDERS;
  try { CAPABILITIES.VIEW_ORDERS = 'hacked'; } catch {}
  assertEq(CAPABILITIES.VIEW_ORDERS, original);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
