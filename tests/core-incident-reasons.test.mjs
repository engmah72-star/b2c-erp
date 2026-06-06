/**
 * Node-runnable tests for core/incident-reasons.js.
 * Run: node tests/core-incident-reasons.test.mjs
 *
 * Pure tests — locks the recurrence-scoping (نفس الإخفاق), escalation
 * suggestion, appeal-void detection, and managed-reasons merge.
 */
import {
  DEFAULT_INCIDENT_REASONS, resolveReasons, reasonByCode,
  isVoided, annotateRecurrence, recurrenceInfo,
} from '../core/incident-reasons.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

test('resolveReasons([]) ⇒ defaults', () => {
  assertEq(resolveReasons([]).length, DEFAULT_INCIDENT_REASONS.length);
});

test('resolveReasons merges custom label over default code', () => {
  const r = resolveReasons([{ code: 'quality_color', label: 'لون مختلف تماماً', type: 'quality' }]);
  assertEq(reasonByCode('quality_color', r).label, 'لون مختلف تماماً');
});

test('resolveReasons drops disabled', () => {
  const r = resolveReasons([{ code: 'other', disabled: true }]);
  assertEq(!!reasonByCode('other', r), false);
});

test('resolveReasons adds a brand-new custom reason', () => {
  const r = resolveReasons([{ code: 'custom_x', label: 'سبب مخصّص', type: 'quality' }]);
  assertEq(reasonByCode('custom_x', r).label, 'سبب مخصّص');
});

test('isVoided true only when appeal accepted', () => {
  assertEq(isVoided({ appeal: { status: 'accepted' } }), true);
  assertEq(isVoided({ appeal: { status: 'pending' } }), false);
  assertEq(isVoided({}), false);
});

test('annotateRecurrence numbers same-reason chronologically', () => {
  const incs = [
    { _id: 'a', reasonCode: 'late_design', date: '2026-01-10' },
    { _id: 'b', reasonCode: 'late_design', date: '2026-03-05' },
    { _id: 'c', reasonCode: 'quality_color', date: '2026-02-01' },
  ];
  const m = annotateRecurrence(incs);
  assertEq(m.get('a').ordinal, 1); assertEq(m.get('a').total, 2);
  assertEq(m.get('b').ordinal, 2); assertEq(m.get('b').total, 2);
  assertEq(m.get('c').ordinal, 1); assertEq(m.get('c').total, 1);
});

test('annotateRecurrence excludes voided from the count', () => {
  const incs = [
    { _id: 'a', reasonCode: 'late_design', date: '2026-01-10', appeal: { status: 'accepted' } },
    { _id: 'b', reasonCode: 'late_design', date: '2026-03-05' },
  ];
  const m = annotateRecurrence(incs);
  assertEq(m.has('a'), false, '(voided not annotated)');
  assertEq(m.get('b').total, 1, '(only the active one counts)');
});

test('annotateRecurrence falls back to type for legacy incidents (no reasonCode)', () => {
  const incs = [
    { _id: 'a', type: 'attendance', date: '2026-01-01' },
    { _id: 'b', type: 'attendance', date: '2026-01-02' },
  ];
  const m = annotateRecurrence(incs);
  assertEq(m.get('b').total, 2);
});

test('recurrenceInfo thresholds', () => {
  assertEq(recurrenceInfo(1).level, 'none');
  assertEq(recurrenceInfo(2).level, 'medium');
  assertEq(recurrenceInfo(3).level, 'high');
  assertEq(recurrenceInfo(3).suggestSeverity, 'high');
});

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed) process.exit(1);
