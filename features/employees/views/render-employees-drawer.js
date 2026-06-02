/**
 * Business2Card ERP — features/employees/views/render-employees-drawer.js
 *
 * ━━━ EMPLOYEES SIDE-PANEL (DRAWER) VIEWS (RULE L1.5) ━━━
 *
 * Pure HTML builders for the two slide-in panels on employees.html — the KPI
 * evaluation panel (openKpiPanel) and the attendance-log panel (openAttPanel).
 * Extracted VERBATIM from the inline pn-hdr / panel-body templates (Phase 3C).
 * Markup is BYTE-IDENTICAL to the former inline templates (verified by
 * tests/employees-views-byte-identical.mjs).
 *
 * What stays in employees.html (NOT extracted — out of scope):
 *   KPI: find emp, calcKpiBreakdown, goal/eval/lastAct lookups, isAdmin role
 *        check, window.__kpiRating assignment, and opening the #panel-ov.
 *   Att: filtering attendance records, totals (totalDays/avgHours/totalHours),
 *        the empty-records branch composition, and opening the #panel-ov.
 *
 * The page computes everything then composes:
 *   hdr.innerHTML  = buildKpiPanelHeaderHTML({...})  / buildAttPanelHeaderHTML({...})
 *   body.innerHTML = buildKpiPanelBodyHTML({...})    / buildAttPanelBodyHTML({...})
 * — producing the exact same string the inline templates produced. The #pn-hdr
 * and #panel-body delegation (set-rating / save-goal / save-eval) is unaffected.
 */

import { ROLE_TARGET_METRICS } from '../../../core/employee-kpis.js';

/* ── KPI panel header (former openKpiPanel lines 585–588) ── */
export function buildKpiPanelHeaderHTML({ empName, roleLabel, mKey }) {
  return `<div>
    <div class="emp2-pn-title">📊 تقييم — ${empName}</div>
    <div class="txt-meta-sm">${roleLabel} · ${mKey}</div>
  </div>`;
}

/* ── KPI panel body (former openKpiPanel lines 589–640; axisRow inlined as local helper) ── */
export function buildKpiPanelBodyHTML({
  attendance, productivity, quality, total, monthAtt, workDays,
  scoreCol, scoreLbl, mKey, savedEval, goal, lastAct, isAdmin,
  empId, empName, e, escAttr, roleDefault = 0,
}) {
  const tm = ROLE_TARGET_METRICS[e?.role];
  const axisRow=(lbl,val,max,col,sub,goalVal)=>`<div class="emp2-axis">
    <div class="emp2-axis-head">
      <span class="txt-strong-base">${lbl}</span>
      <span style="font-size:var(--fs-base);font-weight:var(--fw-heavy);color:${col}">${val}/${max}${goalVal?`<span class="emp2-axis-goal"> (هدف: ${goalVal})</span>`:''}</span>
    </div>
    <div class="kpi-bar"><div class="kpi-fill" style="width:${val/max*100}%;background:${col}"></div></div>
    <div class="emp2-axis-sub">${sub}</div>
  </div>`;
  return `
    <div class="emp2-kpi-score-box">
      <div style="font-size:58px;font-weight:var(--fw-heavy);color:${scoreCol};line-height:1">${total}</div>
      <div style="font-size:var(--fs-md);font-weight:var(--fw-extra);color:${scoreCol};margin-top:6px">${scoreLbl}</div>
      <div class="emp2-kpi-score-sub">من 100 نقطة · ${mKey}</div>
      ${savedEval?`<div class="emp2-kpi-saved">✅ محفوظ ${savedEval.savedAt?.toDate?.()?.toLocaleDateString('ar-EG')||''}</div>`:''}
    </div>
    <div class="emp2-kpi-axes">
      ${axisRow('الحضور والالتزام',''+attendance,35,'var(--g)',monthAtt+' يوم من '+workDays+' يوم عمل',goal?.targets?.attendanceDays?Math.round(goal.targets.attendanceDays/workDays*35):null)}
      ${axisRow('الإنتاجية',''+productivity,40,'var(--b)','حسب الأوردرات المنجزة هذا الشهر',goal?.targets?.ordersTarget?Math.min(40,goal.targets.ordersTarget*4):null)}
      ${axisRow('الجودة',''+quality,25,'var(--p)','نسبة الأوردرات المكتملة بدون إعادة عمل',goal?.targets?.qualityPct?Math.round(goal.targets.qualityPct/100*25):null)}
    </div>
    ${lastAct?`<div class="emp2-lastact-box">
      <div class="emp2-lastact-lbl">آخر نشاط</div>
      <div class="txt-strong-base">${lastAct.action||'—'} · ${lastAct.clientName||''}</div>
      <div class="txt-meta-xs">${lastAct.date||''}</div>
    </div>`:''}
    ${isAdmin?`
    <div class="emp2-goal-box">
      <div class="emp2-goal-title">🎯 أهداف ${mKey}</div>
      <div class="emp2-goal-grid">
        <div><div class="emp2-goal-lbl">أيام حضور</div>
          <input id="kpi-g-att" type="number" min="0" max="31" placeholder="22" value="${goal?.targets?.attendanceDays||''}" class="emp2-goal-input"></div>
        <div><div class="emp2-goal-lbl">أوردرات</div>
          <input id="kpi-g-ord" type="number" min="0" placeholder="10" value="${goal?.targets?.ordersTarget||''}" class="emp2-goal-input"></div>
        <div><div class="emp2-goal-lbl">جودة %</div>
          <input id="kpi-g-qlt" type="number" min="0" max="100" placeholder="80" value="${goal?.targets?.qualityPct||''}" class="emp2-goal-input"></div>
      </div>
      ${tm?`<div style="margin-top:8px">
        <div class="emp2-goal-lbl">${tm.ico} ${tm.label} — هدف الشهر${roleDefault>0?` <span style="opacity:.6">(افتراضي الدور: ${roleDefault})</span>`:''}</div>
        <input id="kpi-g-primary" type="number" min="0" placeholder="${roleDefault||tm.label}" value="${goal?.targetPrimary||''}" class="emp2-goal-input"></div>`:''}
      <button type="button" data-act="save-goal" data-eid="${escAttr(empId)}" data-ename="${escAttr(empName)}" data-mkey="${escAttr(mKey)}" class="emp2-goal-save">💾 حفظ الأهداف</button>
    </div>
    <div class="emp2-eval-box">
      <div class="emp2-eval-title">⭐ تقييم المدير (اختياري)</div>
      <div class="emp2-star-row" id="star-row">
        ${[1,2,3,4,5].map(s=>`<div data-act="set-rating" data-rating="${s}" id="star-${s}" style="font-size:var(--fs-3xl);cursor:pointer;opacity:${(savedEval?.managerRating||0)>=s?1:0.3};transition:opacity .2s">⭐</div>`).join('')}
      </div>
      <textarea id="kpi-mgr-note" placeholder="ملاحظة المدير (اختياري)..." class="emp2-eval-note">${savedEval?.managerNote||''}</textarea>
      <button type="button" data-act="save-eval" data-eid="${escAttr(empId)}" data-ename="${escAttr(empName)}" data-erole="${escAttr(e.role)}" data-mkey="${escAttr(mKey)}" data-att="${attendance}" data-prod="${productivity}" data-qual="${quality}" data-total="${total}" data-monthatt="${monthAtt}" class="emp2-eval-save">📥 حفظ التقييم هذا الشهر</button>
    </div>`:''}
    ${!isAdmin&&savedEval?`<div class="emp2-eval-saved-box">
      <div class="emp2-eval-saved-lbl">تقييمك هذا الشهر</div>
      <div style="font-size:var(--fs-4xl);font-weight:var(--fw-heavy);color:${scoreCol}">${savedEval.kpiScore}/100</div>
      ${savedEval.managerRating?`<div class="emp2-eval-saved-stars">${'⭐'.repeat(savedEval.managerRating)}</div>`:''}
      ${savedEval.managerNote?`<div class="emp2-eval-saved-note">${savedEval.managerNote}</div>`:''}
    </div>`:''}`;
}

/* ── Attendance panel header (former openAttPanel line 700) ── */
export function buildAttPanelHeaderHTML({ empName }) {
  return `<div class="emp2-pn-title">📅 سجل حضور — ${empName}</div>`;
}

/* ── Attendance panel: empty-records branch (former openAttPanel line 706) ── */
export function buildAttPanelEmptyHTML() {
  return `<div class="emp2-att-empty">لا توجد سجلات حضور</div>`;
}

/* ── Attendance panel body (former openAttPanel lines 713–742; rows map included) ── */
export function buildAttPanelBodyHTML({ recs, totalDays, avgHours, totalHours }) {
  const rows=recs.slice(0,60).map(a=>{
    const d=new Date(a.date+'T00:00:00');
    const dayName=['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'][d.getDay()];
    const h=parseFloat(a.hoursWorked)||0;
    const hCol=h>=8?'var(--g)':h>=6?'var(--y)':'var(--r)';
    return `<div class="emp2-att-row">
      <div class="emp2-att-day">${dayName}<br><span class="text-snow">${a.date?.slice(5)||''}</span></div>
      <div class="flex-1 min-w-0">
        <div class="emp2-att-in">${a.checkInStr||'—'}</div>
        ${a.checkOutStr?`<div class="txt-meta-sm">→ ${a.checkOutStr}</div>`:`<div class="emp2-att-noout">لم يُسجَّل انصراف</div>`}
      </div>
      <div style="font-size:var(--fs-md);font-weight:var(--fw-extra);color:${hCol};text-align:left;flex-shrink:0">${h?h+'h':'—'}</div>
    </div>`;
  }).join('');
  return `
    <div class="emp2-att-stats">
      <div class="emp2-att-stat">
        <div class="emp2-att-stat-b">${totalDays}</div>
        <div class="emp2-att-stat-lbl">يوم حضور</div>
      </div>
      <div class="emp2-att-stat">
        <div class="emp2-att-stat-g">${avgHours}</div>
        <div class="emp2-att-stat-lbl">متوسط ساعات</div>
      </div>
      <div class="emp2-att-stat-last">
        <div class="emp2-att-stat-p">${Math.round(totalHours)}</div>
        <div class="emp2-att-stat-lbl">إجمالي ساعات</div>
      </div>
    </div>
    <div class="emp2-att-list">${rows}</div>`;
}
