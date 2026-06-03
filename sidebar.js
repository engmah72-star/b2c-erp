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
    admin:             'الحسابات',
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

  // Kill switch (reversible — RULE E1): feat.opsAdminPages=1 (URL أو localStorage)
  // يعيد سلوك ما قبل إصلاح مراجعة #1، فيرى operation_manager صفحات adminOnly
  // مرة أخرى. الافتراضي = الإصلاح مفعّل (ops لا يرى صفحات الأدمن الإدارية).
  function legacyOpsAdminPages() {
    try {
      const qs = new URLSearchParams(location.search || '');
      return (qs.get('feat.opsAdminPages') || localStorage.getItem('feat.opsAdminPages')) === '1';
    } catch (_) { return false; }
  }

  // هل المستخدم مسموح له يشوف الصفحة في الـ sidebar؟
  function isAllowed(cfg, userData) {
    const role = userData.role || 'customer_service';
    if (cfg.public) return true;
    // adminOnly = admin فقط (إصلاح مراجعة #1). operation_manager لم يعد يتجاوزها
    // تلقائياً — يتوافق مع canAccessEmployees:false في permissions-matrix.
    // الإعدادات (settings) نُقلت لـ perm عادي في sidebar-config فيراها ops عبر pages:['*'].
    if (cfg.adminOnly) return role === 'admin' || (role === 'operation_manager' && legacyOpsAdminPages());
    if (isAdmin(role)) return !cfg.guestOnly;
    const perms = userData.permissions || {};
    // Fallback للمستخدمين القدام: لو pages مفقودة تماماً (ليست مصفوفة)، استخدم
    // الصفحات الافتراضية للدور من window.ROLE_PAGES (permissions-matrix). مصفوفة
    // فارغة [] تُحترم كقفل مقصود من الأدمن (لا تُستبدل بالافتراضي).
    const pages = Array.isArray(perms.pages)
      ? perms.pages
      : ((typeof window !== 'undefined' && window.ROLE_PAGES && window.ROLE_PAGES[role]) || []);
    const hasPagePerm = pages.includes('*') || pages.includes(cfg.perm || '');
    const hasViewClients = cfg.perm === 'clients' && perms.canViewClients === true;
    return hasPagePerm || hasViewClients;
  }

  function build(userData, currentPage) {
    if (!userData) return;
    // الـ DOM ID ليه 3 أشكال تاريخياً عبر الصفحات:
    //   nav-links (الأحدث/الأكثر شيوعاً) — nav-scroll-dynamic — nav-scroll
    const navEl = document.getElementById('nav-links')
              || document.getElementById('nav-scroll-dynamic')
              || document.getElementById('nav-scroll');
    if (!navEl) return;

    const SIDEBAR_PAGES = window.SIDEBAR_PAGES || [];
    const ROLE_HOME    = window.ROLE_HOME     || {};
    const GROUP_LABELS = window.GROUP_LABELS  || {};

    const role     = userData.role || 'customer_service';
    const cur      = curPage(currentPage);
    const dashHome = ROLE_HOME[role] || 'accounts.html';
    const dashLabel = DASH_LABELS[role] || 'داشبوردي';

    let html = `<a class="nav-link${cur === dashHome ? ' active' : ''}" href="${dashHome}"><span class="nav-ico" aria-hidden="true">⬡</span> ${dashLabel}</a>`;
    let lastGroup = '';

    for (const cfg of SIDEBAR_PAGES) {
      if (cfg.file === dashHome) continue; // الـ dashHome مضاف بالفعل في الأعلى
      if (!isAllowed(cfg, userData)) continue;
      if (cfg.group !== lastGroup) {
        html += `<div class="nav-group">${GROUP_LABELS[cfg.group] || cfg.group}</div>`;
        lastGroup = cfg.group;
      }
      html += `<a class="nav-link${cur === cfg.file ? ' active' : ''}" href="${cfg.file}"><span class="nav-ico" aria-hidden="true">${cfg.ico}</span> ${cfg.label}</a>`;
    }

    navEl.innerHTML = html;
  }

  function guard(userData, currentPage) {
    if (!userData) return true;
    const role = userData.role || 'customer_service';
    // admin يمر دائماً. operation_manager لم يعد يُمنح مرور تلقائي — يخضع لـ
    // isAllowed أدناه حتى تُحترم صفحات adminOnly عند الدخول المباشر بالـ URL
    // (إصلاح مراجعة #1، متوافق مع build). الـ kill switch يُطبَّق داخل isAllowed.
    if (role === 'admin') return true;

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

  // ── Central mobile nav toggle (Single Source of Truth) ──────────────
  // النمط الموحّد للموبايل: .sidenav.mob-open + .nav-overlay.show.
  // كان متكرراً inline في ~25 صفحة، وناقصاً في صفحات أخرى (فالزر ☰ ما كانش
  // بيفتح). هنا نعرّفه مركزياً ومرناً: ينشئ الـ overlay لو غير موجود، فيشتغل
  // على أي صفحة حتى بدون <div id="nav-ov">. الصفحات اللي لسه عندها نسخة inline
  // تكتب window.toggleNav بعد تحميل sidebar.js (بترتيب الـ load) فتفوز — صفر
  // regression. حذف النسخ المحلية يتم تدريجياً لاحقاً (RULE G9).
  function ensureNavOverlay() {
    let ov = document.getElementById('nav-ov') || document.querySelector('.nav-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'nav-overlay';
      ov.id = 'nav-ov';
      ov.addEventListener('click', closeNav);
      document.body.appendChild(ov);
    }
    return ov;
  }
  function toggleNav() {
    const sn = document.querySelector('.sidenav');
    if (!sn) return;
    const open = sn.classList.toggle('mob-open');
    ensureNavOverlay().classList.toggle('show', open);
  }
  function closeNav() {
    const sn = document.querySelector('.sidenav');
    if (sn) sn.classList.remove('mob-open');
    const ov = document.getElementById('nav-ov') || document.querySelector('.nav-overlay');
    if (ov) ov.classList.remove('show');
  }
  window.toggleNav = toggleNav;
  window.closeNav  = closeNav;

  // ── Legacy globals (backward compat للصفحات اللي اتهاجرت بحذف الـ inline) ──
  // الصفحات اللي لسه عندها `function buildSidebar` inline → الـ function declaration
  // عندها أولوية (hoisting)، فالـ window assignments دي ما بتعمل clash.
  // بعد حذف الـ inline من أي صفحة، النداءات (initSidebar/buildSidebar/guardPage)
  // تتحوّل تلقائياً على الـ shims دي.
  if (typeof window.initSidebar  === 'undefined') window.initSidebar  = init;
  if (typeof window.buildSidebar === 'undefined') window.buildSidebar = build;
  if (typeof window.guardPage    === 'undefined') window.guardPage    = guard;
})();
