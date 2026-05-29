# RULE SUP1 — SUPPLIER CENTRALIZATION CHARTER (ميثاق مركزية الموردين)

> **قاعدة بيانات الموردين المركزية هي المصدر الرسمي والوحيد للحقيقة (Single Source of Truth) عن كل مورد داخل المؤسسة.**
>
> هذه القاعدة تطبيق صريح لـ **RULE 1 (Single Source of Truth) + RULE C1 (Centralization) + RULE A1 (Central Actions) + RULE H3 (Universal Audit) + PC1 (Process-Centric)** على طبقة الموردين.
>
> النطاق: أحد الأطراف الأربعة في الـ BUSINESS DNA (الموردين). لا يوسّع النظام خارج الأطراف الأربعة.

---

## المبدأ الأعلى

أي معلومة تخص المورد تُدخَل **مرة واحدة فقط** وتصبح المرجع الرسمي الوحيد لكل الأقسام
والعمليات والتقارير. **ممنوع** بيانات موردين مكررة أو موزعة بين صفحات أو جداول مستقلة.

---

## المعمارية المعتمدة (Single Source of Truth)

| الكيان | المصدر الوحيد | الملاحظة |
|--------|----------------|----------|
| ملف المورد (مطابع/خدمات) | `suppliers_v2` | `supType:'printer'` |
| ملف شركة الشحن | `shippers_v2` | `supType:'shipper'` |
| المعرّف الفريد للمورد | `doc.id` (Firestore) | يُستخدم في كل العلاقات |
| رصيد/مدفوعات المورد | `supplier_payments` (عبر FSE فقط) | RULE 1 + G6 |
| الأثر المالي + التدقيق المالي | `financial_ledger` (عبر FSE فقط) | RULE 5 |
| **سجل نشاط المورد (lifecycle)** | **`supplier_activity` (append-only)** | **جديد — principles 9 + 14** |
| فئات/تخصصات الموردين | `master_lists/supplier_categories` | RULE M1 |

> **Two-collection model** (`suppliers_v2` للمطابع، `shippers_v2` للشحن) قرار معماري
> مقصود — وليس تكراراً. كلاهما يُدار من نفس الطبقة المركزية `supplier-actions.js`
> وبنفس الصلاحية `canAddSuppliers` / `manage_suppliers`.

**المدخل المركزي الوحيد لكل كتابة:** `supplier-actions.js → supplierActions.*`
(لا inline writes في `suppliers.html` — تطبيق RULE A1 + L1).

---

## المبادئ الـ 15 ← الحالة الحالية ← الإجراء

| # | المبدأ | الحالة | المصدر/الإجراء |
|---|--------|--------|----------------|
| 1 | ملف مركزي واحد لكل مورد | ✅ | `suppliers_v2` / `shippers_v2` + `supplierActions` |
| 2 | كل البيانات مرتبطة بالملف المركزي | ✅ | المراجع عبر `supplierId` |
| 3 | التعديل ينعكس فوراً في كل النظام | ✅ | الصفحات تقرأ من المصدر عبر `onSnapshot` (لا نسخ محلية) |
| 4 | **منع موردين مكررين** | ✅ *(هذا الـ PR)* | `_findDuplicate()` على `nameKey` + `phone` قبل `create` |
| 5 | كل العمليات تمر عبر النظام وتُربط بالملف | ✅ | كل CRUD + payments عبر `supplierActions` |
| 6 | كل الأقسام تستخدم نفس البيانات (لا نسخ) | ✅ | الصفحات تقرأ بـ `supplierId` |
| 7 | **معرّف فريد (Unique ID) لكل مورد** | ✅ | `doc.id` + `nameKey` للكشف عن التكرار |
| 8 | كل التعاملات تُربط عبر المعرّف المركزي | ✅ | `supplierId` في costItems/payments/ledger |
| 9 | **سجل نشاط مركزي (إنشاء/تعديل/حذف/اعتماد)** | ✅ *(هذا الـ PR)* | `supplier_activity` + `_logActivity()` ذرياً مع كل mutation |
| 10 | التقارير تعتمد على القاعدة المركزية | ✅ | KPIs تقرأ من `supplier_payments`/`financial_ledger` |
| 11 | الميزات الجديدة تعتمد على البيانات الحالية أولاً | ✅ (حوكمة) | اختبار القبول أدناه |
| 12 | وصول كل الوحدات حسب الصلاحيات بلا نسخ | ✅ | `manage_suppliers` / `canSee` / Firestore rules |
| 13 | منع أي تدفق يسبب ازدواجية/تضارب | ✅ | dedup + المركزية؛ النشاط في مصدر واحد |
| 14 | **تتبع كامل لتاريخ المورد منذ الإنشاء** | ✅ *(هذا الـ PR)* | `supplier_activity` query بـ `supplierId` |
| 15 | القاعدة المركزية = SSOT الرسمي | ✅ | هذه القاعدة |

### الحقول المُلازِمة في السجلات (denormalized — مقصود، ليس تكراراً)
`order.costItems[].supplierName` و `supplier_payments.supplierName` و
`financial_ledger.supplierName` تحتفظ بـ **snapshot للاسم وقت العملية** لأغراض
الـ **audit trail الثابت** (RULE 5 + H1.3 append-only). المعرّف `supplierId` يبقى
هو الرابط الرسمي بالملف المركزي. هذا **ليس** مخالفة للمبدأ 13 — السجلات المالية
append-only بطبيعتها، والاسم المخزَّن فيها historical snapshot لا مصدر حقيقة موازٍ.

---

## ما طبّقه هذا الـ PR (Incremental — RULE E1/G9)

1. **منع التكرار (4 + 7):** `supplierActions.create` يرفض إنشاء ملف بنفس الاسم
   (`nameKey` موحَّد) أو نفس `phone` داخل نفس الـ collection. تجاوز مشروع عبر
   `allowDuplicate:true` (مُسجَّل في `meta`). `nameKey` يُحفَظ على create/update.
2. **سجل النشاط المركزي (9 + 14):** collection جديد `supplier_activity`
   (append-only) يُكتب **ذرياً داخل نفس `writeBatch`** مع كل عملية
   create/update/delete/archive/unarchive عبر `_logActivity()` بصيغة `auditEntry`
   (RULE H3: `date + by + byId + kind`).
3. **Firestore rule** لـ `supplier_activity`: read لمن له صفحة الموردين/الحسابات،
   create لمن يملك `canAddSuppliers`/`canFinancialWrite`, **لا update/delete**.
4. **Composite index** (`supplierId` + `createdAt desc`) لاستعلام تاريخ المورد.

النشاط المالي (دفعات/عكس) يبقى مصدره `financial_ledger` عبر FSE (RULE 5) — لا يُكرَّر
في `supplier_activity` (تطبيق المبدأ 13). التاريخ الكامل للمورد = اتحاد
`supplier_activity` (lifecycle) + `supplier_payments`/`financial_ledger` (مالي)،
كلاهما مرتبط بـ `supplierId`.

---

## اختبار قبول أي feature تمسّ الموردين (إلزامي — تطبيق المبدأ 11)

| السؤال | المطلوب |
|--------|---------|
| هل تستخدم `supplierId` المركزي بدل تخزين بيانات مورد مكررة؟ | ✅ نعم |
| هل تقرأ من المصدر الحالي قبل إنشاء حقل/جدول جديد؟ | ✅ نعم |
| هل كل كتابة على المورد تمر عبر `supplierActions.*`؟ | ✅ نعم |
| هل أي mutation تُسجَّل في `supplier_activity` (أو ledger للمالي)؟ | ✅ نعم |
| هل تحترم الصلاحيات (`manage_suppliers` / `canSee`)؟ | ✅ نعم |
| هل تنشئ مصدر حقيقة موازٍ أو نسخة محلية للبيانات؟ | ❌ لا |

**أي إجابة خاطئة → يُعاد التصميم.**

---

## متابعات مقترحة (لاحقة، تدريجية — لا تكسر التشغيل)

- **UI:** عرض تبويب "سجل النشاط" في `suppliers.html` يقرأ `supplier_activity`
  بـ `where('supplierId','==',id) orderBy('createdAt','desc') limit(...)`.
- **Migration:** backfill `nameKey` على السجلات القديمة (script في `tests/` بـ dry-run)
  لتقوية كشف التكرار على الموردين السابقين.
- **اعتماد الموردين (approval):** ربط مسار اعتماد المورد بنفس `_logActivity(kind:'op')`
  عند تفعيله.

أي drift عن SUP1 يُسجَّل في `GOVERNANCE_AUDIT.md` ويُعالَج تدريجياً (RULE G9).
