/**
 * Business2Card ERP — features/reports/views/render-returns.js
 *
 * ━━━ RETURNS TAB VIEW (Phase-2 · reports god-page decomp) ━━━
 *
 * Pure HTML builder for the returns tab. Accepts pre-computed stats from
 * core/reports-returns-stats.js + helper callbacks.
 */

export const RETURNS_REASON_LABEL = {
  damaged: '🔨 تالف', wrong_design: '🎨 تصميم خاطئ', late_delivery: '⏰ تأخر',
  quality_low: '⭐ جودة ضعيفة', wrong_product: '📦 منتج خاطئ',
  customer_changed_mind: '🔄 تراجع العميل', other: '📝 أخرى',
};

export const RETURNS_BLAME_LABEL = {
  designer: '🎨 المصمم', printer: '🖨️ المطبعة', shipping: '🚚 الشحن',
  customer: '👤 العميل', unknown: '❓ غير محدد',
};

const defaultFormat = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

/**
 * Build the returns tab HTML.
 *
 * @param {Object} args
 * @param {Object}   args.stats  — from buildReturnsStats
 * @param {Function} args.kpi    — page-side kpi(val,lbl,col,prev?) helper
 * @param {Function} [args.format=defaultFormat]
 *
 * @returns {string} HTML
 */
export function buildReturnsTabHTML({ stats, kpi, format = defaultFormat }) {
  const s = stats;
  if (!s.hasAnyData) {
    return '<div class="empty-pretty"><div class="ico">↩️</div><div class="ttl">لا توجد مرتجعات بعد</div><div class="sub">tickets تُنشأ من returns.html — الإحصاءات هنا عند توفر بيانات</div></div>';
  }

  return `
    <div class="kpi-grid">
      ${kpi(s.totalReturns, 'إجمالي المرتجعات', 'var(--p)')}
      ${kpi(s.returnRate + '%', 'نسبة المرتجعات', 'var(--y)')}
      ${kpi(format(s.refundedAmt) + ' ج', 'مستردات الفترة', 'var(--r)')}
      ${kpi(s.active, 'مرتجعات نشطة', 'var(--b)')}
      ${kpi(s.slaBreached, 'تجاوز SLA', s.slaBreached > 0 ? 'var(--r)' : 'var(--dim2)')}
      ${kpi(format(s.pendingValue) + ' ج', 'بانتظار التنفيذ', 'var(--y)')}
      ${s.hasRefundTimes ? kpi(s.avgTimeToRefundDays.toFixed(1) + ' يوم', 'متوسط زمن الاسترداد', 'var(--g)') : ''}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-top:14px">
      <div class="rep-card">
        <div class="rep-card-head"><div class="rep-name">📊 أسباب المرتجعات</div></div>
        <div style="display:flex;flex-direction:column;gap:var(--space-sm);margin-top:10px">
          ${s.reasonsSorted.length ? s.reasonsSorted.map(([r, c]) => {
            const pct = Math.round(c / s.maxReasonCount * 100);
            return `<div>
                <div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);margin-bottom:3px">
                  <span>${RETURNS_REASON_LABEL[r] || r}</span><b style="color:var(--snow)">${c}</b>
                </div>
                <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--p),var(--b));border-radius:4px"></div>
                </div></div>`;
          }).join('') : '<div style="color:var(--dim2);font-size:var(--fs-sm);text-align:center;padding:var(--space-xl)">لا توجد بيانات</div>'}
        </div>
      </div>

      <div class="rep-card">
        <div class="rep-card-head"><div class="rep-name">🎯 الطرف المسؤول</div></div>
        <div style="display:flex;flex-direction:column;gap:var(--space-sm);margin-top:10px">
          ${s.blameSorted.map(([b, c]) => {
            const pct = Math.round(c / s.totalReturns * 100);
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg3);border-radius:6px">
                <span style="font-size:var(--fs-base);font-weight:var(--fw-bold)">${RETURNS_BLAME_LABEL[b] || b}</span>
                <span style="font-size:var(--fs-sm);color:var(--dim2)"><b style="color:var(--snow);font-size:var(--fs-md)">${c}</b> · ${pct}%</span>
              </div>`;
          }).join('')}
        </div>
      </div>

      <div class="rep-card">
        <div class="rep-card-head"><div class="rep-name">👤 أكثر العملاء مرتجعاً</div></div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">
          ${s.topClients.length ? s.topClients.map(c => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg3);border-radius:6px">
              <span style="font-size:var(--fs-base);font-weight:var(--fw-bold);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(c.name || '').slice(0, 30)}</span>
              <span style="font-size:var(--fs-sm)"><b style="color:var(--y)">${c.count}</b> <span style="color:var(--dim2)">| ${format(c.amount)} ج</span></span>
            </div>`).join('') : '<div style="color:var(--dim2);font-size:var(--fs-sm);text-align:center;padding:var(--space-xl)">لا توجد بيانات</div>'}
        </div>
      </div>
    </div>

    <div class="rep-card" style="margin-top:14px">
      <div class="rep-card-head"><div class="rep-name">📋 آخر 10 tickets</div></div>
      <div style="margin-top:10px;font-size:var(--fs-sm)">
        ${s.recent.map(t => {
          const stPill = `<span style="padding:2px 8px;border-radius:var(--rad);font-size:var(--fs-tiny);font-weight:var(--fw-extra);background:rgba(167,139,250,.15);color:var(--p)">${t.status}</span>`;
          const slaBadge = t.slaBreached ? ' <span style="font-size:var(--fs-tiny);color:var(--r)">⚠️ SLA</span>' : '';
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px dashed var(--line)">
              <div style="flex:1;min-width:0">
                <div><b style="font-family:monospace">${(t.ticketNo || t._id.slice(-6))}</b> · ${(t.clientName || '—').slice(0, 30)} ${slaBadge}</div>
                <div style="color:var(--dim2);font-size:var(--fs-xs);margin-top:2px">${RETURNS_REASON_LABEL[t.reason] || t.reason || ''} · ${stPill}</div>
              </div>
              <div style="font-weight:var(--fw-extra);color:var(--r);text-align:left;white-space:nowrap">${t.refundAmount > 0 ? format(t.refundAmount) + ' ج' : '—'}</div>
            </div>`;
        }).join('') || '<div style="color:var(--dim2);text-align:center;padding:var(--space-xl)">لا توجد tickets</div>'}
      </div>
      <div style="text-align:center;margin-top:12px">
        <a href="returns.html" style="font-size:var(--fs-base);color:var(--b);text-decoration:none">عرض الكل في returns.html ↗</a>
      </div>
    </div>`;
}
