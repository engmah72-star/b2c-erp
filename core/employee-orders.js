// core/employee-orders.js
//
// ━━━ EMPLOYEE ↔ ORDER OWNERSHIP — مصدر واحد (RULE 1) ━━━
//
// «أي أوردرات تخصّ هذا الموظف؟» — فلتر نقي حسب الدور، مُستخرَج من
// employee-profile.html (getEmpOrders) ليكون المصدر الوحيد المشترك بين:
//   - employee-profile.html  → getEmpOrders (KPIs/سكور/منتجات/عملاء)
//   - employees.html         → مدخلات سكور اللوحة (computeScore)
//
// دالة نقية: لا DOM ولا Firestore ولا globals.

/**
 * يُرجع أوردرات الموظف حسب دوره (الحقل ذو الصلة فقط).
 *
 * @param {Object} args
 * @param {Array}  [args.orders=[]]   — مجموعة الأوردرات للتصفية
 * @param {Object} args.employee      — { role, name?, authUid? }
 * @param {string} args.employeeId    — معرّف وثيقة الموظف (employees/{id})
 * @param {string} [args.uid]         — authUid صريح (افتراضياً employee.authUid||employeeId)
 * @returns {Array} الأوردرات المملوكة لهذا الموظف
 */
export function filterEmployeeOrders({ orders = [], employee, employeeId, uid } = {}) {
  if (!employee) return [];
  const id = employeeId;
  const u = uid || employee.authUid || employeeId;
  const name = employee.name || '';
  const role = employee.role;

  if (role === 'customer_service' || role === 'operation_manager' || role === 'admin') {
    return orders.filter(o =>
      o.createdBy === u || o.createdBy === id ||
      (name && o.createdByName === name)
    );
  }
  if (role === 'graphic_designer' || role === 'design_operator') {
    return orders.filter(o =>
      o.designerId === u || o.designerId === id ||
      (name && o.designerName === name)
    );
  }
  if (role === 'production_agent') {
    return orders.filter(o =>
      o.productionAgent === u || o.productionAgent === id ||
      (name && ['production', 'shipping', 'archived'].includes(o.stage) && (
        o.productionAgentName === name ||
        o.costItems?.some(c => c.addedBy === name) ||
        o.timeline?.some(t => t.by === name && (
          (t.action || '').includes('تنفيذ') || (t.action || '').includes('💰') ||
          (t.action || '').includes('بند') || (t.action || '').includes('منتهي')
        ))
      ))
    );
  }
  if (role === 'shipping_officer') {
    return orders.filter(o =>
      o.shippingOfficerId === u || o.shippingOfficerId === id ||
      o.shippingOfficer === u || o.shippingOfficer === id ||
      (name && (o.shippingOfficerName === name || o.collectedByName === name))
    );
  }
  return [];
}
