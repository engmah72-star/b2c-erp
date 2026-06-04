/**
 * core/entitlements — المصدر المركزي الوحيد لاستحقاقات الاشتراك/المزايا (#6 مركزية).
 * نقي · ESM · لا Firebase · لا UI. يقرأ حقول public_cards (plan/featured) المزروعة مسبقاً.
 *
 * الغرض: نقطة واحدة تحدّد «ماذا يستحق هذا الحساب؟» قبل بناء أي بوّابات (gating)
 * أو إعلانات مميزة أو اشتراكات مدفوعة — فلا تتوزّع شروط الخطة في الصفحات.
 *
 * غير مُفعَّل بعد (لا يفرض شيئاً) — أساس مركزي قابل للاستهلاك لاحقاً عبر:
 *   import { hasFeature, entitlementsOf } from '../../core/entitlements.js';
 */

/** الخطط المعتمدة (ترتيب تصاعدي). */
export const PLANS = Object.freeze(['free', 'pro', 'business']);

/** المزايا لكل خطة (تراكمية: الأعلى يرث الأدنى). */
const TIER_FEATURES = Object.freeze({
  free:     ['public_profile', 'directory_listing', 'custom_username', 'qr_code'],
  pro:      ['featured_eligible', 'profile_analytics', 'unlimited_works'],
  business: ['remove_branding', 'priority_support', 'multi_user'],
});

/** يبني مجموعة المزايا المتراكمة حتى خطة معيّنة. */
function featuresUpTo(plan) {
  const out = new Set();
  for (const p of PLANS) {
    (TIER_FEATURES[p] || []).forEach((f) => out.add(f));
    if (p === plan) break;
  }
  return out;
}

/** خطة الحساب المطبّعة (افتراضي free). */
export function planOf(card) {
  const p = String(card?.plan || 'free').toLowerCase().trim();
  return PLANS.includes(p) ? p : 'free';
}

/** هل الحساب مميَّز فعلاً؟ (مميَّز + خطة تسمح بذلك). */
export function isFeatured(card) {
  return card?.featured === true && featuresUpTo(planOf(card)).has('featured_eligible');
}

/** هل يستحق الحساب ميزة معيّنة؟ */
export function hasFeature(card, feature) {
  return featuresUpTo(planOf(card)).has(feature);
}

/** حدّ أعمال المعرض في الخطة المجانية (غير محدود في pro+). */
export const WORKS_FREE_LIMIT = 6;

/** حدّ عدد الأعمال المسموح به للحساب (Infinity لو يملك unlimited_works). */
export function worksLimit(card) {
  return hasFeature(card, 'unlimited_works') ? Infinity : WORKS_FREE_LIMIT;
}

/** ملخّص الاستحقاق الكامل (للعرض/التحكّم). */
export function entitlementsOf(card) {
  const plan = planOf(card);
  return { plan, featured: isFeatured(card), features: [...featuresUpTo(plan)] };
}
