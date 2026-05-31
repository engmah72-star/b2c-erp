# Employee Profile — Modals Extraction Report (Phase 2.3 Preparation)

> **النطاق:** تقرير تقييم فقط لاستخراج الـ modals من `employee-profile.html` (1936 سطر). **لا تنفيذ، لا نقل كود.**
> **القاعدة الحاكمة:** RULE L1.5 (View builders) · E1/G9 (تدريجي، آمن) · نمط `render-tabs-shell.js` المُثبَت.
> آخر تحديث: 2026-05-31 · الفرع: `claude/employee-module-architecture-9qZX1`

---

## 0. الخلاصة التنفيذية

| المؤشر | القيمة |
|--------|-------:|
| **Static modals** (في الـ HTML scaffold) | **7** (276 سطر) |
| **Dynamic modals** (مبنية من JS) | **4** (2 تستخدم view builders بالفعل، 2 inline) |
| إجمالي IDs داخل الـ static modals | **41 id** (7 overlay + 34 field) |
| Inline styles/events داخل الـ static modals (بعد Phase 2.1) | **0** ✅ |
| **الفرق الجوهري عن Tabs Shell** | Tabs Shell = **render output** (يُعاد بناؤه كل renderAll). Modals = **static scaffold** يُملأ بالـ ID بعد الفتح → الاستخراج يحتاج **modal-host + حقن عند bootstrap** (ليس byte-identical تلقائياً) |

> **النتيجة المبكّرة:** الاستخراج **ممكن وآمن** لكنه **ليس متطابقاً مع نمط Tabs Shell حرفياً**. Tabs Shell كان جزءاً من `innerHTML` يُعاد توليده؛ الـ modals scaffold **ثابت** يعتمد عليه populate-by-ID + bootstrap wiring لمرة واحدة. الاستخراج الآمن = **حقن الـ modals في `#modal-host` بشكل متزامن قبل سطر الـ wiring (438)** → كل الـ IDs والـ listeners تعمل بلا تغيير.

---

## 1. Modal Inventory

### 1.1 Static Modals (7 — في الـ HTML، تُملأ بالـ ID)

| # | ID | الأسطر | السطور | الوظيفة | Static/Dynamic | إنشاء |
|---|-----|-------:|--------|---------|:--------------:|-------|
| 1 | `ov-task` | 29 | 98–126 | إضافة مهمة | Static | مرة واحدة، يُعاد استخدامه |
| 2 | `ov-edit-salary` | 29 | 129–157 | تعديل بيانات المرتب الأساسي | Static | مرة واحدة، يُعاد استخدامه |
| 3 | `ov-salary` | 72 | 160–231 | صرف/تسجيل مبلغ (الأكبر، calc box حيّ) | Static | مرة واحدة، يُعاد استخدامه |
| 4 | `ov-edit-skills` | 23 | 1783–1805 | تعديل المهارات | Static | مرة واحدة، يُعاد استخدامه |
| 5 | `ov-schedule` | 28 | 1808–1835 | جدول العمل | Static | مرة واحدة، يُعاد استخدامه |
| 6 | `ov-leave` | 39 | 1838–1876 | تسجيل إجازة/غياب | Static | مرة واحدة، يُعاد استخدامه |
| 7 | `ov-incident` | 56 | 1879–1934 | تسجيل إخفاق | Static | مرة واحدة، يُعاد استخدامه |
| | **الإجمالي** | **276** | | | | |

### 1.2 Dynamic Modals (4 — مبنية من JS، تُحقَن وتُحذَف)

| # | المُنشئ | الوظيفة | الحالة الحالية | إنشاء |
|---|---------|---------|----------------|-------|
| 8 | `openSetPasswordModal` | تعيين كلمة سر | ✅ يستخدم `buildSetPasswordModalHTML` (في `render-password-card.js`) | يُنشأ ويُحذف |
| 9 | `openRebuildAuthModal` | إعادة بناء حساب | ✅ يستخدم `buildRebuildAuthModalHTML` (في `render-password-card.js`) | يُنشأ ويُحذف |
| 10 | `showManualResetModal` | إعادة تعيين يدوي (fallback) | ⚠️ inline في الدالة (مُنظَّف Phase 2.1، events مربوطة بعد الإنشاء) | يُنشأ ويُحذف |
| 11 | `showTempPasswordModal` | عرض كلمة سر مؤقتة | ⚠️ inline في الدالة (مُنظَّف Phase 2.1) | يُنشأ ويُحذف |

> **ملاحظة:** modals 8–9 **مُستخرَجة بالفعل** (Phase سابقة). 10–11 inline لكن **خارج نطاق هذا التقرير** (ليست static scaffold؛ هي JS-created حياتها مُدارة داخل دوالها). التقرير يركّز على الـ **7 static**.

---

## 2. Dependency Map (للـ 7 static modals)

| Modal | يفتحه | يغلقه | يقرأ/يكتب عناصره |
|-------|-------|-------|------------------|
| `ov-task` | `openAddTask` (س1408) | `data-close="ov-task"` (×2) | `saveTask`: task-title/desc/pri/due/order |
| `ov-edit-salary` | `openEditSalary` (س993) | `data-close="ov-edit-salary"` (×2) | `saveEmpData`: edit-base-salary/commission/status |
| `ov-salary` | `openSalary` (س1596) | `closeSalModal` (`data-act`) | `updateSalaryCalc`/`updateAmountHint`/`confirmSalary`: 15 sal-* id + calc box توجّل + month/type change listeners |
| `ov-edit-skills` | `openEditSkills` (س852) | `data-close="ov-edit-skills"` (×2) | `addSkillTag`/`saveSkills`/`renderSkillsEdit`: skill-input/suggestions/tags-edit + Enter keydown + delegation |
| `ov-schedule` | `openEditSchedule` (س1470) | `data-close="ov-schedule"` (×2) | `saveSchedule`/`renderSchedPills`: sched-day-pills/start/end + pills delegation |
| `ov-leave` | `openAddLeave` (س1509) | `data-close="ov-leave"` (×2) | `saveLeave`/`calcLeaveDays`: lv-type/start/end/days-preview/reason + 2 input listeners |
| `ov-incident` | `openAddIncident` (س783) | `data-close="ov-incident"` (×2) | `saveIncident`: inc-type/severity/title/desc/date/order |

### آليات الوصول المستخدمة (DOM access patterns):
- **`getElementById`** — السائد (كل populate + read).
- **`gv`/`sv`/`setText`** — helpers تغلّف getElementById (`gv('sal-wallet')`, `sv('task-title','')`).
- **`querySelectorAll('[data-close]')`** + **`querySelectorAll('.overlay [data-act]')`** — bootstrap wiring (س438/453).
- **`querySelector('#ov-salary .btn-g')`** — في `confirmSalary` (س ~1700) للوصول لزر التأكيد.
- **`closest`** — في الـ delegation (`e.target.closest('[data-skill]')` إلخ) + الـ dynamic modals.
- **`dataset`** — `data-edited` على sal-amount/sal-notes (يُقرأ في updateSalaryCalc، يُمسح في closeSalModal).

> **نقطة حساسة:** `querySelector('#ov-salary .btn-g')` في `confirmSalary` يعتمد على بنية الـ class داخل الـ modal — يجب الحفاظ على `.btn-g` للزر بعد الاستخراج.

---

## 3. ID Sensitivity Analysis

| Modal | عدد IDs | External references | تصنيف |
|-------|:-------:|---------------------|:-----:|
| `ov-task` | 6 | 5 fields × 3-4 refs = populate + read | 🟢 Low |
| `ov-edit-salary` | 4 | 3 fields × 3 refs | 🟢 Low |
| `ov-edit-skills` | 4 | skill-suggestions/tags rendered into; Enter keydown on skill-input | 🟡 Medium |
| `ov-schedule` | 4 | sched-day-pills rendered into + delegation | 🟡 Medium |
| `ov-leave` | 6 | lv-start/end have input listeners (bootstrap); days-preview written | 🟡 Medium |
| `ov-incident` | 7 | 6 fields × 3-5 refs; inc-order populated | 🟢 Low |
| `ov-salary` | 15 | calc box live toggles + month/type change listeners + querySelector('.btn-g') + dataset | 🔴 High |

**كل الـ IDs لها external references** (لا modal معزول) — لأن النمط هو populate-by-ID. هذا يعني: **أي استخراج يجب أن يحافظ على كل الـ IDs حرفياً** (مثل Tabs Shell بالضبط — وهو ما تحقّق هناك).

### الـ IDs الحساسة بشكل خاص (listeners ثابتة عند bootstrap تعتمد عليها):
- `sal-month-sel`, `sal-type` → `change` listeners (س460-462)
- `sal-amount`, `sal-notes` → `input` listeners (س463-464)
- `lv-start`, `lv-end` → `input` listeners (س466-467)
- `skill-input` → `keydown` listener (س469)
- `skill-suggestions`, `sched-day-pills` → delegated `click` listeners

> **هذه الـ 9 listeners مربوطة بالـ ID عند bootstrap (مرة واحدة).** لو الـ modals حُقنت **بعد** سطر الربط → الـ listeners تفشل (rebinding مطلوب). الحل: الحقن **قبل** سطر 438.

---

## 4. Extraction Feasibility

| Modal | Byte-Identical ممكن؟ | يحتاج |
|-------|:--------------------:|-------|
| `ov-task` | ✅ نعم | حقن عند bootstrap فقط |
| `ov-edit-salary` | ✅ نعم | حقن عند bootstrap فقط |
| `ov-incident` | ✅ نعم | حقن عند bootstrap فقط |
| `ov-edit-skills` | ✅ نعم | حقن عند bootstrap + الـ delegation موجود |
| `ov-schedule` | ✅ نعم | حقن عند bootstrap + الـ delegation موجود |
| `ov-leave` | ✅ نعم | حقن عند bootstrap (الـ input listeners موجودة) |
| `ov-salary` | ✅ نعم (markup) | حقن عند bootstrap + الحفاظ على `.btn-g` + كل sal-* IDs |

### الآلية الآمنة الموحَّدة (لكل الـ 7):
**ليست مثل Tabs Shell تماماً** — لأن الـ modals ليست جزءاً من `renderAll` output. الفرق:

| | Tabs Shell (2.2) | Modals (2.3) |
|--|------------------|--------------|
| المصدر | inline template داخل `renderAll` | static HTML scaffold |
| متى يُبنى | كل renderAll (runtime) | مرة واحدة عند load |
| آلية الاستخراج | دالة تُرجع string تُدمج في innerHTML | دالة تُرجع string تُحقَن في `#modal-host` **عند bootstrap** |
| المتطلب الإضافي | لا شيء | **`#modal-host` div + حقن متزامن قبل الـ wiring (س438)** |

**لا يحتاج:** Rehydration · Lifecycle changes · تغيير بالـ open/close logic (تبقى classList.add/remove بالـ ID).
**يحتاج:** خطوة bootstrap واحدة (host + injection سطرين) — تُنفَّذ مرة، تخدم كل الـ modals.

---

## 5. Line Reduction Forecast

```
employee-profile.html : 1936 سطر (حالياً)

minus (7 static modals):
  ov-task            29
  ov-edit-salary     29
  ov-salary          72
  ov-edit-skills     23
  ov-schedule        28
  ov-leave           39
  ov-incident        56
  ───────────────────────
  مجموع المنقول     276 سطر

plus (bootstrap injection + host):  ~+6 أسطر

expected employee-profile.html : ~1666 سطر
```

| السيناريو | الأسطر المتوقعة | تحت 1500؟ |
|-----------|:---------------:|:---------:|
| استخراج كل الـ 7 modals | **~1666** | ❌ لا (لسه > 1500) |
| 7 modals + salary modal logic (E3/2.4 لاحقاً) | **~1480** | ✅ نعم |

> **ملاحظة مهمة:** استخراج الـ markup فقط (2.3) **لا يكفي** للنزول تحت 1500 — لأن **منطق** الـ salary modal (`updateSalaryCalc` ~85 سطر، `confirmSalary`, `openSalary`) يبقى في الصفحة. النزول تحت 1500 يتحقق مع **2.4 (salary logic relocation)**.

---

## 6. Risk Matrix

| Modal | المخاطرة | السبب |
|-------|:--------:|-------|
| `ov-task` | 🟢 Low | populate-by-ID بسيط، closers عبر data-close، لا listeners خاصة |
| `ov-edit-salary` | 🟢 Low | 3 حقول، لا listeners خاصة |
| `ov-incident` | 🟢 Low | populate بسيط، لا listeners خاصة، لا live logic |
| `ov-edit-skills` | 🟡 Medium | يعتمد على keydown listener (skill-input) + delegation (skill-suggestions) المربوطة عند bootstrap |
| `ov-schedule` | 🟡 Medium | delegation على sched-day-pills + renderSchedPills يحقن داخله |
| `ov-leave` | 🟡 Medium | input listeners على lv-start/lv-end + calcLeaveDays يكتب lv-days-preview |
| `ov-salary` | 🔴 High | 15 ID + calc box live toggles (style.display) + month/type change listeners + dataset(data-edited) + `querySelector('#ov-salary .btn-g')` في confirmSalary (مالي حسّاس) |

**العامل المشترك للـ Medium/High:** كلها تعتمد على **listeners مربوطة بالـ ID عند bootstrap**. طالما الحقن يتم **قبل** سطر الربط (438) → كل الـ Medium تنزل عملياً إلى Low. الـ `ov-salary` يبقى الأعلى لأنه **مالي** (confirmSalary → recordSalaryPayment) + أكثر تعقيداً (calc box).

---

## 7. Recommended Order (من الأقل للأعلى مخاطرة)

```
1. ov-incident      🟢 Low    (56 سطر — populate بسيط، لا listeners)
2. ov-task          🟢 Low    (29 سطر — populate بسيط)
3. ov-edit-salary   🟢 Low    (29 سطر — 3 حقول)
4. ov-schedule      🟡 Medium (28 سطر — delegation pills)
5. ov-leave         🟡 Medium (39 سطر — input listeners)
6. ov-edit-skills   🟡 Medium (23 سطر — keydown + delegation)
7. ov-salary        🔴 High   (72 سطر — مالي، calc box، آخراً)
```

> **توصية فرعية:** يمكن استخراج الـ 6 الأولى (Low+Medium) في PR واحد آمن (كلها نفس الآلية)، وترك `ov-salary` (High، مالي) لـ PR منفصل مع chaos-test يدوي (double-click، parallel — RULE H2.6) قبل دمجه.

---

## 8. Target Architecture

```
features/employee-profile/views/
├── render-tabs-shell.js          ✅ قائم (2.2)
├── render-hero.js                ✅ قائم
├── render-salary.js              ✅ قائم
├── render-attendance.js          ✅ قائم
├── render-score.js               ✅ قائم
├── render-admin-tab.js           ✅ قائم
├── render-permissions.js         ✅ قائم
├── render-overview-tab.js        ✅ قائم
├── render-password-card.js       ✅ قائم (modals 8-9 dynamic)
├── tab-router.js                 ✅ قائم
└── render-modals.js              🆕 (2.3 — الـ 7 static modals)
```

### هل `render-modals.js` واحد يكفي؟

**نعم — ملف واحد `render-modals.js` هو الأنسب**، للأسباب:

| المعيار | ملف واحد `render-modals.js` | ملفات منفصلة |
|---------|:---------------------------:|:------------:|
| الحجم الكلي | 276 سطر → ملف ~300 سطر (تحت حد G5) | 7 ملفات صغيرة (23-72 سطر) |
| التماسك | كلها modals، نفس الآلية (overlay+modal+head+body+foot) | تشتّت |
| الحقن | دالة واحدة `buildAllModalsHTML()` تُحقَن مرة | 7 نداءات |
| الاتساق مع النمط | يطابق `render-admin-tab.js` (يجمّع tasks+incidents+clients) | overkill |

**البنية المقترحة:**
```js
// render-modals.js
export function buildTaskModalHTML() {...}
export function buildEditSalaryModalHTML() {...}
export function buildSalaryModalHTML() {...}
export function buildSkillsModalHTML() {...}
export function buildScheduleModalHTML() {...}
export function buildLeaveModalHTML() {...}
export function buildIncidentModalHTML() {...}
export function buildAllModalsHTML() {   // convenience aggregator
  return buildTaskModalHTML() + buildEditSalaryModalHTML() + ... ;
}
```
الصفحة: `document.getElementById('modal-host').innerHTML = buildAllModalsHTML();` **قبل** سطر الـ wiring.

> **استثناء محتمل:** لو `ov-salary` (High) أُجِّل لـ PR منفصل، يمكن وضعه مؤقتاً في `render-salary-modal.js` مستقل ثم دمجه، أو إبقاؤه في الصفحة حتى 2.4. القرار عند الموافقة.

---

## 9. الخلاصة والتوصية

| السؤال | الإجابة |
|--------|---------|
| هل الاستخراج ممكن؟ | ✅ نعم، الـ 7 كلها |
| Byte-identical مثل Tabs Shell؟ | ✅ الـ markup نعم؛ لكن الآلية تختلف (host + bootstrap injection بدل innerHTML compose) |
| يحتاج rebinding/rehydration؟ | ❌ لا — لو الحقن **قبل** سطر الـ wiring (438) |
| المتطلب الوحيد الإضافي | `#modal-host` div + سطر حقن واحد عند bootstrap |
| هل ينزل تحت 1500؟ | ❌ ليس بـ 2.3 وحده (~1666)؛ يحتاج 2.4 (salary logic) للوصول ~1480 |
| ملف واحد أم متعدد؟ | **`render-modals.js` واحد** (مع خيار فصل ov-salary لـ PR لاحق) |

**التوصية:** Phase 2.3 = استخراج الـ **6 modals (Low+Medium)** إلى `render-modals.js` في PR واحد (آلية موحَّدة، آمنة، byte-identical markup)، وترك `ov-salary` (High/مالي) إما لنهاية نفس الـ PR مع chaos-test أو لـ PR منفصل — حسب اعتمادك.

---

## ⛔ لم يُنفَّذ أي شيء
هذا تقرير تقييم فقط. صفر نقل modal · صفر تعديل logic · صفر تعديل Firestore · صفر تعديل event flow.
