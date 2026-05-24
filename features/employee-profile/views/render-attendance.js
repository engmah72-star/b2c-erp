/**
 * Business2Card ERP — features/employee-profile/views/render-attendance.js
 *
 * ━━━ ATTENDANCE / SCHEDULE / LEAVES VIEWS (Phase-2B · god-page decomp) ━━━
 *
 * Pure HTML builders for the attendance tab:
 *   - buildAttendanceCalendarHTML  → calendar grid + month meta
 *   - buildScheduleHTML            → work-schedule pills + times
 *   - buildLeavesListHTML          → upcoming/past leaves list (or empty CTA)
 *
 * Plus shared constants (`DAY_NAMES_AR`, `LEAVE_TYPES`) re-exported for the
 * edit-modal pills in the page.
 */

export const DAY_NAMES_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

export const LEAVE_TYPES = {
  annual:    { lbl: 'إجازة سنوية',     cls: 'lv-annual',    ico: '🌴' },
  sick:      { lbl: 'إجازة مرضية',     cls: 'lv-sick',      ico: '🏥' },
  emergency: { lbl: 'إجازة طارئة',     cls: 'lv-emergency', ico: '⚡' },
  official:  { lbl: 'إجازة رسمية',     cls: 'lv-official',  ico: '📋' },
  unpaid:    { lbl: 'غياب بدون راتب',  cls: 'lv-unpaid',    ico: '⚠️' },
};

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

/**
 * Build the monthly attendance calendar grid.
 *
 * @param {Object} args
 * @param {string} args.monthKey       — 'YYYY-MM' for the viewed month
 * @param {string} args.currentMonthKey — 'YYYY-MM' for "now" (used for next-btn disable)
 * @param {Array}  args.attendance     — [{ date, lateMinutes?, checkInStr?, checkOutStr? }]
 * @param {Array}  args.leaves         — [{ startDate, endDate?, reason? }]
 * @param {Object} [args.workSchedule] — { days? }
 * @param {string} args.today          — 'YYYY-MM-DD' (todayStr)
 *
 * @returns {{ html: string, presentDays: number, workDays: number,
 *             monthTitle: string, isCurrentMonth: boolean }}
 */
export function buildAttendanceCalendarHTML({
  monthKey, currentMonthKey,
  attendance = [], leaves = [],
  workSchedule, today,
}) {
  const [vy, vm2] = monthKey.split('-').map(Number);
  const isCurrentMonth = monthKey === currentMonthKey;
  const daysInMonth = new Date(vy, vm2, 0).getDate();
  const firstDay = new Date(vy, vm2 - 1, 1).getDay();
  const presentDays = attendance.filter(a => a.date?.startsWith(monthKey)).length;

  let workDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = monthKey + '-' + String(d).padStart(2, '0');
    if (isWorkDayFor(ds, workSchedule) && !isLeaveDayFor(ds, leaves) && ds <= today) workDays++;
  }

  let html = '';
  for (let i = 0; i < firstDay; i++) html += '<div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = monthKey + '-' + String(d).padStart(2, '0');
    const att = attendance.find(a => a.date === dateStr);
    const isOff = !isWorkDayFor(dateStr, workSchedule);
    const isLeave = isLeaveDayFor(dateStr, leaves);
    const isTodayDay = dateStr === today;
    const isFuture = dateStr > today;
    const lv = isLeave ? leaves.find(lv => dateStr >= (lv.startDate || '') && dateStr <= (lv.endDate || lv.startDate || '')) : null;
    let cls = 'att-day ';
    if (att) cls += 'present';
    else if (isLeave) cls += 'leave';
    else if (isOff || isFuture) cls += 'off';
    else cls += 'absent';
    const lateBadge = att && (parseInt(att.lateMinutes) || 0) > 0 ? '⏰' : '';
    const tip = att
      ? `${dateStr}\n${att.checkInStr || ''}${att.checkOutStr ? ' → ' + att.checkOutStr : ''}${att.lateMinutes ? '\nمتأخر ' + att.lateMinutes + 'د' : ''}`
      : isLeave ? `${dateStr}\nإجازة${lv?.reason ? ' — ' + lv.reason : ''}` : `${dateStr}`;
    html += `<div class="${cls}${isTodayDay ? ' today' : ''}" title="${escAttr(tip)}" style="position:relative">${d}${lateBadge ? `<span style="position:absolute;top:0;left:1px;font-size:var(--fs-tiny);line-height:1">${lateBadge}</span>` : ''}</div>`;
  }

  return {
    html, presentDays, workDays,
    monthTitle: `📅 حضور ${MONTHS[vm2 - 1]} ${vy}`,
    isCurrentMonth,
  };
}

/**
 * Build the work-schedule display block.
 *
 * @param {Object} args
 * @param {Object} [args.workSchedule] — { days?, startTime?, endTime? }
 * @returns {string} HTML
 */
export function buildScheduleHTML({ workSchedule }) {
  const ws = workSchedule || { days: [0, 1, 2, 3, 4], startTime: '09:00', endTime: '17:00' };
  const days = ws.days || [0, 1, 2, 3, 4];
  return `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      ${[0,1,2,3,4,5,6].map(d => `<span class="day-pill${days.includes(d) ? ' on' : ''}">${DAY_NAMES_AR[d]}</span>`).join('')}
    </div>
    <div style="display:flex;gap:20px;font-size:var(--fs-base);color:var(--dim2)">
      <span>⏰ بدء: <strong style="color:var(--snow)">${escAttr(ws.startTime) || '09:00'}</strong></span>
      <span>🏁 نهاية: <strong style="color:var(--snow)">${escAttr(ws.endTime) || '17:00'}</strong></span>
      <span>📅 <strong style="color:var(--b)">${days.length} أيام/أسبوع</strong></span>
    </div>`;
}

/**
 * Build the upcoming/past leaves list (or empty CTA).
 *
 * @param {Object} args
 * @param {Array}  args.leaves  — [{ _id, type, startDate, endDate, days, reason? }]
 * @param {string} args.todayIso — 'YYYY-MM-DD'
 * @returns {string} HTML
 */
export function buildLeavesListHTML({ leaves = [], todayIso }) {
  if (!leaves.length) {
    return `<div class="empty-cta">
    <div class="empty-icon">🏖️</div>
    <div class="empty-text">لا توجد إجازات مسجّلة</div>
    <button class="btn btn-b btn-sm" onclick="openAddLeave()">＋ تسجيل إجازة</button>
  </div>`;
  }
  const upcoming = leaves.filter(lv => lv.endDate >= todayIso || lv.startDate >= todayIso);
  const past = leaves.filter(lv => lv.endDate < todayIso && lv.startDate < todayIso);

  const renderRows = (arr) => arr.map(lv => {
    const t = LEAVE_TYPES[lv.type] || LEAVE_TYPES.annual;
    const isCur = lv.startDate <= todayIso && lv.endDate >= todayIso;
    return `<div class="leave-row"${isCur ? ' style="border-right:3px solid var(--y)"' : ''}>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
          <span class="lv-badge ${t.cls}">${t.ico} ${t.lbl}</span>
          ${isCur ? '<span style="font-size:var(--fs-tiny);background:rgba(255,170,0,.15);color:var(--y);padding:1px 6px;border-radius:8px;font-weight:var(--fw-bold)">جارية الآن</span>' : ''}
          ${lv.reason ? `<span style="font-size:var(--fs-sm);color:var(--dim2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escAttr(lv.reason)}</span>` : ''}
        </div>
        <div style="font-size:var(--fs-sm);color:var(--dim2)">${lv.startDate}${lv.endDate !== lv.startDate ? ' → ' + lv.endDate : ''} · <strong>${lv.days} يوم</strong></div>
      </div>
      <button onclick="deleteLeave('${escAttr(lv._id)}')" style="background:none;border:none;color:var(--r);cursor:pointer;font-size:15px;padding:4px 8px;opacity:.55;transition:.15s" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.55">✕</button>
    </div>`;
  }).join('');

  let html = '';
  if (upcoming.length) html += renderRows(upcoming);
  if (past.length) {
    html += `<div style="font-size:var(--fs-xs);font-weight:var(--fw-bold);color:var(--dim2);margin:8px 0 5px;text-transform:uppercase;letter-spacing:.5px">السابقة</div>` + renderRows(past);
  }
  return html;
}
