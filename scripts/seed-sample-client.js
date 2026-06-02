/**
 * scripts/seed-sample-client.js
 *
 * إدخال بيانات عميل جديد (sample) في collection `clients`.
 *
 * يبني نفس شكل المستند الذي يبنيه `clientActions.addClient`
 * (client-actions.js:194-207): نفس حقول النظام + فحص التكرار (dedup) قبل
 * الكتابة، واحتراماً لنفس قواعد الـ validation (الاسم مطلوب، صيغة الهاتف
 * المصري 01[0125] + 8 أرقام، تطابق phone1≠phone2، صيغة الإيميل).
 *
 * ملاحظة معمارية (L1 / H1.1): الكتابة الحقيقية في الإنتاج تمر **فقط** عبر
 * `clientActions.addClient` من الواجهة. هذا السكربت أداة seed سيرفر-سايد
 * (Firebase Admin SDK) للبيئات التجريبية فقط — مثل scripts/seed-materials-finishings.js.
 *
 * الاستخدام:
 *   أ) عبر Node.js (Admin SDK):
 *        node scripts/seed-sample-client.js
 *      (يتطلب تهيئة admin app وتمرير db — انظر runSeed أسفل)
 *
 *   ب) يدوياً من Firebase Console → Firestore:
 *        أنشئ document جديد في collection `clients` بمحتوى buildClientDoc(SAMPLE_CLIENT).
 *
 * **تحذير:** لا يكتب لو وُجد عميل بنفس الهاتف/البريد (نفس سلوك addClient).
 */

// ══════════════════════════════════════════
// SAMPLE CLIENT — بيانات عميل جديد للإدخال
// ══════════════════════════════════════════
// عدّل القيم حسب العميل الفعلي. الحقول المطلوبة: name + phone1.

export const SAMPLE_CLIENT = {
  // ─ أساسي (مطلوب) ─
  name: 'أحمد محمود عبد الله',
  phone1: '01012345678',            // EG mobile: 010/011/012/015 + 8 أرقام
  // ─ اختياري ─
  phone2: '01198765432',
  email: 'ahmed.mahmoud@example.com',
  job: 'مدير تسويق',
  governorate: 'القاهرة',
  city: 'مدينة نصر',
  source: 'referral',               // facebook|whatsapp|instagram|referral|walk_in|other
  sector: 'corporate',              // medical|legal|corporate|retail|restaurant|education|individual|other
  tags: ['new'],                    // vip|regular|new|wholesale|delayed|blocked
  notes: 'مهتم بطباعة كروت شخصية وبروشورات.',
  internalNotes: 'تم التعرف عليه عبر عميل قائم — متابعة خلال أسبوع.',
};

// ══════════════════════════════════════════
// VALIDATION — مطابقة لـ client-actions.js:61-81
// ══════════════════════════════════════════

const RE_EG_PHONE = /^01[0125][0-9]{8}$/;

export function validateClientPayload({ name, phone1, phone2 = '', email = '' }) {
  const errors = [];
  const p1 = (phone1 || '').trim();
  const p2 = (phone2 || '').trim();
  if (!name || !name.trim()) errors.push('⚠️ اسم العميل مطلوب');
  if (!p1) errors.push('⚠️ الهاتف الأساسي مطلوب');
  else if (!RE_EG_PHONE.test(p1)) errors.push('⚠️ رقم الهاتف الأساسي غير صحيح');
  if (p2 && !RE_EG_PHONE.test(p2)) errors.push('⚠️ رقم الهاتف الثاني غير صحيح');
  if (p1 && p2 && p1 === p2) errors.push('⚠️ الهاتف الأساسي والثاني لا يصح أن يكونا متطابقين');
  if (email && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.push('⚠️ خانة الإيميل غير صحيحة — اكتبه مثل name@example.com أو اتركه فارغاً (اختياري)');
  }
  return { ok: errors.length === 0, errors, warnings: [] };
}

// ══════════════════════════════════════════
// DOC BUILDER — مطابق لشكل addClient (client-actions.js:194-207)
// ══════════════════════════════════════════

/**
 * يبني مستند العميل بنفس حقول النظام التي يكتبها addClient.
 * @param {object} data   بيانات العميل (مثل SAMPLE_CLIENT)
 * @param {object} actor  { userId, userName } المنشئ
 * @param {*} ts          دالة الـ timestamp (serverTimestamp أو () => new Date())
 */
export function buildClientDoc(data, { userId = '', userName = '' } = {}, ts = () => new Date()) {
  const isLegacy = data.status === 'legacy';
  return {
    ...data,
    email: (data.email || '').toLowerCase().trim(),
    phone1: (data.phone1 || '').trim(),
    phone2: (data.phone2 || '').trim(),
    name: (data.name || '').trim(),
    status: isLegacy ? 'legacy' : 'active',
    isDeleted: false,
    createdBy: userId || '',
    createdByName: userName || '',
    createdAt: ts(),
    updatedAt: ts(),
  };
}

// ══════════════════════════════════════════
// SEEDING FUNCTION (Firebase Admin SDK — سيرفر-سايد فقط)
// ══════════════════════════════════════════

/**
 * يدخل عميلاً واحداً بعد فحص التكرار بالهاتف/البريد (dedup) — نفس منطق
 * _findDuplicate في client-actions.js:113-139.
 * @returns {Promise<{status:'created'|'skipped'|'invalid', clientId?:string, errors?:string[], duplicateId?:string}>}
 */
export async function seedSampleClient(db, data = SAMPLE_CLIENT, actor = { userId: 'seed', userName: 'Seed Script' }) {
  // 1) validation
  const v = validateClientPayload(data);
  if (!v.ok) return { status: 'invalid', errors: v.errors };

  // 2) dedup — phone1/phone2 ضد عمودي phone1/phone2 + email
  const col = db.collection('clients');
  const p1 = (data.phone1 || '').trim();
  const p2 = (data.phone2 || '').trim();
  const em = (data.email || '').toLowerCase().trim();
  const checks = [];
  if (p1) {
    checks.push(col.where('phone1', '==', p1).limit(1).get());
    checks.push(col.where('phone2', '==', p1).limit(1).get());
  }
  if (p2) {
    checks.push(col.where('phone1', '==', p2).limit(1).get());
    checks.push(col.where('phone2', '==', p2).limit(1).get());
  }
  if (em) checks.push(col.where('email', '==', em).limit(1).get());

  const snaps = await Promise.all(checks);
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (!d.data().isDeleted) return { status: 'skipped', duplicateId: d.id };
    }
  }

  // 3) write — نفس شكل addClient
  const docData = buildClientDoc(data, actor, () => new Date());
  const ref = await col.add(docData);
  return { status: 'created', clientId: ref.id };
}

// ══════════════════════════════════════════
// CLI RUNNER (اختياري — يتطلب firebase-admin + service account)
// ══════════════════════════════════════════
// شغّل: node scripts/seed-sample-client.js
// (فعّل البلوك التالي بعد تهيئة admin credentials في بيئتك)
/*
import admin from 'firebase-admin';
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
seedSampleClient(db)
  .then((r) => { console.log('[seed-sample-client]', r); process.exit(0); })
  .catch((e) => { console.error('[seed-sample-client] failed:', e); process.exit(1); });
*/
