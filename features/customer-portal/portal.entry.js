/**
 * ENTRY — إقلاع البوابة: App Shell + Router + بوابة المصادقة.
 * يراقب الدخول → يحمّل سجلّ العميل → يعرض الرئيسية، أو شاشة الدخول. (STANDARDS §3, §6)
 */
import { createAppShell } from './layout/app-shell.js';
import { createRouter } from './views/router.js';
import { services } from './services/index.js';
import { store } from './state/store.js';

const TABS = [
  { key: 'home',    icon: '🏠', label: 'الرئيسية' },
  { key: 'orders',  icon: '🧾', label: 'طلباتي' },
  { key: 'designs', icon: '🎨', label: 'التصاميم' },
  { key: 'profile', icon: '💼', label: 'بروفايلي' },
];

const shell = createAppShell({
  root: document.getElementById('cp-app'),
  brand: { icon: '🎨', title: 'بوابة العميل', sub: 'Business2Card' },
  tabs: TABS,
  actions: [{ key: 'support', icon: '💬', label: 'الدعم' }],
  onNavigate: (key) => router.go(key),
  onAction: (key) => { if (key === 'support') router.openChat({ kind: 'support' }); },
});

const router = createRouter({ shell, store, services });

// بوابة المصادقة: تتبّع الحالة وتوجيه أولي.
let booted = false;
(async () => {
  try {
    await services.auth.watchAuth(async (user) => {
      if (user) {
        store.set({ user });
        try { store.set({ client: await services.profile.loadClient(user.uid) }); } catch (_) {}
        if (!booted || store.get('activeTab') === 'login') { booted = true; router.go('home'); }
      } else {
        store.set({ user: null, client: null });
        booted = true; router.go('login');
      }
    });
  } catch (_) {
    // فشل تحميل طبقة المصادقة (شبكة) → أظهر شاشة الدخول بدل صفحة فارغة.
    router.go('login');
  }
})();
