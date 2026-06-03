/**
 * VIEWS · chat — محادثة حيّة ثنائية الاتجاه (overlay): قراءة فورية + إرسال.
 * يفتح/يرسل عبر Services (clientActions · H1.1) ويشترك في الرسائل للقراءة الحيّة.
 * (STANDARDS §6 · L1)
 */
import { escapeHtml, qs } from '../utils/dom.js';
import { Button, Input, Skeleton } from '../components/index.js';
import { shortTime } from '../utils/format.js';

export function create(ctx) {
  const { services, store, shell, kind = 'support', order = null } = ctx;
  let convId = null, participants = [], unsub = null, ready = false;

  const me = () => store.get('user')?.uid || '';
  const myName = () => store.get('client')?.name || store.get('user')?.displayName || 'عميل';

  function bubbles(list) {
    if (!list.length) return `<div class="cp-muted cp-text-c">ابدأ المحادثة — اكتب رسالتك بالأسفل 👇</div>`;
    return list.map((m) => {
      const mine = m.senderId === me();
      const meta = `${escapeHtml(mine ? 'أنت' : (m.senderName || 'الفريق'))} · ${escapeHtml(shortTime(m.createdAt))}`;
      return `<div class="cp-msg cp-msg--${mine ? 'me' : 'them'}">${escapeHtml(m.text || '')}<span class="cp-msg__meta">${meta}</span></div>`;
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
        ${Input({ id: 'cp-chat-input', label: '', placeholder: 'اكتب رسالتك…' })}
        ${Button({ label: 'إرسال', icon: '➤', size: 'sm', block: false, action: 'send' })}
      </div>
    </div>`;
  }

  async function start() {
    const t = await services.chat.openThread({ kind, uid: me(), name: myName(), order });
    if (!t?.ok) { paintMessages([]); shell.notify('تعذّر فتح المحادثة', 'danger'); return; }
    convId = t.convId; participants = t.participants || [];
    ready = true;
    unsub = await services.chat.subscribeMessages(convId, paintMessages);
  }

  return {
    async mount() { start(); return html(); },
    async onAction(a) {
      if (a !== 'send') return;
      const input = qs('#cp-chat-input', shell.modal.body);
      const text = (input?.value || '').trim();
      if (!text || !ready) return;
      input.value = '';
      const r = await services.chat.sendMessage({ convId, text, uid: me(), name: myName(), participants });
      if (!r?.ok) { shell.notify('تعذّر إرسال الرسالة', 'danger'); input.value = text; }
    },
    destroy() { try { unsub && unsub(); } catch (_) {} },
  };
}
