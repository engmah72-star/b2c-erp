/**
 * core/text-format — مصدر مركزي واحد للتطبيعات النصّية المشتركة (نقي · ESM).
 * يُنهي ازدواجية normalizeWa / slugUsername / normalizeServices عبر الويب.
 * (ملاحظة: functions/ بيئة CommonJS منفصلة فتحتفظ بنسختها — حدّ runtime موثّق.)
 * لا Firebase · لا DOM · لا منطق أعمال.
 */

/** رقم واتساب بصيغة دولية (مصر). */
export function normalizeWa(n) {
  let s = String(n || '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('0')) s = '2' + s;
  return s;
}

/** slug آمن لاسم صفحة الأعمال العامة. */
export function slugUsername(v) {
  return String(v || '').trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w؀-ۿ-]/g, '')
    .replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** تطبيع خدمات البروفايل (backward-compatible: string[] → object[] مرتّب). */
export function normalizeServices(list) {
  if (!Array.isArray(list)) return [];
  return list.map((s, i) => (typeof s === 'string'
    ? { id: `s${i}`, name: s, desc: '', price: '', imageUrl: '', order: i, active: true }
    : {
        id: s.id || `s${i}`, name: s.name || '', desc: s.desc || '',
        price: s.price || '', imageUrl: s.imageUrl || '',
        order: Number.isFinite(s.order) ? s.order : i, active: s.active !== false,
      }))
    .sort((a, b) => a.order - b.order);
}

/** الخدمات الظاهرة للعامة (نشطة + لها اسم). */
export function publicServices(list) {
  return normalizeServices(list).filter((s) => s.active && String(s.name).trim());
}
