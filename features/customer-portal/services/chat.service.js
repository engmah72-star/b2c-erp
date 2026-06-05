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

/** يرفع مرفقًا (صورة/PDF) إلى تخزين العميل ثم يرسله كرسالة (نفس شكل الإنبوكس). */
export async function sendAttachment({ convId, file, uid, name, participants }) {
  const fb = await firebase();
  const { uploadClientFile } = await import('../../../core/storage-helpers.js');
  const up = await uploadClientFile({ clientId: uid, file, kind: 'chat' });
  const type = (file.type || '').startsWith('image/') ? 'image' : 'file';
  return fb.clientActions.sendClientAttachment({
    convId, type,
    attachment: { url: up.url, name: file.name, size: file.size, mime: file.type || '' },
    senderId: uid, senderName: name, participants,
  });
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
