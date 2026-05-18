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

(function() {
  'use strict';

  const SIDEBAR_PAGES = [
    // ─── الرئيسية (main) ───
    { file:'index.html',             label:'لوحة التحكم',     ico:'⬡',  group:'main',   adminOnly:true },
    { file:'my-requests.html',       label:'طلباتي',           ico:'📋', group:'main',   public:true },
    { file:'my-profile.html',        label:'ملفي',             ico:'👤', group:'main',   public:true },

    // ─── الأوردرات (orders) ───
    { file:'clients.html',           label:'العملاء',          ico:'👤', group:'orders', perm:'clients' },
    { file:'design.html',            label:'التصميم',          ico:'✏️', group:'orders', perm:'design' },
    { file:'design-workspace.html',  label:'مساحة التصميم',   ico:'🖥️', group:'orders', perm:'design' },
    { file:'print.html',             label:'الطباعة',          ico:'🖨️', group:'orders', perm:'print' },
    { file:'print-routes.html',      label:'مسارات الإنتاج',   ico:'🗺️', group:'orders', adminOnly:true },
    { file:'production.html',        label:'التنفيذ',          ico:'🏭', group:'orders', perm:'production' },
    { file:'job-orders.html',        label:'أوامر التشغيل',    ico:'⚙️', group:'orders', perm:'production' },
    { file:'shipping.html',           label:'الشحن (V1)',        ico:'🚚', group:'orders', perm:'shipping' },
    { file:'shipping-followup.html',  label:'متابعة الشحن',      ico:'📋', group:'orders', perm:'shipping' },
    { file:'shipping-accounts.html',  label:'حسابات الشحن',      ico:'📦', group:'orders', perm:'shipping-accounts' },
    { file:'shipping-audit.html',     label:'تدقيق الشحن',       ico:'🔍', group:'orders', adminOnly:true },
    // ─── Shipping Network V2 — Platform Architecture ───
    { file:'shipping-partners.html',  label:'شبكة الشركاء',      ico:'🤝', group:'orders', perm:'shipping-partners' },
    { file:'shipping-dispatch.html',  label:'إسناد الشحنات',     ico:'🎯', group:'orders', perm:'shipping-dispatch' },
    { file:'shipping-sla.html',       label:'تتبع SLA',          ico:'⚖️', group:'orders', perm:'shipping-sla' },
    { file:'shipping-network-guide.html', label:'دليل الشبكة',   ico:'📘', group:'orders', perm:'shipping-network-guide' },
    { file:'archive.html',           label:'الأرشيف',          ico:'📁', group:'orders', perm:'archive' },
    { file:'returns.html',           label:'المرتجعات',        ico:'↩️', group:'orders', perm:'returns' },

    // ─── الإدارة (admin) ───
    { file:'accounts.html',          label:'الحسابات',         ico:'💰', group:'admin',  perm:'accounts' },
    { file:'approvals.html',         label:'الاعتمادات',       ico:'🔐', group:'admin',  perm:'approvals' },
    { file:'suppliers.html',         label:'الموردين',         ico:'▣',  group:'admin',  perm:'suppliers' },
    { file:'products.html',          label:'المنتجات',         ico:'◈',  group:'admin',  perm:'products' },
    { file:'materials.html',         label:'الخامات',          ico:'📦', group:'admin',  adminOnly:true },
    { file:'smart-pricing.html',     label:'التسعير الذكي',    ico:'💡', group:'admin',  adminOnly:true },
    { file:'reports.html',           label:'التقارير',         ico:'📊', group:'admin',  perm:'reports' },
    { file:'employees.html',         label:'الموظفين',         ico:'👥', group:'admin',  adminOnly:true },
    { file:'workforce-live.html',    label:'Workforce Live',   ico:'👷', group:'admin',  adminOnly:true },
    { file:'suggestions-admin.html', label:'اقتراحات الموظفين', ico:'💡', group:'admin',  adminOnly:true },
    { file:'marketplace.html',       label:'المنصة',          ico:'🏛️', group:'admin',  adminOnly:true },
    { file:'admin-alerts.html',      label:'تنبيهات النظام',   ico:'🚨', group:'admin',  adminOnly:true },
    { file:'settings.html',          label:'الإعدادات',        ico:'⚙️', group:'admin',  adminOnly:true },
  ];

  // أين تذهب كل دور عند الـ login (الـ dashboard المخصص)
  const ROLE_HOME = {
    admin:               'index.html',
    operation_manager:   'ops-dashboard.html',
    customer_service:    'cs-dashboard.html',
    graphic_designer:    'designer-dashboard.html',
    design_operator:     'designer-dashboard.html',
    production_agent:    'production-dashboard.html',
    shipping_officer:    'shipping-dashboard.html',
    shipping_dispatcher: 'shipping-dispatch.html',
    shipping_partner:    'partner-shipping-portal.html',
    driver:              'driver-app.html',
    wallet_manager:      'accounts.html',
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
})();
