/**
 * ENTRY — إقلاع الـ App Shell فقط.
 * بدون صفحات فعلية · بدون بيانات · بدون business logic.
 * يثبت أن الإطار (Header · Nav · Main · Modal · Notification) يعمل،
 * والمحتوى مجرد Placeholder تُستبدله الـ Views لاحقاً. (STANDARDS §3)
 */
import { createAppShell } from './layout/app-shell.js';
import { escapeHtml } from './utils/dom.js';

// تعريف التبويبات الأساسية (هيكل تنقّل فقط — لا بيانات)
const TABS = [
  { key: 'home',      icon: '🏠', label: 'الرئيسية' },
  { key: 'designs',   icon: '🎨', label: 'التصاميم' },
  { key: 'profile',   icon: '💼', label: 'بروفايلي' },
  { key: 'portfolio', icon: '📁', label: 'أعمالي' },
];

function placeholderView(tab) {
  return `
    <section class="cp-placeholder" aria-label="حاوية المحتوى">
      <span class="cp-placeholder__icon" aria-hidden="true">${escapeHtml(tab.icon)}</span>
      <div class="cp-placeholder__title">${escapeHtml(tab.label)}</div>
      حاوية المحتوى الرئيسية — تُحقن صفحة «${escapeHtml(tab.label)}» هنا لاحقاً.
    </section>`;
}

function showTab(key) {
  const tab = TABS.find((t) => t.key === key) || TABS[0];
  shell.setHeaderTitle(tab.label);
  shell.mount(placeholderView(tab));
}

const shell = createAppShell({
  root: document.getElementById('cp-app'),
  brand: { icon: '🎨', title: 'الرئيسية', sub: 'App Shell' },
  tabs: TABS,
  actions: [{ key: 'support', icon: '💬', label: 'الدعم' }],
  onNavigate: (key) => showTab(key),
  onAction: (key) => {
    // عرض قدرة ModalManager (محتوى محايد، لا منطق)
    if (key === 'support') {
      shell.modal.open({
        title: '💬 الدعم',
        content: `<section class="cp-placeholder" aria-label="نافذة">
          <span class="cp-placeholder__icon" aria-hidden="true">💬</span>
          هذه طبقة الـ Overlay الموحّدة — يديرها ModalManager.<br>
          تُحقن المحادثة/التفاصيل هنا لاحقاً.</section>`,
      });
    }
  },
});

// الإقلاع: عرض التبويب الأول + إثبات NotificationManager
showTab('home');
shell.notify('✅ App Shell جاهز — الإطار يعمل', 'ok');
