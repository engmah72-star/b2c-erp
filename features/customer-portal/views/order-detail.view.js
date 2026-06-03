/**
 * VIEWS · order-detail — تفاصيل الطلب داخل الـ Overlay: مراحل + فاتورة + أفعال.
 * تركيب مكوّنات + نداء Services. (STANDARDS §6 · L1)
 */
import { escapeHtml } from '../utils/dom.js';
import { Button } from '../components/index.js';
import { Stepper, stageBadge, nextActionOf, kv, money } from './partials.js';
import { sendRequest, reorderText, approveText } from './requests.js';

export function create(ctx) {
  const { services, order, close } = ctx;

  function html() {
    const inv = services.orders.invoiceOf(order);
    const na = nextActionOf(order);
    const product = order.productType || order.products?.[0]?.type || '—';
    const invoice = `<div class="cp-card"><div class="cp-stack cp-stack--sm">
      ${kv('إجمالي الطلب', money(inv.gross) + ' ج')}
      ${kv('المدفوع', money(inv.paid) + ' ج')}
      ${kv('المتبقّي', money(inv.rem) + ' ج', 'cp-kv--total')}
    </div></div>`;
    const cta = na
      ? Button({ label: na.label, icon: '✅', variant: 'primary', action: 'approve' })
      : '';
    return `<div class="cp-stack cp-stack--lg">
      <div class="cp-row cp-row--between"><span class="cp-muted">المنتج: ${escapeHtml(product)}</span>${stageBadge(order.stage)}</div>
      ${Stepper(order.stage)}
      ${na ? `<div class="cp-cta-banner"><div class="cp-cta-banner__title">⚠️ ${escapeHtml(na.hint)}</div>${cta}</div>` : ''}
      <div><h2 class="cp-sec">الفاتورة</h2>${invoice}</div>
      <div class="cp-row cp-row--wrap">
        ${Button({ label: 'اطلب تاني', icon: '🔁', variant: 'ghost', size: 'sm', block: false, action: 'reorder' })}
        ${Button({ label: 'تواصل بخصوص الطلب', icon: '💬', variant: 'ghost', size: 'sm', block: false, action: 'contact' })}
      </div>
    </div>`;
  }

  return {
    async mount() { return html(); },
    async onAction(a) {
      if (a === 'approve') { const r = await sendRequest(ctx, { order, kind: 'order', text: approveText(order) }); if (r.ok) close?.(); return; }
      if (a === 'reorder') { await sendRequest(ctx, { order, kind: 'order', text: reorderText(order) }); return; }
      if (a === 'contact') { await sendRequest(ctx, { order, kind: 'order', text: `💬 لديّ استفسار بخصوص الطلب رقم #${order.serial || order._id?.slice(0, 6) || ''}.` }); }
    },
  };
}
