/**
 * features/gallery/gallery.entry.js
 *
 * Bootstrap لصفحة المعرض (gallery.html).
 * صفحة مزدوجة: قراءة عامة (زوار + عملاء) + أدوات إدارة للموظف المصرّح.
 *  - لا redirect إجباري على عدم تسجيل الدخول (القراءة عامة).
 *  - عند وجود مستخدم: نحمّل userDoc لتفعيل صلاحيات الرفع/الإدارة.
 *
 * خلف feature flag (RULE E1): يُطفأ فوراً بـ ?feat.gallery=0 → يعود redirect.
 */

import { auth, db } from '../../core/firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { isFeatureEnabled } from '../../core/feature-flags.js';
import { mountGalleryView } from './views/grid-view.js';

window.doLogout = () => signOut(auth).then(() => { location.href = 'login.html'; });
window.toggleNav = () => document.querySelector('.sidenav')?.classList.toggle('mob-open');
window.closeNav = () => {
  document.querySelector('.sidenav')?.classList.remove('mob-open');
  document.getElementById('nav-ov')?.classList.remove('show');
};

// Kill switch (E1): feat.gallery=0 يعيد التحويل للسلوك القديم.
if (!isFeatureEnabled('gallery', true)) {
  location.replace('designer-hub.html');
}

const container = document.getElementById('g-content');
let mounted = false;
let off = null;

function mount(user, userDoc) {
  if (mounted) return;
  mounted = true;
  // ملاحظة: بناء السايد بار يتولّاه core/sidebar-mount.js (المركزي) + app-sidebar (v2)
  // — مُحمَّلان في gallery.html. هنا نركّز على محتوى المعرض فقط.
  off = mountGalleryView({ container, user: user || null, userDoc: userDoc || null });
}

onAuthStateChanged(auth, async (user) => {
  if (mounted) return;
  if (!user) { mount(null, null); return; }
  let userDoc = null;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    userDoc = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (_) { /* قراءة المستخدم اختيارية — نكمل كزائر */ }
  mount(user, userDoc);
});

window.addEventListener('beforeunload', () => { try { off && off(); } catch (_) {} });
