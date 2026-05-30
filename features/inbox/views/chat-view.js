/**
 * Business2Card ERP — features/inbox/views/chat-view.js
 *
 * ━━━ CHAT SHELL + MESSAGES + HEADER VIEWS (Phase-2 · inbox decomp) ━━━
 *
 * Pure HTML builders for the chat panel:
 *   - buildChatShellHTML       — main chat container (header + composer scaffold)
 *   - buildMessagesHTML        — message bubbles list
 *   - buildChatHeaderSub       — header subtitle (online / typing / last seen)
 */

import {
  convDisplayName, convIcon, convColor, isUserOnline,
  escapeHtml as esc, fmtBytes,
} from '../../../core/inbox-utils.js';

/**
 * Build the chat panel shell — header + pin strip + search bar + msgs area +
 * reply strip + composer (all static markup; messages list is populated
 * separately by buildMessagesHTML).
 *
 * @returns {string} HTML
 */
export function buildChatShellHTML({ activeConv, ctx, EMOJIS = [] }) {
  if (!activeConv) return '';
  return `
    <div class="ib-chat-hdr">
      <button type="button" class="ib-chat-back" onclick="closeChat()">←</button>
      <div class="ib-chat-hdr-info">
        <div class="ib-conv-avatar" style="background:${convColor(activeConv, ctx)};width:40px;height:40px;font-size:15px">${convIcon(activeConv, ctx)}</div>
        <div class="flex-1 min-w-0">
          <div class="ib-chat-hdr-name" id="chat-hdr-name">${esc(convDisplayName(activeConv, ctx))}</div>
          <div class="ib-chat-hdr-sub" id="chat-hdr-sub"></div>
        </div>
      </div>
      <div class="ib-chat-hdr-actions" style="position:relative">
        <button type="button" class="ib-iconbtn" onclick="toggleConvSearch()" title="بحث في المحادثة">🔍</button>
        <button type="button" class="ib-iconbtn" onclick="openAIPanel()" title="مساعد AI">🤖</button>
        <button type="button" class="ib-iconbtn" id="mute-btn" onclick="toggleMute()" title="كتم">🔔</button>
        <button type="button" class="ib-iconbtn" onclick="archiveConv()" title="أرشفة">📁</button>
        <button type="button" class="ib-iconbtn" onclick="toggleChatMenu()" title="المزيد">⋮</button>
        <div class="ib-chat-menu" id="chat-menu">
          <button type="button" class="ib-cm-item" onclick="openPinnedList()">📌 الرسائل المثبتة</button>
          <button type="button" class="ib-cm-item" onclick="clearChatForMe()">🧹 مسح المحادثة (لي فقط)</button>
          <button type="button" class="ib-cm-item" onclick="openWallpaperPicker()">🎨 خلفية المحادثة</button>
        </div>
      </div>
    </div>
    <div class="ib-pin-strip" id="pin-strip" onclick="openPinnedList()">
      <span class="ib-pin-ico">📌</span>
      <div class="ib-pin-body">
        <div class="ib-pin-label">رسالة مثبتة</div>
        <div class="ib-pin-text" id="pin-strip-text"></div>
      </div>
      <span class="ib-pin-count" id="pin-strip-count">1</span>
    </div>
    <div class="ib-csearch-bar" id="csearch-bar">
      <input type="text" id="csearch-input" placeholder="🔍 ابحث في الرسائل…" oninput="onConvSearch()" onkeydown="onConvSearchKey(event)">
      <div class="ib-csearch-nav">
        <span id="csearch-info">—</span>
        <button type="button" onclick="convSearchNav(-1)" title="السابق">↑</button>
        <button type="button" onclick="convSearchNav(1)" title="التالي">↓</button>
      </div>
      <button type="button" class="ib-csearch-close" onclick="toggleConvSearch()" title="إغلاق">✕</button>
    </div>
    <div class="ib-msgs" id="ib-msgs"></div>
    <div class="ib-reply-strip" id="reply-strip">
      <div class="ib-reply-body">
        <div class="ib-reply-name" id="reply-name"></div>
        <div class="ib-reply-text" id="reply-text"></div>
      </div>
      <button type="button" class="ib-reply-close" onclick="cancelReply()">✕</button>
    </div>
    <div class="ib-composer" id="composer">
      <button type="button" class="ib-iconbtn" onclick="toggleEmoji()" title="إيموجي">😀</button>
      <button type="button" class="ib-iconbtn" onclick="pickFile()" title="مرفق">📎</button>
      <button type="button" class="ib-iconbtn" onclick="openOrderPicker()" title="إرسال أوردر">📦</button>
      <div class="ib-input-wrap">
        <textarea class="ib-input" id="ib-input" rows="1" placeholder="اكتب رسالة…" oninput="onTyping(this)" onkeydown="onComposerKey(event)"></textarea>
      </div>
      <button class="ib-iconbtn" id="ib-mic" onmousedown="startVoice()" ontouchstart="startVoice()" onmouseup="stopVoice()" ontouchend="stopVoice()" title="رسالة صوتية">🎤</button>
      <button type="button" class="ib-send hide" id="ib-send" onclick="sendText()">▶</button>
      <div class="ib-emoji-panel" id="emoji-panel">${EMOJIS.map(e => `<button type="button" class="ib-emoji-btn" onclick="insertEmoji('${e}')">${e}</button>`).join('')}</div>
      <div class="ib-mention-pop" id="mention-pop"></div>
    </div>`;
}

/**
 * Build messages list HTML.
 *
 * @param {Object} args
 * @param {Array}    args.messages
 * @param {Object}   args.activeConv
 * @param {string}   args.currentUid
 * @param {Function} args.renderTextWithMentions
 *
 * @returns {string} HTML (or empty-state HTML)
 */
export function buildMessagesHTML({ messages = [], activeConv, currentUid, renderTextWithMentions }) {
  if (!messages.length) {
    return '<div style="margin:auto;text-align:center;color:var(--ws-text-dim);font-size:var(--fs-md);padding:40px">ابدأ المحادثة برسالة 👋</div>';
  }
  let html = '';
  let lastDate = '';
  let lastSender = '';
  messages.forEach((m, i) => {
    const ts = m.createdAt?.toDate?.();
    const dateStr = ts ? ts.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    if (dateStr !== lastDate) { html += `<div class="ib-date-sep">${dateStr}</div>`; lastDate = dateStr; lastSender = ''; }
    if (m.type === 'system') { html += `<div class="ib-system-msg">${esc(m.text || '')}</div>`; return; }
    if (m.deletedAt) {
      const isOut = m.senderId === currentUid;
      html += `<div class="ib-msg ${isOut ? 'out' : 'in'}"><div class="ib-bubble" style="opacity:.6;font-style:italic">🚫 رسالة محذوفة</div></div>`;
      lastSender = m.senderId;
      return;
    }
    const isOut = m.senderId === currentUid;
    const consec = lastSender === m.senderId && i > 0;
    lastSender = m.senderId;
    const time = ts ? ts.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
    const readByOther = isOut && activeConv?.type === 'dm' && Object.keys(m.readBy || {}).filter(u => u !== currentUid).length > 0;
    const tick = isOut ? `<span class="ib-msg-tick ${readByOther ? 'read' : ''}">${readByOther ? '✓✓' : '✓'}</span>` : '';
    let quote = '';
    if (m.replyTo) {
      quote = `<div class="ib-quote" onclick="jumpToMsg('${m.replyTo.msgId}')">
        <div class="ib-quote-name">${esc(m.replyTo.senderName || '')}</div>
        <div class="ib-quote-text">${esc(m.replyTo.preview || '')}</div>
      </div>`;
    }
    let body = '';
    if (m.type === 'image' && m.attachments?.[0]) {
      body = `<img class="ib-msg-img" src="${m.attachments[0].url}" onclick="openLb('${m.attachments[0].url}')" alt="" loading="lazy" decoding="async">`;
    } else if (m.type === 'file' && m.attachments?.[0]) {
      const a = m.attachments[0];
      body = `<a class="ib-msg-file" href="${a.url}" target="_blank" rel="noopener" download="${esc(a.name || '')}">
        <span class="ib-msg-file-ico">📄</span>
        <div class="ib-msg-file-info"><div class="ib-msg-file-name">${esc(a.name || 'مستند')}</div><div class="ib-msg-file-size">${fmtBytes(a.size || 0)}</div></div>
      </a>`;
    } else if (m.type === 'voice' && m.attachments?.[0]) {
      const v = m.attachments[0];
      const dur = v.duration || 0;
      const durStr = Math.floor(dur / 60) + ':' + String(Math.floor(dur % 60)).padStart(2, '0');
      body = `<div class="ib-voice-bubble">
        <button type="button" class="ib-voice-play" onclick="toggleVoice(this,'${v.url}')">▶</button>
        <div class="ib-voice-progress" onclick="event.stopPropagation()"><div class="ib-voice-progress-fill"></div></div>
        <div class="ib-voice-dur">${durStr}</div>
      </div>`;
    } else if (m.type === 'order_share' && m.orderRef) {
      const o = m.orderRef;
      body = `<a class="ib-ordercard" href="design.html?order=${o.orderId}">
        <div class="ib-ordercard-hdr">📦 أوردر</div>
        <div class="ib-ordercard-client">${esc(o.clientName || '—')}</div>
        <div class="ib-ordercard-id">#${esc(o.orderCode || o.orderId)}</div>
        <div class="ib-ordercard-meta">
          ${o.stage ? `<span class="ib-ordercard-chip">${esc(o.stage)}</span>` : ''}
          ${o.salePrice ? `<span class="ib-ordercard-chip">${esc(String(o.salePrice))} ج</span>` : ''}
          ${o.deadline ? `<span class="ib-ordercard-chip">📅 ${esc(o.deadline)}</span>` : ''}
        </div>
      </a>`;
    }
    const text = m.text ? `<div class="ib-msg-text">${renderTextWithMentions(m.text)}${m.editedAt ? '<span class="ib-msg-edited"> (مُعدّلة)</span>' : ''}</div>` : '';
    const senderName = !isOut && !consec && activeConv?.type === 'channel' ? `<div class="sender">${esc(m.senderName || '')}</div>` : '';
    const rxs = Object.entries(m.reactions || {}).filter(([_, arr]) => (arr || []).length > 0);
    const reactBlock = rxs.length ? `<div class="ib-reactions">${rxs.map(([emo, uids]) => {
      const mine = (uids || []).includes(currentUid);
      return `<button type="button" class="ib-react-chip ${mine ? 'mine' : ''}" onclick="toggleReact('${m._id}','${emo}')">${emo}<span class="cnt">${uids.length}</span></button>`;
    }).join('')}</div>` : '';
    const pinned = m.pinned ? 'pinned-msg' : '';
    html += `<div class="ib-msg ${isOut ? 'out' : 'in'} ${consec ? 'consec' : ''} ${pinned}" data-mid="${m._id}" onclick="onMsgClick(event,'${m._id}')">
      ${senderName}
      <div class="ib-bubble">${quote}${body}${text}<span class="ib-msg-foot">${m.pinned ? '<span title="مثبتة" style="margin-left:4px;color:#f59e0b">📌</span>' : ''}${time} ${tick}</span></div>
      ${reactBlock}
    </div>`;
  });
  return html;
}

/**
 * Compute the chat header subtitle text + class for DM/channel.
 *
 * @returns {{text: string, className: string}}
 */
export function buildChatHeaderSub({ activeConv, presenceMap, currentUid }) {
  if (!activeConv) return { text: '', className: 'ib-chat-hdr-sub' };
  if (activeConv.type === 'dm') {
    const otherUid = (activeConv.participants || []).find(p => p !== currentUid);
    const p = presenceMap.get(otherUid);
    const typing = p?.typingIn === activeConv._id;
    if (typing) return { text: 'يكتب الآن…', className: 'ib-chat-hdr-sub online' };
    if (isUserOnline(p)) return { text: 'متصل', className: 'ib-chat-hdr-sub online' };
    if (p?.lastSeen) {
      const last = p.lastSeen.toDate?.();
      return {
        text: 'آخر ظهور ' + (last ? last.toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'),
        className: 'ib-chat-hdr-sub',
      };
    }
    return { text: '—', className: 'ib-chat-hdr-sub' };
  }
  if (activeConv.type === 'channel') {
    const cnt = (activeConv.participants || []).length;
    const onlineCnt = (activeConv.participants || []).filter(uid => isUserOnline(presenceMap.get(uid))).length;
    return { text: `${cnt} عضو · ${onlineCnt} متصل`, className: 'ib-chat-hdr-sub' };
  }
  return { text: '', className: 'ib-chat-hdr-sub' };
}
