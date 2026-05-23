/**
 * Business2Card ERP — core/reports-timeseries.js
 *
 * ━━━ DAILY SERIES + SPARKLINE HELPERS (Phase-1A · reports god-page decomp) ━━━
 *
 * Pure time-series aggregator + sparkline HTML builder.
 *   - dailySeries(items, days, filterFn, valueFn, now?) → number[]
 *   - sparklineHTML(values, color?)                     → HTML string
 */

/**
 * Aggregate items into N daily buckets (oldest first → newest last).
 * Item-day index = floor((now23:59 - item.createdAt) / 86400000).
 *
 * @param {Object} args
 * @param {Array}    args.items        — array with .createdAt.seconds (Firestore Timestamp)
 * @param {number}   args.days         — bucket count
 * @param {Function} args.filterFn     — (item) => boolean
 * @param {Function} args.valueFn      — (item) => number (added to bucket)
 * @param {Date}     [args.now=new Date()]
 *
 * @returns {number[]} array of length `days` (index 0 = oldest, days-1 = today)
 */
export function dailySeries({ items = [], days = 7, filterFn = () => true, valueFn = () => 1, now = new Date() }) {
  const buckets = new Array(days).fill(0);
  const endAnchor = new Date(now);
  endAnchor.setHours(23, 59, 59, 999);
  const end = endAnchor.getTime();
  for (const t of items) {
    if (!filterFn(t)) continue;
    const sec = t?.createdAt?.seconds || 0;
    if (!sec) continue;
    const ms = sec * 1000;
    const ageDays = Math.floor((end - ms) / 86400000);
    if (ageDays < 0 || ageDays >= days) continue;
    buckets[days - 1 - ageDays] += valueFn(t);
  }
  return buckets;
}

/**
 * Build a `<div class="sparkline">` with normalized bar heights.
 * Empty/falsy input → empty string.
 *
 * @param {number[]} values
 * @param {string} [color='var(--r)']
 * @returns {string} HTML
 */
export function sparklineHTML(values, color = 'var(--r)') {
  if (!values || !values.length) return '';
  const max = Math.max(...values, 1);
  const bars = values.map(v =>
    `<span style="height:${Math.max(2, (v / max) * 100)}%;background:${color}"></span>`
  ).join('');
  return `<div class="sparkline">${bars}</div>`;
}
