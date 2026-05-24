# PHASE 2 DIAGNOSIS — التشخيص الشامل لربط الطبقات الست

**التاريخ:** 2026-05-22
**الفرع:** `claude/system-phase-two-implementation-GFPX1`
**النطاق:** Design · Print · Execution · Shipping · Archive · Accounts × (الموظفين · العملاء · الشركة)
**الهدف:** تشخيص الحالة الحالية قبل تخطيط أو تنفيذ المرحلة الثانية. **لا توصيات تنفيذية في هذه الوثيقة.**

---

## 0. EXECUTIVE SUMMARY

| المحور | الحالة | الملاحظة |
|--------|--------|----------|
| **State Machine (order.stage)** | 🟢 سليم | المراحل الست مُعرَّفة في `ORDER_STAGES` + مرور عبر `buildStageAdvance` |
| **Central Actions (RULE A1)** | 🟡 جزئي | أساسيات `submitToPrinting/Production/Shipping/archive` موجودة، لكن `settleShipping/handleReturn` غير ممركَزة |
| **Direct Writes (RULE H1.1)** | 🔴 مخالف | 28+ direct write مكتشَف عبر 5 صفحات |
| **Permissions Matrix (RULE P1)** | 🟢 سليم معمارياً | لا backdoors؛ مصفوفة 8 أدوار × 19 capability موجودة |
| **Field-level Gating (RULE 8)** | 🟡 غير متّسق | cs-dashboard 0 checks؛ exec-dashboard بدون gating داخلي |
| **Idempotency (RULE H1.2)** | 🟡 جزئي | 7 actions مغلَّفة؛ `recordPayment/refundOrder` غير مغلَّفين |
| **Audit Trail (RULE H3)** | 🟢 سليم | `addLedgerToBatch` يكتب كل الحقول الإلزامية + operationId |
| **Invariants (RULE H2.4)** | 🟡 ناقص | 13 من 16 — invariants حرجة مفقودة (collection-before-settle، archive-with-partial) |
| **Customer Portal** | 🔴 ضعيف | 2/6 طبقات مرئية للعميل؛ لا تتبع شحن، لا فواتير، لا إخطارات |
| **Employee Dashboards** | 🟡 موجود لكن غير متّسق | 7 dashboards لكن drift في الـ gating |

**الخلاصة:** البنية المركزية (FSE + central actions + permissions matrix) قوية وسليمة. الضعف الرئيسي:
1. **مخالفات مباشرة** متبقية في صفحات حساسة (clients.html / shipping-accounts.html / production.html / design.html).
2. **فجوات state machine** في الانتقال بين الطبقات (shipStage init، archive prerequisites).
3. **العميل أعمى** عن 4 من 6 طبقات تشغيلية.
4. **عدم اتساق UI gating** يكسر defense-in-depth حتى لو الـ rules محكمة.

---

## 1. STATE MACHINE & LAYER FLOW

### 1.1 خريطة الانتقالات

| Layer | `order.stage` | Central Action | Validator | Sub-states |
|-------|---------------|----------------|-----------|------------|
| Design | `design` | `submitToPrinting()` | `validateStageRequirements` (design file + payment) | `designStage: pending\|awaiting_payment` |
| Printing | `printing` | `submitToProduction()` | يتطلب ≥1 design image | — |
| Execution | `production` | `submitToShipping()` | warning على costItems | `costItems[]`, `productStatus` per product |
| Shipping | `shipping` | `archiveOrder()` (عبر `buildArchiveSpec`) | يتطلب `shipSettled=true` لو `shipMethod=company` | `shipStage: ready→shipped→delivered→collected→closed`، `shipSettled` |
| Archive | `archived` | — (terminal) | — | يكتب `shipStage='completed'` (legacy value) |
| Accounts | لا مرحلة منفصلة (read-only ledger) | — | — | — |

### 1.2 فجوات الانتقال (Inter-Layer Gaps)

| # | الفجوة | الموقع | الأثر |
|---|---------|--------|-------|
| **G1** | `shipStage` لا يُهيَّأ عند الدخول لـ shipping | `orders.js:757-819` (buildStageAdvance لا يضيف `shipStage:'ready'`) | UI يستخدم `o.shipStage \|\| 'ready'` (defensive) — coupling هش |
| **G2** | لا validator على `productStatus` قبل submitToShipping | `orders.js:716` (warning على costItems فقط) | منتجات `pending` تصل لمرحلة الشحن |
| **G3** | `shipSettled` يُكتب من مكانين | `shipping-accounts.html:1729` + `financial-sync-engine.js:625` | dual-write authority — يخالف RULE 1 |
| **G4** | لا central action لتسوية الشحن | shipping-accounts.html (16 direct writes) | الـ rule A1 مكسور — لا `orderActions.settleShipping()` |
| **G5** | الـ return logic منثور في shipping-accounts.html | `shipping-accounts.html:1220-1900` (16 direct writes) | لا `orderActions.markFullReturn/markPartialReturn` مستخدم من UI |
| **G6** | Archive يكتب legacy values | `orders.js:943` (`shipStage:'completed'`) | UI يحتاج `normalizeShipStage()` على القراءة |
| **G7** | `designStage` بـ magic strings | `design.html` فقط (لا `ORDER_DESIGN_STAGES` constant) | يخالف RULE C2 |

### 1.3 Direct Writes بالطبقة (RULE H1.1)

| File | Count | Sample (line: pattern) |
|------|-------|------------------------|
| `design.html` | 6 | `:570` addDoc(audit_logs)، `:660-674` refund batch writes |
| `print.html` | 0 | ✅ نظيف |
| `production.html` | 5 | `:510, :1758` writeBatch on costItems |
| `shipping.html` | 0 | ✅ نظيف |
| `shipping-followup.html` | 0 | ✅ نظيف |
| `shipping-accounts.html` | **16** | `:1223, :1264, :1418, :1629, :1727, :1853...` (return + settlement) |
| `archive.html` | 1 | `:661` addDoc(orders) |
| `accounts.html` | 0 | ✅ نظيف |
| `clients.html` | **23+** (deletion path) | `:2519` `batch.update(wallets)` + direct ledger writes |

**Total: ~51 direct write** عبر 5 صفحات. الـ allowlist هو `orders.js / order-actions.js / FSE / core/ / functions/`.

---

## 2. EMPLOYEE ROLE-BASED ACCESS

### 2.1 خريطة الأدوار × الطبقات

| Role | Design | Print | Production | Shipping | Archive | Accounts | Dashboard |
|------|--------|-------|------------|----------|---------|----------|-----------|
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `operation_manager` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ops-dashboard |
| `customer_service` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | cs-dashboard |
| `graphic_designer` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | designer-dashboard/hub |
| `design_operator` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | designer-dashboard |
| `production_agent` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | production-dashboard |
| `shipping_officer` | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | shipping-dashboard |
| `wallet_manager` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | financial-dashboard |

**فجوات:**
- `operation_manager` ممنوع من Accounts — عدم تماثل مع `admin` (قد يحدّ من قدرته على الإشراف المالي).
- `customer_service` محصور في طبقة واحدة (design + clients) — لا cross-functional view.
- `wallet_manager` معزول مالياً لكن لا يرى السياق التشغيلي.

### 2.2 المخالفات الحرجة في الـ Dashboards

| # | الموقع | المخالفة | الخطورة |
|---|--------|----------|---------|
| **R1** | `cs-dashboard.html:510, :620, :714-736` | **0 `canSee()` checks** على `clientPhone` رغم 885 سطر | HIGH — يكسر defense-in-depth |
| **R2** | `exec-dashboard.html:427, :509, :641, :853-858, :951-952` | `salePrice` بدون `canSee('price_sale')` داخلياً | MED |
| **R3** | `design.html:1023` | `designFileUrl` build بدون `canSee('design_data')` | MED |
| **R4** | `shipping-dashboard.html:302, :357` | `clientPhone` raw في `tel:` href بدون `maskPhone()` | LOW |
| **R5** | `employees.html` (14 occurrences) | hardcoded `['admin','operation_manager']` بدل `ADMIN_ROLES` constant | LOW (يخالف C2) |

**No backdoors detected:** 0 من `if(uid==='specific')` / `if(email==='admin@...')` ✅

### 2.3 Hardcoded Role Checks

60 occurrence من `currentRole === '...'` / `['admin', 'operation_manager']` عبر 8 ملفات. معظمها UI rendering مشروع، لكن يكرّر constants موجودة (RULE C2 drift — يحتاج migration تدريجي).

---

## 3. CUSTOMER PORTAL COVERAGE

### 3.1 ملفات الـ Portal

| File | Size | الحالة |
|------|------|--------|
| `client-login.html` | 6KB | ✅ phone + order code auth (لا Firebase Auth للعملاء) |
| `client-portal.html` | 32KB | ✅ صفحة العميل الرئيسية — design preview + approve + return request |
| `my-profile.html`, `my-requests.html` | — | ⚠️ employee pages **ليست** للعميل |
| `client-design-library.html` | 980B | ❌ stub (يحوّل لـ designer-hub.html) |
| `order-tracking.html` | 16KB | ⚠️ employee tool (يتطلب Firebase Auth) — لا يصلح للعميل |

### 3.2 رؤية العميل عبر الطبقات

| Layer | Customer Sees | Customer Acts |
|-------|---------------|---------------|
| Design | ✅ Mockups + versions + status | ✅ Approve / Request revision |
| Print | ❌ — | ❌ |
| Execution | ❌ — | ❌ |
| Shipping | ❌ — لا tracking، لا waybill، لا ETA | ❌ |
| Archive | ❌ — لا history retrieval، لا receipt | ❌ |
| Accounts | ⚠️ يرى sale/paid/remaining فقط | ❌ لا payment، لا statement |

**Coverage: 2/6 طبقات تشغيلية مرئية للعميل.**

### 3.3 الفجوات الـ 10 الكبرى

1. ❌ **لا stage change notifications** — العميل أعمى عن تقدم الطلب.
2. ❌ **لا shipment tracking** — بعد مرحلة الشحن، صفر visibility.
3. ❌ **لا invoice / online payment** — لا receipt، لا دفع رقمي.
4. ❌ **لا customer messaging** — لا تواصل مع CS من البورتال.
5. ❌ **لا design re-upload** — العميل عالق على الإصدار الأولي.
6. ❌ **لا order history retrieval** — لا استرجاع طلبات قديمة.
7. ❌ **لا return evidence upload** — لا صور للتلف.
8. ⚠️ **design revision notes غير مكتملة** — لا يرى تعليمات المصمم.
9. ❌ **لا email/SMS** — لا automated updates.
10. ⚠️ `order-tracking.html` يحتوي internal data (costItems / ledger) — العميل لا يصل لكن الـ page موجودة بصلاحيات داخلية فقط.

### 3.4 الأمان

- ✅ **RULE 8 Compliance:** `where('clientId','==',clientId)` مطبَّق على design_items / returns_tickets.
- ✅ **No cross-customer leakage** مكتشف.
- ✅ **Customer cannot write** financial collections (rule F1.5).
- ✅ **No price leakage:** priceCost / profitMargin غير مرئية للعميل.

**Customer Portal Score: 5.5/10**

---

## 4. FINANCIAL INTEGRATION ACROSS LAYERS

### 4.1 إصدار الأحداث (Event Emission) لكل طبقة

| Layer | Events |
|-------|--------|
| Design | (لا أحداث متوقعة) |
| Print | VENDOR_PAYMENT (cost capture) |
| Execution | VENDOR_PAYMENT (supplier orders)، GENERAL_EXPENSE (return loss) |
| Shipping | SHIPPING_SETTLEMENT، SHIPPING_EXPENSE، SHIPPING_SETTLEMENT_REVERSAL |
| Archive | RETURN_LOSS (on partial return)، GENERAL_EXPENSE_REVERSAL |
| Accounts | CUSTOMER_PAYMENT، CUSTOMER_REFUND، WALLET_TRANSFER، SALARY_PAYMENT، BONUS_PAYMENT، PENALTY، PAYROLL |

✅ كل الأحداث تمر عبر `dispatchFinancialEvent(db, FE.X, payload)`.

### 4.2 المخالفة الحرجة (HIGHEST severity)

**`clients.html:2509-2541` — `cgridDeleteOrder()`:**
```js
batch.update(db.collection('wallets').doc(wId), { balance: increment(-paid) });
batch.set(db.collection('transactions_v2').doc(), { ... });
batch.set(db.collection('financial_ledger').doc(), { ... });
```

- ❌ **يخالف RULE G6** (Engine Writes Only)
- ❌ **لا `withIdempotency()`** → double-click يُكرّر الـ reversal
- ❌ **لا `operationId` / `causedByOperationId`** → audit chain مكسور
- ❌ **لا approval workflow** → entries بدون approvalStatus

### 4.3 Idempotency Coverage (RULE H1.2)

| Action | Wrapped? |
|--------|----------|
| `createOrder` | ✅ |
| `editOrderPayment` | ✅ |
| `dispatchOrder` (shipping) | ✅ |
| `collectFromCustomer` | ✅ |
| `settleWithCompany` | ✅ |
| `reverseSettlement` | ✅ |
| `markPartialReturn` | ✅ |
| `recordPayment` | ❌ **بدون wrap** |
| `refundOrder` | ❌ **بدون wrap** |

### 4.4 Invariants Coverage (RULE H2.4)

| # | Invariant | الحالة |
|---|-----------|--------|
| I1-I9 | basic (paid≥0, remaining≥0, paid≤total, ...) | ✅ enforced |
| I10 | refund ≤ paid | ✅ |
| I11 | settled flag/amount match | ✅ |
| I12 | partial-return items shape | ⚠️ warns فقط |
| I13 | partial-return qty validation | ⚠️ warns فقط |
| **I15 (مفقود)** | **`shipSettled=true` ⇒ `shipCollected > 0`** (collection before settle) | ❌ غير موجود |
| **I16 (مفقود)** | **`stage='archived'` ⇒ (`paymentStatus='paid'` ∨ `shipStage='returned_full'`)** | ❌ غير موجود |
| **I17 (مفقود)** | **منع reverse settlement على archived order** | ❌ غير موجود |

### 4.5 الفجوات المالية الكبرى (Top 10)

| # | المشكلة | الخطورة |
|---|---------|---------|
| 1 | Direct ledger write في `clients.html:2519` بدون idempotency | **CRIT** |
| 2 | `buildArchiveSpec` لا يفرض `paymentStatus='paid'` لو لا return | **CRIT** |
| 3 | `addLedgerToBatch` يحذّر فقط (console) على missing operationId — لا throw | **CRIT** |
| 4 | Collection قبل settlement مسموح بدون gating | HIGH |
| 5 | `recordPayment` / `refundOrder` بدون `withIdempotency` | HIGH |
| 6 | Reverse settlement مسموح على archived orders | HIGH |
| 7 | I12/I13 invariants warn فقط بدل reject | MED |
| 8 | لا SLA enforcement على stale shipments (`wait_collection` indefinite) | MED |
| 9 | لا unified reconciliation dashboard (يكشف cross-layer conflicts) | MED |
| 10 | Approval workflow fields ناقصة في deletion paths | LOW |

---

## 5. CROSS-CUTTING PRIORITIES FOR PHASE 2

> هذه **أولويات للنقاش**، ليست خطة تنفيذ. أي bucket يتحول لـ implementation بعد موافقة + RULE 7/G10 module definition.

### 🔴 Bucket A — Centralization Backlog (يفرض H1.1 / A1 / G6)
- A1. ترحيل `clients.html:cgridDeleteOrder` لـ `orderActions.deleteOrder` ← أعلى أولوية (financial integrity).
- A2. ترحيل return handling من `shipping-accounts.html` لـ `orderActions.markFullReturn/markPartialReturn` (إنشاؤهم في order-actions.js لو غير موجودين).
- A3. إنشاء `orderActions.settleShipping` لاستيعاب 16 direct writes في shipping-accounts.html.
- A4. ترحيل refund batch من `design.html:660` لـ `orderActions.refundOrder` (مع wrap idempotency).
- A5. ترحيل costItems batches من `production.html:510, :1758` لـ central action.
- A6. ترحيل `archive.html:661` للـ central path.

### 🟠 Bucket B — State Machine Hardening
- B1. تهيئة `shipStage:'ready'` في `buildStageAdvance` عند الدخول لـ shipping.
- B2. تعريف `ORDER_DESIGN_STAGES` constant.
- B3. إضافة I15/I16/I17 invariants في `core/financial-invariants.js`.
- B4. إضافة validator: كل المنتجات `productStatus !== 'pending'` قبل `submitToShipping`.
- B5. تطبيع `shipStage` على الكتابة (بدل ما UI ينظّفها على القراءة).
- B6. منع `reverseSettlement` على archived orders.

### 🟡 Bucket C — Permissions & Audit Defense-in-Depth
- C1. wrap `canSee('client_phone')` حول كل phone renders في `cs-dashboard.html`.
- C2. wrap `canSee('price_sale')` في `exec-dashboard.html` (7+ مواضع).
- C3. wrap `canSee('design_data')` في `design.html:1023`.
- C4. `maskPhone()` في `shipping-dashboard.html`.
- C5. ترحيل hardcoded role lists لـ `ADMIN_ROLES` constant (60 occurrence).
- C6. wrap `recordPayment` + `refundOrder` بـ `withIdempotency`.
- C7. تحويل warns في `addLedgerToBatch` لـ throws على missing operationId.

### 🟣 Bucket D — Customer Portal Expansion (الأكثر تأثيراً على الـ vision)
- D1. Shipment tracking للعميل (read-only من `shipStage` + waybill).
- D2. Invoice & statement view (read-only من `transactions_v2` filtered by clientId).
- D3. Order history retrieval (filtered archive).
- D4. Stage change notifications (Cloud Function trigger → email/SMS/in-portal).
- D5. Return evidence upload (via `core/storage-helpers.js` — RULE S1).
- D6. Re-order from history.
- D7. Customer ↔ CS messaging thread (per-order).

### 🟢 Bucket E — Reconciliation & Dashboards
- E1. Unified Financial Health Dashboard (cross-layer invariant violations).
- E2. SLA monitor لـ stale shipments.
- E3. `operation_manager` Accounts view (read-only) — رفع الفجوة في 2.1.
- E4. cross-functional dashboard لـ `customer_service` (عدا design).

---

## 6. ما لم يُغطَّ في هذا التشخيص

- **Performance benchmarks** عبر الطبقات (راجع PERFORMANCE_AUDIT.md).
- **Firebase Rules deep audit** (راجع RULES_AUDIT.md).
- **Tenant isolation Phase 2** (G7) — مؤجَّل.
- **Cloud Functions audit** (`functions/index.js`).
- **Migration paths للـ legacy shipStage values**.
- **Service Worker / PWA flow للعميل**.

---

## 7. الخطوة التالية (للنقاش — لا تنفيذ)

أمام الـ user 5 خيارات لتحديد bucket التركيز للمرحلة الثانية:

| Bucket | الأثر | المخاطرة | الجهد التقديري |
|--------|------|----------|----------------|
| **A — Centralization Backlog** | عالٍ (يحسم RULE H1.1) | متوسط (يلمس صفحات حساسة) | 6-10 PRs صغيرة |
| **B — State Machine Hardening** | عالٍ (يمنع corruption) | منخفض (validators + invariants) | 3-5 PRs |
| **C — Permissions Defense** | متوسط (RULE 8 compliance) | منخفض (UI changes) | 4-6 PRs |
| **D — Customer Portal** | الأعلى استراتيجياً (vision-aligned) | متوسط (UX + auth) | 8-12 PRs |
| **E — Reconciliation Dashboards** | متوسط (visibility) | منخفض | 2-3 PRs |

**التوصية المعمارية (للنقاش):** ابدأ بـ **B** (state machine) + **A** (centralization) بالتوازي لأنهم يفتحون الباب لباقي الـ buckets بأمان. **D** هو الأعلى قيمة استراتيجية لكن يحتاج أساس مستقر أولاً.

---

**نهاية التشخيص.** كل bucket يحتاج موافقة + RULE 7/G10 module definition قبل أي كود.
