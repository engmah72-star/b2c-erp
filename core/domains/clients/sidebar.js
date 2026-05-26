// Clients domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'إضافة عميل',
  primaryAction: { icon: '➕', label: 'عميل جديد', handler: 'openAddClient' },
  // Phase 1 (UX_OWNERSHIP_AUDIT): views now dispatch runtime-state events
  // — clients.html subscribes and applies the filter without an iframe reload.
  // `deepLink` is kept as a fallback for direct URL access / refresh.
  views: [
    { id: 'active',  ico: '🟢', label: 'النشطين',      state: { view: 'active' },  deepLink: 'clients.html?filter=active' },
    { id: 'rem',     ico: '💰', label: 'عليه فلوس',    state: { view: 'rem' },     deepLink: 'clients.html?filter=rem' },
    { id: 'atrisk',  ico: '⚠',  label: 'محتاج اهتمام', state: { view: 'atrisk' },  deepLink: 'clients.html?filter=atrisk' },
    { id: 'new',     ico: '🆕', label: 'جدد',           state: { view: 'new' },     deepLink: 'clients.html?filter=new' },
    { id: 'vip',     ico: '⭐', label: 'VIP',           state: { view: 'vip' },     deepLink: 'clients.html?filter=vip' },
  ],
  secondaryViews: [
    { id: 'all',      ico: '📊', label: 'كل العملاء',     state: { view: 'all' },      deepLink: 'clients.html' },
    { id: 'sleeping', ico: '😴', label: 'نايم',            state: { view: 'sleeping' }, deepLink: 'clients.html?filter=sleeping' },
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
