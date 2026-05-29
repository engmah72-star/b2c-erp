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

import { calcRem } from '../order-math.js';

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

// ── Next-action descriptors (pure) ──────────────────────────────────────
// Maps the current stage to the SINGLE central orderActions method that
// advances it. The stepper renders one button that calls this method; it
// never contains transition logic itself (RULE A1 / PC1.4). `archived` and
// `cancelled` are terminal → no next action.
export const STAGE_NEXT_ACTION = Object.freeze({
  design:     { method: 'submitToPrinting',   label: 'تسليم للطباعة', target: 'printing'   },
  printing:   { method: 'submitToProduction', label: 'تسليم للتنفيذ', target: 'production' },
  production: { method: 'submitToShipping',   label: 'تسليم للشحن',   target: 'shipping'   },
  shipping:   { method: 'archiveOrder',       label: 'أرشفة الأوردر', target: 'archived'   },
});

/**
 * Returns the next-action descriptor for an order's current stage, or null
 * if terminal (archived/cancelled) or unknown. Pure — no I/O, no permissions.
 * @returns {{ method:string, label:string, target:string }|null}
 */
export function getNextAction(order) {
  const stage = order && order.stage;
  return STAGE_NEXT_ACTION[stage] || null;
}

// ── Financial summary (pure, read-only) ─────────────────────────────────
// Phase 3: reads the FSE-maintained projection fields stored ON the order
// (salePrice/totalPaid/discount/shipSettled...) for DISPLAY only. The only
// derived number is `remaining`, computed by the central calcRem() helper —
// no balance is recomputed here (RULE 1 / RULE 4). The page must still gate
// visibility via canSeeField('price_sale', role) before rendering (RULE 8).
export const PAY_STATUS = Object.freeze({
  PAID: 'paid', PARTIAL: 'partial', UNPAID: 'unpaid', RETURNED: 'returned',
});

/**
 * @param {object} order
 * @returns {{ sale:number, paid:number, remaining:number, status:string,
 *             returned:boolean, settlementRelevant:boolean, settled:boolean }}
 */
export function buildFinancialSummary(order) {
  const o = order || {};
  const sale = (parseFloat(o.salePrice) || 0)
    + (parseFloat(o.customerShipFee) || 0)
    - (parseFloat(o.discount) || 0);
  const paid = parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;
  const remaining = calcRem(o); // central, clamped ≥ 0, returns 0 if returned
  const returned = o.paymentStatus === 'returned' || o.shipStage === 'returned';

  let status;
  if (returned) status = PAY_STATUS.RETURNED;
  else if (remaining <= 0 && paid > 0) status = PAY_STATUS.PAID;
  else if (paid > 0) status = PAY_STATUS.PARTIAL;
  else status = PAY_STATUS.UNPAID;

  // Company-shipped orders require a settlement before archive (W1 gate).
  const settlementRelevant = o.shipMethod === 'company';
  const settled = !!o.shipSettled;

  return { sale, paid, remaining, status, returned, settlementRelevant, settled };
}
