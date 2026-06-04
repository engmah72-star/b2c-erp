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

// ── Permissions (أذونات) — Phase-3 ─────────────────────────────────

export const PERMISSION_TYPES = Object.freeze({
  LATE_IN:   'late_in',    // إذن تأخير في الحضور
  EARLY_OUT: 'early_out',  // إذن انصراف مبكر
  MISSION:   'mission',    // مأمورية خارجية
  REMOTE:    'remote',     // عمل عن بُعد
  PARTIAL:   'partial',    // إذن جزئي (مدة محددة)
});

export const PERMISSION_STATUS = Object.freeze({
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

// Types that fully excuse a day's late arrival when approved.
const _FULL_LATE_EXCUSE = new Set(['late_in', 'mission', 'remote']);

/**
 * Minutes of late-arrival excused on `dateStr` by APPROVED permissions only.
 *
 *   late_in / mission / remote → fully excused → Infinity
 *   partial                    → the permission's `minutes` (summed)
 *   early_out                  → ignored (affects departure, not arrival)
 *
 * Pending / rejected permissions never count. Used by the salary calculator
 * to forgive tardiness on days covered by an approved excuse (single source).
 *
 * @param {string} dateStr        — 'YYYY-MM-DD'
 * @param {Array}  [permissions]  — [{ date, type, status, minutes? }]
 * @returns {number} excused minutes (>= 0, or Infinity for a full excuse)
 */
export function excusedLateMinutes(dateStr, permissions = []) {
  let total = 0;
  for (const p of permissions) {
    if (p?.status !== 'approved' || p?.date !== dateStr) continue;
    if (_FULL_LATE_EXCUSE.has(p.type)) return Infinity;
    if (p.type === 'partial') total += parseInt(p.minutes) || 0;
  }
  return total;
}

/**
 * Resolve one employee's attendance status for a single day — the single
 * source the daily board, the calendar and the profile all read from.
 *
 * Priority: a check-in record wins (present/late, with permission-forgiven
 * lateness) → leave → approved full-day permission (mission/remote) → a
 * non-work day (off) → a future work day (upcoming) → otherwise absent.
 *
 * @param {Object} args
 * @param {string}  args.date            — 'YYYY-MM-DD'
 * @param {string}  [args.today]         — 'YYYY-MM-DD' (to mark future days)
 * @param {Object}  [args.record]        — the employee's attendance doc for `date`
 * @param {Array}   [args.leaves]        — employee leaves
 * @param {Array}   [args.permissions]   — employee permissions
 * @param {Object}  [args.workSchedule]  — { days?, startTime? }
 * @returns {{ status, lateMinutes, checkInStr?, checkOutStr? }}
 *          status ∈ present|late|leave|mission|remote|off|upcoming|absent
 */
export function resolveDayStatus({
  date, today = '', record = null,
  leaves = [], permissions = [], workSchedule = null,
}) {
  if (record && record.checkIn) {
    const raw = parseInt(record.lateMinutes) || 0;
    const excused = excusedLateMinutes(date, permissions);
    const late = excused === Infinity ? 0 : Math.max(0, raw - excused);
    return {
      status: late > 0 ? 'late' : 'present',
      lateMinutes: late,
      checkInStr: record.checkInStr || '',
      checkOutStr: record.checkOutStr || '',
    };
  }
  if (isLeaveDayFor(date, leaves)) return { status: 'leave', lateMinutes: 0 };
  const full = permissions.find(p =>
    p && p.status === 'approved' && p.date === date &&
    (p.type === 'mission' || p.type === 'remote'));
  if (full) return { status: full.type, lateMinutes: 0 };
  if (!isWorkDayFor(date, workSchedule)) return { status: 'off', lateMinutes: 0 };
  if (today && date > today) return { status: 'upcoming', lateMinutes: 0 };
  return { status: 'absent', lateMinutes: 0 };
}
