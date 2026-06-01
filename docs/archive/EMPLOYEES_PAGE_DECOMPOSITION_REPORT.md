# Employees Page — Decomposition Report (Phase 3 Preparation)

> **النطاق:** تقرير تفكيك فقط لـ `employees.html` (1810 سطر). **لا تنفيذ، لا نقل كود، لا إنشاء ملفات.**
> **القاعدة الحاكمة:** RULE G5/H1.7 (god page) · L1.5 (Views) · A1/H1.1 (central writes) · H2.6 (chaos للمالية) · E1/G9.
> آخر تحديث: 2026-05-31 · الفرع: `claude/employee-module-architecture-9qZX1`

---

## 0. الخلاصة التنفيذية

| المؤشر | القيمة |
|--------|-------:|
| إجمالي الأسطر | **1810** (god page > 1500) |
| HTML scaffold (1–314) | 314 سطر (topbar/stats/toolbar/filters + 4 modals + panel) |
| Module script (315–1807) | 1492 سطر |
| **Static inline styles** | **157** |
| **Dynamic styles** (U1.6) | **17** |
| **Inline events** | **76** |
| Local `<style>` | **0** |
| **Direct Firestore writes** | **0** ✅ |
| **⚠️ Direct `dispatchFinancialEvent` في الـ UI** | **3** (payroll/payOne/reverse) — **drift قائم لـ A1/H1.1** |
| `employeeActions.*` | 5 calls ✅ |
| View builders قائمة | **0** (الصفحة لا تستورد أي view) |

> **اكتشافان حاسمان:**
> 1. **أكبر مشكلة بنيوية: `renderList()` = 279 سطر** (39–66% من تعقيد الصفحة) — هو الـ "board" الذي يبني كل صفوف الموظفين + act-menus inline. هذا هو هدف الاستخراج الأول.
> 2. **⚠️ drift مالي قائم (سابق للمشروع):** الصفحة تستدعي `dispatchFinancialEvent` **مباشرة** 3 مرات (PAYROLL, SALARY_PAYMENT, SALARY_PAYMENT_REVERSAL) — مخالفة A1/H1.1 (المال يجب أن يمرّ عبر `employeeActions.*`). **خارج نطاق Phase 3** (إصلاحه = business logic change ممنوع)، لكن **يجب الحذر**: أي استخراج لـ modals الدفع **يجب ألا يلمس هذا المنطق**. يُسجَّل كـ debt منفصل.

---

## 1. Current Structure Map

### 1.1 HTML Scaffold (1–314)
| القسم | السطور | الغرض | الحجم |
|------|--------|-------|------:|
| `<head>` + assets | 1–30 | shared.css، components.css، employees.css، scripts | 30 |
| Sidebar | 32–51 | nav-brand + nav-links + nav-user | 20 |
| **Topbar** | 52–59 | عنوان + 3 أزرار (معاينة أدوار، يوم الرواتب، +موظف) | 8 |
| **Stats/KPI row** | 62–71 | 8 stat cards (4 منها clickable filters) | 10 |
| **Sticky toolbar** | 73–111 | period pills + search + role filter + 2 toggle filters + sort menu + absent | 39 |
| Filter chips | 113–114 | شرائح الفلاتر النشطة | 2 |
| Alerts + List zone | 116–117 | `#emp-alerts` + `#list` (الـ board target) | 2 |
| **Modal: ov-absent-wa** | 123–138 | واتساب للغائبين | 16 |
| **Modal: ov-emp** | 141–199 | موظف جديد/تعديل (الأكبر — 59 سطر) | 59 |
| **Modal: ov-payroll** | 202–243 | يوم الرواتب (مالي) | 42 |
| **Modal: ov-pay-one** | 246–293 | صرف مبلغ لموظف (مالي) | 48 |
| **Panel: panel-ov** | 296–304 | drawer تفاصيل الموظف (KPI/Attendance) | 9 |
| mob-nav + nav-overlay + toasts | 306–313 | — | 8 |

### 1.2 Module Script (315–1807) — الدوال الكبرى
| الدالة | السطور | الأسطر | الغرض |
|--------|--------|-------:|-------|
| `buildSidebar` | 330–371 | 41 | بناء sidebar |
| `calcKpiBreakdown` | 429–484 | 55 | حساب KPI (logic) |
| `renderAlerts` | 496–538 | 42 | تنبيهات أعلى القائمة |
| `openKpiPanel` | 561–640 | 79 | drawer KPI (markup كبير) |
| `openAttPanel` | 693–743 | 50 | drawer الحضور (markup) |
| `renderSkeleton` | 744–827 | 83 | skeleton loaders |
| `updateStats` | 834–886 | 52 | تحديث 8 stat cards |
| **`renderList`** | **939–1218** | **279** | **الـ board — صفوف الموظفين + act-menus** 🔴 |
| `saveEmp` | 1453–1514 | 61 | حفظ موظف (employeeActions) |
| `openPayroll` | 1515–1554 | 39 | فتح modal الرواتب |
| `openPayOne` | 1690–1746 | 56 | فتح modal الدفع الفردي |
| دوال أصغر (~40) | متفرقة | ~700 | filters, sort, chips, pagination, payroll, payOne, reverse |

---

## 2. View Coverage Analysis

| Section | Current Builder | Covered? | Reusable? |
|---------|-----------------|:--------:|:---------:|
| Employees board (renderList) | None | ❌ No | ✅ Yes |
| Stats/KPI row (updateStats) | None | ❌ No | ✅ Yes |
| Sticky toolbar (filters/search/sort) | None | ❌ No | ✅ Yes |
| Filter chips | None | ❌ No | ✅ Yes |
| Skeleton loaders | None | ❌ No | ✅ Yes |
| Alerts banner | None | ❌ No | ✅ Yes |
| KPI panel (drawer) | None | ❌ No | 🟡 Partial (closure-heavy) |
| Attendance panel (drawer) | None | ❌ No | 🟡 Partial |
| Modal: employee form | None | ❌ No | ✅ Yes |
| Modal: absent-wa | None | ❌ No | ✅ Yes |
| Modal: payroll | None | ❌ No | 🟡 Yes (financial) |
| Modal: pay-one | None | ❌ No | 🟡 Yes (financial) |
| KPI calc | `core/employee-kpis.js` موجود | ⚠️ مكرّر جزئياً | ✅ Yes |

> **التغطية الحالية ≈ 0%** للـ views (عكس `employee-profile.html` الذي كان عنده 9 builders). الصفحة تستورد فقط `core/*` (firebase-init, dom-utils, FSE, permissions). **كل الـ markup inline في JS.** هذا يعني أن Phase 3 **أكبر جهداً** من Phase 2 لكن النمط نفسه (build*HTML pure functions).

---

## 3. Inline Technical Debt Analysis

| النوع | العدد |
|------|------:|
| **Static inline styles** | **157** |
| **Dynamic styles** (U1.6 exempt) | **17** |
| **Inline events** | **76** |
| **Local `<style>` blocks** | **0** |
| **Duplicated markup** | act-menu (×3 مواضع), payroll-row (×4), stat card pattern (×8) |
| **Repeated UI patterns** | status pills, kpi rings, emp rows, modal scaffolds |

### التوزيع الدقيق حسب المنطقة:

**Static styles (157):**
| المنطقة | العدد |
|---------|------:|
| JS: kpi-panel/att-panel/goals (drawers) | 47 |
| JS: renderList (board) | 33 |
| Modals scaffold (4 modals) | 32 |
| HTML scaffold (topbar/stats/toolbar) | 18 |
| JS: skeleton/stats/filters | 11 |
| JS: payroll | 7 |
| JS: payOne/commission/reverse | 6 |
| JS: kpi/alerts | 3 |

**Inline events (76):**
| المنطقة | العدد |
|---------|------:|
| HTML scaffold (topbar/stats/toolbar) | 27 |
| Modals scaffold | 20 |
| JS: renderList (board) | 17 |
| JS: payroll | 4 |
| JS: kpi-panel/att-panel | 3 |
| باقي | 5 |

**Dynamic styles (17):** kpi-panel/board (`--sc:`, `width:${pct}%`, `--kc:`) — runtime، تبقى.

---

## 4. Extraction Candidates

| Candidate | الأسطر | Dependencies | Risk |
|-----------|-------:|--------------|:----:|
| **Employees board builder** (renderList markup) | ~180 من 279 | emp data, kpi, status, period helpers, escapeHtml | 🟠 Medium |
| **Skeleton builder** (renderSkeleton) | 83 | لا closure تقريباً | 🟢 Low |
| **Stats row builder** (updateStats markup) | ~30 من 52 | stats data | 🟢 Low |
| **Toolbar/filters markup** (scaffold 73–114) | 42 | data-p/data-s/data-sf attrs | 🟢 Low |
| **KPI panel builder** (openKpiPanel markup) | ~60 من 79 | kpi breakdown, goals, evaluations | 🟠 Medium |
| **Attendance panel builder** (openAttPanel markup) | ~40 من 50 | attendance records | 🟠 Medium |
| **Employee form modal** (ov-emp) | 59 | populate-by-id | 🟢 Low |
| **Absent-WA modal** (ov-absent-wa) | 16 | populate-by-id | 🟢 Low |
| **Payroll modal** (ov-payroll) | 42 | populate-by-id, **financial** | 🔴 High |
| **Pay-one modal** (ov-pay-one) | 48 | populate-by-id, **financial** | 🔴 High |
| **Alerts builder** (renderAlerts markup) | ~30 من 42 | alerts data | 🟢 Low |
| **Inline styles → classes** (157) | — | employees.css | 🟢 Low |
| **Inline events → delegation** (76) | — | wiring | 🟢 Low |

---

## 5. Modal Inventory

| # | ID | الغرض | الأسطر | Dependencies | External refs | Risk |
|---|-----|-------|-------:|--------------|---------------|:----:|
| 1 | `ov-absent-wa` | تذكير واتساب للغائبين | 16 | wa-msg-text, absent-emp-list (populated) | openAbsentWa | 🟢 Low |
| 2 | `ov-emp` | موظف جديد/تعديل | 59 | 13 field ids (e-name/phone/role/nid/start/status/salary/commission/...) + updateSalaryUI + saveEmp | openAddEmp, openEditEmp, saveEmp | 🟢 Low |
| 3 | `ov-payroll` | يوم الرواتب (مالي) | 42 | pr-wallet/note/list/count/warn/total + checkPayrollWallet + confirmPayroll → **FSE PAYROLL** | openPayroll, confirmPayroll | 🔴 High |
| 4 | `ov-pay-one` | صرف مبلغ لموظف (مالي) | 48 | pay-one-* (10 ids) + updatePayOneAmount + confirmPayOne → **FSE SALARY_PAYMENT** + reverseSalaryTx → **FSE REVERSAL** | openPayOne, confirmPayOne | 🔴 High |
| 5 | `panel-ov` (drawer) | تفاصيل موظف (KPI/Att) | 9 (+ JS-filled) | pn-hdr, panel-body (innerHTML من openKpiPanel/openAttPanel) | openKpiPanel, openAttPanel, closePanel | 🟠 Medium |

> **ملاحظة:** modals 3+4 **مالية** — تستدعي `dispatchFinancialEvent` مباشرة (drift A1/H1.1). استخراج الـ markup آمن، لكن **منطق** `confirmPayroll`/`confirmPayOne`/`reverseSalaryTx` يبقى في الصفحة بلا تغيير (إصلاح الـ drift = خارج النطاق).

---

## 6. Event Flow Map

| Source | Target | Dependency |
|--------|--------|------------|
| Topbar buttons (`onclick="openPayroll/openAddEmp"`) | inline | يحتاج → listeners |
| Stats cards (`onclick="applyStatFilter('x')"` ×4) | inline + `data-sf` | يحتاج → delegation |
| Period pills (`onclick="setPeriod('x')"` ×5) | inline + `data-p` | يحتاج → delegation |
| Search/role/toggles (`oninput`/`onchange`/`onclick` ×5) | inline | يحتاج → listeners |
| Sort menu (`onclick="setSort('x')"` ×6 + stopPropagation) | inline + `data-s` | يحتاج → delegation |
| Modal closers (`onclick="...classList.remove('open')"` ×4) | inline | يحتاج → `data-close` |
| Modal saves (`onclick="saveEmp/confirmPayroll/confirmPayOne"`) | inline | يحتاج → `data-act` |
| **renderList rows** (act-menu, openPanel, openPayOne — 17 inline) | dynamic innerHTML | يحتاج → delegation على `#list` |
| payroll rows (`onclick="togglePayrollRow"` ×N) | dynamic | يحتاج → delegation على `#pr-list` |
| reverseSalaryTx (inline onclick in pay-one-history) | dynamic, **financial** | يحتاج → delegation (بحذر) |

**أنماط delegation المطلوبة:** `#list` (board), `#pr-list` (payroll), `#pay-one-history-list` (reverse), `#stats-row`, `.sticky-bar`, `#sort-menu`, modals.

---

## 7. Business Logic Boundary Check

| الفحص | النتيجة |
|------|---------|
| `employeeActions.*` | ✅ 5 calls (setEmployeeStatus, upsertEmployeeGoal, upsertEmployeeEvaluation, updateEmployeeProfile, createEmployeeWithUser) |
| Direct Firestore writes | ✅ **0** |
| Firestore reads | 7 `onSnapshot` (employees, orders, transactions_v2, wallets, attendance, goals, evaluations) — bounded بـ `limit()` ✅ |
| **Financial actions** | ⚠️ **3 `dispatchFinancialEvent` مباشرة** (PAYROLL س1637, SALARY_PAYMENT س1781, SALARY_PAYMENT_REVERSAL س1797) |
| Permission checks | ✅ `canDo('manage_employees', currentRole)` (س1428) |

### 🔴 مناطق خلط UI + Business Logic:
1. **`confirmPayroll` (س1620–1655):** يقرأ DOM (pr-wallet, selected rows) → يبني payload → `dispatchFinancialEvent(FE.PAYROLL)` مباشرة. **خلط UI + financial write.**
2. **`confirmPayOne` (س1764–1793):** نفس النمط → `dispatchFinancialEvent(FE.SALARY_PAYMENT)`.
3. **`reverseSalaryTx` (س1794+):** → `dispatchFinancialEvent(FE.SALARY_PAYMENT_REVERSAL)`.

> **هذه drift سابقة للمشروع** (A1/H1.1: المال عبر `employeeActions.*` لا FSE مباشرة من UI). **خارج نطاق Phase 3** (إصلاحها = business logic change). تُسجَّل كـ **debt مستقل** يُعالَج في PR منفصل (نقلها لـ `employeeActions.recordPayroll/recordPayment/reversePayment`). **أثناء Phase 3: لا تُلمَس.**

---

## 8. Risk Matrix

| الفرصة | Risk | السبب |
|--------|:----:|-------|
| Inline styles → classes (157) | 🟢 Low | نمط مُثبَت (2.1)، قيم 1:1 |
| Inline events → delegation (76) | 🟢 Low | نمط مُثبَت، data-attrs موجودة جزئياً |
| Skeleton/stats/toolbar/alerts builders | 🟢 Low | markup شبه نقي، closure ضيق |
| Employee form modal + absent-wa | 🟢 Low | populate-by-id، نفس آلية 2.3 |
| **renderList board builder** | 🟠 Medium | 279 سطر، closure واسع (kpi/status/period/escapeHtml)، 17 inline event، act-menus |
| KPI panel + Att panel builders | 🟠 Medium | drawer markup، closure على goals/evaluations/attendance |
| **Payroll modal + Pay-one modal** | 🔴 High | **مالية** — markup آمن لكن مجاور لـ `dispatchFinancialEvent` drift؛ chaos tests (H2.6) |
| إصلاح الـ FSE drift | 🔴 High (خارج النطاق) | business logic change، يحتاج `employeeActions` جديدة + tests |

---

## 9. End-State Architecture

```
employees.html  (Shell Only — هدف < 1500، مثاليًا < 700)
   │  • <head> + assets
   │  • sidebar + topbar + #stats-row + .sticky-bar + #list + #modal-host + #panel-ov
   │  • bootstrap: imports + auth + 7 onSnapshot listeners + event wiring
   │  • business logic: employeeActions.* + (drift: FSE calls — تبقى مؤقتاً)
   ▼
features/employees/views/   (🆕 مجلد جديد)
   ├── render-employees-board.js   🆕 (renderList markup — الأكبر)
   ├── render-stats-row.js         🆕 (updateStats markup + 8 cards)
   ├── render-toolbar.js           🆕 (period/search/sort/filters scaffold)
   ├── render-filter-chips.js      🆕
   ├── render-skeleton.js          🆕 (renderSkeleton)
   ├── render-alerts.js            🆕 (renderAlerts markup)
   ├── render-kpi-panel.js         🆕 (openKpiPanel markup)
   ├── render-att-panel.js         🆕 (openAttPanel markup)
   └── render-modals.js            🆕 (4 modals: emp, absent-wa, payroll, pay-one)
```

**يبقى داخل `employees.html`:**
- Bootstrap (auth, listeners, wiring), state management.
- كل الـ business logic: `saveEmp`, `confirmPayroll`, `confirmPayOne`, `reverseSalaryTx`, calc functions, filters/sort/pagination logic.
- استدعاءات `employeeActions.*` + (drift FSE — حتى يُعالَج منفصلاً).

**ينتقل خارجاً:** كل الـ markup (build*HTML pure functions) + استخراج modals (render-modals.js + #modal-host).

> **هل مجلد جديد `features/employees/views/`؟** نعم — `employees.html` ليس له views حالياً (عكس employee-profile). يُنشأ مجلد مخصص يطابق `features/employee-profile/views/`.

---

## 10. Line Reduction Forecast

```
employees.html : 1810 سطر (حالياً)

Phase A (Low risk — styles+events+small builders):
  - inline styles → employees.css       (-0 صافي، نقل لا حذف؛ لكن يبسّط)
  - inline events → delegation          (+wiring، -inline)
  - skeleton + stats + toolbar + alerts + chips builders  (~-180 صافي)
  ≈ 1630

Phase B (Medium — board + panels):
  - render-employees-board.js  (renderList markup ~-160)
  - kpi-panel + att-panel builders  (~-90)
  ≈ 1380  ✅ تحت 1500

Phase C (Medium-High — modals، بحذر مالي):
  - render-modals.js (4 modals، markup فقط، ~-150)
  - #modal-host injection
  ≈ 1230

الحجم النهائي المتوقع : ~1200–1300 سطر
```

| المرحلة | الحجم المتوقع | تحت 1500؟ |
|---------|:-------------:|:---------:|
| الحالي | 1810 | ❌ |
| بعد Phase A | ~1630 | ❌ |
| بعد Phase B | ~1380 | ✅ |
| بعد Phase C | ~1230 | ✅ |

> **ملاحظة:** الـ FSE drift (3 calls) لو عولج لاحقاً (نقل المنطق لـ employeeActions) يخفض ~60 سطراً إضافية → ~1170. لكنه **خارج نطاق التفكيك** (business logic change).

---

## 11. Exit Criteria

`employees.html` decomposition ناجح عند تحقّق **كل** ما يلي:

| المعيار | الهدف |
|---------|-------|
| **Static inline styles** | **0** (157 → classes) |
| **Inline events** | **0** (76 → delegation) |
| **Runtime styles** | محفوظة (17 — U1.6) |
| **Local `<style>`** | 0 (موجود) |
| **Duplicated markup** | act-menu/payroll-row/stat موحَّدة عبر builders |
| **Shell-only responsibilities** | الصفحة = bootstrap + listeners + business logic؛ كل markup في views |
| **حجم الملف** | < 1500 (مثاليًا < 1300) |
| **Business logic** | IDENTICAL (saveEmp/payroll/payOne/reverse بلا تغيير) |
| **Firestore** | 0 direct writes (محفوظ)؛ 7 reads IDENTICAL |
| **FSE drift** | **لا يُلمَس** في التفكيك (يُسجَّل كـ debt منفصل) |
| **Financial modals** | markup فقط يُستخرَج؛ confirmPayroll/PayOne logic يبقى؛ chaos tests قبل دمج |
| **Visual regression** | صفر |
| **CI** | 4/4 خضراء |
| **Reversibility** | كل builder/modal = PR صغير قابل للـ revert |

### تسلسل التنفيذ المقترح (PRs، عند الموافقة):
1. **PR 3.1 (Low):** inline styles → classes + inline events → delegation (يحقق inline=0).
2. **PR 3.2 (Low):** skeleton + stats + toolbar + alerts + chips builders.
3. **PR 3.3 (Medium):** render-employees-board.js (renderList — الأكبر).
4. **PR 3.4 (Medium):** kpi-panel + att-panel builders.
5. **PR 3.5 (Low-Medium):** render-modals.js للـ modals غير المالية (emp + absent-wa).
6. **PR 3.6 (High، منفصل):** payroll + pay-one modals (markup فقط) + chaos tests — **بدون لمس FSE logic**.
7. **(مستقبلي، خارج Phase 3):** نقل FSE drift لـ employeeActions.

---

## ⛔ لم يُنفَّذ أي شيء
تقرير تحليل فقط، evidence-based (file:line + counts فعلية). صفر code changes · صفر refactor · صفر file creation · صفر moving markup · صفر logic/Firestore changes.
