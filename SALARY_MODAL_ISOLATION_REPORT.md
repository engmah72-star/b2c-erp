# Salary Modal Isolation Report (Phase 2.4 Preparation)

> **النطاق:** تقرير تقييم فقط لعزل/استخراج الـ salary modal (`ov-salary`) من `employee-profile.html` (1732 سطر بعد 2.3). **لا تنفيذ.**
> **القاعدة الحاكمة:** RULE L1.5 · H2.6 (chaos tests للمالية) · G6/RULE 2 (FSE) · E1/G9.
> آخر تحديث: 2026-05-31 · الفرع: `claude/employee-module-architecture-9qZX1`

---

## 0. الخلاصة التنفيذية

| المؤشر | القيمة |
|--------|-------:|
| **Salary modal markup** (`ov-salary`) | **72 سطر** (101–172 في الصفحة) |
| **Salary logic** (6 دوال) | **179 سطر** |
| **IDs** | **15** (1 overlay + 14 field) |
| **Event handlers** | 4 listeners + 3 data-act + 1 querySelector |
| **مالية؟** | 🔴 **نعم** — `confirmSalary` → `employeeActions.recordSalaryPayment` → FSE |
| **المخاطرة** | 🔴 High (الأعلى في القسم) |

> **الخلاصة:** الـ markup قابل للاستخراج byte-identical (مثل الـ 6 modals). **لكن** الجزء الحرج هو **منطق** الـ salary (179 سطر، أكبرها `updateSalaryCalc` 70 سطر) المرتبط بـ 14 ID + عملية مالية. استخراج الـ markup وحده **يخفض ~64 سطراً فقط** ولا يصل بالصفحة تحت 1500. الوصول تحت 1500 يتطلب نقل **منطق** salary لطبقة وسيطة — وهو الأعلى مخاطرة (مالي) ويحتاج chaos tests يدوية.

---

## 1. Salary Modal — Line Count

| الجزء | الموقع | الأسطر |
|------|--------|-------:|
| **Markup** `ov-salary` | 101–172 | **72** |
| `openSalary()` | 1545–1561 | 17 |
| `closeSalModal()` | 1524–1528 | 5 |
| `computeSuggestedForMonth()` | 1503–1509 | 7 |
| `updateSalaryCalc()` | 1563–1632 | **70** ← الأثقل |
| `updateAmountHint()` | 1634–1646 | 13 |
| `confirmSalary()` | 1648–1688 | **41** (مالي) |
| **إجمالي المنطق** | | **153** |
| wiring (4 listeners + 2 data-act) | 394-410 | ~7 |
| **الإجمالي الكلي** | | **~232 سطر** |

---

## 2. Salary Dependencies

| التبعية | المصدر | الاستخدام |
|---------|--------|-----------|
| `computeSalarySuggestion` | `core/employee-salary-calc.js` | الحساب النقي (في `computeSuggestedForMonth` + `updateSalaryCalc`) — **مركزي بالفعل** ✅ |
| `employeeActions.recordSalaryPayment` | `employee-actions.js` | الكتابة المالية (في `confirmSalary`) — **عبر FSE** ✅ |
| `buildSalariesHTML` | `views/render-salary.js` | عرض سجل المرتبات (`renderSalaries`) — **مُستخرَج بالفعل** ✅ |
| **closure state** (page globals) | الصفحة | `emp`, `empId`, `empSalaries`, `attendanceRecords`, `empLeaves`, `allOrders`, `wallets`, `salaryData`, `currentUser`, `adminName`, `now`, `MONTHS`, `fn`, `gv`, `sv`, `setText`, `toast` |

> **ملاحظة مهمة:** الحساب (`computeSalarySuggestion`) والكتابة (`recordSalaryPayment`) **مركزيان بالفعل**. الـ 179 سطر المتبقية في الصفحة = **glue/orchestration + DOM manipulation** (قراءة IDs، toggle calc box، بناء innerHTML للملخصات). هذه هي التي قد تُنقل — لكنها مرتبطة بـ **closure state واسع** (17 متغير).

---

## 3. Salary Event Map

| الحدث | المصدر | المُعالِج | متى |
|------|--------|----------|-----|
| `change` على `sal-month-sel` | listener (س407) | `updateSalaryCalc()` | bootstrap |
| `change` على `sal-type` | listener (س408) | `updateSalaryCalc()` | bootstrap |
| `input` على `sal-amount` | listener (س409) | `dataset.edited='1'` + `updateAmountHint()` | bootstrap |
| `input` على `sal-notes` | listener (س410) | `dataset.edited='1'` | bootstrap |
| click `data-act="close-sal-modal"` (×2) | EP_STATIC_ACTS (س394) | `closeSalModal()` | bootstrap |
| click `data-act="confirm-salary"` | EP_STATIC_ACTS (س395) | `confirmSalary()` 🔴 | bootstrap |
| click `data-act="open-salary"` | delegation (#main-content س439 + topbar س420) | `openSalary()` | runtime |
| `querySelector('#ov-salary .btn-g')` | داخل `confirmSalary` (س1660) | يعطّل الزر أثناء الحفظ | runtime |

> **نقطة حساسة (نفس الـ 6 modals):** الـ 4 listeners + close/confirm مربوطة بالـ ID عند bootstrap. لو نُقل الـ markup للـ `render-modals.js` (يُحقَن قبل الـ wiring) → تعمل بلا تغيير. **`querySelector('#ov-salary .btn-g')` يتطلب الحفاظ على `.btn-g` للزر** (موجود).

---

## 4. Salary ID Map

| ID | يُقرأ/يُكتب في | النوع |
|----|----------------|-------|
| `ov-salary` | openSalary/closeSalModal (classList) | overlay |
| `sal-modal-title` | openSalary (setText) | display |
| `sal-month-sel` | openSalary (populate) · updateSalaryCalc (read) · listener | **input + listener** |
| `sal-type` | updateSalaryCalc (read) · listener | **input + listener** |
| `sal-calc-box` | updateSalaryCalc (`style.display` toggle) | runtime toggle |
| `sal-base` | updateSalaryCalc (setText) | display |
| `sal-commission` | updateSalaryCalc (setText) | display |
| `sal-total` | updateSalaryCalc (setText) | display |
| `sal-paid-summary` | updateSalaryCalc (`style.display` + innerHTML) | runtime toggle |
| `sal-attendance-detail` | updateSalaryCalc (`style.display` + innerHTML) | runtime toggle |
| `sal-amount` | updateSalaryCalc/updateAmountHint/confirmSalary (read) · listener · `dataset.edited` | **input + listener + dataset** |
| `sal-amount-hint` | updateAmountHint (innerHTML) | display |
| `sal-wallet` | openSalary (populate) · confirmSalary (gv read) | input |
| `sal-paid-warn` | updateSalaryCalc (`style.display`) | runtime toggle |
| `sal-notes` | openSalary/confirmSalary (gv) · listener · `dataset.edited` | **input + listener + dataset** |

**15 ID** — كلها مترابطة مع المنطق (لا ID معزول). **4 منها (`sal-month-sel/type/amount/notes`) لها bootstrap listeners** + 2 منها `dataset.edited`. **4 منها toggle عبر `style.display`** (runtime، تبقى في المنطق).

---

## 5. Feasibility of Extraction

### 5.1 استخراج الـ Markup فقط (مثل الـ 6 modals — Low effort)
| | الحالة |
|--|--------|
| Byte-identical ممكن؟ | ✅ نعم (نفس آلية render-modals.js: builder + حقن في #modal-host قبل الـ wiring) |
| يحتاج rebinding؟ | ❌ لا (الحقن قبل الـ wiring) |
| الأثر على الأسطر | **−64 سطر** (72 markup − ~8 host/import) → الصفحة ~1668 |
| تحت 1500؟ | ❌ **لا** |
| المخاطرة | 🟡 Medium (markup فقط، لكن الزر `.btn-g` + listeners حساسة) |

### 5.2 نقل المنطق (Salary logic relocation — High effort, High risk)
| | الحالة |
|--|--------|
| ممكن؟ | ✅ نظرياً (لطبقة `salary-modal-controller.js` أو ضمن `render-salary.js`) |
| العائق | **closure state واسع** (17 متغير page-global) → يتطلب تمريرها أو dependency injection |
| مالي؟ | 🔴 **نعم** — `confirmSalary` → `recordSalaryPayment` → FSE → wallets |
| يحتاج | chaos tests يدوية (H2.6): double-click confirm · parallel tabs · refresh أثناء الحفظ · idempotency check |
| الأثر على الأسطر | **−~160 سطر** → الصفحة ~1508 (قريب من 1500) |
| المخاطرة | 🔴 **High** (الأعلى — مالي + state coupling) |

---

## 6. Remaining Path to <1500 Lines

```
employee-profile.html : 1732 سطر (بعد 2.3)

الخيارات للوصول تحت 1500:

السيناريو أ — markup فقط (Low):
  1732 − 64 (ov-salary markup → render-modals.js) = ~1668  ❌ لسه > 1500

السيناريو ب — markup + logic (High, مالي):
  1668 − 160 (salary logic → controller) = ~1508  ⚠️ قريب، قد لا يكفي

السيناريو ج — markup + logic + overview/admin renderers (الأشمل):
  نقل أيضاً renderScore/renderGoals/renderBehavior/renderInsights/
  renderClients/renderEvaluations wrappers (~80 سطر glue) →
  ~1508 − 80 = ~1428  ✅ تحت 1500
```

### التوصية للوصول تحت 1500 (بأقل مخاطرة):
1. **2.4a (Medium):** استخراج `ov-salary` markup فقط → `render-modals.js` (يكمل الـ modals). الصفحة → ~1668. **لا مخاطرة مالية** (markup فقط).
2. **2.4b (High, منفصل):** نقل salary logic (`updateSalaryCalc`/`updateAmountHint`/`confirmSalary`) لطبقة controller، مع **chaos tests إلزامية** قبل الدمج. الصفحة → ~1508.
3. **2.5 (Low, إن لزم):** نقل باقي الـ render wrappers (overview/admin glue) لخفض إضافي → < 1450.

> **بديل أبسط:** بما أن الهدف "< 1500" هو حدّ G5/H1.7 (warning، ليس freeze حتى 2500)، يمكن الاكتفاء بـ **2.4a (markup)** الآمن، وتأجيل نقل المنطق المالي (2.4b) حتى تتوفر بيئة اختبار — الصفحة تبقى ~1668 (تحت freeze 2500، فوق warning 1500).

---

## 7. Risk Matrix (Salary)

| الجزء | المخاطرة | السبب |
|------|:--------:|-------|
| `ov-salary` markup → render-modals.js | 🟡 Medium | byte-identical ممكن؛ لكن `.btn-g` + 4 listeners حساسة (نفس آلية 2.3) |
| `closeSalModal` / `openSalary` | 🟡 Medium | DOM populate + classList؛ closure على `emp`/`wallets` |
| `updateSalaryCalc` / `updateAmountHint` | 🟠 Medium-High | 70+13 سطر، closure واسع، style.display toggles، innerHTML builds |
| `confirmSalary` | 🔴 **High** | **مالي** — recordSalaryPayment → FSE → wallets؛ يحتاج idempotency + chaos tests |

---

## 8. الخلاصة والتوصية

| السؤال | الإجابة |
|--------|---------|
| Salary modal markup line count | **72 سطر** |
| Salary logic line count | **153 سطر** (6 دوال) |
| IDs | **15** (كلها مترابطة) |
| Event map | 4 listeners + 3 data-act + 1 querySelector |
| Feasibility (markup) | ✅ سهل، byte-identical، نفس آلية 2.3 |
| Feasibility (logic) | ⚠️ ممكن لكن High risk (مالي + 17-var closure) |
| Path to <1500 | markup وحده **لا يكفي** (~1668)؛ يحتاج logic relocation (~1508) أو render-wrappers إضافية (~1428) |

**التوصية:**
- **Phase 2.4a (آمن):** استخراج `ov-salary` **markup فقط** → `render-modals.js` (يُكمل الـ 7 modals). يخفض لـ ~1668 بلا مخاطرة مالية.
- **Phase 2.4b (منفصل، عند توفر بيئة اختبار):** نقل salary **logic** لطبقة controller مع **chaos tests إلزامية (H2.6)** — هذا وحده يصل بالصفحة قرب 1500.
- إن كان الهدف الفوري هو إزالة كل الـ modals من الصفحة (اتساق معماري) دون مخاطرة مالية → **2.4a كافٍ**؛ نقل المنطق المالي يبقى قراراً منفصلاً.

---

## ⛔ لم يُنفَّذ أي شيء
تقرير تقييم فقط. صفر استخراج · صفر تعديل logic · صفر تعديل Firestore · صفر تعديل event flow.
