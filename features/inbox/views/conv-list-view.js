/**
 * Business2Card ERP — features/inbox/views/conv-list-view.js
 *
 * ━━━ CONVERSATION LIST VIEW (Phase-2 · inbox god-page decomp) ━━━
 *
 * Pure HTML builder for the conversation sidebar.
 */

import {
  convDisplayName, convIcon, convColor, isUserOnline,
  fmtTime, escapeHtml as esc,
} from '../../../core/inbox-utils.js';

/**
 * Build sidebar conversation list HTML + counts.
 *
 * @param {Object} args
 * @param {Array}    args.conversations
 * @param {string}   args.activeConvId
 * @param {string}   args.currentUid
 * @param {string}   args.currentRole
 * @param {Array}    args.allUsers
 * @param {Map}      args.presenceMap
 * @param {string}   args.searchQuery
 * @param {string}   args.listTab          — 'all' | 'archived'
 * @param {Object}   [args.roleColorMap]
 *
 * @returns {{
 *   html: string,            // main list HTML (with empty states)
 *   countAll: number,
 *   countArchived: number,
 * }}
 */
export function buildConvListHTML({
  conversations = [], activeConvId, currentUid, currentRole,
  allUsers = [], presenceMap = new Map(),
  searchQuery = '', listTab = 'all',
  roleColorMap = {},
}) {
  const ctx = { currentUid, allUsers, roleColorMap };
  const q = (searchQuery || '').toLowerCase();
  let items = conversations.slice();
  items.sort((a, b) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));

  if (listTab === 'archived') {
    items = items.filter(c => (c.archivedBy || []).includes(currentUid));
  } else {
    items = items.filter(c => !(c.archivedBy || []).includes(currentUid));
  }

  if (q) {
    items = items.filter(c => {
      const n = convDisplayName(c, ctx).toLowerCase();
      return n.includes(q) || (c.lastMessagePreview || '').toLowerCase().includes(q);
    });
  }

  const countAll = conversations.filter(c => !(c.archivedBy || []).includes(currentUid)).length;
  const countArchived = conversations.filter(c => (c.archivedBy || []).includes(currentUid)).length;

  if (!items.length) {
    let html;
    if (searchQuery) {
      html = '<div style="padding:40px 20px;text-align:center;color:var(--ws-text-dim);font-size:var(--fs-md)">لا نتائج</div>';
    } else if (listTab === 'archived') {
      html = '<div style="padding:40px 20px;text-align:center;color:var(--ws-text-dim);font-size:var(--fs-md)">لا توجد محادثات مؤرشفة</div>';
    } else if (conversations.length === 0) {
      html = `<div style="padding:28px 20px;text-align:center;color:var(--ws-text-dim);font-size:var(--fs-md);line-height:1.9">
        <div style="font-size:42px;margin-bottom:10px;opacity:.5">💬</div>
        <strong style="color:var(--ws-text)">لا توجد محادثات بعد</strong><br>
        <span style="font-size:var(--fs-sm);color:var(--ws-text-dim)">role: ${currentRole || 'غير محدد'} · uid: ${(currentUid || '').slice(0, 6)}…</span><br>
        <button onclick="retryEnsureChannels()" style="margin-top:12px;padding:8px 16px;border-radius:10px;border:1px solid var(--ws-border);background:var(--ws-bg-elev);color:var(--ws-text);cursor:pointer;font-family:inherit;font-size:var(--fs-base);font-weight:700">🔄 إعادة الإعداد</button>
        <button onclick="newDM()" style="margin-top:12px;margin-right:6px;padding:8px 16px;border-radius:10px;border:none;background:#00a884;color:#fff;cursor:pointer;font-family:inherit;font-size:var(--fs-base);font-weight:700">✏️ محادثة جديدة</button>
        <div style="font-size:var(--fs-xs);margin-top:10px;color:var(--ws-text-dim);opacity:.7">افتح Console (F12) لتفاصيل التشخيص</div>
      </div>`;
    } else {
      html = '<div style="padding:40px 20px;text-align:center;color:var(--ws-text-dim);font-size:var(--fs-md)">ابدأ محادثة بالضغط على ✏️</div>';
    }
    return { html, countAll, countArchived };
  }

  const html = items.map(c => {
    const isActive = c._id === activeConvId;
    const name = convDisplayName(c, ctx);
    const ico = convIcon(c, ctx);
    const col = convColor(c, ctx);
    const unread = (c.unreadCount?.[currentUid] || 0);
    const isDM = c.type === 'dm';
    const otherUid = isDM ? (c.participants || []).find(p => p !== currentUid) : null;
    const otherPresence = otherUid ? presenceMap.get(otherUid) : null;
    const isOnline = otherPresence && isUserOnline(otherPresence);
    const lastTime = fmtTime(c.lastMessageAt);
    const lastSender = c.lastSenderId === currentUid ? 'أنت: ' : (isDM ? '' : (c.lastSenderName ? c.lastSenderName + ': ' : ''));
    const tick = c.lastSenderId === currentUid ? (c.lastReadByAll ? '✓✓' : '✓') : '';
    const tickClass = c.lastReadByAll ? 'read' : '';
    return `<div class="ib-conv ${isActive ? 'active' : ''} ${unread ? 'unread' : ''}" data-id="${c._id}" onclick="openConv('${c._id}')">
      <div class="ib-conv-avatar" style="background:${col}">${ico}${isDM ? `<span class="presence ${isOnline ? 'online' : ''}"></span>` : ''}</div>
      <div class="ib-conv-body">
        <div class="ib-conv-top">
          <div class="ib-conv-name">${esc(name)}</div>
          <div class="ib-conv-time">${lastTime}</div>
        </div>
        <div class="ib-conv-bot">
          <div class="ib-conv-last">${tick ? `<span class="ib-conv-tick ${tickClass}">${tick}</span> ` : ''}${esc(lastSender + (c.lastMessagePreview || ''))}</div>
          <div class="ib-conv-meta">
            ${unread > 0 ? `<span class="ib-conv-unread">${unread > 99 ? '99+' : unread}</span>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  return { html, countAll, countArchived };
}
