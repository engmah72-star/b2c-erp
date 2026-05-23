/**
 * Business2Card ERP — core/employee-salary-calc.js
 *
 * ━━━ EMPLOYEE SALARY SUGGESTION CALCULATOR (Phase-1C · god-page decomp) ━━━
 *
 * Pure-function salary calculator extracted from employee-profile.html
 * (computeSuggestedForMonth + updateSalaryCalc share the same logic).
 * No DOM, no Firestore, no globals.
 *
 * الصيغة:
 *   suggested = base
 *     − absenceDeduction       (dailyRate × غياب)
 *     − tardinessDeduction     (dailyRate × tardinessDays حسب ladder الـ late)
 *     + attendanceBonus        (شهر كامل بدون غياب/تأخير)
 *     + Math.round(commission) (حسب الدور — مطابق لـ employee-kpis)
 *
 * Tardiness ladder (دقائق التأخير → days fraction):
 *   ≤30   → 0      (within grace)
 *   31-120 → 0.25
 *   121-240 → 0.5
 *   >240  → 1.0
 *
 * Commission على paidAt فقط (fallback لـ createdAt) — paid orders this month.
 */

// ── helpers (private, pure) ─────────────────────────────────────────

function isWorkDayFor(dateStr, workSchedule) {
  const days = workSchedule?.days;
  const d = new Date(dateStr).getDay();
  if (!days?.length) return d !== 5 && d !== 6;
  return days.includes(d);
}

function isLeaveDayFor(dateStr, leaves = []) {
  return leaves.some(lv =>
    dateStr >= (lv.startDate || '') &&
    dateStr <= (lv.endDate || lv.startDate || '')
  );
}

function tardinessDaysFor(lateMinutes) {
  if (lateMinutes > 240) return 1;
  if (lateMinutes > 120) return 0.5;
  if (lateMinutes > 30)  return 0.25;
  return 0;
}

function computeCommissionForMonth({ employee, employeeId, allOrders, mYear, mMon }) {
  if (!employee) return 0;
  const uid = employee.authUid || employeeId;
  const paidM = allOrders.filter(o => {
    if (o.paymentStatus !== 'paid') return false;
    const pd = o.paidAt?.toDate?.();
    if (pd) return pd.getMonth() === mMon && pd.getFullYear() === mYear;
    const cd = o.createdAt?.toDate?.();
    return cd && cd.getMonth() === mMon && cd.getFullYear() === mYear;
  });
  const pct = parseFloat(employee.commissionPct) || 0;
  const perOrder = parseFloat(employee.commissionPerOrder) || 0;
  if (employee.role === 'graphic_designer' || employee.role === 'design_operator') {
    return paidM
      .filter(o => o.designerId === uid || o.designerId === employeeId)
      .reduce((s, o) => s + ((parseFloat(o.salePrice) || 0) * pct / 100), 0);
  }
  if (employee.role === 'production_agent') {
    return paidM.filter(o => o.productionAgent === uid).length * perOrder;
  }
  if (employee.role === 'shipping_officer') {
    return paidM.filter(o => o.shippingOfficerId === uid).length * perOrder;
  }
  if (employee.role === 'customer_service') {
    return paidM.filter(o => o.createdBy === uid).length * perOrder;
  }
  return 0;
}

// ── public API ──────────────────────────────────────────────────────

/**
 * Compute the suggested monthly salary for an employee + full breakdown.
 *
 * @param {Object} args
 * @param {string} args.mKey                 — 'YYYY-MM'
 * @param {Object} args.employee             — { baseSalary, role, authUid?, attendanceBonus?, commissionPct?, commissionPerOrder?, workSchedule? }
 * @param {string} args.employeeId
 * @param {Array}  [args.attendance=[]]      — [{ date, monthKey?, lateMinutes? }, ...]
 * @param {Array}  [args.leaves=[]]          — [{ startDate, endDate? }, ...]
 * @param {Array}  [args.allOrders=[]]       — unfiltered orders (for commission)
 * @param {number} [args.fallbackWorkDays=26]— used when month has 0 work days
 *
 * @returns {{
 *   base, commission, suggested, month,
 *   workDays, daysPresent, daysAbsent, dailyRate,
 *   absenceDeduction, tardinessDays, tardinessDeduction, lateRecords,
 *   attendanceBonus,
 * }}
 */
export function computeSalarySuggestion({
  mKey,
  employee,
  employeeId,
  attendance = [],
  leaves = [],
  allOrders = [],
  fallbackWorkDays = 26,
}) {
  if (!employee || !mKey) {
    return {
      base: 0, commission: 0, suggested: 0, month: mKey || '',
      workDays: 0, daysPresent: 0, daysAbsent: 0, dailyRate: 0,
      absenceDeduction: 0, tardinessDays: 0, tardinessDeduction: 0, lateRecords: 0,
      attendanceBonus: 0,
    };
  }

  const [ys, ms] = mKey.split('-').map(Number);
  const mYear = ys, mMon = ms - 1;
  const dim = new Date(mYear, mMon + 1, 0).getDate();
  const base = parseFloat(employee.baseSalary) || 0;

  // attendance for this month — accept either monthKey field or date prefix
  const mAtt = attendance.filter(a =>
    a.monthKey === mKey || (a.date && a.date.startsWith(mKey))
  );

  // expected work days (full month — same as legacy)
  let workDays = 0;
  for (let d = 1; d <= dim; d++) {
    const ds = mKey + '-' + String(d).padStart(2, '0');
    if (isWorkDayFor(ds, employee.workSchedule) && !isLeaveDayFor(ds, leaves)) workDays++;
  }
  if (workDays === 0) workDays = fallbackWorkDays;

  const daysPresent = mAtt.length;
  const daysAbsent = Math.max(0, workDays - daysPresent);
  const dailyRate = base / workDays;
  const absenceDeduction = Math.round(dailyRate * daysAbsent);

  // tardiness
  let tardinessDays = 0, lateRecords = 0;
  for (const a of mAtt) {
    const lm = parseInt(a.lateMinutes) || 0;
    if (lm > 0) lateRecords++;
    tardinessDays += tardinessDaysFor(lm);
  }
  const tardinessDeduction = Math.round(dailyRate * tardinessDays);

  // attendance bonus: زيرو غياب AND زيرو تأخير → full bonus
  const attendanceBonus = (daysAbsent === 0 && tardinessDays === 0)
    ? (parseFloat(employee.attendanceBonus) || 0) : 0;

  const commission = computeCommissionForMonth({ employee, employeeId, allOrders, mYear, mMon });

  const suggested = Math.max(
    0,
    base - absenceDeduction - tardinessDeduction + attendanceBonus + Math.round(commission)
  );

  return {
    base,
    commission: Math.round(commission),
    suggested,
    month: mKey,
    workDays, daysPresent, daysAbsent, dailyRate,
    absenceDeduction,
    tardinessDays, tardinessDeduction, lateRecords,
    attendanceBonus,
  };
}
