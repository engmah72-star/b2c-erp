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

import { STAGES } from '../../orders.js';
import { isFeatureEnabled } from '../feature-flags.js';
import { buildPipelineModel, PIPELINE_ORDER, STEP_STATE } from './pipeline-model.js';

export { PIPELINE_ORDER, STEP_STATE, buildPipelineModel };

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

/** Builds the stepper HTML string from an order (pure render). */
export function renderPipelineStepperHTML(order) {
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
  html += '</nav>';
  return html;
}

/**
 * Mounts the stepper into a container IFF the feature flag is enabled.
 * Returns true if rendered, false if skipped (flag off / no container / no order).
 * Idempotent: re-mounting replaces previous content (re-render on order change).
 */
export function mountPipelineStepper({ container, order }) {
  if (!container || !order) return false;
  if (!isFeatureEnabled(PIPELINE_FLAG)) return false;
  container.innerHTML = renderPipelineStepperHTML(order);
  container.setAttribute('data-pipeline-mounted', '1');
  return true;
}
