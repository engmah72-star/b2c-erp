/**
 * tests/wallet-actions-idempotency.test.mjs
 *
 * حارس H1.2 لطبقة الخزينة (wallet-actions.js):
 *   1) static — كل action مالي مُغلَّف بـ withIdempotency (ضد double-click/double-pay).
 *   2) behavior — الـ validations تفشل قبل الـ wrapper، وحُرّاس القراءة الحيّة
 *      (محفظة غير موجودة / حركة محذوفة بالفعل) يرفضون بدل إفساد الأرصدة.
 *   3) mintOperationId deterministic — نفس المدخلات = نفس operationId.
 *
 * Run: node --import ./tests/_loaders/register.mjs --test tests/wallet-actions-idempotency.test.mjs
 */
import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`✓ ${name}`); passed++; })
    .catch((e) => { console.log(`✗ ${name}\n    ${e.message}`); failed++; });
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const src = readFileSync(new URL('../wallet-actions.js', import.meta.url), 'utf8');

// ── 1) static: كل action مالي داخل withIdempotency ──────────────────────
const FINANCIAL_ACTIONS = [
  'createWallet',
  'saveReconciliation',
  'setOpeningBalance',
  'deleteTransaction',
  'recordTransaction',
  'editTransaction',
  'recordSupplierPayment',
  'walletTransfer',
];

// يقسم المصدر لكتل حسب `export async function` — كل كتلة = جسم دالة واحدة.
function functionBlock(name) {
  const start = src.indexOf(`export async function ${name}(`);
  if (start === -1) return '';
  const next = src.indexOf('export async function', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

const staticChecks = FINANCIAL_ACTIONS.map((name) =>
  test(`static — ${name} مُغلَّف بـ withIdempotency`, () => {
    const block = functionBlock(name);
    assert(block, `الدالة ${name} غير موجودة في wallet-actions.js`);
    assert(block.includes('withIdempotency('), `${name} تكتب مالياً بدون idempotency guard (H1.2)`);
  }),
);

// ── 2) behavior عبر firebase-stub (بدون شبكة) ───────────────────────────
const behaviorChecks = (async () => {
  const wa = await import('../wallet-actions.js');

  await test('recordTransaction — validation قبل الـ wrapper (بدون operationId)', async () => {
    const r = await wa.recordTransaction({ walletId: 'w1', userId: 'u1', type: 'in', amount: 0 });
    assert(r.ok === false, 'مبلغ صفر يجب أن يُرفض');
    assert(!r.operationId, 'الرفض التحقّقي يجب أن يحدث قبل حجز operation');
  });

  await test('recordTransaction — قراءة حيّة: محفظة غير موجودة تُرفض داخل الـ wrapper', async () => {
    const r = await wa.recordTransaction({
      walletId: 'w-ghost', walletName: 'كاش', type: 'in', amount: 100,
      category: 'collection', userId: 'u1', userName: 'Test',
    });
    assert(r.ok === false, 'محفظة غير موجودة يجب أن تُرفض');
    assert((r.errors || []).join(' ').includes('غير موجودة'), 'رسالة الخطأ يجب أن توضّح السبب');
    assert(r.operationId, 'الرفض من القراءة الحيّة يمرّ عبر الـ wrapper (يحمل operationId)');
  });

  await test('deleteTransaction — حركة محذوفة بالفعل تُرفض (لا عكس رصيد مزدوج)', async () => {
    const r = await wa.deleteTransaction({
      transactionId: 'tx-ghost', walletId: 'w1', walletName: 'كاش',
      amount: 50, type: 'in', balanceBefore: 500, userId: 'u1', userName: 'Test',
    });
    assert(r.ok === false, 'حذف حركة غير موجودة يجب أن يُرفض');
    assert((r.errors || []).join(' ').includes('حُذفت'), 'رسالة الخطأ يجب أن تشير لاحتمال الحذف السابق');
  });

  await test('walletTransfer — نفس المحفظتين تُرفض قبل الـ wrapper', async () => {
    const r = await wa.walletTransfer({
      fromWalletId: 'w1', toWalletId: 'w1', amount: 100,
      fromBalance: 500, toBalance: 0, userId: 'u1',
    });
    assert(r.ok === false && !r.operationId, 'تحويل لنفس المحفظة يُرفض تحقّقياً');
  });

  await test('walletTransfer — قراءة حيّة للطرفين داخل الـ wrapper', async () => {
    const r = await wa.walletTransfer({
      fromWalletId: 'w-a', fromWalletName: 'كاش', toWalletId: 'w-b', toWalletName: 'بنك',
      amount: 100, fromBalance: 500, toBalance: 0, userId: 'u1', userName: 'Test',
    });
    assert(r.ok === false, 'محافظ غير موجودة (stub) يجب أن تُرفض');
    assert(r.operationId, 'الرفض يمرّ عبر الـ wrapper (يحمل operationId)');
  });
})();

// ── 3) mintOperationId deterministic ────────────────────────────────────
const mintChecks = (async () => {
  const { mintOperationId } = await import('../core/idempotency.js');
  // windowMs ضخم → bucket ثابت → لا flakiness زمني (قاعدة tests deterministic)
  const W = 1e15;
  const base = { actionType: 'wallet_record_tx', entityId: 'w1', actorId: 'u1', windowMs: W };

  await test('mintOperationId — نفس المدخلات = نفس operationId', async () => {
    const a = mintOperationId({ ...base, payload: { type: 'in', amount: 100 } });
    const b = mintOperationId({ ...base, payload: { amount: 100, type: 'in' } }); // ترتيب مختلف
    assert(a === b, `stable stringify مكسور: ${a} ≠ ${b}`);
  });

  await test('mintOperationId — مبلغ مختلف = operationId مختلف', async () => {
    const a = mintOperationId({ ...base, payload: { type: 'in', amount: 100 } });
    const b = mintOperationId({ ...base, payload: { type: 'in', amount: 101 } });
    assert(a !== b, 'عمليتان بمبلغين مختلفين يجب ألا تتصادما');
  });

  await test('mintOperationId — actor مختلف = operationId مختلف', async () => {
    const a = mintOperationId({ ...base, payload: { amount: 100 } });
    const b = mintOperationId({ ...base, actorId: 'u2', payload: { amount: 100 } });
    assert(a !== b, 'نفس العملية من مستخدمَين مختلفين ليست duplicate');
  });
})();

await Promise.all([...staticChecks, behaviorChecks, mintChecks]);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
