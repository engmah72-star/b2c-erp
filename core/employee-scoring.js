/**
 * Business2Card ERP — core/employee-scoring.js
 *
 * ━━━ EMPLOYEE PERFORMANCE SCORING (Phase-1A · god-page decomp) ━━━
 *
 * Pure-function scoring extracted from employee-profile.html (L1062–1133).
 * Identical algorithm — no DOM, no Firestore, no globals.
 *
 * Score = Attendance (35) + Productivity (40) + Quality (25) = max 100
 *
 * Used by:
 *   - employee-profile.html  → renderScore() + delta vs previous month
 *   - reports / dashboards   (future)
 *   - tests/core-employee-scoring.test.mjs
 */

// ── helpers (private, pure) ─────────────────────────────────────────

/** Default work week excludes Friday (5) and Saturday (6). */
function isWorkDayFor(dateStr, workSchedule) {
  const days = workSchedule?.days;
  const d = new Date(dateStr).getDay();
  if (!days?.length) return d !== 5 && d !== 6;
  return days.includes(d);
}

function isLeaveDayFor(dateStr, leaves = []) {
  return leaves.some(lv =>
    dateStr >= (lv.startDate || '') &&
    dateStr <= (lv.endDate || lv.startDate || '')
  );
}

// ── public API ──────────────────────────────────────────────────────

/**
 * Compute performance score for a given employee + month.
 *
 * @param {Object} args
 * @param {string} args.mKey                 — 'YYYY-MM'
 * @param {Date}   [args.now=new Date()]     — current date (proration anchor)
 * @param {Object} args.employee             — { role, workSchedule? }
 * @param {Array}  [args.attendance=[]]      — [{ date, lateMinutes? }, ...]
 * @param {Array}  [args.leaves=[]]          — [{ startDate, endDate? }, ...]
 * @param {Array}  [args.monthOrders=[]]     — orders FOR this month, already role-filtered
 * @param {Array}  [args.goals=[]]           — [{ month, targetOrdersMonthly }, ...]
 * @param {Array}  [args.incidents=[]]       — [{ date }, ...]
 *
 * @returns {{score:number, grade:string, col:string, breakdown:object, meta:object}}
 */
export function computeScore({
  mKey,
  now = new Date(),
  employee,
  attendance = [],
  leaves = [],
  monthOrders = [],
  goals = [],
  incidents = [],
}) {
  if (!employee || !mKey) {
    return { score: 0, grade: '—', col: 'var(--dim2)', breakdown: {}, meta: {} };
  }

  const [ys, ms] = mKey.split('-').map(Number);
  const curKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const isCurMonth = mKey === curKey;
  const dim = new Date(ys, ms, 0).getDate();
  const lastDay = isCurMonth ? now.getDate() : dim;

  // ── 1. Attendance (35) ────────────────────────────────────────────
  const attEntries = attendance.filter(a => (a.date || '').startsWith(mKey));
  const present = attEntries.length;
  const lateMins = attEntries.reduce((s, a) => s + (parseInt(a.lateMinutes) || 0), 0);
  let workDays = 0;
  for (let d = 1; d <= lastDay; d++) {
    const ds = mKey + '-' + String(d).padStart(2, '0');
    if (isWorkDayFor(ds, employee.workSchedule) && !isLeaveDayFor(ds, leaves)) workDays++;
  }
  const attPct = workDays > 0 ? Math.min(1, present / workDays) : 0.5;
  const latePenalty = Math.min(7, Math.floor(lateMins / 60));
  const attScore = Math.max(0, Math.round(attPct * 35) - latePenalty);

  // ── 2. Productivity (40) — prorated for current month ─────────────
  const curGoal = goals.find(g => g.month === mKey);
  const total = monthOrders.length;
  const done = monthOrders.filter(o =>
    ['printing', 'production', 'shipping', 'archived'].includes(o.stage)
  ).length;
  let prodPct;
  if (curGoal?.targetOrdersMonthly > 0) {
    const expected = isCurMonth ? curGoal.targetOrdersMonthly * (lastDay / dim) : curGoal.targetOrdersMonthly;
    prodPct = expected > 0 ? Math.min(1, total / expected) : 0.5;
  } else {
    prodPct = total > 0 ? done / total : (isCurMonth && lastDay <= 5 ? 0.65 : 0.5);
  }
  const prodScore = Math.round(prodPct * 40);

  // ── 3. Quality (25) — role-specific + incident penalty ────────────
  let qualPct = 0.8;
  if (employee.role === 'graphic_designer' || employee.role === 'design_operator') {
    const rej = monthOrders.filter(o =>
      o.designStatus === 'rejected' ||
      (o.timeline || []).some(t =>
        (t.action || '').includes('رفض') || (t.action || '').includes('مراجعة')
      )
    ).length;
    qualPct = total > 0 ? Math.max(0, 1 - (rej / total)) : 0.8;
  } else if (employee.role === 'customer_service') {
    const arch = monthOrders.filter(o => o.stage === 'archived').length;
    qualPct = total > 0 ? arch / total : 0.5;
  } else if (employee.role === 'production_agent') {
    const arch = monthOrders.filter(o => ['shipping', 'archived'].includes(o.stage)).length;
    qualPct = total > 0 ? arch / total : 0.5;
  }
  const monthIncidents = incidents.filter(i => (i.date || '').startsWith(mKey));
  const incidentPenalty = Math.min(0.6, monthIncidents.length * 0.05);
  qualPct = Math.max(0, qualPct - incidentPenalty);
  const qualScore = Math.round(qualPct * 25);

  // ── Aggregate ─────────────────────────────────────────────────────
  const score = Math.min(100, attScore + prodScore + qualScore);
  const grade =
    score >= 85 ? 'ممتاز ⭐' :
    score >= 70 ? 'جيد جداً' :
    score >= 50 ? 'متوسط'    : 'يحتاج تطوير';
  const col =
    score >= 85 ? 'var(--g)' :
    score >= 70 ? 'var(--b)' :
    score >= 50 ? 'var(--y)' : 'var(--r)';

  return {
    score, grade, col,
    breakdown: {
      att:  { score: attScore,  pct: Math.round(attPct * 100),  lateMins, latePenalty },
      prod: { score: prodScore, pct: Math.round(prodPct * 100), total, done, prorated: isCurMonth && !!curGoal },
      qual: { score: qualScore, pct: Math.round(qualPct * 100), incidents: monthIncidents.length },
    },
    meta: { workDays, present, lastDay, daysInMonth: dim, isCurMonth },
  };
}
