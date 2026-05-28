/**
 * Tests for functions/lib/employee-notify.js (employee self-notifications).
 * Run: node tests/employee-notify.test.mjs
 *
 * Pure tests — no Firestore, no admin SDK. Validates the WHAT-to-send logic
 * (RULE G8: smoke test for a Cloud Functions change).
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { buildIncidentNotification, buildLedgerNotification } = require('../functions/lib/employee-notify.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, hint = '') { if (!cond) throw new Error(`assertion failed ${hint}`); }
function assertEq(a, b, hint = '') { if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`); }

// ── incidents ────────────────────────────────────────────────────────
test('incident → payload with profile link + type incident', () => {
  const p = buildIncidentNotification({ type: 'quality', title: 'خطأ مقاس' });
  assert(p, 'should return payload');
  assertEq(p.type, 'incident');
  assertEq(p.link, 'my-profile.html');
  assert(p.desc.includes('مشكلة جودة'), 'maps type label');
  assert(p.desc.includes('خطأ مقاس'), 'includes title');
});
test('incident unknown type → falls back to ملاحظة', () => {
  const p = buildIncidentNotification({ type: 'zzz' });
  assert(p.desc.includes('ملاحظة'), 'fallback label');
});
test('incident null → null', () => assertEq(buildIncidentNotification(null), null));

// ── ledger: penalty / bonus only ─────────────────────────────────────
test('PENALTY entry → خصم payload', () => {
  const p = buildLedgerNotification({ eventType: 'PENALTY', employeeId: 'e1', amount: 500 });
  assert(p, 'should return payload');
  assertEq(p.type, 'penalty');
  assert(p.title.includes('خصم'), 'penalty title');
  assert(p.desc.includes((500).toLocaleString('ar-EG')), 'includes amount (localized)');
});
test('BONUS_PAYMENT entry → مكافأة payload', () => {
  const p = buildLedgerNotification({ eventType: 'BONUS_PAYMENT', employeeId: 'e1', amount: 300 });
  assertEq(p.type, 'bonus');
  assert(p.title.includes('مكافأة'), 'bonus title');
});
test('SALARY_PAYMENT entry → null (not notified)', () => {
  assertEq(buildLedgerNotification({ eventType: 'SALARY_PAYMENT', employeeId: 'e1', amount: 5000 }), null);
});
test('non-employee ledger entry → null', () => {
  assertEq(buildLedgerNotification({ eventType: 'PENALTY', amount: 500 }), null);
});
test('customer/vendor event → null', () => {
  assertEq(buildLedgerNotification({ eventType: 'CUSTOMER_PAYMENT', clientId: 'c1', amount: 999 }), null);
});
test('null entry → null', () => assertEq(buildLedgerNotification(null), null));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
