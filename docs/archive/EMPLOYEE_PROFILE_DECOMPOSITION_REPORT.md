# Employee Profile — Decomposition Report (Phase 2 Preparation)

> **النطاق:** تقرير تفكيك فقط لـ `employee-profile.html` (2023 سطر). **لا تنفيذ.**
> **القاعدة الحاكمة:** RULE G5 / H1.7 (god page > 1500 مُجمَّدة) · E1 / G9 (تدريجي، آمن، قابل للتراجع) · L1 (UI = View).
> آخر تحديث: 2026-05-31 · الفرع: `claude/employee-module-architecture-9qZX1`

---

## 0. الخلاصة التنفيذية

| المؤشر | القيمة |
|--------|-------:|
| إجمالي الأسطر | **2023** (god page، فوق حد H1.7 = 1500) |
| HTML scaffold (1–235) | 235 سطر |
| Module script (236–1866) | 1631 سطر |
| ذيل (1867–2023) | modals scaffold + sw-register |
| **Static inline styles** | **116** (27 scaffold + 89 script) |
| **Dynamic inline styles** (U1.6 exempt) | **7** |
| **Inline events** | **60** (16 scaffold + 43 script + 1 nav-overlay) |
| Local `<style>` block | **0** |
| **Direct Firestore writes** | **0** ✅ (كله عبر `employeeActions.*`) |
| View builders قائمة | **9 ملفات** (`features/employee-profile/views/`، 1477 سطر) |

> **اكتشاف معماري مهم:** الصفحة **ليست** فوضى — طبقة الـ business logic مفصولة بالكامل (0 direct writes، كل الكتابة عبر `employeeActions`)، و**9 view builders موجودة بالفعل**. المشكلة الوحيدة: **`renderAll()` (553–787) يحمل scaffold الـ tabs/panes inline** + الـ modals scaffold inline + الدوال الصغيرة تبني markup inline. التفكيك = **نقل markup، لا إعادة بناء logic**.

---

## 1. Current Structure Map

### 1.1 HTML Scaffold (السطور 1–235)
| الجزء | السطور | الوصف |
|------|--------|-------|
| `<head>` + assets | 1–24 | الخطوط، shared.css، employee-profile.css، scripts |
| Sidebar (`.sidenav`) | 27–~60 | nav-brand + nav-links + nav-user (logout) |
| Topbar | ~62–96 | mob-menu-btn + عنوان |
| `#main-content` | ~96 | حاوية الـ render الرئيسية (فارغة، تُملأ من JS) |
| **Modal: ov-task** | 98–128 | إضافة مهمة (inline) |
| **Modal: ov-edit-salary** | 129–159 | تعديل بيانات المرتب (inline) |
| **Modal: ov-salary** | 160–232 | صرف/تسجيل مبلغ (inline، الأكبر — 14 inline style) |
| nav-overlay | 233 | `onclick="closeNav()"` |

### 1.2 Module Script (236–1866)
| البلوك | السطور | المحتوى |
|--------|--------|---------|
| Imports | 318–327 | 9 view builders + employeeActions + core utils |
| State + helpers | 328–552 | حالة، toast، تواريخ، setTab، navigateAttMonth |
| **`renderAll()`** | **553–787** | **القلب — يبني hero (delegated) + tabs scaffold + 5 tab-panes inline** |
| Score/Goals/Eval/Skills/Behavior/Insights | 788–1044 | render wrappers (تُفوِّض لـ views) |
| Permissions/Salary-edit | 1045–1112 | `_legacyProfilePermissions` + openEditSalary |
| Password card + Auth rebuild | 1113–1430 | render + modals (تُفوِّض جزئيًا لـ render-password-card) |
| Delete/Permissions save | 1431–1468 | admin actions |
| Tasks | 1469–1520 | renderTasks (delegated) + add/toggle/delete |
| Attendance/Schedule/Leave | 1521–1640 | render (delegated) + actions |
| **Salary modal logic** | 1641–1830 | openSalary, updateSalaryCalc (15 inline style + 15 events) |
| Attendance record | 1831–1866 | check-in/out |

### 1.3 Tabs (5)
| Tab | key | render trigger (renderAll:776–780) |
|-----|-----|-----------------------------------|
| نظرة عامة | `overview` | renderPasswordCard, renderScore, renderGoals, renderSkillsAndProducts, renderBehavior, renderInsights |
| حضور وإجازات | `attendance` | renderSchedule, renderLeaves, renderAttendance |
| المرتبات | `salaries` | renderSalaries |
| المهام | `tasks` | renderTasks |
| الإدارة | `admin` | renderClients, renderEvaluations, renderPermissions, renderIncidents |

> مصدر التبويب: `TAB_KEYS` في `tab-router.js` ✅ (مركزي بالفعل).

### 1.4 Modals (7)
| Modal | الموقع | البناء الحالي |
|------|--------|---------------|
| ov-task | scaffold 98 | inline HTML |
| ov-edit-salary | scaffold 129 | inline HTML |
| ov-salary | scaffold 160 | inline HTML (الأكبر) |
| ov-edit-skills | scaffold 1870* | inline HTML |
| ov-schedule | scaffold 1895* | inline HTML |
| ov-leave | scaffold 1925* | inline HTML |
| ov-incident | scaffold 1966* | inline HTML |

> *مُعرَّفة بعد `</script>` (1866) — modals scaffold ثابت في HTML.

### 1.5 Tables / Forms / Cards / Render Blocks
- **Tables:** لا جداول `<table>` صريحة — listings تُبنى كـ list-rows عبر view builders.
- **Forms:** داخل الـ 7 modals (inputs `.inp`).
- **Cards:** hero, score-gauge, kpi cards, list-rows — معظمها عبر view builders.
- **Render Blocks:** ~30 دالة render؛ معظمها wrappers تُفوّض لـ `build*HTML`.

---

## 2. Existing View Coverage

| Section / Block | Current View | Covered? |
|-----------------|--------------|:--------:|
| Hero + quick actions + compact hero | `render-hero.js` (buildHeroHTML, buildQuickActionsHTML, buildCompactHeroHTML) | ✅ |
| Attendance calendar + schedule + leaves | `render-attendance.js` | ✅ |
| Salaries list | `render-salary.js` (buildSalariesHTML) | ✅ |
| Permissions UI | `render-permissions.js` (buildPermsUI, buildAdminLockedHTML) | ✅ |
| Tasks + incidents + clients | `render-admin-tab.js` | ✅ |
| Goals + evaluations + skills + products + behavior + insights | `render-overview-tab.js` | ✅ |
| Score gauge | `render-score.js` (buildScoreHTML) | ✅ |
| Password card + set-password + rebuild-auth modals | `render-password-card.js` | ✅ |
| Tab routing (sticky hero, keyboard, QA menu) | `tab-router.js` | ✅ |
| **`renderAll()` tabs scaffold + 5 tab-panes** | — | ❌ **غير مغطّى (inline)** |
| **7 modals scaffold (HTML)** | — | ❌ **غير مغطّى (inline في HTML)** |
| **Salary modal calc logic markup** (updateSalaryCalc) | — | ⚠️ جزئي (logic + inline markup) |

> **التغطية ~80%.** الفجوة الأساسية: **scaffold الـ tabs/panes + الـ modals + بعض الـ markup المتناثر في الدوال.**

---

## 3. Remaining Inline UI

| النوع | scaffold (1–235) | script (236–1866) | الإجمالي |
|------|:----------------:|:-----------------:|:--------:|
| **Static inline styles** | 27 | 89 | **116** |
| **Dynamic inline styles** (U1.6) | 0 | 7 | **7** |
| **Inline events** (`on*=`) | 16 | 43 + 1 | **60** |
| **Local `<style>`** | — | — | **0** |

### تركّز الـ static styles (script):
- `renderAll()` (553–787): **42** ← الأعلى
- salary modal logic (1660–1866): **15**
- admin/password/perms (1080–1469): **13**

### تركّز الـ events (script):
- `renderAll()`: **22** (أزرار الـ tabs + actions)
- salary (1660+): **15**

### Duplicated Markup:
- **`.act-menu`** مكرّر (موجود في employee-profile.css + employees.css) — مغطّى في Adoption Matrix.
- **tab buttons** (5×) inline في renderAll مع نفس النمط.
- **list-row / bd-icon / section-head** متكرّرة لكنها **بالفعل classes** (لا تكرار CSS، فقط تكرار استخدام — مقبول).

---

## 4. Extraction Candidates

> كل المرشّحات أدناه **نقل markup فقط** — صفر تغيير في business logic (الذي يبقى في الصفحة عبر `employeeActions`).

| # | المرشّح | من | إلى (مقترح) | النوع |
|---|---------|-----|-------------|-------|
| E1 | **Tabs nav + 5 tab-panes scaffold** (renderAll 607–735) | inline في renderAll | `render-tabs-shell.js` (جديد) | markup |
| E2 | **7 modals HTML** (scaffold + 1870+) | HTML scaffold inline | `render-modals.js` (جديد، build*ModalHTML) | markup |
| E3 | **Salary modal calc markup** (updateSalaryCalc 1701–1785) | inline في الدالة | `render-salary.js` (توسعة) | markup |
| E4 | **Static inline styles → classes** (116) | inline | `employee-profile.css` (موسَّع) | styling |
| E5 | **Inline events → delegation** (60) | `onclick=` | wiring في الصفحة (data-act) | events |
| E6 | **`.act-menu` المكرّر** | css مكرّر | `employee.css` (canonical) | dedup |

### غير قابل للنقل (يبقى في الصفحة — business logic):
- كل دوال `employeeActions.*` (addIncident, saveTask, confirmSalary, recordAttendanceToday...).
- `calcScoreFor`, `computeSuggestedForMonth`, `getEmpOrders`, `computeLateMinutes` — حسابات (قد تنتقل لـ `core/` لاحقًا، خارج نطاق Phase 2).
- Firestore listeners + state management.

---

## 5. Risk Assessment

| المرشّح | المخاطرة | السبب |
|---------|:--------:|-------|
| **E4 — static styles → classes** | 🟢 Low | نمط مُثبَت (Phase 1A/1B)؛ نقل قيم 1:1؛ قابل للتحقق بصريًا |
| **E5 — events → delegation** | 🟢 Low | نمط مُثبَت؛ `data-tab`/`data-act` موجود جزئيًا؛ tabs تُعاد توليدها فتحتاج delegation على حاوية مستقرة |
| **E6 — act-menu dedup** | 🟢 Low | مغطّى في Adoption Matrix؛ canonical جاهز |
| **E1 — tabs/panes scaffold extract** | 🟡 Medium | renderAll يبني string concatenation؛ النقل يتطلب الحفاظ على ترتيب الـ ids ونقاط الـ render trigger (776–780) بدقة |
| **E3 — salary modal markup** | 🟡 Medium | `updateSalaryCalc` يخلط markup + حساب؛ يحتاج فصل دقيق للـ markup عن الأرقام (15 inline style + 15 event مترابطة) |
| **E2 — modals extract** | 🔴 High | 7 modals، بعضها يعتمد على ids يقرأها JS مباشرة (gv/sv)؛ نقلها لـ JS builder يتطلب ضمان وجود الـ ids وقت القراءة + توقيت الحقن (modal host pattern) |

> **التقدير:** الجزء الأكبر (E4+E5+E6) **Low Risk** ويحقق هدف inline=0. الجزء البنيوي (E1/E2/E3) **Medium–High** ويحقق هدف خفض الأسطر تحت 1500.

---

## 6. Target Architecture

```
employee-profile.html  (Shell Only — هدف < 1500، مثاليًا < 600)
   │  • <head> + assets
   │  • sidebar + topbar + #main-content + #modal-host
   │  • bootstrap: imports + auth + listeners + event wiring
   │  • business logic: employeeActions.* calls (تبقى)
   ▼
features/employee-profile/views/
   ├── render-hero.js               ✅ قائم
   ├── render-salary.js             ✅ قائم (+ E3 salary modal markup)
   ├── render-attendance.js         ✅ قائم
   ├── render-score.js              ✅ قائم
   ├── render-admin-tab.js          ✅ قائم
   ├── render-permissions.js        ✅ قائم
   ├── render-overview-tab.js       ✅ قائم
   ├── render-password-card.js      ✅ قائم
   ├── tab-router.js                ✅ قائم
   ├── render-tabs-shell.js         🆕 (E1 — tabs nav + 5 panes scaffold)
   └── render-modals.js             🆕 (E2 — 7 modals HTML builders)

features/employee-profile/
   └── employee-profile.css         (موسَّع — E4 static styles؛ E6 act-menu → employee.css)
```

**التقسيم المتوقّع للأسطر بعد التفكيك:**
- نقل renderAll scaffold (~120 سطر markup) → `render-tabs-shell.js`
- نقل 7 modals (~140 سطر) → `render-modals.js`
- نقل salary modal markup (~50 سطر) → `render-salary.js`
- **الصفحة المتوقَّعة: ~1700 → نحو 1450–1500** (تحت حد H1.7) ← مع E1+E2+E3.

---

## 7. Exit Criteria (شروط نجاح Phase 2)

Phase 2 يُعتبر ناجحًا لـ `employee-profile.html` عند تحقّق **كل** ما يلي:

| المعيار | الهدف |
|---------|-------|
| **حجم الملف** | < 1500 سطر (يرفع تجميد H1.7) — مثاليًا shell نحيف |
| **Static inline styles** | **0** (الـ 116 → classes) |
| **Inline events** | **0** (الـ 60 → delegation) |
| **Runtime styles** | محفوظة (الـ 7 — U1.6 exemption) |
| **Local `<style>`** | 0 (موجود بالفعل) |
| **Duplicated markup** | act-menu موحَّد عبر `employee.css`؛ tabs/modals عبر view builders |
| **Shell-only responsibilities** | الصفحة = bootstrap + wiring + business-logic calls فقط؛ كل الـ markup في views |
| **Business logic** | IDENTICAL (صفر تغيير — كل `employeeActions.*` كما هي) |
| **Firestore** | 0 direct writes (محفوظ)؛ listeners/queries IDENTICAL |
| **Visual regression** | صفر (تحقّق بصري قبل/بعد) |
| **CI** | 4/4 خضراء |
| **Reversibility** | كل extraction = PR صغير قابل للـ revert |

### تسلسل التنفيذ المقترح (عند الموافقة — كل بند PR منفصل):
1. **PR 2.1 (Low):** E4 static styles → classes + E5 events → delegation (يحقق inline=0).
2. **PR 2.2 (Medium):** E1 tabs/panes scaffold → `render-tabs-shell.js`.
3. **PR 2.3 (High):** E2 modals → `render-modals.js` (مع modal-host pattern).
4. **PR 2.4 (Medium):** E3 salary modal markup → `render-salary.js` + E6 act-menu dedup.

> كل PR: القديم يعمل أثناء الانتقال · business logic IDENTICAL · CI أخضر · تحقّق بصري.

---

## 8. ملاحظة معمارية ختامية

`employee-profile.html` **ليست god page فوضوية** — هي god page **بسبب الحجم فقط** (markup scaffold + modals inline)، بينما طبقتها المنطقية **نظيفة ومفصولة بالفعل** (0 direct writes، 9 views قائمة). لذلك التفكيك **منخفض المخاطرة نسبيًا** ويتركّز في **نقل markup** لا إعادة هندسة. الجزء الأعلى مخاطرة (modals) معزول وقابل للتأجيل دون منع تحقيق inline=0.

**التوصية:** البدء بـ **PR 2.1 (Low Risk)** لتحقيق inline=0 أولًا (المكسب الأكبر بأقل مخاطرة)، ثم التفكيك البنيوي (2.2→2.4) لخفض الأسطر تحت 1500.
