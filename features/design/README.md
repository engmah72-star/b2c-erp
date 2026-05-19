# features/design — Designer Hub

> **النطاق المصحَّح:** دمج الـ 3 صفحات المرتبطة بدور المصمم.
> **الهدف:** دورة عمل بسيطة، صفحة واحدة، لا تكرار.
> **المرجع:** `/docs/RFC-design-refactor.md`

## الصفحات المُدمجة

| الصفحة الحالية | يحل محلها |
|---|---|
| `client-design-library.html` | Tab "🎨 مكتبة التصاميم" |
| `design-workspace.html` | Tab "🖥️ عملي" |
| `gallery.html` | Tab "🖼️ المعرض" |

## الحالة

| المرحلة | الحالة |
|---|---|
| PR-1 — Skeleton + Repository | ✅ merged في main |
| **PR-2 — Designer Hub Unified** | ✅ هذا الـ PR |
| PR-3 — Cutover (redirect shims) | ⏳ |

## البنية

```
features/design/
├── repository.js                 ← كل Firestore queries (G3 + G4)
├── permissions.js                ← Role-based access (RULE 8)
├── state.js                      ← Pub/sub state (محجوز للاستخدام المستقبلي)
├── hub.entry.js                  ← Bootstrap + tab router
│
├── views/
│   ├── work-view.js              ← Tab "عملي"
│   ├── library-view.js           ← Tab "المكتبة"
│   └── gallery-view.js           ← Tab "المعرض"
│
├── components/
│   ├── utils.js                  ← escapeHtml + toast + helpers
│   ├── lightbox.js               ← Lightbox موحَّد (يحل lb-overlay + lightbox)
│   ├── sidebar.js                ← sidebar موحَّد (يحل 3× نسخ)
│   └── grid-card.js              ← بطاقات بـ variants (gallery/library/client/order)
│
└── services/
    ├── design-items.service.js   ← markApproved, togglePrintReady, publishToClient, appendVersion
    ├── gallery.service.js        ← publishToGallery (atomic batch)
    └── upload.service.js         ← uploadSlotFile + buildVersion + inferSlotKind
```

**الإجمالي: ~2,130 سطر JS + 189 سطر HTML = ~2,320 سطر** (vs 3,703 في الصفحات القديمة → **-37%**).

## دورة العمل

```
designer-hub.html?tab=<work|library|gallery>

المصمم يفتح الـ Hub
   ↓
Tab "عملي" (افتراضي للمصمم):
   - يشوف أوردراته المسندة
   - يضغط أوردر → يفتح بنوده
   - يرفع نسخة → الـ slot يُستنتج تلقائياً من نوع الملف
   - يعتمد بند
   - ينشر للمعرض العام بضغطة (modal مدمج)

Tab "المكتبة" (افتراضي للـ Admin/CS):
   - يشوف كل العملاء بإحصائياتهم
   - يضغط عميل → تصاميمه
   - يضغط تصميم → ينقله لـ Tab "عملي" + يفتح البند

Tab "المعرض" (للكل):
   - يشوف المعرض العام (gallery collection)
   - بحث + فلترة بالتصنيف + sort
   - Lightbox مع keyboard navigation (Esc/Arrow keys)
```

## قواعد الحوكمة المطبَّقة

| القاعدة | التطبيق |
|---|---|
| G2 — One Firebase Config | ✅ كل الـ imports من `core/firebase-init.js` |
| G3 — Bounded Listeners | ✅ كل onSnapshot له `limit()` (انظر `LIMITS` constant) |
| G4 — Repository Pattern | ✅ كل query في `repository.js` |
| G6 — Engine Writes Only | ✅ لا writes مالية في هذا الـ feature |
| G7 — Tenant Aware | ✅ كل query تقبل `tenantId` optional |
| RULE 8 — Privacy by Role | ✅ `displayPhone()` في library view |

## الـ Imports النظيف

```js
// من view أو modal:
import { subscribeDesignItems, subscribeGallery, LIMITS } from '../repository.js';
import { canSeePhone, getDesignerHubDefaultTab, getVisibleTabs } from '../permissions.js';
import { $, escapeHtml, toast, debounce } from '../components/utils.js';
import * as itemsService from '../services/design-items.service.js';
import * as galleryService from '../services/gallery.service.js';
```

## ما هو مؤجَّل لـ Phase 2

- ZIP bulk download (library)
- Drag-drop multi-file → auto slot distribution
- Keyboard shortcuts (j/k/`/`/Esc) داخل work-view
- Performance ring + advanced KPIs
- Edit item modal (rare admin operation)
- Revision modal (يمكن استبداله بـ inline form)
- Client decision processing UI (Admin-only)
- Portfolio sub-tabs (My / Review / Public)

**الصفحات القديمة تظل شغالة** — لو محتاج ميزة مؤجَّلة، استخدم الصفحة القديمة مؤقتاً.

## PR-3 القادم

- تحديث `sidebar-config.js`: حذف الـ 3 entries القديمة، إضافة `designer-hub.html`
- الـ 3 صفحات القديمة → redirect shims لـ `designer-hub.html?tab=X`
- بعد أسبوع مراقبة → حذف نهائي
