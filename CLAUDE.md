# CLAUDE.md — مرجع العمل المختصر (Lean)

> ملف مرجعي مُقصّص. التقارير التاريخية والـ audits والـ migration logs
> مؤرشفة في `docs/archive/`. النص الكامل للدستور والحوكمة (PC1-3, RULE 1-8,
> W1, C1, U1, V1, A1, C2, F1, S1, R1, X1, P1, M1, L1, G1-G10, H1-H3, N1, E1):
> `docs/archive/CLAUDE.full.md`.

---

## 0) BUSINESS DNA (الجوهر)

نظام **ERP داخلي** لشركة طباعة/تصميم/دعاية. يخدم **4 أطراف فقط**:
الشركة · العملاء · الموظفين · الموردين.

العقلية: `Internal ERP + Operational Excellence + Financial Discipline`.
**ليس** Marketplace ولا منصة عامة. أي feature تخدم طرفاً خامساً = مرفوضة.

فرع الإنتاج: `main`. الريبو: `engmah72-star/b2c-erp`.
سير العمل: feature branch → push → افتح PR → merge إلى `main`.

---

## 1) المعمارية — Layered

```
UI (HTML pages)  →  Central Core  →  Constants & Tokens
  (view فقط)        (actions/validators/engines)   (enums + CSS tokens)
```

**القاعدة الذهبية (L1):** الصفحة view فقط. لا business logic، لا workflow
transitions، لا financial rules، لا permission logic، لا magic strings داخل HTML.

### المحركات المركزية (Engines)
| Engine | الملف | المسؤولية |
|--------|------|-----------|
| **FSE** — Financial Sync Engine | `financial-sync-engine.js` | المصدر **الوحيد** للكتابة المالية (events + ledger + reversal) |
| **Finance Core** | `finance-core.js` / `core/order-math.js` | حسابات المشتقات المالية للقراءة (rem/dueByCo/totals) |
| **Returns Core** | `returns-core.js` | منطق المرتجعات (`returns_tickets`) |
| **Order State Machine** | `orders.js` | المراحل، الـ validators، الـ builders، الـ locking |
| **Central Actions** | `order-actions.js` (`orderActions.*`) | كل workflow action للأوردر |

### نمط الصفحة (Page Pattern)
- قراءة: `onSnapshot`/`getDoc` inline مسموح (مع `limit()` إلزامي).
- كتابة: **فقط** عبر `orderActions.*` أو `dispatchFinancialEvent` أو
  `advanceOrderStageWithLock`/`buildArchiveSpec` + atomic batch.
- صفحات معقدة لها `*-control-center.js` / `*-render.js` / `*-actions.js` منفصلة.

---

## 2) نموذج البيانات — Collections

**الكيان المركزي = `order`** (كل شيء يدور حوله: design/print/production/
shipping/collection/returns/files/financial events).

### Collections مالية (FSE فقط يكتب فيها)
`wallets` · `transactions_v2` · `financial_ledger` · `employee_payments` ·
`supplier_payments` · `shipping_settlements`

### Collections تشغيلية
`orders` · `clients` · `employees` · `supplier_orders` · `returns_tickets` ·
`payment_requests` · `reconciliations` · `shipping_pricing` · `design_items` ·
`tasks` · `notifications` · `conversations` · `audit_logs` · `master_lists`
(materials/finishings/...) · `client_followups` · `employee_*`
(evaluations/goals/incidents/leaves)

### مصادر الحقيقة (Single Source of Truth — RULE 1)
| الكيان | المصدر الوحيد |
|--------|--------------|
| أرصدة مالية | `wallets` |
| رصيد موظف | `employee_payments` |
| رصيد مورد | `supplier_payments` |
| رصيد عميل | `transactions_v2` + `orders` |
| رصيد الشحن | `shipping_settlements` |
| **حالة الطلب** | `order.stage` (المرجع الرسمي الوحيد) |
| **تواريخ/مدد/مسؤولية مراحل الأوردر** | `getStageResponsibilities()` (يشتقّ من `stageEnteredAt`/`stageCompletedAt`/`stageDeadline` + حقول الملكية) — **المرجع الوحيد**؛ `getStageDurations` wrapper فوقه. ممنوع حساب تواريخ/مدد المراحل مستقلاً في أي صفحة. |
| **كل تواريخ الأوردر (قراءة)** | `getOrderDates()` — المرجع الوحيد لأي تاريخ يخصّ الأوردر (إنشاء · مراحل · اعتماد · تنفيذ · شحن فرعي · أرشفة · `milestones` مرتّبة). يوحّد الصيغ ويزيل التكرار (`designDeadline`=`stageDeadline.design`، `archived`=`archivedAt`). الصفحات تقرأ التواريخ من هنا لا من الحقول المتفرّقة. |

حالات مساعِدة (لا تتعارض مع stage): `shipStage` · `approvalStatus` ·
`productStatus` (داخل `products[]`) · `returnStatus`.

ممنوع حساب أي رصيد داخل صفحة أو تخزين نسخة منه.

---

## 3) المنطق المالي (الصيغ المعتمدة)

المصدر: `core/order-math.js` + `finance-core.js`. كل القيم clamp ≥ 0.

```
disc       = order.discount
custShip    = customer shipping fee
paid        = total paid by customer

gross total = salePrice + custShip − disc            (إجمالي الأوردر)
remaining   = salePrice + custShip − disc − paid      (rem — المتبقي على العميل)
dueByCo     = salePrice + custShip − disc − paid      (شحن company: ما تُحصّله شركة الشحن)
```

- **rem** = ما على العميل. **dueByCo** = ما على شركة الشحن تحصيله نيابةً (شحن company).
- التسوية تُسجَّل في `shipping_settlements` (append-only؛ الإلغاء = `reversed:true`، لا حذف).
- كل حركة مالية = event عبر FSE → atomic batch → قيد في `financial_ledger`.

### Event Types (FSE)
```
CUSTOMER_PAYMENT  CUSTOMER_REFUND  VENDOR_PAYMENT  VENDOR_PAYMENT_REVERSAL
SALARY_PAYMENT  BONUS_PAYMENT  PENALTY  PAYROLL
SHIPPING_EXPENSE  SHIPPING_SETTLEMENT  SHIPPING_SETTLEMENT_REVERSAL
RETURN_LOSS  GENERAL_EXPENSE  WALLET_TRANSFER
```
event type جديد: عرّفه في `financial-sync-engine.js` (FE + handlers + reversal) أولاً.

---

## 4) الصلاحيات والأدوار

المصدر الوحيد: `core/permissions-matrix.js`
(`DEFAULT_PERMISSIONS` / `DEFAULT_CAPABILITIES` / `ROLE_PAGES`).
Helpers: `canDo(cap)` · `canSee(field)` · `hasPage(page)`.

**8 أدوار:** `admin` · `operation_manager` · `customer_service` ·
`graphic_designer` · `design_operator` · `production_agent` ·
`shipping_officer` · `wallet_manager`.

الدور = **default bundle من capabilities**. overrides فردية في
`users/{uid}.permissions.capabilities` (override يفوز).
ثلاث طبقات: Page (`ROLE_PAGES`) · Field (`canSee`) · Capability (`canDo`).
ممنوع `if(role==='admin')` hardcoded — استخدم `canDo(capability)`.

### Capabilities (15)
`view_orders` `create_orders` `edit_orders` `archive_orders` `view_clients`
`edit_clients` `upload_designs` `approve_designs` `manage_printing`
`manage_shipping` `view_financials` `manage_payments` `manage_returns`
`manage_employees` `system_settings`.

### حدود البيانات الحساسة (RULE 8)
- `client_phone`: يراه admin · operation_manager · customer_service ·
  shipping_officer فقط. غيرهم → `maskPhone()` (`010****567`).
- `design_data` (`designFiles[]`/`designFileUrl`/`printFinalUrl`/notes):
  يراه admin · CS · graphic_designer · design_operator · production_agent
  (الملف النهائي للطباعة). لا يراه ops/shipping/wallet.
- `supplierCost`/`priceCost`/`priceMargin`: admin · ops · wallet_manager.

دفاع متعدد الطبقات: UI (`canSee`) + `firestore.rules` (fail-closed) + audit.

### المداخل (PC3 — مدخل واحد لكل فئة)
- الموظفون/الإدارة: `login.html` → صفحة الـ landing حسب الدور (`ROLE_PAGES[role]`،
  صفحات standalone بالسايد بار الموحّد `<app-sidebar>`). **ده المدخل الفعلي الحالي.**
  - الـ Runtime Shell (`shell.html`، domains بالصلاحيات) **مش المدخل الافتراضي**
    حالياً — اتشال «قرار منتج» بسبب مشاكل موبايل (`login.html:routeUser`). لسه
    متاح بالـ URL المباشر لشغل مستقبلي، والرجوع reversible (سطر واحد في `routeUser`).
- العملاء: `client-login.html` → `client-portal.html`
- الموردون: `supplier-requests.html`

---

## 5) خريطة الملفات (أي صفحة/ملف لأي وحدة)

### Stable Core (تعديل يحتاج 2-reviewer + smoke tests)
`firestore.rules` · `financial-sync-engine.js` · `order-actions.js` ·
`orders.js` · `core/permissions-matrix.js` · `core/firebase-init.js` ·
`core/audit.js` · `core/idempotency.js` · `core/telemetry.js` ·
`core/projection.js` · `core/financial-invariants.js` · `shared.js`/`shared.css`

### وحدات تشغيلية (page + actions)
| الوحدة | الصفحة | الـ actions/logic |
|--------|--------|-------------------|
| الأوردرات | `order.html` | `orders.js` · `order-actions.js` |
| العملاء | `clients.html` | `client-actions.js` · `clients-data.js` · `clients-*.js` |
| التصميم | `design.html` / `design-workspace.html` | `design-control-center.js` · `design-render.js` |
| الاعتمادات | `approvals.html` | `approval-actions.js` · `core/approvals-utils.js` |
| الطباعة | `print.html` | `print-control-center.js` |
| الإنتاج | `production.html` | `production-actions.js` · `product-actions.js` |
| الشحن | `shipping.html` / `shipping-accounts.html` | `shipping-actions.js` · `shipping-service.js` · `shipping-pricing.js` |
| المرتجعات | `returns.html` | `returns-core.js` |
| الموظفون | `employees.html` / `employee-profile.html` | `employee-actions.js` · `core/employee-*.js` |
| الموردون | `suppliers.html` / `supplier-requests.html` | `supplier-actions.js` |
| الحسابات | `accounts.html` / `ledger.html` | `wallet-actions.js` · `finance-core.js` · `accounts-*.js` |
| التقارير | `reports.html` | `core/report-actions.js` · `core/reports-*.js` |
| الإعدادات | `settings.html` | `master-lists-actions.js` |
| الـ Inbox | `inbox.html` | `inbox-actions.js` · `core/inbox-utils.js` |
| Runtime Shell (متوقّف كمدخل افتراضي — PC3) | `shell.html` | `core/runtime-shell/*` · `core/domains/*/sidebar.js` |
| التحقق المالي | `validate-financial.html` | اختبار حي قبل أي push مالي |

البنية التحتية: `core/firebase-init.js` (FB config مرة واحدة) · `sw.js`
(Service Worker — bump CACHE عند نشر رئيسي) · `functions/index.js` (Cloud Functions).

---

## 6) Conventions نشطة (لازمة للكتابة الصحيحة)

1. **Zero direct UI writes (H1.1):** ممنوع في HTML `updateDoc/setDoc/addDoc/
   deleteDoc/writeBatch/runTransaction/dispatchFinancialEvent/addLedgerToBatch`.
   Allowlist: `orders.js`, `order-actions.js`, `financial-sync-engine.js`,
   `core/`, `functions/`, `tests/`.
2. **Atomic only (RULE 3):** كتابات مترابطة في `writeBatch` واحد أو
   `dispatchFinancialEvent`. لا `await` متسلسلة بين writes مالية.
3. **Action contract (H1.5):** كل action يُرجع
   `{ ok, errors, warnings, operationId?, idempotent?, pending? }`.
4. **Idempotency (H1.2):** financial actions مُغلَّفة بـ `withIdempotency()` (window 60s).
5. **Audit (H3):** كل mutation عبر `auditEntry()` من `core/audit.js`
   (date + actor + kind إلزامي — يـ throw لو ناقص). لا inline timeline push.
6. **Bounded listeners (G3):** كل `onSnapshot`/`getDocs` فيه `limit()`
   (استثناء: single doc ref).
7. **Constants (C2):** لا magic strings — استخدم `ORDER_STAGES`/`USER_ROLES`/
   `SHIPPING_METHODS`/`PAYMENT_TYPES`/`FE` من `orders.js`/`financial-sync-engine.js`.
8. **Validators (V1):** business rules في `orders.js`/`financial-sync-engine.js`
   فقط، صيغة `{ ok, errors, warnings }`. لا validation داخل HTML.
   الأساسية: `validateStageRequirements` · `buildStageAdvance`/`buildStageRevert`
   · `buildArchiveSpec` · `validateOrder` · `validatePayment` · `validateRefund`.
9. **UI tokens (U1):** ألوان/خطوط/مسافات من `shared.css` variables. صفر inline
   hex/style (إلا dynamic runtime).
10. **Storage (S1):** uploads عبر `core/storage-helpers.js`، path
    `{module}/{entityId}/{kind}/{ts}_{file}`. whitelist: images/pdf/design-source فقط.
11. **Navigation (N1):** تنقّل تشغيلي عبر `navigatePage()` لا `location.href`.
    لا `location.hash` لـ page state — استخدم query string.
12. **Firebase config (G2):** مصدر واحد (`core/firebase-init.js`). لا
    `initializeApp()` بـ config محلي في صفحة (استثناء: secondary app في employees).
13. **God pages (G5/H1.7):** ملف > 1500 سطر = حذر، > 2500 = freeze حتى
    decomposition plan.
14. **Module جديد (RULE 7/G10):** عرّف Entity/Events/Accounting/Dashboard/
    Reversal/Tenant/Permissions/Tests واحصل على موافقة قبل البدء.
15. **E1 (Evolution Safety):** كل تطوير incremental · backward-compatible ·
    feature-flagged · reversible · alongside-not-instead. لا big-bang، لا حذف
    legacy load-bearing.
16. **Multi-tenant (G7 — target):** ملفات الكتابة الأساسية لا تكتب `tenantId`
    بعد. عند تفعيله: كل doc يكتب `tenantId` وكل query يفلتر به.
17. **Order Responsibility (R) — الوقت + المسؤول:** مفيش أوردر/انتقال بدون
    **مسؤول + تاريخ**، ومفيش طابع زمني بلا مُنفِّذ معروف. المسؤول الأدنى =
    `createdBy`؛ التاريخ = `createdDate`/`createdAt` أو `stageEnteredAt`.
    مفروضة عبر `validateOrderResponsibility()` (حارس الإنشاء في
    `orderActions.createOrder` + داخل `validateOrder`). كل من
    `buildStageAdvance`/`buildStageRevert`/`buildArchiveSpec`:
    (أ) يرفض العملية بلا مُنفِّذ (`userId`/`userName`)، (ب) يضمن مسؤولاً للمرحلة
    الجديدة/المرتدّ إليها (المختار > المالك الحالي > مُنفّذ العملية). كل طابع
    زمني للشحن الفرعي يحمل `*By` (مَن نفّذه).

> للتفاصيل الكاملة لأي قاعدة (نصها الأصلي + جداول القبول + أمثلة) راجع
> `docs/archive/CLAUDE.full.md`.
