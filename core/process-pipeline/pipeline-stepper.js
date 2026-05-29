// core/process-pipeline/pipeline-stepper.js
// ════════════════════════════════════════════════════════════════════════
// Process Integration — Phase 1: VIEW-ONLY Pipeline Stepper (DOM/render layer)
// ════════════════════════════════════════════════════════════════════════
// Renders an order's position along the operational pipeline as a single
// visual spine: تصميم → طباعة → تنفيذ → شحن → أرشيف.
//
// Design source: PROCESS_INTEGRATION_DESIGN.md §5.
//
// CONTRACT (binding):
//   • VIEW-ONLY — reads `order.stage` only, NEVER writes (RULE L1.2 / A1.6).
//   • NO business logic, NO validation, NO stage transitions here.
//   • Single source of stage truth = `order.stage` + `STAGES` (RULE W1.1 / C1.2).
//   • NO new state added beside `order.stage` (RULE W1.6).
//   • Gated behind feature flag — default OFF, fully reversible (RULE E1.8).
//   • Stage colors/labels come from central `STAGES[*]` (RULE C2/U1).
//   • Pure pipeline logic lives in pipeline-model.js (Node-testable).
//
// Usage (mount is a no-op when the flag is off, so calling it is always safe):
//   import { mountPipelineStepper } from './core/process-pipeline/pipeline-stepper.js';
//   mountPipelineStepper({ container: document.getElementById('mount'), order });

import { STAGES, STAGE_PERMISSIONS } from '../../orders.js';
import { orderActions } from '../../order-actions.js';
import { isFeatureEnabled } from '../feature-flags.js';
import {
  buildPipelineModel, getNextAction, STAGE_NEXT_ACTION,
  PIPELINE_ORDER, STEP_STATE,
} from './pipeline-model.js';

export { PIPELINE_ORDER, STEP_STATE, buildPipelineModel, getNextAction, STAGE_NEXT_ACTION };

/** Feature flag name (RULE E1.8) — toggle via `?feat.process.pipelineView=1` or localStorage. */
export const PIPELINE_FLAG = 'process.pipelineView';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Decorates the pure model with central STAGES metadata (label/ico/col). */
function decorate(model) {
  return model.steps.map((s) => {
    const def = STAGES[s.key] || {};
    return {
      key: s.key,
      state: s.state,
      label: def.label || s.key,
      ico: def.ico || '•',
      col: def.col || 'var(--accent)',
    };
  });
}

/**
 * Builds the stepper HTML string from an order (pure render).
 * @param {object} order
 * @param {{actionLabel?:string}} [opts] — if actionLabel set, appends the
 *        next-action button (the host wires its click in mountPipelineStepper).
 */
export function renderPipelineStepperHTML(order, opts = {}) {
  const model = buildPipelineModel(order);
  const steps = decorate(model);
  let html = '<nav class="pl-stepper" aria-label="مراحل الأوردر" dir="rtl">';
  if (model.cancelled) html += '<div class="pl-cancelled">✕ ملغي</div>';
  steps.forEach((s, i) => {
    if (i > 0) html += '<span class="pl-link pl-link-' + esc(steps[i - 1].state) + '" aria-hidden="true"></span>';
    // `--pl-col` is dynamic runtime data (the central stage color) — allowed inline (U1.6).
    html += '<div class="pl-step pl-' + esc(s.state) + '" style="--pl-col:' + esc(s.col) + '"'
      + (s.state === STEP_STATE.CURRENT ? ' aria-current="step"' : '') + '>'
      + '<span class="pl-dot">' + esc(s.ico) + '</span>'
      + '<span class="pl-label">' + esc(s.label) + '</span>'
      + '</div>';
  });
  if (opts.actionLabel) {
    html += '<button type="button" class="pl-action" data-pl-action="1">'
      + esc(opts.actionLabel) + ' ←</button>';
  }
  html += '</nav>';
  return html;
}

/**
 * Phase 2 — runs the SINGLE central action that advances the order, handling
 * the standard result contract (errors block, warnings confirm). Every write
 * goes through orderActions.* — NO transition logic here (RULE A1 / PC1.4).
 */
async function runNextAction({ order, ctx, descriptor, button }) {
  const toast = typeof ctx.toast === 'function' ? ctx.toast : (m) => { try { window.alert(m); } catch (_) {} };
  const base = {
    db: ctx.db,
    orderId: order._id || order.id,
    role: ctx.role,
    userId: ctx.userId || '',
    userName: ctx.userName || '',
  };
  const call = (extra = {}) => descriptor.method === 'archiveOrder'
    ? orderActions.archiveOrder({ ...base, source: 'pipeline-stepper', ...extra })
    : orderActions[descriptor.method]({ ...base, ...extra });

  if (button) button.disabled = true;
  try {
    let r = await call();
    // warnings (not hard errors) → confirm then bypass
    if (!r.ok && (r.needsConfirmation || (r.warnings?.length && !r.errors?.length))) {
      const ok = window.confirm((r.warnings || []).join('\n') + '\n\nمتابعة؟');
      if (!ok) { if (button) button.disabled = false; return; }
      r = await call({ bypassWarnings: true });
    }
    if (!r.ok) {
      if (button) button.disabled = false;
      return toast('⛔ ' + (r.errors || ['فشل']).join(' · '), 'err');
    }
    toast('✅ ' + descriptor.label, 'ok');
    if (typeof ctx.onChanged === 'function') ctx.onChanged(r);
  } catch (e) {
    if (button) button.disabled = false;
    console.warn('[pipeline-stepper] action failed', descriptor.method, e);
    toast('❌ خطأ: ' + (e?.message || e), 'err');
  }
}

/**
 * Mounts the stepper into a container IFF the feature flag is enabled.
 * Returns true if rendered, false if skipped (flag off / no container / no order).
 * Idempotent: re-mounting replaces previous content (re-render on order change).
 *
 * @param {object} p
 * @param {HTMLElement} p.container
 * @param {object} p.order  — must include `_id` (or `id`) for actions
 * @param {object} [p.ctx]  — Phase 2 action context: { db, role, userId, userName, onChanged, toast }.
 *        When omitted (or role not permitted for the stage), renders view-only (Phase 1 behavior).
 */
export function mountPipelineStepper({ container, order, ctx = null }) {
  if (!container || !order) return false;
  if (!isFeatureEnabled(PIPELINE_FLAG)) return false;

  // Decide whether to render the next-action button: needs ctx + db + role
  // permitted to advance FROM the current stage (RULE P1.5 — hide if not allowed).
  const descriptor = getNextAction(order);
  let actionLabel = '';
  const canAct = !!(ctx && ctx.db && ctx.role && descriptor
    && (STAGE_PERMISSIONS[order.stage] || []).includes(ctx.role));
  if (canAct) actionLabel = descriptor.label;

  container.innerHTML = renderPipelineStepperHTML(order, { actionLabel });
  container.setAttribute('data-pipeline-mounted', '1');

  if (canAct) {
    const btn = container.querySelector('[data-pl-action]');
    if (btn) btn.addEventListener('click', () => runNextAction({ order, ctx, descriptor, button: btn }));
  }
  return true;
}
