# CLAUDE.md — تعليمات عمل Claude Code

---

# 🧬 BUSINESS DNA — الدستور الاستراتيجي

> **هذا الدستور أعلى من أي قاعدة تقنية. كل قرار تقني يجب أن يخدم هذه الرؤية.**

## الحقيقة الأساسية عن الشركة

شركة كروت شخصية تعمل في مجال الطباعة والتصميم والدعاية والإعلان.

**الهدف:** بناء نظام ERP داخلي متكامل يخدم **الشركة** في إدارة عملياتها مع **عملائها وموظفيها ومورديها** بكفاءة وشفافية كاملة.

**النطاق محدّد بدقة — النظام لـ 4 أطراف فقط:**

1. **الشركة** (العمليات الداخلية: الطلبات، التصميم، الإنتاج، الشحن، المحاسبة)
2. **العملاء** (طلباتهم، حساباتهم، تواصلهم)
3. **الموظفين** (مرتباتهم، عمولاتهم، أدائهم، صلاحياتهم)
4. **الموردين** (مشترياتهم، مدفوعاتهم، حساباتهم)

**عقلية التفكير المعتمدة:**
`Internal ERP + Operational Excellence + Financial Discipline`
**وليس:** `Marketplace / Network Platform / Public Service`

---

## VISION

نظام ERP داخلي متكامل يحقق:

| المحور | الهدف |
|--------|------|
| العمليات | أتمتة دورة الطلب من البداية للنهاية |
| المحاسبة | مصدر واحد للحقيقة المالية (Single Source of Truth) |
| الموظفون | إدارة شفافة للمرتبات والعمولات والصلاحيات |
| الموردون | تتبع كامل للمشتريات والمدفوعات والأرصدة |
| العملاء | تجربة منظمة وتاريخ كامل لكل طلب وتواصل |

---

## STRATEGIC GOAL — Operational Excellence

التركيز على إتقان العمليات الداخلية، لا على التوسع الخارجي:

- **انضباط مالي:** كل قرش له مصدر ومستند وأثر محاسبي
- **شفافية تشغيلية:** كل طلب، كل دفعة، كل مرتب — مُسجَّل ومُتتبَّع
- **كفاءة الموظفين:** أدوار واضحة، صلاحيات محدودة، أداء قابل للقياس
- **علاقات موردين منظمة:** أرصدة دقيقة، دفعات موثقة، تاريخ شامل
- **خدمة عملاء احترافية:** بيانات دقيقة، تواصل منظم، حسابات شفافة

---

## SYSTEM SCOPE — الأطراف الأربعة فقط

النظام يخدم **هؤلاء فقط**:

| الطرف | ما يحصل عليه |
|------|--------------|
| **الشركة** | لوحة تحكم، تقارير، إدارة كاملة |
| **العملاء** | حساباتهم، طلباتهم، فواتيرهم |
| **الموظفون** | بروفايلهم، مرتباتهم، مهامهم حسب الدور |
| **الموردون** | حساباتهم، فواتيرهم، أرصدتهم |

**خارج النطاق صراحةً:**
- ❌ Marketplace / منصة مفتوحة
- ❌ ربط مطابع خارجية أو مصممين مستقلين
- ❌ شركاء مدن أو محافظات
- ❌ مزودي خدمات خارجيين
- ❌ أي طرف رابع غير الأربعة أعلاه

---

## 🚦 SYSTEM DESIGN RULES — أسئلة الحوكمة الستة

**أي قرار داخل النظام يجب أن يمر على هذه الأسئلة:**

1. هل هذا القرار يخدم أحد الأطراف الأربعة (الشركة / العملاء / الموظفين / الموردين)؟
2. هل هذا القرار يحافظ على Single Source of Truth للبيانات المالية؟
3. هل هذا القرار يزيد دقة العمليات الداخلية وشفافيتها؟
4. هل هذا القرار يحترم حدود الصلاحيات (RULE 8 — Data Access Boundaries)؟
5. هل هذا القرار قابل للتدقيق والمراجعة (Audit Trail كامل)؟
6. هل هذا القرار يبقى ضمن نطاق الـ ERP الداخلي بدون توسعات خارج الـ 4 أطراف؟

> **إذا كانت الإجابة "لا" على أي سؤال → اعتبر القرار ناقصًا وأعد التصميم.**

---

## 🧠 OPERATING MODE — عقلية Claude الدائمة

عند اقتراح أي شيء، تعمل بعقلية:

- **ERP Architect**
- **Operations Engineer**
- **Financial Systems Designer**
- **Internal Tools Builder**
- **Data Integrity Guardian**

**وليس** بعقلية مصمم Marketplace أو منصة عامة. التركيز على **إتقان الداخل**، لا التوسع للخارج.

---

## 📐 EXECUTION RULE — اختبار الجودة الداخلية

أي Feature جديدة يجب أن تجتاز هذه الاختبارات:

| المعيار | السؤال |
|---------|--------|
| **الانتماء** | هل تخدم أحد الأطراف الأربعة فقط؟ |
| **التكامل** | هل تتكامل مع Accounting Core و RULE 1-8؟ |
| **التدقيق** | هل تُسجَّل كل عملية في `financial_ledger` أو audit log مناسب؟ |
| **الصلاحيات** | هل تحترم Data Access Boundaries (RULE 8)؟ |
| **الاستقرار** | هل لا تكسر أي صفحة قائمة (RULE 6)؟ |

> **أي Feature لا تجتاز هذه الاختبارات → أعد تصميمها قبل التنفيذ.**
> **أي Feature تخدم طرفاً خارج الأربعة → مرفوضة استراتيجياً.**

---

## الفرع الأساسي للإنتاج
الموقع يعمل من فرع `main`. أي تعديل لا يُمرج على `main` لن يظهر للمستخدمين.

## سير العمل الإلزامي
1. طوّر التعديلات على الفرع المخصص للجلسة (feature branch)
2. ادفع (push) التعديلات إلى الفرع
3. **أنشئ Pull Request فورًا** إلى `main`
4. **امرج الـ PR فورًا** إلى `main` بعد إنشائه — لا تترك التعديلات على الفرع فقط
5. تأكد من نجاح `git push origin main`

## تحذير مهم
- لا تكتب للمستخدم "تم التعديل" إلا بعد التأكد من دفع التغييرات على `main`
- إذا كانت هناك تعارضات (merge conflicts)، حلّها فورًا ولا تترك الدمج معلقًا

## الـ Repository
- `engmah72-star/b2c-erp`
- فرع الإنتاج: `main`

---

# قواعد الحوكمة — Enterprise Architecture Mode

هذه القواعد **إلزامية** على كل تطوير جديد. ممنوع كسرها.

---

## RULE 1 — SINGLE SOURCE OF TRUTH

لكل كيان مالي مصدر واحد فقط للرصيد. ممنوع حساب الأرصدة داخل الصفحات.

| الكيان | المصدر الوحيد |
|--------|--------------|
| الأرصدة المالية | Accounting Core فقط (`wallets`) |
| رصيد الموظف | Employee Financial Profile (`employee_payments`) |
| رصيد المورد | Supplier Financial Profile (`supplier_payments`) |
| رصيد العميل | Customer Financial Profile (`transactions_v2` + `orders`) |
| رصيد الشحن | Shipping Financial Profile (`shipping_settlements`) |

**ممنوع:** أي صفحة تحسب رصيداً من بيانات محلية أو تخزن نسخة منه.

---

## RULE 2 — EVENT DRIVEN ONLY

أي حركة مالية أو تشغيلية لا تعدل البيانات مباشرة.  
كل module ترسل event فقط عبر `dispatchFinancialEvent()` أو `addLedgerToBatch()`.

**Event types المعتمدة:**
```
CUSTOMER_PAYMENT       CUSTOMER_REFUND
VENDOR_PAYMENT         VENDOR_PAYMENT_REVERSAL
SALARY_PAYMENT         BONUS_PAYMENT          PENALTY       PAYROLL
SHIPPING_EXPENSE       SHIPPING_SETTLEMENT    SHIPPING_SETTLEMENT_REVERSAL
RETURN_LOSS            GENERAL_EXPENSE        WALLET_TRANSFER
```

**قبل إضافة event type جديد:** أضفه في `financial-sync-engine.js` في FE + LC + HANDLERS أولاً.

---

## RULE 3 — ATOMIC WRITES ONLY

**ممنوع تماماً:**
```javascript
// ❌ sequential
await updateDoc(walletRef, {...});
await addDoc(collection(db,'transactions_v2'), {...});
await addDoc(collection(db,'financial_ledger'), {...});

// ❌ chained .then()
updateDoc(ref).then(() => addDoc(col, data)).then(() => addDoc(col2, data2));
```

**المسموح فقط:**
```javascript
// ✅ writeBatch — all or nothing
const batch = writeBatch(db);
batch.update(walletRef, {...});
batch.set(txRef, {...});
addLedgerToBatch(batch, db, FE.EVENT_TYPE, {...});
await batch.commit();

// ✅ dispatchFinancialEvent — engine handles the batch internally
await dispatchFinancialEvent(db, FE.VENDOR_PAYMENT, payload);
```

---

## RULE 4 — NO MODULE OWNS MONEY

أي صفحة (shipping، design، print، employees، suppliers...) لا تملك أرصدة.  
الأرصدة يملكها فقط **Accounting Core** (`wallets` collection).

- الصفحات **تقرأ** الرصيد للعرض فقط.
- الصفحات **ترسل events** للخصم أو الإضافة.
- الصفحات لا تحتفظ بنسخة من الرصيد.

---

## RULE 5 — FULL AUDIT

كل حركة مالية تُسجَّل في `financial_ledger` بالحقول التالية كحد أدنى:

```javascript
{
  eventType,      // نوع الحدث
  type,           // 'income' | 'expense' | 'reversal' | 'transfer'
  direction,      // 'in' | 'out'
  amount,
  walletId, walletName,
  // الكيان المرتبط (حسب السياق):
  orderId, clientId, clientName,
  employeeId, employeeName,
  vendorId, vendorName,
  // من سجّل:
  createdBy, createdByName, createdAt,
  isDeleted: false, editHistory: [],
}
```

---

## RULE 6 — BACKWARD COMPATIBILITY

أي feature جديدة لا تكسر الموجود.

- **Enhance, never replace** — أضف بجانب الموجود لا بدلاً منه.
- لو غيّرت بنية collection → هاجر البيانات القديمة أولاً.
- لو غيّرت event type → احتفظ بالقديم وأضف الجديد.
- اختبر الصفحات القائمة بعد أي تعديل على `financial-sync-engine.js`.

---

## RULE 7 — NEW MODULE POLICY

قبل تطوير أي module جديد، عرّف الآتي أولاً (في رسالة للمستخدم للموافقة):

```
1. Entity Profile    — ما هو الكيان؟ ما حقوله الأساسية؟
2. Events            — ما الأحداث التي يُصدرها؟ (EVENT_TYPE + payload)
3. Accounting Impact — أي collections تتأثر؟ أي محافظ؟ في أي اتجاه؟
4. Dashboard Impact  — ما الأرقام التي تتغير في لوحة التحكم؟
5. Reversal Logic    — كيف يُلغى كل حدث؟ ما أثر العكس؟
```

لا يبدأ التطوير إلا بعد موافقة المستخدم على التعريف.

---

## RULE 8 — DATA ACCESS BOUNDARIES (Privacy by Role)

**البيانات الحساسة مرتبطة بدور وظيفي ثابت. ممنوع كسر هذا الفصل.**

### 8.1 رقم تليفون العميل (`client_phone`)
| الدور | يرى؟ |
|------|------|
| `admin` | ✅ |
| `customer_service` | ✅ |
| `operation_manager` | ✅ |
| `shipping_officer` | ✅ (مطلوب للتوصيل) |
| `graphic_designer` | ❌ |
| `design_operator` | ❌ |
| `production_agent` | ❌ |
| `wallet_manager` | ❌ |

**التطبيق:** للأدوار غير المصرّحة، الرقم يظهر مُقنَّعاً (`010****567`) أو يُحذف من الواجهة كلياً. لا يظهر في:
- زر اتصال / WhatsApp
- export / تقارير
- console.log أو DevTools (مغطّى بـ Firestore rule)

### 8.2 بيانات التصميم (`design_data`)
يشمل: `designFiles[]`, `designFileUrl`, `designFileNote`, `designImageUrl`, `printFinalUrl`، ملاحظات المصمم، revision history.

| الدور | يرى؟ |
|------|------|
| `admin` | ✅ |
| `customer_service` | ✅ |
| `graphic_designer` | ✅ |
| `design_operator` | ✅ |
| `production_agent` | ✅ (الملف النهائي فقط للطباعة) |
| `operation_manager` | ❌ (يرى metadata فقط: الحالة، السعر، التاريخ) |
| `shipping_officer` | ❌ |
| `wallet_manager` | ❌ |

### 8.3 آلية الحماية (Defense in Depth)
1. **UI Layer** — `shared.js → canSee('client_phone')` / `canSee('design_data')` يخفي الحقول من DOM
2. **Firestore Rules** — `firestore.rules` تمنع القراءة على collections الحساسة لمن ليس له الصلاحية
3. **Audit Log** — أي وصول لرقم عميل من غير CS يُسجَّل في `access_audit` collection (اختياري — يُفعَّل لاحقاً)

### 8.4 قواعد التطوير الجديد
- **ممنوع** عرض `clientPhone` / `phone1` / `phone2` بدون تمرير القيمة عبر `maskPhone(phone, role)` أو حماية `canSee('client_phone')`.
- **ممنوع** عرض `designFiles[]` أو `designFileNote` بدون `canSee('design_data')`.
- **ممنوع** إضافة دور جديد بدون تحديث `DEFAULT_PERMISSIONS` في `shared.js`.
- عند إضافة حقل حساس جديد → أضفه إلى `DEFAULT_PERMISSIONS` **قبل** استخدامه في أي صفحة.
- ممنوع تكرار `DEFAULT_PERMISSIONS` داخل ملفات HTML — `shared.js` هو المصدر الوحيد.

---

## RULE W1 — WORKFLOW SIMPLICITY (ميثاق بساطة الـ Workflow)

> **هذه القاعدة فوق كل اعتبار معماري. النظام للتشغيل اليومي، ليس لعرض هندسي.**

### W1.1 — مصدر الحالة الوحيد
`order.stage` هو **المرجع الرسمي الوحيد** لحالة الطلب. أي صفحة، أي قرار، أي query → يعتمد على `stage` فقط.

### W1.2 — الحالات الفرعية مساعِدة فقط
الحالات التالية **مساعِدة**، وليست مصادر قرار رئيسية:

| الحقل | الدور |
|------|------|
| `shipStage` | تفاصيل داخلية لمرحلة الشحن فقط |
| `productStatus` (داخل `products[]`) | تتبع منتج بعينه داخل الأوردر |
| `approvalStatus` | حالة موافقة العميل على التصميم |
| `returnStatus` | حالة المرتجع لو وُجد |

**ممنوع:** أي حالة فرعية تتعارض مع `order.stage` أو تُستخدم كبديل عنه في اتخاذ القرار.

### W1.3 — كل شيء يدور حول الـ Order
- الصفحات = **واجهات مختلفة لنفس الـ Order** حسب الدور والمرحلة.
- ممنوع بناء logic منفصل لكل صفحة.
- ممنوع تكرار بيانات الأوردر في collections مساعدة.

### W1.4 — ممنوع التعقيد الزائد
**ممنوع تماماً:**
- ❌ State machines معقدة أو nested status systems
- ❌ Workflow engines خارجية
- ❌ مراحل إضافية بدون فائدة تشغيلية مباشرة
- ❌ تحويل النظام لمجموعة أنظمة منفصلة

### W1.5 — أولوية التشغيل قبل المعمارية
الأولوية الأبدية:
1. سرعة التشغيل
2. تقليل الضغطات
3. سهولة الاستخدام
4. وضوح الحالة الحالية
5. تقليل الأخطاء البشرية

### 🥇 القاعدة الذهبية
> **لو الإضافة هتخلي الموظف:**
> - يتوه
> - يضغط أكثر
> - يفتح صفحات أكثر
> - يغيّر حالات أكثر
>
> **→ الإضافة خاطئة. أعد التصميم.**

### W1.6 — اختبار قبول أي feature جديد
قبل أي تطوير، أجب على الأسئلة الأربعة:

1. هل يضيف **حالة جديدة** بجانب `order.stage`؟ → ❌ ارفض
2. هل يفصل **منطق منفصل** عن الـ Order؟ → ❌ ارفض
3. هل يجبر الموظف على **خطوة إضافية** بدون قيمة تشغيلية مباشرة؟ → ❌ ارفض
4. هل يعرض **نفس البيانات** بشكل أوضح/أسرع لنفس الـ Order؟ → ✅ اقبل

---

## RULE C1 — CENTRALIZATION ENFORCEMENT (ميثاق المركزية)

> **الأولوية القصوى للنظام الحالي: الحفاظ على المركزية ومنع تشتت الـ Logic أو البيانات أو الحالات.**
>
> النظام يعمل ككيان موحد، **وليس** مجموعة أنظمة منفصلة داخل نفس المشروع.
> هذه القاعدة تُعزِّز RULE 1 + RULE 2 + RULE 4 + RULE W1 + RULE G6.

### C1.1 — الـ Order هو المركز
كل العمليات تدور حول `order`:
- التصميم، الطباعة، التنفيذ، الشحن، التحصيل، المرتجعات، الملفات، الـ logs، الأحداث المالية
- كلها أجزاء **مرتبطة بنفس الـ Order**.

**ممنوع:** بناء workflow مستقل أو state مستقل لكل قسم.

### C1.2 — مصدر حالة واحد فقط
الحالة الرسمية الوحيدة = `order.stage`. (تطبيق صريح لـ W1.1)

الحالات التالية مساعِدة فقط، **ممنوع تتعارض مع `order.stage`:**
- `shipStage`
- `approvalStatus`
- `productStatus`
- `returnStatus`

### C1.3 — Central Business Logic
**ممنوع:** كتابة business logic داخل الصفحات بشكل عشوائي.

أي عملية أساسية تمر عبر:
- **centralized actions** — مثل `orderActions.submitToPrinting()`, `orderActions.completeShipping()`, `orderActions.archiveOrder()`
- **centralized validators** — قواعد التحقق في مكان واحد
- **centralized financial engine** — `financial-sync-engine.js`

> **التطبيق:** الـ stage transitions حالياً مُمَركَزة عبر `buildStageAdvance()` / `buildStageRevert()` في `orders.js`. أي action جديد يجب أن يضاف إلى نفس الطبقة، لا يُكتب inline داخل الصفحة.

### C1.4 — Central Financial Authority
كل كتابة مالية تمر **فقط** عبر `financial-sync-engine.js`. (تطبيق صريح لـ RULE 2 + RULE 4 + RULE G6)

**ممنوع تماماً:**
- ❌ direct ledger writes
- ❌ financial duplication
- ❌ bypassing financial engine

**أي عملية مالية بدون audit trail = violation خطير.**

### C1.5 — منع تكرار البيانات
لكل معلومة **مصدر واحد فقط للحقيقة**.

**ممنوع تكرار:**
- حالة الطلب في عدة أماكن
- بيانات العميل
- التكلفة
- الحسابات المالية
- status logic

### C1.6 — منع State Chaos
**ممنوع:**
- ❌ Phantom Stages (قيم تُقرأ ولا تُكتب)
- ❌ Magic Strings (قيم stage غير معرَّفة في `STAGES`)
- ❌ Hidden Statuses (حالات تُكتب ولا تُستخدم)
- ❌ كود غير مستخدم فعلياً

كل stage يجب أن يكون: **واضح + مستخدم + موحَّد + قابل للتتبع**.

### C1.7 — Central UI Behavior
المستخدم يجب يشعر أنه يستخدم **نظاماً واحداً موحَّداً**.

يجب توحيد:
- الجداول
- الـ actions / الأزرار
- الـ status badges
- الرسائل
- الـ dialogs
- الـ navigation

### C1.8 — الصفحات = Views لا أنظمة
الصفحات **ليست أنظمة منفصلة** — هي views مختلفة لنفس البيانات المركزية.

**ممنوع:**
- ❌ duplicate workflows
- ❌ page-specific business rules
- ❌ hidden logic داخل صفحات منفصلة

### C1.9 — اختبار قبول التعديلات (Quality Gate)
أي تعديل جديد **يجب** يحقق كل النقاط الست:
1. تقليل التعقيد
2. **زيادة المركزية**
3. تقليل التكرار
4. توحيد السلوك
5. تقليل احتمالات التضارب
6. تحسين سهولة الصيانة

### 🚫 القاعدة النهائية (الرفض المباشر)
**أي تعديل يفعل أياً مما يلي = مخالفة مباشرة لفلسفة النظام ويُرفض:**
- يوزع الـ Logic
- يكرر البيانات
- يخلق state إضافية
- يبني workflow جانبي
- يضع القرار في أكثر من مكان

---

## RULE U1 — UI CENTRALIZATION (ميثاق توحيد الواجهة)

> **النظام يجب أن يشعر المستخدم أنه منتج واحد موحَّد بصرياً وتشغيلياً.**
>
> هذه القاعدة تطبيق صريح لـ **C1.7 (Central UI Behavior)** على الطبقة البصرية.
> أي تكرار أو عشوائية في الـ UI = Technical Debt يجب تقليله تدريجياً.

### U1.1 — Central Design Tokens
كل القيم البصرية تُعرَّف **مرة واحدة فقط** كمتغيرات CSS في `shared.css`:
- الألوان (Colors)
- الخطوط (Typography)
- المسافات (Spacing)
- نصف القطر (Border Radius)
- الظلال (Shadows)
- z-index
- الانتقالات (Transitions)

**ممنوع:** تعريف تلك القيم داخل صفحات HTML أو في `<style>` blocks محلية.

### U1.2 — Central Colors
كل لون يُستخدم في النظام **يجب** أن يكون عبر CSS variable.

**ممنوع:**
- ❌ Hex codes عشوائية داخل الصفحات (`color:#ff3d6e`)
- ❌ Inline colors (`style="color:red"`)
- ❌ Duplicate palettes (نفس اللون تقريباً بـ hex مختلف: `#22d3ee` vs `#0fc` vs `#0bd1e9`)

**المسموح:**
```css
.btn-danger { color: var(--r); }
.cell-money.pos { color: var(--g); }
```

### U1.3 — Central Typography
الخط والأحجام والأوزان موحَّدة ومركزية.

**ممنوع:**
- ❌ `font-family` داخل الصفحات
- ❌ `font-size: 14px` عشوائي
- ❌ `line-height` مختلف بدون سبب موثَّق

**المسموح:** Token-based: `var(--fs-sm)`, `var(--fs-md)`, `var(--fw-bold)`.

### U1.4 — Central Components
العناصر المتكررة موحَّدة في `shared.css` كـ classes:

| Component | Class Pattern |
|-----------|---------------|
| Buttons | `.btn`, `.btn-sm`, `.btn-ghost`, `.btn-y`, `.btn-r`, `.btn-b` |
| Tables | `.tbl`, `.tbl-wrap` |
| Status Badges | `.bdg`, `.status-chip`, `.status-*` |
| Inputs | `.inp`, موحَّد |
| Modals | `.modal`, `.modal-card` |
| Cards | `.card` |

**ممنوع:** نسخ نفس الـ component بـ inline styles مختلفة في كل صفحة.

### U1.5 — Central Status Colors
ألوان الحالات **موحَّدة على مستوى النظام بالكامل**:

| Status | اللون | Token |
|--------|------|-------|
| success / paid / done | أخضر | `var(--g)` |
| warning / pending / partial | أصفر | `var(--y)` |
| error / returned / cancelled | أحمر | `var(--r)` |
| info / shipping | سماوي | `var(--c)` |
| design | بنفسجي | `var(--p)` |
| printing | برتقالي | `var(--o)` |
| production | وردي/أحمر | `var(--r)` (أو خاص) |
| archived | رمادي | `var(--dim2)` |

**ممنوع:** نفس الحالة بلونين مختلفين في صفحتين.

### U1.6 — منع الـ Inline Styling
**ممنوع تماماً:**
- ❌ `style="..."` عشوائي
- ❌ `<style>` blocks ضخمة داخل صفحات HTML بدون مبرر
- ❌ Page-specific styling بدون سبب حقيقي

**الاستثناءات المسموحة:**
- Dynamic styles مبنية من بيانات runtime (مثلاً `style="width:${pct}%"` لـ progress bar)
- Animation-specific keyframes مرتبطة بـ page-only feature

### U1.7 — تغيير واحد يؤثر على النظام بالكامل
**اختبار الجودة:** هل تغيير لون النظام / الخط / المسافات يتم من **مكان واحد فقط**؟
- ✅ نعم → التوكنز مركزية صحيحة
- ❌ لا → debt يجب إصلاحه

### U1.8 — البساطة قبل الاستعراض
المطلوب: **UI بسيط · واضح · مريح · سريع · متناسق**.

**ممنوع:**
- ❌ مؤثرات بصرية مبالغ فيها
- ❌ اختلافات بصرية بين صفحات لنفس النظام
- ❌ تصميم استعراضي بدون قيمة تشغيلية

### 🚫 القاعدة النهائية
**أي تطوير UI جديد يجب أن يحقق:**
1. Reuse مكوّن موجود في `shared.css` قبل إنشاء جديد
2. لو محتاج لون جديد → أضف token في `shared.css` أولاً
3. صفر inline `style=""` (إلا للحالات الديناميكية)
4. صفر hex codes متطابقة لتوكنز موجودة

**أي تكرار أو عشوائية بصرية = Technical Debt يُسجَّل ويُعالَج تدريجياً (RULE G9).**

---

## RULE V1 — CENTRAL VALIDATION (ميثاق توحيد التحقق)

> **كل Business Rule تُكتب مرة واحدة فقط.**
>
> هذه القاعدة تطبيق صريح لـ **C1.3 (Central Business Logic)** على طبقة الـ validation.
> أي validation مكرَّر داخل صفحة = Technical Debt يجب تقليله.

### V1.1 — مصدر التحقق الوحيد
كل قاعدة تحقق تشغيلية أو مالية تُعرَّف **مرة واحدة فقط** في:
- `orders.js` (validators على الأوردر، المراحل، الأرشفة، الدفعات)
- `financial-sync-engine.js` (validators على الأحداث المالية)
- `core/permissions-matrix.js` (validators على الصلاحيات)

**ممنوع:** كتابة validation منطقها يخص الأوردر/الدفعة/الانتقال داخل صفحة HTML.

### V1.2 — صيغة الـ Validator الموحَّدة
كل validator يجب أن يكون **دالة نقية** تُرجع:
```js
{ ok: boolean, errors: string[], warnings: string[] }
```
- **errors** → يمنع العملية نهائياً
- **warnings** → يحتاج تأكيد المستخدم (`bypassWarnings:true` للتجاوز)
- لا يكتب في Firestore — الـ caller يقرّر بناءً على النتيجة

### V1.3 — Validators الأساسية
| Validator | الموقع | الغرض |
|-----------|--------|--------|
| `validateStageRequirements()` | `orders.js` | شروط الانتقال بين المراحل |
| `buildStageAdvance()` | `orders.js` | validate + build للانتقال للأمام |
| `buildStageRevert()` | `orders.js` | validate + build للرجوع |
| `buildArchiveSpec()` | `orders.js` | validate + build للأرشفة (V4) |
| `validateOrder()` | `orders.js` | بيانات إنشاء أوردر جديد |
| `validatePayment()` | `orders.js` | تسجيل دفعة عميل/استرداد |
| `validateRefund()` | `orders.js` | عملية استرداد |

### V1.4 — pattern: validate vs build*Spec
- **`validate*()`** — تحقق نقي بدون build (للـ UI hints و pre-flight checks)
- **`build*Spec()`** — تحقق + بناء spec للكتابة (للعمليات الفعلية)

كلاهما يستخدم **نفس قواعد التحقق الداخلية** — لا تكرار.

### V1.5 — منع validation داخل الصفحات
**ممنوع تماماً:**
- ❌ `if (order.remaining > 0) toast(...)` داخل صفحة HTML
- ❌ `if (!order.shipSettled) ...` كقاعدة gating
- ❌ تكرار شروط الدفع/الأرشفة في كل صفحة

**المسموح:**
```js
const v = validatePayment({ order, amount, role });
if (v.errors.length) return toast(v.errors[0], 'err');
```

### V1.6 — Reusability
أي validator يخدم أكثر من صفحة → يجب أن يكون في `orders.js`.
لا توجد "validators خاصة بصفحة معينة" إلا للحالات النادرة جداً (UI-only validators بدون منطق business).

### 🚫 القاعدة النهائية
**Business Rules لا تُكتب داخل الصفحات.** يجب أن تكون:
1. مُعرَّفة مرة واحدة
2. قابلة لإعادة الاستخدام
3. مستقلة عن الـ UI
4. تُرجع نتيجة موحَّدة `{ ok, errors, warnings }`

**أي validation مكرَّر بين صفحتين = Technical Debt يجب توحيده.**

---

## RULE A1 — CENTRAL ACTIONS (ميثاق توحيد الأفعال)

> **الصفحات مجرد واجهات. القرار الحقيقي و workflow الحقيقي مركزي بالكامل.**
>
> هذه القاعدة تطبيق صريح لـ **C1.3 + C1.8** + **V1.5** على طبقة الـ orchestration.
> أي workflow transition مكتوب inline داخل صفحة = Technical Debt.

### A1.1 — مصدر الأفعال الوحيد
كل workflow action في النظام تُعرَّف **مرة واحدة فقط** في:
- `order-actions.js` (أفعال الأوردر: transitions, archive, payments)
- `financial-sync-engine.js → dispatchFinancialEvent()` (الكتابة المالية الذرّية)
- `orders.js → advanceOrderStageWithLock()` (transactions على المراحل)

**ممنوع:** كتابة workflow transition logic داخل صفحة HTML.

### A1.2 — Actions API
الـ actions الرسمية المتاحة عبر `orderActions`:

| Action | الغرض | يستدعي |
|--------|-------|--------|
| `submitToPrinting({db, orderId, ...})` | design → printing | `advanceOrderStageWithLock` |
| `submitToProduction({db, orderId, ...})` | printing → production | `advanceOrderStageWithLock` |
| `submitToShipping({db, orderId, ...})` | production → shipping | `advanceOrderStageWithLock` |
| `archiveOrder({db, orderId, ...})` | any → archived | `buildArchiveSpec` + batch |
| `recordPayment({db, orderId, amount, ...})` | تسجيل دفعة عميل | `validatePayment` + `dispatchFinancialEvent(CUSTOMER_PAYMENT)` |
| `refundOrder({db, orderId, amount, ...})` | استرداد للعميل | `validateRefund` + `dispatchFinancialEvent(CUSTOMER_REFUND)` |

### A1.3 — كل action يجب أن
1. **يتحقق من الصلاحية** (عبر validator أو STAGE_PERMISSIONS)
2. **يتحقق من validation** (errors تمنع، warnings تحتاج `bypassWarnings:true`)
3. **يكتب ذرياً** (transaction أو writeBatch)
4. **يضيف timeline entry** (audit trail)
5. **يمر عبر financial engine** عند وجود حدث مالي
6. **يُرجع نتيجة موحَّدة** `{ ok, errors, warnings, orderId, ... }`

### A1.4 — ممنوع داخل الصفحات
- ❌ `updateDoc(orderRef, { stage:'shipping', ... })` مباشرة
- ❌ `batch.set(ledgerRef, {...})` مباشرة (تجاوز FSE)
- ❌ workflow logic منفصل (مثلاً: "لو في design غيّر للـ printing")
- ❌ تكرار pre-flight checks (use validator)

### A1.5 — المسموح داخل الصفحات
- ✅ نداء action واحد: `await orderActions.submitToPrinting({...})`
- ✅ معالجة النتيجة: `if (!result.ok) toast(result.errors[0], 'err')`
- ✅ UI-only logic (modal opening, field validation للـ UX hints)

### A1.6 — قراءة-فقط مسموحة بدون action
الصفحات تستطيع `getDoc`/`onSnapshot` للقراءة بدون action. الـ actions للكتابة فقط.

### A1.7 — Extensibility
إضافة action جديد تتطلب:
1. تعريف الـ signature في `order-actions.js`
2. إضافته إلى جدول A1.2 أعلاه
3. (اختياري) إضافة validator مناسب في `orders.js`

### 🚫 القاعدة النهائية
**أي صفحة تكتب على `orders`/`wallets`/`financial_ledger` مباشرة بدون المرور بـ:**
- `orderActions.*`
- `dispatchFinancialEvent`
- `advanceOrderStageWithLock` / `buildArchiveSpec` + atomic batch

**= مخالفة مباشرة لـ A1 + C1.4 + G6 ويُرفض.**

---

## RULE C2 — CENTRAL CONSTANTS ENFORCEMENT (ميثاق توحيد الثوابت)

> **كل قيمة ثابتة (string literal) في النظام تأتي من مصدر واحد.**
>
> هذه القاعدة تطبيق صريح لـ **C1.5 (منع التكرار) + C1.6 (منع State Chaos)** على طبقة القيم الثابتة.
> أي magic string مكرَّر = Technical Debt يجب تحويله إلى constant.

### C2.1 — Constants الأساسية
الـ flat enums المعتمدة (كلها في `orders.js` و `financial-sync-engine.js`):

| Constant | الموقع | الغرض |
|----------|--------|--------|
| `ORDER_STAGES` | `orders.js` | قيم `order.stage` (`DESIGN`, `PRINTING`, `PRODUCTION`, `SHIPPING`, `ARCHIVED`, `CANCELLED`) |
| `USER_ROLES` | `orders.js` | الأدوار الـ 8 (`ADMIN`, `OPERATION_MANAGER`, ...) |
| `SHIPPING_METHODS` | `orders.js` | `COMPANY`, `PICKUP`, `COURIER` |
| `PAYMENT_TYPES` | `orders.js` | `CUSTOMER`, `REFUND`, `DISCOUNT` |
| `PRODUCT_STATUSES` | `orders.js` | حالات `products[].productStatus` |
| `SHIP_STAGES` | `orders.js` | قيم `order.shipStage` |
| `RETURN_STATUSES` | `orders.js` | حالات المرتجعات |
| `FE` (Event Types) | `financial-sync-engine.js` | أنواع الأحداث المالية |

### C2.2 — صيغة الاستخدام
```js
// ❌ ممنوع (Magic String)
if (order.stage === 'shipping') { ... }
if (role === 'graphic_designer') { ... }
if (order.shipMethod === 'company') { ... }

// ✅ المسموح (Centralized)
import { ORDER_STAGES, USER_ROLES, SHIPPING_METHODS } from './orders.js';
if (order.stage === ORDER_STAGES.SHIPPING) { ... }
if (role === USER_ROLES.GRAPHIC_DESIGNER) { ... }
if (order.shipMethod === SHIPPING_METHODS.COMPANY) { ... }
```

### C2.3 — ممنوع تكرار القيم
**ممنوع تماماً:**
- ❌ Magic strings مكررة (`if(stage === 'shipping')` في عدة ملفات)
- ❌ Hardcoded roles (`['admin','operation_manager']` في الـ HTML)
- ❌ Hardcoded shipping methods, payment types, event types
- ❌ تعريف enum محلي يكرر enum مركزي

### C2.4 — Single Source of Truth
كل constant **يُعرَّف مرة واحدة** في الملف المخصص له:
- ✅ `ORDER_STAGES` يُعرَّف في `orders.js` فقط — أي ملف آخر يستورده
- ❌ ممنوع `const STAGES = {...}` محلي في صفحة HTML

### C2.5 — إضافة قيمة جديدة
عند إضافة stage/role/payment-type جديد:
1. أضفه في الـ constant المركزي **أولاً**
2. أضفه في الـ object المرتبط (مثلاً `STAGES`, `STAGE_PERMISSIONS`)
3. حدّث الـ migration للأوردرات القديمة لو لزم
4. حدّث `firestore.rules` لو لزم
5. حدّث الـ audit/dashboard للقيمة الجديدة

### C2.6 — Backward Compatibility مع `STAGES`
`STAGES` الموجود في `orders.js` كائن metadata-rich (`label/ico/col/next/prev/page`).
`ORDER_STAGES` flat enum بنفس الـ keys → يطابق `Object.keys(STAGES)`.

**لا تعارض** — `ORDER_STAGES.SHIPPING === 'shipping' === STAGES.shipping.key`.

### 🚫 القاعدة النهائية
**أي string literal مكرَّر مرتين أو أكثر داخل النظام = Technical Debt يجب تحويله إلى constant مركزي.**

الترحيل من magic strings إلى constants يتم تدريجياً عبر PRs منفصلة (RULE G9).

---

## RULE F1 — FIREBASE PRINCIPLE (ميثاق Firebase = بنية تحتية)

> **Firebase بنية تحتية، ليس Architecture معقدة.**
>
> الهدف: السرعة + البساطة + الاستقرار + سهولة التطوير + التشغيل اليومي.
> ليس: design patterns مبالَغ فيها أو abstractions غير ضرورية.
> هذه القاعدة توحّد وتوسّع: RULE 1 + RULE 2 + RULE 3 + RULE G2 + RULE G4.

### F1.1 — Firebase كبنية تحتية مركزية
| الخدمة | المصدر الوحيد |
|--------|---------------|
| App / Auth / DB / Storage init | `core/firebase-init.js` (RULE G2) |
| Firestore data | `Firestore` هو المصدر الرسمي للحقيقة |
| Authentication | `core/firebase-init.js` → `auth` |
| Storage | `core/firebase-init.js` → `storage` |

**ممنوع:** أي صفحة تستدعي `initializeApp()` بـ config محلي.
**الاستثناء:** Secondary apps لإنشاء users جدد (employees.html) — pattern Firebase معتمد.

### F1.2 — Firestore = Single Source of Truth (تعزيز RULE 1)
- لا cache محلي للأرصدة أو الحالات
- لا "نسخة احتياطية" من البيانات في localStorage إلا لـ UI preferences
- التغييرات تنعكس فوراً عبر `onSnapshot`

### F1.3 — Collections منظمة، لا عشوائية
**كل collection جديد يجب:**
1. يخدم أحد الأطراف الـ 4 (شركة/عملاء/موظفين/موردين)
2. له ownership واضح (من يكتب؟ من يقرأ؟)
3. مُسجَّل في `firestore.rules`
4. له purpose واحد محدَّد — لا "general-purpose collections"

**ممنوع:**
- ❌ Collections لـ features غير مستخدمة
- ❌ Duplicate collections (مثل `clients_v2` بجانب `clients`)
- ❌ Collections بدون write rules صريحة

### F1.4 — Atomic Writes (تعزيز RULE 3)
- العمليات المرتبطة تُكتب في `writeBatch` واحد
- الحدث المالي يمر عبر `dispatchFinancialEvent()` (atomic داخلياً)
- لا `await` متسلسلة بين writes

### F1.5 — Financial Writes عبر FSE فقط (تعزيز RULE 2 + 4 + G6)
الـ collections التالية تُكتب **فقط** عبر `financial-sync-engine.js`:
- `wallets`
- `transactions_v2`
- `financial_ledger`
- `employee_payments`
- `supplier_payments`

**Helpers معتمدة:** `dispatchFinancialEvent`, `addLedgerToBatch`.
**ممنوع:** أي `updateDoc/setDoc/addDoc` مباشر على هذه الـ collections من صفحة.

### F1.6 — Pages ليست Repositories
- الصفحات لا تحتوي **business logic معقد**
- الـ Firestore calls المتكررة (queries، writes) تُجمَّع في:
  - `orders.js` (للأوردرات)
  - `order-actions.js` (للأفعال)
  - `financial-sync-engine.js` (للمالية)
  - مستقبلاً: `features/{name}/repository.js` (RULE G4 target)

**النمط المسموح في الصفحة:**
```js
// قراءة (مسموحة inline):
onSnapshot(query(collection(db,'orders'), where('stage','==','design'), limit(50)), ...);

// كتابة (يجب أن تمر بـ action مركزي):
await orderActions.submitToPrinting({db, orderId, ...});
```

### F1.7 — Bounded Queries (تعزيز RULE G3)
كل `onSnapshot`/`getDocs` يجب أن يحتوي `limit()`. (G3)

### F1.8 — Trace Clarity (تعزيز RULE 5)
- كل كتابة مالية تُسجَّل في `financial_ledger`
- كل تغيير على `order.stage` يُسجَّل في `order.timeline`
- كل عملية أدمن تُسجَّل في `audit_logs` (لو نقدر)

### F1.9 — Storage مركزي
- كل uploads تمر عبر helpers (مستقبلاً: `core/storage-helpers.js`)
- structure موحَّد للـ paths: `{module}/{entityId}/{filename}`
- ممنوع inline `uploadBytes` مبعثر — يصعّب الـ migration والـ cleanup

### F1.10 — Cloud Functions
- Functions في `functions/index.js` تتبع نفس القواعد (FSE، atomic، tenant-aware)
- لا financial logic داخل Cloud Function إلا عبر helpers من FSE

### 🚫 القاعدة النهائية
**Firebase وُجد لنُسرع لا لنُعقّد. أي pattern يضيف layer بدون قيمة تشغيلية مباشرة = يُرفض.**

أي drift عن هذه القواعد = Technical Debt يُسجَّل في `FIREBASE_AUDIT.md` ويُعالَج تدريجياً (RULE G9).

---

## RULE S1 — FILE/STORAGE PRINCIPLE (ميثاق إدارة الملفات)

> **الملفات جزء أساسي من التشغيل. يجب الوصول إليها بسرعة بدون لخبطة أو تكرار.**
>
> هذه القاعدة تطبيق صريح لـ **F1.9 (Storage مركزي)** + **C1.5 (منع التكرار)**.
> أي upload مبعثر أو path عشوائي = Technical Debt.

### S1.1 — كل ملف مرتبط بـ Entity
كل ملف في Storage **يجب أن يكون مرتبطاً بـ Order أو entity واضح** (Client/Employee/Supplier).

**ممنوع:** ملفات "general-purpose" بدون entity owner.

### S1.2 — Structured Storage Paths
الـ paths تتبع pattern موحَّد:
```
{module}/{entityId}/{kind}/{timestamp}_{filename}
```

**أمثلة معتمدة:**
```
orders/{orderId}/design/1716130000_logo.pdf
orders/{orderId}/print-final/1716130000_card_front.pdf
orders/{orderId}/production/1716130000_proof.jpg
clients/{clientId}/avatar/1716130000_photo.jpg
employees/{empId}/documents/1716130000_id.pdf
```

**ممنوع:**
- ❌ `designs/order_${orderId}_${ts}` — flat، يصعّب التنظيف
- ❌ `gallery/mockup_${ts}` — بدون entity owner
- ❌ paths بدون timestamp (overwrites محتملة)

### S1.3 — Central Upload Helpers
كل uploads تمر عبر `core/storage-helpers.js`:
```js
import { uploadOrderFile } from './core/storage-helpers.js';

const result = await uploadOrderFile({
  orderId, file, kind: 'design',
  onProgress: (pct) => updateProgressBar(pct),
});
// returns: { url, path, fileName, size, contentType, kind }
```

**ممنوع داخل الصفحات:**
- ❌ `ref(storage, ...)` + `uploadBytes(...)` inline
- ❌ تكوين paths يدوياً (`designs/${id}_${ts}`)
- ❌ تكرار logic رفع الصور في كل صفحة

### S1.4 — أسماء الملفات منظمة
- **Sanitization إلزامي:** `safeName = file.name.replace(/[^\w.\-]+/g, '_')`
- timestamp إلزامي في الـ path (منع overwrite)
- لا أحرف Arabic في الـ filename (storage compatibility)

### S1.5 — Single Source per Logical File
على Order واحد، **لا تكرار** للملفات بنفس المعنى:
- `designFileUrl` (نسخة واحدة فقط للتصميم الحالي)
- `printFinalUrl` (نسخة واحدة فقط للطباعة النهائية)
- `designFiles[]` (مصفوفة للـ history فقط، الحالي يبقى في designFileUrl)

**ممنوع:** 11 حقل مختلف لملفات تصميم (مكتشَف في الـ audit). يحتاج توحيد.

### S1.6 — الحذف بحذر
**ممنوع:** حذف عشوائي للملفات القديمة.

**المسموح:**
- حذف يدوي بـ admin confirmation
- حذف orphan files عبر Cloud Function مع audit trail
- التحويل إلى `archived/` prefix بدل الحذف الفوري

### S1.7 — Reverse Lookup سهل
كل ملف في Storage يجب يقدر:
1. يُرجَع للـ entity صاحبه (من الـ path)
2. يُعرَف نوعه (من الـ kind في الـ path)
3. يُعرَف تاريخه (من الـ timestamp)

### S1.8 — منع Re-upload
قبل رفع ملف، تحقق:
- لو نفس الـ hash موجود بالفعل لنفس الـ entity → استخدم الموجود
- لو تعديل بسيط → version جديد (timestamp مختلف، احتفظ بالقديم)

### 🚫 القاعدة النهائية
**أي ملف يجب الوصول إليه بسرعة بدون لخبطة أو تكرار.**

أي upload لا يمر بـ `core/storage-helpers.js` = مخالفة S1.3 يجب ترحيلها (RULE G9).

---

## RULE R1 — FIREBASE RULES PRINCIPLE (ميثاق Rules كخط دفاع)

> **Firebase Rules هي خط الدفاع الأساسي. هدفها الحماية بدون تعقيد.**
>
> هذه القاعدة توحّد فلسفة الأمان وتعزّز **RULE 8 + F1 + RULE 2/4/G6**.
> أي rule مفتوحة أو duplicate role logic = Technical Debt.

### R1.1 — Fail-Closed by Default
- كل rule تبدأ من `allow read, write: if false;` (deny)
- ثم تفتح وفق role + condition محدَّد
- **ممنوع:** `if true` أو `if request.auth != null` بدون role check

### R1.2 — Role-Based Access (تعزيز RULE 8)
الـ rules تعتمد على **role الرسمي** فقط (من `users/{uid}.role` أو Custom Auth Claim):

| Role | Read | Write |
|------|------|-------|
| `admin` | كل شيء | كل شيء (except FSE collections) |
| `operation_manager` | كل شيء | معظم (عدا financial sensitive) |
| `customer_service` | orders/clients/returns | orders updates، client comms |
| `graphic_designer` | orders (design data) | design fields فقط |
| `design_operator` | orders (design data) | design fields + assignment |
| `production_agent` | orders (production data) | production fields |
| `shipping_officer` | orders (shipping data) | shipping fields |
| `wallet_manager` | financial collections | financial via FSE فقط |

### R1.3 — Sensitive Field Protection (RULE 8)
| الحقل | يقرأه |
|------|------|
| `clientPhone` / `phone1` / `phone2` | admin, ops, CS, shipping (`canSeeCustomerPhone()`) |
| `designFiles[]` / `designFileUrl` | admin, CS, designers, production (`canSeeDesignData()`) |
| `supplierCost` / `priceCost` / `priceMargin` | admin, ops, wallet_manager |

**التطبيق:** rules + UI helpers (`canSee()` في `shared.js`) — دفاع طبقتين.

### R1.4 — Financial Collections — FSE Only
الـ collections التالية **يكتب بها admin SDK فقط** عبر `financial-sync-engine.js`:
- `wallets`
- `transactions_v2`
- `financial_ledger`
- `employee_payments`
- `supplier_payments`
- `shipping_settlements`

**Read:** `wallet_manager`, `admin`, `operation_manager` فقط (RULE 1 + F1.5).

### R1.5 — لا Duplicate Role Logic
**ممنوع:**
- ❌ تكرار `isAdmin()` بمنطق مختلف
- ❌ helpers مختلفة لـ نفس الفحص
- ❌ inline `role in [...]` بدل استخدام الـ helper

**المسموح:** helpers موحَّدة (`isAdmin()`, `canSeeCustomerPhone()`, `canSeeDesignData()`).
**الـ Storage:** نفس الـ helpers logic عبر Custom Auth Claims (`request.auth.token.role`).

### R1.6 — Storage Parity
storage.rules تتبع نفس الفلسفة:
- fail-closed
- role-based access (عبر Custom Auth Claims)
- entity-scoped paths (`orders/{orderId}/...` للـ users اللي لهم وصول للأوردر)
- file size / type limits

### R1.7 — Audit Trail
- Cloud Function `syncUserAuthClaims` تحدّث الـ claims عند تغيير دور المستخدم
- كل drift عن الـ rules يُكتشف عبر `detectEngineBypass` (يكتب في `admin_alerts`)
- التغييرات على الـ rules تُوثَّق في `firestore.rules` comments + CHANGELOG

### R1.8 — Single Source for Permissions
- `core/permissions-matrix.js` هو المصدر الوحيد لـ DEFAULT_PERMISSIONS (للـ UI)
- `users/{uid}.role` + `users/{uid}.permissions` المصدر الوحيد للـ runtime (للـ rules)
- لا hard-coded role lists في صفحات HTML

### R1.9 — ممنوع Temporary Insecure Rules
- ❌ `if true; // TODO: fix later`
- ❌ rule مفتوحة "لـ debug فقط"
- ❌ تعطيل rule لـ "deployment طارئ"

**البديل:** Cloud Function callable مع admin auth ⇒ يكتب بـ admin SDK (يتجاوز rules بشكل آمن ومُدقَّق).

### 🚫 القاعدة النهائية
**Firebase Rules تمنع الفوضى والأخطاء — لا تحوّل النظام إلى طبقات أمان معقدة.**

أي drift عن R1 يُسجَّل في `RULES_AUDIT.md` ويُعالَج تدريجياً (RULE G9).

---

## RULE X1 — SYSTEM SECURITY (الميثاق الأمني الشامل — Meta-Charter)

> **الأمان هدفه حماية التشغيل الحقيقي للشركة، لا بناء طبقات تعطل المستخدمين أو التطوير.**
>
> هذه القاعدة meta-charter — تجمع وتوحّد جوانب الأمان عبر **W1 + C1 + V1 + A1 + F1 + S1 + R1 + RULE 1-8**.
> الجديد فيها: account lifecycle + audit trail شامل + منع hardcoded admin/hidden permissions.

### X1.1 — Defense-in-Depth (طبقات الدفاع)
كل عملية حساسة محمية بـ **4 طبقات**:
1. **UI**: زر مخفي/مُعطَّل (`canSee()`, `hasPage()`)
2. **Validators**: `validateOrder/Payment/Refund` يرفض early
3. **Central Actions**: `orderActions.*` يفرض pre-checks
4. **Firebase Rules**: يرفض الكتابة حتى لو تجاوزت الطبقات 1-3

**أي طبقة وحدها لا تكفي.** الـ rules هي الـ source of truth الأخير.

### X1.2 — Account Lifecycle (جديد)
**القواعد:**
- **تسجيل الدخول إجباري** — كل صفحة تتحقق `onAuthStateChanged` وتعيد توجيه غير الموثَّقين
- **ممنوع الحسابات المشتركة** — كل موظف له `uid` خاص و `users/{uid}` document
- **الحسابات غير المستخدمة تُعطَّل** — `users/{uid}.disabled = true` أو Firebase Auth disable
- **Password reset** عبر Cloud Function (لا exposure للـ admin SDK في الواجهة)
- **Audit** لكل تسجيل دخول جديد + كل تغيير دور

### X1.3 — منع Hardcoded Admin Logic
**ممنوع تماماً:**
- ❌ `if (user.uid === 'specific-uid-here')` — backdoor patterns
- ❌ `if (email === 'admin@...')` — hardcoded credentials
- ❌ "god mode" checks بدون الـ permissions matrix
- ❌ Roles مكتوبة inline في HTML بدل `core/permissions-matrix.js`

**المسموح:**
- ✅ `if (currentRole === USER_ROLES.ADMIN)` عبر constants
- ✅ `isAdmin()` helper في rules
- ✅ `can('canFinancialWrite')` للصلاحيات الدقيقة

### X1.4 — منع Hidden Permissions
**ممنوع:**
- ❌ checks في JS لا تطابق `core/permissions-matrix.js`
- ❌ UI elements ظاهرة لـ role بدون أن تكون في `ROLE_PAGES`
- ❌ "TODO: add permissions check" — يُرفض الـ commit

**المسموح:** كل صلاحية موثَّقة في `core/permissions-matrix.js` و مُختبَرة في Rules.

### X1.5 — Audit Trail الشامل (تعزيز RULE 5)
**كل من العمليات التالية يجب أن تُسجَّل:**

| العملية | المكان |
|--------|------|
| تغيير `order.stage` | `order.timeline[]` (تلقائي عبر `buildStageAdvance`) |
| العمليات المالية | `financial_ledger` (إلزامي عبر FSE — RULE 5) |
| الحذف (`deleteDoc`) | `audit_logs/{type}_deleted/{ts}` قبل الحذف |
| المرتجعات | `returns_tickets.timeline[]` |
| الأرشفة | `order.timeline[]` (تلقائي عبر `buildArchiveSpec`) |
| تعديل `salePrice` / `costItems` | `order.editHistory[]` مع before/after + user |
| تغيير `role` لمستخدم | `audit_logs/role_change/{ts}` |

### X1.6 — منع الـ Bypass
**ممنوع** أي مسار يتجاوز:
- ❌ Workflow → استخدم `orderActions.*` أو `buildStageAdvance`
- ❌ Financial → استخدم `dispatchFinancialEvent` أو `addLedgerToBatch`
- ❌ Permissions → استخدم helpers (`canSee`, `hasPage`, `can`)
- ❌ Storage → استخدم `core/storage-helpers.js`

### X1.7 — Sensitive Operations تحتاج Validation صريح
عمليات حساسة (حذف، إعادة فتح أوردر، تعديل أرصدة، تغيير دور):
- يجب أن تكون عبر `validate*()` validator مركزي
- يجب أن تظهر `confirm()` dialog واضح للمستخدم
- يجب أن تُسجَّل في `audit_logs` مع `reason` field

### X1.8 — Session Security
- لا حفظ tokens أو passwords في `localStorage` (Firebase Auth يديرها بأمان)
- لا exposure للـ Firebase Admin SDK في الـ client
- callable Cloud Functions تستخدم `request.auth` للتحقق
- Custom Claims لا تُكتب من الـ client (فقط من admin SDK)

### X1.9 — Tenant Isolation (Phase 2 ready)
- كل query بفلتر `tenantId == currentTenantId`
- كل rule بفحص `inSameTenant(resource.data)`
- لا cross-tenant data leak

### X1.10 — Password Strength (Anti-Breach)
- **Min length:** 8 chars (Firebase Auth default)
- **mustChangePassword:** true عند إنشاء حساب جديد (force first-login change)
- **No plaintext storage:** Firebase Auth يديرها بـ bcrypt — لا custom password handling
- **Password reset:** عبر Cloud Function callable (لا exposure للـ admin SDK في الـ client)
- **يُمنع:** كلمات مرور مشتركة بين موظفين، storage في localStorage

### X1.11 — Periodic Admin Review
- **شهرياً:** مراجعة قائمة `users where role in ['admin','operation_manager']`
- التحقق من:
  - كل admin له use case نشط
  - لا حسابات admin قديمة (آخر login > 90 يوم) — تُعطَّل أو تُخفَّض
  - عدد الـ admins معقول للحجم (~2-4 لشركة بهذا الحجم)
- **يُسجَّل في:** `audit_logs/admin_review/{YYYY-MM}`

### X1.12 — File Type Whitelist (Anti-Breach — تعزيز S1.4)
**المسموح:** قائمة موجبة فقط:
- **Images:** `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml`
- **Documents:** `application/pdf`
- **Design source:** `.ai`, `.psd`, `.eps`, `.indd`, `.svg`, `.fig` (بـ MIME validation)

**ممنوع:**
- ❌ `.exe`, `.bat`, `.sh`, `.cmd`, `.vbs`, `.js` (executable)
- ❌ `.html`, `.htm` (XSS risk)
- ❌ `.zip`, `.rar` (يخفي خطر) — استخدم individual files

**Storage rules:** Storage يفرض MIME validation (storage.rules تحتاج تحديث للـ legacy paths).
**Application layer:** `core/storage-helpers.js → inferKind()` يكشف الـ kind قبل الـ upload.

### X1.13 — منع Direct Database Edits (تعزيز RULE 2 + 4)
**ممنوع تماماً:**
- ❌ Firebase Console manual edits على collections مالية (إلا في طوارئ مع audit log)
- ❌ Direct Firestore admin SDK writes من scripts بدون trace
- ❌ "Quick fix" مباشر على البيانات

**المسموح فقط:**
- ✅ عبر `financial-sync-engine.js` (للمالية)
- ✅ عبر `orderActions.*` (للـ workflow)
- ✅ Cloud Function callable مع admin auth + audit_logs entry
- ✅ Migration scripts موثَّقة في `tests/` مع dry-run

### 🚫 القاعدة النهائية
**الأمان وُجد لحماية التشغيل، لا لتعطيله.**

أي تعقيد أمني يعطل الموظفين بدون قيمة حقيقية = يُرفض.
أي drift يُسجَّل في `SECURITY_AUDIT.md` ويُعالَج تدريجياً (RULE G9).

---

## RULE P1 — PERMISSIONS PRINCIPLE (ميثاق الصلاحيات الدقيقة)

> **النظام يعتمد على Permissions (دقيقة)، لا Roles ثابتة معقدة.**
>
> الـ Roles = تجميعة افتراضية. الـ Permissions = الحقيقة. RULE 8 + R1 + X1 يكتسبون قوتهم من هنا.

### P1.1 — ثلاث طبقات صلاحيات
| الطبقة | ماذا تتحكم | المصدر |
|--------|--------------|---------|
| **Page** | أي صفحة يدخل | `ROLE_PAGES` في `shared.js` |
| **Field** | أي حقل يرى | `DEFAULT_PERMISSIONS` في `core/permissions-matrix.js` (`price_sale`, `client_phone`, `design_data`...) |
| **Capability** | أي action ينفذ | `DEFAULT_CAPABILITIES` في `core/permissions-matrix.js` (`view_orders`, `create_orders`...) |

كل عملية حساسة تستخدم الـ capability المناسب — لا role hardcoded.

### P1.2 — Capability Catalog (15 capability)
| Capability | الوصف |
|-----------|-------|
| `view_orders` | قراءة الأوردرات |
| `create_orders` | إنشاء أوردر جديد |
| `edit_orders` | تعديل بيانات الأوردر |
| `archive_orders` | أرشفة الأوردر |
| `view_clients` | قراءة العملاء |
| `edit_clients` | تعديل بيانات العميل |
| `upload_designs` | رفع ملفات التصميم |
| `approve_designs` | اعتماد التصميم |
| `manage_printing` | إدارة مرحلة الطباعة |
| `manage_shipping` | إدارة الشحن |
| `view_financials` | قراءة البيانات المالية |
| `manage_payments` | تسجيل دفعات/استرداد |
| `manage_returns` | معالجة المرتجعات |
| `manage_employees` | إدارة الموظفين |
| `system_settings` | إعدادات النظام |

### P1.3 — التطبيق
```js
// ❌ ممنوع (hardcoded role)
if (currentRole === 'admin' || currentRole === 'operation_manager') { ... }

// ✅ المسموح (capability-based)
import { canDo } from './core/permissions-matrix.js';
if (canDo('archive_orders', currentRole, userPerms)) { ... }
```

**في Firestore Rules:**
```js
function canArchive() { return can('archive_orders'); }
```

### P1.4 — Role = Default Bundle
الـ Roles الـ 8 = **افتراضات** لـ capability sets. كل user يمكن أن يحصل على overrides فردية في `users/{uid}.permissions.capabilities`.

مثال:
- `graphic_designer` افتراضياً: `{view_orders, upload_designs}`
- لكن `users/{uid}.permissions.capabilities.approve_designs = true` يمنحه صلاحية اعتماد رغم دوره

### P1.5 — UI Adapts to Capabilities (تعزيز RULE 8.3)
الـ UI يتغيّر **قبل** الضغط:
- الـ زر مخفي إذا `!canDo(capability)`
- الـ action في القائمة مخفي
- الـ field في الجدول مخفي
- الـ section كاملة مخفية

**ممنوع:** "click → error: لا صلاحية" — تجربة سيئة. الأفضل: لا يرى الأصلاً.

### P1.6 — Central Source of Truth
```
core/permissions-matrix.js:
  DEFAULT_PERMISSIONS    (field-level)
  DEFAULT_CAPABILITIES   (action-level) ← الجديد
  ROLE_PAGES             (page-level)
  canSeeField()          (field check)
  canDo()                (capability check) ← الجديد
  hasPage()              (page check)
```

**ممنوع:**
- ❌ permission lists محلية في pages
- ❌ `if (role in [...])` للـ capabilities — استخدم `canDo()`
- ❌ duplicate permission logic في Firestore Rules ↔ UI

### P1.7 — User-Level Overrides
الـ `users/{uid}.permissions.capabilities` يقدر يفعّل/يعطّل capability فردياً لمستخدم بعينه:
```json
{
  "permissions": {
    "capabilities": {
      "approve_designs": true,
      "system_settings": false
    }
  }
}
```
الـ `canDo()` يدمج: default للـ role + user overrides (override يفوز).

### P1.8 — Audit للـ Capability Changes
أي تغيير في `users/{uid}.permissions.capabilities`:
- يُسجَّل في `audit_logs/permission_change/{ts}`
- مع before/after + by/byId

### 🚫 القاعدة النهائية
**الصلاحيات تنظّم التشغيل لا تعقّده.**

أي عملية تستخدم role hardcoded بدل capability = drift يُعالَج (RULE G9).

---

## الهيكل التقني الحالي

```
financial-sync-engine.js   ← محرك الأحداث المركزي (المصدر الوحيد للكتابة)
firestore.rules            ← أذونات Firestore (deploy تلقائي عبر CI/CD)
sw.js                      ← Service Worker (bump CACHE version عند كل نشر رئيسي)
validate-financial.html    ← صفحة الاختبار الحي (تشغّل قبل كل push مهم)
```

### Collections المالية والقواعد التي تحكمها

| Collection | من يكتب فيها | القاعدة |
|------------|-------------|---------|
| `wallets` | Engine فقط | RULE 2 + 3 |
| `transactions_v2` | Engine فقط | RULE 2 + 3 |
| `financial_ledger` | Engine فقط | RULE 5 |
| `employee_payments` | Engine فقط | RULE 1 + 2 |
| `supplier_payments` | Engine فقط | RULE 1 + 2 |
| `shipping_settlements` | shipping-accounts (addLedgerToBatch) | RULE 3 |
| `orders` | Engine (payment fields) + pages (status fields) | RULE 3 |

---

## لافتة التحقق السريع

قبل أي commit لكود مالي، تأكد من:

- [ ] كل كتابة مالية داخل `writeBatch` أو `dispatchFinancialEvent`
- [ ] `financial_ledger` يُكتب في نفس الـ batch (أو نفس الـ `.then()` chain ممنوعة)
- [ ] لا `await` متسلسلة بين writes مالية مختلفة
- [ ] `employee_payments` لها write rule في `firestore.rules`
- [ ] أي collection جديدة مضافة في `firestore.rules` قبل الاستخدام

---

# قواعد الحوكمة الهندسية — Engineering Governance (G1-G10)

> **هدف هذه القواعد:** منع الـ Regression Cascade. كل feature جديد يجب أن لا يُضعف القديم.
> **المصدر:** `REGRESSION_PREVENTION.md` §12.
> **التطبيق:** PR template + CI quality gates تفرض معظم هذه القواعد تلقائياً.

## RULE G1 — Stable Core

5 modules تُعتبر **Stable Core** ولا تُعدَّل بدون 2-reviewer approval:

| Module | السبب |
|---|---|
| `firestore.rules` | server-side trust boundary — أي خطأ = lockout |
| `financial-sync-engine.js` | المحرك المالي — أي bug = corruption |
| `shared.js` | يستورده 12+ صفحة — أي تغيير ripple |
| `core/firebase-init.js` (مستقبلاً) | الـ FB init الوحيد |
| `core/permissions-matrix.js` (مستقبلاً) | RULE 8 governance |

**التطبيق:** PR يلمس أي من هذه يحتاج reviewer ثانٍ + smoke tests passing.

## RULE G2 — One Firebase Config

`FB_CONFIG` (apiKey: 'AIzaSy...') يُعرَّف في **مكان واحد فقط**: `shared.js` (حالياً) أو `core/firebase-init.js` (مستقبلاً).

**ممنوع:** نسخ الـ config في صفحة جديدة. **المسموح:** `import { db, auth } from './shared.js'`.

**التطبيق:** CI workflow `pr-quality.yml` يفحص هذا تلقائياً.

## RULE G3 — Bounded Listeners

**كل** `onSnapshot` يجب أن يحتوي `limit()`.

```js
// ❌ ممنوع
onSnapshot(query(collection(db,'orders'), orderBy('createdAt')), ...);

// ✅ مسموح
onSnapshot(query(collection(db,'orders'), orderBy('createdAt'), limit(50)), ...);
```

**الاستثناء:** doc references (`onSnapshot(doc(db,'settings','main'),...)`) — هذه single doc، لا limit needed.

**التطبيق:** PR Quality Gates يفحص الـ files المعدَّلة.

## RULE G4 — Repository Pattern (target)

كل query على Firestore يجب أن يمر عبر `features/{name}/repository.js` (في الـ structure المستقبلية).

**حالياً:** in transition. أي ملف جديد **يجب** يستخدم repository لو موجود للـ collection.

## RULE G5 — No God Pages

أي ملف HTML/JS يتجاوز **1500 سطر** يجب تقسيمه قبل إضافة feature جديد. الـ god pages الحالية (`clients.html` 4760، `shipping.html` 3096، `reports.html` 3047، `employee-profile.html` 3168، `approvals.html` 2530، `inbox.html` 2526، `design-workspace.html` 2438، `production.html` 2432، `accounts.html` 2412) **مجمَّدة** بدون decomposition plan.

**التطبيق:** PR Quality Gates يحذّر على ملفات > 1500 سطر جديدة و > 200 سطر زيادة على god pages.

## RULE G6 — Engine Writes Only (تعزيز RULE 2)

`wallets`, `transactions_v2`, `financial_ledger`, `employee_payments`, `supplier_payments` — **الكتابة عبر `financial-sync-engine.js` فقط**.

**التطبيق:** PR Quality Gates ترفض PRs بـ direct writes خارج FSE.

## RULE G7 — Tenant Aware

كل doc جديد يكتب `tenantId`. كل query جديد يفلتر بـ `tenantId`. كل rule جديدة تستخدم `inSameTenant()`.

```js
// إنشاء
batch.set(ref, { ...data, ...tenantFields(getCurrentTenantId(userDoc)) });

// قراءة
query(collection(db,'orders'), where('tenantId','==',currentTenantId), ...);

// rule
allow read: if isAuth() && inSameTenant(resource.data) && (...);
```

## RULE G8 — Test First (للـ Security-Critical)

أي تعديل على:
- `firestore.rules`
- `financial-sync-engine.js`
- Cloud Functions في `functions/index.js`

**يحتاج** smoke test في `tests/` قبل merge.

## RULE G9 — Incremental Migration

**ممنوع** big-bang refactors. الـ refactor يأتي صفحة-صفحة أو module-module، مع نظام شغّال أثناء الانتقال.

**ممنوع:** "أعدت كتابة shared.js" في PR واحد.
**المسموح:** "أضفت `core/firebase-init.js` بجوار shared.js، الصفحات القديمة كما هي".

## RULE G10 — Module Definition Required (تعزيز RULE 7)

قبل أي **module جديد** (collection + UI + Cloud Function):

1. **Entity Profile** — ما هو الكيان؟
2. **Events** — ما الأحداث؟ (EVENT_TYPE + payload)
3. **Accounting Impact** — أي wallets تتأثر؟
4. **Dashboard Impact** — ما الأرقام؟
5. **Reversal Logic** — كيف يُلغى كل حدث؟
6. **Tenant Strategy** — هل multi-tenant؟ (G7)
7. **Permissions** — أي أدوار تكتب/تقرأ؟ (RULE 8)
8. **Test Plan** — ما الـ smoke tests؟ (G8)

لا يبدأ التطوير إلا بعد موافقة المستخدم على كل النقاط الـ 8.

---

## وثائق التشخيص والخطط

- `AUDIT_REPORT.md` (2026-05-17) — التشخيص الأصلي
- `AUDIT_REPORT_v2.md` (2026-05-19) — تشخيص محدَّث + scores
- `STABILIZATION_PLAN.md` (2026-05-19) — Sprint 14 يوم للـ security/perf
- `REGRESSION_PREVENTION.md` (2026-05-19) — Feature isolation + governance
