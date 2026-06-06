// ════════════════════════════════════════════════════════════════════
// Business2Card ERP — Sidebar Configuration (Single Source of Truth)
// ════════════════════════════════════════════════════════════════════
//
// كل صفحات الـ sidebar + الـ role landing pages في مكان واحد.
// تـ load كـ plain script قبل أي module — يحط القيم على window
// عشان الـ module scripts تقدر تستخدمها بدون import overhead.
//
// لو عايز تضيف صفحة جديدة في الـ sidebar → عدّل الـ list هنا فقط.
//
// Schema:
//   { file, label, ico, group, perm, adminOnly?, public? }
//   - file       اسم الـ HTML
//   - label      الاسم الظاهر في الـ sidebar
//   - ico        الـ emoji
//   - group      'main' | 'orders' | 'admin'
//   - perm       اسم الـ permission (عادةً مساوٍ لـ file بدون .html)
//   - adminOnly  true → admin/operation_manager فقط
//   - public     true → كل الأدوار تشوفها

// ── Embed Mode Detection (Runtime Shell Phase 5) ──
// لو الصفحة محمَّلة كـ iframe في runtime shell (?embed=1)، علّم الـ HTML
// element مبكراً (sync في الـ head) عشان shared.css يخفي الـ chrome
// المكرّر (topbar/sidenav/mob-nav) قبل أي paint = no flash.
//
// BUGFIX: نشترط أن الصفحة فعلاً داخل iframe (window.self !== window.top) — مش
// مجرد وجود ?embed=1 في الـ URL. غير كده، فتح الصفحة standalone برابط فيه
// embed=1 (فتح في تاب جديد / بوكمارك / نسخ URL الـ iframe) كان بيضيف embed-mode
// فيختفي السايد بار بالكامل ويفضل مختفي بعد الـ refresh.
try {
  var _inIframe = window.self !== window.top;
  if (_inIframe && location.search && location.search.indexOf('embed=1') >= 0) {
    document.documentElement.classList.add('embed-mode');
  }
} catch (_) {
  // الوصول لـ window.top قد يرمي في iframe عابر للأصل (cross-origin)؛ شِل
  // التطبيق same-origin فلن يحدث. fail-safe: لا نضيف embed-mode (السايد بار يظهر).
}

// ── Stale Takeover Cleanup (defensive — runs once only) ──
// لو OLD sidebar-takeover.js cached وبيشتغل، نشيل أي .sb-panel-host
// + inline display:none من nav-scroll/sb-tools. مرة واحدة لما الـ DOM
// يكون ready — مش interval (الـ interval كان بيمسح embed-mode الـ
// runtime shell بيضيفه فيـ break الـ iframes).
(function cleanupStaleTakeover(){
  try {
    const purge = () => {
      document.body && document.body.classList.remove('sb-takeover');
      // NOTE: ما نمسحش embed-mode — runtime shell بيضيفه بـ ?embed=1
      document.querySelectorAll('.sb-panel-host').forEach(el => el.remove());
      document.querySelectorAll('.nav-scroll, .sb-tools').forEach(el => {
        if (el.style && el.style.display === 'none') el.style.display = '';
      });
      if (window.B2CSidebar) {
        try { delete window.B2CSidebar.openPanel; } catch(_) { window.B2CSidebar.openPanel = null; }
        try { delete window.B2CSidebar.closePanel; } catch(_) { window.B2CSidebar.closePanel = null; }
        try { delete window.B2CSidebar.isOpen; } catch(_) { window.B2CSidebar.isOpen = null; }
      }
      window.B2C_TAKEOVER_ENABLED = false;
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', purge, { once: true });
    } else {
      purge();
    }
  } catch(_) {}
})();

(function() {
  'use strict';

  const SIDEBAR_PAGES = [
    // ─── الرئيسية (main) ───
    { file:'my-requests.html',       label:'طلباتي',           ico:'📋', group:'main',   public:true },
    { file:'my-profile.html',        label:'ملفي',             ico:'👤', group:'main',   public:true },
    { file:'inbox.html',             label:'المحادثات',         ico:'💬', group:'main',   public:true },

    // ─── الأوردرات (orders) ───
    { file:'order-rail.html',        label:'سجل الأوردرات',    ico:'🚂', group:'orders', perm:'order-rail' },
    { file:'clients.html',           label:'العملاء',          ico:'👤', group:'orders', perm:'clients' },
    { file:'design.html',            label:'التصميم',          ico:'✏️', group:'orders', perm:'design' },
    { file:'designer-hub.html',      label:'مساحة التصميم',   ico:'🖥️', group:'orders', perm:'design' },
    { file:'portal-designs.html',    label:'تصميمات البوابة',  ico:'🖼️', group:'orders', perm:'design' },
    { file:'print.html',             label:'الطباعة',          ico:'🖨️', group:'orders', perm:'print' },
    { file:'production.html',        label:'التنفيذ',          ico:'🏭', group:'orders', perm:'production' },
    { file:'supplier-requests.html', label:'طلبات الموردين',   ico:'🏭', group:'orders', perm:'production' },
    { file:'shipping.html',          label:'الشحن',             ico:'🚚', group:'orders', perm:'shipping' },
    { file:'shipping-accounts.html', label:'حسابات الشحن',     ico:'📦', group:'orders', perm:'shipping-accounts' },
    { file:'archive.html',           label:'الأرشيف',          ico:'📁', group:'orders', perm:'archive' },
    { file:'returns.html',           label:'المرتجعات',        ico:'↩️', group:'orders', perm:'returns' },

    // ─── الإدارة (admin) ───
    { file:'accounts.html',          label:'الحسابات',         ico:'💰', group:'admin',  perm:'accounts' },
    { file:'approvals.html',         label:'الاعتمادات',       ico:'🔐', group:'admin',  perm:'approvals' },
    { file:'suppliers.html',         label:'الموردين',         ico:'▣',  group:'admin',  perm:'suppliers' },
    { file:'products.html',          label:'المنتجات',         ico:'◈',  group:'admin',  perm:'products' },
    { file:'reports.html',           label:'التقارير',         ico:'📊', group:'admin',  perm:'reports' },
    { file:'employees.html',         label:'الموظفين',         ico:'👥', group:'admin',  adminOnly:true },
    { file:'role-viewer.html',       label:'معاينة الأدوار',   ico:'🔍', group:'admin',  adminOnly:true },
    { file:'report-bug.html',        label:'تقارير الأخطاء',   ico:'🐛', group:'admin',  adminOnly:true },
    // settings = perm عادي (لا adminOnly): يراها admin + operation_manager (pages:['*'])
    // كصفحة تشغيلية للقوائم الرئيسية، بينما تبقى محجوبة عن باقي الأدوار (لا '*'/'settings').
    { file:'settings.html',          label:'الإعدادات',        ico:'⚙️', group:'admin',  perm:'settings' },
  ];

  // أين تذهب كل دور عند الـ login (الـ dashboard المخصص)
  const ROLE_HOME = {
    admin:             'accounts.html',
    operation_manager: 'ops-dashboard.html',
    customer_service:  'cs-dashboard.html',
    graphic_designer:  'designer-dashboard.html',
    design_operator:   'designer-dashboard.html',
    production_agent:  'production-dashboard.html',
    shipping_officer:  'shipping-dashboard.html',
    wallet_manager:    'accounts.html',
  };

  // labels للأقسام في الـ sidebar
  const GROUP_LABELS = {
    main:   'الرئيسية',
    orders: 'الأوردرات',
    admin:  'الإدارة',
  };

  // ── Flag-gated entries (RULE E1.9 — enabled by default, kill switch retained) ──
  // Both entries show unless explicitly disabled via feat.<name>=0
  // (URL ?feat.<name>=0 or localStorage feat.<name>="0"). Instant kill switch.
  try {
    const _qs = new URLSearchParams(location.search);
    // Employee Control Center — admin sidebar.
    const _ec = _qs.get('feat.employeeControl') || localStorage.getItem('feat.employeeControl');
    if (_ec !== '0') {
      SIDEBAR_PAGES.push({ file: 'employee-control.html', label: 'لوحة الموظفين', ico: '🎛️', group: 'admin', adminOnly: true });
    }
    // My Home (صفحتي): personal landing — visible to every role.
    const _mh = _qs.get('feat.myHome') || localStorage.getItem('feat.myHome');
    if (_mh !== '0') {
      SIDEBAR_PAGES.unshift({ file: 'my-home.html', label: 'صفحتي', ico: '🏠', group: 'main', public: true });
    }
  } catch (_) { /* SSR/test envs */ }

  // Expose on window so module scripts can read without `import`.
  // Module pages: `const SIDEBAR_PAGES = window.SIDEBAR_PAGES;` (one-liner).
  window.SIDEBAR_PAGES = SIDEBAR_PAGES;
  window.ROLE_HOME     = ROLE_HOME;
  window.GROUP_LABELS  = GROUP_LABELS;

  // ── Auto-load Shell-Aware Navigation Helper ──
  // Exposes window.navigatePage(url) — routes via B2CShell.openInWorkspace
  // when inside the Runtime Shell iframe، else falls back to location.href.
  // Used by command-palette، notifications، dashboards (Phase 2+).
  if (!document.getElementById('shell-nav-loader')) {
    const s = document.createElement('script');
    s.id = 'shell-nav-loader';
    s.src = 'core/shell-navigate.js?v=1';
    s.defer = false;  // sync — لازم يكون window.navigatePage جاهز قبل أي onclick
    document.head.appendChild(s);
  }

  // ── Auto-load Command Palette (Ctrl+K / Cmd+K) ──
  // ينشر التنقّل السريع على كل صفحة تحمّل sidebar-config.js.
  // Self-contained module — يحقن زرّ بحث ظاهر في الـ topbar + يفتح بـ Ctrl+K.
  if (!document.getElementById('cp-loader')) {
    const s = document.createElement('script');
    s.id = 'cp-loader';
    s.src = 'command-palette.js?v=3';
    s.defer = true;
    document.head.appendChild(s);
  }

  // ── Auto-load UX Globals (Esc / Enter / backdrop close / auto-focus) ──
  // Self-contained IIFE — يضمن أن كل صفحة admin تحصل على نفس الـ keyboard
  // ergonomics بدون الاعتماد على استيراد shared.js كـ module.
  if (!document.getElementById('ux-globals-loader')) {
    const s = document.createElement('script');
    s.id = 'ux-globals-loader';
    s.src = 'ux-globals.js?v=1';
    s.defer = true;
    document.head.appendChild(s);
  }

  // ── Auto-load CENTRAL SIDEBAR mount (single source on every page) ──
  // core/sidebar-mount.js يبني الـ sidebar الكامل (brand + أقسام مجمّعة +
  // footer) من window.SIDEBAR_PAGES عبر window.B2CSidebar.build. تحميله من
  // هنا يضمن sidebar موحَّد على كل صفحة بدون باني محلي مكرّر. (module)
  if (!document.getElementById('sidebar-mount-loader')) {
    const s = document.createElement('script');
    s.id = 'sidebar-mount-loader';
    s.type = 'module';
    s.src = 'core/sidebar-mount.js?v=3';
    document.head.appendChild(s);
  }
})();
