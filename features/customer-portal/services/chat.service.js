/**
 * SERVICES · chat — خط تواصل العميل (محادثات الإنبوكس).
 * الفتح/الإرسال عبر clientActions (H1.1) · الاشتراك للقراءة. لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';

/** يفتح/ينشئ خيط محادثة (kind: 'order' | 'support' | 'member'). يُرجع { ok, convId, participants }. */
export async function openThread({ kind, uid, name, order = null, peer = null }) {
  const fb = await firebase();
  return fb.clientActions.openClientThread({ kind, clientUid: uid, clientName: name, order, peer });
}

/** يرسل رسالة نصية عبر الفعل المركزي (مع ردّ اختياري). */
export async function sendMessage({ convId, text, uid, name, participants, replyTo = null }) {
  const fb = await firebase();
  return fb.clientActions.sendClientMessage({ convId, text, senderId: uid, senderName: name, participants, replyTo });
}

/** تعديل نص رسالة. */
export async function editMessage({ convId, messageId, text }) {
  const fb = await firebase();
  return fb.clientActions.editClientMessage({ convId, messageId, text });
}

/** حذف رسالة (ناعم). */
export async function deleteMessage({ convId, messageId }) {
  const fb = await firebase();
  return fb.clientActions.deleteClientMessage({ convId, messageId });
}

/** تبديل تفاعل على رسالة. */
export async function reactMessage({ convId, messageId, uid, emoji, adding }) {
  const fb = await firebase();
  return fb.clientActions.toggleClientReaction({ convId, messageId, userId: uid, emoji, adding });
}

/** طلب تعديل على التصميم: رسالة في خيط الأوردر + إشعار فريق الأوردر (عبر الفعل المركزي). */
export async function requestModification({ order, uid, name, note = '' }) {
  const fb = await firebase();
  return fb.clientActions.requestOrderModification({ order, clientUid: uid, clientName: name, note });
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

/** يشترك في كل محادثات العضو (inbox موحّد). cb(conversations[]) الأحدث أولاً. */
export async function subscribeConversations(uid, cb) {
  if (!uid) return () => {};
  const fb = await firebase();
  // array-contains فقط (بلا orderBy) لتفادي فهرس مركّب — الترتيب محليًا.
  const q = fb.query(
    fb.collection(fb.db, 'conversations'),
    fb.where('participants', 'array-contains', uid),
    fb.limit(40),
  );
  const ts = (c) => (c.lastMessageAt?.seconds ?? c.createdAt?.seconds ?? 0);
  return fb.onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ ...d.data(), _id: d.id })).sort((a, b) => ts(b) - ts(a)));
  });
}

/** يصفّر عدّاد غير المقروء للعضو على محادثة (عند فتحها). */
export async function markThreadRead({ convId, uid }) {
  const fb = await firebase();
  return fb.clientActions.markClientThreadRead({ convId, uid });
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
