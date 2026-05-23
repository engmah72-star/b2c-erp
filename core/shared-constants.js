/**
 * Business2Card ERP — core/shared-constants.js
 *
 * ━━━ SHARED UI LOOKUP CONSTANTS (RULE C2 · L1.5) ━━━
 *
 * Cross-page Arabic labels + colors for stage / role / status.
 * Single Source of Truth for the maps that were previously duplicated
 * (identically) across approvals.html, my-requests.html, and
 * supplier-requests.html.
 *
 * NOTE: Pages that have intentional variants (clients-constants.js uses
 * emoji-prefixed labels; inbox.html uses short English admin label;
 * cs-dashboard.html splits 'archived' into 'delivered/archived'; returns.html
 * uses 'مندوب شحن' instead of 'مسؤول شحن') keep their local definitions.
 * Future PRs may converge them once UX impact is reviewed.
 */

/** Arabic plain-text labels for `order.stage`. No emoji prefix. */
export const STAGE_AR = {
  design:    'تصميم',
  printing:  'طباعة',
  production:'تنفيذ',
  shipping:  'شحن',
  archived:  'مؤرشف',
  cancelled: 'ملغي',
};

/** Stage badge colors (CSS values) — used in approvals.html order cards. */
export const STAGE_COL = {
  design:    'var(--p)',
  printing:  'var(--y)',
  production:'var(--r)',
  shipping:  '#3b9eff',
  archived:  '#888',
  cancelled: '#666',
};

/** Full formal Arabic role labels (8 roles). */
export const ROLE_LABELS = {
  admin:             'مدير عام',
  operation_manager: 'مدير تشغيل',
  wallet_manager:    'محاسب',
  customer_service:  'خدمة عملاء',
  graphic_designer:  'مصمم',
  design_operator:   'مشغل تصميم',
  production_agent:  'مندوب تنفيذ',
  shipping_officer:  'مسؤول شحن',
};
