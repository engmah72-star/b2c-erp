// ============================================================
// core/product-proposals-validate.js
// ============================================================
// Pure validation + normalization for Product Proposals.
// لا يستورد Firebase — قابل للاختبار في node مباشرةً (نمط *-pure).
// المنطق المالي/الكتابة في core/product-proposals.js؛ هنا قواعد نقية فقط.
// ============================================================

/** يولّد معرّفاً قصيراً فريداً (للسطور). */
export function genLineId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** يطبّع سطور المقترح إلى الشكل المعتمد. لا يكتب. */
export function normalizeProposalLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((l) => ({
    lineId: l.lineId || genLineId(),
    type: (l.type || '').toString().trim(),
    supplierId: (l.supplierId || '').toString(),
    supplierName: (l.supplierName || '').toString(),
    total: parseFloat(l.total) || 0,
    note: (l.note || '').toString(),
    ...(l.paperMeta && Object.keys(l.paperMeta).length ? { paperMeta: l.paperMeta } : {}),
  }));
}

/** مجموع سطور المقترح. */
export function proposalTotal(lines) {
  return normalizeProposalLines(lines).reduce((s, l) => s + l.total, 0);
}

/**
 * يتحقق من صلاحية مقترح منتج قبل الحفظ/الاعتماد.
 * المقترح = منتج كامل (prodIdx)، عدة موردين مسموح، كل سطر لازم له مورد+نوع+مبلغ.
 * @returns {{ ok, errors, warnings }}
 */
export function validateProductProposal({ order, prodIdx, lines }) {
  const errors = [];
  const warnings = [];
  if (!order) errors.push('الأوردر غير موجود');

  const products = (order && order.products) || [];
  const pi = Number(prodIdx);
  if (!Number.isInteger(pi) || pi < 0 || pi >= products.length) {
    errors.push('⚠️ المنتج غير محدد — المقترح بيكون بالمنتج الكامل');
  }

  const norm = normalizeProposalLines(lines);
  if (!norm.length) {
    errors.push('⚠️ أضف بند واحد على الأقل للمقترح');
  }
  norm.forEach((l, i) => {
    const lbl = `سطر ${i + 1}`;
    if (!l.supplierId) errors.push(`${lbl}: المورد مطلوب — كل بند لازم له مورد`);
    if (!l.type) errors.push(`${lbl}: نوع البند مطلوب`);
    if (!(l.total > 0)) errors.push(`${lbl}: المبلغ لازم يكون أكبر من صفر`);
  });

  return { ok: errors.length === 0, errors, warnings };
}
