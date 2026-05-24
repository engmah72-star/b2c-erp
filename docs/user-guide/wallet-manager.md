# 💰 دليل المحاسب (Wallet Manager)

> دورك: حارس الأرقام. كل قرش له مصدر، كل تحويل له audit، كل تسوية مع شركات الشحن والموردين محتاجة دقّة.

---

## 🏠 لوحتك الرئيسية — `accounts.html`

نفس صفحة admin، لكن صلاحياتك المالية المحدّدة:

### KPIs ترصدها يومياً
- **رصيد المحافظ** = الكاش الحقيقي عندنا الآن
- **التحصيل الفعلي** = من transactions_v2 (دفعات العملاء)
- **المصروفات الفعلية** = خروج (موردين + شحن + مرتجعات + general)
- **التحصيل المتوقع** = اللي لسه على العملاء
- **الفجوة (drift)** = أي اختلاف بين الـ ledger والـ projection

### نوع المهام
- تحويلات بين المحافظ
- تسجيل مصروفات عامة
- تسوية شحن (settlement)
- صرف مرتبات (payroll)
- اعتماد طلبات مالية (مع admin/operation_manager)

---

## 💸 العمليات الأساسية

### تحويل بين محافظ
1. زر **🔄 تحويل**
2. من → لمحفظة → مبلغ → سبب
3. ✅ تأكيد — قيد في الـ ledger يسجّل (transfer in + transfer out)

### تسجيل مصروف عام
1. زر **💸 مصروف**
2. اختار محفظة + مبلغ + categorization (rent, utilities, supplies, ...)
3. وصف
4. ✅ تأكيد — قيد expense في الـ ledger

### تسوية مع شركة شحن — `shipping-accounts.html`
1. اختار شركة الشحن
2. شوف الأوردرات اللي عندها كاش (collected)
3. اكتب: المبلغ المُستلَم، رسوم الشركة، التاريخ
4. ✅ تأكيد — الأوردر يتنقل لـ "settled" + قيد ledger

⚠️ بيظهر لو فيه drift (شركة الشحن تأخذ أكثر من المتوقع) → فحص قبل التأكيد.

### Payroll — صرف مرتبات
1. `accounts.html` → تبويب **Payroll** أو افتح `employee-profile.html` للموظف
2. اختار الشهر
3. النظام يحسب:
   - Base salary
   - Commission (من الـ deliveries / designs / sales)
   - Bonus (لو في goal تحقق)
   - Deductions (إخفاقات، absent days)
4. ✅ صرف — قيد في `employee_payments` + خصم من محفظة

### دفعة لمورد
1. `approvals.html` فيه قائمة الـ pending approvals للموردين
2. أو من `suppliers.html`:
   - افتح المورد → شوف الـ outstanding balance
   - زر **💸 دفع**
   - مبلغ + محفظة + إيصال
3. ✅ تأكيد — قيد في `supplier_payments` + خصم من محفظة

---

## 🔍 الـ Ledger والـ Audit

### `ledger.html` — كل القيود
- فلتر بـ:
  - **walletId** (مين تأثّرت)
  - **eventType** (CUSTOMER_PAYMENT / SUPPLIER_PAYMENT / SHIPPING_SETTLEMENT / إلخ)
  - **clientId / employeeId / supplierId**
  - **تاريخ** (range)
- كل قيد ليه:
  - amount + direction (in/out)
  - createdBy (مين سجّله)
  - editHistory (لو اتعدّل قبل كده)
  - isDeleted (لو ملغي)
  - reversalOf (لو هو reversal لقيد قبله)

### Drift Detection
في `accounts.html` فيه banner للـ drift:
- 🔴 critical drift = paid + remaining ≠ total
- 🟡 warning drift = settled > collected
- باقي 13 invariants موصوفة في `core/financial-invariants.js`

لو شفت drift → افتح الأوردر، اعمل reconcile.

---

## 👀 صلاحياتك

| تقدر | لا تقدر |
|------|---------|
| ✅ تشوف كل المحافظ والـ ledger | ❌ تعدّل الـ rules أو إعدادات النظام |
| ✅ تحويلات + مصروفات | ❌ تعمل impersonation |
| ✅ تسوية شحن + payroll | ❌ تعدّل صلاحيات موظف |
| ✅ تعتمد طلبات مالية (مع admin) | ❌ تنشئ موظف جديد |
| ✅ تشوف cost/margin/prices كاملة | ❌ تشوف ملفات التصميم (مش دورك) |
| ✅ تعدّل قيد قديم (مع audit + سبب) | ❌ تحذف قيد (soft-delete فقط، مرئي في ledger) |

---

## 🚨 أخطاء شائعة + حلول

| الخطأ | الحل |
|-------|------|
| سجّلت تحويل غلط | افتح القيد في ledger.html → زر **↩️ Reverse** → سبب → النظام يسجّل reversal entry |
| فيه drift بين ledger و projection | شغّل `rebuildFinancialProjection(db, orderId)` من admin tools — يقدّم الـ projection للـ ledger |
| عميل دفع cash + النظام ما سجّلش | افتح الأوردر، اعمل **تسجيل تحصيل** يدوياً + سبب |
| الـ remaining في صفحة معيّنة مش بيتطابق مع الـ ledger | كلّم admin — `core/projection.js` فيه `compareProjectionVsLedger` بيكشف ده |

---

## 🎯 KPIs بتاعتك

- **drift count** اليومي (يجب يكون 0 في عالم مثالي)
- **معدّل reconciliation** للأوردرات
- **معدّل التسوية مع شركات الشحن** (الوقت بين collected → settled)
- **معدّل اعتماد طلبات الموردين** (الوقت بين request → approved)
- **balance accuracy** (الـ wallets balance match transactions sum)
