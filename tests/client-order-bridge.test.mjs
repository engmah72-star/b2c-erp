/**
 * tests/client-order-bridge.test.mjs
 *
 * جسر تواصل الموظف↔العميل للأوردر (inbox-actions: ensureClientOrderThread /
 * sendOrderDesignToClient). طبقة مراسلة — يكتب conversations + notifications فقط.
 *
 * Run: node --import ./tests/_loaders/register.mjs tests/client-order-bridge.test.mjs
 */
import { inboxActions } from '../inbox-actions.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, h = '') { if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${h}`); }

const ORDER = {
  _id: 'o1', orderId: 'O-1', clientId: 'cli1', clientName: 'سعيد',
  designerId: 'd1', productionAgent: 'p1', createdBy: 'cs1',
};

await test('ensureClientOrderThread: نفس معرّف العميل clord_{_id}', async () => {
  const r = await inboxActions.ensureClientOrderThread({ db: {}, order: ORDER, currentUserId: 'emp9', currentUserName: 'م' });
  eq(r.convId, 'clord_o1', 'must match client-side id scheme');
  eq(r.clientUid, 'cli1');
});

await test('ensureClientOrderThread: المشاركون = العميل + الفريق + المُنفِّذ', async () => {
  const r = await inboxActions.ensureClientOrderThread({ db: {}, order: ORDER, currentUserId: 'emp9', currentUserName: 'م' });
  for (const u of ['cli1', 'd1', 'p1', 'cs1', 'emp9']) assert(r.participants.includes(u), `missing participant ${u}`);
  // بلا تكرار
  eq(r.participants.length, new Set(r.participants).size, 'participants deduped');
});

await test('ensureClientOrderThread: أوردر بلا عميل → لا يُضاف عميل فارغ', async () => {
  const r = await inboxActions.ensureClientOrderThread({ db: {}, order: { _id: 'o2', designerId: 'd1' }, currentUserId: 'emp9' });
  eq(r.clientUid, '');
  assert(!r.participants.includes(''), 'must not push empty client uid');
  assert(r.participants.includes('d1') && r.participants.includes('emp9'), 'staff still added');
});

await test('ensureClientOrderThread: بلا order → يرمي', async () => {
  let threw = false;
  try { await inboxActions.ensureClientOrderThread({ db: {}, order: null, currentUserId: 'x' }); }
  catch (_) { threw = true; }
  assert(threw, 'must throw when order missing');
});

await test('sendOrderDesignToClient: يُرجع ok + notified للعميل', async () => {
  const r = await inboxActions.sendOrderDesignToClient({
    db: {}, order: ORDER, proofUrl: 'https://x/p.png', currentUserId: 'emp9', currentUserName: 'م',
  });
  assert(r.ok === true, 'ok');
  eq(r.convId, 'clord_o1');
  eq(r.notified, true, 'client notified');
});

await test('sendOrderDesignToClient: بلا عميل → ok بلا إشعار', async () => {
  const r = await inboxActions.sendOrderDesignToClient({
    db: {}, order: { _id: 'o3', designerId: 'd1' }, proofUrl: '', currentUserId: 'emp9',
  });
  assert(r.ok === true && r.notified === false, `got ${JSON.stringify(r)}`);
});

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed) process.exit(1);
