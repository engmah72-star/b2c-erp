/**
 * features/design/components/sidebar.js
 *
 * Sidebar موحَّد للـ Designer Hub.
 * يحل التكرار الثلاثي بين الصفحات القديمة (3 نسخ من SBPAGES في 3 ملفات HTML).
 *
 * يعتمد على window.SIDEBAR_PAGES + window.ROLE_HOME من sidebar-config.js.
 *
 * الاستخدام:
 *   import { buildSidebar } from './components/sidebar.js';
 *   await buildSidebar({ uid, userDoc, activePage: 'designer-hub.html' });
 */

import { $ } from './utils.js';

const ADMIN_ROLES = new Set(['admin', 'operation_manager']);

export async function buildSidebar({ userDoc, activePage = 'designer-hub.html' }) {
  const SBPAGES = window.SIDEBAR_PAGES || [];
  const ROLE_HOME = window.ROLE_HOME || {};
  const GROUP_LABELS = window.GROUP_LABELS || { main: 'الرئيسية', orders: 'الأوردرات', admin: 'الإدارة' };

  const role = userDoc?.role || 'admin';
  const isAdmin = ADMIN_ROLES.has(role);
  const userPerms = userDoc?.permissions || {};
  const userName = userDoc?.name || userDoc?.email || '';
  const userPages = userPerms.pages || [];

  const nameEl = $('nav-name');
  const avEl = $('nav-av');
  if (nameEl) nameEl.textContent = userName || '—';
  if (avEl) avEl.textContent = (userName || '?')[0].toUpperCase();

  const dash = ROLE_HOME[role] || 'index.html';
  let html = '';

  // Dashboard link
  html += `<a class="nav-link" href="${dash}"><span class="nav-ico">⬡</span> ${isAdmin ? 'لوحة التحكم' : 'داشبوردي'}</a>`;

  // Group pages
  const groups = { main: [], orders: [], admin: [] };
  for (const p of SBPAGES) {
    if (p.file === dash) continue;
    const ok = isAdmin
      || p.public === true
      || userPages.includes('*')
      || userPages.includes(p.perm || p.file.replace('.html', ''));
    if (!ok && !p.public) continue;
    if (p.adminOnly && !isAdmin) continue;
    const grp = p.group || 'main';
    if (groups[grp]) groups[grp].push(p);
  }

  for (const grpKey of ['main', 'orders', 'admin']) {
    const items = groups[grpKey];
    if (!items.length) continue;
    html += `<div class="nav-group">${GROUP_LABELS[grpKey] || ''}</div>`;
    for (const p of items) {
      const active = p.file === activePage;
      html += `<a class="nav-link${active ? ' active' : ''}" href="${p.file}"><span class="nav-ico">${p.ico}</span> ${p.label}</a>`;
    }
  }

  const scroll = $('nav-scroll');
  if (scroll) scroll.innerHTML = html;
}
