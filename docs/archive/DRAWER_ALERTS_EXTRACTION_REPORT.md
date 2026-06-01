# Drawer / Alerts / Stats Extraction Report (Phase 3C Preparation)

> **النطاق:** تقرير تحليل فقط للكتل غير-المالية المتبقية في `employees.html` (1791 سطر بعد 3B). **لا تنفيذ، لا نقل كود.**
> **القاعدة الحاكمة:** RULE L1.5 · A1/H1.1 · E1/G9. **لا لمس:** Financial Modals · Payroll/Salary Logic · FSE Debt · Firestore.
> آخر تحديث: 2026-05-31 · الفرع: `claude/employee-module-architecture-9qZX1`

---

## 0. الخلاصة التنفيذية + الإجابة الحاسمة

| المؤشر | القيمة |
|--------|-------:|
| `employees.html` الحالي | **1791 سطر** (god page > 1500) |
| كتل غير-مالية قابلة للاستخراج | drawers (kpi+att) · alerts · skeleton · non-financial modals |
| **هل `< 1500` ممكن بدون لمس المالية؟** | ❌ **لا** — الاستخراج غير-المالي الكامل يصل لـ **~1600 فقط** |
| للوصول `< 1500` | يلزم إضافة: **markup الـ financial modals** (markup-only، logic يبقى) → ~1518، **أو** نقل helpers نقية لـ `core/` (logic relocation) |
| Stats كـ builder؟ | ❌ **لا** — `updateStats` هي `setText`/`animateCount` فقط؛ الـ stat cards **static scaffold** بالفعل |

> **الإجابة المباشرة على سؤال المرحلة:** استخراج كل الـ drawers + alerts + skeleton + non-financial modals يخفض `employees.html` من 1791 إلى **~1600** — **لا يصل تحت 1500**. الكتل الكبيرة المتبقية بعدها **مالية** (saveEmp غير مالي لكن payroll/payOne/reverse + modaليهما مالية) أو **logic** (calcKpiBreakdown). الوصول تحت 1500 يتطلب قراراً منفصلاً (markup مالي بدون logic، أو نقل helpers).

---

## 1. Drawer Inventory

النظام فيه **drawer واحد ثابت** (`panel-ov`) يُملأ بمحتوى من دالتين:

| Drawer/Filler | ID | الغرض | الأسطر | markup ينقل | IDs بالداخل | data-* | External refs | Events |
|---------------|-----|-------|-------:|:-----------:|-------------|--------|---------------|--------|
| **panel-ov** (scaffold) | `panel-ov`, `panel-inner`, `pn-hdr`, `panel-body` | الحاوية الثابتة (296–304) | 9 (يبقى) | — | 4 | `data-act="close-panel"` | delegated `#panel-ov` |
| **openKpiPanel** (filler) | يكتب في `pn-hdr`+`panel-body` | درج تقييم الأداء | 564–643 (80L) | ~56L | `kpi-g-att/ord/qlt`, `kpi-mgr-note`, `star-row`, `star-1..5` | `data-act="set-rating/save-goal/save-eval"` + `data-eid/uid/ename/mkey/...` | delegated `#panel-body` |
| **openAttPanel** (filler) | يكتب في `pn-hdr`+`panel-body` | درج سجل الحضور | 696–744 (49L) | ~31L | — | — (عرض فقط، لا أزرار) | لا أحداث داخلية |

**التصنيف:**
| Drawer | Risk | السبب |
|--------|:----:|-------|
| openAttPanel | 🟢 LOW | عرض فقط، لا form/أزرار، closure بسيط (attendanceRecords) |
| openKpiPanel | 🟡 MEDIUM | أكبر، فيه form inputs (3 أهداف + note) + star-row + 2 save buttons (مُفوَّضة على `#panel-body`)؛ closure على goal/eval/calcKpiBreakdown + الـ inner helper `axisRow` |

---

## 2. Stats Inventory

| Block | الأسطر | Dynamic | Runtime styles | Dependencies | Reusable |
|------|-------:|---------|----------------|--------------|:--------:|
| **stat cards (scaffold)** | 62–71 (10L) | — (static HTML) | `--sc:var(--X)` → **محوّلة لـ classes `emp2-sc-*` في 3A** | — | منخفض |
| **updateStats** (logic) | 837–887 (51L) | يحسب 11 قيمة | — | employees, attendanceRecords, allOrders, transactions, periodFilter | يبقى |

### هل استخراج Stats byte-identical؟ **N/A — ليست builder.**
`updateStats` **لا تبني markup إطلاقاً** — تستدعي `setText`/`animateCount` على IDs الـ stat cards الثابتة (`s-total`, `s-working-now`, ...). الـ markup للـ stat cards **static scaffold بالفعل** (10 أسطر، مع classes مُحوَّلة في 3A).

**الخلاصة:** لا يوجد "Stats builder" ذو قيمة. استخراج الـ 10 أسطر الثابتة لـ JS builder:
- يتطلب تحويل `stats-row` من static HTML إلى JS-rendered (أكثر تدخّلاً).
- يخفض ~8 أسطر فقط بقيمة منخفضة + مخاطرة أعلى (يكسر نمط "الـ scaffold ثابت").
- **غير موصى به.**

---

## 3. Alerts Inventory

| Section | الغرض | الأسطر | Dynamic content | markup ينقل | Events | External refs |
|---------|-------|-------:|-----------------|:-----------:|--------|---------------|
| **emp-alerts** (scaffold) | الحاوية (116) | 1 (يبقى) | — | — | delegated `#emp-alerts` (toggle-alerts, dismiss-alert) | — |
| **renderAlerts** (filler) | بناء بانر تنبيهات الفريق | 499–539 (41L) | alerts[] (noatt/late/pressure) | ~19L (520–538) | `data-act="toggle-alerts"`, `data-act="dismiss-alert" data-key` | employees, attendanceRecords, allOrders, ROLES, `__dismissedAlerts`, `__alertsCollapsed` |

**التصنيف:** 🟢 **LOW** — الـ markup (~19L) ينقل؛ الـ logic (حساب alerts + dismiss/collapse state) يبقى. delegated على `#emp-alerts` (scaffold container) → صفر أثر.

> **ملاحظة:** `renderAlerts` يقرأ/يكتب `el.dataset.userToggled` و `__alertsCollapsed` (state) — يجب أن تبقى في الصفحة؛ فقط الـ markup string ينقل.

---

## 4. Extraction Candidates (non-financial)

| Candidate | Lines (function) | markup ينقل | net reduction | Risk |
|-----------|-----------------:|:-----------:|:-------------:|:----:|
| **renderSkeleton** | 17 | ~17 (pure) | **−14** | 🟢 Low |
| **renderAlerts** markup | 41 | ~19 | **−18** | 🟢 Low |
| **openAttPanel** markup | 49 | ~31 | **−29** | 🟢 Low |
| **openKpiPanel** markup | 80 | ~56 | **−56** | 🟡 Medium |
| **non-financial modals** (ov-emp 59 + ov-absent-wa 16) | 75 (scaffold) | ~75 | **−73** | 🟡 Medium |
| stats cards (optional) | 10 (scaffold) | ~9 | −8 | 🟡 Medium (يكسر static pattern) |
| **الإجمالي non-financial** | | | **~−190** (بدون stats) | |

> **ملاحظة:** الـ financial modals (ov-payroll 42L + ov-pay-one 48L = 90L) **markup قابل للاستخراج تقنياً** (logic يبقى) لكنه **خارج نطاق المرحلة** (الهدف: بدون لمس المالية).

---

## 5. ID & Data Attribute Analysis

| Candidate | IDs | data-act | data-* أخرى | runtime attrs |
|-----------|-----|----------|-------------|---------------|
| renderSkeleton | 0 | 0 | 0 | 0 (كله static markup) |
| renderAlerts | `alerts-banner` | `toggle-alerts`, `dismiss-alert` | `data-key` | `style="...color:${a.col}"` (1 dynamic) |
| openAttPanel | 0 | 0 | 0 | عدة `style="...${...}"` (runtime، تنقل مع markup) |
| openKpiPanel | `kpi-g-att/ord/qlt`, `kpi-mgr-note`, `star-row`, `star-${s}` | `set-rating`, `save-goal`, `save-eval` | `data-eid/uid/ename/mkey/erole/att/prod/qual/total/monthatt/rating` | عدة runtime styles |
| non-fin modals | `e-name/phone/role/nid/start/status/salary/commission/...`, `wa-msg-text`, `absent-emp-list`, `emp-title`, `save-btn` | `save-emp`, modal-close | — | — |

**هل تبقى byte-identical بعد الاستخراج؟** ✅ **نعم لكلها** — نفس نهج Phase 3B (template verbatim + اختبار byte-identical آلي). الـ runtime styles تنقل مع الـ markup (مثل board: 7 ديناميكية انتقلت). الـ IDs تُبنى من نفس المدخلات.

---

## 6. Event Compatibility Check

| Candidate | Current Listener | Current Selector | Delegation Zone | Extraction Impact |
|-----------|------------------|------------------|-----------------|:-----------------:|
| renderSkeleton | — | — | — | ✅ صفر (لا أحداث) |
| renderAlerts | `#emp-alerts` click | `[data-act="toggle-alerts/dismiss-alert"]` | `#emp-alerts` (scaffold) | ✅ صفر |
| openAttPanel | — | — | `#panel-body` (عرض فقط) | ✅ صفر |
| openKpiPanel | `#panel-body` click | `[data-act="set-rating/save-goal/save-eval"]` | `#panel-body` (scaffold) | ✅ صفر |
| non-fin modals | bootstrap `[data-act]` + `[data-close]` | `data-act="save-emp"`, `data-close` | `#modal-host` (injected before wiring) | ✅ صفر (نمط 2.3) |

**Event Flow Preserved: ✅ YES (لكل المرشّحين)** — كل المحتوى يُحقَن في حاويات scaffold مستقرة (`#emp-alerts`, `#panel-body`, `#pn-hdr`, `#modal-host`) ذات listeners مُفوَّضة ثابتة. الاستخراج ينتج **نفس الـ HTML string** → صفر أثر على الـ delegation/listeners/selectors (مُثبَت في 3B).

---

## 7. Line Reduction Forecast

```
employees.html : 1791 سطر (حالياً، بعد 3B)

After Skeleton extraction:        1791 − 14 = 1777
After Alerts extraction:          1777 − 18 = 1759
After AttPanel drawer extraction: 1759 − 29 = 1730
After KpiPanel drawer extraction: 1730 − 56 = 1674
After non-financial modals:       1674 − 73 = 1601
(+ imports overhead ~+6)                  ≈ 1607
─────────────────────────────────────────────────
Expected (non-financial only):    ≈ 1600  ❌ NOT < 1500
─────────────────────────────────────────────────
+ Financial modals MARKUP only (ov-payroll+ov-pay-one, logic untouched):
                                  1600 − 88 = ≈ 1512  ⚠️ لا يزال > 1500 بقليل
+ helper relocation (calcKpiBreakdown 56 + animateCount/levenshtein/
  suggestName/nameToColor → core/, logic relocation):
                                  ≈ 1512 − 80 = ≈ 1432  ✅ < 1500
```

### هل `< 1500` بدون لمس المالية؟
**❌ لا.** أفضل ما يمكن بلوغه من الاستخراج غير-المالي = **~1600**. حتى إضافة **markup الـ financial modals** (بدون logic) يصل لـ **~1512** (لا يزال فوق 1500 بقليل). الوصول القاطع تحت 1500 يتطلب **نقل helpers نقية لـ `core/`** (calcKpiBreakdown, animateCount, levenshtein, suggestName, nameToColor) — وهي logic relocation منفصلة.

---

## 8. Risk Matrix

| Candidate | Risk | التبرير |
|-----------|:----:|---------|
| renderSkeleton | 🟢 LOW | markup نقي، لا closure، لا dynamic، لا أحداث |
| renderAlerts | 🟢 LOW | markup فقط ينقل؛ state (dismiss/collapse) يبقى؛ delegated على scaffold |
| openAttPanel | 🟢 LOW | عرض فقط، لا form/أزرار؛ closure بسيط (attendanceRecords) |
| openKpiPanel | 🟡 MEDIUM | form inputs (3 أهداف + note) + star-row + 2 save buttons؛ closure على goal/eval/calcKpiBreakdown + inner helper `axisRow`؛ سطح معاملات أكبر |
| non-financial modals (ov-emp, ov-absent-wa) | 🟡 MEDIUM | markup-only (نمط 2.3)؛ ov-emp فيه populate-by-id كثيف (13 حقل) + updateSalaryUI/saveEmp triggers (تبقى)؛ يحتاج `#modal-host` + حقن قبل الـ wiring |
| financial modals markup (ov-payroll, ov-pay-one) | 🔴 HIGH (خارج النطاق) | مجاور لـ confirmPayroll/confirmPayOne → FSE؛ markup فقط لكن حساسية مالية + chaos tests |
| helper relocation (→ core/) | 🟠 MEDIUM (خارج النطاق) | logic relocation، يحتاج tests، يمسّ calcKpiBreakdown |

---

## 9. Target Architecture

```
features/employees/views/
├── render-employees-board.js     ✅ قائم (3B)
├── render-employees-skeleton.js  🆕 (renderSkeleton — pure markup)
├── render-employees-alerts.js    🆕 (renderAlerts markup)
├── render-employees-drawer.js    🆕 (buildKpiPanelHTML + buildAttPanelHTML)
└── render-employees-modals.js    🆕 (ov-emp + ov-absent-wa — non-financial only)
```

### يبقى داخل `employees.html`:
- **كل الـ logic:** filter/sort/pagination, updateStats (setText), calcKpiBreakdown, alerts computation, attendance filtering, populate-by-id, state (dismissed/collapsed/currentPage).
- **كل المالية:** confirmPayroll/confirmPayOne/reverseSalaryTx + الـ 3 dispatchFinancialEvent (FIN-D1) + الـ financial modals scaffold (ov-payroll, ov-pay-one).
- **كل Firestore:** 7 onSnapshot + employeeActions.
- Bootstrap + event wiring + الـ stat cards الثابتة.

### ينتقل خارجاً (markup فقط):
skeleton · alerts banner · kpi-panel drawer body · att-panel drawer body · non-financial modals (employee form + absent-wa).

---

## 10. Recommendation — ترتيب التنفيذ

| # | Candidate | Risk | Net | السبب |
|---|-----------|:----:|----:|-------|
| 1 | **renderSkeleton** | 🟢 Low | −14 | الأبسط، markup نقي، إثبات نمط بصفر مخاطرة |
| 2 | **renderAlerts** | 🟢 Low | −18 | markup صغير، delegated scaffold |
| 3 | **openAttPanel drawer** | 🟢 Low | −29 | عرض فقط، لا أحداث داخلية |
| 4 | **openKpiPanel drawer** | 🟡 Medium | −56 | الأكبر أثراً، يحتاج عناية (form + delegated buttons) — بعد إثبات النمط |
| 5 | **non-financial modals** (ov-emp + ov-absent-wa) | 🟡 Medium | −73 | نمط 2.3 (modal-host)؛ يصل لـ ~1600 |
| — | **توقف هنا** (~1600) | | | الهدف غير-المالي مكتمل |
| 6* | financial modals markup | 🔴 High | −88 | **منفصل، بقرار صريح**؛ markup-only + chaos tests → ~1512 |
| 7* | helper relocation → core/ | 🟠 Med | −80 | **منفصل**؛ logic relocation → < 1500 |

**التوصية:** نفّذ 1→5 (كلها غير-مالية، byte-identical، نمط مُثبَت من 3B) للوصول لـ **~1600**. ثم **قرار منفصل** بشأن كيفية بلوغ <1500 (financial markup أو helper relocation) — لأن كليهما يمسّ منطقة حسّاسة (مالية أو logic).

---

## Success Criteria — التقييم لكل المرشّحين غير-الماليين

| المعيار | الحالة |
|---------|:------:|
| Byte-identical output ممكن | ✅ YES (نمط 3B + اختبار آلي) |
| IDs preserved | ✅ |
| data-* preserved | ✅ |
| Event delegation unaffected (scaffold containers) | ✅ |
| Business logic untouched | ✅ (logic يبقى، markup فقط ينقل) |
| Financial flows untouched | ✅ (financial modals/logic خارج النطاق) |
| Firestore untouched | ✅ |

**كل المعايير مُحقَّقة** للمرشّحين 1–5. الوصول `<1500` يتطلب قراراً إضافياً (6/7).

---

## ⛔ لم يُنفَّذ أي شيء
تقرير تحليل فقط، evidence-based (file:line + counts فعلية). صفر code changes · صفر builder creation · صفر markup relocation · صفر logic/financial/Firestore changes.
