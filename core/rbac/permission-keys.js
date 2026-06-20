/**
 * core/rbac/permission-keys.js — Enterprise Permission Key Registry
 *
 * Every controllable resource in the system is represented as a permission key.
 * Format: `module.subresource:action`
 *
 * This is the SINGLE SOURCE OF TRUTH for all permission keys.
 * Adding a new permission: define it here first, then wire it.
 */

// ══════════════════════════════════════════════════════════
// ACTIONS — Standard verbs available on resources
// ══════════════════════════════════════════════════════════
export const ACTIONS = Object.freeze({
  VIEW:     'view',
  CREATE:   'create',
  EDIT:     'edit',
  DELETE:   'delete',
  APPROVE:  'approve',
  REJECT:   'reject',
  PRINT:    'print',
  EXPORT:   'export',
  ASSIGN:   'assign',
  UPLOAD:   'upload',
  DOWNLOAD: 'download',
  ADVANCE:  'advance',
  REVERT:   'revert',
  EXECUTE:  'execute',
  SETTLE:   'settle',
  TRANSFER: 'transfer',
});

// ══════════════════════════════════════════════════════════
// MODULES — Top-level resource groups
// ══════════════════════════════════════════════════════════
export const MODULES = Object.freeze({
  ORDERS:        'orders',
  CLIENTS:       'clients',
  DESIGN:        'design',
  PRINTING:      'printing',
  PRODUCTION:    'production',
  SHIPPING:      'shipping',
  ARCHIVE:       'archive',
  FINANCIALS:    'financials',
  EMPLOYEES:     'employees',
  SUPPLIERS:     'suppliers',
  PRODUCTS:      'products',
  REPORTS:       'reports',
  SETTINGS:      'settings',
  CONVERSATIONS: 'conversations',
  RETURNS:       'returns',
  APPROVALS:     'approvals',
  ATTENDANCE:    'attendance',
  GALLERY:       'gallery',
  INBOX:         'inbox',
});

// ══════════════════════════════════════════════════════════
// PERMISSION KEYS — Complete registry organized by module
// ══════════════════════════════════════════════════════════

export const P = Object.freeze({

  // ── Orders ──────────────────────────────────────────────
  ORDERS_VIEW:              'orders:view',
  ORDERS_CREATE:            'orders:create',
  ORDERS_EDIT:              'orders:edit',
  ORDERS_DELETE:            'orders:delete',
  ORDERS_PRINT:             'orders:print',
  ORDERS_EXPORT:            'orders:export',
  ORDERS_VIEW_ALL:          'orders:view_all',
  ORDERS_SPLIT:             'orders:split',
  ORDERS_MERGE:             'orders:merge',
  ORDERS_CANCEL:            'orders:cancel',

  // ── Order Stages ────────────────────────────────────────
  ORDERS_STAGE_DESIGN_VIEW:       'orders.stage.design:view',
  ORDERS_STAGE_DESIGN_ADVANCE:    'orders.stage.design:advance',
  ORDERS_STAGE_DESIGN_REVERT:     'orders.stage.design:revert',
  ORDERS_STAGE_DESIGN_ASSIGN:     'orders.stage.design:assign',

  ORDERS_STAGE_PRINTING_VIEW:     'orders.stage.printing:view',
  ORDERS_STAGE_PRINTING_ADVANCE:  'orders.stage.printing:advance',
  ORDERS_STAGE_PRINTING_REVERT:   'orders.stage.printing:revert',

  ORDERS_STAGE_PRODUCTION_VIEW:    'orders.stage.production:view',
  ORDERS_STAGE_PRODUCTION_ADVANCE: 'orders.stage.production:advance',
  ORDERS_STAGE_PRODUCTION_REVERT:  'orders.stage.production:revert',

  ORDERS_STAGE_SHIPPING_VIEW:     'orders.stage.shipping:view',
  ORDERS_STAGE_SHIPPING_ADVANCE:  'orders.stage.shipping:advance',
  ORDERS_STAGE_SHIPPING_REVERT:   'orders.stage.shipping:revert',

  ORDERS_STAGE_ARCHIVE_VIEW:      'orders.stage.archive:view',
  ORDERS_STAGE_ARCHIVE_EXECUTE:   'orders.stage.archive:execute',
  ORDERS_STAGE_ARCHIVE_REVERT:    'orders.stage.archive:revert',

  // ── Order Costs ─────────────────────────────────────────
  ORDERS_COSTS_VIEW:        'orders.costs:view',
  ORDERS_COSTS_CREATE:      'orders.costs:create',
  ORDERS_COSTS_EDIT:        'orders.costs:edit',
  ORDERS_COSTS_DELETE:      'orders.costs:delete',
  ORDERS_COSTS_APPROVE:     'orders.costs:approve',

  // ── Order Payments ──────────────────────────────────────
  ORDERS_PAYMENTS_VIEW:     'orders.payments:view',
  ORDERS_PAYMENTS_RECORD:   'orders.payments:create',
  ORDERS_PAYMENTS_REFUND:   'orders.payments:refund',
  ORDERS_PAYMENTS_DISCOUNT: 'orders.payments:discount',

  // ── Clients ─────────────────────────────────────────────
  CLIENTS_VIEW:             'clients:view',
  CLIENTS_CREATE:           'clients:create',
  CLIENTS_EDIT:             'clients:edit',
  CLIENTS_DELETE:           'clients:delete',
  CLIENTS_EXPORT:           'clients:export',
  CLIENTS_VIEW_PHONE:       'clients.phone:view',
  CLIENTS_VIEW_EMAIL:       'clients.email:view',
  CLIENTS_VIEW_ADDRESS:     'clients.address:view',
  CLIENTS_VIEW_BALANCE:     'clients.balance:view',
  CLIENTS_FOLLOWUP_CREATE:  'clients.followup:create',
  CLIENTS_FOLLOWUP_EDIT:    'clients.followup:edit',
  CLIENTS_FOLLOWUP_DELETE:  'clients.followup:delete',
  CLIENTS_BIZCARD_MANAGE:   'clients.bizcard:edit',

  // ── Design ──────────────────────────────────────────────
  DESIGN_VIEW:              'design:view',
  DESIGN_UPLOAD:            'design:upload',
  DESIGN_APPROVE:           'design:approve',
  DESIGN_REJECT:            'design:reject',
  DESIGN_ASSIGN:            'design:assign',
  DESIGN_VIEW_FILES:        'design.files:view',
  DESIGN_DOWNLOAD_FILES:    'design.files:download',
  DESIGN_SEND_TO_CLIENT:    'design:send_to_client',
  DESIGN_VIEW_NOTES:        'design.notes:view',

  // ── Printing ────────────────────────────────────────────
  PRINTING_VIEW:            'printing:view',
  PRINTING_MANAGE:          'printing:edit',
  PRINTING_HANDOFF:         'printing:handoff',
  PRINTING_VIEW_BRIEF:      'printing.brief:view',

  // ── Production ──────────────────────────────────────────
  PRODUCTION_VIEW:          'production:view',
  PRODUCTION_MANAGE:        'production:edit',
  PRODUCTION_COSTS_VIEW:    'production.costs:view',
  PRODUCTION_COSTS_MANAGE:  'production.costs:edit',
  PRODUCTION_SUPPLIER_REQ:  'production.supplier:create',

  // ── Shipping ────────────────────────────────────────────
  SHIPPING_VIEW:            'shipping:view',
  SHIPPING_MANAGE:          'shipping:edit',
  SHIPPING_VIEW_ALL:        'shipping:view_all',
  SHIPPING_RECORD:          'shipping:create',
  SHIPPING_DELIVERY:        'shipping.delivery:execute',
  SHIPPING_COLLECTION:      'shipping.collection:execute',
  SHIPPING_RETURN:          'shipping.return:execute',
  SHIPPING_SETTLE:          'shipping.settlement:execute',
  SHIPPING_ACCOUNTS_VIEW:   'shipping.accounts:view',
  SHIPPING_ACCOUNTS_MANAGE: 'shipping.accounts:edit',
  SHIPPING_PRICING_VIEW:    'shipping.pricing:view',
  SHIPPING_PRICING_MANAGE:  'shipping.pricing:edit',
  SHIPPING_FOLLOWUP_VIEW:   'shipping.followup:view',

  // ── Financials ──────────────────────────────────────────
  FINANCIALS_VIEW:          'financials:view',
  FINANCIALS_EXPORT:        'financials:export',

  // Wallets
  FINANCIALS_WALLETS_VIEW:      'financials.wallets:view',
  FINANCIALS_WALLETS_CREATE:    'financials.wallets:create',
  FINANCIALS_WALLETS_EDIT:      'financials.wallets:edit',
  FINANCIALS_WALLETS_DELETE:    'financials.wallets:delete',
  FINANCIALS_WALLETS_TRANSFER:  'financials.wallets:transfer',
  FINANCIALS_WALLETS_RECONCILE: 'financials.wallets:reconcile',

  // Transactions
  FINANCIALS_TX_VIEW:         'financials.transactions:view',
  FINANCIALS_TX_CREATE:       'financials.transactions:create',
  FINANCIALS_TX_EDIT:         'financials.transactions:edit',
  FINANCIALS_TX_DELETE:       'financials.transactions:delete',

  // Ledger
  FINANCIALS_LEDGER_VIEW:     'financials.ledger:view',
  FINANCIALS_LEDGER_EXPORT:   'financials.ledger:export',

  // Payment execution & approval (2-tier)
  FINANCIALS_PAYMENTS_EXECUTE:  'financials.payments:execute',
  FINANCIALS_PAYMENTS_APPROVE:  'financials.payments:approve',

  // ── Sensitive Financial Fields ──────────────────────────
  FIELD_PRICE_SALE:         'field.price_sale:view',
  FIELD_PRICE_PAID:         'field.price_paid:view',
  FIELD_PRICE_REMAINING:    'field.price_remaining:view',
  FIELD_PRICE_COST:         'field.price_cost:view',
  FIELD_PRICE_MARGIN:       'field.price_margin:view',
  FIELD_CLIENT_PHONE:       'field.client_phone:view',
  FIELD_DESIGN_DATA:        'field.design_data:view',
  FIELD_SUPPLIER_NAME:      'field.supplier_name:view',
  FIELD_SUPPLIER_COST:      'field.supplier_cost:view',
  FIELD_SUPPLIER_PHONE:     'field.supplier_phone:view',
  FIELD_REPORTS_SALES:      'field.reports_sales:view',
  FIELD_REPORTS_PERF:       'field.reports_perf:view',
  FIELD_KPI_REVENUE:        'field.kpi_revenue:view',
  FIELD_SHIP_COST:          'field.ship_cost:view',
  FIELD_SHIP_COMPANY:       'field.ship_company:view',

  // ── Approvals ───────────────────────────────────────────
  APPROVALS_VIEW:           'approvals:view',
  APPROVALS_CREATE:         'approvals:create',
  APPROVALS_EXECUTE:        'approvals:execute',
  APPROVALS_APPROVE:        'approvals:approve',
  APPROVALS_REJECT:         'approvals:reject',
  APPROVALS_ATTACH_RECEIPT: 'approvals:attach_receipt',

  // ── Returns ─────────────────────────────────────────────
  RETURNS_VIEW:             'returns:view',
  RETURNS_CREATE:           'returns:create',
  RETURNS_PROCESS:          'returns:edit',
  RETURNS_APPROVE:          'returns:approve',
  RETURNS_REFUND:           'returns:refund',

  // ── Employees ───────────────────────────────────────────
  EMPLOYEES_VIEW:           'employees:view',
  EMPLOYEES_CREATE:         'employees:create',
  EMPLOYEES_EDIT:           'employees:edit',
  EMPLOYEES_DELETE:         'employees:delete',
  EMPLOYEES_VIEW_SALARY:    'employees.salary:view',
  EMPLOYEES_MANAGE_SALARY:  'employees.salary:edit',
  EMPLOYEES_VIEW_INCIDENTS: 'employees.incidents:view',
  EMPLOYEES_MANAGE_INCIDENTS: 'employees.incidents:edit',
  EMPLOYEES_VIEW_LEAVES:    'employees.leaves:view',
  EMPLOYEES_MANAGE_LEAVES:  'employees.leaves:edit',
  EMPLOYEES_VIEW_GOALS:     'employees.goals:view',
  EMPLOYEES_MANAGE_GOALS:   'employees.goals:edit',
  EMPLOYEES_VIEW_EVALS:     'employees.evaluations:view',
  EMPLOYEES_MANAGE_EVALS:   'employees.evaluations:edit',
  EMPLOYEES_MANAGE_TASKS:   'employees.tasks:edit',
  EMPLOYEES_MANAGE_SCHEDULE: 'employees.schedule:edit',

  // ── Attendance ──────────────────────────────────────────
  ATTENDANCE_VIEW:          'attendance:view',
  ATTENDANCE_RECORD:        'attendance:create',
  ATTENDANCE_MANAGE:        'attendance:edit',
  ATTENDANCE_EXPORT:        'attendance:export',
  ATTENDANCE_SELF_CHECKIN:  'attendance.self:create',

  // ── Suppliers ───────────────────────────────────────────
  SUPPLIERS_VIEW:           'suppliers:view',
  SUPPLIERS_CREATE:         'suppliers:create',
  SUPPLIERS_EDIT:           'suppliers:edit',
  SUPPLIERS_DELETE:         'suppliers:delete',
  SUPPLIERS_PAYMENTS_VIEW:  'suppliers.payments:view',
  SUPPLIERS_PAYMENTS_RECORD: 'suppliers.payments:create',
  SUPPLIERS_ORDERS_VIEW:    'suppliers.orders:view',
  SUPPLIERS_ORDERS_CREATE:  'suppliers.orders:create',
  SUPPLIERS_ORDERS_EDIT:    'suppliers.orders:edit',

  // ── Products ────────────────────────────────────────────
  PRODUCTS_VIEW:            'products:view',
  PRODUCTS_CREATE:          'products:create',
  PRODUCTS_EDIT:            'products:edit',
  PRODUCTS_DELETE:          'products:delete',
  PRODUCTS_PRICING_MANAGE:  'products.pricing:edit',
  PRODUCTS_CATALOG_PUBLISH: 'products.catalog:publish',

  // ── Reports & Dashboards ────────────────────────────────
  REPORTS_VIEW:             'reports:view',
  REPORTS_EXPORT:           'reports:export',
  REPORTS_SALES:            'reports.sales:view',
  REPORTS_PERFORMANCE:      'reports.performance:view',
  REPORTS_FINANCIAL_KPI:    'reports.financial_kpi:view',
  REPORTS_COLLECTION:       'reports.collection:view',
  REPORTS_RETURNS:          'reports.returns:view',
  REPORTS_APPROVALS:        'reports.approvals:view',
  REPORTS_TIMESERIES:       'reports.timeseries:view',
  REPORTS_PRIORITIES:       'reports.priorities:view',

  DASHBOARD_EXEC:           'dashboard.exec:view',
  DASHBOARD_OPS:            'dashboard.ops:view',
  DASHBOARD_CS:             'dashboard.cs:view',
  DASHBOARD_DESIGNER:       'dashboard.designer:view',
  DASHBOARD_PRODUCTION:     'dashboard.production:view',
  DASHBOARD_SHIPPING:       'dashboard.shipping:view',
  DASHBOARD_FINANCIAL:      'dashboard.financial:view',

  // ── Conversations & Inbox ───────────────────────────────
  CONVERSATIONS_VIEW:           'conversations:view',
  CONVERSATIONS_CREATE:         'conversations:create',
  CONVERSATIONS_SEND_MESSAGE:   'conversations.messages:create',
  CONVERSATIONS_EDIT_MESSAGE:   'conversations.messages:edit',
  CONVERSATIONS_DELETE_MESSAGE:  'conversations.messages:delete',
  CONVERSATIONS_PIN_MESSAGE:    'conversations.messages:pin',
  CONVERSATIONS_INTERNAL:       'conversations.internal:view',
  CONVERSATIONS_CLIENT:         'conversations.client:view',
  CONVERSATIONS_ORDER_THREAD:   'conversations.order:view',

  INBOX_VIEW:               'inbox:view',
  INBOX_STORIES_POST:       'inbox.stories:create',
  INBOX_STORIES_DELETE:     'inbox.stories:delete',

  // ── Gallery ─────────────────────────────────────────────
  GALLERY_VIEW:             'gallery:view',
  GALLERY_PUBLISH:          'gallery:create',
  GALLERY_EDIT:             'gallery:edit',
  GALLERY_DELETE:           'gallery:delete',
  GALLERY_FEATURE:          'gallery:feature',

  // ── Settings & System ───────────────────────────────────
  SETTINGS_VIEW:            'settings:view',
  SETTINGS_EDIT:            'settings:edit',
  SETTINGS_MASTER_LISTS:    'settings.master_lists:edit',
  SETTINGS_FINANCIAL_POLICY: 'settings.financial_policy:edit',
  SETTINGS_WHATSAPP:        'settings.whatsapp:edit',
  SETTINGS_ROLES_MANAGE:    'settings.roles:edit',
  SETTINGS_USERS_MANAGE:    'settings.users:edit',

  // ── Audit & System Admin ────────────────────────────────
  AUDIT_VIEW:               'audit:view',
  AUDIT_EXPORT:             'audit:export',
  SYSTEM_DIAGNOSTICS:       'system.diagnostics:view',
  SYSTEM_IMPERSONATE:       'system.impersonate:execute',
  SYSTEM_MIGRATION:         'system.migration:execute',
});

// ══════════════════════════════════════════════════════════
// FIELD KEY → Legacy field name mapping
// ══════════════════════════════════════════════════════════
// Maps new `field.*:view` keys back to legacy field names used in
// DEFAULT_PERMISSIONS and canSeeField(). This bridge ensures
// the new RBAC engine can resolve legacy field checks.
export const FIELD_KEY_TO_LEGACY = Object.freeze({
  'field.price_sale:view':     'price_sale',
  'field.price_paid:view':     'price_paid',
  'field.price_remaining:view':'price_remaining',
  'field.price_cost:view':     'price_cost',
  'field.price_margin:view':   'price_margin',
  'field.client_phone:view':   'client_phone',
  'field.design_data:view':    'design_data',
  'field.supplier_name:view':  'supplier_name',
  'field.supplier_cost:view':  'supplier_cost',
  'field.supplier_phone:view': 'supplier_phone',
  'field.reports_sales:view':  'reports_sales',
  'field.reports_perf:view':   'reports_perf',
  'field.kpi_revenue:view':    'kpi_revenue',
  'field.ship_cost:view':      'ship_cost',
  'field.ship_company:view':   'ship_company',
});

export const LEGACY_TO_FIELD_KEY = Object.freeze(
  Object.fromEntries(Object.entries(FIELD_KEY_TO_LEGACY).map(([k, v]) => [v, k]))
);

// ══════════════════════════════════════════════════════════
// CAPABILITY → New permission key mapping
// ══════════════════════════════════════════════════════════
// Maps legacy CAPABILITIES strings to new P.* keys.
export const CAPABILITY_TO_PKEY = Object.freeze({
  view_orders:             P.ORDERS_VIEW,
  create_orders:           P.ORDERS_CREATE,
  edit_orders:             P.ORDERS_EDIT,
  archive_orders:          P.ORDERS_STAGE_ARCHIVE_EXECUTE,
  view_clients:            P.CLIENTS_VIEW,
  edit_clients:            P.CLIENTS_EDIT,
  upload_designs:          P.DESIGN_UPLOAD,
  approve_designs:         P.DESIGN_APPROVE,
  manage_printing:         P.PRINTING_MANAGE,
  manage_shipping:         P.SHIPPING_MANAGE,
  view_all_shipments:      P.SHIPPING_VIEW_ALL,
  view_financials:         P.FINANCIALS_VIEW,
  manage_payments:         P.FINANCIALS_TX_CREATE,
  execute_payments:        P.FINANCIALS_PAYMENTS_EXECUTE,
  final_approve_payments:  P.FINANCIALS_PAYMENTS_APPROVE,
  manage_returns:          P.RETURNS_PROCESS,
  manage_employees:        P.EMPLOYEES_EDIT,
  manage_attendance:       P.ATTENDANCE_MANAGE,
  manage_products:         P.PRODUCTS_EDIT,
  manage_suppliers:        P.SUPPLIERS_EDIT,
  manage_supplier_payments:P.SUPPLIERS_PAYMENTS_RECORD,
  system_settings:         P.SETTINGS_EDIT,
});

// ══════════════════════════════════════════════════════════
// ALL_PERMISSIONS — Flat array for iteration/UI
// ══════════════════════════════════════════════════════════
export const ALL_PERMISSIONS = Object.freeze(Object.values(P));

// ══════════════════════════════════════════════════════════
// PERMISSION_GROUPS — Organized for admin UI display
// ══════════════════════════════════════════════════════════
export const PERMISSION_GROUPS = Object.freeze({
  orders: {
    label: 'الطلبات',
    labelEn: 'Orders',
    permissions: [
      P.ORDERS_VIEW, P.ORDERS_CREATE, P.ORDERS_EDIT, P.ORDERS_DELETE,
      P.ORDERS_PRINT, P.ORDERS_EXPORT, P.ORDERS_VIEW_ALL,
      P.ORDERS_SPLIT, P.ORDERS_MERGE, P.ORDERS_CANCEL,
    ],
  },
  order_stages: {
    label: 'مراحل الطلبات',
    labelEn: 'Order Stages',
    permissions: [
      P.ORDERS_STAGE_DESIGN_VIEW, P.ORDERS_STAGE_DESIGN_ADVANCE,
      P.ORDERS_STAGE_DESIGN_REVERT, P.ORDERS_STAGE_DESIGN_ASSIGN,
      P.ORDERS_STAGE_PRINTING_VIEW, P.ORDERS_STAGE_PRINTING_ADVANCE,
      P.ORDERS_STAGE_PRINTING_REVERT,
      P.ORDERS_STAGE_PRODUCTION_VIEW, P.ORDERS_STAGE_PRODUCTION_ADVANCE,
      P.ORDERS_STAGE_PRODUCTION_REVERT,
      P.ORDERS_STAGE_SHIPPING_VIEW, P.ORDERS_STAGE_SHIPPING_ADVANCE,
      P.ORDERS_STAGE_SHIPPING_REVERT,
      P.ORDERS_STAGE_ARCHIVE_VIEW, P.ORDERS_STAGE_ARCHIVE_EXECUTE,
      P.ORDERS_STAGE_ARCHIVE_REVERT,
    ],
  },
  order_costs: {
    label: 'تكاليف الطلبات',
    labelEn: 'Order Costs',
    permissions: [
      P.ORDERS_COSTS_VIEW, P.ORDERS_COSTS_CREATE,
      P.ORDERS_COSTS_EDIT, P.ORDERS_COSTS_DELETE, P.ORDERS_COSTS_APPROVE,
    ],
  },
  order_payments: {
    label: 'مدفوعات الطلبات',
    labelEn: 'Order Payments',
    permissions: [
      P.ORDERS_PAYMENTS_VIEW, P.ORDERS_PAYMENTS_RECORD,
      P.ORDERS_PAYMENTS_REFUND, P.ORDERS_PAYMENTS_DISCOUNT,
    ],
  },
  clients: {
    label: 'العملاء',
    labelEn: 'Clients',
    permissions: [
      P.CLIENTS_VIEW, P.CLIENTS_CREATE, P.CLIENTS_EDIT,
      P.CLIENTS_DELETE, P.CLIENTS_EXPORT,
      P.CLIENTS_VIEW_PHONE, P.CLIENTS_VIEW_EMAIL, P.CLIENTS_VIEW_ADDRESS,
      P.CLIENTS_VIEW_BALANCE,
      P.CLIENTS_FOLLOWUP_CREATE, P.CLIENTS_FOLLOWUP_EDIT,
      P.CLIENTS_FOLLOWUP_DELETE, P.CLIENTS_BIZCARD_MANAGE,
    ],
  },
  design: {
    label: 'التصميم',
    labelEn: 'Design',
    permissions: [
      P.DESIGN_VIEW, P.DESIGN_UPLOAD, P.DESIGN_APPROVE, P.DESIGN_REJECT,
      P.DESIGN_ASSIGN, P.DESIGN_VIEW_FILES, P.DESIGN_DOWNLOAD_FILES,
      P.DESIGN_SEND_TO_CLIENT, P.DESIGN_VIEW_NOTES,
    ],
  },
  printing: {
    label: 'الطباعة',
    labelEn: 'Printing',
    permissions: [
      P.PRINTING_VIEW, P.PRINTING_MANAGE, P.PRINTING_HANDOFF,
      P.PRINTING_VIEW_BRIEF,
    ],
  },
  production: {
    label: 'الإنتاج',
    labelEn: 'Production',
    permissions: [
      P.PRODUCTION_VIEW, P.PRODUCTION_MANAGE,
      P.PRODUCTION_COSTS_VIEW, P.PRODUCTION_COSTS_MANAGE,
      P.PRODUCTION_SUPPLIER_REQ,
    ],
  },
  shipping: {
    label: 'الشحن',
    labelEn: 'Shipping',
    permissions: [
      P.SHIPPING_VIEW, P.SHIPPING_MANAGE, P.SHIPPING_VIEW_ALL,
      P.SHIPPING_RECORD, P.SHIPPING_DELIVERY, P.SHIPPING_COLLECTION,
      P.SHIPPING_RETURN, P.SHIPPING_SETTLE,
      P.SHIPPING_ACCOUNTS_VIEW, P.SHIPPING_ACCOUNTS_MANAGE,
      P.SHIPPING_PRICING_VIEW, P.SHIPPING_PRICING_MANAGE,
      P.SHIPPING_FOLLOWUP_VIEW,
    ],
  },
  financials: {
    label: 'الحسابات والمالية',
    labelEn: 'Financials',
    permissions: [
      P.FINANCIALS_VIEW, P.FINANCIALS_EXPORT,
      P.FINANCIALS_WALLETS_VIEW, P.FINANCIALS_WALLETS_CREATE,
      P.FINANCIALS_WALLETS_EDIT, P.FINANCIALS_WALLETS_DELETE,
      P.FINANCIALS_WALLETS_TRANSFER, P.FINANCIALS_WALLETS_RECONCILE,
      P.FINANCIALS_TX_VIEW, P.FINANCIALS_TX_CREATE,
      P.FINANCIALS_TX_EDIT, P.FINANCIALS_TX_DELETE,
      P.FINANCIALS_LEDGER_VIEW, P.FINANCIALS_LEDGER_EXPORT,
      P.FINANCIALS_PAYMENTS_EXECUTE, P.FINANCIALS_PAYMENTS_APPROVE,
    ],
  },
  sensitive_fields: {
    label: 'البيانات الحساسة',
    labelEn: 'Sensitive Fields',
    permissions: [
      P.FIELD_PRICE_SALE, P.FIELD_PRICE_PAID, P.FIELD_PRICE_REMAINING,
      P.FIELD_PRICE_COST, P.FIELD_PRICE_MARGIN,
      P.FIELD_CLIENT_PHONE, P.FIELD_DESIGN_DATA,
      P.FIELD_SUPPLIER_NAME, P.FIELD_SUPPLIER_COST, P.FIELD_SUPPLIER_PHONE,
      P.FIELD_REPORTS_SALES, P.FIELD_REPORTS_PERF, P.FIELD_KPI_REVENUE,
      P.FIELD_SHIP_COST, P.FIELD_SHIP_COMPANY,
    ],
  },
  approvals: {
    label: 'الاعتمادات',
    labelEn: 'Approvals',
    permissions: [
      P.APPROVALS_VIEW, P.APPROVALS_CREATE, P.APPROVALS_EXECUTE,
      P.APPROVALS_APPROVE, P.APPROVALS_REJECT, P.APPROVALS_ATTACH_RECEIPT,
    ],
  },
  returns: {
    label: 'المرتجعات',
    labelEn: 'Returns',
    permissions: [
      P.RETURNS_VIEW, P.RETURNS_CREATE, P.RETURNS_PROCESS,
      P.RETURNS_APPROVE, P.RETURNS_REFUND,
    ],
  },
  employees: {
    label: 'الموظفون',
    labelEn: 'Employees',
    permissions: [
      P.EMPLOYEES_VIEW, P.EMPLOYEES_CREATE, P.EMPLOYEES_EDIT,
      P.EMPLOYEES_DELETE, P.EMPLOYEES_VIEW_SALARY, P.EMPLOYEES_MANAGE_SALARY,
      P.EMPLOYEES_VIEW_INCIDENTS, P.EMPLOYEES_MANAGE_INCIDENTS,
      P.EMPLOYEES_VIEW_LEAVES, P.EMPLOYEES_MANAGE_LEAVES,
      P.EMPLOYEES_VIEW_GOALS, P.EMPLOYEES_MANAGE_GOALS,
      P.EMPLOYEES_VIEW_EVALS, P.EMPLOYEES_MANAGE_EVALS,
      P.EMPLOYEES_MANAGE_TASKS, P.EMPLOYEES_MANAGE_SCHEDULE,
    ],
  },
  attendance: {
    label: 'الحضور',
    labelEn: 'Attendance',
    permissions: [
      P.ATTENDANCE_VIEW, P.ATTENDANCE_RECORD, P.ATTENDANCE_MANAGE,
      P.ATTENDANCE_EXPORT, P.ATTENDANCE_SELF_CHECKIN,
    ],
  },
  suppliers: {
    label: 'الموردون',
    labelEn: 'Suppliers',
    permissions: [
      P.SUPPLIERS_VIEW, P.SUPPLIERS_CREATE, P.SUPPLIERS_EDIT,
      P.SUPPLIERS_DELETE,
      P.SUPPLIERS_PAYMENTS_VIEW, P.SUPPLIERS_PAYMENTS_RECORD,
      P.SUPPLIERS_ORDERS_VIEW, P.SUPPLIERS_ORDERS_CREATE,
      P.SUPPLIERS_ORDERS_EDIT,
    ],
  },
  products: {
    label: 'المنتجات',
    labelEn: 'Products',
    permissions: [
      P.PRODUCTS_VIEW, P.PRODUCTS_CREATE, P.PRODUCTS_EDIT,
      P.PRODUCTS_DELETE, P.PRODUCTS_PRICING_MANAGE,
      P.PRODUCTS_CATALOG_PUBLISH,
    ],
  },
  reports: {
    label: 'التقارير',
    labelEn: 'Reports',
    permissions: [
      P.REPORTS_VIEW, P.REPORTS_EXPORT,
      P.REPORTS_SALES, P.REPORTS_PERFORMANCE, P.REPORTS_FINANCIAL_KPI,
      P.REPORTS_COLLECTION, P.REPORTS_RETURNS, P.REPORTS_APPROVALS,
      P.REPORTS_TIMESERIES, P.REPORTS_PRIORITIES,
    ],
  },
  dashboards: {
    label: 'لوحات المتابعة',
    labelEn: 'Dashboards',
    permissions: [
      P.DASHBOARD_EXEC, P.DASHBOARD_OPS, P.DASHBOARD_CS,
      P.DASHBOARD_DESIGNER, P.DASHBOARD_PRODUCTION,
      P.DASHBOARD_SHIPPING, P.DASHBOARD_FINANCIAL,
    ],
  },
  conversations: {
    label: 'المحادثات',
    labelEn: 'Conversations',
    permissions: [
      P.CONVERSATIONS_VIEW, P.CONVERSATIONS_CREATE,
      P.CONVERSATIONS_SEND_MESSAGE, P.CONVERSATIONS_EDIT_MESSAGE,
      P.CONVERSATIONS_DELETE_MESSAGE, P.CONVERSATIONS_PIN_MESSAGE,
      P.CONVERSATIONS_INTERNAL, P.CONVERSATIONS_CLIENT,
      P.CONVERSATIONS_ORDER_THREAD,
    ],
  },
  inbox: {
    label: 'صندوق الوارد',
    labelEn: 'Inbox',
    permissions: [
      P.INBOX_VIEW, P.INBOX_STORIES_POST, P.INBOX_STORIES_DELETE,
    ],
  },
  gallery: {
    label: 'المعرض',
    labelEn: 'Gallery',
    permissions: [
      P.GALLERY_VIEW, P.GALLERY_PUBLISH, P.GALLERY_EDIT,
      P.GALLERY_DELETE, P.GALLERY_FEATURE,
    ],
  },
  settings: {
    label: 'الإعدادات',
    labelEn: 'Settings',
    permissions: [
      P.SETTINGS_VIEW, P.SETTINGS_EDIT, P.SETTINGS_MASTER_LISTS,
      P.SETTINGS_FINANCIAL_POLICY, P.SETTINGS_WHATSAPP,
      P.SETTINGS_ROLES_MANAGE, P.SETTINGS_USERS_MANAGE,
    ],
  },
  system: {
    label: 'النظام',
    labelEn: 'System Admin',
    permissions: [
      P.AUDIT_VIEW, P.AUDIT_EXPORT,
      P.SYSTEM_DIAGNOSTICS, P.SYSTEM_IMPERSONATE, P.SYSTEM_MIGRATION,
    ],
  },
});

// ══════════════════════════════════════════════════════════
// PERMISSION LABELS — Arabic + English for each key
// ══════════════════════════════════════════════════════════
export const PERMISSION_LABELS = Object.freeze({
  // Orders
  [P.ORDERS_VIEW]:              { ar: 'عرض الطلبات', en: 'View Orders' },
  [P.ORDERS_CREATE]:            { ar: 'إنشاء طلب', en: 'Create Order' },
  [P.ORDERS_EDIT]:              { ar: 'تعديل طلب', en: 'Edit Order' },
  [P.ORDERS_DELETE]:            { ar: 'حذف طلب', en: 'Delete Order' },
  [P.ORDERS_PRINT]:             { ar: 'طباعة طلب', en: 'Print Order' },
  [P.ORDERS_EXPORT]:            { ar: 'تصدير طلب', en: 'Export Order' },
  [P.ORDERS_VIEW_ALL]:          { ar: 'عرض كل الطلبات', en: 'View All Orders' },
  [P.ORDERS_SPLIT]:             { ar: 'تقسيم طلب', en: 'Split Order' },
  [P.ORDERS_MERGE]:             { ar: 'دمج طلبات', en: 'Merge Orders' },
  [P.ORDERS_CANCEL]:            { ar: 'إلغاء طلب', en: 'Cancel Order' },

  // Order Stages
  [P.ORDERS_STAGE_DESIGN_VIEW]:       { ar: 'عرض مرحلة التصميم', en: 'View Design Stage' },
  [P.ORDERS_STAGE_DESIGN_ADVANCE]:    { ar: 'تقديم للطباعة', en: 'Advance to Printing' },
  [P.ORDERS_STAGE_DESIGN_REVERT]:     { ar: 'إرجاع للتصميم', en: 'Revert to Design' },
  [P.ORDERS_STAGE_DESIGN_ASSIGN]:     { ar: 'تعيين مصمم', en: 'Assign Designer' },
  [P.ORDERS_STAGE_PRINTING_VIEW]:     { ar: 'عرض مرحلة الطباعة', en: 'View Printing Stage' },
  [P.ORDERS_STAGE_PRINTING_ADVANCE]:  { ar: 'تقديم للإنتاج', en: 'Advance to Production' },
  [P.ORDERS_STAGE_PRINTING_REVERT]:   { ar: 'إرجاع للتصميم', en: 'Revert from Printing' },
  [P.ORDERS_STAGE_PRODUCTION_VIEW]:   { ar: 'عرض مرحلة الإنتاج', en: 'View Production Stage' },
  [P.ORDERS_STAGE_PRODUCTION_ADVANCE]:{ ar: 'تقديم للشحن', en: 'Advance to Shipping' },
  [P.ORDERS_STAGE_PRODUCTION_REVERT]: { ar: 'إرجاع من الإنتاج', en: 'Revert from Production' },
  [P.ORDERS_STAGE_SHIPPING_VIEW]:     { ar: 'عرض مرحلة الشحن', en: 'View Shipping Stage' },
  [P.ORDERS_STAGE_SHIPPING_ADVANCE]:  { ar: 'تقديم للأرشيف', en: 'Advance to Archive' },
  [P.ORDERS_STAGE_SHIPPING_REVERT]:   { ar: 'إرجاع من الشحن', en: 'Revert from Shipping' },
  [P.ORDERS_STAGE_ARCHIVE_VIEW]:      { ar: 'عرض الأرشيف', en: 'View Archive' },
  [P.ORDERS_STAGE_ARCHIVE_EXECUTE]:   { ar: 'أرشفة طلب', en: 'Archive Order' },
  [P.ORDERS_STAGE_ARCHIVE_REVERT]:    { ar: 'إرجاع من الأرشيف', en: 'Revert from Archive' },

  // Order Costs
  [P.ORDERS_COSTS_VIEW]:        { ar: 'عرض التكاليف', en: 'View Costs' },
  [P.ORDERS_COSTS_CREATE]:      { ar: 'إضافة تكلفة', en: 'Add Cost' },
  [P.ORDERS_COSTS_EDIT]:        { ar: 'تعديل تكلفة', en: 'Edit Cost' },
  [P.ORDERS_COSTS_DELETE]:      { ar: 'حذف تكلفة', en: 'Delete Cost' },
  [P.ORDERS_COSTS_APPROVE]:     { ar: 'اعتماد تكلفة', en: 'Approve Cost' },

  // Order Payments
  [P.ORDERS_PAYMENTS_VIEW]:     { ar: 'عرض المدفوعات', en: 'View Payments' },
  [P.ORDERS_PAYMENTS_RECORD]:   { ar: 'تسجيل دفعة', en: 'Record Payment' },
  [P.ORDERS_PAYMENTS_REFUND]:   { ar: 'استرداد مبلغ', en: 'Issue Refund' },
  [P.ORDERS_PAYMENTS_DISCOUNT]: { ar: 'تطبيق خصم', en: 'Apply Discount' },

  // Clients
  [P.CLIENTS_VIEW]:             { ar: 'عرض العملاء', en: 'View Clients' },
  [P.CLIENTS_CREATE]:           { ar: 'إضافة عميل', en: 'Create Client' },
  [P.CLIENTS_EDIT]:             { ar: 'تعديل عميل', en: 'Edit Client' },
  [P.CLIENTS_DELETE]:           { ar: 'حذف عميل', en: 'Delete Client' },
  [P.CLIENTS_EXPORT]:           { ar: 'تصدير عملاء', en: 'Export Clients' },
  [P.CLIENTS_VIEW_PHONE]:       { ar: 'رؤية هاتف العميل', en: 'View Client Phone' },
  [P.CLIENTS_VIEW_EMAIL]:       { ar: 'رؤية إيميل العميل', en: 'View Client Email' },
  [P.CLIENTS_VIEW_ADDRESS]:     { ar: 'رؤية عنوان العميل', en: 'View Client Address' },
  [P.CLIENTS_VIEW_BALANCE]:     { ar: 'رؤية رصيد العميل', en: 'View Client Balance' },
  [P.CLIENTS_FOLLOWUP_CREATE]:  { ar: 'إنشاء متابعة', en: 'Create Followup' },
  [P.CLIENTS_FOLLOWUP_EDIT]:    { ar: 'تعديل متابعة', en: 'Edit Followup' },
  [P.CLIENTS_FOLLOWUP_DELETE]:  { ar: 'حذف متابعة', en: 'Delete Followup' },
  [P.CLIENTS_BIZCARD_MANAGE]:   { ar: 'إدارة بطاقة العمل', en: 'Manage Business Card' },

  // Design
  [P.DESIGN_VIEW]:              { ar: 'عرض التصميم', en: 'View Design' },
  [P.DESIGN_UPLOAD]:            { ar: 'رفع تصميم', en: 'Upload Design' },
  [P.DESIGN_APPROVE]:           { ar: 'اعتماد تصميم', en: 'Approve Design' },
  [P.DESIGN_REJECT]:            { ar: 'رفض تصميم', en: 'Reject Design' },
  [P.DESIGN_ASSIGN]:            { ar: 'تعيين مصمم', en: 'Assign Designer' },
  [P.DESIGN_VIEW_FILES]:        { ar: 'عرض ملفات التصميم', en: 'View Design Files' },
  [P.DESIGN_DOWNLOAD_FILES]:    { ar: 'تحميل ملفات التصميم', en: 'Download Design Files' },
  [P.DESIGN_SEND_TO_CLIENT]:    { ar: 'إرسال للعميل', en: 'Send to Client' },
  [P.DESIGN_VIEW_NOTES]:        { ar: 'عرض ملاحظات التصميم', en: 'View Design Notes' },

  // Printing
  [P.PRINTING_VIEW]:            { ar: 'عرض الطباعة', en: 'View Printing' },
  [P.PRINTING_MANAGE]:          { ar: 'إدارة الطباعة', en: 'Manage Printing' },
  [P.PRINTING_HANDOFF]:         { ar: 'تسليم للإنتاج', en: 'Handoff to Production' },
  [P.PRINTING_VIEW_BRIEF]:      { ar: 'عرض ملخص الطباعة', en: 'View Print Brief' },

  // Production
  [P.PRODUCTION_VIEW]:          { ar: 'عرض الإنتاج', en: 'View Production' },
  [P.PRODUCTION_MANAGE]:        { ar: 'إدارة الإنتاج', en: 'Manage Production' },
  [P.PRODUCTION_COSTS_VIEW]:    { ar: 'عرض تكاليف الإنتاج', en: 'View Production Costs' },
  [P.PRODUCTION_COSTS_MANAGE]:  { ar: 'إدارة تكاليف الإنتاج', en: 'Manage Production Costs' },
  [P.PRODUCTION_SUPPLIER_REQ]:  { ar: 'طلب مورد', en: 'Request Supplier' },

  // Shipping
  [P.SHIPPING_VIEW]:            { ar: 'عرض الشحن', en: 'View Shipping' },
  [P.SHIPPING_MANAGE]:          { ar: 'إدارة الشحن', en: 'Manage Shipping' },
  [P.SHIPPING_VIEW_ALL]:        { ar: 'عرض كل الشحنات', en: 'View All Shipments' },
  [P.SHIPPING_RECORD]:          { ar: 'تسجيل شحنة', en: 'Record Shipment' },
  [P.SHIPPING_DELIVERY]:        { ar: 'تأكيد التسليم', en: 'Confirm Delivery' },
  [P.SHIPPING_COLLECTION]:      { ar: 'تأكيد التحصيل', en: 'Confirm Collection' },
  [P.SHIPPING_RETURN]:          { ar: 'تسجيل مرتجع شحن', en: 'Record Shipping Return' },
  [P.SHIPPING_SETTLE]:          { ar: 'تسوية شركة شحن', en: 'Settle Shipping Company' },
  [P.SHIPPING_ACCOUNTS_VIEW]:   { ar: 'عرض حسابات الشحن', en: 'View Shipping Accounts' },
  [P.SHIPPING_ACCOUNTS_MANAGE]: { ar: 'إدارة حسابات الشحن', en: 'Manage Shipping Accounts' },
  [P.SHIPPING_PRICING_VIEW]:    { ar: 'عرض أسعار الشحن', en: 'View Shipping Pricing' },
  [P.SHIPPING_PRICING_MANAGE]:  { ar: 'إدارة أسعار الشحن', en: 'Manage Shipping Pricing' },
  [P.SHIPPING_FOLLOWUP_VIEW]:   { ar: 'متابعة الشحنات', en: 'Shipping Follow-up' },

  // Financials
  [P.FINANCIALS_VIEW]:          { ar: 'عرض المالية', en: 'View Financials' },
  [P.FINANCIALS_EXPORT]:        { ar: 'تصدير المالية', en: 'Export Financials' },
  [P.FINANCIALS_WALLETS_VIEW]:  { ar: 'عرض المحافظ', en: 'View Wallets' },
  [P.FINANCIALS_WALLETS_CREATE]:{ ar: 'إنشاء محفظة', en: 'Create Wallet' },
  [P.FINANCIALS_WALLETS_EDIT]:  { ar: 'تعديل محفظة', en: 'Edit Wallet' },
  [P.FINANCIALS_WALLETS_DELETE]:{ ar: 'حذف محفظة', en: 'Delete Wallet' },
  [P.FINANCIALS_WALLETS_TRANSFER]: { ar: 'تحويل بين المحافظ', en: 'Wallet Transfer' },
  [P.FINANCIALS_WALLETS_RECONCILE]: { ar: 'تسوية محفظة', en: 'Reconcile Wallet' },
  [P.FINANCIALS_TX_VIEW]:       { ar: 'عرض المعاملات', en: 'View Transactions' },
  [P.FINANCIALS_TX_CREATE]:     { ar: 'تسجيل معاملة', en: 'Record Transaction' },
  [P.FINANCIALS_TX_EDIT]:       { ar: 'تعديل معاملة', en: 'Edit Transaction' },
  [P.FINANCIALS_TX_DELETE]:     { ar: 'حذف معاملة', en: 'Delete Transaction' },
  [P.FINANCIALS_LEDGER_VIEW]:   { ar: 'عرض السجل المالي', en: 'View Ledger' },
  [P.FINANCIALS_LEDGER_EXPORT]: { ar: 'تصدير السجل المالي', en: 'Export Ledger' },
  [P.FINANCIALS_PAYMENTS_EXECUTE]: { ar: 'تنفيذ الدفعات', en: 'Execute Payments' },
  [P.FINANCIALS_PAYMENTS_APPROVE]: { ar: 'اعتماد الدفعات النهائي', en: 'Final Approve Payments' },

  // Sensitive Fields
  [P.FIELD_PRICE_SALE]:         { ar: 'سعر البيع', en: 'Sale Price' },
  [P.FIELD_PRICE_PAID]:         { ar: 'المبلغ المدفوع', en: 'Paid Amount' },
  [P.FIELD_PRICE_REMAINING]:    { ar: 'المبلغ المتبقي', en: 'Remaining Amount' },
  [P.FIELD_PRICE_COST]:         { ar: 'سعر التكلفة', en: 'Cost Price' },
  [P.FIELD_PRICE_MARGIN]:       { ar: 'هامش الربح', en: 'Profit Margin' },
  [P.FIELD_CLIENT_PHONE]:       { ar: 'هاتف العميل', en: 'Client Phone' },
  [P.FIELD_DESIGN_DATA]:        { ar: 'بيانات التصميم', en: 'Design Data' },
  [P.FIELD_SUPPLIER_NAME]:      { ar: 'اسم المورد', en: 'Supplier Name' },
  [P.FIELD_SUPPLIER_COST]:      { ar: 'تكلفة المورد', en: 'Supplier Cost' },
  [P.FIELD_SUPPLIER_PHONE]:     { ar: 'هاتف المورد', en: 'Supplier Phone' },
  [P.FIELD_REPORTS_SALES]:      { ar: 'تقارير المبيعات', en: 'Sales Reports' },
  [P.FIELD_REPORTS_PERF]:       { ar: 'تقارير الأداء', en: 'Performance Reports' },
  [P.FIELD_KPI_REVENUE]:        { ar: 'مؤشرات الإيراد', en: 'Revenue KPIs' },
  [P.FIELD_SHIP_COST]:          { ar: 'تكلفة الشحن', en: 'Shipping Cost' },
  [P.FIELD_SHIP_COMPANY]:       { ar: 'شركة الشحن', en: 'Shipping Company' },

  // Approvals
  [P.APPROVALS_VIEW]:           { ar: 'عرض الاعتمادات', en: 'View Approvals' },
  [P.APPROVALS_CREATE]:         { ar: 'إنشاء طلب اعتماد', en: 'Create Approval Request' },
  [P.APPROVALS_EXECUTE]:        { ar: 'تنفيذ اعتماد', en: 'Execute Approval' },
  [P.APPROVALS_APPROVE]:        { ar: 'الموافقة النهائية', en: 'Final Approve' },
  [P.APPROVALS_REJECT]:         { ar: 'رفض الاعتماد', en: 'Reject Approval' },
  [P.APPROVALS_ATTACH_RECEIPT]: { ar: 'إرفاق إيصال', en: 'Attach Receipt' },

  // Returns
  [P.RETURNS_VIEW]:             { ar: 'عرض المرتجعات', en: 'View Returns' },
  [P.RETURNS_CREATE]:           { ar: 'إنشاء مرتجع', en: 'Create Return' },
  [P.RETURNS_PROCESS]:          { ar: 'معالجة مرتجع', en: 'Process Return' },
  [P.RETURNS_APPROVE]:          { ar: 'اعتماد مرتجع', en: 'Approve Return' },
  [P.RETURNS_REFUND]:           { ar: 'استرداد مرتجع', en: 'Refund Return' },

  // Employees
  [P.EMPLOYEES_VIEW]:           { ar: 'عرض الموظفين', en: 'View Employees' },
  [P.EMPLOYEES_CREATE]:         { ar: 'إضافة موظف', en: 'Create Employee' },
  [P.EMPLOYEES_EDIT]:           { ar: 'تعديل موظف', en: 'Edit Employee' },
  [P.EMPLOYEES_DELETE]:         { ar: 'حذف موظف', en: 'Delete Employee' },
  [P.EMPLOYEES_VIEW_SALARY]:    { ar: 'عرض الرواتب', en: 'View Salaries' },
  [P.EMPLOYEES_MANAGE_SALARY]:  { ar: 'إدارة الرواتب', en: 'Manage Salaries' },
  [P.EMPLOYEES_VIEW_INCIDENTS]: { ar: 'عرض المخالفات', en: 'View Incidents' },
  [P.EMPLOYEES_MANAGE_INCIDENTS]: { ar: 'إدارة المخالفات', en: 'Manage Incidents' },
  [P.EMPLOYEES_VIEW_LEAVES]:    { ar: 'عرض الإجازات', en: 'View Leaves' },
  [P.EMPLOYEES_MANAGE_LEAVES]:  { ar: 'إدارة الإجازات', en: 'Manage Leaves' },
  [P.EMPLOYEES_VIEW_GOALS]:     { ar: 'عرض الأهداف', en: 'View Goals' },
  [P.EMPLOYEES_MANAGE_GOALS]:   { ar: 'إدارة الأهداف', en: 'Manage Goals' },
  [P.EMPLOYEES_VIEW_EVALS]:     { ar: 'عرض التقييمات', en: 'View Evaluations' },
  [P.EMPLOYEES_MANAGE_EVALS]:   { ar: 'إدارة التقييمات', en: 'Manage Evaluations' },
  [P.EMPLOYEES_MANAGE_TASKS]:   { ar: 'إدارة المهام', en: 'Manage Tasks' },
  [P.EMPLOYEES_MANAGE_SCHEDULE]:{ ar: 'إدارة جدول العمل', en: 'Manage Schedule' },

  // Attendance
  [P.ATTENDANCE_VIEW]:          { ar: 'عرض الحضور', en: 'View Attendance' },
  [P.ATTENDANCE_RECORD]:        { ar: 'تسجيل حضور', en: 'Record Attendance' },
  [P.ATTENDANCE_MANAGE]:        { ar: 'إدارة الحضور', en: 'Manage Attendance' },
  [P.ATTENDANCE_EXPORT]:        { ar: 'تصدير الحضور', en: 'Export Attendance' },
  [P.ATTENDANCE_SELF_CHECKIN]:  { ar: 'تسجيل حضور ذاتي', en: 'Self Check-in' },

  // Suppliers
  [P.SUPPLIERS_VIEW]:           { ar: 'عرض الموردين', en: 'View Suppliers' },
  [P.SUPPLIERS_CREATE]:         { ar: 'إضافة مورد', en: 'Create Supplier' },
  [P.SUPPLIERS_EDIT]:           { ar: 'تعديل مورد', en: 'Edit Supplier' },
  [P.SUPPLIERS_DELETE]:         { ar: 'حذف مورد', en: 'Delete Supplier' },
  [P.SUPPLIERS_PAYMENTS_VIEW]:  { ar: 'عرض مدفوعات الموردين', en: 'View Supplier Payments' },
  [P.SUPPLIERS_PAYMENTS_RECORD]:{ ar: 'تسجيل دفعة مورد', en: 'Record Supplier Payment' },
  [P.SUPPLIERS_ORDERS_VIEW]:    { ar: 'عرض طلبات الموردين', en: 'View Supplier Orders' },
  [P.SUPPLIERS_ORDERS_CREATE]:  { ar: 'إنشاء طلب مورد', en: 'Create Supplier Order' },
  [P.SUPPLIERS_ORDERS_EDIT]:    { ar: 'تعديل طلب مورد', en: 'Edit Supplier Order' },

  // Products
  [P.PRODUCTS_VIEW]:            { ar: 'عرض المنتجات', en: 'View Products' },
  [P.PRODUCTS_CREATE]:          { ar: 'إضافة منتج', en: 'Create Product' },
  [P.PRODUCTS_EDIT]:            { ar: 'تعديل منتج', en: 'Edit Product' },
  [P.PRODUCTS_DELETE]:          { ar: 'حذف منتج', en: 'Delete Product' },
  [P.PRODUCTS_PRICING_MANAGE]:  { ar: 'إدارة التسعير', en: 'Manage Pricing' },
  [P.PRODUCTS_CATALOG_PUBLISH]: { ar: 'نشر الكتالوج', en: 'Publish Catalog' },

  // Reports
  [P.REPORTS_VIEW]:             { ar: 'عرض التقارير', en: 'View Reports' },
  [P.REPORTS_EXPORT]:           { ar: 'تصدير التقارير', en: 'Export Reports' },
  [P.REPORTS_SALES]:            { ar: 'تقرير المبيعات', en: 'Sales Report' },
  [P.REPORTS_PERFORMANCE]:      { ar: 'تقرير الأداء', en: 'Performance Report' },
  [P.REPORTS_FINANCIAL_KPI]:    { ar: 'المؤشرات المالية', en: 'Financial KPIs' },
  [P.REPORTS_COLLECTION]:       { ar: 'تقرير التحصيل', en: 'Collection Report' },
  [P.REPORTS_RETURNS]:          { ar: 'تقرير المرتجعات', en: 'Returns Report' },
  [P.REPORTS_APPROVALS]:        { ar: 'تقرير الاعتمادات', en: 'Approvals Report' },
  [P.REPORTS_TIMESERIES]:       { ar: 'تقرير زمني', en: 'Time Series Report' },
  [P.REPORTS_PRIORITIES]:       { ar: 'تقرير الأولويات', en: 'Priorities Report' },

  // Dashboards
  [P.DASHBOARD_EXEC]:           { ar: 'لوحة المدير التنفيذي', en: 'Exec Dashboard' },
  [P.DASHBOARD_OPS]:            { ar: 'لوحة العمليات', en: 'Ops Dashboard' },
  [P.DASHBOARD_CS]:             { ar: 'لوحة خدمة العملاء', en: 'CS Dashboard' },
  [P.DASHBOARD_DESIGNER]:       { ar: 'لوحة المصمم', en: 'Designer Dashboard' },
  [P.DASHBOARD_PRODUCTION]:     { ar: 'لوحة الإنتاج', en: 'Production Dashboard' },
  [P.DASHBOARD_SHIPPING]:       { ar: 'لوحة الشحن', en: 'Shipping Dashboard' },
  [P.DASHBOARD_FINANCIAL]:      { ar: 'لوحة المالية', en: 'Financial Dashboard' },

  // Conversations
  [P.CONVERSATIONS_VIEW]:          { ar: 'عرض المحادثات', en: 'View Conversations' },
  [P.CONVERSATIONS_CREATE]:        { ar: 'إنشاء محادثة', en: 'Create Conversation' },
  [P.CONVERSATIONS_SEND_MESSAGE]:  { ar: 'إرسال رسالة', en: 'Send Message' },
  [P.CONVERSATIONS_EDIT_MESSAGE]:  { ar: 'تعديل رسالة', en: 'Edit Message' },
  [P.CONVERSATIONS_DELETE_MESSAGE]: { ar: 'حذف رسالة', en: 'Delete Message' },
  [P.CONVERSATIONS_PIN_MESSAGE]:   { ar: 'تثبيت رسالة', en: 'Pin Message' },
  [P.CONVERSATIONS_INTERNAL]:      { ar: 'المحادثات الداخلية', en: 'Internal Conversations' },
  [P.CONVERSATIONS_CLIENT]:        { ar: 'محادثات العملاء', en: 'Client Conversations' },
  [P.CONVERSATIONS_ORDER_THREAD]:  { ar: 'محادثة الطلب', en: 'Order Thread' },

  // Inbox
  [P.INBOX_VIEW]:               { ar: 'عرض الوارد', en: 'View Inbox' },
  [P.INBOX_STORIES_POST]:       { ar: 'نشر قصة', en: 'Post Story' },
  [P.INBOX_STORIES_DELETE]:     { ar: 'حذف قصة', en: 'Delete Story' },

  // Gallery
  [P.GALLERY_VIEW]:             { ar: 'عرض المعرض', en: 'View Gallery' },
  [P.GALLERY_PUBLISH]:          { ar: 'نشر في المعرض', en: 'Publish to Gallery' },
  [P.GALLERY_EDIT]:             { ar: 'تعديل عنصر', en: 'Edit Gallery Item' },
  [P.GALLERY_DELETE]:           { ar: 'حذف عنصر', en: 'Delete Gallery Item' },
  [P.GALLERY_FEATURE]:          { ar: 'تمييز عنصر', en: 'Feature Gallery Item' },

  // Settings
  [P.SETTINGS_VIEW]:            { ar: 'عرض الإعدادات', en: 'View Settings' },
  [P.SETTINGS_EDIT]:            { ar: 'تعديل الإعدادات', en: 'Edit Settings' },
  [P.SETTINGS_MASTER_LISTS]:    { ar: 'القوائم الرئيسية', en: 'Master Lists' },
  [P.SETTINGS_FINANCIAL_POLICY]:{ ar: 'السياسة المالية', en: 'Financial Policy' },
  [P.SETTINGS_WHATSAPP]:        { ar: 'إعدادات واتساب', en: 'WhatsApp Settings' },
  [P.SETTINGS_ROLES_MANAGE]:    { ar: 'إدارة الأدوار', en: 'Manage Roles' },
  [P.SETTINGS_USERS_MANAGE]:    { ar: 'إدارة المستخدمين', en: 'Manage Users' },

  // System
  [P.AUDIT_VIEW]:               { ar: 'عرض سجل التدقيق', en: 'View Audit Log' },
  [P.AUDIT_EXPORT]:             { ar: 'تصدير سجل التدقيق', en: 'Export Audit Log' },
  [P.SYSTEM_DIAGNOSTICS]:       { ar: 'تشخيصات النظام', en: 'System Diagnostics' },
  [P.SYSTEM_IMPERSONATE]:       { ar: 'انتحال مستخدم', en: 'Impersonate User' },
  [P.SYSTEM_MIGRATION]:         { ar: 'ترحيل البيانات', en: 'Data Migration' },
});
