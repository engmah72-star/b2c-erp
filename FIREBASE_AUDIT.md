# FIREBASE USAGE AUDIT

**النوع:** تقرير تشخيصي قراءة-فقط لاستخدام Firebase في النظام.
**التاريخ:** 2026-05-19
**الفرع:** `claude/f1-firebase-charter-audit`
**السياق:** بعد إنشاء **RULE F1 — Firebase Principle**، هذا التقرير يحصر استخدام Firebase الفعلي ويحدد drifts عن القواعد.

---

## 0) ملخص تنفيذي

| المؤشر | القيمة |
|--------|--------|
| Collections فريدة في الكود | **58** |
| Active (مكتوبة + مقروءة) | ~50 |
| Read-only (ML/system-generated) | 5 (admin_alerts, client_segments, forecasts, product_affinities, rfm_runs) |
| Cloud Functions | **42** (14 triggers + 9 callables + 7 scheduled + 12 helpers) |
| Firebase singleton (G2) compliance | ✅ مع 1 legacy exception |
| 🚨 **RULE 1 violations مؤكَّدة** | **2 ملفات** (`accounts.html` × 5+، `settings.html` × 1) |
| Repository pattern (G4 target) | 1 من ~10+ ممكنة (features/design/repository.js) |
| Storage pattern | 1 centralized + 9 inline |

---

## 1) Collections — الجرد الكامل

> **ملاحظة:** الـ agent عَدّ 41 collection. التحقق بـ `grep` كشف **58** (تتضمن أسماء بـ spacing مختلف).

### Core Operations (5)
| Collection | Reads | Writes | الغرض |
|------------|-------|--------|-------|
| `orders` | 34 | 27 | محور الـ workflow |
| `clients` | 8 | 4 | بيانات العملاء |
| `employees` | 19 | 15 | الموظفين والأدوار |
| `suppliers_v2` | 15 | 14 | الموردين |
| `users` | 6 | 5 | Firebase Auth metadata |

### Financial Governance (FSE-only writes — RULE 1)
| Collection | Reads | Writes | حالة الالتزام |
|------------|-------|--------|--------------|
| `wallets` | 24 | 20 | ⚠️ **2 violations** (accounts.html × 5، settings.html × 1) |
| `transactions_v2` | 17 | 14 | ✅ مُلتزم |
| `financial_ledger` | 5 | 3 | ✅ مُلتزم (FSE + helpers) |
| `employee_payments` | 8 | 6 | ✅ مُلتزم |
| `supplier_payments` | 9 | 8 | ✅ مُلتزم |
| `shipping_settlements` | 5 | 5 | ✅ مُلتزم |

### Operations & Dashboards (10)
- `attendance` (10R/8W) — حضور الموظفين
- `products_v2` (6R/5W) — المنتجات
- `tasks` (5R/4W) — قائمة المهام
- `notifications` (2R/2W) — الإشعارات
- `conversations` (3R/2W) — المحادثات
- `returns_tickets` (4R/2W) — المرتجعات
- `payment_requests` (4R/4W)
- `shippers_v2` (5R/5W)
- `shipping_returns` (3R/3W)
- `supplier_orders` (3R/3W)

### Employee Performance (4)
- `employee_evaluations`, `employee_goals`, `employee_incidents`, `employee_leaves`

### Design Workflows (3)
- `design_items`, `client_decisions`, `gallery`

### Audit & Compliance (2)
- `audit_logs`, `reconciliations`

### ML/Analytics — Read-Only (5)
| Collection | يكتب بها | يقرأها |
|------------|----------|--------|
| `client_segments` | `weeklyChurnRfmAnalysis` (Mon 4 AM) | ml-dashboard.html |
| `admin_alerts` | `onCriticalFinancialEntry`, `dailyFinancialAnomalyScan`, `detectEngineBypass` | ml-dashboard.html |
| `forecasts` | `weeklyRevenueForecast` (Mon 5 AM) | ml-dashboard.html |
| `product_affinities` | `weeklyProductRecommendations` (Mon 4:30 AM) | ml-dashboard.html |
| `rfm_runs` | `weeklyChurnRfmAnalysis` (snapshot history) | ml-dashboard.html |

**جميعها ACTIVE** — تخدم AI/ML dashboard.

### Infrastructure & Cloud-Function-Only (5)
- `presence`, `stories`, `whatsapp_logs`, `fcm_tokens`, `impersonation_audit`, `archived_orders`, `backup_logs`

### مُرشَّحات للفحص
| Collection | السبب |
|------------|-------|
| `employees_v2` | معزولة في my-requests.html فقط — هل هي legacy migration؟ |
| `stories` | غير واضح الـ scope — تحتاج توضيح |

---

## 2) 🚨 RULE 1 Violations مؤكَّدة (Wallets Writes خارج FSE)

### `accounts.html` — **5+ direct writes**
```js
// السطر 1460: batch.update(doc(db,'wallets',walletId),{balance:increment(type==='in'?-amount:amount)})
// السطر 1653: batch.update(doc(db,'wallets',walletId),{balance:actual})
// السطر 1719: batch.update(doc(db,'wallets',walletId),{balance:newBal})
// السطر 1805: await updateDoc(doc(db,'wallets',walletId),{...})
// السطر 1976: batch.update(doc(db,'wallets',walletId),{balance:increment(adj)})
```
**التحليل:** هذه عمليات admin reconciliation/adjustment للأرصدة. كانت تستخدم helpers قبل، الآن مباشرة → خرق صريح لـ F1.5 + RULE 1.
**الـ Severity:** **عالية** — يكسر invariant "FSE هو المصدر الوحيد للأرصدة".
**الإصلاح المقترح:** إضافة `walletActions.adjustBalance()` و `walletActions.reconcile()` كـ central actions تمر بـ FSE.

### `settings.html` — **1 write (للإنشاء)**
```js
// السطر 884: await addDoc(collection(db,'wallets'), { name, type, balance:0, ... })
```
**التحليل:** إنشاء محفظة جديدة (admin-only setup action). الـ balance صفر، فلا حركة مالية ⇒ تقنياً ليس انتهاكاً لـ RULE 1 (لا تعديل رصيد).
**الـ Severity:** **منخفضة** — لكن يجب توثيقه كـ "wallet creation" action.

---

## 3) Firebase Singleton (RULE G2) Compliance

| الملف | الحالة |
|------|--------|
| `core/firebase-init.js` | ✅ المصدر الوحيد (RULE G2 enforced) |
| `clients.html` | ⚠️ legacy FB_CONFIG محلي (migration target) |
| `employee-profile.html`, `employees.html` | ⚠️ Secondary apps لإنشاء users — pattern مسموح |
| `firebase-messaging-sw.js` | ⚠️ SW init منفصل (مطلوب) |
| `functions/index.js` | ✅ Admin SDK (مختلف) |

**النتيجة:** نظيف بشكل عام. الـ exceptions مبررة.

---

## 4) Storage — Drift عن المركزية

| نمط | الملفات | الحالة |
|-----|---------|--------|
| Centralized | `features/design/services/upload.service.js` | ✅ best practice |
| Inline scattered | approvals, clients, design, inbox, my-requests, print, production, shipping-legacy, supplier-requests (9 ملفات) | ⚠️ Drift |

**الحل المقترح:** إنشاء `core/storage-helpers.js` كـ wrapper موحَّد لكل uploads (F1.9 target).

---

## 5) Repository Pattern (RULE G4) — التبني

**موجود:** `features/design/repository.js` — implementation مرجعية:
- Bounded listeners (G3) مع limits صريحة (200 orders, 100 unassigned, 500 items)
- Tenant-aware (G7)
- 11+ `subscribe*` functions

**ناقص:** repositories لـ orders, clients, shipping, financial, employees, إلخ.

**التقييم:** G4 هي target، ليست required. الـ adoption الحالي مقبول لمشروع V1.

---

## 6) Cloud Functions — التزام بـ RULE 1

**42 function** موزَّعة:
| النوع | العدد |
|------|------|
| Triggers (Firestore) | 14 |
| Callables (HTTP) | 9 |
| Scheduled | 7 |
| Helpers | 12 |

### الالتزام المالي
**كل الـ functions تحترم RULE 1 — لا financial writes مباشرة:**
- `onPaymentLogged` → يقرأ + يرسل WhatsApp
- `onCriticalFinancialEntry` → يقرأ + يكتب admin_alerts فقط
- `dailyFinancialAnomalyScan` → يقرأ + يكتب admin_alerts فقط
- `syncClientNameOnUpdate` → يكتب transactions_v2 (denormalization — مسموح لأنه sync metadata، ليس balance)
- `weeklyChurnRfmAnalysis` → يقرأ orders + يكتب client_segments (ML output)
- `detectEngineBypass` → monitor فقط

✅ **Cloud Functions نظيفة من ناحية RULE 1.**

---

## 7) Bounded Queries (RULE G3) — نموذج التطبيق

`features/design/repository.js` يلتزم بـ G3 بـ limits صريحة:
- 200 لـ orders
- 100 لـ unassigned
- 500 لـ design_items
- 50 لـ recent payments

باقي الصفحات تحتاج audit منفصل للـ limits.

---

## 8) ملخص الـ Action Items (لـ PRs منفصلة لاحقاً)

| # | Action | Severity | الجهد |
|---|--------|---------|------|
| **F-A1** | إنشاء `walletActions.adjustBalance/reconcile` + ترحيل 5 violations في accounts.html | عالية | متوسط |
| **F-A2** | توثيق `wallet creation` كـ action مسموح أو نقله إلى `walletActions.createWallet` | منخفضة | صغير |
| **F-A3** | إنشاء `core/storage-helpers.js` + ترحيل 9 inline uploads | متوسطة | متوسط |
| **F-A4** | فحص `employees_v2` — هل legacy؟ هل دمج مع `employees`؟ | متوسطة | صغير |
| **F-A5** | إضافة repositories لـ orders, financial (G4) | منخفضة (target) | كبير |
| **F-A6** | فحص `limit()` على كل `onSnapshot` (G3 audit شامل) | متوسطة | متوسط |

---

## 9) ما تم التحقق منه vs ما لم يتم

### ✅ تم التحقق
- accounts.html violations (5+ instances بـ line numbers)
- settings.html wallet creation (1 instance، balance:0)
- collections count (58 بـ grep — أكتر من الـ 41 المُذكور)
- Singleton compliance (`core/firebase-init.js` المصدر الوحيد)

### ⚠️ لم يتم التحقق التفصيلي
- كل ML collections فعلاً مستخدَمة بانتظام (تحتاج فحص ml-dashboard.html)
- adoption الـ G3 limits في كل الصفحات
- إذا `employees_v2` migration نشطة أو ميتة

---

## 10) الخطوة التالية (تحتاج موافقة)

التقرير تشخيصي فقط. **لا يُنفَّذ شيء بدون موافقة على كل بند منفصلاً.**

الأولوية المقترحة:
1. **P0 — F-A1** (wallet writes violations) — أعلى severity
2. **P1 — F-A4** (employees_v2 verification) — قد يكشف dead code
3. **P2 — F-A3** (storage central helper) — جاهز للترحيل التدريجي
4. **P3 — F-A2, F-A5, F-A6** — لاحقاً

---

**نهاية التقرير**
