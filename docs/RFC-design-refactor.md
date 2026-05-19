# RFC — توحيد صفحات التصميم (Designer Hub)

> **التاريخ:** 2026-05-19 (مُحدَّث — Iteration 3)
> **القرار النهائي:** إلغاء "المكتبة" و "المعرض" بناءً على طلب المستخدم.
> **النطاق الفعلي:** `designer-hub.html` = مساحة التصميم فقط (work view).

---

## التطور

**Iteration 1 (مُلغى):** 7 PRs لـ refactor 5 صفحات — Kanban + Workspace + Designer-Dashboard + Library + Gallery
**Iteration 2 (مُلغى):** دمج 3 صفحات بـ 3 tabs — Library + Workspace + Gallery
**Iteration 3 (نهائي):** ✅ صفحة واحدة بدون tabs — مساحة التصميم فقط

---

## الصفحات

| الصفحة الحالية | المصير | السبب |
|---|---|---|
| `design-workspace.html` (2,425 سطر) | **يُستبدل بـ `designer-hub.html`** | الـ refactor |
| `client-design-library.html` (601 سطر) | **redirect shim → designer-hub.html** | مُلغاة بطلب المستخدم |
| `gallery.html` (677 سطر) | **redirect shim → designer-hub.html** | مُلغاة بطلب المستخدم |

**الإجمالي الجديد:** ~1,400 سطر (vs 3,703 → -62%).

---

## البنية النهائية

```
features/design/
├── repository.js                 ← Firestore queries (G3 + G4)
├── permissions.js                ← Role-based access (RULE 8)
├── state.js                      ← Pub/sub state (محجوز)
├── hub.entry.js                  ← Bootstrap + mount work view
│
├── views/
│   └── work-view.js              ← مساحة التصميم الكاملة
│
├── components/
│   ├── utils.js                  ← escapeHtml + toast + helpers
│   ├── lightbox.js               ← preview للنسخ
│   ├── sidebar.js                ← sidebar موحَّد
│   └── grid-card.js              ← order-card (للقائمة الجانبية)
│
└── services/
    ├── design-items.service.js   ← markApproved + togglePrintReady + appendVersion + publishToClient
    └── upload.service.js         ← uploadSlotFile + buildVersion + inferSlotKind
```

---

## دورة العمل النهائية

```
المصمم/Admin/CS يفتح designer-hub.html
   ↓
يشوف قائمة أوردراته (admin: كل أوردرات stage=design — CS: نفسها — المصمم: المسندة له)
   ↓
يضغط أوردر → بنوده تظهر يميناً
   ↓
لكل بند:
   - يرفع نسخة جديدة (الـ slot يُستنتج تلقائياً من نوع الملف)
   - ⬆️ Mockup (صورة) / 📄 PDF / 📁 Source (ملف تصميم خام)
   - ✅ يعتمد البند
   - 🖨️ يعلّمه جاهز للطباعة
```

---

## ما أُلغي

| الفيتشر | السبب |
|---|---|
| Tab "المكتبة" + library-view | إلغاء صفحة المكتبة |
| Tab "المعرض" + gallery-view | إلغاء صفحة المعرض |
| زر "نشر للمعرض" في work-view | إلغاء المعرض |
| `gallery.service.js` | إلغاء المعرض |
| `subscribeGallery` في repository | إلغاء المعرض |
| `getVisibleTabs`/`getDesignerHubDefaultTab` في permissions | لا توجد tabs |
| `client-design-library.html` (الصفحة) | redirect shim |
| `gallery.html` (الصفحة) | redirect shim |

---

## قواعد الحوكمة المطبَّقة

| القاعدة | التطبيق |
|---|---|
| G2 — One Firebase Config | ✅ كل imports من `core/firebase-init.js` |
| G3 — Bounded Listeners | ✅ كل `onSnapshot` له `limit()` (LIMITS constant) |
| G4 — Repository Pattern | ✅ كل query في `repository.js` |
| G6 — Engine Writes Only | ✅ لا writes مالية |
| G7 — Tenant Aware | ✅ كل query تقبل `tenantId` optional |
| G9 — Incremental Migration | ✅ redirect shims تمنع 404s |

---

## التوفير المحقَّق

| | الآن | بعد الـ refactor |
|---|---|---|
| URLs نشطة | 3 | 1 |
| تكرار الكود | 45-50% | <10% |
| سطور كود (إجمالي) | 3,703 | ~1,400 (-62%) |
| onSnapshot بدون limit | 5 | 0 |
| RULE 8 violations | 1 (library) | 0 (أُلغيت) |

---

## الخطوات النهائية (Cutover Status)

| الخطوة | الحالة |
|---|---|
| استبدال `design-workspace.html` بـ `designer-hub.html` في sidebar-config | ✅ تم |
| `client-design-library.html` → redirect shim | ✅ تم |
| `gallery.html` → redirect shim | ✅ تم |
| `design-workspace.html` → redirect shim | ⏳ مؤجَّل (يمكن في PR لاحق بعد مراقبة) |
| تنظيف الـ references في 20+ ملف HTML | ⏳ مؤجَّل (لا يكسر شيء حالياً بسبب redirects) |
