// ════════════════════════════════════════════════════════════════════
// core/incident-reasons.js
// أسباب الإخفاق المُصنّفة + منطق حصر التكرار والتصعيد + حالة التظلّم.
//
// الفكرة (RULE C2 — لا magic strings):
//   • كل إخفاق يُسجَّل تحت «سبب محدّد» (reasonCode) من قائمة قابلة للإدارة
//     (master_lists/incident_reasons) — وهذا ما يُحصر به تكرار «نفس الإخفاق».
//   • التظلّم (appeal): الموظف يعترض، والأدمن يقبل (يُلغى الأثر ويُحفظ) أو يرفض.
//   • التصعيد: تكرار نفس السبب يقترح رفع الخطورة (القرار النهائي للأدمن).
//
// View-only / pure: no DOM, no Firestore, no globals.
// ════════════════════════════════════════════════════════════════════

// الأسباب الافتراضية — مجمّعة تحت أنواع الإخفاق الستة (type يُشتقّ منها).
// code ثابت (لا يتغيّر) · label قابل للتعديل عبر master list.
export const DEFAULT_INCIDENT_REASONS = [
  // جودة
  { code: 'quality_color',     label: 'لون غير مطابق',          type: 'quality' },
  { code: 'quality_size',      label: 'خطأ في المقاس',          type: 'quality' },
  { code: 'quality_print',     label: 'جودة طباعة رديئة',       type: 'quality' },
  { code: 'quality_typo',      label: 'خطأ إملائي في التصميم',   type: 'quality' },
  // تصميم مرفوض
  { code: 'design_rejected',   label: 'تصميم مرفوض من العميل',   type: 'design_rejected' },
  { code: 'design_offbrief',   label: 'تصميم مخالف للبريف',      type: 'design_rejected' },
  { code: 'design_weak',       label: 'جودة تصميم ضعيفة',        type: 'design_rejected' },
  // تأخير
  { code: 'late_design',       label: 'تأخير تسليم التصميم',     type: 'order_late' },
  { code: 'late_production',   label: 'تأخير الإنتاج',           type: 'order_late' },
  { code: 'late_shipping',     label: 'تأخير الشحن',             type: 'order_late' },
  // شكوى عميل
  { code: 'complaint_service', label: 'شكوى تعامل',             type: 'customer_complaint' },
  { code: 'complaint_quality', label: 'شكوى جودة',              type: 'customer_complaint' },
  { code: 'complaint_late',    label: 'شكوى تأخير',             type: 'customer_complaint' },
  // حضور
  { code: 'att_late',          label: 'تأخير في الحضور',         type: 'attendance' },
  { code: 'att_absent',        label: 'غياب بدون إذن',          type: 'attendance' },
  { code: 'att_early',         label: 'انصراف مبكر',            type: 'attendance' },
  // أخرى
  { code: 'other',             label: 'أخرى',                   type: 'other' },
];

// أيقونة/لون لكل نوع (يطابق INCIDENT_TYPES في render-admin-tab.js).
export const REASON_TYPE_META = {
  quality:            { lbl: 'مشكلة جودة',  ico: '⚠️' },
  design_rejected:    { lbl: 'تصميم مرفوض', ico: '🎨' },
  order_late:         { lbl: 'أوردر متأخر',  ico: '⏰' },
  customer_complaint: { lbl: 'شكوى عميل',   ico: '📢' },
  attendance:         { lbl: 'مخالفة حضور', ico: '💤' },
  other:              { lbl: 'أخرى',        ico: '📌' },
};

/**
 * يدمج الأسباب المُدارة (master list) مع الافتراضية — المُدارة تفوز عند تطابق
 * الـ code، ويُحتفظ بالافتراضية غير المُلغاة. لو لا توجد قائمة مُدارة ⇒ الافتراضية.
 */
export function resolveReasons(customItems) {
  if (!Array.isArray(customItems) || !customItems.length) return DEFAULT_INCIDENT_REASONS.slice();
  const byCode = new Map();
  for (const r of DEFAULT_INCIDENT_REASONS) byCode.set(r.code, { ...r });
  for (const r of customItems) {
    if (!r || !r.code) continue;
    byCode.set(r.code, {
      code: r.code,
      label: r.label || r.code,
      type: r.type || byCode.get(r.code)?.type || 'other',
      ...(r.disabled ? { disabled: true } : {}),
    });
  }
  return [...byCode.values()].filter(r => !r.disabled);
}

/** يجد سبباً بالـ code ويُرجع label/type. */
export function reasonByCode(code, reasons = DEFAULT_INCIDENT_REASONS) {
  return reasons.find(r => r.code === code) || null;
}

/** هل الإخفاق مُلغى أثره (تم قبول تظلّمه)؟ */
export function isVoided(incident) {
  return !!(incident && incident.appeal && incident.appeal.status === 'accepted');
}

/** حالة التظلّم النصية للعرض. */
export const APPEAL_STATUS = {
  pending:  { lbl: '⏳ تظلّم قيد المراجعة', col: 'var(--y)' },
  accepted: { lbl: '✅ تم قبول التظلّم — أُلغي الأثر', col: 'var(--g)' },
  rejected: { lbl: '❌ تم رفض التظلّم', col: 'var(--r)' },
};

/**
 * حصر تكرار «نفس الإخفاق»: لكل إخفاق يحسب ترتيبه (ordinal) وإجماليّه (total)
 * بين إخفاقات نفس reasonCode (مع تجاهل المُلغى أثره). يُرجع Map: id → {ordinal,total,reasonCode}.
 *
 * @param {Array} incidents — [{ _id, reasonCode, date, appeal? }]
 */
export function annotateRecurrence(incidents = []) {
  const groups = new Map(); // reasonCode → [incident,...] (non-voided)
  for (const i of incidents) {
    if (isVoided(i)) continue;
    const code = i.reasonCode || ('type:' + (i.type || 'other')); // fallback للقديم بلا reasonCode
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(i);
  }
  const out = new Map();
  for (const [code, list] of groups) {
    // ترتيب تصاعدي بالتاريخ ثم بالإنشاء — الأقدم = المرة الأولى
    const sorted = list.slice().sort((a, b) =>
      (a.date || '').localeCompare(b.date || '') ||
      ((a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
    sorted.forEach((inc, idx) => {
      out.set(inc._id, { ordinal: idx + 1, total: sorted.length, reasonCode: code });
    });
  }
  return out;
}

/**
 * اقتراح التصعيد بناءً على إجمالي تكرار السبب.
 *   total >= 3 ⇒ يُقترح خطورة مرتفعة
 *   total === 2 ⇒ تنبيه (انتبه)
 *   غير ذلك ⇒ لا شيء
 */
export function recurrenceInfo(total) {
  if (total >= 3) {
    return { level: 'high', suggestSeverity: 'high', text: `تكرّر ${total} مرات — يُقترح تصعيد الخطورة إلى «مرتفع»` };
  }
  if (total === 2) {
    return { level: 'medium', suggestSeverity: 'medium', text: 'تكرّر مرّتين — يُنصح بالمتابعة' };
  }
  return { level: 'none', suggestSeverity: null, text: '' };
}
