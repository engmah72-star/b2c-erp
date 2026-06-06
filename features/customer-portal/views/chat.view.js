/**
 * VIEWS · chat — محادثة حيّة ثنائية الاتجاه (overlay) بنفس خصائص الإنبوكس:
 * نص · مرفقات (صورة/ملف) · ردّ · تفاعلات · تعديل/حذف (لرسائلي) · تكبير الصورة ·
 * علامات القراءة. الفتح/الكتابة عبر Services (clientActions · H1.1). (STANDARDS §6 · L1)
 */
import { escapeHtml, qs } from '../utils/dom.js';
import { Button, Input, Skeleton } from '../components/index.js';
import { shortTime } from '../utils/format.js';

const EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];

export function create(ctx) {
  const { services, store, shell, kind = 'support', order = null, peer = null, conv = null } = ctx;
  let convId = null, participants = [], unsub = null, ready = false;
  let last = [];                       // آخر قائمة رسائل (لإعادة الرسم محليًا)
  let menuFor = '', reactFor = '';     // حالة قائمة الرسالة / شريط الإيموجي
  let replying = null, editing = null; // { msgId, senderName, preview } / { msgId }
  const byMsg = new Map();

  const me = () => store.get('user')?.uid || '';
  const myName = () => store.get('client')?.name || store.get('user')?.displayName || 'عميل';
  const fmtBytes = (n) => { n = +n || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; };
  const previewOf = (m) => (m.type === 'image' ? '📷 صورة' : m.type === 'file' ? '📄 ملف' : m.type === 'voice' ? '🎤 صوت' : (m.text || ''));

  function mediaBody(m) {
    const a = (m.attachments && m.attachments[0]) || null;
    if (m.type === 'image' && a?.url)
      return `<img class="cp-msg__img" data-action="lb:${encodeURIComponent(a.url)}" src="${escapeHtml(a.url)}" alt="" loading="lazy">`;
    if (m.type === 'file' && a?.url)
      return `<a class="cp-msg__file" href="${escapeHtml(a.url)}" target="_blank" rel="noopener" download="${escapeHtml(a.name || '')}">📄 ${escapeHtml(a.name || 'مستند')} · ${escapeHtml(fmtBytes(a.size))}</a>`;
    if (m.type === 'voice' && a?.url)
      return `<audio class="cp-msg__voice" src="${escapeHtml(a.url)}" controls preload="none"></audio>`;
    if (m.type === 'order_share' && m.orderRef) {
      const o = m.orderRef;
      return `<div class="cp-msg__ordercard">📦 أوردر #${escapeHtml(o.orderCode || o.orderId || '')}${o.clientName ? ' — ' + escapeHtml(o.clientName) : ''}</div>`;
    }
    return '';
  }

  function reactionsHtml(m) {
    const rxs = Object.entries(m.reactions || {}).filter(([, a]) => (a || []).length > 0);
    if (!rxs.length) return '';
    return `<div class="cp-rxs">${rxs.map(([e, uids]) =>
      `<button type="button" class="cp-rx${(uids || []).includes(me()) ? ' cp-rx--mine' : ''}" data-action="react:${m._id}:${e}">${e} ${uids.length}</button>`).join('')}</div>`;
  }

  function seenHtml(m, mine) {
    if (!mine) return '';
    const others = participants.filter((p) => p !== me());
    const seen = others.some((p) => (m.readBy || {})[p]);
    return `<span class="cp-msg__seen">${seen ? '✓✓' : '✓'}</span>`;
  }

  function bubble(m) {
    const mine = m.senderId === me();
    const isText = !m.type || m.type === 'text';
    const quote = m.replyTo ? `<div class="cp-msg__quote"><b>${escapeHtml(m.replyTo.senderName || '')}</b> ${escapeHtml(m.replyTo.preview || '')}</div>` : '';
    const body = isText ? escapeHtml(m.text || '') : mediaBody(m) + (m.text ? `<div class="cp-msg__cap">${escapeHtml(m.text)}</div>` : '');
    const edited = m.editedAt ? '<span class="cp-msg__edited"> (مُعدّلة)</span>' : '';
    const meta = `${escapeHtml(mine ? 'أنت' : (m.senderName || 'الفريق'))} · ${escapeHtml(shortTime(m.createdAt))}`;
    const menu = menuFor === m._id ? `<div class="cp-msg__menu">
        <button type="button" data-action="reply:${m._id}">💬 ردّ</button>
        <button type="button" data-action="rx:${m._id}">😀 تفاعل</button>
        ${mine && isText ? `<button type="button" data-action="edit:${m._id}">✏️ تعديل</button>` : ''}
        ${mine ? `<button type="button" data-action="del:${m._id}">🗑 حذف</button>` : ''}
      </div>` : '';
    const emojis = reactFor === m._id ? `<div class="cp-msg__emojis">${EMOJIS.map((e) => `<button type="button" data-action="react:${m._id}:${e}">${e}</button>`).join('')}</div>` : '';
    return `<div class="cp-msg-wrap cp-msg-wrap--${mine ? 'me' : 'them'}">
      <div class="cp-msg cp-msg--${mine ? 'me' : 'them'}">${quote}${body}${edited}
        <span class="cp-msg__meta">${meta}${seenHtml(m, mine)}
          <button type="button" class="cp-msg__more" data-action="menu:${m._id}">⋯</button>
        </span>
      </div>
      ${reactionsHtml(m)}${menu}${emojis}
    </div>`;
  }

  function renderList() {
    const node = qs('#cp-chat-list', shell.modal.body);
    if (!node) return;
    node.innerHTML = last.length ? last.map(bubble).join('') : `<div class="cp-muted cp-text-c">ابدأ المحادثة — اكتب رسالتك بالأسفل 👇</div>`;
    node.scrollTop = node.scrollHeight;
  }

  function paintExtra() {
    const node = qs('#cp-chat-extra', shell.modal.body);
    if (!node) return;
    if (editing) node.innerHTML = `<div class="cp-chat__chip">✏️ تعديل رسالة <button type="button" data-action="extra-cancel">✕</button></div>`;
    else if (replying) node.innerHTML = `<div class="cp-chat__chip">↩️ ردّ على: ${escapeHtml((replying.preview || '').slice(0, 40))} <button type="button" data-action="extra-cancel">✕</button></div>`;
    else node.innerHTML = '';
  }

  function html() {
    return `<div class="cp-chat">
      <div class="cp-chat__list" id="cp-chat-list" aria-live="polite">${Skeleton({ variant: 'line', count: 3 })}</div>
      <div id="cp-chat-extra"></div>
      <div class="cp-chat__bar">
        ${Button({ label: '', icon: '📎', variant: 'ghost', size: 'sm', block: false, action: 'attach' })}
        ${Input({ id: 'cp-chat-input', label: '', placeholder: 'اكتب رسالتك…' })}
        ${Button({ label: 'إرسال', icon: '➤', size: 'sm', block: false, action: 'send' })}
      </div>
      <input type="file" id="cp-chat-file" accept="image/*,application/pdf" hidden>
    </div>`;
  }

  function onMessages(listFn) {
    last = listFn; byMsg.clear(); last.forEach((m) => byMsg.set(m._id, m)); renderList();
  }

  async function start() {
    if (conv?.convId) { convId = conv.convId; participants = conv.participants || []; }
    else {
      const t = await services.chat.openThread({ kind, uid: me(), name: myName(), order, peer });
      if (!t?.ok) { onMessages([]); shell.notify('تعذّر فتح المحادثة', 'danger'); return; }
      convId = t.convId; participants = t.participants || [];
    }
    ready = true;
    try { await services.chat.markThreadRead({ convId, uid: me() }); } catch (_) {}
    unsub = await services.chat.subscribeMessages(convId, onMessages);
  }

  function openLightbox(url) {
    const ov = document.createElement('div');
    ov.className = 'cp-lightbox';
    ov.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
    ov.addEventListener('click', () => ov.remove());
    document.body.appendChild(ov);
  }

  function inputEl() { return qs('#cp-chat-input', shell.modal.body); }
  function resetCompose() { replying = null; editing = null; menuFor = ''; reactFor = ''; const i = inputEl(); if (i) i.value = ''; paintExtra(); }

  return {
    async mount() { start(); return html(); },
    async onUpload(el) {
      const file = el.files && el.files[0];
      el.value = '';
      if (!file || !ready) return;
      const okType = /^image\//.test(file.type) || file.type === 'application/pdf';
      if (!okType) { shell.notify('يُسمح بالصور وملفات PDF فقط', 'danger'); return; }
      if (file.size > 20 * 1024 * 1024) { shell.notify('الحجم الأقصى 20 ميجا', 'danger'); return; }
      shell.notify('جارٍ رفع المرفق…', 'ok');
      const r = await services.chat.sendAttachment({ convId, file, uid: me(), name: myName(), participants });
      if (!r?.ok) shell.notify((r?.errors && r.errors[0]) || 'تعذّر إرسال المرفق', 'danger');
    },
    async onAction(a) {
      if (a === 'attach') { if (ready) qs('#cp-chat-file', shell.modal.body)?.click(); return; }
      if (a === 'extra-cancel') { resetCompose(); renderList(); return; }
      if (a.startsWith('lb:')) { openLightbox(decodeURIComponent(a.slice(3))); return; }
      if (a.startsWith('menu:')) { const id = a.slice(5); menuFor = menuFor === id ? '' : id; reactFor = ''; renderList(); return; }
      if (a.startsWith('rx:')) { const id = a.slice(3); reactFor = reactFor === id ? '' : id; menuFor = ''; renderList(); return; }
      if (a.startsWith('reply:')) {
        const m = byMsg.get(a.slice(6)); if (!m) return;
        replying = { msgId: m._id, senderName: m.senderId === me() ? 'أنت' : (m.senderName || ''), preview: previewOf(m) };
        editing = null; menuFor = ''; reactFor = ''; paintExtra(); renderList(); inputEl()?.focus(); return;
      }
      if (a.startsWith('edit:')) {
        const m = byMsg.get(a.slice(5)); if (!m) return;
        editing = { msgId: m._id }; replying = null; menuFor = ''; reactFor = '';
        const i = inputEl(); if (i) { i.value = m.text || ''; i.focus(); } paintExtra(); renderList(); return;
      }
      if (a.startsWith('del:')) {
        const id = a.slice(4); menuFor = '';
        const r = await services.chat.deleteMessage({ convId, messageId: id });
        if (!r?.ok) shell.notify('تعذّر الحذف', 'danger'); else renderList();
        return;
      }
      if (a.startsWith('react:')) {
        const rest = a.slice(6); const i = rest.indexOf(':');
        const id = rest.slice(0, i); const emoji = rest.slice(i + 1);
        const m = byMsg.get(id); reactFor = '';
        const adding = !((m?.reactions?.[emoji] || []).includes(me()));
        const r = await services.chat.reactMessage({ convId, messageId: id, uid: me(), emoji, adding });
        if (!r?.ok) shell.notify('تعذّر التفاعل', 'danger'); else renderList();
        return;
      }
      if (a !== 'send') return;
      const input = inputEl();
      const text = (input?.value || '').trim();
      if (!text || !ready) return;
      if (editing) {
        const id = editing.msgId; resetCompose();
        const r = await services.chat.editMessage({ convId, messageId: id, text });
        if (!r?.ok) shell.notify('تعذّر التعديل', 'danger');
        return;
      }
      const reply = replying; resetCompose();
      const r = await services.chat.sendMessage({ convId, text, uid: me(), name: myName(), participants, replyTo: reply });
      if (!r?.ok) { shell.notify('تعذّر إرسال الرسالة', 'danger'); if (input) input.value = text; }
    },
    destroy() { try { unsub && unsub(); } catch (_) {} },
  };
}
