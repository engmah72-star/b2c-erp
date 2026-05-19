// ════════════════════════════════════════════════════════════════════
// Business2Card ERP — Sidebar Renderer (Single Source of Truth)
// ════════════════════════════════════════════════════════════════════
//
// المنطق المركزي لـ:
//   - buildSidebar  → بناء الـ navigation links
//   - guardPage     → التحقق من صلاحية الدخول للصفحة (redirect لو لا)
//   - initSidebar   → guard + build معاً
//
// يقرأ القائمة من window.SIDEBAR_PAGES (sidebar-config.js).
// يكشف API على window.B2CSidebar = { init, build, guard }.
//
// ── Usage في صفحة جديدة ──
//   <head>
//     <script src="sidebar-config.js"></script>
//     <script src="sidebar.js"></script>
//   </head>
//   <script>
//     B2CSidebar.init(userData, 'current-page.html');
//   </script>
//
// ── Migration من النمط الـ inline القديم ──
//   احذف:
//     - const ROLE_HOME_MAP / DASH_LABELS_MAP / GROUP_LABELS_SB
//     - function buildSidebar / guardPage / initSidebar
//   استبدل النداء:
//     initSidebar(userData, page)  →  B2CSidebar.init(userData, page)
// ════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  const DASH_LABELS = {
    admin:             'لوحة التحكم',
    operation_manager: 'لوحة التحكم',
    customer_service:  'داشبوردي',
    graphic_designer:  'داشبوردي',
    design_operator:   'داشبوردي',
    production_agent:  'داشبوردي',
    shipping_officer:  'داشبوردي',
    wallet_manager:    'داشبوردي',
  };

  function curPage(explicit) {
    return (explicit || location.pathname.split('/').pop() || '').replace(/\?.*/, '');
  }

  function isAdmin(role) {
    return role === 'admin' || role === 'operation_manager';
  }

  // هل المستخدم مسموح له يشوف الصفحة في الـ sidebar؟
  function isAllowed(cfg, userData) {
    const role = userData.role || 'customer_service';
    if (cfg.public) return true;
    if (isAdmin(role)) return !cfg.guestOnly;
    if (cfg.adminOnly) return false;
    const perms = userData.permissions || {};
    const pages = perms.pages || [];
    const hasPagePerm = pages.includes('*') || pages.includes(cfg.perm || '');
    const hasViewClients = cfg.perm === 'clients' && perms.canViewClients === true;
    return hasPagePerm || hasViewClients;
  }

  function build(userData, currentPage) {
    if (!userData) return;
    const navEl = document.getElementById('nav-links');
    if (!navEl) return;

    const SIDEBAR_PAGES = window.SIDEBAR_PAGES || [];
    const ROLE_HOME    = window.ROLE_HOME     || {};
    const GROUP_LABELS = window.GROUP_LABELS  || {};

    const role     = userData.role || 'customer_service';
    const cur      = curPage(currentPage);
    const dashHome = ROLE_HOME[role] || 'index.html';
    const dashLabel = DASH_LABELS[role] || 'داشبوردي';

    let html = `<a class="nav-link${cur === dashHome ? ' active' : ''}" href="${dashHome}"><span class="nav-ico">⬡</span> ${dashLabel}</a>`;
    let lastGroup = '';

    for (const cfg of SIDEBAR_PAGES) {
      if (cfg.file === 'index.html') continue; // الأدمن يستخدمها كـ dashHome
      if (!isAllowed(cfg, userData)) continue;
      if (cfg.group !== lastGroup) {
        html += `<div class="nav-group">${GROUP_LABELS[cfg.group] || cfg.group}</div>`;
        lastGroup = cfg.group;
      }
      html += `<a class="nav-link${cur === cfg.file ? ' active' : ''}" href="${cfg.file}"><span class="nav-ico">${cfg.ico}</span> ${cfg.label}</a>`;
    }

    navEl.innerHTML = html;
  }

  function guard(userData, currentPage) {
    if (!userData) return true;
    const role = userData.role || 'customer_service';
    if (isAdmin(role)) return true;

    const cur = curPage(currentPage);
    const SIDEBAR_PAGES = window.SIDEBAR_PAGES || [];
    const ROLE_HOME    = window.ROLE_HOME     || {};
    const cfg = SIDEBAR_PAGES.find(p => p.file === cur);
    if (!cfg) return true; // صفحة مش في الـ sidebar (zebra/util) — مفيش guard هنا
    if (cfg.public) return true;

    if (!isAllowed(cfg, userData)) {
      location.href = ROLE_HOME[role] || 'login.html';
      return false;
    }
    return true;
  }

  function init(userData, currentPage) {
    if (!guard(userData, currentPage)) return false;
    build(userData, currentPage);
    return true;
  }

  window.B2CSidebar = { init, build, guard };
})();
