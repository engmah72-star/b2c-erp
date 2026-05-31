/**
 * Business2Card ERP — features/employees/views/render-employees-skeleton.js
 *
 * ━━━ EMPLOYEES SKELETON VIEW (RULE L1.5) ━━━
 *
 * Pure HTML builder for the loading skeleton on employees.html — extracted
 * VERBATIM from renderSkeleton() (Phase 3C). Markup is BYTE-IDENTICAL to the
 * former inline template (verified by tests/employees-views-byte-identical.mjs).
 *
 * No dynamic inputs — the skeleton is a static 6-card grid. The page reads the
 * #list container and assigns el.innerHTML = buildEmployeesSkeletonHTML().
 */

/* ── Loading skeleton grid (former renderSkeleton lines 749–762) ── */
export function buildEmployeesSkeletonHTML() {
  const card=`<div class="sk-card">
    <div class="emp2-sk-hero">
      <div class="skeleton emp2-sk-av"></div>
      <div class="flex-1">
        <div class="skeleton sk-line emp2-sk-l60"></div>
        <div class="skeleton sk-line emp2-sk-l40"></div>
      </div>
      <div class="skeleton emp2-sk-ring"></div>
    </div>
    <div class="skeleton sk-line w-full"></div>
    <div class="skeleton sk-line emp2-sk-l75"></div>
    <div class="skeleton sk-line emp2-sk-l90"></div>
  </div>`;
  return `<div class="emp2-cards-grid">${card.repeat(6)}</div>`;
}
