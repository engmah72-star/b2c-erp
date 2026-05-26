# Clients UX Ownership Audit — Phase 0
**Codename:** single-owner-per-role
**Date:** 2026-05-26
**Scope:** UI / state ownership inside the Clients domain only (Runtime Sidebar ↔ clients.html workspace).
**Not in scope:** Financial logic (see `CLIENTS_MIGRATION_PLAN.md` 2026-05-22 for that — separate concern).
**Decision-only doc.** No code changes here — this is the agreement contract for Phases 1-5.

---

## 1. Background — لماذا الـ audit ده

المستخدم بلّغ إن لينكات الـ Runtime sidebar في "العملاء" بتفتح كلها نفس الصفحة. الـ debugging كشف إن **إدارة العملاء فيها 4 أنظمة filter منفصلة بنفس الأدوار، كل واحد ليه state خاص ومفيش contract يربطهم**.

أي patch تكتيكي (زي PR #1030) هو bridge بين أنظمة مكررة، مش حل جذري. القاعدة الذهبية في الـ ERP:

> **كل role/view/filter/action يعيش في مكان واحد فقط.**
> **الباقي = views على نفس الـ data، مش copies من الـ logic.**

(تطبيق صريح لـ RULE C1.5 + C1.8 + L1.2)

---

## 2. Inventory — جرد كامل لكل عنصر UI/state بيخص العملاء

### 2.1 — Runtime Sidebar (`core/domains/clients/sidebar.js`)
| النوع | العنصر | الـ ID | الـ Action | المالك الحالي |
|------|--------|--------|------------|----------------|
| primary view | النشطين | `active` | `?filter=active` | sidebar config |
| primary view | عليه فلوس | `rem` | `?filter=rem` | sidebar config |
| primary view | محتاج اهتمام | `atrisk` | `?filter=atrisk` | sidebar config |
| primary view | جدد | `new` | `?filter=new` | sidebar config |
| primary view | VIP | `vip` | `?filter=vip` | sidebar config |
| secondary view | كل العملاء | `all` | `clients.html` | sidebar config |
| secondary view | نايم | `sleeping` | `?filter=sleeping` | sidebar config |
| secondary view | استيراد بيانات | `import` | `import-data.html` | sidebar config |
| action | عميل جديد | `add-client` | `openAddClient` | sidebar config (handler stub) |
| action | تسجيل اتصال | `log-call` | `openLogCall` | sidebar config (stub — مفيش implementation) |
| action | تسجيل تحصيل | `log-pay` | `openLogPayment` | sidebar config (stub) |
| action | ملاحظة سريعة | `note` | `openNote` | sidebar config (stub) |
| signal | محتاج اهتمام | `delayed` | `?filter=atrisk` | sidebar config + signals-aggregator |
| primary fab | عميل جديد | — | `openAddClient` | sidebar + fab module |

### 2.2 — Clients Workspace (`clients-shell.js` + `clients.html`)
#### Primary bar (دايماً ظاهر)
| العنصر | الـ ID | الـ Handler | المالك الحالي |
|--------|--------|-------------|----------------|
| Search input | `q` | `scheduleStatsAndGrid()` | clients-shell + inline JS |
| Status tab — نشط | `stab-active` | `setStatusTab('active')` | clients.html |
| Status tab — قديم | `stab-legacy` | `setStatusTab('legacy')` | clients.html |
| Status tab — متابعة (admin) | `stab-cgrid` | `setStatusTab('cgrid')` | clients.html |
| Filter pill (clear all) | `filter-active-pill` | `clearAllFilters()` | clients.html |
| Toggle: إحصائيات (mobile) | `cl-toggle-btn[stats]` | `toggleClientsPanel('stats')` | clients-shell |
| Toggle: فلاتر (mobile) | `cl-toggle-btn[filters]` | `toggleClientsPanel('filters')` | clients-shell |

#### Quick chips (دايماً ظاهرين)
| الـ Chip | القيمة | Handler | المالك |
|----------|--------|---------|---------|
| 👥 الكل | `all` | `setQuickFilter('all')` | clients.html |
| ⭐ VIP | `vip` | `setQuickFilter('vip')` | clients.html |
| 🟢 نشط | `active` | `setQuickFilter('active')` | clients.html |
| 💰 عليه فلوس | `rem` | `setQuickFilter('rem')` | clients.html |
| ⚠️ محتاج اهتمام | `atrisk` | `setQuickFilter('atrisk')` | clients.html |
| 🌱 جديد | `new` | `setQuickFilter('new')` | clients.html |
| 😴 نايم | `sleeping` | `setQuickFilter('sleeping')` | clients.html |

#### KPI strip (read-only stats)
| الـ KPI | الـ ID | المصدر |
|---------|--------|--------|
| إجمالي العملاء | `kpi-total-clients` | clients-data.js compute |
| عملاء نشطون | `kpi-active-clients` | clients-data.js compute |
| الطلبات المفتوحة | `kpi-open-orders` | derived from `allOrders` |
| قيمة المبيعات | `kpi-sales-amount` | derived |
| متوسط مدة التنفيذ | `kpi-avg-exec` | derived |
| طلبات متأخرة | `kpi-late-orders` | derived |

#### Time period strip (period filter)
| الـ Period | الـ ID | Handler |
|------------|--------|---------|
| اليوم | `tp-today-*` | `setPeriodFilter('today')` |
| أمس | `tp-yest-*` | `setPeriodFilter('yesterday')` |
| الأسبوع | `tp-week-*` | `setPeriodFilter('week')` |
| الشهر الحالي | `tp-month-*` | `setPeriodFilter('month')` |
| الشهر السابق | `tp-lm-*` | `setPeriodFilter('lastmonth')` |

#### Extra filters panel (collapsible mobile / visible desktop)
| الـ Filter | الـ ID | الـ Values | Handler |
|------------|--------|-------------|---------|
| فلتر عام | `flt-select` | all/today/rem/active/inactive/vip | `setClientFilter()` |
| تصنيف | `f-tag` | vip/regular/new/wholesale/delayed | `renderGrid()` |
| شريحة RFM | `f-segment` | champion/loyal/new/needs_attention/at_risk/cant_lose/about_to_sleep/lost | `renderGrid()` |
| محافظة | `f-gov` | dynamic | `renderGrid()` |
| مصدر (hidden) | `f-src` | dynamic | `renderGrid()` |
| ➕ عميل قديم | `add-legacy-btn` | — | `openAddLegacy()` |
| 🔁 مكررات | `dup-scan-btn` | — | `openDupScan()` |
| 🪄 بحث ذكي | injected by `clients-ai-search.js` | NL → filter spec | `aiSearch.install()` |

#### Other elements
| العنصر | الـ ID | الغرض |
|--------|--------|--------|
| Segment strip (RFM distribution) | `segment-strip` | clickable filter shortcuts |
| Occasions banner | `occasions-banner` | birthdays/anniversaries |
| Clients grid | `clients-grid` | renders cards |
| Admin control grid | `cgrid-section` | tabular bulk-edit (admin only) |
| Topbar — ＋ عميل جديد | inline button | `openAddClient()` |
| Topbar — ↓ CSV | inline button | `exportCSV()` |
| Topbar — view toggle (grid/list) | `view-grid` / `view-list` | `setView()` |

### 2.3 — State variables (global mutables)
| Variable | يحدّده | يقرأه |
|----------|---------|--------|
| `window.__quickFilter` | `setQuickFilter()` | `renderGrid()` |
| `window.__clientFilter` | `setClientFilter()` | `renderGrid()` + `updateFilterBadge()` |
| `window.__statusTab` | `setStatusTab()` | `renderGrid()` |
| `window.__periodFilter` | `setPeriodFilter()` | `renderGrid()` |
| `window.__currentRole` | auth callback | عدة شيكات |
| `userPerms` | auth callback | `canSee()` |

### 2.4 — Permissions matrix (المصدر الرسمي)
`core/permissions-matrix.js` بيوفّر:
- `VIEW_CLIENTS` / `EDIT_CLIENTS` capabilities (per-role)
- `client_phone` field permission (per-role)
- `MANAGE_PAYMENTS` للـ تسجيل تحصيل

**لكن:** `clients.html` لسه فيه hard-coded checks زي:
```js
const isAdmin = ['admin','operation_manager'].includes(currentRole);
const canAssign = ['admin','operation_manager','customer_service','design_operator'].includes(currentRole);
```
→ تكرار للـ logic اللي المفروض من matrix.

---

## 3. Duplication Map — أين تتكرر الأدوار

### 3.1 — "النشطين" يعيش في **5 أماكن**
| المكان | الشكل | بيعمل إيه |
|--------|--------|------------|
| Runtime sidebar primary view "النشطين" | menu item | navigate iframe to `?filter=active` |
| Quick chip "🟢 نشط" | chip button | `setQuickFilter('active')` |
| flt-select dropdown "🔄 نشط" | dropdown option | `setClientFilter('active')` |
| KPI "عملاء نشطون" | stats card | onclick → triggers quick chip 'active' |
| f-segment "🏆 أبطال" / "💎 أوفياء" | dropdown option | overlapping concept |

**النتيجة:** 5 entry points → 3 different state variables (`__quickFilter`, `__clientFilter`, no-state KPI click) → نفس النتيجة على الـ grid.

### 3.2 — "VIP" يعيش في **4 أماكن**
- Runtime sidebar primary view
- Quick chip
- flt-select dropdown
- f-tag dropdown

### 3.3 — "محتاج اهتمام (atrisk)" يعيش في **4 أماكن**
- Runtime sidebar primary view
- Quick chip
- f-segment dropdown (`at_risk`)
- Runtime sidebar signal "محتاج اهتمام"

### 3.4 — "عليه فلوس (rem)" يعيش في **3 أماكن**
- Runtime sidebar primary view
- Quick chip
- flt-select dropdown

### 3.5 — "إضافة عميل" يعيش في **3 أماكن**
- Runtime sidebar action `add-client`
- Runtime sidebar primaryAction (FAB)
- Topbar button "＋ عميل جديد" داخل الصفحة

### 3.6 — Status tabs (نشط/قديم) — ownership غامض
- Status tab "نشط" بيـ filter الـ grid بطريقة معينة
- Runtime sidebar primary view "كل العملاء" بيـ navigate بدون filter
- Quick chip "👥 الكل" بيـ clear `__quickFilter` فقط
- **هل دول نفس الـ concept ولا 3 concepts مختلفة؟** غير واضح.

### 3.7 — Role checks مكررة
- Hard-coded في clients.html: `['admin','operation_manager']`
- نفس الـ list في عدة pages
- المفروض كله من `canDo('archive_orders', currentRole, userPerms)`

---

## 4. Canonical Ownership — قرار: مين يملك إيه

### 4.1 — مبدأ التصنيف
كل عنصر بيقع في واحدة من 3 خانات:
- **🅢 Sidebar** — Navigation / View switching / Cross-page actions
- **🅦 Workspace** — In-page interactions tied to the rendered data
- **🅒 Centralized core** — Single source for permissions/validators/handlers

### 4.2 — قرار الـ Ownership الجديد

| الفئة | العنصر | المالك الجديد | يتشال من |
|-------|---------|----------------|------------|
| **Views (filter switching)** | النشطين، VIP، rem، atrisk، new، sleeping، all | **🅢 Sidebar** | ❌ quick chips · ❌ flt-select |
| **Search by name/phone** | search input | **🅦 Workspace** (text-only، لا يوجد في sidebar) | — |
| **Period (today/week/month/...)** | period strip | **🅦 Workspace** (stats-driven، relates to KPIs) | — |
| **KPIs (read-only stats)** | 6 cards | **🅦 Workspace** | — |
| **RFM segment** | segment strip + dropdown | **🅦 Workspace** (analytical view، not daily filter) | ❌ f-segment dropdown (الـ strip بيغني عنه) |
| **Tag filter (vip/regular/wholesale...)** | f-tag dropdown | **🅢 Sidebar** كـ secondary views | ❌ dropdown |
| **Governorate filter** | f-gov dropdown | **🅦 Workspace** (geographic، contextual) | — |
| **Status tabs (نشط/قديم/cgrid)** | 3 tabs | **🅦 Workspace** كـ workspace mode (مش filter) | — |
| **Add client** | "+ عميل جديد" | **🅢 Sidebar** primaryAction + FAB | ❌ topbar button |
| **Log call / Log payment / Note** | quick actions | **🅢 Sidebar** quick actions (لما الـ handlers تتعمل) | — |
| **Import data** | external page | **🅢 Sidebar** secondary view | — |
| **Export CSV** | export | **🅦 Workspace** topbar (data-tied operation) | — |
| **Grid/list toggle** | view toggle | **🅦 Workspace** topbar (presentation only) | — |
| **Dup scan / Legacy add** | admin tools | **🅢 Sidebar** secondary actions (admin-only) | ❌ extra-filters bar |
| **AI search** | NL search | **🅦 Workspace** (text + smart) | — |
| **Permissions checks** | role-based | **🅒 `permissions-matrix.js`** (`canDo()`) | ❌ hard-coded role lists everywhere |
| **Occasions banner** | birthdays | **🅦 Workspace** (auto-shown, contextual) | — |

### 4.3 — الـ State Variables الجديدة
بدل 4 mutables، **state واحدة موحّدة** على مستوى الـ runtime:
```js
// مستقبلاً في core/runtime-shell/runtime-state.js
B2CRuntime.state = {
  domain: 'clients',
  view: 'active',          // unified view from sidebar
  filters: {
    search: '',            // text search (workspace-owned)
    period: '',            // workspace-owned
    governorate: '',       // workspace-owned
    tag: '',               // sidebar-owned secondary
    rfmSegment: '',        // workspace-owned analytical
  },
  mode: 'cards'            // cards | list | cgrid — workspace-owned
};
```
- مفيش `__quickFilter` / `__clientFilter` / `__statusTab` / `__periodFilter` منفصلين
- Workspace = subscriber، يـ re-render لما state تتغير

---

## 5. النتيجة المتوقعة بعد الـ migration

### قبل
- 4 systems تـ filter
- 5 entry points لـ "النشطين"
- ~600 سطر filter UI في clients.html
- 3 mutables غير متزامنين
- hard-coded role lists في 12 مكان

### بعد
- 1 sidebar + 1 page = 1 state
- 1 entry point لكل view
- ~100 سطر workspace listener فقط
- 1 unified state object
- كل permission من `canDo()` واحد

---

## 6. خطة الـ Migration (مقترحة — للتنفيذ في PRs منفصلة)

### Phase 1 — Runtime State Contract (foundation، PR منفصل)
- إنشاء `core/runtime-shell/runtime-state.js`
- API: `B2CRuntime.setView()` / `subscribe()` / `getState()`
- postMessage bridge للـ iframes
- Backward-compat: shell لسه بيعمل deepLink نفس وقت emit للـ state
- **Risk:** stable core، يحتاج careful testing على كل الـ domains

### Phase 2 — Clients Workspace Diet (يومان، PR منفصل)
- إزالة من `clients.html` / `clients-shell.js`:
  - 7 quick chips (~150 سطر)
  - flt-select dropdown
  - f-tag dropdown (يـ migrate كـ sidebar secondary views)
  - f-segment dropdown (الـ strip بيكفي)
  - `setQuickFilter`، `setClientFilter`، `updateFilterBadge` (~80 سطر)
  - Topbar "+ عميل جديد" (يكفي الـ sidebar/FAB)
- إضافة: listener لـ `rt:state` events + unified `applyView(state)` function
- **Risk:** medium، god page editing. اختبار manual إلزامي.

### Phase 3 — Sidebar Secondary Views Extension (يوم، PR منفصل)
- نقل f-tag values كـ sub-views أو category filter داخل sidebar:
  - "تصنيف: VIP" / "دوري" / "جملة" / "آجل"
  - ممكن جزء من المزيد، أو nested section
- نفس النمط لـ admin actions (dup-scan، legacy-add)

### Phase 4 — Permissions Consolidation (يوم، PR منفصل)
- إزالة كل hard-coded role checks من `clients.html`
- استبدالها بـ `canDo(capability, currentRole, userPerms)`
- التأكد إن sidebar config بيـ filter views حسب الـ role

### Phase 5 — Apply Pattern to Other Domains (3-4 أيام، PR لكل domain)
- نفس الـ pattern لـ design / production / shipping / inbox / accounts / admin
- كل domain له audit مماثل قبل التنفيذ

---

## 7. أسئلة محتاج موافقة المستخدم قبل Phase 1

| # | السؤال | الخيارات |
|---|--------|----------|
| Q1 | RFM segment dropdown يتشال نهائياً ولا نخليه كـ secondary نادر؟ | (a) يتشال — الـ strip يكفي / (b) يبقى behind المزيد |
| Q2 | Status tabs (نشط/قديم/cgrid) — هل دول views ولا workspace modes؟ | (a) sidebar secondary views / (b) workspace tabs (الوضع الحالي) |
| Q3 | "+ عميل جديد" يتشال من الـ topbar نهائياً؟ | (a) يتشال — sidebar + FAB يكفوا / (b) يبقى للسرعة |
| Q4 | Tag filter (vip/regular/wholesale...) — sidebar secondary أم workspace dropdown؟ | (a) sidebar / (b) workspace |
| Q5 | الـ Period strip (today/week/month) — workspace أم sidebar؟ | (a) workspace (يتربط بـ KPIs) / (b) sidebar كـ time-range selector |
| Q6 | Audit الباقي domains (design/shipping/...) قبل ما نبدأ تنفيذ Phase 1 ولا بعدين؟ | (a) قبل — comprehensive audit / (b) بعدين — ابدأ بالـ clients pilot |

---

## 8. الـ Stable Core المتأثر
- ✅ `core/runtime-shell/sidebar-builder.js` — H1.8 (2-reviewer)
- ✅ `core/runtime-shell/runtime-state.js` (جديد) — sets new stable core
- ✅ `core/permissions-matrix.js` — H1.8
- ⚠️ `clients.html` — god page (G5)، لكن diet بـ delete فقط، آمن

---

**Status:** Awaiting user answers to Q1-Q6 → then proceed to Phase 1.
