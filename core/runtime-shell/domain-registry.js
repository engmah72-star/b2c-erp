// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Domain Registry
// ════════════════════════════════════════════════════════════════════
//
// Single source of truth لكل domain في الـ runtime shell.
// كل domain له:
//   - id: identifier للـ URL routing (?d=X) و internal state
//   - icon: emoji للـ rail
//   - title: الاسم العربي للـ accessibility/tooltips
//   - workspace: مسار الـ HTML page اللي يُحمَّل كـ iframe في الـ Workspace
//   - sidebarRenderer: function() → DOM (يُسجَّل من domain modules لاحقاً)
//
// الـ Phase 1: sidebarRenderer = null لكل الـ domains.
// الـ Context Sidebar يعرض placeholder لحد ما الـ domain يـ register نفسه.
//
// Registry API:
//   register(domainId, sidebarRenderer)  → register a custom sidebar renderer
//   getRenderer(domainId)                → get the registered renderer (or null)
//   getDomain(domainId)                  → get full domain metadata
//   list()                               → array of all domains
// ════════════════════════════════════════════════════════════════════

export const DOMAINS = [
  { id: 'clients',    icon: '👤',  title: 'العملاء',   workspace: 'clients.html'    },
  { id: 'design',     icon: '🎨',  title: 'التصميم',   workspace: 'design.html'     },
  { id: 'production', icon: '🏭',  title: 'الإنتاج',   workspace: 'production.html' },
  { id: 'shipping',   icon: '🚚',  title: 'الشحن',     workspace: 'shipping.html'   },
  { id: 'accounts',   icon: '💰',  title: 'الحسابات',  workspace: 'accounts.html'   },
  { id: 'reports',    icon: '📊',  title: 'التقارير',  workspace: 'reports.html'    },
  { id: 'inbox',      icon: '💬',  title: 'الرسائل',   workspace: 'inbox.html'      },
  { id: 'admin',      icon: '⚙',  title: 'الإدارة',   workspace: 'settings.html'   },
];

const _registry = new Map();

export function register(domainId, sidebarRenderer) {
  if (!domainId || typeof sidebarRenderer !== 'function') return false;
  _registry.set(domainId, sidebarRenderer);
  return true;
}

export function unregister(domainId) {
  return _registry.delete(domainId);
}

export function getRenderer(domainId) {
  return _registry.get(domainId) || null;
}

export function getDomain(domainId) {
  return DOMAINS.find(d => d.id === domainId) || null;
}

export function list() {
  return DOMAINS.slice();
}

export function isValidDomain(domainId) {
  return DOMAINS.some(d => d.id === domainId);
}
