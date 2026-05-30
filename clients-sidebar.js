/**
 * Business2Card ERP — clients-sidebar.js
 *
 * ━━━ DYNAMIC SIDEBAR BUILDER FOR clients.html ━━━
 *
 * God-page decomposition PR-24 (RULE G5):
 * Builds the role-aware navigation sidebar by reading the user's
 * `users/{uid}` document and emitting links for the pages they can
 * access. Previously inlined in clients.html as a stand-alone
 * `<script>` block (~28 lines).
 *
 * Attached to window so the in-page auth callback can call it by name.
 *
 * Cross-page note: the same pattern lives in many other HTML pages.
 * Centralizing it across pages is a future refactor.
 */

const ROLE_DASH = {
  admin:             'accounts.html',
  operation_manager: 'ops-dashboard.html',
  customer_service:  'cs-dashboard.html',
  graphic_designer:  'designer-dashboard.html',
  design_operator:   'designer-dashboard.html',
  production_agent:  'production-dashboard.html',
  shipping_officer:  'shipping-dashboard.html',
  wallet_manager:    'accounts.html',
};

const ALL_PAGES = [
  { f: 'clients.html',           l: 'العملاء',         i: '👤', p: 'clients' },
  { f: 'design.html',            l: 'التصميم',         i: '✏️', p: 'design' },
  { f: 'print.html',             l: 'الطباعة',         i: '🖨️', p: 'print' },
  { f: 'production.html',        l: 'التنفيذ',         i: '🏭', p: 'production' },
  { f: 'shipping.html',          l: 'الشحن',           i: '🚚', p: 'shipping' },
  { f: 'shipping-accounts.html', l: 'حسابات الشحن',    i: '📦', p: 'shipping-accounts' },
  { f: 'archive.html',           l: 'الأرشيف',         i: '📁', p: 'archive' },
  { f: 'accounts.html',          l: 'الحسابات',        i: '💰', p: 'accounts' },
  { f: 'approvals.html',         l: 'الاعتمادات',      i: '🔐', p: 'approvals' },
  { f: 'my-requests.html',       l: 'طلباتي',          i: '📋', public: true },
  { f: 'suppliers.html',         l: 'الموردين',        i: '▣',  p: 'suppliers' },
  { f: 'products.html',          l: 'المنتجات',        i: '◈',  p: 'products' },
  { f: 'employees.html',         l: 'الموظفين',        i: '👥', p: 'employees', adminOnly: true },
  { f: 'reports.html',           l: 'التقارير',        i: '📊', p: 'reports' },
  { f: 'design-workspace.html',  l: 'مساحة التصميم',   i: '🖥️', p: 'design' },
  { f: 'gallery.html',           l: 'المعرض',          i: '🖼️', public: true },
  { f: 'settings.html',          l: 'الإعدادات',       i: '⚙️', p: 'settings', adminOnly: true },
];

export function buildDynamicSidebar(uid, currentPage) {
  const nav = document.getElementById('nav-scroll-dynamic')
           || document.getElementById('nav-links')
           || document.querySelector('.nav-scroll');
  if (!nav) return;
  // المصدر المركزي للهيكل المجمّع (sidebar-config.js على window). fallback
  // للقائمة المحلية لو مش متاح (نادراً). الأقسام: الرئيسية/الأوردرات/الإدارة.
  const PAGES  = (typeof window !== 'undefined' && window.SIDEBAR_PAGES) || ALL_PAGES;
  const GROUPS = (typeof window !== 'undefined' && window.GROUP_LABELS) || {};
  firebase.firestore().collection('users').doc(uid).get().then(function (usnap) {
    const ud = usnap.exists ? usnap.data() : {};
    const role = ud.role || 'admin';
    const perms = ud.permissions || {};
    const userPages = perms.pages || [];
    const isAdm = ['admin', 'operation_manager'].includes(role);
    const dash = ROLE_DASH[role] || 'accounts.html';
    let html = '<a class="nav-link' + (currentPage === dash ? ' active' : '') + '" href="' + dash + '"><span class="nav-ico">⬡</span> ' + (isAdm ? 'الحسابات' : 'داشبوردي') + '</a>';
    let lastGroup = '';
    for (const pg of PAGES) {
      const file = pg.file || pg.f;
      const label = pg.label || pg.l;
      const ico = pg.ico || pg.i;
      const perm = pg.perm || pg.p;
      if (file === dash) continue; // الـ dashboard مضاف فوق
      if (pg.adminOnly && !isAdm) continue;
      const ok = pg.public || isAdm || userPages.includes('*') || (perm && userPages.includes(perm));
      if (!ok) continue;
      // عنوان القسم (مجمّع) — زي الباني المركزي
      if (pg.group && pg.group !== lastGroup) {
        html += '<div class="nav-group">' + (GROUPS[pg.group] || pg.group) + '</div>';
        lastGroup = pg.group;
      }
      html += '<a class="nav-link' + (currentPage === file ? ' active' : '') + '" href="' + file + '"><span class="nav-ico">' + ico + '</span> ' + label + '</a>';
    }
    nav.innerHTML = html;
  }).catch(function () {
    nav.innerHTML = '<a class="nav-link active" href="clients.html"><span class="nav-ico">👤</span> العملاء</a><a class="nav-link" href="design.html"><span class="nav-ico">✏️</span> التصميم</a>';
  });
}

if (typeof window !== 'undefined') {
  window.buildDynamicSidebar = buildDynamicSidebar;
}
