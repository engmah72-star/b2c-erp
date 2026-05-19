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
