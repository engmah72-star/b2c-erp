/**
 * Tests for per-stage dates + responsibility engine (orders.js)
 * Run: node --import ./tests/_loaders/register.mjs tests/core-stage-responsibilities.test.mjs
 *   (الـ loader يستبدل استيرادات Firebase عبر https بـ stub محلي — orders.js
 *    يعيد تصدير core/firebase-init.js فلا يُستورَد مباشرة في Node بدونه.)
 *
 * يغطّي:
 *   - getStageSla / computeStageDeadlineStr
 *   - buildStageAdvance: كتابة stageCompletedAt + stageEnteredAt + stageDeadline + وسم timeline
 *   - buildStageRevert: إعادة فتح ساعة المرحلة الهدف + مسح الإنجاز
 *   - getStageResponsibilities: تجميع موحّد (مسؤول + تواريخ + موعد + حالة + تقييم)
 *   - getStageHistory: اشتقاق السجل الكامل من timeline
 */
import {
  getStageSla,
  computeStageDeadlineStr,
  buildStageAdvance,
  buildStageRevert,
  getStageResponsibilities,
  getStageHistory,
  STAGE_SLA_DEFAULTS,
} from '../orders.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assert(c, hint = '') { if (!c) throw new Error(`assertion failed ${hint}`); }

const HOUR = 3600000;

// ── getStageSla ───────────────────────────────────────────────────
test('getStageSla: defaults', () => {
  assertEq(getStageSla('design'), STAGE_SLA_DEFAULTS.design);
  assertEq(getStageSla('printing'), STAGE_SLA_DEFAULTS.printing);
});
test('getStageSla: override table wins', () => {
  assertEq(getStageSla('design', { design: 99 }), 99);
});
test('getStageSla: unknown stage → 0', () => {
  assertEq(getStageSla('archived'), 0);
});

// ── computeStageDeadlineStr ───────────────────────────────────────
test('computeStageDeadlineStr: entered + SLA hours', () => {
  const entered = Date.now();
  const str = computeStageDeadlineStr('printing', entered); // sla 8h
  assert(str, 'should produce a string');
  // round-trip not exact (locale), but should parse back near entered+8h via getStageResponsibilities below
});
test('computeStageDeadlineStr: no SLA → empty', () => {
  assertEq(computeStageDeadlineStr('archived', Date.now()), '');
});

// ── buildStageAdvance: writes dates + completion + deadline + tag ──
test('buildStageAdvance: design→printing writes all stage-date fields', () => {
  const order = {
    stage: 'design',
    designerId: 'd1', designerName: 'مصمم',
    designFiles: [{ url: 'x' }], // يتجنّب warning
    stageEnteredAt: { design: '2026/06/01 10:00' },
    timeline: [],
  };
  const r = buildStageAdvance({
    order, role: 'admin', userId: 'u1', userName: 'أدمن',
    nextAssigneeId: 'p1', nextAssigneeName: 'طبّاع', bypassWarnings: true,
  });
  assert(r.ok, 'should advance: ' + JSON.stringify(r.errors));
  assertEq(r.fields.stage, 'printing');
  assert(r.fields['stageCompletedAt.design'], 'design completion stamped');
  assert(r.fields['stageEnteredAt.printing'], 'printing entry stamped');
  assert(r.fields['stageDeadline.printing'], 'printing deadline computed');
  assertEq(r.fields.printerId, 'p1');
  assertEq(r.fields.printerName, 'طبّاع');
  assertEq(r.timelineEntry.kind, 'stage', 'timeline entry tagged');
  assertEq(r.timelineEntry.assigneeId, 'p1');
});

// ── buildStageRevert: reopens target stage clock ──────────────────
test('buildStageRevert: printing→design resets entry + clears completion', () => {
  const order = {
    stage: 'printing',
    stageEnteredAt: { design: '2026/06/01 10:00', printing: '2026/06/02 09:00' },
    stageCompletedAt: { design: '2026/06/02 09:00' },
    timeline: [],
  };
  const r = buildStageRevert({
    order, role: 'admin', userId: 'u1', userName: 'أدمن',
    targetStage: 'design', reason: 'تعديل مطلوب',
  });
  assert(r.ok, 'should revert: ' + JSON.stringify(r.errors));
  assertEq(r.fields.stage, 'design');
  assert(r.fields['stageEnteredAt.design'], 'design re-entered now');
  assertEq(r.fields['stageCompletedAt.design'], '', 'design completion cleared');
  assert(r.fields['stageDeadline.design'], 'design deadline recomputed');
  assertEq(r.timelineEntry.kind, 'stage');
});
test('buildStageRevert: requires reason', () => {
  const order = { stage: 'printing', stageEnteredAt: {}, timeline: [] };
  const r = buildStageRevert({ order, role: 'admin', userId: 'u1', userName: 'a', targetStage: 'design', reason: '' });
  assert(!r.ok, 'should fail without reason');
});

// ── getStageResponsibilities: unified read ────────────────────────
test('getStageResponsibilities: intake row first — creator + creation date', () => {
  const now = Date.now();
  const order = {
    stage: 'design',
    createdBy: 'cs1', createdByName: 'خدمة عملاء',
    createdAt: new Date(now - 5 * HOUR).toISOString(),
    designerName: 'مصمم', designerId: 'd1',
    stageEnteredAt: { design: new Date(now - 5 * HOUR).toISOString() },
  };
  const rows = getStageResponsibilities(order);
  assertEq(rows[0].stage, 'intake', 'intake is first row');
  assertEq(rows[0].kind, 'intake');
  assertEq(rows[0].responsibleName, 'خدمة عملاء');
  assertEq(rows[0].status, 'done');
  assert(rows[0].enteredAt, 'intake has creation date');
  // التشغيلية تبدأ من الصف الثاني
  assertEq(rows[1].stage, 'design');
});

test('getStageResponsibilities: intake falls back to assignedTo/csName', () => {
  const order = {
    stage: 'design',
    assignedTo: 'cs2', csName: 'موظف مُسنَد',
    createdAt: new Date().toISOString(),
    stageEnteredAt: { design: new Date().toISOString() },
  };
  const rows = getStageResponsibilities(order);
  assertEq(rows[0].responsibleName, 'موظف مُسنَد');
});

test('getStageResponsibilities: current stage is ongoing, prior is done', () => {
  const now = Date.now();
  const order = {
    stage: 'production',
    designerName: 'مصمم', designerId: 'd1',
    printerName: 'طبّاع', printerId: 'p1',
    productionAgentName: 'منفّذ', productionAgent: 'x1',
    stageEnteredAt: {
      design:     new Date(now - 30 * HOUR).toISOString(),
      printing:   new Date(now - 20 * HOUR).toISOString(),
      production: new Date(now - 2 * HOUR).toISOString(),
    },
    stageCompletedAt: {
      design:   new Date(now - 20 * HOUR).toISOString(),
      printing: new Date(now - 2 * HOUR).toISOString(),
    },
  };
  const rows = getStageResponsibilities(order);
  const byKey = Object.fromEntries(rows.map(r => [r.stage, r]));

  assertEq(byKey.design.responsibleName, 'مصمم');
  assertEq(byKey.design.status, 'done');
  assertEq(byKey.printing.status, 'done');
  assertEq(byKey.production.status, 'ongoing');
  assertEq(byKey.production.isCurrent, true);
  assertEq(byKey.shipping.status, 'pending');

  // design took 10h, SLA 24 → good
  assertEq(byKey.design.rating, 'good');
  // printing took 18h, SLA 8 → late
  assertEq(byKey.printing.rating, 'late');
  assert(byKey.printing.overdue, 'printing overdue vs deadline');
});

test('getStageResponsibilities: derives completion from next entry when stageCompletedAt absent (legacy)', () => {
  const now = Date.now();
  const order = {
    stage: 'production',
    stageEnteredAt: {
      design:     new Date(now - 30 * HOUR).toISOString(),
      printing:   new Date(now - 20 * HOUR).toISOString(),
      production: new Date(now - 2 * HOUR).toISOString(),
    },
    // no stageCompletedAt — old order
  };
  const rows = getStageResponsibilities(order);
  const design = rows.find(r => r.stage === 'design');
  assertEq(design.status, 'done');
  assert(design.durationMs > 0, 'derived duration from printing entry');
});

test('getStageResponsibilities: empty/no order → []', () => {
  assertEq(getStageResponsibilities(null).length, 0);
});

// ── getStageHistory: derive from timeline ─────────────────────────
test('getStageHistory: captures tagged + legacy transitions', () => {
  const order = {
    timeline: [
      { date: '1', stage: 'design', kind: 'stage', action: '🆕 تم إنشاء الأوردر', by: 'a', byId: 'u1', assigneeId: 'd1', assigneeName: 'مصمم' },
      { date: '2', action: 'دفعة عميل', by: 'b' }, // non-stage, ignored
      { date: '3', stage: 'printing', kind: 'stage', action: 'انتقل', assigneeId: 'p1', assigneeName: 'طبّاع' },
      { date: '4', stage: 'design', action: '↩️ ارتداد طباعة → تصميم — تعديل' }, // legacy untagged but matches regex
    ],
  };
  const h = getStageHistory(order);
  assertEq(h.length, 3, 'three stage events');
  assertEq(h[0].responsibleName, 'مصمم');
  assertEq(h[1].stage, 'printing');
  assertEq(h[2].stage, 'design');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
