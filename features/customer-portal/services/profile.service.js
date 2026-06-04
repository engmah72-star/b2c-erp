/**
 * SERVICES · profile — بيانات العميل وبروفايل الأعمال والكارت العام.
 * القراءة مغلّفة · الكتابة عبر clientActions (H1.1). لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';

/** نوع العمل من نوع الملف (عرض). */
function workType(file) {
  const t = file?.type || '';
  if (t.startsWith('video/')) return 'video';
  if (t === 'application/pdf') return 'pdf';
  return 'image';
}

/** يحمّل سجلّ العميل clients/{uid} (أو null). */
export async function loadClient(uid) {
  const fb = await firebase();
  const snap = await fb.getDoc(fb.doc(fb.db, 'clients', uid));
  return snap.exists() ? { ...snap.data(), _id: snap.id } : null;
}

/** يحفظ البروفايل عبر الفعل المركزي. profile = businessProfile + phone. */
export async function saveProfile({ uid, email, name, phone, businessProfile }) {
  const fb = await firebase();
  return fb.clientActions.upsertClientSelf({
    authUid: uid, authEmail: email, authName: name,
    data: { name, phone1: phone, businessProfile },
  });
}

/** يحفظ مصفوفة الأعمال ضمن البروفايل (مع الحفاظ على باقي الحقول). */
async function saveWorks({ uid, email, name, phone, bp, works }) {
  const fb = await firebase();
  return fb.clientActions.upsertClientSelf({
    authUid: uid, authEmail: email, authName: name,
    data: { name, phone1: phone, businessProfile: { ...bp, works } },
  });
}

/** يرفع عملاً (صورة/فيديو/PDF) ويضيفه لمعرض أعمال العميل. يُرجع { ok, work?, errors? }. */
export async function addWork({ uid, email, name, file }) {
  const { uploadClientFile } = await import('../../../core/storage-helpers.js'); // كسول (S1)
  const up = await uploadClientFile({ clientId: uid, file, kind: 'works' });
  const client = await loadClient(uid);
  const bp = client?.businessProfile || {};
  const works = Array.isArray(bp.works) ? bp.works.slice() : [];
  const work = { type: workType(file), url: up.url, name: file.name };
  works.push(work);
  const r = await saveWorks({ uid, email, name: client?.name || name, phone: client?.phone1 || '', bp, works });
  return { ...r, work };
}

/** يحذف عملاً بالفهرس من معرض أعمال العميل. */
export async function removeWork({ uid, email, name, index }) {
  const client = await loadClient(uid);
  const bp = client?.businessProfile || {};
  const works = Array.isArray(bp.works) ? bp.works.slice() : [];
  if (index < 0 || index >= works.length) return { ok: false, errors: ['⚠️ عنصر غير موجود'] };
  works.splice(index, 1);
  return saveWorks({ uid, email, name: client?.name || name, phone: client?.phone1 || '', bp, works });
}

/** يضبط حقلاً مفرداً في businessProfile مع الحفاظ على الباقي (logoUrl/coverUrl). */
async function setMediaUrl({ uid, email, name, kind, url }) {
  const client = await loadClient(uid);
  const bp = client?.businessProfile || {};
  const field = kind === 'cover' ? 'coverUrl' : 'logoUrl';
  const fb = await firebase();
  return fb.clientActions.upsertClientSelf({
    authUid: uid, authEmail: email, authName: client?.name || name,
    data: { name: client?.name || name, phone1: client?.phone1 || '', businessProfile: { ...bp, [field]: url } },
  });
}

/** يرفع شعاراً/غلافاً (kind: 'logo' | 'cover') ويحفظ رابطه في البروفايل والكارت. */
export async function uploadMedia({ uid, email, name, kind, file }) {
  const { uploadClientFile } = await import('../../../core/storage-helpers.js'); // كسول (S1)
  const up = await uploadClientFile({ clientId: uid, file, kind });
  return setMediaUrl({ uid, email, name, kind, url: up.url });
}

/** يحذف الشعار/الغلاف (يفرّغ الرابط). */
export async function removeMedia({ uid, email, name, kind }) {
  return setMediaUrl({ uid, email, name, kind, url: '' });
}

/** يحفظ قائمة الخدمات (structured) ضمن البروفايل والكارت العام. */
export async function saveServices({ uid, email, name, services }) {
  const client = await loadClient(uid);
  const bp = client?.businessProfile || {};
  const fb = await firebase();
  return fb.clientActions.upsertClientSelf({
    authUid: uid, authEmail: email, authName: client?.name || name,
    data: { name: client?.name || name, phone1: client?.phone1 || '', businessProfile: { ...bp, services } },
  });
}

/** يرفع صورة خدمة (kind: gallery) ويُرجع رابطها. */
export async function uploadServiceImage({ uid, file }) {
  const { uploadClientFile } = await import('../../../core/storage-helpers.js'); // كسول (S1)
  const up = await uploadClientFile({ clientId: uid, file, kind: 'gallery' });
  return up.url;
}

/** يتحقّق أن اسم المستخدم متاح (غير مستخدَم لعميل آخر). */
export async function usernameAvailable(username, uid) {
  if (!username) return true;
  const fb = await firebase();
  const snap = await fb.getDocs(
    fb.query(fb.collection(fb.db, 'public_cards'), fb.where('username', '==', username), fb.limit(1)),
  );
  return snap.empty || snap.docs[0].id === uid;
}

/** يحمّل خطة الاشتراك الموثوقة subscriptions/{uid} → { plan, featured }. */
export async function loadSubscription(uid) {
  if (!uid) return { plan: 'free', featured: false };
  const fb = await firebase();
  try {
    const snap = await fb.getDoc(fb.doc(fb.db, 'subscriptions', uid));
    const d = snap.exists() ? snap.data() : {};
    return { plan: d.plan || 'free', featured: d.featured === true };
  } catch (_) { return { plan: 'free', featured: false }; }
}

/** يحمّل الكارت العام public_cards/{uid} (أو null). */
export async function loadPublicCard(uid) {
  const fb = await firebase();
  const snap = await fb.getDoc(fb.doc(fb.db, 'public_cards', uid));
  return snap.exists() ? snap.data() : null;
}
