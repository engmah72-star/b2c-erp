/**
 * tests/rules/client-support-delivery.test.js
 *
 * HOTFIX regression — تسليم رسائل العميل ↔ الموظف.
 *
 * يثبت أن محادثة العميل قابلة للتسليم متى احتوت participants موظفاً، وأن
 * الأدمن يقدر يتدخّل في أي محادثة (read/reply/update) حتى لو ليس participant.
 *
 *   firebase emulators:exec --only firestore --project demo-test \
 *     "node tests/rules/client-support-delivery.test.js"
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

const PROJECT_ID = 'b2c-test';
const CLIENT = 'cl1';      // عميل — لا يوجد له users doc
const CS = 'cs1';          // موظف خدمة عملاء (participant)
const CS_OUT = 'cs2';      // موظف آخر (ليس participant) — control
const ADMIN = 'ad1';       // أدمن (ليس participant) — تدخّل

async function setupEnv() {
  return await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

async function seedUser(env, uid, role) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`users/${uid}`).set({ role, permissions: { pages: [] }, isActive: true });
  });
}
async function seedConv(env, convId, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`conversations/${convId}`).set({
      type: 'dm', isClientThread: true, participants: [], unreadCount: {},
      lastMessageAt: new Date(), lastMessagePreview: '', ...data,
    });
  });
}
async function seedMsg(env, convId, msgId, senderId, text = 'hi') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`conversations/${convId}/messages/${msgId}`).set({
      senderId, senderName: senderId, type: 'text', text, createdAt: new Date(), readBy: { [senderId]: new Date() },
    });
  });
}

async function runTests() {
  const env = await setupEnv();
  await seedUser(env, CS, 'customer_service');
  await seedUser(env, CS_OUT, 'customer_service');
  await seedUser(env, ADMIN, 'admin');

  let passed = 0, failed = 0;
  const test = async (name, fn) => {
    try { await fn(); console.log(`✅ PASS: ${name}`); passed++; }
    catch (e) { console.log(`❌ FAIL: ${name}\n   ${e.message}`); failed++; }
  };
  const msg = (sender) => ({ senderId: sender, senderName: sender, type: 'text', text: 'm', createdAt: new Date(), readBy: { [sender]: new Date() } });

  // ── Thread creation by client (portal injects a CS agent) ──
  await test('client CAN create a support conversation that includes a CS agent', async () => {
    const fs = env.authenticatedContext(CLIENT).firestore();
    await assertSucceeds(fs.doc('conversations/csupport_cl1').set({
      type: 'dm', isClientThread: true, participants: [CLIENT, CS], unreadCount: {},
      lastMessageAt: new Date(), lastMessagePreview: '',
    }));
  });

  // ── Client → CS delivery ──
  await test('Client → CS: client (participant) CAN post a message', async () => {
    await seedConv(env, 'c_deliver', { participants: [CLIENT, CS] });
    const fs = env.authenticatedContext(CLIENT).firestore();
    await assertSucceeds(fs.collection('conversations/c_deliver/messages').add(msg(CLIENT)));
  });
  await test('Client → CS: CS agent (participant) CAN read the client message', async () => {
    await seedConv(env, 'c_read', { participants: [CLIENT, CS] });
    await seedMsg(env, 'c_read', 'm1', CLIENT);
    const fs = env.authenticatedContext(CS).firestore();
    await assertSucceeds(fs.doc('conversations/c_read/messages/m1').get());
  });

  // ── CS → Client reply ──
  await test('CS → Client: CS (participant) CAN reply', async () => {
    await seedConv(env, 'c_reply', { participants: [CLIENT, CS] });
    const fs = env.authenticatedContext(CS).firestore();
    await assertSucceeds(fs.collection('conversations/c_reply/messages').add(msg(CS)));
  });
  await test('CS → Client: client CAN read the CS reply', async () => {
    await seedConv(env, 'c_reply2', { participants: [CLIENT, CS] });
    await seedMsg(env, 'c_reply2', 'r1', CS);
    const fs = env.authenticatedContext(CLIENT).firestore();
    await assertSucceeds(fs.doc('conversations/c_reply2/messages/r1').get());
  });

  // ── Control: non-participant employee blocked ──
  await test('Control: non-participant employee CANNOT read client messages', async () => {
    await seedConv(env, 'c_ctrl', { participants: [CLIENT, CS] });
    await seedMsg(env, 'c_ctrl', 'm1', CLIENT);
    const fs = env.authenticatedContext(CS_OUT).firestore();
    await assertFails(fs.doc('conversations/c_ctrl/messages/m1').get());
  });
  await test('Necessity: orphaned thread [client-only] → CS CANNOT read (pre-fix state)', async () => {
    await seedConv(env, 'c_orphan', { participants: [CLIENT] });
    await seedMsg(env, 'c_orphan', 'm1', CLIENT);
    const fs = env.authenticatedContext(CS).firestore();
    await assertFails(fs.doc('conversations/c_orphan/messages/m1').get());
  });

  // ── Admin intervention (NOT a participant) ──
  await test('Admin intervention: admin (non-participant) CAN read messages', async () => {
    await seedConv(env, 'c_adm', { participants: [CLIENT, CS] });
    await seedMsg(env, 'c_adm', 'm1', CLIENT);
    const fs = env.authenticatedContext(ADMIN).firestore();
    await assertSucceeds(fs.doc('conversations/c_adm/messages/m1').get());
  });
  await test('Admin intervention: admin (non-participant) CAN reply', async () => {
    await seedConv(env, 'c_adm2', { participants: [CLIENT, CS] });
    const fs = env.authenticatedContext(ADMIN).firestore();
    await assertSucceeds(fs.collection('conversations/c_adm2/messages').add(msg(ADMIN)));
  });
  await test('Admin intervention: admin (non-participant) CAN update conversation summary', async () => {
    await seedConv(env, 'c_adm3', { participants: [CLIENT, CS] });
    const fs = env.authenticatedContext(ADMIN).firestore();
    await assertSucceeds(fs.doc('conversations/c_adm3').update({ lastMessagePreview: 'admin note', lastMessageAt: new Date() }));
  });

  // ── Order conversation fallback routing ──
  await test('Order fallback: CS routed into clord participants CAN read', async () => {
    await seedConv(env, 'clord_o1', { type: 'order_thread', participants: [CLIENT, CS] });
    await seedMsg(env, 'clord_o1', 'm1', CLIENT);
    const fs = env.authenticatedContext(CS).firestore();
    await assertSucceeds(fs.doc('conversations/clord_o1/messages/m1').get());
  });

  // ── Regression: sender spoofing still blocked ──
  await test('Regression: participant CANNOT post a message spoofing another senderId', async () => {
    await seedConv(env, 'c_spoof', { participants: [CLIENT, CS] });
    const fs = env.authenticatedContext(CS).firestore();
    await assertFails(fs.collection('conversations/c_spoof/messages').add(msg(CLIENT))); // senderId=CLIENT but auth=CS
  });

  await env.cleanup();
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('Test suite crashed:', e); process.exit(1); });
