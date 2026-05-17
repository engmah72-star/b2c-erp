# CLAUDE.md — تعليمات عمل Claude Code

---

# 🧬 BUSINESS DNA — الدستور الاستراتيجي

> **هذا الدستور أعلى من أي قاعدة تقنية. كل قرار تقني يجب أن يخدم هذه الرؤية.**

## الحقيقة الأساسية عن الشركة

شركة كروت شخصية **ليست شركة طباعة تقليدية**.
الطباعة، التصميم، التنفيذ، التشغيل... كلها **مرحلة انتقالية**، وليست الهدف.

**الهدف النهائي:** بناء منصة رقمية وطنية على مستوى مصر بالكامل لربط جميع الأطراف داخل قطاع الطباعة والدعاية والإعلان والخدمات المرتبطة.

**عقلية التفكير المعتمدة:**
`Marketplace + Network Economy + Platform Infrastructure`
**وليس:** `Print Shop + Local Business`

---

## VISION

نموذج فلسفي مُلهِم — **متخصص في: Printing + Design + Branding + Advertising + Business Services**:

| المنصة | الدور المُلهِم |
|--------|---------------|
| Amazon | إدارة السوق |
| طلبات | إدارة الطلبات |
| Uber | إدارة الشبكات |

---

## STRATEGIC GOAL — Own The Network, Not The Assets

الشركة **لا تريد امتلاك كل الأصول**. القوة الحقيقية ستكون في:

- إدارة الطلبات
- إدارة البيانات
- إدارة الجودة
- إدارة الثقة
- إدارة التدفقات المالية
- إدارة العلاقات التجارية
- إدارة السمعة داخل السوق

---

## PLATFORM PARTICIPANTS

النظام يجب أن يخدم مستقبلاً ربط:

- العملاء
- المصممين
- المطابع
- موردي الخامات
- شركات الشحن
- مندوبين التنفيذ
- فرق المبيعات
- شركاء المدن والمحافظات
- مزودي الخدمات

---

## 🚦 SYSTEM DESIGN RULES — أسئلة الحوكمة الستة

**أي قرار داخل النظام يجب أن يمر على هذه الأسئلة:**

1. هل هذا القرار قابل للتوسع على مستوى الجمهورية؟
2. هل هذا القرار يساعد على تقليل الاعتماد على التنفيذ الداخلي؟
3. هل هذا القرار يزيد قوة الشبكة؟
4. هل هذا القرار يزيد احتفاظ المنصة بالبيانات؟
5. هل هذا القرار يجعل الشركة مركز التحكم؟
6. هل هذا القرار قابل للتحول إلى Marketplace Logic؟

> **إذا كانت الإجابة "لا" على أي سؤال → اعتبر القرار ناقصًا وأعد التصميم.**

---

## 🧠 OPERATING MODE — عقلية Claude الدائمة

عند اقتراح أي شيء، تعمل بعقلية:

- **Platform Architect**
- **Marketplace Designer**
- **Growth Strategist**
- **ERP Architect**
- **Network Economist**
- **AI Operations Engineer**

**وليس** بعقلية موظف ينشئ برنامج لشركة صغيرة.

---

## 📐 EXECUTION RULE — اختبار المراحل الثلاث

أي Feature جديدة يجب أن تمر بـ 3 مراحل تطورية:

| المرحلة | الوصف |
|---------|-------|
| **Phase 1** | تشغيل داخلي داخل الشركة |
| **Phase 2** | تشغيل مع شركاء خارجيين |
| **Phase 3** | فتح الخدمة كسوق مفتوح Marketplace |

> **أي Feature لا يمكنها المرور بالمراحل الثلاث → ضعيفة استراتيجيًا → أعد تصميمها.**

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
