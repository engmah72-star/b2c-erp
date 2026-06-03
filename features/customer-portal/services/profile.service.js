/**
 * SERVICES · profile — بيانات العميل وبروفايل الأعمال والكارت العام.
 * القراءة مغلّفة · الكتابة عبر clientActions (H1.1). لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';

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

/** يحمّل الكارت العام public_cards/{uid} (أو null). */
export async function loadPublicCard(uid) {
  const fb = await firebase();
  const snap = await fb.getDoc(fb.doc(fb.db, 'public_cards', uid));
  return snap.exists() ? snap.data() : null;
}
