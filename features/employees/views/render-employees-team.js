/**
 * Business2Card ERP — features/employees/views/render-employees-team.js
 *
 * ━━━ DEPARTMENT OVERVIEW + KPI DISTRIBUTION (Phase CTO) ━━━
 *
 * Pure HTML builder for the department-level team overview strip on
 * employees.html. Shows each department as a compact card with key metrics
 * (headcount, attendance, avg KPI, active orders). Also renders a KPI tier
 * distribution row for quick performance oversight.
 *
 * View only — no DOM, no Firestore, no globals (RULE L1.5).
 */

const DEPARTMENTS = [
  { id: 'management', label: 'الإدارة',          ico: '👔', roles: ['admin', 'operation_manager'] },
  { id: 'cs',         label: 'خدمة العملاء',     ico: '🎧', roles: ['customer_service'] },
  { id: 'design',     label: 'التصميم',          ico: '🎨', roles: ['graphic_designer', 'design_operator'] },
  { id: 'production', label: 'الإنتاج',          ico: '🏭', roles: ['production_agent'] },
  { id: 'shipping',   label: 'الشحن',            ico: '🚚', roles: ['shipping_officer'] },
  { id: 'accounts',   label: 'المحاسبة',         ico: '💰', roles: ['wallet_manager'] },
];

/**
 * @param {Object} opts
 * @param {Array}  opts.employees   — full employees array
 * @param {Function} opts.calcKpi   — (emp, uid) → number (0-100)
 * @param {Map}    opts.attStatusMap — uid/empId → { status }
 * @param {Array}  opts.activeOrders
 * @param {string} opts.escAttr
 * @returns {string} HTML
 */
export function buildDeptOverviewHTML({ employees, calcKpi, attStatusMap, activeOrders, escAttr }) {
  const active = employees.filter(e => e.status === 'active');
  if (!active.length) return '';

  const depts = DEPARTMENTS.map(dept => {
    const inDept = active.filter(e => dept.roles.includes(e.role));
    if (!inDept.length) return null;
    const presentCount = inDept.filter(e => {
      const uid = e.authUid || e._id;
      const st = attStatusMap?.get(uid) || attStatusMap?.get(e._id);
      return st && (st.status === 'present' || st.status === 'late');
    }).length;
    const totalKpi = inDept.reduce((s, e) => s + (calcKpi(e, e.authUid || e._id) || 0), 0);
    const avgKpi = Math.round(totalKpi / inDept.length);
    const kpiCol = avgKpi >= 80 ? 'var(--g)' : avgKpi >= 60 ? 'var(--b)' : avgKpi >= 40 ? 'var(--y)' : 'var(--r)';
    const orderCount = inDept.reduce((s, e) => {
      const uid = e.authUid || e._id;
      return s + activeOrders.filter(o =>
        o.designerId === uid || o.productionAgent === uid ||
        o.shippingOfficerId === uid || o.createdBy === uid).length;
    }, 0);
    const allPresent = presentCount === inDept.length;
    return { ...dept, count: inDept.length, presentCount, avgKpi, kpiCol, orderCount, allPresent };
  }).filter(Boolean);

  if (!depts.length) return '';

  // KPI tier distribution across all active employees
  const tiers = { excellent: 0, good: 0, attention: 0, danger: 0 };
  active.forEach(e => {
    const score = calcKpi(e, e.authUid || e._id) || 0;
    if (score >= 90) tiers.excellent++;
    else if (score >= 70) tiers.good++;
    else if (score >= 50) tiers.attention++;
    else tiers.danger++;
  });

  const tierHtml = `<div class="emp2-kpi-tiers">
    ${tiers.excellent ? `<span class="emp2-tier" style="--tc:var(--g)" title="ممتاز (90+)">⭐ ${tiers.excellent}</span>` : ''}
    ${tiers.good ? `<span class="emp2-tier" style="--tc:var(--b)" title="جيد (70-89)">👍 ${tiers.good}</span>` : ''}
    ${tiers.attention ? `<span class="emp2-tier" style="--tc:var(--y)" title="يحتاج متابعة (50-69)">⚠️ ${tiers.attention}</span>` : ''}
    ${tiers.danger ? `<span class="emp2-tier" style="--tc:var(--r)" title="خطر (أقل من 50)">🔴 ${tiers.danger}</span>` : ''}
  </div>`;

  const deptsHtml = depts.map(d => `
    <div class="emp2-dept-card" data-act="dept-filter" data-roles="${escAttr(d.roles.join(','))}" role="button" tabindex="0">
      <div class="emp2-dept-head">
        <span class="emp2-dept-ico">${d.ico}</span>
        <span class="emp2-dept-name">${d.label}</span>
        <span class="emp2-dept-cnt">👥 ${d.count}</span>
      </div>
      <div class="emp2-dept-metrics">
        <span class="emp2-dept-m" title="حاضر اليوم" style="color:${d.allPresent ? 'var(--g)' : d.presentCount === 0 ? 'var(--r)' : 'var(--dim2)'}">🟢 ${d.presentCount}/${d.count}</span>
        <span class="emp2-dept-m" title="متوسط الأداء" style="color:${d.kpiCol}">📊 ${d.avgKpi}</span>
        ${d.orderCount ? `<span class="emp2-dept-m" title="أوردرات نشطة">📦 ${d.orderCount}</span>` : ''}
      </div>
    </div>`).join('');

  return `<div class="emp2-team-section">
    <div class="emp2-team-hdr">
      <span class="emp2-team-title">🏢 الأقسام</span>
      ${tierHtml}
    </div>
    <div class="emp2-dept-grid">${deptsHtml}</div>
  </div>`;
}
