# 🎨 Business2Card ERP — دليل النظام الكامل
**Firebase Project:** business2card-c041b  
**GitHub:** engmah72-star.github.io/b2c-erp  
**الإصدار:** v4.0 — Mobile First

---

## 🔄 تسلسل العمل (Workflow)

```
العميل يطلب
    ↓
✏️ تصميم (design.html)
    ↓ [اعتمد]
🖨️ طباعة (print.html) ← بنود بيع + تحصيل
    ↓ [ابدأ تنفيذ]
🏭 تنفيذ (production.html) ← بنود تكلفة
    ↓ [إرسال للطباعة]
🖨️ طباعة ← [جاهز للشحن]
    ↓ [إرسال للشحن]
🚚 شحن (shipping.html)
    ↓ [تم التسليم]
📁 أرشيف
```

**قاعدة:** كل أوردر يظهر في صفحة واحدة بس في أي وقت.

---

## 📁 الملفات — كل ملف وحدوده

### `shared.css` — نظام التصميم
- CSS variables (ألوان، مسافات، راديوس)
- Layout: `.app-shell` + `.sidenav` + `.main`
- Mobile: Bottom Nav + Slide sidenav
- Components: cards, buttons, badges, modals, panels
- **لو عايز تغير لون** ← غير في `:root` بس

### `shared.js` — المساعدات
- Firebase config (مكان واحد)
- Workflow stages و permissions
- Helper functions: `fn()`, `toast()`, `nowStr()`
- **مش مطلوب import في كل صفحة — كل صفحة مستقلة**

---

### `login.html` — تسجيل الدخول
- Firebase Auth (Email + Password)
- بعد الدخول يروح `index.html`
- **لو حابب تغير صفحة البداية:** السطر `window.location.href='index.html'`

### `index.html` — لوحة التحكم
- Pipeline يعرض الأوردرات في كل مرحلة
- إحصائيات real-time
- تنبيهات الأوردرات المتأخرة
- **Firebase collections المستخدمة:** `design_orders`, `print_orders_v2`, `shipments_v2`

### `clients.html` — العملاء
- إضافة / تعديل / بحث
- أرقام هواتف فريدة (لا تكرار)
- 27 محافظة + مدينة تلقائية
- واتساب مباشر من الكارت
- **Firebase collection:** `clients`

### `design.html` — التصميم
- كانبان: في الانتظار / جاري / اعتمد / مرفوض
- ربط بالعميل + المصمم + تاريخ التسليم
- رفع ملفات التصميم (Firebase Storage)
- **لما تضغط "اعتمد"** → يفتح أوردر في print.html
- **Firebase collections:** `design_orders`, `clients`, `designers_v2`

### `production.html` — التنفيذ
- بيشوف الأوردرات اللي `prodStatus = 'in_production'` بس
- بنود التكلفة مع الموردين حسب التخصص
- **بعد "منتهي"** → زرار "🖨️ إرسال للطباعة"
- **Firebase collections:** `print_orders_v2`, `print_costs_v2`, `suppliers_v2`

### `print.html` — الطباعة
- بيشوف: `طباعة` + `جاهز` بس
- بنود البيع + التحصيل + PDF
- **بعد "جاهز"** → زرار "🚚 إرسال للشحن"
- التحصيل بيحدّث رصيد المحفظة تلقائي
- **Firebase collections:** `print_orders_v2`, `print_items_v2`, `wallets`, `transactions_v2`

### `shipping.html` — الشحن
- بيشوف: `جاهز` بس (الجاهزة للشحن)
- شركات شحن أو مندوب داخلي
- إيصال تسليم PDF
- **Firebase collections:** `shipments_v2`, `print_orders_v2`, `shippers_v2`

### `accounts.html` — الحسابات
- المحافظ والكاش (نفس collection)
- سجل الحركات المالية
- حسابات الموردين
- **Firebase collections:** `wallets`, `transactions_v2`, `supplier_payments`

### `products.html` — المنتجات
- كتالوج ديجيتال وأوفست
- سعر افتراضي لكل منتج
- **Firebase collection:** `products_v2`

### `suppliers.html` — الموردين
- موردين حسب التخصص (ورق / زنكات / طباعة / قص / سلفنة / شحن)
- حساب كل مورد (مدفوع / باقي)
- **Firebase collections:** `suppliers_v2`, `print_costs_v2`, `supplier_payments`

### `reports.html` — التقارير
- مبيعات شهرية
- أداء المصممين والموظفين
- تصدير Excel
- **Firebase collections:** متعدد (read only)

### `settings.html` — الإعدادات
- المحافظ والكاش (= طرق الدفع)
- المستخدمين والأدوار
- صلاحيات مرئية لكل مستخدم
- بنود التكلفة / تصنيفات العملاء / مصادر العملاء
- **Firebase collections:** `wallets`, `users`, `settings`

---

## 🔑 Firebase Collections

| Collection | الوصف | يُستخدم في |
|-----------|-------|-----------|
| `clients` | العملاء | clients, design, print |
| `users` | المستخدمين + الأدوار + الصلاحيات | كل الصفحات |
| `wallets` | المحافظ والكاش (= طرق الدفع) | print, accounts, settings |
| `transactions_v2` | سجل الحركات المالية (لا يُحذف) | accounts |
| `design_orders` | أوردرات التصميم | design, print |
| `print_orders_v2` | أوردرات الطباعة | print, production, shipping |
| `print_items_v2` | بنود البيع | print |
| `print_costs_v2` | بنود التكلفة | production, suppliers |
| `shipments_v2` | الشحنات | shipping |
| `products_v2` | المنتجات | products, print, design |
| `suppliers_v2` | الموردين | production, suppliers |
| `shippers_v2` | شركات الشحن | shipping |
| `designers_v2` | المصممين | design, suppliers |
| `supplier_payments` | مدفوعات الموردين | accounts, suppliers |
| `cash_sessions` | جلسات الكاش اليومية | accounts |
| `settings` (doc: main) | الإعدادات المرنة | settings |

---

## 👥 الأدوار والصلاحيات

| الدور | الصفحات |
|-------|---------|
| `admin` | كل الصفحات |
| `operation_manager` | كل شيء إلا الإعدادات المتقدمة |
| `customer_service` | العملاء + التصميم |
| `graphic_designer` | التصميم (أوردراته بس) |
| `design_operator` | التصميم + الموردين |
| `production_agent` | التنفيذ + الطباعة |
| `shipping_officer` | الطباعة + الشحن |
| `wallet_manager` | الحسابات |

---

## 💰 نظام المحافظ

```
wallets collection
├── type: 'wallet' → محفظة إلكترونية (018, 9080, إنستا باي)
├── type: 'cash'   → كاش (sessions يومية)
└── type: 'bank'   → بنك

لما العميل يدفع:
1. يختار المحفظة
2. الرصيد يتحدث تلقائي
3. transaction تتسجل في transactions_v2
```

---

## 🔧 تعديلات شائعة

**تغيير الألوان:**
```css
/* في shared.css — :root */
--r: #ff3d6e;  /* أحمر */
--g: #00d97e;  /* أخضر */
--b: #3b9eff;  /* أزرق */
--p: #a78bfa;  /* بنفسجي */
```

**إضافة صفحة جديدة:**
1. انسخ أي صفحة موجودة
2. غير الـ `nav-link active` للصفحة الجديدة
3. غير الـ Firebase listeners
4. أضفها في `ROLE_PAGES` في `shared.js`

**تغيير Firebase Project:**
```javascript
// في كل ملف HTML — في الـ <script type="module">
const app = initializeApp({
  apiKey: "YOUR_KEY",
  projectId: "YOUR_PROJECT",
  // ...
});
```

---

## 📱 Mobile

- **Bottom Nav:** 5 أيقونات في الأسفل
- **Sidenav:** بيفتح بزرار ☰ في الأعلى
- **Modal:** بيطلع من الأسفل
- **Panel:** full screen على موبايل
- **Breakpoints:** 1024px / 768px / 400px

---

## 🚀 الرفع على GitHub Pages

1. افتح: `github.com/engmah72-star/b2c-erp`
2. Upload files → ارفع كل الملفات
3. Commit changes
4. الموقع شغال على: `engmah72-star.github.io/b2c-erp/login.html`

---

*Business2Card ERP v4 — Built for scale 🎯*
