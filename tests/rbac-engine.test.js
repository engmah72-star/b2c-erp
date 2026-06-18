/**
 * tests/rbac-engine.test.js — Enterprise RBAC Engine Tests
 *
 * Validates:
 * 1. Core permission resolution (3-tier: override → role → deny)
 * 2. Field visibility checks (legacy + new format)
 * 3. Page access checks
 * 4. Stage access checks
 * 5. Legacy bridge compatibility (canDo, canSeeField, hasPage)
 * 6. Role definitions completeness
 * 7. Permission diff & comparison
 * 8. Validation
 */

import {
  P, ALL_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_LABELS,
  SYSTEM_ROLES, SYSTEM_ROLE_IDS,
  createPermissionContext, check, checkAll, checkAny,
  checkField, checkPage, checkDomain,
  checkStageAccess, checkStageAdvance, checkStageRevert,
  getAllowedDomains, getDefaultDomain,
  getEffectivePermissions, getPermissionDiff, getPermissionSummary,
  comparePermissions, validateRoleDefinition, validateUserOverrides,
  legacyCanDo, legacyCanSeeField, legacyHasPage,
  createBlankRole, cloneRole,
  FIELD_KEY_TO_LEGACY, LEGACY_TO_FIELD_KEY, CAPABILITY_TO_PKEY,
} from '../core/rbac/index.js';

import {
  canSeeField, canDo, hasPage, maskPhone,
  DEFAULT_PERMISSIONS, DEFAULT_CAPABILITIES, ROLE_PAGES,
  SENSITIVE_FIELDS,
} from '../core/permissions-matrix.js';

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ══════════════════════════════════════════════════════════
// 1. CORE PERMISSION RESOLUTION
// ══════════════════════════════════════════════════════════

section('Core Permission Resolution');

// Admin has everything
const adminCtx = createPermissionContext('admin');
assert(check(adminCtx, P.ORDERS_CREATE) === true, 'Admin can create orders');
assert(check(adminCtx, P.FINANCIALS_PAYMENTS_APPROVE) === true, 'Admin can final approve');
assert(check(adminCtx, P.SYSTEM_IMPERSONATE) === true, 'Admin can impersonate');
assert(check(adminCtx, P.SETTINGS_EDIT) === true, 'Admin can edit settings');

// Graphic designer has minimal permissions
const designerCtx = createPermissionContext('graphic_designer');
assert(check(designerCtx, P.ORDERS_VIEW) === true, 'Designer can view orders');
assert(check(designerCtx, P.ORDERS_CREATE) === false, 'Designer cannot create orders');
assert(check(designerCtx, P.DESIGN_UPLOAD) === true, 'Designer can upload designs');
assert(check(designerCtx, P.FINANCIALS_VIEW) === false, 'Designer cannot view financials');
assert(check(designerCtx, P.CLIENTS_VIEW) === false, 'Designer cannot view clients');

// Operation manager — almost everything except final approve & system settings
const opsCtx = createPermissionContext('operation_manager');
assert(check(opsCtx, P.FINANCIALS_PAYMENTS_EXECUTE) === true, 'Ops can execute payments');
assert(check(opsCtx, P.FINANCIALS_PAYMENTS_APPROVE) === false, 'Ops cannot final approve');
assert(check(opsCtx, P.SETTINGS_EDIT) === false, 'Ops cannot edit system settings');

// ══════════════════════════════════════════════════════════
// 2. USER OVERRIDES
// ══════════════════════════════════════════════════════════

section('User Overrides');

// Designer with override to create orders
const designerWithOverride = createPermissionContext('graphic_designer', {
  permissions: { [P.ORDERS_CREATE]: true },
});
assert(check(designerWithOverride, P.ORDERS_CREATE) === true, 'Override grants designer order creation');
assert(check(designerWithOverride, P.ORDERS_VIEW) === true, 'Non-overridden perm still works from role');

// Admin with denied permission
const adminDenied = createPermissionContext('admin', {
  permissions: { [P.SYSTEM_IMPERSONATE]: false },
});
assert(check(adminDenied, P.SYSTEM_IMPERSONATE) === false, 'Override can deny admin permission');
assert(check(adminDenied, P.ORDERS_CREATE) === true, 'Other admin perms unaffected');

// ══════════════════════════════════════════════════════════
// 3. checkAll / checkAny
// ══════════════════════════════════════════════════════════

section('checkAll / checkAny');

assert(checkAll(adminCtx, P.ORDERS_VIEW, P.ORDERS_CREATE, P.ORDERS_EDIT) === true, 'Admin has all order perms');
assert(checkAll(designerCtx, P.ORDERS_VIEW, P.ORDERS_CREATE) === false, 'Designer lacks create (checkAll)');
assert(checkAny(designerCtx, P.ORDERS_VIEW, P.ORDERS_CREATE) === true, 'Designer has view (checkAny)');
assert(checkAny(designerCtx, P.FINANCIALS_VIEW, P.SETTINGS_EDIT) === false, 'Designer has neither');

// ══════════════════════════════════════════════════════════
// 4. FIELD VISIBILITY
// ══════════════════════════════════════════════════════════

section('Field Visibility');

// Admin sees everything
assert(checkField(adminCtx, 'client_phone') === true, 'Admin sees client phone');
assert(checkField(adminCtx, 'price_margin') === true, 'Admin sees price margin');

// Designer can see design_data but not client_phone
assert(checkField(designerCtx, 'design_data') === true, 'Designer sees design data');
assert(checkField(designerCtx, 'client_phone') === false, 'Designer cannot see phone');
assert(checkField(designerCtx, 'price_cost') === false, 'Designer cannot see cost');

// Shipping officer
const shippingCtx = createPermissionContext('shipping_officer');
assert(checkField(shippingCtx, 'client_phone') === true, 'Shipping sees phone');
assert(checkField(shippingCtx, 'price_remaining') === true, 'Shipping sees remaining');
assert(checkField(shippingCtx, 'price_margin') === false, 'Shipping cannot see margin');
assert(checkField(shippingCtx, 'design_data') === false, 'Shipping cannot see design data');

// Field override
const designerSeePhone = createPermissionContext('graphic_designer', {
  fields: { client_phone: true },
});
assert(checkField(designerSeePhone, 'client_phone') === true, 'Field override grants phone visibility');

// ══════════════════════════════════════════════════════════
// 5. PAGE ACCESS
// ══════════════════════════════════════════════════════════

section('Page Access');

assert(checkPage(adminCtx, 'accounts') === true, 'Admin has accounts page');
assert(checkPage(adminCtx, 'anything') === true, 'Admin has wildcard page access');
assert(checkPage(designerCtx, 'design') === true, 'Designer has design page');
assert(checkPage(designerCtx, 'accounts') === false, 'Designer lacks accounts page');

// Page override
const designerExtraPage = createPermissionContext('graphic_designer', {
  pages: ['design', 'designer-dashboard', 'gallery'],
});
assert(checkPage(designerExtraPage, 'gallery') === true, 'Override grants gallery page');
assert(checkPage(designerExtraPage, 'accounts') === false, 'Override still denies accounts');

// ══════════════════════════════════════════════════════════
// 6. DOMAIN ACCESS
// ══════════════════════════════════════════════════════════

section('Domain Access');

const adminDomains = getAllowedDomains(adminCtx);
assert(adminDomains.includes('clients') && adminDomains.includes('admin'), 'Admin has all domains');
assert(getDefaultDomain(adminCtx) === 'accounts', 'Admin default domain is accounts');

const designerDomains = getAllowedDomains(designerCtx);
assert(designerDomains.includes('design'), 'Designer has design domain');
assert(!designerDomains.includes('accounts'), 'Designer lacks accounts domain');
assert(getDefaultDomain(designerCtx) === 'design', 'Designer default domain is design');

assert(checkDomain(shippingCtx, 'shipping') === true, 'Shipping can see shipping domain');
assert(checkDomain(shippingCtx, 'accounts') === false, 'Shipping cannot see accounts domain');

// ══════════════════════════════════════════════════════════
// 7. STAGE ACCESS
// ══════════════════════════════════════════════════════════

section('Stage Access');

assert(checkStageAccess(designerCtx, 'design') === true, 'Designer can access design stage');
assert(checkStageAccess(designerCtx, 'production') === false, 'Designer cannot access production stage');

const prodCtx = createPermissionContext('production_agent');
assert(checkStageAccess(prodCtx, 'production') === true, 'Production agent accesses production');
assert(checkStageAdvance(prodCtx, 'production') === true, 'Production agent can advance production');
assert(checkStageAdvance(designerCtx, 'design') === false, 'Designer cannot advance design');

assert(checkStageRevert(opsCtx, 'shipping') === true, 'Ops can revert shipping');
assert(checkStageRevert(shippingCtx, 'design') === false, 'Shipping cannot revert design');

// Stage restriction override
const restrictedUser = createPermissionContext('operation_manager', {
  stageAccess: ['design', 'printing'],
});
assert(checkStageAccess(restrictedUser, 'design') === true, 'Restricted to allowed stage');
assert(checkStageAccess(restrictedUser, 'production') === false, 'Restricted from non-allowed stage');

// ══════════════════════════════════════════════════════════
// 8. LEGACY BRIDGE COMPATIBILITY
// ══════════════════════════════════════════════════════════

section('Legacy Bridge Compatibility');

// canDo still works
assert(canDo('view_orders', 'admin') === true, 'Legacy canDo: admin view_orders');
assert(canDo('create_orders', 'graphic_designer') === false, 'Legacy canDo: designer create_orders');
assert(canDo('manage_shipping', 'shipping_officer') === true, 'Legacy canDo: shipping manage_shipping');
assert(canDo('system_settings', 'operation_manager') === false, 'Legacy canDo: ops system_settings');

// canSeeField still works
assert(canSeeField('client_phone', 'admin') === true, 'Legacy canSeeField: admin phone');
assert(canSeeField('client_phone', 'graphic_designer') === false, 'Legacy canSeeField: designer phone');
assert(canSeeField('design_data', 'customer_service') === true, 'Legacy canSeeField: CS design');

// hasPage still works
assert(hasPage('clients', 'customer_service') === true, 'Legacy hasPage: CS clients');
assert(hasPage('accounts', 'graphic_designer') === false, 'Legacy hasPage: designer accounts');

// maskPhone still works
assert(maskPhone('01234567890', true) === '01234567890', 'maskPhone: show=true');
assert(maskPhone('01234567890', false) === '012****890', 'maskPhone: show=false');
assert(maskPhone('', false) === '', 'maskPhone: empty');
assert(maskPhone(null, false) === '', 'maskPhone: null');

// Legacy with user overrides
assert(canDo('create_orders', 'graphic_designer', { capabilities: { create_orders: true } }) === true,
  'Legacy canDo with user override');

// ══════════════════════════════════════════════════════════
// 9. ROLE DEFINITIONS COMPLETENESS
// ══════════════════════════════════════════════════════════

section('Role Definitions Completeness');

assert(SYSTEM_ROLE_IDS.length === 8, '8 system roles defined');
assert(SYSTEM_ROLE_IDS.includes('admin'), 'Admin role exists');
assert(SYSTEM_ROLE_IDS.includes('wallet_manager'), 'Wallet manager role exists');

for (const roleId of SYSTEM_ROLE_IDS) {
  const role = SYSTEM_ROLES[roleId];
  assert(role.id === roleId, `Role ${roleId} has correct ID`);
  assert(role.label.ar && role.label.en, `Role ${roleId} has labels`);
  assert(role.isSystem === true, `Role ${roleId} is marked system`);
  assert(typeof role.permissions === 'object', `Role ${roleId} has permissions`);
  assert(Array.isArray(role.pages), `Role ${roleId} has pages array`);
  assert(Array.isArray(role.domains), `Role ${roleId} has domains array`);
}

// Every permission key has a value in every system role
for (const roleId of SYSTEM_ROLE_IDS) {
  const role = SYSTEM_ROLES[roleId];
  for (const key of ALL_PERMISSIONS) {
    assert(role.permissions[key] !== undefined,
      `Role ${roleId} defines permission ${key}`);
  }
}

// ══════════════════════════════════════════════════════════
// 10. PERMISSION LABELS & GROUPS
// ══════════════════════════════════════════════════════════

section('Permission Labels & Groups');

assert(ALL_PERMISSIONS.length > 150, `${ALL_PERMISSIONS.length} permissions defined`);

for (const key of ALL_PERMISSIONS) {
  assert(PERMISSION_LABELS[key], `Permission ${key} has label`);
  assert(PERMISSION_LABELS[key].ar, `Permission ${key} has Arabic label`);
  assert(PERMISSION_LABELS[key].en, `Permission ${key} has English label`);
}

let groupedCount = 0;
for (const group of Object.values(PERMISSION_GROUPS)) {
  assert(group.label, `Group has Arabic label: ${group.label}`);
  assert(group.labelEn, `Group has English label: ${group.labelEn}`);
  assert(Array.isArray(group.permissions), `Group has permissions array`);
  groupedCount += group.permissions.length;
}
assert(groupedCount === ALL_PERMISSIONS.length,
  `All ${ALL_PERMISSIONS.length} permissions are in groups (got ${groupedCount})`);

// ══════════════════════════════════════════════════════════
// 11. MAPPING TABLES
// ══════════════════════════════════════════════════════════

section('Mapping Tables');

assert(Object.keys(FIELD_KEY_TO_LEGACY).length === 15, '15 field mappings');
assert(Object.keys(CAPABILITY_TO_PKEY).length === 22, '22 capability mappings');

for (const [newKey, legacyName] of Object.entries(FIELD_KEY_TO_LEGACY)) {
  assert(LEGACY_TO_FIELD_KEY[legacyName] === newKey, `Bidirectional mapping: ${legacyName}`);
}

// ══════════════════════════════════════════════════════════
// 12. EFFECTIVE PERMISSIONS & DIFF
// ══════════════════════════════════════════════════════════

section('Effective Permissions & Diff');

const effectiveAdmin = getEffectivePermissions(adminCtx);
assert(Object.keys(effectiveAdmin).length === ALL_PERMISSIONS.length, 'Effective has all keys');
assert(effectiveAdmin[P.ORDERS_CREATE] === true, 'Admin effective: orders create');

const designerDiff = getPermissionDiff(designerWithOverride);
assert(designerDiff[P.ORDERS_CREATE], 'Diff shows orders create override');
assert(designerDiff[P.ORDERS_CREATE].roleDefault === false, 'Diff: role default is false');
assert(designerDiff[P.ORDERS_CREATE].effective === true, 'Diff: effective is true');

const summary = getPermissionSummary(adminCtx);
assert(summary.roleId === 'admin', 'Summary has role ID');
assert(summary.granted > 0, 'Summary counts granted');
assert(summary.totalPermissions === ALL_PERMISSIONS.length, 'Summary total matches');

// ══════════════════════════════════════════════════════════
// 13. ROLE COMPARISON
// ══════════════════════════════════════════════════════════

section('Role Comparison');

const comparison = comparePermissions(adminCtx, designerCtx);
assert(comparison.onlyA.length > 0, 'Admin has permissions designer lacks');
assert(comparison.both.length > 0, 'Some permissions shared');
assert(comparison.onlyA.includes(P.ORDERS_CREATE), 'Orders create is admin-only');
assert(comparison.both.includes(P.ORDERS_VIEW), 'Both can view orders');

// ══════════════════════════════════════════════════════════
// 14. VALIDATION
// ══════════════════════════════════════════════════════════

section('Validation');

const validRole = validateRoleDefinition(SYSTEM_ROLES.admin);
assert(validRole.ok === true, 'System admin validates OK');

const invalidRole = validateRoleDefinition({ id: 'test' });
assert(invalidRole.ok === false, 'Missing fields fail validation');

const validOverrides = validateUserOverrides({
  permissions: { [P.ORDERS_CREATE]: true },
  pages: ['design'],
});
assert(validOverrides.ok === true, 'Valid overrides pass');

const invalidOverrides = validateUserOverrides({ pages: 'not-array' });
assert(invalidOverrides.ok === false, 'Invalid pages type fails');

// ══════════════════════════════════════════════════════════
// 15. BLANK & CLONE ROLES
// ══════════════════════════════════════════════════════════

section('Blank & Clone Roles');

const blank = createBlankRole('test_role', 'دور تجريبي', 'Test Role', 'وصف');
assert(blank.id === 'test_role', 'Blank role has ID');
assert(blank.isSystem === false, 'Blank role is not system');
assert(blank.permissions[P.ORDERS_CREATE] === false, 'Blank: all perms false by default');

const cloned = cloneRole('customer_service', 'cs_v2', 'خدمة عملاء 2', 'CS v2');
assert(cloned.id === 'cs_v2', 'Cloned role has new ID');
assert(cloned.isSystem === false, 'Cloned role is not system');
assert(cloned.permissions[P.ORDERS_CREATE] === true, 'Cloned inherits CS permissions');
assert(cloned.permissions[P.FINANCIALS_PAYMENTS_APPROVE] === false, 'Cloned inherits CS deny');

// ══════════════════════════════════════════════════════════
// 16. BACKWARD COMPATIBILITY — DEFAULT_PERMISSIONS alignment
// ══════════════════════════════════════════════════════════

section('Backward Compatibility — Field Matrix Alignment');

for (const [roleId, fields] of Object.entries(DEFAULT_PERMISSIONS)) {
  const ctx = createPermissionContext(roleId);
  for (const [field, expected] of Object.entries(fields)) {
    const rbacResult = checkField(ctx, field);
    assert(rbacResult === expected,
      `RBAC field ${field} for ${roleId}: expected=${expected}, got=${rbacResult}`);
  }
}

// ══════════════════════════════════════════════════════════
// 17. BACKWARD COMPATIBILITY — DEFAULT_CAPABILITIES alignment
// ══════════════════════════════════════════════════════════

section('Backward Compatibility — Capability Matrix Alignment');

for (const [roleId, caps] of Object.entries(DEFAULT_CAPABILITIES)) {
  for (const [cap, expected] of Object.entries(caps)) {
    const legacyResult = canDo(cap, roleId);
    assert(legacyResult === expected,
      `Legacy canDo ${cap} for ${roleId}: expected=${expected}, got=${legacyResult}`);
  }
}

// ══════════════════════════════════════════════════════════
// 18. BACKWARD COMPATIBILITY — ROLE_PAGES alignment
// ══════════════════════════════════════════════════════════

section('Backward Compatibility — Page Matrix Alignment');

for (const [roleId, pages] of Object.entries(ROLE_PAGES)) {
  const ctx = createPermissionContext(roleId);
  for (const page of pages) {
    if (page === '*') {
      assert(checkPage(ctx, 'anything') === true, `${roleId} wildcard page works in RBAC`);
    } else {
      assert(checkPage(ctx, page) === true, `${roleId} has page ${page} in RBAC`);
    }
  }
}

// ══════════════════════════════════════════════════════════
// 19. FAIL-CLOSED — Unknown values
// ══════════════════════════════════════════════════════════

section('Fail-Closed Behavior');

assert(check(null, P.ORDERS_VIEW) === false, 'null context = deny');
assert(check(adminCtx, null) === false, 'null permission = deny');
assert(check(adminCtx, 'nonexistent:perm') === false, 'Unknown perm = deny');

const unknownRole = createPermissionContext('nonexistent_role');
assert(check(unknownRole, P.ORDERS_VIEW) === true, 'Unknown role falls back to CS which has orders view');
assert(check(unknownRole, P.FINANCIALS_PAYMENTS_APPROVE) === false, 'Unknown role: no approve');

assert(checkField(null, 'client_phone') === false, 'null ctx field = deny');
assert(checkPage(null, 'accounts') === false, 'null ctx page = deny');

// ══════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}`);

if (failed > 0) {
  process.exit(1);
}
