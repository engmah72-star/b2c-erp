# 🔬 SYSTEM AUDIT v2 — كروت شخصية / Business2Card ERP
## مراجعة شاملة بعقلية CTO + Principal Engineer + Security Engineer

> **تاريخ:** 2026-05-19
> **Branch:** `claude/system-audit-review-Kmjnr`
> **Repo:** `engmah72-star/b2c-erp` · 124 commits · ~4.6MB code
> **مساحة المراجعة:** 80 ملف HTML + 28 ملف JS + 2678 سطر Cloud Functions + 1213 سطر Firestore rules
> **النمط:** Brutal — بدون مجاملة. هذا تقرير production audit وليس "code review".
> **مرجع سابق:** `AUDIT_REPORT.md` (2026-05-17) — هذا التقرير يبني عليه ويُحدّثه.

---

## 0) Executive Summary — في 30 ثانية

النظام **متين معماريًا في القلب المالي، لكنه ضعيف على الأطراف، وما زال يُعاني من ثلاث أمراض مزمنة:**

1. **سور أمني به ثغرة دخول كاملة** — قاعدة `/users/{uid}` تسمح للمستخدم بتعديل وثيقته الخاصة دون قيد على الحقول. أي graphic_designer يفتح Console ويكتب سطرًا واحدًا يصير أدمن. هذه **P0 فورية**.
2. **تضخم واجهات (UI sprawl) لم يُعالَج** — 8 dashboards، 7 شاشات شحن، 3 صفحات تسعير، 3 ملفات mockup (232KB) ما زالت في الـ repo. التوصية بحذفها من 17 مايو لم تُنفَّذ.
3. **multi-tenant على الورق فقط** — `tenantId` معرَّف في `shared.js` و`firestore.rules` لكن لا يُكتب على collections القديمة (`orders`, `clients`, `suppliers_v2`, `employees`). أي شريك خارجي اليوم = data corruption.

**ما تحسن منذ مايو 17:**
- ✅ Critical Issues 8/8 المُعلَنة في التقرير السابق نُفِّذت (Cloud Functions detector، Returns module، composite indexes، Gemini proxy، marketplace handlers).
- ✅ Theme Light/Dark Mode موحَّد عبر CSS Variables (#487-493).
- ✅ Sidebar refactor → single source of truth (#479).
- ✅ View-As Deep Mode عبر Custom Token Impersonation مع audit log immutable + TTL 15 دقيقة + rate limit 10/ساعة (#486, #489).

**ما لم يتحسن (وما زال P0/P1):**
- ❌ صلاحية تعديل `/users` تسمح بتسلّق الامتيازات.
- ❌ `canFinancialWrite()` تتسع لتشمل أدوار غير مالية (designer لو معه `pages:['design']` يصير قادر يكتب على `wallets` و`financial_ledger`).
- ❌ UI sprawl: لم تُحذَف ولا صفحة من 6 dashboards/3 mockup files/شاشات الشحن السبع.
- ❌ Storage rules فضفاضة (`receipts/` و`production/` و`design-files/` كلها readable لأي مستخدم مصادَق).
- ❌ ~231 `onSnapshot` بدون `limit()` — قنبلة موقوتة عند 50k order.
- ❌ Firebase config مكرر في 60+ ملف HTML (لا re-use لـ `shared.js`).

**التقييم النهائي:** انظر §15.

---

## 1) التقييم النهائي (Final Scores)

| المحور | الدرجة | السبب الموجز |
|---|---|---|
| **Architecture** | **6.5/10** | Engine pattern ممتاز (FSE/MKE/RET) ومركزي، لكن 80 ملف HTML بلا framework + 60+ تكرار لـ Firebase config + غياب tenant boundary حقيقي |
| **Security** | **4.5/10** | ثغرة role-escalation في `/users` تكفي لتدمير النظام، storage rules ضعيفة، canFinancialWrite متوسعة، CI/CD يمنح roles/owner تلقائياً |
| **Scalability** | **5/10** | 231 listener بلا حد + arrays متضخمة داخل docs (timeline/designFiles) + لا multi-tenant فعلي + dashboards realtime مرتبطة بكل الأوردرات |
| **Maintainability** | **5.5/10** | engines نظيفة، لكن HTML pages 100-300KB تحتوي logic + UI + state + queries مخلوطة. Frequent code duplication. لا tests. |
| **UI / UX** | **5/10** | Theme + sidebar + viewas طُوِّرت بإتقان حديثًا، لكن 8 dashboards و7 شاشات شحن تخلق تشتُّت. 20 صفحة بدون viewas.js → impersonation لا يُطبَّق فيها |
| **Production Readiness** | **5.5/10** | يعمل اليوم لشركة واحدة، لكن لا يحتمل تشغيل partner خارجي. نقص: backups verified, manual approval gate, error monitoring، WAF |

> **مجموع مرجَّح:** **5.4 / 10**. النظام في "Late MVP / Early Production" — قابل للتشغيل الداخلي تحت رقابة دقيقة، **غير قابل** للعرض على مستثمر/شريك دون 60-90 يوم تجهيز.

---

## 2) 🔥 Critical Issues (P0) — يجب التحرك خلالها أيام، ليس أسابيع

### 🚨 P0-1. Role Escalation عبر `/users` self-update
**الملف:** `firestore.rules:173`
```javascript
match /users/{userId} {
  allow update: if isAuth() && (request.auth.uid == userId || isAdminOnly());
}
```
**الفجوة:** لا يوجد field-level guard. الـ rule تسمح للمستخدم بكتابة أي حقل على وثيقته الخاصة — بما فيها `role`, `permissions`, `tenantId`.

**سيناريو الهجوم (سطر واحد):**
```js
// في DevTools Console كأي graphic_designer:
firebase.firestore().doc(`users/${firebase.auth().currentUser.uid}`)
  .update({role:'admin', permissions:{}});
location.reload();  // ← الآن أدمن
```
**النتيجة:** سيطرة كاملة على النظام، كل الـ Firestore rules اللاحقة (isAdmin، canFinancialWrite، canSeeCustomerPhone) تنهار.

**الإصلاح المطلوب فورًا:**
```javascript
allow update: if isAuth() && (
  isAdminOnly()
  || (request.auth.uid == userId
      && !request.resource.data.diff(resource.data).affectedKeys()
           .hasAny(['role','permissions','tenantId','authUid','employeeId']))
);
```
بهذا، المستخدم العادي يقدر يحدث `name/email/fcmToken/preferences` فقط. أي تعديل لـ role/permissions/tenantId يحتاج أدمن.

**خسارة محتملة:** كامل قاعدة البيانات (مالية + عملاء + موظفين).

---

### 🚨 P0-2. canFinancialWrite() تتسع لتشمل أدوار غير مالية
**الملف:** `firestore.rules:79-91`
```javascript
function canFinancialWrite() {
  return isAdmin()
      || hasPage('accounts')
      || hasPage('shipping')
      || hasPage('design')      // ← هنا
      || hasPage('print')        // ← هنا
      || hasPage('clients')
      || can('canAddOrders')
      || can('canFinancialWrite');
}
```
**الفجوة:** `hasPage` يقرأ `users.permissions.pages[]`. أي graphic_designer مع `pages:['design']` يمر التحقق → يقدر يكتب مباشرة على `wallets`, `transactions_v2`, `financial_ledger`.

**سيناريو الهجوم:**
```js
// graphic_designer يضيف رصيد لمحفظته الشخصية
const batch = writeBatch(db);
batch.update(doc(db,'wallets','wallet123'), { balance: increment(100000) });
addLedgerToBatch(batch, db, 'OPENING_BALANCE', { amount: 100000, walletId:'wallet123' });
await batch.commit();
```
**الإصلاح:**
1. افصل `canFinancialWrite()` إلى:
   - `canManageWallets()` = admin/wallet_manager/operation_manager فقط (للـ wallets).
   - `canRecordCustomerPayment()` = أعلاه + CS (للـ transactions_v2 مع category='client_payment').
   - `canFinancialWrite()` = الحالي لكن **يُقرَن** بقيد على `category` في `validTx()` و`validLedger()`.

2. أزل `hasPage('design')` و`hasPage('print')` من الـ list — هذه الأدوار لا تحتاج كتابة مالية.

---

### 🚨 P0-3. Cross-Tenant Read في Marketplace Collections
**الملفات:** `firestore.rules:1048, 1060, 1070, 1083, 1090`
```javascript
match /marketplace_orders/{orderId} {
  allow read: if isAuth() && (
    isAdmin() ||             // ← يُقصِّر تنفيذ تحقق tenant
    canFinancialRead() ||    // ← نفس المشكلة
    ...
    isOwnPartnerData(resource.data)
  );
}
```
**الفجوة:** `isAdmin()` تشمل `operation_manager`، وهي تطابق قبل أن يُفحَص `inSameTenant()`. أي operation_manager في merchant_001 يقرأ كل marketplace_orders/commissions/payouts عبر كل الـ tenants.

**الأثر:** عند فتح Phase 2 (مرشنت ثاني)، بياناته المالية مكشوفة لكل عاملي merchant_001.

**الإصلاح:**
```javascript
allow read: if isAuth() && (
  (isAdmin() && inSameTenant(resource.data))
  || (canFinancialRead() && inSameTenant(resource.data))
  || resource.data.get('customerId','__') == request.auth.uid
  || isOwnPartnerData(resource.data)
);
```

---

### 🚨 P0-4. Storage Rules تسمح بقراءة الإيصالات والتصاميم لأي مستخدم مصادَق
**الملف:** `storage.rules:6-9, 30-34, 36-40`
```
match /receipts/{file=**} {
  allow read: if request.auth != null;  // ← أي موظف يقرأ كل الإيصالات
}
match /design-files/{file=**} {
  allow read: if request.auth != null;  // ← graphic_designer يقرأ تصاميم لا تخصه
}
```
**الفجوة:** Firebase Storage rules لا تدعم استدعاء Firestore، لكن يمكن استخدام `firebase.storage.object().metadata.customMetadata.role` أو تنظيم paths لتعكس الـ ownership.

**الإصلاح القصير الأجل:** path-based isolation:
- `receipts/{userId}/{filename}` → allow read if `request.auth.uid == userId || isAdmin()` (يحتاج resource.metadata)
- `design-files/{orderId}/{filename}` → سَيِّج عبر Cloud Function URL signing بدل الوصول المباشر.

**الإصلاح طويل الأجل:** نقل كل file access عبر Cloud Function signed URLs مع تحقق الصلاحية من Firestore.

---

### 🚨 P0-5. 21 صفحة بدون `viewas.js` — انتحال الدور لا يُطبَّق
**العثور:** `grep -L "viewas.js" *.html` تكشف 21 صفحة بدون السكريبت (منها صفحات public مثل client-portal و gallery — مفهوم، لكن أيضاً صفحات شغل داخلية مثل `ai-digest.html`, `validate-financial.html`, `partner-portal.html`).

**الفجوة:** أدمن في وضع "View-As" Light Mode يفتح صفحة بدون viewas.js → لا banner، لا masking، لا write-blocking. ينسى أنه في وضع المعاينة → يجري عملية كتابة باسمه الحقيقي وهو يظن أنه يجرّب موظف.

**الإصلاح:**
1. أضف `<script src="viewas.js"></script>` لكل صفحة فيها كتابة (حتى لو ليس فيها `shared.js`).
2. أو الأفضل: حُط viewas.js في `shared.js` import — لكن 20 صفحة بدون shared.js. لذا نحتاج إضافته يدويًا.
3. اعتبر hook في `sw.js` يحقن الـ banner من Service Worker على أي صفحة من الـ origin.

---

### 🚨 P0-6. CI/CD يمنح Service Account دور `roles/owner` تلقائيًا
**الملف:** `.github/workflows/deploy.yml:108-110`
```python
DEPLOYER_ROLES = ["roles/owner"]   # broadest — covers all v2 needs
```
**الفجوة:** أي تسريب لـ `FIREBASE_SERVICE_ACCOUNT` secret → سيطرة كاملة على المشروع (Firestore + Storage + Functions + IAM). دور `Owner` تخطّت `Editor` بمنح صلاحية تعديل IAM نفسه — السرقة قد لا تُكتشف بسهولة.

**الإصلاح:**
1. استبدل `roles/owner` بـ minimal set:
   - `roles/firebasehosting.admin`
   - `roles/cloudfunctions.admin`
   - `roles/datastore.owner` (Firestore)
   - `roles/firebaserules.admin`
   - `roles/cloudbuild.builds.editor`
   - `roles/iam.serviceAccountUser` (لـ runtime SA)
2. أضف `environment: production` مع manual approval gate في workflow.
3. اشتغل بـ Workload Identity Federation بدل SA key (يلغي وجود secret).

---

### 🚨 P0-7. Unauthenticated Spam على Returns/Client Decisions
**الملفات:** `firestore.rules:500-510, 866-879`
```javascript
allow create: if !isAuth() && ... 
  && request.resource.data.clientPhone == 
     get(/databases/$(database)/documents/orders/$(orderId)).data.clientPhone;
```
**الفجوة:** الـ rule صحيحة في ownership check، لكن لا يوجد rate-limit. مهاجم يعرف زوج (orderId + clientPhone) — وهذه قابلة للتعداد من URL parameters في `order-tracking.html` — يقدر ينشئ آلاف tickets/decisions.

**الأثر:** Firestore write costs explosion + إغراق طاولة `approvals` بطلبات وهمية + إشعارات admin لا تنتهي.

**الإصلاح:**
1. Cloud Function callable `clientPortalSubmit` يستلم الطلب، يتحقق من signed token تم توليده عند فتح `order-tracking.html`، ويكتب باستخدام Admin SDK.
2. أو: أضف Cloud Function `onCreate` على returns_tickets تحسب عدد الـ tickets خلال الـ 24 ساعة الأخيرة لنفس clientPhone، تحذف لو > N.
3. أزل create unauthenticated من الـ rule واستبدله بـ Function-only.

---

## 3) High Priority (P1) — خلال 90 يوم

### 🟠 P1-1. UI Sprawl لم يُعالَج
- 6 dashboards عمليات + 1 ML + 1 financial = **8 dashboards**.
- 7 شاشات شحن: `shipping.html` (200KB!), `shipping-accounts.html` (128KB), `shipping-audit.html`, `shipping-dashboard.html`, `shipping-followup.html`, `shipping-guide.html`, `shipping-lite.html`.
- 3 صفحات pricing: `agent-pricing.html`, `product-pricing.html`, `smart-pricing.html`.
- 3 ملفات mockup (232KB) ما زالت موجودة رغم توصية الحذف من 17 مايو.

**الأثر التشغيلي:** أي تغيير "مظهري بسيط" يحتاج تعديل 6 ملفات. وقت onboarding موظف جديد ينفجر.

**الإصلاح:**
1. حذف فوري: `mockup-preview.html`, `mockup-v2-records.html`, `mockup-v3-aura.html` (232KB).
2. دمج `shipping-dashboard + shipping-followup + shipping-audit + shipping-guide` في `shipping.html` كـ tabs (تقليل 5→2 ملفات).
3. دمج 3 pricing pages في `pricing.html` بـ tabs.
4. وضع plan لـ unified `dashboard.html` بـ widget registry — كل دور يرى widgets مختلفة. **بدون حذف فوري** للقديمة، فقط تجميد التطوير عليها.

---

### 🟠 P1-2. 231 onSnapshot بدون limit — **والأخطر: في `shared.js` نفسه**

**الجريمة الأكبر — `shared.js:301-326` نفسه:**
```js
subs.push(onSnapshot(query(collection(db,'clients'),  orderBy('createdAt','desc')), ...));
subs.push(onSnapshot(query(collection(db,'orders'),   orderBy('createdAt','desc')), ...));
subs.push(onSnapshot(query(collection(db,'products_v2'), orderBy('name','asc')), ...));
subs.push(onSnapshot(query(collection(db,'wallets'),  orderBy('name','asc')), ...));
```
هذه 4 listeners **بلا حد**. تُستدعى من `startListeners()` التي تنادي من ~12 صفحة تستورد shared.js. أي صفحة تتصل بـ Firestore وتحمّل **كل** documents في `clients` + `orders` + `products_v2` + `wallets` في الذاكرة.

**الأثر الكارثي:**
- عند 50k order → كل صفحة dashboard تحمّل ~30MB قبل أن تعرض شيئًا.
- كل تعديل لأي order → re-render شامل لكل الصفحات المفتوحة عبر جميع المستخدمين.
- تكلفة Firestore reads = number_of_active_users × total_documents × frequency_of_changes.

**ثاني أكبر مصدر — `notifications.js:82-140`:**
8 listeners (tasksQ, ordersQ, ordersShipQ, ordersPrintQ, auditQ, fuQ, notifQ, ordersProdQ) — كلها `where` clauses بدون `limit()`. تُحمَّل في كل صفحة عبر `notifications.js`.

**ثالث: `inbox-badge.js:123`** — listener على conversations بدون limit.

**النتيجة من grep:** `grep -rn "onSnapshot" *.html | grep -v "limit("` → 231 سطر في 60+ ملف.

**أعلى الـ HTML files:**
- `design.html` — 16 listener
- `reports.html` — 14 listener
- `employee-profile.html` — 14 listener
- `ai-insights.html` — 13 listener
- `shipping.html` — 12 listener
- `accounts.html` — 12 listener
- `clients.html` — 10 listener

**الإصلاح:**
1. **فوريًا — `shared.js:startListeners`**: أضف `limit(200)` على كل listener + اعرض زر "تحميل المزيد". هذا الإصلاح وحده يقلل Firestore reads بـ ~80%.
2. **`notifications.js`**: قسّم الـ listeners إلى "actionable today" (limit 50) + "history" (lazy load).
3. **Dashboards**: لا تستخدم listeners — استخدم `daily_stats` المُجمَّع من Cloud Function (موجود بالفعل).
4. **Reports**: استبدل realtime بـ `getDocs` (one-shot) مع pagination.
5. أنشئ helper `useBoundedListener(collection, queryConstraints, pageSize)` في `shared.js` ومنع PR جديد فيه listener بلا limit عبر CI grep.

---

### 🟠 P1-3. Firebase Config مكرر في 60+ ملف
**العثور:** `grep -l "AIzaSy" *.html *.js | wc -l` = 60+.

**الفجوة:** كل صفحة تعرف الـ FB_CONFIG بنفسها، تستدعي `initializeApp` بنفسها. مع 60 صفحة:
- 60 مكان للتحديث لو تغيرت config.
- كل صفحة فيها bundle خاص يحمل firebase SDK بشكل مستقل.
- المُفترَض أن `shared.js` هو المصدر — لكن صفحات كثيرة لا تستورده.

**ملاحظة أمنية:** API key الـ web ليس secret (Firebase web keys مكشوفة بطبيعتها) لذا ليست P0 أمنيًا. لكنها **P1 معمارية**.

**الإصلاح:**
1. كل صفحة جديدة **يجب** أن تستورد `shared.js` بدل re-init Firebase.
2. ضع CI lint: refuse PR فيه `AIzaSy` في ملف غير `shared.js`.
3. تدريجيًا، نظّف الصفحات القديمة (10 صفحات/أسبوع).

---

### 🟠 P1-4. Multi-Tenant على الورق فقط
**الملف:** `shared.js:190-196`, `firestore.rules:56-63`

`getCurrentTenantId()` معرَّف، `inSameTenant()` معرَّف — لكن:
- لا يُستخدم في rules قراءة `/orders`, `/clients`, `/suppliers_v2`, `/employees`, `/wallets`, `/transactions_v2`.
- لا يُكتب على docs قديمة (`tenantId` غائب من معظم الـ collections).

**الأثر:** أي merchant_002 لو دخل اليوم → بياناته تختلط ببيانات merchant_001 → corruption لا رجعة فيه.

**الإصلاح:** Migration plan صارم (انظر §10).

---

### 🟠 P1-5. Cloud Functions بدون Monitoring/Alerting
`functions/index.js` (2678 سطر) يحتوي:
- 6 schedulers (daily backup, weekly RFM, auto-archive…).
- 10+ triggers على writes.
- 7 callable functions.

**الفجوة:** لا dashboards Cloud Monitoring، لا error budget، لا alerting على فشل scheduled function. لو فشل `scheduledFirestoreBackup` 3 أيام متتالية → لا أحد يعلم.

**الإصلاح:**
1. أضف Error Reporting + Alerting على Cloud Functions logs (مدة 5 دقائق).
2. أنشئ `health_dashboard` document يحدّث من كل scheduler — إذا last_run > 25h → alert.
3. تابع `backup_logs` collection — موجودة بالفعل، لكن تحتاج dashboard.

---

### 🟠 P1-6. تكرار logic للإذونات client-side
`viewas.js:257-275` يكرر `ROLE_CAN_SEE_PHONE`, `ROLE_CAN_SEE_DESIGN`, إلخ، وهذه نسخة محلية من `DEFAULT_PERMISSIONS` في `shared.js`. أي تعديل لشروط الإذونات يحتاج تعديلين متزامنين.

**الإصلاح:** ضع SHARED_PERMISSIONS_MATRIX في ملف وحيد (`permissions-matrix.js`) واستوردها من shared.js + viewas.js + role-viewer.html.

---

### 🟠 P1-7. Service Worker — Cache Bumping يدوي فعّال لكن لا rollback strategy
`sw.js:9` — `const CACHE = 'b2c-v160';` يُستبدَل تلقائيًا في deploy بـ SHA. ممتاز.

**الفجوة:** لا يوجد:
- مخطط للـ rollback لو الـ deploy الجديد كاسر.
- مكان يعرض للأدمن أي إصدار شغّال الآن.
- آلية force-refresh لمستخدم محدد (يحتاج reset-sw.html — موجودة، لكن غير معروفة للموظفين).

**الإصلاح:**
1. أضف `version_log` collection يكتب فيه deploy.yml نسخة الإصدار + الـ SHA + timestamp.
2. اعرض الإصدار الحالي في footer كل صفحة (يساعد الـ support).
3. أضف زر "Force refresh" داخل settings.html لكل موظف.

---

### 🟠 P1-8. Arrays متضخمة داخل Firestore documents (M2 من التقرير السابق)
**ما زال مؤجَّل:** `order.designFiles[]`, `order.products[]`, `order.timeline[]`, `order.costItems[]`, `client.editHistory[]`.

**الأثر:** عند طلب فيه 50 مراجعة تصميم → يقترب من حد 1MB → الكتابات تفشل بدون رسالة مفهومة.

**الإصلاح:** Migrate إلى subcollections (مخطَّط محدَّد في AUDIT_REPORT v1 §M2).

---

## 4) Medium Issues (P2)

### 🟡 P2-1. Rules size: 1213 سطر — صعبة الاختبار
لا يوجد:
- Unit tests للـ rules (Firestore Emulator).
- CI step يشغّل `firebase emulators:start --only firestore` + test suite.

**الإصلاح:** اكتب 30-50 test case أساسي لكل دور × كل collection حساسة باستخدام `@firebase/rules-unit-testing`، وشغّلها في CI قبل merge.

### 🟡 P2-2. Lock-in على `id` field بشكل ad-hoc
`shared.js:337-347` — `createOrder` يستخدم `id: 'ORD-' + Date.now().slice(-8)` ويستخدم Firestore auto-id. زائدة. كل documents في `orders` لها 2 IDs: `_id` (Firestore) و `id` (string). كل query يحتاج يعرف الفرق.

**الإصلاح:** اعتمد على Firestore auto-id فقط، استخدم `_id` كـ public id، احذف `id` field المكرر.

### 🟡 P2-3. Functions monorepo بدون testing
`functions/index.js` — 2678 سطر بدون اختبار واحد. impersonateUser وحده يكفي ليُختبر.

**الإصلاح:** Firebase Functions Test SDK، اختبارات لكل callable (impersonate, sendWhatsAppTest, registerFcmToken).

### 🟡 P2-4. Service Worker يخدم PWA لكن لا "share target"
لا manifest action لـ "Share to app" — useful لـ designers يستقبلوا ملفات من Drive/Photos مباشرة.

### 🟡 P2-5. Mobile app (Capacitor) في `mobile/` بدون CI
`mobile/` فيها package.json + capacitor.config، لكن `mobile-build.yml` workflow غير مفعَّل (Last touched 15 May، الـ web deploy.yml يعمل لكن mobile لا).

**الإصلاح:** فعّل CI build للموبايل أو أزل المجلد لو غير مخطط له.

### 🟡 P2-6. AskUserQuestion في الـ Engine logs مفقود
`console.log('[FSE] ✅...')` في كل handler. مفيد للتطوير، لكن في prod هذه الـ logs تكلف بـ Firebase Functions logging cost (لا تظهر في console المستخدم لكن في log streams).

**الإصلاح:** lazy log — لو `NODE_ENV=production` لا تطبع، أو استخدم logger structured.

### 🟡 P2-7. `validate-financial.html` موجودة لكن لا تشغَّل في CI
صفحة اختبار حي ممتازة، لكنها UI-only. تحتاج تشغيل يدوي.

**الإصلاح:** اكتب `validate-financial.test.js` (Node) يستدعي نفس الـ scenarios عبر Emulator، يشغَّل في CI.

---

## 5) UI / UX Problems

### 5.1 Inconsistencies
- **17 صفحة بدون `shared.css`** (بحسب الـ audit المتعمق): `change-password`, `client-portal`, `client-login`, `gallery`, `privacy`, `mockup-*` (×3), `reset-sw`, `waybill`, `login`, `validate-financial`, `ai-digest`, `product-pricing`, `partner-portal`, `ai-insights`. بعضها مبرر (login + public pages)، لكن `validate-financial`, `ai-digest`, `product-pricing`, `partner-portal`, `ai-insights` يجب أن تتبع shared theme.
- **21 صفحة بدون `viewas.js`** (انظر P0-5).
- **هيكل sidebar**: فقط 12 من 69 صفحة تستدعي `renderSidebar()` من shared.js. الباقي يبني sidebar بنفسه → اختلاف بصري + كل تعديل في القائمة الجانبية يحتاج تحديث متعدد. PR #479 (sidebar-config single source of truth) لم يُكمَل التعميم بعد.
- **ألوان hex مكوَّدة باقية رغم PR #491:**
  - `workforce-live.html:145, 150, 155, 160` — `style="--sc:#7c5cff"` على البطاقات.
  - `workforce-live.html:401` — `color:#a78bfa` في onclick handler.
  - `workforce-live.html:411` — `background:${unassigned?'#ff3d6e':...}` حقن hex ديناميكي.
  - `workforce-live.html:455` — `rgba(255,61,110,.15)` مباشرة.
  - `validate-financial.html:65` — `style="color:#94a3b8"`.

**الإصلاح:** PR #491 جزئي. كرّر sweep على كل ملف.

### 5.2 Accessibility (a11y) — لم تُختبر
- لا `aria-label` ولا `role` على معظم الـ buttons المخصصة (`<div class="btn">` بدلاً من `<button>`).
- لا dark/light contrast verification — الـ tints الجديدة (PR #490) جميلة لكن لم تُختبر مع contrast checker.
- Mobile menu يفتح/يغلق بدون focus trap.

### 5.3 Bundle weight
- `clients.html` = 295KB raw — **4760 سطر** (المدقّق أكدها بالعدّ السطري)
- `shipping.html` = 200KB — 3096 سطر
- `employee-profile.html` = 178KB — 3168 سطر
- `reports.html` = 192KB — 3047 سطر
- `production.html` = 159KB — 2432 سطر
- `approvals.html` = 140KB — 2530 سطر
- `inbox.html` = 133KB — 2526 سطر
- `design-workspace.html` = 131KB — 2438 سطر
- `accounts.html` = 153KB — 2412 سطر
- `clients.html` على شبكة 4G مصرية = 2-3 ثوانٍ تحميل قبل أي data fetch.

**معيار قبول جديد:** أي ملف HTML > 1500 سطر يجب تقسيمه. الـ pages أعلى من 2000 سطر = god pages تجب إعادة هيكلتها.

**الإصلاح:** على المدى المتوسط، تقسيم الـ HTML الكبيرة:
- HTML shell + 1 ES module = أقل من 50KB.
- Lazy-load الجداول والمودالات.
- Code-split per-tab.

### 5.4 No empty state design
معظم الصفحات تعرض جدول فارغ بدون أي رسالة "لا توجد بيانات بعد، أضف أول طلب". يربك المستخدم الجديد.

### 5.5 Inconsistent loading state
بعض الصفحات تعرض spinner، بعضها يعرض جدول فارغ يتحرك، بعضها لا شيء.

---

## 6) Performance Problems

### 6.1 Listeners realtime على كل شيء
كما ذكرت: 231 listener بلا limit. كل listener:
- يحجز websocket connection.
- يطلب push notification في كل تعديل.
- يخلق memory pressure (50k documents = ~30MB في الذاكرة).

### 6.2 No request batching
كل صفحة تفتح 8-16 listener عند التحميل = 8-16 round-trip متوازي إلى Firestore. تأخير محسوس على الشبكة المصرية.

### 6.3 Service Worker `network-first` للـ HTML
سياسة جيدة، لكن مع 60+ HTML page = أي زيارة جديدة تحمل ~150-300KB. Cache hit ratio منخفض.

**الإصلاح:** اعتبر تحميل الـ HTML من cache أولًا (`stale-while-revalidate` كذلك) مع version banner يعرض "تحديث متاح" — تقلّل first-load بـ 80%.

### 6.4 Cloud Functions cold starts
- 20+ functions على v2 = كل function = container منفصل.
- `setGlobalOptions({ maxInstances: 10 })` جيد لكن cold start 2-5 ثانية لـ Node 20 + dependencies.
- المستخدم الذي يضغط "اعتماد" قد ينتظر 5 ثوانٍ للأول call.

**الإصلاح:** `minInstances: 1` على الـ functions الأكثر استخدامًا (registerFcmToken, impersonateUser, callable proxy لـ Gemini).

### 6.5 No CDN-optimized images
الصور المرفوعة على Firebase Storage تخدم مباشرة بدون image transformation. تصميم 5MB يحمَّل كاملاً في `gallery.html`.

**الإصلاح:** Cloud Function `onUpload` يحضّر thumbnails (200px, 800px, original) ويخزنها في Storage. الـ frontend يطلب الحجم المناسب.

---

## 7) Security Risks — تفصيلي

ملخّص الـ Risks المرتّبة (بعض هذه تكرار من §2 للوضوح، لكن مع تفاصيل تطبيقية):

| # | المخاطرة | الموقع | الأثر | الجهد |
|---|---|---|---|---|
| S1 | Role escalation via /users update | `firestore.rules:173` | 🔴 كارثي | 5 دقائق |
| S2 | canFinancialWrite تشمل design/print | `firestore.rules:79-90` | 🔴 سرقة مالية | 30 دقيقة |
| S3 | Marketplace cross-tenant read | `firestore.rules:1048+` | 🟠 تسريب بيانات شريك | ساعتين |
| S4 | Storage receipts/designs مكشوفة | `storage.rules:6-9` | 🟠 تسريب PII | يوم |
| S5 | Client portal spam (no rate-limit) | `firestore.rules:500,866` | 🟠 DoS + إغراق | يوم |
| S6 | CI/CD منح roles/owner تلقائي | `deploy.yml:108` | 🟠 لو تسرَّب SA = نهاية | ساعتين |
| S7 | 20 صفحة بدون viewas.js | المتعدد | 🟡 leak في View-As | يوم |
| S8 | API key مكرر في 60 ملف | المتعدد | 🟡 maintainability | أسبوع |
| S9 | WhatsApp token placeholder في CI | `deploy.yml:300` | 🟢 لا تأثير fonctional | OK |
| S10 | Gemini key حركة (المرَّحلة لـ Function) | ✅ مُنفَّذ | OK | — |

### 7.1 Critical Defense in Depth Gap
الـ rules + UI masking طبقتين، لكن:
- **لا backend validation على Cloud Functions** — registerFcmToken يقبل أي token (line 698 يفحص length>20 فقط). لا التحقق من شكل FCM token الحقيقي.
- **لا انتحال محاكاة** لـ partner — يقبل أي custom token. الـ partnerSignIn Function (إن وُجدت — لم تظهر في الـ index.js المقروء) تحتاج فحص.
- **لا audit trail على /users updates** — أي تغيير role يحدث بدون سجل.

**الإصلاح:** Cloud Function `onUserUpdate` يكتب في `audit_logs/{logId}` عند أي تغيير حقول حساسة (role, permissions, tenantId).

### 7.2 XSS — حالة جيدة عمومًا
أكثر الصفحات تستخدم `escapeHtml(s)` قبل `innerHTML`. لم أجد input مباشر unescaped. **تقدير 7/10 على XSS.**

### 7.3 Session management
- `viewas.js` يستخدم sessionStorage (good — يفرغ مع إغلاق التبويب).
- لكن: لا rotation للـ Firebase ID tokens، لا session timeout للأدوار الحساسة (admin يبقى مسجل دخول لمدة ~ساعة فترة token).
- **الإصلاح:** ضع `onAuthStateChanged` يطلق logout بعد 30 دقيقة inactivity لأدوار admin/operation_manager/wallet_manager.

---

## 8) Architecture Weaknesses

### 8.1 No build step → no transformation
- لا minification → 4.6MB من الكود يُسرَّع كاملاً.
- لا tree-shaking → كل صفحة تحمل كل Firebase SDK.
- لا TypeScript → bugs runtime، لا IDE autocomplete على entities.
- لا linter في CI.

**الاقتراح:** أدخل Vite (لا webpack) — يبقى dev يشتغل live بدون build، لكن production يبني bundle محسَّن. الـ HTML يبقى entry per page (vanilla المعتمدة).

### 8.2 No data layer abstraction
كل صفحة تكتب `query(collection(db,'orders'), where(...), orderBy(...))` مباشرة. يجب وجود `data/orders.js` فيه:
```js
export const ordersRepo = {
  byStage(stage, limit=50) { /* ... */ },
  byClient(clientId, limit=20) { /* ... */ },
  active(opts) { /* ... */ },
};
```
يقلل التكرار + يقدر يضع caching + يضع limit افتراضيًا.

### 8.3 No event bus client-side
كل صفحة تفتح listener خاص. عند تعديل order من صفحة → الصفحة الأخرى تحدِّث عبر Firestore realtime. لا مشكلة، لكن:
- تكلفة الـ listeners (P1-2).
- لا way لـ "إعلان" بدون كتابة على Firestore.

**اقتراح:** BroadcastChannel API لـ cross-tab events (مثل "user just signed in").

### 8.4 god components في HTML
`clients.html` = 295KB — فيه كل الـ logic للعملاء + RFM segments + followups + import/export + filters + modals + reports. **god page.**

`shipping.html` = 200KB — مشابه.

**الإصلاح:** تقسيم تدريجي → كل صفحة 30-60KB max + تحميل tabs lazy.

---

## 9) Technical Debt — قائمة قصيرة بأولوية

| # | الدَيْن | السطور المُعرَّضة | الجهد |
|---|---|---|---|
| TD1 | حذف 3 mockup files | 232KB | 5 دقائق |
| TD2 | إزالة Firebase config مكرر | 60+ ملف | 2-3 أسابيع تدريجي |
| TD3 | تقسيم clients/shipping/production html | 600KB+ | شهر |
| TD4 | إضافة CI lint للـ rules + onSnapshot | — | أسبوع |
| TD5 | إضافة TypeScript تدريجي | كل JS | شهر-شهرين |
| TD6 | توحيد soft-delete pattern | المتعدد | أسبوع |
| TD7 | حذف `id` field المكرر | orders collection | أسبوعين |
| TD8 | اختصار 6 dashboards → 1 widget registry | 6 ملفات | شهر |

---

## 10) Scalability Risks — تحت سيناريوهات حقيقية

### عند 100,000 عميل + 10,000 طلب/شهر:
- `clients.html` realtime على كل العملاء = يحمَّل 100k document في كل تحميل = browser يهنك على mobile.
- `approvals.html` (تم تحديد limit 50 من PR سابق) → جيد.
- `accounts.html` 8 listeners realtime على المعاملات = خاتمة الـ tab بعد 5 دقائق.

### عند 10 موظفين/فرع + 5 فروع:
- `attendance` collection ينمو بـ ~200 doc/يوم = 70k/سنة. مع `weeklyChurnRfmAnalysis` يقرأ كل الـ orders، استهلاك Firestore reads يرتفع جدًا.
- لا tenant boundary → بيانات الفرع الجديد تختلط بالأم.

### عند 50 partner خارجي (Phase 2):
- 50 merchant_wallet جديدة + 50 partner_payments path + 50 dispute resolution channels.
- بدون tenant isolation = كارثة.
- بدون payout pipeline = كارثة.

### عند عميل غاضب يقدّم 10 شكاوى/يوم:
- ✅ returns_tickets منفَّذ — يستوعب.
- ❌ لكن لا SLA dashboard، لا auto-assign، لا notification escalation.

### حد Firebase Free → Blaze:
- Free: 50k reads/day، 20k writes/day → النظام تجاوز هذا.
- Blaze الحالي: لا حد، لكن لو 1M reads/day = $30/شهر. هذا قابل، لكن مع 231 listener × 1000 user × 24h = أرقام تنفجر.

---

## 11) Dead Code Report

### حذف فوري (P0):
- `mockup-preview.html` (77KB)
- `mockup-v2-records.html` (78KB)
- `mockup-v3-aura.html` (77KB)
- **مجموع: 232KB / 6,123 سطر**

### مرشَّحة (تحتاج تأكيد):
- `marketplace-core.js` — مستخدم في 3 ملفات فقط، marketplace-engine.js مستخدم في 5. أيهما الـ canonical؟
- `ai-search.js`, `ai-today.js` — استخدام محدود (1-2 صفحة). هل ما زالت ضرورية مع `ai-launcher.js`؟
- `finance-core.js` (110 سطر) — مستخدم في 4 ملفات. يبدو أنه legacy قبل إنشاء `financial-sync-engine.js`. يحتاج تأكيد.
- `sidebar-manager.js` — مستخدم في ملف واحد. PR #479 وحَّد الـ sidebar في `sidebar-config.js`. هل manager.js dead؟

### imports غير مستخدمة (عينة):
- معظم الصفحات تستورد `serverTimestamp` لكن لا تستخدمها بشكل ثابت.
- import `getDocs` موجود حتى في صفحات realtime-only.

**الإصلاح:** أداة `unimported` + `depcheck` تشغَّل أسبوعيًا.

---

## 12) Suggested Refactoring Plan

### Phase A — التنظيف العاجل (أسبوع واحد، critical-path only)
1. ✅ إصلاح `firestore.rules:173` (role-escalation) — 30 دقيقة.
2. ✅ تضييق `canFinancialWrite()` — ساعة.
3. ✅ حذف 3 mockup files — 5 دقائق.
4. ✅ تضييق `roles/owner` في CI → roles minimal — ساعتين.
5. ✅ نقل `Gemini key` (مُنفَّذ سابقاً) ✓.
6. ✅ إضافة `viewas.js` للصفحات 20 المفقودة — يومين.
7. ✅ إضافة audit log Cloud Function على `/users` update — يوم.

### Phase B — تجهيز Phase 2 (شهر)
1. Migration script: `tenantId='merchant_001'` على كل docs قديمة.
2. تعديل كل query في الصفحات لإضافة `where('tenantId','==',currentTenant)`.
3. تعديل rules لإضافة `inSameTenant()` على كل collection.
4. توحيد `pricing.html`، حذف 2 من 3.
5. توحيد `shipping.html` + tabs، حذف 4 من 7.

### Phase C — Foundation Hardening (3 أشهر)
1. Vite build pipeline + minification + version chunking.
2. TypeScript تدريجي على `*-engine.js` و`shared.js`.
3. Firestore Emulator + 50 test cases على rules.
4. Cloud Functions tests + Error Reporting + Alerting.
5. Image processing pipeline.

---

## 13) Suggested Folder Structure (المستقبَلية)

```
/
├── apps/
│   ├── web/                 ← الـ HTML pages الحالية بعد التنظيف
│   │   ├── public/         ← login, gallery, client-portal
│   │   ├── internal/       ← clients, orders, design, print, shipping
│   │   ├── financial/      ← accounts, approvals, ledger, financial-dashboard
│   │   ├── admin/          ← settings, role-viewer, employees, suggestions-admin
│   │   └── partner/        ← partner-portal (Phase 2)
│   └── mobile/             ← Capacitor (الموجود حاليًا)
│
├── engines/                 ← Pure business logic — لا UI، لا framework
│   ├── financial/          ← financial-sync-engine.js
│   ├── marketplace/        ← marketplace-engine.js + marketplace-core.js
│   ├── returns/            ← returns-core.js
│   ├── workforce/          ← workforce-core.js
│   ├── orders/             ← orders.js
│   └── permissions/        ← shared/permissions-matrix.js
│
├── data/                    ← Data Access Layer (NEW)
│   ├── repositories/       ← ordersRepo, clientsRepo, walletsRepo
│   └── queries/            ← pre-built bounded queries
│
├── ui/                      ← Shared components
│   ├── components/         ← sidebar, topbar, modal, toast
│   ├── styles/             ← shared.css (CSS variables)
│   └── theme/              ← theme.js + theme tokens
│
├── functions/               ← Cloud Functions (الموجود)
│   ├── triggers/           ← onOrderCreated, onPaymentLogged
│   ├── callables/          ← impersonateUser, sendWhatsAppTest, geminiProxy
│   ├── scheduled/          ← dailyFollowupReminders, weeklyChurnRfm
│   └── shared/             ← phone normalizer, settings loader
│
├── tests/                   ← NEW
│   ├── rules/              ← @firebase/rules-unit-testing
│   ├── functions/          ← Firebase Functions Test SDK
│   └── e2e/                ← Playwright (مستقبلًا)
│
└── infra/                   ← NEW
    ├── ci/                 ← workflows + helper scripts
    ├── monitoring/         ← Cloud Monitoring dashboards JSON
    └── migrations/         ← Backfill scripts (tenantId, etc.)
```

> **ملاحظة:** هذا هدف نهائي. الانتقال يستغرق 3-6 أشهر. لا تكسر الكود الموجود — أضف الـ folders الجديدة بجوار القديمة.

---

## 14) Suggested Best Practices — على Claude/أي مساهم في الـ repo

1. **قاعدة `engine-only writes`** — أي PR فيه `updateDoc(doc(db,'wallets',...))` أو `addDoc(...,'transactions_v2',...)` خارج engine = reject.
2. **قاعدة `bounded queries`** — أي PR فيه `onSnapshot` بدون `limit()` = reject (إلا مع تبرير صريح).
3. **قاعدة `single FB_CONFIG`** — أي PR فيه `AIzaSy` في ملف غير `shared.js` = reject.
4. **قاعدة `viewas everywhere`** — أي صفحة جديدة فيها user-actionable buttons يجب أن تستورد `viewas.js`.
5. **قاعدة `RULE 8 enforcement`** — كل عرض `phone` يمر بـ `maskPhone(phone, canSeePhone)` — لا exception.
6. **قاعدة `tenant-aware`** — كل query جديدة على collection تشترك بين tenants يجب أن تفلتر بـ `where('tenantId','==',currentTenant)`.
7. **قاعدة `commits صغيرة`** — لا PR > 1000 سطر (إلا migrations).

---

## 15) Roadmap — 30 / 90 / 180 يوم

### 🔴 30 يوم — Fire-Fight Critical

| # | المهمة | الجهد | المسؤول |
|---|---|---|---|
| 1 | إصلاح Role-Escalation في `/users` rule | 30 دقيقة | Backend |
| 2 | تضييق `canFinancialWrite()` (إزالة design/print) | ساعة | Backend |
| 3 | إصلاح Cross-Tenant Read في Marketplace collections | ساعتين | Backend |
| 4 | تضييق Storage rules (path-based isolation) | يوم | Backend |
| 5 | إضافة Cloud Function rate-limit لـ client portal creates | يوم | Backend |
| 6 | تضييق `roles/owner` في CI + إضافة manual approval gate | ساعتين | DevOps |
| 7 | إضافة `viewas.js` لـ 20 صفحة | يومين | Frontend |
| 8 | حذف 3 mockup files | 5 دقائق | الكل |
| 9 | Cloud Function audit log على `/users` update | يوم | Backend |
| 10 | كتابة 30 rules test في Emulator | 3 أيام | QA |

**النتيجة المتوقعة:** الـ security score يقفز من 4.5 → 7.5.

### 🟠 90 يوم — Foundation Hardening

| # | المهمة | الجهد |
|---|---|---|
| 11 | Migration: `tenantId` على كل docs قديمة | أسبوع |
| 12 | تعديل rules لإضافة `inSameTenant()` على كل collection | 3 أيام |
| 13 | تعديل كل query لإضافة tenant filter | أسبوع |
| 14 | توحيد pricing.html (3→1) | يومين |
| 15 | توحيد shipping (7→2 ملفات) | أسبوع |
| 16 | إضافة pagination لكل الصفحات الكبيرة | أسبوعين |
| 17 | Cloud Function Monitoring + Alerting | 3 أيام |
| 18 | Image processing pipeline | أسبوع |
| 19 | Single FB_CONFIG migration (cleanup) | أسبوعين تدريجي |
| 20 | TypeScript على engines + shared | أسبوعين |

**النتيجة المتوقعة:** Scalability 5 → 7.5، Maintainability 5.5 → 7.

### 🟢 180 يوم — Platform Transformation

| # | المهمة | الجهد |
|---|---|---|
| 21 | Vite build pipeline + minification + chunking | أسبوع |
| 22 | تقسيم clients/shipping/production HTML → multi-module | شهر |
| 23 | Dashboard موحَّد + widget registry | شهر |
| 24 | Partners onboarding workflow + KYC | 3 أسابيع |
| 25 | Partner payout pipeline (Cloud Functions) | 3 أسابيع |
| 26 | Job routing/dispatch engine | شهر |
| 27 | Public Marketplace storefront + ratings | شهر |
| 28 | E2E test suite (Playwright) | أسبوعين |
| 29 | Mobile (Capacitor) CI/CD revival | أسبوع |
| 30 | Service Mesh (Cloud Run + auth proxy لـ partner reads) | 3 أسابيع |

**النتيجة المتوقعة:** التحضير لـ Phase 2 platform launch.

---

## 16) خلاصة استراتيجية — للمؤسس

النظام الحالي **يعمل ممتاز كـ ERP داخلي تحت رقابة**، لكن:
1. **لا تفتحه على شريك خارجي اليوم.** Multi-tenant على الورق فقط. ستحدث corruption لا رجعة فيها.
2. **رشّ ثلاث ساعات على إصلاح P0-1 و P0-2 الآن.** هاتين الثغرتين كافيتين لتدمير المشروع.
3. **توقف عن إضافة UI جديد قبل دمج الموجود.** كل dashboard إضافي = ديْن تقني صعب التخلص منه.
4. **استثمر في Tests.** نظام مالي بـ 0 unit tests = قنبلة موقوتة.

**التقييم النهائي:**

| المحور | الدرجة |
|---|---|
| Architecture | **6.5/10** |
| Security | **4.5/10** ← الأخفض، يجب رفعها فورًا |
| Scalability | **5/10** |
| Maintainability | **5.5/10** |
| UI/UX | **5/10** |
| Production Readiness | **5.5/10** |
| **المجموع** | **5.4/10** |

**التفسير المختصر:**
- **Architecture 6.5:** القلب نظيف (engines)، لكن الأطراف فوضى (HTML pages).
- **Security 4.5:** ثغرة P0 واحدة كافية لخفض الدرجة كل هذا. بعد إصلاحها → 7.5.
- **Scalability 5:** يصمد لـ 1000 طلب/شهر. ينهار عند 10,000.
- **Maintainability 5.5:** Engines سهلة، HTML pages صعبة جدًا.
- **UI/UX 5:** Theme حلو حديثاً، لكن UI sprawl والـ a11y غائبتين.
- **Production Readiness 5.5:** يعمل، لكن بدون monitoring/alerting/backups verified = ليس production-grade.

**النهاية.** التقرير لا يجامل لأن المنصة التي تطمح إليها تحتاج تأسيس حقيقي، لا تجميل.

---

> **ملاحظة لـ Claude future sessions:** هذا التقرير يبني على `AUDIT_REPORT.md` (2026-05-17). الـ Critical Issues المُنفَّذة منه (C1-C8) تم التحقق منها. الـ P0 الجديدة هنا (S1, S2, S3, S6, S7) لم تكن في التقرير السابق وهي اكتشافات جديدة. ابدأ بها قبل أي feature.

---

## Annex A — Quick-Action Checklist (Copy-Paste Ready)

### الإصلاحات التي تأخذ < ساعتين كل واحد:

```diff
# 1) firestore.rules — منع role escalation
- allow update: if isAuth() && (request.auth.uid == userId || isAdminOnly());
+ allow update: if isAuth() && (
+   isAdminOnly()
+   || (request.auth.uid == userId
+       && !request.resource.data.diff(resource.data).affectedKeys()
+            .hasAny(['role','permissions','tenantId','authUid','employeeId']))
+ );
```

```diff
# 2) firestore.rules — تضييق canFinancialWrite
 function canFinancialWrite() {
   return isAdmin()
       || hasPage('accounts')
       || hasPage('shipping')
       || hasPage('shipping-accounts')
       || hasPage('suppliers')
-      || hasPage('production')
-      || hasPage('design')
-      || hasPage('print')
       || hasPage('clients')
       || can('canAddOrders')
       || can('canFinancialWrite');
 }
```

```diff
# 3) shared.js:301-326 — bound listeners
- subs.push(onSnapshot(query(collection(db,'clients'), orderBy('createdAt','desc')), ...
+ subs.push(onSnapshot(query(collection(db,'clients'), orderBy('createdAt','desc'), limit(200)), ...
# (same for orders, products_v2, wallets)
```

```bash
# 4) حذف فوري للملفات الميتة (232KB)
git rm mockup-preview.html mockup-v2-records.html mockup-v3-aura.html
```

```diff
# 5) .github/workflows/deploy.yml — تضييق Owner
- DEPLOYER_ROLES = ["roles/owner"]
+ DEPLOYER_ROLES = [
+   "roles/firebasehosting.admin",
+   "roles/cloudfunctions.admin",
+   "roles/datastore.owner",
+   "roles/firebaserules.admin",
+   "roles/cloudbuild.builds.editor",
+   "roles/iam.serviceAccountUser",
+ ]
```

```diff
# 6) firestore.rules — Marketplace cross-tenant
 match /marketplace_orders/{orderId} {
   allow read: if isAuth() && (
-    isAdmin() ||
-    canFinancialRead() ||
+    (isAdmin() && inSameTenant(resource.data)) ||
+    (canFinancialRead() && inSameTenant(resource.data)) ||
     resource.data.get('customerId','__') == request.auth.uid ||
     isOwnPartnerData(resource.data)
   );
 }
# (نفس النمط على /commissions, /escrow_holds, /payouts, /marketplace_audit_log)
```

### الـ Verification بعد الإصلاحات:

1. **اختبار role escalation (Emulator):**
   ```bash
   firebase emulators:start --only firestore
   # Sign in as graphic_designer
   # Try: updateDoc(doc(db,'users',uid), {role:'admin'})
   # Expected: permission-denied
   ```

2. **اختبار canFinancialWrite restriction:**
   ```bash
   # Sign in as user with pages:['design']
   # Try: addDoc(collection(db,'financial_ledger'), {amount:100, eventType:'OPENING_BALANCE',...})
   # Expected: permission-denied
   ```

3. **اختبار shared.js limits:**
   ```bash
   # Seed Firestore with 10k orders
   # Open clients.html
   # Verify Network tab: < 200 docs fetched
   ```

---

## Annex B — مؤشرات لقياس النجاح (KPIs بعد 30/90/180 يوم)

| KPI | اليوم | 30 يوم | 90 يوم | 180 يوم |
|---|---|---|---|---|
| Security Score | 4.5/10 | 7.5/10 | 8.5/10 | 9/10 |
| Unbounded listeners | 231 | 100 | 30 | <10 |
| Firestore reads/day (avg) | ? | -40% | -70% | -85% |
| Largest HTML file | 295KB | 295KB | 200KB | <100KB |
| Pages without `shared.js` (data layer) | ~10 | 7 | 3 | 0 |
| Test coverage (rules) | 0% | 30% | 70% | 90% |
| Cloud Function alerts wired | 0 | 5 | 12 | 20 |
| Multi-tenant Phase 2 ready | ❌ | ❌ | ⚠️ | ✅ |
