/**
 * VIEWS · chat — محادثة حيّة ثنائية الاتجاه (overlay): قراءة فورية + إرسال.
 * يفتح/يرسل عبر Services (clientActions · H1.1) ويشترك في الرسائل للقراءة الحيّة.
 * (STANDARDS §6 · L1)
 */
import { escapeHtml, qs } from '../utils/dom.js';
import { Button, Input, Skeleton } from '../components/index.js';
import { shortTime } from '../utils/format.js';

export function create(ctx) {
  const { services, store, shell, kind = 'support', order = null, peer = null, conv = null } = ctx;
  let convId = null, participants = [], unsub = null, ready = false;

  const me = () => store.get('user')?.uid || '';
  const myName = () => store.get('client')?.name || store.get('user')?.displayName || 'عميل';

  const fmtBytes = (n) => { n = +n || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; };

  // عرض موحَّد مع الإنبوكس: نص · صورة · ملف · صوت · مشاركة أوردر (قراءة فقط).
  function mediaBody(m) {
    const a = (m.attachments && m.attachments[0]) || null;
    if (m.type === 'image' && a?.url)
      return `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener"><img class="cp-msg__img" src="${escapeHtml(a.url)}" alt="" loading="lazy"></a>`;
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

  function bubbles(list) {
    if (!list.length) return `<div class="cp-muted cp-text-c">ابدأ المحادثة — اكتب رسالتك بالأسفل 👇</div>`;
    return list.map((m) => {
      const mine = m.senderId === me();
      const meta = `${escapeHtml(mine ? 'أنت' : (m.senderName || 'الفريق'))} · ${escapeHtml(shortTime(m.createdAt))}`;
      const quote = m.replyTo ? `<div class="cp-msg__quote"><b>${escapeHtml(m.replyTo.senderName || '')}</b> ${escapeHtml(m.replyTo.preview || '')}</div>` : '';
      const isText = !m.type || m.type === 'text';
      const body = isText
        ? escapeHtml(m.text || '')
        : mediaBody(m) + (m.text ? `<div class="cp-msg__cap">${escapeHtml(m.text)}</div>` : '');
      const edited = m.editedAt ? '<span class="cp-msg__edited"> (مُعدّلة)</span>' : '';
      return `<div class="cp-msg cp-msg--${mine ? 'me' : 'them'}">${quote}${body}${edited}<span class="cp-msg__meta">${meta}</span></div>`;
    }).join('');
  }

  function paintMessages(list) {
    const node = qs('#cp-chat-list', shell.modal.body);
    if (!node) return;
    node.innerHTML = bubbles(list);
    node.scrollTop = node.scrollHeight;
  }

  function html() {
    return `<div class="cp-chat">
      <div class="cp-chat__list" id="cp-chat-list" aria-live="polite">${Skeleton({ variant: 'line', count: 3 })}</div>
      <div class="cp-chat__bar">
        ${Button({ label: '', icon: '📎', variant: 'ghost', size: 'sm', block: false, action: 'attach' })}
        ${Input({ id: 'cp-chat-input', label: '', placeholder: 'اكتب رسالتك…' })}
        ${Button({ label: 'إرسال', icon: '➤', size: 'sm', block: false, action: 'send' })}
      </div>
      <input type="file" id="cp-chat-file" accept="image/*,application/pdf" hidden>
    </div>`;
  }

  async function start() {
    // فتح محادثة موجودة مباشرة (من «محادثاتي») أو إنشاء/فتح عبر المدخل المركزي.
    if (conv?.convId) {
      convId = conv.convId; participants = conv.participants || [];
    } else {
      const t = await services.chat.openThread({ kind, uid: me(), name: myName(), order, peer });
      if (!t?.ok) { paintMessages([]); shell.notify('تعذّر فتح المحادثة', 'danger'); return; }
      convId = t.convId; participants = t.participants || [];
    }
    ready = true;
    try { await services.chat.markThreadRead({ convId, uid: me() }); } catch (_) {}
    unsub = await services.chat.subscribeMessages(convId, paintMessages);
  }

  return {
    async mount() { start(); return html(); },
    async onAction(a) {
      if (a === 'attach') { if (ready) qs('#cp-chat-file', shell.modal.body)?.click(); return; }
      if (a !== 'send') return;
      const input = qs('#cp-chat-input', shell.modal.body);
      const text = (input?.value || '').trim();
      if (!text || !ready) return;
      input.value = '';
      const r = await services.chat.sendMessage({ convId, text, uid: me(), name: myName(), participants });
      if (!r?.ok) { shell.notify('تعذّر إرسال الرسالة', 'danger'); input.value = text; }
    },
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
    destroy() { try { unsub && unsub(); } catch (_) {} },
  };
}
