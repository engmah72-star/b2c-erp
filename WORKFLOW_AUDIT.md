# WORKFLOW STABILIZATION AUDIT

**النوع:** تقرير تشخيصي قراءة-فقط — لا توصيات تنفيذية.
**التاريخ:** 2026-05-19
**الفرع:** `claude/workflow-stabilization-audit`
**الهدف:** التحقق من التزام النظام بـ **RULE W1** (`order.stage` = المصدر الوحيد للحالة) وحصر التضاربات الفعلية قبل أي تنظيف.

---

## 0) ملخص تنفيذي

| البند | النتيجة |
|------|---------|
| **مراحل `order.stage` الفعلية** | 6 قيم: `design`, `printing`, `production`, `shipping`, `archived`, `cancelled` |
| **مسار الـ workflow الأساسي** | `design → printing → production → shipping → archived` (خطي، يعمل) |
| **`buildStageAdvance()` مُطبَّق في UI** | ✅ في `design.html`, `print.html`, `production.html`, `shipping.html` |
| **انتهاكات RULE W1 مؤكَّدة** | 3 (شديدة) + 2 (متوسطة) |
| **Phantom stage values** | ✅ موجودة في `ai-context.js` |
| **ملفات شحن قديمة** | `shipping-legacy.html` (3036 سطر) — مرشحة للحذف بعد PR #527 |
| **Audit trail gaps** | bulk archive لا يُسجَّل في `financial_ledger` |

> **خلاصة:** الـ workflow الأساسي **مستقر وصحيح**، لكن فيه 5 مواضع تنتهك W1 + ثغرة audit واحدة + كود ميت محدود في الـ analytics.

---

## 1) القيم الرسمية لـ `order.stage`

**المصدر:** `orders.js:27-34`

| القيمة | Label | next | prev | الصفحة | الحالة |
|--------|------|------|------|--------|--------|
| `design` | تصميم | `printing` | — | `design.html` | ✅ نشطة |
| `printing` | طباعة | `production` | `design` | `print.html` | ✅ نشطة |
| `production` | تنفيذ | `shipping` | `printing` | `production.html` | ✅ نشطة |
| `shipping` | شحن | `archived` | `production` | `shipping.html` | ✅ نشطة |
| `archived` | أرشيف | — | `shipping` | `archive.html` | ✅ نشطة (نهائية) |
| `cancelled` | ملغي | — | — | `archive.html` | ⚠️ معرَّفة لكن **لا تُكتب في أي مكان** (orphan) |

**ملاحظة:** `cancelled` لها تعريف في `STAGES` لكن لا يوجد أي `stage: 'cancelled'` في كود الكتابة. حالة طرفية معلَّقة.

---

## 2) خريطة الانتقالات (Transition Map) — الواقع

| من | إلى | الملف:السطر | الدالة | الدور | الحدث المالي |
|---|---|---|---|---|---|
| (إنشاء) | `design` | `design.html:1671`, `archive.html:660` (reorder) | إنشاء أوردر جديد | `customer_service`/`admin` | `CUSTOMER_PAYMENT` (لو deposit) |
| `design` | `printing` | `design.html:2005` | `approveFromCard` → `buildStageAdvance` | `graphic_designer` / `design_operator` / `CS` / `admin` | — |
| `printing` | `production` | `print.html:844` | `submitToProduction` → `buildStageAdvance` | `production_agent` / `CS` / `admin` | — |
| `production` | `shipping` | `production.html:2373`, `2281` | `submitToShipping` → `buildStageAdvance` | `production_agent` / `admin` | (اختياري) `VENDOR_PAYMENT` لـ costItems |
| `shipping` | `archived` | `shipping.html:1262` | `confirmArchive` → `updateDoc` مباشر | `shipping_officer` / `admin` | `SHIPPING_SETTLEMENT` (في batch منفصل) |
| **أي** | `archived` | `clients.html:4298` | `bulk_archive` (أدمن) | `admin` / `operation_manager` | ❌ **بدون ledger** |
| **revert** | `prev` | عبر `buildStageRevert()` في `design.html`, `production.html`, `shipping-legacy.html` | خطوة واحدة للخلف بسبب | الأدوار الأعلى | — |

**ملاحظة مهمة (تصحيح لتقرير سابق):** كل الانتقالات الأمامية مُطبَّقة فعلاً في الـ UI عبر `buildStageAdvance()`. لا توجد transitions "غير قابلة للوصول".

---

## 3) الحالات الفرعية (Sub-Statuses)

### 3.1 `designStage`
**المصدر:** `design.html`

| القيمة | الكتابة | الاستخدام |
|--------|---------|-----------|
| `pending` | `design.html:1671` (إنشاء) | في انتظار البدء |
| `wip` | `design.html:1851` | جاري التصميم |
| `awaiting_payment` | `design.html:1508` | بانتظار تحويل العميل |
| `approved` | `design.html:2002` | اعتماد التصميم |
| `rejected` | (يحتاج تأكيد) | رفض التصميم |

### 3.2 `shipStage`
**المصدر:** `shipping.html`, `shipping-lite.html`, `shipping-legacy.html`

| القيمة | الكتابة |
|--------|---------|
| `ready` | `shipping.html:1067` |
| `wait_delivery` | `shipping.html:1067`, `shipping-lite.html:800` |
| `wait_collection` | تعريف موجود في dashboards، الكتابة غير مؤكدة |
| `collected` | `shipping.html:1128` |
| `completed` | `shipping.html:1263` |
| `returned` | `shipping-accounts.html:1272` |

### 3.3 `approvalStatus`
**ليست order-level** — تخص `financial_ledger` entries. لا تتعارض مع `order.stage`.

### 3.4 `returnStatus` / `paymentStatus`
- `paymentStatus`: `pending` / `paid` / `partial` / `returned`
- استخدامها في حسابات `calcRem()` فقط، لا قرارات stage.

---

## 4) انتهاكات RULE W1 — مؤكَّدة بالشيفرة

### 🔴 V1 — `design.html:1993` — قرار stage transition مبني على sub-status
```javascript
if(o.designStage==='awaiting_payment'&&remaining>0){
  return toast(`⛔ يجب تحويل الباقي أولاً (${fn(remaining)} ج)`,'err');
}
```
**التحليل:** ده يمنع `design → printing` بناءً على `designStage` بدل ما يعتمد على `remaining` فقط. الـ `designStage` هنا مكرر لمعلومة موجودة في `remaining`.
**الشدة:** متوسطة (المنطق صحيح تشغيلياً، لكن العَلَم `designStage` زائد).

### 🔴 V2 — `shipping-dashboard.html:342` — خلط بين `stage` و `shipStage` في الفلترة
```javascript
if(activeTab==='ready')
  data=allOrders.filter(o=>o.stage==='production'||(o.stage==='shipping'&&(!o.shipStage||o.shipStage==='ready')));
```
**التحليل:** الفلتر `ready` يجمع stages مختلفة. مقبول كـ UX، لكن يخفي حقيقة أن النظام له stage واحد لكل أوردر.
**الشدة:** منخفضة (واجهة فقط).

### 🔴 V3 — `ai-context.js:252-254` — قراءة قيم stage غير موجودة
```javascript
const shipped = orders.filter(o => ['shipped','delivered'].includes(o.stage));
const inTransit = orders.filter(o => o.stage === 'shipped').length;
const delivered = orders.filter(o => o.stage === 'delivered').length;
```
**التحليل:** `'shipped'` و `'delivered'` **لا تُكتب في أي مكان** كقيم لـ `order.stage`. هذه القيم تخص `shipStage`. المقاييس هنا تُرجع صفر دائماً.
**الشدة:** متوسطة (analytics معطلة بصمت).

### 🔴 V4 — `clients.html:4298` — bulk archive بدون audit trail مالي
```javascript
chunk.forEach(o=>batch.update(db.collection('orders').doc(o._id),{
  stage:'archived',
  'stageEnteredAt.archived':now2,
  timeline:[...],
  updatedAt:firebase.firestore.FieldValue.serverTimestamp()
}));
await batch.commit();
```
**التحليل:** الـ batch يفحص `paid` (سطر 4290-4291) لكن:
- ❌ لا يفحص `costItems`
- ❌ لا يُسجَّل في `financial_ledger`
- ❌ لا يُرسَل event عبر `dispatchFinancialEvent`

**انتهاك:** RULE 5 (Full Audit) + احتمال RULE 2.
**الشدة:** عالية (audit trail مكسور للأرشفة الجماعية).

### 🔴 V5 — `shipping-legacy.html` — كود قديم لسه فيه تعديلات stage
**3036 سطر** من الـ HTML/JS، يكتب في `stage` (سطر 2656) ويستخدم `buildStageAdvance`. بعد PR #527 (توحيد الشحن) — هل ده ملف legacy فعلاً ولا لسه فيه نقاط دخول؟ يحتاج فحص استخدام (هل أي صفحة تربط له؟).
**الشدة:** متوسطة (احتمال كود ميت ضخم).

---

## 5) ثغرات Audit Trail المالي

| الانتقال | حدث مالي متوقع | مُسجَّل؟ |
|---|---|---|
| إنشاء أوردر مع deposit | `CUSTOMER_PAYMENT` | ✅ `design.html:1670-1707` |
| دفع لاحق (CS) | `CUSTOMER_PAYMENT` | ✅ `design.html:2078-2101` |
| `shipping → archived` (طلب واحد) | `SHIPPING_SETTLEMENT` | ✅ `shipping.html:1225`, `shipping-accounts.html:1086` |
| **bulk archive (أدمن)** | حدث ختامي | ❌ **مفقود** |
| reorder من أرشيف | إنشاء أوردر جديد | ✅ (الأوردر الجديد يولِّد deposit event عادي) |

---

## 6) عناصر "Orphan" (معرَّفة لكن لا تُستخدم)

| العنصر | الموقع | الحالة |
|--------|--------|--------|
| `stage = 'cancelled'` | `orders.js:34` | معرَّف، **لا تُكتب** أبداً |
| `stage = 'shipped'` / `'delivered'` (في `ai-context.js`) | `ai-context.js:252-254` | تُقرأ كأنها قيم stage، **لكنها قيم shipStage** |
| `shipping-legacy.html` | الملف بأكمله | يحتاج فحص استخدام |

---

## 7) الأدوار → المراحل (مصفوفة الصلاحيات)

**المصدر:** `orders.js:37-43`

| الدور | design→printing | printing→production | production→shipping | shipping→archived | Bulk Admin |
|------|---|---|---|---|---|
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `operation_manager` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `customer_service` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `graphic_designer` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `design_operator` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `production_agent` | ❌ | ✅ | ✅ | ❌ | ❌ |
| `shipping_officer` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `wallet_manager` | ❌ | ❌ | ❌ | ❌ | ❌ |

**ملاحظة:** الـ enforcement يحصل **داخل `buildStageAdvance()`** عبر `STAGE_PERMISSIONS`. الـ UI يستدعيه فيُحترم — ✅ تصميم سليم.

---

## 8) نقاط تحتاج تحقيق إضافي (Open Questions)

| السؤال | الموقع | لماذا مهم |
|--------|--------|----------|
| Q1. هل `shipping-legacy.html` يُربط من أي صفحة حالياً؟ | كل الـ HTML | لو لا → مرشح حذف ضخم (~3036 سطر) |
| Q2. هل `stage='cancelled'` كانت feature متروكة، أم يجب تفعيلها؟ | `orders.js:34` | لو متروكة → احذف من `STAGES` |
| Q3. هل `archive.html` فيها revert إلى أي مرحلة سابقة بشكل غير مقيَّد؟ | `archive.html` (كامل) | تحتاج فحص الـ revert UI |
| Q4. هل `ai-context.js` لسه مستخدم في الـ AI features؟ أم dead code؟ | كل ملفات `ai-*.js` | لو مستخدم → يجب تصحيح القيم؛ لو لا → حذف |
| Q5. هل bulk archive (clients.html) فيها use case تشغيلي حقيقي، أم feature أدمن للطوارئ؟ | `clients.html:4290+` | يحدد ما إذا كان audit trail ضروري أم لا |

---

## 9) ما تم التحقق منه vs ما لم يتم

### ✅ تم التحقق (بقراءة الكود)
- قيم `order.stage` الست
- استخدام `buildStageAdvance` في 4 صفحات
- 5 انتهاكات W1 المذكورة (بالأسطر)
- bulk archive في `clients.html:4298`
- phantom stages في `ai-context.js:252-254`
- قيم `designStage` (`pending`, `wip`, `awaiting_payment`, `approved`)

### ⚠️ لم يتم التحقق الكامل (يحتاج فحص لاحق)
- كل قيم `shipStage` (تحققنا من 5، الباقي مذكور في documentation)
- استخدام `shipping-legacy.html` (مرشحات الحذف)
- آلية revert في `archive.html` بالتفصيل
- مدى استخدام ملفات `ai-*.js`

---

## 10) الخطوة التالية (مقترحة، تحتاج موافقة)

التقرير ده **تشخيصي فقط**. قبل أي تعديل، أقترح PR منفصل لكل بند من البنود التالية بترتيب الأولوية:

1. **P0 — V4 (bulk archive audit trail)**: إضافة `financial_ledger` entry لكل أوردر في الـ bulk archive (صغير، عالي القيمة).
2. **P1 — V3 (ai-context phantom stages)**: تصحيح قيم `stage` في `ai-context.js` لتطابق الواقع.
3. **P2 — Q1 (shipping-legacy)**: فحص استخدام `shipping-legacy.html` وحذفه لو غير مستخدم.
4. **P2 — Q4 (ai-*.js cleanup)**: فحص استخدام ملفات `ai-*.js`.
5. **P3 — V1 (designStage redundancy)**: تقييم إذا كان `designStage='awaiting_payment'` يضيف قيمة فوق `remaining > 0`.
6. **P3 — V2 (shipping-dashboard filter)**: مراجعة هل تبسيط الفلتر يحسن الـ UX.
7. **P4 — Q2, Q3, Q5**: فحوصات إضافية.

> **لا تنفيذ بدون موافقة المستخدم على كل بند على حدة (تطبيقاً لـ RULE G9 — Incremental Migration).**

---

**نهاية التقرير**
