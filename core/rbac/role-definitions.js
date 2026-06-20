/**
 * core/rbac/role-definitions.js — Built-in Role Templates
 *
 * Roles are TEMPLATES — default bundles of permissions.
 * The actual permissions for any user are resolved by the RBAC engine:
 *   user override → role template → deny (fail-closed).
 *
 * Roles defined here are "system roles" — cannot be deleted, only modified.
 * Custom roles are stored in Firestore `roles/{roleId}` with the same shape.
 *
 * Each role defines:
 *   - id, label (ar/en), description
 *   - isSystem: true (built-in, cannot delete)
 *   - permissions: { [permissionKey]: true/false }
 *   - pages: string[] (page-level access, '*' = all)
 *   - domains: string[] (navigation rail domains)
 *   - defaultDomain: string (landing page domain)
 */

import { P } from './permission-keys.js';

// ══════════════════════════════════════════════════════════
// Helper: creates a full permission map with all keys = false,
// then merges in the granted permissions as true.
// ══════════════════════════════════════════════════════════
function buildPerms(granted) {
  const map = {};
  for (const key of Object.values(P)) {
    map[key] = false;
  }
  for (const key of granted) {
    map[key] = true;
  }
  return map;
}

// ══════════════════════════════════════════════════════════
// SYSTEM ROLES — the 8 built-in roles migrated to enterprise format
// ══════════════════════════════════════════════════════════

const ADMIN = {
  id: 'admin',
  label: { ar: 'مدير النظام', en: 'System Admin' },
  description: { ar: 'صلاحيات كاملة على كل النظام', en: 'Full system access' },
  isSystem: true,
  permissions: buildPerms(Object.values(P)),
  pages: ['*'],
  domains: ['clients', 'design', 'production', 'shipping', 'accounts', 'reports', 'attendance', 'inbox', 'admin'],
  defaultDomain: 'accounts',
};

const OPERATION_MANAGER = {
  id: 'operation_manager',
  label: { ar: 'مدير العمليات', en: 'Operations Manager' },
  description: { ar: 'إدارة العمليات التشغيلية والمالية', en: 'Operations & financial management' },
  isSystem: true,
  permissions: buildPerms([
    // Orders — full
    P.ORDERS_VIEW, P.ORDERS_CREATE, P.ORDERS_EDIT, P.ORDERS_DELETE,
    P.ORDERS_PRINT, P.ORDERS_EXPORT, P.ORDERS_VIEW_ALL,
    P.ORDERS_SPLIT, P.ORDERS_MERGE, P.ORDERS_CANCEL,
    // Order stages — full
    P.ORDERS_STAGE_DESIGN_VIEW, P.ORDERS_STAGE_DESIGN_ADVANCE, P.ORDERS_STAGE_DESIGN_REVERT, P.ORDERS_STAGE_DESIGN_ASSIGN,
    P.ORDERS_STAGE_PRINTING_VIEW, P.ORDERS_STAGE_PRINTING_ADVANCE, P.ORDERS_STAGE_PRINTING_REVERT,
    P.ORDERS_STAGE_PRODUCTION_VIEW, P.ORDERS_STAGE_PRODUCTION_ADVANCE, P.ORDERS_STAGE_PRODUCTION_REVERT,
    P.ORDERS_STAGE_SHIPPING_VIEW, P.ORDERS_STAGE_SHIPPING_ADVANCE, P.ORDERS_STAGE_SHIPPING_REVERT,
    P.ORDERS_STAGE_ARCHIVE_VIEW, P.ORDERS_STAGE_ARCHIVE_EXECUTE, P.ORDERS_STAGE_ARCHIVE_REVERT,
    // Order costs & payments
    P.ORDERS_COSTS_VIEW, P.ORDERS_COSTS_CREATE, P.ORDERS_COSTS_EDIT, P.ORDERS_COSTS_DELETE, P.ORDERS_COSTS_APPROVE,
    P.ORDERS_PAYMENTS_VIEW, P.ORDERS_PAYMENTS_RECORD, P.ORDERS_PAYMENTS_REFUND, P.ORDERS_PAYMENTS_DISCOUNT,
    // Clients — full
    P.CLIENTS_VIEW, P.CLIENTS_CREATE, P.CLIENTS_EDIT, P.CLIENTS_DELETE, P.CLIENTS_EXPORT,
    P.CLIENTS_VIEW_PHONE, P.CLIENTS_VIEW_EMAIL, P.CLIENTS_VIEW_ADDRESS, P.CLIENTS_VIEW_BALANCE,
    P.CLIENTS_FOLLOWUP_CREATE, P.CLIENTS_FOLLOWUP_EDIT, P.CLIENTS_FOLLOWUP_DELETE, P.CLIENTS_BIZCARD_MANAGE,
    // Design
    P.DESIGN_VIEW, P.DESIGN_UPLOAD, P.DESIGN_APPROVE, P.DESIGN_REJECT,
    P.DESIGN_ASSIGN, P.DESIGN_VIEW_NOTES,
    // Printing
    P.PRINTING_VIEW, P.PRINTING_MANAGE, P.PRINTING_HANDOFF, P.PRINTING_VIEW_BRIEF,
    // Production
    P.PRODUCTION_VIEW, P.PRODUCTION_MANAGE,
    P.PRODUCTION_COSTS_VIEW, P.PRODUCTION_COSTS_MANAGE, P.PRODUCTION_SUPPLIER_REQ,
    // Shipping
    P.SHIPPING_VIEW, P.SHIPPING_MANAGE, P.SHIPPING_VIEW_ALL,
    P.SHIPPING_RECORD, P.SHIPPING_DELIVERY, P.SHIPPING_COLLECTION,
    P.SHIPPING_RETURN, P.SHIPPING_SETTLE,
    P.SHIPPING_ACCOUNTS_VIEW, P.SHIPPING_ACCOUNTS_MANAGE,
    P.SHIPPING_PRICING_VIEW, P.SHIPPING_PRICING_MANAGE,
    P.SHIPPING_FOLLOWUP_VIEW,
    // Financials — full except final approve
    P.FINANCIALS_VIEW, P.FINANCIALS_EXPORT,
    P.FINANCIALS_WALLETS_VIEW, P.FINANCIALS_WALLETS_CREATE, P.FINANCIALS_WALLETS_EDIT,
    P.FINANCIALS_WALLETS_TRANSFER, P.FINANCIALS_WALLETS_RECONCILE,
    P.FINANCIALS_TX_VIEW, P.FINANCIALS_TX_CREATE, P.FINANCIALS_TX_EDIT,
    P.FINANCIALS_LEDGER_VIEW, P.FINANCIALS_LEDGER_EXPORT,
    P.FINANCIALS_PAYMENTS_EXECUTE,
    // NOT: FINANCIALS_PAYMENTS_APPROVE (admin only)
    // Sensitive fields
    P.FIELD_PRICE_SALE, P.FIELD_PRICE_PAID, P.FIELD_PRICE_REMAINING,
    P.FIELD_PRICE_COST, P.FIELD_PRICE_MARGIN,
    P.FIELD_CLIENT_PHONE,
    // NOT: FIELD_DESIGN_DATA (ops doesn't see design files)
    P.FIELD_SUPPLIER_NAME, P.FIELD_SUPPLIER_COST, P.FIELD_SUPPLIER_PHONE,
    P.FIELD_REPORTS_SALES, P.FIELD_REPORTS_PERF, P.FIELD_KPI_REVENUE,
    P.FIELD_SHIP_COST, P.FIELD_SHIP_COMPANY,
    // Approvals
    P.APPROVALS_VIEW, P.APPROVALS_CREATE, P.APPROVALS_EXECUTE, P.APPROVALS_REJECT,
    P.APPROVALS_ATTACH_RECEIPT,
    // Returns
    P.RETURNS_VIEW, P.RETURNS_CREATE, P.RETURNS_PROCESS, P.RETURNS_APPROVE, P.RETURNS_REFUND,
    // Employees
    P.EMPLOYEES_VIEW, P.EMPLOYEES_CREATE, P.EMPLOYEES_EDIT,
    P.EMPLOYEES_VIEW_SALARY, P.EMPLOYEES_MANAGE_SALARY,
    P.EMPLOYEES_VIEW_INCIDENTS, P.EMPLOYEES_MANAGE_INCIDENTS,
    P.EMPLOYEES_VIEW_LEAVES, P.EMPLOYEES_MANAGE_LEAVES,
    P.EMPLOYEES_VIEW_GOALS, P.EMPLOYEES_MANAGE_GOALS,
    P.EMPLOYEES_VIEW_EVALS, P.EMPLOYEES_MANAGE_EVALS,
    P.EMPLOYEES_MANAGE_TASKS, P.EMPLOYEES_MANAGE_SCHEDULE,
    // Attendance
    P.ATTENDANCE_VIEW, P.ATTENDANCE_RECORD, P.ATTENDANCE_MANAGE, P.ATTENDANCE_EXPORT,
    // Suppliers
    P.SUPPLIERS_VIEW, P.SUPPLIERS_CREATE, P.SUPPLIERS_EDIT, P.SUPPLIERS_DELETE,
    P.SUPPLIERS_PAYMENTS_VIEW, P.SUPPLIERS_PAYMENTS_RECORD,
    P.SUPPLIERS_ORDERS_VIEW, P.SUPPLIERS_ORDERS_CREATE, P.SUPPLIERS_ORDERS_EDIT,
    // Products
    P.PRODUCTS_VIEW, P.PRODUCTS_CREATE, P.PRODUCTS_EDIT, P.PRODUCTS_DELETE,
    P.PRODUCTS_PRICING_MANAGE, P.PRODUCTS_CATALOG_PUBLISH,
    // Reports
    P.REPORTS_VIEW, P.REPORTS_EXPORT,
    P.REPORTS_SALES, P.REPORTS_PERFORMANCE, P.REPORTS_FINANCIAL_KPI,
    P.REPORTS_COLLECTION, P.REPORTS_RETURNS, P.REPORTS_APPROVALS,
    P.REPORTS_TIMESERIES, P.REPORTS_PRIORITIES,
    // Dashboards
    P.DASHBOARD_EXEC, P.DASHBOARD_OPS, P.DASHBOARD_CS,
    P.DASHBOARD_PRODUCTION, P.DASHBOARD_SHIPPING, P.DASHBOARD_FINANCIAL,
    // Conversations
    P.CONVERSATIONS_VIEW, P.CONVERSATIONS_CREATE,
    P.CONVERSATIONS_SEND_MESSAGE, P.CONVERSATIONS_EDIT_MESSAGE,
    P.CONVERSATIONS_DELETE_MESSAGE, P.CONVERSATIONS_PIN_MESSAGE,
    P.CONVERSATIONS_INTERNAL, P.CONVERSATIONS_CLIENT, P.CONVERSATIONS_ORDER_THREAD,
    // Inbox
    P.INBOX_VIEW, P.INBOX_STORIES_POST, P.INBOX_STORIES_DELETE,
    // Gallery
    P.GALLERY_VIEW, P.GALLERY_PUBLISH, P.GALLERY_EDIT, P.GALLERY_DELETE, P.GALLERY_FEATURE,
    // Settings — no system_settings
    P.SETTINGS_VIEW, P.SETTINGS_MASTER_LISTS,
    // Audit
    P.AUDIT_VIEW, P.AUDIT_EXPORT,
  ]),
  pages: ['*'],
  domains: ['clients', 'design', 'production', 'shipping', 'accounts', 'reports', 'attendance', 'inbox', 'admin'],
  defaultDomain: 'production',
};

const CUSTOMER_SERVICE = {
  id: 'customer_service',
  label: { ar: 'خدمة العملاء', en: 'Customer Service' },
  description: { ar: 'التعامل مع العملاء وإدارة الطلبات', en: 'Client handling & order management' },
  isSystem: true,
  permissions: buildPerms([
    // Orders
    P.ORDERS_VIEW, P.ORDERS_CREATE, P.ORDERS_EDIT, P.ORDERS_PRINT,
    // Order stages (design only)
    P.ORDERS_STAGE_DESIGN_VIEW, P.ORDERS_STAGE_DESIGN_ADVANCE, P.ORDERS_STAGE_DESIGN_ASSIGN,
    P.ORDERS_STAGE_PRINTING_VIEW,
    // Order payments
    P.ORDERS_PAYMENTS_VIEW, P.ORDERS_PAYMENTS_RECORD, P.ORDERS_PAYMENTS_DISCOUNT,
    // Clients — full CRM
    P.CLIENTS_VIEW, P.CLIENTS_CREATE, P.CLIENTS_EDIT,
    P.CLIENTS_VIEW_PHONE, P.CLIENTS_VIEW_EMAIL, P.CLIENTS_VIEW_ADDRESS, P.CLIENTS_VIEW_BALANCE,
    P.CLIENTS_FOLLOWUP_CREATE, P.CLIENTS_FOLLOWUP_EDIT, P.CLIENTS_FOLLOWUP_DELETE,
    P.CLIENTS_BIZCARD_MANAGE,
    // Design
    P.DESIGN_VIEW, P.DESIGN_UPLOAD, P.DESIGN_ASSIGN,
    P.DESIGN_VIEW_FILES, P.DESIGN_DOWNLOAD_FILES,
    P.DESIGN_SEND_TO_CLIENT, P.DESIGN_VIEW_NOTES,
    // Sensitive fields (CS can see)
    P.FIELD_PRICE_SALE, P.FIELD_PRICE_PAID, P.FIELD_PRICE_REMAINING,
    P.FIELD_CLIENT_PHONE, P.FIELD_DESIGN_DATA, P.FIELD_SHIP_COMPANY,
    // Financials (limited view)
    P.FINANCIALS_VIEW,
    P.FINANCIALS_TX_VIEW, P.FINANCIALS_TX_CREATE,
    // Returns
    P.RETURNS_VIEW, P.RETURNS_CREATE, P.RETURNS_PROCESS,
    // Conversations
    P.CONVERSATIONS_VIEW, P.CONVERSATIONS_CREATE,
    P.CONVERSATIONS_SEND_MESSAGE, P.CONVERSATIONS_EDIT_MESSAGE,
    P.CONVERSATIONS_INTERNAL, P.CONVERSATIONS_CLIENT, P.CONVERSATIONS_ORDER_THREAD,
    // Inbox
    P.INBOX_VIEW, P.INBOX_STORIES_POST,
    // Dashboards
    P.DASHBOARD_CS,
    // Reports (limited)
    P.REPORTS_VIEW, P.REPORTS_COLLECTION,
    // Approvals
    P.APPROVALS_VIEW, P.APPROVALS_CREATE,
  ]),
  pages: ['clients', 'design', 'cs-dashboard'],
  domains: ['clients', 'design', 'shipping', 'reports', 'inbox'],
  defaultDomain: 'clients',
};

const GRAPHIC_DESIGNER = {
  id: 'graphic_designer',
  label: { ar: 'مصمم جرافيك', en: 'Graphic Designer' },
  description: { ar: 'تصميم وتسليم الملفات', en: 'Design creation & file delivery' },
  isSystem: true,
  permissions: buildPerms([
    // Orders (view only — assigned orders)
    P.ORDERS_VIEW,
    // Order stages (design view only)
    P.ORDERS_STAGE_DESIGN_VIEW,
    // Design
    P.DESIGN_VIEW, P.DESIGN_UPLOAD,
    P.DESIGN_VIEW_FILES, P.DESIGN_DOWNLOAD_FILES,
    P.DESIGN_SEND_TO_CLIENT, P.DESIGN_VIEW_NOTES,
    // Sensitive fields
    P.FIELD_DESIGN_DATA,
    // Conversations
    P.CONVERSATIONS_VIEW, P.CONVERSATIONS_SEND_MESSAGE,
    P.CONVERSATIONS_INTERNAL, P.CONVERSATIONS_ORDER_THREAD,
    // Inbox
    P.INBOX_VIEW,
    // Gallery
    P.GALLERY_VIEW, P.GALLERY_PUBLISH,
    // Dashboard
    P.DASHBOARD_DESIGNER,
  ]),
  pages: ['design', 'designer-dashboard'],
  domains: ['design', 'inbox'],
  defaultDomain: 'design',
};

const DESIGN_OPERATOR = {
  id: 'design_operator',
  label: { ar: 'مشرف التصميم', en: 'Design Operator' },
  description: { ar: 'إشراف على التصميم واعتماده', en: 'Design supervision & approval' },
  isSystem: true,
  permissions: buildPerms([
    // Orders
    P.ORDERS_VIEW, P.ORDERS_EDIT,
    // Order stages (design full, printing view)
    P.ORDERS_STAGE_DESIGN_VIEW, P.ORDERS_STAGE_DESIGN_ADVANCE,
    P.ORDERS_STAGE_DESIGN_REVERT, P.ORDERS_STAGE_DESIGN_ASSIGN,
    P.ORDERS_STAGE_PRINTING_VIEW,
    // Design — full
    P.DESIGN_VIEW, P.DESIGN_UPLOAD, P.DESIGN_APPROVE, P.DESIGN_REJECT,
    P.DESIGN_ASSIGN, P.DESIGN_VIEW_FILES, P.DESIGN_DOWNLOAD_FILES,
    P.DESIGN_SEND_TO_CLIENT, P.DESIGN_VIEW_NOTES,
    // Sensitive fields
    P.FIELD_DESIGN_DATA, P.FIELD_SUPPLIER_NAME, P.FIELD_REPORTS_PERF,
    // Conversations
    P.CONVERSATIONS_VIEW, P.CONVERSATIONS_CREATE,
    P.CONVERSATIONS_SEND_MESSAGE, P.CONVERSATIONS_EDIT_MESSAGE,
    P.CONVERSATIONS_INTERNAL, P.CONVERSATIONS_CLIENT, P.CONVERSATIONS_ORDER_THREAD,
    // Inbox
    P.INBOX_VIEW, P.INBOX_STORIES_POST,
    // Gallery
    P.GALLERY_VIEW, P.GALLERY_PUBLISH, P.GALLERY_EDIT,
    // Dashboard
    P.DASHBOARD_DESIGNER,
    // Reports (performance only)
    P.REPORTS_VIEW, P.REPORTS_PERFORMANCE,
  ]),
  pages: ['design', 'designer-dashboard'],
  domains: ['design', 'inbox'],
  defaultDomain: 'design',
};

const PRODUCTION_AGENT = {
  id: 'production_agent',
  label: { ar: 'مسؤول الإنتاج', en: 'Production Agent' },
  description: { ar: 'إدارة الإنتاج والتكاليف والموردين', en: 'Production, costs & vendor management' },
  isSystem: true,
  permissions: buildPerms([
    // Orders
    P.ORDERS_VIEW, P.ORDERS_EDIT,
    // Order stages (production manage + view, NO advance to shipping)
    P.ORDERS_STAGE_PRINTING_VIEW, P.ORDERS_STAGE_PRINTING_ADVANCE, P.ORDERS_STAGE_PRINTING_REVERT,
    P.ORDERS_STAGE_PRODUCTION_VIEW, P.ORDERS_STAGE_PRODUCTION_REVERT,
    P.ORDERS_STAGE_SHIPPING_VIEW,
    P.ORDERS_STAGE_ARCHIVE_VIEW, P.ORDERS_STAGE_ARCHIVE_EXECUTE,
    // Order costs
    P.ORDERS_COSTS_VIEW, P.ORDERS_COSTS_CREATE, P.ORDERS_COSTS_EDIT, P.ORDERS_COSTS_DELETE,
    // Printing
    P.PRINTING_VIEW, P.PRINTING_MANAGE, P.PRINTING_HANDOFF, P.PRINTING_VIEW_BRIEF,
    // Production — full
    P.PRODUCTION_VIEW, P.PRODUCTION_MANAGE,
    P.PRODUCTION_COSTS_VIEW, P.PRODUCTION_COSTS_MANAGE, P.PRODUCTION_SUPPLIER_REQ,
    // Design (view files for print)
    P.DESIGN_VIEW, P.DESIGN_VIEW_FILES, P.DESIGN_DOWNLOAD_FILES,
    // Sensitive fields
    P.FIELD_PRICE_COST, P.FIELD_DESIGN_DATA,
    P.FIELD_SUPPLIER_NAME, P.FIELD_SUPPLIER_COST, P.FIELD_SUPPLIER_PHONE,
    // Conversations
    P.CONVERSATIONS_VIEW, P.CONVERSATIONS_SEND_MESSAGE,
    P.CONVERSATIONS_INTERNAL, P.CONVERSATIONS_ORDER_THREAD,
    // Inbox
    P.INBOX_VIEW,
    // Dashboard
    P.DASHBOARD_PRODUCTION,
    // Suppliers (view)
    P.SUPPLIERS_VIEW, P.SUPPLIERS_ORDERS_VIEW,
  ]),
  pages: ['production', 'production-dashboard', 'cost-items-library'],
  domains: ['production', 'design', 'inbox'],
  defaultDomain: 'production',
};

const SHIPPING_OFFICER = {
  id: 'shipping_officer',
  label: { ar: 'مسؤول الشحن', en: 'Shipping Officer' },
  description: { ar: 'إدارة الشحن والتوصيل والتحصيل', en: 'Shipping, delivery & collection' },
  isSystem: true,
  permissions: buildPerms([
    // Orders
    P.ORDERS_VIEW, P.ORDERS_EDIT,
    // Order stages (shipping full, production view)
    P.ORDERS_STAGE_PRODUCTION_VIEW,
    P.ORDERS_STAGE_SHIPPING_VIEW, P.ORDERS_STAGE_SHIPPING_ADVANCE, P.ORDERS_STAGE_SHIPPING_REVERT,
    P.ORDERS_STAGE_ARCHIVE_VIEW, P.ORDERS_STAGE_ARCHIVE_EXECUTE,
    // Order payments (view remaining)
    P.ORDERS_PAYMENTS_VIEW,
    // Shipping — full
    P.SHIPPING_VIEW, P.SHIPPING_MANAGE, P.SHIPPING_RECORD,
    P.SHIPPING_DELIVERY, P.SHIPPING_COLLECTION, P.SHIPPING_RETURN,
    P.SHIPPING_ACCOUNTS_VIEW, P.SHIPPING_PRICING_VIEW, P.SHIPPING_FOLLOWUP_VIEW,
    // Sensitive fields
    P.FIELD_PRICE_REMAINING,
    P.FIELD_CLIENT_PHONE, P.FIELD_SHIP_COST, P.FIELD_SHIP_COMPANY,
    // Conversations
    P.CONVERSATIONS_VIEW, P.CONVERSATIONS_SEND_MESSAGE,
    P.CONVERSATIONS_INTERNAL, P.CONVERSATIONS_ORDER_THREAD,
    // Inbox
    P.INBOX_VIEW,
    // Dashboard
    P.DASHBOARD_SHIPPING,
    // Clients (phone/address for delivery)
    P.CLIENTS_VIEW, P.CLIENTS_VIEW_PHONE, P.CLIENTS_VIEW_ADDRESS,
  ]),
  pages: ['shipping', 'shipping-dashboard', 'shipping-accounts', 'shipping-followup'],
  domains: ['shipping', 'production', 'inbox'],
  defaultDomain: 'shipping',
};

const WALLET_MANAGER = {
  id: 'wallet_manager',
  label: { ar: 'مدير الحسابات', en: 'Wallet Manager' },
  description: { ar: 'إدارة المحافظ المالية والتسويات', en: 'Financial wallets & reconciliation' },
  isSystem: true,
  permissions: buildPerms([
    // Orders (view for financial context)
    P.ORDERS_VIEW, P.ORDERS_VIEW_ALL,
    P.ORDERS_COSTS_VIEW,
    P.ORDERS_PAYMENTS_VIEW,
    // All stage views
    P.ORDERS_STAGE_DESIGN_VIEW, P.ORDERS_STAGE_PRINTING_VIEW,
    P.ORDERS_STAGE_PRODUCTION_VIEW, P.ORDERS_STAGE_SHIPPING_VIEW,
    P.ORDERS_STAGE_ARCHIVE_VIEW,
    // Financials — full read + manage
    P.FINANCIALS_VIEW, P.FINANCIALS_EXPORT,
    P.FINANCIALS_WALLETS_VIEW, P.FINANCIALS_WALLETS_EDIT,
    P.FINANCIALS_WALLETS_TRANSFER, P.FINANCIALS_WALLETS_RECONCILE,
    P.FINANCIALS_TX_VIEW, P.FINANCIALS_TX_CREATE, P.FINANCIALS_TX_EDIT,
    P.FINANCIALS_LEDGER_VIEW, P.FINANCIALS_LEDGER_EXPORT,
    // Sensitive fields (prices + supplier costs)
    P.FIELD_PRICE_SALE, P.FIELD_PRICE_PAID, P.FIELD_PRICE_REMAINING,
    P.FIELD_PRICE_COST, P.FIELD_PRICE_MARGIN,
    P.FIELD_SUPPLIER_NAME, P.FIELD_SUPPLIER_COST, P.FIELD_SUPPLIER_PHONE,
    P.FIELD_REPORTS_SALES, P.FIELD_KPI_REVENUE,
    P.FIELD_SHIP_COST, P.FIELD_SHIP_COMPANY,
    // Approvals
    P.APPROVALS_VIEW,
    // Returns
    P.RETURNS_VIEW, P.RETURNS_PROCESS, P.RETURNS_REFUND,
    // Suppliers (payments)
    P.SUPPLIERS_VIEW, P.SUPPLIERS_PAYMENTS_VIEW, P.SUPPLIERS_PAYMENTS_RECORD,
    // Reports — financial focus
    P.REPORTS_VIEW, P.REPORTS_EXPORT,
    P.REPORTS_SALES, P.REPORTS_FINANCIAL_KPI,
    P.REPORTS_COLLECTION, P.REPORTS_RETURNS,
    // Dashboard
    P.DASHBOARD_FINANCIAL,
    // Conversations (limited)
    P.CONVERSATIONS_VIEW, P.CONVERSATIONS_SEND_MESSAGE,
    P.CONVERSATIONS_INTERNAL,
    // Inbox
    P.INBOX_VIEW,
    // Clients (balance context)
    P.CLIENTS_VIEW, P.CLIENTS_VIEW_BALANCE,
    // Shipping accounts (settlement)
    P.SHIPPING_SETTLE, P.SHIPPING_ACCOUNTS_VIEW,
  ]),
  pages: ['accounts', 'reports'],
  domains: ['accounts', 'reports', 'inbox'],
  defaultDomain: 'accounts',
};

// ══════════════════════════════════════════════════════════
// SYSTEM_ROLES — indexed by role ID
// ══════════════════════════════════════════════════════════
export const SYSTEM_ROLES = Object.freeze({
  admin:              Object.freeze(ADMIN),
  operation_manager:  Object.freeze(OPERATION_MANAGER),
  customer_service:   Object.freeze(CUSTOMER_SERVICE),
  graphic_designer:   Object.freeze(GRAPHIC_DESIGNER),
  design_operator:    Object.freeze(DESIGN_OPERATOR),
  production_agent:   Object.freeze(PRODUCTION_AGENT),
  shipping_officer:   Object.freeze(SHIPPING_OFFICER),
  wallet_manager:     Object.freeze(WALLET_MANAGER),
});

export const SYSTEM_ROLE_IDS = Object.freeze(Object.keys(SYSTEM_ROLES));

/**
 * Get a role definition by ID (system or custom).
 * Custom roles would be loaded from Firestore; this returns
 * system roles synchronously.
 */
export function getSystemRole(roleId) {
  return SYSTEM_ROLES[roleId] || null;
}

/**
 * Create a blank custom role template.
 * All permissions default to false (least privilege).
 */
export function createBlankRole(id, labelAr, labelEn, description) {
  const perms = {};
  for (const key of Object.values(P)) {
    perms[key] = false;
  }
  return {
    id,
    label: { ar: labelAr || '', en: labelEn || '' },
    description: { ar: description || '', en: description || '' },
    isSystem: false,
    permissions: perms,
    pages: [],
    domains: ['inbox'],
    defaultDomain: 'inbox',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Clone an existing role as a base for a new custom role.
 */
export function cloneRole(sourceRoleId, newId, labelAr, labelEn) {
  const source = SYSTEM_ROLES[sourceRoleId];
  if (!source) return null;
  return {
    ...JSON.parse(JSON.stringify(source)),
    id: newId,
    label: { ar: labelAr || source.label.ar, en: labelEn || source.label.en },
    isSystem: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
