/**
 * tests/messaging-policy.test.mjs
 *
 * وحدة المصفوفة المركزية core/messaging-policy.js — مَن يكلّم مَن وبأي قدرات.
 * pure · بلا I/O. المرجع: docs/MESSAGING_GOVERNANCE_MODEL.md.
 *
 * Run: node tests/messaging-policy.test.mjs
 */
import {
  resolve, PARTIES, MODES, CHANNELS, LIFECYCLE, CAP_BUNDLES, hasCap, POLICY_FLAGS,
} from '../core/messaging-policy.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, h = '') { if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${h}`); }

const { EMPLOYEE, CLIENT, SUPPLIER, SYSTEM } = PARTIES;

// ── الحواف المسموحة ──
test('موظف↔موظف = زمالة · CAP_FULL · stateless', () => {
  const r = resolve({ from: EMPLOYEE, to: EMPLOYEE });
  assert(r.allowed, 'must be allowed');
  eq(r.mode, MODES.COLLEGIAL); eq(r.caps, 'CAP_FULL'); eq(r.lifecycle, LIFECYCLE.STATELESS);
});

test('عميل→موظف عبر أوردر = خدمة · order_thread · ticket', () => {
  const r = resolve({ from: CLIENT, to: EMPLOYEE, context: { binding: 'order' } });
  assert(r.allowed && r.contextSatisfied, 'allowed+context');
  eq(r.mode, MODES.SERVICE); eq(r.channelType, CHANNELS.ORDER_THREAD); eq(r.lifecycle, LIFECYCLE.TICKET);
});

test('عميل→موظف عبر دعم = خدمة · support', () => {
  const r = resolve({ from: CLIENT, to: EMPLOYEE, context: { binding: 'support' } });
  assert(r.allowed && r.contextSatisfied);
  eq(r.channelType, CHANNELS.SUPPORT);
});

test('عميل→موظف بلا سياق = مسموح بنيوياً لكن context غير مُستوفى', () => {
  const r = resolve({ from: CLIENT, to: EMPLOYEE, context: {} });
  assert(r.allowed, 'structurally allowed');
  assert(r.contextSatisfied === false, 'context NOT satisfied (لا DM حر)');
  assert(Array.isArray(r.requiresContext) && r.requiresContext.includes('order'));
});

test('عميل↔عميل = نِدّي · يحتاج flag+سياق+قبول · CAP_PEER · consent', () => {
  const r = resolve({ from: CLIENT, to: CLIENT, context: { binding: 'referral' } });
  assert(r.allowed, 'structurally allowed');
  eq(r.mode, MODES.PEER); eq(r.caps, 'CAP_PEER'); eq(r.lifecycle, LIFECYCLE.CONSENT);
  eq(r.requiresFlag, POLICY_FLAGS.MEMBER_TO_MEMBER);
  eq(r.requiresConsent, true);
  assert(r.contextSatisfied, 'referral context satisfied');
});

test('عميل↔عميل بسياق غير صالح = context غير مُستوفى', () => {
  const r = resolve({ from: CLIENT, to: CLIENT, context: { binding: 'order' } });
  assert(r.allowed && r.contextSatisfied === false, 'order ليس سياقاً صالحاً للنِدّي');
});

test('موظف→مورد = توريد · procurement · CAP_PROCUREMENT', () => {
  const r = resolve({ from: EMPLOYEE, to: SUPPLIER });
  assert(r.allowed); eq(r.channelType, CHANNELS.PROCUREMENT); eq(r.caps, 'CAP_PROCUREMENT');
});

test('مورد→موظف = توريد (يحتاج سياق procurement)', () => {
  const r = resolve({ from: SUPPLIER, to: EMPLOYEE, context: { binding: 'procurement' } });
  assert(r.allowed && r.contextSatisfied); eq(r.caps, 'CAP_PROCUREMENT');
});

test('النظام→عميل = بثّ', () => {
  const r = resolve({ from: SYSTEM, to: CLIENT });
  assert(r.allowed); eq(r.mode, MODES.BROADCAST); eq(r.lifecycle, LIFECYCLE.BROADCAST);
});

// ── الحواف الممنوعة (fail-closed) ──
test('عميل→مورد = ممنوع', () => {
  const r = resolve({ from: CLIENT, to: SUPPLIER });
  assert(!r.allowed, 'must be forbidden'); assert(r.reason, 'has reason');
});
test('مورد→عميل = ممنوع', () => { assert(!resolve({ from: SUPPLIER, to: CLIENT }).allowed); });
test('مورد→مورد = ممنوع', () => { assert(!resolve({ from: SUPPLIER, to: SUPPLIER }).allowed); });
test('طرف مجهول = ممنوع', () => {
  assert(!resolve({ from: 'ghost', to: EMPLOYEE }).allowed);
  assert(!resolve({ from: CLIENT, to: 'ghost' }).allowed);
  assert(!resolve({}).allowed);
});

// ── حِزَم القدرات ──
test('CAP_FULL يملك كل شيء عدا approval/consent', () => {
  assert(hasCap('CAP_FULL', 'internalNote') && hasCap('CAP_FULL', 'pin') && hasCap('CAP_FULL', 'forward'));
  assert(!hasCap('CAP_FULL', 'approval') && !hasCap('CAP_FULL', 'consent'));
});
test('CAP_SERVICE: approval+internalNote ✓ · pin/forward ✗', () => {
  assert(hasCap('CAP_SERVICE', 'approval') && hasCap('CAP_SERVICE', 'internalNote'));
  assert(!hasCap('CAP_SERVICE', 'pin') && !hasCap('CAP_SERVICE', 'forward'));
});
test('CAP_PEER: نص/صورة + consent · لا file/voice/order/approval/internalNote', () => {
  assert(hasCap('CAP_PEER', 'text') && hasCap('CAP_PEER', 'image') && hasCap('CAP_PEER', 'consent'));
  assert(!hasCap('CAP_PEER', 'file') && !hasCap('CAP_PEER', 'voice'));
  assert(!hasCap('CAP_PEER', 'orderShare') && !hasCap('CAP_PEER', 'approval') && !hasCap('CAP_PEER', 'internalNote'));
});
test('CAP_PROCUREMENT: غني بلا approval', () => {
  assert(hasCap('CAP_PROCUREMENT', 'file') && hasCap('CAP_PROCUREMENT', 'internalNote'));
  assert(!hasCap('CAP_PROCUREMENT', 'approval'));
});

// ── الرؤية (RULE 8) ──
test('رؤية الخدمة: التكلفة never · الهاتف masked · العميل لا يقرأ الداخلي', () => {
  const v = resolve({ from: CLIENT, to: EMPLOYEE, context: { binding: 'order' } }).visibility;
  eq(v.cost, 'never'); eq(v.phone, 'masked'); eq(v.clientReadsInternal, false);
});
test('رؤية النِدّي: لا تكلفة · هاتف مخفي · كارت المُرسِل قبل القبول', () => {
  const v = resolve({ from: CLIENT, to: CLIENT, context: { binding: 'need' } }).visibility;
  eq(v.cost, 'none'); eq(v.phone, 'hidden'); eq(v.cardRefBeforeConsent, true); eq(v.internalNote, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
