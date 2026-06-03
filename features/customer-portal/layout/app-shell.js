/**
 * LAYOUT · AppShell — الإطار الموحّد الذي تعمل بداخله كل الشاشات.
 * يركّب: Header + Main(container) + Nav + ModalManager + NotificationManager.
 * لا بيانات · لا منطق أعمال · لا معرفة بأي صفحة. (STANDARDS §4)
 *
 * createAppShell({ root, brand, tabs, actions, onNavigate, onAction }) → shell API:
 *   shell.mount(content)        // يحقن الـ View النشط في حاوية المحتوى
 *   shell.setActiveTab(key)
 *   shell.setHeaderTitle(text) / setHeaderSub(text)
 *   shell.modal                 // ModalManager
 *   shell.notify(msg, type?)    // NotificationManager
 */
import { Header } from './header.js';
import { Nav, setActiveNav } from './nav.js';
import { createModalManager } from './modal-manager.js';
import { createNotificationManager } from './notification-manager.js';
import { el, qs, delegate } from '../utils/dom.js';

export function createAppShell({
  root, brand = {}, tabs = [], actions = [],
  onNavigate = () => {}, onAction = () => {},
} = {}) {
  if (!root) throw new Error('AppShell: root مطلوب');

  // ── التركيب الهيكلي ──
  root.classList.add('cp-shell');
  root.innerHTML =
    Header({ brand, actions }) +
    '<main class="cp-main"><div class="cp-main__view" data-role="cp-view"></div></main>' +
    Nav({ tabs, activeKey: tabs[0]?.key });

  // الـ Overlay و الـ Toasts ثابتة على مستوى الـ viewport → تُركّب على body
  const modal = createModalManager(document.body);
  const notifier = createNotificationManager(document.body);

  let viewHost = qs('[data-role="cp-view"]', root);
  let activeKey = tabs[0]?.key || '';

  // ── التفاعل عبر delegation (لا onclick مضمّن · STANDARDS §6) ──
  delegate(root, 'click', '.cp-nav__item', (btn) => {
    const key = btn.dataset.navKey;
    if (!key || key === activeKey) return;
    activeKey = key;
    setActiveNav(root, key);
    onNavigate(key);
  });
  delegate(root, 'click', '.cp-header__action', (btn) => onAction(btn.dataset.action));

  // ── واجهة الـ Shell ──
  function mount(content) {
    const view = el('div', { class: 'cp-main__view', dataset: { role: 'cp-view' } });
    if (content instanceof Node) view.appendChild(content);
    else view.innerHTML = content || '';
    viewHost.replaceWith(view);
    viewHost = view;
    window.scrollTo(0, 0);
  }
  function setActiveTab(key) { activeKey = key; setActiveNav(root, key); }
  function setHeaderTitle(text) { const n = qs('[data-role="header-title"]', root); if (n) n.textContent = text; }
  function setHeaderSub(text) { const n = qs('[data-role="header-sub"]', root); if (n) n.textContent = text; }

  return {
    mount, setActiveTab, setHeaderTitle, setHeaderSub,
    modal,
    notify: (msg, type, duration) => notifier.notify(msg, type, duration),
  };
}
