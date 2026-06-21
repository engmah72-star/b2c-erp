// core/page-shortcuts.js
// Central registry of contextual shortcuts per page.
// Each page calls: initPageShortcuts('print', { role, openOrder, ... })
//
// Keeps shortcut definitions in one place — pages just pass context.

import { initContextualShortcuts, updateShortcuts } from './contextual-shortcuts.js';

const PAGE_SHORTCUTS = {

  // ── الطباعة (print / print-workspace) ──
  print: (ctx) => [
    { icon: '🏭', label: 'تسليم للتنفيذ', variant: 'success',
      action: () => ctx.moveToProduction?.(),
      when: () => !!ctx.getActiveOrder?.() },
    { icon: '💰', label: 'تحصيل', variant: 'warning',
      action: () => ctx.openCollect?.(),
      when: () => !!ctx.getActiveOrder?.() },
    { icon: '📞', label: 'تواصل مع العميل', variant: 'primary',
      action: () => ctx.openContact?.(),
      when: () => !!ctx.getActiveOrder?.() },
    { icon: '↩️', label: 'إعادة للتصميم', variant: 'danger',
      action: () => ctx.rejectToDesign?.(),
      when: () => !!ctx.getActiveOrder?.() && ['admin', 'operation_manager', 'customer_service'].includes(ctx.role) },
    { icon: '✏️', label: 'التصميم', variant: 'purple', navigate: 'design.html' },
    { icon: '🚚', label: 'الشحن', variant: 'cyan', navigate: 'shipping.html' },
  ],

  // ── التصميم (design) ──
  design: (ctx) => [
    { icon: '📤', label: 'رفع تصميم', variant: 'primary',
      action: () => ctx.uploadDesign?.(),
      when: () => !!ctx.getActiveOrder?.() },
    { icon: '✅', label: 'طلب اعتماد', variant: 'success',
      action: () => ctx.requestApproval?.(),
      when: () => !!ctx.getActiveOrder?.() },
    { icon: '📞', label: 'تواصل مع العميل', variant: 'warning',
      action: () => ctx.openContact?.(),
      when: () => !!ctx.getActiveOrder?.() },
    { icon: '🖨️', label: 'الطباعة', variant: 'cyan', navigate: 'print.html' },
    { icon: '👤', label: 'العملاء', navigate: 'clients.html' },
  ],

  // ── العملاء (clients) ──
  clients: (ctx) => [
    { icon: '➕', label: 'أوردر جديد', variant: 'primary',
      action: () => ctx.newOrder?.() },
    { icon: '👤', label: 'عميل جديد', variant: 'success',
      action: () => ctx.newClient?.() },
    { icon: '📞', label: 'متابعة عميل', variant: 'warning',
      action: () => ctx.followUp?.(),
      when: () => !!ctx.getActiveClient?.() },
    { icon: '✏️', label: 'التصميم', variant: 'purple', navigate: 'design.html' },
    { icon: '📊', label: 'التقارير', navigate: 'reports.html',
      when: () => ['admin', 'operation_manager'].includes(ctx.role) },
  ],

  // ── الشحن (shipping) ──
  shipping: (ctx) => [
    { icon: '📦', label: 'تسجيل شحنة', variant: 'primary',
      action: () => ctx.registerShipment?.(),
      when: () => !!ctx.getActiveOrder?.() },
    { icon: '🔄', label: 'تحديث حالة', variant: 'success',
      action: () => ctx.updateStatus?.(),
      when: () => !!ctx.getActiveOrder?.() },
    { icon: '💰', label: 'تسوية شحن', variant: 'warning', navigate: 'shipping-accounts.html',
      when: () => ['admin', 'operation_manager', 'shipping_officer'].includes(ctx.role) },
    { icon: '↩️', label: 'المرتجعات', variant: 'danger', navigate: 'returns.html' },
    { icon: '🖨️', label: 'الطباعة', variant: 'cyan', navigate: 'print.html' },
  ],

  // ── الإنتاج (production) ──
  production: (ctx) => [
    { icon: '🚚', label: 'تسليم للشحن', variant: 'success',
      action: () => ctx.moveToShipping?.(),
      when: () => !!ctx.getActiveOrder?.() },
    { icon: '🔧', label: 'تحديث حالة المنتج', variant: 'primary',
      action: () => ctx.updateProduct?.(),
      when: () => !!ctx.getActiveOrder?.() },
    { icon: '💰', label: 'بنود التكلفة', variant: 'warning', navigate: 'exec-cost-entry.html',
      when: () => ['admin', 'operation_manager'].includes(ctx.role) },
    { icon: '🖨️', label: 'الطباعة', variant: 'cyan', navigate: 'print.html' },
    { icon: '🏭', label: 'طلبات الموردين', navigate: 'supplier-requests.html' },
  ],

  // ── الحسابات (accounts) ──
  accounts: (ctx) => [
    { icon: '💰', label: 'تسجيل دفعة', variant: 'success',
      action: () => ctx.recordPayment?.() },
    { icon: '📦', label: 'تسوية شحن', variant: 'primary', navigate: 'shipping-accounts.html' },
    { icon: '📒', label: 'القيود', variant: 'warning', navigate: 'ledger.html' },
    { icon: '📊', label: 'التقارير', variant: 'purple', navigate: 'reports.html' },
    { icon: '👤', label: 'العملاء', navigate: 'clients.html' },
  ],

  // ── الاعتمادات (approvals) ──
  approvals: (ctx) => [
    { icon: '➕', label: 'إنشاء طلب', variant: 'primary',
      action: () => ctx.createRequest?.() },
    { icon: '✅', label: 'تأكيد استلام', variant: 'success',
      action: () => ctx.confirmDelivery?.(),
      when: () => !!ctx.getActiveOrder?.() },
    { icon: '👤', label: 'العملاء', navigate: 'clients.html' },
    { icon: '✏️', label: 'التصميم', variant: 'purple', navigate: 'design.html' },
  ],

  // ── المرتجعات (returns) ──
  returns: (ctx) => [
    { icon: '↩️', label: 'تسجيل مرتجع', variant: 'danger',
      action: () => ctx.createReturn?.() },
    { icon: '💰', label: 'الحسابات', variant: 'warning', navigate: 'accounts.html' },
    { icon: '🚚', label: 'الشحن', variant: 'cyan', navigate: 'shipping.html' },
    { icon: '👤', label: 'العملاء', navigate: 'clients.html' },
  ],

  // ── الموظفين (employees) ──
  employees: (ctx) => [
    { icon: '➕', label: 'إضافة موظف', variant: 'primary',
      action: () => ctx.addEmployee?.() },
    { icon: '⭐', label: 'تقييم', variant: 'success',
      action: () => ctx.evaluate?.(),
      when: () => !!ctx.getActiveEmployee?.() },
    { icon: '📅', label: 'إجازة', variant: 'warning',
      action: () => ctx.addLeave?.(),
      when: () => !!ctx.getActiveEmployee?.() },
    { icon: '📊', label: 'التقارير', variant: 'purple', navigate: 'reports.html' },
  ],

  // ── الموردين (suppliers) ──
  suppliers: (ctx) => [
    { icon: '➕', label: 'مورد جديد', variant: 'primary',
      action: () => ctx.addSupplier?.() },
    { icon: '📋', label: 'طلب مورد', variant: 'success',
      action: () => ctx.createRequest?.() },
    { icon: '💰', label: 'دفعة مورد', variant: 'warning',
      action: () => ctx.recordPayment?.() },
    { icon: '🏭', label: 'التنفيذ', navigate: 'production.html' },
  ],

  // ── التقارير (reports) ──
  reports: (ctx) => [
    { icon: '💰', label: 'الحسابات', variant: 'primary', navigate: 'accounts.html' },
    { icon: '👤', label: 'العملاء', navigate: 'clients.html' },
    { icon: '👥', label: 'الموظفين', variant: 'purple', navigate: 'employees.html',
      when: () => ['admin', 'operation_manager'].includes(ctx.role) },
    { icon: '📒', label: 'القيود', variant: 'warning', navigate: 'ledger.html' },
  ],

  // ── الأرشيف (archive) ──
  archive: (ctx) => [
    { icon: '🔍', label: 'بحث متقدم', variant: 'primary',
      action: () => ctx.advancedSearch?.() },
    { icon: '📊', label: 'التقارير', variant: 'purple', navigate: 'reports.html' },
    { icon: '👤', label: 'العملاء', navigate: 'clients.html' },
    { icon: '💰', label: 'الحسابات', variant: 'warning', navigate: 'accounts.html' },
  ],

  // ── سجل الأوردرات (order-rail) ──
  'order-rail': (ctx) => [
    { icon: '➕', label: 'أوردر جديد', variant: 'primary',
      action: () => ctx.newOrder?.() },
    { icon: '👤', label: 'العملاء', navigate: 'clients.html' },
    { icon: '✏️', label: 'التصميم', variant: 'purple', navigate: 'design.html' },
    { icon: '🖨️', label: 'الطباعة', variant: 'cyan', navigate: 'print.html' },
  ],

  // ── حسابات الشحن (shipping-accounts) ──
  'shipping-accounts': (ctx) => [
    { icon: '📦', label: 'تسوية جديدة', variant: 'success',
      action: () => ctx.newSettlement?.() },
    { icon: '🚚', label: 'الشحن', variant: 'cyan', navigate: 'shipping.html' },
    { icon: '💰', label: 'الحسابات', variant: 'warning', navigate: 'accounts.html' },
    { icon: '📊', label: 'التقارير', variant: 'purple', navigate: 'reports.html' },
  ],

  // ── الإعدادات (settings) ──
  settings: (ctx) => [
    { icon: '📋', label: 'المنتجات', variant: 'primary', navigate: 'products.html' },
    { icon: '▣', label: 'الموردين', navigate: 'suppliers.html' },
    { icon: '👥', label: 'الموظفين', variant: 'purple', navigate: 'employees.html' },
    { icon: '💰', label: 'الحسابات', variant: 'warning', navigate: 'accounts.html' },
  ],
};

export function initPageShortcuts(pageName, ctx = {}) {
  const builder = PAGE_SHORTCUTS[pageName];
  if (!builder) return;
  const shortcuts = builder(ctx);
  initContextualShortcuts({ shortcuts });
}

export function updatePageShortcuts(pageName, ctx = {}) {
  const builder = PAGE_SHORTCUTS[pageName];
  if (!builder) return;
  const shortcuts = builder(ctx);
  updateShortcuts(shortcuts);
}

export { initContextualShortcuts, updateShortcuts, refreshShortcuts, hideShortcuts, showShortcuts } from './contextual-shortcuts.js';
