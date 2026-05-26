// Accounts domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'إضافة عملية مالية',
  primaryAction: { icon: '💸', label: 'تسجيل مصروف', handler: 'openExpenseDialog' },
  // UX Phase A: primary = 5 most-used financial views.
  views: [
    { id: 'wallets',   ico: '💼', label: 'المحافظ',     deepLink: 'accounts.html#wallets' },
    { id: 'approvals', ico: '🔐', label: 'الموافقات',    deepLink: 'approvals.html' },
    { id: 'income',    ico: '📥', label: 'التحصيلات',    deepLink: 'accounts.html#income' },
    { id: 'expenses',  ico: '📤', label: 'المصروفات',    deepLink: 'accounts.html#expenses' },
    { id: 'settle',    ico: '🤝', label: 'تسويات الشحن', deepLink: 'shipping-accounts.html' },
  ],
  secondaryViews: [
    { id: 'safe',      ico: '🏦', label: 'الخزنة',        deepLink: 'accounts.html#safe' },
    { id: 'ledger',    ico: '📚', label: 'دفتر الحركات',  deepLink: 'ledger.html' },
  ],
  actions: [
    { id: 'transfer', ico: '🔄', label: 'تحويل بين محافظ', handler: 'openTransferDialog' },
    { id: 'expense',  ico: '💸', label: 'تسجيل مصروف',    handler: 'openExpenseDialog' },
    { id: 'approve',  ico: '✅', label: 'مراجعة الموافقات', handler: 'goToApprovals' },
    { id: 'report',   ico: '📊', label: 'تقرير سريع',      handler: 'openQuickReport' },
  ],
  // UX audit Phase 2: info-only signals removed (alert fatigue).
  // "تسويات قيد الانتظار" was reference, not actionable — accessible via Shipping domain.
  signals: [
    { kind: 'warn', ico: '⚠', label: 'موافقات معلقة', signalKey: 'pending-approvals', target: 'approvals.html' },
    { kind: 'warn', ico: '⚠', label: 'كاش منخفض', target: 'accounts.html#wallets' },
  ],
};

register('accounts', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
