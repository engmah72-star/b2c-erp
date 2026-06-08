/**
 * tests/order-design-capture.test.mjs
 *
 * orderActions.addDesignFile / linkOrderConversation — حفظ صورة المصمم في ملف
 * تصميم الأوردر + ربط المحادثة بالأوردر. (مسارات التحقق؛ المسار الكامل يحتاج Firestore حي.)
 *
 * Run: node --import ./tests/_loaders/register.mjs tests/order-design-capture.test.mjs
 */
import { orderActions } from '../order-actions.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

await test('addDesignFile: بلا ملف → رفض', async () => {
  const r = await orderActions.addDesignFile({ db: {}, orderId: 'o1', userId: 'd1' });
  assert(r.ok === false && /بيانات ناقصة/.test(r.errors[0] || ''), `got ${JSON.stringify(r)}`);
});
await test('addDesignFile: بلا userId → رفض', async () => {
  const r = await orderActions.addDesignFile({ db: {}, orderId: 'o1', file: { url: 'u' } });
  assert(r.ok === false && /userId/.test(r.errors[0] || ''), `got ${JSON.stringify(r)}`);
});
await test('addDesignFile: أوردر غير موجود (stub) → رفض', async () => {
  const r = await orderActions.addDesignFile({ db: {}, orderId: 'missing', file: { url: 'u', name: 'd.png' }, userId: 'd1', source: 'chat' });
  assert(r.ok === false && /غير موجود/.test(r.errors[0] || ''), `got ${JSON.stringify(r)}`);
});
await test('linkOrderConversation: بلا conversationId → رفض', async () => {
  const r = await orderActions.linkOrderConversation({ db: {}, orderId: 'o1' });
  assert(r.ok === false && /بيانات ناقصة/.test(r.errors[0] || ''), `got ${JSON.stringify(r)}`);
});
await test('linkOrderConversation: أوردر غير موجود (stub) → رفض', async () => {
  const r = await orderActions.linkOrderConversation({ db: {}, orderId: 'missing', conversationId: 'clord_x' });
  assert(r.ok === false && /غير موجود/.test(r.errors[0] || ''), `got ${JSON.stringify(r)}`);
});

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed) process.exit(1);
