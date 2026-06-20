/**
 * core/permissions-matrix.js — مصدر واحد للأذونات والـ Role/Field matrix
 *
 * RULE 8 governance: كل قرار صلاحية يمر هنا.
 *
 * ══════════════════════════════════════════════════════════
 * ENTERPRISE RBAC BRIDGE
 * ══════════════════════════════════════════════════════════
 * This file now serves as the backward-compatible bridge to the
 * new Enterprise RBAC system in core/rbac/.
 *
 * All existing exports (canSeeField, canDo, hasPage, maskPhone,
 * DEFAULT_PERMISSIONS, DEFAULT_CAPABILITIES, ROLE_PAGES, etc.)
 * continue to work exactly as before.
 *
 * New code should prefer importing from core/rbac/index.js directly.
 * ══════════════════════════════════════════════════════════
 *
 * الاستخدام:
 *   import { canSeeField, ROLE_CAN_SEE, SENSITIVE_FIELDS } from './core/permissions-matrix.js';
 *   if (canSeeField('client_phone', userRole, userPerms)) { show(phone); } else { show(masked); }
 *
 * الـ governance: هذا Stable Core (RULE G1) — يحتاج 2-reviewer لأي تعديل.
 * أي إضافة لحقل حساس جديد:
 *   1) أضف الحقل إلى SENSITIVE_FIELDS Set
 *   2) أضف rule في firestore.rules
 *   3) حدّث viewas.js لاستخدام نفس الـ matrix
 *
 * المرجع: CLAUDE.md RULE 8 + REGRESSION_PREVENTION.md §7.
 */

// ══ Re-export the full RBAC system for new code ══════════
export {
  P,
  ACTIONS,
  MODULES,
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_IDS,
  getSystemRole,
  createBlankRole,
  cloneRole,
  createPermissionContext,
  check,
  checkAll,
  checkAny,
  checkField,
  checkPage,
  checkDomain,
  checkStageAccess,
  checkStageAdvance,
  checkStageRevert,
  getEffectivePermissions,
  getPermissionDiff,
  getPermissionSummary,
  comparePermissions,
  validateRoleDefinition,
  validateUserOverrides,
} from './rbac/index.js';

// ══ Role × Field Access Matrix ══════════════════════════
// كل دور: ما الحقول التي يقدر يراها افتراضياً.
// users.permissions في Firestore يقدر يُعدِّل هذه على مستوى المستخدم.
export const DEFAULT_PERMISSIONS = {
  admin: {
    price_sale:true, price_paid:true, price_remaining:true, price_cost:true, price_margin:true,
    client_phone:true, design_data:true,
    supplier_name:true, supplier_cost:true, supplier_phone:true,
    reports_sales:true, reports_perf:true, kpi_revenue:true,
    ship_cost:true, ship_company:true
  },
  operation_manager: {
    price_sale:true, price_paid:true, price_remaining:true, price_cost:true, price_margin:true,
    client_phone:true, design_data:false,
    supplier_name:true, supplier_cost:true, supplier_phone:true,
    reports_sales:true, reports_perf:true, kpi_revenue:true,
    ship_cost:true, ship_company:true
  },
  customer_service: {
    price_sale:true, price_paid:true, price_remaining:true, price_cost:false, price_margin:false,
    client_phone:true, design_data:true,
    supplier_name:false, supplier_cost:false, supplier_phone:false,
    reports_sales:false, reports_perf:false, kpi_revenue:false,
    ship_cost:false, ship_company:true
  },
  graphic_designer: {
    price_sale:false, price_paid:false, price_remaining:false, price_cost:false, price_margin:false,
    client_phone:false, design_data:true,
    supplier_name:false, supplier_cost:false, supplier_phone:false,
    reports_sales:false, reports_perf:false, kpi_revenue:false,
    ship_cost:false, ship_company:false
  },
  design_operator: {
    price_sale:false, price_paid:false, price_remaining:false, price_cost:false, price_margin:false,
    client_phone:false, design_data:true,
    supplier_name:true, supplier_cost:false, supplier_phone:false,
    reports_sales:false, reports_perf:true, kpi_revenue:false,
    ship_cost:false, ship_company:false
  },
  production_agent: {
    price_sale:false, price_paid:false, price_remaining:false, price_cost:true, price_margin:false,
    client_phone:false, design_data:true,
    supplier_name:true, supplier_cost:true, supplier_phone:true,
    reports_sales:false, reports_perf:false, kpi_revenue:false,
    ship_cost:false, ship_company:false
  },
  shipping_officer: {
    price_sale:false, price_paid:false, price_remaining:true, price_cost:false, price_margin:false,
    client_phone:true, design_data:false,
    supplier_name:false, supplier_cost:false, supplier_phone:false,
    reports_sales:false, reports_perf:false, kpi_revenue:false,
    ship_cost:true, ship_company:true
  },
  wallet_manager: {
    price_sale:true, price_paid:true, price_remaining:true, price_cost:true, price_margin:true,
    client_phone:false, design_data:false,
    supplier_name:true, supplier_cost:true, supplier_phone:true,
    reports_sales:true, reports_perf:false, kpi_revenue:true,
    ship_cost:true, ship_company:true
  },
};

// ══ Sensitive Fields — fail-closed by default ══════════════
export const SENSITIVE_FIELDS = new Set([
  'client_phone',
  'design_data',
  'supplier_cost',
  'supplier_phone',
  'price_cost',
  'price_margin',
]);

// ══ Role-Based Visibility Sets (مرآة لـ RULE 8) ══════════
// تستخدمها viewas.js لـ DOM masking + UI للـ canSee shortcuts.
export const ROLE_CAN_SEE_PHONE = new Set([
  'admin', 'operation_manager', 'customer_service', 'shipping_officer'
]);
export const ROLE_CAN_SEE_DESIGN = new Set([
  'admin', 'customer_service', 'graphic_designer', 'design_operator', 'production_agent'
]);
export const ROLE_CAN_SEE_COST = new Set([
  'admin', 'operation_manager', 'production_agent', 'wallet_manager'
]);
export const ROLE_CAN_SEE_MARGIN = new Set([
  'admin', 'operation_manager', 'wallet_manager'
]);
export const ROLE_CAN_SEE_PRICES = new Set([
  'admin', 'operation_manager', 'customer_service', 'wallet_manager'
]);

// ══ Permission Check ══════════════════════════════════════
/**
 * Check لو user يقدر يشوف حقل معين.
 * Order of resolution:
 *   1) user-level override (users.permissions[field])
 *   2) role default (DEFAULT_PERMISSIONS[role][field])
 *   3) fail-closed على sensitive، open على non-sensitive
 */
export function canSeeField(field, userRole, userPerms) {
  if (userPerms && userPerms[field] !== undefined) return userPerms[field];
  const def = DEFAULT_PERMISSIONS[userRole]?.[field];
  if (def !== undefined) return def;
  return !SENSITIVE_FIELDS.has(field);
}

/**
 * Mask phone number for display to roles without `client_phone` permission.
 *   01234567890 → 012****890
 * Safe على null/empty input.
 */
export function maskPhone(phone, canShow = false) {
  if (!phone) return '';
  if (canShow) return phone;
  const s = String(phone).replace(/\D/g, '');
  if (s.length < 6) return '****';
  return s.slice(0, 3) + '****' + s.slice(-3);
}

// ══════════════════════════════════════════════════════════
// CAPABILITY PERMISSIONS — RULE P1 (Action-Level Permissions)
// ══════════════════════════════════════════════════════════

export const CAPABILITIES = Object.freeze({
  VIEW_ORDERS:        'view_orders',
  CREATE_ORDERS:      'create_orders',
  EDIT_ORDERS:        'edit_orders',
  ARCHIVE_ORDERS:     'archive_orders',
  VIEW_CLIENTS:       'view_clients',
  EDIT_CLIENTS:       'edit_clients',
  UPLOAD_DESIGNS:     'upload_designs',
  APPROVE_DESIGNS:    'approve_designs',
  MANAGE_PRINTING:    'manage_printing',
  MANAGE_SHIPPING:    'manage_shipping',
  VIEW_ALL_SHIPMENTS: 'view_all_shipments',
  VIEW_FINANCIALS:    'view_financials',
  MANAGE_PAYMENTS:    'manage_payments',
  EXECUTE_PAYMENTS:        'execute_payments',
  FINAL_APPROVE_PAYMENTS:  'final_approve_payments',
  MANAGE_RETURNS:     'manage_returns',
  MANAGE_EMPLOYEES:        'manage_employees',
  MANAGE_ATTENDANCE:       'manage_attendance',
  MANAGE_PRODUCTS:         'manage_products',
  MANAGE_SUPPLIERS:        'manage_suppliers',
  MANAGE_SUPPLIER_PAYMENTS:'manage_supplier_payments',
  SYSTEM_SETTINGS:         'system_settings',
});

export const DEFAULT_CAPABILITIES = {
  admin: {
    execute_payments:true, final_approve_payments:true,
    view_orders:true, create_orders:true, edit_orders:true, archive_orders:true,
    view_clients:true, edit_clients:true,
    upload_designs:true, approve_designs:true,
    manage_printing:true, manage_shipping:true, view_all_shipments:true,
    view_financials:true, manage_payments:true,
    manage_returns:true, manage_employees:true, manage_attendance:true, manage_products:true, manage_suppliers:true, manage_supplier_payments:true, system_settings:true,
  },
  operation_manager: {
    execute_payments:true, final_approve_payments:false,
    view_orders:true, create_orders:true, edit_orders:true, archive_orders:true,
    view_clients:true, edit_clients:true,
    upload_designs:true, approve_designs:true,
    manage_printing:true, manage_shipping:true, view_all_shipments:true,
    view_financials:true, manage_payments:true,
    manage_returns:true, manage_employees:true, manage_attendance:true, manage_products:true, manage_suppliers:true, manage_supplier_payments:true, system_settings:false,
  },
  customer_service: {
    execute_payments:false, final_approve_payments:false,
    view_orders:true, create_orders:true, edit_orders:true, archive_orders:false,
    view_clients:true, edit_clients:true,
    upload_designs:true, approve_designs:false,
    manage_printing:false, manage_shipping:false, view_all_shipments:false,
    view_financials:true, manage_payments:true,
    manage_returns:true, manage_employees:false, manage_attendance:false, manage_products:false, manage_suppliers:false, manage_supplier_payments:false, system_settings:false,
  },
  graphic_designer: {
    execute_payments:false, final_approve_payments:false,
    view_orders:true, create_orders:false, edit_orders:false, archive_orders:false,
    view_clients:false, edit_clients:false,
    upload_designs:true, approve_designs:false,
    manage_printing:false, manage_shipping:false, view_all_shipments:false,
    view_financials:false, manage_payments:false,
    manage_returns:false, manage_employees:false, manage_attendance:false, manage_products:false, manage_suppliers:false, manage_supplier_payments:false, system_settings:false,
  },
  design_operator: {
    execute_payments:false, final_approve_payments:false,
    view_orders:true, create_orders:false, edit_orders:true, archive_orders:false,
    view_clients:false, edit_clients:false,
    upload_designs:true, approve_designs:true,
    manage_printing:false, manage_shipping:false, view_all_shipments:false,
    view_financials:false, manage_payments:false,
    manage_returns:false, manage_employees:false, manage_attendance:false, manage_products:false, manage_suppliers:false, manage_supplier_payments:false, system_settings:false,
  },
  production_agent: {
    execute_payments:false, final_approve_payments:false,
    view_orders:true, create_orders:false, edit_orders:true, archive_orders:true,
    view_clients:false, edit_clients:false,
    upload_designs:false, approve_designs:false,
    manage_printing:true, manage_shipping:false, view_all_shipments:false,
    view_financials:false, manage_payments:false,
    manage_returns:false, manage_employees:false, manage_attendance:false, manage_products:false, manage_suppliers:false, manage_supplier_payments:false, system_settings:false,
  },
  shipping_officer: {
    execute_payments:false, final_approve_payments:false,
    view_orders:true, create_orders:false, edit_orders:true, archive_orders:true,
    view_clients:false, edit_clients:false,
    upload_designs:false, approve_designs:false,
    manage_printing:false, manage_shipping:true, view_all_shipments:false,
    view_financials:false, manage_payments:false,
    manage_returns:false, manage_employees:false, manage_attendance:false, manage_products:false, manage_suppliers:false, manage_supplier_payments:false, system_settings:false,
  },
  wallet_manager: {
    execute_payments:false, final_approve_payments:false,
    view_orders:true, create_orders:false, edit_orders:false, archive_orders:false,
    view_clients:false, edit_clients:false,
    upload_designs:false, approve_designs:false,
    manage_printing:false, manage_shipping:false, view_all_shipments:false,
    view_financials:true, manage_payments:true,
    manage_returns:true, manage_employees:false, manage_attendance:false, manage_products:false, manage_suppliers:false, manage_supplier_payments:true, system_settings:false,
  },
};

// ══════════════════════════════════════════════════════════
// DEFAULT_ROLE_PERMISSIONS — Legacy `users.permissions` shape
// ══════════════════════════════════════════════════════════

export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  admin: {
    pages: ['*'],
    canSeePrices: true, canSeeAllOrders: true, canAddOrders: true,
    canViewClients: true, canAddClients: true,
    canAssignDesigner: true, canAssignTasks: true,
    canViewCosts: true, canAccessAccounts: true, canAccessEmployees: true,
  },
  operation_manager: {
    pages: ['*'],
    canSeePrices: true, canSeeAllOrders: true, canAddOrders: true,
    canViewClients: true, canAddClients: true,
    canAssignDesigner: true, canAssignTasks: true,
    canViewCosts: true, canAccessAccounts: true, canAccessEmployees: false,
  },
  customer_service: {
    pages: ['clients', 'design', 'cs-dashboard'],
    canSeePrices: true, canSeeAllOrders: false, canAddOrders: true,
    canViewClients: true, canAddClients: true,
    canAssignDesigner: true, canAssignTasks: false,
    canViewCosts: false, canAccessAccounts: false, canAccessEmployees: false,
  },
  graphic_designer: {
    pages: ['design', 'designer-dashboard'],
    canSeePrices: false, canSeeAllOrders: false, canAddOrders: false,
    canViewClients: false, canAddClients: false,
    canAssignDesigner: false, canAssignTasks: false,
    canViewCosts: false, canAccessAccounts: false, canAccessEmployees: false,
  },
  design_operator: {
    pages: ['design', 'designer-dashboard'],
    canSeePrices: false, canSeeAllOrders: false, canAddOrders: true,
    canViewClients: false, canAddClients: false,
    canAssignDesigner: true, canAssignTasks: false,
    canViewCosts: false, canAccessAccounts: false, canAccessEmployees: false,
  },
  production_agent: {
    pages: ['production', 'production-dashboard', 'cost-items-library'],
    canSeePrices: false, canSeeAllOrders: false, canAddOrders: false,
    canViewClients: false, canAddClients: false,
    canAssignDesigner: false, canAssignTasks: false,
    canViewCosts: true, canAccessAccounts: false, canAccessEmployees: false,
  },
  shipping_officer: {
    pages: ['shipping', 'shipping-dashboard', 'shipping-accounts', 'shipping-followup'],
    canSeePrices: false, canSeeAllOrders: false, canAddOrders: false,
    canViewClients: true, canAddClients: false,
    canAssignDesigner: false, canAssignTasks: false,
    canViewCosts: false, canAccessAccounts: false, canAccessEmployees: false,
  },
  wallet_manager: {
    pages: ['accounts', 'reports'],
    canSeePrices: true, canSeeAllOrders: true, canAddOrders: false,
    canViewClients: true, canAddClients: false,
    canAssignDesigner: false, canAssignTasks: false,
    canViewCosts: true, canAccessAccounts: true, canAccessEmployees: false,
  },
});

/** يُرجع نسخة قابلة للتعديل (mutable copy) من الـ defaults للـ role */
export function getRoleDefaultPermissions(role) {
  const def = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.customer_service;
  return JSON.parse(JSON.stringify(def));
}

/**
 * canDo — التحقق من قدرة المستخدم على فعل معين (RULE P1).
 *
 * Order of resolution:
 *   1) user-level override (users.permissions.capabilities[capability])
 *   2) role default (DEFAULT_CAPABILITIES[role][capability])
 *   3) fail-closed (false)
 */
export function canDo(capability, userRole, userPerms) {
  if (!capability) return false;
  const caps = userPerms?.capabilities;
  if (caps && caps[capability] !== undefined) return !!caps[capability];
  const def = DEFAULT_CAPABILITIES[userRole]?.[capability];
  if (def !== undefined) return def;
  return false;
}

/** alias مرادف لـ canDo */
export const hasCapability = canDo;

// ══════════════════════════════════════════════════════════
// PAGE PERMISSIONS — الطبقة الأولى (Page-level access)
// ══════════════════════════════════════════════════════════

export const ROLE_PAGES = Object.freeze(
  Object.fromEntries(
    Object.entries(DEFAULT_ROLE_PERMISSIONS).map(
      ([role, p]) => [role, Object.freeze([...(p.pages || [])])]
    )
  )
);

/**
 * hasPage — هل يملك المستخدم صلاحية الوصول لصفحة معيّنة؟
 */
export function hasPage(page, userRole, userPerms) {
  if (!page) return false;
  const pages = (userPerms && Array.isArray(userPerms.pages))
    ? userPerms.pages
    : (ROLE_PAGES[userRole] || ROLE_PAGES.customer_service || []);
  return pages.includes('*') || pages.includes(page);
}
