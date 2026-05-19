/**
 * core/permissions-matrix.js — مصدر واحد للأذونات والـ Role/Field matrix
 *
 * RULE 8 governance: كل قرار صلاحية يمر هنا.
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

// ══ Role × Field Access Matrix ══════════════════════════
// كل دور: ما الحقول التي يقدر يراها افتراضياً.
// users.permissions في Firestore يقدر يُعدِّل هذه على مستوى المستخدم.
export const DEFAULT_PERMISSIONS = {
  admin: {
    price_sale:true, price_paid:true, price_remaining:true, price_cost:true, price_margin:true,
    client_phone:true, design_data:true,
    supplier_name:true, supplier_cost:true,
    reports_sales:true, reports_perf:true, kpi_revenue:true,
    ship_cost:true, ship_company:true
  },
  operation_manager: {
    price_sale:true, price_paid:true, price_remaining:true, price_cost:true, price_margin:true,
    client_phone:true, design_data:false,
    supplier_name:true, supplier_cost:true,
    reports_sales:true, reports_perf:true, kpi_revenue:true,
    ship_cost:true, ship_company:true
  },
  customer_service: {
    price_sale:true, price_paid:true, price_remaining:true, price_cost:false, price_margin:false,
    client_phone:true, design_data:true,
    supplier_name:false, supplier_cost:false,
    reports_sales:false, reports_perf:false, kpi_revenue:false,
    ship_cost:false, ship_company:true
  },
  graphic_designer: {
    price_sale:false, price_paid:false, price_remaining:false, price_cost:false, price_margin:false,
    client_phone:false, design_data:true,
    supplier_name:false, supplier_cost:false,
    reports_sales:false, reports_perf:false, kpi_revenue:false,
    ship_cost:false, ship_company:false
  },
  design_operator: {
    price_sale:false, price_paid:false, price_remaining:false, price_cost:false, price_margin:false,
    client_phone:false, design_data:true,
    supplier_name:true, supplier_cost:false,
    reports_sales:false, reports_perf:true, kpi_revenue:false,
    ship_cost:false, ship_company:false
  },
  production_agent: {
    price_sale:false, price_paid:false, price_remaining:false, price_cost:true, price_margin:false,
    client_phone:false, design_data:true,
    supplier_name:true, supplier_cost:true,
    reports_sales:false, reports_perf:false, kpi_revenue:false,
    ship_cost:false, ship_company:false
  },
  shipping_officer: {
    price_sale:false, price_paid:false, price_remaining:true, price_cost:false, price_margin:false,
    client_phone:true, design_data:false,
    supplier_name:false, supplier_cost:false,
    reports_sales:false, reports_perf:false, kpi_revenue:false,
    ship_cost:true, ship_company:true
  },
  wallet_manager: {
    price_sale:true, price_paid:true, price_remaining:true, price_cost:true, price_margin:true,
    client_phone:false, design_data:false,
    supplier_name:true, supplier_cost:true,
    reports_sales:true, reports_perf:false, kpi_revenue:true,
    ship_cost:true, ship_company:true
  },
};

// ══ Sensitive Fields — fail-closed by default ══════════════
export const SENSITIVE_FIELDS = new Set([
  'client_phone',
  'design_data',
  'supplier_cost',
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
