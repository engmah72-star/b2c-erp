/**
 * Business2Card ERP — features/employees/views/render-employees-alerts.js
 *
 * ━━━ EMPLOYEES TEAM-ALERTS VIEW (RULE L1.5) ━━━
 *
 * Pure HTML builder for the team-alerts banner on employees.html — extracted
 * VERBATIM from renderAlerts()'s HTML-generation part (Phase 3C). Markup is
 * BYTE-IDENTICAL to the former inline template (verified by
 * tests/employees-views-byte-identical.mjs).
 *
 * What stays in employees.html (NOT extracted — out of scope):
 *   the alerts computation (today's attendance scan, late-orders, pressure),
 *   the dismissed-filter, auto-collapse logic, and the el.innerHTML='' clear
 *   branch when there are no visible alerts.
 *
 * The page computes everything then composes the banner via:
 *   el.innerHTML = buildEmployeesAlertsHTML({ visible, dismissedCount,
 *                                             collapsed, escAttr });
 * — producing the exact same string the inline template produced. The #emp-alerts
 * delegation (toggle-alerts / dismiss-alert) is unaffected.
 */

/* ── Alerts banner (former renderAlerts lines 520–538) ── */
export function buildEmployeesAlertsHTML({ visible, dismissedCount, collapsed, escAttr }) {
  return `<div class="alerts-banner${collapsed?' collapsed':''}" id="alerts-banner">
    <div class="alerts-head" data-act="toggle-alerts">
      <span class="emp2-alerts-title">
        <span class="chev">▼</span>
        ⚠️ تنبيهات الفريق (${visible.length}${dismissedCount?` · ${dismissedCount} مُتجاهَل`:''})
      </span>
      <span class="txt-meta-xs">${collapsed?'اضغط للعرض':'اضغط للإخفاء'}</span>
    </div>
    <div class="alerts-body">
      ${visible.slice(0,8).map(a=>`<div class="alert-row-item">
        <span class="emp2-alert-ico">${a.ico}</span>
        <div class="flex-1 min-w-0">
          <div style="font-size:var(--fs-base);font-weight:var(--fw-extra);color:${a.col}">${a.msg}</div>
          <div class="txt-meta-xs">${a.sub}</div>
        </div>
        <button type="button" data-act="dismiss-alert" data-key="${escAttr(a.key)}" class="emp2-alert-x" title="تجاهل" aria-label="تجاهل">✕</button>
      </div>`).join('')}
    </div>
  </div>`;
}
