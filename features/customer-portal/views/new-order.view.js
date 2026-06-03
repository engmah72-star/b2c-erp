/**
 * VIEWS · new-order — «اطلب الآن»: نموذج طلب مُهيكل (overlay).
 * يتحوّل لرسالة طلب منظّمة للفريق عبر قناة المحادثات (H1.1) — لا إنشاء أوردر مباشر.
 * تركيب مكوّنات + نداء Service. (STANDARDS §6 · L1)
 */
import { qs } from '../utils/dom.js';
import { Select, Input, Button } from '../components/index.js';
import { sendRequest } from './requests.js';

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
      const text = `🆕 طلب جديد:\n• المنتج: ${product}${qty ? `\n• الكمية: ${qty}` : ''}${notes ? `\n• تفاصيل: ${notes}` : ''}`;
      busy = true; repaint();
      const r = await sendRequest(ctx, { text, kind: 'support' });
      busy = false;
      if (r?.ok) close?.(); else repaint();
    },
  };
}
