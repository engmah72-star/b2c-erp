// core/auth-reset.js
//
// طلب ريست ذاتي لكلمة سر الموظف. login.html (view) ينادي هذه الدالة بدل الكتابة
// المباشرة (H1.1: ممنوع addDoc داخل HTML — الكتابة في طبقة مسموح لها core/).
// تكتب مستند password_reset_requests {phone}؛ الباقي يعالجه الـ Cloud Function
// (Firestore-trigger onPasswordResetRequested): يلاقي الموظف بالموبايل ويرسل
// رابط إعادة التعيين لإيميل الاسترداد المسجّل.

import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const PHONE_RE = /^01[0125][0-9]{8}$/;

/**
 * @param {Object} args
 * @param {Object} args.db    — Firestore instance
 * @param {string} args.phone — رقم موبايل مصري (01XXXXXXXXX)
 * @returns {Promise<{ok:boolean, errors:string[], warnings:string[]}>}
 */
export async function requestPasswordResetByPhone({ db, phone }) {
  const norm = String(phone || '').trim();
  if (!PHONE_RE.test(norm)) {
    return { ok: false, errors: ['اكتب رقم موبايل صحيح'], warnings: [] };
  }
  try {
    await addDoc(collection(db, 'password_reset_requests'), { phone: norm, createdAt: serverTimestamp() });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'تعذّر إرسال الطلب'], warnings: [] };
  }
}
