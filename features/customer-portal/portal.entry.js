/**
 * ENTRY — إقلاع البوابة: App Shell + Router + بوابة المصادقة.
 * يراقب الدخول → يحمّل سجلّ العميل → يعرض الرئيسية، أو شاشة الدخول. (STANDARDS §3, §6)
 */
import { createAppShell } from './layout/app-shell.js';
import { createRouter } from './views/router.js';
import { services } from './services/index.js';
import { store } from './state/store.js';

// Feature flag (E1 · reversible): لوحة الاحتياجات (Business Network MVP).
// إيقاف فوري بلا نشر: ?network=0 في الرابط. القيمة الافتراضية مفعّلة.
const NETWORK_ENABLED = new URLSearchParams(location.search).get('network') !== '0';

const TABS = [
  { key: 'home',    icon: '🏠', label: 'الرئيسية' },
  { key: 'orders',  icon: '🧾', label: 'طلباتي' },
  { key: 'needs',   icon: '🤝', label: 'فرص' },
  { key: 'designs', icon: '🎨', label: 'التصاميم' },
  { key: 'portfolio', icon: '📁', label: 'أعمالي' },
  { key: 'profile', icon: '💼', label: 'بروفايلي' },
].filter((t) => t.key !== 'needs' || NETWORK_ENABLED);

const shell = createAppShell({
  root: document.getElementById('cp-app'),
  brand: { icon: '🎨', title: 'بوابة العميل', sub: 'Business2Card' },
  tabs: TABS,
  actions: [
    { key: 'alerts', icon: '🔔', label: 'الإشعارات' },
    { key: 'support', icon: '💬', label: 'الدعم' },
  ],
  onNavigate: (key) => router.go(key),
  onAction: (key) => {
    if (key === 'support') router.openChat({ kind: 'support' });
    else if (key === 'alerts') router.openNotifications();
  },
});

const router = createRouter({ shell, store, services });

// عدّاد الإشعارات غير المقروءة على جرس الهيدر (تحديث حيّ · DOM خفيف).
let notifUnsub = null;
function watchUnread(uid) {
  if (notifUnsub) { try { notifUnsub(); } catch (_) {} notifUnsub = null; }
  if (!uid) return;
  services.notifications.subscribeNotifications(uid, (list) => {
    const n = list.filter((x) => !x.read).length;
    const btn = document.querySelector('[data-action="alerts"]');
    if (btn) btn.innerHTML = n > 0 ? `🔔<span class="cp-dot">${n > 9 ? '9+' : n}</span>` : '🔔';
  }).then((u) => { notifUnsub = u; }).catch(() => {});
}

// بوابة المصادقة: تتبّع الحالة وتوجيه أولي.
let booted = false;
(async () => {
  try {
    await services.auth.watchAuth(async (user) => {
      if (user) {
        store.set({ user });
        // هوية العضو لنفس الأصل — تتيح زر «أحِل واكسب» على الكروت العامة (Referrals).
        try { localStorage.setItem('cpMemberUid', user.uid); } catch (_) {}
        try { store.set({ client: await services.profile.loadClient(user.uid) }); } catch (_) {}
        try { store.set({ entitlement: await services.profile.loadSubscription(user.uid) }); } catch (_) { store.set({ entitlement: { plan: 'free', featured: false } }); }
        watchUnread(user.uid);
        if (!booted || store.get('activeTab') === 'login') { booted = true; router.go('home'); }
      } else {
        store.set({ user: null, client: null });
        try { localStorage.removeItem('cpMemberUid'); } catch (_) {}
        watchUnread(null);
        booted = true; router.go('login');
      }
    });
  } catch (_) {
    // فشل تحميل طبقة المصادقة (شبكة) → أظهر شاشة الدخول بدل صفحة فارغة.
    router.go('login');
  }
})();
