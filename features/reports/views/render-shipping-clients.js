/**
 * Business2Card ERP — features/reports/views/render-shipping-clients.js
 *
 * ━━━ SHIPPING + CLIENTS TAB VIEWS (Phase-2 · reports god-page decomp) ━━━
 *
 * Pure HTML builders for the smaller analytical tabs. Accepts pre-computed
 * stats + helper callbacks.
 */

const defaultFormat = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

/**
 * Build the shipping tab HTML.
 *
 * @param {Object} args
 * @param {Object}   args.stats   — from buildShippingStats
 * @param {Function} args.kpi
 * @param {Function} [args.format=defaultFormat]
 */
export function buildShippingTabHTML({ stats, kpi, format = defaultFormat }) {
  const s = stats;
  if (!s.companies.length) {
    return '<div class="empty-pretty"><div class="ico">🚚</div><div class="ttl">لا توجد بيانات شحن</div><div class="sub">الأوردرات اللي وصلت مرحلة الشحن أو بعدها هتظهر هنا</div></div>';
  }
  return `
    <div class="kpi-grid">
      ${kpi(s.totShip, 'إجمالي الشحن', 'var(--b)', s.pTot)}
      ${kpi(s.totShip ? Math.round(s.delivered / s.totShip * 100) + '%' : '—', 'نسبة التسليم', 'var(--g)')}
      ${kpi(s.returned, 'مرتجعات', 'var(--r)')}
      ${kpi(format(s.totShipCost) + ' ج', 'تكلفة الشحن', 'var(--y)')}
    </div>
    ${s.perCompany.map(c => `<div class="rep-card">
        <div class="rep-card-head">
          <div><div class="rep-name">🚚 ${c.name}</div><div class="rep-sub">${c.shipper.phone || ''}</div></div>
          <div style="font-size:var(--fs-sm);padding:4px 10px;border-radius:20px;background:${c.rate >= 80 ? 'rgba(0,217,126,.12)' : 'rgba(255,170,0,.12)'};color:${c.rate >= 80 ? 'var(--g)' : 'var(--y)'};font-weight:800">${c.rate}% تسليم</div>
        </div>
        <div class="rep-stats">
          <div class="rep-stat"><div class="rep-stat-val" style="color:var(--b)">${c.count}</div><div class="rep-stat-lbl">أوردر</div></div>
          <div class="rep-stat"><div class="rep-stat-val" style="color:var(--g)">${c.delivered}</div><div class="rep-stat-lbl">تسليم</div></div>
          <div class="rep-stat"><div class="rep-stat-val" style="color:var(--r)">${c.returned}</div><div class="rep-stat-lbl">مرتجع</div></div>
        </div>
      </div>`).join('')}`;
}

/**
 * Build the clients tab HTML.
 *
 * @param {Object} args
 * @param {Object}   args.stats — from buildClientActivityStats
 * @param {Function} args.kpi
 * @param {Function} args.bar   — page-side bar(label,val,max,color?,suffix?) helper
 * @param {Function} [args.format=defaultFormat]
 */
export function buildClientsTabHTML({ stats, kpi, bar, format = defaultFormat }) {
  const s = stats;
  return `
    <div class="kpi-grid">
      ${kpi(s.activeCount, 'عملاء نشطين', 'var(--b)')}
      ${kpi(s.newCount, 'عملاء جدد', 'var(--g)')}
      ${kpi(s.avgOrder ? s.avgOrder + 'ج' : '—', 'متوسط الأوردر', 'var(--y)')}
      ${kpi(s.repeatCount, 'عملاء مكررين', 'var(--p)')}
    </div>
    <div class="chart-wrap">
      <div class="chart-title">👥 أكثر العملاء شراءً</div>
      ${s.sorted.slice(0, 10).map(c => bar(c.name, c.total, s.maxTotal, 'linear-gradient(90deg,var(--b),var(--p))', ' ج')).join('')}
    </div>
    ${s.sorted.slice(0, 20).map(c => `<div class="rep-card" style="padding:12px 16px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><div style="font-size:var(--fs-md);font-weight:800">${c.name}</div><div style="font-size:var(--fs-sm);color:var(--dim2)">${c.phone} · ${c.count} أوردر</div></div>
        <div style="text-align:left">
          <div style="font-size:15px;font-weight:900;color:var(--b)">${format(c.total)} ج</div>
          <div style="font-size:var(--fs-xs);color:${c.paid >= c.total ? 'var(--g)' : 'var(--r)'}">${format(c.paid)} محصّل</div>
        </div>
      </div>
    </div>`).join('')}`;
}
