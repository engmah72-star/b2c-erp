/**
 * Business2Card ERP — core/dom-utils.js
 *
 * ━━━ DOM MICRO-HELPERS (RULE C2 · L1.5) ━━━
 *
 * Tiny, byte-identical helpers historically duplicated across ~15 pages.
 * Single Source of Truth — no behavior change.
 *
 * Variants NOT covered (kept page-local):
 *   - Pages using `$()` shorthand (waybill, shipping-followup, ledger)
 *   - `sv` (set-value) has 3 incompatible variants (v, v||'', v??'') —
 *      different null/zero handling, unsafe to converge automatically.
 *   - `setText` impl using `el` instead of `e`, or named `set` (cs-dashboard)
 *      — semantically equal but byte-different, left for a future sweep.
 */

/** HTML-escape a string (prevents XSS in innerHTML assignments). */
const _escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => s == null ? '' : String(s).replace(/[&<>"']/g, c => _escMap[c]);
export { esc as escHtml, esc as escapeHtml };

/** Escape for use inside HTML attribute values. */
export const escAttr = (s) => s == null ? '' : String(s).replace(/[&<>"']/g, c => _escMap[c]);

/** Set element textContent by id; no-op if missing. */
export const setText = (id, v) => {
  const e = document.getElementById(id);
  if (e) e.textContent = v;
};

/** Get element value by id; empty string if missing. */
export const gv = (id) => document.getElementById(id)?.value || '';

/**
 * Format a number as Arabic-Egyptian locale digits (thousands separators).
 * Non-numeric → 0. Single Source of Truth for the `(parseFloat||0)
 * .toLocaleString('ar-EG')` idiom duplicated across reports/approvals/kpis.
 */
const _nf = new Intl.NumberFormat('ar-EG');
export const fmtNum = (n) => _nf.format(parseFloat(n) || 0);

const _df = new Intl.DateTimeFormat('ar-EG');
const _tf = new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (d) => _df.format(d instanceof Date ? d : new Date(d));
export const fmtTime = (d) => _tf.format(d instanceof Date ? d : new Date(d));
export const fmtNow = () => _df.format(new Date()) + ' ' + _tf.format(new Date());

export function partition(arr, pred) {
  const yes = [], no = [];
  for (const x of arr) (pred(x) ? yes : no).push(x);
  return [yes, no];
}

/**
 * Days a deadline is in the past (vs. now). 0 if deadline is in the
 * future, missing, or unparseable.
 */
export const delayDays = (dl) => {
  if (!dl) return 0;
  const d = new Date(dl), n = new Date();
  return d < n ? Math.floor((n - d) / 864e5) : 0;
};
