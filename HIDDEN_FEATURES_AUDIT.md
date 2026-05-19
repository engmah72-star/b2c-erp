# Hidden Features Audit — تقرير اكتشاف الـ Features المخفية وغير المُفعَّلة

**التاريخ:** 2026-05-19
**النطاق:** كامل مستودع `b2c-erp` (65 ملف HTML، 31 ملف JS، Cloud Functions، Service Worker، CI workflows)
**الفرع:** `claude/audit-hidden-features-Nbi9B`
**المرجعيات:** `AUDIT_REPORT_v2.md`، `STABILIZATION_PLAN.md`، `REGRESSION_PREVENTION.md`، `CLAUDE.md`

> هذا التقرير يكشف **كل ما هو موجود في الكود لكنه غير ظاهر، غير مربوط، أو غير مُفعَّل فعلياً في الإنتاج.**

---

## 🎯 الخلاصة التنفيذية

| التصنيف | العدد | الأثر |
|---|---|---|
| **Modules ميتة (Dead Code)** | 4 | `core/firebase-init.js`، `core/permissions-matrix.js`، `fcm-init.js`، `sidebar-manager.js` |
| **Modules مُهاجَرة جزئياً (Partial)** | 9 | duplication في `returns-core`، `finance-core` غير موسَّع، `date-range-picker` widget محصور |
| **صفحات Orphan (لا sidebar ولا inbound)** | 4 | `exec-cost-entry.html` (98KB!)، `agent-pricing.html` (44KB)، `validate-financial.html`، `whatsapp.html` |
| **صفحات في sidebar لكن بنقاط دخول هشة (Single Source)** | 3 | `supplier-requests.html`، `ai-digest.html`، `employee-profile.html` |
| **صفحات بدون theme.js (UI inconsistency)** | 6 صفحة internal | `ai-digest`, `ai-insights`, `client-portal`, `partner-portal`, `gallery`, `product-pricing` |
| **JS files بدون version pin (cache forever)** | 8 | `sidebar-config.js`, `financial-guard.js`, `sw-register.js`, `inbox-badge.js`, `suggestions-fab.js`, `notifications.js`, `finance-core.js`, `sync-monitor.js` |
| **FB_CONFIG مكرر** | 61 ملف | RULE G2 broken (وحدة مصدر Firebase config = 1) |
| **DEFAULT_PERMISSIONS مكرر** | 3 مصادر | `shared.js` + `core/permissions-matrix.js` + `viewas.js` (مع inconsistency في SENSITIVE_FIELDS) |
| **Widgets dashboard مخفية/مكسورة** | 5+ | `#alerts-wrap` في `index.html`، KPI cards في `financial-dashboard`/`exec-dashboard`/`ml-dashboard` بدون data binding |
| **مشاكل P0 من AUDIT v2 لم تُصلَح** | 5/7 | role escalation، unbounded listeners، tenant-not-enforced |

> **الحكم:** النظام يحتوي على ~293KB من orphan code وعدد كبير من المايجريشن غير المكتملة. **Phase 2 (partner onboarding) خطر تشغيله الآن** حتى تكتمل سبرنت STABILIZATION_PLAN.

---

## 1. Hidden Features Report — Features موجودة لكن غير ظاهرة

### 1.1 AI Insights & Daily Digest — غير ظاهرَين في الـ Sidebar
- **`ai-insights.html`** (37KB) — صفحة كاملة لإدارة Gemini key، اختيار النموذج، اختيار domain حسب الدور، عرض ML metrics.
- **`ai-digest.html`** (12KB) — موجز يومي + كشف anomalies + narrative AI.
- **مدخل الوصول الوحيد حالياً:** footer ضمن FAB `ai-launcher.js:245` فقط، أو رابط من `inbox.html`.
- **غير مُدرَجة في** `sidebar-config.js:24-61` رغم أن أي مستخدم admin يحتاجها يومياً.

### 1.2 Workforce Live — مُدرَجة في sidebar لكن "admin only"
- `workforce-live.html` (42KB) موجودة في sidebar كـ `adminOnly:true`. أي دور غير admin/operation_manager لن يراها رغم أنها مفيدة لـ HR.

### 1.3 Role Viewer & Suggestions Admin
- `role-viewer.html` و `suggestions-admin.html` — admin only، لا يصل إليها CS أو operation_manager.

### 1.4 ai-search NL Filter — يعمل فقط في clients.html
- `ai-search.js` يُركَّب فقط في `clients.html:220` بـ `window.aiSearch.install({...})`. غير منشور على `orders` أو `production` أو `archive`.

### 1.5 Date Range Picker Widget
- `date-range-picker.js` (7KB widget عام) مستخدم فقط في `exec-dashboard.html:231`. لا في `reports.html` ولا `ledger.html` ولا `financial-dashboard.html`.

### 1.6 Cloud Functions غير مُستدعاة من الواجهة
- `functions/genkit-flows.js` يصدّر `analyzeClient` و`analyzeSuggestion` فقط. أي flow إضافي مستقبلي → غير مستخدَم.

---

## 2. Unused But Implemented Features — جاهزة لكن لا تَصِل للمستخدم

| Feature | الملف | الحالة |
|---|---|---|
| Stable Core Firebase init | `core/firebase-init.js` (71 سطر) | **0 imports** بعد commit `0c8aaf5` |
| Stable Core Permissions Matrix | `core/permissions-matrix.js` (135 سطر) | **0 imports**؛ مكرر في `shared.js` بنسخة قديمة |
| AI Today Builder | `ai-today.js` (236 سطر) | يُستدعى فقط من `ai-launcher.js`، لا من dashboards |
| AI Anomaly Detector | `ai-anomalies.js` (187 سطر) | مستخدم فقط في `ai-digest.html` |
| AI Domain Context | `ai-context.js` (453 سطر) | مستخدم فقط في `ai-insights.html` |
| Marketplace Engine | `marketplace-core.js`، `marketplace-engine.js` | فقط `marketplace.html` (admin only) |
| Workforce Core | `workforce-core.js` (519 سطر) | فقط `workforce-live.html` |
| Returns Core | `returns-core.js` (818 سطر) | فقط `returns.html` + duplicated inline في `client-portal.html:566` |
| Mobile Capacitor Bridge | `mobile-bridge.js` | محمَّل عند `Capacitor.isNativePlatform()` لكن `initNativeBridge()` لا تُستدعى أبداً (`shared.js:281` بلع await) |
| Smart Pricing | `smart-pricing.html` (38KB) | في sidebar كـ `adminOnly:true` |

---

## 3. Broken Integrations Report — Integrations مكسورة

### 3.1 FCM Push Notifications — مكسور كلياً
- `fcm-init.js` يُستورَد في `notifications.js:6` بـ `import { initFcm }` لكن **لا يُستدعى أبداً** بعد import.
- `firebase-messaging-sw.js` يستخدم config مُدمَج (hardcoded)، لا يمر عبر `fcm-init.js`.
- Service Worker الرئيسي `sw.js` لا يستدعي FCM SW.
- **النتيجة:** لا توجد push notifications فعلية على المتصفح، فقط in-page toasts.

### 3.2 Notifications.js Coverage — مكسور
- `notifications.js` (367 سطر) يحتوي 8 listeners (tasks, orders × 4 stages, followups, notifications collection).
- مُحمَّل على **7 صفحات فقط** من أصل 65 (`accounts`، `admin-alerts`، `design`، `employees`، `marketplace`، `returns`، `shipping`).
- صفحات حرجة بدونه: `cs-dashboard`، `ops-dashboard`، `production-dashboard`، `shipping-dashboard`، `inbox.html`، `clients.html`.

### 3.3 Capacitor Native Bridge — مكسور
- `shared.js:279` يستورد `mobile-bridge.js` لكن لا ينتظر استدعاء `initNativeBridge(app, user)`.
- **النتيجة:** أي build للموبايل عبر Capacitor ➜ bridge موجود لكن غير نشط.

### 3.4 SW-Register vs PWA-Install — Asymmetric
- 50 صفحة تحمِّل `pwa-install.js` (يطلب من المستخدم تنصيب التطبيق).
- 18 صفحة فقط تحمِّل `sw-register.js` (يسجّل الـ SW).
- **النتيجة:** على 32 صفحة، المستخدم يثبّت PWA بدون Service Worker active ➜ offline mode مكسور.

### 3.5 Duplicate Returns Workflow
- `returns-core.js` يصدّر `RT_STATUS`, `RT_DECISION`, `dispatchReturnEvent`.
- `client-portal.html:566` يحتوي تعليق: «logic مطابق لـ returns-core.js لكن inline» ➜ duplicate code، مصدر divergence.

---

## 4. Missing Imports Report — Imports مفقودة

### 4.1 صفحات في sidebar تفتقد scripts أساسية

| الصفحة | يفتقد |
|---|---|
| `whatsapp.html` | `smart-sidebar.js` (يستعمل `sidebar-manager.js` القديم) |
| `import-data.html` | `smart-sidebar.js`، `pwa-install.js`، `sw-register.js` |
| `ml-dashboard.html` | `smart-sidebar.js`، `sw-register.js` |
| `order-tracking.html` | `smart-sidebar.js`، `sw-register.js` |
| `suggestions-admin.html` | `smart-sidebar.js`، `pwa-install.js` |
| `validate-financial.html` | `sw-register.js`، `theme.js` |
| 47 صفحة | `sw-register.js` (راجع §10) |

### 4.2 صفحات internal بدون theme.js (Dark Mode broken)
**Unintentional gaps:**
- `ai-digest.html`, `ai-insights.html`, `change-password.html`, `client-portal.html`, `partner-portal.html`, `gallery.html`, `product-pricing.html`

**Intentional (forms أحادية الغرض):**
- `login.html`, `client-login.html`, `privacy.html`, `waybill.html`, `reset-sw.html`, `validate-financial.html`

### 4.3 Core modules zero adoption
- `core/firebase-init.js` ➜ **0 imports** في جميع HTML/JS بعد إنشائه في commit `0c8aaf5`.
- `core/permissions-matrix.js` ➜ **0 imports**؛ `shared.js:163-178` و `viewas.js:164-172` يحتفظان بنسخ مكررة.

---

## 5. Missing Script Initialization Report

| Script | حالته |
|---|---|
| `fcm-init.js` | يُستورَد لكن `initFcm()` لا تُستدعى |
| `mobile-bridge.js` | يُستورَد دون `await initNativeBridge()` |
| `core/firebase-init.js` | منشور لكن لم يربطه أي صفحة |
| `core/permissions-matrix.js` | منشور لكن لم يستخدمه أي صفحة |
| `ai-today.js` | يُستدعى فقط من ai-launcher (race condition محتمل قبل initAuth) |
| `viewas.js` | بدون defensive role-check ➜ أي مستخدم يضع `sessionStorage.b2c_view_as` يدوياً يحصل على بانر |

---

## 6. Theme Integration Gaps

### 6.1 شامل
- **theme.js (203 سطر)** يحقن toggle button في `.topbar-right` تلقائياً. 52 صفحة تحمّله بنجاح.
- **6 صفحات internal** تفتقده دون مبرر:
  - `ai-digest.html` — لا توجد `.topbar-right` (لن يُحقَن flexible toggle)
  - `ai-insights.html` — نفس المشكلة
  - `client-portal.html` — يحوي `:root` hard-coded dark colors (`lines 10-12`)
  - `partner-portal.html` — hardcoded dark palette
  - `gallery.html` — hardcoded
  - `product-pricing.html` — hardcoded

### 6.2 CSS Variable Inconsistency
- كل صفحة من الستة أعلاه تعرّف `:root --bg, --bg2, --line, --snow, --accent` يدوياً ➜ تغيير `shared.css` لن يصلها.

### 6.3 Sample-check للصفحات الموجود فيها theme.js
- `index.html`, `clients.html`, `settings.html` ➜ toggle button يظهر صحيح، وتبديل dark/light/auto يعمل.

---

## 7. View-As Coverage Gaps

### 7.1 المغطاة بشكل صحيح
- 55 صفحة internal تحمّل `viewas.js?v=1 defer`.
- 10 صفحات خارج النطاق منطقياً (login, client-login, partner-portal, privacy, reset-sw, offline, waybill, chat, whatsapp, client-portal).

### 7.2 ثغرة Security حرجة (P1)
- `viewas.js` لا يفحص دور المستخدم قبل عرض banner.
- إذا تمكَّن أي مستخدم non-admin من ضبط `sessionStorage.b2c_view_as` يدوياً (DevTools)، يرى banner ويُغيَّر `AppState.currentRole` و `userPerms`.
- **الحل المقترح:** أضِف في `viewas.js` line ~85:
  ```js
  if (!va || !['admin','operation_manager'].includes(window.AppState?.currentRole)) return;
  ```

### 7.3 Duplication
- 3 مصادر للـ `DEFAULT_PERMISSIONS`:
  - `shared.js:163-178`
  - `viewas.js:164-172`
  - `core/permissions-matrix.js:22-79`
- `SENSITIVE_FIELDS` set مختلف بين `shared.js` (2 حقول) و `core/permissions-matrix.js` (5 حقول).

---

## 8. Sidebar / Route Visibility Problems

### 8.1 صفحات Orphan كلياً (0 inbound link)
| الصفحة | الحجم | الحالة |
|---|---|---|
| `exec-cost-entry.html` | 98KB | **أكبر orphan في المشروع** — لا sidebar ولا أي رابط يقود إليه |
| `agent-pricing.html` | 44KB | بنفس المنوال |
| `validate-financial.html` | 22KB | أداة اختبار، تنبغي ربطها بـ admin-only sidebar |
| `whatsapp.html` | 51KB | mahjub explicitly في `smart-sidebar.js:18` skip list |

> **مجموع الكود المعزول: ~293KB**

### 8.2 صفحات بنقطة دخول وحيدة (Single Point Of Failure)
| الصفحة | المصدر الوحيد |
|---|---|
| `supplier-requests.html` (39KB) | `approvals.html:364` (window.location.replace) |
| `ai-digest.html` | `ai-insights.html` (ورابط في `ai-launcher.js:245`) |
| `employee-profile.html` (178KB!) | `employees.html` فقط |

### 8.3 Dashboards بـ Nav محدود
- `cs-dashboard.html`: 5 روابط فقط (intentional UX لكن يحبس CS)
- `production-dashboard.html`: 4 hardcoded links (مماثل)
- `ops-dashboard.html`: dynamic sidebar؛ سلوكه غير مؤكد على mobile

### 8.4 Sidebar mismatch — `sidebar-manager.js` (legacy) vs `smart-sidebar.js` (current)
- `sidebar-manager.js` (118 سطر) مستخدم في `whatsapp.html` فقط ➜ legacy code يحتاج إزالة.

---

## 9. Deployment Visibility Issues

### 9.1 CACHE bump لا يُحفَظ في الـ repo
- `.github/workflows/deploy.yml:70-77` يستخدم `sed` لتعديل `sw.js` قبل deploy:
  ```bash
  sed -i "s/const CACHE = '[^']*';/const CACHE = 'b2c-${SHA_SHORT}';/" sw.js
  ```
- لكن **التعديل لا يُلتزَم به ريبو** ➜ كل deploy جديد يبدأ من `b2c-v160` ثم يكتب SHA الجديد.
- **النتيجة:** لا يمكن تتبُّع cache versions من git؛ كل release "fresh" لكن لا history.

### 9.2 Files خارج NETWORK_FIRST list
`sw.js:13-20` فقط يجبر network-first على:
```
.html, /shared.js, /shared.css, /theme.js, /financial-sync-engine.js, /sw.js
```
**أي ملف تحته يُحتجَز في cache حتى bump CACHE الكامل:**
- `sidebar-config.js`، `financial-guard.js`، `inbox-badge.js`، `suggestions-fab.js`، `notifications.js`، `finance-core.js`، `sync-monitor.js`، `smart-sidebar.js` (مع `?v=1` كحلٍّ جزئي)
- `ai-launcher.js`، `ai-engine.js`، `ai-context.js`، `ai-anomalies.js`، `ai-today.js`، `ai-search.js`
- `marketplace-core.js`، `marketplace-engine.js`، `returns-core.js`، `workforce-core.js`، `date-range-picker.js`، `orders.js`، `pwa-install.js`، `sw-register.js`، `mobile-bridge.js`، `fcm-init.js`

---

## 10. Cache / Service Worker Problems

### 10.1 ملفات JS بدون version pin
**تظل في cache forever:**
- `sidebar-config.js` (13 صفحة)
- `financial-guard.js` (17 صفحة)
- `sw-register.js` (17 صفحة)
- `inbox-badge.js` (50 صفحة، module)
- `suggestions-fab.js` (49 صفحة، module)
- `notifications.js` (3 صفحات، module)
- `finance-core.js` (3 صفحات)
- `sync-monitor.js` (index.html)

> النصيحة: ضع `?v=N` على كل واحد منهم (أو حوِّلهم إلى import داخل `shared.js` المُجبَر على network-first).

### 10.2 firebase.json
- `firebase.json` يحدّد `Cache-Control: no-cache` على `.js` و `.html`.
- لكن SW Network-First يتجاوز browser cache ⇒ يستخدم Cache Storage API بدلاً من `no-cache`.
- **توصية:** غيِّر إلى `public, max-age=0, must-revalidate` لتوافق explicit مع SW intent.

### 10.3 Kill switch — `reset-sw.html`
- ✅ مُستثنى صراحة من اعتراض SW (`sw.js:92`).
- ⚠️ غير معرَّض في sidebar ولا في رسالة خطأ تلقائية للمستخدم. المستخدم يحتاج توجيه يدوي.

---

## 11. Broken UI Elements — UI موجود لكنه لا يعمل

### 11.1 `index.html` Dashboard
- `#alerts-wrap` (line 647): `style="display:none"`. يُعتمد على `window.allAlerts` لكن **لا كود يملأه** في `index.html` ➜ widget مخفي للأبد.

### 11.2 `cs-dashboard.html`
- Attendance pill (line 16-19) يعتمد على `AttendanceState` غير مهيَّأ.
- Tabs (line 62-64) موجودة في DOM لكن لا تبديل JS visible في أول 100 سطر.

### 11.3 `exec-dashboard.html`
- Health score ring (line 18-29) بدون data binding.
- KPI cards (line 32-38) static.
- Network Health KPIs (5-column grid) بدون population.

### 11.4 `financial-dashboard.html`
- KPI cards تعتمد على `--kc` CSS var لا تُضبط لكل بطاقة ➜ تظهر فارغة.

### 11.5 `ml-dashboard.html`
- Loading placeholder `<div class="loading">⏳ تحميل البيانات...</div>` (line 84) — إذا فشل fetch، يبقى spinner للأبد بدون fallback.

### 11.6 AI FAB race condition
- `ai-launcher.js:100, 87` تقرأ `window.AppState?.currentRole` قبل أن يكتمل `initAuth()` على صفحات معينة.
- **الأثر:** يظهر FAB لكن السياق role-aware ينقصه على paint الأول.

### 11.7 "قريباً" / Soft-disabled
- `client-portal.html`: «🔄 طلبت تعديل — سيتم العمل عليه قريباً»
- `shipping.html`: «سيصلك قريباً إن شاء الله 🙏»
- DOM hidden (`display:none`) في `clients.html:358, 381-382, 649`، `shipping.html:207`، `accounts.html:147-230` — features لا يراها admin بدون DevTools.

---

## 12. Dead Features Report

| Module | الحالة | الدليل |
|---|---|---|
| `core/firebase-init.js` | **DEAD** | 0 imports |
| `core/permissions-matrix.js` | **DEAD** | 0 imports |
| `fcm-init.js` | **DEAD** | يُستورَد بدون استدعاء |
| `sidebar-manager.js` | **LEGACY** | استبدَل بـ `smart-sidebar.js`؛ استخدام واحد في `whatsapp.html` |
| `chat.html` | **STUB** | 1KB redirect إلى `inbox.html` فقط |

---

## 13. Orphan Pages Report

### 13.1 صفر inbound (orphan كلياً)
- `exec-cost-entry.html` (98KB)
- `agent-pricing.html` (44KB)
- `validate-financial.html` (22KB)
- `whatsapp.html` (51KB)
- `offline.html` (utility، فقط SW يفتحه)

### 13.2 يصل لها من مكان واحد (هش)
- `supplier-requests.html` ← `approvals.html` فقط
- `ai-digest.html` ← `ai-insights.html` + FAB footer
- `employee-profile.html` ← `employees.html`
- `gallery.html` ← `design-workspace` (2 refs)
- `product-pricing.html` ← (1 ref)

### 13.3 صفحات legitimate detail (deep-link only)
- `order-tracking.html`، `ledger.html`، `client-design-library.html`، `shipping-guide.html`، `waybill.html`، `change-password.html`، `import-data.html`، `ai-insights.html`، `ai-digest.html`.

---

## 14. Feature Activation Problems

### 14.1 RULE 8 (Permissions) جزئي
- `shared.js` لا يستخدم `core/permissions-matrix.js` ➜ `SENSITIVE_FIELDS` فيه 2 حقول فقط بدلاً من 5.
- ⚠️ النتيجة: `supplier_cost`, `price_cost`, `price_margin` ليست محمية في `canSee()` الحالي.

### 14.2 RULE G7 (Tenant Aware) على الورق فقط
- `getCurrentTenantId(userDoc)` معرَّفة في `shared.js:192`.
- `inSameTenant()` معرَّفة في `firestore.rules:59-63`.
- **لكن:** صفحة واحدة فقط (`partner-portal.html`) تستخدم `where('tenantId','==',...)`.
- 64 صفحة أخرى ليس لديها أي tenant filter ➜ multi-tenant غير مفعَّل فعلياً.

### 14.3 RULE G2 (One Firebase Config) مكسور
- 61 ملف HTML/JS يحتفظون بـ `apiKey: AIzaSy...` inline.

### 14.4 Feature Flags غير موجودة
- لا توجد آلية `FEATURE_FLAGS` أو `enableX` env vars في المشروع.
- كل feature gating يعتمد على role checks مباشرة في DOM/canSee().

---

## 15. Regression Visibility Matrix

| الـ Refactor | المتأثرون | الانكسار |
|---|---|---|
| **Sidebar migration** (sidebar-manager → smart-sidebar) | `whatsapp.html` فقط | يستخدم القديم؛ Toolbar الذكي + favorites غير فعَّال |
| **Theme migration v4** | 6 صفحات internal | hardcoded `:root` لا يستجيب لـ light mode |
| **shared.js DEFAULT_PERMISSIONS** | viewas.js + role-viewer.html | duplication؛ خطر divergence |
| **Stable Core (commit 0c8aaf5)** | كل النظام | لم يُعتَمَد ➜ governance غير مفعَّل |
| **Returns workflow** | client-portal.html | inline duplication بدل استدعاء `returns-core.js` |
| **Tenant-aware (G7)** | كل النظام | تمت إضافته في rules + helpers لكن queries ما زالت غير filtered |
| **PWA install** | 32 صفحة | تطلب التثبيت بدون SW registered ➜ offline broken |
| **FCM/Push** | كل النظام | `initFcm()` لا تُستدعى أبداً |

---

## 16. Fix Priority Matrix

### 🔴 P0 — يجب الإصلاح فوراً قبل أي نشر جديد

| # | المشكلة | الملف | الإصلاح |
|---|---|---|---|
| P0-1 | viewas.js بدون role-gate | `viewas.js:~85` | أضف `if (!['admin','operation_manager'].includes(AppState?.currentRole)) return;` |
| P0-2 | `SENSITIVE_FIELDS` ينقصه supplier_cost/price_cost/price_margin | `shared.js:179` | استورد من `core/permissions-matrix.js` أو وسِّع set |
| P0-3 | Role escalation عبر `/users` PATCH | `firestore.rules:173` | منع تعديل `role`/`permissions` بـ field-level guard |
| P0-4 | Unbounded listeners في `shared.js:301-326` | shared.js | أضف `limit(200)` على kل onSnapshot |
| P0-5 | `fcm-init.js` import بدون call | `notifications.js:6` | احذف أو اربط `initFcm()` فعلياً |
| P0-6 | CACHE bump لا يلتزم في git | `.github/workflows/deploy.yml` | commit الـ sw.js بعد bump SHA |
| P0-7 | duplicate DEFAULT_PERMISSIONS (3 مصادر) | shared.js + viewas.js + core/ | اعتمد `core/permissions-matrix.js` كمصدر وحيد |

### 🟡 P1 — أسبوع واحد

| # | المشكلة | المقترح |
|---|---|---|
| P1-1 | 47 صفحة بدون `sw-register.js` لكن مع `pwa-install.js` | أضف sw-register أو احذف pwa-install من الصفحات الـ asymmetric |
| P1-2 | 8 JS files بدون version pin | أضف `?v=N` على sidebar-config, financial-guard, inbox-badge, suggestions-fab, notifications, finance-core, sync-monitor, sw-register |
| P1-3 | `core/firebase-init.js` و `core/permissions-matrix.js` zero adoption | ابدأ migration: استبدل `FB_CONFIG` في `shared.js` بـ import من core، ثم انتقل تدريجياً |
| P1-4 | 6 صفحات internal بدون theme.js | أضف `<link href="shared.css">` و `<script src="theme.js?v=4">` لـ ai-digest, ai-insights, client-portal, partner-portal, gallery, product-pricing |
| P1-5 | Orphan pages (293KB) | قرّر: حذف أو ربط بـ sidebar (exec-cost-entry, agent-pricing, validate-financial) |
| P1-6 | `mobile-bridge.js` import بدون await | shared.js:281 — استدع `m.initNativeBridge(app, user)` |
| P1-7 | `sidebar-manager.js` legacy | استبدله بـ smart-sidebar.js في whatsapp.html، احذف الملف |
| P1-8 | Dashboards بدون data binding (index alerts-wrap, exec/financial/ml KPIs) | اربط الـ widgets بـ Firestore data أو احذفها |
| P1-9 | duplicate Returns logic في client-portal.html:566 | استبدل بـ import من returns-core.js |

### 🟢 P2 — على المدى المتوسط

| # | المشكلة | المقترح |
|---|---|---|
| P2-1 | `ai-digest.html` و `ai-insights.html` ليس في sidebar | أضفهما تحت `group:'admin'` مع `adminOnly:true` |
| P2-2 | `date-range-picker.js` widget محصور | عمِّمه على reports/ledger/financial-dashboard |
| P2-3 | `finance-core.js` نشر جزئي | أضِفه إلى ledger.html و financial-dashboard.html إذا تحقَّقت الحاجة |
| P2-4 | `notifications.js` يُحمَّل في 7/65 صفحة | اعتمده مركزياً (في shared.js init أو على dashboards الرئيسية) |
| P2-5 | "قريباً" markers في client-portal و shipping | فعّل أو احذف القيود البصرية |
| P2-6 | RULE G7 tenant filtering | ابدأ migration script لإضافة tenantId على كل query في god pages |
| P2-7 | 61 ملف بـ FB_CONFIG inline | حسب STABILIZATION_PLAN: مايجريشن صفحة-صفحة لاستخدام core/firebase-init.js |
| P2-8 | `chat.html` stub (1KB redirect) | احذفها واستبدل أي `href="chat.html"` بـ `inbox.html` |
| P2-9 | `sidebar-manager.js` بقايا | بعد تحديث whatsapp.html، احذف الملف |
| P2-10 | KPI widgets الفارغة | إكمال data binding أو حذف placeholders |

---

## 17. توصيات هيكلية (Architecture-Level)

### 17.1 Adoption Plan لـ Stable Core
1. ابدأ بصفحة واحدة (مثلاً `settings.html` أو `index.html`):
   ```js
   // OLD: const FB_CONFIG = {apiKey: ...}; const app = initializeApp(FB_CONFIG);
   // NEW: import { db, auth, app } from './core/firebase-init.js';
   ```
2. بعد التحقق، عمِّم على صفحات admin، ثم على باقي الصفحات.
3. حدِّث `shared.js` ليصبح "compat layer" يُعيد export الـ db/auth من core/.

### 17.2 توحيد Permissions Matrix
1. عدّل `shared.js:163-225` ليستورد من `core/permissions-matrix.js`:
   ```js
   import { DEFAULT_PERMISSIONS, SENSITIVE_FIELDS, canSeeField, maskPhone } from './core/permissions-matrix.js';
   ```
2. حدِّث `viewas.js:164-172` ليستورد بدلاً من تكرار.
3. حدِّث `role-viewer.html` ليقرأ من نفس المصدر.

### 17.3 Sidebar Refresh
1. أضف إدخالات `ai-digest`، `ai-insights` تحت group:'admin' مع `adminOnly:true`.
2. أعِد تقييم: هل `exec-cost-entry`، `agent-pricing` تحتاجان sidebar entries؟ أو حذف؟
3. ضع `validate-financial.html` تحت admin tools/QA.

### 17.4 SW Cache Strategy
1. أضف JS files الحرجة إلى `NETWORK_FIRST_SUFFIXES` في `sw.js:13-20`:
   ```js
   const NETWORK_FIRST_SUFFIXES = [
     '.html', '/shared.js', '/shared.css', '/theme.js',
     '/financial-sync-engine.js', '/sw.js',
     // ADD:
     '/sidebar-config.js', '/financial-guard.js', '/inbox-badge.js',
     '/suggestions-fab.js', '/notifications.js', '/sync-monitor.js',
   ];
   ```
2. عدِّل CI ليلتزم تغيير `sw.js` المُولَّد آلياً (أو ينقل إلى مصدر منفصل مثل `cache-version.json`).

### 17.5 إنهاء Dead Code
حذف فوري آمن:
- `chat.html` (stub)
- `sidebar-manager.js` (بعد ربط whatsapp.html بـ smart-sidebar.js)
- مراجعة: `fcm-init.js`, `core/firebase-init.js`, `core/permissions-matrix.js` — إما **اعتمدها** أو **احذفها**؛ لا تترك middle ground.

---

## 18. الفحص النهائي — Did You Know?

> هذه أرقام صادمة من المشروع:

- **293 KB** من كود orphan لا يصل إليه مستخدم.
- **61 نسخة** من Firebase API key (RULE G2 منتهَك بـ 6100% +).
- **3 نسخ** من DEFAULT_PERMISSIONS (2 منهما خارج Stable Core).
- **7 من 65** صفحة تحمِّل notifications.js (11% coverage).
- **18 من 50** صفحة لديها SW registration رغم وجود pwa-install (36% misaligned).
- **0** imports لـ `core/firebase-init.js` رغم إنشائه قبل ~6 commits.
- **0** استدعاءات حقيقية لـ `initFcm()` ➜ Push Notifications ميتة.
- **1** صفحة فقط (partner-portal.html) تستخدم `tenantId` في query (RULE G7 على الورق).

---

## 19. Quick Wins (تنفيذ ≤ 30 دقيقة لكل واحد)

1. ✅ احذف `chat.html` واستبدل المراجع بـ `inbox.html` (10 دقائق).
2. ✅ أضف version pin على 8 JS files (15 دقيقة).
3. ✅ احذف `import { initFcm }` من `notifications.js:6` (5 دقائق).
4. ✅ أضف defensive role-check في `viewas.js:85` (10 دقائق).
5. ✅ أضف `ai-digest` و `ai-insights` إلى `sidebar-config.js` (10 دقائق).
6. ✅ أضف 4 JS files إلى NETWORK_FIRST_SUFFIXES في `sw.js` (5 دقائق).
7. ✅ احذف `sidebar-manager.js` import من whatsapp.html واستبدله بـ smart-sidebar.js (10 دقائق).

---

> **هذا التقرير يكمل التحليل في `AUDIT_REPORT_v2.md` و `STABILIZATION_PLAN.md` ويُركّز على VISIBILITY GAPS تحديداً (ما هو موجود لكن مخفي). يجب أن يكون مدخلاً لـ Sprint Plan إصلاح Hidden Features قبل Phase 2 Partner Onboarding.**
