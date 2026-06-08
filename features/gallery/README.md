# features/gallery — معرض التصاميم (بورتفوليو الشركة)

> **النطاق:** بورتفوليو أعمال الشركة — رفع مباشر من المصمم، عرض عام مجهول.
> **المرجع الكامل:** `/docs/RFC-gallery.md`

## الفكرة
أصل داخلي مُنسَّق (ذاكرة الشركة البصرية + تمكين CS/المصممين)، **ليس** منصة عامة.
يخدم الأطراف الأربعة: الشركة (تسويق/جودة) · الموظفون (مرجع/إلهام) · العميل (يرى المعرض).

## القرارات الحاكمة
- **مجهول (RULE 8):** لا أسماء عملاء، `attribution='anonymous'`. صور mockup فقط — لا source/PDF.
- **Snapshot لا Mirror (RULE 1):** عنصر المعرض مستقل، يُرفع مباشرةً — لا join حيّ لـ design_items.
- **بلا capability جديدة:** نشر = admin/ops/مصممون · إدارة/حذف = admin.
- **Reversible (E1):** الإخفاء soft (`isVisible=false`)؛ kill switch `?feat.gallery=0`.

## البنية
```
features/gallery/
├── model.js                 ← schema + validation + sort (نقي، مُختبَر)
├── permissions.js           ← can{View,Publish,ToggleVisibility,Curate,Delete} (نقي)
├── repository.js            ← subscribeGallery + getGalleryItem (G3 limit + G4 + G7)
├── gallery.entry.js         ← bootstrap (auth اختياري — قراءة عامة) + mount
├── views/
│   └── grid-view.js         ← الشبكة + الفلاتر + lightbox + لوحة الرفع (view فقط)
└── services/
    └── gallery.service.js   ← publish/setVisibility/toggleFeature/remove (+ audit H3)
```

## نموذج البيانات — `gallery/{id}`
متوافق مع `customer-portal/gallery.service.js` (يقرأ `productType`/`isVisible`/`publishedAt`).
```
title · productType · tags[] · imageUrl · imagePath
designerId · designerName · attribution:'anonymous'
isVisible · isFeatured · sortOrder · tenantId
publishedAt/By/ByName · createdAt · updatedAt · audit[]
```

## البنية التحتية المُعاد استخدامها (لا تكرار)
- `firestore.rules → match /gallery`: قراءة عامة · إنشاء/تحديث للمصمم/الأدمن · حذف admin.
- `storage.rules → match /gallery`: صور فقط · < 20MB · كتابة staff التصميم.
- `core/storage-helpers.js → uploadGalleryFile` (مسار `gallery/…`، S1).
- `core/feature-flags.js → isFeatureEnabled('gallery', true)`.

## الحوكمة
| القاعدة | التطبيق |
|---|---|
| L1 | ✅ `gallery.html` view فقط · كل منطق/كتابة في الـ module |
| G3 | ✅ `subscribeGallery` فيه `limit(120)` |
| G4 | ✅ كل query في `repository.js` |
| G6 | ✅ غير مالي — صفر كتابة wallets/ledger |
| G7 | ✅ كل query/doc tenant-aware |
| H1.1 | ✅ لا writes في HTML — عبر service (نمط `design-items.service.js`) |
| H3 | ✅ كل mutation له `auditEntry()` |
| RULE 8 | ✅ مجهول — لا بيانات عميل حسّاسة |
| E1 | ✅ flag + soft reversal + alongside (designer-hub بلا مساس) |
