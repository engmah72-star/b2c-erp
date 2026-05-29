// core/client-portal/client-portal-config.js
// ─────────────────────────────────────────────────────────────────────────────
// CLIENT PORTAL — Phase 1 Foundation (config + capability registry + projection)
//
// This is the central, pure module every later Client Portal page plugs into.
// It owns NO workflow logic, NO money, NO stage authority (PC1, C1, A1, RULE 4).
// It is a Layer-1 pure module: no DOM, no Firestore writes, Node-importable & testable.
//
// Governance:
//   • RULE E1   — entire portal ships behind `clientPortal.v2` (default false), additive,
//                 alongside the legacy phone+order-code portal, reversible.
//   • RULE 8/P1 — the client is a SEPARATE actor, NOT one of the 8 internal roles.
//                 Client capabilities live here, mirrored server-side in firestore.rules.
//   • W1.1/C1.2 — `order.stage` stays the single source of truth. Client-facing statuses
//                 are a PURE PROJECTION (clientFacingStatus), never a stored 2nd state.
//   • RULE 6    — additive only; existing collections/schemas untouched.
//
// See CLIENT_PORTAL_ARCHITECTURE.md for the full Phase-1 spec & module definition.
//
// NOTE on stage values: this module reads the *persisted* `order.stage` /
// `order.designStage` string contract directly (same convention as
// `core/shared-constants.js`, which keys by `design:`/`printing:` literals).
// The canonical enum is `ORDER_STAGES` / `ORDER_DESIGN_STAGES` in `orders.js`;
// the literals below MUST stay in sync with it (C2). We avoid importing
// `orders.js` so this stays a pure, Node-testable Layer-1 module (it would
// otherwise pull in `core/firebase-init.js` and its browser-only SDK imports).
// ─────────────────────────────────────────────────────────────────────────────

// Mirror of ORDER_STAGES (orders.js) — the persisted order.stage contract.
const STAGE = Object.freeze({
  DESIGN: 'design', PRINTING: 'printing', PRODUCTION: 'production',
  SHIPPING: 'shipping', ARCHIVED: 'archived', CANCELLED: 'cancelled',
});
// Mirror of ORDER_DESIGN_STAGES (orders.js) — the persisted order.designStage contract.
const DESIGN_STAGE = Object.freeze({
  PENDING: 'pending', WIP: 'wip', AWAITING_PAYMENT: 'awaiting_payment',
  APPROVED: 'approved', REJECTED: 'rejected',
});

// ── Feature flag ─────────────────────────────────────────────────────────────
// Resolved via core/feature-flags.js (URL ?feat.clientPortal.v2=1 → localStorage → default).
export const CLIENT_PORTAL_FLAG = 'clientPortal.v2';

/**
 * Is the Phase-1 Client Portal v2 surface enabled in this browser/session?
 * Falls back to `false` everywhere (incl. Node/tests) so the legacy portal stays
 * the only active surface until the flag is explicitly turned on (RULE E1.8).
 * @param {(name:string, def?:boolean)=>boolean} [isFeatureEnabled] - injected to keep this pure/testable
 */
export function isClientPortalEnabled(isFeatureEnabled) {
  if (typeof isFeatureEnabled === 'function') {
    return isFeatureEnabled(CLIENT_PORTAL_FLAG, false) === true;
  }
  return false;
}

// ── New collections owned by the portal (additive — RULE 6 / F1.3) ───────────
export const CLIENT_COLLECTIONS = Object.freeze({
  CLIENT_USERS:         'client_users',          // auth uid ↔ company link (identity)
  CLIENT_NOTIFICATIONS: 'client_notifications',   // Module 6
  CLIENT_ACTIVITY_LOG:  'client_activity_log',    // Module 7 (account-bound actions)
  // Reused (NOT owned): clients, orders, design_items, client_decisions, returns_tickets
});

// ── Account lifecycle (X1.2) ─────────────────────────────────────────────────
export const CLIENT_ACCOUNT_STATUS = Object.freeze({
  PENDING:  'pending',   // created, not yet verified
  ACTIVE:   'active',    // verified & allowed to log in
  DISABLED: 'disabled',  // suspended — login blocked
});

// ── Client capability registry (RULE P1 — separate from internal capabilities) ─
// Prefix `cp_` keeps the client namespace distinct from the 8 internal roles' caps.
export const CLIENT_CAPABILITIES = Object.freeze({
  VIEW_OWN_ORDERS:      'cp_view_own_orders',
  CREATE_ORDER:         'cp_create_order',
  UPLOAD_FILES:         'cp_upload_files',
  VIEW_DESIGNS:         'cp_view_designs',
  APPROVE_DESIGN:       'cp_approve_design',
  REQUEST_REVISION:     'cp_request_revision',
  VIEW_COMPANY_PROFILE: 'cp_view_company_profile',
  EDIT_COMPANY_PROFILE: 'cp_edit_company_profile',
  MANAGE_PREFS:         'cp_manage_prefs',
  REQUEST_RETURN:       'cp_request_return',
  VIEW_INVOICES:        'cp_view_invoices',       // read-only summary; never cost/margin
});

// Default bundle granted to every ACTIVE authenticated client.
// Per-account overrides live in client_users/{uid}.capabilities (P1.7).
export const DEFAULT_CLIENT_CAPABILITIES = Object.freeze({
  [CLIENT_CAPABILITIES.VIEW_OWN_ORDERS]:      true,
  [CLIENT_CAPABILITIES.CREATE_ORDER]:         true,
  [CLIENT_CAPABILITIES.UPLOAD_FILES]:         true,
  [CLIENT_CAPABILITIES.VIEW_DESIGNS]:         true,
  [CLIENT_CAPABILITIES.APPROVE_DESIGN]:       true,
  [CLIENT_CAPABILITIES.REQUEST_REVISION]:     true,
  [CLIENT_CAPABILITIES.VIEW_COMPANY_PROFILE]: true,
  [CLIENT_CAPABILITIES.EDIT_COMPANY_PROFILE]: true,
  [CLIENT_CAPABILITIES.MANAGE_PREFS]:         true,
  [CLIENT_CAPABILITIES.REQUEST_RETURN]:       true,
  [CLIENT_CAPABILITIES.VIEW_INVOICES]:        true,
});

/**
 * Capability check for a client actor. Merges defaults + per-account overrides
 * (override wins — P1.7). Pure; UI hides controls when this returns false (P1.5).
 * @param {string} capability  one of CLIENT_CAPABILITIES
 * @param {object} [clientUser] client_users doc ({ status, capabilities })
 */
export function canClientDo(capability, clientUser) {
  if (!capability) return false;
  // Disabled / non-active accounts can do nothing (X1.2).
  if (clientUser && clientUser.status && clientUser.status !== CLIENT_ACCOUNT_STATUS.ACTIVE) {
    return false;
  }
  const overrides = (clientUser && clientUser.capabilities) || {};
  if (Object.prototype.hasOwnProperty.call(overrides, capability)) {
    return overrides[capability] === true;
  }
  return DEFAULT_CLIENT_CAPABILITIES[capability] === true;
}

// Fields a client may edit on their own `clients` (company) doc. Server rules
// mirror this whitelist — everything else (status, tags, internalNotes, balances)
// is staff-only (RULE 8 / R1.3). Editing-by-omission keeps the boundary explicit.
export const CLIENT_EDITABLE_PROFILE_FIELDS = Object.freeze([
  'name', 'logoUrl', 'sector', 'description', 'website',
  'socialLinks', 'governorate', 'city', 'address',
  'email', 'phone2', 'intlCountryCode', 'intlPhone',
]);

// ── Client-facing order status PROJECTION (W1.1 — order.stage stays SSOT) ─────
// The 8 statuses from the spec, plus `cancelled` (already a real stage).
export const CLIENT_ORDER_STATUS = Object.freeze({
  NEW:                 'new',                  // created, not yet reviewed by CS
  UNDER_REVIEW:        'under_review',         // CS reviewing intake
  DESIGN_IN_PROGRESS:  'design_in_progress',   // designer working
  AWAITING_APPROVAL:   'awaiting_approval',    // version uploaded, needs client decision
  APPROVED:            'approved',             // client approved → ready to print
  PRODUCTION:          'production',           // printing / production
  SHIPPING:            'shipping',             // out for delivery
  COMPLETED:           'completed',            // delivered / archived
  CANCELLED:           'cancelled',
});

// Client-safe Arabic labels + which shared.css status token to tint with (U1.5).
export const CLIENT_STATUS_META = Object.freeze({
  [CLIENT_ORDER_STATUS.NEW]:                { label: 'جديد',            token: 'st-new' },
  [CLIENT_ORDER_STATUS.UNDER_REVIEW]:       { label: 'قيد المراجعة',     token: 'st-new' },
  [CLIENT_ORDER_STATUS.DESIGN_IN_PROGRESS]: { label: 'جاري التصميم',     token: 'st-design' },
  [CLIENT_ORDER_STATUS.AWAITING_APPROVAL]:  { label: 'في انتظار اعتمادك', token: 'st-late' },
  [CLIENT_ORDER_STATUS.APPROVED]:           { label: 'تم الاعتماد',      token: 'st-completed' },
  [CLIENT_ORDER_STATUS.PRODUCTION]:         { label: 'تحت التنفيذ',      token: 'st-print' },
  [CLIENT_ORDER_STATUS.SHIPPING]:           { label: 'قيد الشحن',        token: 'st-print' },
  [CLIENT_ORDER_STATUS.COMPLETED]:          { label: 'مكتمل',           token: 'st-completed' },
  [CLIENT_ORDER_STATUS.CANCELLED]:          { label: 'ملغي',            token: 'st-urgent' },
});

/**
 * Project the internal order state onto a client-facing status. PURE — reads only,
 * derives nothing it stores. `order.stage` remains the single source of truth.
 *
 * @param {object} order  { stage, designStage, intakeStatus }
 * @param {object} [opts]
 * @param {boolean} [opts.awaitingApproval] true when ≥1 design_item has an undecided
 *        uploaded version (computed by the caller from design_items / client_decisions)
 * @returns {string} one of CLIENT_ORDER_STATUS
 */
export function clientFacingStatus(order, opts = {}) {
  if (!order || !order.stage) return CLIENT_ORDER_STATUS.NEW;
  const { awaitingApproval = false } = opts;

  switch (order.stage) {
    case STAGE.CANCELLED:
      return CLIENT_ORDER_STATUS.CANCELLED;
    case STAGE.ARCHIVED:
      return CLIENT_ORDER_STATUS.COMPLETED;
    case STAGE.SHIPPING:
      return CLIENT_ORDER_STATUS.SHIPPING;
    case STAGE.PRINTING:
    case STAGE.PRODUCTION:
      return CLIENT_ORDER_STATUS.PRODUCTION;
    case STAGE.DESIGN: {
      const ds = order.designStage;
      if (ds === DESIGN_STAGE.APPROVED) return CLIENT_ORDER_STATUS.APPROVED;
      if (awaitingApproval) return CLIENT_ORDER_STATUS.AWAITING_APPROVAL;
      // Brand-new client-portal intake not yet picked up by CS.
      if (order.intakeStatus === 'new') return CLIENT_ORDER_STATUS.NEW;
      if (order.intakeStatus === 'under_review') return CLIENT_ORDER_STATUS.UNDER_REVIEW;
      if (ds === DESIGN_STAGE.WIP) return CLIENT_ORDER_STATUS.DESIGN_IN_PROGRESS;
      // pending / awaiting_payment / rejected fall back to review-state for the client.
      return CLIENT_ORDER_STATUS.UNDER_REVIEW;
    }
    default:
      return CLIENT_ORDER_STATUS.UNDER_REVIEW;
  }
}

/** Convenience: client-safe label for an order (for chips/cards). */
export function clientStatusLabel(order, opts) {
  const s = clientFacingStatus(order, opts);
  return (CLIENT_STATUS_META[s] || {}).label || s;
}

// ── Session config ───────────────────────────────────────────────────────────
export const CLIENT_SESSION = Object.freeze({
  TTL_MS:          7 * 24 * 60 * 60 * 1000,  // 7 days (matches legacy portal)
  REMEMBER_TTL_MS: 30 * 24 * 60 * 60 * 1000, // 30 days when "remember me"
  STORAGE_KEY:     'clientSession',          // legacy key — kept for back-compat
});

// ── Audit actor namespace (H3) ───────────────────────────────────────────────
/** Build the audit `userId` for a client actor: `client:<uid>` (keeps staff/client distinct). */
export function clientAuditActorId(authUid) {
  return `client:${authUid || 'anonymous'}`;
}
