/**
 * Node-runnable tests for core/audit.js (P1.0.5).
 * Run: node tests/core-audit.test.mjs
 *
 * Pure tests — no Firestore, no DOM. Validates the universal audit invariant.
 */
import {
  auditEntry, opEntry, systemEntry, healEntry, reversalEntry,
  validateAuditShape, auditTimelineHealth,
  nowStr, AUDIT_KINDS,
} from '../core/audit.js';

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
function assertThrows(fn, msgIncludes) {
  try { fn(); } catch (e) {
    if (msgIncludes && !e.message.includes(msgIncludes)) {
      throw new Error(`expected message to include '${msgIncludes}', got '${e.message}'`);
    }
    return;
  }
  throw new Error('expected throw');
}

// ── nowStr ──
test('nowStr returns Arabic-locale date+time string', () => {
  const s = nowStr();
  if (typeof s !== 'string' || s.length < 5) throw new Error('not a string');
});

// ── auditEntry: required fields ──
test('auditEntry throws when action is missing', () => {
  assertThrows(() => auditEntry({ userId: 'u1' }), 'action مطلوب');
});

test('auditEntry throws when userId is missing', () => {
  assertThrows(() => auditEntry({ action: 'x' }), 'userId/byId مطلوب');
});

test('auditEntry throws on invalid kind', () => {
  assertThrows(
    () => auditEntry({ action: 'x', userId: 'u1', kind: 'bogus' }),
    'kind'
  );
});

// ── auditEntry: success path ──
test('auditEntry returns canonical envelope', () => {
  const e = auditEntry({
    action: '🚚 شُحن',
    userId: 'u123',
    userName: 'أحمد',
  });
  assertEq(e.action, '🚚 شُحن');
  assertEq(e.byId, 'u123');
  assertEq(e.by, 'أحمد');
  assertEq(e.kind, 'op');
  if (!e.date) throw new Error('missing date');
});

test('auditEntry accepts legacy aliases byId/by', () => {
  const e = auditEntry({ action: 'x', byId: 'u1', by: 'Ali' });
  assertEq(e.byId, 'u1');
  assertEq(e.by, 'Ali');
});

test('auditEntry prefers userId over byId when both given', () => {
  const e = auditEntry({ action: 'x', userId: 'new', byId: 'old' });
  assertEq(e.byId, 'new');
});

test('auditEntry attaches meta when provided', () => {
  const e = auditEntry({
    action: 'x', userId: 'u1',
    meta: { orderId: 'O1', amount: 100 },
  });
  assertEq(e.meta.orderId, 'O1');
  assertEq(e.meta.amount, 100);
});

// ── kind helpers ──
test('opEntry uses kind=op', () => {
  const e = opEntry({ action: 'x', userId: 'u1', userName: 'A' });
  assertEq(e.kind, AUDIT_KINDS.OP);
});

test('systemEntry generates system:source userId', () => {
  const e = systemEntry({ action: 'cron tick', source: 'driftScan' });
  assertEq(e.byId, 'system:driftScan');
  assertEq(e.kind, AUDIT_KINDS.SYSTEM);
});

test('healEntry generates system:self-heal by default', () => {
  const e = healEntry({ action: 'repair drift' });
  assertEq(e.byId, 'system:self-heal');
  assertEq(e.kind, AUDIT_KINDS.HEAL);
});

test('reversalEntry sets kind=reversal + meta.reversalOf', () => {
  const e = reversalEntry({
    action: '↩️ إلغاء تسوية',
    userId: 'u1',
    userName: 'A',
    reversalOf: 'tx-123',
  });
  assertEq(e.kind, AUDIT_KINDS.REVERSAL);
  assertEq(e.meta.reversalOf, 'tx-123');
});

// ── validateAuditShape ──
test('validateAuditShape passes a clean entry', () => {
  const r = validateAuditShape({ action: 'x', byId: 'u', date: '2026' });
  assertEq(r.ok, true);
});

test('validateAuditShape detects missing byId', () => {
  const r = validateAuditShape({ action: 'x', date: '2026' });
  assertEq(r.ok, false);
  if (!r.errors.some(e => e.includes('byId'))) throw new Error('missing byId not reported');
});

test('validateAuditShape detects missing action', () => {
  const r = validateAuditShape({ byId: 'u', date: '2026' });
  assertEq(r.ok, false);
});

test('validateAuditShape detects invalid kind', () => {
  const r = validateAuditShape({
    action: 'x', byId: 'u', date: '2026', kind: 'rogue',
  });
  assertEq(r.ok, false);
});

test('validateAuditShape accepts entry with only timestamp (no date)', () => {
  const r = validateAuditShape({ action: 'x', byId: 'u', timestamp: 1 });
  assertEq(r.ok, true);
});

// ── auditTimelineHealth ──
test('auditTimelineHealth aggregates legacy + valid entries', () => {
  const tl = [
    { action: 'a', byId: 'u1', date: 'd1', kind: 'op' },        // valid op
    { action: 'b', byId: 'u1', date: 'd2' },                     // valid no kind
    { action: 'c', by: 'someone', date: 'd3' },                  // legacy: no byId
    { action: 'd', byId: 'u1' },                                 // missing date
  ];
  const r = auditTimelineHealth(tl);
  assertEq(r.total, 4);
  assertEq(r.valid, 2);
  assertEq(r.missingActor, 1);
  assertEq(r.missingDate, 1);
});

test('auditTimelineHealth handles empty/null', () => {
  assertEq(auditTimelineHealth(null).total, 0);
  assertEq(auditTimelineHealth([]).total, 0);
});

// ── summary ──
console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed) process.exit(1);
