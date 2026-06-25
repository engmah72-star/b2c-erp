/**
 * tests/core-cost-type-normalize.test.mjs
 * ────────────────────────────────────────
 * Unit tests for Arabic cost type normalization.
 */
import { normalizeCostType, costTypesMatch } from '../core/cost-type-normalize.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++; }
  else { console.error(`  ✗ ${msg}`); failed++; }
}

console.log('core-cost-type-normalize.test.mjs\n');

console.log('normalizeCostType — Arabic ال removal');
assert(normalizeCostType('الطباعة') === 'طباعة', '"الطباعة" → "طباعة"');
assert(normalizeCostType('طباعة') === 'طباعة', '"طباعة" stays "طباعة"');
assert(normalizeCostType('القص') === 'قص', '"القص" → "قص"');

console.log('\nnormalizeCostType — whitespace');
assert(normalizeCostType('  طباعة  ') === 'طباعة', 'trims leading/trailing whitespace');
assert(normalizeCostType('طباعة   رقمية') === 'طباعة رقمية', 'collapses internal whitespace');

console.log('\nnormalizeCostType — edge cases');
assert(normalizeCostType('') === '', 'empty string');
assert(normalizeCostType(null) === '', 'null');
assert(normalizeCostType(undefined) === '', 'undefined');
assert(normalizeCostType('UV') === 'UV', 'non-Arabic preserved');

console.log('\ncostTypesMatch — comparison');
assert(costTypesMatch('الطباعة', 'طباعة'), '"الطباعة" matches "طباعة"');
assert(costTypesMatch('طباعة', 'طباعة'), 'exact match');
assert(costTypesMatch(' طباعة ', 'طباعة'), 'whitespace variation matches');
assert(!costTypesMatch('طباعة', 'قص'), 'different types do not match');
assert(costTypesMatch('', ''), 'empty matches empty');

console.log(`\nresult: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
