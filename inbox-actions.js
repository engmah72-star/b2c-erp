/**
 * Business2Card ERP — inbox-actions.js
 *
 * ━━━ MESSAGING ACTIONS LAYER (P2.0) ━━━
 *
 * طبقة الأفعال للـ inbox/المحادثات.
 *
 * الفلسفة مختلفة عن orderActions / clientActions:
 *   - مفيش withIdempotency — الـ messaging real-time، latency لا يحتمل reserve-first
 *   - مفيش auditEntry — كل رسالة هي بنفسها audit entry (senderId/createdAt/readBy)
 *   - الـ Architecture Guard يفرض إن كل الكتابات تمر هنا — مش inline في inbox.html
 *
 * الـ contract: كل function تقبل { db, ...params } وتُرجع الـ raw write promise.
 * الـ caller هو اللي يتعامل مع error/toast (نفس السلوك القديم).
 */

import {
  doc,
  collection,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
// Messaging Policy (Phase 0): مصدر الثوابت الواحد للنمط. محادثات الإنبوكس
// (DM/قناة/خيط أوردر بين الموظفين) = نمط «زمالة». import مراسلة→مراسلة (يمر قفل الحدود).
import { MODES, resolve as resolveMessagingPolicy, PARTIES } from './core/messaging-policy.js';

// ══════════════════════════════════════════
// PRESENCE
// ══════════════════════════════════════════

/**
 * يكتب presence doc للمستخدم الحالي (online/offline + typing indicator).
 * كل النداءات تستخدم `merge:true` فلا تمسح الحقول الأخرى.
 */
export async function setPresence({
  db, userId,
  online = null,         // true | false | null (لو null لا تُكتب)
  typingIn = undefined,  // string | null | undefined (undefined = لا تُكتب)
  name = '', role = '',
}) {
  if (!db || !userId) return;
  const data = { lastSeen: serverTimestamp() };
  if (online !== null) data.online = online;
  if (typingIn !== undefined) data.typingIn = typingIn;
  if (name) data.name = name;
  if (role) data.role = role;
  return setDoc(doc(db, 'presence', userId), data, { merge: true });
}

// ══════════════════════════════════════════
// CONVERSATIONS — ensure / join / archive / settings
// ══════════════════════════════════════════

/**
 * يضمن وجود channel conversation (idempotent).
 * لو مش موجودة، يبنيها بـ participants المحدَّدين.
 * لو موجودة لكن currentUserId مش فيها → يضمه.
 *
 * @returns {Promise<{created: boolean, joined: boolean}>}
 */
export async function ensureChannelConversation({
  db, channelKey, name, ico,
  participants, currentUserId,
}) {
  const convId = 'channel_' + channelKey;
  const ref = doc(db, 'conversations', convId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const members = (participants || []).slice();
    if (currentUserId && !members.includes(currentUserId)) members.push(currentUserId);
    await setDoc(ref, {
      type: 'channel', mode: MODES.COLLEGIAL,
      channelKey, name, ico,
      participants: members,
      archivedBy: [],
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: 'بدأت المحادثة',
      lastSenderName: 'النظام',
    });
    return { created: true, joined: false, convId };
  }
  const cur = snap.data();
  if (currentUserId && !(cur.participants || []).includes(currentUserId)) {
    await updateDoc(ref, { participants: arrayUnion(currentUserId) });
    return { created: false, joined: true, convId };
  }
  return { created: false, joined: false, convId };
}

/**
 * يضمن وجود DM (idempotent). stable id = `dm_${sortedUids.join('_')}`.
 */
export async function ensureDM({
  db, currentUserId, currentUserName,
  otherUserId, otherUserName,
}) {
  const ids = [currentUserId, otherUserId].sort();
  const convId = 'dm_' + ids.join('_');
  const ref = doc(db, 'conversations', convId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      type: 'dm', mode: MODES.COLLEGIAL,
      participants: ids,
      dmNames: { [currentUserId]: currentUserName, [otherUserId]: otherUserName },
      archivedBy: [],
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: 'بدأت المحادثة',
      unreadCount: {},
    });
    return { created: true, convId };
  }
  return { created: false, convId };
}

/**
 * يضمن وجود order_thread (للتعليقات على أوردر بعينه).
 *
 * @param {Object} order  — { orderId, orderCode?, clientName?, designerId?, productionAgent?, shippingOfficerId?, createdBy? }
 * @param {string[]} extraParticipants — admins/ops UIDs تُضاف تلقائياً
 */
export async function ensureOrderThread({
  db, order, currentUserId, extraParticipants = [],
}) {
  const convId = 'order_' + order.orderId;
  const ref = doc(db, 'conversations', convId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const stake = [currentUserId];
    ['designerId', 'productionAgent', 'shippingOfficerId', 'createdBy'].forEach(k => {
      if (order[k]) stake.push(order[k]);
    });
    (extraParticipants || []).forEach(u => stake.push(u));
    const participants = [...new Set(stake.filter(Boolean))];
    await setDoc(ref, {
      type: 'order_thread', mode: MODES.COLLEGIAL,
      orderId: order.orderId,
      name: 'تعليقات #' + (order.orderCode || (order.orderId || '').slice(-6)) + ' — ' + (order.clientName || ''),
      participants,
      archivedBy: [],
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: 'بدء نقاش الأوردر',
      unreadCount: {},
      orderRef: order,
    });
    return { created: true, convId };
  }
  if (currentUserId && !(snap.data().participants || []).includes(currentUserId)) {
    await updateDoc(ref, { participants: arrayUnion(currentUserId) });
    return { created: false, joined: true, convId };
  }
  return { created: false, joined: false, convId };
}

/**
 * أرشفة / إلغاء أرشفة محادثة لمستخدم بعينه.
 */
export async function setConversationArchived({
  db, convId, userId, archived,
}) {
  return updateDoc(doc(db, 'conversations', convId), {
    archivedBy: archived ? arrayUnion(userId) : arrayRemove(userId),
  });
}

/**
 * يحدّث flag على المحادثة لمستخدم بعينه (mute/clearForMe/wallpaper).
 *
 * @param {string} kind  — 'mute' | 'unmute' | 'clearForMe' | 'wallpaper'
 * @param {number} [wallpaperIdx]  — لو kind='wallpaper'
 */
export async function updateConversationUserFlag({
  db, convId, userId, kind, wallpaperIdx,
}) {
  const ref = doc(db, 'conversations', convId);
  switch (kind) {
    case 'mute':
      return updateDoc(ref, { mutedBy: arrayUnion(userId) });
    case 'unmute':
      return updateDoc(ref, { mutedBy: arrayRemove(userId) });
    case 'clearForMe':
      return updateDoc(ref, { [`clearedAt.${userId}`]: serverTimestamp() });
    case 'wallpaper':
      return updateDoc(ref, { [`wallpaperBy.${userId}`]: wallpaperIdx || 0 });
    default:
      throw new Error(`[inbox] unknown flag kind: ${kind}`);
  }
}

/**
 * يصفّر الـ unreadCount[userId] ويعلّم آخر 30 رسالة كـ readBy[userId].
 *
 * @param {Array} recentMessages — آخر 30 رسالة (caller يفلتر بـ senderId !== userId)
 */
export async function markConversationRead({
  db, convId, userId, recentMessages = [],
}) {
  if (!convId || !userId) return;
  await updateDoc(doc(db, 'conversations', convId), {
    [`unreadCount.${userId}`]: 0,
  });
  if (recentMessages.length) {
    const batch = writeBatch(db);
    recentMessages.forEach(m => {
      batch.update(
        doc(db, 'conversations', convId, 'messages', m._id),
        { [`readBy.${userId}`]: serverTimestamp() }
      );
    });
    await batch.commit();
  }
}

// ══════════════════════════════════════════
// CLIENT ORDER BRIDGE — جسر تواصل الموظف↔العميل للأوردر
// ══════════════════════════════════════════
//
// يمكّن الموظف من فتح/عرض محادثة العميل الخاصة بالأوردر (نفس clord_{orderId}
// التي يستخدمها العميل — خيط واحد مشترك) وتقديم التصميم للعميل عبرها.
// طبقة مراسلة بحتة: يكتب conversations + notifications فقط — لا business state
// (يقرأ حقول الأوردر المُمرَّرة كوسيط، لا يكتب orders/financial). يمر قفل الحدود.

/**
 * يضمن وجود محادثة العميل للأوردر (clord_{orderId}) من جانب الموظف.
 * نفس المعرّف الذي يفتحه العميل (clientActions.openClientThread) → خيط واحد.
 * يضيف العميل + فريق الأوردر + المُنفِّذ كـ participants.
 *
 * @param {Object} order — { _id, orderId?, clientId?, clientName?, designerId?, productionAgent?, shippingOfficerId?, createdBy? }
 * @returns {Promise<{created:boolean, convId:string, clientUid:string, participants:string[]}>}
 */
export async function ensureClientOrderThread({
  db, order, currentUserId, currentUserName = '',
}) {
  if (!order || !order._id) throw new Error('[inbox] order مطلوب');
  const clientUid = order.clientId || '';
  const convId = 'clord_' + order._id;
  const ref = doc(db, 'conversations', convId);
  // النمط من المصدر الواحد: موظف→عميل بسياق أوردر = خدمة (service).
  const mode = resolveMessagingPolicy({
    from: PARTIES.EMPLOYEE, to: PARTIES.CLIENT, context: { binding: 'order' },
  }).mode;
  const staff = [
    order.designerId, order.productionAgent, order.shippingOfficerId,
    order.createdBy, currentUserId,
  ].filter(Boolean);
  const participants = [...new Set([clientUid, ...staff].filter(Boolean))];

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      type: 'order_thread', mode, isClientThread: true,
      orderId: order.orderId || order._id,
      orderRef: { orderId: order.orderId || order._id, clientName: order.clientName || '' },
      name: '💬 ' + (order.clientName || 'عميل') + ' — #' + (order.orderId || (order._id || '').slice(-6)),
      participants, archivedBy: [], lastReadByAll: false,
      createdAt: serverTimestamp(), lastMessageAt: serverTimestamp(),
      lastMessagePreview: '', unreadCount: {},
    });
    return { created: true, convId, clientUid, participants };
  }
  const cur = snap.data().participants || [];
  const merged = [...new Set([...cur, ...participants])];
  if (merged.length !== cur.length) await updateDoc(ref, { participants: merged });
  return { created: false, convId, clientUid, participants: merged };
}

/**
 * يقدّم التصميم (البروفة) للعميل عبر محادثة الأوردر + يُشعره.
 * الرسالة **تشير** للبروفة الموجودة على الأوردر (proofUrl) — لا تخزّن business
 * state. الاعتماد يبقى Order-Centric (clientApproval CF) بلا تغيير.
 *
 * @param {string} proofUrl — رابط البروفة (من حقول الأوردر: printFinalUrl/designFileUrl/...)
 * @returns {Promise<{ok:boolean, convId:string, notified:boolean}>}
 */
export async function sendOrderDesignToClient({
  db, order, proofUrl, currentUserId, currentUserName = '', note = '',
}) {
  const ens = await ensureClientOrderThread({ db, order, currentUserId, currentUserName });
  const { convId, clientUid, participants } = ens;
  const conv = { participants, archivedBy: [] };

  // 1) ملاحظة نصية (تظهر دائماً مهما كان نوع البروفة).
  await sendMessage({
    db, convId, senderId: currentUserId, senderName: currentUserName, conv,
    payload: { type: 'text', text: note || '📐 تم رفع تصميمك — راجِع البروفة واعتمِدها من صفحة الطلب.' },
  });

  // 2) البروفة كمرفق (يشير لرابط الأوردر — لا نسخ business state).
  if (proofUrl) {
    const isPdf = /\.pdf(\?|$)/i.test(proofUrl);
    await sendMessage({
      db, convId, senderId: currentUserId, senderName: currentUserName, conv,
      payload: {
        type: isPdf ? 'file' : 'image',
        attachments: [{
          url: proofUrl,
          name: isPdf ? 'بروفة-التصميم.pdf' : 'بروفة-التصميم',
          mime: isPdf ? 'application/pdf' : 'image/*',
        }],
      },
    });
  }

  // 3) إشعار للعميل (طبقة الإشعارات — ليست business state).
  if (clientUid) {
    await addDoc(collection(db, 'notifications'), {
      toUid: clientUid, type: 'design', ico: '📐',
      title: '📐 تصميمك جاهز للمراجعة',
      desc: 'افتح طلبك لمراجعة البروفة واعتمادها',
      link: 'cp-shell.html', read: false, createdAt: serverTimestamp(),
    });
  }
  return { ok: true, convId, notified: !!clientUid };
}

// ══════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════

/**
 * يرسل رسالة جديدة + يحدّث lastMessage* على المحادثة + يزوّد unreadCount للباقي.
 * (atomic داخلياً: لو addDoc نجح والـ updateDoc فشل → الرسالة ظاهرة لكن preview قديم،
 * مقبول للـ messaging UX).
 *
 * @returns {Promise<{messageId: string, preview: string}>}
 */
export async function sendMessage({
  db, convId, payload,
  senderId, senderName,
  conv, // optional — لو caller معاه الـ conv data نتجنّب getDoc
}) {
  if (!convId) throw new Error('[inbox] convId مطلوب');
  const msg = {
    senderId,
    senderName,
    createdAt: serverTimestamp(),
    readBy: { [senderId]: serverTimestamp() },
    ...payload,
  };
  const msgRef = await addDoc(collection(db, 'conversations', convId, 'messages'), msg);

  const preview =
    payload.type === 'text'        ? payload.text :
    payload.type === 'image'       ? '📷 صورة' :
    payload.type === 'file'        ? '📄 ' + (payload.attachments?.[0]?.name || 'مرفق') :
    payload.type === 'voice'       ? '🎤 رسالة صوتية' :
    payload.type === 'order_share' ? '📦 أوردر: ' + (payload.orderRef?.clientName || '') :
    'رسالة';

  const upd = {
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: (preview || '').slice(0, 80),
    lastSenderId: senderId,
    lastSenderName: senderName,
    lastReadByAll: false,
  };

  let convData = conv;
  if (!convData) {
    const snap = await getDoc(doc(db, 'conversations', convId));
    convData = snap.exists() ? snap.data() : { participants: [] };
  }
  (convData.participants || []).forEach(uid => {
    if (uid !== senderId) upd[`unreadCount.${uid}`] = increment(1);
  });
  if ((convData.archivedBy || []).length > 0) upd['archivedBy'] = [];

  await updateDoc(doc(db, 'conversations', convId), upd);
  return { messageId: msgRef.id, preview };
}

/**
 * يعدّل نص رسالة (الـ caller يحقق ownership قبل النداء).
 */
export async function editMessage({
  db, convId, messageId, text, mentions = [],
}) {
  return updateDoc(
    doc(db, 'conversations', convId, 'messages', messageId),
    { text, mentions, editedAt: serverTimestamp() }
  );
}

/**
 * Soft-delete: يفرّغ النص والمرفقات ويعلّم deletedAt.
 * (الـ doc يبقى عشان readBy + reactions لا تنكسر).
 */
export async function softDeleteMessage({ db, convId, messageId }) {
  return updateDoc(
    doc(db, 'conversations', convId, 'messages', messageId),
    { deletedAt: serverTimestamp(), text: '', attachments: [] }
  );
}

/**
 * يبدّل تفاعل مستخدم على رسالة (toggle).
 *
 * @param {boolean} adding — true = أضف، false = شيل
 */
export async function toggleMessageReaction({
  db, convId, messageId, userId, emoji, adding,
}) {
  return updateDoc(
    doc(db, 'conversations', convId, 'messages', messageId),
    { [`reactions.${emoji}`]: adding ? arrayUnion(userId) : arrayRemove(userId) }
  );
}

/**
 * يثبّت أو يلغي تثبيت رسالة.
 */
export async function setMessagePinned({
  db, convId, messageId, pinned, userId = '', userName = '',
}) {
  return updateDoc(
    doc(db, 'conversations', convId, 'messages', messageId),
    {
      pinned: !!pinned,
      pinnedAt: pinned ? serverTimestamp() : null,
      pinnedBy: pinned ? userId : null,
      pinnedByName: pinned ? userName : null,
    }
  );
}

// ══════════════════════════════════════════
// STORIES
// ══════════════════════════════════════════

/**
 * ينشر story جديدة. expiresAt = الآن + 24 ساعة.
 *
 * @param {Object} data — { type:'text'|'image', text?, bgColor?, imgUrl?, caption? }
 */
export async function postStory({
  db, data, userId, userName, color = '#00a884',
}) {
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 3600 * 1000);
  return addDoc(collection(db, 'stories'), {
    ...data,
    userId,
    userName: userName || 'موظف',
    userColor: color,
    viewers: [],
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expires),
  });
}

/**
 * يضيف userId إلى viewers (لو مش موجود).
 */
export async function recordStoryView({ db, storyId, userId }) {
  return updateDoc(doc(db, 'stories', storyId), { viewers: arrayUnion(userId) });
}

/**
 * يحذف story (owner فقط — الـ caller يتحقق).
 */
export async function deleteStory({ db, storyId }) {
  return deleteDoc(doc(db, 'stories', storyId));
}

// ══════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════

export const inboxActions = {
  // presence
  setPresence,
  // conversations
  ensureChannelConversation,
  ensureDM,
  ensureOrderThread,
  setConversationArchived,
  updateConversationUserFlag,
  markConversationRead,
  // client order bridge
  ensureClientOrderThread,
  sendOrderDesignToClient,
  // messages
  sendMessage,
  editMessage,
  softDeleteMessage,
  toggleMessageReaction,
  setMessagePinned,
  // stories
  postStory,
  recordStoryView,
  deleteStory,
};

export default inboxActions;

// Expose to window for inline onclick handlers + non-module callers.
if (typeof window !== 'undefined') {
  window.inboxActions = inboxActions;
}
