/**
 * Tests for features/clients/duplicate-scan.js
 *
 * Run: node tests/features-clients-duplicate-scan.test.mjs
 */
import { findDuplicatePhones } from '../features/clients/duplicate-scan.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`expected ${B} got ${A} ${hint}`);
}

// ── Empty / shape ──
test('empty array → empty groups', () => {
  assertEq(findDuplicatePhones([]), []);
});

test('null input → empty groups', () => {
  assertEq(findDuplicatePhones(null), []);
});

test('non-array input → empty groups', () => {
  assertEq(findDuplicatePhones('hello'), []);
});

test('single client → no duplicate', () => {
  const r = findDuplicatePhones([
    { _id: 'a', phone1: '01012345678' },
  ]);
  assertEq(r, []);
});

// ── Basic duplicate detection ──
test('two clients same phone1 → 1 group of 2', () => {
  const r = findDuplicatePhones([
    { _id: 'a', name: 'A', phone1: '01012345678' },
    { _id: 'b', name: 'B', phone1: '01012345678' },
  ]);
  assertEq(r.length, 1);
  assertEq(r[0].phone, '01012345678');
  assertEq(r[0].clients.length, 2);
});

test('phone1 of A === phone2 of B → 1 group', () => {
  const r = findDuplicatePhones([
    { _id: 'a', name: 'A', phone1: '01012345678' },
    { _id: 'b', name: 'B', phone1: '01198765432', phone2: '01012345678' },
  ]);
  assertEq(r.length, 1);
  assertEq(r[0].phone, '01012345678');
  assertEq(r[0].clients.length, 2);
});

test('three-way collision → group size 3', () => {
  const r = findDuplicatePhones([
    { _id: 'a', phone1: '01011111111' },
    { _id: 'b', phone1: '01011111111' },
    { _id: 'c', phone1: '01011111111' },
  ]);
  assertEq(r.length, 1);
  assertEq(r[0].clients.length, 3);
});

// ── Exclusions ──
test('deleted clients are excluded', () => {
  const r = findDuplicatePhones([
    { _id: 'a', phone1: '01012345678' },
    { _id: 'b', phone1: '01012345678', isDeleted: true },
  ]);
  assertEq(r, []);
});

test('empty phones are skipped', () => {
  const r = findDuplicatePhones([
    { _id: 'a', phone1: '', phone2: '' },
    { _id: 'b', phone1: '', phone2: '' },
  ]);
  assertEq(r, []);
});

test('invalid (non-EG) phones are skipped', () => {
  const r = findDuplicatePhones([
    { _id: 'a', phone1: '123' },
    { _id: 'b', phone1: '123' },
  ]);
  assertEq(r, []);
});

test('clients without _id are skipped', () => {
  const r = findDuplicatePhones([
    { phone1: '01012345678' },
    { phone1: '01012345678' },
  ]);
  assertEq(r, []);
});

// ── Normalization ──
test('whitespace in phone is trimmed before comparison', () => {
  const r = findDuplicatePhones([
    { _id: 'a', phone1: '01012345678' },
    { _id: 'b', phone1: ' 01012345678 ' },
  ]);
  assertEq(r.length, 1);
  assertEq(r[0].clients.length, 2);
});

// ── Multiple groups ──
test('multiple distinct duplicates → multiple groups', () => {
  const r = findDuplicatePhones([
    { _id: 'a', phone1: '01011111111' },
    { _id: 'b', phone1: '01011111111' },
    { _id: 'c', phone1: '01022222222' },
    { _id: 'd', phone1: '01022222222' },
    { _id: 'e', phone1: '01033333333' }, // unique → no group
  ]);
  assertEq(r.length, 2);
});

test('groups sorted by size desc then phone asc', () => {
  const r = findDuplicatePhones([
    { _id: 'a', phone1: '01022222222' },
    { _id: 'b', phone1: '01022222222' },
    { _id: 'c', phone1: '01011111111' },
    { _id: 'd', phone1: '01011111111' },
    { _id: 'e', phone1: '01011111111' }, // 3-way
  ]);
  assertEq(r[0].phone, '01011111111');
  assertEq(r[0].clients.length, 3);
  assertEq(r[1].phone, '01022222222');
});

// ── Self-dup (phone1 === phone2 on same client) ──
test('client with phone1 === phone2 (self-dup) → not reported alone', () => {
  // A client with phone1=X and phone2=X is captured once per phone in the
  // map (Set dedupes _id), so size stays 1 — not a duplicate group.
  // The validator (V1) prevents this on save anyway.
  const r = findDuplicatePhones([
    { _id: 'a', phone1: '01012345678', phone2: '01012345678' },
  ]);
  assertEq(r, []);
});

test('self-dup client + another client with same phone → 1 group of 2', () => {
  const r = findDuplicatePhones([
    { _id: 'a', phone1: '01012345678', phone2: '01012345678' },
    { _id: 'b', phone1: '01012345678' },
  ]);
  assertEq(r.length, 1);
  assertEq(r[0].clients.length, 2);
});

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed) process.exit(1);
