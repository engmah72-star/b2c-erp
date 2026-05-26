// Reports domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'تقرير مخصص',
  primaryAction: { icon: '📥', label: 'تقرير مخصص', handler: 'openCustomReport' },
  views: [
    { id: 'main',      ico: '📊', label: 'لوحة التقارير',      deepLink: 'reports.html' },
    { id: 'financial', ico: '💰', label: 'تقارير مالية',        deepLink: 'reports.html?cat=financial' },
    { id: 'prod',      ico: '📦', label: 'تقارير الإنتاج',      deepLink: 'reports.html?cat=production' },
    { id: 'ship',      ico: '🚚', label: 'تقارير الشحن',        deepLink: 'reports.html?cat=shipping' },
    { id: 'clients',   ico: '👤', label: 'تقارير العملاء',      deepLink: 'reports.html?cat=clients' },
    { id: 'design',    ico: '🎨', label: 'تقارير التصميم',      deepLink: 'reports.html?cat=design' },
    { id: 'dash-fin',  ico: '📈', label: 'لوحة مالية تفصيلية', deepLink: 'financial-dashboard.html' },
    { id: 'dash-exec', ico: '⚙', label: 'لوحة التنفيذ',         deepLink: 'exec-dashboard.html' },
  ],
  actions: [
    { id: 'custom', ico: '📥', label: 'تقرير مخصص',  handler: 'openCustomReport' },
    { id: 'export', ico: '📤', label: 'تصدير CSV',   handler: 'openExportCsv' },
    { id: 'print',  ico: '🖨️', label: 'طباعة',       handler: 'printReport' },
  ],
  // UX audit Phase 2: signals removed — Reports is reference-only, no actionable alerts.
  // Future: replace with "scheduled reports" or "saved reports" as views or a section.
  signals: [],
};

register('reports', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
