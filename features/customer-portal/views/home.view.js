/**
 * VIEWS · home — لوحة موجّهة بالأفعال: «ماذا يحتاج انتباهك الآن» + ملخّص + آخر الطلبات.
 * تركيب مكوّنات + نداء Services. صفر منطق أعمال/حساب. (STANDARDS §6 · L1)
 */
import { escapeHtml } from '../utils/dom.js';
import { Card, Button, Avatar, EmptyState } from '../components/index.js';
import { Stepper, stageBadge, nextActionOf, CtaBanner, ReorderBtn, money } from './partials.js';
import { submitRequest } from './requests.js';

export function create(ctx) {
  const { services, store } = ctx;
  let orders = [];
  const byId = new Map();

  function greeting() {
    const client = store.get('client');
    const name = client?.name || store.get('user')?.displayName || 'عميلنا العزيز';
    const body = `<div class="cp-row">
      ${Avatar({ initial: name, size: 'md' })}
      <div class="cp-row__grow">
        <div class="cp-title">أهلاً ${escapeHtml(name)} 👋</div>
        <div class="cp-muted">متابعة طلباتك ومركزك الرقمي</div>
      </div>
      ${Button({ label: 'كارتي', icon: '💼', variant: 'ghost', size: 'sm', block: false, action: 'go:profile' })}
    </div>`;
    return Card({ body });
  }

  function attention() {
    const need = orders.filter((o) => nextActionOf(o));
    const debt = orders.filter((o) => services.orders.invoiceOf(o).rem > 0);
    if (!need.length && !debt.length) return '';
    const items = [];
    if (need.length) items.push(`<li>${need.length} طلب بانتظار اعتمادك للتصميم</li>`);
    if (debt.length) items.push(`<li>${debt.length} طلب عليه مبلغ متبقٍّ</li>`);
    const body = `<ul class="cp-bullets">${items.join('')}</ul>`;
    return CtaBanner({ title: '🔔 يحتاج انتباهك الآن', body });
  }

  function stats() {
    const t = services.orders.totalsOf(orders);
    const tile = (num, label, mod = '') =>
      Card({ body: `<div class="cp-stat"><div class="cp-stat__num ${mod}">${num}</div><div class="cp-stat__label">${label}</div></div>` });
    return `<div class="cp-grid cp-grid--2">
      ${tile(orders.length, 'إجمالي الطلبات')}
      ${tile(money(t.paid) + ' ج', 'المدفوع', 'cp-stat__num--ok')}
      ${tile(money(t.rem) + ' ج', 'المتبقّي', t.rem > 0 ? 'cp-stat__num--danger' : '')}
      ${tile(money(t.gross) + ' ج', 'إجمالي التعاملات', 'cp-stat__num--accent')}
    </div>`;
  }

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
        <strong>طلب #${escapeHtml(o.serial || o._id.slice(0, 6))}</strong>
        ${stageBadge(o.stage)}
      </div>
      ${Stepper(o.stage)}
      <div class="cp-row cp-row--between">
        <span class="cp-muted">المتبقّي</span>
        <strong>${money(inv.rem)} ج</strong>
      </div>
      ${na ? `<div class="cp-muted">⚠️ ${escapeHtml(na.hint)}</div>` : ''}
      <div class="cp-row cp-row--wrap">${actions}</div>
    </div>`;
    return Card({ body });
  }

  function html() {
    if (!orders.length) {
      return `<div class="cp-stack cp-stack--lg">${greeting()}${EmptyState({
        icon: '🚀', title: 'ابدأ أول طلب',
        hint: 'لا توجد طلبات بعد — اطلب الآن وسنبدأ معك فوراً.',
        action: Button({ label: 'اطلب الآن', icon: '🚀', action: 'neworder', block: false }),
      })}</div>`;
    }
    const recent = orders.slice(0, 6).map(orderCard).join('');
    return `<div class="cp-stack cp-stack--lg">
      ${greeting()}
      ${Button({ label: 'اطلب الآن', icon: '🚀', action: 'neworder' })}
      ${attention()}
      ${stats()}
      ${Button({ label: 'كل الفواتير والمدفوعات', icon: '📑', variant: 'ghost', action: 'go:invoices' })}
      <div><h2 class="cp-sec">آخر الطلبات</h2><div class="cp-stack">${recent}</div></div>
    </div>`;
  }

  return {
    async mount() {
      const phone = store.get('client')?.phone1 || store.get('client')?.phone || '';
      orders = await services.orders.loadOrders(phone);
      byId.clear(); orders.forEach((o) => byId.set(o._id, o));
      return html();
    },
    async onAction(a) {
      if (a === 'neworder') return ctx.openNewOrder();
      if (a.startsWith('go:')) return ctx.go(a.slice(3));
      if (a.startsWith('open:')) { const o = byId.get(a.slice(5)); if (o) ctx.openOrder(o); return; }
      if (a.startsWith('reorder:')) { const o = byId.get(a.slice(8)); if (o) await submitRequest(ctx, { type: 'reorder', order: o }); return; }
      if (a.startsWith('approve:')) {
        // الاعتماد عبر الفعل المركزي (Cloud Function → order.clientApproval) فقط — لا رسالة.
        const o = byId.get(a.slice(8));
        if (o) {
          const r = await ctx.services.approval.approveDesign(o._id);
          ctx.shell.notify(r.ok ? 'تم اعتماد التصميم ✅' : 'تعذّر الاعتماد — حاول مرة أخرى', r.ok ? 'ok' : 'danger');
        }
        return;
      }
      if (a === 'quote') await submitRequest(ctx, { type: 'quote' });
    },
  };
}
