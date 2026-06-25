/**
 * core/cost-type-normalize.js
 * ──────────────────────────────────────────────────────────
 * Arabic-aware cost type normalization.
 *
 * Prevents duplicate library entries caused by trivial text
 * variations ("طباعة" vs "الطباعة" vs " طباعة  ").
 *
 * Used by: recordCostItem (source), upsertCostLibraryItem (indexing),
 *          searchCostLibrary (query), getCostLibraryItems (display).
 */

const AL_RE = /^ال/;
const TASHKEEL_RE = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g;

export function normalizeCostType(raw) {
  if (!raw) return '';
  let s = raw.trim();
  s = s.replace(TASHKEEL_RE, '');
  s = s.replace(/\s+/g, ' ');
  s = s.replace(AL_RE, '');
  return s;
}

export function costTypesMatch(a, b) {
  return normalizeCostType(a) === normalizeCostType(b);
}
