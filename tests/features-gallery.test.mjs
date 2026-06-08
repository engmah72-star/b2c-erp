/**
 * Tests — features/gallery (طبقات نقية: model + permissions)
 * Run: node tests/features-gallery.test.mjs
 *   (لا Firebase في model.js/permissions.js — تشغيل مباشر بدون loader.)
 *
 * يغطّي:
 *   - isGalleryImage / validateGalleryInput / normalizeTags
 *   - buildGalleryItem (مجهول + productType compat)
 *   - deriveCategories / sortForDisplay (مميّز أولاً ثم sortOrder ثم الأحدث)
 *   - permissions: نشر/إخفاء/تمييز/حذف لكل دور
 */
import {
  isGalleryImage, validateGalleryInput, normalizeTags,
  buildGalleryItem, deriveCategories, sortForDisplay,
  MAX_IMAGE_BYTES, DEFAULT_CATEGORY,
} from '../features/gallery/model.js';
import {
  canViewGallery, canPublishGallery, canToggleVisibility,
  canCurateGallery, canDeleteGalleryItem,
} from '../features/gallery/permissions.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assert(c, hint = '') { if (!c) throw new Error(`assertion failed ${hint}`); }

const imgFile = (over = {}) => ({ type: 'image/png', name: 'a.png', size: 1000, ...over });

// ── isGalleryImage ──
test('isGalleryImage: image mime', () => assert(isGalleryImage(imgFile())));
test('isGalleryImage: image by extension (no mime)', () => assert(isGalleryImage({ type: '', name: 'x.WEBP', size: 1 })));
test('isGalleryImage: pdf rejected', () => assert(!isGalleryImage({ type: 'application/pdf', name: 'x.pdf', size: 1 })));
test('isGalleryImage: source rejected', () => assert(!isGalleryImage({ type: '', name: 'logo.psd', size: 1 })));
test('isGalleryImage: null', () => assert(!isGalleryImage(null)));

// ── validateGalleryInput ──
test('validate: ok with title + image', () => {
  const r = validateGalleryInput({ title: 'كارت', file: imgFile() });
  assert(r.ok, JSON.stringify(r.errors));
});
test('validate: missing title', () => {
  const r = validateGalleryInput({ title: '   ', file: imgFile() });
  assert(!r.ok && r.errors.some(e => e.includes('العنوان')));
});
test('validate: missing image (no file, no url)', () => {
  const r = validateGalleryInput({ title: 'كارت' });
  assert(!r.ok && r.errors.some(e => e.includes('الصورة')));
});
test('validate: image url ok without file', () => {
  const r = validateGalleryInput({ title: 'كارت', hasImageUrl: true });
  assert(r.ok);
});
test('validate: oversized image', () => {
  const r = validateGalleryInput({ title: 'كارت', file: imgFile({ size: MAX_IMAGE_BYTES + 1 }) });
  assert(!r.ok && r.errors.some(e => e.includes('20 ميجا')));
});
test('validate: non-image file', () => {
  const r = validateGalleryInput({ title: 'كارت', file: { type: 'application/pdf', name: 'a.pdf', size: 1 } });
  assert(!r.ok && r.errors.some(e => e.includes('الصور فقط')));
});

// ── normalizeTags ──
test('normalizeTags: string split + dedupe + trim', () => {
  const t = normalizeTags('كارت, كارت ،  بنر , ');
  assertEq(JSON.stringify(t), JSON.stringify(['كارت', 'بنر']));
});
test('normalizeTags: array + cap at 12', () => {
  const t = normalizeTags(Array.from({ length: 20 }, (_, i) => 'tag' + i));
  assertEq(t.length, 12);
});

// ── buildGalleryItem ──
test('buildGalleryItem: anonymous + productType + defaults', () => {
  const it = buildGalleryItem({ title: ' كارت ', category: ' كروت ', tags: 'a,b', imageUrl: 'u', imagePath: 'p', designerId: 'd1', designerName: 'سامي' });
  assertEq(it.title, 'كارت');
  assertEq(it.productType, 'كروت');
  assertEq(it.attribution, 'anonymous');
  assert(it.isVisible === true && it.isFeatured === false);
  assert(!('clientName' in it), 'يجب ألا يحوي اسم عميل (مجهول)');
  assertEq(it.imageUrl, 'u'); assertEq(it.imagePath, 'p');
  assertEq(JSON.stringify(it.tags), JSON.stringify(['a', 'b']));
});
test('buildGalleryItem: empty category → default', () => {
  assertEq(buildGalleryItem({ title: 'x' }).productType, DEFAULT_CATEGORY);
});
test('buildGalleryItem: empty title → fallback', () => {
  assertEq(buildGalleryItem({}).title, 'تصميم');
});

// ── deriveCategories ──
test('deriveCategories: unique sorted', () => {
  const cats = deriveCategories([{ productType: 'بنر' }, { productType: 'كروت' }, { productType: 'بنر' }, { category: 'تغليف' }]);
  assertEq(cats.length, 3);
  assert(cats.includes('بنر') && cats.includes('كروت') && cats.includes('تغليف'));
});

// ── sortForDisplay ──
test('sortForDisplay: featured first, then sortOrder, then newest', () => {
  const items = [
    { id: 'a', isFeatured: false, sortOrder: 5, publishedAt: { seconds: 100 } },
    { id: 'b', isFeatured: true,  sortOrder: 9, publishedAt: { seconds: 1 } },
    { id: 'c', isFeatured: false, sortOrder: 1, publishedAt: { seconds: 50 } },
    { id: 'd', isFeatured: false, sortOrder: 1, publishedAt: { seconds: 200 } },
  ];
  const out = sortForDisplay(items).map(i => i.id);
  assertEq(out[0], 'b', 'المميّز أولاً');
  // ثم sortOrder=1: d (الأحدث) قبل c، ثم sortOrder=5: a
  assertEq(JSON.stringify(out), JSON.stringify(['b', 'd', 'c', 'a']));
});
test('sortForDisplay: does not mutate input', () => {
  const items = [{ id: '1' }, { id: '2' }];
  sortForDisplay(items);
  assertEq(items[0].id, '1');
});

// ── permissions ──
test('canViewGallery: always public', () => { assert(canViewGallery()); assert(canViewGallery('anything')); });

test('canPublishGallery: admin/ops/designers yes', () => {
  ['admin', 'operation_manager', 'graphic_designer', 'design_operator'].forEach(r => assert(canPublishGallery(r), r));
});
test('canPublishGallery: others no', () => {
  ['customer_service', 'production_agent', 'shipping_officer', 'wallet_manager', null, undefined].forEach(r => assert(!canPublishGallery(r), String(r)));
});

test('canCurateGallery + canDeleteGalleryItem: admin/ops only', () => {
  assert(canCurateGallery('admin') && canCurateGallery('operation_manager'));
  assert(!canCurateGallery('graphic_designer'));
  assert(canDeleteGalleryItem('admin') && !canDeleteGalleryItem('graphic_designer'));
});

test('canToggleVisibility: admin always', () => {
  assert(canToggleVisibility('admin', { uid: 'x', item: { designerId: 'y' } }));
});
test('canToggleVisibility: designer owner only', () => {
  assert(canToggleVisibility('graphic_designer', { uid: 'd1', item: { designerId: 'd1' } }), 'صاحبه');
  assert(!canToggleVisibility('graphic_designer', { uid: 'd1', item: { designerId: 'd2' } }), 'ليس صاحبه');
});
test('canToggleVisibility: non-publisher no', () => {
  assert(!canToggleVisibility('customer_service', { uid: 'd1', item: { designerId: 'd1' } }));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
