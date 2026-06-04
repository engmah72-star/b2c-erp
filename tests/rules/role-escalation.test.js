/**
 * tests/rules/role-escalation.test.js
 *
 * S0-1 Regression Tests — يتأكد أن المستخدم لا يقدر يصعد دوره.
 * المرجع: STABILIZATION_PLAN §1.S0-1 + REGRESSION_PREVENTION §9.2.
 *
 * كيف تشغّل:
 *   firebase emulators:exec --only firestore --project demo-test \
 *     "node tests/rules/role-escalation.test.js"
 *
 * Setup مطلوب (مرة واحدة):
 *   npm install --save-dev @firebase/rules-unit-testing
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

const PROJECT_ID = 'b2c-test';

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

async function seedUser(env, uid, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`users/${uid}`).set(data);
  });
}

async function runTests() {
  const env = await setupEnv();
  let passed = 0, failed = 0;
  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.log(`❌ FAIL: ${name}\n   ${e.message}`);
      failed++;
    }
  };

  // ──────────────────────────────────────────────────────────────
  // S0-1: Role Escalation Tests
  // ──────────────────────────────────────────────────────────────

  await test('graphic_designer cannot escalate own role to admin', async () => {
    await seedUser(env, 'des1', { role: 'graphic_designer' });
    const ctx = env.authenticatedContext('des1');
    await assertFails(
      ctx.firestore().doc('users/des1').update({ role: 'admin' })
    );
  });

  await test('graphic_designer cannot escalate via permissions field', async () => {
    await seedUser(env, 'des2', { role: 'graphic_designer', permissions: {} });
    const ctx = env.authenticatedContext('des2');
    await assertFails(
      ctx.firestore().doc('users/des2').update({
        permissions: { canFinancialWrite: true }
      })
    );
  });

  await test('user cannot tenant-hop via tenantId update', async () => {
    await seedUser(env, 'usr1', { role: 'customer_service', tenantId: 'merchant_001' });
    const ctx = env.authenticatedContext('usr1');
    await assertFails(
      ctx.firestore().doc('users/usr1').update({ tenantId: 'merchant_002' })
    );
  });

  await test('user CAN update own name/email (allowed fields)', async () => {
    await seedUser(env, 'usr2', { role: 'customer_service', name: 'Old' });
    const ctx = env.authenticatedContext('usr2');
    await assertSucceeds(
      ctx.firestore().doc('users/usr2').update({ name: 'New Name' })
    );
  });

  await test('user cannot mass-update (mix of allowed + protected)', async () => {
    // الـ rule هي hasAny([...protected]). لو حقل protected موجود = denied.
    await seedUser(env, 'usr3', { role: 'customer_service', name: 'Old' });
    const ctx = env.authenticatedContext('usr3');
    await assertFails(
      ctx.firestore().doc('users/usr3').update({
        name: 'New',
        role: 'admin'  // ← هذا يجعل الـ update يرفض كاملاً
      })
    );
  });

  await test('admin CAN update another user role (legitimate path)', async () => {
    await seedUser(env, 'adm1', { role: 'admin' });
    await seedUser(env, 'tgt1', { role: 'graphic_designer' });
    const ctx = env.authenticatedContext('adm1');
    await assertSucceeds(
      ctx.firestore().doc('users/tgt1').update({ role: 'design_operator' })
    );
  });

  await test('operation_manager CANNOT update another user role (admin only)', async () => {
    await seedUser(env, 'ops1', { role: 'operation_manager' });
    await seedUser(env, 'tgt2', { role: 'graphic_designer' });
    const ctx = env.authenticatedContext('ops1');
    await assertFails(
      ctx.firestore().doc('users/tgt2').update({ role: 'admin' })
    );
  });

  await env.cleanup();
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
