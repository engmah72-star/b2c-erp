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

/* ─── file-type icon helper ─── */
function _fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return '\u{1F4D5}';            // red book
  if (['doc', 'docx'].includes(ext)) return '\u{1F4C4}';    // page
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '\u{1F4CA}'; // chart
  if (['zip', 'rar', '7z'].includes(ext)) return '\u{1F4E6}';   // package
  if (['psd', 'ai', 'svg'].includes(ext)) return '\u{1F3A8}';   // palette
  return '\u{1F4CE}';                                         // paperclip
}

/**
 * Build the chat panel shell — header + pin strip + search bar + msgs area +
 * reply strip + composer (all static markup; messages list is populated
 * separately by buildMessagesHTML).
 *
 * @returns {string} HTML
 */
export function buildChatShellHTML({ activeConv, ctx, EMOJIS = [] }) {
  if (!activeConv) return '';

  const name  = esc(convDisplayName(activeConv, ctx));
  const color = convColor(activeConv, ctx);
  const icon  = convIcon(activeConv, ctx);

  return `
    <!-- ═══════════ HEADER ═══════════ -->
    <div class="ib-chat-hdr">

      <button type="button" class="ib-chat-back" onclick="closeChat()"
              aria-label="رجوع">
        <svg class="ib-back-arrow" width="20" height="20" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>

      <div class="ib-chat-hdr-info">
        <div class="ib-avatar-wrap">
          <div class="ib-conv-avatar"
               style="background:${color}">
            ${icon}
          </div>
          <span class="ib-online-dot" id="hdr-online-dot"></span>
        </div>
        <div class="ib-hdr-text">
          <div class="ib-chat-hdr-name" id="chat-hdr-name">${name}</div>
          <div class="ib-chat-hdr-sub" id="chat-hdr-sub"></div>
        </div>
      </div>

      <div class="ib-chat-hdr-actions">
        <button type="button" class="ib-iconbtn" onclick="toggleConvSearch()"
                aria-label="بحث في المحادثة" title="بحث في المحادثة">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>

        <span class="ib-hdr-sep"></span>

        <button type="button" class="ib-iconbtn ib-ctx-toggle" id="ctx-toggle-btn"
                onclick="toggleContextPanel()"
                aria-label="تفاصيل السياق" title="تفاصيل السياق">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
        </button>

        <button type="button" class="ib-iconbtn" id="mute-btn"
                onclick="toggleMute()"
                aria-label="كتم" title="كتم">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        </button>

        <button type="button" class="ib-iconbtn" onclick="archiveConv()"
                aria-label="ارشفة" title="ارشفة">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <polyline points="21 8 21 21 3 21 3 8"></polyline>
            <rect x="1" y="3" width="22" height="5"></rect>
            <line x1="10" y1="12" x2="14" y2="12"></line>
          </svg>
        </button>

        <span class="ib-hdr-sep"></span>

        <div class="ib-menu-anchor">
          <button type="button" class="ib-iconbtn" onclick="toggleChatMenu()"
                  aria-label="المزيد" title="المزيد">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5"></circle>
              <circle cx="12" cy="12" r="1.5"></circle>
              <circle cx="12" cy="19" r="1.5"></circle>
            </svg>
          </button>

          <div class="ib-chat-menu" id="chat-menu">
            <button type="button" class="ib-cm-item" onclick="openPinnedList()">
              <svg class="ib-cm-ico" width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="17" x2="12" y2="22"></line>
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
              </svg>
              الرسائل المثبتة
            </button>
            <button type="button" class="ib-cm-item" onclick="setPriority()">
              <svg class="ib-cm-ico" width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              تعيين أولوية
            </button>
            <button type="button" class="ib-cm-item" onclick="clearChatForMe()">
              <svg class="ib-cm-ico" width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"></path>
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
                <path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"></path>
              </svg>
              مسح المحادثة (لي فقط)
            </button>
            <button type="button" class="ib-cm-item" onclick="openWallpaperPicker()">
              <svg class="ib-cm-ico" width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="13.5" cy="6.5" r="2.5"></circle>
                <rect x="2" y="2" width="20" height="20" rx="2"></rect>
                <path d="m2 16 5-5 4 4 4-4 7 7"></path>
              </svg>
              خلفية المحادثة
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════ PIN STRIP ═══════════ -->
    <div class="ib-pin-strip" id="pin-strip">
      <div class="ib-pin-main" onclick="openPinnedList()">
        <span class="ib-pin-ico">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
               stroke-linejoin="round">
            <line x1="12" y1="17" x2="12" y2="22"></line>
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
          </svg>
        </span>
        <div class="ib-pin-body">
          <span class="ib-pin-label">رسالة مثبتة</span>
          <span class="ib-pin-text" id="pin-strip-text"></span>
        </div>
        <span class="ib-pin-count" id="pin-strip-count">1</span>
      </div>
      <button type="button" class="ib-pin-dismiss" onclick="openPinnedList()"
              aria-label="عرض المثبتة">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
             stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>

    <!-- ═══════════ SEARCH BAR ═══════════ -->
    <div class="ib-csearch-bar" id="csearch-bar">
      <div class="ib-csearch-input-wrap">
        <svg class="ib-csearch-ico" width="16" height="16" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" id="csearch-input"
               class="ib-csearch-input"
               placeholder="ابحث في الرسائل..."
               aria-label="بحث داخل المحادثة"
               oninput="onConvSearch()"
               onkeydown="onConvSearchKey(event)">
      </div>
      <div class="ib-csearch-nav">
        <span class="ib-csearch-info" id="csearch-info">&mdash;</span>
        <button type="button" class="ib-csearch-nav-btn" onclick="convSearchNav(-1)"
                aria-label="النتيجة السابقة" title="السابق">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
               stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button type="button" class="ib-csearch-nav-btn" onclick="convSearchNav(1)"
                aria-label="النتيجة التالية" title="التالي">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
               stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
      <button type="button" class="ib-csearch-close" onclick="toggleConvSearch()"
              aria-label="إغلاق البحث" title="إغلاق">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
             stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- ═══════════ MESSAGES AREA ═══════════ -->
    <div class="ib-msgs" id="ib-msgs"></div>

    <!-- ═══════════ REPLY STRIP ═══════════ -->
    <div class="ib-reply-strip" id="reply-strip">
      <div class="ib-reply-body">
        <div class="ib-reply-name" id="reply-name"></div>
        <div class="ib-reply-text" id="reply-text"></div>
      </div>
      <button type="button" class="ib-reply-close" onclick="cancelReply()"
              aria-label="إلغاء الرد">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
             stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- ═══════════ COMPOSER ═══════════ -->
    <div class="ib-composer" id="composer">
      <div class="ib-composer-actions-start">
        <button type="button" class="ib-iconbtn" onclick="toggleEmoji()"
                aria-label="إيموجي" title="إيموجي">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
               stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
            <line x1="9" y1="9" x2="9.01" y2="9"></line>
            <line x1="15" y1="9" x2="15.01" y2="9"></line>
          </svg>
        </button>
        <button type="button" class="ib-iconbtn" onclick="pickFile()"
                aria-label="إرفاق ملف" title="مرفق">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
               stroke-linejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
          </svg>
        </button>
        <button type="button" class="ib-iconbtn" onclick="openOrderPicker()"
                aria-label="ارسال اوردر" title="ارسال اوردر">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
               stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
        </button>
      </div>

      <div class="ib-input-wrap">
        <textarea class="ib-input" id="ib-input" rows="1"
                  placeholder="اكتب رسالة..."
                  aria-label="اكتب رسالة"
                  oninput="onTyping(this)"
                  onkeydown="onComposerKey(event)"></textarea>
      </div>

      <div class="ib-composer-actions-end">
        <button type="button" class="ib-iconbtn ib-mic-btn" id="ib-mic"
                onmousedown="startVoice()" ontouchstart="startVoice()"
                onmouseup="stopVoice()" ontouchend="stopVoice()"
                aria-label="رسالة صوتية" title="رسالة صوتية">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
          <span class="ib-mic-pulse"></span>
        </button>

        <button type="button" class="ib-send-btn hide" id="ib-send"
                onclick="sendText()" aria-label="ارسال">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
               stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>

      <div class="ib-emoji-panel" id="emoji-panel">
        <div class="ib-emoji-grid">
          ${EMOJIS.map(e =>
            `<button type="button" class="ib-emoji-btn" onclick="insertEmoji('${e}')"
                     aria-label="${e}">${e}</button>`
          ).join('')}
        </div>
      </div>

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
    return `<div class="ib-empty-state">
      <div class="ib-empty-wave">💬</div>
      <div class="ib-empty-title">ابدأ المحادثة</div>
      <div class="ib-empty-desc">أرسل رسالة أو شارك أوردر للبدء</div>
      <button type="button" class="mh-empty-state__btn mh-empty-state__btn--primary" onclick="document.getElementById('ib-input')?.focus()" style="margin-top:12px">✏️ اكتب رسالة</button>
    </div>`;
  }

  let html = '';
  let lastDate = '';
  let lastSender = '';
  let lastTs = null;

  messages.forEach((m, i) => {
    const ts = m.createdAt?.toDate?.();
    const dateStr = ts
      ? ts.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';

    /* ── date separator ── */
    if (dateStr !== lastDate) {
      html += `<div class="ib-date-sep"><span class="ib-date-sep-text">${dateStr}</span></div>`;
      lastDate = dateStr;
      lastSender = '';
    }

    /* ── time gap (>5 min between messages) ── */
    if (ts && lastTs) {
      const gapMin = (ts.getTime() - lastTs.getTime()) / 60000;
      if (gapMin > 5 && dateStr === lastDate) {
        const gapLabel = gapMin < 60
          ? `${Math.floor(gapMin)} دقيقة`
          : gapMin < 1440
            ? `${Math.floor(gapMin / 60)} ساعة`
            : `${Math.floor(gapMin / 1440)} يوم`;
        html += `<div class="ib-time-gap"><span class="ib-time-gap-label">⏱ ${gapLabel}</span></div>`;
        lastSender = '';
      }
    }
    if (ts) lastTs = ts;

    /* ── system message ── */
    if (m.type === 'system') {
      html += `<div class="ib-system-msg"><span class="ib-system-badge">${esc(m.text || '')}</span></div>`;
      return;
    }

    /* ── deleted message ── */
    if (m.deletedAt) {
      const isOut = m.senderId === currentUid;
      html += `<div class="ib-msg ${isOut ? 'out' : 'in'}" data-mid="${m._id}">
        <div class="ib-bubble ib-deleted">
          <svg class="ib-deleted-ico" width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
          <span>رسالة محذوفة</span>
        </div>
      </div>`;
      lastSender = m.senderId;
      return;
    }

    /* ── regular message ── */
    const isOut  = m.senderId === currentUid;
    const consec = lastSender === m.senderId && i > 0;
    lastSender   = m.senderId;

    const time = ts
      ? ts.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      : '';

    /* read ticks (DM only) */
    const readByOther = isOut
      && activeConv?.type === 'dm'
      && Object.keys(m.readBy || {}).filter(u => u !== currentUid).length > 0;
    const tick = isOut
      ? `<span class="ib-msg-tick ${readByOther ? 'read' : ''}">` +
        (readByOther
          ? `<svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><path d="M11.07.66a.75.75 0 0 1 .18 1.04l-5.4 7.72a.75.75 0 0 1-1.14.1L1.87 6.68a.75.75 0 1 1 1.06-1.06l2.31 2.3 4.8-6.86a.75.75 0 0 1 1.03-.4zM14.07.66a.75.75 0 0 1 .18 1.04l-5.4 7.72a.75.75 0 0 1-1.06.08l.53-.53.53.53-.54.53a.75.75 0 0 1 .14-.1l4.8-6.86a.75.75 0 0 1 .82-.41z"/></svg>`
          : `<svg width="11" height="9" viewBox="0 0 16 11" fill="currentColor"><path d="M11.07.66a.75.75 0 0 1 .18 1.04l-5.4 7.72a.75.75 0 0 1-1.14.1L1.87 6.68a.75.75 0 1 1 1.06-1.06l2.31 2.3 4.8-6.86a.75.75 0 0 1 1.03-.4z"/></svg>`)
        + '</span>'
      : '';

    /* reply quote */
    let quote = '';
    if (m.replyTo) {
      quote = `<div class="ib-quote" onclick="jumpToMsg('${m.replyTo.msgId}')">
        <div class="ib-quote-name">${esc(m.replyTo.senderName || '')}</div>
        <div class="ib-quote-text">${esc(m.replyTo.preview || '')}</div>
      </div>`;
    }

    /* ── body by type ── */
    let body = '';

    if (m.type === 'image' && m.attachments?.[0]) {
      const a = m.attachments[0];
      body = `<div class="ib-msg-img-wrap">
        <img class="ib-msg-img" src="${a.url}"
             onclick="openLb('${a.url}')" alt=""
             loading="lazy" decoding="async">
      </div>`;

    } else if (m.type === 'file' && m.attachments?.[0]) {
      const a = m.attachments[0];
      const ico = _fileIcon(a.name);
      body = `<a class="ib-msg-file" href="${a.url}" target="_blank"
                 rel="noopener" download="${esc(a.name || '')}">
        <span class="ib-msg-file-ico">${ico}</span>
        <div class="ib-msg-file-info">
          <div class="ib-msg-file-name">${esc(a.name || 'مستند')}</div>
          <div class="ib-msg-file-size">${fmtBytes(a.size || 0)}</div>
        </div>
        <svg class="ib-msg-file-dl" width="18" height="18" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </a>`;

    } else if (m.type === 'voice' && m.attachments?.[0]) {
      const v   = m.attachments[0];
      const dur = v.duration || 0;
      const mm  = Math.floor(dur / 60);
      const ss  = String(Math.floor(dur % 60)).padStart(2, '0');
      body = `<div class="ib-voice-bubble">
        <button type="button" class="ib-voice-play" onclick="toggleVoice(this,'${v.url}')"
                aria-label="تشغيل الصوت">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        <div class="ib-voice-track" onclick="event.stopPropagation()">
          <div class="ib-voice-progress-fill"></div>
        </div>
        <div class="ib-voice-dur">${mm}:${ss}</div>
      </div>`;

    } else if (m.type === 'order_share' && m.orderRef) {
      const o = m.orderRef;
      body = `<a class="ib-ordercard" href="design.html?order=${o.orderId}">
        <div class="ib-ordercard-hdr">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          </svg>
          <span>اوردر</span>
          <span class="ib-ordercard-code">#${esc(o.orderCode || o.orderId)}</span>
        </div>
        <div class="ib-ordercard-client">${esc(o.clientName || '—')}</div>
        <div class="ib-ordercard-meta">
          ${o.stage ? `<span class="ib-ordercard-chip">${esc(o.stage)}</span>` : ''}
          ${o.salePrice ? `<span class="ib-ordercard-chip">${esc(String(o.salePrice))} ج</span>` : ''}
          ${o.deadline ? `<span class="ib-ordercard-chip ib-ordercard-chip--date">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round"
                 stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            ${esc(o.deadline)}</span>` : ''}
        </div>
      </a>`;
    }

    /* text content */
    const text = m.text
      ? `<div class="ib-msg-text">${renderTextWithMentions(m.text)}${m.editedAt ? '<span class="ib-msg-edited">(معدلة)</span>' : ''}</div>`
      : '';

    /* sender name in channels */
    const senderName = (!isOut && !consec && activeConv?.type !== 'dm')
      ? `<div class="ib-msg-sender">${esc(m.senderName || '')}</div>`
      : '';

    /* reactions */
    const rxs = Object.entries(m.reactions || {}).filter(([_, arr]) => (arr || []).length > 0);
    const reactBlock = rxs.length
      ? `<div class="ib-reactions">${rxs.map(([emo, uids]) => {
          const mine = (uids || []).includes(currentUid);
          return `<button type="button" class="ib-react-chip${mine ? ' mine' : ''}"
                          onclick="toggleReact('${m._id}','${emo}')"
                          aria-label="تفاعل ${emo}">
                    ${emo}<span class="ib-react-cnt">${uids.length}</span>
                  </button>`;
        }).join('')}</div>`
      : '';

    /* pinned indicator */
    const pinIcon = m.pinned
      ? `<span class="ib-msg-pin" title="مثبتة">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                stroke-linejoin="round">
             <line x1="12" y1="17" x2="12" y2="22"></line>
             <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
           </svg>
         </span>`
      : '';

    const pinnedCls = m.pinned ? ' pinned-msg' : '';

    html += `<div class="ib-msg ${isOut ? 'out' : 'in'}${consec ? ' consec' : ''}${pinnedCls}"
                  data-mid="${m._id}" onclick="onMsgClick(event,'${m._id}')">
      ${senderName}
      <div class="ib-bubble">
        ${quote}${body}${text}
        <span class="ib-msg-foot">${pinIcon}${time} ${tick}</span>
      </div>
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

    if (typing) return { text: '<span class="ib-typing-dots"><span></span><span></span><span></span></span> يكتب الآن…', className: 'ib-chat-hdr-sub online', isHTML: true };
    if (isUserOnline(p)) return { text: 'متصل', className: 'ib-chat-hdr-sub online' };

    if (p?.lastSeen) {
      const last = p.lastSeen.toDate?.();
      return {
        text: 'آخر ظهور ' + (last
          ? last.toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' })
          : '—'),
        className: 'ib-chat-hdr-sub',
      };
    }
    return { text: '—', className: 'ib-chat-hdr-sub' };
  }

  if (activeConv.type === 'channel') {
    const cnt = (activeConv.participants || []).length;
    const onlineCnt = (activeConv.participants || [])
      .filter(uid => isUserOnline(presenceMap.get(uid))).length;
    return { text: `${cnt} عضو · ${onlineCnt} متصل`, className: 'ib-chat-hdr-sub' };
  }

  return { text: '', className: 'ib-chat-hdr-sub' };
}
