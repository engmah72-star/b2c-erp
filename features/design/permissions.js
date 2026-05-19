/**
 * features/design/permissions.js
 *
 * طبقة صلاحيات لـ feature التصميم — تستورد من core/permissions-matrix.js
 * (Single Source of Truth — RULE 8.4).
 *
 * الهدف: helpers سياقية لـ design workflow بدون تكرار logic الصلاحيات.
 *
 * الاستخدام:
 *   import { canSeePhone, canSeeDesign, isAdmin, isDesignerRole, getDesignDefaultView } from './permissions.js';
 */

import {
  canSeeField,
  maskPhone,
  ROLE_CAN_SEE_PHONE,
  ROLE_CAN_SEE_DESIGN,
} from '../../core/permissions-matrix.js';

// ══ Role groups (للـ design context) ══════════════════════
const ADMIN_ROLES = new Set(['admin', 'operation_manager']);
const DESIGNER_ROLES = new Set(['graphic_designer', 'design_operator']);
const CS_ROLES = new Set(['customer_service']);
const DESIGN_ACCESS_ROLES = new Set([
  'admin', 'operation_manager', 'customer_service',
  'graphic_designer', 'design_operator',
]);

// ══ Predicates ════════════════════════════════════════════
export const isAdmin = (role) => ADMIN_ROLES.has(role);
export const isDesignerRole = (role) => DESIGNER_ROLES.has(role);
export const isCSRole = (role) => CS_ROLES.has(role);
export const hasDesignAccess = (role) => DESIGN_ACCESS_ROLES.has(role);

// ══ Field-level access ════════════════════════════════════
export function canSeePhone(role, userPerms) {
  return canSeeField('client_phone', role, userPerms);
}

export function canSeeDesign(role, userPerms) {
  return canSeeField('design_data', role, userPerms);
}

export function canSeeFinancials(role, userPerms) {
  return canSeeField('price_sale', role, userPerms)
      || canSeeField('price_paid', role, userPerms);
}

// ══ Display helpers ═══════════════════════════════════════
export function displayPhone(phone, role, userPerms) {
  return maskPhone(phone, canSeePhone(role, userPerms));
}

// ══ View routing default per role ═════════════════════════
/**
 * أي view افتراضية يدخلها كل دور عند فتح /design بدون ?view=
 * يخدم router داخل design.entry.js.
 */
export function getDesignDefaultView(role) {
  if (isDesignerRole(role)) return 'dashboard';
  if (isAdmin(role) || isCSRole(role)) return 'kanban';
  return 'kanban';
}

// ══ Orders scope per role (لـ repository queries) ════════
/**
 * أي scope يستهلكه الدور افتراضياً عند subscribeDesignOrders.
 *   'all'        → كل الأوردرات في stage=design (admin/CS)
 *   'mine'       → designerId == uid (graphic_designer)
 *   'unassigned' → بدون designerId (للأدمن لعرض الـ unassigned column)
 */
export function getOrdersScope(role) {
  if (isAdmin(role) || isCSRole(role)) return 'all';
  if (isDesignerRole(role)) return 'mine';
  return 'mine';
}

// ══ Re-exports من core للراحة ════════════════════════════
export { canSeeField, maskPhone, ROLE_CAN_SEE_PHONE, ROLE_CAN_SEE_DESIGN };
