/**
 * core/rbac/rbac-engine.js — Enterprise RBAC Resolution Engine
 *
 * The central authority for permission checks in the system.
 * Implements a 3-tier resolution with fail-closed default:
 *
 *   1. User-level override (explicit grant/deny per user)
 *   2. Role template default (from role definition)
 *   3. Deny (fail-closed — least privilege)
 *
 * Usage:
 *   import { createPermissionContext, check } from './core/rbac/rbac-engine.js';
 *
 *   const ctx = createPermissionContext(userRole, userOverrides, customRoleDef);
 *   if (check(ctx, P.ORDERS_CREATE)) { ... }
 *   if (checkField(ctx, 'client_phone')) { ... }
 *   if (checkPage(ctx, 'accounts')) { ... }
 */

import { P, FIELD_KEY_TO_LEGACY, LEGACY_TO_FIELD_KEY, CAPABILITY_TO_PKEY } from './permission-keys.js';
import { SYSTEM_ROLES } from './role-definitions.js';

// ══════════════════════════════════════════════════════════
// PERMISSION CONTEXT — Immutable snapshot for a user session
// ══════════════════════════════════════════════════════════

/**
 * Creates an immutable permission context for a user.
 * This is the single object passed to all check functions.
 *
 * @param {string} roleId — The user's role ID
 * @param {Object} [userOverrides] — Per-user permission overrides from Firestore
 *   Shape: {
 *     permissions: { [permKey]: true/false },  // permission overrides
 *     fields: { [fieldName]: true/false },      // field visibility overrides
 *     pages: string[],                          // page access overrides
 *     domains: string[],                        // domain overrides
 *     stageAccess: string[],                    // limit to specific order stages
 *     capabilities: { [capName]: true/false },  // legacy capability overrides
 *   }
 * @param {Object} [customRoleDef] — Custom role definition (for non-system roles)
 * @returns {Object} Frozen permission context
 */
export function createPermissionContext(roleId, userOverrides, customRoleDef) {
  const roleDef = customRoleDef || SYSTEM_ROLES[roleId] || SYSTEM_ROLES.customer_service;
  const overrides = userOverrides || {};

  return Object.freeze({
    roleId: roleId || 'customer_service',
    roleDef,
    overrides: Object.freeze({ ...overrides }),
    _cache: new Map(),
  });
}

// ══════════════════════════════════════════════════════════
// CORE CHECK — The single resolution function
// ══════════════════════════════════════════════════════════

/**
 * Check if the user has a specific permission.
 *
 * Resolution order:
 *   1) User override in overrides.permissions[key] → wins (explicit grant/deny)
 *   2) Role template roleDef.permissions[key] → default
 *   3) false (fail-closed — least privilege)
 *
 * @param {Object} ctx — Permission context from createPermissionContext
 * @param {string} permissionKey — Permission key from P.* constants
 * @returns {boolean}
 */
export function check(ctx, permissionKey) {
  if (!ctx || !permissionKey) return false;

  const cached = ctx._cache.get(permissionKey);
  if (cached !== undefined) return cached;

  let result = false;

  const userPerms = ctx.overrides?.permissions;
  if (userPerms && userPerms[permissionKey] !== undefined) {
    result = !!userPerms[permissionKey];
  } else if (ctx.roleDef?.permissions?.[permissionKey] !== undefined) {
    result = !!ctx.roleDef.permissions[permissionKey];
  }

  ctx._cache.set(permissionKey, result);
  return result;
}

/**
 * Check multiple permissions at once (AND logic — all must be true).
 */
export function checkAll(ctx, ...permissionKeys) {
  return permissionKeys.every(key => check(ctx, key));
}

/**
 * Check if any of the permissions are granted (OR logic).
 */
export function checkAny(ctx, ...permissionKeys) {
  return permissionKeys.some(key => check(ctx, key));
}

// ══════════════════════════════════════════════════════════
// FIELD VISIBILITY — Bridge to legacy field names
// ══════════════════════════════════════════════════════════

/**
 * Check if user can see a sensitive field.
 * Accepts both legacy names ('client_phone') and new keys ('field.client_phone:view').
 *
 * Resolution:
 *   1) User override in overrides.fields[legacyName]
 *   2) User override in overrides.permissions[newKey]
 *   3) Role template permission[newKey]
 *   4) fail-closed for SENSITIVE fields, open for non-sensitive
 */
export function checkField(ctx, fieldNameOrKey) {
  if (!ctx || !fieldNameOrKey) return false;

  const legacyName = FIELD_KEY_TO_LEGACY[fieldNameOrKey] || fieldNameOrKey;
  const newKey = LEGACY_TO_FIELD_KEY[legacyName] || fieldNameOrKey;

  // 1) User-level field override (legacy shape: overrides.fields.client_phone)
  const fieldOverrides = ctx.overrides?.fields;
  if (fieldOverrides && fieldOverrides[legacyName] !== undefined) {
    return !!fieldOverrides[legacyName];
  }

  // 2) User-level permission override (new shape)
  const permOverrides = ctx.overrides?.permissions;
  if (permOverrides && permOverrides[newKey] !== undefined) {
    return !!permOverrides[newKey];
  }

  // 3) Legacy field overrides in flat overrides (backward compat)
  if (ctx.overrides?.[legacyName] !== undefined) {
    return !!ctx.overrides[legacyName];
  }

  // 4) Role template
  if (ctx.roleDef?.permissions?.[newKey] !== undefined) {
    return !!ctx.roleDef.permissions[newKey];
  }

  // 5) Non-sensitive fields default to visible
  return !SENSITIVE_FIELD_NAMES.has(legacyName);
}

const SENSITIVE_FIELD_NAMES = new Set([
  'client_phone', 'design_data', 'supplier_cost', 'supplier_phone',
  'price_cost', 'price_margin',
]);

// ══════════════════════════════════════════════════════════
// PAGE ACCESS — Check page-level access
// ══════════════════════════════════════════════════════════

/**
 * Check if user has access to a specific page.
 *
 * Resolution:
 *   1) User override in overrides.pages (if array, use it)
 *   2) Role template pages
 *   3) deny
 * '*' in the list = all pages
 */
export function checkPage(ctx, pageId) {
  if (!ctx || !pageId) return false;

  const userPages = ctx.overrides?.pages;
  const pages = (Array.isArray(userPages) && userPages.length > 0)
    ? userPages
    : (ctx.roleDef?.pages || []);

  return pages.includes('*') || pages.includes(pageId);
}

// ══════════════════════════════════════════════════════════
// DOMAIN ACCESS — Navigation rail visibility
// ══════════════════════════════════════════════════════════

/**
 * Get allowed navigation domains for the user.
 */
export function getAllowedDomains(ctx) {
  if (!ctx) return ['inbox'];

  const userDomains = ctx.overrides?.domains;
  if (Array.isArray(userDomains) && userDomains.length > 0) {
    return [...userDomains];
  }

  return [...(ctx.roleDef?.domains || ['inbox'])];
}

/**
 * Check if user can see a specific domain.
 */
export function checkDomain(ctx, domainId) {
  return getAllowedDomains(ctx).includes(domainId);
}

/**
 * Get the user's default landing domain.
 */
export function getDefaultDomain(ctx) {
  if (!ctx) return 'inbox';
  return ctx.roleDef?.defaultDomain || 'inbox';
}

// ══════════════════════════════════════════════════════════
// STAGE ACCESS — Order stage restrictions
// ══════════════════════════════════════════════════════════

/**
 * Check if user can interact with a specific order stage.
 * If stageAccess is set in overrides, only those stages are allowed.
 * Otherwise, falls back to permission-based check.
 */
export function checkStageAccess(ctx, stage) {
  if (!ctx || !stage) return false;

  const stageRestrictions = ctx.overrides?.stageAccess;
  if (Array.isArray(stageRestrictions) && stageRestrictions.length > 0) {
    return stageRestrictions.includes(stage);
  }

  const stageViewMap = {
    design:     P.ORDERS_STAGE_DESIGN_VIEW,
    printing:   P.ORDERS_STAGE_PRINTING_VIEW,
    production: P.ORDERS_STAGE_PRODUCTION_VIEW,
    shipping:   P.ORDERS_STAGE_SHIPPING_VIEW,
    archived:   P.ORDERS_STAGE_ARCHIVE_VIEW,
  };

  const viewPerm = stageViewMap[stage];
  return viewPerm ? check(ctx, viewPerm) : false;
}

/**
 * Check if user can advance a specific stage.
 */
export function checkStageAdvance(ctx, fromStage) {
  const advanceMap = {
    design:     P.ORDERS_STAGE_DESIGN_ADVANCE,
    printing:   P.ORDERS_STAGE_PRINTING_ADVANCE,
    production: P.ORDERS_STAGE_PRODUCTION_ADVANCE,
    shipping:   P.ORDERS_STAGE_SHIPPING_ADVANCE,
  };
  const perm = advanceMap[fromStage];
  return perm ? check(ctx, perm) : false;
}

/**
 * Check if user can revert a specific stage.
 */
export function checkStageRevert(ctx, stage) {
  const revertMap = {
    design:     P.ORDERS_STAGE_DESIGN_REVERT,
    printing:   P.ORDERS_STAGE_PRINTING_REVERT,
    production: P.ORDERS_STAGE_PRODUCTION_REVERT,
    shipping:   P.ORDERS_STAGE_SHIPPING_REVERT,
    archived:   P.ORDERS_STAGE_ARCHIVE_REVERT,
  };
  const perm = revertMap[stage];
  return perm ? check(ctx, perm) : false;
}

// ══════════════════════════════════════════════════════════
// LEGACY BRIDGE — canDo / canSeeField / hasPage compatibility
// ══════════════════════════════════════════════════════════

/**
 * Bridge: resolve a legacy capability name via the RBAC engine.
 * Maps old capability strings to new permission keys.
 *
 * @param {string} capability — Legacy capability name (e.g., 'manage_payments')
 * @param {string} userRole — User's role
 * @param {Object} userPerms — Legacy userPerms object from Firestore
 * @returns {boolean}
 */
export function legacyCanDo(capability, userRole, userPerms) {
  if (!capability) return false;

  // 1) Legacy user override (users.permissions.capabilities.*)
  const caps = userPerms?.capabilities;
  if (caps && caps[capability] !== undefined) return !!caps[capability];

  // 2) Map to new key and check via role definition
  const newKey = CAPABILITY_TO_PKEY[capability];
  if (newKey) {
    const roleDef = SYSTEM_ROLES[userRole];
    if (roleDef?.permissions?.[newKey] !== undefined) {
      return !!roleDef.permissions[newKey];
    }
  }

  // 3) fail-closed
  return false;
}

/**
 * Bridge: resolve legacy field visibility via RBAC engine.
 */
export function legacyCanSeeField(field, userRole, userPerms) {
  if (!field) return false;
  const ctx = createPermissionContext(userRole, userPerms ? {
    fields: userPerms,
    permissions: userPerms,
    ...userPerms,
  } : undefined);
  return checkField(ctx, field);
}

/**
 * Bridge: resolve legacy page access via RBAC engine.
 */
export function legacyHasPage(page, userRole, userPerms) {
  if (!page) return false;
  const ctx = createPermissionContext(userRole, userPerms ? {
    pages: userPerms?.pages,
  } : undefined);
  return checkPage(ctx, page);
}

// ══════════════════════════════════════════════════════════
// PERMISSION DIFF — Compare effective permissions
// ══════════════════════════════════════════════════════════

/**
 * Get the effective (resolved) permissions for a user context.
 * Returns a map of { [permKey]: boolean } with all permissions resolved.
 */
export function getEffectivePermissions(ctx) {
  const result = {};
  for (const key of Object.values(P)) {
    result[key] = check(ctx, key);
  }
  return result;
}

/**
 * Get the diff between a role's defaults and the user's effective permissions.
 * Returns only the overridden permissions.
 */
export function getPermissionDiff(ctx) {
  const diff = {};
  const roleDef = ctx.roleDef;
  if (!roleDef) return diff;

  for (const key of Object.values(P)) {
    const roleDefault = !!roleDef.permissions?.[key];
    const effective = check(ctx, key);
    if (roleDefault !== effective) {
      diff[key] = { roleDefault, effective, overridden: true };
    }
  }
  return diff;
}

/**
 * Get a human-readable permission summary for audit/display.
 */
export function getPermissionSummary(ctx) {
  const granted = [];
  const denied = [];
  const overridden = [];

  const diff = getPermissionDiff(ctx);

  for (const key of Object.values(P)) {
    const effective = check(ctx, key);
    if (effective) {
      granted.push(key);
    } else {
      denied.push(key);
    }
    if (diff[key]) {
      overridden.push({
        key,
        from: diff[key].roleDefault,
        to: diff[key].effective,
      });
    }
  }

  return {
    roleId: ctx.roleId,
    totalPermissions: Object.values(P).length,
    granted: granted.length,
    denied: denied.length,
    overridden: overridden.length,
    overrides: overridden,
    pages: checkPage(ctx, '*') ? ['*'] : (ctx.roleDef?.pages || []),
    domains: getAllowedDomains(ctx),
  };
}

// ══════════════════════════════════════════════════════════
// ROLE COMPARISON — Compare two roles
// ══════════════════════════════════════════════════════════

/**
 * Compare permissions between two roles/contexts.
 * Returns differences categorized by type.
 */
export function comparePermissions(ctxA, ctxB) {
  const onlyA = [];
  const onlyB = [];
  const both = [];

  for (const key of Object.values(P)) {
    const a = check(ctxA, key);
    const b = check(ctxB, key);
    if (a && !b) onlyA.push(key);
    else if (!a && b) onlyB.push(key);
    else if (a && b) both.push(key);
  }

  return { onlyA, onlyB, both };
}

// ══════════════════════════════════════════════════════════
// VALIDATION — Validate permission structures
// ══════════════════════════════════════════════════════════

/**
 * Validate a role definition structure.
 * Returns { ok, errors }.
 */
export function validateRoleDefinition(roleDef) {
  const errors = [];

  if (!roleDef?.id) errors.push('Missing role ID');
  if (!roleDef?.label?.ar && !roleDef?.label?.en) errors.push('Missing role label');
  if (!roleDef?.permissions || typeof roleDef.permissions !== 'object') {
    errors.push('Missing or invalid permissions object');
  }
  if (!Array.isArray(roleDef?.pages)) errors.push('pages must be an array');
  if (!Array.isArray(roleDef?.domains)) errors.push('domains must be an array');

  if (roleDef?.permissions) {
    const validKeys = new Set(Object.values(P));
    for (const key of Object.keys(roleDef.permissions)) {
      if (!validKeys.has(key)) {
        errors.push(`Unknown permission key: ${key}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate user overrides structure.
 */
export function validateUserOverrides(overrides) {
  const errors = [];

  if (overrides?.permissions && typeof overrides.permissions !== 'object') {
    errors.push('permissions must be an object');
  }
  if (overrides?.pages && !Array.isArray(overrides.pages)) {
    errors.push('pages must be an array');
  }
  if (overrides?.stageAccess && !Array.isArray(overrides.stageAccess)) {
    errors.push('stageAccess must be an array');
  }

  if (overrides?.permissions) {
    const validKeys = new Set(Object.values(P));
    for (const key of Object.keys(overrides.permissions)) {
      if (!validKeys.has(key)) {
        errors.push(`Unknown permission key in overrides: ${key}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
