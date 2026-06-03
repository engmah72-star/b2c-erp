/**
 * SERVICES · chat — خط تواصل العميل (محادثات الإنبوكس).
 * الفتح/الإرسال عبر clientActions (H1.1) · الاشتراك للقراءة. لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';

/** يفتح/ينشئ خيط محادثة (kind: 'order' | 'support'). يُرجع { ok, convId, participants }. */
export async function openThread({ kind, uid, name, order = null }) {
  const fb = await firebase();
  return fb.clientActions.openClientThread({ kind, clientUid: uid, clientName: name, order });
}

/** يرسل رسالة نصية عبر الفعل المركزي. */
export async function sendMessage({ convId, text, uid, name, participants }) {
  const fb = await firebase();
  return fb.clientActions.sendClientMessage({ convId, text, senderId: uid, senderName: name, participants });
}

/** يشترك في رسائل محادثة (مرتّبة، محدودة). cb(messages[]). يُرجع دالة إلغاء. */
export async function subscribeMessages(convId, cb) {
  const fb = await firebase();
  const q = fb.query(
    fb.collection(fb.db, 'conversations', convId, 'messages'),
    fb.orderBy('createdAt', 'asc'), fb.limit(200),
  );
  return fb.onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ ...d.data(), _id: d.id })).filter((m) => !m.deletedAt));
  });
}
