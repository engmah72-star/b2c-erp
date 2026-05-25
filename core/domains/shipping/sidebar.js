// Shipping domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'شحنة جديدة',
  primaryAction: { icon: '➕', label: 'شحنة جديدة', handler: 'openNewShipment' },
  views: [
    { id: 'all',       ico: '📦', label: 'الشحنات الحالية',   deepLink: 'shipping.html' },
    { id: 'late',      ico: '⏰', label: 'المتأخرة',           deepLink: 'shipping.html?filter=late' },
    { id: 'income',    ico: '💰', label: 'التحصيلات',          deepLink: 'shipping.html?filter=collections' },
    { id: 'accounts',  ico: '🤝', label: 'حسابات الشحن',       deepLink: 'shipping-accounts.html' },
    { id: 'returns',   ico: '↩', label: 'المرتجعات',           deepLink: 'returns.html' },
    { id: 'followup',  ico: '📋', label: 'المتابعة',           deepLink: 'shipping-followup.html' },
    { id: 'guide',     ico: '📖', label: 'دليل الشحن',         deepLink: 'shipping-guide.html' },
    { id: 'tracking',  ico: '📍', label: 'تتبع شحنة',          deepLink: 'order-tracking.html' },
  ],
  actions: [
    { id: 'new-ship',  ico: '➕', label: 'شحنة جديدة',         handler: 'openNewShipment' },
    { id: 'settle',    ico: '💵', label: 'تسوية مع شركة',      handler: 'openSettleCompany' },
    { id: 'return',    ico: '↩', label: 'تسجيل مرتجع',         handler: 'openLogReturn' },
    { id: 'track',     ico: '📍', label: 'تتبع رقم',            handler: 'openTrackByNumber' },
  ],
  signals: [
    { kind: 'crit', ico: '⏰', label: 'شحنات متأخرة', signalKey: 'late' },
    { kind: 'warn', ico: '🚛', label: 'مشاكل شركات' },
    { kind: 'info', ico: '💰', label: 'تسويات معلقة' },
  ],
};

register('shipping', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
