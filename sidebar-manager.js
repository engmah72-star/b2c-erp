// ══════════════════════════════════════════════════════
// Business2Card ERP — Sidebar Manager v2
// ══════════════════════════════════════════════════════

const SIDEBAR_PAGES = [
  // { file, label, ico, group, perm, adminOnly }
  { file:'index.html',             label:'لوحة التحكم',   ico:'⬡',  group:'main',   adminOnly:true },
  { file:'clients.html',           label:'العملاء',       ico:'👤', group:'orders', perm:'clients' },
  { file:'design.html',            label:'التصميم',       ico:'✏️', group:'orders', perm:'design' },
  { file:'print.html',             label:'الطباعة',       ico:'🖨️', group:'orders', perm:'print' },
  { file:'production.html',        label:'التنفيذ',       ico:'🏭', group:'orders', perm:'production' },
  { file:'shipping.html',          label:'الشحن',         ico:'🚚', group:'orders', perm:'shipping' },
  { file:'shipping-accounts.html', label:'حسابات الشحن', ico:'📦', group:'orders', perm:'shipping-accounts' },
  { file:'archive.html',           label:'الأرشيف',       ico:'📁', group:'orders', perm:'archive' },
  { file:'accounts.html',          label:'الحسابات',      ico:'💰', group:'admin',  perm:'accounts' },
  { file:'suppliers.html',         label:'الموردين',      ico:'▣',  group:'admin',  perm:'suppliers' },
  { file:'products.html',          label:'المنتجات',      ico:'◈',  group:'admin',  perm:'products' },
  { file:'reports.html',           label:'التقارير',      ico:'📊', group:'admin',  perm:'reports' },
  { file:'employees.html',         label:'الموظفين',      ico:'👥', group:'admin',  adminOnly:true },
  { file:'settings.html',          label:'الإعدادات',     ico:'⚙️', group:'admin',  adminOnly:true },
];

const GROUP_LABELS = { main:'الرئيسية', orders:'الأوردرات', admin:'الإدارة' };

export const ROLE_HOME = {
  admin:'index.html', operation_manager:'index.html',
  customer_service:'cs-dashboard.html',
  graphic_designer:'designer-dashboard.html',
  design_operator:'designer-dashboard.html',
  production_agent:'production-dashboard.html',
  shipping_officer:'shipping-dashboard.html',
  wallet_manager:'accounts.html',
};

const DASH_LABELS = {
  admin:'لوحة التحكم', operation_manager:'لوحة التحكم',
  customer_service:'داشبوردي', graphic_designer:'داشبوردي',
  design_operator:'داشبوردي', production_agent:'داشبوردي',
  shipping_officer:'داشبوردي', wallet_manager:'داشبوردي',
};

export function initSidebar(userData, currentPage) {
  if (!userData) return true;
  const role    = userData.role || 'customer_service';
  const perms   = userData.permissions || {};
  const pages   = perms.pages || [];
  const isAdmin = ['admin','operation_manager'].includes(role);
  const current = (currentPage || window.location.pathname.split('/').pop() || '').replace(/\?.*$/, '');

  // ── Guard ──
  if (!isAdmin && current) {
    const cfg = SIDEBAR_PAGES.find(p => p.file === current);
    if (cfg) {
      if (cfg.adminOnly) { _redirect(role); return false; }
      const perm = cfg.perm || current.replace('.html','');
      if (!pages.includes('*') && !pages.includes(perm)) { _redirect(role); return false; }
    }
  }

  // ── Build Sidebar ──
  const navEl = document.getElementById('nav-links');
  if (!navEl) return true;

  const dashHome  = ROLE_HOME[role] || 'index.html';
  const dashLabel = DASH_LABELS[role] || 'داشبوردي';
  let html = '';
  let lastGroup = '';

  // داشبورد الموظف
  html += _link(dashHome, '⬡', dashLabel, current === dashHome, null);

  // باقي الصفحات
  for (const cfg of SIDEBAR_PAGES) {
    if (cfg.file === 'index.html') continue; // اتضاف فوق للأدمن بس
    
    const allowed = isAdmin
      || (cfg.adminOnly ? false : pages.includes('*') || pages.includes(cfg.perm||''));
    
    if (!allowed) continue;

    if (cfg.group !== lastGroup) {
      html += `<div class="nav-group">${GROUP_LABELS[cfg.group]||cfg.group}</div>`;
      lastGroup = cfg.group;
    }
    html += _link(cfg.file, cfg.ico, cfg.label, current === cfg.file, cfg.perm);
  }

  navEl.innerHTML = html;

  // ── إخفاء الأسعار لو مش مسموح ──
  if (!isAdmin && !perms.canSeePrices) {
    document.querySelectorAll('[data-price],[data-sensitive="price"]').forEach(el => {
      el.style.display = 'none';
    });
  }

  return true;
}

function _link(file, ico, label, active, perm) {
  const dp = perm ? ` data-page="${perm}"` : '';
  return `<a class="nav-link${active?' active':''}" href="${file}"${dp}>
    <span class="nav-ico">${ico}</span> ${label}
  </a>`;
}

function _redirect(role) {
  window.location.href = ROLE_HOME[role] || 'login.html';
}
