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

// ── Embed Mode Detection (Phase 1) ──
// لو الصفحة محمَّلة كـ iframe في sidebar takeover (?embed=1)، علّم الـ HTML element
// مبكراً (synchronously في الـ head) عشان shared.css يخفي الـ topbar/sidenav/mob-nav
// المكررة قبل أي paint. منع flash of duplicate chrome.
try {
  if (location.search && location.search.indexOf('embed=1') >= 0) {
    document.documentElement.classList.add('embed-mode');
  }
} catch(_) {}

(function() {
  'use strict';

  const SIDEBAR_PAGES = [
    // ─── الرئيسية (main) ───
    { file:'my-requests.html',       label:'طلباتي',           ico:'📋', group:'main',   public:true },
    { file:'my-profile.html',        label:'ملفي',             ico:'👤', group:'main',   public:true },
    { file:'inbox.html',             label:'المحادثات',         ico:'💬', group:'main',   public:true },

    // ─── الأوردرات (orders) ───
    { file:'clients.html',           label:'العملاء',          ico:'👤', group:'orders', perm:'clients' },
    { file:'design.html',            label:'التصميم',          ico:'✏️', group:'orders', perm:'design' },
    { file:'designer-hub.html',      label:'مساحة التصميم',   ico:'🖥️', group:'orders', perm:'design' },
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
    { file:'settings.html',          label:'الإعدادات',        ico:'⚙️', group:'admin',  adminOnly:true },
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

  // Expose on window so module scripts can read without `import`.
  // Module pages: `const SIDEBAR_PAGES = window.SIDEBAR_PAGES;` (one-liner).
  window.SIDEBAR_PAGES = SIDEBAR_PAGES;
  window.ROLE_HOME     = ROLE_HOME;
  window.GROUP_LABELS  = GROUP_LABELS;

  // ── Sidebar Takeover (Phase 1) ──
  // Feature flag مفعّل عالمياً. الـ default الآن = takeover ON لكل nav links،
  // إلا الصفحات في TAKEOVER_SKIP (login/portal/print/...) أو cfg.takeover === false.
  // الـ skip list يطابق smart-sidebar.js:18 (نفس الفلسفة).
  window.B2C_TAKEOVER_ENABLED = true;
  window.B2C_TAKEOVER_SKIP = [
    'login.html', 'client-login.html', 'client-portal.html',
    'waybill.html', 'chat.html', 'order-tracking.html', '',
  ];

  // ── Auto-load Sidebar Takeover (CSS + JS) ──
  // Self-contained — لا تأثير على الصفحات اللي مش معلّمة takeover:true.
  if (!document.getElementById('sb-takeover-css')) {
    const l = document.createElement('link');
    l.id = 'sb-takeover-css';
    l.rel = 'stylesheet';
    l.href = 'sidebar-takeover.css?v=1';
    document.head.appendChild(l);
  }
  if (!document.getElementById('sb-takeover-js')) {
    const s = document.createElement('script');
    s.id = 'sb-takeover-js';
    s.src = 'sidebar-takeover.js?v=1';
    s.defer = true;
    document.head.appendChild(s);
  }

  // ── Auto-load Command Palette (Ctrl+K / Cmd+K) ──
  // ينشر التنقّل السريع على كل صفحة تحمّل sidebar-config.js.
  // Self-contained module — لا تأثير على الـ DOM إلا عند الضغط على Ctrl+K.
  if (!document.getElementById('cp-loader')) {
    const s = document.createElement('script');
    s.id = 'cp-loader';
    s.src = 'command-palette.js?v=1';
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
})();
