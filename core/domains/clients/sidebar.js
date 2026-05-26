// Clients domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'إضافة عميل',
  primaryAction: { icon: '➕', label: 'عميل جديد', handler: 'openAddClient' },
  // Phase 1b (user decision 2026-05-26): page chips own the filters.
  // The sidebar no longer mirrors them — duplication eliminated.
  // What stays in the sidebar:
  //   - "استيراد بيانات" → a different page, not a filter (cross-page nav)
  //   - actions (add/log/note) → operational shortcuts
  //   - signals (alerts) → time-sensitive cues
  //   - recent (auto) → operator memory
  views: [
    { id: 'import', ico: '📥', label: 'استيراد بيانات', deepLink: 'import-data.html' },
  ],
  secondaryViews: [],
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
