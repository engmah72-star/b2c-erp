/**
 * Node-runnable tests for core/client-portal/client-portal-config.js
 * Run: node tests/core-client-portal-config.test.mjs
 *
 * Pure tests — no Firestore, no DOM. Validates the Client Portal Phase-1 foundation:
 * feature flag, client capability registry, and the client-facing status PROJECTION
 * (which must derive from order.stage only — W1.1 / C1.2).
 */
import {
  CLIENT_PORTAL_FLAG, isClientPortalEnabled,
  CLIENT_COLLECTIONS, CLIENT_ACCOUNT_STATUS,
  CLIENT_CAPABILITIES, DEFAULT_CLIENT_CAPABILITIES, canClientDo,
  CLIENT_EDITABLE_PROFILE_FIELDS,
  CLIENT_ORDER_STATUS, CLIENT_STATUS_META,
  clientFacingStatus, clientStatusLabel,
  CLIENT_SESSION, clientAuditActorId,
} from '../core/client-portal/client-portal-config.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assert(cond, hint = '') { if (!cond) throw new Error(`assertion failed ${hint}`); }

// ── Feature flag (default OFF — RULE E1.8) ──
test('flag name is clientPortal.v2', () => assertEq(CLIENT_PORTAL_FLAG, 'clientPortal.v2'));
test('isClientPortalEnabled defaults to false with no resolver', () =>
  assertEq(isClientPortalEnabled(), false));
test('isClientPortalEnabled false when resolver returns false', () =>
  assertEq(isClientPortalEnabled(() => false), false));
test('isClientPortalEnabled true only when resolver returns true', () =>
  assertEq(isClientPortalEnabled((n, d) => n === 'clientPortal.v2' ? true : d), true));

// ── Collections (additive — RULE 6) ──
test('new collections are namespaced & frozen', () => {
  assertEq(CLIENT_COLLECTIONS.CLIENT_USERS, 'client_users');
  assertEq(CLIENT_COLLECTIONS.CLIENT_NOTIFICATIONS, 'client_notifications');
  assertEq(CLIENT_COLLECTIONS.CLIENT_ACTIVITY_LOG, 'client_activity_log');
  assert(Object.isFrozen(CLIENT_COLLECTIONS));
});

// ── Capabilities (RULE P1 — client is a separate actor) ──
test('every default capability key exists in the registry', () => {
  const reg = new Set(Object.values(CLIENT_CAPABILITIES));
  for (const cap of Object.keys(DEFAULT_CLIENT_CAPABILITIES)) {
    assert(reg.has(cap), `unknown capability in defaults: ${cap}`);
  }
});
test('all client capabilities are cp_-namespaced (distinct from internal roles)', () => {
  for (const cap of Object.values(CLIENT_CAPABILITIES)) {
    assert(cap.startsWith('cp_'), `capability not cp_-prefixed: ${cap}`);
  }
});
test('canClientDo returns default for active client without overrides', () =>
  assertEq(canClientDo(CLIENT_CAPABILITIES.CREATE_ORDER, { status: 'active' }), true));
test('canClientDo honors per-account override (P1.7)', () =>
  assertEq(canClientDo(CLIENT_CAPABILITIES.CREATE_ORDER,
    { status: 'active', capabilities: { cp_create_order: false } }), false));
test('disabled account can do nothing (X1.2)', () =>
  assertEq(canClientDo(CLIENT_CAPABILITIES.VIEW_OWN_ORDERS,
    { status: CLIENT_ACCOUNT_STATUS.DISABLED }), false));
test('pending account can do nothing (X1.2)', () =>
  assertEq(canClientDo(CLIENT_CAPABILITIES.VIEW_OWN_ORDERS,
    { status: CLIENT_ACCOUNT_STATUS.PENDING }), false));
test('unknown capability is denied', () =>
  assertEq(canClientDo('cp_make_me_admin', { status: 'active' }), false));
test('no internal/financial capability is granted to clients', () => {
  for (const bad of ['view_financials', 'manage_payments', 'price_cost', 'supplier_cost', 'system_settings']) {
    assertEq(canClientDo(bad, { status: 'active' }), false, `leaked: ${bad}`);
  }
});

// ── Profile edit whitelist (RULE 8 / R1.3) ──
test('profile whitelist excludes staff-only fields', () => {
  for (const forbidden of ['status', 'internalNotes', 'tags', 'totalSpentLegacy', 'createdBy']) {
    assert(!CLIENT_EDITABLE_PROFILE_FIELDS.includes(forbidden), `whitelist leaks ${forbidden}`);
  }
  assert(CLIENT_EDITABLE_PROFILE_FIELDS.includes('name'));
  assert(CLIENT_EDITABLE_PROFILE_FIELDS.includes('logoUrl'));
});

// ── Status projection (W1.1 — derived from order.stage only) ──
test('archived → completed', () =>
  assertEq(clientFacingStatus({ stage: 'archived' }), CLIENT_ORDER_STATUS.COMPLETED));
test('cancelled → cancelled', () =>
  assertEq(clientFacingStatus({ stage: 'cancelled' }), CLIENT_ORDER_STATUS.CANCELLED));
test('shipping → shipping', () =>
  assertEq(clientFacingStatus({ stage: 'shipping' }), CLIENT_ORDER_STATUS.SHIPPING));
test('printing → production', () =>
  assertEq(clientFacingStatus({ stage: 'printing' }), CLIENT_ORDER_STATUS.PRODUCTION));
test('production → production', () =>
  assertEq(clientFacingStatus({ stage: 'production' }), CLIENT_ORDER_STATUS.PRODUCTION));
test('design + designStage approved → approved', () =>
  assertEq(clientFacingStatus({ stage: 'design', designStage: 'approved' }), CLIENT_ORDER_STATUS.APPROVED));
test('design + awaitingApproval opt → awaiting_approval', () =>
  assertEq(clientFacingStatus({ stage: 'design', designStage: 'wip' }, { awaitingApproval: true }),
    CLIENT_ORDER_STATUS.AWAITING_APPROVAL));
test('design + intake new → new', () =>
  assertEq(clientFacingStatus({ stage: 'design', designStage: 'pending', intakeStatus: 'new' }),
    CLIENT_ORDER_STATUS.NEW));
test('design + intake under_review → under_review', () =>
  assertEq(clientFacingStatus({ stage: 'design', designStage: 'pending', intakeStatus: 'under_review' }),
    CLIENT_ORDER_STATUS.UNDER_REVIEW));
test('design + wip (no intake flag) → design_in_progress', () =>
  assertEq(clientFacingStatus({ stage: 'design', designStage: 'wip' }),
    CLIENT_ORDER_STATUS.DESIGN_IN_PROGRESS));
test('missing/unknown stage → new', () =>
  assertEq(clientFacingStatus({}), CLIENT_ORDER_STATUS.NEW));
test('every projected status has label+token meta (U1.5)', () => {
  for (const s of Object.values(CLIENT_ORDER_STATUS)) {
    const m = CLIENT_STATUS_META[s];
    assert(m && m.label && m.token, `missing meta for ${s}`);
  }
});
test('clientStatusLabel returns Arabic label', () =>
  assertEq(clientStatusLabel({ stage: 'archived' }), 'مكتمل'));

// ── Session + audit ──
test('session TTL is 7 days', () =>
  assertEq(CLIENT_SESSION.TTL_MS, 7 * 24 * 60 * 60 * 1000));
test('audit actor id is namespaced client:<uid> (H3)', () =>
  assertEq(clientAuditActorId('abc123'), 'client:abc123'));
test('audit actor id falls back to client:anonymous', () =>
  assertEq(clientAuditActorId(), 'client:anonymous'));

// ── summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
