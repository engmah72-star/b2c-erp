/**
 * Tests for core/gallery-browse.js
 * Run: node tests/core-gallery-browse.test.mjs
 */
import {
  itemColors, itemKeywords, tsOf, extractFacets,
  filterGallery, sortGallery, relatedDesigns, browseGallery, SORT_MODES,
  collectionsOf, collectionItems,
} from '../core/gallery-browse.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`expected ${B} got ${A} ${hint}`);
}

// ── fixtures ──────────────────────────────────────────────────────
const G = [
  { _id: 'a', title: 'كارت مطعم', productType: 'كارت', designerName: 'سارة',
    tags: [{ hex: '#FF0000', name: 'أحمر' }, { hex: '#000000', name: 'أسود' }],
    keywords: ['مطعم', 'فاخر'], isVisible: true, publishedAt: { seconds: 300 }, viewCount: 5 },
  { _id: 'b', title: 'فلاير مطعم', productType: 'فلاير', designerName: 'سارة',
    tags: [{ hex: '#ff0000', name: 'أحمر' }], keywords: ['مطعم'],
    isVisible: true, publishedAt: { seconds: 200 }, viewCount: 50, collectionId: 'col1' },
  { _id: 'c', title: 'هوية كافيه', productType: 'كارت', designerName: 'محمد',
    tags: [{ hex: '#00FF00', name: 'أخضر' }], keywords: ['كافيه'],
    isVisible: true, publishedAt: { seconds: 100 }, viewCount: 1 },
  { _id: 'd', title: 'بوست مخفي', productType: 'سوشال', designerName: 'محمد',
    tags: [{ hex: '#FF0000', name: 'أحمر' }], keywords: ['مطعم'],
    isVisible: false, publishedAt: { seconds: 400 } },
];

// ── normalizers ───────────────────────────────────────────────────
test('itemColors: lowercases hex + drops invalid', () => {
  assertEq(itemColors(G[0]).map((c) => c.hex), ['#ff0000', '#000000']);
  assertEq(itemColors({ tags: [{ name: 'x' }, null] }), []);
});

test('itemKeywords: trims + lowercases', () => {
  assertEq(itemKeywords({ keywords: [' Cafe ', 'BAR', ''] }), ['cafe', 'bar']);
  assertEq(itemKeywords({}), []);
});

test('tsOf: supports Timestamp + ISO + missing', () => {
  assertEq(tsOf({ publishedAt: { seconds: 2 } }), 2000);
  assertEq(tsOf({ publishedAt: '1970-01-01T00:00:01.000Z' }), 1000);
  assertEq(tsOf({}), 0);
});

// ── facets ────────────────────────────────────────────────────────
test('extractFacets: categories with counts sorted', () => {
  const f = extractFacets(G);
  assertEq(f.categories.find((c) => c.label === 'كارت').count, 2);
  // most frequent first
  assertEq(f.categories[0].label, 'كارت');
});

test('extractFacets: colors aggregate case-insensitively', () => {
  const f = extractFacets(G);
  const red = f.colors.find((c) => c.hex === '#ff0000');
  assertEq(red.count, 3); // a, b, d
});

test('extractFacets: keywords aggregated', () => {
  const f = extractFacets(G);
  assertEq(f.keywords.find((k) => k.label === 'مطعم').count, 3);
});

// ── filter ────────────────────────────────────────────────────────
test('filterGallery: by category', () => {
  assertEq(filterGallery(G, { category: 'كارت' }).map((x) => x._id), ['a', 'c']);
});

test('filterGallery: by color (case-insensitive)', () => {
  assertEq(filterGallery(G, { color: '#FF0000' }).map((x) => x._id), ['a', 'b', 'd']);
});

test('filterGallery: by keyword', () => {
  assertEq(filterGallery(G, { keyword: 'كافيه' }).map((x) => x._id), ['c']);
});

test('filterGallery: free-text q over title/designer/keywords', () => {
  assertEq(filterGallery(G, { q: 'سارة' }).map((x) => x._id), ['a', 'b']);
  assertEq(filterGallery(G, { q: 'فاخر' }).map((x) => x._id), ['a']);
});

test('filterGallery: combined AND', () => {
  assertEq(filterGallery(G, { category: 'كارت', color: '#ff0000' }).map((x) => x._id), ['a']);
});

// ── sort ──────────────────────────────────────────────────────────
test('sortGallery: newest by publishedAt desc', () => {
  assertEq(sortGallery(G, SORT_MODES.NEWEST).map((x) => x._id), ['d', 'a', 'b', 'c']);
});

test('sortGallery: popular by viewCount desc', () => {
  assertEq(sortGallery(G, SORT_MODES.POPULAR).map((x) => x._id), ['b', 'a', 'c', 'd']);
});

test('sortGallery: does not mutate input', () => {
  const before = G.map((x) => x._id);
  sortGallery(G, SORT_MODES.TITLE);
  assertEq(G.map((x) => x._id), before);
});

// ── related ───────────────────────────────────────────────────────
test('relatedDesigns: excludes self + hidden by default', () => {
  const r = relatedDesigns(G[0], G).map((x) => x._id);
  if (r.includes('a')) throw new Error('should exclude self');
  if (r.includes('d')) throw new Error('should exclude hidden');
});

test('relatedDesigns: ranks same category highest', () => {
  // ref=a (كارت, مطعم/فاخر, أحمر/أسود):
  //   c: نفس التصنيف كارت (+4) = 4
  //   b: كلمة مطعم (+2) + لون أحمر (+1) = 3
  const r = relatedDesigns(G[0], G).map((x) => x._id);
  assertEq(r, ['c', 'b']);
});

test('relatedDesigns: includeHidden shows hidden', () => {
  const r = relatedDesigns(G[0], G, { includeHidden: true }).map((x) => x._id);
  if (!r.includes('d')) throw new Error('should include hidden when asked');
});

test('relatedDesigns: collection match dominates', () => {
  const ref = { _id: 'x', productType: 'z', collectionId: 'col1', tags: [], keywords: [] };
  const r = relatedDesigns(ref, G).map((x) => x._id);
  assertEq(r[0], 'b'); // same collectionId col1 → +10
});

// ── browse (filter+sort) ──────────────────────────────────────────
test('browseGallery: filter then sort', () => {
  const r = browseGallery(G, { filter: { category: 'كارت' }, sort: SORT_MODES.POPULAR });
  assertEq(r.map((x) => x._id), ['a', 'c']);
});

// ── collections ───────────────────────────────────────────────────
const C = [
  { _id: 'p1', title: 'كارت', collectionId: 'k1', collectionName: 'هوية مطعم', isVisible: true, publishedAt: { seconds: 10 } },
  { _id: 'p2', title: 'فلاير', collectionId: 'k1', collectionName: 'هوية مطعم', isVisible: true, publishedAt: { seconds: 30 } },
  { _id: 'p3', title: 'سوشال مخفي', collectionId: 'k1', isVisible: false, publishedAt: { seconds: 40 } },
  { _id: 'p4', title: 'مفرد', isVisible: true, publishedAt: { seconds: 20 } },
];

test('collectionsOf: groups by collectionId, excludes hidden by default', () => {
  const cols = collectionsOf(C);
  assertEq(cols.length, 1);
  assertEq(cols[0].id, 'k1');
  assertEq(cols[0].count, 2);            // p1, p2 (p3 hidden, p4 no collection)
  assertEq(cols[0].name, 'هوية مطعم');
});

test('collectionsOf: cover = newest visible item image/first', () => {
  const cols = collectionsOf(C);
  assertEq(cols[0].items[0]._id, 'p2');  // newest (seconds 30) first
});

test('collectionsOf: includeHidden counts hidden', () => {
  assertEq(collectionsOf(C, { includeHidden: true })[0].count, 3);
});

test('collectionItems: returns siblings excluding ref', () => {
  assertEq(collectionItems(C, 'k1', { excludeId: 'p2' }).map((x) => x._id), ['p1']);
});

test('collectionItems: empty for no collection', () => {
  assertEq(collectionItems(C, ''), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
