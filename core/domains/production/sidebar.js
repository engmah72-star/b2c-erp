// Production domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'إجراء سريع',
  primaryAction: { icon: '✅', label: 'تحديث الحالة', handler: 'openMarkStatus' },
  // Phase 1c: production.html has in-page filter chips (الكل/بدون تكلفة/انتظار/
  // جاري/خلصت/مشكلة) — so 'all' and 'problem' were duplicates in the sidebar.
  // Removed. The 3 remaining primary views are *only* in the sidebar (the page
  // chips don't expose them):
  //   - "موكلة لي"   : filter by current operator
  //   - "متأخرة"     : SLA-overdue subset
  //   - "بدون مورد"  : missing supplier assignment (≠ "بدون تكلفة")
  views: [
    { id: 'mine',         ico: '👷', label: 'موكلة لي',          deepLink: 'production.html?filter=mine' },
    { id: 'late',         ico: '⏰', label: 'متأخرة',            deepLink: 'production.html?filter=late' },
    { id: 'no-supplier',  ico: '🟡', label: 'بدون مورد',         deepLink: 'production.html?filter=no-supplier' },
  ],
  secondaryViews: [
    { id: 'done',         ico: '✅', label: 'خلصت اليوم',         deepLink: 'production.html?filter=done-today' },
    { id: 'print',        ico: '🖨️', label: 'الطباعة',           deepLink: 'print.html' },
    { id: 'supplier-req', ico: '🏭', label: 'طلبات الموردين',    deepLink: 'supplier-requests.html' },
    { id: 'costs',        ico: '💰', label: 'بنود التكلفة',       deepLink: 'exec-cost-entry.html' },
  ],
  actions: [
    { id: 'assign',     ico: '👷', label: 'Assign مندوب',  handler: 'openAssign' },
    { id: 'supplier',   ico: '🏭', label: 'تغيير مورد',     handler: 'openChangeSupplier' },
    { id: 'cost',       ico: '💰', label: 'تسجيل تكلفة',    handler: 'openCostEntry' },
    { id: 'mark-done',  ico: '✅', label: 'تحديث الحالة',    handler: 'openMarkStatus' },
  ],
  signals: [
    { kind: 'crit', ico: '⏰', label: 'طلبات متأخرة', signalKey: 'late',        target: 'production.html?filter=late' },
    { kind: 'warn', ico: '🟡', label: 'بدون مورد',    signalKey: 'no-supplier', target: 'production.html?filter=no-supplier' },
    { kind: 'warn', ico: '⚠', label: 'فيها مشكلة',    signalKey: 'problem',     target: 'production.html?filter=problem' },
  ],
};

register('production', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
