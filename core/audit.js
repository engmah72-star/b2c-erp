/**
 * Business2Card ERP — core/audit.js
 *
 * ━━━ UNIVERSAL AUDIT INVARIANT (P1.0.5) ━━━
 *
 * المبدأ المعماري:
 *   "مركزية التاريخ — كل حاجة لها date + مسؤول"
 *
 * كل mutation على Order أو entity مرتبط لازم يحمل:
 *   - date         (متى)
 *   - by + byId    (من المسؤول)
 *   - action       (نص الإجراء)
 *   - kind         (نوع الـ entry — op/edit/system/heal/reversal)
 *
 * هذا الـ module يوفّر:
 *   1. auditEntry({...})       — builder موحَّد، يفرض الـ contract بـ throw
 *   2. nowStr()                — تاريخ Arabic locale موحَّد
 *   3. validateAuditShape(e)   — يتحقّق من entry موجودة
 *   4. auditTimelineHealth([]) — diagnostic counts على array
 *   5. AUDIT_KINDS             — enum للأنواع المسموحة
 *   6. persistAuditLog({...})  — centralized best-effort write to audit_logs
 *   7. addAuditToBatch(batch,{...}) — audit_logs ref for atomic batches
 *
 * Usage:
 *   import { auditEntry } from './core/audit.js';
 *   batch.update(orderRef, {
 *     stage: 'shipping',
 *     timeline: [...(order.timeline || []), auditEntry({
 *       action: '🚚 تم الشحن',
 *       userId: me.uid,
 *       userName: me.displayName,
 *       kind: 'op',
 *     })],
 *     updatedAt: serverTimestamp(),
 *   });
 *
 * No-actor mutations are forbidden. The helper throws if userId is missing.
 * Even system actions (Cloud Functions) must pass a meaningful actor id
 * (e.g., 'system:cloud-function-name' or 'system:cron').
 */

import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db as defaultDb } from './firebase-init.js';

// ── Audit kinds enum ──────────────────────────────────────────────
export const AUDIT_KINDS = Object.freeze({
  OP:       'op',         // user-initiated operation (settle/collect/dispatch/…)
  EDIT:     'edit',       // field-level edit (cost/discount/note/…)
  SYSTEM:   'system',     // Cloud Function or automated trigger
  HEAL:     'self-heal',  // self-healing repair (applyOrderHealPatch)
  REVERSAL: 'reversal',   // explicit reversal (settlement/payment/return)
});

const _VALID_KINDS = new Set(Object.values(AUDIT_KINDS));

// ── Unified time string (Arabic locale) ──────────────────────────
/**
 * Single source of truth for human-readable timestamp on timeline entries.
 * Format: "YYYY/MM/DD HH:MM" in Arabic locale.
 * Use serverTimestamp() separately for Firestore-native ordering.
 */
export function nowStr() {
  const d = new Date();
  return d.toLocaleDateString('ar-EG') + ' ' +
         d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

// ── Canonical entry builder ──────────────────────────────────────
/**
 * Builds a complete audit entry. Throws on missing actor (universal invariant).
 *
 * @param {Object} args
 * @param {string} args.action          — required, human-readable text
 * @param {string} [args.userId]        — actor id (required — alias: byId)
 * @param {string} [args.userName]      — actor name (optional — alias: by)
 * @param {string} [args.kind='op']     — one of AUDIT_KINDS
 * @param {string} [args.byId]          — legacy alias for userId
 * @param {string} [args.by]            — legacy alias for userName
 * @param {Object} [args.meta]          — arbitrary extra context (must serialize)
 * @returns {{date, action, by, byId, kind, ...meta}}
 */
export function auditEntry(args = {}) {
  const { action, kind = 'op', meta = null } = args;
  // accept both new (userId/userName) and legacy (byId/by) for backward-compat
  const actorId   = args.userId   || args.byId || '';
  const actorName = args.userName || args.by   || '';

  if (!action || typeof action !== 'string') {
    throw new Error('[AUDIT] action مطلوب — لازم يكون نص يصف العملية');
  }
  if (!actorId) {
    throw new Error('[AUDIT] userId/byId مطلوب — كل mutation لازم لها مسؤول');
  }
  if (!_VALID_KINDS.has(kind)) {
    throw new Error(
      `[AUDIT] kind '${kind}' غير صالح. المسموح: ${[..._VALID_KINDS].join(', ')}`
    );
  }

  const entry = {
    date: nowStr(),
    action,
    by:   actorName,
    byId: actorId,
    kind,
  };
  if (meta && typeof meta === 'object') {
    entry.meta = meta;
  }
  return entry;
}

// ── Audit kind helpers (sugar) ───────────────────────────────────
/** Shortcut for user-initiated operations (the common case). */
export function opEntry({ action, userId, userName, meta }) {
  return auditEntry({ action, userId, userName, kind: AUDIT_KINDS.OP, meta });
}

/** Shortcut for system/cloud-function actions. */
export function systemEntry({ action, source = 'system', meta }) {
  // System actions don't have a user — actorId is the source name.
  return auditEntry({
    action,
    userId: `system:${source}`,
    userName: source,
    kind: AUDIT_KINDS.SYSTEM,
    meta,
  });
}

/** Shortcut for self-healing repair actions. */
export function healEntry({ action, source = 'self-heal', meta }) {
  return auditEntry({
    action,
    userId: `system:${source}`,
    userName: source,
    kind: AUDIT_KINDS.HEAL,
    meta,
  });
}

/** Shortcut for reversal actions (link to original). */
export function reversalEntry({ action, userId, userName, reversalOf, meta }) {
  return auditEntry({
    action,
    userId,
    userName,
    kind: AUDIT_KINDS.REVERSAL,
    meta: { ...(meta || {}), reversalOf: reversalOf || null },
  });
}

// ── Validation ───────────────────────────────────────────────────
/**
 * Checks an EXISTING entry conforms to the universal invariant.
 * Used for diagnostics and migration tools — NOT at write time
 * (write time uses auditEntry which builds correctly).
 */
export function validateAuditShape(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') {
    return { ok: false, errors: ['entry must be an object'] };
  }
  if (!entry.action || typeof entry.action !== 'string') {
    errors.push('missing or invalid action');
  }
  if (!entry.byId) {
    errors.push('missing byId (responsible user — universal invariant)');
  }
  if (!entry.date && !entry.timestamp) {
    errors.push('missing date and timestamp');
  }
  // kind is optional on legacy entries
  if (entry.kind && !_VALID_KINDS.has(entry.kind)) {
    errors.push(`invalid kind: ${entry.kind}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Health report for a timeline array. Identifies entries missing the
 * universal invariant. Useful for admin tooling + migration plans.
 *
 * @returns {{total, valid, missingActor, missingDate, byKind:{kind:count}}}
 */
export function auditTimelineHealth(timeline) {
  const stats = {
    total: 0, valid: 0,
    missingActor: 0, missingDate: 0,
    byKind: {},
  };
  for (const e of (timeline || [])) {
    stats.total++;
    const v = validateAuditShape(e);
    if (v.ok) stats.valid++;
    if (!e?.byId) stats.missingActor++;
    if (!e?.date && !e?.timestamp) stats.missingDate++;
    const k = e?.kind || '(unset)';
    stats.byKind[k] = (stats.byKind[k] || 0) + 1;
  }
  return stats;
}

// ── Centralized audit_logs persistence ──────────────────────────
/**
 * Best-effort write to the `audit_logs` collection. Non-blocking: catches
 * errors and logs a warning instead of throwing. Every inline `addDoc` to
 * `audit_logs` across the codebase should delegate here.
 *
 * @param {Object} p
 * @param {import('firebase/firestore').Firestore} [p.db]
 * @param {string} p.action
 * @param {Object} [p.details]
 * @param {string} p.userId
 * @param {string} [p.userName]
 * @param {string} [p.userRole]
 * @param {string} [p.entity]
 * @param {string} [p.source]
 * @returns {Promise<{ok:boolean}>}
 */
export async function persistAuditLog({
  db = defaultDb,
  action, details, userId, userName = '', userRole = '',
  entity = '', source = '',
}) {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      action,
      details: details || {},
      userId: userId || '',
      userName,
      userRole,
      ...(entity ? { entity } : {}),
      ...(source ? { source } : {}),
      timestamp: serverTimestamp(),
      url: typeof location !== 'undefined' ? location.pathname : '',
    });
    return { ok: true };
  } catch (e) {
    console.warn('[audit.persistAuditLog] failed (non-blocking):', action, e?.message);
    return { ok: false };
  }
}

/**
 * Adds an `audit_logs` document ref to an existing WriteBatch (atomic).
 * Used when the audit entry must succeed or fail with the rest of the batch.
 *
 * @param {import('firebase/firestore').WriteBatch} batch
 * @param {Object} p — same shape as persistAuditLog params (minus db)
 * @param {import('firebase/firestore').Firestore} [p.db]
 * @returns {import('firebase/firestore').DocumentReference}
 */
export function addAuditToBatch(batch, {
  db = defaultDb,
  action, details, userId, userName = '', userRole = '',
  entity = '', source = '',
}) {
  const ref = doc(collection(db, 'audit_logs'));
  batch.set(ref, {
    action,
    details: details || {},
    userId: userId || '',
    userName,
    userRole,
    ...(entity ? { entity } : {}),
    ...(source ? { source } : {}),
    timestamp: serverTimestamp(),
    url: typeof location !== 'undefined' ? location.pathname : '',
  });
  return ref;
}
