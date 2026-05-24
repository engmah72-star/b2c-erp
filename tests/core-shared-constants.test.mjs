/**
 * Tests for core/shared-constants.js
 * Run: node tests/core-shared-constants.test.mjs
 */
import { STAGE_AR, STAGE_COL, ROLE_LABELS } from '../core/shared-constants.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── STAGE_AR ──────────────────────────────────────────────────────
test('STAGE_AR: contains all 6 stages', () => {
  assertEq(Object.keys(STAGE_AR).length, 6);
});

test('STAGE_AR: design/printing/production/shipping/archived/cancelled', () => {
  ['design','printing','production','shipping','archived','cancelled'].forEach(k => {
    if (typeof STAGE_AR[k] !== 'string' || !STAGE_AR[k].length) {
      throw new Error(`missing label for ${k}`);
    }
  });
});

test('STAGE_AR: archived uses مؤرشف (not مكتمل nor أرشيف)', () => {
  assertEq(STAGE_AR.archived, 'مؤرشف');
});

test('STAGE_AR: no emoji prefix on the labels', () => {
  // emoji-prefixed variant is in clients-constants.js — this module is plain
  Object.values(STAGE_AR).forEach(v => {
    if (/[\u{1F300}-\u{1FAFF}]/u.test(v)) throw new Error(`unexpected emoji in: ${v}`);
  });
});

// ── STAGE_COL ─────────────────────────────────────────────────────
test('STAGE_COL: contains all 6 stages with matching keys', () => {
  assertEq(Object.keys(STAGE_COL).length, 6);
  Object.keys(STAGE_AR).forEach(k => {
    if (!STAGE_COL[k]) throw new Error(`STAGE_COL missing ${k}`);
  });
});

test('STAGE_COL: all values are CSS strings (var(--*) or hex)', () => {
  Object.values(STAGE_COL).forEach(v => {
    if (!/^(var\(--|#)/.test(v)) throw new Error(`invalid CSS value: ${v}`);
  });
});

// ── ROLE_LABELS ───────────────────────────────────────────────────
test('ROLE_LABELS: 8 roles', () => {
  assertEq(Object.keys(ROLE_LABELS).length, 8);
});

test('ROLE_LABELS: all 8 canonical role keys present', () => {
  const expected = ['admin','operation_manager','wallet_manager','customer_service',
    'graphic_designer','design_operator','production_agent','shipping_officer'];
  expected.forEach(k => {
    if (!ROLE_LABELS[k]) throw new Error(`missing role label for ${k}`);
  });
});

test('ROLE_LABELS: admin label is مدير عام', () => {
  assertEq(ROLE_LABELS.admin, 'مدير عام');
});

test('ROLE_LABELS: shipping_officer is مسؤول شحن (not مندوب شحن)', () => {
  // returns.html uses 'مندوب شحن' variant intentionally; this module is the canonical
  assertEq(ROLE_LABELS.shipping_officer, 'مسؤول شحن');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
