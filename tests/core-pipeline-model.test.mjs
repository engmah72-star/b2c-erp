/**
 * Node-runnable tests for core/process-pipeline/pipeline-model.js
 * Run: node tests/core-pipeline-model.test.mjs
 *
 * Pure tests — no Firestore, no DOM. Validates the view-only pipeline model
 * (Process Integration Phase 1). Asserts the model NEVER mutates the order
 * and derives state purely from order.stage (RULE W1.1 / L1.2).
 */
import {
  buildPipelineModel, getNextAction, STAGE_NEXT_ACTION,
  PIPELINE_ORDER, STEP_STATE,
} from '../core/process-pipeline/pipeline-model.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function statesOf(order) {
  return buildPipelineModel(order).steps.map((s) => s.state);
}

// ── pipeline order is the canonical 5-stage spine ──
test('PIPELINE_ORDER is the 5 main stages in order', () => {
  assertEq(PIPELINE_ORDER.join(','), 'design,printing,production,shipping,archived');
});

// ── design (first stage) ──
test('design → first current, rest upcoming', () => {
  assertEq(statesOf({ stage: 'design' }).join(','),
    'current,upcoming,upcoming,upcoming,upcoming');
});

// ── middle stage marks prior done, self current ──
test('production → design+printing done, production current', () => {
  assertEq(statesOf({ stage: 'production' }).join(','),
    'done,done,current,upcoming,upcoming');
});

// ── shipping ──
test('shipping → three done, shipping current, archived upcoming', () => {
  assertEq(statesOf({ stage: 'shipping' }).join(','),
    'done,done,done,current,upcoming');
});

// ── archived (terminal) → all prior done, archived current ──
test('archived → all prior done, archived current', () => {
  assertEq(statesOf({ stage: 'archived' }).join(','),
    'done,done,done,done,current');
});

// ── missing stage defaults to design ──
test('missing stage defaults to design', () => {
  assertEq(statesOf({}).join(','), 'current,upcoming,upcoming,upcoming,upcoming');
  assertEq(statesOf(undefined).join(','), 'current,upcoming,upcoming,upcoming,upcoming');
});

// ── cancelled without prevStage → all upcoming + cancelled flag ──
test('cancelled (no prevStage) → cancelled flag, no current step', () => {
  const m = buildPipelineModel({ stage: 'cancelled' });
  assertEq(m.cancelled, true);
  assertEq(m.steps.some((s) => s.state === STEP_STATE.CURRENT), false);
  assertEq(m.steps.every((s) => s.state === STEP_STATE.UPCOMING), true);
});

// ── cancelled WITH prevStage → anchors on that stage as cancelled ──
test('cancelled (prevStage=production) → prior done, production cancelled', () => {
  const m = buildPipelineModel({ stage: 'cancelled', prevStage: 'production' });
  assertEq(m.cancelled, true);
  assertEq(m.steps.map((s) => s.state).join(','),
    'done,done,cancelled,upcoming,upcoming');
});

// ── purity: model must NOT mutate the input order ──
test('buildPipelineModel does not mutate input', () => {
  const order = Object.freeze({ stage: 'shipping', prevStage: 'production' });
  const m = buildPipelineModel(order); // would throw if it tried to write
  assertEq(m.currentKey, 'shipping');
  assertEq(order.stage, 'shipping'); // unchanged
});

// ── every step carries a key + index aligned with PIPELINE_ORDER ──
test('steps keys/indices align with PIPELINE_ORDER', () => {
  const m = buildPipelineModel({ stage: 'printing' });
  m.steps.forEach((s, i) => {
    assertEq(s.key, PIPELINE_ORDER[i]);
    assertEq(s.index, i);
  });
});

// ── getNextAction: maps each stage to the central orderActions method ──
test('design → submitToPrinting', () => {
  assertEq(getNextAction({ stage: 'design' }).method, 'submitToPrinting');
});
test('printing → submitToProduction', () => {
  assertEq(getNextAction({ stage: 'printing' }).method, 'submitToProduction');
});
test('production → submitToShipping', () => {
  assertEq(getNextAction({ stage: 'production' }).method, 'submitToShipping');
});
test('shipping → archiveOrder', () => {
  assertEq(getNextAction({ stage: 'shipping' }).method, 'archiveOrder');
});
test('archived → no next action (terminal)', () => {
  assertEq(getNextAction({ stage: 'archived' }), null);
});
test('cancelled → no next action (terminal)', () => {
  assertEq(getNextAction({ stage: 'cancelled' }), null);
});
test('unknown/missing stage → null', () => {
  assertEq(getNextAction({ stage: 'weird' }), null);
  assertEq(getNextAction({}), null);
  assertEq(getNextAction(undefined), null);
});
test('every next-action target is the immediate next stage in PIPELINE_ORDER', () => {
  for (const [stage, d] of Object.entries(STAGE_NEXT_ACTION)) {
    const i = PIPELINE_ORDER.indexOf(stage);
    assertEq(d.target, PIPELINE_ORDER[i + 1], `for ${stage}`);
  }
});
test('every descriptor has a non-empty Arabic label', () => {
  for (const d of Object.values(STAGE_NEXT_ACTION)) {
    if (!d.label || typeof d.label !== 'string') throw new Error('missing label');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
