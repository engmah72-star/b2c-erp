/**
 * features/gallery/model.js
 *
 * طبقة نقية (لا Firebase, لا DOM) — schema + validation + helpers لـ module المعرض.
 * قابلة للاختبار مباشرةً في Node بدون stubs.
 *
 * قرار معماري (RFC-gallery §1): عنصر المعرض = لقطة منشورة مستقلّة (رفع مباشر من
 * المصمم) — ليس mirror حيّ لـ design_items. مصدر الحقيقة للعرض المنسَّق = `gallery`.
 *
 * خصوصية (RULE 8): المعرض مجهول افتراضياً — لا اسم عميل، لا بيانات حسّاسة.
 * تذهب صورة الـ mockup فقط؛ ملفات source/PDF الإنتاجية لا تُنشَر أبداً.
 */

// حدّ حجم الصورة — يطابق storage.rules (match /gallery → < 20MB).
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

// التصنيف الافتراضي عند غياب category.
export const DEFAULT_CATEGORY = 'عام';

/** هل الملف صورة مقبولة للمعرض؟ (صور فقط — يطابق storage.rules) */
export function isGalleryImage(file) {
  if (!file) return false;
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = (file.name || '').toLowerCase();
  return /\.(jpe?g|png|webp|gif|bmp|svg|avif)$/i.test(name);
}

/** تنظيف وسوم — مصفوفة نصوص فريدة، مقصوصة، بحد أقصى معقول. */
export function normalizeTags(tags) {
  const src = Array.isArray(tags)
    ? tags
    : String(tags || '').split(/[,،]/);
  const out = [];
  const seen = new Set();
  for (const t of src) {
    const v = String(t || '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v.slice(0, 40));
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * تحقّق من مدخلات النشر (قبل الرفع).
 * @returns { ok, errors: string[] }
 */
export function validateGalleryInput({ title, file, hasImageUrl = false } = {}) {
  const errors = [];
  const t = String(title || '').trim();
  if (!t) errors.push('العنوان مطلوب');
  if (t.length > 120) errors.push('العنوان طويل جداً (الحد 120 حرفاً)');

  // الصورة: إمّا ملف جديد صالح، أو رابط جاهز (تعديل لاحق).
  if (!file && !hasImageUrl) {
    errors.push('الصورة مطلوبة');
  } else if (file) {
    if (!isGalleryImage(file)) errors.push('يُسمح بالصور فقط (jpg/png/webp/…)');
    if (file.size > MAX_IMAGE_BYTES) errors.push('حجم الصورة يتجاوز 20 ميجا');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * بناء doc المعرض (الحقول الثابتة فقط — الطوابع الزمنية يضيفها الـ service).
 * مجهول افتراضياً: لا clientName، attribution='anonymous'.
 *
 * ملاحظة توافق: `productType` (لا `category`) ليتوافق مع
 * customer-portal/gallery.service.js الذي يقرأ productType + isVisible + publishedAt.
 */
export function buildGalleryItem({
  title, category, tags,
  imageUrl, imagePath,
  designerId, designerName,
  tenantId = null,
} = {}) {
  return {
    title: (String(title || '').trim() || 'تصميم').slice(0, 120),
    productType: String(category || '').trim() || DEFAULT_CATEGORY,
    tags: normalizeTags(tags),
    imageUrl: imageUrl || '',
    imagePath: imagePath || '',
    designerId: designerId || null,
    designerName: designerName || '',
    attribution: 'anonymous', // RULE 8 — لا نسب لعميل
    isVisible: true,
    isFeatured: false,
    sortOrder: 0,
    tenantId: tenantId || null,
  };
}

/** التصنيفات المتاحة من مجموعة عناصر (فريدة، مرتّبة). */
export function deriveCategories(items = []) {
  const set = new Set();
  for (const it of items) {
    const c = String(it.productType || it.category || '').trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
}

/**
 * ترتيب العرض: المميّز أولاً، ثم sortOrder تصاعدي، ثم الأحدث نشراً.
 * يقبل publishedAt كـ Firestore Timestamp ({seconds}) أو Date/number.
 */
export function sortForDisplay(items = []) {
  const ts = (g) => {
    const p = g.publishedAt;
    if (!p) return 0;
    if (typeof p.seconds === 'number') return p.seconds * 1000;
    if (typeof p.toMillis === 'function') return p.toMillis();
    const n = new Date(p).getTime();
    return Number.isNaN(n) ? 0 : n;
  };
  return [...items].sort((a, b) => {
    if (!!b.isFeatured !== !!a.isFeatured) return b.isFeatured ? 1 : -1;
    const so = (a.sortOrder || 0) - (b.sortOrder || 0);
    if (so !== 0) return so;
    return ts(b) - ts(a);
  });
}
