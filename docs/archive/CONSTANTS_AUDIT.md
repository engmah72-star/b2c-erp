# CONSTANTS MIGRATION AUDIT

**النوع:** تقرير تشخيصي قراءة-فقط لـ Magic Strings المرشحة للترحيل.
**التاريخ:** 2026-05-19
**الفرع:** `claude/constants-audit-report`
**السياق:** بعد إنشاء RULE C2 + flat enums (`ORDER_STAGES`, `USER_ROLES`, `SHIPPING_METHODS`, إلخ)، هذا التقرير يحصر الـ magic strings المتبقية ويرتبهم في phases للترحيل.

---

## 0) ملخص تنفيذي

| المؤشر | القيمة |
|--------|--------|
| إجمالي magic strings | **~1,400+** |
| ملفات بأولوية عالية | **15** |
| Enums موجودة | **7** (ORDER_STAGES, USER_ROLES, SHIPPING_METHODS, PAYMENT_TYPES, SHIP_STAGES, PRODUCT_STATUSES, RETURN_STATUSES) |
| **Enums ناقصة (مكتشَفة)** | **2** (`PAYMENT_STATUSES`, role grouping constants) |
| ملفات تستورد orders.js بالفعل | **11** (ترحيل مباشر) |
| ملفات تحتاج module bridge | **4** |
| 🚨 **Bugs مكتشَفة** | 1 (phantom stage 'delivered' في query) |

---

## 1) تكرار Magic Strings لكل Enum

### ORDER_STAGES — 640 instance
| القيمة | المجموع | أعلى 3 ملفات |
|--------|---------|---------------|
| `'archived'` | **181** | clients (21), reports (17), employees (17) |
| `'shipping'` | **152** | reports (22), clients (14), employees (12) |
| `'production'` | **108** | reports (11), employee-profile (10), production (9) |
| `'design'` | **104** | clients (17), reports (9), design (9) |
| `'printing'` | **56** | reports (9), clients (9), employees (5) |
| `'cancelled'` | **39** | shipping-accounts (6), reports (5), approvals (4) |

### USER_ROLES — 489 instance
| القيمة | المجموع | أعلى 3 ملفات |
|--------|---------|---------------|
| `'admin'` | **228** | design (23), clients (21), reports (20) |
| `'operation_manager'` | **137** | design (17), functions/index.js (11), clients (10) |
| `'customer_service'` | **65** | design (10), employee-profile (7), clients (6) |
| `'graphic_designer'` | **48** | design (11), employees (10), clients (8) |
| `'production_agent'` | **23** | functions/index.js (6), design (3), employees (3) |
| `'design_operator'` | **18** | design (6), employees (5), inbox (3) |
| `'shipping_officer'` | **12** | design (5), production (3), functions (2) |
| `'wallet_manager'` | **11** | viewas.js (3), permissions-matrix.js (3), design (2) |

### SHIP_STAGES — 249 instance
| القيمة | المجموع | الملف الأعلى |
|--------|---------|--------------|
| `'ready'` | **83** | shipping-legacy (27) |
| `'returned'` | **76** | shipping-legacy (16), shipping-followup (13) |
| `'collected'` | **43** | shipping-legacy (27) |
| `'wait_delivery'` | **26** | shipping-legacy (16) |
| `'wait_collection'` | **18** | shipping-legacy (11) |
| `'completed'` | **3** | ai-context.js, ai-today.js |

### SHIPPING_METHODS — 73 instance
| القيمة | المجموع |
|--------|---------|
| `'company'` | **46** |
| `'pickup'` | **22** |
| `'courier'` | **5** |

### PRODUCT_STATUSES — 83 instance
| القيمة | المجموع |
|--------|---------|
| `'done'` | **27** |
| `'pending'` | **35** |
| `'ready'` | **12** |
| `'printed'` | **7** |

---

## 2) أعلى 15 ملف لترحيل (مرتبة حسب التكلفة)

| # | الملف | السطور | Magic Strings | يستورد orders.js؟ | أولوية |
|---|------|--------|----------------|---------------------|--------|
| 1 | shipping-legacy.html | 3,035 | **94** | ✅ | HIGH |
| 2 | clients.html | 4,820 | **90** | ✅ (buildArchiveSpec) | HIGH |
| 3 | reports.html | 3,043 | **52** | ✅ | HIGH |
| 4 | design.html | 2,190 | **47** | ✅ | HIGH |
| 5 | employee-profile.html | 1,940 | 45 | ❌ (needs bridge) | MEDIUM |
| 6 | shipping-followup.html | 2,100 | 42 | ✅ | HIGH |
| 7 | functions/index.js | 3,077 | 35 | ❌ (backend) | MEDIUM |
| 8 | shipping-accounts.html | 2,094 | 33 | ✅ | HIGH |
| 9 | production.html | 2,425 | 32 | ✅ | HIGH |
| 10 | employees.html | 1,940 | 25 | ✅ | MEDIUM |
| 11 | accounts.html | 1,682 | 22 | ❌ (needs bridge) | MEDIUM |
| 12 | shipping-dashboard.html | 1,890 | 21 | ❌ (needs bridge) | MEDIUM |
| 13 | exec-dashboard.html | 1,034 | 21 | ✅ | MEDIUM |
| 14 | shipping.html | 1,282 | 18 | ✅ | MEDIUM |
| 15 | shipping-lite.html | 1,450 | 18 | ✅ | MEDIUM |

**11 من 15 ملف يستوردون orders.js بالفعل** — جاهزون للترحيل المباشر.

---

## 3) 🚨 Enums ناقصة يجب إضافتها

### 3.1 — `PAYMENT_STATUSES` (مفقود تماماً، 132 instance!)
| القيمة | الاستخدام |
|--------|----------|
| `'paid'` | 34× |
| `'partial'` | 53× |
| `'pending'` | 23× |
| `'returned'` | 22× |

**يجب إضافته إلى orders.js:**
```js
export const PAYMENT_STATUSES = Object.freeze({
  PENDING:  'pending',
  PARTIAL:  'partial',
  PAID:     'paid',
  RETURNED: 'returned',
});
```

### 3.2 — Role Grouping Constants
نمط مكرَّر في 15+ ملف: `['admin','operation_manager']`. يجب توحيده:
```js
export const ADMIN_ROLES           = Object.freeze(['admin', 'operation_manager']);
export const PAYMENT_ROLES_REFUND  = Object.freeze(['admin', 'operation_manager', 'wallet_manager']);
export const PAYMENT_ROLES_CUSTOMER = Object.freeze(['admin', 'operation_manager', 'customer_service', 'wallet_manager']);
```

---

## 4) 🚨 Bugs مكتشَفة أثناء الـ Audit

### Bug B1 — `financial-dashboard.html:437` يستعلم عن stage='delivered' وهي لا توجد
```js
onSnapshot(query(collection(db,'orders'),
  where('stage','in',['shipping','delivered','archived'])), ...)
```
**المشكلة:** `'delivered'` ليست قيمة `order.stage` (هي قيمة `shipStage` فقط).
**النتيجة:** الـ filter لا يطابق أي أوردر `delivered` ⇒ analytics معطلة بصمت.
**الإصلاح:** إما حذف `'delivered'` من الـ array، أو إضافة فحص منفصل لـ `shipStage`.
**الـ Severity:** متوسط — analytics dashboard فقط، لا تأثير تشغيلي.

---

## 5) Phases الترحيل المقترحة

### Phase 0 — إضافة Enums الناقصة (PR صغير، ~30 سطر)
- `PAYMENT_STATUSES` enum
- `ADMIN_ROLES`, `PAYMENT_ROLES_*` constants
- إصلاح Bug B1 في financial-dashboard.html

### Phase 1 — Easy (1 PR، ~500 سطر)
ملفات تستورد orders.js بالفعل، low magic-string count:
- design.html (47)
- reports.html (52)
- exec-dashboard.html (21)
**Effort:** 2-3 ساعات

### Phase 2 — Shipping Files (2 PRs، ~800 سطر)
- shipping-legacy.html (94) — الأثقل
- shipping-followup.html (42)
- shipping-accounts.html (33)
- shipping.html (18)
- shipping-lite.html (18)
**Effort:** 4-6 ساعات

### Phase 3 — God Pages (2 PRs، ~600 سطر)
- clients.html (90)
- production.html (32)
- employees.html (25)
**Effort:** 3-4 ساعات

### Phase 4 — Module Bridges (1 PR، ~300 سطر)
- employee-profile.html
- accounts.html
- shipping-dashboard.html
- functions/index.js (backend)
**Effort:** 2-3 ساعات

---

## 6) ملخص جداول الترحيل

| Phase | ملفات | Magic Strings | PRs | ساعات | Risk |
|-------|-------|----------------|-----|------|------|
| **Phase 0** | enums | — | 1 | 0.5 | منخفض |
| **Phase 1** | 3 | ~120 | 1 | 2-3 | منخفض |
| **Phase 2** | 5 | ~205 | 2 | 4-6 | متوسط |
| **Phase 3** | 3 | ~147 | 2 | 3-4 | متوسط |
| **Phase 4** | 4 | ~88 | 1 | 2-3 | منخفض |
| **المجموع** | **15** | **~1,400** | **~7** | **12-18** | **L-M** |

---

## 7) Firestore Queries — حالة خاصة

الـ queries تستخدم string values مباشرة. مثلاً:
```js
// Current:
query(collection(db,'orders'), where('stage','==','design'))

// After migration:
query(collection(db,'orders'), where('stage','==', ORDER_STAGES.DESIGN))
```
الـ string value لا يتغير — لكن traceability ترتفع.

**Queries المعنية:**
- `design.html`: 4 queries
- `shipping-legacy.html`: 2
- `production.html`, `print.html`, `shipping-lite.html`, `supplier-requests.html`: 1 لكل

---

## 8) ما لم يتم التحقق منه التفصيلي

- ✅ counts تم التحقق منها بـ grep
- ✅ Bug B1 ('delivered' query) تم التحقق منه يدوياً
- ⚠️ `RETURN_STATUSES` counts لم تُحصَر بالتفصيل (returns.html و returns-core.js يحتاجوا فحص منفصل)
- ⚠️ Cloud Functions `functions/index.js` — backend node.js يحتاج import strategy مختلفة

---

## 9) Quick Wins فورية مقترحة (لا تتطلب enum جديد)

| # | التغيير | الأثر | Risk |
|---|--------|-------|------|
| QW1 | استبدال `stage === 'archived'` بـ `ORDER_STAGES.ARCHIVED` (4 ملفات أولى) | ~80 inline → enum | منخفض |
| QW2 | استبدال `role === 'admin'\|\|role === 'operation_manager'` بـ `ADMIN_ROLES.includes(role)` | ~50 inline → 1 const | منخفض |
| QW3 | إصلاح Bug B1 في financial-dashboard.html | analytics تعمل | منخفض |

---

**نهاية التقرير**
