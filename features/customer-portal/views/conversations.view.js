/**
 * VIEWS · conversations — «محادثاتي»: inbox موحَّد للعضو (overlay).
 * يجمع كل خيوطه (دعم · أوردر · أعضاء) من conversations participant-based،
 * ويفتح أي خيط عبر chat.view. النواة المركزية لاكتشاف المحادثات. (STANDARDS §6 · L1)
 */
import { escapeHtml, qs } from '../utils/dom.js';
import { Button, Skeleton, EmptyState } from '../components/index.js';
import { shortTime } from '../utils/format.js';

export function create(ctx) {
  const { services, store, shell } = ctx;
  const me = () => store.get('user')?.uid || '';
  let convs = [];
  let unsub = null;
  const byId = new Map();

  // اسم العرض: لمحادثة عضو↔عضو خُذ اسم الطرف الآخر من dmNames.
  function titleOf(c) {
    if (c.type === 'dm' && c.dmNames) {
      const other = (c.participants || []).find((p) => p !== me());
      return c.dmNames[other] || c.name || 'محادثة';
    }
    return c.name || 'محادثة';
  }

  function row(c) {
    const unread = (c.unreadCount || {})[me()] || 0;
    return `<button type="button" class="cp-conv" data-action="open:${c._id}">
      <div class="cp-conv__main">
        <div class="cp-conv__title">${escapeHtml(titleOf(c))}${unread ? `<span class="cp-dot">${unread > 9 ? '9+' : unread}</span>` : ''}</div>
        <div class="cp-conv__preview cp-muted">${escapeHtml(c.lastMessagePreview || '—')}</div>
      </div>
      <div class="cp-conv__time cp-muted">${escapeHtml(shortTime(c.lastMessageAt))}</div>
    </button>`;
  }

  function paint() {
    const node = qs('#cp-conv-list', shell.modal.body);
    if (!node) return;
    node.innerHTML = convs.length
      ? convs.map(row).join('')
      : EmptyState({ icon: '💬', title: 'لا توجد محادثات بعد', hint: 'ابدأ محادثة دعم، أو تواصل مع نشاط من «فرص».' });
  }

  function html() {
    return `<div class="cp-stack cp-stack--sm">
      <div class="cp-row cp-row--between">
        <h2 class="cp-sec">محادثاتي</h2>
        ${Button({ label: 'دعم', icon: '🆘', variant: 'ghost', size: 'sm', block: false, action: 'support' })}
      </div>
      <div id="cp-conv-list" class="cp-stack cp-stack--sm">${Skeleton({ variant: 'line', count: 4 })}</div>
    </div>`;
  }

  return {
    async mount() {
      unsub = await services.chat.subscribeConversations(me(), (list) => {
        convs = list; byId.clear(); list.forEach((c) => byId.set(c._id, c)); paint();
      });
      return html();
    },
    async onAction(a) {
      if (a === 'support') { ctx.openChat?.({ kind: 'support' }); return; }
      if (a.startsWith('open:')) {
        const c = byId.get(a.slice(5));
        if (!c) return;
        try { unsub && unsub(); unsub = null; } catch (_) {} // أوقف الاشتراك قبل استبدال الـoverlay
        ctx.openChat?.({ conv: { convId: c._id, participants: c.participants || [], name: titleOf(c) } });
      }
    },
    destroy() { try { unsub && unsub(); } catch (_) {} },
  };
}
