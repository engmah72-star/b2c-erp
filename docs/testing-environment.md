# بيئة التجارب (Test Environment) — عزل بيانات التجارب

> الهدف: تقدر تجرّب إنشاء أوردرات ودفعات وكل العمليات **من غير ما تلمس بيانات
> الإنتاج** (orders / wallets / financial_ledger / transactions_v2 ...).

## ليه مشروع منفصل وليس مجرد `isTest` flag؟

النظام مالي بطبيعته:
- أرصدة `wallets` تجميعية (`increment`) → أي دفعة تجريبية تفسد رصيداً حقيقياً.
- `financial_ledger` و`transactions_v2` **append-only** (مفيش حذف بالتصميم).

عشان كده العزل الحقيقي = **مشروع Firebase منفصل**. التجربة فيه لا تترك أثراً في
الإنتاج، ومتوافق مع قاعدة E1 (incremental · reversible · alongside-not-instead):
الكود نفسه ما يتغيّرش، الوجهة بس هي اللي بتتغيّر.

---

## الإعداد لمرة واحدة

### 1) أنشئ مشروع Firebase تجريبي
من [console.firebase.google.com](https://console.firebase.google.com) أنشئ مشروعاً
جديداً (مثلاً `business2card-test`). فعّل:
- **Authentication** (نفس مزوّدات الإنتاج — Email/Password ...)
- **Firestore Database**
- **Storage**

### 2) سجّل تطبيق Web واحصل على الـ config
Project settings → Your apps → Web app → انسخ `firebaseConfig`.

### 3) املأ `FB_CONFIG_TEST`
في `core/firebase-init.js` استبدل قيم `FB_CONFIG_TEST` (الـ `REPLACE_WITH_*`)
بقيم المشروع التجريبي.

وفي `.firebaserc` استبدل `REPLACE_WITH_TEST_PROJECT_ID` بـ `projectId` التجريبي.

### 4) انشر نفس القواعد على المشروع التجريبي
```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project test
```
> القواعد نفسها (`firestore.rules` / `storage.rules`) تُنشر للمشروعين — تبقى السلوك
> الأمني متطابقاً بين الإنتاج والتجارب.

### 5) (اختياري) أنشئ مستخدم/مستخدمين للتجربة
سجّل دخول مرة في بيئة التجارب وأنشئ مستخدم admin تجريبي وبيانات أساسية
(عملاء/موردين وهميين) للتجربة عليها.

---

## الاستخدام اليومي

| العملية | الطريقة |
|---------|---------|
| **الدخول لبيئة التجارب** | أضِف `?env=test` على رابط أي صفحة، أو من الـ console: `b2cSwitchEnv('test')` |
| **الخروج للإنتاج** | اضغط الشريط الأحمر بالأعلى، أو `?env=prod`، أو `b2cSwitchEnv('prod')` |
| **معرفة بيئتك الحالية** | شريط أحمر ثابت أعلى الصفحة = أنت في التجارب. لا شريط = إنتاج. والـ console يطبع `ENV=...` |

الاختيار **يُحفظ في `localStorage`** فيفضل ثابتاً أثناء تنقّلك بين الصفحات، لحد ما
تخرج صراحةً.

---

## ضمانات الأمان (Fail-closed)

- **الإنتاج هو الافتراضي دائماً.** بدون إشارة صريحة (`?env=test`) النظام يعمل على
  الإنتاج تماماً كالمعتاد — صفر تغيير في السلوك القائم.
- لو طلبت بيئة التجارب وهي **لسه غير مُعدّة** (`FB_CONFIG_TEST` placeholder، أو
  `projectId` يطابق الإنتاج)، النظام **يحجب الدخول بشاشة واضحة ولا يكتب على الإنتاج**.
  يعني مستحيل تفتكر نفسك في التجارب وأنت بتلوّث الإنتاج.

---

## الرجوع (Reversibility)

العزل كله متمركز في `core/firebase-init.js` + `.firebaserc` + هذا الملف. للتعطيل:
امسح `FB_CONFIG_TEST` أو سيبها placeholder — بيئة التجارب تتعطّل تلقائياً (fail-closed)
والإنتاج يكمّل شغّال عادي.

---

## حدود معروفة

- صفحات legacy قليلة لسه بتعرّف `FB_CONFIG` محلياً (مثل `clients.html`) — دي تكمّل
  تشير للإنتاج لحد ما تتهاجر لتستورد من `core/firebase-init.js`. معظم التطبيق يمرّ
  عبر `shared.js` الذي يعتمد المصدر الموحّد، فالتبديل يسري عليه.
- الإشعارات (`firebase-messaging-sw.js`) مرتبطة بمشروع الإنتاج — غير مؤثرة على عزل
  البيانات.
