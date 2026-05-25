// Admin domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'إضافة',
  views: [
    { id: 'settings',  ico: '⚙', label: 'الإعدادات',         deepLink: 'settings.html' },
    { id: 'employees', ico: '👥', label: 'الموظفين',          deepLink: 'employees.html' },
    { id: 'role-view', ico: '🔍', label: 'معاينة الأدوار',    deepLink: 'role-viewer.html' },
    { id: 'suppliers', ico: '🏭', label: 'الموردين',          deepLink: 'suppliers.html' },
    { id: 'products',  ico: '◈', label: 'المنتجات',           deepLink: 'products.html' },
    { id: 'archive',   ico: '📁', label: 'الأرشيف',           deepLink: 'archive.html' },
    { id: 'bugs',      ico: '🐛', label: 'تقارير الأخطاء',    deepLink: 'report-bug.html' },
    { id: 'profile',   ico: '👤', label: 'ملفي',              deepLink: 'my-profile.html' },
  ],
  actions: [
    { id: 'add-employee', ico: '➕', label: 'إضافة موظف',  handler: 'openAddEmployee' },
    { id: 'add-product',  ico: '📦', label: 'إضافة منتج',  handler: 'openAddProduct' },
    { id: 'add-supplier', ico: '🏭', label: 'إضافة مورد',  handler: 'openAddSupplier' },
  ],
  signals: [
    { kind: 'crit', ico: '🚨', label: 'تنبيهات نظام' },
    { kind: 'warn', ico: '🐛', label: 'أخطاء جديدة' },
    { kind: 'info', ico: '⚙', label: 'تحديثات معلقة' },
  ],
};

register('admin', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
