/**
 * VIEWS · invoices — «الفواتير»: ملخّص مالي + فاتورة كل طلب (إجمالي/مدفوع/متبقّي + الحالة).
 * الأرقام عبر order-math (المصدر المالي الوحيد · RULE 1). قراءة فقط. (STANDARDS §6 · L1)
 * ملاحظة: سجلّ الدفعات التفصيلي في transactions_v2 (مالي · غير مقروء للعميل)؛
 *         نعرض حالة الدفع وتاريخ الإغلاق على مستوى الطلب.
 */
import { escapeHtml } from '../utils/dom.js';
import { Card, Button, Chips, Badge, EmptyState } from '../components/index.js';
import { kv, money } from './partials.js';
import { shortTime } from '../utils/format.js';

const FILTERS = [
  { label: 'الكل', value: 'all' },
  { label: 'عليها متبقٍّ', value: 'due' },
  { label: 'مسدّدة', value: 'paid' },
];

/** حالة الدفع من المتبقّي (مشتقّة لا مخزّنة). */
function payState(rem, gross) {
  if (gross <= 0) return { text: '—', tone: 'neutral' };
  if (rem <= 0) return { text: '✅ مسدّدة', tone: 'ok' };
  if (rem < gross) return { text: '◐ مدفوعة جزئياً', tone: 'printing' };
  return { text: '⏳ غير مدفوعة', tone: 'danger' };
}

export function create(ctx) {
  const { services, store } = ctx;
  let orders = [];
  let filter = 'all';
  const byId = new Map();

  const visible = () => orders.filter((o) => {
    if (filter === 'all') return true;
    const rem = services.orders.invoiceOf(o).rem;
    return filter === 'due' ? rem > 0 : rem <= 0;
  });

  function summary() {
    const t = services.orders.totalsOf(orders);
    const tile = (num, label, mod = '') =>
      Card({ body: `<div class="cp-stat"><div class="cp-stat__num ${mod}">${money(num)} ج</div><div class="cp-stat__label">${label}</div></div>` });
    return `<div class="cp-grid cp-grid--2">
      ${tile(t.gross, 'إجمالي الفواتير', 'cp-stat__num--accent')}
      ${tile(t.paid, 'المدفوع', 'cp-stat__num--ok')}
      ${tile(t.rem, 'المتبقّي', t.rem > 0 ? 'cp-stat__num--danger' : '')}
    </div>`;
  }

  function invoiceCard(o) {
    const inv = services.orders.invoiceOf(o);
    const st = payState(inv.rem, inv.gross);
    const paidAt = o.paidAt ? shortTime(o.paidAt) : '';
    const body = `<div class="cp-stack cp-stack--sm">
      <div class="cp-row cp-row--between">
        <strong>فاتورة #${escapeHtml(o.serial || o._id.slice(0, 6))}</strong>
        ${Badge(st)}
      </div>
      ${kv('إجمالي الطلب', money(inv.gross) + ' ج')}
      ${kv('المدفوع', money(inv.paid) + ' ج')}
      ${kv('المتبقّي', money(inv.rem) + ' ج', 'cp-kv--total')}
      ${paidAt ? `<div class="cp-muted">سُدّدت بالكامل: ${escapeHtml(paidAt)}</div>` : ''}
      <div class="cp-row cp-row--wrap">
        ${Button({ label: 'تفاصيل الطلب', icon: '👁', variant: 'ghost', size: 'sm', block: false, action: `open:${o._id}` })}
        ${inv.rem > 0 ? Button({ label: 'استفسار عن الدفع', icon: '💬', variant: 'ghost', size: 'sm', block: false, action: `ask:${o._id}` }) : ''}
      </div>
    </div>`;
    return Card({ body });
  }

  function html() {
    if (!orders.length) {
      return `<div class="cp-stack cp-stack--lg"><h2 class="cp-sec">الفواتير</h2>
        ${EmptyState({ icon: '🧾', title: 'لا توجد فواتير بعد' })}</div>`;
    }
    const list = visible();
    const head = `<div class="cp-stack cp-stack--sm"><h2 class="cp-sec">الفواتير</h2>${Chips(FILTERS, filter)}</div>`;
    const content = list.length
      ? `<div class="cp-stack">${list.map(invoiceCard).join('')}</div>`
      : EmptyState({ icon: '🧾', title: 'لا فواتير في هذا التصنيف' });
    return `<div class="cp-stack cp-stack--lg">${head}${summary()}${content}</div>`;
  }

  return {
    async mount() {
      const phone = store.get('client')?.phone1 || store.get('client')?.phone || '';
      orders = await services.orders.loadOrders(phone);
      byId.clear(); orders.forEach((o) => byId.set(o._id, o));
      return html();
    },
    onChip(value) { if (value && value !== filter) { filter = value; ctx.repaint(html()); } },
    async onAction(a) {
      if (a.startsWith('open:')) { const o = byId.get(a.slice(5)); if (o) ctx.openOrder(o); return; }
      if (a.startsWith('ask:')) { const o = byId.get(a.slice(4)); if (o) ctx.openChat({ kind: 'order', order: o }); }
    },
  };
}
