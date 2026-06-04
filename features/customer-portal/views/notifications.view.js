/**
 * VIEWS · notifications — مركز إشعارات العميل (overlay): قائمة حيّة + تعليم مقروء + فتح الطلب.
 * تركيب مكوّنات + نداء Services. (STANDARDS §6 · L1)
 */
import { escapeHtml } from '../utils/dom.js';
import { Card, EmptyState, Skeleton } from '../components/index.js';
import { shortTime } from '../utils/format.js';

export function create(ctx) {
  const { services, store, shell } = ctx;
  let unsub = null;
  let items = [];

  const uid = () => store.get('user')?.uid || '';

  function rows() {
    if (!items.length) return EmptyState({ icon: '🔔', title: 'لا توجد إشعارات' });
    return `<div class="cp-stack">${items.map((n) => {
      const cls = n.read ? '' : ' cp-card--interactive';
      const body = `<div class="cp-row" data-action="open:${escapeHtml(n.orderId || '')}" data-id="${escapeHtml(n._id)}">
        <span aria-hidden="true">${escapeHtml(n.ico || '🔔')}</span>
        <div class="cp-row__grow">
          <div class="${n.read ? 'cp-muted' : ''}"><strong>${escapeHtml(n.title || 'إشعار')}</strong></div>
          <div class="cp-muted">${escapeHtml(n.desc || '')} · ${escapeHtml(shortTime(n.createdAt))}</div>
        </div>
        ${n.read ? '' : '<span class="cp-badge cp-badge--ok">جديد</span>'}
      </div>`;
      return Card({ body, interactive: !n.read });
    }).join('')}</div>`;
  }

  function paint() { shell.modal.body.innerHTML = `<div class="cp-stack cp-stack--lg">${rows()}</div>`; }

  return {
    async mount() {
      try {
        unsub = await services.notifications.subscribeNotifications(uid(), (list) => { items = list; paint(); });
      } catch (_) { items = []; setTimeout(paint, 0); }
      return `<div class="cp-stack" aria-busy="true">${Skeleton({ variant: 'line', count: 4 })}</div>`;
    },
    async onAction(a) {
      if (!a.startsWith('open:')) return;
      const orderId = a.slice(5);
      // علّم الإشعار المضغوط مقروءاً (أقربها للهدف)
      const target = items.find((n) => n.orderId === orderId && !n.read);
      if (target) services.notifications.markRead(target._id).catch(() => {});
      shell.modal.close();
      ctx.go('orders');
    },
    destroy() { try { unsub && unsub(); } catch (_) {} },
  };
}
