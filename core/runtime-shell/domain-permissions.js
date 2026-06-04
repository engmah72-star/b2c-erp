// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Domain Permissions
// ════════════════════════════════════════════════════════════════════
//
// يحدّد أي domains مرئية لكل role في الـ rail.
// المصدر: محاذاة مع ROLE_PAGES في shared.js + الـ sidebar-config.js
//
// API:
//   getAllowedDomains(role, permissions)  → array of domain ids
//   canSeeDomain(domainId, role, permissions)
//   getDefaultDomain(role)                → first allowed domain or fallback
// ════════════════════════════════════════════════════════════════════

// ── Domain access matrix ──
// كل role يشوف أي domains. الـ admin + operation_manager بيشوفوا الكل.
// باقي الأدوار = subset حسب وظيفتهم.
const ROLE_DOMAINS = {
  admin: ['clients', 'design', 'production', 'shipping', 'accounts', 'reports', 'attendance', 'inbox', 'admin'],

  operation_manager: ['clients', 'design', 'production', 'shipping', 'accounts', 'reports', 'attendance', 'inbox', 'admin'],

  customer_service: ['clients', 'design', 'shipping', 'reports', 'inbox'],

  graphic_designer: ['design', 'inbox'],

  design_operator: ['design', 'inbox'],

  production_agent: ['production', 'design', 'inbox'],

  shipping_officer: ['shipping', 'production', 'inbox'],

  wallet_manager: ['accounts', 'reports', 'inbox'],
};

// ── Default landing per role ──
const ROLE_DEFAULT_DOMAIN = {
  admin: 'accounts',
  operation_manager: 'production',
  customer_service: 'clients',
  graphic_designer: 'design',
  design_operator: 'design',
  production_agent: 'production',
  shipping_officer: 'shipping',
  wallet_manager: 'accounts',
};

const FALLBACK_DOMAIN = 'inbox';

export function getAllowedDomains(role, permissions) {
  const r = role || 'customer_service';
  const allowed = ROLE_DOMAINS[r] || ['inbox'];

  // مستقبلاً: نقدر نـ override من permissions object (per-user)
  // permissions.domains = [...] للـ explicit override
  if (permissions && Array.isArray(permissions.domains) && permissions.domains.length) {
    return permissions.domains.filter(d => allowed.includes(d) || ['admin', 'operation_manager'].includes(r));
  }

  return allowed.slice();
}

export function canSeeDomain(domainId, role, permissions) {
  const allowed = getAllowedDomains(role, permissions);
  return allowed.includes(domainId);
}

export function getDefaultDomain(role) {
  return ROLE_DEFAULT_DOMAIN[role || 'customer_service'] || FALLBACK_DOMAIN;
}
