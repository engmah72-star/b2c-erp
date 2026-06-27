/**
 * Business2Card ERP — features/reports/views/render-designers-sales.js
 *
 * ━━━ DESIGNERS + SALES TAB VIEWS (Phase-2 · reports god-page decomp) ━━━
 *
 * Pure HTML builders for designers + sales tabs.
 */

const defaultFormat = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

/**
 * Build the designers tab HTML.
 *
 * @param {Object} args
 * @param {Object} args.stats — { stats, topId } from buildDesignerStats
 */
export function buildDesignersTabHTML({ stats }) {
  const { stats: designerStats, topId } = stats;
  if (!designerStats.length) {
    return '<div class="empty-pretty"><div class="ico">🎨</div><div class="ttl">لا توجد بيانات مصممين</div><div class="sub">جرّب توسيع الفترة الزمنية أو تأكد إن المصممين معيّنين على الأوردرات وموجودين في صفحة الموظفين</div></div>';
  }
  return designerStats.map(s => {
    const isTop = topId && (s.emp._id === topId || s.emp.authUid === topId) && s.done > 0;
    return `<div class="rep-card" ${isTop ? 'style="border-color:rgba(255,215,0,.35);background:linear-gradient(135deg,rgba(255,215,0,.04),var(--bg2))"' : ''}>
      <div class="rep-card-head">
        <div><div class="rep-name">${isTop ? '<span class="tp-crown">🏆 الأفضل</span>' : ''}🎨 ${s.name}</div><div class="rep-sub">${s.emp.role || 'مصمم'}</div></div>
        <div class="text-left"><div style="font-size:20px;font-weight:var(--fw-heavy);color:var(--b)">${s.orders.length}</div><div class="txt-meta-xs">أوردر</div></div>
      </div>
      <div class="rep-stats">
        <div class="rep-stat"><div class="rep-stat-val" style="color:var(--g)">${s.done}</div><div class="rep-stat-lbl">أنجز</div></div>
        <div class="rep-stat"><div class="rep-stat-val" style="color:var(--y)">${s.pending}</div><div class="rep-stat-lbl">جاري</div></div>
        <div class="rep-stat"><div class="rep-stat-val" style="color:var(--b)">${s.avgDays > 0 ? s.avgDays.toFixed(1) + 'يوم' : '—'}</div><div class="rep-stat-lbl">متوسط</div></div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${s.pct}%;background:linear-gradient(90deg,var(--b),var(--p))"></div></div>
      <div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:4px;text-align:left">${s.pct}% إنجاز</div>
    </div>`;
  }).join('');
}

/**
 * Build the performance tab HTML (مدة إنجاز كل فرد + الالتزام بالـ SLA).
 *
 * @param {Object} args
 * @param {Object} args.stats — { people } from buildStagePerformanceStats
 */
export function buildStagePerformanceTabHTML({ stats }) {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const people = (stats && stats.people) || [];
  if (!people.length) {
    return '<div class="empty-pretty"><div class="ico">⏱️</div><div class="ttl">لا توجد بيانات أداء</div><div class="sub">محتاج أوردرات مكتملة المراحل مع مسؤولين معيّنين وتواريخ مراحل (stageEnteredAt)</div></div>';
  }
  const slaColor = pct => pct >= 80 ? 'var(--g)' : (pct >= 50 ? 'var(--y)' : 'var(--r)');

  const groups = new Map();
  for (const p of people) {
    const key = (p.name || '').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: p.name, stages: [], totalCount: 0, totalOnTime: 0, totalLate: 0 });
    const g = groups.get(key);
    g.stages.push(p);
    g.totalCount += p.count; g.totalOnTime += p.onTime; g.totalLate += p.late;
  }
  const sorted = [...groups.values()].sort((a, b) => b.totalCount - a.totalCount);

  return sorted.map(g => {
    const overallPct = g.totalCount ? Math.round(g.totalOnTime / g.totalCount * 100) : 0;
    return `<div class="rep-card">
      <div class="rep-card-head">
        <div><div class="rep-name">👤 ${esc(g.name)}</div></div>
        <div class="text-left"><div style="font-size:20px;font-weight:var(--fw-heavy);color:var(--b)">${g.totalCount}</div><div class="txt-meta-xs">أوردر</div></div>
      </div>
      ${g.stages.map(p => `<div style="padding:8px 0;border-top:1px solid rgba(255,255,255,.06)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div class="rep-sub">${esc(p.stageLabel)}${p.slaHours ? ' · SLA ' + p.slaHours + 'س' : ''}</div>
          <div style="font-size:var(--fs-sm);color:var(--dim2)">${p.count} أوردر</div>
        </div>
        <div class="rep-stats">
          <div class="rep-stat"><div class="rep-stat-val" style="color:var(--snow)">${esc(p.avgText)}</div><div class="rep-stat-lbl">متوسط</div></div>
          <div class="rep-stat"><div class="rep-stat-val" style="color:var(--g)">${p.onTime}</div><div class="rep-stat-lbl">ضمن المدة</div></div>
          <div class="rep-stat"><div class="rep-stat-val" style="color:var(--r)">${p.late}</div><div class="rep-stat-lbl">متأخر</div></div>
          <div class="rep-stat"><div class="rep-stat-val" style="color:${slaColor(p.slaPct)}">${p.slaPct}%</div><div class="rep-stat-lbl">التزام</div></div>
        </div>
      </div>`).join('')}
      <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:${overallPct}%;background:${slaColor(overallPct)}"></div></div>
      <div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:4px;text-align:left">${overallPct}% التزام بالمدة</div>
    </div>`;
  }).join('');
}

/**
 * Build the sales tab HTML.
 *
 * @param {Object} args
 * @param {Object}   args.stats   — from buildSalesTabStats
 * @param {Function} args.kpi
 * @param {Function} args.bar
 * @param {Function} [args.format=defaultFormat]
 */
export function buildSalesTabHTML({ stats, kpi, bar, format = defaultFormat }) {
  const s = stats;
  return `
    <div class="kpi-grid">
      ${kpi(format(s.tot) + ' ج', 'الإيرادات', 'var(--b)', s.pTot)}
      ${kpi(format(s.costs) + ' ج', 'التكاليف', 'var(--r)', s.pCosts)}
      ${kpi((s.profit >= 0 ? 'ربح ' : 'خسارة ') + format(Math.abs(s.profit)) + ' ج', s.profit >= 0 ? 'الربح' : 'الخسارة', s.profit >= 0 ? 'var(--g)' : 'var(--r)', s.pTot - s.pCosts)}
      ${kpi(s.margin + '%', 'هامش الربح', s.margin >= 30 ? 'var(--g)' : 'var(--y)')}
    </div>
    <div class="chart-wrap">
      <div class="chart-title">📦 أكثر المنتجات مبيعاً</div>
      ${s.sortedProducts.slice(0, 10).map(([name, v]) =>
        bar(name, v.count, s.maxProductCount, 'linear-gradient(90deg,var(--r),var(--p))', ' أوردر')
      ).join('')}
    </div>
    <div class="chart-wrap">
      <div class="chart-title">💰 مقارنة الإيرادات والتكاليف</div>
      ${bar('إيرادات', s.tot, Math.max(s.tot, s.costs), 'var(--b)', ' ج')}
      ${bar('تكاليف', s.costs, Math.max(s.tot, s.costs), 'var(--r)', ' ج')}
      ${bar('ربح', Math.max(s.profit, 0), Math.max(s.tot, s.costs), 'var(--g)', ' ج')}
    </div>`;
}
