/**
 * Node-runnable tests — الحارس الدستوري لمحادثة عضو↔عضو (عميل↔عميل).
 *
 * يتحقّق أن `clientActions.openClientThread({ kind:'member' })` لا يفتح محادثة
 * إلا مع تفعيل العلم messaging.memberToMember (استثناء دستوري محدود النطاق · E1).
 * راجع docs/CONSTITUTIONAL_EXCEPTION_MEMBER_MESSAGING.md.
 *
 * Run: node --import ./tests/_loaders/register.mjs tests/messaging-member-guard.test.mjs
 */

// fake window/localStorage حتى يقرأ core/feature-flags.js العلم في Node.
const store = { 'feat.messaging.memberToMember': '0' };
globalThis.window = {
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  location: { search: '' },
};
const setFlag = (on) => { store['feat.messaging.memberToMember'] = on ? '1' : '0'; };

const { clientActions } = await import('../client-actions.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, hint = '') { if (!cond) throw new Error(`assertion failed ${hint}`); }

const PEER = { uid: 'b', name: 'B' };

await test('flag OFF → محادثة العضو مرفوضة (الوضع الدستوري الآمن)', async () => {
  setFlag(false);
  const r = await clientActions.openClientThread({ kind: 'member', clientUid: 'a', clientName: 'A', peer: PEER });
  assert(r.ok === false, 'expected ok:false');
  assert(/غير مُفعّلة/.test(r.errors[0] || ''), `unexpected error: ${r.errors[0]}`);
  assert(!r.convId, 'must not return a convId when disabled');
});

await test('flag ON + peer صحيح → تُفتح المحادثة بمعرّف dm_ موحَّد', async () => {
  setFlag(true);
  const r = await clientActions.openClientThread({ kind: 'member', clientUid: 'a', clientName: 'A', peer: PEER });
  assert(r.ok === true, `expected ok:true got ${JSON.stringify(r.errors)}`);
  assert(r.convId === 'dm_a_b', `expected dm_a_b got ${r.convId}`);
});

await test('flag ON + بلا peer → رفض', async () => {
  setFlag(true);
  const r = await clientActions.openClientThread({ kind: 'member', clientUid: 'a', peer: null });
  assert(r.ok === false && /العضو المطلوب/.test(r.errors[0] || ''), `got ${JSON.stringify(r)}`);
});

await test('flag ON + peer === self → رفض', async () => {
  setFlag(true);
  const r = await clientActions.openClientThread({ kind: 'member', clientUid: 'a', peer: { uid: 'a' } });
  assert(r.ok === false && /نفسك/.test(r.errors[0] || ''), `got ${JSON.stringify(r)}`);
});

await test('kind=order لا يتأثر بالعلم (مسار غير محروس)', async () => {
  setFlag(false);
  const r = await clientActions.openClientThread({ kind: 'order', clientUid: 'a' });
  // يرفض لغياب الأوردر لا لغياب العلم — أي الحارس خاص بـ member فقط.
  assert(r.ok === false && /الأوردر مطلوب/.test(r.errors[0] || ''), `got ${JSON.stringify(r)}`);
});

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed) process.exit(1);
