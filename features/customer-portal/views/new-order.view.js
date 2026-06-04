/**
 * VIEWS · new-order — «اطلب الآن»: نموذج طلب مُهيكل (overlay).
 * يكتب كياناً مُهيكلاً في order_requests (نقطة بداية رسمية · Order = SSoT) عبر
 * services.requests/clientActions (H1.1) — لا رسالة محادثة كنقطة بداية للعملية.
 * المنتجات مصدرها كتالوج الشركة الفعلي (products_v2 عبر services.products) لا قائمة
 * ثابتة — العميل يطلب من منتجات الشركة. تركيب مكوّنات + نداء Service. (STANDARDS §6 · L1)
 */
import { qs } from '../utils/dom.js';
import { Select, Input, Button } from '../components/index.js';
import { submitRequest } from './requests.js';

// خيار احتياطي ثابت فقط (طلب غير مدرج بالكتالوج) — كل ما عداه من منتجات الشركة.
const OTHER = { value: '__other__', label: 'منتج آخر / غير مدرج' };

export function create(ctx) {
  const { shell, close, services } = ctx;
  let busy = false;
  let loaded = false;
  let products = []; // [{ id, name, ... }] — من كتالوج الشركة

  function options() {
    return [...products.map((p) => ({ value: p.id, label: p.name })), OTHER];
  }

  function html() {
    if (!loaded) {
      return `<div class="cp-stack"><div class="cp-muted cp-text-c">جارٍ تحميل منتجات الشركة…</div></div>`;
    }
    const body = `<div class="cp-stack cp-stack--sm">
      ${Select({ id: 'no-product', label: 'نوع المنتج', options: options(), required: true })}
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

  async function load() {
    try { products = await services.products.loadProducts(); } catch (_) { products = []; }
    loaded = true;
  }

  return {
    async mount() { await load(); return html(); },
    async onAction(a) {
      if (a === 'cancel') return close?.();
      if (a !== 'submit' || busy) return;
      const val = (id) => (qs('#' + id, shell.modal.body)?.value || '').trim();
      const productId = val('no-product');
      const qty = val('no-qty');
      const notes = val('no-notes');
      // اربط الاختيار بمنتج الشركة الفعلي: نُمرّر productId الحقيقي + الاسم.
      const chosen = products.find((p) => p.id === productId);
      const product = chosen ? chosen.name : 'منتج آخر';
      busy = true; repaint();
      // نقطة بداية مُهيكلة: order_requests (Order = SSoT) — لا رسالة محادثة.
      const r = await submitRequest(ctx, {
        type: 'new', product, productId: chosen ? chosen.id : '', qty, notes,
      });
      busy = false;
      if (r?.ok) close?.(); else repaint();
    },
  };
}
