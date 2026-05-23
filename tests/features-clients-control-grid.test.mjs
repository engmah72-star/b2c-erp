/**
 * Tests for features/clients/control-grid.js (clients Phase-3).
 * Run: node tests/features-clients-control-grid.test.mjs
 */
import {
  findClientForOrder, buildBulkStagePrompt, buildBulkAssignPrompt,
  findDesignerByName, triggerCsvDownload,
} from '../features/clients/control-grid.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── findClientForOrder ─────────────────────────────────────────────
test('null order → null', () => assertEq(findClientForOrder(null), null));
test('no match → null', () => {
  assertEq(findClientForOrder({ clientId: 'x' }, [{ _id: 'a' }]), null);
});

test('match by clientId (primary)', () => {
  const c = findClientForOrder(
    { clientId: 'c1', clientPhone: '010', clientName: 'A' },
    [{ _id: 'c1', name: 'X' }, { _id: 'c2' }]
  );
  assertEq(c?._id, 'c1');
});

test('match by phone fallback', () => {
  const c = findClientForOrder(
    { clientPhone: '010' },
    [{ _id: 'c2', phone1: '010' }]
  );
  assertEq(c?._id, 'c2');
});

test('match by name fallback', () => {
  const c = findClientForOrder(
    { clientName: 'Ahmed' },
    [{ _id: 'c3', name: 'Ahmed' }]
  );
  assertEq(c?._id, 'c3');
});

test('clientId takes precedence over phone match', () => {
  const c = findClientForOrder(
    { clientId: 'c1', clientPhone: '010' },
    [{ _id: 'c1' }, { _id: 'c2', phone1: '010' }]
  );
  assertEq(c?._id, 'c1');
});

test('phone takes precedence over name match', () => {
  const c = findClientForOrder(
    { clientPhone: '010', clientName: 'Ahmed' },
    [{ _id: 'c2', phone1: '010' }, { _id: 'c3', name: 'Ahmed' }]
  );
  assertEq(c?._id, 'c2');
});

// ── buildBulkStagePrompt ───────────────────────────────────────────
test('lists stages with separator', () => {
  const p = buildBulkStagePrompt({ design: {}, printing: {}, archived: {} }, 5);
  if (!p.includes('design | printing | archived')) throw new Error('missing stages');
  if (!p.includes('5 أوردر')) throw new Error('missing count');
});

test('handles empty statusMap', () => {
  const p = buildBulkStagePrompt({}, 0);
  if (!p.includes('0 أوردر')) throw new Error('missing count');
});

// ── buildBulkAssignPrompt ──────────────────────────────────────────
test('lists designer names with separator', () => {
  const p = buildBulkAssignPrompt([
    { name: 'A' }, { name: 'B' }, { displayName: 'C' },
  ]);
  if (!p.includes('A | B | C')) throw new Error('expected joined names');
});

test('filters empty names', () => {
  const p = buildBulkAssignPrompt([{ name: 'X' }, {}, { name: '' }]);
  if (p.includes('|')) {
    // Shouldn't have separator since only X is non-empty
    throw new Error('separator should be absent');
  }
  if (!p.includes('X')) throw new Error('X missing');
});

// ── findDesignerByName ─────────────────────────────────────────────
test('null/empty name → null', () => {
  assertEq(findDesignerByName('', []), null);
  assertEq(findDesignerByName(null, [{ name: 'A' }]), null);
});

test('exact match on name', () => {
  const d = findDesignerByName('Ahmed', [{ _id: 'd1', name: 'Ahmed' }, { _id: 'd2', name: 'Other' }]);
  assertEq(d?._id, 'd1');
});

test('matches displayName when name absent', () => {
  const d = findDesignerByName('Ahmed', [{ _id: 'd1', displayName: 'Ahmed' }]);
  assertEq(d?._id, 'd1');
});

test('no match → null', () => {
  assertEq(findDesignerByName('Z', [{ name: 'A' }]), null);
});

// ── triggerCsvDownload ─────────────────────────────────────────────
test('returns without throwing when document undefined (SSR guard)', () => {
  // Just confirm it doesn't throw in node
  const saved = globalThis.document;
  delete globalThis.document;
  try {
    triggerCsvDownload('a,b\n1,2', 'test.csv');  // should silently no-op
  } finally {
    if (saved !== undefined) globalThis.document = saved;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
