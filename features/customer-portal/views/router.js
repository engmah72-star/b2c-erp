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
  invoices:  () => import('./invoices.view.js'),
  designs:   () => import('./designs.view.js'),
  portfolio: () => import('./portfolio.view.js'),
  needs:     () => import('./needs.view.js'),
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
  delegate(main, 'change', 'input[type="file"]', (el) => {
    if (current?.onUpload) current.onUpload(el);
  });

  // ── delegation داخل الـ Overlay (تفاصيل الطلب) ──
  delegate(shell.modal.body, 'click', '[data-action]', (el) => {
    if (modalView?.onAction) modalView.onAction(el.dataset.action, el);
  });
  delegate(shell.modal.body, 'change', 'input[type="file"]', (el) => {
    if (modalView?.onUpload) modalView.onUpload(el);
  });

  function ctx() {
    return { services, store, shell, go, openOrder, openChat, openConversations, openNewOrder, openServices, openNotifications, repaint, loading: loadingHtml };
  }

  /** يفتح inbox العضو الموحَّد «محادثاتي» في الـ Overlay. */
  async function openConversations() {
    await openModalView(await import('./conversations.view.js'), { title: '💬 محادثاتي', extra: {} });
  }

  /** يفتح مركز الإشعارات في الـ Overlay. */
  async function openNotifications() {
    await openModalView(await import('./notifications.view.js'), { title: '🔔 الإشعارات', extra: {} });
  }

  /** يفتح نموذج «اطلب الآن» في الـ Overlay. */
  async function openNewOrder() {
    await openModalView(await import('./new-order.view.js'), { title: '🆕 اطلب الآن', extra: {} });
  }

  /** يفتح مدير الخدمات في الـ Overlay. */
  async function openServices() {
    await openModalView(await import('./services-edit.view.js'), { title: '🛠 إدارة الخدمات', extra: {} });
  }

  /** يعيد رسم محتوى الشاشة الحالية بـ HTML جاهز (بعد فلترة/تحديث محلي). */
  function repaint(html) { shell.mount(html); }

  /** يفتح View داخل الـ Overlay مع تنظيف دورة حياته عند الإغلاق. */
  async function openModalView(mod, { title, extra }) {
    modalView = mod.create({ ...ctx(), ...extra, close: () => shell.modal.close() });
    shell.modal.open({
      title,
      content: loadingHtml(),
      onClose: () => { try { modalView?.destroy?.(); } catch (_) {} modalView = null; },
    });
    const html = await modalView.mount();
    shell.modal.body.innerHTML = html;
  }

  /** يفتح تفاصيل الطلب في الـ Overlay. */
  async function openOrder(order) {
    await openModalView(await import('./order-detail.view.js'), {
      title: `طلب #${order.orderId || order._id?.slice(0, 6) || ''}`, extra: { order },
    });
  }

  /** يفتح محادثة حيّة (kind: 'order' | 'support' | 'member' أو conv موجودة) في الـ Overlay. */
  async function openChat({ kind = 'support', order = null, peer = null, conv = null } = {}) {
    const title = conv?.name ? `💬 ${conv.name}`
      : kind === 'member' ? `💬 ${peer?.name || 'محادثة'}`
        : kind === 'order' ? `💬 محادثة الطلب #${order?.orderId || order?._id?.slice(0, 6) || ''}`
          : '💬 الدعم';
    await openModalView(await import('./chat.view.js'), { title, extra: { kind, order, peer, conv } });
  }

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

  return { go, openOrder, openChat, openConversations, openNewOrder, openServices, openNotifications, start };
}
