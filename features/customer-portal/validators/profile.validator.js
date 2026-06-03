/**
 * VALIDATORS LAYER · profile — تحقّق فقط، يُرجع { ok, errors, warnings }. (STANDARDS §6)
 * يعكس قواعد clientActions (المصدر النهائي). لا UI · لا Firebase.
 */
const RE_EG_PHONE = /^01[0125][0-9]{8}$/;

export function validateProfile({ bizName = '', phone = '' } = {}) {
  const errors = [];
  if (!bizName.trim()) errors.push('⚠️ اسم النشاط مطلوب');
  const p = phone.trim();
  if (!p) errors.push('⚠️ رقم التواصل مطلوب');
  else if (!RE_EG_PHONE.test(p)) errors.push('⚠️ رقم هاتف مصري غير صحيح');
  return { ok: errors.length === 0, errors, warnings: [] };
}
