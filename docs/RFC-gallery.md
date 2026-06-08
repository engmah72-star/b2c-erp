# RFC — معرض التصاميم (Company Portfolio Gallery)

> **التاريخ:** 2026-06-08
> **القرار:** إحياء المعرض كـ **module مُعرَّف** (بعد إلغائه سابقاً في
> `RFC-design-refactor` لأنه بُني كـ tab مكرّر بلا هوية).
> **النطاق:** بورتفوليو أعمال الشركة — رفع مباشر من المصمم، عرض عام مجهول.

---

## 1) التوتر الجوهري وحلّه

«بورتفوليو» يوحي بواجهة تسويقية خارجية، لكن الـ BUSINESS DNA: نظام **داخلي**، 4
أطراف فقط، **ليس** Marketplace/منصة عامة.

**الحل (إعادة التأطير):** المعرض = **أصل داخلي مُنسَّق** يخدم الأطراف الأربعة:
- الشركة/الأدمن: مرجع جودة · مادة تسويق · onboarding.
- الموظفون (CS/مصممون): مكتبة إلهام · «أُريك شغل مشابه» أثناء محادثة العميل.
- العميل: يرى المعرض (القراءة عامة في القواعد — موافقة تجارية قائمة كدعاية).

الخصوصية تُحَلّ بالـ **مجهولية**: لا أسماء عملاء → لا خرق RULE 8 → متوافق مع الدستور.

---

## 2) القرارات (محسومة مع المستخدم)

| السؤال | القرار |
|---|---|
| هوية العميل | **مجهول** — `attribution='anonymous'`، لا `clientName`. |
| المصدر | **رفع مباشر من المصمم** (لا snapshot مشتق من design_items). |
| العميل يرى المعرض؟ | نعم (القراءة عامة قائمة). |

**قرار معماري (RULE 1):** عنصر المعرض لقطة مستقلة (Snapshot) لا Mirror حيّ —
مصدر الحقيقة للعرض المنسَّق = `gallery`؛ لا يتعارض مع design_items.

---

## 3) تعريف الـ Module (RULE 7 / G10)

| البند | التعريف |
|---|---|
| **Entity** | `gallery/{id}` — §5. |
| **Events** | publish · setVisibility · toggleFeature · remove. **غير مالية** (G6). |
| **Accounting** | لا شيء — module غير مالي بالكامل. |
| **Dashboard** | `gallery.html` (شبكة + فلاتر + lightbox + لوحة رفع). |
| **Reversal** | الإخفاء soft (`isVisible=false`)؛ الحذف النهائي admin فقط. |
| **Tenant** | `tenantId` على كل doc + كل query (G7). |
| **Permissions** | بلا capability جديدة — §4. |
| **Tests** | `tests/features-gallery.test.mjs` (26 حالة، model + permissions). |

---

## 4) الصلاحيات (بلا capability جديدة)

| الفعل | الحارس (UI) | firestore.rules | مَن |
|---|---|---|---|
| عرض | `canViewGallery()` = عام | `read: if true` | الجميع |
| نشر | `canPublishGallery(role)` | create: `hasPage('design')` | admin · ops · مصممون |
| إخفاء/إظهار | `canToggleVisibility` (صاحبه/admin) | update: `hasPage('design')` | الصاحب · admin |
| تمييز (feature) | `canCurateGallery` | update | admin |
| حذف | `canDeleteGalleryItem` | delete: `isAdmin` | admin |

دفاع 3 طبقات: UI + firestore.rules (fail-closed) + audit (H3).

---

## 5) Schema — `gallery/{id}`
متوافق مع `customer-portal/services/gallery.service.js` (يقرأ `productType` ·
`isVisible` · `publishedAt`).
```
title, productType, tags[],
imageUrl, imagePath,
designerId, designerName, attribution:'anonymous',
isVisible, isFeatured, sortOrder, tenantId,
publishedAt, publishedBy, publishedByName, createdAt, updatedAt, audit[]
```

---

## 6) البنية التحتية المُعاد استخدامها (صفر تغيير في Stable Core)

- `firestore.rules → /gallery` و`/design_gallery` (موجودة مسبقاً).
- `storage.rules → /gallery` (صور · <20MB · staff التصميم).
- أُضيف فقط: `core/storage-helpers.js → uploadGalleryFile` (مسار `gallery/…`, S1).

> لم نلمس `firestore.rules`/`storage.rules` → لا خطر على بوابة rules-tests في CI.

---

## 7) ما بُني (Phase 1 + رفع المصمم)

```
features/gallery/{model,permissions,repository,gallery.entry}.js
features/gallery/views/grid-view.js
features/gallery/services/gallery.service.js
features/gallery/README.md
gallery.html (إحياء — كان redirect shim)
gallery.css
tests/features-gallery.test.mjs
core/storage-helpers.js (+ uploadGalleryFile)
sidebar-config.js (+ بند gallery، flag-gated)
```

**القابلية للعكس (E1):** `?feat.gallery=0` → يعيد التحويل لـ designer-hub؛
بند الـ sidebar يختفي بـ `feat.gallery=0`؛ designer-hub (work view) بلا مساس.

---

## 8) مؤجَّل (Phases لاحقة)

- إبراز المعرض داخل `client-portal` بشكل مخصّص (الخدمة قائمة `gallery.service.js`).
- إعادة ترتيب (drag reorder) + تصنيفات مُدارة من settings.
- ربط اختياري «انشر للمعرض» من design-items للمصمم (snapshot من نسخة معتمدة).
