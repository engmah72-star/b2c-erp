/**
 * SERVICES · notifications — إشعارات العميل داخل البوابة (toUid == uid).
 * اشتراك حيّ للقراءة + تعليم مقروء (تحديث own-doc، طبقة Service مسموح لها · H1.1). لا UI.
 */
import { firebase } from './firebase.js';

const ts = (n) => (n.createdAt?.seconds ?? 0);

/** يشترك في إشعارات العميل (الأحدث أولاً، محدود). cb(items[]). يُرجع دالة إلغاء. */
export async function subscribeNotifications(uid, cb) {
  const fb = await firebase();
  const q = fb.query(
    fb.collection(fb.db, 'notifications'),
    fb.where('toUid', '==', uid), fb.limit(30),
  );
  return fb.onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ ...d.data(), _id: d.id })).sort((a, b) => ts(b) - ts(a)));
  });
}

/** يعلّم إشعاراً مقروءاً. */
export async function markRead(id) {
  const fb = await firebase();
  return fb.updateDoc(fb.doc(fb.db, 'notifications', id), { read: true });
}
