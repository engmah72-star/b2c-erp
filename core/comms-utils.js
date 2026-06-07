/**
 * Business2Card ERP — core/comms-utils.js
 *
 * ━━━ COMMUNICATION MICRO-HELPERS (RULE C2 · L1.5) ━━━
 *
 * Egyptian phone normalization + WhatsApp/tel link builders. Historically
 * duplicated byte-near-identically across ~10 pages (reports.html,
 * clients-render.js, cs-dashboard.html, card.html, shipping.html,
 * client-hub.html, employees.html, employee-profile views, …).
 * Single Source of Truth — no behavior change. New consumers should import
 * from here instead of re-defining; existing pages migrate incrementally (E1).
 */

/**
 * Normalize an Egyptian phone number to WhatsApp international form (digits
 * only, leading country code 20). Returns '' if it can't be normalized.
 *
 *   00.. → strip the 00
 *   20.. → already international
 *   0..  → replace leading 0 with 20
 *   1XXXXXXXXX (10 digits) → prefix 20
 *   else → return as-is if ≥ 10 digits, otherwise ''
 *
 * @param {string|number} p
 * @returns {string}
 */
export function cleanPhone(p) {
  if (!p) return '';
  let s = String(p).replace(/[^0-9]/g, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('20')) return s;
  if (s.startsWith('0')) return '20' + s.slice(1);
  if (s.length === 10 && s.startsWith('1')) return '20' + s;
  return s.length >= 10 ? s : '';
}

/** WhatsApp deep link for a phone, or '' if not normalizable. */
export function waLink(p) {
  const c = cleanPhone(p);
  return c ? `https://wa.me/${c}` : '';
}

/** `tel:` link for a phone (keeps digits and +), or '' if empty. */
export function telLink(p) {
  return p ? `tel:${String(p).replace(/[^0-9+]/g, '')}` : '';
}
