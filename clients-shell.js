/**
 * Business2Card ERP — clients-shell.js
 *
 * ━━━ MAIN BODY MARKUP FOR clients.html ━━━
 *
 * God-page decomposition PR-18 (RULE G5):
 * The page chrome (topbar + KPI stats + filters + tabs + grid container)
 * previously inlined in clients.html (~233 lines of markup) now lives
 * here. The module exposes a single side-effect: on evaluation it
 * populates <div class="main"> with the template HTML.
 *
 * Companion module pattern (after PR-17):
 *   clients-render.js   — HTML builders (per-card / per-row / panel body)
 *   clients-data.js     — pure computations + filters
 *   clients-modals.js   — modal markup (5 overlays)
 *   clients-shell.js    — main body chrome (THIS FILE)
 *   clients.css         — styles
 *
 * Timing:
 *   - Module scripts are deferred → execute after DOM parse + before
 *     DOMContentLoaded fires.
 *   - All inline handlers reference grid/kpi/tabs by id (getElementById)
 *     and only fire after auth resolves async — IDs are in DOM in time.
 */

export const CLIENTS_SHELL_HTML = `
  <div class="topbar">
    <div class="topbar-left">
      <button type="button" class="mob-menu-btn" onclick="toggleNav()">☰</button>
      <div><h1>👤 العملاء</h1><p id="sub">جاري التحميل...</p></div>
    </div>
    <div class="topbar-right">
      <button type="button" class="btn btn-ghost btn-sm" onclick="exportCSV()">↓ CSV</button>
      <div style="display:flex;gap:var(--space-xs);background:var(--bg3);border-radius:var(--rad);padding:3px">
        <button type="button" id="view-grid" class="btn btn-ghost btn-sm on-view" onclick="setView('grid')" title="كروت" style="padding:6px 10px">⊞</button>
        <button type="button" id="view-list" class="btn btn-ghost btn-sm" onclick="setView('list')" title="قائمة" style="padding:6px 10px">≡</button>
      </div>
      <button type="button" class="btn btn-b" onclick="openAddClient()">＋ عميل جديد</button>
    </div>
  </div>

  <div class="content">
    <!-- HERO STATS (المبيعات + الباقي) -->
    <div class="hs-grid">
      <div class="hs-card sales" onclick="window.showStatsDrawer('sales')">
        <div class="hs-lbl">💰 المبيعات</div>
        <div class="hs-val sales" id="s-sales">—</div>
        <div class="hs-sub">اضغط للتفاصيل ›</div>
      </div>
      <div class="hs-card rem" onclick="window.showStatsDrawer('rem')">
        <div class="hs-lbl">💳 باقي التحصيل</div>
        <div class="hs-val rem" id="s-rem">—</div>
        <div class="hs-sub">اضغط للتفاصيل ›</div>
      </div>
    </div>

    <!-- TIME PERIOD STRIP — اليوم · أمس · الأسبوع · الشهر · الشهر السابق -->
    <div class="tp-strip" id="tp-strip">
      <div class="tp-tile" data-period="today" style="--tpc:#3b82f6" onclick="setPeriodFilter('today',this)">
        <div class="tp-lbl">📅 اليوم</div>
        <div class="tp-num" id="tp-today-n">—</div>
        <div class="tp-rev" id="tp-today-r">— ج</div>
      </div>
      <div class="tp-tile" data-period="yesterday" style="--tpc:#06b6d4" onclick="setPeriodFilter('yesterday',this)">
        <div class="tp-lbl">⌛ أمس</div>
        <div class="tp-num" id="tp-yest-n">—</div>
        <div class="tp-rev" id="tp-yest-r">— ج</div>
      </div>
      <div class="tp-tile" data-period="week" style="--tpc:var(--o-purple)" onclick="setPeriodFilter('week',this)">
        <div class="tp-lbl">🗓 الأسبوع</div>
        <div class="tp-num" id="tp-week-n">—</div>
        <div class="tp-rev" id="tp-week-r">— ج</div>
      </div>
      <div class="tp-tile" data-period="month" style="--tpc:#10d27e" onclick="setPeriodFilter('month',this)">
        <div class="tp-lbl">📊 الشهر الحالي</div>
        <div class="tp-num" id="tp-month-n">—</div>
        <div class="tp-rev" id="tp-month-r">— ج</div>
      </div>
      <div class="tp-tile" data-period="lastmonth" style="--tpc:var(--y-amber)" onclick="setPeriodFilter('lastmonth',this)">
        <div class="tp-lbl">📆 الشهر السابق</div>
        <div class="tp-num" id="tp-lm-n">—</div>
        <div class="tp-rev" id="tp-lm-r">— ج</div>
        <div class="tp-comp" id="tp-lm-c"></div>
      </div>
    </div>

    <!-- Quick Status Chips — حالة العملاء -->
    <div class="chip-row">
      <span style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:var(--dim2);letter-spacing:.5px;margin-left:4px">عرض:</span>
      <button type="button" class="f-chip on" onclick="setQuickFilter('all',this)">
        <span>👥</span><span>الكل</span><span id="qf-all-n" style="color:var(--snow-soft)"></span>
      </button>
      <button type="button" class="f-chip" onclick="setQuickFilter('vip',this)">
        <span>⭐</span><span>VIP</span><span id="qf-vip-n" style="color:var(--snow-soft)"></span>
      </button>
      <button type="button" class="f-chip" onclick="setQuickFilter('active',this)">
        <span style="color:var(--g)">●</span><span>نشط</span><span id="qf-active-n" style="color:var(--snow-soft)"></span>
      </button>
      <button type="button" class="f-chip" onclick="setQuickFilter('rem',this)">
        <span>💰</span><span>عليه فلوس</span><span id="qf-rem-n" style="color:var(--snow-soft)"></span>
      </button>
      <button type="button" class="f-chip" onclick="setQuickFilter('atrisk',this)">
        <span>⚠️</span><span>محتاج اهتمام</span><span id="qf-risk-n" style="color:var(--snow-soft)"></span>
      </button>
      <button type="button" class="f-chip" onclick="setQuickFilter('new',this)">
        <span>🌱</span><span>جديد</span><span id="qf-new-n" style="color:var(--snow-soft)"></span>
      </button>
      <button type="button" class="f-chip" onclick="setQuickFilter('sleeping',this)">
        <span>😴</span><span>نايم</span><span id="qf-sleep-n" style="color:var(--snow-soft)"></span>
      </button>
    </div>

    <!-- UNIFIED FILTER BAR -->
    <div id="filter-bar" style="display:flex;gap:var(--space-sm);margin-bottom:14px;flex-wrap:wrap;align-items:center">
      <div class="sw" style="flex:1;min-width:180px"><span class="sw-ico">🔍</span><input class="inp" id="q" placeholder="بحث بالاسم أو الهاتف..." oninput="scheduleStatsAndGrid()"></div>
      <div style="display:flex;gap:3px;flex-shrink:0">
        <button type="button" class="stab on" id="stab-active" onclick="setStatusTab('active',this)">🟢 نشط</button>
        <button type="button" class="stab stab-legacy" id="stab-legacy" onclick="setStatusTab('legacy',this)">📁 قديم</button>
        <button type="button" class="stab hide" id="stab-cgrid" onclick="setStatusTab('cgrid',this)">📊 متابعة</button>
      </div>
      <select class="inp" id="flt-select" onchange="window.setClientFilter(this.value)" style="max-width:130px">
        <option value="all">📋 الكل</option>
        <option value="today">📅 اليوم</option>
        <option value="rem">💰 متبقي</option>
        <option value="active">🔄 نشط</option>
        <option value="inactive">😴 غير نشط</option>
        <option value="vip">⭐ VIP</option>
      </select>
      <select class="inp" id="f-tag" onchange="renderGrid()" style="max-width:130px"><option value="">كل التصنيفات</option><option value="vip">⭐ VIP</option><option value="regular">🔄 دوري</option><option value="new">🆕 جديد</option><option value="wholesale">📦 جملة</option><option value="delayed">⏳ آجل</option></select>
      <select class="inp" id="f-segment" onchange="renderGrid()" title="فلتر حسب شريحة RFM" style="max-width:140px">
        <option value="">كل الشرائح (RFM)</option>
        <option value="champion">🏆 أبطال</option>
        <option value="loyal">💎 عملاء أوفياء</option>
        <option value="new">🌱 جدد/واعدين</option>
        <option value="needs_attention">👀 يحتاج اهتمام</option>
        <option value="at_risk">⚠️ مهدّدون بالفقد</option>
        <option value="cant_lose">🚨 لا يجب فقدهم</option>
        <option value="about_to_sleep">😴 على وشك الفقد</option>
        <option value="lost">💤 فُقدوا</option>
      </select>
      <select class="inp" id="f-gov" onchange="renderGrid()" style="max-width:130px"><option value="">كل المحافظات</option></select>
      <select class="inp hide" id="f-src" onchange="renderGrid()"><option value="">كل المصادر</option></select>
      <button type="button" class="btn btn-ghost btn-sm hide" id="add-legacy-btn" onclick="openAddLegacy()">＋ عميل قديم</button>
      <button type="button" class="btn btn-ghost btn-sm hide" id="dup-scan-btn" onclick="openDupScan()" title="رصد العملاء اللي عندهم نفس رقم التليفون">🔁 مكررات</button>
      <button type="button" id="filter-active-pill" onclick="clearAllFilters()" title="مسح الفلتر">🔵 فلتر نشط <span id="filter-active-count"></span> ✕</button>
    </div>

    <!-- OCCASIONS BANNER (🎂/🏢 — auto-shown when there are today's/upcoming occasions) -->
    <div id="occasions-banner" style="display:none;margin-bottom:14px"></div>

    <!-- SEGMENT STRIP (RFM distribution — clickable filters) -->
    <div id="segment-strip" style="display:none;margin-bottom:14px"></div>

    <!-- GRID -->
    <div id="clients-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-md)">
      <div class="loader"><div class="spinner"></div></div>
    </div>

    <!-- ═══ CLIENT CONTROL GRID (ADMIN ONLY) ═══ -->
    <div id="cgrid-section" class="hide">

      <!-- Preset Quick Filters -->
      <div class="cg-preset-bar">
        <span style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:var(--dim2);white-space:nowrap">جرد:</span>
        <button type="button" class="cg-preset active" id="cgp-all"      onclick="cgridPreset('all',this)">📋 الكل</button>
        <button type="button" class="cg-preset" id="cgp-rem"      onclick="cgridPreset('rem',this)">💰 متبقي</button>
        <button type="button" class="cg-preset" id="cgp-prob"     onclick="cgridPreset('prob',this)">⚠️ مشاكل</button>
        <button type="button" class="cg-preset" id="cgp-today"    onclick="cgridPreset('today',this)">📅 اليوم</button>
        <button type="button" class="cg-preset" id="cgp-week"     onclick="cgridPreset('week',this)">🗓 الأسبوع</button>
        <button type="button" class="cg-preset" id="cgp-design"   onclick="cgridPreset('design',this)">✏️ تصميم</button>
        <button type="button" class="cg-preset" id="cgp-shipping" onclick="cgridPreset('shipping',this)">🚚 شحن</button>
        <button type="button" class="cg-preset" id="cgp-collect"  onclick="cgridPreset('collect',this)">💳 تحصيل</button>
      </div>

      <!-- Filter Bar — Primary Row -->
      <div class="cg-filter-bar" style="margin-bottom:6px">
        <input id="cg-search" placeholder="🔍 بحث: اسم / هاتف / رقم الأوردر / شركة..." oninput="debouncedRenderControlGrid()" style="flex:1;min-width:180px;background:var(--bg2);border:1px solid var(--line);border-radius:8px;padding:6px 10px;color:var(--snow);font-family:inherit;font-size:var(--fs-sm);outline:none">
        <select id="cg-f-stage" onchange="renderControlGrid()">
          <option value="">كل الحالات</option>
          <option>تصميم</option><option>طباعة</option><option>تنفيذ</option>
          <option>جاهز للشحن</option><option>في الشحن</option><option>تحت التحصيل</option>
          <option>تم التحصيل</option><option>مرتجع جزئي</option><option>مرتجع كامل</option>
          <option>مشكلة</option><option>أرشيف</option><option>ملغي</option>
        </select>
        <select id="cg-f-period" onchange="renderControlGrid()">
          <option value="">كل الفترات</option>
          <option value="today">اليوم</option>
          <option value="week">هذا الأسبوع</option>
          <option value="month">هذا الشهر</option>
        </select>
        <select id="cg-f-rem" onchange="renderControlGrid()">
          <option value="">كل المالية</option>
          <option value="has_rem">يوجد متبقي</option>
          <option value="no_rem">مسدد كاملاً</option>
        </select>
        <button type="button" id="cg-adv-btn" class="cg-adv-toggle" onclick="cgridToggleAdv(this)">⚙ تفصيل</button>
        <button type="button" onclick="cgridResetFilters()" style="padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg3);color:var(--dim2);font-family:inherit;font-size:var(--fs-sm);cursor:pointer;white-space:nowrap">↺ إعادة</button>
      </div>

      <!-- Filter Bar — Advanced (collapsible) -->
      <div id="cg-adv-filters" class="cg-filter-bar" style="display:none;margin-bottom:10px;padding:var(--space-sm);background:var(--row-hover);border-radius:8px;border:1px solid var(--line)">
        <select id="cg-f-emp" onchange="renderControlGrid()"><option value="">كل الموظفين</option></select>
        <select id="cg-f-gov" onchange="renderControlGrid()"><option value="">كل المحافظات</option></select>
        <select id="cg-f-prob" onchange="renderControlGrid()">
          <option value="">كل</option>
          <option value="has_prob">فيه مشكلة</option>
          <option value="has_ret">فيه مرتجع</option>
        </select>
      </div>

      <!-- KPI Cards -->
      <div class="cg-kpi-row" id="cg-stats-row"></div>

      <!-- Bulk Action Bar -->
      <div id="cg-bulk-bar" class="cg-bulk-bar hide">
        <span id="cg-sel-count" style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--b);min-width:70px">0 محدد</span>
        <button type="button" class="cg-bulk-btn" onclick="cgridBulkAction('stage')">🔄 نقل مرحلة</button>
        <button type="button" class="cg-bulk-btn" onclick="cgridBulkAction('archive')">📁 أرشفة</button>
        <button type="button" class="cg-bulk-btn" onclick="cgridBulkAction('reopen')">↩️ إعادة فتح</button>
        <button type="button" class="cg-bulk-btn" onclick="cgridBulkAction('assign')">👤 تعيين موظف</button>
        <button type="button" class="cg-bulk-btn" onclick="cgridBulkAction('export')">⬇️ تصدير CSV</button>
        <button type="button" class="cg-bulk-btn danger" onclick="cgridSelNone()">✕ إلغاء التحديد</button>
      </div>

      <!-- Table -->
      <div class="cgrid-wrap">
        <table class="cgrid" id="cgrid-table">
          <thead>
            <tr>
              <th style="width:32px;text-align:center"><input type="checkbox" id="cg-sel-all" onchange="cgridSelAll(this.checked)" style="accent-color:var(--p)"></th>
              <th onclick="cgridSort('orderId')" style="cursor:pointer">رقم الأوردر</th>
              <th onclick="cgridSort('clientName')" style="cursor:pointer">اسم العميل</th>
              <th>رقم الهاتف</th>
              <th>الشركة / الوظيفة</th>
              <th>الخدمة</th>
              <th>الموظف المسؤول</th>
              <th onclick="cgridSort('salePrice')" style="cursor:pointer">الإجمالي</th>
              <th onclick="cgridSort('paid')" style="cursor:pointer">المدفوع</th>
              <th onclick="cgridSort('rem')" style="cursor:pointer">المتبقي</th>
              <th onclick="cgridSort('cost')" style="cursor:pointer">التكلفة</th>
              <th onclick="cgridSort('profit')" style="cursor:pointer">الربح</th>
              <th style="min-width:130px">تفاصيل الدفعات</th>
              <th style="min-width:110px">الحالة</th>
              <th onclick="cgridSort('createdAt')" style="cursor:pointer">الإنشاء</th>
              <th>آخر تحديث</th>
              <th>مشكلة؟</th>
              <th>مرتجع؟</th>
              <th style="text-align:center">تعديل</th>
              <th style="text-align:center">حذف</th>
            </tr>
          </thead>
          <tbody id="cgrid-body">
            <tr><td colspan="20" style="text-align:center;padding:30px;color:var(--dim2)">جاري التحميل...</td></tr>
          </tbody>
        </table>
      </div>
      <div id="cg-footer" style="padding:6px;text-align:center;font-size:var(--fs-xs);color:var(--dim2)"></div>
    </div>

  </div>`;

function mount() {
  // Idempotent — bail if shell already populated.
  const host = document.querySelector('.main');
  if (!host || host.dataset.shellMounted === '1') return;
  host.innerHTML = CLIENTS_SHELL_HTML;
  host.dataset.shellMounted = '1';
}

// Mount immediately if DOM is ready, else wait.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}
