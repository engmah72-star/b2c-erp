/**
 * Business2Card ERP — clients-constants.js
 *
 * ━━━ STATIC LOOKUP DATA FOR clients.html ━━━
 *
 * God-page decomposition PR-23 (RULE G5 / C2):
 * Centralizes the static maps + arrays the page uses for badges, status
 * tabs, follow-up types, sales-stage cards, etc. All side-effect-only:
 * the module attaches each constant to `window` so the existing in-page
 * code keeps referencing them by their plain identifiers.
 *
 * NOTE: `EGYPT_FALLBACK` is intentionally NOT extracted — it's read at
 * the top of the inline <script> (`let EGYPT = {...EGYPT_FALLBACK}`)
 * before any module loads (modules are deferred).
 */

export const SEG_STYLE = {
  champion:         { bg: 'rgba(255,170,0,.18)',  fg: 'var(--y)'    },
  cant_lose:        { bg: 'rgba(255,61,110,.20)', fg: 'var(--r)'    },
  at_risk:          { bg: 'rgba(255,61,110,.12)', fg: 'var(--r)'    },
  loyal:            { bg: 'rgba(34,211,238,.14)', fg: 'var(--c)'    },
  new:              { bg: 'rgba(0,217,126,.14)',  fg: 'var(--g)'    },
  needs_attention:  { bg: 'rgba(255,170,0,.10)',  fg: 'var(--y)'    },
  about_to_sleep:   { bg: 'rgba(100,100,100,.12)', fg: 'var(--dim2)' },
  lost:             { bg: 'rgba(100,100,100,.10)', fg: 'var(--dim2)' },
  normal:           { bg: 'var(--hover)',         fg: 'var(--dim)'  },
};

export const COLORS = ['var(--r)', 'var(--b)', 'var(--g)', 'var(--y)', 'var(--p)', 'var(--c)'];

export const TAG_LABELS = {
  vip:'⭐ VIP', regular:'🔄 دوري', new:'🆕 جديد', wholesale:'📦 جملة',
  delayed:'⏳ آجل', blocked:'🚫 محظور',
};
export const TAG_COL = {
  vip:'rgba(255,170,0,.2)', regular:'rgba(59,158,255,.2)', new:'rgba(0,217,126,.2)',
  wholesale:'rgba(167,139,250,.2)', delayed:'rgba(255,61,110,.2)', blocked:'rgba(255,61,110,.3)',
};

export const STAGE_AR = {
  design:'✏️ تصميم', printing:'🖨️ طباعة', production:'🏭 تنفيذ',
  shipping:'🚚 شحن', archived:'✅ مكتمل',
};
export const STAGE_COL = {
  design:'var(--p)', printing:'var(--b)', production:'var(--r)',
  shipping:'var(--c)', archived:'var(--g)',
};
export const STAGE_HREF = {
  design:'design', printing:'print', production:'production',
  shipping:'shipping', archived:'archive',
};

export const FU_TYPES = {
  call:'📞 مكالمة', whatsapp:'💬 واتساب', email:'📧 إيميل',
  visit:'🏠 زيارة', note:'📝 ملاحظة', reminder:'⏰ تذكير',
};
export const FU_OUTCOMES = {
  answered:'✅ ردّ', no_answer:'📵 لم يردّ', interested:'🎯 مهتم',
  not_interested:'🚫 غير مهتم', order_placed:'🛒 طلب جديد', follow_later:'⏳ متابعة لاحقاً',
};
export const FU_TYPE_COL = {
  call:'var(--g)', whatsapp:'#25d366', email:'var(--y)',
  visit:'var(--p)', note:'var(--dim2)', reminder:'var(--b)',
};

export const CGRID_STATUS_MAP = {
  'تصميم':         { stage:'design' },
  'طباعة':         { stage:'printing' },
  'تنفيذ':         { stage:'production' },
  'جاهز للشحن':   { stage:'shipping', shipStage:'ready' },
  'في الشحن':      { stage:'shipping', shipStage:'shipped' },
  'تحت التحصيل':  { stage:'shipping', shipStage:'delivered' },
  'تم التحصيل':   { stage:'shipping', shipStage:'delivered', paymentStatus:'paid' },
  'مرتجع جزئي':   { paymentStatus:'returned', returnType:'partial' },
  'مرتجع كامل':   { shipStage:'returned', paymentStatus:'returned' },
  'مشكلة':        { hasProblem:true },
  'أرشيف':        { stage:'archived' },
  'ملغي':         { stage:'cancelled' },
};
export const CGRID_STATUS_BG = {
  'تصميم':'rgba(167,139,250,.15)','طباعة':'rgba(59,158,255,.15)','تنفيذ':'rgba(255,100,50,.15)',
  'جاهز للشحن':'rgba(0,200,220,.12)','في الشحن':'rgba(0,200,220,.15)',
  'تحت التحصيل':'rgba(255,200,0,.15)','تم التحصيل':'rgba(0,200,120,.15)',
  'مرتجع جزئي':'rgba(255,61,110,.12)','مرتجع كامل':'rgba(255,61,110,.2)',
  'مشكلة':'rgba(255,61,110,.25)','أرشيف':'rgba(120,120,140,.15)','ملغي':'rgba(80,80,100,.15)',
};
export const CGRID_STATUS_CLR = {
  'تصميم':'var(--p)','طباعة':'var(--b)','تنفيذ':'var(--o)',
  'جاهز للشحن':'var(--c)','في الشحن':'var(--c)','تحت التحصيل':'var(--y)',
  'تم التحصيل':'var(--g)','مرتجع جزئي':'var(--r)','مرتجع كامل':'var(--r)',
  'مشكلة':'var(--r)','أرشيف':'var(--dim2)','ملغي':'var(--dim)',
};

// ─── SIDE-EFFECT: expose to window for compat (clients.html) ─────────
if (typeof window !== 'undefined') {
  Object.assign(window, {
    SEG_STYLE, COLORS,
    TAG_LABELS, TAG_COL,
    STAGE_AR, STAGE_COL, STAGE_HREF,
    FU_TYPES, FU_OUTCOMES, FU_TYPE_COL,
    CGRID_STATUS_MAP, CGRID_STATUS_BG, CGRID_STATUS_CLR,
  });
}
