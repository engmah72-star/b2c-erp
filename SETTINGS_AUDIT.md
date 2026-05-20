# SETTINGS PAGE DEEP AUDIT

**النوع:** تقرير تشخيصي قراءة-فقط لـ `settings.html` (1080 سطر) وأثرها على باقي النظام.
**التاريخ:** 2026-05-20
**الفرع:** `claude/system-understanding-audit`
**القاعدة:** يجب فهم النظام قبل أي refactor — هذا التقرير لا يُنفّذ شيئاً.

---

## 0) ملخص تنفيذي

| البند | القيمة |
|------|--------|
| `settings.html` lines | **1,080** |
| Active sections | 8 |
| Collections affected | 5 (`settings`, `wallets`, `master_lists`, `whatsapp_logs`, `users`) |
| Access | `admin`, `operation_manager` (UI guard) |
| 🚨 Critical findings | **3 HIGH** + 4 MEDIUM |

---

## 1) Sections Inventory

| Section | Type | Storage | Edit |
|---------|------|---------|------|
| Payment Methods (Wallets) | Dynamic | `wallets` collection | CRUD via modal |
| Client Categories | Tag list | `settings/main` | Add/Remove |
| Client Sources | Tag list | `settings/main` | Add/Remove |
| Cost Types Digital | Tag list | `settings/main` | Add/Remove |
| Cost Types Offset | Tag list | `settings/main` | Add/Remove |
| Supplier Specialties | Tag list | `master_lists/supplier_categories` | Add/Remove |
| WhatsApp Integration | Config + events | `settings/whatsapp` | Mode + credentials |
| System Info | Read-only | Display | None |

---

## 2) Stored Data Schema

### `settings/main` (single document)
```js
{
  clientCategories: ['VIP','محامي','طبيب',...],  // ⚠️ Stored but unused في clients.html
  clientSources:    ['واتساب','فيسبوك',...],     // ⚠️ Stored but unused
  costTypesDigital: ['طباعة ديجيتال','سلوفان',...], // ✅ Used in print.html:487
  costTypesOffset:  ['ورق','زنكات','طباعة',...],   // ✅ Used in print.html:487
  paymentMethods:   [...]                          // 🔴 DEPRECATED — duplicate of wallets
}
```

### `settings/whatsapp`
```js
{
  mode: 'stub' | 'live',
  language: 'ar' | 'en',
  events: { order_created:bool, ... },
  phoneNumberId, businessAccountId,
  // token: ⚠️ NOT here (Firebase Secrets فقط — صحيح)
}
```

### `wallets` collection (single source ✅)
```js
{ name, type: 'wallet'|'cash'|'bank', balance, managerId, isActive, createdAt }
```

### `master_lists/supplier_categories` (single source ✅)
```js
{ items: [{label, group, isActive, order}], updatedAt }
```

---

## 3) 🚨 HIGH Findings

### Finding #1 — ROLE_PERMS_DEFAULTS مكرَّر في 3 ملفات
**الموقع:**
- `orders.js` (ROLES + permissions defaults)
- `employees.html` (نسخة محلية)
- `settings.html` (لـ permissions matrix UI)

**Risk:** تعديل في مكان لا ينتقل للآخر → privilege inconsistency محتمل.

**Fix (deferred):** export من `orders.js` كـ canonical، import في الباقي.

### Finding #2 — ROLES مكرَّر في 5+ ملفات
**Risk:** UI inconsistency، typo propagation.

**Fix:** export من `orders.js`، import في الكل (مرتبط بـ C2 migration).

### Finding #3 — `settings/{doc}` Firestore write rule
**التحقق:** يحتاج فحص — هل `settings` collection لها explicit `allow write: if isAdminOnly();`؟
لو ناقص = أي مستخدم authenticated يقدر يكتب على settings.

---

## 4) 🟡 MEDIUM Findings

### Finding #4 — `paymentMethods` array dead code
- موجود في `settings/main` كـ array قديم
- تم استبداله بـ `wallets` collection كاملاً
- لا قارئ في أي صفحة

**Fix:** حذف الحقل من schema.

### Finding #5 — `clientCategories` و `clientSources` غير مستخدمين
- تُحفَظ وتُعدَّل في settings.html
- لكن **لا صفحة تقرأهم** للـ dropdown
- `clients.html` يستخدم hardcoded fallback

**Fix:** إما (a) ربط `clients.html` بهم، أو (b) حذفهم.

### Finding #6 — `exec-cost-entry.html` hardcoded cost types
- ينبغي قراءة من `settings.costTypesDigital/Offset` (مثل `print.html`)
- حالياً يستخدم defaults محلية

**Fix:** القراءة من نفس مصدر `print.html`.

### Finding #7 — No `audit_logs` على settings changes
- `saveSettings()` يحدّث الـ doc بدون audit entry
- لا تتبع لمن غيّر WhatsApp mode أو cost types

**Fix:** إضافة `audit_logs` entry على كل save.

---

## 5) System-Wide Impact

### Who reads settings/main?
| Page | Reads | Status |
|------|-------|--------|
| `print.html:487` | `costTypesDigital/Offset` | ✅ Active |
| `clients.html` | `clientCategories/Sources` | ❌ Hardcoded fallback (drift) |
| `exec-cost-entry.html` | cost types | ❌ Hardcoded (drift) |
| `shared.js:241` | global settings listener | ✅ Active (AppState) |
| باقي الصفحات | `wallets` collection | ✅ Active |

### Frequency of change
| Setting | Frequency | Impact |
|---------|-----------|--------|
| Wallet (add/delete) | Daily | HIGH — used everywhere |
| WhatsApp mode/events | Rare | HIGH — affects notifications |
| Cost types | Annual | MEDIUM — affects print pricing |
| Categories/sources | Annual | LOW |

---

## 6) Access Control

✅ **UI guard صحيح:**
```js
if(!['admin','operation_manager'].includes(d.role)) {
  window.location.href='accounts.html';
  return;
}
```

✅ Wallet token في Firebase Secrets (ليس في Firestore) — صحيح.

⚠️ **Rule verification needed:** هل `settings/{doc}` write محصور على admin؟

---

## 7) Recommendations (لـ PRs لاحقة، ليس هذا الـ PR)

### Phase 1 (Immediate)
1. ❌ **لا تنفيذ في هذا الـ PR** — تقرير فقط حسب التوجيه
2. Centralize ROLES + ROLE_PERMS_DEFAULTS في `orders.js`
3. Verify Firestore rule على `settings/{doc}`
4. Remove dead `paymentMethods` array

### Phase 2
5. Audit logs على settings changes
6. Decide clientCategories/Sources (implement or remove)
7. Fix exec-cost-entry.html hardcoded defaults

### Phase 3
8. Centralize WhatsApp events config
9. Add version field على settings doc (concurrent edit safety)

---

## 8) ما تم التحقق منه

### ✅ Verified
- Settings page sections (8) + access guards
- 5 collections touched
- `paymentMethods` redundancy
- `wallets` centralization correctness

### ⚠️ تحتاج فحص لاحق
- ROLE_PERMS_DEFAULTS في 3 ملفات (claim من الـ audit، يحتاج cross-check)
- ROLES في 5+ ملفات (claim — يحتاج عدّ دقيق)
- `settings/{doc}` write rule (claim — يحتاج verification في firestore.rules)

---

**ملاحظة:** هذا التقرير diagnostic فقط. أي إصلاح يأتي في PRs منفصلة حسب الـ stabilization mission.
