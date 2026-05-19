# دليل نشر التطبيق على Google Play Store

> **الطريقة:** TWA (Trusted Web Activity) — يلفّ الـ PWA الحالي في APK/AAB يقبله Play Store.
> **النتيجة:** التطبيق يظهر للمستخدمين على Play Store كأنه native، لكنه فعلياً Chrome شفاف يفتح الموقع.

---

## ما تم تجهيزه في هذا الفرع

- ✅ `manifest.json` — تصحيح كل المسارات من `/b2c-erp/` إلى root (كانت بقايا من نشر GitHub Pages قديم وكانت ستفشل TWA).
- ✅ `.well-known/assetlinks.json` — Digital Asset Links template، ينقصه الـ SHA-256 fingerprint (هتولّده من الـ keystore).
- ✅ `firebase.json` — تعديل `ignore` عشان `.well-known/` يترفع، + `appAssociation: AUTO`، + headers صحيحة لـ `assetlinks.json`.
- ✅ `twa-manifest.json` — config لـ Bubblewrap CLI.

---

## الخطوات اليدوية المطلوبة منك (لا أستطيع تنفيذها داخل Claude لأنها تتطلب Android SDK + Play Console + بيانات حساسة)

### 1) حساب Google Play Developer

- ادخل: <https://play.google.com/console/signup>
- ادفع $25 لمرة واحدة.
- أنشئ تطبيق جديد:
  - **App name:** Business2Card ERP
  - **Default language:** Arabic (Egypt) — `ar-EG`
  - **App type:** App
  - **Free/Paid:** Free

### 2) نشر التعديلات على Firebase Hosting أولاً

قبل أي حاجة، لازم الموقع يبقى متطابق مع `manifest.json` الجديد:

```bash
firebase deploy --only hosting
```

ثم تأكد إن `https://business2card-c041b.web.app/.well-known/assetlinks.json` يفتح ويرجع JSON صحيح.

### 3) تثبيت Bubblewrap محلياً (محتاج Node.js + JDK 17 + Android SDK)

```bash
npm install -g @bubblewrap/cli
bubblewrap doctor   # يتأكد إن Android SDK + JDK + Gradle مثبتين
```

لو ناقصك حاجة، Bubblewrap هيقترح يثبتها أوتوماتيك.

### 4) توليد الـ APK/AAB

من جذر الـ repo:

```bash
# توليد المشروع من twa-manifest.json
bubblewrap init --manifest=https://business2card-c041b.web.app/manifest.json

# لو سألك يحدّث twa-manifest.json، خليه يستخدم الموجود في الـ repo
# لو سألك يولّد keystore جديد، خلّيه يعمل كده وخزّن الباسوورد في مكان آمن

# بناء AAB (الصيغة المطلوبة من Play Store حالياً)
bubblewrap build
```

سينتج الملفات:
- `app-release-bundle.aab` ← هذا اللي ترفعه على Play Console
- `app-release-signed.apk` ← لاختبار محلي على هاتف
- `android.keystore` ← **احفظه في مكان آمن جداً، لو ضاع لن تستطيع تحديث التطبيق على Play Store أبداً**

### 5) استخراج SHA-256 fingerprint وتحديث assetlinks.json

```bash
keytool -list -v -keystore android.keystore -alias android | grep SHA-256
```

ستحصل على قيمة مثل:
```
SHA256: AB:CD:EF:12:34:...
```

افتح `.well-known/assetlinks.json` واستبدل:
- `REPLACE_WITH_SHA256_FROM_KEYSTORE` → الـ SHA-256 من keystore المحلي

ثم انشر مرة تانية:
```bash
firebase deploy --only hosting
```

### 6) رفع AAB على Play Console

1. في Play Console → التطبيق الجديد → **Production** → **Create new release**.
2. ارفع `app-release-bundle.aab`.
3. املأ release notes (نسخة 1.0.0 الأولى).
4. اكمل كل القوائم الجانبية:
   - **App content:**
     - Privacy policy URL: `https://business2card-c041b.web.app/privacy.html`
     - Target audience: 18+
     - Ads: لا
     - Content rating: قم بالاستبيان
     - News app: لا
     - COVID-19 contact tracing: لا
     - Data safety: حدّد إنك تجمع بيانات الشركات/العملاء وتحفظها في Firebase
   - **Store listing:**
     - وصف قصير وطويل بالعربية
     - 2 screenshots على الأقل (640×1138)
     - Feature graphic 1024×500
     - App icon 512×512 (موجود عندك `icon-512.png`)
   - **App access:**
     - **مهم جداً:** Play Store هيطلب credentials اختبار. أنشئ حساب demo (مثلاً `playstore-review@business2card.com` بدور `customer_service`) واكتبه هنا. بدونه التطبيق هيتم رفضه.
   - **Pricing & distribution:** مجاني، اختر الدول.

### 7) إضافة Play App Signing SHA-256 إلى assetlinks.json

بعد أول رفع، Play Console هيوقّع التطبيق بمفتاحه. من Play Console:
- **Setup → App integrity → App signing key certificate → SHA-256 certificate fingerprint**

انسخه واستبدل `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` في `.well-known/assetlinks.json` ثم انشر Hosting مرة تانية.

> **لو نسيت الخطوة دي، التطبيق هيشتغل بس هيظهر URL bar من Chrome بدل ما يكون full-screen.**

### 8) المراجعة والنشر

- المراجعة بتاخد من **يوم لـ 7 أيام**.
- لو رُفض، Google هيبعت سبب واضح في الإيميل.
- بعد القبول، التطبيق هيظهر على Play Store في خلال ساعات.

---

## أسباب الرفض الشائعة (تجنبها مقدماً)

| السبب | الحل |
|------|-----|
| لا توجد credentials لمراجع Play | احتم اعمل حساب demo في **App access** |
| Privacy policy ناقصة | الـ `privacy.html` موجود — لكن راجعه إنه يغطي Data Safety |
| Permissions غير مبررة | راجع AndroidManifest الناتج من Bubblewrap — TWA لا تحتاج permissions كتيرة |
| URL bar ظاهر فوق التطبيق | تأكد إن `assetlinks.json` فيه الـ SHA-256 الصح (keystore + Play App Signing) |
| Crashes فور الفتح | الموقع لازم يفتح صح على Chrome Android. اختبر `https://business2card-c041b.web.app/login.html` من موبايل. |

---

## تحديثات لاحقة

لكل نسخة جديدة:

```bash
# 1. زوّد appVersionCode في twa-manifest.json (1 → 2 → 3...)
# 2. غيّر appVersionName لو فيه تغيير ظاهر للمستخدم (1.0.0 → 1.0.1)
bubblewrap update
bubblewrap build
# 3. ارفع AAB الجديد على Play Console → Production → Create new release
```

التحديث على الموقع نفسه (HTML/JS/CSS) لا يحتاج نسخة جديدة من Play Store — يكفي `firebase deploy`. التطبيق يأخذها تلقائياً عند الفتح القادم.

---

## ملاحظات استراتيجية (BUSINESS DNA)

نشر التطبيق على Play Store يدعم الـ Vision:
- ✅ **Phase 2** — يوسع وصول الشبكة لمستخدمين خارج الموقع الويب.
- ✅ يقوّي صورة المنصة كـ infrastructure مش مجرد موقع.
- ✅ يفتح الباب لـ Phase 3 — نسخة Marketplace للعملاء النهائيين على Play.
- ⚠️ بعد ما تتقبل، فكّر في نسخة منفصلة `com.business2card.client` للعملاء بدل ERP الموظفين.

---

## مرجع سريع

- [Bubblewrap docs](https://github.com/GoogleChromeLabs/bubblewrap)
- [Digital Asset Links validator](https://developers.google.com/digital-asset-links/tools/generator)
- [Play Console](https://play.google.com/console)
- [PWA Builder (بديل لـ Bubblewrap)](https://www.pwabuilder.com/) — لو ما حبيتش CLI
