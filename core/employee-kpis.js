/**
 * Business2Card ERP — core/employee-kpis.js
 *
 * ━━━ EMPLOYEE ROLE-BASED KPIs (Phase-1B · god-page decomp) ━━━
 *
 * Pure-function KPI builder + monthly commission calculator extracted from
 * employee-profile.html (L703–784). No DOM, no Firestore, no globals.
 *
 * Used by:
 *   - employee-profile.html  → renderAll() KPI row
 *   - reports/dashboards     (future)
 *
 * Roles covered:
 *   graphic_designer / design_operator → assigned, printed, rejected, success_rate
 *   customer_service / operation_manager → orders, clients, sales, close_rate
 *   production_agent → orders, done, wip, cost
 *   shipping_officer → shipments, collected, done, completion_rate
 *   default (admin / wallet_manager / etc.) → salary, start_date, status, orders
 *
 * Commission: حسب التحصيل (paidAt) — paid orders this month فقط.
 */

const DONE_STAGES = ['printing', 'production', 'shipping', 'archived'];
const SHIPPED_STAGES = ['shipping', 'archived'];

const defaultFormat = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

// ── private: commission per role ───────────────────────────────────

function computeMonthlyCommission({ employee, employeeId, allOrders, mKey }) {
  if (!employee || !mKey) return 0;
  const uid = employee.authUid || employeeId;
  const [ys, ms] = mKey.split('-').map(Number);
  const paidM = allOrders.filter(o => {
    if (o.paymentStatus !== 'paid') return false;
    const pd = o.paidAt?.toDate?.();
    if (pd) return pd.getMonth() === (ms - 1) && pd.getFullYear() === ys;
    const cd = o.createdAt?.toDate?.();
    return cd && cd.getMonth() === (ms - 1) && cd.getFullYear() === ys;
  });
  const pct = parseFloat(employee.commissionPct) || 0;
  const perOrder = parseFloat(employee.commissionPerOrder) || 0;

  if (employee.role === 'graphic_designer' || employee.role === 'design_operator') {
    return paidM
      .filter(o => o.designerId === uid || o.designerId === employeeId)
      .reduce((s, o) => s + ((parseFloat(o.salePrice) || 0) * pct / 100), 0);
  }
  if (employee.role === 'production_agent') {
    return paidM.filter(o => o.productionAgent === uid || o.productionAgent === employeeId).length * perOrder;
  }
  if (employee.role === 'shipping_officer') {
    return paidM.filter(o => o.shippingOfficerId === uid || o.shippingOfficerId === employeeId).length * perOrder;
  }
  if (employee.role === 'customer_service') {
    return paidM.filter(o => o.createdBy === uid).length * perOrder;
  }
  return 0;
}

// ── private: KPI builders per role ─────────────────────────────────

function kpisForDesigner({ myOrders, format }) {
  const assigned = myOrders.length;
  const printed = myOrders.filter(o => DONE_STAGES.includes(o.stage)).length;
  const rejected = myOrders.filter(o => o.designStatus === 'rejected').length;
  const rate = assigned > 0 ? Math.round(printed / assigned * 100) : 0;
  return [
    { val: assigned,    lbl: 'كُلّفت',       col: 'var(--b)' },
    { val: printed,     lbl: 'طباعة ✅',    col: 'var(--g)' },
    { val: rejected,    lbl: 'مرفوض',       col: 'var(--r)' },
    { val: rate + '%',  lbl: 'نسبة النجاح', col: 'var(--y)' },
  ];
}

function kpisForSalesOrOps({ myOrders, format }) {
  const totalSales = myOrders.reduce((s, o) => s + (parseFloat(o.salePrice) || 0), 0);
  const clients = new Set(myOrders.map(o => o.clientId || o.clientPhone || o.clientName)).size;
  const closed = myOrders.filter(o => o.stage === 'archived').length;
  return [
    { val: myOrders.length, lbl: 'أوردرات',  col: 'var(--b)' },
    { val: clients,         lbl: 'عملاء',    col: 'var(--c)' },
    { val: format(totalSales), lbl: 'مبيعات ج', col: 'var(--g)' },
    {
      val: myOrders.length > 0 ? Math.round(closed / myOrders.length * 100) + '%' : '—',
      lbl: 'إغلاق', col: 'var(--y)',
    },
  ];
}

function kpisForProduction({ myOrders, employee, employeeUid, format }) {
  const done = myOrders.filter(o => SHIPPED_STAGES.includes(o.stage)).length;
  const wip = myOrders.filter(o => o.stage === 'production').length;
  const empName = employee.name || '';
  const totalCost = myOrders.reduce((s, o) => {
    const costs = (o.costItems || []).filter(c => !empName || c.addedBy === empName || o.productionAgent === employeeUid);
    return s + costs.reduce((s2, c) => s2 + (parseFloat(c.total) || 0), 0);
  }, 0);
  return [
    { val: myOrders.length,    lbl: 'أوردرات تنفيذ', col: 'var(--b)' },
    { val: done,               lbl: 'مكتمل ✅',      col: 'var(--g)' },
    { val: wip,                lbl: 'جاري 🏭',       col: 'var(--y)' },
    { val: format(totalCost),  lbl: 'تكلفة تنفيذ ج', col: 'var(--r)' },
  ];
}

function kpisForShipping({ myOrders, format }) {
  const shipped = myOrders.filter(o => SHIPPED_STAGES.includes(o.stage));
  const collected = shipped.reduce((s, o) => s + (parseFloat(o.totalPaid) || parseFloat(o.paid) || 0), 0);
  const done = shipped.filter(o => o.stage === 'archived').length;
  return [
    { val: shipped.length,     lbl: 'شحنات',         col: 'var(--c)' },
    { val: format(collected),  lbl: 'محصّل ج',       col: 'var(--g)' },
    { val: done,               lbl: 'مكتمل',         col: 'var(--b)' },
    {
      val: shipped.length > 0 ? Math.round(done / shipped.length * 100) + '%' : '—',
      lbl: 'نسبة الإتمام', col: 'var(--y)',
    },
  ];
}

function kpisDefault({ myOrders, employee }) {
  return [
    { val: employee.baseSalary || 0,  lbl: 'المرتب ج',     col: 'var(--g)' },
    { val: employee.startDate || '—', lbl: 'تاريخ التعيين', col: 'var(--b)' },
    { val: employee.status === 'active' ? '✅' : '⏸️', lbl: 'الحالة', col: 'var(--y)' },
    { val: myOrders.length || '—',    lbl: 'أوردرات',      col: 'var(--dim2)' },
  ];
}

// ── public API ──────────────────────────────────────────────────────

/**
 * Build role-specific KPI cards + monthly income breakdown.
 *
 * @param {Object} args
 * @param {Object} args.employee     — { role, authUid, name, baseSalary, startDate, status, commissionPct, commissionPerOrder }
 * @param {string} args.employeeId
 * @param {Array}  [args.myOrders=[]]    — orders pre-filtered for this employee + period
 * @param {Array}  [args.allOrders=[]]   — unfiltered orders (for commission calc on paid this month)
 * @param {string} args.mKey         — current month 'YYYY-MM' (for commission)
 * @param {Function} [args.format]   — number formatter; defaults to ar-EG locale
 *
 * @returns {{kpis: Array<{val, lbl, col}>, income: {base:number, commission:number, total:number}}}
 */
export function computeRoleKpis({
  employee,
  employeeId,
  myOrders = [],
  allOrders = [],
  mKey,
  format = defaultFormat,
}) {
  if (!employee) {
    return { kpis: [], income: { base: 0, commission: 0, total: 0 } };
  }

  const employeeUid = employee.authUid || employeeId;
  let kpis;
  switch (employee.role) {
    case 'graphic_designer':
    case 'design_operator':
      kpis = kpisForDesigner({ myOrders, format }); break;
    case 'customer_service':
    case 'operation_manager':
      kpis = kpisForSalesOrOps({ myOrders, format }); break;
    case 'production_agent':
      kpis = kpisForProduction({ myOrders, employee, employeeUid, format }); break;
    case 'shipping_officer':
      kpis = kpisForShipping({ myOrders, format }); break;
    default:
      kpis = kpisDefault({ myOrders, employee });
  }

  const base = parseFloat(employee.baseSalary) || 0;
  const commission = computeMonthlyCommission({ employee, employeeId, allOrders, mKey });

  return {
    kpis,
    income: { base, commission, total: base + commission },
  };
}
