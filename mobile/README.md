# Business2Card ERP — تطبيقات الموبايل (iOS + Android)

تطبيق أصلي (Native) لـ iOS و Android مبني بـ **Capacitor**، يعمل كـ "غلاف" حول
نفس صفحات الموقع الإنتاجية على Firebase Hosting. يعني التحديثات اللي تنزل على
الموقع تظهر فوراً في التطبيق بدون إعادة نشر، وفي نفس الوقت التطبيق يستفيد من:

- إشعارات FCM/APNs الأصلية (تصل حتى لو التطبيق مغلق)
- شريط الحالة والـ Splash بألوان النظام
- زر الرجوع الأصلي على Android
- النشر على App Store و Google Play

> الموقع يبقى المصدر الوحيد للحقيقة (RULE 1). التطبيق لا يحتفظ بأي منطق مكرر.

---

## ١) المتطلبات

| الأداة | الإصدار | لماذا |
|--------|---------|------|
| Node.js | 20+ | تشغيل Capacitor CLI |
| npm | 10+ | إدارة الحزم |
| Android Studio | 2024.1+ | بناء/تجربة Android |
| JDK | 17 | gradle build |
| Xcode | 15+ (macOS فقط) | بناء/تجربة iOS |
| CocoaPods | 1.15+ (macOS فقط) | حزم iOS |

---

## ٢) أول مرة على جهازك

```bash
cd mobile
npm install

# أضف منصة Android
npx cap add android

# أضف منصة iOS (macOS فقط)
npx cap add ios
```

> مجلدا `android/` و `ios/` مستثنيان من git عمداً (راجع `.gitignore`).
> كل مطور يولّدهما محلياً من إعدادات `capacitor.config.json`.

---

## ٣) التشغيل أثناء التطوير

التطبيق مُعدّ افتراضياً ليحمّل
[https://business2card-c041b.web.app](https://business2card-c041b.web.app) داخل WebView،
فأي تعديل على الموقع يظهر فوراً بدون إعادة بناء التطبيق.

```bash
# Android — يفتح Android Studio
npx cap open android

# iOS — يفتح Xcode (macOS فقط)
npx cap open ios

# بناء وتشغيل مباشر على جهاز موصول
npx cap run android
npx cap run ios
```

> لو غيّرت أي ملف داخل `mobile/www` أو `capacitor.config.json`، شغّل:
> ```bash
> npx cap sync
> ```

---

## ٤) إعداد Firebase Cloud Messaging (FCM) الأصلي

### Android

1. من [Firebase Console](https://console.firebase.google.com/) →
   مشروع `business2card-c041b` → ⚙️ Project Settings → **Your apps** →
   اضغط **Add app** → اختر Android.
2. **Android package name**: `com.business2card.erp`
   (يجب أن يطابق `appId` في `capacitor.config.json`)
3. **App nickname**: `Business2Card ERP — Android`
4. حمّل ملف `google-services.json` وضعه في:
   ```
   mobile/android/app/google-services.json
   ```
5. ثم:
   ```bash
   npx cap sync android
   ```

### iOS (macOS فقط)

1. من Firebase Console → نفس المشروع → **Add app** → اختر iOS.
2. **iOS bundle ID**: `com.business2card.erp`
3. **App nickname**: `Business2Card ERP — iOS`
4. حمّل `GoogleService-Info.plist` وأضفه إلى مشروع Xcode تحت
   `App/App/` (افتحه عبر `npx cap open ios` وأسحبه داخل التارجت).
5. فعّل **Push Notifications** و **Background Modes → Remote notifications**
   من إعدادات التارجت في Xcode.
6. ارفع **APNs Authentication Key** (`.p8`) إلى Firebase Console →
   Project Settings → Cloud Messaging → Apple app configuration.

> الجسر في `mobile-bridge.js` يلتقط التوكن تلقائياً ويرسله إلى
> `registerFcmToken` callable الموجود مسبقاً في `functions/`، فلا يحتاج تعديل
> سيرفر.

---

## ٥) البناء للنشر

### Android — Google Play

```bash
# مفتاح توقيع لمرة واحدة
keytool -genkey -v -keystore b2c-erp.keystore \
  -alias b2c-erp -keyalg RSA -keysize 2048 -validity 10000

# ضع المفتاح والكلمات في android/key.properties
# storeFile=/absolute/path/to/b2c-erp.keystore
# storePassword=...
# keyAlias=b2c-erp
# keyPassword=...

cd mobile/android
./gradlew bundleRelease
# الناتج: app/build/outputs/bundle/release/app-release.aab → ارفعه إلى Play Console
```

### iOS — App Store

```bash
npx cap open ios
# داخل Xcode:
#   Product → Archive → Distribute App → App Store Connect
```

---

## ٦) بناء آلي عبر GitHub Actions

ملف `.github/workflows/mobile-build.yml` يبني تلقائياً نسخة **APK debug**
عند كل push على `main` يلمس مجلد `mobile/` أو `mobile-bridge.js`. الناتج يُرفع
كـ artifact باسم `b2c-erp-android-debug` ويبقى متاحاً 30 يوماً للتجربة على
الأجهزة بدون نشر متجر.

> النسخة الموقّعة للنشر (release / aab) تتطلب أسرار توقيع — تُضاف لاحقاً عند
> فتح حسابات المتاجر.

---

## ٧) عند تغيير دومين الإنتاج

عدّل `server.url` و `allowNavigation` في `mobile/capacitor.config.json` ثم:

```bash
cd mobile && npx cap sync
```

---

## ٨) ملخص الملفات الجديدة

```
mobile/
├── capacitor.config.json   ← appId, appName, server.url, plugins
├── package.json            ← deps + scripts
├── www/index.html          ← shell يظهر فقط عند فقدان الاتصال
├── resources/              ← مصادر الأيقونة والـ Splash (1024×1024)
└── README.md               ← هذا الملف

mobile-bridge.js            ← يُحمَّل ديناميكياً داخل Capacitor فقط
                              (لا يؤثر على المستخدمين على المتصفح)

.github/workflows/mobile-build.yml ← بناء APK تلقائي
```

السلوك على الويب لم يتغير. إضافة الجسر في `shared.js::initAuth` محمية بـ
`Capacitor.isNativePlatform()` فلا تُحمَّل إلا داخل التطبيق.
