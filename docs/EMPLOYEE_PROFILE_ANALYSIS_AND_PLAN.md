# تحليل بروفايل الموظف + الخطة المركزية للتواصل (Admin ↔ Employee)

> وثيقة تحليل وتخطيط. لا تغيّر سلوكاً تشغيلياً بذاتها — مرجع لقرارات التطوير
> القادمة على وحدة الموظفين. تلتزم بـ E1 (تطوير incremental · backward-compatible ·
> reversible · alongside-not-instead) و L1 (الصفحة view فقط) و RULE 1 (مصدر حقيقة واحد).

التاريخ: 2026-06-06 · النطاق: `employee-profile.html` + شاشة الموظف
(`my-profile.html`/`my-requests.html`/`my-home.html`) + قنوات التواصل بينهما.

---

## 0) الملخص التنفيذي (TL;DR)

بروفايل الموظف **غني جداً بالخصائص** وشبه مكتمل وظيفياً: تقييم، أهداف، KPIs،
رواتب وعمولات، حضور وانصراف وأذونات، إجازات، مهام، إخفاقات + تظلّمات، صلاحيات،
إدارة كلمة السر. المنطق محسوب في دوال نقية (`core/employee-*.js`) والكتابة عبر
`employee-actions.js` — معمارياً سليم.

**المشكلة ليست نقص خصائص، بل تشتّت التواصل وتعدّد الأسطح:**
1. الأدمن يخاطب الموظف ويتلقّى منه عبر **6 قنوات منفصلة** (إخفاقات/تظلّمات،
   إجازات، طلبات مالية، أذونات حضور، مهام، Inbox/DM) موزّعة على **شاشتين
   للأدمن** (`employee-profile.html` للإدارة العميقة + `admin-requests.html`
   لطابور القرارات) **بدون رابط بينهما**.
2. **بروفايل الموظف لا يُظهر الطلبات/التظلّمات المعلّقة الخاصة بهذا الموظف** —
   الأدمن يفتح البروفايل لإدارة الموظف، لكنه يضطر للخروج إلى `admin-requests.html`
   ليرى أن لديه تظلّماً أو طلب إجازة منه. سياق مكسور.
3. **لا يوجد مدخل مراسلة مباشرة (DM) من داخل بروفايل الموظف** — لمخاطبة الموظف
   يجب الخروج إلى `inbox.html` والبحث عنه.
4. **لا يوجد Timeline موحّد** لكل تفاعلات الموظف (ماذا أرسلتُ له / ماذا أرسل لي /
   متى) — التاريخ مبعثر بين collections.

الخطة المركزية أدناه **لا تضيف نموذج بيانات جديداً** بل **توحّد العرض والمدخل**
فوق ما هو موجود، على 3 مراحل reversible.

---

## 1) جرد الخصائص الموجودة في بروفايل الموظف (مع مراجعة كل خاصية)

`employee-profile.html` = شاشة الأدمن لإدارة موظف واحد (1940 سطراً — **قريبة من
حد التجميد G5/H1.7 عند 2500؛ تحتاج خطة decomposition قبل أي توسعة كبيرة**).
بنية 5 تبويبات: Overview · Attendance · Salaries · Tasks · Admin.

| # | الخاصية | التبويب | المصدر/Collection | كتابة؟ | المراجعة |
|---|---------|---------|-------------------|--------|----------|
| 1 | Hero (اسم/دور/سكور/إحصاءات سريعة) | كل التبويبات | `orders`·`attendance`·`leaves` | قراءة | سليم |
| 2 | سكور الأداء الشهري (حضور35/إنتاجية40/جودة25) | Overview | `employee-scoring.js` نقية | قراءة | سليم؛ proration للشهر الحالي فقط |
| 3 | الأهداف الشهرية (target vs actual) | Overview | `employee_goals` | قراءة | لا تحرير من البروفايل (مقصود) |
| 4 | بطاقات KPI حسب الدور | Overview | `employee-kpis.js` | قراءة | سليم |
| 5 | المهارات والمنتجات | Overview | `employees.skills[]` | تحرير | سليم |
| 6 | تحليل السلوك + Smart Insights | Overview | `attendance`·`orders` | قراءة | وصفي فقط — لا توصيات |
| 7 | أداء المراحل (SLA per stage) | Overview | `employee-stage-performance.js` | قراءة | سليم |
| 8 | بطاقة كلمة السر (set/reset/email/rebuild) | Overview | `users/{authUid}` | كتابة | قوي؛ email reset للإيميلات الحقيقية فقط |
| 9 | تقويم الحضور (check-in/out) | Attendance | `attendance`·`attendance-core.js` | كتابة | سليم |
| 10 | جدول العمل (أيام/أوقات) | Attendance | `employees.workSchedule` | كتابة | لا UI لوقت الراحة (مدعوم بالحساب) |
| 11 | الإجازات (add/delete) | Attendance | `employee_leaves` | كتابة | الأدمن يمنح فوراً — **لا يرى طلبات الموظف المعلّقة هنا** ✗ |
| 12 | أذونات الحضور (approve/reject/add) | Attendance | `attendance_permissions` | كتابة | سليم — أقرب نقطة لطابور موحّد |
| 13 | سجل الرواتب + Modal الحساب | Salaries | `employee_payments`·`wallets` | كتابة (FSE) | قوي؛ idempotent؛ سلّم تأخير واضح |
| 14 | المهام (toggle/delete/create/recurring) | Tasks | `tasks` | كتابة | لا تحرير recurrence من البروفايل |
| 15 | ملخّص العملاء/الأوردرات | Admin | `orders` | قراءة | سليم |
| 16 | التقييمات | Admin | `employee_evaluations` | عرض | لا إنشاء inline رغم وجود upsert action |
| 17 | الإخفاقات + رؤى + تصعيد تلقائي | Admin | `employee_incidents` | كتابة | قوي؛ تصعيد عند تكرار السبب 3+؛ **قرار التظلّم موجود لكن غير مُبرز** |
| 18 | الصلاحيات (pages + data perms) | Admin | `users.permissions` | كتابة | يتبع defaults الدور؛ admin مقفول |
| 19 | تعديل بيانات الموظف (راتب/عمولة/حالة) | كل التبويبات | `employees/{id}` | كتابة | سليم |

**الخلاصة:** 19 خاصية، أغلبها ناضج. الفجوات الوظيفية صغيرة (بنود 6/10/11/14/16).
الفجوة الكبرى **بنيوية**: غياب «طابور الطلبات المعلّقة لهذا الموظف» داخل البروفايل
(بند 11/17) رغم أن البيانات موجودة في collections مفهرسة بالفعل.

---

## 2) كيف يخاطب الأدمن الموظفين — وكيف يخاطبونه (خريطة التواصل ومراجعتها)

### 2.1 القنوات الموجودة (كلاهما اتجاه)

| القناة | أدمن→موظف | موظف→أدمن | ثنائية؟ | شاشة الأدمن | شاشة الموظف | Collection |
|--------|:---:|:---:|:---:|------------|-------------|------------|
| **Inbox / DM** | ✅ | ✅ | نعم (فوري) | `inbox.html` | `inbox.html` | `conversations` |
| **قنوات (#general/#design…)** | ✅ | ✅ | نعم (broadcast) | `inbox.html` | `inbox.html` | `conversations(channel)` |
| **الإشعارات** | ✅ | — | لا (push) | تلقائي | جرس `notifications.js` | `notifications` |
| **الإخفاقات → التظلّم → القرار** | ✅ | ✅ (تظلّم) | شبه (طلب/قرار) | `employee-profile.html`(Admin) + `admin-requests.html` | `my-profile.html`(💬 ملاحظات) | `employee_incidents` |
| **الإجازات** | ✅ (منح) | ✅ (طلب) | شبه (طلب/قرار) | `admin-requests.html` (+ منح من البروفايل) | `my-requests.html` | `employee_leaves` |
| **الطلبات المالية** | ✅ (قرار) | ✅ (طلب) | متعدد الخطوات | `admin-requests.html` | `my-requests.html` | `payment_requests` |
| **أذونات الحضور / Overtime** | ✅ | ✅ (طلب) | شبه | `employee-profile.html` + `admin-requests.html` | `my-requests.html` | `attendance_permissions` |
| **المهام** | ✅ (تكليف) | — (إنجاز فقط) | لا | `employee-profile.html` | جرس + `my-home` | `tasks` |
| **الأهداف/التقييمات** | ✅ | — | لا | `employee-profile.html` | `my-profile.html` | `employee_goals`·`employee_evaluations` |

نموذج الحوكمة مُعرّف في `core/messaging-policy.js`: **COLLEGIAL** (موظف↔موظف/أدمن
نِدّي) · **SERVICE** (موظف↔عميل تذكرة) · **BROADCAST** (نظام→واحد اتجاه). الحدود
المعمارية محمية باختبار `tests/architecture-messaging-boundary.test.mjs`
(طبقة المراسلة لا تلمس orders/payments — تكتب فقط conversations/notifications).

### 2.2 طابور قرارات الأدمن (موجود ومركزي بالفعل)

`admin-requests.html` (486 سطراً) = **الأقرب لمركز التواصل الموحّد**. يجمّع في
buckets: `payment · transaction · appeal · attendance · leave · return ·
orderRequest`؛ القابل للقرار منها `appeal · attendance · leave`. يستمع لـ:
- `payment_requests` (status in requested/awaiting_receipt/pending)
- `employee_incidents` (`appeal.status == pending`)
- `attendance_permissions` (`status == pending`)
- `employee_leaves` (`status == pending`)

**نقطة قوة كبيرة:** الأدمن لديه فعلاً «صندوق وارد قرارات» واحد. **نقطة الضعف:**
هذا الصندوق **منفصل تماماً** عن `employee-profile.html`؛ لا رابط، لا badge، لا
سياق للموظف.

### 2.3 الفجوات في التواصل (جوهر طلبك)

1. **سياق مكسور (الفجوة #1):** افتح بروفايل موظف → لا ترى أن لديه تظلّماً معلّقاً
   أو طلب إجازة. القرار يحدث في شاشة أخرى بلا سياق أدائه/سجلّه.
2. **لا مدخل DM من البروفايل (الفجوة #2):** «أريد أن أرسل له رسالة» = اخرج،
   افتح inbox، ابحث عنه. مخاطبة الموظف ليست بنقرة من حيث تديره.
3. **لا Timeline موحّد (الفجوة #3):** «ماذا دار بيني وبين هذا الموظف؟» لا إجابة
   في مكان واحد — مبعثر عبر 6 collections.
4. **الموظف→الأدمن مجزّأ على شاشتين:** `my-profile.html`(التظلّم) منفصلة عن
   `my-requests.html`(إجازة/مالي/إذن). الموظف لا يملك «مكان واحد أكلّم منه مديري».
5. **اتجاه واحد للمهام/التقييمات:** الموظف لا يستطيع التعليق أو الاستفسار على
   مهمة/تقييم إلا بفتح DM منفصل غير مرتبط بالكيان.

---

## 3) الخطة المركزية (3 مراحل · reversible · alongside-not-instead)

المبدأ: **لا نموذج بيانات جديد، لا collection جديدة، لا event مالي جديد.** نوحّد
**العرض والمدخل** فوق ما هو موجود. كل مرحلة خلفها feature-flag وقابلة للرجوع بسطر.

### المرحلة 1 — «جسر القرارات» داخل البروفايل (أعلى عائد / أقل خطر)
**الهدف:** يرى الأدمن طلبات الموظف المعلّقة من حيث يديره، ويقرّر بنفس الـ actions.

- شريط/بطاقة أعلى البروفايل: **«🔔 معلّق على هذا الموظف (n)»** يقرأ (بـ `limit()`)
  من الـ collections نفسها التي يستعملها `admin-requests.html` لكن مفلترة
  بـ `employeeId/authUid` الحالي:
  - `employee_incidents` حيث `appeal.status == pending`
  - `employee_leaves` حيث `status == pending`
  - `attendance_permissions` حيث `status == pending`
  - `payment_requests` حيث `employeeId == …` و status معلّق
- أزرار القرار تعيد استخدام `employeeActions.decideIncidentAppeal` /
  `decideEmployeeLeave` / قرار الأذونات الموجودة — **لا منطق جديد، لا كتابة في HTML**
  (L1/H1.1: القرار يبقى في `employee-actions.js`).
- badge على تبويبَي Attendance/Admin بعدد المعلّق فيهما.
- **Reversible:** flag `flags.employeeProfilePendingInbox`؛ إخفاؤه يعيد السلوك.
- **يلامس god-page:** نضيف عبر قسم render منفصل صغير؛ ويُفضّل بدء
  decomposition (انظر المرحلة 3).

### المرحلة 2 — مدخل مراسلة مباشرة + Timeline موحّد للموظف
**الهدف:** «خاطِب الموظف» و«ماذا دار بيننا» بنقرة، دون مغادرة البروفايل.

- زر **«💬 مراسلة»** في Hero → يفتح/يضمن DM عبر `inbox-actions.ensureDM()`
  الموجودة (COLLEGIAL)، ويفتح `inbox.html` على المحادثة (أو drawer مدمج لاحقاً).
  لا كتابة مراسلة في البروفايل — فقط navigation عبر `navigatePage()` (N1).
- **Timeline موحّد (قراءة فقط)**: تبويب/قسم يدمج زمنياً أحداث الموظف الموجودة:
  إخفاقات، قرارات تظلّم، إجازات، طلبات مالية، أذونات، مهام، تقييمات، مدفوعات.
  يُفضّل اشتقاقه من مصدر واحد على غرار `getOrderDates()` للأوردر — نُنشئ
  `core/employee-timeline.js` (دالة نقية تجمّع وترتّب، **بلا كتابة**) كمصدر العرض،
  حفاظاً على RULE 1 وتجنّب حساب التواريخ داخل الصفحة.
- **Reversible:** flag مستقل؛ الزر والـ timeline إضافة alongside.

### المرحلة 3 — توحيد مدخل الموظف + decomposition للبروفايل (صحّة بنيوية)
**الهدف:** تقليل التشتّت من جهة الموظف، وتجهيز البروفايل لأي توسعة آمنة.

- جهة الموظف: توحيد `my-profile.html`(ملاحظات/تظلّم) و`my-requests.html`
  (إجازة/مالي/إذن) تحت مدخل واحد «📨 التواصل مع الإدارة» (تبويبات داخل صفحة،
  مع الإبقاء على الصفحتين alongside حتى الاستقرار — E1).
- decomposition لـ `employee-profile.html` إلى
  `employee-profile-render.js` + `employee-profile-control-center.js` (نمط الصفحات
  المعقّدة في CLAUDE.md §1) قبل تجاوز 2500 سطر — شرط لأي توسعة لاحقة (G5).

### ما **لن** نفعله (حدود الجوهر — BUSINESS DNA)
- لا قناة تواصل لطرف خامس. لا «شبكة اجتماعية» داخلية تتجاوز COLLEGIAL/SERVICE.
- لا تكرار لأي رصيد/تاريخ — العرض الموحّد يقرأ من المصادر الأحادية فقط.
- لا منطق قرار/مالي داخل HTML — كل القرارات تبقى في `employee-actions.js`/FSE.

---

## 4) ترتيب التنفيذ المقترح (حسب العائد/الخطر)

| الأولوية | البند | العائد | الخطر | يلمس Stable Core؟ |
|:---:|------|:---:|:---:|:---:|
| 1 | م.1 جسر القرارات في البروفايل | عالٍ جداً | منخفض | لا (read + actions قائمة) |
| 2 | م.2 زر «مراسلة» (ensureDM) | عالٍ | منخفض | لا |
| 3 | م.2 Timeline موحّد (`employee-timeline.js`) | متوسط-عالٍ | منخفض | لا |
| 4 | فجوات صغيرة: إنشاء تقييم inline، وقت راحة بالجدول | متوسط | منخفض | لا |
| 5 | م.3 decomposition للبروفايل | بنيوي | متوسط | لا (تفكيك صفحة) |
| 6 | م.3 توحيد مدخل الموظف | متوسط | متوسط | لا |

التوصية: ابدأ بالبند 1 (جسر القرارات) — يحلّ الفجوة #1 بأقل تغيير ودون أي نموذج
بيانات جديد، ويُختبر حياً على `validate-financial.html` ليس مطلوباً (لا كتابة
مالية جديدة)، ثم البند 2.

---

## 5) ملاحظات التزام بالدستور (للمراجع)

- **L1/H1.1:** كل ما سبق عرض + navigation + إعادة استخدام actions قائمة. صفر
  `updateDoc/...` في HTML.
- **RULE 1:** العرض الموحّد يقرأ من المصادر الأحادية؛ `employee-timeline.js` دالة
  اشتقاق نقية بلا تخزين.
- **G3:** كل listener جديد بـ `limit()`.
- **E1:** كل مرحلة feature-flagged · backward-compatible · reversible · alongside.
- **N1:** التنقّل عبر `navigatePage()`، لا `location.href`.
- **G5/H1.7:** decomposition للبروفايل شرط قبل التوسعة (1940/2500 سطر).
