# 🚚 نظام الشحن — الصياغة المعتمدة

> **آخر تحديث:** بعد إعادة هيكلة الشحن (Steps 1–3 — PRs #1321, #1323).
> هذا التوثيق يصف **الحالة الفعلية الحالية** في الكود، ويُحدَّث مع أي تعديل على طبقة الشحن.

---

## 1. الفلسفة (RULE W1 + C1 + A1)

- **`order.stage` هو مصدر الحالة الوحيد** (W1.1). الشحن مرحلة ضمن السلسلة الثابتة:
  ```
  design → printing → production → shipping → archived
  ```
- **`shipStage` حالة فرعية مساعِدة** داخل مرحلة الشحن فقط — ممنوع أن تتعارض مع `order.stage` (W1.2 / C1.2).
- **لا صفحة تكتب على الأوردر مباشرة** — كل عملية تمرّ عبر `shippingActions.*` (RULE A1 / H1.1).
- **لا module يملك المال** (RULE 4) — الأرصدة في `wallets` فقط، والكتابة المالية عبر `financial-sync-engine.js`.

---

## 2. الأدوار (Actors)

| الدور | ماذا يفعل في الشحن |
|------|---------------------|
| **مسؤول الطباعة** (`print.html`) | يُدخل **بيانات الشحن**: الطريقة، العنوان، تليفون التسليم، شامل/غير شامل + الرسوم |
| **مسؤول الشحن** (`shipping.html`) | يستلم الإشعار → يشحن → يحصّل → يسوّي مع شركة الشحن |
| **wallet_manager / admin / operation_manager** | التسوية المالية مع شركات الشحن |

- أدوار التجهيز/الشحن: `admin, operation_manager, shipping_officer` (`SHIPPING_DISPATCH_ROLES`).
- أدوار التسوية: نفسها + `wallet_manager` (`SHIPPING_SETTLE_ROLES`).

---

## 3. طرق الشحن (`order.shipMethod`)

| القيمة | المعنى | ملاحظات |
|--------|--------|---------|
| `company` | شركة شحن خارجية | تحتاج تسوية (`shipSettled`) قبل الأرشفة |
| `pickup` | العميل يستلم من المحل | لا عنوان ولا شركة |
| `courier` | مندوب | عنوان مطلوب |

(`SHIPPING_METHODS` في `orders.js`.)

---

## 4. الحالتان المالية (القاعدة الجوهرية) 💰

| الحالة | العلامة | المعنى | أثر الفلوس |
|--------|---------|--------|-----------|
| **شامل الشحن** | `priceIncludesShipping = true` | العميل دفع الشحن **ضمن** `salePrice` | الشركة تحصّل `salePrice`؛ تكلفتها الخاصة `shippingCost` تُخصم عند التسوية |
| **غير شامل** | `priceIncludesShipping = false` | العميل يدفع الشحن **للمندوب مباشرة** | الرسوم تُخزَّن في `courierDirectFee` **(معلوماتي فقط)** — **لا تدخل** wallet / ledger / المتبقي |

> ### 🔑 القاعدة الذهبية
> بعد التجهيز، **`customerShipFee` يبقى صفر دائماً**.
> رسوم الشحن المباشرة (`courierDirectFee`) **لا تمسّ حسابات الشركة إطلاقاً** — تظهر للعرض فقط ليعرف مسؤول الشحن كم يقول للعميل (RULE 4).

---

## 5. التدفق خطوة بخطوة

1. **الطباعة** — المسؤول يحفظ بيانات الشحن
   → `shippingActions.prepareForShipping()` — **لا حدث مالي**.
   يكتب: `shipMethod`, `shipCompanyId/Name`, `deliveryAddress`, `customerPhoneShip`,
   `priceIncludesShipping`, `courierDirectFee` (والـ `customerShipFee = 0`).

2. **دخول مرحلة الشحن** — `order.stage → 'shipping'`
   → **إشعار جماعي تلقائي** لكل مسؤولي الشحن (`onOrderReadyForShipping`).

3. **الشحن** — `dispatchOrder()` (alias `confirmShipped`) → `shipStage: shipped`.

4. **التسليم** — `markDelivered()` → `shipStage: delivered`.

5. **التحصيل:**
   - **pickup / courier** → `collectFromCustomer()` → يدخل المحفظة فورًا عبر
     `FE.CUSTOMER_PAYMENT`. التحصيل الكامل ⟵ **أرشفة تلقائية**.
   - **company** → `markCompanyCollected()` (marker فقط، لا تدخل المحفظة بعد)
     ثم `settleWithCompany()`.

6. **التسوية مع شركة الشحن** — `settleWithCompany()`
   - **إيصال إيداع إجباري** (`receiptUrl`).
   - **idempotent** (بصمة = orderIds + walletId + amount).
   - حدث مالي `FE.SHIPPING_SETTLEMENT` → wallet + ledger + `shipping_settlements`.
   - بعد النجاح ⟵ **أرشفة تلقائية** للأوردرات المُسوّاة.
   - الإلغاء: `reverseSettlement()` — append-only (`reversed:true`، لا حذف).

7. **المرتجعات:**
   - كامل → `registerReturn()` / `markFullReturn()` → `shipStage: returned_full` (يقفل الأوردر).
   - جزئي → `markPartialReturn()` → `returned_partial` (لا يقفل)، يحسم من `salePrice`،
     ويسجّل `FE.RETURN_LOSS` عند وجود خسارة على غير العميل.

---

## 6. الصيغ المالية (المصدر الوحيد — `orders.js`)

```
المطلوب تحصيله من العميل  = max(0, salePrice + customerShipFee − discount − totalPaid)
                          = max(0, salePrice − discount − totalPaid)   // customerShipFee = 0
المستحق من شركة الشحن     = shipCollected − shippingCost
courierDirectFee          → عرض فقط — خارج كل الحسابات
```

- `getExpectedCollection(order)` — المطلوب من العميل.
- `getExpectedFromCompany(order)` — المستحق من الشركة (يقبل سالبًا لو الشركة تطالبنا).
- `calcRem(order)` (`core/order-math.js`) — نفس منطق المتبقي، يقرأ `customerShipFee` فقط (يتجاهل `courierDirectFee`).

---

## 7. الإشعارات (Cloud Functions — `functions/index.js`)

| الوظيفة | متى | لمن |
|---------|-----|-----|
| `onOrderAssigned` | عند إسناد `shippingOfficerId` لمستخدم | المُسنَد إليه (فردي) |
| `onOrderReadyForShipping` | عند `order.stage → 'shipping'` (مرة واحدة على حافة الانتقال) | **كل مسؤولي الشحن (broadcast)** |

نص الإشعار الجماعي يحمل: اسم العميل، رقم الأوردر، المحافظة، و«شامل الشحن / الشحن على العميل».
الرابط: `/shipping.html?id=...`. Push + إشعار in-app (الجرس).

---

## 8. الأفعال المركزية (`shipping-actions.js → shippingActions`)

| الفعل | الغرض | حدث مالي |
|-------|-------|----------|
| `prepareForShipping` | تجهيز بيانات الشحن (من الطباعة) | ❌ |
| `dispatchOrder` / `confirmShipped` | شحن الأوردر | ❌ |
| `quickPickupDispatch` | شحن سريع (pickup) | ❌ |
| `markDelivered` / `confirmDelivered` | تأكيد التسليم | ❌ |
| `collectFromCustomer` | تحصيل مباشر من العميل | ✅ `CUSTOMER_PAYMENT` |
| `markCompanyCollected` / `markUnderCollection` | تأكيد تحصيل الشركة (marker) | ❌ |
| `settleWithCompany` / `settleFromCompany` | تسوية مع شركة الشحن | ✅ `SHIPPING_SETTLEMENT` |
| `reverseSettlement` | إلغاء التسوية (append-only) | ✅ `SHIPPING_SETTLEMENT_REVERSAL` |
| `registerReturn` / `markFullReturn` | مرتجع كامل | حسب الحالة |
| `markPartialReturn` | مرتجع جزئي | `RETURN_LOSS` (عند الخسارة) |

كل فعل يُرجع `{ ok, errors, warnings, ... }` (H1.5)، والأفعال المالية مغلَّفة بـ `withIdempotency` (H1.2).

---

## 9. حقول الأوردر المتعلقة بالشحن

| الحقل | النوع | الوصف |
|-------|------|-------|
| `shipMethod` | string | `company` \| `pickup` \| `courier` |
| `shipCompanyId` / `shipCompanyName` | string | شركة الشحن (للـ company) |
| `deliveryAddress` | object | `{ gov, city, area, street, landmark, notes }` |
| `customerPhoneShip` | string | تليفون التسليم (fallback على `clientPhone`) |
| `priceIncludesShipping` | bool | هل `salePrice` يشمل الشحن؟ |
| **`courierDirectFee`** | number | **رسوم الشحن المباشرة — عرض فقط، خارج الحسابات** (جديد) |
| `customerShipFee` | number | يبقى **0** بعد التجهيز (مُبقى للتوافق مع القديم) |
| `shipStage` | string | الحالة الفرعية (انظر §10) |
| `shipCollected` | number | المبلغ المحصَّل عبر شركة الشحن |
| `shippingCost` | number | تكلفة الشحن على الشركة |
| `shipSettled` | bool | هل تمت التسوية مع شركة الشحن؟ |
| `shipSettledAmount` | number | مبلغ التسوية |

---

## 10. الحالات الفرعية (`shipStage` — `SHIP_STAGES`)

**Canonical (PR-1):**
`ready → shipped → delivered → under_collection → collected → closed`
+ `returned_full` / `returned_partial`.

**Legacy (مُبقاة للتوافق حتى ترحيل البيانات — DO NOT remove):**
`wait_delivery`, `wait_collection`, `returned`, `completed`.

> `shipStage` **مساعِدة فقط** — القرار الرسمي دائمًا من `order.stage` (W1.2 / C1.2).

---

## 11. ضمانات الحوكمة المطبَّقة

- **RULE A1 / H1.1** — لا كتابة مباشرة من الـ UI؛ كله عبر `shippingActions.*`.
- **RULE 4 / RULE 2** — الفلوس عبر FSE فقط؛ `courierDirectFee` لا يُنشئ أي حدث مالي.
- **RULE 6 / E1** — additive؛ الأوردرات القديمة (`customerShipFee > 0`) سليمة دون ترحيل.
- **RULE G8 / H2.6** — تغييرات الشحن المالية مغطّاة بـ smoke tests (`tests/core-order-math.test.mjs`, `tests/core-shipping-utils.test.mjs`).
- **RULE H1.2** — الأفعال المالية idempotent.
- **RULE H1.3** — `shipping_settlements` append-only (`reversed:true` بدل الحذف).
