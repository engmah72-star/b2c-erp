# 🔗 PROCESS INTEGRATION DESIGN — تصميم اندماج العمليات

> **النطاق:** توحيد المراحل التشغيلية الست في تدفّق واحد يدور حول الأوردر:
> **تصميم → طباعة → تنفيذ → شحن → أرشيف**، مع **الحسابات** كعمود فقري مالي يخترق كل مرحلة.
>
> **النوع:** وثيقة تصميم (Design Document) — **descriptive + proposal**. لا تنفيذ بعد.
> **Authority:** خاضعة لـ `CLAUDE.md` (الأعلى)، وتحت سقف **RULE E1** (Runtime Evolution Safety) — لا إعادة بناء، ترحيل تدريجي، قابل للـ rollback.
> **المراجع الملزِمة:** RULE PC1/PC2/PC3 · W1 · C1 · A1 · V1 · G10 · E1 · N1 · H1–H3.
> **يكمّل:** `PROCESS_CENTRIC_CHARTER.md` · `RUNTIME_OPERATING_MODEL.md`.

---

## 0) لماذا هذه الوثيقة؟ (المشكلة)

النظام **يملك بالفعل** عموداً فقرياً مركزياً للعمليات:

| الطبقة | المالك المركزي | الحالة |
|--------|----------------|--------|
| مصدر الحالة | `order.stage` (W1.1) | ✅ موجود |
| تعريف المراحل | `STAGES` في `orders.js:27` | ✅ موجود |
| الانتقالات | `buildStageAdvance/Revert` + `advanceOrderStageWithLock` (`orders.js`) | ✅ موجود |
| الأفعال | `orderActions.*` (`order-actions.js`) | ✅ موجود |
| المالية | `financial-sync-engine.js` (FSE) | ✅ موجود |
| الواجهة الموحَّدة | `shell.html` + `core/runtime-shell/*` (8 domains) | ✅ موجود (Phase 1) |

**لكن** التشغيل اليومي ما زال **page-driven** فعلياً: كل مرحلة تعيش في god page منفصلة
(`design.html`, `print.html`, `production.html`, `shipping.html`, `archive.html`, `accounts.html`)،
ولكل صفحة قائمتها وفلاترها وأزرارها. الموظف ينتقل **بين صفحات**، لا **بين مهام على نفس الأوردر**.

**الاندماج المطلوب** ليس إعادة كتابة، بل **ربط** هذه القطع الموجودة في تدفّق واحد متّصل،
بحيث يتبع الأوردر مساره من التصميم حتى الأرشيف **كوحدة واحدة**، والحسابات تُسجَّل تلقائياً عند كل انتقال.

> **المحك (PC3.5):** موظف جديد يفتح **رابطاً واحداً** ويعرف فوراً *ما المهمة التالية على هذا الأوردر* — بلا خريطة صفحات في رأسه.

---

## 1) المبدأ المعماري — الأوردر هو خط الأنابيب (Order = Pipeline)

```
                    ┌──────────────── ORDER (single entity) ────────────────┐
                    │  order.stage = المصدر الوحيد للحقيقة (W1.1 / C1.2)     │
                    └───────────────────────────────────────────────────────┘
   ┌─────────┐   ┌─────────┐   ┌──────────┐   ┌────────┐   ┌────────┐
   │ تصميم   │──▶│ طباعة   │──▶│ تنفيذ    │──▶│ شحن    │──▶│ أرشيف  │
   │ design  │   │ printing│   │production │   │shipping│   │archived│
   └────┬────┘   └────┬────┘   └────┬─────┘   └───┬────┘   └───┬────┘
        │             │             │             │            │
        ▼             ▼             ▼             ▼            ▼
   ┌───────────────────────────────────────────────────────────────┐
   │            💰 الحسابات (Accounting Spine) — FSE                 │
   │  CUSTOMER_PAYMENT · VENDOR_PAYMENT · SHIPPING_SETTLEMENT ·     │
   │  RETURN_LOSS · CUSTOMER_REFUND  →  wallets + financial_ledger  │
   └───────────────────────────────────────────────────────────────┘
```

**الفكرة الجوهرية:** المراحل الخمس ليست أنظمة منفصلة — هي **محطات على خط أنابيب واحد** (الأوردر).
الحسابات ليست المحطة السادسة، بل **العمود الفقري** الذي يلتقط الأثر المالي عند كل محطة (RULE 4: لا module يملك المال؛ FSE فقط).

**هذا تطبيق مباشر لـ:**
- **C1.1** — كل العمليات تدور حول `order`.
- **W1.3** — الصفحات = واجهات مختلفة لنفس الأوردر.
- **PC3.3** — Workflow-driven, not Page-driven.

---

## 2) العمود الفقري التشغيلي (Operational Spine) — موجود، لا يُعاد بناؤه

أي اندماج **يجب** أن يمرّ عبر هذه الطبقة المركزية الموجودة، بلا التفاف:

| الانتقال | الفعل المركزي (A1.2) | الـ guard | المصدر |
|----------|----------------------|-----------|--------|
| تصميم → طباعة | `orderActions.submitToPrinting()` | `validateStageRequirements(order,'design')` | `order-actions.js` |
| طباعة → تنفيذ | `orderActions.submitToProduction()` | specs + supplier checks | `order-actions.js` |
| تنفيذ → شحن | `orderActions.submitToShipping()` | costItems + product status | `order-actions.js` |
| شحن → أرشيف | `orderActions.archiveOrder()` | `buildArchiveSpec()` (دفع كامل + تسوية) | `order-actions.js` |
| أي ↔ أي (رجوع) | `buildStageRevert()` + reason | admin/role في `STAGE_PERMISSIONS` | `orders.js` |

**كل فعل يفرض عقد العملية (PC1.4):**
`تحقق صلاحية → تحقق شروط (validate*) → كتابة ذرية (writeBatch/tx) → audit (auditEntry/H3) → تسليم آمن → نتيجة موحَّدة { ok, errors, warnings, operationId }`.

> ⛔ **حد صريح:** الاندماج لا يضيف أي state جديد بجانب `order.stage` (W1.6 #1)، ولا أي workflow جانبي (C1.8).
> أي "تكامل" يحتاج حالة إضافية = إعادة تصميم.

---

## 3) العمود الفقري المالي (Accounting Spine) — نقاط الالتقاط

الحسابات تندمج عبر **الأحداث المالية فقط** (RULE 2)، تُلتقط عند المحطات لا تُحسب في الصفحات (RULE 1):

| المحطة / الحدث | Financial Event (FE) | الاتجاه | الأثر على wallet | متى يُطلق |
|----------------|----------------------|---------|------------------|-----------|
| إنشاء الأوردر + عربون | `CUSTOMER_PAYMENT` | in | credit | `createOrder()` |
| دفعة عميل (أي مرحلة) | `CUSTOMER_PAYMENT` | in | credit | `recordPayment()` |
| استرداد للعميل | `CUSTOMER_REFUND` | out | debit | `refundOrder()` |
| تكلفة تنفيذ/مورد | `VENDOR_PAYMENT` | out | debit | عند صرف دفعة مورد |
| مصروف شحن | `SHIPPING_EXPENSE` | out | debit | الشحن |
| تسوية شحن (شركة) | `SHIPPING_SETTLEMENT` | in | credit | أرشفة/تسوية الشحن |
| خسارة مرتجع | `RETURN_LOSS` | out | debit | المرتجعات |

**القاعدة الذهبية للاندماج المالي (C1.4 + G6):**
> كل أثر مالي لأي مرحلة يُكتب **حصراً** عبر `dispatchFinancialEvent()` / `addLedgerToBatch()` داخل **نفس الـ batch** الخاص بانتقال المرحلة (RULE 3).
> ❌ لا تُحسب أرصدة في `design.html` أو `production.html` أو `shipping.html`. هي **تقرأ** للعرض و**ترسل event** فقط (RULE 4).

**الربط السببي (H2.1):** عند الأرشفة/التسوية، كل ledger entry يحمل `operationId` + (إن وُجد) `causedByOperationId` / `reversalOf` — حتى يبقى المسار المالي قابلاً للتتبع عبر المحطات.

---

## 4) عقود التسليم بين المراحل (Handoff Contracts) — PC2.4

التسليم بين الأدوار **يقوده النظام**، لا قرار فردي. كل محطة تُسلّم للتالية عبر الفعل المركزي مع تمرير المستلِم:

| من | إلى | الدور المُسلِّم | الدور المُستلِم | يُمرَّر عبر |
|----|-----|----------------|------------------|------------|
| تصميم | طباعة | `graphic_designer` / `design_operator` | `production_agent`/المطبعة | `submitToPrinting({ nextAssigneeId, nextAssigneeName })` |
| طباعة | تنفيذ | `production_agent` | `production_agent` | `submitToProduction({...})` |
| تنفيذ | شحن | `production_agent` | `shipping_officer` | `submitToShipping({ nextAssigneeId })` |
| شحن | أرشيف | `shipping_officer` | — (terminal) | `archiveOrder()` |

**كل تسليم = timeline entry عبر `auditEntry()` (H3):** من سلّم، متى، لمن، بأي action.
الحقول التشغيلية للمالك (`designerId`, `printerId`, `productionAgent`, `shippingOfficerId`) تُضبط مركزياً في
`buildStageAdvance()` عبر `STAGE_OWNERSHIP` — **لا inline في الصفحة** (A1.4).

---

## 5) الواجهة المندمجة — Order Pipeline View (داخل الـ Shell)

الاندماج البصري يُبنى **فوق** الـ runtime shell الموجود (N1 + E1.6)، لا يستبدله:

### 5.1 المفهوم
رأس موحّد للأوردر — **Pipeline Stepper** — يظهر المحطات الخمس + شريط الحالة المالية، ويُحمَّل **داخل الـ workspace iframe** للـ shell:

```
┌─────────────────────────────────────────────────────────────────────┐
│  أوردر #1234 — أحمد محمد                          💰 متبقٍّ: 150 ج     │
│  ✏️ تصميم ──●── 🖨️ طباعة ──○── 🏭 تنفيذ ──○── 🚚 شحن ──○── 📁 أرشيف   │
│            (الحالية)                                                   │
├─────────────────────────────────────────────────────────────────────┤
│  [ الـ workspace للمرحلة الحالية — design.html?id=1234&embed=1 ]      │
│  + زر الفعل التالي الوحيد المسموح: "تسليم للطباعة" (canDo gated)      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 القواعد (إلزامية تحت E1)
1. **يُبنى خلف feature flag** (`process_pipeline_view`, افتراضي `false`) — E1.8.
2. **الـ Stepper view-only:** يعرض `order.stage` ويُبرز المحطة الحالية؛ **لا يكتب** أي شيء (L1.2).
3. **الانتقال = زر واحد** ينادي الفعل المركزي المناسب فقط (`navigatePage` / `orderActions.*`) — A1.5.
4. **gating بالصلاحيات:** الزر يظهر فقط إن `canDo(capability)` و `STAGE_PERMISSIONS` تسمح (P1.5) — الزر يُخفى قبل الضغط لا "error بعد الضغط".
5. **كل محطة تُحمَّل كـ god page موجودة** بـ `?embed=1` (N1.2) — الصفحات تبقى تعمل standalone كما هي.
6. **لا hash routing داخلي** — استخدم query string (N1.3).
7. **الرجوع للمرحلة السابقة** للأدوار المخوّلة فقط، عبر `buildStageRevert()` مع `reason` (audit).

### 5.3 ما لا يتغيّر (E1.1)
- ❌ لا حذف/كسر `design.html`/`print.html`/`production.html`/`shipping.html`/`archive.html`.
- ❌ لا تغيير `order.stage` schema ولا الـ central actions.
- ❌ لا فرض الـ pipeline view على المستخدمين قبل التحقق من الـ usage.
- ✅ الموظف يقدر يطفّي الـ flag ويرجع للتشغيل الحالي فوراً (Reversible).

---

## 6) خطة الترحيل التدريجي (تحت E1.3 — alongside, not instead-of)

```
النظام المستقر الحالي (god pages + shell)
        ↓
Phase 0 — هذه الوثيقة (تعريف + موافقة)            ← G10 / RULE 7
        ↓
Phase 1 — Pipeline Stepper component (view-only, flagged)
          يقرأ order.stage فقط، يُحمَّل في workspace
        ↓
Phase 2 — توحيد زر "الفعل التالي" عبر orderActions.* داخل الـ stepper
          (يستبدل أزرار submit المبعثرة تدريجياً — page-by-page)
        ↓
Phase 3 — شريط الحالة المالية في الرأس (read-only من FSE projection)
        ↓
Phase 4 — اعتماد role-based default domain في shell.html (E1.5)
        ↓
Phase 5 — Usage validation → تثبيت الحوكمة → ترحيل آمن
        ↓
Legacy Retirement — فقط بعد تغطية كاملة ومُختبَرة (لا قبل)
```

**كل Phase = PR واحد، concern واحد، قابل للـ revert بملف واحد (L1.5 / G9).**

---

## 7) اختبار القبول (Acceptance Gate)

### 7.1 أسئلة الحوكمة الستّ (BUSINESS DNA)
| السؤال | الإجابة |
|--------|---------|
| يخدم أحد الأطراف الأربعة؟ | ✅ الشركة + الموظفون (تشغيل داخلي) |
| يحافظ على Single Source of Truth المالي؟ | ✅ FSE فقط، لا حساب في الصفحات |
| يزيد دقة وشفافية العمليات؟ | ✅ مسار موحّد + audit عند كل محطة |
| يحترم حدود الصلاحيات (RULE 8)؟ | ✅ `canDo`/`canSee`/`STAGE_PERMISSIONS` |
| قابل للتدقيق (Audit Trail)؟ | ✅ timeline (H3) + ledger (FSE) |
| ضمن نطاق ERP الداخلي بلا توسّع؟ | ✅ لا طرف خامس، لا marketplace |

### 7.2 أسئلة E1.5 (قبول الـ PR)
| السؤال | المطلوب | التصميم |
|--------|---------|---------|
| يكسر التشغيل الحالي؟ | ❌ لا | god pages تعمل كما هي |
| يغيّر workflow مستقرة؟ | ❌ لا | نفس `orderActions.*` |
| rollback سهل؟ | ✅ نعم | flag toggle + revert |
| feature flag موجود؟ | ✅ نعم | `process_pipeline_view` |
| legacy تعمل؟ | ✅ نعم | alongside |
| incremental؟ | ✅ نعم | 5 phases |

### 7.3 أسئلة PC1.7 / W1.6 (الفلسفة)
| السؤال | الإجابة |
|--------|---------|
| القاعدة تبقى في الكود المركزي؟ | ✅ نعم — لا منطق في الـ stepper |
| المستخدم *ينفّذ* فقط؟ | ✅ نعم — يضغط زر واحد |
| يضيف state جديدة بجانب `order.stage`؟ | ❌ لا |
| يفصل منطق عن الأوردر؟ | ❌ لا |
| يجبر الموظف على خطوة إضافية بلا قيمة؟ | ❌ لا — يقلّل الخطوات |

---

## 8) ما هو **خارج النطاق** صراحةً (E1.1 / L1.7)

- ❌ إعادة كتابة أي god page أو دمجها في ملف واحد ضخم (G5/G7 budget).
- ❌ تغيير `STAGES` أو `order.stage` schema أو إضافة مرحلة جديدة.
- ❌ إضافة state machine / workflow engine خارجي (W1.4).
- ❌ نقل أي منطق مالي خارج FSE.
- ❌ حذف الـ legacy sidebars أو فرض الـ shell على الجميع دفعة واحدة.
- ❌ أي طرف خامس خارج الأطراف الأربعة (BUSINESS DNA SCOPE).

---

## 9) الخلاصة

الاندماج المطلوب **متاح بالكامل فوق البنية الحالية**:
- العمود الفقري التشغيلي (`order.stage` + `orderActions.*` + builders) **موجود**.
- العمود الفقري المالي (FSE + الأحداث) **موجود**.
- الواجهة الموحَّدة (runtime shell + 8 domains) **موجودة (Phase 1)**.

المتبقّي هو **طبقة ربط بصرية رفيعة** (Pipeline Stepper) تُظهر الأوردر كخط أنابيب واحد،
وتنادي الأفعال المركزية الموجودة — **بلا منطق جديد، بلا state جديد، بلا كسر للقائم**،
تحت feature flag وترحيل تدريجي (E1).

> **النتيجة:** الموظف يتابع الأوردر من التصميم للأرشيف في مسار واحد، والحسابات تُسجَّل تلقائياً عند كل محطة —
> *Evolve the Runtime, Do Not Disrupt the Business.*

---

**التالي (يحتاج موافقتك — RULE 7 / G10):**
الموافقة على هذا التعريف لبدء **Phase 1** (Pipeline Stepper component، view-only، خلف flag).
لا يبدأ أي تطوير قبل موافقتك على النقاط أعلاه.
