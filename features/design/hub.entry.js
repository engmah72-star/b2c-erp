/**
 * features/design/hub.entry.js
 *
 * Bootstrap للـ Designer Hub — مساحة عمل المصمم.
 * - Auth + load userDoc
 * - Build sidebar
 * - Mount work view
 */

import { auth } from '../../core/firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getUserDoc } from './repository.js';
import { canAccessDesignerHub } from './permissions.js';
import { buildSidebar } from './components/sidebar.js';
import { mountLightbox } from './components/lightbox.js';
import { $ } from './components/utils.js';
import { mountWorkView } from './views/work-view.js';

window.doLogout = () => signOut(auth).then(() => location.href = 'login.html');
window.toggleNav = () => document.querySelector('.sidenav')?.classList.toggle('mob-open');
window.closeNav = () => {
  document.querySelector('.sidenav')?.classList.remove('mob-open');
  document.getElementById('nav-ov')?.classList.remove('show');
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = 'login.html';
    return;
  }
  const userDoc = await getUserDoc(user.uid);
  const role = userDoc?.role || 'admin';

  if (!canAccessDesignerHub(role)) {
    document.getElementById('dh-content').innerHTML =
      '<div class="dh-empty"><div class="dh-empty-ico">🔒</div><div>لا تملك صلاحية الوصول إلى مساحة التصميم</div></div>';
    await buildSidebar({ userDoc, activePage: 'designer-hub.html' });
    return;
  }

  await buildSidebar({ userDoc, activePage: 'designer-hub.html' });
  mountLightbox();

  mountWorkView({
    container: $('dh-content'),
    user,
    userDoc,
  });
});
