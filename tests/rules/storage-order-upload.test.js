/**
 * tests/rules/storage-order-upload.test.js
 *
 * Regression test for the "الأوردر مش بيحفظ" bug (storage/unauthorized).
 *
 * يحاكي السيناريو الحقيقي: مستخدم staff مُصادَق عليه لكن بدون custom claim
 * للدور (request.auth.token.role == undefined) — وهي الحالة التي تكسر
 * isStaff() fail-closed (syncUserAuthClaims = onDocumentUpdated فقط + يحتاج
 * تجديد التوكن). الأوردر يرفع الإيصال إلى receipts/ والتصميم إلى designs/
 * ثم يستدعي getDownloadURL() فوراً (يحتاج read).
 *
 * كيف تشغّل:
 *   firebase emulators:exec --only storage --project demo-test \
 *     "node tests/rules/storage-order-upload.test.js"
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { readFileSync } from 'fs';

const PROJECT_ID = 'b2c-test';
const ORDER = 'ORD-12345678';
const TS = Date.now();

async function setupEnv() {
  return await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
}

// صورة صغيرة (bytes) — نختبر بنوع image و بدون نوع (octet-stream) للإيصال
const imgBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

async function runTests() {
  const env = await setupEnv();
  let passed = 0, failed = 0;
  const test = async (name, fn) => {
    try { await fn(); console.log(`✅ PASS: ${name}`); passed++; }
    catch (e) { console.log(`❌ FAIL: ${name}\n   ${e.message}`); failed++; }
  };

  // staff مُصادَق عليه بدون أي claim للدور — الحالة التي كانت تكسر isStaff()
  const staffNoClaim = env.authenticatedContext('staff-no-claim');
  const storage = staffNoClaim.storage();

  const designsPath  = `designs/order_${ORDER}_${TS}_0`;
  const receiptsImg   = `receipts/order_${ORDER}_${TS}_0`;
  const receiptsNoType = `receipts/order_${ORDER}_${TS}_1`;

  // ── الكتابة (الرفع) ──
  await test('designs/: staff بلا claim يرفع التصميم (write)', async () => {
    await assertSucceeds(
      uploadBytes(ref(storage, designsPath), imgBytes, { contentType: 'application/pdf' }));
  });

  await test('receipts/: staff بلا claim يرفع إيصال صورة (write)', async () => {
    await assertSucceeds(
      uploadBytes(ref(storage, receiptsImg), imgBytes, { contentType: 'image/jpeg' }));
  });

  await test('receipts/: staff بلا claim يرفع إيصال بلا نوع/octet-stream (write)', async () => {
    await assertSucceeds(
      uploadBytes(ref(storage, receiptsNoType), imgBytes, { contentType: 'application/octet-stream' }));
  });

  // ── القراءة (getDownloadURL فور الرفع) — الحلقة الأخيرة من الإصلاح ──
  await test('designs/: getDownloadURL ينجح فور الرفع (read) — كان يفشل 403', async () => {
    await assertSucceeds(getDownloadURL(ref(storage, designsPath)));
  });

  await test('receipts/: getDownloadURL ينجح فور الرفع (read)', async () => {
    await assertSucceeds(getDownloadURL(ref(storage, receiptsImg)));
  });

  // ── الحماية ما زالت قائمة: غير المُصادَق ممنوع ──
  const anon = env.unauthenticatedContext();
  await test('غير مُصادَق: ممنوع الرفع إلى designs/ (write denied)', async () => {
    await assertFails(
      uploadBytes(ref(anon.storage(), `designs/order_anon_${TS}`), imgBytes, { contentType: 'image/png' }));
  });

  await test('غير مُصادَق: ممنوع قراءة receipts/ (read denied)', async () => {
    await assertFails(getDownloadURL(ref(anon.storage(), receiptsImg)));
  });

  // ── حدّ الحجم ما زال مفروضاً على receipts/ (>10MB يُرفض) ──
  await test('receipts/: ملف > 10MB يُرفض (size guard)', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 16);
    await assertFails(
      uploadBytes(ref(storage, `receipts/order_${ORDER}_big`), big, { contentType: 'image/jpeg' }));
  });

  console.log(`\n──────────\n${passed} passed, ${failed} failed`);
  await env.cleanup();
  if (failed > 0) process.exit(1);
}

runTests().catch((e) => { console.error(e); process.exit(1); });
