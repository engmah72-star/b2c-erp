# 🏛️ GOVERNANCE_AUDIT — Drift Register

> **الغرض:** سجلّ الـ drift عن قواعد الحوكمة في `CLAUDE.md`، يُعالَج **تدريجياً** (RULE G9) تحت سقف **RULE E1** (لا big-bang، لا كسر تشغيل).
> **التحديث:** عند كل اكتشاف drift أو معالجته.
> **الطبيعة:** تشخيصي — لا يغيّر كوداً. كل بند له خطة PR منفصل صغير وقابل للتراجع.

---

## 📅 2026-05-28 — Audit مقابل RULE PC1 / PC2 / PC3

**النطاق:** كل صفحات `*.html` التشغيلية + `*.js` + `core/`.
**الأداة:** grep كمّي (الأرقام أدناه قابلة لإعادة الإنتاج).
**الخلاصة:** المبادئ مُثبَّتة في الكود المركزي، لكن توجد **legacy drift** متوقَّعة من ما قبل اعتماد PC1–PC3. لا backdoors. لا تجاوزات أمنية حرجة جديدة (الـ `architecture-guard.yml` يمنع الإضافات الجديدة). المعالجة تدريجية.

---

### 🔴 PC-D1 — كتابات مالية مباشرة تتجاوز FSE *(خطورة: عالية)*

**القاعدة:** PC1.2 + RULE 2/4/G6 + C1.4 — `wallets` / `transactions_v2` تُكتب **فقط** عبر `financial-sync-engine.js`.

**الواقع:** `shipping-accounts.html` يكتب مباشرة على collections مالية داخل `writeBatch`:

| الموقع | الكتابة |
|--------|---------|
| `shipping-accounts.html:1224` | `batch.update(doc(db,'wallets',settledWId),{balance:increment(...)})` |
| `shipping-accounts.html:1226,1257,1306,1426,1448` | `batch.set(doc(collection(db,'transactions_v2')),{...})` |
| `shipping-accounts.html:1256,1279,1425` | `batch.update(doc(db,'wallets',...),{balance:increment(...)})` |

> ملاحظة: الصفحة تستخدم `addLedgerToBatch` للـ ledger (audit موجود)، لكن **رصيد المحفظة والـ transaction يُكتبان خارج dispatch الـ engine** — هذا يكسر "Engine Writes Only".

**الأثر:** خطر تضارب الأرصدة (RULE 1)، تجاوز idempotency (H1.2)، تجاوز invariants (H2.4).
**المعالجة (G9):** ترحيل عمليات التسوية في `shipping-accounts.html` إلى `shipping-actions.js` (موجود) عبر `dispatchFinancialEvent(SHIPPING_SETTLEMENT/REVERSAL)`. PR منفصل + chaos tests (H2.6). **لا** يُحذف القديم قبل اختبار البديل (E1).

---

### 🟠 PC-D2 — كتابات Firestore مباشرة من صفحات HTML *(خطورة: متوسطة)*

**القاعدة:** PC1.5 + H1.1 + L1.2 — الصفحات views؛ الكتابة عبر central actions / `core/`.

**الواقع:** 6 صفحات بها كتابات مباشرة (legacy، قبل الـ guard):

| الصفحة | المطابقات | التقييم |
|--------|-----------|---------|
| `shipping-accounts.html` | 7 | مالية (انظر PC-D1) — أولوية |
| `design.html` | 5 | `audit_logs`, `attendance`, `gallery`, batch — غير مالية، أقل خطورة |
| `validate-financial.html` | 6 | صفحة اختبار حيّ — **مقبولة** (أداة تشخيص، ليست تشغيل) |
| `client-portal.html` | 2 | `client_decisions`, `returns_tickets` — تحتاج action |
| `archive.html` | 1 | `addDoc('orders')` — تحتاج مراجعة |
| `change-password.html` | 1 | `updateDoc('users',uid)` — تغيير flag بعد Auth، منخفض الخطورة |

**المعالجة (G9):** كل صفحة → PR صغير ينقل الكتابة إلى action layer. `validate-financial.html` تبقى كما هي (استثناء موثَّق).
**الحماية الحالية:** `architecture-guard.yml` يمنع أي **إضافة جديدة** — الـ drift مُجمَّد ولا يتوسّع.

---

### 🟡 PC-D3 — Hardcoded role checks بدل capabilities *(خطورة: متوسطة)*

**القاعدة:** PC2.3 + P1.3 + C2.3 + X1.3 — استخدم `canDo(capability)`، لا `role === 'admin'`.

**الواقع:** **57** مطابقة لفحوص أدوار مكتوبة inline عبر **16 صفحة**؛ مقابل **6** استدعاءات `canDo` فقط في 4 صفحات.

| الصفحة | فحوص inline |
|--------|-------------|
| `employees.html` | 20 |
| `approvals.html` | 10 |
| `employee-profile.html` | 5 |
| `production.html` / `my-profile.html` | 4 لكلٍّ |
| أخرى (12 صفحة) | 1–2 لكلٍّ |

**الأثر:** صعوبة الصيانة، خطر تضارب بين UI و `permissions-matrix.js`، يخالف "الدور = bundle من capabilities".
**المعالجة (G9):** ترحيل تدريجي صفحة-صفحة من `role === '...'` إلى `canDo('capability', role, perms)`. أولوية: `employees.html` + `approvals.html`.
**ملاحظة:** الـ Firestore Rules تفرض الصلاحية server-side بغضّ النظر — فهذا drift حوكمة/صيانة، لا ثغرة أمنية.

---

### 🟡 PC-D4 — Page-driven navigation بدل Workflow-driven *(خطورة: متوسطة)*

**القاعدة:** PC3.3 + N1.1 — التنقّل التشغيلي عبر `navigatePage()`، لا `location.href`.

**الواقع:** **125** استخدام `location.href`/`assign` مقابل **25** `navigatePage()` (نسبة ترحيل ~16%).
أعلى الصفحات: `shipping-accounts`, `ops-dashboard`, `cs-dashboard`, `clients` (5 لكلٍّ).

**الأثر:** full page reload داخل الـ shell، كسر تجربة الـ workspace الموحَّد.
**المعالجة (G9 + N1.4):** استبدال تدريجي للروابط التشغيلية بـ `navigatePage()`. الروابط الخارجة من النظام (login/logout) تبقى `location.href`.

---

### 🟢 PC-D5 — Hash routing لحالة الصفحة *(خطورة: منخفضة)*

**القاعدة:** N1.3 — `location.hash` محجوز للـ shell (`#ctx=`)؛ ممنوع لـ tab/filter state.

**الواقع:** `employee-profile.html:338`, `my-profile.html:122`, `reports.html:277` تستخدم `location.hash` لحالة داخلية (tabs/filters).
**المعالجة:** مُدرَجة بالفعل في `CLEANUP_PLAN.md` Phase 9 — ترحيل إلى query string. تبقى كما هي حتى ذلك الحين (تعمل standalone).

---

### ✅ نتائج إيجابية (مطابِقة)

| البند | النتيجة |
|------|---------|
| **PC1.6 — Backdoors** | ✅ صفر `uid===` / `email===` hardcoded authority |
| **PC1 — كتابات جديدة** | ✅ `architecture-guard.yml` يمنع أي direct write جديد (modular + compat SDK) |
| **PC3.1 — المداخل** | ✅ المداخل الأربعة موجودة: `shell.html` (موظفين+إدارة بالصلاحيات)، `client-portal.html`، `supplier-requests.html` |
| **PC1 — المالية المركزية** | ✅ `financial-sync-engine.js` هو محرك الكتابة الوحيد المعتمد (عدا drift PC-D1) |
| **التدقيق** | ✅ `core/audit.js` (`auditEntry`) يفرض date + actor (H3) |

---

## 🗺️ خطة المعالجة (priority-ordered, كل بند = PR منفصل تحت E1/G9)

| # | Drift | الأولوية | النطاق | اختبار |
|---|-------|----------|--------|--------|
| 1 | PC-D1 (shipping-accounts → FSE) | 🔴 عالية | `shipping-accounts.html` → `shipping-actions.js` | chaos tests H2.6 |
| 2 | PC-D3 (employees/approvals → canDo) | 🟠 متوسطة | 2 صفحة أولاً | manual UI |
| 3 | PC-D2 (client-portal/archive → actions) | 🟠 متوسطة | صفحة لكل PR | manual UI |
| 4 | PC-D4 (navigatePage) | 🟡 متوسطة | تدريجي per page | shell smoke |
| 5 | PC-D5 (hash → query) | 🟢 منخفضة | مع CLEANUP_PLAN Phase 9 | — |

> **مبدأ التنفيذ:** كل بند PR صغير، backward-compatible، reversible بـ revert واحد، لا يكسر تشغيل (E1). القديم يبقى حتى استقرار البديل.
