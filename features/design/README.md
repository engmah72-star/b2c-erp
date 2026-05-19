# features/design — Designer Hub

> **النطاق النهائي:** مساحة التصميم فقط (work view).
> **المرجع:** `/docs/RFC-design-refactor.md`

## التغييرات الأخيرة

- ❌ **أُلغي:** Tab "المكتبة" + Tab "المعرض" + زر "نشر للمعرض"
- ✅ `designer-hub.html` = مساحة عمل المصمم (work view فقط)
- ✅ `client-design-library.html` و `gallery.html` → redirect shims

## البنية

```
features/design/
├── repository.js                 ← كل Firestore queries (G3 + G4)
├── permissions.js                ← Role-based access (RULE 8)
├── state.js                      ← Pub/sub state (محجوز)
├── hub.entry.js                  ← Bootstrap + auth + mount work view
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
    ├── design-items.service.js   ← markApproved + togglePrintReady + appendVersion
    └── upload.service.js         ← uploadSlotFile + buildVersion + inferSlotKind
```

## دورة العمل

```
يفتح designer-hub.html
   ↓
قائمة أوردراته (يمين: split view)
   ↓
يضغط أوردر → بنوده تظهر يسار
   ↓
لكل بند:
   - رفع نسخة (Mockup/PDF/Source — يُستنتج من نوع الملف)
   - اعتماد البند
   - تعليم جاهز للطباعة
```

## قواعد الحوكمة

| القاعدة | التطبيق |
|---|---|
| G2 | ✅ Firebase imports من `core/firebase-init.js` |
| G3 | ✅ كل onSnapshot له `limit()` |
| G4 | ✅ كل query في `repository.js` |
| G6 | ✅ لا writes مالية |
| G7 | ✅ كل query تقبل tenantId optional |

## الـ Imports النظيف

```js
// من view أو service:
import { subscribeDesignOrders, subscribeDesignItems, LIMITS } from '../repository.js';
import { canAccessDesignerHub } from '../permissions.js';
import { $, escapeHtml, toast } from '../components/utils.js';
import * as itemsService from '../services/design-items.service.js';
import * as uploadService from '../services/upload.service.js';
```
