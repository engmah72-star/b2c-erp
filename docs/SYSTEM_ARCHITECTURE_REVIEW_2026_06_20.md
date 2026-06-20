# مراجعة معمارية شاملة — 2026/06/20

> **المراجع:** CTO / Chief Architect
> **النطاق:** النظام كاملاً (147K سطر كود)
> **الهدف:** فهم معمّق + اكتشاف مخاطر + فرص تحسين

---

## 1) ما تعلمته اليوم عن النظام

### الحجم والنطاق
| القياس | القيمة |
|--------|--------|
| إجمالي سطور JS | ~68,000 |
| إجمالي سطور HTML | ~62,000 |
| إجمالي سطور CSS | ~17,000 |
| صفحات HTML | ~75 صفحة |
| ملفات JS في الجذر | ~55 ملف |
| ملفات core/ | ~50 ملف |
| ملفات features/ | ~60 ملف |
| Cloud Functions | 59 دالة في ملف واحد (4013 سطر) |
| اختبارات | 72 ملف (~11,500 سطر) |
| Commits | 56 (من يناير 2025) |

### المعمارية الفعلية
النظام يتبع هيكل **Layered Architecture** واضح المعالم:

```
[صفحات HTML — view only]
        ↓ يستدعي
[Actions Layer — order-actions, client-actions, shipping-actions, ...]
        ↓ يمر عبر
[Core Engines — FSE, orders.js, returns-core.js]
        ↓ يكتب
[Firestore — protected by rules + idempotency + audit]
```

**المحركات المركزية تعمل بشكل صحيح:**
- **FSE** (873 سطر): مصدر وحيد لكل الكتابات المالية، 40+ نوع حدث، atomic batches
- **orders.js** (2945 سطر): State machine للأوردرات، validators، stage builders
- **order-actions.js** (3508 سطر): كل عمليات الأوردر تمر عبره
- **returns-core.js** (814 سطر): State machine مستقل للمرتجعات

**الطبقات الداعمة محكمة:**
- **Idempotency** (252 سطر): حماية ضد الضغط المزدوج بـ fingerprint deterministic + 60s window
- **Audit** (277 سطر): كل mutation بتاريخ + فاعل + نوع (fail-closed بلا actor)
- **Financial Invariants** (232 سطر): 17 invariant للكشف عن الانحراف المالي
- **Telemetry** (150 سطر): تتبع انتقائي للعمليات (failures always + slow + critical)
- **Data Cache** (1164 سطر): Stale-While-Revalidate مع IndexedDB + BroadcastChannel
- **Collection Registry** (226 سطر): metadata مركزي لحالة البيانات المحمّلة

### نظام RBAC مزدوج الطبقة
- **الطبقة القديمة**: `permissions-matrix.js` (395 سطر) — `canSeeField()`, `canDo()`, `hasPage()`
- **الطبقة الجديدة**: `core/rbac/` (1827 سطر) — Enterprise RBAC مع `createPermissionContext()`, `check()`, `checkField()`
- الاثنتان تعملان معاً عبر bridge في `permissions-matrix.js` الذي يعيد تصدير كل شيء من `rbac/index.js`

### نظام Feature Flags
- 5 أعلام معروفة في `core/feature-flags.js`
- Resolution: URL param > localStorage > default
- يدعم E1 (كل ميزة جديدة خلف علم قابل للتراجع)

### Cloud Functions (59 دالة)
- WhatsApp integration (stub/live modes)
- Trigger-based notifications (order stage changes, assignments, payments)
- Scheduled jobs (daily reconciliation, anomaly scan, churn analysis, forecasting)
- AI/ML flows via Genkit (client analysis, suggestion analysis, Gemini proxy)
- Admin utilities (password reset, impersonation, backfill)
- Multi-tenant foundation (partnerSignIn, backfillTenantId, syncUserAuthClaims)
- Design items lifecycle (spawn on order create, sync status, cleanup on delete)
- Public profile rendering (SSR via onRequest)

---

## 2) الأجزاء التي أصبحت أوضح

### ✅ الهيكل المالي — قوي ومتين
- **FSE هو فعلاً المصدر الوحيد** للكتابة المالية. كل الـ actions تمر عبر `dispatchFinancialEvent()`
- **atomic batches** تمنع partial writes
- **approval workflow** مُطبَّق على مستويين: Firestore rules (server) + client-side
- **financial policy** قابلة للتكوين (escalation thresholds, segregation of duties)
- **daily reconciliation** Cloud Function تكتشف drift وترسل admin_alerts

### ✅ الأمان — طبقات متعددة
- **Firestore rules** شاملة ومفصّلة (750+ سطر) — fail-closed
- **Field-level protection**: `isProtectedUserField()` يمنع privilege escalation
- **Data boundaries**: `canSeeCustomerPhone()`, `canSeeDesignData()` مطبّقة server-side
- **Tenant isolation**: أساسيات جاهزة (`getUserTenant()`, `inSameTenant()`)
- **Financial write restriction**: `canFinancialWrite()` مضيّقة بعد S0-2 Fix
- **Rate limiting**: Cloud Functions للـ returns tickets و client decisions

### ✅ نموذج البيانات — متماسك
- **Order كيان مركزي**: كل شيء يدور حوله (design → print → production → shipping → archive)
- **Stage ownership**: كل مرحلة لها مالك واضح (designerId, productionAgent, shippingOfficerId)
- **Single sources of truth** مُعرّفة وواضحة (wallets, stage, stageEnteredAt, getOrderDates)
- **Append-only patterns**: settlements, ledger entries (لا حذف، فقط reversal)

### ✅ Control Centers — نمط ناضج
- الصفحات المعقدة مفكّكة بشكل صحيح:
  - `design-control-center.js` / `design-render.js`
  - `print-control-center.js`
  - `clients-control-center.js` / `clients-render.js` / `clients-data.js`
  - `accounts-render.js` / `accounts-kpi-panel.js`

---

## 3) المخاطر المكتشفة

### 🔴 خطر حرج

#### R1: ثلاث مسارات لدفع الموردين (Triplicate Financial Path)
```
Path 1: supplier-actions.js::createPayment() → dispatchFinancialEvent(FE.VENDOR_PAYMENT)
Path 2: wallet-actions.js::recordSupplierPayment() → addLedgerToBatch(FE.VENDOR_PAYMENT)
Path 3: approval-actions.js::executePaymentRequest() → batch writes
```
**الخطر**: ثلاث نقاط دخول مستقلة تكتب في `supplier_payments` — إذا استُدعيت أكثر من واحدة يتكرر الدفع.

#### R2: supplier-actions.js بلا حماية idempotency
- `createPayment()` و `reversePayment()` — عمليات مالية مباشرة **بدون** `withIdempotency()`
- ضغط مزدوج على الزر = دفع مكرر للمورد

#### R3: wallet-actions.js تتجاوز FSE
- `walletTransfer()` و `recordSupplierPayment()` تستخدم `addLedgerToBatch()` مباشرة بدلاً من `dispatchFinancialEvent()`
- هذا يتجاوز hooks و validations في FSE

### 🟠 خطر عالي

#### R4: God Files تجاوزت الحد
| الملف | سطور | الحد |
|------|------|------|
| `order-actions.js` | 3,508 | > 2,500 ❌ |
| `exec-cost-entry.html` | 3,149 | > 2,500 ❌ |
| `clients.html` | 3,026 | > 2,500 ❌ |
| `orders.js` | 2,945 | > 2,500 ❌ |
| `reports.html` | 2,927 | > 2,500 ❌ |
| `print.html` | 2,830 | > 2,500 ❌ |
| `functions/index.js` | 4,013 | > 2,500 ❌❌ |

وفقاً لقاعدة G5/H1.7: "ملف > 2500 سطر = freeze حتى decomposition plan"

#### R5: 12 صفحة HTML تكتب مباشرة في Firestore (مخالفة H1.1)
| الصفحة | العمليات المباشرة |
|--------|-------------------|
| `validate-financial.html` | writeBatch, deleteDoc (حذف مالي!) |
| `shipping-accounts.html` | addDoc, updateDoc, deleteDoc, writeBatch, runTransaction |
| `production.html` | updateDoc, writeBatch, deleteDoc, addDoc |
| `design.html` | addDoc, updateDoc, writeBatch |
| `client-portal.html` | addDoc (returns_tickets, client_decisions) |
| `employees.html` | setDoc, writeBatch |
| `print.html` | updateDoc, setDoc |
| `archive.html` | addDoc (creates orders!) |
| `waybill.html` | updateDoc |
| `change-password.html` | updateDoc |
| `financial-dashboard.html` | addDoc, updateDoc |

**الأخطر**: `validate-financial.html` يحذف من `employee_payments` و `financial_ledger` مباشرة.

#### R6: approval-actions.js يكتب orders.costItems مباشرة
- سطر ~374: `batch.update(doc(db, 'orders', oid), updateData)` — يتجاوز `orderActions`
- production-actions.js أيضاً (سطر ~105)

#### R7: Unfiltered Firestore Queries (بلا limit)
| الصفحة | الـ Query |
|--------|----------|
| `exec-dashboard.html` | `getDocs(collection(db,'users'))` |
| `exec-dashboard.html` | `getDocs(collection(db,'employees'))` |
| `inbox.html` | `getDocs(collection(db,'users'))` |
| `reports.html` | `getDocs(collection(db,'wallets'))` |
| `design.html` | `getDocs(collection(db,'employees'))` (مرتين) |
| `production-dashboard.html` | `getDocs(collection(db,'suppliers_v2'))` |

### 🟡 خطر متوسط

#### R8: 3 ملفات actions بلا audit trail
- `shipping-actions.js` (947 سطر): 0 auditEntry — فقط timeline entries عبر `_tlEntry()`
- `wallet-actions.js` (710 سطر): 0 auditEntry
- `supplier-actions.js` (434 سطر): 0 auditEntry

#### R9: تكرار منطق حساب المدفوعات
- `calcOrderPayment()` في FSE
- `FinanceCore.getNet()` في finance-core.js
- `orderGrossTotal()` في order-math.js
- الثلاثة يحسبون نفس الشيء بطرق مختلفة — خطر drift

#### R10: 66 ملف يستخدم `location.href` بدل `navigatePage()`
- هذا يمنع الـ navigation interception ويكسر patterns الصفحة الواحدة مستقبلاً

#### R11: 27 ملف يستخدم inline hex colors بدل CSS variables
- يكسر قاعدة U1 (UI tokens from shared.css)

#### R12: Magic strings منتشرة
- 15+ ملف يستخدم أسماء stages بشكل مباشر ('design', 'printing', 'production')
- 8+ ملفات يستخدم أسماء أدوار مباشرة ('admin', 'graphic_designer')
- بدل استخدام `ORDER_STAGES` و `USER_ROLES` من orders.js

---

## 4) فرص التحسين

### OP1: توحيد مسار دفع الموردين (أولوية قصوى)
**الآن**: 3 مسارات مستقلة → **الهدف**: مسار واحد عبر FSE
- حذف `wallet-actions.js::recordSupplierPayment()` (توجيه عبر supplier-actions أو approval-actions)
- تأكد أن supplier-actions.createPayment هو المسار الوحيد للدفع المباشر
- approval-actions للدفع المعتمد

### OP2: تغليف supplier-actions بـ idempotency
- 5 دقائق عمل، يمنع مخاطرة مالية كبيرة
- wrap `createPayment()` و `reversePayment()` بـ `withIdempotency()`

### OP3: تفكيك functions/index.js
**59 دالة في ملف واحد = كابوس صيانة**. التقسيم المقترح:
```
functions/
  index.js              → exports hub فقط (~50 سطر)
  triggers/
    order-triggers.js   → onOrderCreated, onOrderStageChanged, onOrderAssigned, ...
    payment-triggers.js → onPaymentLogged, onTransactionPendingApproval, ...
    employee-triggers.js → onPasswordResetRequested, onIncidentAppealSubmitted, ...
    design-triggers.js  → spawnDesignItemsOnOrderCreate, syncDesignItemStatus, ...
  scheduled/
    daily.js            → dailyFollowup, autoArchive, dailyReconciliation, anomalyScan, dailyStats
    weekly.js           → weeklyChurnRfm, weeklyForecast, weeklyRecommendations
    projection.js       → dailyProjectionDriftScan
  callable/
    admin.js            → adminResetPassword, adminSetPassword, impersonateUser, backfill*
    ai.js               → analyzeClient, analyzeSuggestion, callGeminiProxy
    partner.js          → partnerSignIn, setClientPlan
    github.js           → createSuggestionIssue, checkSuggestionPR
  utils/
    whatsapp.js         → sendWhatsApp, normalizePhone
    fcm.js              → registerFcmToken, unregisterFcmToken, sendNotification
    invariants.js       → _detectDrift, _fiNum
```

### OP4: نقل الكتابات المباشرة من HTML إلى actions
**الأولوية بالترتيب:**
1. `validate-financial.html` — حذف من financial_ledger/employee_payments يجب أن يمر عبر action مخصص
2. `shipping-accounts.html` — 7+ كتابات مباشرة → shipping-actions
3. `production.html` — كتابات مباشرة → production-actions
4. `design.html` — addDoc للـ gallery → gallery-actions (موجود فعلاً في core/)

### OP5: توحيد حساب المدفوعات
- حذف `finance-core.js` (111 سطر فقط — wrapper قديم)
- كل شيء يستخدم `order-math.js` للقراءة + `FSE::calcOrderPayment()` للكتابة
- مسار واحد = صفر drift

### OP6: إضافة audit trail للـ actions المفقودة
- `shipping-actions.js`: إضافة `auditEntry()` لكل عملية (20 دقيقة)
- `wallet-actions.js`: إضافة audit لكل transfer/payment (15 دقيقة)
- `supplier-actions.js`: إضافة audit لكل دفعة/عكس (10 دقيقة)

### OP7: إضافة `limit()` للـ queries المفتوحة
- 7 queries بلا limit — كل واحد سطر واحد

### OP8: تفكيك الملفات الكبيرة (G5 compliance)
| الملف | الإجراء |
|------|---------|
| `order-actions.js` (3508) | → order-actions-create.js, order-actions-payment.js, order-actions-bulk.js |
| `orders.js` (2945) | → orders-stages.js, orders-validators.js, orders-constants.js |
| `clients.html` (3026) | → استخراج modals/tables إلى components |
| `reports.html` (2927) | → features/reports/ views مستقلة |

---

## 5) التحسينات الآمنة المقترحة (يمكن تنفيذها فوراً)

### دفعة 1: إصلاحات أمان مالي (< 30 دقيقة)
1. ✅ **Wrap supplier-actions بـ idempotency** — سطرين لكل دالة
2. ✅ **إضافة limit() للـ 7 queries المفتوحة** — سطر واحد لكل query

### دفعة 2: Audit trail gaps (< 1 ساعة)
3. ✅ إضافة `auditEntry()` لـ shipping-actions (11 عملية)
4. ✅ إضافة `auditEntry()` لـ wallet-actions (9 عمليات)
5. ✅ إضافة `auditEntry()` لـ supplier-actions (7 عمليات)

### دفعة 3: توحيد (1-2 ساعة)
6. ✅ حذف `wallet-actions.recordSupplierPayment()` (duplicate path)
7. ✅ حذف `finance-core.js` ونقل المرجعيات إلى `order-math.js`
8. ✅ نقل `approval-actions` order writes إلى `orderActions.updateCostItems()`

---

## 6) ما يحتاج دراسة أعمق

### D1: Multi-tenant Readiness
- الأساسيات موجودة (tenantId, getUserTenant, inSameTenant)
- لكن **لا يوجد tenant filter على أي query في الكود العميل**
- Cloud Functions لا تفلتر بـ tenantId
- يحتاج خطة تفعيل مرحلية

### D2: Cloud Functions Scalability
- `functions/index.js` يستورد كل شيء في ملف واحد → cold start penalty
- 59 دالة مع shared imports = كل cold start يحمّل 4013 سطر
- الحل: code splitting إلى sub-modules

### D3: Testing Coverage
- 72 ملف اختبار (~11,500 سطر) — نسبة جيدة للحجم
- لكن **لا اختبارات integration** للـ FSE ← كل الـ tests وحدوية
- لا اختبارات للـ order-actions.js أو shipping-actions.js
- Cloud Functions tests غائبة

### D4: Performance — Firestore Reads
- بعض الصفحات تستعلم عن collections كاملة (users, employees, suppliers) بدون limit
- `data-cache.js` يقدم caching لكن لا يُستخدم في كل مكان
- `onSnapshot` listeners بدون cleanup في بعض الصفحات = memory leak

### D5: الهجرة من النظام القديم
- 60+ ملف لا يزال يعرّف FB_CONFIG محلياً (بدل استخدام firebase-init.js)
- `normalizeShipStage()` يتعامل مع 4 قيم legacy
- `finance-core.js` window-based API (نمط قديم)

### D6: Service Worker Governance
- `sw.js` يحتاج bump عند كل نشر رئيسي
- لا يوجد آلية تلقائية لذلك
- `reset-sw.html` موجود كحل طوارئ

### D7: فحص أمان العمق
- `validate-financial.html` يحذف مباشرة من financial_ledger — هل هذا مقصود كأداة admin أم ثغرة؟
- `archive.html` ينشئ orders مباشرة عبر addDoc — يتجاوز كل الـ validators
- `impersonateUser` Cloud Function — ما هي ضوابطه؟

---

## 7) نتائج الفحص الأمني المعمّق

### 🔴 حرج

#### S1: Bug في impersonateUser Cloud Function (سطر 632)
```javascript
// الكود الحالي:
targetData.isStrictAdmin(role)  // ❌ targetData كائن بيانات عادي، لا يحتوي على method
// المفترض:
isStrictAdmin(targetData.role)  // ✅ استدعاء الدالة المعرّفة في أعلى الملف
```
**التأثير**: يُلقي TypeError بدلاً من permission-denied — يمنع الانتحال لأي أحد (fail-closed بالصدفة)، لكن الشرط المقصود (حماية admin من انتحال admin آخر) لا يُفحص. يجب إصلاحه لضمان error message صحيح.

#### S2: غياب tenant isolation في Cloud Functions queries
- كل queries الـ Cloud Functions تستعلم بدون `tenantId` filter
- عند تفعيل multi-tenant: بيانات كل المستأجرين مختلطة
- **يجب حلها قبل Phase 2**

### 🟠 عالي

#### S3: detectEngineBypass يُسجّل فقط ولا يمنع
- `functions/index.js:2004-2022` — trigger يكتشف كتابات مباشرة في financial_ledger تتجاوز FSE
- لكنه **لا يمنع الكتابة** (لا يحذف أو يعكس) — فقط يسجّل admin_alert
- الملاحظة في الكود: "Observability فقط — لا يمنع الكتابة"

#### S4: كلمة مرور مؤقتة بـ Math.random()
- `functions/index.js:380` — `Math.floor(100000 + Math.random() * 900000)`
- `Math.random()` ليس CSPRNG — يكفي لكلمة مرور مؤقتة تُستبدل فوراً، لكن best practice استخدام `crypto.randomInt()`

#### S5: Partner Portal Secret بنص عادي
- `functions/index.js:2484` — `t.portalSecret` مخزّن كنص عادي في Firestore
- المفترض: استخدام hash مع bcrypt أو Firebase Secrets

### 🟡 متوسط

#### S6: masking inconsistency في بعض render paths
- بعض مسارات العرض تصل إلى `client.phone1` قبل فحص `canSee('client_phone')`
- الهاتف يظهر في HTML source حتى للأدوار غير المصرّحة (مسألة View Source)

#### S7: impersonation_audit قابل للحذف بواسطة admin
- يجب أن تكون immutable: `allow delete: if false`

---

## الخلاصة

النظام **ناضج معمارياً** ويتبع أنماطاً احترافية (FSE, idempotency, audit, RBAC, financial invariants). القاعدة الأمنية قوية مع Firestore rules مفصّلة وطبقات حماية متعددة.

**أهم 3 إجراءات فورية:**
1. 🔴 Wrap supplier-actions بـ idempotency (منع دفع مكرر)
2. 🔴 توحيد مسار دفع الموردين (إزالة wallet-actions duplicate path)
3. 🟠 تفكيك functions/index.js (4013 سطر → modular structure)

**الاتجاه الاستراتيجي:**
- تحويل تدريجي نحو features/ directory pattern (الموجود بالفعل في 12 وحدة)
- تقليص الكتابات المباشرة في HTML إلى صفر
- رفع تغطية الاختبارات خصوصاً للـ FSE و order-actions
- تفعيل multi-tenant filter عند الجاهزية
