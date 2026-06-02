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
  getStageSlaForOrder,
  orderIsOffset,
  computeStageDeadlineStr,
  buildStageAdvance,
  buildStageRevert,
  getStageResponsibilities,
  getStageHistory,
  validateOrderResponsibility,
  fmtDateAr,
  STAGE_SLA_DEFAULTS,
  PRODUCTION_SLA_BY_PRINT,
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

// ── standard SLA values (المعايير) ────────────────────────────────
test('STAGE_SLA_DEFAULTS: design 2d, printing 1d, shipping 2d', () => {
  assertEq(STAGE_SLA_DEFAULTS.design, 48);
  assertEq(STAGE_SLA_DEFAULTS.printing, 24);
  assertEq(STAGE_SLA_DEFAULTS.shipping, 48);
});
test('PRODUCTION_SLA_BY_PRINT: offset 3d, digital 2d', () => {
  assertEq(PRODUCTION_SLA_BY_PRINT.offset, 72);
  assertEq(PRODUCTION_SLA_BY_PRINT.digital, 48);
});

// ── orderIsOffset ─────────────────────────────────────────────────
test('orderIsOffset: any offset product → true', () => {
  assertEq(orderIsOffset({ products: [{ printType: 'digital' }, { printType: 'offset' }] }), true);
});
test('orderIsOffset: all digital → false', () => {
  assertEq(orderIsOffset({ products: [{ printType: 'digital' }] }), false);
});
test('orderIsOffset: fallback to order.printType', () => {
  assertEq(orderIsOffset({ printType: 'offset' }), true);
});

// ── getStageSlaForOrder: production branches on print type ─────────
test('getStageSlaForOrder: production offset → 72', () => {
  assertEq(getStageSlaForOrder({ products: [{ printType: 'offset' }] }, 'production'), 72);
});
test('getStageSlaForOrder: production digital → 48', () => {
  assertEq(getStageSlaForOrder({ products: [{ printType: 'digital' }] }, 'production'), 48);
});
test('getStageSlaForOrder: non-production unchanged', () => {
  assertEq(getStageSlaForOrder({}, 'design'), 48);
  assertEq(getStageSlaForOrder({}, 'printing'), 24);
});
test('getStageSlaForOrder: settings override {offset,digital}', () => {
  const t = { production: { offset: 96, digital: 60 } };
  assertEq(getStageSlaForOrder({ products: [{ printType: 'offset' }] }, 'production', t), 96);
  assertEq(getStageSlaForOrder({ products: [{ printType: 'digital' }] }, 'production', t), 60);
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
  // stageDeadline لا يُكتب تلقائياً — مواعيد المراحل التشغيلية تُحسب حيّاً من SLA
  assertEq(r.fields['stageDeadline.printing'], undefined, 'no auto deadline write');
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
  // الموعد اليدوي لا يُعاد حسابه/يُمسح عند الارتداد
  assertEq(r.fields['stageDeadline.design'], undefined, 'manual deadline preserved');
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
      design:     new Date(now - 50 * HOUR).toISOString(),
      printing:   new Date(now - 40 * HOUR).toISOString(),
      production: new Date(now - 10 * HOUR).toISOString(),
    },
    stageCompletedAt: {
      design:   new Date(now - 40 * HOUR).toISOString(),
      printing: new Date(now - 10 * HOUR).toISOString(),
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

  // design took 10h, SLA 48 → good
  assertEq(byKey.design.rating, 'good');
  // printing took 30h, SLA 24 → late
  assertEq(byKey.printing.rating, 'late');
  assert(byKey.printing.overdue, 'printing overdue vs deadline');
  // production ongoing 10h, digital SLA 48 → ongoing (not late)
  assertEq(byKey.production.slaHours, 48);
  assertEq(byKey.production.rating, 'ongoing');
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

test('getStageResponsibilities: ISO stageEnteredAt normalized to ar-EG display', () => {
  const iso = new Date(Date.now() - 3 * HOUR).toISOString();
  const order = { stage: 'design', stageEnteredAt: { design: iso } };
  const design = getStageResponsibilities(order).find(r => r.stage === 'design');
  assert(design.enteredAt && !/[TZ]/.test(design.enteredAt), 'no raw ISO in display: ' + design.enteredAt);
  assert(design.enteredMs, 'enteredMs parsed from ISO');
});

test('getStageResponsibilities: manual design deadline (from form) wins over SLA', () => {
  const now = Date.now();
  // الموعد اليدوي بصيغة fmtDateAr (نفس ما يكتبه مسار الإنشاء) — تاريخ بعيد عن SLA.
  const manual = fmtDateAr(new Date('2026-06-10T23:59:59'));
  const order = {
    stage: 'design',
    stageEnteredAt: { design: new Date(now - 2 * HOUR).toISOString() },
    stageDeadline:  { design: manual },
  };
  const design = getStageResponsibilities(order).find(r => r.stage === 'design');
  assertEq(design.deadline, manual, 'manual deadline shown as-is (stored wins)');
  // ويُفسَّر صحيحاً (يوم 10، مش الموعد المحسوب من SLA)
  assertEq(new Date(design.deadlineMs).getDate(), 10, 'deadline points to entered day');
});

test('getStageResponsibilities: honors settings slaTable override (live)', () => {
  const now = Date.now();
  const order = {
    stage: 'production',
    products: [{ printType: 'offset' }],
    stageEnteredAt: { production: new Date(now - 50 * HOUR).toISOString() },
  };
  // default offset SLA = 72h → 50h ongoing = within (ongoing). Override to 24h → late.
  const def = getStageResponsibilities(order).find(r => r.stage === 'production');
  assertEq(def.slaHours, 72);
  assertEq(def.rating, 'ongoing');

  const over = getStageResponsibilities(order, { production: { offset: 24, digital: 12 } })
    .find(r => r.stage === 'production');
  assertEq(over.slaHours, 24);
  assertEq(over.rating, 'late'); // 50h ongoing > 24h deadline
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

// ── R — Order Responsibility Invariant ────────────────────────────
test('validateOrderResponsibility: createdBy + date → ok', () => {
  const r = validateOrderResponsibility({ createdBy: 'u1', createdDate: '01/06/2026' });
  assert(r.ok, JSON.stringify(r.errors));
});
test('validateOrderResponsibility: stage owner + stageEnteredAt → ok', () => {
  const r = validateOrderResponsibility({ designerId: 'd1', stageEnteredAt: { design: 'x' } });
  assert(r.ok, JSON.stringify(r.errors));
});
test('validateOrderResponsibility: no responsible → error', () => {
  const r = validateOrderResponsibility({ createdDate: '01/06/2026' });
  assert(!r.ok);
  assert(r.errors.some(e => /مسؤول/.test(e)), 'responsible error');
});
test('validateOrderResponsibility: no date → error', () => {
  const r = validateOrderResponsibility({ createdBy: 'u1' });
  assert(!r.ok);
  assert(r.errors.some(e => /تاريخ/.test(e)), 'date error');
});
test('validateOrderResponsibility: empty order → both errors', () => {
  const r = validateOrderResponsibility({});
  assertEq(r.errors.length, 2);
});

// ── buildStageAdvance: كل مرحلة جديدة لها مسؤول (fallback) ─────────
test('buildStageAdvance: no assignee → target owner falls back to actor', () => {
  const order = { stage: 'design', designFiles: [{ url: 'x' }], stageEnteredAt: { design: 'x' }, timeline: [] };
  const r = buildStageAdvance({ order, role: 'admin', userId: 'actor1', userName: 'المنفّذ', bypassWarnings: true });
  assert(r.ok, JSON.stringify(r.errors));
  assertEq(r.fields.printerId, 'actor1', 'printer = actor fallback');
  assertEq(r.fields.printerName, 'المنفّذ');
  assertEq(r.timelineEntry.assigneeId, 'actor1');
});
test('buildStageAdvance: keeps existing stage owner when no new assignee', () => {
  const order = { stage: 'design', printerId: 'p9', printerName: 'طبّاع قديم', designFiles: [{ url: 'x' }], stageEnteredAt: { design: 'x' }, timeline: [] };
  const r = buildStageAdvance({ order, role: 'admin', userId: 'actor1', userName: 'المنفّذ', bypassWarnings: true });
  assert(r.ok, JSON.stringify(r.errors));
  assertEq(r.fields.printerId, 'p9', 'existing owner preserved');
  assertEq(r.fields.printerName, 'طبّاع قديم');
});
test('buildStageAdvance: explicit assignee wins', () => {
  const order = { stage: 'design', printerId: 'p9', designFiles: [{ url: 'x' }], stageEnteredAt: { design: 'x' }, timeline: [] };
  const r = buildStageAdvance({ order, role: 'admin', userId: 'actor1', userName: 'a', nextAssigneeId: 'p1', nextAssigneeName: 'طبّاع', bypassWarnings: true });
  assertEq(r.fields.printerId, 'p1', 'chosen assignee wins');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
