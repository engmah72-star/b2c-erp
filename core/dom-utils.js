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

/** Set element textContent by id; no-op if missing. */
export const setText = (id, v) => {
  const e = document.getElementById(id);
  if (e) e.textContent = v;
};

/** Get element value by id; empty string if missing. */
export const gv = (id) => document.getElementById(id)?.value || '';

/**
 * Days a deadline is in the past (vs. now). 0 if deadline is in the
 * future, missing, or unparseable.
 */
export const delayDays = (dl) => {
  if (!dl) return 0;
  const d = new Date(dl), n = new Date();
  return d < n ? Math.floor((n - d) / 864e5) : 0;
};
