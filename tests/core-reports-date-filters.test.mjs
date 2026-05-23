/**
 * Tests for core/reports-date-filters.js (reports Phase-1A).
 * Run: node tests/core-reports-date-filters.test.mjs
 */
import { getRange, getPrevRange, inRange } from '../core/reports-date-filters.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

const anchor = new Date(2026, 4, 15, 12, 0, 0); // Fri 2026-05-15

// ── getRange ───────────────────────────────────────────────────────
test('today range — 00:00 → 23:59', () => {
  const r = getRange('today', { now: anchor });
  assertEq(r.from.toDateString(), 'Fri May 15 2026');
  assertEq(r.from.getHours(), 0);
  assertEq(r.to.getHours(), 23);
});

test('month range — 1st → last day', () => {
  const r = getRange('month', { now: anchor });
  assertEq(r.from.getDate(), 1);
  assertEq(r.from.getMonth(), 4);  // May
  assertEq(r.to.getDate(), 31);    // May has 31 days
});

test('year range — Jan 1 → Dec 31', () => {
  const r = getRange('year', { now: anchor });
  assertEq(r.from.getMonth(), 0);
  assertEq(r.from.getDate(), 1);
  assertEq(r.to.getMonth(), 11);
  assertEq(r.to.getDate(), 31);
});

test('last3 starts 3 months back', () => {
  const r = getRange('last3', { now: anchor });
  assertEq(r.from.getMonth(), 1);  // Feb
});

test('week range — 7 days, Monday-start', () => {
  const r = getRange('week', { now: anchor });
  // anchor is Friday → Monday of that week is May 11
  assertEq(r.from.getDate(), 11);
  assertEq(r.from.getDay(), 1); // Monday
  // to = Sunday end
  const diffMs = r.to - r.from;
  if (diffMs < 6 * 86400000 || diffMs > 7 * 86400000) throw new Error('week not ~7 days');
});

test('custom range with valid dates', () => {
  const r = getRange('custom', { now: anchor, customFrom: '2026-03-01', customTo: '2026-03-15' });
  assertEq(r.from.getFullYear(), 2026);
  assertEq(r.from.getMonth(), 2);
  assertEq(r.to.getMonth(), 2);
  assertEq(r.to.getHours(), 23);
});

test('custom without dates → fallback to month', () => {
  const r = getRange('custom', { now: anchor });
  assertEq(r.from.getDate(), 1);
});

test('unknown mode → fallback to month', () => {
  const r = getRange('whatever', { now: anchor });
  assertEq(r.from.getDate(), 1);
});

// ── getPrevRange ───────────────────────────────────────────────────
test('prev month is previous calendar month', () => {
  const r = getPrevRange('month', { now: anchor });
  assertEq(r.from.getMonth(), 3); // April
  assertEq(r.from.getDate(), 1);
  assertEq(r.to.getMonth(), 3);
});

test('prev year is previous calendar year', () => {
  const r = getPrevRange('year', { now: anchor });
  assertEq(r.from.getFullYear(), 2025);
  assertEq(r.to.getFullYear(), 2025);
});

test('prev week mirrors current range length backward', () => {
  const cur = getRange('week', { now: anchor });
  const prev = getPrevRange('week', { now: anchor });
  const curLen = cur.to - cur.from;
  const prevLen = prev.to - prev.from;
  // allow 1s drift
  if (Math.abs(curLen - prevLen) > 1000) throw new Error('lengths differ');
  // prev.to should be just before cur.from
  if (prev.to.getTime() >= cur.from.getTime()) throw new Error('prev.to not before cur.from');
});

// ── inRange ────────────────────────────────────────────────────────
test('inRange: doc within range → true', () => {
  const range = getRange('month', { now: anchor });
  const doc = { createdAt: { seconds: Math.floor(new Date(2026, 4, 10).getTime() / 1000) } };
  assertEq(inRange(doc, range), true);
});

test('inRange: doc outside range → false', () => {
  const range = getRange('month', { now: anchor });
  const doc = { createdAt: { seconds: Math.floor(new Date(2026, 3, 10).getTime() / 1000) } };
  assertEq(inRange(doc, range), false);
});

test('inRange: missing createdAt → false', () => {
  const range = getRange('month', { now: anchor });
  assertEq(inRange({}, range), false);
  assertEq(inRange(null, range), false);
  assertEq(inRange({ createdAt: { seconds: 0 } }, range), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
