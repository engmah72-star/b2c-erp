/**
 * UTILS LAYER · username — slug آمن لاسم صفحة الأعمال العامة (نقي). (STANDARDS §6)
 * يطابق التطبيع في client-actions (المصدر النهائي عند الكتابة).
 */
export function slugUsername(v) {
  return String(v || '').trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w؀-ۿ-]/g, '')
    .replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
