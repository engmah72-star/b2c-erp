/**
 * features/inbox/controllers/pins-controller.js
 * ━━━ PINS CONTROLLER — الرسائل المثبتة ━━━
 * Manages pinned messages strip and list modal.
 */

import { escapeHtml as esc } from '../../../core/inbox-utils.js';

/**
 * @param {Object} deps
 * @param {Function} deps.$ - getElementById shortcut
 * @param {Function} deps.toast
 * @param {Object} deps.inboxActions
 * @param {Object} deps.db
 * @param {Function} deps.getState - () => { currentUid, currentUserName, activeConvId, messages }
 * @param {Function} deps.jumpToMsg
 */
export function createPinsController(deps) {
  const { $, toast, inboxActions, db, getState, jumpToMsg } = deps;

  async function pin() {
    const { activeConvId, currentUid, currentUserName } = getState();
    const m = deps.getActiveMsg?.();
    if (!m) return;
    const newState = !m.data.pinned;
    try {
      await inboxActions.setMessagePinned({ db, convId: activeConvId, messageId: m.data._id, pinned: newState, userId: currentUid, userName: currentUserName || '' });
      toast(newState ? '📌 تم التثبيت' : 'تم إلغاء التثبيت', 'ok');
    } catch (e) {
      toast('❌ ' + e.message, 'err');
    }
  }

  function refreshStrip() {
    const strip = $('pin-strip'); if (!strip) return;
    const { messages } = getState();
    const pinned = messages.filter(m => m.pinned && !m.deletedAt);
    if (!pinned.length) { strip.classList.remove('show'); return; }
    const latest = pinned[pinned.length - 1];
    const preview = latest.text || (latest.type === 'image' ? '📷 صورة' : latest.type === 'file' ? '📄 ملف' : latest.type === 'voice' ? '🎤 صوتية' : latest.type === 'order_share' ? '📦 أوردر' : 'رسالة');
    $('pin-strip-text').textContent = preview.slice(0, 80);
    $('pin-strip-count').textContent = pinned.length;
    $('pin-strip-count').style.display = pinned.length > 1 ? '' : 'none';
    strip.classList.add('show');
  }

  function openList() {
    $('chat-menu')?.classList.remove('show');
    const list = $('pinned-list'); if (!list) return;
    const { messages } = getState();
    const pinned = messages.filter(m => m.pinned && !m.deletedAt).sort((a, b) => (b.pinnedAt?.seconds || 0) - (a.pinnedAt?.seconds || 0));
    if (!pinned.length) {
      list.innerHTML = '<div class="mh-empty-state mh-empty-state-sm">لا توجد رسائل مثبتة</div>';
    } else {
      list.innerHTML = pinned.map(m => {
        const preview = m.text || (m.type === 'image' ? '📷 صورة' : m.type === 'file' ? '📄 ' + (m.attachments?.[0]?.name || '') : m.type === 'voice' ? '🎤 رسالة صوتية' : m.type === 'order_share' ? '📦 أوردر مشارَك' : 'رسالة');
        const when = m.pinnedAt?.toDate?.()?.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) || '';
        return `<div class="mh-pinned-item" onclick="jumpFromPinned('${m._id}')">
          <span class="mh-pinned-item-ico">📌</span>
          <div class="flex-1 min-w-0">
            <div class="mh-pinned-item-meta">${esc(m.senderName || '—')} · ${when}</div>
            <div class="mh-pinned-item-text">${esc(preview)}</div>
            ${m.pinnedByName ? `<div class="mh-pinned-item-by">ثبّتها ${esc(m.pinnedByName)}</div>` : ''}
          </div>
          <button type="button" class="mh-pinned-item-unpin" onclick="event.stopPropagation();unpinFromList('${m._id}')" title="إلغاء التثبيت">✕</button>
        </div>`;
      }).join('');
    }
    $('pinned-ov').classList.add('show');
  }

  function closeList() { $('pinned-ov').classList.remove('show'); }

  async function unpinFromList(mid) {
    const { activeConvId } = getState();
    try {
      await inboxActions.setMessagePinned({ db, convId: activeConvId, messageId: mid, pinned: false });
      toast('تم إلغاء التثبيت', 'ok');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  }

  function jumpFromPinned(mid) {
    closeList();
    setTimeout(() => jumpToMsg(mid), 200);
  }

  return {
    pin,
    refreshStrip,
    openList,
    closeList,
    unpinFromList,
    jumpFromPinned,
  };
}
