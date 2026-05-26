// Clients domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'إضافة عميل',
  primaryAction: { icon: '➕', label: 'عميل جديد', handler: 'openAddClient' },
  // UX Phase A.1: filter IDs match the actual chip values in clients.html
  // (window.setQuickFilter accepts: all, vip, active, rem, atrisk, new, sleeping).
  // Each deepLink is parsed by clients.html's URL-filter bootstrap and routed
  // to setQuickFilter, so navigation = filter applied without a full UI re-pick.
  views: [
    { id: 'active',  ico: '🟢', label: 'النشطين',      deepLink: 'clients.html?filter=active' },
    { id: 'rem',     ico: '💰', label: 'عليه فلوس',    deepLink: 'clients.html?filter=rem' },
    { id: 'atrisk',  ico: '⚠',  label: 'محتاج اهتمام', deepLink: 'clients.html?filter=atrisk' },
    { id: 'new',     ico: '🆕', label: 'جدد',           deepLink: 'clients.html?filter=new' },
    { id: 'vip',     ico: '⭐', label: 'VIP',           deepLink: 'clients.html?filter=vip' },
  ],
  // Secondary (collapsible under "المزيد"): reference + admin.
  secondaryViews: [
    { id: 'all',      ico: '📊', label: 'كل العملاء',     deepLink: 'clients.html' },
    { id: 'sleeping', ico: '😴', label: 'نايم',            deepLink: 'clients.html?filter=sleeping' },
    { id: 'import',   ico: '📥', label: 'استيراد بيانات',  deepLink: 'import-data.html' },
  ],
  actions: [
    { id: 'add-client', ico: '➕', label: 'عميل جديد',     handler: 'openAddClient' },
    { id: 'log-call',   ico: '📞', label: 'تسجيل اتصال',   handler: 'openLogCall' },
    { id: 'log-pay',    ico: '💰', label: 'تسجيل تحصيل',   handler: 'openLogPayment' },
    { id: 'note',       ico: '📝', label: 'ملاحظة سريعة',  handler: 'openNote' },
  ],
  signals: [
    { kind: 'warn', ico: '⚠', label: 'محتاج اهتمام', signalKey: 'delayed', target: 'clients.html?filter=atrisk' },
  ],
};

register('clients', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
