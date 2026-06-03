/**
 * UTILS LAYER · format — تنسيق عرض نقي بلا حالة. (STANDARDS §6)
 * لا منطق أعمال (الحسابات المالية في order-math/Services).
 */

const STAGE_AR = {
  design: '✏️ تصميم', printing: '🖨️ طباعة', production: '🏭 تنفيذ',
  shipping: '🚚 شحن', archived: '✅ مكتمل', cancelled: '✕ ملغي',
};

/** قيمة مالية بصيغة عربية. */
export const money = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('ar-EG');

/** تسمية مرحلة الطلب للعرض. */
export const stageLabel = (stage) => STAGE_AR[stage] || stage || '—';

/** نغمة شارة الحالة (للـ Badge tone) — نفس مفتاح المرحلة. */
export const stageTone = (stage) => (STAGE_AR[stage] ? stage : 'neutral');

/** رقم واتساب بصيغة دولية (مصر). */
export function normalizeWa(n) {
  let s = String(n || '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('0')) s = '2' + s;
  return s;
}

/** وقت مختصر من Firestore Timestamp. */
export function shortTime(ts) {
  const sec = ts?.seconds ?? (ts?.toMillis ? ts.toMillis() / 1000 : 0);
  if (!sec) return '';
  return new Date(sec * 1000).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}
