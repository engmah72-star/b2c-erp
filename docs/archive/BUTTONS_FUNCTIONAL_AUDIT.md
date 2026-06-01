# BUTTONS_FUNCTIONAL_AUDIT.md — تدقيق وظيفي للأزرار والإجراءات

> **النطاق:** الصفحات المالية الحرجة الأربعة (الأولوية القصوى).
> **النوع:** تدقيق كود ثابت (Static) — تتبُّع كل زر → handler → action → كتابة Firestore.
> **التاريخ:** 2026-05-29

---

## ⚠️ حدود هذا التدقيق (شفافية — طلب #15)

هذا التقرير **يثبت من الكود** أن الأزرار مربوطة بعمليات حفظ حقيقية. لكنه **لا يستبدل** الاختبار الحي. ما لم يُتحقَّق منه بعد (يحتاج تشغيل المتصفح + Firestore الحي):
- ❌ الضغط الفعلي على كل زر ومراقبة النتيجة
- ❌ Console errors أثناء التشغيل (طلب #11)
- ❌ Network requests الفعلية (طلب #11)
- ❌ استمرار البيانات بعد refresh / re-login (طلب #6) — *مضمون معمارياً، غير مُختبَر حياً*
- ❌ تحديث الواجهة فوراً بعد النجاح (طلب #13)

**خطة الاختبار اليدوي** لهذه النقاط في القسم الأخير.

---

## ✅ النتيجة العامة: الصفحات الأربعة سليمة معمارياً

| الصفحة | أزرار ميتة | وظائف وهمية (UI-only) | كتابة مباشرة | الحكم |
|--------|:---:|:---:|:---:|:---:|
| `accounts.html` | ✅ صفر | ✅ صفر | ✅ صفر | سليمة |
| `shipping.html` | ✅ صفر | ✅ صفر | ✅ صفر | سليمة |
| `production.html` | ✅ صفر | ✅ صفر | ✅ صفر | سليمة |
| `approvals.html` | ✅ صفر | ✅ صفر | ✅ صفر | سليمة |

**تحقُّق مستقل (مش اعتماد على الـ agent):**
- استخراج كل دوال `onclick` المباشرة → كلها لها تعريف في الصفحة ✅
- `grep` للكتابة المباشرة (`updateDoc/setDoc/addDoc/deleteDoc/writeBatch/runTransaction`) خارج `import` → **NONE** ✅

---

## كيف تعمل العمليات (الطبقة المركزية)

كل كتابة مالية تمرّ عبر طبقة مركزية واحدة — **مفيش صفحة بتكتب على Firestore مباشرة**:

| الطبقة | تخدم |
|--------|------|
| `wallet-actions.js` | محافظ · حركات · تسويات · تحويلات · دفع موردين |
| `shipping-actions.js` | تجهيز · تسليم · تحصيل · تسوية شركة · مرتجع |
| `production-actions.js` | طلبات تكاليف · حذف (عبر order-actions) |
| `order-actions.js` | مراحل الأوردر · التكاليف · الحذف |
| `approval-actions.js` | دورة حياة طلبات الدفع · اعتماد/رفض الحركات |
| `financial-sync-engine.js` | `addLedgerToBatch` · `dispatchFinancialEvent` · audit trail |

**خصائص مؤكَّدة من الكود:**
- ✅ **Atomic:** كل عملية `writeBatch` + `serverTimestamp` + `addLedgerToBatch` (طلب #12)
- ✅ **Idempotency:** `withIdempotency()` على عمليات الشحن/الإنتاج الحرجة
- ✅ **Audit:** كل حركة في `financial_ledger` مع `approvalFields()`
- ✅ **Feedback:** toast نجاح/فشل + `confirm()` للعمليات الحساسة (طلب #5)
- ✅ **Cascade reversal:** الرفض بيعكس المحفظة + الحركة + الـ ledger ذرّياً

---

## العمليات المُغطّاة (verdict ✅ REAL لكلها)

| العملية | المثال | الطبقة |
|---------|--------|--------|
| **تحصيل** | collectFromCustomer | shipping-actions |
| **دفع مورد** | recordSupplierPayment / executePaymentRequest | wallet/approval-actions |
| **تسوية** | settleWithCompany | shipping-actions |
| **تحويل** | walletTransfer | wallet-actions |
| **اعتماد** | approveTransaction / approvePaymentRequest | approval-actions |
| **رفض (+عكس)** | rejectTransaction (cascade) | approval-actions |
| **إضافة/تعديل حركة** | recordTransaction / editTransaction | wallet-actions |
| **حذف حركة (+عكس)** | deleteTransaction | wallet-actions |
| **تسجيل تكلفة** | recordCostItem | order-actions |
| **تجهيز/تسليم** | dispatchOrder / markDelivered | shipping-actions |
| **مرتجع** | registerReturn (+RETURN_LOSS) | shipping-actions |
| **تسوية محفظة** | saveReconciliation | wallet-actions |
| **بحث/فلترة/تصدير** | client-side (CSV من المصفوفة الحية) | — |

---

## ملاحظات (غير حرجة)

1. **بحث/فلترة/تصدير:** client-side بالكامل — صح وآمن (مفيش كتابة). التصدير بيولّد CSV من البيانات الحية.
2. **رفع الإيصالات:** الملف يُرفع للـ Storage **قبل** الـ writeBatch، والـ FSE يسجّل الـ metadata في الـ ledger (فصل سليم).
3. **أزرار الإغلاق/الإلغاء في الـ modals:** UI-only (صح — مالهاش تكتب حاجة).
4. **KPI drill-down:** قراءة فقط (تحليلات) — مفيش كتابة.

---

## 🧪 خطة الاختبار اليدوي (للتحقق الحي — طلب #6, #11, #13)

نفّذها على `business2card-c041b.web.app` بحساب admin، مع فتح **DevTools (F12) → Console + Network**:

### لكل عملية مالية (تحصيل/دفع/تسوية/اعتماد):
1. افتح الصفحة، اضغط الزر، نفّذ العملية ببيانات اختبار صغيرة.
2. **Console:** لازم يكون نضيف — صفر أخطاء حمرا.
3. **Network:** لازم تشوف طلب Firestore write (مش بس قراءة).
4. **رسالة:** لازم تظهر toast نجاح (✅) أو فشل (❌) واضحة.
5. **التحقق الحاسم (#6):** اعمل **refresh** للصفحة → البيانات لسه موجودة؟ سجّل خروج وادخل تاني → لسه موجودة؟
6. **التحقق المالي:** افتح `accounts.html` → الرصيد اتغيّر صح؟ افتح `financial_ledger` (لو ليك وصول) → فيه قيد جديد؟
7. **الواجهة (#13):** اتحدّثت فوراً من غير ما تعمل refresh يدوي؟

### checklist سريع للأزرار الحرجة:
- [ ] تحصيل من عميل → الرصيد +، الأوردر اتأرشف لو اكتمل
- [ ] دفع مورد → الرصيد −، supplier_payments فيه قيد
- [ ] تسوية شركة شحن → shipping_settlements فيه قيد، الرصيد +
- [ ] تحويل بين محافظ → الاتنين اتغيّروا، الرسوم اتخصمت
- [ ] اعتماد حركة → approvalStatus بقى approved
- [ ] رفض حركة → اتعكست (الرصيد رجع)، refresh يأكّد
- [ ] تسجيل تكلفة تنفيذ → costItems فيها العنصر بعد refresh

---

## العناصر اللي تحتاج متابعة

| البند | الحالة | التوصية |
|------|--------|---------|
| الصفحات غير المالية (clients/employees/suppliers/reports...) | لم تُدقَّق بعد | جولة static تانية لو احتجت |
| الاختبار الحي للنقاط #6/#11/#13 | يحتاج تشغيل متصفح | نفّذ خطة الاختبار اليدوي أعلاه |
| Console/Network الفعلية | لم تُراقَب | ضمن الاختبار اليدوي |

---

## الخلاصة

الصفحات المالية الأربعة (أخطر نقطة في النظام) **موثوقة على مستوى الكود**: صفر أزرار وهمية، صفر كتابة بصرية بدون حفظ، كل العمليات atomic + audited + لها رسائل. الخطوة المتبقية = **تأكيد حي** عبر الـ checklist أعلاه (دقائق لكل عملية).
