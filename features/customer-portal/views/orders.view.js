/**
 * VIEWS · orders — قائمة طلبات العميل + فلترة الحالة + نداء الفعل/إعادة الطلب.
 * تركيب مكوّنات + نداء Services. (STANDARDS §6 · L1)
 */
import { escapeHtml } from '../utils/dom.js';
import { Card, Button, Chips, EmptyState, Badge } from '../components/index.js';
import { Stepper, stageBadge, nextActionOf, ReorderBtn, money } from './partials.js';
import { submitRequest } from './requests.js';

const FILTERS = [
  { label: 'الكل', value: 'all' },
  { label: 'نشِطة', value: 'active' },
  { label: 'مكتملة', value: 'archived' },
];

// حالات طلب البوابة (order_requests) — للعرض فقط. المُحوّل يظهر كأوردر فلا نكرّره.
const REQ_STATUS = {
  new:      { label: 'بانتظار المراجعة', tone: 'printing', ico: '🕒' },
  rejected: { label: 'تعذّر تنفيذه', tone: 'danger', ico: '🚫' },
};
const reqTypeLabel = (t) => (t === 'reorder' ? 'إعادة طلب' : t === 'quote' ? 'عرض سعر' : 'طلب جديد');

export function create(ctx) {
  const { services, store } = ctx;
  let orders = [];
  let requests = [];
  let filter = 'all';
  const byId = new Map();

  const visible = () => orders.filter((o) =>
    filter === 'all' ? true : filter === 'archived' ? o.stage === 'archived' : (o.stage !== 'archived' && o.stage !== 'cancelled'));

  function orderCard(o) {
    const inv = services.orders.invoiceOf(o);
    const na = nextActionOf(o);
    const actions = [
      Button({ label: 'تفاصيل', icon: '👁', variant: 'ghost', size: 'sm', block: false, action: `open:${o._id}` }),
      Button({ label: 'المحادثة', icon: '💬', variant: 'ghost', size: 'sm', block: false, action: `chat:${o._id}` }),
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

  // بطاقة طلب بوابة قيد المراجعة/مرفوض (قبل أن يصبح أوردراً).
  function requestCard(r) {
    const st = REQ_STATUS[r.status] || REQ_STATUS.new;
    const lines = [
      `<div class="cp-row cp-row--between"><strong>${st.ico} ${escapeHtml(reqTypeLabel(r.type))}</strong>${Badge({ text: st.label, tone: st.tone })}</div>`,
      r.product ? `<div class="cp-row cp-row--between"><span class="cp-muted">المنتج</span><strong>${escapeHtml(r.product)}${r.qty ? ' ×' + escapeHtml(String(r.qty)) : ''}</strong></div>` : '',
      (r.status === 'rejected' && r.rejectReason) ? `<div class="cp-muted">السبب: ${escapeHtml(r.rejectReason)}</div>` : '',
      r.status !== 'rejected' ? `<div class="cp-muted">استلمنا طلبك — سنراجعه ونردّ عليك بعرض السعر قريباً.</div>` : '',
    ].filter(Boolean).join('');
    return Card({ body: `<div class="cp-stack cp-stack--sm">${lines}</div>` });
  }

  function html() {
    const list = visible();
    const pending = requests.filter((r) => r.status === 'new' || r.status === 'rejected');
    const head = `<div class="cp-stack cp-stack--sm">
      <div class="cp-row cp-row--between">
        <h2 class="cp-sec">طلباتي (${orders.length})</h2>
        ${Button({ label: 'طلب جديد', icon: '🚀', size: 'sm', block: false, action: 'neworder' })}
      </div>
      ${Chips(FILTERS, filter)}
    </div>`;
    const reqSection = pending.length
      ? `<div class="cp-stack cp-stack--sm">
          <h2 class="cp-sec">قيد المراجعة (${pending.length})</h2>
          ${pending.map(requestCard).join('')}
        </div>`
      : '';
    const content = list.length
      ? `<div class="cp-stack">${list.map(orderCard).join('')}</div>`
      : EmptyState({ icon: '📭', title: 'لا توجد طلبات في هذا التصنيف', hint: 'جرّب تصنيفاً آخر.' });
    return `<div class="cp-stack cp-stack--lg">${head}${reqSection}${content}</div>`;
  }

  return {
    async mount() {
      const phone = store.get('client')?.phone1 || store.get('client')?.phone || '';
      const uid = store.get('user')?.uid || '';
      [orders, requests] = await Promise.all([
        services.orders.loadOrders(phone),
        services.orders.loadRequests(uid),
      ]);
      byId.clear(); orders.forEach((o) => byId.set(o._id, o));
      return html();
    },
    onChip(value) { if (value && value !== filter) { filter = value; ctx.repaint(html()); } },
    async onAction(a) {
      if (a === 'neworder') return ctx.openNewOrder();
      if (a.startsWith('open:')) { const o = byId.get(a.slice(5)); if (o) ctx.openOrder(o); return; }
      // محادثة الطلب مباشرةً من البطاقة (بلا الدخول للإنبوكس) — يفتح خيط clord_ للأوردر.
      if (a.startsWith('chat:')) { const o = byId.get(a.slice(5)); if (o) ctx.openChat?.({ kind: 'order', order: o }); return; }
      if (a.startsWith('reorder:')) { const o = byId.get(a.slice(8)); if (o) await submitRequest(ctx, { type: 'reorder', order: o }); return; }
      if (a.startsWith('approve:')) {
        // الاعتماد عبر الفعل المركزي (Cloud Function → order.clientApproval) فقط — لا رسالة.
        const o = byId.get(a.slice(8));
        if (o) {
          const r = await ctx.services.approval.approveDesign(o._id);
          ctx.shell.notify(r.ok ? 'تم اعتماد التصميم ✅' : 'تعذّر الاعتماد — حاول مرة أخرى', r.ok ? 'ok' : 'danger');
        }
      }
    },
  };
}
