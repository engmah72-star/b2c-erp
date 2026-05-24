# 🛡️ STABILIZATION & HARDENING PLAN
## كروت شخصية / Business2Card ERP — رفع النظام من 5.4/10 إلى 7.5+/10

> **تاريخ:** 2026-05-19
> **يكمل:** `AUDIT_REPORT_v2.md` (الذي يشخّص) — هذه الوثيقة هي **التنفيذ**.
> **النمط:** Production-grade hardening، لا features جديدة، incremental فقط.
> **نطاق:** 6 محاور — Security · Performance · Architecture · Observability · Cleanup · Tenancy
> **الإطار الزمني:** Sprint 14 يوم للـ P0 + خارطة 30/90/180.

---

## 0) Executive Summary

النظام يقف على ثلاث ركائز قوية: **Financial Engine + Roles Matrix + Cloud Functions infrastructure**. الباقي ضعيف:
- **Security**: ثغرة role-escalation واحدة كافية لإسقاط كل القاعدة. تُصلَح في 30 دقيقة.
- **Tenancy**: البنية التحتية موجودة (`backfillTenantId` Function، `inSameTenant()` helper، `tenantId` field)، **لكن لا تُستخدَم في rules أو queries**. هذا أخطر من أن لا تكون موجودة أبدًا — فهي تخدع بمظهر الـ readiness.
- **Performance**: 4 listeners بلا حد في `shared.js` نفسه = كل صفحة ترث الكارثة. الإصلاح ساعة واحدة.
- **Architecture**: 80 HTML files مع 60+ نسخة Firebase config = صيانة كابوس.
- **Observability**: 36 Cloud Function بلا dashboards/alerts. لو فشل scheduled backup ثلاث ليالٍ، لا أحد يعلم.

**الـ DECISION الأهم:** الـ 14 يوم القادمين يجب أن يقتصروا على **Stabilization فقط** — تجميد كل feature جديد. هذا قرار سياسي قبل أن يكون تقني.

---

## 1) P0 Critical Security Risks — يجب الإغلاق خلال 14 يوم

### S0-1 — Role Escalation عبر `/users/{uid}` self-update
- **الموقع:** `firestore.rules:170-175`
- **المخاطرة:** أي auth user يكتب على وثيقته الخاصة بدون قيد حقول → يصير admin.
- **سيناريو الإثبات:** سطر واحد في Console:
  ```js
  await firebase.firestore().doc(`users/${uid}`).update({role:'admin'});
  ```
- **التأثير:** سيطرة كاملة على المالية، العملاء، الموظفين، الـ tenants.
- **Effort:** 30 دقيقة كود + 30 دقيقة tests.
- **الإصلاح:**
  ```javascript
  // BEFORE
  allow update: if isAuth() && (request.auth.uid == userId || isAdminOnly());

  // AFTER — حقول مُقيَّدة على self-update
  allow update: if isAuth() && (
    isAdminOnly()
    || (request.auth.uid == userId
        && !request.resource.data.diff(resource.data).affectedKeys()
             .hasAny([
               'role',
               'permissions',
               'tenantId',
               'authUid',
               'employeeId',
               'isPartner',
               'partnerTenantId',
               'designerTenantId',
               'mustChangePassword',
               'passwordResetAt',
               'passwordResetBy'
             ]));
  ```
- **Verification:**
  ```js
  // في Firestore Emulator + @firebase/rules-unit-testing
  test('user cannot escalate own role', async () => {
    const u = testEnv.authenticatedContext('uid_designer', {role:'graphic_designer'});
    await assertFails(
      u.firestore().doc(`users/uid_designer`).update({role:'admin'})
    );
  });
  ```

### S0-2 — `canFinancialWrite()` تشمل أدوار غير مالية
- **الموقع:** `firestore.rules:79-91`
- **المخاطرة:** أي user مع `pages:['design']` أو `pages:['print']` يقدر يكتب على wallets/transactions_v2/financial_ledger.
- **التأثير:** سرقة مالية مباشرة من قِبَل designer/production_agent.
- **الإصلاح:**
  ```javascript
  function canFinancialWrite() {
    return isAdmin()
        || hasPage('accounts')
        || hasPage('shipping')           // مطلوب لـ shipping settlements
        || hasPage('shipping-accounts')
        || hasPage('suppliers')          // لدفعات المورد
        || hasPage('clients')            // لدفعات العميل
        || can('canAddOrders')           // CS عند إنشاء أوردر بدفعة
        || can('canFinancialWrite');
    // أُزيلت: hasPage('production'), hasPage('design'), hasPage('print')
  }
  ```
- **التحقق المضاد:** أي تكلفة من Production تمر عبر `supplier_payments` (وله rule منفصلة `hasPage('production') || hasPage('suppliers')`). صفحة Production لا تحتاج صلاحية مالية مباشرة.

### S0-3 — Cross-Tenant Read في Marketplace collections
- **المواقع:** `firestore.rules:1048, 1060, 1070, 1083, 1090`
- **المخاطرة:** `isAdmin()` (يشمل ops_manager) يقصِّر تحقق `inSameTenant()`.
- **الإصلاح القياسي (يُطبَّق على 5 collections):**
  ```javascript
  allow read: if isAuth() && (
    (isAdmin() && inSameTenant(resource.data))
    || (canFinancialRead() && inSameTenant(resource.data))
    || resource.data.get('customerId','__') == request.auth.uid
    || isOwnPartnerData(resource.data)
  );
  ```
- **ملاحظة:** يجب أيضًا `inSameTenant()` على writes — حاليًا create/update/delete = `isAdminOnly()` بلا tenant check.

### S0-4 — Storage rules فضفاضة
- **الموقع:** `storage.rules:5-65`
- **المخاطرة:** أي موظف مصادَق يقرأ receipts كل التحويلات، تصاميم كل الطلبات، ملفات الإنتاج.
- **التأثير:** PII + IP leak داخلي.
- **الإصلاح — Path-based Isolation:**
  ```
  // قبل التعديل، migration للأسماء الموجودة:
  //   receipts/{filename}                      → receipts/{tenantId}/{userId}/{filename}
  //   design-files/{filename}                  → design-files/{tenantId}/{orderId}/{filename}
  //   production/{filename}                    → production/{tenantId}/{orderId}/{filename}

  match /receipts/{tenantId}/{userId}/{file=**} {
    allow read: if request.auth != null
                && request.auth.token.tenantId == tenantId
                && (request.auth.uid == userId || request.auth.token.role in ['admin','operation_manager','wallet_manager']);
    allow write: if request.auth != null
                 && request.auth.token.tenantId == tenantId
                 && request.auth.uid == userId
                 && request.resource.size < 10 * 1024 * 1024
                 && request.resource.contentType.matches('image/.*');
  }
  ```
- **متطلَّب مرافق:** Cloud Function `setUserClaims` تنشر `tenantId` و `role` كـ Auth custom claims على كل user (تشغَّل مرة + onUserUpdate). بدون هذا، Storage rules لا تقدر تقرأ Firestore.

### S0-5 — Service Account بدور `roles/owner` في CI
- **الموقع:** `.github/workflows/deploy.yml:108-110`
- **المخاطرة:** أي تسريب لـ `FIREBASE_SERVICE_ACCOUNT` secret = سيطرة كاملة على المشروع.
- **الإصلاح — Minimal Roles:**
  ```python
  DEPLOYER_ROLES = [
      "roles/firebasehosting.admin",        # Hosting deploy
      "roles/cloudfunctions.admin",          # Functions deploy
      "roles/cloudbuild.builds.editor",      # build pipeline
      "roles/datastore.indexAdmin",          # firestore indexes
      "roles/firebaserules.admin",           # firestore rules deploy
      "roles/iam.serviceAccountUser",        # impersonate runtime SA
      "roles/serviceusage.serviceUsageAdmin",# enable APIs
      "roles/secretmanager.admin",           # WHATSAPP_TOKEN
      "roles/storage.admin",                 # backup bucket
  ]
  ```
- **مكافأة:** أضف `environment: production` للـ deploy job مع required approval من Repo settings.
- **خطوة لاحقة (Phase B):** الانتقال لـ Workload Identity Federation — يلغي حاجة الـ SA key نهائيًا.

### S0-6 — Unauthenticated Spam على Returns/Client Decisions
- **المواقع:** `firestore.rules:500-510, 866-879`
- **المخاطرة:** مهاجم يعرف `orderId + clientPhone` → ينشئ آلاف tickets.
- **الإصلاح المرحلي:**
  1. **فوري — Cloud Function rate-limit:**
     ```js
     exports.guardClientPortalSubmissions = onDocumentCreated(
       'returns_tickets/{ticketId}',
       async (e) => {
         const t = e.data?.data();
         if (t?.requestedBy !== 'client_portal') return;
         // عُد الـ tickets من نفس clientPhone في آخر 1h
         const cutoff = new Date(Date.now() - 3600_000);
         const recent = await db.collection('returns_tickets')
           .where('clientPhone','==',t.clientPhone)
           .where('requestedBy','==','client_portal')
           .where('createdAt','>=', cutoff)
           .count().get();
         if (recent.data().count > 5) {
           // soft-delete + alert
           await e.data.ref.update({ isDeleted:true, deletedReason:'rate_limit' });
           await db.collection('admin_alerts').add({...});
         }
       }
     );
     ```
  2. **متوسط — Token-Signed Submissions:** أنشئ `exports.issueClientPortalToken` callable تنادى من `order-tracking.html`، ترجع short-lived JWT. الـ rule تصبح:
     ```javascript
     allow create: if !isAuth()
       && request.resource.data.portalToken is string
       && request.resource.data.portalToken == /* verified server-side */;
     ```
     لكن Firestore rules لا تقدر تتحقق من JWT signature. الحل: انقل create كاملًا إلى Cloud Function callable (`submitClientDecision`) → ضع الـ rule على `allow create: if false;` للعملاء غير المصادَقين.

### S0-7 — 21 صفحة بدون `viewas.js`
- **المخاطرة:** Light Mode View-As لا يطبَّق في 21 صفحة → admin قد ينسى أنه في وضع المعاينة → يكتب باسمه الحقيقي.
- **الإصلاح:** `for f in <list>; do sed -i 's|</body>|<script src="viewas.js"></script></body>|' $f; done`
- **القائمة:** `validate-financial.html, gallery.html, ai-digest.html, ai-insights.html, reset-sw.html, product-pricing.html, login.html, client-login.html, client-portal.html, waybill.html, change-password.html, partner-portal.html, privacy.html, mockup-*.html` (الثلاثة الأخيرة ستُحذَف، فهي خارج النطاق).
- **Effort:** ساعتان (مع review كل صفحة لو ستحتاج تعديل لـ banner positioning).

### S0-8 — `shared.js` يحتوي 4 listeners بلا limit (Performance P0)
- **الموقع:** `shared.js:298-326` — `startListeners()` يفتح unbounded snapshots على `clients`, `orders`, `products_v2`, `wallets`.
- **التأثير:** كل صفحة تستخدم `startListeners()` تحمّل **كل** documents من 4 collections. عند 50k order = browser hang.
- **الإصلاح:**
  ```javascript
  export function startListeners(callbacks = {}, opts = {}) {
    const subs = [];
    const orderLimit = opts.orderLimit || 200;
    const clientLimit = opts.clientLimit || 200;

    subs.push(onSnapshot(
      query(collection(db,'orders'),
            where('stage','not-in',['archived','cancelled']),
            orderBy('stage'),  // مطلوب لـ not-in
            orderBy('createdAt','desc'),
            limit(orderLimit)),
      snap => { AppState.orders = snap.docs.map(d => ({...d.data(), _id: d.id})); ... }
    ));

    subs.push(onSnapshot(
      query(collection(db,'clients'),
            orderBy('createdAt','desc'),
            limit(clientLimit)),
      snap => { AppState.clients = snap.docs.map(d => ({...d.data(), _id: d.id})); ... }
    ));

    // wallets و products_v2 صغيرين بطبعهما (عشرات الـ docs) — لا limit مطلوب.
  }
  ```
- **التأثير المتوقع:** -80% Firestore reads فورًا.

---

## 2) P1 Architecture Risks

| # | المخاطرة | الموقع | الجهد | الأثر |
|---|---|---|---|---|
| A1 | UI Sprawl (8 dashboards + 7 shipping + 3 pricing) | المتعدد | 3 أسابيع تجميد + مرحلة دمج | صيانة |
| A2 | 60+ نسخة Firebase config | المتعدد | 2 أسابيع تدريجي | maintainability |
| A3 | god HTML pages (clients.html=4760 سطر) | كبار الـ HTML | شهر | maintainability |
| A4 | لا data access layer | كل صفحة | شهر | dup queries |
| A5 | `notifications.js` filters client-side | `notifications.js:99-155` | 3 أيام | network + memory |
| A6 | `id` field مكرر مع `_id` Firestore | orders collection | أسبوعين | confusion |
| A7 | Multi-tenant على الورق فقط | كل rule | 2 أسابيع | scalability blocker |
| A8 | `partnerSignIn` يستخدم portalSecret ثابت | `functions/index.js:2292` | يوم | partner security |

### Deep-dive: A5 — `notifications.js`
```js
// المشكلة: filter client-side بعد fetch:
const ordersQ = query(collection(db,'orders'), where('designerId','==',uid));
onSnapshot(ordersQ, snap => {
  const orderNotifs = snap.docs
    .filter(d => ['design','printing'].includes(d.data().stage))   // ← Client-side!
    .map(...);
});
```
designer متمرس لديه 500 طلب archived → كلهم يُحمَّلون كل تحديث.

**الإصلاح:**
```js
const ordersQ = query(
  collection(db,'orders'),
  where('designerId','==',uid),
  where('stage','in',['design','printing']),   // ← Server-side filter
  limit(50)
);
```

### Deep-dive: A8 — `partnerSignIn` portalSecret risk
```js
// functions/index.js:2306
if (t.portalSecret !== secret) throw new HttpsError('permission-denied', 'كود الوصول غير صحيح');
```
**المخاطرة:** Plain-string comparison + لا rotation + لا rate-limit + لا 2FA. لو سُرق portalSecret من أي عميل لـ partner، اللص يدخل كأنه الـ partner.

**الإصلاح المرحلي:**
1. **فوري:** أضف `bcrypt.compare()` بدل `!==` (يمنع timing attacks).
2. **فوري:** rate-limit per tenantId (failure_count > 5 in 15min → lockout 1h).
3. **متوسط:** TOTP-based 2FA على partner login.
4. **متوسط:** Rotate secret تلقائيًا كل 90 يوم.

---

## 3) P2 Maintainability Risks

| # | المخاطرة | الجهد |
|---|---|---|
| M1 | 0 unit tests على rules | أسبوع لإضافة 50 test |
| M2 | 0 unit tests على Cloud Functions | أسبوع |
| M3 | لا CI lint لكشف Firebase config مكرر | يوم |
| M4 | لا CI lint لكشف unbounded listeners | يوم |
| M5 | لا TypeScript | شهرين تدريجي |
| M6 | Arrays متضخمة (designFiles, timeline) | أسبوع migration |
| M7 | Soft-delete pattern غير متسق | أسبوع |
| M8 | لا dependency audit | يوم |

---

## 4) Firebase Security Review — تلخيص بالأرقام

### ما هو محصَّن جيدًا ✅
- `wallets`, `transactions_v2`, `financial_ledger` write paths عبر engine.
- Immutable: `audit_logs`, `impersonation_audit`, `backup_logs`, `whatsapp_logs` (lines 901, 911, 956, 850).
- Impersonation feature solid: admin-only، rate-limit 10/hour، TTL 15min، immutable audit.
- `validTx()` و `validLedger()` يفرضوا integrity على writes.
- Approval workflow (`isApprovalUpdate()`, `isLocked()`) يمنع تعديل sealed transactions.

### ما هو مكشوف 🔴
- `/users` update — لا field-level guard (P0).
- `canFinancialWrite()` متوسعة (P0).
- Marketplace cross-tenant (P0).
- Storage rules بلا tenant boundary (P0).
- `gallery` و `design_items` و `designer_tenants` قراءة عامة (`allow read: if true`) — مفهوم تجاريًا لكن لا rate-limit → scraping risk.

### الـ Risk Matrix

| Surface | Read | Write | Status |
|---|---|---|---|
| /users | ✅ OK | 🔴 P0 | role escalation |
| /orders | ✅ OK | ✅ OK | stage gate enforced |
| /clients | ✅ OK | ✅ OK | RULE 8 enforced |
| /wallets | ✅ OK | 🟠 P1 | canFinancialWrite متوسعة |
| /transactions_v2 | ✅ OK | ✅ OK | approval workflow |
| /financial_ledger | ✅ OK | 🟠 P1 | as above |
| /marketplace_orders | 🔴 P0 | ✅ OK | cross-tenant read |
| /commissions | 🔴 P0 | ✅ OK | as above |
| /returns_tickets | 🟠 P1 | 🟠 P1 | spam risk |
| /client_decisions | 🟠 P1 | 🟠 P1 | as above |
| Storage receipts | 🔴 P0 | 🟠 P1 | open read |
| Storage designs | 🔴 P0 | 🟠 P1 | as above |

---

## 5) Multi-Tenant Readiness Review

### الموجود ✅
- `getCurrentTenantId(userDoc)` + `tenantFields(tenantId)` في `shared.js:190-196`.
- `inSameTenant(resourceData)` في `firestore.rules:59-63`.
- `getUserTenant()` يستخدم `DEFAULT_TENANT='merchant_001'` كـ fallback (backward compat).
- `backfillTenantId` Cloud Function (callable, admin-only) في `functions/index.js:2336`.
- Marketplace tier (tenants, marketplace_orders, commissions, payouts, customer_wallets) — كلها فيها `tenantId`.

### الناقص 🔴
- Legacy collections **لا تكتب `tenantId`**: `orders`, `clients`, `suppliers_v2`, `employees`, `wallets`, `transactions_v2`, `financial_ledger`, `employee_payments`, `supplier_payments`, `shipping_settlements`.
- Rules لا تفرض `inSameTenant()` على هذه الـ collections (إلا في marketplace tier).
- Queries في الصفحات لا تفلتر بـ `tenantId`.
- Storage paths لا تحوي `tenantId`.

### Migration Plan — 4 أسابيع منظَّمة

#### Week 1 — Backfill
1. شغّل `backfillTenantId({collection:'orders'})` على الـ batches حتى ينتهي.
2. شغّل على باقي collections: `clients`, `suppliers_v2`, `employees`, `wallets`, `transactions_v2`, `financial_ledger`, `employee_payments`, `supplier_payments`, `shipping_settlements`, `products_v2`, `materials`.
3. تحقق: `db.collection('orders').where('tenantId','==',null).count()` يجب أن يرجع 0.
4. أضف audit_log entry بكل عملية backfill.

#### Week 2 — Code Path Updates
1. أضف helper في كل engine:
   ```js
   // financial-sync-engine.js
   function tenantFieldsFor(p) {
     return { tenantId: p.tenantId || DEFAULT_TENANT_ID };
   }
   // في كل handler:
   batch.set(txRef, { ...txData, ...tenantFieldsFor(p) });
   ```
2. في كل query في الصفحات، أضف:
   ```js
   query(collection(db,'orders'),
         where('tenantId','==', getCurrentTenantId(userDoc)),
         ...
   )
   ```
   ابدأ بالصفحات الـ 12 الأكثر استخدامًا.

#### Week 3 — Rules Enforcement
1. حدِّث كل rule على collection بلا tenant check اليوم:
   ```javascript
   match /orders/{orderId} {
     allow read: if isAuth()
       && inSameTenant(resource.data)
       && (...existing checks...);
   }
   ```
2. على create:
   ```javascript
   allow create: if isAuth()
     && request.resource.data.tenantId == getUserTenant()
     && (...existing checks...);
   ```

#### Week 4 — Storage Migration
1. Cloud Function `migrateStoragePaths()` يقرأ كل ملف في `receipts/*`, `design-files/*`, إلخ → ينقله لـ `receipts/{tenantId}/{userId}/*`.
2. حدِّث references في Firestore (يحتاج فهرس عكسي للملفات).
3. حدِّث Storage rules.

### Acceptance Criteria for Multi-Tenant Ready
- [ ] لا document بدون `tenantId` في أي من الـ 13 collection.
- [ ] كل rule فيها `inSameTenant()` كأول شرط.
- [ ] كل query في الصفحات الحديثة فيها `where('tenantId','==',...)`.
- [ ] Cloud Functions تكتب `tenantId` على كل document جديد.
- [ ] Storage paths تبدأ بـ `{tenantId}/`.
- [ ] Auth custom claims تحمل `tenantId`.

---

## 6) Performance Bottlenecks

### الأرقام الحالية (تقدير محافظ)
| Surface | Reads/User/Day | الملاحظة |
|---|---|---|
| `shared.js:startListeners` × 4 collections × 60 polls | ~50k | unbounded |
| `notifications.js` × 8 listeners | ~10k | client-side filter |
| Dashboard pages (3-4 listeners) | ~5k | تكرار |
| `clients.html` realtime | ~30k | god page |
| Total (medium-use day) | **~95k reads/user/day** |

### بعد Hardening (مستهدف)
| Surface | Reads/User/Day | الفرق |
|---|---|---|
| `shared.js` + limit(200) | ~5k | -90% |
| `notifications.js` server-filter + limit(50) | ~1k | -90% |
| Dashboards عبر `daily_stats` | ~200 | -96% |
| `clients.html` paginated | ~3k | -90% |
| Total | **~10k reads/user/day** | **-89%** |

### الأسباب الرئيسية للـ bottlenecks
1. **`shared.js` unbounded** — الأخطر، يضرب كل صفحة.
2. **`notifications.js` 8 listeners** — في كل صفحة بلا استثناء.
3. **god pages** = listener × 10-16 لكل صفحة.
4. **dashboards realtime** = listeners على collections كاملة.
5. **لا batch reads** = 8-16 round-trip متوازي عند التحميل.

### الإصلاحات بترتيب الـ ROI
| الإصلاح | الجهد | ROI |
|---|---|---|
| `shared.js` startListeners + limit() | ساعة | 🚀🚀🚀 |
| `notifications.js` server-filter | يوم | 🚀🚀🚀 |
| Dashboard من `daily_stats` | يومين | 🚀🚀 |
| Pagination على god pages | أسبوع | 🚀🚀 |
| Image thumbnails (Cloud Function) | أسبوع | 🚀 |

---

## 7) Memory Usage Risks

### الأنماط الخطرة الحالية
1. **`AppState.orders` + `AppState.clients`** في `shared.js:236-241` — arrays في الذاكرة تنمو مع كل listener update. عند 10k order = ~50MB heap.
2. **Mutation Observer في `viewas.js:403-432`** — يراقب كل DOM mutation على صفحات realtime → CPU pressure.
3. **Multiple unsubs لكن لا cleanup عند navigation** — `shared.js:243` يجمعهم في `_unsubs[]`، لكن لا `beforeunload` listener يدعوهم. مع SPA-like navigations (a.href clicks) → memory leak.
4. **HTML pages 200-300KB** = HTML node tree ضخم في الذاكرة.

### الإصلاحات
1. أضف `window.addEventListener('beforeunload', () => AppState._unsubs.forEach(u => u()))` في `shared.js`.
2. في `viewas.js`، disconnect الـ MutationObserver عند navigation.
3. استخدم WeakMap لـ DOM caches.
4. تجنب storing entire snapshots في `AppState` — احتفظ بـ index + lazy fetch.

---

## 8) UI / UX Sprawl Report

### Inventory
- **8 dashboards**: cs, designer, exec, financial, ml, ops, production, shipping → دمج إلى 1 + widget registry (Phase B).
- **7 shipping pages**: shipping (200KB), shipping-accounts, shipping-audit, shipping-dashboard, shipping-followup, shipping-guide, shipping-lite → دمج إلى 2 (operations + accounts).
- **3 pricing pages**: agent-pricing, product-pricing, smart-pricing → دمج إلى 1 مع 3 tabs.
- **3 mockup files** (232KB): حذف فوري.
- **`design.html` vs `design-workspace.html`** (134KB + 131KB): تحديد المنفصلين أو دمج.

### Consolidation Order (incremental — لا big-bang)
1. **اليوم 1:** حذف 3 mockup files.
2. **أسبوع 2-3:** pricing.html unified (سهل، أصغر pages).
3. **أسبوع 4-5:** shipping consolidation (الأصعب — 7 → 2).
4. **شهر 2:** design.html / design-workspace.html (يحتاج UX research).
5. **شهر 3-4:** Unified dashboard.html + widget registry.

### Design System Foundation (يبدأ Sprint 2)
- استخرج components من `shared.css`:
  - `<x-table data-source="...">` — bounded, paginated، تستخدم في كل الصفحات.
  - `<x-modal>` — موحَّد للـ overlay logic.
  - `<x-empty-state>` + `<x-loading>` — دائمًا مرئيين.
- توثيق في `ui/components/README.md`.

---

## 9) Dead Code Report

### حذف فوري (Day 1)
| الملف | الحجم | السبب |
|---|---|---|
| `mockup-preview.html` | 77KB | mockup قديم |
| `mockup-v2-records.html` | 78KB | mockup قديم |
| `mockup-v3-aura.html` | 77KB | mockup قديم |
| **مجموع** | **232KB** | |

### مرشَّحة بعد تأكيد المالك
- `marketplace-core.js` — يستخدم في 3 ملفات؛ هل overlapping مع `marketplace-engine.js`؟ التحقق:
  ```bash
  grep -l "marketplace-core" *.html *.js
  grep -l "marketplace-engine" *.html *.js
  diff <عرض الـ exports>
  ```
- `finance-core.js` (110 سطر) — يستخدم في 4 ملفات؛ legacy قبل FSE.
- `sidebar-manager.js` (118 سطر) — يستخدم في 1 ملف؛ هل dead بعد `sidebar-config.js`؟
- `ai-search.js`, `ai-today.js` — استخدام محدود بعد `ai-launcher.js`.
- `sync-monitor.js` (33 سطر) — مستخدم في 32 ملف لكن وظيفته غير واضحة من الاسم.

### Imports غير المستخدمة
- معظم الـ HTML pages تستورد كل ESM exports حتى لو غير مستخدمة. يحتاج `unimported` tool.

### Decision Framework لكل ملف مرشَّح
```
1. هل له مرجع في commit حديث (آخر 90 يوم)؟  → لا = candidate.
2. هل الـ exports تستخدم فعلاً عند الـ runtime؟  → grep + manual verify.
3. هل لديه testing/business value؟  → لا = حذف.
4. هل يخدم Phase 2 plan؟  → نعم = احتفظ مع تعليق.
```

---

## 10) Refactoring Recommendations — Incremental فقط

### Refactoring Pattern 1: Extract Data Layer (Week 2-4)
```js
// قبل (في 50 صفحة):
const q = query(collection(db,'orders'), where('stage','==','design'), orderBy('createdAt','desc'));
onSnapshot(q, snap => { ... });

// بعد:
import { ordersRepo } from './data/orders.js';
ordersRepo.byStage('design', { limit: 50 }).subscribe(orders => { ... });
```
**الملف:** `data/orders.js` (جديد).
**الفائدة:** queries موحَّدة، limit مفروض افتراضيًا، caching سهل.
**المخاطرة:** لا — incremental. الصفحات القديمة تكمل تشتغل.

### Refactoring Pattern 2: Engine Signature على كل write
```js
// قبل (يحدث في بعض الصفحات):
batch.update(doc(db,'wallets', w.id), { balance: increment(amount) });

// بعد:
batch.update(doc(db,'wallets', w.id), {
  balance: increment(amount),
  ...engineSignature('CUSTOM_WALLET_UPDATE')  // ← يكشف bypass
});
```
بهذا، Cloud Function `detectEngineBypass` يحدد بدقة من تجاوز الـ engine.

### Refactoring Pattern 3: Shared Permission Matrix
انقل `DEFAULT_PERMISSIONS` و `SENSITIVE_FIELDS` إلى ملف منفصل `permissions-matrix.js`:
```js
// permissions-matrix.js — single source of truth
export const ROLE_PERMS = { /* ... */ };
export const SENSITIVE_FIELDS = new Set(['client_phone', 'design_data', ...]);
export function canSeeField(role, perms, field) { /* ... */ }
```
استورده في: `shared.js`, `viewas.js`, `role-viewer.html`. يلغي الـ duplication.

### Refactoring Pattern 4: Bounded Listener Helper
```js
// shared.js
export function boundedSnapshot(q, opts={}, cb) {
  const limit = opts.limit || 100;
  const bounded = query(q, firestoreLimit(limit));
  return onSnapshot(bounded, snap => {
    cb(snap, { isAtLimit: snap.size >= limit });
  });
}
```
أي صفحة تستخدمه بدل onSnapshot مباشر.

---

## 11) Suggested Folder Structure

```
/
├── apps/                       ← الـ HTML pages بعد التنظيف
│   ├── auth/                  ← login, client-login, change-password
│   ├── internal/              ← orders, clients, design, print, shipping, production
│   ├── financial/             ← accounts, approvals, ledger, financial-dashboard
│   ├── admin/                 ← settings, role-viewer, employees, suggestions
│   ├── partner/               ← partner-portal (Phase 2)
│   └── public/                ← gallery, privacy, marketplace storefront
│
├── engines/                    ← Pure business logic (موجود حاليًا — فقط أعد التنظيم)
│   ├── financial-sync-engine.js
│   ├── marketplace-engine.js
│   ├── marketplace-core.js (تحقق من الحاجة)
│   ├── returns-core.js
│   ├── workforce-core.js
│   └── orders.js
│
├── data/                       ← Data Access Layer (جديد)
│   ├── orders.js              ← ordersRepo
│   ├── clients.js
│   ├── wallets.js
│   ├── financial.js           ← يستخدم FSE
│   └── helpers.js             ← boundedSnapshot, paginatedQuery, ...
│
├── ui/
│   ├── shared.css             ← (موجود)
│   ├── theme.js               ← (موجود)
│   ├── components/            ← x-table, x-modal, x-empty
│   └── permissions-matrix.js  ← extract من shared.js
│
├── functions/                  ← (موجود)
│   ├── triggers/              ← onOrderCreated, onPaymentLogged, ...
│   ├── callables/             ← impersonate, partnerSignIn, gemini, ...
│   ├── scheduled/             ← daily, weekly, monthly
│   └── shared/                ← phone, settings, common helpers
│
├── tests/                      ← (جديد)
│   ├── rules/                 ← @firebase/rules-unit-testing
│   └── functions/             ← Firebase Functions Test SDK
│
├── infra/                      ← (جديد)
│   ├── ci/                    ← GitHub Actions
│   ├── monitoring/            ← Cloud Monitoring dashboards JSON
│   └── migrations/            ← tenantId backfill scripts
│
└── firestore.rules, firestore.indexes.json, storage.rules, firebase.json
```

> **ملاحظة:** هذا الـ target structure. الانتقال incremental — أضف الـ `data/` و `ui/components/` و `tests/` بدون لمس الموجود.

---

## 12) Suggested Permission Matrix (Definitive)

> **مصدر واحد** يُستخدَم في: `shared.js`, `viewas.js`, `firestore.rules`, `Cloud Functions`.

| الدور | wallets | tx | ledger | clients (full) | clients (masked) | orders | designs | reports | settings | marketplace |
|---|---|---|---|---|---|---|---|---|---|---|
| admin | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW |
| operation_manager | RW | RW | RW | RW | RW | RW | metadata | RW | R | R |
| financial_manager **(new)** | RW | RW | RW | R | R | R | – | RW | – | R |
| customer_service | – | – | – | RW | RW | RW | RW | – | – | – |
| graphic_designer | – | – | – | – | (own orders) | (own) | RW | – | – | – |
| design_operator | – | – | – | – | metadata | (design stage) | RW | – | – | – |
| production_agent | – | – | – | – | metadata | (prod stage) | R | – | – | – |
| shipping_officer | – | – | – | – | RW | (ship stage) | – | – | – | – |
| wallet_manager | RW | RW | RW | – | – | R | – | R | – | – |
| partner (external) | own only | own only | own only | – | – | own only | own only | own only | – | own only |

**ملاحظة:** اقتراح إضافة دور `financial_manager` (جديد) لفصل الـ financial admin عن الـ super-admin. اليوم: admin يفعل كل شيء = single point of failure.

### تطبيق في rules
```javascript
function isFinancialManager() {
  return role() in ['admin', 'financial_manager'];
}
// استبدل isAdmin() بـ isFinancialManager() في كل rule مالية.
```

---

## 13) Suggested Monitoring Stack

### Tier 1 — Google Cloud Native (مجاني/رخيص)
1. **Cloud Logging** — مفعَّل تلقائيًا. تكوين `logBasedMetrics`:
   - `engine_bypass_attempts` — count of `detectEngineBypass` alerts.
   - `permission_denied_count` — من Firestore audit logs.
   - `functions_error_rate` — per function.
   - `cold_start_p95` — latency p95.

2. **Cloud Monitoring** — Dashboards:
   - **Financial Health**: ledger writes/hour, approval queue depth, wallet balance changes/day.
   - **Performance**: avg Firestore reads/user/min, function p50/p95/p99 latency.
   - **Security**: failed auth attempts, impersonation count, rule denials.

3. **Alerting Policies** (Cloud Monitoring → Alerting):
   - 🔴 Critical: any `detectEngineBypass` alert → PagerDuty/Slack.
   - 🔴 Critical: scheduled backup function fails 2× consecutively.
   - 🟠 High: function error rate > 5% (5min window).
   - 🟠 High: Firestore read budget > 80% (daily).
   - 🟡 Medium: impersonation > 10/day (anomaly).

### Tier 2 — Application-Level
4. **`health_dashboard` document** — كل scheduler يحدِّث field عند آخر تشغيل ناجح:
   ```js
   await db.doc('system/health').update({
     [`lastSuccessful.${functionName}`]: FieldValue.serverTimestamp()
   });
   ```
   صفحة `admin-alerts.html` تعرض دوال آخر تشغيل > 25h = warning.

5. **Audit Log Viewer** — صفحة جديدة `admin-audit.html`:
   - `audit_logs` collection
   - `impersonation_audit`
   - `engine_bypass_alerts`
   - filtering, search, export.

6. **Error Tracking** — أضف **Sentry** أو **Bugsnag**:
   ```html
   <script src="https://browser.sentry-cdn.com/..."></script>
   <script>
     Sentry.init({ dsn: '...', tracesSampleRate: 0.1 });
   </script>
   ```
   عبر window.onerror و unhandledrejection.

### Tier 3 — Custom KPIs Daily
7. **Cloud Function `dailyHealthDigest`** (cron 0 7 * * *):
   - بيانات الأمس: orders, payments, refunds, errors, slow queries.
   - يُرسل إيميل/Slack للأدمن.

### الـ Cost Estimate
| Tier | شهري |
|---|---|
| Cloud Logging + Monitoring | $0 (free tier) |
| Alerting (3 channels) | $0-10 |
| Sentry (10k events) | $0 |
| `health_dashboard` (Firestore) | $0.01 |
| **Total** | **~$10/month** |

---

## 14) Disaster Recovery Plan

### What Already Exists ✅
- `scheduledFirestoreBackup` (functions/index.js:1062) — يومي 3AM Cairo → GCS bucket.
- `backup_logs` collection — يتتبع تشغيل الـ backup.

### What's Missing ❌
- **لا restore drill executed** — هل الـ backup يصلح فعلاً؟
- **لا cross-region replication** — كل البيانات في us-central1.
- **لا backup retention policy** — kept indefinitely?
- **لا encrypted backups** — encryption at rest فقط.
- **لا runbook** — ما الخطوات الفعلية للاستعادة؟

### DR Checklist — اللوائح الرسمية

#### Backup Strategy
- [ ] Verify daily Firestore export to `gs://business2card-c041b-firestore-backups/{YYYY-MM-DD}/`.
- [ ] Add weekly Storage backup (Cloud Function `weeklyStorageSync`):
  - rsync `storage://*` → `gs://business2card-c041b-storage-backups/{YYYY-MM-DD}/`.
- [ ] Cross-region replication: GCS bucket → `us-east1` (DR region).
- [ ] Retention: 30 days hot، 365 days cold (lifecycle rules).
- [ ] CMEK encryption (Customer-Managed Encryption Keys) للـ backup bucket.

#### Restore Drill — كل 90 يوم
- [ ] Quarterly DR exercise: استورد آخر backup إلى مشروع `business2card-c041b-dr-test`.
- [ ] تحقق: row counts, financial_ledger sums, integrity.
- [ ] Document RTO/RPO.
- [ ] Update runbook بأي findings.

#### Rollback Documentation
- [ ] إنشاء `infra/disaster-recovery/RUNBOOK.md`:
  - مَن يُتَّصَل به (escalation matrix).
  - كيف تستعيد Firestore (gcloud commands).
  - كيف تستعيد Storage.
  - كيف تستعيد Cloud Functions (git revert + redeploy).
  - كيف توقف الـ writes أثناء restore (set rules to `if false`).

### RPO/RTO Targets
| Scenario | RPO | RTO |
|---|---|---|
| Firestore corruption | 24h | 4h |
| Storage corruption | 7d | 8h |
| Total project loss | 24h | 24h |

---

## 15) Impersonation Hardening (Already Strong — Polish Only)

### الحالة الحالية ✅
- Admin-only، rate-limit 10/hour، TTL 15min، immutable audit log، dryRun mode.
- audit log includes IP + user agent.
- Cannot impersonate another admin.

### Polish Items
1. **Session Lock**: أضف collection `active_impersonations`:
   ```js
   // عند start:
   await db.collection('active_impersonations').doc(callerUid).set({
     targetUid, startedAt, expiresAt
   });
   // عند end أو expire: حذف.
   ```
   منع admin بدء impersonation جديدة قبل إنهاء الحالية → يبسّط الـ audit.

2. **IP Geo Detection**: في impersonateUser، logعنوان IP + الـ geo. لو الـ admin يبدأ impersonation من بلد ≠ آخر تسجيل دخول → require 2FA confirmation.

3. **Slack/Email على كل impersonation**: Cloud Function `onImpersonationStart` يرسل alert للـ admin team — يحقق two-eyes principle.

4. **Block Critical Operations في dryRun**: حاليًا dryRun blocks writes via UI. لكن لو الـ admin اكتشف bypass عبر API direct → الـ rules نفسها لا تتحقق. أضف:
   ```javascript
   // firestore.rules
   function isImpersonatingDryRun() {
     return request.auth.token.get('impersonatingDryRun', false) == true;
   }
   match /wallets/{walletId} {
     allow write: if isAuth() && canFinancialWrite() && !isImpersonatingDryRun();
   }
   ```

---

## 16) Suggested CI/CD Hardening

### الحالي
- `deploy.yml` — يدفع على `main` push. يمنح SA `roles/owner`. لا approval gate.
- `claude.yml` — يستجيب لـ @claude mentions.
- `mobile-build.yml` — موجود لكن لم يُختبر مؤخرًا.

### الإصلاحات
1. **Environment Protection**: 
   ```yaml
   jobs:
     deploy:
       environment: production  # require manual approval في GitHub repo settings
   ```

2. **Minimal SA Roles** (S0-5).

3. **Workload Identity Federation** (Phase B):
   - استبدل service account key بـ Workload Identity.
   - GitHub Actions → Google Cloud OIDC.
   - لا secret يُخزَّن.

4. **PR-Time Checks** (جديد):
   ```yaml
   on: [pull_request]
   jobs:
     lint-rules:
       run: |
         firebase emulators:exec --only firestore "npm test"
     lint-bundle:
       run: |
         # تأكد ما فيش "AIzaSy" خارج shared.js
         ! grep -rln "AIzaSy" --include="*.html" --include="*.js" | grep -v "shared.js"
         # تأكد ما فيش onSnapshot بلا limit في ملفات جديدة
         git diff origin/main..HEAD --name-only | xargs grep -l "onSnapshot" | xargs grep "onSnapshot" | grep -v "limit("
   ```

5. **Branch Protection**: 
   - require PR review.
   - require status checks.
   - dismiss stale reviews.

---

## 17) 🚀 14-Day Stabilization Sprint Plan

> **القاعدة:** كل feature freeze. الـ team كلها على Hardening فقط لمدة Sprint واحد. لا exceptions.

### Day 1 (Monday) — Critical Security Quick Wins (3 hours of work, 24h soak time)
- [ ] **[1h] S0-1**: إصلاح `/users` update rule (file:`firestore.rules:170-175`).
- [ ] **[1h] S0-2**: إزالة `hasPage('design')`, `hasPage('print')`, `hasPage('production')` من `canFinancialWrite()`.
- [ ] **[15min] Cleanup**: حذف 3 mockup files (`git rm mockup-*.html`).
- [ ] **[45min] Deploy + Verify**: Soak test على staging لمدة 24 ساعة.
- **Owner:** Backend lead.
- **Acceptance:** Emulator tests pass (انظر S0-1 test أعلاه).

### Day 2 — Marketplace Tenant Isolation
- [ ] **[2h] S0-3**: تطبيق `inSameTenant()` على 5 marketplace collections.
- [ ] **[2h] Tests**: Emulator tests لكل cross-tenant scenario.
- [ ] **[3h] Deploy + Monitor**: لاحظ Firestore audit logs لـ permission-denied spikes.

### Day 3 — `shared.js` Performance Patch
- [ ] **[2h] S0-8**: أضف `limit(200)` على 4 listeners.
- [ ] **[2h]**: أضف `beforeunload` cleanup.
- [ ] **[3h] Monitor**: قارن Firestore reads قبل/بعد.

### Day 4 — Storage Hardening Phase 1
- [ ] **[3h]**: Cloud Function `setAuthClaims` يضع `tenantId` و `role` كـ custom claims على كل user.
- [ ] **[3h]**: Storage rules باستخدام `request.auth.token` بدل anonymous read.
- [ ] **[2h]**: Migration paths (rename existing files تدريجيًا).

### Day 5 — CI/CD Tightening
- [ ] **[1h] S0-5**: استبدل `roles/owner` بـ minimal roles list.
- [ ] **[1h]**: أضف `environment: production` للـ deploy job + branch protection.
- [ ] **[3h] PR Checks**: lint scripts جديدة.
- [ ] **[3h]**: Test full deploy cycle مع minimal roles.

### Day 6 — Rate Limit + viewas.js Coverage
- [ ] **[3h] S0-6**: Cloud Function `guardClientPortalSubmissions` (rate-limit).
- [ ] **[2h] S0-7**: أضف viewas.js لـ 21 صفحة.
- [ ] **[3h] Emulator tests**: client portal scenarios.

### Day 7 — Code Reviews + Documentation
- [ ] **[8h]**: review كل PR من Days 1-6 بـ 2 reviewer + smoke test.
- [ ] Update CLAUDE.md بالقواعد الجديدة.

### Day 8 — Tenant Backfill — Read-Only Collections
- [ ] **[1h]**: شغّل `backfillTenantId({collection:'products_v2', dryRun:true})`.
- [ ] **[1h]**: dryRun لـ `wallets`, `materials`.
- [ ] **[1h]**: نفّذ بدون dryRun.
- [ ] **[5h]**: Tests على read paths.

### Day 9 — Tenant Backfill — Write-Heavy Collections
- [ ] **[3h]**: شغّل على `orders`, `clients` (الأكبر).
- [ ] **[3h]**: شغّل على `transactions_v2`, `financial_ledger`.
- [ ] **[2h]**: Verify counts.

### Day 10 — Cloud Function Tests + Bypass Detection
- [ ] **[4h]**: اكتب 15 test على `impersonateUser`, `partnerSignIn`, `submitClientDecision`.
- [ ] **[2h]**: Test `detectEngineBypass` على scenarios معروفة.
- [ ] **[2h]**: PagerDuty/Slack integration لـ admin_alerts.

### Day 11 — Rules Test Suite
- [ ] **[8h]**: 50 test case using @firebase/rules-unit-testing:
  - 8 roles × major collections.
  - Edge cases: archived orders, locked transactions, tenant boundaries.
- [ ] integrate في CI.

### Day 12 — `notifications.js` + `viewas.js` Polish
- [ ] **[3h] A5**: server-side filtering في notifications.js.
- [ ] **[3h]**: ImpersonationLock collection + IP detection.
- [ ] **[2h] Mutation Observer cleanup**: disconnect on navigation.

### Day 13 — Monitoring Setup
- [ ] **[2h]**: Cloud Monitoring dashboards (3 dashboards).
- [ ] **[2h]**: Alerting policies (5 policies).
- [ ] **[2h]**: Sentry/Error tracking integration.
- [ ] **[2h]**: `dailyHealthDigest` Cloud Function.

### Day 14 — Hardening Verification + DR Drill
- [ ] **[3h]**: Restore backup إلى staging — verify integrity.
- [ ] **[3h]**: Penetration test ذاتي:
  - حاول role escalation كل rule.
  - حاول read cross-tenant.
  - حاول bypass engine.
- [ ] **[2h]**: Write `RUNBOOK.md`.
- [ ] **Sign-off**: Final acceptance review.

### Sprint Acceptance Criteria
- [ ] جميع 7 P0 من §1 مغلقة.
- [ ] All emulator tests passing in CI.
- [ ] Multi-tenant backfill completed for 8 collections.
- [ ] CI/CD locked down (no owner role, env protection).
- [ ] 3 Cloud Monitoring dashboards live.
- [ ] DR drill passed.
- [ ] Security score ≥ 7.5/10.

---

## 18) 30 / 90 / 180 Day Roadmap

### 30 يوم (Foundation Lockdown)
- ✅ Sprint 14-day completed (above).
- + Days 15-30:
  - أكمل tenant migration على باقي collections.
  - Sentry/error tracking في كل صفحة.
  - أكمل engine signature على كل write.
  - Pricing pages: 3 → 1.
  - Refactor `notifications.js` complete.

**نهاية 30 يوم:** Score ~7.5/10.

### 90 يوم (Hardening & Polish)
- Shipping consolidation: 7 → 2.
- Image processing pipeline (Cloud Function thumbnails).
- TypeScript على engines + shared.
- Single Firebase config migration (cleanup 60+ files).
- Workload Identity Federation.
- Soft-delete pattern موحَّد.
- Composite indexes audit + add missing.
- Cloud Function tests: 80% coverage.
- M2: arrays → subcollections migration.

**نهاية 90 يوم:** Score ~8/10.

### 180 يوم (Platform Readiness)
- god HTML pages تقسيم (clients, shipping, production).
- Unified dashboard.html + widget registry.
- Vite build pipeline + production minification.
- Partners portal (Phase 2 — partner onboarding, KYC, payout pipeline).
- Public marketplace storefront.
- E2E test suite (Playwright).
- Mobile Capacitor CI/CD revival.
- DR drill rotation (quarterly).

**نهاية 180 يوم:** Score ~8.5/10. **النظام جاهز لـ partner onboarding وعرض على مستثمر.**

---

## 19) Final Acceptance Criteria for 7.5+/10

| المحور | الهدف | Verification |
|---|---|---|
| **Architecture** | 7.5 | Data layer موجود، god pages مقسَّمة جزئيًا، engines نظيفة |
| **Security** | 8.0 | 7 P0 مغلقة، 50 rules test pass، CI hardened |
| **Scalability** | 7.5 | unbounded listeners < 30، tenant isolation active على كل collections |
| **Maintainability** | 7.0 | Firebase config مركزي، CI lint نشط، tests > 50 |
| **UI/UX** | 7.0 | mockup deleted، pricing موحَّد، 21 صفحة بـ viewas |
| **Production Readiness** | 7.5 | Monitoring dashboards live، DR runbook، alerting wired |

**التقدير الإجمالي بعد Sprint 14-day:** 7.0/10. **بعد 30 يوم:** 7.5/10. **بعد 90 يوم:** 8.0/10.

---

## 20) خاتمة استراتيجية

النظام **لا يحتاج إعادة كتابة**. يحتاج **انضباط هندسي صارم** لمدة 30 يوم.

ثلاث قواعد فقط:
1. **Feature Freeze** خلال Sprint الـ 14 يوم.
2. **No PR Without Tests** خلال الـ 90 يوم القادمة.
3. **No Code Without Tenant Awareness** من اليوم — كل query، كل rule، كل write.

**القرار التنفيذي الأهم:** اعتمد هذه الخطة قبل أي feature جديدة. الـ Investor Due Diligence القادم سيكشف كل ما هنا. أحسن السيناريوهات: إصلاح قبل الـ DD = صفقة. أسوأها: عرض القاعدة وبها role escalation = نهاية المفاوضات.

النظام **يستحق الجهد**. الـ Engine pattern + Marketplace skeleton + Returns module = أساس قوي. لكن بدون 14 يوم Hardening، كل الـ progress السابق يبقى عرضة للإسقاط بسطر console واحد.

---

**النهاية. ابدأ Day 1 غدًا.**
