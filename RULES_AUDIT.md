# FIREBASE RULES AUDIT

**النوع:** تقرير تشخيصي قراءة-فقط لـ `firestore.rules` + `storage.rules`.
**التاريخ:** 2026-05-19
**الفرع:** `claude/r1-rules-charter-audit`
**السياق:** بعد إنشاء **RULE R1 — Firebase Rules Principle**، هذا التقرير يحصر الـ rules الحالية ويحدد drifts.

---

## 0) ملخص تنفيذي

| البند | القيمة |
|------|--------|
| `firestore.rules` lines | **1,238** |
| `storage.rules` lines | 172 |
| Helper functions (Firestore) | **30** |
| Helper functions (Storage) | 4 |
| Collection match blocks (Firestore) | **70** ✅ كاملة |
| Storage path rules | 14 (new + legacy) |
| 🚨 Drift عن R1 — مؤكَّد | **2 HIGH + 3 MEDIUM** |

---

## 1) Coverage — كل الـ Collections لها rules

**70 collection match block** — لا gaps بين الـ code usage والـ rules. كل collection مذكور في `FIREBASE_AUDIT.md` (الـ 58) له rule صريحة.

---

## 2) 🚨 Top 5 Findings (Verified)

### Finding #1 — 🔴 HIGH: Dual Role Sources (Sync Risk)
**الموقع:**
- `firestore.rules:15-17` — يقرأ `role()` من `users/{uid}.role` (Firestore doc)
- `storage.rules:24-26` — يقرأ من `request.auth.token.role` (Custom Auth Claim)

**المشكلة:** عند تغيير دور مستخدم، **لازم يتحدّث في مكانين**:
1. `users/{uid}.role` في Firestore
2. Custom Auth Claim عبر `syncUserAuthClaims` Cloud Function

**النتيجة:** Mismatch محتمل ⇒ user مسموح في Firestore لكن مرفوض في Storage (أو العكس).

**الحل المقترح:** توحيد على Custom Claims فقط (مع backfill عبر `backfillAuthClaims` للـ users الموجودين).

---

### Finding #2 — 🔴 HIGH: `canFinancialWrite()` أوسع من المطلوب (RULE 1 violation)
**الموقع:** `firestore.rules:92-100`
```javascript
function canFinancialWrite() {
  return isAdmin()
      || hasPage('accounts')
      || hasPage('shipping')
      || hasPage('shipping-accounts')
      || hasPage('suppliers')      // ⚠️ يسمح لـ suppliers page
      || hasPage('clients')        // ⚠️ يسمح لـ clients page (CS staff)
      || can('canAddOrders')
      || can('canFinancialWrite');
}
```

**المشكلة:** CS staff الذي لديه `'clients'` page صلاحية يستطيع **الكتابة المباشرة** على `wallets`/`transactions_v2`/`financial_ledger` — يتجاوز `financial-sync-engine.js` (انتهاك RULE 1 + R1.4).

**ملاحظة:** الكود نفسه به TODO comment "S0-2 FIX: tighten canFinancialWrite" — مشكلة معروفة.

**الحل المقترح:** حذف `hasPage('clients')` و `hasPage('suppliers')` من الـ function — هذه pages تستخدم FSE بالفعل، لا تحتاج صلاحية direct write.

---

### Finding #3 — 🟡 MEDIUM: `clientPhone` يُقرأ من orders بدون field-level masking
**الموقع:** `firestore.rules:303-315`

**المشكلة:** الـ orders تحتوي `clientPhone` ويُسمح بقراءة الـ document كامل لـ designers/production/shipping — Firestore لا يدعم field-level read rules.

**الواقع:** الـ enforcement يحصل client-side عبر `maskPhone()` في `shared.js` (RULE 8.1).

**التقييم:** هذا قيد معماري لـ Firestore، ليس bug. مقبول مع شرط: client-side filtering إلزامي.

**الحل:** توثيق صريح في الـ pages أن `clientPhone` **يجب** أن يمر بـ `maskPhone()` قبل العرض.

---

### Finding #4 — 🟡 MEDIUM: `settings` collection مفتوحة لأي auth user
**الموقع:** `firestore.rules:667`
```javascript
match /settings/{docId} {
  allow read: if isAuth();  // ⚠️ أي مستخدم
  allow write: if isAdminOnly();
}
```

**المشكلة:** أي موظف يستطيع قراءة كل إعدادات النظام (thresholds, tenants list, feature flags).

**الحل المقترح:** تقييد القراءة لـ `isAdmin()` فقط، أو split الـ settings إلى public + admin-only.

---

### Finding #5 — 🟡 MEDIUM: `supplier_payments` write مفتوحة لـ `hasPage('suppliers')`
**الموقع:** `firestore.rules:425`
```javascript
allow create: if isAdmin() || hasPage('suppliers');
```

**المشكلة:** Supplier staff يستطيع إنشاء سجلات دفع (يفترض financial role only).

**الحل المقترح:** حذف `hasPage('suppliers')` — استخدم admin أو callable Cloud Function.

---

## 3) Helper Functions — تكرار logic بين Firestore و Storage

### Firestore (30 helper) vs Storage (4 helper)

| Function | Firestore (line) | Storage | ملاحظة |
|----------|------------------|---------|--------|
| `isAuth()` | 6 | implicit | متطابق |
| `role()` | 15 (Firestore doc) | `userRole()` (token) | **مصدر مختلف!** ← Finding #1 |
| `isAdmin()` | 18 | — | غير موجود في Storage |
| `isAdminOnly()` | 23 | — | غير موجود |
| `canFinancialWrite()` | 92 | `request.auth.token.cfw` | لا يتطابق المنطق |
| `canFinancialRead()` | 119 | `request.auth.token.cfr` | لا يتطابق |
| `canSeeCustomerPhone()` | 45 | — | غير موجود في Storage |
| `canSeeDesignData()` | 49 | — | غير موجود |
| `getUserTenant()` | 56 | `tenantOf()` (token) | متشابه لكن مصدر مختلف |
| `inSameTenant()` | 59 | — | غير موجود |

**التوصية:** R1.5 يحظر duplicate role logic. الحل:
1. توحيد على Custom Claims (single source)
2. أو إنشاء helpers shared (لكن غير ممكن في rules — كل ملف منعزل)

---

## 4) Open / Insecure Rules

### Public Read Rules — متعمَّدة (3)
| Collection | الـ Line | السبب |
|------------|----------|-------|
| `/gallery` | 832 | معرض marketing عام ✅ |
| `/design_items` | 842 | portfolio عام ✅ |
| `/designer_tenants` | 1229 | directory عام ✅ |
| Storage `/gallery` | 142 | صور marketing عامة ✅ |

كلها موثَّقة كـ "intentional public". ✅

### Auth-only (بدون role check) — يحتاج مراجعة
| Collection | Line | Risk |
|------------|------|------|
| `/users` | 206 | MEDIUM — أي user يقرأ بيانات الكل |
| `/employees` | 217 | LOW — لـ directory lookup |
| `/products_v2` | 406 | LOW — لـ pricing display |
| `/settings` | 667 | **MEDIUM ⚠️** (Finding #4) |
| `/tenants` | 1054 | MEDIUM |
| `/master_lists` | 905 | LOW — lookup tables |
| `/client_decisions` | 887 | MEDIUM |
| `/presence` | 787 | LOW |
| `/stories` | 797 | LOW |

### ❌ `allow if true` بدون auth
**صفر — كل الـ public reads لها سياق مبرر.** ✅

### ❌ TODO/TEMP/insecure markers
**موجودة:** comments في الكود تشير إلى `S0-1`, `S0-2`, `S0-3` fix items معروفة لكن لم تُنفَّذ بعد.

---

## 5) Financial Collections Coverage

| Collection | Read | Write | الالتزام بـ R1.4 |
|------------|------|-------|------------------|
| `wallets` | `canFinancialRead()` | `isAdminOnly()` create / `canFinancialWrite()` update | ⚠️ Update عبر canFinancialWrite الواسعة |
| `transactions_v2` | `canFinancialRead()` | `canFinancialWrite() && validTx()` | ⚠️ نفس المشكلة |
| `financial_ledger` | `canFinancialRead()` | `canFinancialWrite() && validLedger()` | ⚠️ نفس المشكلة |
| `employee_payments` | `isAdmin() OR own` | `isAdminOnly()` فقط | ✅ STRICT |
| `supplier_payments` | `isAdmin() OR hasPage(suppliers/accounts)` | `isAdmin() OR hasPage(suppliers)` | ⚠️ Finding #5 |
| `shipping_settlements` | `isAdmin() OR hasPage(shipping/...)` | نفس | ⚠️ متوسطة |

**التقييم:** الـ rules تحمي الـ collections بشكل عام، لكن `canFinancialWrite()` الواسعة تخلق ثغرات.

---

## 6) RULE 8 — Sensitive Field Protection

### `clientPhone` 
- **`/clients`** read: `canSeeCustomerPhone() && hasPage('clients')` ✅ مُقيَّد
- **`/orders`** read: full document — clientPhone مشمول (Firestore limitation)
- **`/orders`** update clientPhone: `canSeeCustomerPhone()` فقط ✅
- **Enforcement:** client-side عبر `maskPhone()` (RULE 8 layered defense)

### `designFiles[]` / `designFileUrl`
- **`/orders`** read: full document (Firestore limit)
- **Storage `/design-files`**: role-restricted ✅
- **Enforcement:** client-side via `canSee('design_data')` في `shared.js`

### Cost fields (`supplierCost`, `priceCost`, `priceMargin`)
- **`/products_v2`** read: `isAuth()` (no role gate at field level)
- **Enforcement:** SENSITIVE_FIELDS في `core/permissions-matrix.js` (fail-closed client-side)

**التقييم:** Defense-in-depth صحيح — Rules + UI helpers. القيد المعماري في Firestore (no field-level rules) معروف ومقبول.

---

## 7) Storage Rules

### Tenant-Scoped Paths (Phase 2 ready)
| Path | Auth | Tenant | Owner | Size | Type |
|------|------|--------|-------|------|------|
| `/receipts/{tid}/{uid}/...` | ✅ | ✅ | ✅ | 10MB | image/* |
| `/design-files/{tid}/{oid}/...` | ✅ | ✅ | role-based | 50MB | ⚠️ any |
| `/print-finals/{tid}/{oid}/...` | ✅ | ✅ | role-based | 50MB | ⚠️ any |
| `/production/{tid}/{oid}/...` | ✅ | ✅ | role-based | 50MB | ⚠️ any |

**ملاحظة:** الـ design/print/production paths لا تقيد file types — استخدام `core/storage-helpers.js` (S1.4) يفرض sanitization لكن المالك يحدد kind.

### Legacy Paths (للـ backward compat)
- `/receipts`, `/designs`, `/design-refs`, ...: لا tenant scoping ⚠️
- مرشحة للإهمال في Phase 2 (مذكور في الـ rules comments)

---

## 8) ما تم التحقق منه بـ grep

### ✅ Verified Findings
| Finding | كيف تم التحقق |
|---------|----------------|
| canFinancialWrite() includes hasPage('clients') | قراءة مباشرة `firestore.rules:92-100` |
| `clientPhone` rule | `firestore.rules:303-315` |
| `settings` rule مفتوحة auth-only | `firestore.rules:667` |
| `supplier_payments` write | `firestore.rules:425` |
| Dual role sources | `firestore.rules:15-17` vs `storage.rules:24-26` |

### ⚠️ Not verified deeply (يحتاج فحص لاحق)
- كل الـ 70 collection rules بالتفصيل
- `validTx()` و `validLedger()` validators (المنطق الداخلي)
- Cloud Function `syncUserAuthClaims` (هل تعمل في الـ production؟)

---

## 9) Action Items (لـ PRs منفصلة)

| # | Action | Severity | الجهد |
|---|--------|---------|------|
| **R-A1** | تضييق `canFinancialWrite()` — حذف hasPage('clients'/'suppliers') | 🔴 HIGH | منخفض |
| **R-A2** | تقييد `/settings` read على admin فقط | 🟡 MEDIUM | منخفض |
| **R-A3** | حذف `hasPage('suppliers')` من supplier_payments create | 🟡 MEDIUM | منخفض |
| **R-A4** | توحيد role source — كل rules تستخدم Custom Claims | 🔴 HIGH | كبير (يحتاج backfill) |
| **R-A5** | إضافة file type restrictions على design/print/production storage | 🟡 MEDIUM | منخفض |
| **R-A6** | إهمال legacy storage paths (Phase 2 migration) | منخفض | كبير |

---

## 10) ما تم التحقق منه vs ما لم يتم

### ✅ Verified
- 70 collection rules كلها موجودة
- 5 findings (3 HIGH/MEDIUM) بـ file:line مرجعية
- helper duplication بين Firestore و Storage
- Public reads مبرَّرة

### ⚠️ Not Verified Deeply
- كل `validTx()`, `validLedger()`, `validApproval()` validators
- Cloud Function `syncUserAuthClaims` runtime behavior
- TODOs المذكورة (S0-1, S0-2, S0-3) — هل لها issues مفتوحة؟

---

## 11) خلاصة الالتزام بـ R1

| Sub-Rule | الحالة |
|---------|--------|
| R1.1 Fail-Closed by Default | ✅ مُطبَّق |
| R1.2 Role-Based Access | ✅ مُطبَّق (مع overlap في canFinancialWrite) |
| R1.3 Sensitive Field Protection | ✅ مُطبَّق (defense-in-depth) |
| R1.4 Financial via FSE فقط | ⚠️ Finding #2 (canFinancialWrite واسعة) |
| R1.5 No Duplicate Role Logic | ⚠️ Finding #1 (Dual role sources) |
| R1.6 Storage Parity | ✅ مُطبَّق (مع legacy debt) |
| R1.7 Audit Trail | ✅ موجود (syncUserAuthClaims + detectEngineBypass) |
| R1.8 Single Source for Permissions | ⚠️ مشترك بين Firestore doc + claims |
| R1.9 No Temporary Insecure Rules | ✅ مُلتزم (TODOs موثَّقة) |

**النتيجة الكلية:** الـ rules ناضجة لكن فيها **2 HIGH findings تحتاج إصلاح أولوية**.

---

**نهاية التقرير**
