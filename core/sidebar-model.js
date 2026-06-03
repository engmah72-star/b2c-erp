// ════════════════════════════════════════════════════════════════════
// core/sidebar-model.js — Pure sidebar nav model (no DOM, no Firebase)
// ════════════════════════════════════════════════════════════════════
// منطق نقي قابل للاختبار يبني نموذج الـ navigation لمستخدم معيّن. يطابق
// تماماً منطق sidebar.js (build/isAllowed) — وهو "العقد" الذي يضمنه
// tests/app-sidebar-parity.test.mjs قبل أي ترحيل.
//
// النقاء (لا window/document/firebase) يسمح باختباره في node مباشرة، ويسمح
// لمكوّن <app-sidebar> (app-sidebar.js) باستهلاكه دون تكرار المنطق.
// ════════════════════════════════════════════════════════════════════

// مرآة لـ DASH_LABELS في sidebar.js (تسمية لوحة الدور في أعلى القائمة).
export const DASH_LABELS = {
  admin:             'الحسابات',
  operation_manager: 'لوحة التحكم',
  customer_service:  'داشبوردي',
  graphic_designer:  'داشبوردي',
  design_operator:   'داشبوردي',
  production_agent:  'داشبوردي',
  shipping_officer:  'داشبوردي',
  wallet_manager:    'داشبوردي',
};

/**
 * هل الصفحة مسموح بها للمستخدم؟ — مرآة دقيقة لـ isAllowed في sidebar.js.
 *
 * @param {Object} cfg   عنصر من SIDEBAR_PAGES ({file,label,ico,group,perm,adminOnly?,public?})
 * @param {Object} userData {role, permissions}
 * @param {Object} opts  { rolePages, opsAdminPages } — تُمرَّر بدل قراءة window
 *   - rolePages: خريطة ROLE_PAGES (fallback لمستخدم بلا permissions.pages)
 *   - opsAdminPages: kill switch (operation_manager يرى adminOnly مرة أخرى)
 */
export function isAllowedPage(cfg, userData, opts = {}) {
  const role = (userData && userData.role) || 'customer_service';
  if (cfg.public) return true;
  if (cfg.adminOnly) {
    return role === 'admin' || (role === 'operation_manager' && !!opts.opsAdminPages);
  }
  if (role === 'admin' || role === 'operation_manager') return !cfg.guestOnly;
  const perms = (userData && userData.permissions) || {};
  const rolePages = opts.rolePages || {};
  const pages = Array.isArray(perms.pages) ? perms.pages : (rolePages[role] || []);
  const hasPagePerm = pages.includes('*') || pages.includes(cfg.perm || '');
  const hasViewClients = cfg.perm === 'clients' && perms.canViewClients === true;
  return hasPagePerm || hasViewClients;
}

/**
 * يبني نموذج القائمة المرتّب (dash link أولاً، ثم المجموعات وروابطها) —
 * مرآة دقيقة لترتيب build في sidebar.js.
 *
 * @param {Object} userData {role, permissions}
 * @param {string} currentPage اسم الصفحة الحالية (للـ active state)
 * @param {Object} cfg { SIDEBAR_PAGES, ROLE_HOME, GROUP_LABELS, rolePages, opsAdminPages }
 * @returns {{ dashHome:string, items: Array }} items = عناصر {type:'group',label}
 *   أو {type:'link', file, label, ico, active, dash?}
 */
export function computeNavModel(userData, currentPage, cfg = {}) {
  const SIDEBAR_PAGES = cfg.SIDEBAR_PAGES || [];
  const ROLE_HOME     = cfg.ROLE_HOME     || {};
  const GROUP_LABELS  = cfg.GROUP_LABELS  || {};

  const role      = (userData && userData.role) || 'customer_service';
  const cur       = String(currentPage || '').replace(/\?.*/, '');
  const dashHome  = ROLE_HOME[role] || 'accounts.html';
  const dashLabel = DASH_LABELS[role] || 'داشبوردي';

  const items = [{ type: 'link', file: dashHome, label: dashLabel, ico: '⬡', active: cur === dashHome, dash: true }];

  let lastGroup = '';
  for (const p of SIDEBAR_PAGES) {
    if (p.file === dashHome) continue;            // مضاف بالفعل أعلى القائمة
    if (!isAllowedPage(p, userData, cfg)) continue;
    if (p.group !== lastGroup) {
      items.push({ type: 'group', label: GROUP_LABELS[p.group] || p.group });
      lastGroup = p.group;
    }
    items.push({ type: 'link', file: p.file, label: p.label, ico: p.ico, active: cur === p.file });
  }
  return { dashHome, items };
}

/**
 * أكثر n صفحات استخداماً (pure) — من خريطة usage {pageKey: count}.
 * مرتّبة تنازلياً بالعدّ؛ يُرجع مفاتيح الصفحات فقط.
 */
export function topUsed(usage, n = 3) {
  return Object.entries(usage || {})
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

