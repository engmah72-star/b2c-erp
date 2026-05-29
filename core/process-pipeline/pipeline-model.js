// core/process-pipeline/pipeline-model.js
// ════════════════════════════════════════════════════════════════════════
// Process Integration — pure pipeline model (NO Firebase / DOM / orders.js).
// ════════════════════════════════════════════════════════════════════════
// Computes an order's position along the operational pipeline from `order.stage`
// alone. Kept dependency-free so it is Node-unit-testable (like core/order-math.js,
// core/audit.js). Visual decoration (label/icon/color) is layered on top in
// pipeline-stepper.js using the central STAGES table (RULE C2/U1).
//
// CONTRACT: pure, view-only, no writes, no new state beside order.stage (W1.1/W1.6).

// Ordered main pipeline. `cancelled` is a terminal side-state (W1.2) — not a step.
export const PIPELINE_ORDER = Object.freeze(['design', 'printing', 'production', 'shipping', 'archived']);

/** Step state along the pipeline. */
export const STEP_STATE = Object.freeze({
  DONE: 'done',
  CURRENT: 'current',
  UPCOMING: 'upcoming',
  CANCELLED: 'cancelled',
});

/**
 * Pure model: maps an order onto the pipeline.
 * @param {{stage?:string, prevStage?:string}} order
 * @returns {{ cancelled:boolean, currentKey:string, anchorIndex:number,
 *             steps: Array<{key:string, index:number, state:string}> }}
 */
export function buildPipelineModel(order) {
  const current = (order && order.stage) || 'design';
  const cancelled = current === 'cancelled';
  // For cancelled orders anchor progress on the last known main stage if present.
  const anchor = cancelled
    ? (order && PIPELINE_ORDER.includes(order.prevStage) ? order.prevStage : null)
    : current;
  const anchorIndex = anchor == null ? -1 : PIPELINE_ORDER.indexOf(anchor);

  const steps = PIPELINE_ORDER.map((key, i) => {
    let state;
    if (anchorIndex < 0) state = STEP_STATE.UPCOMING;
    else if (i < anchorIndex) state = STEP_STATE.DONE;
    else if (i === anchorIndex) state = cancelled ? STEP_STATE.CANCELLED : STEP_STATE.CURRENT;
    else state = STEP_STATE.UPCOMING;
    return { key, index: i, state };
  });

  return { cancelled, currentKey: current, anchorIndex, steps };
}
