/**
 * features/inbox/controllers/message-actions-controller.js
 * ━━━ MESSAGE ACTIONS CONTROLLER — إجراءات الرسائل ━━━
 * Handles the action sheet (long-press menu), reactions, reply, copy, forward, edit, delete.
 */

import { escapeHtml as esc, initAvatar } from '../../../core/inbox-utils.js';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/**
 * @param {Object} deps
 * @param {Function} deps.$ - getElementById shortcut
 * @param {Function} deps.toast
 * @param {Object} deps.inboxActions
 * @param {Object} deps.db
 * @param {Function} deps.getState - () => { currentUid, activeConvId, messages, allUsers, conversations, roleColorMap, roleLabelMap }
 * @param {Function} deps.sendMessageTo - (convId, payload, convData?) => Promise
 * @param {Function} deps.renderForwardList - () => void
 * @param {Function} deps.onTyping - (el) => void
 */
export function createMessageActionsController(deps) {
  const { $, toast, inboxActions, db, getState, sendMessageTo } = deps;

  let activeMsgForAction = null;
  let replyTo = null;
  let editingMsgId = null;

  function open(mid) {
    const { messages, currentUid } = getState();
    const m = messages.find(x => x._id === mid); if (!m || m.deletedAt) return;
    activeMsgForAction = { id: mid, data: m };
    const isMine = m.senderId === currentUid;
    $('react-row').innerHTML = REACTION_EMOJIS.map(e => `<button type="button" class="ib-react-pick" onclick="actReact('${e}')">${e}</button>`).join('');
    $('act-edit').classList.toggle('hide', !(isMine && m.type === 'text'));
    $('act-del').classList.toggle('hide', !isMine);
    const pinBtn = $('act-pin');
    if (pinBtn) pinBtn.textContent = m.pinned ? '📌 إلغاء التثبيت' : '📌 تثبيت';
    $('msg-actions').classList.add('show');
  }

  function close() {
    $('msg-actions').classList.remove('show');
    activeMsgForAction = null;
  }

  async function react(emo) {
    if (!activeMsgForAction) return;
    await toggleReaction(activeMsgForAction.id, emo);
    close();
  }

  async function toggleReaction(mid, emo) {
    const { messages, currentUid, activeConvId } = getState();
    const m = messages.find(x => x._id === mid); if (!m) return;
    const cur = (m.reactions?.[emo]) || [];
    const mine = cur.includes(currentUid);
    try {
      await inboxActions.toggleMessageReaction({ db, convId: activeConvId, messageId: mid, userId: currentUid, emoji: emo, adding: !mine });
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  }

  function reply() {
    if (!activeMsgForAction) return;
    const m = activeMsgForAction.data;
    const preview = m.text || (m.type === 'image' ? '📷 صورة' : m.type === 'file' ? '📄 ' + (m.attachments?.[0]?.name || '') : m.type === 'voice' ? '🎤 رسالة صوتية' : m.type === 'order_share' ? '📦 أوردر مشارَك' : 'رسالة');
    replyTo = { msgId: m._id, preview: preview.slice(0, 120), senderName: m.senderName || '' };
    $('reply-name').textContent = replyTo.senderName || 'رد على رسالة';
    $('reply-text').textContent = replyTo.preview;
    $('reply-strip').classList.add('show');
    $('ib-input')?.focus();
    close();
  }

  function cancelReply() {
    replyTo = null;
    editingMsgId = null;
    $('reply-strip')?.classList.remove('show');
  }

  async function copy() {
    if (!activeMsgForAction) return;
    const m = activeMsgForAction.data;
    const txt = m.text || m.attachments?.[0]?.url || '';
    try { await navigator.clipboard.writeText(txt); toast('✅ تم النسخ', 'ok'); } catch (_) { toast('انسخ يدوياً', 'err'); }
    close();
  }

  function forward() {
    if (!activeMsgForAction) return;
    close();
    $('fwd-ov').classList.add('show');
    deps.renderForwardList();
    let __fwdT;
    $('fwd-search').oninput = () => { clearTimeout(__fwdT); __fwdT = setTimeout(deps.renderForwardList, 150); };
    setTimeout(() => $('fwd-search')?.focus(), 100);
  }

  async function doForward(kind, id, otherName) {
    if (!activeMsgForAction) return;
    const { currentUid, currentUserName, conversations } = getState();
    let targetConvId;
    try {
      if (kind === 'conv') {
        targetConvId = id;
      } else {
        const r = await inboxActions.ensureDM({ db, currentUserId: currentUid, currentUserName, otherUserId: id, otherUserName: otherName });
        targetConvId = r.convId;
      }
      const src = activeMsgForAction.data;
      const payload = { type: src.type || 'text', forwarded: true };
      if (src.text) payload.text = src.text;
      if (src.attachments) payload.attachments = src.attachments;
      if (src.orderRef) payload.orderRef = src.orderRef;
      await sendMessageTo(targetConvId, payload);
      $('fwd-ov').classList.remove('show');
      toast('✅ تم التوجيه', 'ok');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  }

  function edit() {
    if (!activeMsgForAction) return;
    const { currentUid } = getState();
    const m = activeMsgForAction.data;
    if (m.senderId !== currentUid || m.type !== 'text') return;
    editingMsgId = m._id;
    const inp = $('ib-input'); inp.value = m.text || ''; inp.focus();
    $('reply-name').textContent = '✏️ تعديل';
    $('reply-text').textContent = (m.text || '').slice(0, 120);
    $('reply-strip').classList.add('show');
    close();
  }

  async function del() {
    if (!activeMsgForAction) return;
    const { currentUid, activeConvId } = getState();
    const m = activeMsgForAction.data;
    if (m.senderId !== currentUid) return;
    if (!confirm('حذف الرسالة؟')) return;
    try {
      await inboxActions.softDeleteMessage({ db, convId: activeConvId, messageId: m._id });
      toast('🗑 تم الحذف', 'ok');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
    close();
  }

  function getReplyTo() { return replyTo; }
  function getEditingMsgId() { return editingMsgId; }
  function clearEditing() { editingMsgId = null; }
  function getActiveMsg() { return activeMsgForAction; }

  return {
    open, close,
    react, toggleReaction,
    reply, cancelReply,
    copy, forward, doForward,
    edit, del,
    getReplyTo, getEditingMsgId, clearEditing, getActiveMsg,
  };
}
