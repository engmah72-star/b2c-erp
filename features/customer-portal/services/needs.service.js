/**
 * SERVICES · needs — لوحة الاحتياجات (Business Network · member↔member).
 * طلب صريح بين الأعضاء: طرح/تصفّح/ردّ بالاهتمام. الكتابة عبر clientActions (H1.1).
 * التواصل بعد الردّ = الكارت الذكي (إشعار برابط الكارت) لا شات جديد. لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';

const ts = (o) => (o.createdAt?.seconds ?? 0);

/** يحمّل الاحتياجات المفتوحة (الأحدث أولاً)، مع تصفية محلية اختيارية. */
export async function loadOpenNeeds({ specialty = '', mineUid = '' } = {}) {
  const fb = await firebase();
  const snap = await fb.getDocs(
    fb.query(fb.collection(fb.db, 'business_needs'), fb.where('status', '==', 'open'), fb.limit(60)),
  );
  let list = snap.docs.map((d) => ({ ...d.data(), _id: d.id })).sort((a, b) => ts(b) - ts(a));
  if (specialty) list = list.filter((n) => n.specialty === specialty);
  if (mineUid) list = list.filter((n) => n.authorUid === mineUid);
  return list;
}

/** يطرح احتياجًا جديدًا. */
export async function postNeed({ uid, name, username, title, specialty, city, details }) {
  const fb = await firebase();
  return fb.clientActions.postBusinessNeed({
    authorUid: uid, authorName: name, authorUsername: username,
    title, specialty, city, details,
  });
}

/** يردّ بالاهتمام على احتياج → يصل صاحبه إشعار برابط كارت المُهتمّ. */
export async function respondNeed({ needId, authorUid, uid, name, username }) {
  const fb = await firebase();
  return fb.clientActions.respondToNeed({
    needId, authorUid, responderUid: uid, responderName: name, responderUsername: username,
  });
}

/** إغلاق احتياج (لصاحبه). */
export async function closeNeed({ needId, uid }) {
  const fb = await firebase();
  return fb.clientActions.closeBusinessNeed({ needId, uid });
}
