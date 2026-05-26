// Shipping domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'شحنة جديدة',
  primaryAction: { icon: '➕', label: 'شحنة جديدة', handler: 'openNewShipment' },
  // UX Phase A: primary = 5 daily-operational views.
  views: [
    { id: 'all',       ico: '📦', label: 'الشحنات الحالية',   deepLink: 'shipping.html' },
    { id: 'late',      ico: '⏰', label: 'المتأخرة',           deepLink: 'shipping.html?filter=late' },
    { id: 'income',    ico: '💰', label: 'التحصيلات',          deepLink: 'shipping.html?filter=collections' },
    { id: 'accounts',  ico: '🤝', label: 'حسابات الشحن',       deepLink: 'shipping-accounts.html' },
    { id: 'returns',   ico: '↩', label: 'المرتجعات',           deepLink: 'returns.html' },
  ],
  secondaryViews: [
    { id: 'followup',  ico: '📋', label: 'المتابعة',           deepLink: 'shipping-followup.html' },
    { id: 'tracking',  ico: '📍', label: 'تتبع شحنة',          deepLink: 'order-tracking.html' },
    { id: 'guide',     ico: '📖', label: 'دليل الشحن',         deepLink: 'shipping-guide.html' },
  ],
  actions: [
    { id: 'new-ship',  ico: '➕', label: 'شحنة جديدة',         handler: 'openNewShipment' },
    { id: 'settle',    ico: '💵', label: 'تسوية مع شركة',      handler: 'openSettleCompany' },
    { id: 'return',    ico: '↩', label: 'تسجيل مرتجع',         handler: 'openLogReturn' },
    { id: 'track',     ico: '📍', label: 'تتبع رقم',            handler: 'openTrackByNumber' },
  ],
  // UX audit Phase 2: info-only signal removed (accessible via "حسابات الشحن" view).
  signals: [
    { kind: 'crit', ico: '⏰', label: 'شحنات متأخرة', signalKey: 'late', target: 'shipping.html?filter=late' },
    { kind: 'warn', ico: '🚛', label: 'مشاكل شركات', target: 'shipping.html?filter=problem' },
  ],
};

register('shipping', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
