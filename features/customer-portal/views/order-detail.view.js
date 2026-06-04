/**
 * VIEWS · order-detail — تفاصيل الطلب داخل الـ Overlay: مراحل + بروفة + اعتماد + فاتورة.
 * تركيب مكوّنات + نداء Services. (STANDARDS §6 · L1)
 */
import { escapeHtml } from '../utils/dom.js';
import { Button } from '../components/index.js';
import { Stepper, stageBadge, nextActionOf, kv, money } from './partials.js';
import { sendRequest, reorderText } from './requests.js';

export function create(ctx) {
  const { services, order, close } = ctx;

  const proofUrl = () => order.printFinalUrl || order.designFileUrl || order.mockupUrl
    || (Array.isArray(order.designFiles) && order.designFiles[0]
        && (order.designFiles[0].url || order.designFiles[0])) || '';
  const isApproved = () => order.clientApproval && order.clientApproval.status === 'approved';

  function proofSection() {
    const u = proofUrl();
    let media;
    if (!u) {
      media = '<div class="cp-muted">البروفة لم تُرفع بعد — سنعلمك فور جاهزيتها.</div>';
    } else if (/\.pdf(\?|$)/i.test(u)) {
      media = `<a class="cp-btn cp-btn--ghost cp-btn--block" href="${escapeHtml(u)}" target="_blank" rel="noopener">📄 فتح البروفة (PDF)</a>`;
    } else {
      media = `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img class="cp-proof" src="${escapeHtml(u)}" alt="بروفة التصميم" loading="lazy"></a>`;
    }
    return `<div><h2 class="cp-sec">البروفة</h2><div class="cp-stack cp-stack--sm">${media}</div></div>`;
  }

  function approvalSection() {
    if (isApproved()) {
      return `<div class="cp-cta-banner"><div class="cp-cta-banner__title">✅ اعتمدت هذا التصميم</div>
        <div class="cp-muted">شكرًا — طلبك ينتقل للتنفيذ.</div></div>`;
    }
    const na = nextActionOf(order); // اعتماد متى كانت مرحلة التصميم بانتظار العميل
    if (!na) return '';
    const hasProof = !!proofUrl();
    return `<div class="cp-cta-banner">
      <div class="cp-cta-banner__title">⚠️ ${escapeHtml(na.hint)}</div>
      ${hasProof ? '<div class="cp-muted">راجِع البروفة بالأعلى ثم اعتمِد أو اطلب تعديلاً.</div>'
                 : '<div class="cp-muted">ستظهر البروفة هنا فور رفعها.</div>'}
      <div class="cp-row cp-row--wrap">
        ${Button({ label: 'اعتمِد التصميم', icon: '✅', action: 'approve', size: 'sm', block: false })}
        ${Button({ label: 'اطلب تعديلاً', icon: '✏️', variant: 'ghost', action: 'modify', size: 'sm', block: false })}
      </div></div>`;
  }

  function html() {
    const inv = services.orders.invoiceOf(order);
    const product = order.productType || order.products?.[0]?.type || '—';
    const invoice = `<div class="cp-card"><div class="cp-stack cp-stack--sm">
      ${kv('إجمالي الطلب', money(inv.gross) + ' ج')}
      ${kv('المدفوع', money(inv.paid) + ' ج')}
      ${kv('المتبقّي', money(inv.rem) + ' ج', 'cp-kv--total')}
    </div></div>`;
    return `<div class="cp-stack cp-stack--lg">
      <div class="cp-row cp-row--between"><span class="cp-muted">المنتج: ${escapeHtml(product)}</span>${stageBadge(order.stage)}</div>
      ${Stepper(order.stage)}
      ${proofSection()}
      ${approvalSection()}
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
      if (a === 'approve') {
        const r = await ctx.services.approval.approveDesign(order._id);
        if (r.ok) {
          order.clientApproval = { status: 'approved' };
          ctx.shell.notify('تم اعتماد التصميم ✅', 'ok');
          ctx.shell.modal.body.innerHTML = html(); // اعكس الحالة فوراً
          return;
        }
        const m = await sendRequest(ctx, { order, kind: 'order', text: `✅ أعتمِد تصميم الطلب رقم #${order.serial || order._id?.slice(0, 6) || ''}.` });
        if (m.ok) close?.();
        return;
      }
      if (a === 'modify') { close?.(); ctx.openChat({ kind: 'order', order }); return; }
      if (a === 'reorder') { await sendRequest(ctx, { order, kind: 'order', text: reorderText(order) }); return; }
      if (a === 'contact') { close?.(); ctx.openChat({ kind: 'order', order }); }
    },
  };
}
