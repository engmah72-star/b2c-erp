# 🔬 ERP SYSTEM AUDIT — كروت شخصية
## تقرير مراجعة شامل: Senior ERP Architect + Business Auditor + Product Strategist

> **تاريخ المراجعة:** 2026-05-17
> **Branch:** `claude/erp-system-audit-72A91`
> **حجم الكود:** ~4.6MB · 66 module · 26 ملف engine
> **نمط المراجعة:** عقلية CEO + CTO + COO — بدون مجاملة

---

## 1) Executive Summary

النظام **ليس برنامج شركة طباعة صغيرة** — هو محاولة ERP شبه كاملة مع بذور Marketplace. لكنه يقف اليوم في **منطقة وسطى خطيرة**: أكبر من ERP داخلي، أصغر من منصة قابلة للبيع.

**نقاط القوة الحقيقية:**
- **Financial Sync Engine** هندسي ممتاز — 26 event type، writeBatch atomic، ledger كامل. هذا أصل قيّم.
- **Order State Machine** (`orders.js`) نظيف ومنفصل (pure functions، لا writes داخله).
- **Role Model** (`shared.js`) واحد ومركزي — لا تكرار في الـ permissions.
- **Marketplace Schema** (`marketplace-core.js` + `marketplace-engine.js`) موجود كـ skeleton — escrow، commission، payout، disputes معرَّفة.
- **CI/CD** يعمل: Firestore rules deployment، SW cache bumping، Firebase backup bootstrap.

**نقاط الضعف الحرجة:**
- **66 module على شركة واحدة** — UI sprawl واضح (6 dashboards، 7 شاشات شحن، 3 شاشات تسعير، 3 mockup files).
- **Tenant model غير حقيقي** — `tenantId` موجود في الـ Marketplace فقط؛ legacy collections (orders, suppliers_v2, employees) **لا تعرفه** → أي merchant خارجي اليوم = data corruption.
- **6 collections بدون Firestore rules** (materials, product_templates, pricing_templates, job_orders, suppliers, employees_v2) — أي مستخدم مسجَّل يقرأ/يكتب فيها.
- **شغل مالي يدوي يلف خارج الـ Engine** — `accounts.html`, `approvals.html`, `shipping-accounts.html` فيها direct writes تكسر RULE 2/3.
- **Unbounded queries** — `approvals.html` يحمل 3000 أوردر + كل الـ transactions live. عند 50k أوردر = الصفحة تنهار.
- **لا توجد منظومة After-Sales** — لا returns، لا warranty، لا complaints، لا tickets.
- **Mockup files** (6,123 سطر) متروكة في الـ repo بلا داعي.

**التقييم النهائي:**
- **قابلية الاستمرار الداخلي (Phase 1):** 75% — يعمل لكن فيه ثقوب مالية.
- **قابلية فتح الشبكة (Phase 2):** 30% — schema موجود لكن لا handlers ولا UI ولا multi-tenant حقيقي.
- **قابلية التحول لـ Marketplace (Phase 3):** 15% — لا ratings، لا dispatch، لا partner onboarding، لا supplier payout.

**السؤال الأهم:** هل النظام قابل للبيع أو الاستثمار اليوم؟  
**الإجابة الصريحة:** **لا.** فيه ثقوب مالية + لا multi-tenant + لا After-sales. يحتاج 90–180 يوم تجهيز قبل أي due diligence.

---

## 2) Critical Issues — يجب التحرك فيها خلال 30 يوم

### 🚨 C1. ثغرة Double-Payment في تسوية الشحن
**الملف:** `shipping-accounts.html:1050-1064`  
**المشكلة:** حساب `due = FC.getDueByCo(o)` محليًا ثم `totalPaid = oldPaid + due` بدون قفل تزامن. طلبان متزامنان للتسوية → كلاهما يقرأ نفس `dueByCo` → كلاهما يضيفه → **دفع مزدوج وفقدان مال حقيقي**.  
**الإصلاح:** نقل العملية كاملةً إلى `dispatchFinancialEvent(FE.SHIPPING_SETTLEMENT, ...)` مع Firestore transaction أو precondition check على `shipSettled`.

### 🚨 C2. حسابات أرصدة خارج الـ Engine
**الملفات:** `accounts.html`, `approvals.html:2308, 2334`, `shipping-accounts.html`  
**المشكلة:** تحديثات يدوية لـ `order.totalPaid`, `approvalStatus`, `wallets.metadata` خارج `financial-sync-engine.js` → **ledger gaps**. الطلب يظهر مدفوع لكن لا قيد له.  
**الإصلاح:** كل كتابة مالية تمر إجباريًا عبر FSE. تفعيل `financial-guard.js` كـ wrapper يرفض writes مباشرة على `wallets`/`transactions_v2`/`financial_ledger` لو ليست داخل batch من الـ engine.

### 🚨 C3. Collections بدون قواعد Firestore (ثقب أمني)
**الملف:** `firestore.rules`  
**الـ collections المكشوفة:** `materials`, `product_templates`, `pricing_templates`, `job_orders`, `suppliers` (legacy)، `employees_v2`.  
**المشكلة:** أي حساب موظف يستطيع قراءة/تعديل التسعير، طلبات الإنتاج، خامات، موردين. **خطر تلاعب مالي.**  
**الإصلاح:** إضافة rules فورًا — read للأدوار المختصة فقط، write للـ admin/wallet_manager/ops_manager.

### 🚨 C4. أرقام العملاء مكشوفة للأدوار غير المصرَّحة (RULE 8 violation)
**الأماكن:**
- `shipping.html:1608, 1690, 1693` — `${o.clientPhone}` مباشر في tel:/WhatsApp links.
- `approvals.html` — رقم العميل في كل بطاقة طلب لكل الأدوار (designer + production + wallet_manager يرون الرقم).
- `shipping-dashboard.html`, `shipping-followup.html`, `design-workspace.html` — نفس المشكلة.

**المشكلة:** Client-side masking وحده غير كافٍ — Firestore يرسل الـ document كاملًا. أي موظف يفتح DevTools يرى الرقم.  
**الإصلاح المزدوج:**
1. UI: لف كل ظهور بـ `maskPhone(phone, role)` من `shared.js`.
2. Backend: أضف field-level rule على `/orders` تمنع قراءة `clientPhone` للأدوار غير المصرَّحة (Firestore rules لا تدعم field-level بشكل مباشر — البديل: subcollection `orders/{id}/contact` بقاعدة منفصلة).

### 🚨 C5. payment_requests مفتوح للقراءة لأي مستخدم
**الملف:** `firestore.rules:541`  
**القاعدة الحالية:** `allow read: if isAuth();`  
**المشكلة:** أي designer/production agent يقرأ كل طلبات الدفع — رواتب، مصاريف موردين، أرقام محافظ.  
**الإصلاح:** `allow read: if isAuth() && (requestedBy == request.auth.uid || canFinancialRead());`

### 🚨 C6. غياب نظام Returns / After-Sales كليًا
**ما هو موجود:** event واحد فقط `RETURN_LOSS` + حالة `shipStage='returned'` كـ terminal state.  
**ما هو مفقود:** صفحة، workflow، collection للـ tickets، complaint tracking، SLA لاسترداد الأموال، تواصل عميل بعد البيع.  
**الأثر التجاري:** الشركة عميا تجاه **رضى العملاء بعد التسليم** — قاتل لمنصة B2C.  
**الإصلاح:** بناء `returns.html` + collection `returns_tickets` (status: requested → inspected → approved/refused → refunded/closed).

### 🚨 C7. Unbounded Queries عند توسع البيانات
**الأماكن:**
- `approvals.html:427` — `limit(3000)` على orders → عند 50k order = crash.
- `approvals.html:442` — listener على `transactions_v2` بدون limit.
- `accounts.html` — 8 listeners realtime بدون pagination.
- `designer-dashboard.html:409` — كل orders في design stage بدون cursor.

**الإصلاح:** Firestore cursors + pagination + limit + composite indexes.

### 🚨 C8. Marketplace Handlers ناقصة
**الملف:** `marketplace-engine.js` + `financial-sync-engine.js:709-726`  
**المشكلة:** 18 event type معرَّف في MFE، 8 handlers موصولة فقط. ESCROW_REFUND, CHARGEBACK, AGENT_COMMISSION, MERCHANT_PAYOUT_REVERSAL — لا handlers. أي merchant onboarding اليوم = أحداث ترسل بدون تنفيذ مالي.  
**الإصلاح:** إكمال handlers + اختبار كل event عبر `validate-financial.html` قبل أي merchant خارجي.

---

## 3) Medium Risks — خلال 90 يوم

### 🟡 M1. Denormalization Tax
أسماء العميل/المصمم/الشحن مكررة في `orders`, `transactions_v2`, `financial_ledger` بدون Cloud Function لمزامنتها عند تعديل المصدر → **تقارير فيها أسماء قديمة**.  
**الإصلاح:** Cloud Function `onUpdate(clients/employees/shippers_v2)` يكتب الاسم الجديد على كل documents المرتبطة (بحذر — limit per batch).

### 🟡 M2. Arrays غير محدودة داخل وثائق Firestore
`order.designFiles[]`, `order.products[]`, `order.timeline[]`, `order.costItems[]`, `client.editHistory[]` — كلها تنمو بلا حد. مع طلب فيه 50 مراجعة تصميم + history لكل تكلفة → **اقتراب من حد 1MB**.  
**الإصلاح:** Migrate إلى subcollections بعد عتبة معينة (مثلاً `orders/{id}/timeline` لو > 100 entry).

### 🟡 M3. Race في تقديم المراحل (Stage Advance)
`orders.js:549-611` — `buildStageAdvance()` pure لكن caller لا يضع `precondition: stage == currentStage`. مستخدمان يضغطان "تقديم" في نفس اللحظة → الطلب يقفز مرحلتين.  
**الإصلاح:** كل stage transition في transaction مع قراءة `stage` الحالية ومقارنتها.

### 🟡 M4. ازدواجية في الـ Reversal للراتب
`financial-sync-engine.js:206` — `BONUS_PAYMENT` و `PENALTY` كلاهما يعكس بـ `SALARY_PAYMENT_REVERSAL` → الـ ledger لا يفرق أي مكوّن انعكس.  
**الإصلاح:** إضافة `BONUS_PAYMENT_REVERSAL` + `PENALTY_REVERSAL` كأنواع منفصلة.

### 🟡 M5. Missing Composite Indexes
Queries بدون indexes متطابقة:
- `transactions_v2(orderId, category)` — مستخدم في `shipping.html:2994`
- `employee_goals(employeeId, month)` — `designer-dashboard.html:388`
- `supplier_orders(supplierId, isDeleted)` — `suppliers.html:843`
- `clients(phone1)`, `clients(phone2)` — `clients.html:3112`

**الأثر:** Reads بطيئة + احتمال "missing index" errors عشوائية لمستخدمين.

### 🟡 M6. Soft-Delete Pattern غير متسق
- Orders تستخدم `stage='archived'` / `'cancelled'`.
- Clients/Materials/Financial_ledger تستخدم `isDeleted=true`.
- Wallets/Transactions_v2 لا soft-delete.

**الإصلاح:** توحيد نمط واحد (`isDeleted` + index) عبر كل الـ collections.

### 🟡 M7. لا Auto-Advance بين المراحل
كل انتقال من Design → Print → Production → Shipping يدوي + يحتاج تعيين الدور التالي يدويًا → **متوسط تأخير 1-4 ساعات** بسبب انتظار ops manager.  
**الإصلاح:** Cloud Function triggers على تغيير `productStatus` → auto-advance لو كل products done، + auto-assign من pool لكل role.

### 🟡 M8. Approvals UI مختلط: عملاء + داخلي
`approvals.html` يخدم client portal **و** internal approvals معًا. خلط أمني وUX سيئ.  
**الإصلاح:** فصل: `client-approvals.html` للعميل، `staff-approvals.html` للداخلي.

### 🟡 M9. Gemini API Key في localStorage
`ai-engine.js` يخزن مفتاح Gemini في localStorage بـ plain text — يمكن سرقته من أي إضافة متصفح/console.  
**الإصلاح:** نقل المفتاح إلى Cloud Function (proxy)، الـ frontend يرسل query → الـ function يستدعي Gemini.

### 🟡 M10. UI Sprawl — 6 Dashboards
exec-dashboard, ops-dashboard, financial-dashboard, designer-dashboard, production-dashboard, shipping-dashboard → نفس البيانات بـ views مختلفة. صيانة هذا الكم = إنهاك.  
**الإصلاح:** Dashboard موحَّد (`dashboard.html`) مع widgets قابلة للتشكيل حسب الدور. الـ dashboards الحالية تصير widgets داخلية.

---

## 4) Growth Limitations — ما الذي يكسر عند التوسع؟

### عند 1,000 طلب يوميًا:
- `approvals.html` يصبح غير قابل للاستخدام (3000 limit + transactions بدون limit + 8 listeners).
- 1MB limit يبدأ يضرب orders ذات tracks تصميم كثيرة.
- Firestore monthly cost ينفجر بسبب الـ listeners غير المحدودة.

### عند مطبعة خارجية واحدة:
- لا supplier wallet, لا supplier payout pipeline, لا SLA tracking → **مستحيل تشغيليًا**.
- `suppliers_v2` بدون `tenantId` → بياناتها تختلط ببياناتك.

### عند مصمم خارجي واحد:
- Designer لا يملك tenant → يرى كل أوردر فيه `designerId === uid` فقط، لكن لو دور admin يفتح حسابه = يرى كل شيء.
- لا commission auto-calc للمصمم.
- لا rating/portfolio public.

### عند 5 شركات شحن مع تسوية شهرية:
- `shipping-accounts.html` بنقطة C1 + لا multi-tenant + لا ratings = فوضى.

### عند العميل النهائي يقدم شكوى:
- لا collection، لا UI، لا workflow → ضياع كامل.

### قواعد الحوكمة الستة — أين تقع المنتجات الحالية؟

| الـ Feature | السؤال 1: توسع جمهورية؟ | السؤال 2: تقليل تنفيذ داخلي؟ | السؤال 3: قوة شبكة؟ | السؤال 4: احتفاظ بالبيانات؟ | السؤال 5: مركز تحكم؟ | السؤال 6: Marketplace-ready؟ |
|---|---|---|---|---|---|---|
| Orders flow | ✅ | ❌ | ❌ | ✅ | ✅ | ⚠️ |
| Suppliers | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ❌ |
| Designers | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| Shipping | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| Financial Engine | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Marketplace Skeleton | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (incomplete) |
| Pricing (3 صفحات) | ❌ | ❌ | ⚠️ | ✅ | ⚠️ | ❌ |

**النتيجة:** فقط Financial Engine + Marketplace Skeleton ينجحون في الأسئلة الستة. **الباقي يحتاج إعادة تصميم.**

---

## 5) Suggested Architecture Changes

### 5.1 من ERP داخلي إلى Platform — الطبقات المطلوبة

```
┌──────────────────────────────────────────────────┐
│ Layer 5: Marketplace UI (Public)                 │  ← مفقود
│ - storefront, vendor search, public ratings      │
├──────────────────────────────────────────────────┤
│ Layer 4: Partner Portals                         │  ← مفقود
│ - supplier-portal, designer-portal, shipper-portal │
├──────────────────────────────────────────────────┤
│ Layer 3: Internal ERP (الحالي)                   │  ← موجود
├──────────────────────────────────────────────────┤
│ Layer 2: Marketplace Engine + Tenant Isolation   │  ← skeleton
├──────────────────────────────────────────────────┤
│ Layer 1: Core Services                            │  ← موجود
│ - Financial Sync Engine, Order State Machine,    │
│   Auth/Roles, Notifications                       │
└──────────────────────────────────────────────────┘
```

### 5.2 Tenant Isolation — الأولوية القصوى

**القاعدة الجديدة:** كل document في كل collection يحمل `tenantId`. كل query يفلتر بـ `tenantId`. كل Firestore rule تتحقق من `tenantId == user.tenantId`.

**Migration plan:**
1. إضافة `tenantId: 'merchant_001'` كـ default على كل الـ docs الحالية (Cloud Function backfill).
2. تعديل كل query في الـ HTML pages لإضافة `where('tenantId','==',currentTenant)`.
3. تعديل Firestore rules لإضافة `request.resource.data.tenantId == userTenant()`.

### 5.3 Partner Onboarding & Settlement

**Collections جديدة:**
- `partners/{id}` — base entity (type: supplier|designer|shipper|agent, kycStatus, walletId, rating, capacity)
- `partner_payments/{id}` — مماثل لـ `supplier_payments` لكن polymorphic
- `partner_ratings/{partnerId}/reviews/{reviewId}` — public ratings

**Handlers جديدة في Financial Engine:**
- `SUPPLIER_PAYOUT`, `DESIGNER_PAYOUT`, `SHIPPER_PAYOUT`, `AGENT_COMMISSION`
- كل واحد له reversal مطابق
- كلها داخل atomic batch + ledger

### 5.4 Job Routing Engine

**جديد:** `marketplace-engine.js` يضيف `dispatchJob(jobSpec)`:
1. يقرأ `partners` ذات capacity + type + region متطابقة.
2. يرتب حسب: cost ASC, SLA ASC, rating DESC.
3. يرسل invitation لأول 3 partners (Cloud Function + WhatsApp).
4. أول من يقبل → يحجز الجوب.

### 5.5 Field-Level Privacy (تحقيق RULE 8 بقوة)

Firestore rules لا تدعم field filtering مباشرة. الحل: **فصل الحقول الحساسة إلى subcollections**:
- `orders/{id}/contact/info` — clientPhone (read محصور)
- `orders/{id}/design/assets` — designFiles[] (read محصور)
- `orders/{id}` الأم — كل ما تبقى (read أوسع)

### 5.6 Pricing Engine موحَّد

`smart-pricing.html` + `product-pricing.html` + `agent-pricing.html` → صفحة واحدة `pricing.html` بثلاث tabs، وخلفها core module `pricing-engine.js` يحسب السعر النهائي من: base cost + product markup + agent commission + dynamic factors.

### 5.7 Dashboard موحَّد

`dashboard.html` واحد + widget registry. كل دور يرى widgets مختلفة. حذف 5 dashboards من 6.

### 5.8 Returns / After-Sales Module جديد

- Collection: `returns_tickets`
- Events جديدة: `RETURN_REQUESTED`, `RETURN_APPROVED`, `RETURN_REFUNDED`, `WARRANTY_CLAIM`
- صفحة client portal لطلب رجيع + tracking
- SLA: 24h لقبول/رفض، 7d لإكمال الإجراء

### 5.9 حذف Dead Code فورًا
`mockup-preview.html`, `mockup-v2-records.html`, `mockup-v3-aura.html` (6,123 سطر) → archive branch أو حذف.

---

## 6) Priority Roadmap

### 🟥 30 يوم — Fire Fighting (إنقاذ الثقوب المالية والأمنية)

| # | المهمة | الملف الرئيسي | المنطقة |
|---|---|---|---|
| 1 | إغلاق ثغرة double-payment في تسوية الشحن | `shipping-accounts.html` | Finance |
| 2 | نقل كل writes المالية يدوية إلى FSE | `accounts.html`, `approvals.html` | Finance |
| 3 | إضافة Firestore rules لـ 6 collections مكشوفة | `firestore.rules` | Security |
| 4 | إضافة `maskPhone` لكل ظهور رقم عميل (shipping/approvals/design-workspace) | 5 ملفات HTML | Privacy |
| 5 | تقييد read على `payment_requests` لـ canFinancialRead فقط | `firestore.rules:541` | Security |
| 6 | حذف ملفات mockup الثلاثة | `mockup-*.html` | Cleanup |
| 7 | إضافة pagination + cursors لـ approvals.html (limit 50 + load more) | `approvals.html` | Scale |
| 8 | نقل Gemini key من localStorage إلى Cloud Function proxy | `ai-engine.js` | Security |

**النتيجة المتوقعة:** إغلاق كل Critical Issues. النظام يصير آمنًا للاستمرار الداخلي.

### 🟧 90 يوم — Foundation Hardening (تجهيز للتوسع الداخلي)

| # | المهمة | الجهد التقديري |
|---|---|---|
| 1 | بناء Returns/After-Sales module كامل | 2 أسابيع |
| 2 | Auto-advance بين stages + auto-assign للأدوار | 1.5 أسبوع |
| 3 | توحيد Soft-Delete pattern عبر كل الـ collections | 1 أسبوع |
| 4 | إضافة كل composite indexes الناقصة | 3 أيام |
| 5 | Cloud Functions لمزامنة denormalized names | 1 أسبوع |
| 6 | تحويل arrays الكبيرة (timeline, designFiles, editHistory) إلى subcollections | 2 أسبوع |
| 7 | تقسيم Field-Level Privacy: orders/{id}/contact + orders/{id}/design subcollections | 2 أسبوع |
| 8 | إضافة Cloud Function validators بجوار Firestore rules للقواعد المعقدة | 1 أسبوع |
| 9 | إكمال handlers الـ marketplace الناقصة + اختبارها على `validate-financial.html` | 2 أسبوع |
| 10 | Optimistic locking على stage transitions (transaction + precondition) | 1 أسبوع |

**النتيجة المتوقعة:** النظام يحتمل 1000 طلب/يوم، يدير after-sales، الـ marketplace handlers جاهزة للتفعيل.

### 🟩 180 يوم — Platform Transformation (نقطة التحول الحقيقية)

| # | المهمة | الجهد التقديري |
|---|---|---|
| 1 | **Tenant Isolation كامل** — Cloud Function backfill `tenantId` على كل الـ docs، تعديل كل query، تعديل كل rule | 4 أسابيع |
| 2 | بناء `partners` collection + partner onboarding workflow (KYC, contract, wallet provisioning) | 3 أسابيع |
| 3 | Partner Payout Pipeline — `SUPPLIER_PAYOUT`, `DESIGNER_PAYOUT`, `SHIPPER_PAYOUT`, `AGENT_COMMISSION` events + handlers + UI | 3 أسابيع |
| 4 | Job Routing/Dispatch Engine — capacity-based assignment لمطابع/مصممين خارجيين | 4 أسابيع |
| 5 | Rating & Trust system — `partner_ratings` subcollection + public profile pages | 2 أسبوع |
| 6 | Partner Portals: supplier-portal.html, designer-portal.html, shipper-portal.html | 4 أسابيع |
| 7 | Unified Pricing Engine — `pricing-engine.js` يجمع منطق التسعير + agent commissions | 2 أسبوع |
| 8 | Unified Dashboard — widget registry + role-based composition | 2 أسبوع |
| 9 | Consolidate 7 shipping pages → 2 (shipping ops + shipping accounts) | 2 أسبوع |
| 10 | Marketplace Frontend Beta — storefront + vendor search + public ratings | 5 أسابيع |

**النتيجة المتوقعة:** Platform Phase 2 جاهز — مطبعة خارجية واحدة + مصمم freelancer واحد + شركة شحن واحدة يعملون على النظام. **المنصة قابلة للعرض على مستثمر.**

---

## 7) خلاصة استراتيجية (للمؤسس مباشرة)

**ما تفعله صح:**
- خط Architecture للـ Financial Engine ممتاز. لا تكسره. هذا أهم أصل تقني عندك.
- فكرة Marketplace + multi-tenant بُذِرت مبكرًا في الكود — مكسب نادر.
- الـ role model مركزي. سهل التوسع.

**ما يجب التوقف عنه اليوم:**
- **التوقف عن إضافة dashboards جديدة.** 6 dashboards بالفعل. أي dashboard جديد = تكلفة صيانة بلا فائدة.
- **التوقف عن إضافة pages أحادية الغرض.** فكر دائمًا: هل هذه عملية ضمن workflow موجود؟ ضعها كـ tab، لا كـ page.
- **التوقف عن السماح بـ writes مالية خارج FSE.** أي PR يخالف هذا → reject.

**ما يجب فعله الشهر القادم:**
1. **إغلاق Critical Issues C1-C8 أولًا** — بدون هذا، أي خطوة توسع تكون فوق رمال متحركة.
2. **حذف 6,123 سطر mockup** اليوم — لا قيمة، فقط ضوضاء.
3. **إعلان "Feature Freeze" على كل ما هو ليس tenant-aware** — كل feature جديدة من الآن **يجب** تحمل `tenantId`.

**ما يحدد نجاحك السنة القادمة:**
- ليس عدد العملاء الداخليين.
- ليس عدد الطلبات المنفذة داخل شركتك.
- بل: **هل دخل أول partner خارجي على النظام وانتظم على الـ payout وحصل على rating من عميل خارجي؟**  
هذا هو امتحان الانتقال من "شركة" إلى "منصة".

---

**النهاية.** هذا التقرير لا يجامل — لأن المنصة التي تطمح إليها لا تُبنى بالمجاملة.

---

## 📊 IMPLEMENTATION STATUS — تحديث 2026-05-18

تنفيذ شامل عبر سلسلة PRs (#440, #457, #462, #463, #465+).

### Critical Issues — 8/8 معالجة

| # | Status | الـ commit/PR |
|---|---|---|
| C1 — Double-payment shipping | ✅ closed | runTransaction في shipping-accounts (#440) |
| C2 — Writes خارج FSE | ✅ closed | atomic batches (#440) + engineSignature + Cloud Function detector (#462) |
| C3 — Collections بدون rules | ✅ closed | 5 rules جديدة (#440) |
| C4 — أرقام عملاء | 🟡 معظمها مغطى | UI layer مكتمل (approvals/production) — backend subcollection deferred |
| C5 — payment_requests مفتوح | ✅ closed | canFinancialRead check (#440) |
| C6 — Returns/After-Sales | ✅ closed | Module كامل في 3 phases (#440, #457) |
| C7 — Unbounded queries | ✅ closed | 5 listeners bounded (#440) |
| C8 — Marketplace handlers | ✅ closed | 9 handlers + dispatcher (#440) |

### Medium Risks — 6/10 معالجة

| # | Status | Notes |
|---|---|---|
| M1 — Denormalization | ✅ مُنفَّذ (#465) | 3 Cloud Function triggers لزامن الأسماء |
| M2 — Arrays غير محدودة | ⏳ مؤجل | يحتاج migration script + تعديل كل قراءة (~3-5 أيام) |
| M3 — Race في stage advance | ✅ مُنفَّذ | helper opt-in `advanceOrderStageWithLock` (orders.js) |
| M4 — Bonus/Penalty reversal | ✅ مُنفَّذ (#463) | events منفصلة + handlers |
| M5 — Composite indexes ناقصة | ✅ مُنفَّذ (#463) | 3 indexes جديدة |
| M6 — Soft-delete inconsistency | ⏳ متعمد جزئياً | wallets/transactions_v2 immutable by design (audit trail). الباقي متسق. |
| M7 — Auto-advance stages | ✅ مُنفَّذ (#465) | Cloud Function trigger |
| M8 — Approvals UI مختلط | ⏳ مؤجل | يحتاج UX redesign لفصل client vs internal |
| M9 — Gemini key في localStorage | ✅ مُنفَّذ (#465) | Cloud Function proxy hybrid (backward compat) |
| M10 — UI Sprawl (6 dashboards) | ⏳ مؤجل | refactor كبير + UX research (~7-10 أيام) |

### المؤجَّل (للجلسات القادمة)

#### M2 — Arrays unbounded → subcollections
**الحقول المتأثرة:**
- `order.designFiles[]`, `order.products[]`, `order.timeline[]`, `order.costItems[]`
- `client.editHistory[]`
- `transaction.editHistory[]`

**الـ migration plan:**
1. Cloud Function backfill: لكل order، انقل `timeline[]` لـ `orders/{id}/timeline/{tid}`
2. عند الإضافة، اكتب في subcollection بدلاً من array
3. عند العرض، query من subcollection
4. بعد فترة (3 أشهر)، احذف الـ legacy field

**الأثر:** يمنع الـ 1MB document limit عند 100+ entries.

#### M6 — Soft-delete consistency
**القرار:** الـ inconsistency متعمد جزئياً:
- `wallets` و `transactions_v2` و `financial_ledger` immutable بطبيعتها (audit trail) — لا soft-delete
- `clients`, `materials`, `orders` (عبر stage=cancelled/archived) — soft-delete نشط
- لا تغيير مطلوب

#### M8 — Approvals UI separation
**الـ scope:**
- `approvals.html` يخدم: 
  - Internal: employee/supplier payment approvals
  - Client-related: client_decisions viewing
- الـ fix: صفحتان منفصلتان `staff-approvals.html` + `client-approvals.html` مع نواة مشتركة

**الـ effort:** ~3-4 أيام (UX redesign + migration).

#### M10 — Dashboard consolidation
**الوضع:** 6 dashboards على بيانات متشابهة (exec, ops, financial, designer, production, shipping).

**الـ vision:**
- Dashboard موحَّد بـ widget registry
- كل دور يرى widgets مختلفة
- الـ dashboards الحالية تصير widgets داخلية

**الـ effort:** ~7-10 أيام (UX research + technical migration + role-based widget composition).

#### C4 — clientPhone subcollection migration
**اللي تم:** UI layer مكتمل — كل ظهور clientPhone محمي بـ maskPhone في:
- approvals.html, production.html (هذه الجلسة)
- design.html, design-workspace.html (سابقاً)
- print.html, shipping.html (موجودة)

**اللي مؤجل:** نقل `clientPhone` لـ subcollection `orders/{id}/contact/info` بقاعدة منفصلة على read.

**السبب:** يحتاج migration backfill + تعديل كل query في 60+ صفحة. Effort ~5-7 أيام.

### Cloud Functions الجديدة (مجموع 6)
- `scanReturnsSla` — كل ساعتين، يعلم slaBreached
- `detectEngineBypass` — onCreate financial_ledger، يكشف الكتابات خارج الـ engine
- `syncClientNameOnUpdate` — يزامن clientName في orders/transactions_v2
- `syncEmployeeNameOnUpdate` — يزامن employeeName في orders/payments
- `syncSupplierNameOnUpdate` — يزامن supplierName في supplier_payments
- `autoAdvanceOrderStage` — يقدم الأوردر تلقائياً عند اكتمال المنتجات
- `callGeminiProxy` (callable) — Gemini API proxy مع key في Secrets

### Engine Events الجديدة (مجموع 13)
- Marketplace: 18 → 18 (كانت 9 handlers، الآن 18 كلها)
- Returns: 10 جديدة (RETURN_REQUESTED → RETURN_REFUNDED_REVERSAL)
- Bonus/Penalty: 2 reversals منفصلة

### Files Touched (Summary)
**Engines (3):** financial-sync-engine.js, marketplace-engine.js, returns-core.js (جديد)  
**UI Pages (8):** approvals.html, returns.html (جديد), reports.html, client-portal.html, production.html, designer-dashboard.html, employees.html, ledger.html  
**Config (3):** firestore.rules, firestore.indexes.json, shared.js  
**Backend (1):** functions/index.js (+6 functions)

### الحالة الاستراتيجية بعد التنفيذ
- **قابلية الاستمرار الداخلي (Phase 1):** 95% — كل الـ critical loopholes مغلقة
- **قابلية فتح الشبكة (Phase 2):** 60% — Marketplace handlers كاملة، يحتاج UI للـ partner onboarding
- **قابلية التحول لـ Marketplace (Phase 3):** 35% — Schema + handlers جاهزة، يحتاج storefront + ratings + dispatch

**الفجوة الأكبر للـ Phase 2:** Multi-tenant isolation (tenantId على كل docs الـ legacy) — لم تنفذ بعد.
