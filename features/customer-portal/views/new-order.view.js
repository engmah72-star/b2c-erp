/**
 * VIEWS · new-order — «اطلب الآن»: نموذج طلب مُهيكل (overlay).
 * يكتب كياناً مُهيكلاً في order_requests (نقطة بداية رسمية · Order = SSoT) عبر
 * services.requests/clientActions (H1.1) — لا رسالة محادثة كنقطة بداية للعملية.
 * تركيب مكوّنات + نداء Service. (STANDARDS §6 · L1)
 */
import { qs } from '../utils/dom.js';
import { Select, Input, Button } from '../components/index.js';
import { submitRequest } from './requests.js';

const PRODUCTS = [
  { value: 'كروت شخصية', label: 'كروت شخصية' },
  { value: 'فلايرز', label: 'فلايرز / منشورات' },
  { value: 'رول أب', label: 'رول أب' },
  { value: 'بانر', label: 'بانر / لافتة' },
  { value: 'ستيكرز', label: 'ستيكرز / ملصقات' },
  { value: 'مطبوعات', label: 'مطبوعات أخرى' },
  { value: 'تصميم', label: 'تصميم فقط' },
  { value: 'أخرى', label: 'أخرى' },
];

export function create(ctx) {
  const { shell, close } = ctx;
  let busy = false;

  function html() {
    const body = `<div class="cp-stack cp-stack--sm">
      ${Select({ id: 'no-product', label: 'نوع المنتج', options: PRODUCTS, required: true })}
      ${Input({ id: 'no-qty', label: 'الكمية (تقريبية)', type: 'number', placeholder: 'مثال: 100' })}
      ${Input({ id: 'no-notes', label: 'تفاصيل/ملاحظات', type: 'textarea', placeholder: 'المقاس · الألوان · الخامة · أي تفاصيل…' })}
      <div class="cp-muted">سنستلم طلبك على المحادثة ونردّ عليك بعرض السعر والتفاصيل.</div>
      <div class="cp-row cp-row--wrap">
        ${Button({ label: 'إرسال الطلب', icon: '🚀', size: 'sm', block: false, action: 'submit', loading: busy })}
        ${Button({ label: 'إلغاء', variant: 'ghost', size: 'sm', block: false, action: 'cancel' })}
      </div>
    </div>`;
    return `<div class="cp-stack">${body}</div>`;
  }

  function repaint() { shell.modal.body.innerHTML = html(); }

  return {
    async mount() { return html(); },
    async onAction(a) {
      if (a === 'cancel') return close?.();
      if (a !== 'submit' || busy) return;
      const val = (id) => (qs('#' + id, shell.modal.body)?.value || '').trim();
      const product = val('no-product');
      const qty = val('no-qty');
      const notes = val('no-notes');
      busy = true; repaint();
      // نقطة بداية مُهيكلة: order_requests (Order = SSoT) — لا رسالة محادثة.
      const r = await submitRequest(ctx, { type: 'new', product, qty, notes });
      busy = false;
      if (r?.ok) close?.(); else repaint();
    },
  };
}
