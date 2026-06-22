// core/shortcuts-auto-init.js
// Auto-initializes contextual shortcuts on every page loaded via sidebar-config.
// Detects page name from URL, loads navigation-only shortcuts by default.
// Pages with manual initPageShortcuts() calls upgrade to include action shortcuts.

import { initPageShortcuts } from './page-shortcuts.js';

function getCurrentRole() {
  return (window.AppState && window.AppState.currentRole)
      || window.currentRole
      || window.myRole
      || window.userRole
      || '';
}

function getPageName() {
  const path = location.pathname;
  const file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
  return file.replace('.html', '');
}

function tryInit() {
  if (document.documentElement.classList.contains('embed-mode')) return;
  const pageName = getPageName();
  const role = getCurrentRole();
  initPageShortcuts(pageName, { role });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(tryInit, 300), { once: true });
} else {
  setTimeout(tryInit, 300);
}
