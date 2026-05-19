# core/ — Stable Core Modules

> **هذه الـ modules تتطلب 2-reviewer approval لأي تعديل (RULE G1).**
> **المرجع:** REGRESSION_PREVENTION.md §7.

## ما هو "Stable Core"؟

modules تعتمد عليها معظم الـ system. تعديلها بدون عناية = ripple يكسر pages كثيرة. لذلك:

1. **Frozen by default** — أي PR يلمسها يحتاج reviewer ثانٍ + smoke tests passing.
2. **Backward compatible only** — لا breaking changes بدون migration plan.
3. **Test first** — أي تعديل معه test.

## الـ Modules

### `firebase-init.js`
- **الدور:** المصدر الوحيد لـ Firebase initialization (RULE G2).
- **يُصدِّر:** `app`, `db`, `auth`, `storage`, `FB_CONFIG`.
- **المستخدم بـ:** الصفحات الجديدة. الصفحات القديمة لسه تعرّف FB_CONFIG محلياً — migration تدريجي.

### `permissions-matrix.js`
- **الدور:** مصدر واحد للـ Role × Field access matrix (RULE 8).
- **يُصدِّر:** `DEFAULT_PERMISSIONS`, `SENSITIVE_FIELDS`, `ROLE_CAN_SEE_*`, `canSeeField()`, `maskPhone()`.
- **يجب أن يكون مرآة لـ:** `shared.js` (legacy)، `viewas.js`، `firestore.rules`.

## القواعد الذهبية

1. **لا تضيف module جديد هنا بدون موافقة senior architect.**
2. **لا تحذف export موجود — أضف فقط.**
3. **كل تعديل: زيادة، ليس تغيير.**
4. **أي تعديل يحتاج CHANGELOG entry هنا.**

## CHANGELOG

### 2026-05-19
- `firebase-init.js`: إنشاء كـ مصدر FB config مستقبلي.
- `permissions-matrix.js`: إنشاء كـ مصدر RULE 8 matrix.

## Migration Path

الصفحات القديمة تنتقل تدريجياً (REGRESSION_PREVENTION.md §6.2):

```js
// قبل (60+ ملف)
const app = initializeApp({apiKey:"AIzaSy...", ...});
const db = getFirestore(app);

// بعد
import { app, db } from './core/firebase-init.js';
```

**الـ schedule:** 15-20 صفحة شهرياً. الـ system يكمل تشغيله أثناء الانتقال (لا big-bang).
