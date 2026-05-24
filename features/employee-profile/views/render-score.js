/**
 * Business2Card ERP — features/employee-profile/views/render-score.js
 *
 * ━━━ EMPLOYEE SCORE GAUGE VIEW (RULE L1.5) ━━━
 *
 * Pure HTML builder for the score card on employee-profile.html.
 * Takes the precomputed current/previous score breakdowns as input;
 * no closure on page globals.
 *
 * @param {object} ctx
 *   - current: { score, grade, col, breakdown, meta } — from computeScore()
 *   - previous: { score } — from computeScore() for the prior month
 *   - prevMonthLabel: ar string for previous month (for the delta tooltip)
 * @returns {string} HTML
 */
export function buildScoreHTML({ current, previous, prevMonthLabel }) {
  const { score, grade, col, breakdown, meta } = current;
  const delta = score - previous.score;
  const dArrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  const dCol = delta > 0 ? 'var(--g)' : delta < 0 ? 'var(--r)' : 'var(--dim2)';
  const dLbl = delta === 0 ? 'بدون تغيير' : `${dArrow} ${Math.abs(delta)} ${delta > 0 ? 'تحسّن' : 'تراجع'} عن ${prevMonthLabel}`;
  const circ = Math.round(2 * Math.PI * 32);
  const fill = Math.round(score / 100 * circ);
  const lateInfo = breakdown.att.lateMins > 0
    ? `<span style="color:var(--y);font-weight:var(--fw-bold)"> · تأخير ${breakdown.att.lateMins}د (-${breakdown.att.latePenalty})</span>`
    : '';
  const incidentInfo = breakdown.qual.incidents > 0
    ? `<span style="color:var(--r);font-weight:var(--fw-bold)"> · ${breakdown.qual.incidents} إخفاق</span>`
    : '';
  const proratedNote = breakdown.prod.prorated
    ? `<span class="txt-meta-tiny">(متوقع لـ${meta.lastDay}/${meta.daysInMonth} يوم)</span>`
    : '';
  return `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--rad2);padding:var(--space-lg);display:flex;gap:var(--space-xl);align-items:center">
    <div class="score-gauge">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="32" fill="none" stroke="var(--bg3)" stroke-width="7"/>
        <circle cx="40" cy="40" r="32" fill="none" stroke="${col}" stroke-width="7"
          stroke-dasharray="${fill} ${circ}" stroke-linecap="round"/>
      </svg>
      <div class="score-num" style="color:${col}">${score}</div>
    </div>
    <div style="flex:1">
      <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:6px;flex-wrap:wrap">
        <div style="font-size:var(--fs-xl);font-weight:var(--fw-heavy);color:${col}">${grade}</div>
        <span style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:${dCol};background:${dCol}1a;padding:2px 8px;border-radius:var(--rad)" title="مقارنة بالشهر السابق (${previous.score}/100)">${dLbl}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px">
        <div style="display:flex;align-items:center;gap:var(--space-sm);font-size:var(--fs-sm)">
          <span style="width:60px;color:var(--dim2)">حضور</span>
          <div class="prod-bar-wrap"><div class="prod-bar-fill" style="width:${breakdown.att.pct}%;background:var(--g)"></div></div>
          <span style="font-weight:var(--fw-bold);width:30px;text-align:left">${breakdown.att.score}/35</span>
        </div>
        ${lateInfo ? `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-right:68px">${lateInfo}</div>` : ''}
        <div style="display:flex;align-items:center;gap:var(--space-sm);font-size:var(--fs-sm)">
          <span style="width:60px;color:var(--dim2)">إنتاجية</span>
          <div class="prod-bar-wrap"><div class="prod-bar-fill" style="width:${breakdown.prod.pct}%;background:var(--b)"></div></div>
          <span style="font-weight:var(--fw-bold);width:30px;text-align:left">${breakdown.prod.score}/40</span>
        </div>
        ${proratedNote ? `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-right:68px">${proratedNote}</div>` : ''}
        <div style="display:flex;align-items:center;gap:var(--space-sm);font-size:var(--fs-sm)">
          <span style="width:60px;color:var(--dim2)">جودة</span>
          <div class="prod-bar-wrap"><div class="prod-bar-fill" style="width:${breakdown.qual.pct}%;background:var(--p)"></div></div>
          <span style="font-weight:var(--fw-bold);width:30px;text-align:left">${breakdown.qual.score}/25</span>
        </div>
        ${incidentInfo ? `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-right:68px">${incidentInfo}</div>` : ''}
      </div>
    </div>
  </div>`;
}
