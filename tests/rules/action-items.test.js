/**
 * tests/rules/action-items.test.js
 *
 * قواعد /action_items — مهام المحادثات (inbox).
 *
 * الخلفية: الـ collection كانت بلا قواعد إطلاقاً = fail-closed → «إنشاء مهمة»
 * ولوحة المهام كانت معطّلة لكل الموظفين. يثبت هذا الاختبار أن:
 *   - الموظف (users doc موجود) يقرأ وينشئ مهامه (createdBy == uid).
 *   - المنشئ/المكلَّف يعدّل بحرية؛ موظف ثالث يعدّل status/completedAt فقط.
 *   - العميل (بلا users doc) محجوب قراءةً وكتابةً.
 *   - الحذف admin فقط.
 *
 *   firebase emulators:exec --only firestore --project demo-test \
 *     "node tests/rules/action-items.test.js"
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

const PROJECT_ID = 'b2c-test-action-items';
const CS = 'cs1';        // موظف — منشئ المهمة
const DESIGNER = 'gd1';  // موظف — المكلَّف
const OTHER = 'pa1';     // موظف ثالث (لا منشئ ولا مكلَّف)
const ADMIN = 'ad1';     // أدمن
const CLIENT = 'cl1';    // عميل — لا يوجد له users doc

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
async function seedItem(env, itemId, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`action_items/${itemId}`).set({
      text: 'مهمة', convId: 'conv1', messageId: '', createdBy: CS, createdByName: CS,
      assigneeId: DESIGNER, assigneeName: DESIGNER, dueDate: null,
      status: 'pending', createdAt: new Date(), completedAt: null, ...data,
    });
  });
}

async function runTests() {
  const env = await setupEnv();
  await seedUser(env, CS, 'customer_service');
  await seedUser(env, DESIGNER, 'graphic_designer');
  await seedUser(env, OTHER, 'production_agent');
  await seedUser(env, ADMIN, 'admin');

  let passed = 0, failed = 0;
  const test = async (name, fn) => {
    try { await fn(); console.log(`✅ PASS: ${name}`); passed++; }
    catch (e) { console.log(`❌ FAIL: ${name}\n   ${e.message}`); failed++; }
  };
  const item = (createdBy) => ({
    text: 'مهمة جديدة', convId: 'conv1', messageId: '', createdBy, createdByName: createdBy,
    assigneeId: DESIGNER, assigneeName: DESIGNER, dueDate: null,
    status: 'pending', createdAt: new Date(), completedAt: null,
  });

  // ── الإنشاء ──
  await test('الموظف CAN ينشئ مهمة createdBy == uid', async () => {
    const fs = env.authenticatedContext(CS).firestore();
    await assertSucceeds(fs.collection('action_items').add(item(CS)));
  });
  await test('الموظف CANNOT ينشئ مهمة منسوبة لموظف آخر', async () => {
    const fs = env.authenticatedContext(OTHER).firestore();
    await assertFails(fs.collection('action_items').add(item(CS)));
  });
  await test('العميل (بلا users doc) CANNOT ينشئ مهمة', async () => {
    const fs = env.authenticatedContext(CLIENT).firestore();
    await assertFails(fs.collection('action_items').add(item(CLIENT)));
  });

  // ── القراءة ──
  await seedItem(env, 'it_read', {});
  await test('أي موظف CAN يقرأ المهام', async () => {
    const fs = env.authenticatedContext(OTHER).firestore();
    await assertSucceeds(fs.doc('action_items/it_read').get());
  });
  await test('العميل CANNOT يقرأ المهام', async () => {
    const fs = env.authenticatedContext(CLIENT).firestore();
    await assertFails(fs.doc('action_items/it_read').get());
  });

  // ── التحديث ──
  await seedItem(env, 'it_upd', {});
  await test('المنشئ CAN يعدّل نص المهمة', async () => {
    const fs = env.authenticatedContext(CS).firestore();
    await assertSucceeds(fs.doc('action_items/it_upd').update({ text: 'معدّلة' }));
  });
  await test('المكلَّف CAN يقفل المهمة (status/completedAt)', async () => {
    const fs = env.authenticatedContext(DESIGNER).firestore();
    await assertSucceeds(fs.doc('action_items/it_upd').update({ status: 'done', completedAt: new Date() }));
  });
  await test('موظف ثالث CAN يبدّل status فقط (toggle/dismiss)', async () => {
    const fs = env.authenticatedContext(OTHER).firestore();
    await assertSucceeds(fs.doc('action_items/it_upd').update({ status: 'pending', completedAt: null }));
  });
  await test('موظف ثالث CANNOT يعدّل نص المهمة', async () => {
    const fs = env.authenticatedContext(OTHER).firestore();
    await assertFails(fs.doc('action_items/it_upd').update({ text: 'اختراق' }));
  });
  await test('العميل CANNOT يعدّل أي شيء', async () => {
    const fs = env.authenticatedContext(CLIENT).firestore();
    await assertFails(fs.doc('action_items/it_upd').update({ status: 'done' }));
  });

  // ── الحذف ──
  await seedItem(env, 'it_del', {});
  await test('المنشئ CANNOT يحذف (dismiss = تحديث status)', async () => {
    const fs = env.authenticatedContext(CS).firestore();
    await assertFails(fs.doc('action_items/it_del').delete());
  });
  await test('الأدمن CAN يحذف', async () => {
    const fs = env.authenticatedContext(ADMIN).firestore();
    await assertSucceeds(fs.doc('action_items/it_del').delete());
  });

  await env.cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

runTests().catch((e) => { console.error(e); process.exit(1); });
