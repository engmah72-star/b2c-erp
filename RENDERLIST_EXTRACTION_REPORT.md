# renderList() Extraction Report (Phase 3B Preparation)

> **النطاق:** تقرير تحليل فقط لاستخراج `renderList()` من `employees.html` كـ builder مستقل. **لا تنفيذ، لا نقل كود، لا إنشاء ملفات.**
> **القاعدة الحاكمة:** RULE L1.5 (View builders) · A1/H1.1 (logic مركزي) · E1/G9.
> آخر تحديث: 2026-05-31 · الفرع: `claude/employee-module-architecture-9qZX1`

---

## 0. الخلاصة التنفيذية

| المؤشر | القيمة |
|--------|-------:|
| `renderList()` | السطور **941–1219** (279 سطر) |
| الأجزاء داخلها | (1) قراءة DOM inputs · (2) filter+sort · (3) pagination/cache mutation · (4) `renderFilterChips()` side-effect · (5) **بناء HTML** |
| الجزء القابل للاستخراج | **(5) بناء HTML فقط** (~155 سطر markup) |
| Byte-identical ممكن؟ | ✅ **YES** (مع context object) |
| المخاطرة | 🟠 **Medium** (سطح بارامترات كبير + helpers مُمرَّرة كدوال) |
| أثر على event delegation | ✅ **صفر** (الحاوية `#list` في الـ scaffold، ليست من توليد renderList) |

> **الخلاصة:** `renderList()` ليست دالة عرض نقية — هي **خليط** من filter/sort logic + state mutation + side-effect + HTML building. الاستخراج الآمن = فصل **جزء بناء الـ HTML فقط** إلى `buildEmployeesListHTML(ctx)`، مع إبقاء الـ filter/sort/pagination/cache/side-effect في الصفحة. هذا يحقق byte-identical output ويخفض ~155 سطر، لكنه يتطلب تمرير **~20 معامل** (data + maps + helper functions) — وهو ما يرفع المخاطرة إلى Medium.

---

## 1. Function Profile

| | |
|--|--|
| **Start line** | 941 (`window.renderList=function(){`) |
| **End line** | 1219 (`};`) |
| **Total** | **279 سطر** |
| **Purpose** | فلترة + ترتيب + ترقيم الموظفين، ثم بناء الـ board (cards grid + empty states + pager) وكتابته في `#list` |
| **Inputs** | لا معاملات — يقرأ closure globals + DOM inputs (`gv('q')`, `gv('f-role')`) |
| **Outputs** | side-effect: `document.getElementById('list').innerHTML = ...` + استدعاء `renderFilterChips()` + mutation لـ `currentPage`/`__lastActivityMap` |

### التقسيم الداخلي (5 مسؤوليات):
| الجزء | السطور | النوع | يُستخرَج؟ |
|------|--------|-------|:---------:|
| A. حساب maps (paidEmpIds, attendedToday, todayAttMap, attendedInPeriod) | 942–966 | logic | ❌ (يبقى) |
| B. قراءة DOM inputs + filter | 968–993 | logic + DOM read | ❌ (يبقى) |
| C. sort | 995–1016 | logic | ❌ (يبقى) |
| D. `renderFilterChips()` | 1018 | side-effect | ❌ (يبقى) |
| E. empty states | 1021–1038 | **markup** | ✅ |
| F. pagination + cache (currentPage clamp, lastActivityMap) | 1040–1063 | **state mutation** | ❌ (يبقى) |
| G. **cards grid + pager markup** | 1065–1218 | **markup** | ✅ |

---

## 2. Dependency Map

| Dependency | Type | Scope | يُقرأ/يُكتب |
|-----------|------|-------|------------|
| `employees` | global array | module | read |
| `transactions` | global array | module | read |
| `attendanceRecords` | global array | module | read |
| `allOrders` | global array | module | read |
| `ROLES` | constant | module | read |
| `PAGE_SIZE` | constant (20) | module | read |
| `sortBy` | global state | module | read |
| `statFilter` | global state | module | read |
| `salFilterUnpaid` | global state | module | read |
| `attFilterToday` | global state | module | read |
| `periodFilter` | global state | module | read |
| `currentPage` | global state | module | **read + MUTATE** (clamp) |
| `__lastActivityMap` | global cache | module | **read + MUTATE** |
| `__lastActivityVer` | global cache | module | **read + MUTATE** |
| `__ordersVer` | global cache | module | read |
| `todayStr` | helper (pure, reads `now`) | external | call |
| `isMainSalaryTx` | helper (pure) | external | call |
| `txInPeriod` | helper (closure: period) | external | call |
| `attInPeriod` | helper (closure: period) | external | call |
| `gv` | helper (DOM read) | external (dom-utils) | call |
| `calcKpi` | helper (closure: allOrders/attendance) | external | call (per-card) |
| `getEmpStatus` | helper (closure) | external | call (per-card) |
| `nameToColor` | helper (pure) | external | call (per-card) |
| `fn` | helper (pure) | external | call (per-card) |
| `escAttr` | helper (pure) | external | call (per-card) |
| `getPeriodLabel` | helper (closure: periodFilter) | external | call |
| `ordersInPeriod` | helper (closure: allOrders/period) | external | call |
| `suggestName` | helper (closure: employees) | external | call (empty-state) |
| `renderFilterChips` | render side-effect | external | call |
| `document.getElementById('list')` | DOM | — | write |

---

## 3. Closure Analysis

| Dependency | Read-only | Mutated | Derived | يُمرَّر كمعامل؟ |
|-----------|:---------:|:-------:|:-------:|:--------------:|
| `employees` | ✅ | — | — | ✅ (data) |
| `transactions` | ✅ | — | — | ✅ (→ paidEmpIds map) |
| `attendanceRecords` | ✅ | — | — | ✅ (→ maps) |
| `allOrders` | ✅ | — | — | ✅ (→ maps/helpers) |
| `sortBy/statFilter/salFilterUnpaid/attFilterToday/periodFilter` | ✅ | — | — | ✅ (flags) |
| `currentPage` | ✅ | ✅ **clamp** | — | ⚠️ يُمرَّر بعد الـ clamp في الصفحة |
| `__lastActivityMap/Ver` | ✅ | ✅ **cache** | ✅ | ⚠️ يُحسب في الصفحة، يُمرَّر للـ builder |
| `ROLES` | ✅ | — | — | ✅ (const، أو import للـ view) |
| `calcKpi`, `getEmpStatus` | — | — | — | ✅ كـ **function refs** (closure-bound) |
| `nameToColor`, `fn`, `escAttr` | — | — | — | ✅ (pure — import أو pass) |

**العدّ الدقيق:**
- **Read-only globals:** 11 (employees, transactions, attendanceRecords, allOrders, ROLES, PAGE_SIZE, sortBy, statFilter, salFilterUnpaid, attFilterToday, periodFilter)
- **Mutated globals:** 3 (currentPage, __lastActivityMap, __lastActivityVer) → **يجب أن تبقى الـ mutation في الصفحة**
- **Helper functions:** 14 (5 pure, 9 closure-bound/side-effect)
- **DOM reads:** 2 (`gv('q')`, `gv('f-role')`) → **يجب أن تبقى في الصفحة**

> **الاستنتاج:** الـ mutations (3) + DOM reads (2) + filter/sort logic **لا يمكن** أن تنتقل للـ view (ستكسر L1.5 — view = pure render). الحل: الصفحة تنفّذ A→F، ثم تمرّر **النتائج** (pageData + maps + flags + helper refs) إلى `buildEmployeesListHTML(ctx)` الذي ينفّذ E + G فقط.

---

## 4. ID Inventory

| النوع | العدد | القيمة |
|------|------:|--------|
| **Static IDs** | **0** | (الحاوية `#list` في الـ scaffold، ليست من توليد renderList) |
| **Dynamic IDs** | **1 نمط** | `am-${e._id}` (act-menu، واحد لكل بطاقة موظف) |
| **Repeated IDs** | 0 | كل `am-*` فريد per-employee |
| **Dataset attributes** | **35** (انظر §5) | data-act/eid/ename/uid/page/sug/newstatus |

> **ملاحظة:** الـ grep الأولي أظهر `id="${escAttr(e._id)}"` ×7 و `id="${escAttr(uid)}"` ×3 — لكنها **false positives** (الـ regex `id="` طابق داخل `data-eid="`/`data-uid="`). الـ **ID الحقيقي الوحيد المُولَّد** = `am-${e._id}`.

**هل تبقى الـ IDs byte-identical بعد الاستخراج؟** ✅ **نعم** — `am-${e._id}` يُبنى من `e._id` المُمرَّر في `pageData`؛ لا تغيير في القيمة.

---

## 5. Action Map (data-* totals)

| Attribute | العدد |
|-----------|------:|
| `data-act` | 17 |
| `data-eid` | 7 |
| `data-uid` | 3 |
| `data-ename` | 3 |
| `data-page` | 3 |
| `data-newstatus` | 1 |
| `data-sug` | 1 |
| **الإجمالي** | **35** |

**قيم `data-act` المُولَّدة (10 فريدة):** `apply-suggestion`, `clear-filters`, `open-add-emp`, `open-kpi`, `open-att`, `open-pay-one`, `toggle-act-menu`, `menu-stop`, `menu-open-kpi`, `menu-edit`, `menu-close`, `menu-toggle-status`, `noop`, `goto-page`.

كلها مبنية من `escAttr(...)` على بيانات الموظف → **byte-identical preservable**.

---

## 6. Event Compatibility Check

| Current Selector | Listener Location | Extraction Impact |
|------------------|-------------------|:-----------------:|
| `#list` (click delegation) | `employees.html:1921` | ✅ **صفر** — `#list` في الـ scaffold، الـ listener ثابت؛ الاستخراج يغيّر فقط **كيف يُبنى الـ innerHTML string** (نفس الـ string) |
| `[data-act="open-kpi/open-att/open-pay-one/toggle-act-menu"]` (board) | delegated on `#list` | ✅ صفر — نفس الـ data-act في الـ output |
| `[data-act="menu-*"]` (act-menu) | delegated on `#list` | ✅ صفر |
| `[data-act="goto-page"]` (pager) | delegated on `#list` | ✅ صفر |
| `[data-act="apply-suggestion/clear-filters/open-add-emp"]` (empty-cta) | delegated on `#list` | ✅ صفر |
| `#filter-chips` | separate listener (renderFilterChips) | ✅ صفر — `renderFilterChips()` يبقى يُستدعى من الصفحة |

> **النتيجة الحاسمة:** كل الأحداث مُفوَّضة على الحاوية المستقرة `#list` (في الـ scaffold). الاستخراج ينتج **نفس الـ HTML string** داخل نفس الحاوية → **صفر أثر على الـ delegation/listeners/selectors**.

---

## 7. Byte-Identical Feasibility

### **YES** — قابل للاستخراج byte-identical.

**المتطلبات (parameters required):**
الصفحة تنفّذ A→F (filter/sort/pagination/cache/maps/DOM reads/renderFilterChips)، ثم تستدعي:
```
buildEmployeesListHTML({
  // data
  pageData,            // الموظفون بعد filter+sort+slice
  dataLength,          // data.length (للـ pager + "عرض x من y")
  employeesLength,     // employees.length (لتمييز empty: "لا نتائج" vs "لا موظفين")
  // empty-state inputs
  hasFilter,           // q||fr||salFilter||attFilter||statFilter||periodFilter!=='month_cur'
  suggestion,          // suggestName(q) أو null
  // pagination
  currentPage, totalPages, pageStart, pageSize,
  // lookup maps (محسوبة في الصفحة)
  paidEmpIds, attendedToday, todayAttMap, attendedInPeriod,
  lastActivityMap, activeOrdsAll, periodOrders,
  // flags
  periodFilter, periodLabel,
  // helpers (closure-bound refs + pure)
  ROLES, calcKpi, getEmpStatus, nameToColor, fn, escAttr,
})
```
**~22 معامل.** كلها read-only داخل الـ builder (لا mutation). الـ output نفس الـ HTML string بالضبط.

> **بديل أبسط (يخفض سطح المعاملات):** استخراج **بطاقة واحدة** `buildEmployeeCardHTML({e, ctx})` + `buildEmployeesEmptyHTML(...)` + `buildPagerHTML(...)` كـ 3 دوال أصغر، والصفحة تبني الـ grid wrapper وتنادي البطاقة في الـ map. نفس الـ ctx لكن مُقسَّم.

---

## 8. Line Reduction Forecast

```
employees.html : 1954 سطر (حالياً، بعد 3A)

After renderList HTML extraction (الجزء E + G فقط):
  markup منقول: ~155 سطر (empty states ~18 + cards grid ~135 + pager ~22، مطروحاً منها سطر النداء)
  يبقى في الصفحة: A-F (filter/sort/pagination/maps/cache) ~120 سطر + سطر نداء واحد

Expected size:      ~1800 سطر
Expected reduction: ~155 سطر
new file render-employees-board.js: ~175 سطر
```

| | الحجم المتوقع |
|--|:-------------:|
| الحالي | 1954 |
| بعد استخراج renderList HTML | **~1800** |
| (تراكمياً مع باقي builders Phase 3B) | يقترب من < 1500 |

> **ملاحظة:** استخراج `renderList` وحده يخفض ~155 سطر (لا يصل تحت 1500 بمفرده). الوصول تحت 1500 يحتاج باقي builders Phase 3B (stats, skeleton, drawers, alerts).

---

## 9. Risk Assessment

### 🟠 **MEDIUM**

| العامل | التقييم |
|--------|---------|
| Event delegation | 🟢 صفر أثر (الحاوية في scaffold) |
| IDs/data-* | 🟢 byte-identical preservable |
| Business logic (filter/sort/pagination) | 🟢 يبقى في الصفحة بلا تغيير |
| Financial | 🟢 لا علاقة (renderList لا يلمس FSE/payroll) |
| **سطح المعاملات الكبير (~22)** | 🟠 احتمال خطأ في تمرير معامل/خريطة → output مختلف |
| **helpers مُمرَّرة كـ function refs** (calcKpi, getEmpStatus) | 🟠 يجب تمريرها bound؛ خطأ scope → نتيجة مختلفة |
| **per-card closure logic** (perfHtml: 4 فروع per role) | 🟠 منطق متشعّب داخل الـ map — يجب نقله حرفياً |

**سبب التصنيف Medium (وليس Low):** الاستخراج byte-identical ممكن ومُؤكَّد، لكن **سطح المعاملات الكبير + الـ helpers المُمرَّرة كدوال + منطق الـ per-card** يجعل احتمال الخطأ البشري أعلى من استخراج modal بسيط (Low). يخفّفه: تحقّق byte-identical آلي (hash المُخرَج قبل/بعد على نفس الـ state).

**سبب عدم التصنيف High:** لا financial، لا state mutation داخل الـ builder، لا أثر على delegation، الحاوية ثابتة.

---

## 10. Target API

```js
// features/employees/views/render-employees-board.js
export function buildEmployeesListHTML({
  pageData, dataLength, employeesLength,
  hasFilter, suggestion,
  currentPage, totalPages, pageStart, pageSize,
  paidEmpIds, attendedToday, todayAttMap, attendedInPeriod,
  lastActivityMap, activeOrdsAll, periodOrders,
  periodFilter, periodLabel,
  ROLES, calcKpi, getEmpStatus, nameToColor, fn, escAttr,
}) { /* returns the full #list innerHTML string, byte-identical */ }
```

**المعاملات المطلوبة (exact, 22):**
data(3): `pageData`, `dataLength`, `employeesLength` ·
empty(2): `hasFilter`, `suggestion` ·
pagination(4): `currentPage`, `totalPages`, `pageStart`, `pageSize` ·
maps(7): `paidEmpIds`, `attendedToday`, `todayAttMap`, `attendedInPeriod`, `lastActivityMap`, `activeOrdsAll`, `periodOrders` ·
flags(2): `periodFilter`, `periodLabel` ·
helpers(6): `ROLES`, `calcKpi`, `getEmpStatus`, `nameToColor`, `fn`, `escAttr`.

> **توصية بديلة:** تقسيم لـ 3 builders أصغر (`buildEmployeeCardHTML`, `buildEmployeesEmptyHTML`, `buildPagerHTML`) لتقليل سطح كل نداء — لكن نفس الـ ctx إجمالاً. القرار عند الموافقة.

---

## Success Criteria — التقييم

| المعيار | الحالة |
|---------|:------:|
| Byte-identical output ممكن | ✅ YES |
| IDs preserved (`am-${e._id}`) | ✅ |
| data-* preserved (35) | ✅ |
| Event delegation unaffected (`#list` ثابت) | ✅ |
| Business logic untouched (filter/sort/pagination تبقى) | ✅ |
| Firestore untouched | ✅ (renderList لا يقرأ/يكتب Firestore) |
| Financial flows untouched | ✅ (لا علاقة بـ FSE/payroll) |

**كل معايير القبول مُحقَّقة** — الاستخراج آمن byte-identical، بمخاطرة Medium (سطح معاملات) يخفّفها تحقّق hash آلي.

---

## ⛔ لم يُنفَّذ أي شيء
تقرير تحليل فقط، evidence-based (file:line + counts فعلية). صفر code changes · صفر builder creation · صفر markup relocation · صفر logic/Firestore/financial changes.
