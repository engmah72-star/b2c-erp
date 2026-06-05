/**
 * core/messaging-policy.js
 *
 * ━━━ MESSAGING GOVERNANCE — مصدر الحقيقة الواحد للعلاقات والقدرات ━━━
 *
 * يجيب على: «هل يجوز أن يكلّم X الـ Y في سياق Z؟ وبأي نمط/قدرات/رؤية؟»
 * كل مدخل (الكارت · الأوردر · الدعم · الإنبوكس · بوابة المورد) وطبقة الـ actions
 * تستشير `resolve()` — لا منطق علاقات مبعثر. (C2 · L1)
 *
 * ⚠️ طبقة المراسلة فقط — PURE · بلا I/O · بلا Firestore · بلا business state.
 *    هذه الوحدة لا تكتب Order/Payment/Approval ولا تستورد أي وحدة أعمال.
 *    مفروض آلياً عبر tests/architecture-messaging-boundary.test.mjs.
 *    المرجع: docs/MESSAGING_GOVERNANCE_MODEL.md · docs/MESSAGING_VS_BUSINESS_BOUNDARY.md.
 *
 * تصميم E1: إضافي · backward-compatible. أي علاقة/قدرة جديدة = تعديل بيانات هنا.
 */

// ══════════════════════════════════════════
// CONSTANTS (C2 — لا magic strings)
// ══════════════════════════════════════════

/** الأطراف الأربعة (BUSINESS DNA) + النظام الآلي. */
export const PARTIES = Object.freeze({
  EMPLOYEE: 'employee',
  CLIENT: 'client',
  SUPPLIER: 'supplier',
  SYSTEM: 'system',
});

/** أنماط التواصل الأربعة. */
export const MODES = Object.freeze({
  COLLEGIAL: 'collegial',   // موظف↔موظف — دائمة، حرة
  SERVICE: 'service',       // عميل/مورد↔شركة — تذكرة، lifecycle
  PEER: 'peer',             // عميل↔عميل — قبول/حظر (استثناء دستوري)
  BROADCAST: 'broadcast',   // النظام→طرف — بلا ردّ
});

/** أنواع القنوات (تتوافق مع conversation.type الحالي). */
export const CHANNELS = Object.freeze({
  DM: 'dm',
  CHANNEL: 'channel',
  ORDER_THREAD: 'order_thread',
  SUPPORT: 'support',
  PROCUREMENT: 'procurement',
  BROADCAST: 'broadcast',
});

/** دورة الحياة حسب النمط. */
export const LIFECYCLE = Object.freeze({
  STATELESS: 'stateless',   // أرشفة لكل مستخدم فقط
  TICKET: 'ticket',         // open→pending→resolved→closed + SLA
  CONSENT: 'consent',       // بانتظار قبول → نشطة | محظورة
  BROADCAST: 'broadcast',
});

/** أعلام التسييج (متوافقة مع core/feature-flags.js). */
export const POLICY_FLAGS = Object.freeze({
  MEMBER_TO_MEMBER: 'messaging.memberToMember',
});

// ══════════════════════════════════════════
// CAPABILITY BUNDLES (إمكانيات المراسلة — كبيانات)
// ══════════════════════════════════════════
//
// قدرة جديدة تُضاف هنا أولاً، ثم تستهلكها الواجهة (canSend) وتفرضها القواعد.
// المرجع: docs/MESSAGING_GOVERNANCE_MODEL.md §4.

const CAP = (over) => Object.freeze(Object.assign({
  text: false, image: false, file: false, voice: false,
  reply: false, react: false, edit: false, del: false,
  pin: false, forward: false, mention: false,
  orderShare: false, approval: false, internalNote: false,
  readReceipts: false, consent: false,
}, over));

export const CAP_BUNDLES = Object.freeze({
  // زمالة — كل شيء.
  CAP_FULL: CAP({
    text: true, image: true, file: true, voice: true,
    reply: true, react: true, edit: true, del: true,
    pin: true, forward: true, mention: true,
    orderShare: true, internalNote: true, readReceipts: true,
  }),
  // خدمة — غني + اعتماد + ملاحظة داخلية (للطاقم)، بلا pin/forward.
  CAP_SERVICE: CAP({
    text: true, image: true, file: true, voice: true,
    reply: true, react: true, edit: true, del: true,
    mention: true, orderShare: true, approval: true,
    internalNote: true, readReceipts: true,
  }),
  // نِدّي — نص/صورة فقط + قبول/حظر إلزامي، بلا أوردر/اعتماد/ملاحظات.
  CAP_PEER: CAP({
    text: true, image: true,
    reply: true, react: true, edit: true, del: true,
    readReceipts: true, consent: true,
  }),
  // توريد — غني + RFQ، بلا اعتماد، ملاحظة داخلية للطاقم.
  CAP_PROCUREMENT: CAP({
    text: true, image: true, file: true, voice: true,
    reply: true, react: true, edit: true, del: true,
    mention: true, orderShare: true,
    internalNote: true, readReceipts: true,
  }),
});

/** هل قدرة مُفعّلة في حزمة (بالاسم أو الكائن). */
export function hasCap(caps, name) {
  const bundle = typeof caps === 'string' ? CAP_BUNDLES[caps] : caps;
  return !!(bundle && bundle[name]);
}

// ══════════════════════════════════════════
// VISIBILITY (رؤية الحقول الحسّاسة — RULE 8)
// ══════════════════════════════════════════
//
// internalNote: هل lane الملاحظات الداخلية موجود · clientReadsInternal: دائماً false
// cost: 'role' (حسب الدور) | 'never' (لا يُسرّب لطرف خارجي) | 'none'
// phone: 'role' | 'masked' | 'hidden'
// cardRefBeforeConsent: عرض كارت المُرسِل قبل القبول (نِدّي فقط)

const VIS = (over) => Object.freeze(Object.assign({
  internalNote: false, clientReadsInternal: false,
  cost: 'none', phone: 'hidden', cardRefBeforeConsent: false,
}, over));

const VISIBILITY = Object.freeze({
  [MODES.COLLEGIAL]: VIS({ internalNote: true, cost: 'role', phone: 'role' }),
  [MODES.SERVICE]: VIS({ internalNote: true, cost: 'never', phone: 'masked' }),
  [MODES.PEER]: VIS({ internalNote: false, cost: 'none', phone: 'hidden', cardRefBeforeConsent: true }),
  [MODES.BROADCAST]: VIS({}),
});

// ══════════════════════════════════════════
// RELATIONSHIP MATRIX (مَن يكلّم مَن) — الحجر الأساس
// ══════════════════════════════════════════
//
// [from][to] → تعريف الحافة. غياب المفتاح = ممنوع (fail-closed).
// المرجع: docs/MESSAGING_GOVERNANCE_MODEL.md §2.

const E = PARTIES.EMPLOYEE, C = PARTIES.CLIENT, S = PARTIES.SUPPLIER, SY = PARTIES.SYSTEM;

const MATRIX = {
  [E]: {
    [E]: { mode: MODES.COLLEGIAL, caps: 'CAP_FULL' },
    [C]: { mode: MODES.SERVICE, caps: 'CAP_SERVICE' },
    [S]: { mode: MODES.SERVICE, caps: 'CAP_PROCUREMENT', channel: CHANNELS.PROCUREMENT },
  },
  [C]: {
    // العميل لا يفتح DM حرّاً مع موظف — يصل عبر سياق (أوردر/دعم) فقط.
    [E]: { mode: MODES.SERVICE, caps: 'CAP_SERVICE', requiresContext: ['order', 'support'] },
    // عميل↔عميل — استثناء دستوري: flag + سياق + قبول.
    [C]: {
      mode: MODES.PEER, caps: 'CAP_PEER',
      requiresFlag: POLICY_FLAGS.MEMBER_TO_MEMBER,
      requiresContext: ['referral', 'need', 'tenant'],
      requiresConsent: true,
    },
    // عميل↔مورد — ممنوع (لا تماس مباشر بين طرفين خارجيين).
  },
  [S]: {
    [E]: { mode: MODES.SERVICE, caps: 'CAP_PROCUREMENT', channel: CHANNELS.PROCUREMENT, requiresContext: ['procurement'] },
    // مورد↔عميل · مورد↔مورد — ممنوع.
  },
  [SY]: {
    [E]: { mode: MODES.BROADCAST, caps: 'CAP_PROCUREMENT', channel: CHANNELS.BROADCAST },
    [C]: { mode: MODES.BROADCAST, caps: 'CAP_SERVICE', channel: CHANNELS.BROADCAST },
    [S]: { mode: MODES.BROADCAST, caps: 'CAP_PROCUREMENT', channel: CHANNELS.BROADCAST },
  },
};

// قناة افتراضية حسب النمط (لو لم تُحدَّد في الحافة أو السياق).
const DEFAULT_CHANNEL = {
  [MODES.COLLEGIAL]: CHANNELS.DM,
  [MODES.SERVICE]: CHANNELS.SUPPORT,
  [MODES.PEER]: CHANNELS.DM,
  [MODES.BROADCAST]: CHANNELS.BROADCAST,
};

// ربط سياق→قناة (للنمط service/collegial).
const CONTEXT_CHANNEL = {
  order: CHANNELS.ORDER_THREAD,
  support: CHANNELS.SUPPORT,
  procurement: CHANNELS.PROCUREMENT,
  channel: CHANNELS.CHANNEL,
};

// ══════════════════════════════════════════
// RESOLVE — الدالة المركزية
// ══════════════════════════════════════════

/**
 * يحلّ حافة تواصل إلى قرار + ميتاداتا. PURE — لا I/O.
 *
 * الفرض النهائي للأعلام/السياق/القبول مسؤولية الـ caller (لأنها تحتاج حالة
 * runtime: isFeatureEnabled / وجود السياق / قبول المستقبِل). resolve() يُرجع
 * المتطلبات (`requiresFlag`/`requiresContext`/`requiresConsent`) ليطبّقها المدخل.
 *
 * @param {Object} p
 * @param {string} p.from    — PARTIES.*
 * @param {string} p.to      — PARTIES.*
 * @param {Object} [p.context] — { binding?: 'order'|'support'|'referral'|'need'|'tenant'|'procurement'|'channel' }
 * @returns {{
 *   allowed: boolean, reason?: string,
 *   mode?: string, channelType?: string, caps?: string,
 *   visibility?: object, lifecycle?: string,
 *   requiresFlag?: string, requiresContext?: string[], requiresConsent?: boolean,
 *   contextSatisfied?: boolean,
 * }}
 */
export function resolve({ from, to, context = {} } = {}) {
  if (!from || !to) {
    return { allowed: false, reason: 'طرفا التواصل مطلوبان' };
  }
  const edge = MATRIX[from] && MATRIX[from][to];
  if (!edge) {
    return { allowed: false, reason: `علاقة غير مسموحة: ${from} → ${to}` };
  }

  const binding = context.binding || '';
  const requiresContext = edge.requiresContext || null;
  const contextSatisfied = !requiresContext || requiresContext.includes(binding);

  // القناة: من الحافة > من السياق > الافتراضي حسب النمط.
  const channelType = edge.channel
    || CONTEXT_CHANNEL[binding]
    || DEFAULT_CHANNEL[edge.mode];

  const lifecycle =
    edge.mode === MODES.SERVICE ? LIFECYCLE.TICKET :
    edge.mode === MODES.PEER ? LIFECYCLE.CONSENT :
    edge.mode === MODES.BROADCAST ? LIFECYCLE.BROADCAST :
    LIFECYCLE.STATELESS;

  return {
    allowed: true,                 // الحافة مسموحة بنيوياً
    mode: edge.mode,
    channelType,
    caps: edge.caps,
    visibility: VISIBILITY[edge.mode],
    lifecycle,
    requiresFlag: edge.requiresFlag || undefined,
    requiresContext: requiresContext || undefined,
    requiresConsent: edge.requiresConsent || undefined,
    contextSatisfied,
  };
}

export const messagingPolicy = {
  PARTIES, MODES, CHANNELS, LIFECYCLE, POLICY_FLAGS, CAP_BUNDLES, hasCap, resolve,
};

export default messagingPolicy;

// إتاحة عامة للـ console/debug + non-module callers (بلا أثر في Node).
try {
  if (typeof window !== 'undefined') window.__messagingPolicy = messagingPolicy;
} catch (_) { /* non-browser */ }
