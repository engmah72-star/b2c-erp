// ════════════════════════════════════════════════════════════════════
// core/task-recurrence.js
// Pure helpers for employee task types + recurrence (RULE C2 — constants
// live here, not as magic strings in pages).
//
// نوعان للمهمة:
//   • fixed     — مهمة لمدّة محدّدة (لها موعد إنجاز dueDate وتُغلق عند الإنجاز)
//   • recurring — مهمة دائمة تتكرّر (يومي / أسبوعي / شهري) ولا تُغلق نهائياً؛
//                 تُسجَّل «تمّت لهذه الفترة» ثم تُعاد فتحها تلقائياً للفترة التالية
//
// View-only / pure: no DOM, no Firestore, no globals.
// ════════════════════════════════════════════════════════════════════

export const TASK_TYPES = {
  fixed:     { lbl: 'مهمة لمدّة محدّدة', ico: '📅' },
  recurring: { lbl: 'مهمة دائمة متكرّرة', ico: '🔁' },
};

export const RECURRENCE = {
  daily:   { lbl: 'يومي',  ico: '📆', period: 'هذا اليوم' },
  weekly:  { lbl: 'أسبوعي', ico: '🗓️', period: 'هذا الأسبوع' },
  monthly: { lbl: 'شهري',  ico: '📅', period: 'هذا الشهر' },
};

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * ISO-week number (1-53) for a given date.
 */
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;          // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

/**
 * The period-key identifying the current recurrence bucket. Completing a
 * recurring task stamps this key onto `lastCompletedPeriod`; the task is
 * considered «done for now» only while that stamp matches the live key.
 *
 * @param {string} recurrence  daily | weekly | monthly
 * @param {Date}   [now]
 * @returns {string}
 */
export function currentPeriodKey(recurrence, now = new Date()) {
  switch (recurrence) {
    case 'daily':
      return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    case 'weekly': {
      const { year, week } = isoWeek(now);
      return `${year}-W${pad2(week)}`;
    }
    case 'monthly':
      return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    default:
      return '';
  }
}

/**
 * Is this recurring task currently due (i.e. not yet completed for the
 * live period)? Non-recurring tasks always return false here.
 */
export function isRecurringDue(task, now = new Date()) {
  if (!task || task.taskType !== 'recurring') return false;
  const key = currentPeriodKey(task.recurrence, now);
  return task.lastCompletedPeriod !== key;
}

/**
 * Short human label for a recurring task, e.g. "🔁 يومي".
 */
export function recurrenceLabel(recurrence) {
  const r = RECURRENCE[recurrence];
  return r ? `🔁 ${r.lbl}` : '🔁 متكرّر';
}

/**
 * Validate a recurrence value (used by the action layer).
 */
export function isValidRecurrence(recurrence) {
  return Object.prototype.hasOwnProperty.call(RECURRENCE, recurrence);
}
