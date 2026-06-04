/**
 * Business2Card ERP — core/attendance-core.js
 *
 * ━━━ ATTENDANCE CORE — DAY-STATUS PRIMITIVES (Phase-0 · de-dup) ━━━
 *
 * Single source of truth for the attendance day-status helpers that were
 * previously copy-pasted, byte-identical, across three modules:
 *   - core/employee-salary-calc.js  (absence/tardiness deduction)
 *   - core/employee-scoring.js      (attendance score)
 *   - features/employee-profile/views/render-attendance.js (calendar grid)
 *
 * Pure functions only — no DOM, no Firestore, no globals. Behaviour is
 * intentionally identical to the legacy inline copies (zero behaviour change):
 * this is a refactor that unifies the logic so future attendance work
 * (auto-late, permissions, daily board) builds on one definition (RULE 1).
 */

// ── day-status primitives (private logic, public API) ───────────────

/**
 * Is `dateStr` a scheduled work day for this employee?
 *
 * Default work week excludes Friday (5) and Saturday (6). When the employee
 * has an explicit `workSchedule.days` list, that list is authoritative.
 *
 * @param {string} dateStr        — 'YYYY-MM-DD'
 * @param {Object} [workSchedule] — { days?: number[] } (0=Sun … 6=Sat)
 * @returns {boolean}
 */
export function isWorkDayFor(dateStr, workSchedule) {
  const days = workSchedule?.days;
  const d = new Date(dateStr).getDay();
  if (!days?.length) return d !== 5 && d !== 6;
  return days.includes(d);
}

/**
 * Is `dateStr` covered by any leave in `leaves`?
 *
 * A leave spans [startDate, endDate]; a single-day leave may omit endDate
 * (falls back to startDate). Comparison is lexicographic on 'YYYY-MM-DD',
 * which is correct for zero-padded ISO dates.
 *
 * @param {string} dateStr   — 'YYYY-MM-DD'
 * @param {Array}  [leaves]  — [{ startDate, endDate? }, ...]
 * @returns {boolean}
 */
export function isLeaveDayFor(dateStr, leaves = []) {
  return leaves.some(lv =>
    dateStr >= (lv.startDate || '') &&
    dateStr <= (lv.endDate || lv.startDate || '')
  );
}

/**
 * How many minutes late is a check-in, given the employee's scheduled start?
 *
 * Compares the wall-clock time of `checkInDate` against `expectedStart`
 * ('HH:MM'), minus a grace window. Returns 0 when on-time, when there is no
 * schedule, or when `expectedStart` is unparseable — i.e. it never penalises
 * on missing data. Extracted from the inline copy in employee-profile.html
 * (which baked a 15-minute grace); the grace is now an explicit argument so
 * callers stay in control (RULE 1 — one definition of "late").
 *
 * @param {Date|number|string} checkInDate — actual check-in moment
 * @param {string} [expectedStart]         — scheduled start 'HH:MM'
 * @param {number} [graceMinutes=0]        — tolerated lateness before counting
 * @returns {number} minutes late (>= 0)
 */
export function computeLateMinutes(checkInDate, expectedStart, graceMinutes = 0) {
  if (!expectedStart) return 0;
  const [eh, em] = String(expectedStart).split(':').map(Number);
  if (isNaN(eh)) return 0;
  const expectedMin = eh * 60 + (em || 0);
  const d = checkInDate instanceof Date ? checkInDate : new Date(checkInDate);
  const actualMin = d.getHours() * 60 + d.getMinutes();
  const diff = actualMin - expectedMin - (graceMinutes || 0);
  return Math.max(0, diff);
}
