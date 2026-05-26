// Clients domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'إضافة عميل',
  primaryAction: { icon: '➕', label: 'عميل جديد', handler: 'openAddClient' },
  views: [
    { id: 'all',      ico: '📊', label: 'كل العملاء',   deepLink: 'clients.html' },
    { id: 'active',   ico: '🟢', label: 'النشطين',      deepLink: 'clients.html?filter=active' },
    { id: 'new',      ico: '🆕', label: 'الجدد',         deepLink: 'clients.html?filter=new' },
    { id: 'delayed',  ico: '⏰', label: 'المتأخرين',    deepLink: 'clients.html?filter=delayed' },
    { id: 'balance',  ico: '💰', label: 'عليه فلوس',    deepLink: 'clients.html?filter=balance' },
    { id: 'vip',      ico: '⭐', label: 'VIP',          deepLink: 'clients.html?filter=vip' },
    { id: 'sleep',    ico: '😴', label: 'نايم',          deepLink: 'clients.html?filter=sleep' },
    { id: 'problem',  ico: '🚫', label: 'مشاكل',         deepLink: 'clients.html?filter=problem' },
    { id: 'import',   ico: '📥', label: 'استيراد بيانات', deepLink: 'import-data.html' },
  ],
  actions: [
    { id: 'add-client', ico: '➕', label: 'عميل جديد',     handler: 'openAddClient' },
    { id: 'log-call',   ico: '📞', label: 'تسجيل اتصال',   handler: 'openLogCall' },
    { id: 'log-pay',    ico: '💰', label: 'تسجيل تحصيل',   handler: 'openLogPayment' },
    { id: 'note',       ico: '📝', label: 'ملاحظة سريعة',  handler: 'openNote' },
  ],
  // UX audit Phase 2: info-only signal removed (already a view in the views section).
  signals: [
    { kind: 'warn', ico: '⏰', label: 'عملاء متأخرين', signalKey: 'delayed', target: 'clients.html?filter=delayed' },
    { kind: 'crit', ico: '🚫', label: 'شكاوى جديدة', target: 'clients.html?filter=problem' },
  ],
};

register('clients', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
