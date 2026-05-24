/**
 * Business2Card ERP — features/employee-profile/views/render-hero.js
 *
 * ━━━ EMPLOYEE PROFILE HERO VIEWS (Phase-2A · god-page decomp) ━━━
 *
 * Pure HTML builders for the profile page header:
 *   - buildHeroHTML        — full hero cover (avatar + name + chips + stats row)
 *   - buildQuickActionsHTML — quick action buttons + overflow menu
 *   - buildCompactHeroHTML  — sticky compact hero (small avatar + score chip)
 *
 * All three are pure: accept data + return string. No DOM, no Firestore.
 * The page is responsible for computing inputs (score, stats, etc.) and
 * stitching the returned strings into main-content.
 */

const defaultFormat = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build the main hero cover block (avatar, name, chips, score ring, stats row).
 *
 * @param {Object} args
 * @param {Object} args.employee     — { name, status, phone, email, startDate, commissionPct }
 * @param {Object} args.roleMeta     — { ico, label, col }
 * @param {Object} args.score        — { value: number, color: string }
 * @param {Object} args.stats        — pre-computed display stats
 *   { presentDays, workDaysStat, attColor, totalIncome, tasksOpen, totalEmpOrders,
 *     monthLabel, annualLeaveRemaining, annualLeaveQuota, annualLeaveCol }
 * @param {Function} [args.format]
 * @returns {string} HTML
 */
export function buildHeroHTML({ employee, roleMeta, score, stats, format = defaultFormat }) {
  const e = employee || {};
  const r = roleMeta || { ico: '👤', label: '—', col: 'var(--dim2)' };
  const sScore = parseFloat(score?.value) || 0;
  const sCol = score?.color || 'var(--dim2)';
  // Score ring: r=32 → C ≈ 201.06
  const RING_C = 201.06;
  const ringDash = (RING_C * sScore / 100).toFixed(1);
  const ringOffset = (RING_C - ringDash).toFixed(1);

  const firstChar = (e.name || '?')[0].toUpperCase();
  const statusInactive = e.status === 'inactive'
    ? ` <span style="font-size:var(--fs-xs);background:rgba(255,61,110,.12);color:var(--r);padding:1px 7px;border-radius:8px;font-weight:var(--fw-bold)">غير نشط</span>`
    : '';
  const chipPhone     = e.phone     ? `<span class="hero-chip">📞 ${escAttr(e.phone)}</span>`        : '';
  const chipEmail     = e.email     ? `<span class="hero-chip">${escAttr(e.email)}</span>`           : '';
  const chipStartDate = e.startDate ? `<span class="hero-chip">📅 ${escAttr(e.startDate)}</span>`    : '';
  const chipCommission = (parseFloat(e.commissionPct) || 0) > 0
    ? `<span class="hero-chip hero-chip-accent">عمولة ${e.commissionPct}%</span>` : '';

  return `
    <!-- Hero Cover -->
    <div class="hero-cover">
      <div class="hero-accent-bar" style="background:${r.col}"></div>
      <div class="hero-body">
        <div class="hero-av" style="background:${r.col}18;color:${r.col};box-shadow:0 0 0 3px var(--bg2),0 0 0 5.5px ${r.col}60">
          ${firstChar}
          <span class="hero-dot ${e.status === 'active' ? 'dot-on' : 'dot-off'}"></span>
        </div>
        <div style="flex:1;min-width:0">
          <div class="hero-name">${escAttr(e.name) || '—'}</div>
          <div class="hero-role-lbl">${r.ico} ${r.label}${statusInactive}</div>
          <div class="hero-chips">${chipPhone}${chipEmail}${chipStartDate}${chipCommission}</div>
        </div>
        <div class="kpi-ring-lg" title="نقاط الأداء" style="cursor:pointer" onclick="setTab('overview');document.getElementById('score-container')?.scrollIntoView({behavior:'smooth',block:'center'})">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle class="ring-bg" cx="40" cy="40" r="32"/>
            <circle class="ring-fg" cx="40" cy="40" r="32" stroke="${sCol}" stroke-dasharray="${RING_C}" stroke-dashoffset="${ringOffset}"/>
          </svg>
          <div class="ring-num" style="color:${sCol}">${sScore}</div>
        </div>
      </div>
      <div class="hero-stats-row">
        <div class="hstat">
          <div class="hstat-val" style="color:${stats.attColor}">${stats.presentDays}<span style="font-size:var(--fs-base);font-weight:var(--fw-medium);color:var(--dim2)">/${stats.workDaysStat}</span></div>
          <div class="hstat-lbl">الحضور</div>
        </div>
        <div class="hstat">
          <div class="hstat-val" style="color:var(--g)">${format(stats.totalIncome)}</div>
          <div class="hstat-lbl">دخل ${stats.monthLabel} ج</div>
        </div>
        <div class="hstat">
          <div class="hstat-val" style="color:var(--y)">${stats.tasksOpen}</div>
          <div class="hstat-lbl">مهام مفتوحة</div>
        </div>
        <div class="hstat">
          <div class="hstat-val" style="color:var(--b)">${stats.totalEmpOrders}</div>
          <div class="hstat-lbl">إجمالي الأوردرات</div>
        </div>
        <div class="hstat" style="border-left:none;border-top:1px solid var(--line)">
          <div class="hstat-val" style="color:${stats.annualLeaveCol}">${stats.annualLeaveRemaining}<span style="font-size:var(--fs-base);font-weight:var(--fw-medium);color:var(--dim2)">/${stats.annualLeaveQuota}</span></div>
          <div class="hstat-lbl">إجازة سنوية</div>
        </div>
      </div>
    </div>`;
}

/**
 * Build the quick-actions bar with overflow menu.
 *
 * @param {Object} args
 * @param {Object} args.employee
 * @param {boolean} [args.allowEmailReset]  — usually = !!email && !email.endsWith('@b2c.local')
 * @returns {string} HTML
 */
export function buildQuickActionsHTML({ employee, allowEmailReset = false }) {
  const e = employee || {};
  const phoneItems = e.phone
    ? `<a href="tel:${escAttr(e.phone)}" onclick="closeQAMenu()">📞 اتصال (${escAttr(e.phone)})</a>
       <a href="https://wa.me/2${escAttr(e.phone.replace(/^0/, ''))}" target="_blank" onclick="closeQAMenu()">💬 واتساب</a>`
    : '';
  const emailReset = allowEmailReset
    ? `<button type="button" onclick="closeQAMenu();sendEmpResetEmail()" style="color:var(--b)">✉️ إرسال رابط بالبريد</button>`
    : '';
  return `
    <!-- Quick actions bar -->
    <div class="quick-actions">
      <button type="button" class="btn btn-g btn-sm qa" onclick="openSalary()" title="صرف مرتب (s)">💰 صرف مرتب</button>
      <button type="button" class="btn btn-b btn-sm qa" onclick="openAddTask()" title="إضافة مهمة (t)">＋ مهمة</button>
      <button type="button" class="btn btn-ghost btn-sm qa" onclick="recordAttendanceToday()">✓ حضور اليوم</button>
      <button type="button" class="btn btn-ghost btn-sm qa" onclick="openEditSalary()" title="تعديل بيانات (e)">✏️ تعديل</button>
      <button type="button" class="btn btn-ghost btn-sm qa" style="flex:0 0 auto;font-size:var(--fs-lg);min-width:42px" onclick="event.stopPropagation();toggleQAMenu()" aria-label="مزيد">⋯</button>
      <div class="act-menu" id="qa-menu" onclick="event.stopPropagation()">
        <button type="button" onclick="closeQAMenu();openAddLeave()">🏖️ إضافة إجازة</button>
        <button type="button" onclick="closeQAMenu();openEditSchedule()">🕐 تعديل جدول العمل</button>
        <button type="button" onclick="closeQAMenu();openEditSkills()">🏷️ تعديل المهارات</button>
        ${phoneItems}
        <div class="act-sep"></div>
        <button type="button" onclick="closeQAMenu();resetEmployeePassword()" style="color:var(--y)">🔑 إعادة تعيين فوري</button>
        ${emailReset}
        <button type="button" onclick="closeQAMenu();confirmDelete()" style="color:var(--r)">🗑 حذف الموظف</button>
      </div>
    </div>`;
}

/**
 * Build the sticky compact hero shown when the main hero scrolls off.
 *
 * @param {Object} args
 * @param {Object} args.employee
 * @param {Object} args.roleMeta
 * @param {Object} args.score   — { value, color }
 * @returns {string} HTML
 */
export function buildCompactHeroHTML({ employee, roleMeta, score }) {
  const e = employee || {};
  const r = roleMeta || { col: 'var(--dim2)', label: '—' };
  const firstChar = (e.name || '?')[0].toUpperCase();
  const sScore = parseFloat(score?.value) || 0;
  const sCol = score?.color || 'var(--dim2)';
  return `
    <!-- Compact sticky hero -->
    <div class="hero-compact" id="hero-compact">
      <div class="av" style="background:${r.col}18;color:${r.col}">${firstChar}</div>
      <div class="nm">${escAttr(e.name) || '—'} <span style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-semi)">· ${r.label}</span></div>
      <div class="sc" style="background:${sCol}1f;color:${sCol}">${sScore}</div>
      <button type="button" class="btn btn-g btn-xs" onclick="openSalary()" style="font-size:var(--fs-sm)">💰</button>
    </div>`;
}
