/**
 * core/rbac/index.js — Enterprise RBAC Public API
 *
 * Single entry point for the permission system.
 *
 * Usage:
 *   import { P, check, createPermissionContext } from './core/rbac/index.js';
 *
 *   const ctx = createPermissionContext('admin', userOverrides);
 *   if (check(ctx, P.ORDERS_CREATE)) { ... }
 *   if (checkField(ctx, 'client_phone')) { ... }
 *   if (checkPage(ctx, 'accounts')) { ... }
 *
 * Legacy bridge (backward compatible):
 *   import { legacyCanDo, legacyCanSeeField, legacyHasPage } from './core/rbac/index.js';
 *   if (legacyCanDo('manage_payments', role, perms)) { ... }
 */

// ── Permission Keys ──────────────────────────────────────
export {
  P,
  ACTIONS,
  MODULES,
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  FIELD_KEY_TO_LEGACY,
  LEGACY_TO_FIELD_KEY,
  CAPABILITY_TO_PKEY,
} from './permission-keys.js';

// ── Role Definitions ─────────────────────────────────────
export {
  SYSTEM_ROLES,
  SYSTEM_ROLE_IDS,
  getSystemRole,
  createBlankRole,
  cloneRole,
} from './role-definitions.js';

// ── RBAC Engine ──────────────────────────────────────────
export {
  createPermissionContext,
  check,
  checkAll,
  checkAny,
  checkField,
  checkPage,
  checkDomain,
  checkStageAccess,
  checkStageAdvance,
  checkStageRevert,
  getAllowedDomains,
  getDefaultDomain,
  getEffectivePermissions,
  getPermissionDiff,
  getPermissionSummary,
  comparePermissions,
  validateRoleDefinition,
  validateUserOverrides,
  legacyCanDo,
  legacyCanSeeField,
  legacyHasPage,
} from './rbac-engine.js';
