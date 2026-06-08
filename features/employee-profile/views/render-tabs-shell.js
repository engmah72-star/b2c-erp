/**
 * Business2Card ERP — features/employee-profile/views/render-tabs-shell.js
 *
 * ━━━ EMPLOYEE PROFILE TABS SHELL VIEW (RULE L1.5) ━━━
 *
 * Pure HTML builder for the tabs navigation + the 5 tab-pane containers
 * on employee-profile.html. Extracted verbatim from renderAll()'s inline
 * template (Phase 2.2 — markup move only, zero behaviour change).
 *
 * IMPORTANT — contract preserved 1:1 with the former inline markup:
 *   • Every element id is unchanged (profile-tabs, tab-overview,
 *     tab-attendance, tab-salaries, tab-tasks, tab-admin, password-card,
 *     score-container, goals-container, skills-products-container,
 *     behavior-container, insights-wrap, schedule-container,
 *     leaves-container, att-title, att-next-btn, att-summary, att-cal,
 *     salaries-container, tasks-count, tasks-container, clients-count,
 *     clients-container, evaluations-container, incidents-count,
 *     incidents-container, permissions-container).
 *   • Every data-tab / data-p / data-act attribute is unchanged, so the
 *     existing delegated listeners on #main-content keep working.
 *   • The 5 tab-pane `style="${active?'':'display:none'}"` runtime toggles
 *     and the per-KPI `style="--kc:${k.col}"` stay inline (RULE U1.6).
 *   • Page-scoped classes (ep-*) are unchanged — defined in
 *     employee-profile.css.
 *
 * The page composes the final markup as:
 *   heroHtml + qaHtml + compactHtml + buildTabsShellHTML({...})
 * exactly as before.
 *
 * @param {object} ctx
 *   - activeTab: 'overview' | 'attendance' | 'salaries' | 'tasks' | 'admin'
 *   - tasksOpen: number — open-tasks badge count
 *   - kpis: Array<{ col:string, val:string|number, lbl:string }>
 *   - profilePeriod: 'today'|'week'|'month_cur'|'month_prev'|'all'
 *   - monthLabel: Arabic month name for the current month
 * @returns {string} HTML
 */
export function buildTabsShellHTML({ activeTab, tasksOpen, kpis, profilePeriod, monthLabel, showTimeline = false }) {
  // البند 2 — تبويب «السجل» الموحّد (خلف العلم؛ زرّ + pane يُحقَنان معاً عند التفعيل)
  const timelineBtn = showTimeline
    ? `<button type="button" class="tab-btn${activeTab==='timeline'?' active':''}" data-tab="timeline">🗓️ السجل</button>`
    : '';
  const timelinePane = showTimeline
    ? `<div class="tab-pane" id="tab-timeline" style="${activeTab==='timeline'?'':'display:none'}">
        <div class="section">
          <div class="section-head ep-mb-12"><div class="section-title">🗓️ السجل الموحّد — ماذا دار بينك وبين الموظف</div></div>
          <div id="timeline-container"></div>
        </div>
      </div>`
    : '';
  return `

    <!-- Tabs nav -->
    <div class="profile-tabs" id="profile-tabs">
      <button type="button" class="tab-btn${activeTab==='overview'?' active':''}" data-tab="overview">📊 نظرة عامة</button>
      <button type="button" class="tab-btn${activeTab==='attendance'?' active':''}" data-tab="attendance">📅 حضور وإجازات</button>
      <button type="button" class="tab-btn${activeTab==='salaries'?' active':''}" data-tab="salaries">💰 المرتبات</button>
      <button type="button" class="tab-btn${activeTab==='tasks'?' active':''}" data-tab="tasks">✅ المهام ${tasksOpen?`<span class="badge-count">${tasksOpen}</span>`:''}</button>
      <button type="button" class="tab-btn${activeTab==='admin'?' active':''}" data-tab="admin">🔐 الإدارة</button>
      ${timelineBtn}
    </div>
    ${timelinePane}

    <!-- TAB: Overview -->
    <div class="tab-pane" id="tab-overview" style="${activeTab==='overview'?'':'display:none'}">
      <!-- Password card -->
      <div id="password-card" class="ep-mb-14"></div>

      <!-- Period filter -->
      <div class="ep-period-row">
        <button type="button" class="prof-pp${profilePeriod==='today'?' active':''}" data-p="today">اليوم</button>
        <button type="button" class="prof-pp${profilePeriod==='week'?' active':''}" data-p="week">الأسبوع</button>
        <button type="button" class="prof-pp${profilePeriod==='month_cur'?' active':''}" data-p="month_cur">الشهر الحالي</button>
        <button type="button" class="prof-pp${profilePeriod==='month_prev'?' active':''}" data-p="month_prev">الشهر الماضي</button>
        <button type="button" class="prof-pp${profilePeriod==='all'?' active':''}" data-p="all">كل الوقت</button>
      </div>

      <!-- Score & KPIs -->
      <div id="score-container" class="ep-mb-14"></div>
      <div class="kpi-row">
        ${kpis.map(k=>`<div class="kpi" style="--kc:${k.col}"><div class="kpi-val">${k.val}</div><div class="kpi-lbl">${k.lbl}</div></div>`).join('')}
      </div>

      <!-- Goals -->
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">🎯 أهداف ${monthLabel}</div>
        </div>
        <div id="goals-container"></div>
      </div>

      <!-- Skills -->
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">🏷️ المهارات والمنتجات</div>
          <button type="button" class="btn btn-ghost btn-xs" data-act="open-edit-skills">✏️ تعديل</button>
        </div>
        <div id="skills-products-container"></div>
      </div>

      <!-- Behavior -->
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">🧠 تحليل السلوك والأداء</div>
        </div>
        <div id="behavior-container"></div>
      </div>

      <!-- Insights -->
      <div id="insights-wrap" class="ep-mb-14"></div>
    </div>

    <!-- TAB: Attendance & Leaves -->
    <div class="tab-pane" id="tab-attendance" style="${activeTab==='attendance'?'':'display:none'}">
      <!-- جدول العمل -->
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">🕐 جدول العمل</div>
          <button type="button" class="btn btn-ghost btn-xs" data-act="open-edit-schedule">✏️ تعديل</button>
        </div>
        <div id="schedule-container"></div>
      </div>
      <!-- الإجازات -->
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">🏖️ الإجازات والغيابات</div>
          <button type="button" class="btn btn-b btn-xs" data-act="open-add-leave">＋ إجازة</button>
        </div>
        <div id="leaves-container"></div>
      </div>
      <!-- الأذونات -->
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">🪪 الأذونات</div>
          <button type="button" class="btn btn-b btn-xs" data-act="open-add-permission">＋ إذن</button>
        </div>
        <div id="perms-container"></div>
      </div>
      <!-- الحضور الشهري -->
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-8">
          <div class="ep-att-actions">
            <button type="button" class="btn btn-ghost btn-xs ep-att-navbtn" data-act="att-prev">←</button>
            <div class="section-title" id="att-title">📅 حضور ${monthLabel}</div>
            <button type="button" class="btn btn-ghost btn-xs ep-att-navbtn" id="att-next-btn" data-act="att-next">→</button>
          </div>
          <div class="ep-att-actions-r">
            <span class="txt-meta-sm" id="att-summary">جاري...</span>
            <button type="button" class="btn btn-b btn-xs" data-act="record-attendance">✓ حضور</button>
            <button type="button" class="btn btn-xs ep-btn-checkout" data-act="record-checkout">← انصراف</button>
          </div>
        </div>
        <div class="att-cal" id="att-cal"></div>
        <div class="ep-att-legend">
          <span><span class="ep-att-dot present"></span>حضر</span>
          <span><span class="ep-att-dot absent"></span>غياب</span>
          <span><span class="ep-att-dot leave"></span>إجازة</span>
          <span><span class="ep-att-dot off"></span>عطلة</span>
        </div>
      </div>
    </div>

    <!-- TAB: Salaries -->
    <div class="tab-pane" id="tab-salaries" style="${activeTab==='salaries'?'':'display:none'}">
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">💰 سجل المرتبات</div>
          <button type="button" class="btn btn-g btn-xs" data-act="open-salary">💰 صرف مرتب</button>
        </div>
        <div id="salaries-container"></div>
      </div>
    </div>

    <!-- TAB: Tasks -->
    <div class="tab-pane" id="tab-tasks" style="${activeTab==='tasks'?'':'display:none'}">
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">✅ المهام (<span id="tasks-count">0</span>)</div>
          <button type="button" class="btn btn-b btn-xs" data-act="open-add-task">＋ مهمة</button>
        </div>
        <div id="tasks-container"></div>
      </div>
    </div>

    <!-- TAB: Admin (Clients + Permissions + Evaluations) -->
    <div class="tab-pane" id="tab-admin" style="${activeTab==='admin'?'':'display:none'}">
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">👤 العملاء المرتبطون <span id="clients-count" class="ep-clients-count"></span></div>
          <span class="ep-admin-lock">🔒 إدارة فقط</span>
        </div>
        <div id="clients-container"></div>
      </div>
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">📋 تاريخ التقييمات</div>
        </div>
        <div id="evaluations-container"></div>
      </div>
      <!-- Incidents -->
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">⚠️ الإخفاقات والملاحظات (<span id="incidents-count">0</span>)</div>
          <button type="button" class="btn btn-r btn-xs" data-act="open-add-incident">＋ تسجيل إخفاق</button>
        </div>
        <div id="incidents-container"></div>
      </div>
      <div class="section ep-mb-14">
        <div class="section-head ep-mb-12">
          <div class="section-title">🔐 الصلاحيات</div>
          <button type="button" class="btn btn-b btn-xs" data-act="save-permissions">💾 حفظ</button>
          <button type="button" class="btn btn-ghost btn-xs ep-btn-clearperms" data-act="clear-permissions">🗑 مسح الصلاحيات</button>
        </div>
        <div id="permissions-container"></div>
      </div>
      <!-- Keyboard shortcuts hint -->
      <div class="ep-kbd-hint">
        <strong class="text-snow">⌨️ اختصارات:</strong>
        <span class="kbd">s</span> صرف مرتب ·
        <span class="kbd">t</span> مهمة جديدة ·
        <span class="kbd">e</span> تعديل بيانات ·
        <span class="kbd">1-5</span> تنقّل بين التابات ·
        <span class="kbd">Esc</span> إغلاق
      </div>
    </div>`;
}
