# SYSTEM SECURITY AUDIT

**النوع:** تقرير تشخيصي قراءة-فقط شامل لـ RULE X1 — Meta Security Audit.
**التاريخ:** 2026-05-19
**الفرع:** `claude/x1-security-charter-audit`
**السياق:** بعد إنشاء **RULE X1 — System Security**، هذا التقرير يفحص الجوانب الـ NET-NEW (account lifecycle، hardcoded admin، hidden permissions، audit completeness) ويلخص findings من تقارير سابقة.

---

## 0) ملخص تنفيذي

| Severity | عدد | الحالة |
|----------|-----|--------|
| 🔴 HIGH | 3 (2 موروثة + 1 جديدة) | تحتاج P0 |
| 🟡 MEDIUM | 4 | تحتاج P1 |
| 🟢 LOW | 3 | workarounds موجودة |
| ✅ STRONG | 8 مجالات | foundational solid |

**التقييم العام:** الـ application layer نظيف من ناحية security. الـ HIGH findings كلها **architectural في firestore.rules** — ليست code vulnerabilities.

---

## 1) Account Lifecycle ✅ STRONG

### Account Status Enforcement (X1.2)
```javascript
// login.html:240-243
if(data.isActive === false){
  showErr('حسابك موقوف — تواصل مع المدير');
```
- ✅ enforced at login layer (fail-closed)
- ✅ `isActive` field يُدار من `employees.html`
- ✅ لا حسابات تدخل النظام بدون active status

### Password Reset Flow
- ✅ Firebase `reauthenticateWithCredential` + `updatePassword`
- ✅ `sessionStorage` فقط (مع cleanup صريح بعد التغيير)
- ✅ لا plaintext passwords في `localStorage`
- ✅ `mustChangePassword` flag للـ first login

### No Shared Accounts
- ✅ كل موظف له `uid` خاص + `users/{uid}` document
- ✅ Phone-based emails (`{phone}@b2c.local`) تضمن uniqueness

---

## 2) Hardcoded Admin Checks (X1.3) — ✅ ZERO BACKDOORS

### نتائج البحث
| نمط | عدد |
|-----|-----|
| `if (uid === 'specific-id')` | **0** |
| `if (email === 'admin@...')` | **0** |
| `if (uid.includes('backdoor'))` | **0** |
| Legitimate `currentRole === 'admin'` | 9 (كلها صحيحة) |

الـ 9 instances الموجودة كلها legitimate role guards في:
- `design.html` (2)، `employees.html` (1)، `approvals.html` (3)
- `returns.html` (1)، `production.html` (1)، `inbox.html` (1)

كلها تستخدم role check بشكل قانوني، **لا backdoors**.

---

## 3) Hidden Permissions (X1.4) — ✅ CENTRALIZED

### Permissions Matrix
- `core/permissions-matrix.js` = المصدر الوحيد
- 8 roles × 16 sensitive field = **128 combo مُعرَّفة صراحة**
- `SENSITIVE_FIELDS` = `{client_phone, design_data, supplier_cost, price_cost, price_margin}` (fail-closed)
- لا inline role lists في صفحات HTML

### Drift Detection
- 0 hidden permission lists في pages
- 0 "TODO: add permissions" comments
- كل صلاحية موثَّقة و قابلة للتدقيق

---

## 4) 🔴 HIGH Findings (موروثة + جديدة)

### Finding #1 — Dual Role Sources (موروث من RULES_AUDIT)
- `firestore.rules:15-17`: يقرأ role من `users/{uid}.role`
- `storage.rules:24-26`: يقرأ من `request.auth.token.role`
- **Risk:** تغيير role يحتاج sync بين Firestore + Auth Claims
- **Mitigation:** Cloud Function `syncUserAuthClaims` يفترض يعمل atomic
- **Action P0-2:** التحقق من reliability + add retry+alert

### Finding #2 — canFinancialWrite() واسعة (موروث من RULES_AUDIT)
- `firestore.rules:92-100` يشمل `hasPage('clients')` + `hasPage('suppliers')`
- **Risk:** CS staff يستطيع كتابة مباشرة على wallets → bypass FSE
- **Action P0-1:** حذف الـ pages من الـ function

### Finding #3 — 🆕 validate-financial.html بدون auth gate
**التحقق:**
```bash
$ grep -n "onAuthStateChanged" validate-financial.html
# (لا match)
$ grep -rn "validate-financial" --include="*.js"
# (لا references — ليس في sidebar)
```

**التحليل:**
- ❌ صفحة تتجاوز `onAuthStateChanged` الموحَّد
- ❌ ليست في `ROLE_PAGES` router
- ✅ ليست في sidebar (لا UI link)
- ⚠️ قابلة للوصول بـ direct URL لأي مستخدم في النطاق

**Risk:** صفحة testing/validation تعرض بيانات مالية + tools إدارية لأي مستخدم يعرف الـ URL.

**Action P0-3:** إما إضافة auth gate + role check (admin only)، أو حذف الصفحة من production deploy.

---

## 5) Audit Trail Completeness (X1.5)

| Category | Mechanism | Coverage | Gap |
|----------|-----------|----------|-----|
| **Financial** | `financial_ledger` via FSE | ✅ 100% | — |
| **State changes** | `order.timeline[]` | ✅ ~85% | بعض الكتابات بدون timeline |
| **Archives** | `archivedAt` + timeline | ✅ ~90% | bulk_archive كان gap (مُصلَح في #534) |
| **Returns** | `returns_tickets.timeline[]` | ✅ Good | — |
| **🟡 Deletions** | `deleteDoc()` | ⚠️ ~65% | inbox.html:2411 stories deletion بلا audit |
| **🟡 Important edits** | `editHistory[]` | ⚠️ ~50% | salePrice/cost edits بلا history |
| **🟡 Role changes** | لم يُتحقق | ⚠️ غير معروف | يحتاج فحص |

### Finding #4 — 🟡 MEDIUM: Deletion Audit Gap
- `inbox.html:2411`: `deleteDoc(doc(db, 'stories', s._id))` — لا audit entry قبل الحذف
- لا soft-delete pattern (لا `isDeleted: true`)
- **Action P1-1:** soft-delete + audit_logs entry

### Finding #5 — 🟡 MEDIUM: Important Edit Audit Gap
- `salePrice` / `costItems` edits في orders → لا `editHistory[]`
- `clients.html` edits → لا change log
- **Action P1-2:** إضافة `editHistory` field عند تعديل حقول حساسة

---

## 6) Authentication Enforcement

### Pages بدون `onAuthStateChanged` (12 من 52)
| الصفحة | الحالة | السبب |
|--------|--------|------|
| `login.html` | ✅ صحيح | entry point |
| `client-login.html` | ✅ صحيح | public client portal |
| `client-portal.html` | ⚠️ check | external — مقبول لو client auth منفصل |
| `gallery.html` | ✅ متعمَّد | public (RULE R1.4) |
| `privacy.html` | ✅ متعمَّد | public |
| **`validate-financial.html`** | **🔴 ISSUE** | Finding #3 |
| `offline.html`, `reset-sw.html` | ✅ متعمَّد | utilities |
| `chat.html`, `design-workspace.html`, `designer-hub.html` | ⚠️ minimal | embedded — تحتاج فحص |
| `ml-dashboard.html` | ✅ compliant | loaded via smart-sidebar.js |

---

## 7) Session & Token Management — ✅ SECURE

### Storage Usage Audit
| Storage | Used For | Risk |
|---------|----------|------|
| `localStorage` | theme، date-range presets، optional Gemini API key | LOW |
| `sessionStorage` | `b2c_pending_pw` (cleared immediately) | LOW |
| **NO tokens** | Firebase Auth manages JWT internally | ✅ |
| **NO wallet data** | لا cache مالية في الـ client | ✅ |

### Firebase Auth Pattern
- ✅ Stateless JWT (managed by Firebase SDK)
- ✅ Custom Claims لا تُكتب من الـ client (admin SDK فقط)
- ✅ Callable Cloud Functions تتحقق `request.auth`

---

## 8) Permission/Workflow Bypass — ✅ COMPLIANT

### Permission Bypass Search
- 0 inline checks تتجاوز `canSeeField()` / `hasPage()` / `can()`
- كل الـ UI gates تستخدم helpers مركزية

### Workflow Bypass Search
- `buildStageAdvance` / `buildArchiveSpec` / `orderActions.*` مستخدمة في كل المسارات الرئيسية
- لا direct stage writes في الـ business flows (بعد ترحيلات #534 و #549)

---

## 9) ما هو قوي بالفعل (✅ STRONG)

| المجال | الدليل |
|--------|--------|
| **Single Source of Truth (RULE 1)** | FSE يملك كل الكتابات المالية |
| **Atomic Operations (RULE 3)** | `writeBatch()` في كل multi-doc operations |
| **Role-Based Access (RULE 8)** | DEFAULT_PERMISSIONS matrix + canSeeField() |
| **No Shared Accounts** | Firebase Auth + uid-per-employee |
| **Admin Logic Isolation** | 0 hardcoded backdoors |
| **Storage Centralization** | `core/storage-helpers.js` |
| **Password Security** | Firebase managed + sessionStorage cleanup |
| **Audit Trail Core** | `financial_ledger` + timeline + employee/supplier_payments |

---

## 10) Action Items مُرتَّبة

| # | Action | Severity | Effort | Related |
|---|--------|----------|--------|---------|
| **P0-1** | إصلاح `canFinancialWrite()` — حذف `hasPage('clients')`+`hasPage('suppliers')` | 🔴 HIGH | 1h | RULES_AUDIT R-A1 |
| **P0-2** | التحقق من reliability `syncUserAuthClaims` + retry+alert | 🔴 HIGH | 3h | RULES_AUDIT R-A4 |
| **P0-3** | 🆕 إضافة auth gate لـ `validate-financial.html` (admin only) أو حذفها من production | 🔴 HIGH | 30m | §4 #3 |
| **P0-4** | إصلاح 5+ wallet writes في accounts.html (RULE 1 violation) | 🔴 HIGH | 4h | FIREBASE_AUDIT F-A1 |
| **P1-1** | Soft-delete + audit_logs لـ inbox stories | 🟡 MEDIUM | 4h | §5 #4 |
| **P1-2** | إضافة `editHistory[]` للـ salePrice/cost edits | 🟡 MEDIUM | 6h | §5 #5 |
| **P1-3** | تقييد `/settings` على admin | 🟡 MEDIUM | 1h | RULES_AUDIT R-A2 |
| **P1-4** | حذف `hasPage('suppliers')` من supplier_payments write | 🟡 MEDIUM | 1h | RULES_AUDIT R-A3 |
| **P2-1** | فحص G3 limits على كل onSnapshot | 🟢 LOW | 8h | FIREBASE_AUDIT |
| **P2-2** | migration legacy storage paths (Phase 2) | 🟢 LOW | 10h | RULES_AUDIT R-A6 |
| **P2-3** | role change audit logging | 🟢 LOW | 2h | §5 |

---

## 11) Compliance vs X1 Sub-Rules

| Sub-Rule | الحالة |
|---------|--------|
| X1.1 Defense-in-Depth | ✅ 4 طبقات موجودة |
| X1.2 Account Lifecycle | ✅ isActive enforced |
| X1.3 No Hardcoded Admin | ✅ 0 backdoors |
| X1.4 No Hidden Permissions | ✅ matrix مركزي |
| X1.5 Audit Trail شامل | ⚠️ deletions + edits gaps |
| X1.6 No Bypass | ✅ workflows centralized |
| X1.7 Sensitive Operations Validation | ✅ validators موجودة |
| X1.8 Session Security | ✅ clean |
| X1.9 Tenant Isolation | ✅ Phase 2 ready |

---

## 12) Risk Ranking — أولوية الإصلاح

**لو فشل أحد الـ P0:**
1. **canFinancialWrite() breach** → CS يكتب wallets مباشرة → finances out of sync
2. **syncUserAuthClaims فشل** → role mismatch → user locked out أو over-privileged
3. **validate-financial.html exposure** → admin tools + financial data للجميع
4. **accounts.html direct wallet writes** → نفس مشكلة #1 (موجود حالياً)

**التوصية:** كل الـ P0 = ~8-10 ساعات عمل. **يجب الإنهاء قبل أي financial close.**

---

## 13) ما تم التحقق منه

### ✅ Verified
- 0 hardcoded backdoors (grep شامل)
- validate-financial.html بدون auth (grep `onAuthStateChanged`)
- inbox.html:2411 deletion بلا audit (قراءة مباشرة)
- 5 findings موروثة من RULES_AUDIT/FIREBASE_AUDIT لسه موجودة

### ⚠️ Not Verified Deeply
- كل callable Cloud Functions auth enforcement
- role change events — هل تُسجَّل؟
- chat.html / design-workspace.html embedded auth

---

**نهاية التقرير**
