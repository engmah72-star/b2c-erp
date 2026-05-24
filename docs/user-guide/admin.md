# 👑 دليل الأدمن (Admin)

> دورك: المالك التشغيلي للنظام. لك صلاحية كاملة على كل الصفحات + الإعدادات + المراجعة + إدارة الموظفين والمحافظ.

---

## 🏠 لوحتك الرئيسية — `accounts.html` (مع `exec-dashboard.html` كنظرة سريعة)

### الأقسام في الـ accounts
- **رصيد المحافظ** — كل cash/instapay/etc balances
- **حركة الفترة** — income/expense/profit للفترة المختارة
- **التحصيل المتوقع** — pending revenue من أوردرات اتباعت ومستلمتش
- **التحصيل الفعلي** — earned revenue من transactions_v2
- **رصيد شركات الشحن** — لسه عندهم فلوس لك
- **رصيد العملاء** — العملاء عليهم باقي
- **تكاليف الأوردرات** — اللي اتصرف على الموردين
- **رصيد الموردين** — لسه لك عندهم أو لهم عندك

### `exec-dashboard.html` للنظرة الكلية
- 🌐 صحة الشبكة (KPIs اقتصادية)
- ⚙️ مؤشرات التشغيل اليومية
- 💰 المؤشرات المالية
- 🚨 التنبيهات الحرجة
- 📊 أداء الموظفين والموردين والعملاء

---

## 💼 الإدارة اليومية

### تعيين موظف لأوردر
1. افتح الأوردر (من `clients.html` أو أي صفحة)
2. اضغط **تعيين موظف** → اختار من القائمة
3. لو دور المصمم → الأوردر يظهر في لوحته فوراً

### تغيير stage يدوياً (طوارئ)
- في `clients.html` (Admin → Control Grid):
1. اختار الأوردر
2. تبويب **Inline edit**
3. غيّر stage من dropdown
4. اكتب سبب (إجباري — يدخل في audit log)

### تعديل سعر / دفعة بعد ما اتسجّل
1. الـ Control Grid فيه ميزة **Inline edit للحسابات**
2. عدّل الـ totalPaid أو salePrice
3. النظام بيطلب **سبب التعديل** (إجباري)
4. القيد القديم بيتعكس + قيد جديد + entry في timeline

⚠️ ده audit-heavy — استخدمه بحذر. كل تعديل بيظهر للموظفين كـ "[أدمن] تعديل ..."

---

## 👥 إدارة الموظفين — `employees.html` + `employee-profile.html`

### إضافة موظف جديد
1. زر **+ موظف جديد**
2. اكتب: الاسم، الموبايل (هيكون اسم المستخدم)، الدور، الإيميل (اختياري)
3. النظام يولّد له:
   - حساب Firebase Auth
   - users/{uid} document
   - employees/{empId} document
4. كلمة السر الافتراضية = `123456` — الموظف يغيّرها عند أول دخول

### تعيين mustChangePassword
بيكون `true` لأي موظف جديد — معناها أول login محتاج يغيّر كلمة السر.

### الـ Goals الشهرية
في `employee-profile.html` تبويب **Goals**:
- اختار شهر
- اكتب الـ KPI: عدد deliveries (للشحن)، عدد designs (للمصمم)، إلخ
- بنهاية الشهر النظام بيحسب الـ achievement %

### تقييم شهري (Evaluation)
- في **Evaluations**: اكتب رأيك في أداء الموظف هذا الشهر
- يظهر للموظف نفسه (شفافية)
- بيدخل في حساب الـ score تلقائياً

### تعيين كلمة سر للموظف (لو نسى)
- في `employee-profile.html` تبويب **Password**
- زر **🔑 تعيين كلمة سر** → ادخل الجديدة
- زر **🔄 إعادة إنشاء حساب الدخول** = آخر حل لو الحساب fully broken

---

## 💰 المحافظ والـ Ledger

### إضافة محفظة جديدة
1. `accounts.html` → زر **+ محفظة جديدة**
2. اسم: cash, instapay-X, vodafone-cash, ...
3. رصيد افتتاحي (لو فيه)

### تحويل بين محافظ
1. زر **🔄 تحويل**
2. من المحفظة + لها المحفظة + المبلغ
3. سبب (اختياري) — مفيد للـ audit
4. ✅ تأكيد — النظام يسجّل transaction في الـ ledger

### مصروف عام (general expense)
- مصروفات الشركة (إيجار، فواتير، أدوات)
- زر **💸 مصروف** → اختار محفظة + مبلغ + categorization

### مراجعة قيد قديم
- `ledger.html` فيه كل الـ entries بترتيب زمني
- فلتر حسب: walletId, eventType, تاريخ, employeeId, إلخ
- كل قيد ليه `editHistory` لو اتعدّل قبل كده

---

## 🔐 الإعتمادات (Approvals) — `approvals.html`

كل طلب مالي (دفع مورد، صرف سلفة، استرداد عميل، مصروف عام) لازم admin أو operation_manager يعتمده.

### الـ Flow
1. الموظف يقدّم طلب (من `my-requests.html`)
2. الطلب يظهر في `approvals.html` عندك بـ:
   - 🎯 النوع (supplier_payment / salary / advance / refund / general)
   - 💰 المبلغ
   - 👤 من قدّم الطلب
   - 📦 الأوردر المرتبط (لو في)
   - 📋 إيصال مرفق (لو في)
   - 🚦 **مستوى الخطر** (low/med/high) — حسب logic في `approvals-utils.js`
3. اقرأ، تأكد إن الحركة صحّة
4. زر **✅ اعتمد** أو **❌ ارفض** + سبب (إجباري للرفض)

### Risk Detection
النظام بيكشف تلقائياً:
- مبلغ كبير (> 10K = high, > 5K = med)
- طلب مماثل في نفس اليوم (duplicate)
- نفس المورد رُفض له طلب في آخر 7 أيام
- الأوردر مؤرشف/ملغي
- البند المالي مدفوع بالفعل

أي high risk → فكّر مرتين.

---

## 🛡️ Security

### تعديل الصلاحيات
- `employees.html` → اختار موظف → تبويب **Permissions**
- نوعين:
  - **Field permissions** (هل يشوف رقم العميل / cost / margin)
  - **Capabilities** (هل يقدر يعمل archive / approve / إلخ)
- التغيير يدخل في `audit_logs/permission_change`

### إنشاء impersonation (View As)
- زر **👁️ View As** في الـ sidebar
- اختار موظف → النظام يولّد custom token
- بتشوف النظام بعينه (deep impersonation)
- زر **Exit View As** للعودة

⚠️ كل impersonation بتسجّل في `impersonation_audit` — استخدمها فقط للـ debugging أو القرارات الإدارية.

---

## 📊 التقارير — `reports.html`

تبويبات:
- **Overview** — الـ summary للـ executive (smart insights, top debtors, pipeline)
- **Designers** — performance المصممين
- **Shipping** — معدّلات الشحن والتسوية
- **Clients** — top clients, segment analysis
- **Sales** — top products, monthly revenue chart
- **Returns** — كل المرتجعات في الفترة
- **Collection** — كل الأوردرات بالـ remaining، فلاتر متقدمة

اضغط أي رقم → النظام يدخّلك على الصفحة المعنية.

---

## ⚠️ مخاطر يجب الانتباه لها

| الخطر | كيف تمنعه |
|------|----------|
| تعديل قيد قديم بدون audit | النظام بيمنع — يطلب سبب إجباري. لكن خد حذر |
| حذف موظف عن طريق الخطأ | الحذف بيعمل soft-delete (isDeleted:true) — مش مفقود فعلاً، تقدر تستعيده |
| إعطاء صلاحية admin لشخص غلط | كل تغيير دور يدخل audit log — راجعه شهرياً |
| تخطّى FSE (financial-sync-engine) | لا تكتب لـ wallets/transactions_v2/financial_ledger مباشرة — استخدم actions فقط |
| إخفاء بيانات سابقة من شريك جديد (multi-tenant) | لو هتفعّل multi-tenant، فيه فحص خاص محتاجه |

---

## 🔁 المراجعة الدورية (شهرية)

في نهاية كل شهر، Admin يعمل:
1. **مراجعة الـ admin/ops accounts** — تأكد إن مفيش حسابات قديمة شغّالة
2. **drift detection scan** — `accounts.html` بيكشف لو فيه فجوات بين الـ ledger والـ projection
3. **review audit_logs** — أي حركات شك
4. **التحقق من backup** — Cloud Function `scheduledFirestoreBackup` بتشتغل ليلياً

---

## 📞 الدعم

لو لقيت شيء غير مفهوم أو bug:
- افتح issue على GitHub (admin بيقدر يعمل ده مباشرة من النظام لو فيه integration)
- أو كلّم فريق التطوير مباشرة
