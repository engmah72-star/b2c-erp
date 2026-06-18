/**
 * core/rbac/rbac-firestore.js — Firestore Integration for RBAC
 *
 * Handles reading/writing custom roles and user permission overrides
 * from/to Firestore. System roles are defined in code (role-definitions.js);
 * custom roles are stored in `roles/{roleId}` collection.
 *
 * User overrides stored at: `users/{uid}.rbac_overrides`
 *
 * Dependencies:
 *   - core/firebase-init.js (Firestore instance)
 *   - core/audit.js (audit logging)
 */

import { SYSTEM_ROLES } from './role-definitions.js';
import { validateRoleDefinition, validateUserOverrides, P } from './index.js';

// ══════════════════════════════════════════════════════════
// ROLE CRUD — Custom role management
// ══════════════════════════════════════════════════════════

/**
 * Save a custom role to Firestore.
 * @param {Object} db — Firestore instance
 * @param {Object} roleDef — Role definition object
 * @param {Object} actor — { uid, displayName } of the user making the change
 * @returns {{ ok: boolean, errors?: string[] }}
 */
export async function saveCustomRole(db, roleDef, actor) {
  const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const validation = validateRoleDefinition(roleDef);
  if (!validation.ok) return validation;

  if (SYSTEM_ROLES[roleDef.id]) {
    return { ok: false, errors: ['Cannot overwrite system role: ' + roleDef.id] };
  }

  const data = {
    ...roleDef,
    updatedAt: serverTimestamp(),
    updatedBy: actor?.uid || 'system',
    updatedByName: actor?.displayName || 'system',
  };

  if (!roleDef.createdAt) {
    data.createdAt = serverTimestamp();
    data.createdBy = actor?.uid || 'system';
    data.createdByName = actor?.displayName || 'system';
  }

  await setDoc(doc(db, 'roles', roleDef.id), data, { merge: true });
  return { ok: true };
}

/**
 * Delete a custom role from Firestore.
 * System roles cannot be deleted.
 */
export async function deleteCustomRole(db, roleId) {
  if (SYSTEM_ROLES[roleId]) {
    return { ok: false, errors: ['Cannot delete system role: ' + roleId] };
  }

  const { doc, deleteDoc, collection, query, where, getDocs, limit } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const usersWithRole = await getDocs(
    query(collection(db, 'users'), where('role', '==', roleId), limit(1))
  );
  if (!usersWithRole.empty) {
    return { ok: false, errors: ['Role is in use by at least one user. Reassign them first.'] };
  }

  await deleteDoc(doc(db, 'roles', roleId));
  return { ok: true };
}

/**
 * Load a role definition (system or custom) by ID.
 */
export async function loadRole(db, roleId) {
  if (SYSTEM_ROLES[roleId]) {
    return { ok: true, role: SYSTEM_ROLES[roleId], isSystem: true };
  }

  const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const snap = await getDoc(doc(db, 'roles', roleId));
  if (!snap.exists()) {
    return { ok: false, errors: ['Role not found: ' + roleId] };
  }
  return { ok: true, role: snap.data(), isSystem: false };
}

/**
 * Load all roles (system + custom).
 */
export async function loadAllRoles(db) {
  const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const roles = { ...SYSTEM_ROLES };

  const customSnap = await getDocs(collection(db, 'roles'));
  customSnap.forEach(doc => {
    roles[doc.id] = { ...doc.data(), id: doc.id, isSystem: false };
  });

  return roles;
}

// ══════════════════════════════════════════════════════════
// USER OVERRIDES — Per-user permission management
// ══════════════════════════════════════════════════════════

/**
 * Save user-specific permission overrides.
 * Stored at users/{uid}.rbac_overrides to avoid conflict with
 * legacy `users/{uid}.permissions` field.
 *
 * @param {Object} db — Firestore instance
 * @param {string} uid — User ID
 * @param {Object} overrides — Permission overrides
 * @param {Object} actor — Who is making this change
 */
export async function saveUserOverrides(db, uid, overrides, actor) {
  const validation = validateUserOverrides(overrides);
  if (!validation.ok) return validation;

  const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  await updateDoc(doc(db, 'users', uid), {
    rbac_overrides: {
      ...overrides,
      updatedAt: serverTimestamp(),
      updatedBy: actor?.uid || 'system',
    },
  });

  return { ok: true };
}

/**
 * Load user-specific permission overrides.
 */
export async function loadUserOverrides(db, uid) {
  const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data()?.rbac_overrides || null;
}

/**
 * Grant a specific permission to a user (override).
 */
export async function grantPermission(db, uid, permissionKey, actor) {
  const { doc, getDoc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  if (!Object.values(P).includes(permissionKey)) {
    return { ok: false, errors: ['Invalid permission key: ' + permissionKey] };
  }

  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return { ok: false, errors: ['User not found'] };

  const current = snap.data()?.rbac_overrides?.permissions || {};
  current[permissionKey] = true;

  await updateDoc(doc(db, 'users', uid), {
    'rbac_overrides.permissions': current,
    'rbac_overrides.updatedAt': serverTimestamp(),
    'rbac_overrides.updatedBy': actor?.uid || 'system',
  });

  return { ok: true };
}

/**
 * Deny (revoke) a specific permission from a user (override).
 */
export async function denyPermission(db, uid, permissionKey, actor) {
  const { doc, getDoc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  if (!Object.values(P).includes(permissionKey)) {
    return { ok: false, errors: ['Invalid permission key: ' + permissionKey] };
  }

  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return { ok: false, errors: ['User not found'] };

  const current = snap.data()?.rbac_overrides?.permissions || {};
  current[permissionKey] = false;

  await updateDoc(doc(db, 'users', uid), {
    'rbac_overrides.permissions': current,
    'rbac_overrides.updatedAt': serverTimestamp(),
    'rbac_overrides.updatedBy': actor?.uid || 'system',
  });

  return { ok: true };
}

/**
 * Remove a specific override (revert to role default).
 */
export async function removeOverride(db, uid, permissionKey, actor) {
  const { doc, getDoc, updateDoc, deleteField, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return { ok: false, errors: ['User not found'] };

  const current = snap.data()?.rbac_overrides?.permissions || {};
  delete current[permissionKey];

  await updateDoc(doc(db, 'users', uid), {
    'rbac_overrides.permissions': current,
    'rbac_overrides.updatedAt': serverTimestamp(),
    'rbac_overrides.updatedBy': actor?.uid || 'system',
  });

  return { ok: true };
}

/**
 * Set the stage access restriction for a user.
 * @param {string[]} stages — Array of stage names, or empty to remove restriction
 */
export async function setStageAccess(db, uid, stages, actor) {
  const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const validStages = ['design', 'printing', 'production', 'shipping', 'archived'];
  const invalid = stages.filter(s => !validStages.includes(s));
  if (invalid.length > 0) {
    return { ok: false, errors: ['Invalid stages: ' + invalid.join(', ')] };
  }

  await updateDoc(doc(db, 'users', uid), {
    'rbac_overrides.stageAccess': stages,
    'rbac_overrides.updatedAt': serverTimestamp(),
    'rbac_overrides.updatedBy': actor?.uid || 'system',
  });

  return { ok: true };
}

/**
 * Change a user's role.
 */
export async function changeUserRole(db, uid, newRoleId, actor) {
  const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const allRoles = await loadAllRoles(db);
  if (!allRoles[newRoleId]) {
    return { ok: false, errors: ['Role not found: ' + newRoleId] };
  }

  await updateDoc(doc(db, 'users', uid), {
    role: newRoleId,
    'rbac_overrides.updatedAt': serverTimestamp(),
    'rbac_overrides.updatedBy': actor?.uid || 'system',
  });

  return { ok: true };
}

// ══════════════════════════════════════════════════════════
// BULK OPERATIONS
// ══════════════════════════════════════════════════════════

/**
 * Apply a role template to a user, resetting all overrides.
 */
export async function resetUserToRoleDefaults(db, uid, actor) {
  const { doc, updateDoc, deleteField, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  await updateDoc(doc(db, 'users', uid), {
    rbac_overrides: deleteField(),
  });

  return { ok: true };
}

/**
 * Get all users with a specific role.
 */
export async function getUsersByRole(db, roleId) {
  const { collection, query, where, getDocs, limit: fbLimit } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const snap = await getDocs(
    query(collection(db, 'users'), where('role', '==', roleId), fbLimit(500))
  );

  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/**
 * Audit log for permission changes.
 */
export function buildPermissionAuditEntry(action, targetUid, changes, actor) {
  return {
    type: 'permission_change',
    action,
    targetUid,
    changes,
    by: actor?.displayName || 'system',
    byId: actor?.uid || 'system',
    date: new Date().toISOString(),
    kind: 'op',
  };
}
