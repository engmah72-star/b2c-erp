/**
 * tests/rules/financial-write.test.js
 *
 * S0-2 Regression Tests — التأكد من أن canFinancialWrite لم تعد تشمل
 * أدوار غير مالية (designer, production, print).
 *
 * كيف تشغّل:
 *   firebase emulators:exec --only firestore --project demo-test \
 *     "node tests/rules/financial-write.test.js"
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

const PROJECT_ID = 'b2c-test';

async function setupEnv() {
  return await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

async function seedUser(env, uid, role, pages = []) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`users/${uid}`).set({
      role,
      permissions: { pages },
      tenantId: 'merchant_001',
    });
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
  // S0-2: canFinancialWrite Restriction Tests
  // ──────────────────────────────────────────────────────────────

  await test('graphic_designer with pages:[design] CANNOT write to wallets', async () => {
    await seedUser(env, 'des1', 'graphic_designer', ['design']);
    const ctx = env.authenticatedContext('des1');
    await assertFails(
      ctx.firestore().doc('wallets/w1').update({ balance: 100000 })
    );
  });

  await test('production_agent with pages:[production] CANNOT write to wallets', async () => {
    await seedUser(env, 'prod1', 'production_agent', ['production']);
    const ctx = env.authenticatedContext('prod1');
    await assertFails(
      ctx.firestore().doc('wallets/w1').update({ balance: 100000 })
    );
  });

  await test('graphic_designer CANNOT create financial_ledger entry', async () => {
    await seedUser(env, 'des2', 'graphic_designer', ['design']);
    const ctx = env.authenticatedContext('des2');
    await assertFails(
      ctx.firestore().collection('financial_ledger').add({
        amount: 100, eventType: 'OPENING_BALANCE',
        type: 'income', direction: 'in',
        walletId: 'w1', isDeleted: false,
      })
    );
  });

  await test('admin CAN write to wallets (legitimate path)', async () => {
    await seedUser(env, 'adm1', 'admin');
    // create wallet first via admin (bypass rules)
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('wallets/w1').set({ name:'Test', balance: 0 });
    });
    const ctx = env.authenticatedContext('adm1');
    await assertSucceeds(
      ctx.firestore().doc('wallets/w1').update({ balance: 100 })
    );
  });

  await test('user with pages:[accounts] CAN write to wallets', async () => {
    await seedUser(env, 'acc1', 'customer_service', ['accounts']);
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('wallets/w2').set({ name:'Test', balance: 0 });
    });
    const ctx = env.authenticatedContext('acc1');
    await assertSucceeds(
      ctx.firestore().doc('wallets/w2').update({ balance: 100 })
    );
  });

  await test('user with pages:[shipping-accounts] CAN write to wallets', async () => {
    await seedUser(env, 'ship1', 'shipping_officer', ['shipping-accounts']);
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('wallets/w3').set({ name:'Test', balance: 0 });
    });
    const ctx = env.authenticatedContext('ship1');
    await assertSucceeds(
      ctx.firestore().doc('wallets/w3').update({ balance: 100 })
    );
  });

  // ──────────────────────────────────────────────────────────────
  // S0-3: Cross-Tenant Marketplace Tests
  // ──────────────────────────────────────────────────────────────

  await test('ops_manager CANNOT read marketplace_orders from another tenant', async () => {
    await seedUser(env, 'ops1', 'operation_manager', ['accounts']);
    await env.withSecurityRulesDisabled(async (c) => {
      // doc يخص tenant مختلف
      await c.firestore().doc('marketplace_orders/mo1').set({
        tenantId: 'merchant_002',
        customerId: 'someone_else',
        amount: 1000,
      });
    });
    const ctx = env.authenticatedContext('ops1');
    await assertFails(
      ctx.firestore().doc('marketplace_orders/mo1').get()
    );
  });

  await test('ops_manager CAN read marketplace_orders from own tenant', async () => {
    await seedUser(env, 'ops2', 'operation_manager', ['accounts']);
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('marketplace_orders/mo2').set({
        tenantId: 'merchant_001',  // نفس tenant الـ user
        customerId: 'someone',
        amount: 1000,
      });
    });
    const ctx = env.authenticatedContext('ops2');
    await assertSucceeds(
      ctx.firestore().doc('marketplace_orders/mo2').get()
    );
  });

  await test('customer CAN read own marketplace_order regardless of tenant', async () => {
    // العميل (customerId match) يقرأ أوردره حتى لو من tenant مختلف
    await seedUser(env, 'cust1', 'customer_service');
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('marketplace_orders/mo3').set({
        tenantId: 'merchant_002',
        customerId: 'cust1',  // الـ user هو الـ customer
        amount: 500,
      });
    });
    const ctx = env.authenticatedContext('cust1');
    await assertSucceeds(
      ctx.firestore().doc('marketplace_orders/mo3').get()
    );
  });

  await test('ops_manager CANNOT read commissions cross-tenant', async () => {
    await seedUser(env, 'ops3', 'operation_manager', ['accounts']);
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('commissions/c1').set({
        tenantId: 'merchant_002',
        amount: 100,
      });
    });
    const ctx = env.authenticatedContext('ops3');
    await assertFails(
      ctx.firestore().doc('commissions/c1').get()
    );
  });

  await test('ops_manager CANNOT read escrow_holds cross-tenant', async () => {
    await seedUser(env, 'ops4', 'operation_manager', ['accounts']);
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('escrow_holds/e1').set({
        tenantId: 'merchant_002',
        customerId: 'someone',
        amount: 1000,
      });
    });
    const ctx = env.authenticatedContext('ops4');
    await assertFails(
      ctx.firestore().doc('escrow_holds/e1').get()
    );
  });

  await test('ops_manager CANNOT read payouts cross-tenant', async () => {
    await seedUser(env, 'ops5', 'operation_manager', ['accounts']);
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('payouts/p1').set({
        tenantId: 'merchant_002',
        amount: 500,
      });
    });
    const ctx = env.authenticatedContext('ops5');
    await assertFails(
      ctx.firestore().doc('payouts/p1').get()
    );
  });

  // ──────────────────────────────────────────────────────────────
  // financial_operations — idempotency reservation (non-admin actors)
  // Regression: non-admin (e.g. customer_service) must be able to GET a
  // not-yet-existing op doc so withIdempotency's reservation tx works.
  // ──────────────────────────────────────────────────────────────

  await test('customer_service CAN read a non-existent financial_operations doc (reservation get)', async () => {
    await seedUser(env, 'cs1', 'customer_service', ['clients']);
    const ctx = env.authenticatedContext('cs1');
    await assertSucceeds(
      ctx.firestore().doc('financial_operations/op_new_xyz').get()
    );
  });

  await test('customer_service CAN create + read its OWN financial_operations doc', async () => {
    await seedUser(env, 'cs2', 'customer_service', ['clients']);
    const ctx = env.authenticatedContext('cs2');
    await assertSucceeds(
      ctx.firestore().doc('financial_operations/op_cs2').set({
        operationId: 'op_cs2', actionType: 'create_order',
        actorId: 'cs2', status: 'pending',
      })
    );
    await assertSucceeds(
      ctx.firestore().doc('financial_operations/op_cs2').get()
    );
  });

  await test('customer_service CANNOT read ANOTHER actor\'s existing financial_operations doc', async () => {
    await seedUser(env, 'cs3', 'customer_service', ['clients']);
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('financial_operations/op_other').set({
        operationId: 'op_other', actionType: 'create_order',
        actorId: 'someone_else', status: 'completed',
      });
    });
    const ctx = env.authenticatedContext('cs3');
    await assertFails(
      ctx.firestore().doc('financial_operations/op_other').get()
    );
  });

  // ──────────────────────────────────────────────────────────────
  // Financial Policy — server-side outflow escalation (master_lists/financial_policy)
  // mode='escalate' + outflow.escalate=10000 + requiredApproverRole='admin'
  // ──────────────────────────────────────────────────────────────

  const setPolicy = async (policy) => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('master_lists/financial_policy').set(policy);
    });
  };
  const clearPolicy = async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('master_lists/financial_policy').delete();
    });
  };
  const outTx = (amount, extra = {}) => ({
    walletId: 'w1', type: 'out', amount, category: 'printer_payment',
    description: 'test', date: '2026/06/03', ...extra,
  });

  await test('NO policy doc → ops CAN create large outflow (advisory default, backward-compat)', async () => {
    await clearPolicy();
    await seedUser(env, 'pol_ops0', 'operation_manager', ['accounts']);
    const ctx = env.authenticatedContext('pol_ops0');
    await assertSucceeds(ctx.firestore().collection('transactions_v2').add(outTx(15000)));
  });

  await test('advisory mode → ops CAN create large outflow (no enforcement)', async () => {
    await setPolicy({ mode: 'advisory', outflow: { escalate: 10000, requiredApproverRole: 'admin' } });
    await seedUser(env, 'pol_ops1', 'operation_manager', ['accounts']);
    const ctx = env.authenticatedContext('pol_ops1');
    await assertSucceeds(ctx.firestore().collection('transactions_v2').add(outTx(15000)));
  });

  await test('escalate mode → ops_manager CANNOT create outflow above limit', async () => {
    await setPolicy({ mode: 'escalate', outflow: { escalate: 10000, requiredApproverRole: 'admin' } });
    await seedUser(env, 'pol_ops2', 'operation_manager', ['accounts']);
    const ctx = env.authenticatedContext('pol_ops2');
    await assertFails(ctx.firestore().collection('transactions_v2').add(outTx(15000)));
  });

  await test('escalate mode → admin CAN create outflow above limit', async () => {
    await setPolicy({ mode: 'escalate', outflow: { escalate: 10000, requiredApproverRole: 'admin' } });
    await seedUser(env, 'pol_adm1', 'admin', ['accounts']);
    const ctx = env.authenticatedContext('pol_adm1');
    await assertSucceeds(ctx.firestore().collection('transactions_v2').add(outTx(15000)));
  });

  await test('escalate mode → ops CAN create outflow BELOW limit', async () => {
    await setPolicy({ mode: 'escalate', outflow: { escalate: 10000, requiredApproverRole: 'admin' } });
    await seedUser(env, 'pol_ops3', 'operation_manager', ['accounts']);
    const ctx = env.authenticatedContext('pol_ops3');
    await assertSucceeds(ctx.firestore().collection('transactions_v2').add(outTx(5000)));
  });

  await test('escalate mode → large INFLOW is not gated (outflow-only)', async () => {
    await setPolicy({ mode: 'escalate', outflow: { escalate: 10000, requiredApproverRole: 'admin' } });
    await seedUser(env, 'pol_ops4', 'operation_manager', ['accounts']);
    const ctx = env.authenticatedContext('pol_ops4');
    await assertSucceeds(ctx.firestore().collection('transactions_v2').add(
      outTx(20000, { type: 'in', category: 'client_payment' })
    ));
  });

  await test('escalate mode → large REVERSAL outflow is exempt (system correction)', async () => {
    await setPolicy({ mode: 'escalate', outflow: { escalate: 10000, requiredApproverRole: 'admin' } });
    await seedUser(env, 'pol_ops5', 'operation_manager', ['accounts']);
    const ctx = env.authenticatedContext('pol_ops5');
    await assertSucceeds(ctx.firestore().collection('transactions_v2').add(
      outTx(15000, { isReversal: true })
    ));
  });

  await clearPolicy();

  // ──────────────────────────────────────────────────────────────
  // Strict approval separation (Segregation of Duties)
  // policy.approval.strictSeparation = true
  // ──────────────────────────────────────────────────────────────
  const seedTx = async (id, data) => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc(`transactions_v2/${id}`).set({
        walletId: 'w1', type: 'out', amount: 100, category: 'printer_payment',
        description: 'sep', date: '2026/06/03', createdBy: 'someone',
        approvalStatus: 'pending', confirmedBy: '', confirmedByName: '',
        approvedBy: '', isLocked: false, ...data,
      });
    });
  };
  const approveUpdate = { approvalStatus: 'approved', approvedBy: 'X', approvedByName: 'X', approvedAt: new Date(), isLocked: true };

  await test('strict OFF → admin CAN approve pending directly (direct approve)', async () => {
    await clearPolicy();
    await seedUser(env, 'sep_adm0', 'admin', ['accounts']);
    await seedTx('tx_sep0', { approvalStatus: 'pending' });
    const ctx = env.authenticatedContext('sep_adm0');
    await assertSucceeds(ctx.firestore().doc('transactions_v2/tx_sep0').update(approveUpdate));
  });

  await test('strict ON → admin CANNOT approve pending directly (no prior confirm)', async () => {
    await setPolicy({ mode: 'advisory', approval: { strictSeparation: true } });
    await seedUser(env, 'sep_adm1', 'admin', ['accounts']);
    await seedTx('tx_sep1', { approvalStatus: 'pending', confirmedBy: '' });
    const ctx = env.authenticatedContext('sep_adm1');
    await assertFails(ctx.firestore().doc('transactions_v2/tx_sep1').update(approveUpdate));
  });

  await test('strict ON → confirmer CANNOT approve own confirmed tx', async () => {
    await setPolicy({ mode: 'advisory', approval: { strictSeparation: true } });
    await seedUser(env, 'sep_adm2', 'admin', ['accounts']);
    await seedTx('tx_sep2', { approvalStatus: 'confirmed', confirmedBy: 'sep_adm2' });
    const ctx = env.authenticatedContext('sep_adm2');
    await assertFails(ctx.firestore().doc('transactions_v2/tx_sep2').update(approveUpdate));
  });

  await test('strict ON → different admin CAN approve a confirmed tx', async () => {
    await setPolicy({ mode: 'advisory', approval: { strictSeparation: true } });
    await seedUser(env, 'sep_adm3', 'admin', ['accounts']);
    await seedTx('tx_sep3', { approvalStatus: 'confirmed', confirmedBy: 'someone_else' });
    const ctx = env.authenticatedContext('sep_adm3');
    await assertSucceeds(ctx.firestore().doc('transactions_v2/tx_sep3').update(approveUpdate));
  });

  await clearPolicy();

  await env.cleanup();
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
