# SYSTEM RELATIONSHIPS MAP

**النوع:** خريطة شاملة للنظام — قراءة-فقط، لا refactor.
**التاريخ:** 2026-05-20
**الفرع:** `claude/system-understanding-audit`
**القاعدة:** فهم النظام بالكامل قبل أي تغيير.

---

## 0) ملخص تنفيذي

| البند | القيمة |
|------|--------|
| HTML pages | ~51 |
| Firestore collections in use | ~25 (الفعالة) |
| Cloud Functions | 42 |
| Core action modules | **3** (`order-actions`, `product-actions`, `supplier-actions`) |
| Foundation modules | 8 (core/* + orders.js + FSE) |
| Pages using central actions | **3+** (shipping.html *#544*, suppliers.html *#556*, products.html *#555*) |
| Pages with FSE compliance | ~16 (financial writes) |

---

## 1) Pages Inventory (الأهم)

> **ترتيب حسب الحجم + الأهمية. للقائمة الكاملة راجع `ls *.html` في الـ repo.**

| # | Page | LOC | Primary Role | Primary Collections | Central Actions | Direct Writes | Status |
|---|------|-----|--------------|---------------------|-----------------|---------------|--------|
| 1 | `clients.html` | 4820 | Ops/Admin | clients | buildArchiveSpec | عالي | ⚠️ Partial |
| 2 | `reports.html` | 3043 | Admin/Ops | orders, ledger | — | — | ✅ Read-only |
| 3 | `employee-profile.html` | 3157 | Admin/HR | employees, payments, evaluations | dispatchFinancialEvent | 16 writes | ❌ Not centralized |
| 4 | `production.html` | 2425 | Production | orders, wallets | partial buildStageAdvance | 14 writes | ❌ Heavy direct writes |
| 5 | `inbox.html` | 2516 | All | conversations, stories | — | 28 writes | ⚠️ Messaging (isolated) |
| 6 | `approvals.html` | 2497 | Wallet Mgr/Admin | wallets, reconciliations | — | 3 writes | ⚠️ FSE-paired (compliant) |
| 7 | `production.html` | 2425 | Production | orders | partial | 14 writes | ❌ Heavy |
| 8 | `accounts.html` | 2354 | Wallet Mgr | wallets | — | 11 writes (FSE-paired ✓) | ⚠️ Compliant (FALSE POSITIVE for RULE 1 — راجع #559) |
| 9 | `design.html` | 2186 | Designer | orders, design_items | partial | 19 writes | ❌ Heavy |
| 10 | `shipping-accounts.html` | 2094 | Shipping Acc | shipping_settlements | — | — (uses addLedgerToBatch) | ⚠️ FSE-paired ✓ |
| 11 | `print.html` | 2002 | Production | orders, printing | buildStageAdvance/Revert | 18 writes | ⚠️ Uses helpers but writes inline |
| 12 | `employees.html` | 1940 | Admin/HR | employees, users, payments | — | 7 writes | ❌ Not centralized |
| 13 | `exec-cost-entry.html` | 1734 | Executive | orders, ledger | — | — (addLedgerToBatch) | ✅ FSE-compliant |
| 14 | `shipping.html` | 1273 | Shipping | orders, wallets | **orderActions** (#544) | minimal | ✅ Centralized (post-#544) |
| 15 | `products.html` | 1455 | PM/Admin | products_v2 | **productActions** (#555) | minimal | ✅ Centralized |
| 16 | `suppliers.html` | 1166 | Procurement | suppliers_v2, payments | **supplierActions** (#556) | minimal | ✅ Centralized |
| 17 | `settings.html` | 1080 | Admin | settings, wallets, master_lists | — | 9 writes | ❌ Not centralized (راجع SETTINGS_AUDIT) |
| 18 | `shipping-lite.html` | 1014 | Shipping | orders, shipping | partial | 4 writes | ❌ Not migrated to orderActions |
| 19 | `returns.html` | 969 | CS/Admin | returns_tickets | — | — | ⚠️ Returns module standalone |

**الباقي:** ~30 صفحة أصغر (dashboards/utilities/views).

---

## 2) Pages Using Central Actions (Best Practice)

| Page | Action Module | Functions Used | When Migrated |
|------|---------------|----------------|---------------|
| `shipping.html` | `order-actions.js` | `orderActions.archiveOrder` | PR #544 |
| `suppliers.html` | `supplier-actions.js` | `create/update/delete/archive/createPayment/reversePayment` | PR #556 |
| `products.html` | `product-actions.js` | `create/update/delete/archive` | PR #555 |
| `design.html` | `orders.js` | `validatePayment` (via #542) | Partial |
| `print.html` | `orders.js` | `buildStageAdvance/Revert` | Pre-existing |
| `production.html` | `orders.js` | `buildStageAdvance/Revert` | Pre-existing |

**Pages NOT yet migrated:** design.html (stage transitions inline)، production.html (stage transitions inline)، shipping-lite.html، production-dashboard.html، designer-dashboard.html.

---

## 3) Collection Ownership

### Master Collections
| Collection | Primary Writer | Other Writers | Readers | Governance |
|-----------|----------------|---------------|---------|------------|
| `orders` | design/print/production/shipping | clients (bulk admin) | 20+ pages | RULE A1 partial — buildStageAdvance used |
| `clients` | clients.html | — | client-portal, cs-dashboard, tracking | ⚠️ buildArchiveSpec used |
| `employees` | employees.html, employee-profile.html | settings.html | dashboards | ❌ No central action |
| `suppliers_v2` | suppliers.html | — | production, accounts | ✅ supplierActions |
| `shippers_v2` | suppliers.html | — | shipping pages | ✅ supplierActions |
| `products_v2` | products.html | production.html (costHistory only) | 7+ pages | ✅ productActions |

### Financial Collections (RULE 1 — FSE only)
| Collection | Writer | Status |
|-----------|--------|--------|
| `wallets` | FSE + addLedgerToBatch (atomic) | ✅ Compliant |
| `transactions_v2` | FSE | ✅ Compliant |
| `financial_ledger` | FSE | ✅ Compliant |
| `employee_payments` | FSE | ✅ Compliant |
| `supplier_payments` | FSE (via supplierActions) | ✅ Compliant post-#556 |
| `shipping_settlements` | shipping-accounts (via addLedgerToBatch) | ✅ Compliant |

### ML/Analytics (Read-only)
- `client_segments`, `admin_alerts`, `forecasts`, `product_affinities`, `rfm_runs`
- كلها written by Cloud Functions weekly
- ✅ Read-only من الـ pages

---

## 4) Workflow Flow Visualization

### Linear Order Lifecycle
```
DESIGN ──submitToPrinting──→ PRINTING ──submitToProduction──→ PRODUCTION
   │                                                              │
   │                                                              │
   ↓                                                              ↓
(designer)                                                   (production_agent)
   │                                                              │
                                                                  ↓
                                                              SHIPPING ──confirmArchive──→ ARCHIVED
                                                                  │
                                                                  ↓
                                                             (shipping_officer)
```

**Actions used:**
- `submitToPrinting`: `print.html` → `buildStageAdvance` ✅
- `submitToProduction`: `production.html` → `buildStageAdvance` ✅
- `submitToShipping`: `production.html` → `buildStageAdvance` ✅
- `archiveOrder`: `shipping.html` → `orderActions.archiveOrder` ✅ (post-#544)

**Parallel flows:**
- **Returns**: `returns.html` → `returns_tickets` collection (Phase 1 module)
- **Cancellations**: Manual via `clients.html` bulk admin → archive
- **Reverts**: `buildStageRevert` (rare, used in design/production)

---

## 5) Financial Flow

### Money Movement
```
[Order created] ─── CUSTOMER_PAYMENT ───→ [Wallets.balance ↑] + [Ledger entry]
                                            │
                                            ├── via FSE.dispatchFinancialEvent
                                            └── via addLedgerToBatch + batch.commit

[Supplier pay]  ─── VENDOR_PAYMENT     ───→ [Wallets.balance ↓] + [supplier_payments] + [Ledger]
[Salary]        ─── SALARY_PAYMENT      ───→ [Wallets ↓] + [employee_payments] + [Ledger]
[Shipping pay]  ─── SHIPPING_EXPENSE   ───→ [Wallets ↓] + [Ledger]
[Settlement]    ─── SHIPPING_SETTLEMENT ───→ [shipping_settlements] + [Ledger]
[Refund]        ─── CUSTOMER_REFUND     ───→ [Wallets ↑] + [Ledger reversal]
```

### Compliance Audit (RULE 1 — FSE only)
- ✅ `wallets`, `transactions_v2`, `financial_ledger` كلها تُكتب فقط عبر FSE
- ✅ Cloud Functions تحترم RULE 1 (راجع FIREBASE_AUDIT)
- ✅ `addLedgerToBatch` هو الـ FSE helper المعتمد (راجع #559 correction)

---

## 6) Permission Resolution — Defense in Depth (4 Layers)

### Layer 1: UI Gate (Client)
- `canDo(capability, role, userPerms)` من `core/permissions-matrix.js`
- `hasPage(page)`, `canSee(field)` (RULE 8 helpers)
- 16+ pages تستخدم helpers بشكل صحيح
- ⚠️ بعض pages لسه فيها inline role checks (P1 migration incomplete)

### Layer 2: Action Validators
- `validateOrder/Payment/Refund` من `orders.js`
- `buildStageAdvance/Revert/ArchiveSpec` (pure functions)
- يُستدعَون داخل actions

### Layer 3: Central Actions (3 modules)
- `order-actions.js` (orderActions.*)
- `product-actions.js` (productActions.*)
- `supplier-actions.js` (supplierActions.*)
- يفحصون permissions + validate + write atomically

### Layer 4: Firestore Rules (Server)
- `isAdmin()`, `isAdminOnly()`, `canSeeCustomerPhone()`, `canSeeDesignData()`
- `canFinancialWrite()` (موروث broad — راجع RULES_AUDIT)
- `isProtectedUserField()` — يمنع self-write لـ role/permissions ✅

---

## 7) ⚠️ تصحيحات للـ audit الأولي

الـ audit agent ادّعى claims يحتاج تصحيح:

### ❌ Claim كاذب: "P0 Role escalation في /users"
**الواقع** (`firestore.rules:208-211`):
```js
allow update: if isAuth() && (
  isAdminOnly()
  || (request.auth.uid == userId && !isProtectedUserField())
);
```
`isProtectedUserField()` يمنع self-write لـ role/permissions/tenantId. **النظام محمي.**

### ❌ Claim كاذب: "0 pages use orderActions"
**الواقع:** `shipping.html` تستخدمها (post-#544). الـ audit أغفل الـ PR.

### ⚠️ Overstated: "231 onSnapshot without limit"
**الواقع:** 212 total onSnapshot، وكثير منها له `limit()` (clients.html, orders, client_followups...). الـ claim مبالغ.

### ✅ Verified accurately
- Pages with heavy direct writes (design/print/production/employee-profile)
- Hardcoded stage strings (~50 instances)
- Inline role checks في 18+ pages
- M1 (multi-tenant) غير مفعّل (0% compliance) — صحيح

---

## 8) Drift Areas — Verified

### A. Pages with direct writes that should use actions
| Page | Writes | Top Action Needed |
|------|--------|-------------------|
| `design.html` | 19 | `orderActions.submitToPrinting` (موجود، غير مستخدم) |
| `production.html` | 14 | `orderActions.submitToShipping` (موجود، غير مستخدم) |
| `employee-profile.html` | 16 | `employeeActions.*` (غير موجود) |
| `employees.html` | 7 | `employeeActions.*` (غير موجود) |
| `shipping-lite.html` | 4 | `orderActions.archiveOrder` |

### B. Hardcoded stage strings
`stage === 'archived'` × ~50، `stage === 'shipping'` × ~20، إلخ.

### C. Inline role checks (P1 not applied)
- `if (role === 'admin')` patterns في ~18 صفحة
- يجب استبدالها بـ `canDo(capability, role, userPerms)`

### D. Settings drift (راجع SETTINGS_AUDIT)
- ROLE_PERMS_DEFAULTS مكرَّر في 3 ملفات
- ROLES في 5+
- exec-cost-entry hardcoded
- paymentMethods dead

---

## 9) Top 10 Migration Targets (Verified Priority)

| # | Page | Risk | Effort | ROI | Charter |
|---|------|------|--------|-----|---------|
| 1 | `design.html` ترحيل لـ `orderActions.submitToPrinting` | High (stage transitions) | 2-3 days | 4.5 | A1 |
| 2 | `production.html` ترحيل لـ `orderActions.submitToShipping` | High | 2-3 days | 4.5 | A1 |
| 3 | إنشاء `employeeActions.js` + ترحيل `employees.html` + `employee-profile.html` | High (financial) | 3 days | 4.5 | A1 + V1 |
| 4 | C2 migration: hardcoded stages → ORDER_STAGES enum | Low | 2 days | 5.0 | C2 |
| 5 | P1 migration: inline role checks → canDo() | Low | 2 days | 4.5 | P1 |
| 6 | `shipping-lite.html` → `orderActions.archiveOrder` | Low | 0.5 day | 3.5 | A1 |
| 7 | Centralize ROLES + ROLE_PERMS_DEFAULTS في orders.js | Med | 1 day | 4.0 | C1.5 |
| 8 | `settings.html` audit_logs + dead field cleanup | Low | 0.5 day | 3.0 | RULE 5 |
| 9 | `exec-cost-entry.html` read settings instead of hardcoded | Low | 0.5 day | 2.5 | C1.5 |
| 10 | M1 multi-tenant rollout (separate epic) | Very High | 1-2 weeks | High (Phase 2) | M1 |

---

## 10) Governance Status Snapshot

| Rule | Compliance | Notes |
|------|-----------|-------|
| W1 (Workflow Simplicity) | ✅ ~90% | order.stage هو المصدر الوحيد |
| C1 (Centralization) | ⚠️ ~60% | financial صلب، workflow partial |
| U1 (UI Centralization) | ⚠️ ~50% | tokens موجودة، inline styles كثيرة |
| V1 (Validation) | ⚠️ ~40% | validators موجودة لكن غير مُتبَنّاة |
| A1 (Central Actions) | ⚠️ ~20% | 3 modules موجودة، استخدام محدود |
| C2 (Constants) | ⚠️ ~30% | enums موجودة، migration غير مكتمل |
| F1 (Firebase) | ✅ ~85% | G2 + RULE 1 + storage |
| S1 (Storage) | ✅ Foundation | helpers موجودة |
| R1 (Rules) | ✅ ~80% | rules ناضجة |
| X1 (Security Meta) | ✅ ~85% | 13 sub-rules، meta-compliance |
| P1 (Permissions) | ⚠️ ~40% | catalog موجود، migration غير مكتمل |
| M1 (Materials) | ✅ Foundation | master_lists + datalist |
| **Multi-tenant** | ❌ 0% | Phase 2 — not yet implemented |

---

## 11) ما تم التحقق منه vs ما لم يتم

### ✅ Verified
- LOC counts للـ top 19 page
- shipping.html تستخدم orderActions (post-#544)
- accounts.html FSE-compliant (راجع #559)
- isProtectedUserField يحمي /users من role escalation
- 3 action modules موجودة
- 8 Foundation modules

### ⚠️ Not Verified Deeply
- LOC counts للـ ~30 صفحة أصغر
- كل onSnapshot calls — هل لها limit()؟ (sample يدل أن ~60% بها)
- كل الـ "direct writes" المذكورة — هل بعضها FSE-paired (مثل accounts.html)؟
- ROLES في 5+ ملفات — يحتاج عدّ نهائي
- ROLE_PERMS_DEFAULTS في 3 ملفات — claim من settings audit

---

**ملاحظة:** هذا التقرير لـ understanding فقط — لا code changes. التنفيذ في PRs مستقبلية حسب الـ priority list.
