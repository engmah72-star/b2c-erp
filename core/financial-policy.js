/**
 * Business2Card ERP — core/financial-policy.js
 *
 * ━━━ FINANCIAL CONTROL POLICY ENGINE (foundation) ━━━
 *
 * محرّك سياسة مالية مركزي ونقي (pure): المصدر الوحيد لقرار «هل هذه الحركة
 * المالية مسموحة / تحتاج اعتماداً ثانياً / محظورة؟» — للمقبوضات (الداخل)
 * والمدفوعات (الخارج).
 *
 * لماذا ليس عبر core/feature-flags.js؟
 *   تلك flags تُحَل من localStorage/URL (per-client) — يستطيع المستخدم
 *   تعطيلها. الرقابة المالية يجب أن تكون مركزية وغير قابلة للتعطيل من
 *   المتصفّح: لذا الـ policy تُخزَّن خادمياً في `master_lists/financial_policy`
 *   (يحرّرها admin فقط) وتُمرَّر إلى هذا المحرّك. الكود هنا لا يقرأ Firestore —
 *   pure → قابل للاختبار ولإعادة الاستخدام في UI والـ actions معاً.
 *
 * E1 (Evolution Safety):
 *   - DEFAULT_FINANCIAL_POLICY.mode = 'advisory' → السلوك الافتراضي لا يمنع
 *     ولا يصعّد، فقط يُرفِق تحذيرات. backward-compatible تماماً.
 *   - تفعيل البوابة الصلبة = تغيير `mode` إلى 'escalate' من الإعدادات (reversible).
 *
 * Modes:
 *   'off'      — لا تقييم إطلاقاً (kill-switch).
 *   'advisory' — يقيّم ويُرجِع level + warnings، لكن requiresApproval=false دائماً.
 *   'escalate' — فوق الحدّ: requiresApproval=true (تصعيد لاعتماد شخص ثانٍ /
 *                دور أعلى)، دون رفض تلقائي صلب.
 */

// ══════════════════════════════════════════════════════════
// DEFAULT POLICY — قابلة للتجاوز من master_lists/financial_policy
// ══════════════════════════════════════════════════════════
// كل المبالغ بالجنيه المصري (EGP). عدّلها من الإعدادات لا من الكود.
export const DEFAULT_FINANCIAL_POLICY = Object.freeze({
  version: 1,
  mode: 'advisory', // 'off' | 'advisory' | 'escalate'

  // ── حدود الخارج (مدفوعات: مورد/مرتب/استرداد/مصروف) ──
  outflow: Object.freeze({
    advisoryMed:  5000,   // فوقها: تحذير med
    advisoryHigh: 10000,  // فوقها: تحذير high
    escalate:     10000,  // فوق هذا الحدّ (في mode='escalate') → اعتماد ثانٍ إلزامي
    dailyWalletCap: 50000, // إجمالي خارج المحفظة الواحدة/اليوم — فوقه تصعيد
    requiredApproverRole: 'admin', // الدور الأدنى المطلوب للاعتماد فوق الحدّ
    fourEyes: true,       // المُعتمِد ≠ منشئ الطلب
  }),

  // ── حدود الداخل (مقبوضات العملاء) ──
  inflow: Object.freeze({
    reviewThreshold: 20000, // فوقها: مقبوض «يحتاج مراجعة» (يظهر في الطابور)
    requireReceiptAbove: 10000, // فوقها: إيصال/مرجع تحويل إلزامي
  }),

  // ── تشديد حسب نوع المحفظة (الكاش أخطر من البنك) ──
  walletOverrides: Object.freeze({
    cash: Object.freeze({ outflowEscalate: 5000, dailyWalletCap: 20000 }),
    bank: Object.freeze({}),
  }),

  // ── فصل المهام في الطبقتين (Segregation of Duties) ──
  approval: Object.freeze({
    // strictSeparation=true → المُعتمِد (admin) يجب أن يختلف عن المؤكِّد، ولا
    // اعتماد مباشر لعملية pending (يلزم تأكيد سابق من شخص آخر). افتراضياً مُطفأ
    // (E1) — يُفعَّل من الإعدادات عند توفّر ≥2 مُخوَّلَين.
    strictSeparation: false,
    // عتبة تقادم الطلب المعلّق (ساعات) — فوقها يُعَدّ «متأخّراً» (SLA).
    staleHours: 48,
  }),
});

// ══════════════════════════════════════════════════════════
// resolveFinancialPolicy — دمج override (من الإعدادات) فوق الافتراضي
// ══════════════════════════════════════════════════════════
/**
 * يدمج policy override (master_lists/financial_policy) فوق الافتراضي.
 * دمج سطحي-عميق لمستوى واحد من المجموعات (outflow/inflow/walletOverrides).
 * أي حقل ناقص في الـ override يرث الافتراضي → آمن جزئياً.
 *
 * @param {Object|null} override
 * @returns {Object} policy مكتملة
 */
export function resolveFinancialPolicy(override) {
  const d = DEFAULT_FINANCIAL_POLICY;
  if (!override || typeof override !== 'object') {
    return { ...d, outflow: { ...d.outflow }, inflow: { ...d.inflow }, walletOverrides: { ...d.walletOverrides }, approval: { ...d.approval } };
  }
  return {
    version: override.version ?? d.version,
    mode: ['off', 'advisory', 'escalate'].includes(override.mode) ? override.mode : d.mode,
    outflow: { ...d.outflow, ...(override.outflow || {}) },
    inflow: { ...d.inflow, ...(override.inflow || {}) },
    walletOverrides: {
      cash: { ...d.walletOverrides.cash, ...((override.walletOverrides || {}).cash || {}) },
      bank: { ...d.walletOverrides.bank, ...((override.walletOverrides || {}).bank || {}) },
    },
    approval: { ...d.approval, ...(override.approval || {}) },
  };
}

/** هل الفصل الصارم بين المؤكِّد والمُعتمِد مُفعَّل؟ */
export function requiresStrictSeparation(policy) {
  const p = policy && policy.approval ? policy : resolveFinancialPolicy(policy);
  return !!p.approval.strictSeparation;
}

/**
 * تحقّق الفصل الصارم عند الاعتماد: يلزم أن تكون العملية مؤكَّدة مسبقاً، وأن
 * يختلف المُعتمِد عن المؤكِّد. (يُطبَّق فقط عند تفعيل strictSeparation.)
 *
 * @param {Object} args — { approvalStatus, confirmedBy } للعملية
 * @param {string} approverId — المُعتمِد الحالي
 * @param {Object} [policy]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function checkApprovalSeparation({ approvalStatus, confirmedBy } = {}, approverId = '', policy = null) {
  if (!requiresStrictSeparation(policy)) return { ok: true, errors: [] };
  if (approvalStatus !== 'confirmed') {
    return { ok: false, errors: ['⛔ الفصل الصارم: يلزم تأكيد العملية أولاً من شخص آخر قبل الاعتماد (لا اعتماد مباشر)'] };
  }
  if (confirmedBy && approverId && confirmedBy === approverId) {
    return { ok: false, errors: ['⛔ الفصل الصارم: لا يمكنك اعتماد عملية أكّدتها بنفسك — يلزم مُعتمِد مختلف'] };
  }
  return { ok: true, errors: [] };
}

// ── helper: الحدّ الفعّال للتصعيد مع مراعاة نوع المحفظة ──
function _effectiveOutflowEscalate(policy, walletType) {
  const wo = (policy.walletOverrides || {})[walletType] || {};
  return (typeof wo.outflowEscalate === 'number') ? wo.outflowEscalate : policy.outflow.escalate;
}
function _effectiveDailyCap(policy, walletType) {
  const wo = (policy.walletOverrides || {})[walletType] || {};
  return (typeof wo.dailyWalletCap === 'number') ? wo.dailyWalletCap : policy.outflow.dailyWalletCap;
}

// ══════════════════════════════════════════════════════════
// evaluateOutflow — قرار حركة خارجة
// ══════════════════════════════════════════════════════════
/**
 * يقيّم دفعة خارجة (مورد/مرتب/استرداد/مصروف) مقابل السياسة.
 *
 * @param {Object} args
 * @param {number} args.amount               — قيمة الحركة
 * @param {string} [args.walletType]         — 'cash' | 'bank' | ...
 * @param {number} [args.dailyWalletOutflow] — إجمالي خارج هذه المحفظة اليوم (قبل هذه الحركة)
 * @param {Object} [args.policy]             — ناتج resolveFinancialPolicy (افتراضي = الافتراضي)
 *
 * @returns {{
 *   mode: string, level: 'ok'|'med'|'high',
 *   requiresApproval: boolean, requiredApproverRole: string|null, fourEyes: boolean,
 *   reasons: string[], warnings: string[], thresholds: Object
 * }}
 */
export function evaluateOutflow({ amount, walletType, dailyWalletOutflow = 0, policy } = {}) {
  const p = policy && policy.outflow ? policy : resolveFinancialPolicy(policy);
  const amt = parseFloat(amount) || 0;
  const out = {
    mode: p.mode, level: 'ok',
    requiresApproval: false, requiredApproverRole: null, fourEyes: false,
    reasons: [], warnings: [],
    thresholds: {
      escalate: _effectiveOutflowEscalate(p, walletType),
      dailyCap: _effectiveDailyCap(p, walletType),
    },
  };
  if (p.mode === 'off') return out;

  // مستوى الخطورة (advisory دائماً)
  if (amt > p.outflow.advisoryHigh) out.level = 'high';
  else if (amt > p.outflow.advisoryMed) out.level = 'med';

  const escalateAt = out.thresholds.escalate;
  const dailyCap = out.thresholds.dailyCap;
  const projectedDaily = (parseFloat(dailyWalletOutflow) || 0) + amt;

  const overAmount = amt > escalateAt;
  const overDaily = dailyCap > 0 && projectedDaily > dailyCap;

  if (overAmount) {
    out.warnings.push(`💰 مبلغ ${amt.toLocaleString('ar-EG')} ج يتجاوز حدّ الاعتماد (${escalateAt.toLocaleString('ar-EG')} ج)`);
    out.reasons.push('amount_over_escalate');
  }
  if (overDaily) {
    out.warnings.push(`📊 إجمالي خارج المحفظة اليوم سيصبح ${projectedDaily.toLocaleString('ar-EG')} ج (حدّ ${dailyCap.toLocaleString('ar-EG')} ج)`);
    out.reasons.push('daily_cap_exceeded');
  }

  if ((overAmount || overDaily) && p.mode === 'escalate') {
    out.requiresApproval = true;
    out.requiredApproverRole = p.outflow.requiredApproverRole || null;
    out.fourEyes = !!p.outflow.fourEyes;
  }
  return out;
}

// ══════════════════════════════════════════════════════════
// evaluateInflow — قرار حركة داخلة (مقبوض عميل)
// ══════════════════════════════════════════════════════════
/**
 * يقيّم مقبوضاً من عميل مقابل السياسة. لا يمنع دخول الفلوس (تشغيلياً مهم)،
 * لكنه يحدّد ما إذا كان يحتاج مراجعة لاحقة و/أو إيصالاً إلزامياً.
 *
 * @param {Object} args
 * @param {number} args.amount
 * @param {boolean} [args.hasReceipt] — هل يوجد إيصال/مرجع تحويل
 * @param {Object} [args.policy]
 *
 * @returns {{
 *   mode: string, needsReview: boolean, receiptRequired: boolean,
 *   receiptMissing: boolean, level: 'ok'|'review', reasons: string[], warnings: string[]
 * }}
 */
export function evaluateInflow({ amount, hasReceipt = false, policy } = {}) {
  const p = policy && policy.inflow ? policy : resolveFinancialPolicy(policy);
  const amt = parseFloat(amount) || 0;
  const out = { mode: p.mode, needsReview: false, receiptRequired: false, receiptMissing: false, level: 'ok', reasons: [], warnings: [] };
  if (p.mode === 'off') return out;

  if (amt > p.inflow.reviewThreshold) {
    out.needsReview = true;
    out.level = 'review';
    out.reasons.push('inflow_over_review');
    out.warnings.push(`🔎 مقبوض كبير ${amt.toLocaleString('ar-EG')} ج — يحتاج مراجعة`);
  }
  if (amt > p.inflow.requireReceiptAbove) {
    out.receiptRequired = true;
    if (!hasReceipt) {
      out.receiptMissing = true;
      out.reasons.push('receipt_required');
      out.warnings.push(`🧾 إيصال/مرجع تحويل إلزامي للمبالغ فوق ${p.inflow.requireReceiptAbove.toLocaleString('ar-EG')} ج`);
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════
// canApproveOutflow — تحقق المُعتمِد (دور + أربع عيون)
// ══════════════════════════════════════════════════════════
/**
 * هل يحق لهذا الفاعل اعتماد/تنفيذ حركة خارجة صعّدتها السياسة؟
 *
 * @param {Object} evalResult — ناتج evaluateOutflow
 * @param {Object} actor      — { role, userId }
 * @param {string} requesterId — منشئ الطلب (للأربع عيون)
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function canApproveOutflow(evalResult, { role, userId } = {}, requesterId = '') {
  if (!evalResult || !evalResult.requiresApproval) return { ok: true, errors: [] };
  const errors = [];
  if (evalResult.requiredApproverRole && role !== evalResult.requiredApproverRole) {
    errors.push(`⛔ هذه الحركة تتجاوز الحدّ — يجب أن يعتمدها (${evalResult.requiredApproverRole})`);
  }
  if (evalResult.fourEyes && userId && requesterId && userId === requesterId) {
    errors.push('⛔ مبدأ الأربع عيون: لا يمكنك اعتماد طلب أنشأته بنفسك — يلزم شخص ثانٍ');
  }
  return { ok: errors.length === 0, errors };
}

export default {
  DEFAULT_FINANCIAL_POLICY,
  resolveFinancialPolicy,
  evaluateOutflow,
  evaluateInflow,
  canApproveOutflow,
};
