/**
 * VIEWS · orders — قائمة طلبات العميل + فلترة الحالة + نداء الفعل/إعادة الطلب.
 * تركيب مكوّنات + نداء Services. (STANDARDS §6 · L1)
 */
import { escapeHtml } from '../utils/dom.js';
import { Card, Button, Chips, EmptyState } from '../components/index.js';
import { Stepper, stageBadge, nextActionOf, ReorderBtn, money } from './partials.js';
import { sendRequest, reorderText, approveText } from './requests.js';

const FILTERS = [
  { label: 'الكل', value: 'all' },
  { label: 'نشِطة', value: 'active' },
  { label: 'مكتملة', value: 'archived' },
];

export function create(ctx) {
  const { services, store } = ctx;
  let orders = [];
  let filter = 'all';
  const byId = new Map();

  const visible = () => orders.filter((o) =>
    filter === 'all' ? true : filter === 'archived' ? o.stage === 'archived' : (o.stage !== 'archived' && o.stage !== 'cancelled'));

  function orderCard(o) {
    const inv = services.orders.invoiceOf(o);
    const na = nextActionOf(o);
    const actions = [
      Button({ label: 'تفاصيل', icon: '👁', variant: 'ghost', size: 'sm', block: false, action: `open:${o._id}` }),
      ReorderBtn(o._id),
      na ? Button({ label: na.label, icon: '✅', variant: 'primary', size: 'sm', block: false, action: `approve:${o._id}` }) : '',
    ].filter(Boolean).join('');
    const body = `<div class="cp-stack cp-stack--sm">
      <div class="cp-row cp-row--between">
        <strong>طلب #${escapeHtml(o.serial || o._id.slice(0, 6))}</strong>${stageBadge(o.stage)}
      </div>
      ${Stepper(o.stage)}
      <div class="cp-row cp-row--between"><span class="cp-muted">المتبقّي</span><strong>${money(inv.rem)} ج</strong></div>
      <div class="cp-row cp-row--wrap">${actions}</div>
    </div>`;
    return Card({ body });
  }

  function html() {
    const list = visible();
    const head = `<div class="cp-stack cp-stack--sm">
      <div class="cp-row cp-row--between">
        <h2 class="cp-sec">طلباتي (${orders.length})</h2>
        ${Button({ label: 'طلب جديد', icon: '🚀', size: 'sm', block: false, action: 'neworder' })}
      </div>
      ${Chips(FILTERS, filter)}
    </div>`;
    const content = list.length
      ? `<div class="cp-stack">${list.map(orderCard).join('')}</div>`
      : EmptyState({ icon: '📭', title: 'لا توجد طلبات في هذا التصنيف', hint: 'جرّب تصنيفاً آخر.' });
    return `<div class="cp-stack cp-stack--lg">${head}${content}</div>`;
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
      if (a === 'neworder') return ctx.openNewOrder();
      if (a.startsWith('open:')) { const o = byId.get(a.slice(5)); if (o) ctx.openOrder(o); return; }
      if (a.startsWith('reorder:')) { const o = byId.get(a.slice(8)); if (o) await sendRequest(ctx, { order: o, kind: 'order', text: reorderText(o) }); return; }
      if (a.startsWith('approve:')) { const o = byId.get(a.slice(8)); if (o) await sendRequest(ctx, { order: o, kind: 'order', text: approveText(o) }); }
    },
  };
}
