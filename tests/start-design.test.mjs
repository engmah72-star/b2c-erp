/**
 * tests/start-design.test.mjs
 *
 * orderActions.startDesign — «بدء تصميم فعّال»: تعيين مصمم + فتح مجموعة العميل.
 * (مسارات التحقق + التسلسل؛ المسار الكامل يحتاج بيئة Firestore حية.)
 *
 * Run: node --import ./tests/_loaders/register.mjs tests/start-design.test.mjs
 */
import { orderActions } from '../order-actions.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

await test('بلا مصمم → رفض', async () => {
  const r = await orderActions.startDesign({ db: {}, orderId: 'o1', userId: 'cs1' });
  assert(r.ok === false && /المصمم/.test(r.errors[0] || ''), `got ${JSON.stringify(r)}`);
});

await test('بلا userId → رفض', async () => {
  const r = await orderActions.startDesign({ db: {}, orderId: 'o1', designerId: 'd1' });
  assert(r.ok === false, 'must reject without userId');
});

await test('أوردر غير موجود (stub) → يفشل قبل المجموعة', async () => {
  // الـ stub يرجّع getDoc.exists()=false → assignDesigner يفشل → startDesign يعيد فشله.
  const r = await orderActions.startDesign({ db: {}, orderId: 'missing', designerId: 'd1', designerName: 'مصمم', userId: 'cs1', userName: 'CS' });
  assert(r.ok === false && /غير موجود/.test(r.errors[0] || ''), `got ${JSON.stringify(r)}`);
});

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed) process.exit(1);
