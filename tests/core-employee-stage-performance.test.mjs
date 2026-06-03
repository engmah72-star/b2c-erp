/**
 * Tests for core/employee-stage-performance.js (pure — no Firebase import)
 * Run: node tests/core-employee-stage-performance.test.mjs
 */
import { buildEmployeeStagePerformance } from '../core/employee-stage-performance.js';

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
// stub getStageRows: كل أوردر يحمل صفوفه جاهزة في order._rows
const getRows = (o) => o._rows || [];
const row = (stage, responsibleId, responsibleName, status, rating, durationMs) =>
  ({ kind: 'stage', stage, responsibleId, responsibleName, status, rating, durationMs });

test('empty / bad args → []', () => {
  assertEq(buildEmployeeStagePerformance([], getRows).length, 0);
  assertEq(buildEmployeeStagePerformance([{}], null).length, 0);
});

test('aggregates per employee: count + avg + onTime%', () => {
  const orders = [
    { _rows: [ row('design', 'd1', 'مصمم', 'done', 'good', 2 * HOUR), row('printing', 'p1', 'طبّاع', 'done', 'late', 30 * HOUR) ] },
    { _rows: [ row('design', 'd1', 'مصمم', 'done', 'late', 50 * HOUR) ] },
  ];
  const res = buildEmployeeStagePerformance(orders, getRows);
  const d1 = res.find(e => e.employeeId === 'd1');
  assertEq(d1.employeeName, 'مصمم');
  assertEq(d1.stages.design.count, 2);
  assertEq(d1.stages.design.avgMs, 26 * HOUR);     // (2h + 50h)/2
  assertEq(d1.stages.design.onTime, 1);
  assertEq(d1.stages.design.late, 1);
  assertEq(d1.stages.design.onTimePct, 50);
  assertEq(d1.totalCount, 2);
  assertEq(d1.onTimePct, 50);

  const p1 = res.find(e => e.employeeId === 'p1');
  assertEq(p1.stages.printing.count, 1);
  assertEq(p1.stages.printing.onTimePct, 0); // late
});

test('ignores ongoing/pending stages and rows without responsible', () => {
  const orders = [
    { _rows: [
      row('design', 'd1', 'مصمم', 'ongoing', 'ongoing', 5 * HOUR), // skipped (not done)
      row('printing', '', '', 'done', 'good', 3 * HOUR),            // skipped (no responsible)
      row('production', 'x1', 'منفّذ', 'done', 'good', 10 * HOUR),  // counted
    ] },
  ];
  const res = buildEmployeeStagePerformance(orders, getRows);
  assertEq(res.length, 1);
  assertEq(res[0].employeeId, 'x1');
  assertEq(res[0].totalCount, 1);
});

test('sorted by totalCount desc', () => {
  const orders = [
    { _rows: [ row('design', 'a', 'A', 'done', 'good', HOUR) ] },
    { _rows: [ row('design', 'b', 'B', 'done', 'good', HOUR), row('printing', 'b', 'B', 'done', 'good', HOUR) ] },
  ];
  const res = buildEmployeeStagePerformance(orders, getRows);
  assertEq(res[0].employeeId, 'b', 'b has more stages → first');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
