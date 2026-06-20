/**
 * Business2Card ERP — features/inbox/views/conv-list-view.js
 *
 * ━━━ CONVERSATION LIST VIEW (Phase-2 · inbox god-page decomp) ━━━
 *
 * Pure HTML builder for the conversation sidebar.
 * Supports priority hierarchy, typing indicators, muted/pinned states,
 * category badges, accessibility roles, and CSS-class-driven empty states.
 */

import {
  convDisplayName, convIcon, convColor, isUserOnline,
  fmtTime, escapeHtml as esc,
} from '../../../core/inbox-utils.js';

/* ── tiny helpers (private) ─────────────────────────────────────── */

/** Priority CSS class for the conversation row. */
function priorityClass(priority) {
  if (priority === 'urgent') return 'mh-conv-urgent';
  if (priority === 'high')   return 'mh-conv-high';
  return '';
}

/** Category badge chip HTML. */
function categoryBadge(c) {
  if (c.type === 'order_thread' && !c.isClientThread) {
    return '<span class="mh-cat-badge mh-cat-order">أوردر</span>';
  }
  if (c.isClientThread) {
    return '<span class="mh-cat-badge mh-cat-client">عميل</span>';
  }
  if (c.type === 'channel') {
    const label = esc(c.name || 'قناة');
    return `<span class="mh-cat-badge mh-cat-channel">${label}</span>`;
  }
  return '';
}

/** Check if another user is currently typing in this conversation. */
function isTypingInConv(c, currentUid, presenceMap) {
  if (c.type === 'dm') {
    const otherUid = (c.participants || []).find(p => p !== currentUid);
    if (!otherUid) return false;
    const p = presenceMap.get(otherUid);
    return p?.typingIn === c._id;
  }
  // Group / channel: check any participant except current user
  for (const uid of (c.participants || [])) {
    if (uid === currentUid) continue;
    const p = presenceMap.get(uid);
    if (p?.typingIn === c._id) return true;
  }
  return false;
}

/** Whether current user has muted this conversation. */
function isMuted(c, currentUid) {
  return (c.mutedBy || []).includes(currentUid);
}

/* ── empty state builders ───────────────────────────────────────── */

function emptySearch() {
  return `<div class="mh-empty-state">
    <div class="mh-empty-state-icon">🔍</div>
    <div class="mh-empty-state__text">لا نتائج</div>
  </div>`;
}

function emptyArchived() {
  return `<div class="mh-empty-state">
    <div class="mh-empty-state-icon">📂</div>
    <div class="mh-empty-state__text">لا توجد محادثات مؤرشفة</div>
  </div>`;
}

function emptyNoConversations(currentRole, currentUid) {
  return `<div class="mh-empty-state mh-empty-state--hero">
    <div class="mh-empty-state-icon">💬</div>
    <strong class="mh-empty-state__title">مرحباً بك في مساحة التواصل</strong>
    <span class="mh-empty-state__detail">تواصل مع فريقك وتابع الأوردرات في مكان واحد</span>
    <div class="mh-empty-state__actions">
      <button type="button" class="mh-empty-state__btn mh-empty-state__btn--primary" onclick="newDM()">✏️ محادثة جديدة</button>
      <button type="button" class="mh-empty-state__btn mh-empty-state__btn--secondary" onclick="retryEnsureChannels()">🔄 إعادة الإعداد</button>
    </div>
  </div>`;
}

function emptyDefault() {
  return `<div class="mh-empty-state">
    <div class="mh-empty-state-icon">✏️</div>
    <div class="mh-empty-state__text">ابدأ محادثة بالضغط على ✏️</div>
  </div>`;
}

/* ── main builder ───────────────────────────────────────────────── */

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

  /* ── empty states ── */
  if (!items.length) {
    let html;
    if (searchQuery)                html = emptySearch();
    else if (listTab === 'archived') html = emptyArchived();
    else if (conversations.length === 0) html = emptyNoConversations(currentRole, currentUid);
    else                            html = emptyDefault();
    return { html, countAll, countArchived };
  }

  /* ── render items ── */
  const html = `<div role="listbox" aria-label="قائمة المحادثات">${items.map(c => {
    const isActive  = c._id === activeConvId;
    const name      = convDisplayName(c, ctx);
    const ico       = convIcon(c, ctx);
    const col       = convColor(c, ctx);
    const unread    = (c.unreadCount?.[currentUid] || 0);
    const isDM      = c.type === 'dm';
    const muted     = isMuted(c, currentUid);
    const pinned    = !!c.pinned;
    const typing    = isTypingInConv(c, currentUid, presenceMap);

    /* presence (DM only) */
    const otherUid      = isDM ? (c.participants || []).find(p => p !== currentUid) : null;
    const otherPresence = otherUid ? presenceMap.get(otherUid) : null;
    const isOnline      = otherPresence && isUserOnline(otherPresence);

    /* time */
    const lastTime = fmtTime(c.lastMessageAt);

    /* ticks + sender prefix */
    const lastSender = c.lastSenderId === currentUid
      ? 'أنت: '
      : (isDM ? '' : (c.lastSenderName ? c.lastSenderName + ': ' : ''));
    const tick      = c.lastSenderId === currentUid ? (c.lastReadByAll ? '✓✓' : '✓') : '';
    const tickClass = c.lastReadByAll ? 'read' : '';

    /* last message preview or typing indicator */
    let lastMsgHtml;
    if (typing) {
      lastMsgHtml = '<span class="ib-conv-typing">يكتب...</span>';
    } else {
      const tickHtml = tick
        ? `<span class="ib-conv-tick ${tickClass}">${tick}</span> `
        : '';
      lastMsgHtml = `${tickHtml}${esc(lastSender + (c.lastMessagePreview || ''))}`;
    }

    /* priority */
    const pClass = priorityClass(c.priority);

    /* badges */
    const catBadge = categoryBadge(c);

    /* unread badge */
    let unreadBadge = '';
    if (unread > 0) {
      const badgeClass = muted ? 'ib-conv-unread ib-conv-unread--muted' : 'ib-conv-unread';
      const badgeText  = unread > 99 ? '99+' : unread;
      unreadBadge = `<span class="${badgeClass}">${badgeText}</span>`;
    }

    /* mute icon */
    const muteIcon = muted ? '<span class="ib-muted-ico" aria-hidden="true">🔇</span>' : '';

    /* pin icon */
    const pinIcon = pinned ? '<span class="ib-conv-pin" aria-hidden="true">📌</span>' : '';

    /* row classes */
    const classes = [
      'ib-conv',
      isActive ? 'active' : '',
      unread   ? 'unread' : '',
      muted    ? 'ib-conv-muted' : '',
      pClass,
    ].filter(Boolean).join(' ');

    /* aria */
    const ariaLabel   = esc(name);
    const ariaSelected = isActive ? 'true' : 'false';

    return `<div class="${classes}" data-id="${c._id}" role="option" aria-selected="${ariaSelected}" aria-label="${ariaLabel}" onclick="openConv('${c._id}')">
      <div class="ib-conv-avatar" style="background:${col}">${ico}${isDM ? `<span class="presence ${isOnline ? 'online' : ''}"></span>` : ''}</div>
      <div class="ib-conv-body">
        <div class="ib-conv-top">
          <div class="ib-conv-name">${c.isClientThread ? '🔗 ' : ''}${esc(name)}${muteIcon}${pinIcon}</div>
          <div class="ib-conv-time">${lastTime}</div>
        </div>
        <div class="ib-conv-bot">
          <div class="ib-conv-last">${lastMsgHtml}</div>
          <div class="ib-conv-meta">
            ${catBadge}
            ${unreadBadge}
          </div>
        </div>
      </div>
    </div>`;
  }).join('')}</div>`;

  return { html, countAll, countArchived };
}
