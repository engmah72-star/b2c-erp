/**
 * features/design/hub.entry.js
 *
 * Bootstrap للـ Designer Hub.
 * - Auth + load userDoc
 * - Build sidebar
 * - Initialize tab router
 * - Mount/unmount views حسب الـ tab النشط
 */

import { auth, db } from '../../core/firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getUserDoc } from './repository.js';
import {
  getDesignerHubDefaultTab, getVisibleTabs, isAdmin, isCSRole, isDesignerRole,
} from './permissions.js';
import { buildSidebar } from './components/sidebar.js';
import { mountLightbox } from './components/lightbox.js';
import { $ } from './components/utils.js';

import { mountGalleryView, unmountGalleryView } from './views/gallery-view.js';
import { mountLibraryView, unmountLibraryView } from './views/library-view.js';
import { mountWorkView, unmountWorkView, openWorkItem } from './views/work-view.js';

const state = {
  user: null,
  userDoc: null,
  role: null,
  currentTab: null,
};

const TAB_LABELS = {
  work: '🖥️ عملي',
  library: '🎨 مكتبة التصاميم',
  gallery: '🖼️ المعرض',
};

window.doLogout = () => signOut(auth).then(() => location.href = 'login.html');

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = 'login.html';
    return;
  }
  state.user = user;
  state.userDoc = await getUserDoc(user.uid);
  state.role = state.userDoc?.role || 'admin';

  await buildSidebar({
    userDoc: state.userDoc,
    activePage: 'designer-hub.html',
  });

  mountLightbox();

  initTabs();
  const urlTab = new URLSearchParams(location.search).get('tab');
  const visibleTabs = getVisibleTabs(state.role);
  const defaultTab = getDesignerHubDefaultTab(state.role);
  const initialTab = visibleTabs.includes(urlTab) ? urlTab : defaultTab;
  switchTab(initialTab);
});

function initTabs() {
  const visibleTabs = getVisibleTabs(state.role);
  const tabBar = $('dh-tabs');
  tabBar.innerHTML = visibleTabs.map(t =>
    `<button class="dh-tab" data-tab="${t}">${TAB_LABELS[t]}</button>`
  ).join('');
  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });
}

function switchTab(tab) {
  if (state.currentTab === tab) return;
  // Unmount previous
  if (state.currentTab === 'work') unmountWorkView();
  else if (state.currentTab === 'library') unmountLibraryView();
  else if (state.currentTab === 'gallery') unmountGalleryView();

  state.currentTab = tab;

  // Update active button
  document.querySelectorAll('.dh-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  // Update URL
  const url = new URL(location.href);
  url.searchParams.set('tab', tab);
  history.replaceState({}, '', url);

  // Mount new
  const container = $('dh-content');
  container.innerHTML = '';

  if (tab === 'work') {
    mountWorkView({
      container,
      user: state.user,
      userDoc: state.userDoc,
    });
  } else if (tab === 'library') {
    mountLibraryView({
      container,
      role: state.role,
      userPerms: state.userDoc?.permissions || {},
      onOpenWorkItem: ({ orderId, itemId }) => {
        switchTab('work');
        // wait next tick for work-view to mount
        setTimeout(() => openWorkItem({ orderId, itemId }), 100);
      },
    });
  } else if (tab === 'gallery') {
    mountGalleryView({ container });
  }
}

// Expose for sidebar/nav toggles
window.toggleNav = () => document.getElementById('nav-aside')?.classList.toggle('open');
window.closeNav = () => document.getElementById('nav-aside')?.classList.remove('open');
