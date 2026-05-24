/**
 * Business2Card ERP — features/employee-profile/views/render-overview-tab.js
 *
 * ━━━ OVERVIEW TAB VIEWS (Phase-2E2 · god-page decomp) ━━━
 *
 * Pure HTML builders for the overview tab:
 *   - buildGoalsHTML, buildEvaluationsHTML, buildSkillsAndProductsHTML,
 *     buildBehaviorHTML, buildInsightsHTML, buildSkillEditTagsHTML
 *   + computeProductStats (pure helper extracted from calcProductStats)
 *   + private helpers: computeAttStreak, computeAbsent3Streak
 */

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const DAYS_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

const DONE_STAGES = ['printing', 'production', 'shipping', 'archived'];

const defaultFormat = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escJs(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ── PRODUCT STATS ──────────────────────────────────────────────────

/**
 * Aggregate product-level stats from an employee's orders.
 * @param {Array} orders — employee orders
 * @returns {Array<{name, total, done, revenue, rate}>}  top 8 by total
 */
export function computeProductStats(orders = []) {
  const map = {};
  for (const o of orders) {
    const names = o.products?.length
      ? o.products.map(p => p.name).filter(Boolean)
      : (o.product ? [o.product] : []);
    for (const n of names) {
      if (!map[n]) map[n] = { total: 0, done: 0, revenue: 0 };
      map[n].total++;
      if (DONE_STAGES.includes(o.stage)) map[n].done++;
      map[n].revenue += parseFloat(o.salePrice) || 0;
    }
  }
  return Object.entries(map)
    .map(([name, d]) => ({ name, ...d, rate: d.total > 0 ? Math.round(d.done / d.total * 100) : 0 }))
    .filter(p => p.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

// ── GOALS ──────────────────────────────────────────────────────────

/**
 * Build the goals progress bars block.
 * @param {Object} args
 * @param {Object} [args.goal]       — { targetOrdersMonthly?, targetAttendancePct?, targetQualityPct?, notes? }
 * @param {number} args.actualOrders
 * @param {number} args.actualDone
 * @param {number} args.presentDays
 * @param {number} args.elapsed      — days elapsed in current month (≥1)
 * @returns {string} HTML
 */
export function buildGoalsHTML({ goal, actualOrders = 0, actualDone = 0, presentDays = 0, elapsed = 1 }) {
  if (!goal) {
    return '<div style="text-align:center;color:var(--dim2);font-size:var(--fs-base);padding:12px 0">لا توجد أهداف مُحددة لهذا الشهر</div>';
  }
  const rows = [];
  if (goal.targetOrdersMonthly > 0) {
    const pct = Math.min(100, Math.round(actualOrders / goal.targetOrdersMonthly * 100));
    const col = pct >= 100 ? 'var(--g)' : pct >= 70 ? 'var(--b)' : 'var(--y)';
    rows.push({ lbl: '📦 الأوردرات', actual: actualOrders, target: goal.targetOrdersMonthly, pct, col });
  }
  if (goal.targetAttendancePct > 0) {
    const attPct = Math.round(presentDays / elapsed * 100);
    const pct = Math.min(100, Math.round(attPct / goal.targetAttendancePct * 100));
    const col = pct >= 100 ? 'var(--g)' : pct >= 70 ? 'var(--b)' : 'var(--r)';
    rows.push({ lbl: '⏰ الحضور', actual: attPct + '%', target: goal.targetAttendancePct + '%', pct, col });
  }
  if (goal.targetQualityPct > 0 && actualOrders > 0) {
    const qualActual = Math.round(actualDone / Math.max(1, actualOrders) * 100);
    const pct = Math.min(100, Math.round(qualActual / goal.targetQualityPct * 100));
    const col = pct >= 100 ? 'var(--g)' : pct >= 70 ? 'var(--b)' : 'var(--y)';
    rows.push({ lbl: '✅ الجودة', actual: qualActual + '%', target: goal.targetQualityPct + '%', pct, col });
  }
  if (!rows.length) {
    let html = '<div style="font-size:var(--fs-base);color:var(--dim2);text-align:center;padding:10px">لم تُحدد مؤشرات للهدف</div>';
    if (goal.notes) html += `<div style="font-size:var(--fs-base);color:var(--dim2);text-align:center;padding:4px 0">${escAttr(goal.notes)}</div>`;
    return html;
  }
  return `<div style="background:var(--bg3);border-radius:var(--rad2);padding:14px">
    ${rows.map(r => `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;font-size:var(--fs-base)">
        <span style="font-weight:var(--fw-bold)">${r.lbl}</span>
        <span style="color:var(--dim2)">${r.actual} <span style="opacity:.5">/ ${r.target}</span></span>
      </div>
      <div class="prod-bar-wrap">
        <div class="prod-bar-fill" style="width:${r.pct}%;background:${r.col}"></div>
      </div>
      <div style="font-size:var(--fs-xs);color:${r.col};font-weight:var(--fw-bold);margin-top:3px;text-align:left">${r.pct}%</div>
    </div>`).join('')}
    ${goal.notes ? `<div style="font-size:var(--fs-sm);color:var(--dim2);border-top:1px solid var(--line);padding-top:8px;margin-top:4px">💬 ${escAttr(goal.notes)}</div>` : ''}
  </div>`;
}

// ── EVALUATIONS ────────────────────────────────────────────────────

export function buildEvaluationsHTML({ evaluations = [], currentMonthKey }) {
  if (!evaluations.length) {
    return '<div class="empty-cta"><div class="empty-icon">📋</div><div class="empty-text">لا توجد تقييمات محفوظة بعد</div></div>';
  }
  return evaluations.slice(0, 6).map(ev => {
    const [yr = '', mo = ''] = (ev.month || currentMonthKey || '').split('-');
    const lbl = (MONTHS[parseInt(mo) - 1] || '') + ' ' + yr;
    const score = ev.totalScore || ev.total || 0;
    const grade = score >= 85 ? 'ممتاز' : score >= 70 ? 'جيد جداً' : score >= 50 ? 'متوسط' : 'يحتاج تطوير';
    const col = score >= 85 ? 'var(--g)' : score >= 70 ? 'var(--b)' : score >= 50 ? 'var(--y)' : 'var(--r)';
    const circ = Math.round(2 * Math.PI * 18);
    const fill = Math.round(score / 100 * circ);
    return `<div style="display:flex;align-items:center;gap:var(--space-md);padding:10px 12px;background:var(--bg3);border-radius:var(--rad);margin-bottom:6px">
      <svg width="44" height="44" viewBox="0 0 44 44" style="transform:rotate(-90deg);flex-shrink:0">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--bg2)" stroke-width="4"/>
        <circle cx="22" cy="22" r="18" fill="none" stroke="${col}" stroke-width="4"
          stroke-dasharray="${fill} ${circ}" stroke-linecap="round"/>
      </svg>
      <div style="position:absolute;width:44px;text-align:center;font-size:var(--fs-sm);font-weight:var(--fw-heavy);color:${col};margin-right:0;line-height:44px">${score}</div>
      <div style="flex:1">
        <div style="font-size:var(--fs-md);font-weight:var(--fw-extra)">${lbl} <span style="font-size:var(--fs-sm);font-weight:var(--fw-medium);color:${col}">— ${grade}</span></div>
        <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:3px">
          حضور ${ev.attScore || 0}/35 · إنتاجية ${ev.prodScore || 0}/40 · جودة ${ev.qualScore || 0}/25
          ${ev.attDays !== undefined ? ` · ${ev.attDays} يوم حضور` : ''}
          ${ev.rating ? ` · ⭐ ${ev.rating}/5` : ''}
        </div>
        ${ev.notes ? `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:2px">💬 ${escAttr(ev.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── SKILLS + PRODUCT PERFORMANCE ───────────────────────────────────

export function buildSkillsAndProductsHTML({ skills = [], products = [], totalOrders = 0, format = defaultFormat }) {
  let html = '';
  if (skills.length) {
    html += `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px">
      ${skills.map(s => `<span class="skill-tag">🏷️ ${escAttr(s)}</span>`).join('')}
    </div>`;
  } else {
    html += '<div style="font-size:var(--fs-sm);color:var(--dim2);margin-bottom:12px">لا توجد مهارات مُضافة بعد — <button class="btn btn-ghost btn-xs" onclick="openEditSkills()">أضف الآن</button></div>';
  }
  if (products.length) {
    const maxTotal = products[0].total || 1;
    html += `<div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">المنتجات حسب الأداء — إجمالي ${totalOrders} أوردر</div>`;
    html += products.map(p => {
      const rateCol = p.rate >= 80 ? 'var(--g)' : p.rate >= 50 ? 'var(--y)' : 'var(--r)';
      const isTopSkill = skills.some(s =>
        s.toLowerCase().includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(s.toLowerCase())
      );
      return `<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span style="font-size:var(--fs-base);font-weight:var(--fw-bold)">${isTopSkill ? '⭐ ' : ''}${escAttr(p.name)}</span>
          <div style="display:flex;gap:var(--space-md);font-size:var(--fs-sm)">
            <span style="color:var(--dim2)">${p.total} أوردر</span>
            <span style="font-weight:var(--fw-extra);color:${rateCol}">${p.rate}%</span>
            <span style="color:var(--g);font-weight:var(--fw-bold)">${format(p.revenue)} ج</span>
          </div>
        </div>
        <div class="prod-bar-wrap">
          <div class="prod-bar-fill" style="width:${Math.round(p.total / maxTotal * 100)}%;background:${rateCol}"></div>
        </div>
      </div>`;
    }).join('');
  } else {
    html += '<div style="text-align:center;color:var(--dim2);font-size:var(--fs-base);padding:12px 0">لا توجد أوردرات مرتبطة بعد</div>';
  }
  return html;
}

export function buildSkillEditTagsHTML({ skills = [] }) {
  return skills.length
    ? skills.map((s, i) => `<span class="skill-tag">🏷️ ${escAttr(s)}<span class="rm" onclick="removeSkill(${i})">✕</span></span>`).join('')
    : '<span style="color:var(--dim2);font-size:var(--fs-sm)">لا توجد مهارات بعد</span>';
}

// ── BEHAVIOR ANALYSIS ──────────────────────────────────────────────

function computeAttStreak({ attendance = [], now }) {
  let streak = 0;
  const today = new Date(now);
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const day = d.getDay(); if (day === 5 || day === 6) continue;
    const str = d.toISOString().slice(0, 10);
    if (attendance.some(a => a.date === str)) streak++;
    else break;
  }
  return streak;
}

function computeAbsent3Streak({ attendance = [], now }) {
  let consec = 0;
  const today = new Date(now);
  for (let i = 1; i <= 20; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const day = d.getDay(); if (day === 5 || day === 6) continue;
    const str = d.toISOString().slice(0, 10);
    if (!attendance.some(a => a.date === str)) { consec++; if (consec >= 3) return true; }
    else { consec = 0; }
  }
  return false;
}

/**
 * Build the behavior analysis block (patterns chips + 2 charts).
 * @param {Object} args
 * @param {Array}  args.attendance
 * @param {Array}  args.empOrders
 * @param {Date}   args.now
 * @returns {string} HTML
 */
export function buildBehaviorHTML({ attendance = [], empOrders = [], now }) {
  const dayCounts = Array(7).fill(0);
  for (const a of attendance) {
    if (!a.date) continue;
    const [y, m, d] = a.date.split('-').map(Number);
    const day = new Date(y, m - 1, d).getDay();
    dayCounts[day]++;
  }
  const maxDay = Math.max(...dayCounts, 1);
  const bestDayIdx = dayCounts.indexOf(Math.max(...dayCounts));

  // Last 6 months trend
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const cnt = empOrders.filter(o => {
      const od = o.createdAt?.toDate?.();
      return od && od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear();
    }).length;
    const att = attendance.filter(a => a.date?.startsWith(key)).length;
    trend.push({ lbl: MONTHS[d.getMonth()].slice(0, 3), cnt, att, key });
  }
  const maxTrend = Math.max(...trend.map(t => t.cnt), 1);

  // Patterns
  const patterns = [];
  const mKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const curMonthCnt = trend.find(t => t.key === mKey)?.cnt || 0;
  const prevMonthCnt = trend[4]?.cnt || 0;
  if (prevMonthCnt > 0) {
    const chg = Math.round((curMonthCnt - prevMonthCnt) / prevMonthCnt * 100);
    patterns.push({ ico: chg >= 0 ? '📈' : '📉', txt: `إنتاج ${chg >= 0 ? '+' : ''}${chg}% عن الشهر الماضي`, col: chg >= 0 ? 'var(--g)' : 'var(--r)' });
  }
  const streak = computeAttStreak({ attendance, now });
  if (streak > 2) patterns.push({ ico: '🔥', txt: `${streak} أيام حضور متتالية`, col: 'var(--y)' });
  if (dayCounts[bestDayIdx] > 0) patterns.push({ ico: '⭐', txt: `أفضل يوم: ${DAYS_AR[bestDayIdx]}`, col: 'var(--b)' });
  if (computeAbsent3Streak({ attendance, now })) patterns.push({ ico: '⚠️', txt: 'غياب 3+ أيام عمل متتالية مؤخراً', col: 'var(--r)' });

  return `
  ${patterns.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
    ${patterns.map(p => `<div style="background:var(--bg3);border-right:3px solid ${p.col};border-radius:var(--rad);padding:7px 12px;font-size:var(--fs-base);font-weight:var(--fw-bold)">${p.ico} ${p.txt}</div>`).join('')}
  </div>` : ''}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div>
      <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-bottom:10px">📅 توزيع الحضور بالأيام</div>
      <div style="display:flex;gap:var(--space-xs);align-items:flex-end;height:70px">
        ${dayCounts.map((c, i) => {
          const h = maxDay > 0 ? Math.max(4, Math.round(c / maxDay * 100)) : 4;
          const col = i === bestDayIdx ? 'var(--g)' : (i === 5 || i === 6 ? 'var(--bg3)' : 'var(--b)');
          return `<div class="day-bar">
            <div style="font-size:var(--fs-tiny);color:var(--dim2);font-weight:var(--fw-bold)">${c || ''}</div>
            <div class="day-bar-inner" style="height:${h}%;background:${col}"></div>
            <div style="font-size:8px;color:var(--dim2)">${DAYS_AR[i].slice(0, 3)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div>
      <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-bottom:10px">📊 إنتاج آخر 6 أشهر</div>
      <div style="display:flex;gap:var(--space-xs);align-items:flex-end;height:70px">
        ${trend.map((t, i) => {
          const h = maxTrend > 0 ? Math.max(4, Math.round(t.cnt / maxTrend * 100)) : 4;
          const isNow = i === 5;
          return `<div class="day-bar">
            <div style="font-size:var(--fs-tiny);color:var(--dim2);font-weight:var(--fw-bold)">${t.cnt || ''}</div>
            <div class="day-bar-inner" style="height:${h}%;background:${isNow ? 'var(--p)' : 'var(--b)'}"></div>
            <div style="font-size:8px;color:${isNow ? 'var(--p)' : 'var(--dim2)'};font-weight:${isNow ? '800' : '400'}">${t.lbl}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

// ── INSIGHTS ───────────────────────────────────────────────────────

/**
 * Build the smart-insights cards row.
 *
 * @param {Object} args
 * @param {Object} args.employee       — { role, status, baseSalary }
 * @param {number} args.thisMonthOrders
 * @param {number} args.lastMonthOrders
 * @param {number} args.presentDays
 * @param {number} args.elapsed        — days elapsed in current month (≥1)
 * @param {boolean} args.salaryPaid    — true if salary tx exists for this month
 * @param {Array}  args.empOrders      — for top-client aggregation
 * @param {Function} [args.format]
 * @returns {string} HTML (empty string if no insights)
 */
export function buildInsightsHTML({
  employee, thisMonthOrders = 0, lastMonthOrders = 0,
  presentDays = 0, elapsed = 1, salaryPaid = false,
  empOrders = [], format = defaultFormat,
}) {
  if (!employee) return '';
  const insights = [];
  const role = employee.role;

  if (lastMonthOrders > 0 || thisMonthOrders > 0) {
    const diff = thisMonthOrders - lastMonthOrders;
    const pct = lastMonthOrders > 0 ? Math.round(Math.abs(diff) / lastMonthOrders * 100) : 100;
    const lbl = {
      customer_service: 'أوردر', operation_manager: 'أوردر', admin: 'أوردر',
      graphic_designer: 'تصميم', design_operator: 'تصميم',
      production_agent: 'أوردر تنفيذ', shipping_officer: 'شحنة',
    }[role] || 'أوردر';
    insights.push({
      ico: diff >= 0 ? '📈' : '📉',
      title: `${diff >= 0 ? '+' : ''}${diff} ${lbl} عن الشهر الماضي`,
      sub: `هذا الشهر: ${thisMonthOrders} · الماضي: ${lastMonthOrders} · ${diff >= 0 ? '↑' : '↓'} ${pct}%`,
      col: diff >= 0 ? 'var(--g)' : 'var(--r)',
    });
  }
  const attPct = Math.round(presentDays / elapsed * 100);
  if (attPct < 60 && employee.status === 'active') {
    insights.push({
      ico: '⚠️', title: `نسبة حضور منخفضة — ${attPct}%`,
      sub: `حضر ${presentDays} من ${elapsed} يوم هذا الشهر`,
      col: 'var(--r)',
    });
  }
  if (!salaryPaid && employee.status === 'active') {
    insights.push({
      ico: '💸', title: 'لم يُصرف مرتب هذا الشهر بعد',
      sub: `المرتب الأساسي: ${format(employee.baseSalary || 0)} ج`,
      col: 'var(--y)',
    });
  }
  if (empOrders.length) {
    const map = {};
    for (const o of empOrders) {
      const k = o.clientPhone || o.clientName || '?';
      if (!map[k]) map[k] = { name: o.clientName || '—', rev: 0, cnt: 0 };
      map[k].rev += parseFloat(o.salePrice) || 0;
      map[k].cnt++;
    }
    const top = Object.values(map).sort((a, b) => b.rev - a.rev)[0];
    if (top) insights.push({
      ico: '⭐', title: `أعلى عميل: ${top.name}`,
      sub: `${top.cnt} أوردر · ${format(top.rev)} ج إجمالي`,
      col: 'var(--p)',
    });
  }
  if (!insights.length) return '';
  return `<div style="display:flex;gap:var(--space-sm);flex-wrap:wrap">${insights.map(i => `
    <div style="flex:1;min-width:200px;background:var(--bg2);border:1px solid var(--line);border-right:3px solid ${i.col};border-radius:var(--rad2);padding:10px 14px">
      <div style="font-size:var(--fs-md);font-weight:var(--fw-extra);margin-bottom:3px">${i.ico} ${escAttr(i.title)}</div>
      <div style="font-size:var(--fs-sm);color:var(--dim2)">${escAttr(i.sub)}</div>
    </div>`).join('')}</div>`;
}
