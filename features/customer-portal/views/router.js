/**
 * VIEWS · router — منسّق الشاشات: تحميل كسول · دورة حياة · delegation · تنقّل.
 * لا منطق أعمال (يفوّض للـ Services) · لا تنسيق (يفوّض للـ CSS). (STANDARDS §6)
 *
 * createRouter({ shell, store, services }) → { go(key), openOrder(order), start(key) }
 * عقد الـ View:  create(ctx) → { async mount() → html, onAction?(a, el), onChip?(v, el) }
 *   ctx = { services, store, shell, go, openOrder, repaint, loading }
 */
import { qs, delegate } from '../utils/dom.js';
import { Skeleton } from '../components/index.js';

// سجلّ الشاشات — كل واحدة تُحمَّل عند الطلب فقط (import ديناميكي · Performance §9)
const REGISTRY = {
  login:     () => import('./login.view.js'),
  home:      () => import('./home.view.js'),
  orders:    () => import('./orders.view.js'),
  designs:   () => import('./designs.view.js'),
  profile:   () => import('./profile.view.js'),
};

const loadingHtml = () =>
  `<div class="cp-stack" aria-busy="true" aria-label="جارٍ التحميل">${Skeleton({ variant: 'card', count: 4 })}</div>`;

export function createRouter({ shell, store, services }) {
  let current = null;     // الـ View النشط في حاوية المحتوى
  let modalView = null;   // الـ View النشط داخل الـ Overlay (تفاصيل الطلب)

  const main = qs('.cp-main', document.getElementById('cp-app'));

  // ── delegation موحّد لحاوية المحتوى (مستقرّ عبر تبديل الشاشات) ──
  delegate(main, 'click', '[data-action]', (el) => {
    const a = el.dataset.action;
    if (current?.onAction) current.onAction(a, el);
  });
  delegate(main, 'click', '.cp-chip', (el) => {
    if (current?.onChip) current.onChip(el.dataset.chip, el);
  });

  // ── delegation داخل الـ Overlay (تفاصيل الطلب) ──
  delegate(shell.modal.body, 'click', '[data-action]', (el) => {
    if (modalView?.onAction) modalView.onAction(el.dataset.action, el);
  });

  function ctx() {
    return { services, store, shell, go, openOrder, repaint, loading: loadingHtml };
  }

  /** يعيد رسم محتوى الشاشة الحالية بـ HTML جاهز (بعد فلترة/تحديث محلي). */
  function repaint(html) { shell.mount(html); }

  /** يفتح/يحدّث الـ Overlay بمحتوى تفاصيل الطلب. */
  async function openOrder(order) {
    const mod = await REGISTRY_DETAIL();
    modalView = mod.create({ ...ctx(), order, close: () => shell.modal.close() });
    shell.modal.open({
      title: `طلب #${order.serial || order._id?.slice(0, 6) || ''}`,
      content: loadingHtml(),
      onClose: () => { modalView = null; },
    });
    const html = await modalView.mount();
    shell.modal.body.innerHTML = html;
  }
  const REGISTRY_DETAIL = () => import('./order-detail.view.js');

  /** ينتقل إلى شاشة (tab) ويعرض حالة تحميل ثم المحتوى. */
  async function go(key) {
    const loader = REGISTRY[key] || REGISTRY.home;
    store.set({ activeTab: key });
    shell.setActiveTab(key);
    shell.mount(loadingHtml());
    try {
      const mod = await loader();
      current = mod.create(ctx());
      const html = await current.mount();
      shell.mount(html);
    } catch (e) {
      current = null;
      shell.mount(`<div class="cp-empty"><span class="cp-empty__icon">⚠️</span>
        <div class="cp-empty__title">تعذّر تحميل الصفحة</div>
        <div class="cp-muted">${(e && e.message) || ''}</div></div>`);
    }
  }

  function start(key) { return go(key); }

  return { go, openOrder, start };
}
