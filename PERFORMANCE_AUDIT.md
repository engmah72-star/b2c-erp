# ⚡ PERFORMANCE AUDIT — Business2Card ERP

> **التاريخ:** 2026-05-20
> **الفرع:** `claude/optimize-system-performance-KQ1nl`
> **المنهج:** Read & Measure First — قياس قبل أي تعديل.
> **الالتزام:** RULE G3 (Bounded Listeners) + RULE F1 (Firebase as Infrastructure) + RULE L1.4 (Layer Independence) + RULE G9 (Incremental Migration).

---

## 0) Executive Summary

النظام يعاني من **130 listener بدون `limit()`** في 31 ملف. الأثر:
- كل صفحة dashboard أو محاسبية تُحمِّل من Firestore مئات إلى آلاف documents في كل render.
- عند 10k–50k order: كل تغيير على أوردر واحد → re-fetch لكل الـ listeners المفتوحة.
- الفاتورة المالية على Firestore reads = `active_tabs × documents_per_collection × frequency_of_change`.
- على الـ UX: صفحة `reports.html` و `employees.html` و `design.html` يعانون من lag مع نمو البيانات.

### الأهداف
1. إضافة `limit()` آمن لكل `onSnapshot` غير محدود (RULE G3).
2. Centralization عبر helper موحَّد للحدود (`PAGE_LIMITS`).
3. الحفاظ على الـ workflow الحالي بدون تغيير.
4. صفر مخاطر — كل تعديل قابل للتراجع بمفرده.

---

## 1) الأرقام قبل التعديل

| القياس | القيمة |
|---|---|
| Total `onSnapshot` calls | 256 |
| Bounded (`limit()`) | ~126 |
| **Unbounded (no `limit()`)** | **130** |
| Files affected | 31 HTML + 2 JS |

### Top 10 ملفات بأكبر عدد listeners غير محدودة

| File | Unbounded listeners |
|---|---|
| `employee-profile.html` | 10 |
| `reports.html` | 9 |
| `design.html` | 9 |
| `ops-dashboard.html` | 7 |
| `my-profile.html` | 7 |
| `designer-dashboard.html` | 7 |
| `production.html` | 6 |
| `financial-dashboard.html` | 6 |
| `suppliers.html` | 5 |
| `print.html` | 5 |

---

## 2) أسوأ الـ Patterns (Top 5 Smoking Guns)

### 2.1 `reports.html` — يحمِّل النظام بالكامل
```js
// reports.html:901-910
onSnapshot(collection(db,'orders'),        ...)  // ❌ كل الأوردرات
onSnapshot(collection(db,'clients'),       ...)  // ❌ كل العملاء
onSnapshot(collection(db,'employees'),     ...)  // ❌ كل الموظفين
onSnapshot(collection(db,'suppliers_v2'),  ...)  // ❌ كل الموردين
onSnapshot(collection(db,'shippers_v2'),   ...)  // ❌ كل الشاحنين
onSnapshot(collection(db,'supplier_payments'), ...)  // ❌
onSnapshot(collection(db,'transactions_v2'),   ...)  // ❌
onSnapshot(collection(db,'returns_tickets'),   ...)  // ❌
```
**الأثر:** عند 50k order × 10k client × 5k transaction = ~80MB في الذاكرة + كل onSnapshot re-fires على أي تعديل.

### 2.2 `employee-profile.html` — يقرأ كل الأوردرات لموظف واحد
```js
// employee-profile.html:625
onSnapshot(collection(db,'orders'), snap=>{
  // ثم client-side filter بـ designerId/printerId/...
});
```
**الأثر:** فتح بروفايل موظف يحمّل **كل** الأوردرات (مش فقط أوردرات الموظف). يجب استخدام `where('designerId','==',uid)` على مستوى الـ query بدل client-side filter.

### 2.3 `design.html` — 4 listeners على نفس الـ query
```js
// design.html:898  (admin)
onSnapshot(query(collection(db,'orders'),where('stage','==','design')), ...);
// design.html:913  (CS)
onSnapshot(query(collection(db,'orders'),where('stage','==','design')), ...);
// design.html:931  (designer)
onSnapshot(query(collection(db,'orders'),where('designerId','==',uid),where('stage','==','design')), ...);
// design.html:949  (designer unassigned)
onSnapshot(query(collection(db,'orders'),where('stage','==','design')), ...);
```
**الأثر:** كل 4 listeners تقرأ نفس البيانات بدون `limit()`. التعديل: limit + ربما dedupe مستقبلاً.

### 2.4 `notifications.js` — 6 listeners تُحمَّل في كل صفحة مع notifications
```js
// notifications.js (لا limit في أي منها)
where('assignedTo','==',uid)         // tasks
where('designerId','==',uid)         // orders (design)
where('shippingOfficerId','==',uid)  // orders (ship)
where('printerId','==',uid)          // orders (print)
where('hasUnreviewedAudit','==',true)// audit (للأدمن)
where('assignedTo','==',uid)         // followups
where('toUid','==',uid)              // notifications
where('productionAgent','==',uid)    // orders (prod)
```
**الأثر:** كل صفحة تستخدم notifications.js تفتح 8 listeners. لو موظف معه 500 أوردر تاريخياً = 500 reads كل re-fire.

### 2.5 `exec-cost-entry.html:657` — يحمِّل كل الأوردرات للـ cost entry
```js
onSnapshot(collection(db,'orders'), snap=>{ ... });
```
**الأثر:** صفحة admin-only تحمل كل الـ database. يجب فلترتها بـ `where('stage','in',['production','printing'])`.

---

## 3) خطة التحسين (Incremental — RULE G9)

كل تعديل في commit مستقل، قابل للتراجع، آمن.

### Phase 1 — Safety Limits (Quick Wins)
إضافة `limit()` لكل onSnapshot غير محدود، **بدون تغيير سلوك**. القيم الافتراضية محسوبة على حجم الشركة الفعلي:

| Collection | Limit في dashboards | Limit في entity views |
|---|---|---|
| `orders` | 500 | 2000-3000 |
| `clients` | 500 | 2000 |
| `employees` | 200 | 200 |
| `wallets` | 100 | 100 |
| `products_v2` | 500 | 500 |
| `suppliers_v2` | 500 | 500 |
| `transactions_v2` | 1000 | 5000 |
| `attendance` | 500 | 1000 |
| `employee_payments` | 500 | 500 |
| `supplier_payments` | 500 | 1000 |
| `users` | 500 | 500 |
| `presence` | 200 | — |
| `conversations` | 200 | — |

### Phase 2 — Smart Filters (متوسط المخاطر — للتنفيذ على دفعات)
- `employee-profile.html:625` → استبدال `collection(db,'orders')` بـ `where('designerId','==',empUid)` + duplicate listeners لـ `printerId/shippingOfficerId/productionAgent`.
- `exec-cost-entry.html:657` → فلترة `where('stage','in',['production','printing'])`.
- `my-profile.html:744` → فلترة على الموظف الحالي.

### Phase 3 — Deduplication (مؤجلة — تحتاج refactor أكبر)
- `design.html` — توحيد 4 listeners على `stage==design`.
- `notifications.js` — تجميع listeners لكل user-role.

---

## 4) مبادئ هذا الـ Audit

1. **لا تغيير workflow** — كل تحسين شفّاف للموظف.
2. **مركزية لا تشتت** — أي helper جديد يدخل `core/` أو `shared.js`.
3. **محسوب آمن** — حدود سخية (limit أكبر مما يحدث طبيعياً).
4. **قابل للقياس** — كل PR يذكر عدد listeners قبل/بعد.
5. **قابل للتراجع** — file واحد per concern.

---

## 5) خارج النطاق (لا نفعله الآن)

- ❌ إعادة كتابة `reports.html` كاملة
- ❌ Server-side aggregation عبر Cloud Functions جديدة (يحتاج RULE G10 module definition)
- ❌ Virtualized tables (overengineering للحجم الحالي)
- ❌ Caching layer مع invalidation logic معقد
- ❌ State management framework (Redux/Zustand)

---

## 6) القياس بعد كل phase

عند انتهاء Phase 1:
```bash
grep -rn "onSnapshot" --include="*.html" --include="*.js" \
  | grep -v "limit(" | grep -v "doc(db" | grep "collection(db" | wc -l
```
**الهدف:** من 130 → أقل من 20 (الباقي يكون doc references صغيرة محسوبة).

---

## 7) Tracking Table

| # | File | Listeners | Status |
|---|---|---|---|
| 1 | notifications.js | 8 | ⏳ |
| 2 | inbox-badge.js | 1 | ⏳ |
| 3 | employee-profile.html | 10 | ⏳ |
| 4 | reports.html | 9 | ⏳ |
| 5 | design.html | 9 | ⏳ |
| 6 | ops-dashboard.html | 7 | ⏳ |
| 7 | my-profile.html | 7 | ⏳ |
| 8 | designer-dashboard.html | 7 | ⏳ |
| 9 | production.html | 6 | ⏳ |
| 10 | financial-dashboard.html | 6 | ⏳ |
| 11 | suppliers.html | 5 | ⏳ |
| 12 | shipping-dashboard.html | 5 | ⏳ |
| 13 | print.html | 5 | ⏳ |
| 14 | employees.html | 5 | ⏳ |
| 15 | shipping-accounts.html | 4 | ⏳ |
| 16 | production-dashboard.html | 4 | ⏳ |
| 17 | my-requests.html | 4 | ⏳ |
| 18 | exec-dashboard.html | 4 | ⏳ |
| 19 | cs-dashboard.html | 4 | ⏳ |
| 20 | accounts.html | 4 | ⏳ |
| 21 | supplier-requests.html | 3 | ⏳ |
| 22 | exec-cost-entry.html | 3 | ⏳ |
| 23 | approvals.html | 3 | ⏳ |
| 24 | shipping-lite.html | 2 | ⏳ |
| 25 | shipping-followup.html | 2 | ⏳ |
| 26 | settings.html | 2 | ⏳ |
| 27 | products.html | 2 | ⏳ |
| 28 | inbox.html | 2 | ⏳ |
| 29 | role-viewer.html | 1 | ⏳ |
| 30 | returns.html | 1 | ⏳ |
| 31 | order-tracking.html | 1 | ⏳ |
| 32 | ledger.html | 1 | ⏳ |

---

**الحالة:** Audit جاهز. التنفيذ يبدأ في commits لاحقة.
