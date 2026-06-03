/**
 * UTILS LAYER · services — تطبيع خدمات البروفايل (نقي). لا UI · لا Firebase. (STANDARDS §6)
 * backward-compatible: الـschema القديمة string[] تُحوَّل لـ object[] بلا كسر.
 */

/** يطبّع قائمة الخدمات لشكل موحّد ومرتّب. */
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

/** الخدمات الظاهرة للعامة (نشطة + لها اسم) — لإعادة استخدامها في الصفحة العامة. */
export function publicServices(list) {
  return normalizeServices(list).filter((s) => s.active && s.name.trim());
}
