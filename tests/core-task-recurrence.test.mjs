/**
 * Node-runnable tests for core/task-recurrence.js.
 * Run: node tests/core-task-recurrence.test.mjs
 *
 * Pure tests — no Firestore, no DOM. Locks the recurrence period-key logic
 * and the "due this period" derivation used by employee task views.
 */
import {
  TASK_TYPES, RECURRENCE,
  currentPeriodKey, isRecurringDue, recurrenceLabel, isValidRecurrence,
} from '../core/task-recurrence.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

const D = (s) => new Date(s + 'T10:00:00');

test('TASK_TYPES has fixed + recurring', () => {
  assertEq(!!TASK_TYPES.fixed, true);
  assertEq(!!TASK_TYPES.recurring, true);
});

test('RECURRENCE exposes daily/weekly/monthly only', () => {
  assertEq(Object.keys(RECURRENCE).sort().join(','), 'daily,monthly,weekly');
});

test('daily period-key = YYYY-MM-DD', () => {
  assertEq(currentPeriodKey('daily', D('2026-06-06')), '2026-06-06');
});

test('monthly period-key = YYYY-MM', () => {
  assertEq(currentPeriodKey('monthly', D('2026-06-06')), '2026-06');
});

test('weekly period-key is stable within the same ISO week', () => {
  // 2026-06-01 (Mon) .. 2026-06-07 (Sun) share one ISO week
  const a = currentPeriodKey('weekly', D('2026-06-01'));
  const b = currentPeriodKey('weekly', D('2026-06-07'));
  assertEq(a, b, '(same week)');
  const c = currentPeriodKey('weekly', D('2026-06-08')); // next Monday
  if (a === c) throw new Error('expected different week key after week boundary');
});

test('unknown recurrence ⇒ empty period-key', () => {
  assertEq(currentPeriodKey('yearly', D('2026-06-06')), '');
});

test('isRecurringDue: false for non-recurring tasks', () => {
  assertEq(isRecurringDue({ taskType: 'fixed' }, D('2026-06-06')), false);
});

test('isRecurringDue: true when not yet stamped this period', () => {
  const t = { taskType: 'recurring', recurrence: 'daily', lastCompletedPeriod: '2026-06-05' };
  assertEq(isRecurringDue(t, D('2026-06-06')), true);
});

test('isRecurringDue: false right after completing this period', () => {
  const t = { taskType: 'recurring', recurrence: 'daily', lastCompletedPeriod: '2026-06-06' };
  assertEq(isRecurringDue(t, D('2026-06-06')), false);
});

test('isRecurringDue: monthly resets next month', () => {
  const t = { taskType: 'recurring', recurrence: 'monthly', lastCompletedPeriod: '2026-05' };
  assertEq(isRecurringDue(t, D('2026-06-06')), true);
});

test('recurrenceLabel + isValidRecurrence', () => {
  assertEq(recurrenceLabel('daily'), '🔁 يومي');
  assertEq(isValidRecurrence('weekly'), true);
  assertEq(isValidRecurrence('yearly'), false);
});

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed) process.exit(1);
