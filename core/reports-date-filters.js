/**
 * Business2Card ERP — core/reports-date-filters.js
 *
 * ━━━ REPORTS DATE FILTERS (Phase-1A · reports god-page decomp) ━━━
 *
 * Pure date range builders + predicate.
 *
 * Modes:
 *   'today'    — today 00:00 → 23:59:59
 *   'week'     — Monday-based week (Sun→Sat aligned to ISO Mon=0)
 *   'month'    — current calendar month
 *   'last3'    — last 3 months back from 1st of (current-3)
 *   'year'     — current calendar year
 *   'custom'   — explicit from/to ISO date strings (caller supplies)
 *   (default)  — current month
 */

/**
 * @param {string} mode
 * @param {Object} [args]
 * @param {Date}   [args.now=new Date()]   — anchor for relative ranges
 * @param {string} [args.customFrom='']    — 'YYYY-MM-DD'
 * @param {string} [args.customTo='']      — 'YYYY-MM-DD'
 * @returns {{from: Date, to: Date}}
 */
export function getRange(mode, { now = new Date(), customFrom = '', customTo = '' } = {}) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (mode === 'today')  return { from: new Date(y, m, d), to: new Date(y, m, d, 23, 59, 59) };
  if (mode === 'week') {
    const dow = now.getDay();                          // 0=Sun..6=Sat
    const mon = new Date(y, m, d - ((dow + 6) % 7));   // Monday of this week
    return { from: mon, to: new Date(mon.getTime() + 6 * 86400000 + 86399999) };
  }
  if (mode === 'month')  return { from: new Date(y, m, 1),     to: new Date(y, m + 1, 0, 23, 59, 59) };
  if (mode === 'last3')  return { from: new Date(y, m - 3, 1), to: new Date(y, m + 1, 0, 23, 59, 59) };
  if (mode === 'year')   return { from: new Date(y, 0, 1),     to: new Date(y, 11, 31, 23, 59, 59) };
  if (mode === 'custom' && customFrom && customTo) {
    return { from: new Date(customFrom), to: new Date(customTo + 'T23:59:59') };
  }
  // default
  return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59) };
}

/**
 * Previous-period equivalent of `getRange(mode)`.
 *  - month → previous calendar month
 *  - year  → previous calendar year
 *  - else  → mirror the current range backward (same length)
 *
 * @returns {{from: Date, to: Date}}
 */
export function getPrevRange(mode, { now = new Date(), customFrom = '', customTo = '' } = {}) {
  const y = now.getFullYear(), m = now.getMonth();
  if (mode === 'month') return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59) };
  if (mode === 'year')  return { from: new Date(y - 1, 0, 1), to: new Date(y - 1, 11, 31, 23, 59, 59) };
  const r = getRange(mode, { now, customFrom, customTo });
  const diff = r.to - r.from;
  return { from: new Date(r.from - diff), to: new Date(r.from - 1) };
}

/**
 * Predicate: does a Firestore document fall within the date range?
 * Uses `doc.createdAt.seconds` (compat with both Firestore Timestamp shapes).
 *
 * @param {Object} doc        — { createdAt?: { seconds?: number } }
 * @param {{from: Date, to: Date}} range
 * @returns {boolean}
 */
export function inRange(doc, range) {
  const sec = doc?.createdAt?.seconds || 0;
  if (!sec || !range) return false;
  const d = new Date(sec * 1000);
  return d >= range.from && d <= range.to;
}
