# RFC — توحيد صفحات المصمم الثلاث (Designer Hub)

> **التاريخ:** 2026-05-19 (مُحدَّث)
> **النطاق المصحَّح:** الصفحات الـ 3 المرتبطة بدور المصمم.
> **الهدف:** **دورة عمل بسيطة، صفحة واحدة، لا تكرار.**
> **الحاكمية:** يخضع لـ RULES G1-G10 + RULE 1-8 من `CLAUDE.md`.

---

## الصفحات المستهدفة

| # | الصفحة الحالية | الملف | السطور | الوظيفة |
|---|---|---|---|---|
| 1 | **مكتبة التصميمات** | `client-design-library.html` | 601 | عرض تصاميم كل العملاء + إحصائيات |
| 2 | **مساحة التصميم** | `design-workspace.html` | 2,425 | فتح أوردر، رفع نسخ، اعتماد، نشر |
| 3 | **المعرض** | `gallery.html` | 677 | معرض التصاميم العام |
| | **الإجمالي** | | **3,703** | |

---

## التشخيص

### التكرار (45-50% من الكود)

| نوع التكرار | الموقع | التقدير |
|---|---|---|
| Sidebar | الـ 3 | 3× نسخة كاملة |
| `escapeHtml` utility | الـ 3 | 3 تعريفات مختلفة |
| Lightbox | workspace + gallery | 2× منطق |
| onSnapshot(design_items) | library + workspace | 2× نفس الاشتراك |
| Grid + cards | الـ 3 | layouts مختلفة بنفس الـ UX |
| Search + filter | الـ 3 | منطق متشابه |
| Empty + loader | الـ 3 | 3× messaging |

### مشاكل G3 (limit() مفقود)

- `client-design-library.html` → `design_items` بدون `limit()`
- `gallery.html` → `gallery` query بدون `limit()`
- `design-workspace.html` → `client_decisions` بدون `limit()`

### مشاكل RULE 8

- `client-design-library.html` لا تطبّق `canSee('client_phone')` — تعرض `clientName` بدون فلتر للأدوار غير المصرَّحة

---

## الهدف — Designer Hub موحَّد

**صفحة واحدة بـ 3 tabs**: `features/design/designer-hub.html`

```
?tab=work       → مساحة عملي (المصمم/Admin)
?tab=library    → مكتبة تصاميم العملاء (Admin/CS)
?tab=gallery    → المعرض العام (الكل)
```

تبديل الـ tab = DOM toggle محلي (لا reload).

---

## البنية

```
features/design/
├── designer-hub.html             ← entry موحَّد (~250 سطر)
├── hub.entry.js                  ← bootstrap + auth + tab router
├── repository.js                 ← (موجود من PR-1) — يُوسَّع بـ 2-3 subscribers
├── permissions.js                ← (موجود من PR-1) — يُوسَّع بـ helpers
├── state.js                      ← (موجود من PR-1)
│
├── views/
│   ├── work-view.js              ← من design-workspace.html (MVP)
│   ├── library-view.js           ← من client-design-library.html
│   └── gallery-view.js           ← من gallery.html
│
├── components/
│   ├── sidebar.js                ← موحَّد (يحل التكرار الثلاثي)
│   ├── lightbox.js               ← موحَّد
│   ├── grid-card.js              ← مكوّن card بـ variants
│   ├── filter-chips.js
│   └── utils.js                  ← escapeHtml + toast + helpers
│
└── services/
    ├── design-items.service.js   ← upload version + approve + print-ready
    ├── gallery.service.js        ← publish + visibility
    └── upload.service.js         ← (موجود من PR-1) — implementation
```

---

## دورة العمل الجديدة (بسيطة)

```
المصمم يفتح Designer Hub
  │
  ├─ Tab "عملي" (الافتراضي للمصمم)
  │    ├─ يشوف الأوردرات المسندة له
  │    ├─ يضغط أوردر → يفتح بنوده
  │    ├─ يرفع نسخة جديدة على بند (3 سلوتات: mockup/pdf/source)
  │    ├─ يعتمد البند
  │    └─ ينشر للمعرض (modal مدمج)
  │
  ├─ Tab "المكتبة" (الافتراضي للـ Admin/CS)
  │    ├─ يشوف كل العملاء بإحصائياتهم
  │    ├─ يضغط عميل → يشوف تصاميمه
  │    └─ يفتح بند → يفتحه في Tab "عملي"
  │
  └─ Tab "المعرض" (للكل)
       ├─ يشوف المعرض العام
       ├─ فلترة بالتصنيف + بحث
       └─ Lightbox بـ keyboard nav
```

---

## ما يبقى من PR-1

| الملف | الحالة |
|---|---|
| `repository.js` (349 سطر) | ✅ يبقى — يُوسَّع بـ `subscribeDesignItemsByClient` |
| `permissions.js` (79 سطر) | ✅ يبقى — يُوسَّع بـ `getDesignerHubDefaultTab` |
| `state.js` (126 سطر) | ✅ يبقى كما هو |
| `services/upload.service.js` (47 سطر) | ✅ يبقى كـ stub، يُنفَّذ في PR-2 |
| `services/orders.service.js` | ❌ **محذوف** — scope خاطئ |
| `services/attendance.service.js` | ❌ **محذوف** — غير ذي صلة |

---

## الخطة — 2 PRs فقط

### PR-2 (هذا الـ PR) — Designer Hub Unified

- بناء `designer-hub.html` بـ 3 tabs
- 3 views + 5 components مشتركة
- توسيع `repository.js` بـ subscribers جديدة (مع `limit()` مفروض على الكل)
- تطبيق RULE 8 على library view
- **الصفحات القديمة تظل شغالة** — لا breaking change
- **الوقت المتوقع: ~20 ساعة**

### PR-3 — Cutover

- تحديث `sidebar-config.js`: حذف الـ 3 entries القديمة، إضافة `designer-hub.html`
- الـ 3 صفحات القديمة → redirect shims لـ `designer-hub.html?tab=X`
- بعد أسبوع مراقبة → حذف نهائي
- **الوقت المتوقع: ~4 ساعات**

---

## MVP / Defer

### MVP في PR-2 (من اليوم الأول)

- ✅ صفحة موحَّدة بـ 3 tabs
- ✅ Tab Work: list orders → click → see items → upload version → approve → publish
- ✅ Tab Library: client grid → click client → see designs
- ✅ Tab Gallery: public grid + filter + lightbox
- ✅ Phone visibility (RULE 8)
- ✅ Single sidebar (لا تكرار)
- ✅ كل onSnapshot مع limit()

### مؤجَّل لـ Phase 2

- 🔄 ZIP bulk download
- 🔄 Drag-drop multi-file → auto slot distribution
- 🔄 Keyboard shortcuts (j/k/`/`/Esc)
- 🔄 Performance ring + advanced KPIs
- 🔄 Edit item modal (rare admin operation)
- 🔄 Revision modal (يمكن استبداله بـ inline form)
- 🔄 Client decision processing UI (Admin-only)

### خارج النطاق (Out)

- ❌ Stats SVG ring الـ complex
- ❌ Portfolio sub-tabs (My / Review / Public) — كله موحَّد في Gallery tab
- ❌ Multi-row drag-drop matrix

---

## التوفير المتوقع

| | الآن | بعد الدمج |
|---|---|---|
| URLs | 3 | 1 |
| Firestore reads/load | ~150 | ~50 (-66%) |
| تكرار الكود | 45-50% | <15% |
| خطوات التنقل للنشر | 3 | tab switch واحد |
| سطور كود | 3,703 | ~1,500 (-60%) |
