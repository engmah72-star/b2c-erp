/**
 * Tests for core/financial-policy.js (financial control policy engine).
 * Run: node tests/core-financial-policy.test.mjs
 */
import {
  DEFAULT_FINANCIAL_POLICY,
  resolveFinancialPolicy,
  evaluateOutflow,
  evaluateInflow,
  canApproveOutflow,
  requiresStrictSeparation,
  checkApprovalSeparation,
} from '../core/financial-policy.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assert(cond, hint = '') { if (!cond) throw new Error(`assertion failed ${hint}`); }

// ── resolveFinancialPolicy ──────────────────────────────────────────
test('default policy mode is advisory (E1 backward-compatible)', () => {
  assertEq(DEFAULT_FINANCIAL_POLICY.mode, 'advisory');
});

test('resolve with null → returns defaults (mutable copy)', () => {
  const p = resolveFinancialPolicy(null);
  assertEq(p.mode, 'advisory');
  assertEq(p.outflow.escalate, 10000);
  // ensure it's a copy, not frozen original
  p.outflow.escalate = 1; assertEq(p.outflow.escalate, 1);
  assertEq(DEFAULT_FINANCIAL_POLICY.outflow.escalate, 10000, '(original untouched)');
});

test('resolve merges override over defaults; missing fields inherited', () => {
  const p = resolveFinancialPolicy({ mode: 'escalate', outflow: { escalate: 3000 } });
  assertEq(p.mode, 'escalate');
  assertEq(p.outflow.escalate, 3000);
  assertEq(p.outflow.advisoryMed, 5000, '(inherited)');
  assertEq(p.inflow.reviewThreshold, 20000, '(inherited)');
});

test('resolve ignores invalid mode → falls back to default', () => {
  const p = resolveFinancialPolicy({ mode: 'nonsense' });
  assertEq(p.mode, 'advisory');
});

// ── evaluateOutflow: advisory levels ────────────────────────────────
test('outflow small amount → level ok, no approval', () => {
  const r = evaluateOutflow({ amount: 1000 });
  assertEq(r.level, 'ok');
  assertEq(r.requiresApproval, false);
});

test('outflow > advisoryMed → level med', () => {
  assertEq(evaluateOutflow({ amount: 6000 }).level, 'med');
});

test('outflow > advisoryHigh → level high', () => {
  assertEq(evaluateOutflow({ amount: 15000 }).level, 'high');
});

test('advisory mode never escalates even above threshold', () => {
  const r = evaluateOutflow({ amount: 50000 });
  assertEq(r.requiresApproval, false, '(advisory)');
  assertEq(r.level, 'high');
  assert(r.warnings.length > 0, '(still warns)');
});

// ── evaluateOutflow: escalate mode ──────────────────────────────────
test('escalate mode + above threshold → requiresApproval w/ admin + fourEyes', () => {
  const policy = resolveFinancialPolicy({ mode: 'escalate' });
  const r = evaluateOutflow({ amount: 15000, policy });
  assertEq(r.requiresApproval, true);
  assertEq(r.requiredApproverRole, 'admin');
  assertEq(r.fourEyes, true);
  assert(r.reasons.includes('amount_over_escalate'));
});

test('escalate mode + below threshold → no approval', () => {
  const policy = resolveFinancialPolicy({ mode: 'escalate' });
  assertEq(evaluateOutflow({ amount: 8000, policy }).requiresApproval, false);
});

test('cash wallet uses stricter escalate threshold (5000)', () => {
  const policy = resolveFinancialPolicy({ mode: 'escalate' });
  const r = evaluateOutflow({ amount: 6000, walletType: 'cash', policy });
  assertEq(r.thresholds.escalate, 5000);
  assertEq(r.requiresApproval, true, '(6000 > cash 5000)');
});

test('bank wallet uses default escalate threshold (10000)', () => {
  const policy = resolveFinancialPolicy({ mode: 'escalate' });
  const r = evaluateOutflow({ amount: 6000, walletType: 'bank', policy });
  assertEq(r.thresholds.escalate, 10000);
  assertEq(r.requiresApproval, false, '(6000 < bank 10000)');
});

test('daily wallet cap exceeded → escalate even if single amount small', () => {
  const policy = resolveFinancialPolicy({ mode: 'escalate' });
  const r = evaluateOutflow({ amount: 3000, dailyWalletOutflow: 48000, policy });
  assert(r.reasons.includes('daily_cap_exceeded'), '(48000+3000 > 50000)');
  assertEq(r.requiresApproval, true);
});

test('mode off → no evaluation at all', () => {
  const policy = resolveFinancialPolicy({ mode: 'off' });
  const r = evaluateOutflow({ amount: 999999, policy });
  assertEq(r.level, 'ok');
  assertEq(r.requiresApproval, false);
  assertEq(r.warnings.length, 0);
});

// ── evaluateInflow ──────────────────────────────────────────────────
test('inflow below review threshold → ok', () => {
  const r = evaluateInflow({ amount: 5000 });
  assertEq(r.needsReview, false);
  assertEq(r.level, 'ok');
});

test('inflow above review threshold → needsReview', () => {
  const r = evaluateInflow({ amount: 25000, hasReceipt: true });
  assertEq(r.needsReview, true);
  assertEq(r.level, 'review');
});

test('inflow above receipt threshold without receipt → receiptMissing', () => {
  const r = evaluateInflow({ amount: 12000, hasReceipt: false });
  assertEq(r.receiptRequired, true);
  assertEq(r.receiptMissing, true);
});

test('inflow above receipt threshold WITH receipt → not missing', () => {
  const r = evaluateInflow({ amount: 12000, hasReceipt: true });
  assertEq(r.receiptRequired, true);
  assertEq(r.receiptMissing, false);
});

// ── canApproveOutflow ───────────────────────────────────────────────
test('non-escalated eval → always approvable', () => {
  const r = canApproveOutflow({ requiresApproval: false }, { role: 'customer_service', userId: 'u1' }, 'u1');
  assertEq(r.ok, true);
});

test('escalated + wrong role → blocked', () => {
  const ev = { requiresApproval: true, requiredApproverRole: 'admin', fourEyes: true };
  const r = canApproveOutflow(ev, { role: 'operation_manager', userId: 'u2' }, 'u1');
  assertEq(r.ok, false);
  assert(r.errors.some(e => e.includes('admin')));
});

test('escalated + admin but same as requester → four-eyes blocks', () => {
  const ev = { requiresApproval: true, requiredApproverRole: 'admin', fourEyes: true };
  const r = canApproveOutflow(ev, { role: 'admin', userId: 'u1' }, 'u1');
  assertEq(r.ok, false);
  assert(r.errors.some(e => e.includes('الأربع عيون')));
});

test('escalated + admin + distinct from requester → ok', () => {
  const ev = { requiresApproval: true, requiredApproverRole: 'admin', fourEyes: true };
  const r = canApproveOutflow(ev, { role: 'admin', userId: 'u2' }, 'u1');
  assertEq(r.ok, true);
});

// ── strict approval separation (Segregation of Duties) ──────────────
test('strictSeparation: default false', () => {
  assertEq(requiresStrictSeparation(null), false);
  assertEq(DEFAULT_FINANCIAL_POLICY.approval.strictSeparation, false);
});

test('strictSeparation: resolve merges approval override', () => {
  const p = resolveFinancialPolicy({ approval: { strictSeparation: true } });
  assertEq(requiresStrictSeparation(p), true);
});

test('checkApprovalSeparation: OFF → always ok (any state/actor)', () => {
  const r = checkApprovalSeparation({ approvalStatus: 'pending', confirmedBy: 'u1' }, 'u1', null);
  assertEq(r.ok, true);
});

test('checkApprovalSeparation: ON + pending (no confirm) → blocked (no direct approve)', () => {
  const policy = resolveFinancialPolicy({ approval: { strictSeparation: true } });
  const r = checkApprovalSeparation({ approvalStatus: 'pending', confirmedBy: '' }, 'admin1', policy);
  assertEq(r.ok, false);
  assert(r.errors[0].includes('تأكيد'));
});

test('checkApprovalSeparation: ON + confirmer approves own → blocked', () => {
  const policy = resolveFinancialPolicy({ approval: { strictSeparation: true } });
  const r = checkApprovalSeparation({ approvalStatus: 'confirmed', confirmedBy: 'u1' }, 'u1', policy);
  assertEq(r.ok, false);
  assert(r.errors[0].includes('أكّدتها بنفسك'));
});

test('checkApprovalSeparation: ON + confirmed + different approver → ok', () => {
  const policy = resolveFinancialPolicy({ approval: { strictSeparation: true } });
  const r = checkApprovalSeparation({ approvalStatus: 'confirmed', confirmedBy: 'u1' }, 'u2', policy);
  assertEq(r.ok, true);
});

// ── summary ─────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
