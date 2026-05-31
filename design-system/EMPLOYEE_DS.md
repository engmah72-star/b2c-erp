# EMPLOYEE_DS.md — Employee Design System (Phase 0 Foundation)

> **الحالة:** Phase 0 مكتمل — *Foundation only*. لم تُربَط أي صفحة بعد.
> **القاعدة الحاكمة:** RULE U1 (UI Centralization) + L1 (Layer Independence) + G9 (Incremental) + RULE 6 (Backward Compatibility).
> **مبدأ Phase 0:** Additive فقط · Zero Visual Regression · Rollback = حذف ملف.
> آخر تحديث: 2026-05-30

---

## 1. ما الذي أُنشئ في Phase 0

| الملف | النوع | الوصف |
|------|------|------|
| `design-system/employee.css` | 🆕 جديد | مكتبة مكوّنات الموظفين الموحّدة (9 عائلات مكوّنات) — token-only |
| `design-system/components.css` | ✏️ إضافة فقط | استكمال الحالات الأربع (spinner + loading + error/success panels) — لا تعديل لأي selector قائم |
| `design-system/EMPLOYEE_DS.md` | 🆕 توثيق | هذا الملف — مرجع المكوّنات + Adoption Matrix |

**ولا شيء آخر.** لا HTML، لا core logic، لا token قائم عُدِّل.

---

## 2. مصدر التوكنز (SSOT) — وملاحظة التضارب الموثَّقة

النظام يحمل **مجموعتَي توكنز متعايشتين**:

| المجموعة | المصدر | الأسماء | تستخدمها |
|---------|--------|--------|----------|
| **Legacy** | `shared.css` (`:root`) | `--bg2`, `--snow`, `--line`, `--b/--g/--r/--y/--p/--c`, `--rad`, `--trans` | كل صفحات النظام الحالية (60+) |
| **Slate** | `design-system/tokens.css` (يُستورد من `shared.css:10`) | `--surface`, `--ink`, `--border`, `--accent`, `--space-1..24`, `--fs-2xs..6xl` | `components.css` (`.ds-*`), الصفحات الجديدة `*-ds.html` |

### ⚠️ تضارب موثَّق (NOT fixed in Phase 0 — per الشرط 1)
`shared.css` يُعرّف بعض الأسماء **بعد** استيراد `tokens.css`، فيفوز بقيمته:

| التوكن | `tokens.css` (slate) | `shared.css` (legacy، الفائز فعليًا) | الأثر |
|--------|---------------------|--------------------------------------|------|
| `--fs-sm` | 13px | **11px** | القيمة الفعّالة = 11px |
| `--fs-md` | 14px | **13px** | الفعّالة = 13px |
| `--fs-lg` | 15px | **14px** | الفعّالة = 14px |
| `--fs-xl` | 17px | **16px** | الفعّالة = 16px |

**القرار (مؤجَّل):** لا يُعالَج في Phase 0. أي توحيد لهذه القيم = تغيير بصري على كل النظام (big-bang مرفوض). يُدرَج كبند `T0` في سجل الديون لمعالجة منفصلة عالية العناية لاحقًا.

> **لماذا `employee.css` يستخدم أسماء Legacy؟** لأن صفحات الموظفين تُرسَم بها فعليًا. استخدامها يضمن أن المكوّن الموحّد = نفس مظهر التعريف المبعثر الذي يحل محله **بايت ببايت** → Zero Visual Regression.

### الألوان الناعمة (Soft Tints)
بدل `rgba(59,158,255,.15)` المبعثرة، `employee.css` يستخدم `color-mix(in srgb, var(--b) 15%, transparent)` → **theme-aware** (يعمل دارك + لايت) و**token-only**.

---

## 3. كتالوج المكوّنات الجديدة (`employee.css`)

| # | العائلة | الـ Classes الأساسية | يوحّد |
|---|---------|----------------------|------|
| 1 | **Soft tints** | `.emp-tint-{b,g,r,y,p,c,dim}` | كل الـ rgba المبعثرة |
| 2 | **Employee Card** | `.emp-card`, `.emp-card-head`, `.emp-card-body` | `employees.css .emp-card`, `my-home .mh-card` |
| 3 | **Avatar** | `.emp-avatar` (+`-sm`/`-lg`), `.emp-avatar-dot` | `.emp-avatar`, `.hero-av`, `.mh-av` |
| 4 | **Tabs** | `.emp-tabs`, `.emp-tab`, `.emp-tab-count` (+`.emp-tabs--pill`) | `.profile-tabs/.tab-btn`, `.tabs/.tab`, `.tabs-bar/.tab` |
| 5 | **Badge** | `.emp-badge` (+`.info/.warn/.zero`) | `.mh-badge`, `.ec-chip` |
| 6 | **Status Pill** | `.emp-status` (+`--dot`, `.is-{success,warning,danger,info,accent,neutral}`) | `.status-pill`, `.pri-*`, `.lv-*`, `.st-*`, `.paid/unpaid-badge` |
| 7 | **Metric** | `.emp-metric`, `.emp-metric-lbl`, `.emp-metric-val` | `.emp-metric`, `hstat` |
| 8 | **Table** | `.emp-table`, `.emp-row`, `.emp-col-c` | `.ec-tbl` |
| 9 | **Modal** | `.emp-modal-backdrop/.emp-modal/-head/-title/-body/-foot` | dialogs مبعثرة |
| + | **Action Menu** | `.emp-act-menu`, `.emp-act-sep` | `.act-menu` المكرّر مرتين |

### الحالات الأربع الموحّدة (`components.css`)
| الحالة | Canonical | ملاحظة |
|-------|-----------|--------|
| **Empty** | `.ds-empty` + `.ds-empty-icon/-title/-msg` | كان موجودًا |
| **Loading** | `.skeleton` (موجود) · **`.ds-spinner`** + `.ds-loading` (جديد) | أُكمِل |
| **Error** | `.ds-alert-danger` (inline) · **`.ds-state-error`** (panel، جديد) | أُكمِل |
| **Success** | `.ds-alert-success` (inline) · **`.ds-state-success`** (panel، جديد) | أُكمِل |

---

## 4. 📋 ADOPTION MATRIX (خريطة التبنّي للمراحل القادمة)

> كل صف = class قديم متناثر → المكوّن المعياري → المرحلة المستهدفة → الأولوية.
> **هذه الخريطة تُنفَّذ في Phase 1/3 فقط — ليس الآن.**

### States (أعلى أولوية — Phase 1)
| Current Class | Canonical Component | Target Phase | Priority | الملف المصدر |
|---|---|---|---|---|
| `empty-text` / `empty-icon` / `empty-sub` | `.ds-empty` | Phase 1 | High | shared.css, employees.html |
| `empty-state` / `empty-state-ico/-title/-sub/-btn` | `.ds-empty` | Phase 1 | High | shared.css |
| `empty` / `empty-i` / `empty-t` / `empty-h` | `.ds-empty` | Phase 1 | High | my-profile.css |
| `empty-cta` (+`.empty-icon/.empty-text`) | `.ds-empty` | Phase 1 | High | employees.css, employee-profile.css |
| `mh-empty` | `.ds-empty` | Phase 1 | High | my-home.css |
| `ec-empty` | `.ds-empty` | Phase 1 | High | employee-control.css |
| `empty-pl` | `.ds-empty` | Phase 1 | High | my-requests.html |
| `spinner` | `.ds-spinner` | Phase 1 | High | shared.css |
| `skeleton` / `sk-line` / `sk` / `sk-card` / `sk-block` | `.skeleton` (+`.skeleton-text`) | Phase 1 | High | متعدّد |

### Tabs (Phase 1)
| Current Class | Canonical Component | Target Phase | Priority | الملف |
|---|---|---|---|---|
| `tabs-bar` / `tab` / `tab.on` / `tab .badge` | `.emp-tabs--pill` / `.emp-tab` / `.emp-tab-count` | Phase 1 | High | my-requests.html (`<style>`) |
| `profile-tabs` / `tab-btn` / `badge-count` | `.emp-tabs` / `.emp-tab` / `.emp-tab-count` | Phase 3 | Medium | employee-profile.css |
| `tabs` / `tab` / `badge-c` | `.emp-tabs` / `.emp-tab` / `.emp-tab-count` | Phase 3 | Medium | my-profile.css |

### Cards / Avatars / Status (Phase 3)
| Current Class | Canonical Component | Target Phase | Priority | الملف |
|---|---|---|---|---|
| `emp-card` | `.emp-card` | Phase 3 | Medium | employees.css |
| `mh-card` / `mh-card-h` / `mh-card-b` | `.emp-card` / `.emp-card-head` / `.emp-card-body` | Phase 3 | Medium | my-home.css |
| `emp-avatar` / `hero-av` / `mh-av` / `hero-compact .av` | `.emp-avatar` (+sizes) | Phase 3 | Medium | متعدّد |
| `status-pill` (+`::before`) | `.emp-status.emp-status--dot` | Phase 3 | Medium | employees.css |
| `pri-urgent/-normal/-low` | `.emp-status.is-{danger,info,neutral}` | Phase 3 | Medium | employee-profile.css |
| `lv-annual/-sick/-emergency/-official/-unpaid` | `.emp-status.is-{info,danger,warning,accent,neutral}` | Phase 3 | Medium | employee-profile.css |
| `paid-badge` / `unpaid-badge` | `.emp-status.is-success` / `.is-warning` | Phase 3 | Medium | employee-profile.css |
| `st-requested/-pending/-approved/-rejected/-confirmed` | `.emp-status.is-{accent,warning,success,danger,info}` | Phase 3 | Medium | my-requests.html (`<style>`) |
| `mh-badge` / `ec-chip` (+`.info/.warn/.zero`) | `.emp-badge` (+modifiers) | Phase 3 | Medium | my-home.css, employee-control.css |
| `emp-metric` | `.emp-metric` | Phase 3 | Medium | employees.css |
| `ec-tbl` / `ec-row` | `.emp-table` / `.emp-row` | Phase 3 | Medium | employee-control.css |
| `act-menu` (مكرّر ×2) | `.emp-act-menu` | Phase 3 | Medium | employees.css, employee-profile.css |

### Inline tints (Phase 1 — مع إزالة inline styles)
| Current pattern | Canonical | Target Phase | Priority |
|---|---|---|---|
| `rgba(59,158,255,.15)` … | `.emp-tint-b` / `color-mix(var(--b)…)` | Phase 1 | High |
| `rgba(0,217,126,.15)` … | `.emp-tint-g` | Phase 1 | High |
| `rgba(255,61,110,.15)` … | `.emp-tint-r` | Phase 1 | High |
| `rgba(255,170,0,.15)` … | `.emp-tint-y` | Phase 1 | High |
| `rgba(167,139,250,.15)` … | `.emp-tint-p` | Phase 1 | High |

---

## 5. سجل الديون المؤجَّلة (Deferred Debt)

| ID | البند | السبب في التأجيل | المعالجة المقترحة |
|----|------|------------------|-------------------|
| **T0** | تضارب `--fs-sm/md/lg/xl` بين slate و legacy | توحيدها = تغيير بصري على كل النظام | PR منفصل عالي العناية، خارج نطاق الموظفين |
| **C0** | عائلتا توكنز (slate + legacy) متعايشتان | الترحيل الكامل big-bang | تدريجي عبر `*-ds.html` (خطة DS العامة) |

---

## 6. قاعدة الاستخدام القادمة (للمطوّر في Phase 1/3)

```html
<!-- ❌ قديم (مبعثر، inline) -->
<div class="empty-cta">
  <div class="empty-icon">📭</div>
  <div class="empty-text">لا توجد طلبات</div>
</div>

<!-- ✅ معياري (Phase 1+) -->
<div class="ds-empty">
  <div class="ds-empty-icon">📭</div>
  <div class="ds-empty-title">لا توجد طلبات</div>
  <div class="ds-empty-msg">ابدأ بإنشاء طلب جديد</div>
</div>
```

**ممنوع** بعد Phase 1: تعريف empty/loading/tab/badge/card محلي في صفحة موظفين. يُسحَب من `employee.css` / `components.css`.
