# 📜 دستور تطوير بوابة العميل — Development Standards

> **إلزامي.** أي ملف/مكوّن/نمط جديد في `features/customer-portal/` يجب أن يلتزم بهذه القواعد.
> ممنوع إنشاء أي شيء خارج هذه المعايير. هذا الدستور يكمّل `CLAUDE.md` (دستور النظام) ولا يخالفه.

## 0) المبادئ الحاكمة
1. **فصل 6 طبقات:** UX · UI(Components) · Theme · CSS · JS · Data. لا تسرّب مسؤوليات.
2. **الواجهة عرض فقط (L1):** صفر منطق أعمال في Components/Views.
3. **قيمة بصرية واحدة المصدر:** كل لون/خط/مسافة/حجم/ظل من **Theme** فقط.
4. **مكوّنات قابلة لإعادة الاستخدام:** نقية، بلا حالة، بلا بيانات.
5. **Layout موحّد:** كل الصفحات تركب على نفس الـ Shell.
6. **E1:** كل تطوير incremental · backward-compatible · reversible.

---

## 1) Naming Convention (إلزامي)

| العنصر | القاعدة | مثال صحيح | ممنوع |
|--------|---------|-----------|-------|
| اسم ملف | `kebab-case` | `order-card.js` | `OrderCard.js` |
| ملف Service | `*.service.js` | `orders.service.js` | `ordersData.js` |
| ملف View | `*.view.js` | `home.view.js` | `home.js` |
| ملف Validator | `*.validator.js` | `profile.validator.js` | — |
| دالة Component | `PascalCase` | `OrderCard(props)` | `order_card()` |
| دالة عادية | `camelCase` + فعل | `formatMoney()`, `loadOrders()` | `data()` |
| ثابت | `UPPER_SNAKE` | `MAX_ITEMS`, `STAGE_AR` | `maxItems` |
| متغير منطقي | بادئة `is/has/can` | `isLoading`, `canEdit` | `loading2` |
| Class في CSS | بادئة `cp-` + `kebab` (BEM) | `cp-card`, `cp-card__title`, `cp-card--active` | `card`, `Card1` |
| Token في CSS | بادئة `--t-` | `--t-brand`, `--t-space-4` | `--myColor` |
| `id` في HTML | بادئة `cp-` + `kebab` | `id="cp-home-orders"` | `id="x1"` |
| Data-attr | `data-*` `kebab` | `data-order-id` | `data-orderId` |
| Collection | `snake_case` (نظام قائم) | `public_cards` | `publicCards` |

**ممنوع:** الاختصارات الغامضة · الأرقام في الأسماء (`btn2`) · المخالطة بين الأنماط.

---

## 2) Folder Structure (إلزامي — لا ملف خارجها)

```
features/customer-portal/
├── theme/        # الطبقة Theme — التوكنز فقط (theme.css)
├── styles/       # الطبقة CSS — base.css · layout.css · components.css · utilities.css
├── components/   # الطبقة UI — مكوّنات نقية (دالة عرض لكل ملف)
├── layout/       # الإطار — app-shell · header · nav · modal-manager · notification-manager
├── views/        # الصفحات — تركيب Components + نداء Services (صفر تنسيق/منطق أعمال)
├── services/     # طبقة الوصول للبيانات — تغلّف clientActions + قراءات Firestore
├── utils/        # دوال نقية بلا حالة — format · dom · url
├── validators/   # تحقّق فقط — تُرجع {ok, errors}
├── state/        # إدارة الحالة — store (pub/sub) فقط
├── STANDARDS.md  # هذا الملف
└── portal.entry.js  # نقطة الإقلاع
```
**القاعدة:** الملف يعيش في المجلد الذي يطابق طبقته. لا استثناءات. لا "ملف متفرّق" في الجذر.

---

## 3) File Structure (بنية كل ملف)

كل ملف JS بهذا الترتيب:
```
1) تعليق رأسي: المسؤولية + الطبقة (سطر واحد).
2) imports (مرتّبة: خارجي → داخلي).
3) ثوابت الملف (UPPER_SNAKE).
4) دوال مساعدة نقية (إن وُجدت).
5) التصدير (named exports فقط — ممنوع default).
```
- **مسؤولية واحدة لكل ملف.** ملف > **300 سطر** = إشارة لتقسيم (نظام: >1500 خطر).
- ES Modules فقط. صفر `var`. `const` افتراضياً، `let` عند الحاجة.
- صفر كود تنفيذي معلّق على مستوى الوحدة إلا في `*.entry.js` و`layout/*`.

---

## 4) Component Structure (الطبقة UI — إلزامي)

```
عقد المكوّن:  Component(props) → string (HTML)   |   لا شيء آخر
```
**يجب (MUST):**
- **نقي:** نفس الـ props → نفس الخرج. بلا أي تأثير جانبي.
- **بلا بيانات:** ممنوع fetch · ممنوع Firestore · ممنوع وصول لـ `state` مباشرة.
- **بلا منطق أعمال:** صفر حسابات مالية/قرارات workflow.
- **بلا قيم بصرية:** صفر لون/خط/px داخله — فقط `class="cp-…"`.
- **يبلّغ النية عبر `data-*`** (event delegation في الـ Layout/View) — **ممنوع `onclick=` مضمّن**.
- **ملف واحد لكل مكوّن** + توثيق عقد الـ props أعلى الملف.
- يهرّب أي نص ديناميكي (`escape()`) لمنع HTML injection.

**ممنوع (MUST NOT):** حالة داخلية · timers · استدعاء Services · معرفة مصدر البيانات.

---

## 5) CSS Standards (إلزامي)

- **كل قيمة بصرية من `--t-*`** (لون/مسافة/حجم/نصف قطر/ظل/خط). **صفر hex/rgb** و**صفر px** للألوان والمسافات في `components.css`. (px مسموح للأبعاد البنيوية الفريدة فقط، موثّقة.)
- **التسمية:** `cp-` + BEM: `cp-block`, `cp-block__element`, `cp-block--modifier`.
- **عزل التعارض:** كل أصناف البوابة بادئة `cp-` (درس `.panel` مع shared.css).
- **فصل صارم:**
  - `theme.css` = توكنز فقط.
  - `layout.css` = أين (shell/header/nav/main/overlay) — لا شكل مكوّن.
  - `components.css` = كيف يبدو كل مكوّن — لا تخطيط صفحة.
  - **الصفحات (views) لا تضيف أي CSS جديد** — تركيب فقط.
- **ممنوع:** `style="…"` مضمّن في HTML/Components · `!important` (إلا override موثّق) · ألوان مكرّرة (→ توكن) · أشكال مكرّرة (→ class).

---

## 6) JavaScript Standards (إلزامي)

- **حدود الطبقات مُفروضة:**
  - Component → عرض فقط (لا fetch).
  - View → تركيب + ينادي **Service** (لا Firestore مباشر، لا منطق أعمال — L1).
  - Service → ينادي `clientActions.*` للكتابة (H1.1) + قراءات مغلّفة.
  - Util → نقي. Validator → `{ok, errors, warnings}` فقط.
- **كل كتابة Firestore عبر `clientActions`** (allowlist) — **ممنوع** `setDoc/addDoc/updateDoc/...` في HTML/View/Component.
- **قراءات محدودة (G3):** كل `getDocs`/`onSnapshot` فيه `limit()`.
- **الأحداث:** `addEventListener` + **event delegation** — ممنوع `onclick=` مضمّن.
- **معالجة الأخطاء:** لا catch صامت يخفي خطأ حقيقي · رسائل للمستخدم عبر NotificationManager (toast).
- **التحميل الكسول:** `import()` ديناميكي للـ views والاعتماديات الثقيلة.
- **ممنوع:** متغيّرات عامة (`window.*`) إلا ما تنشره الـ Managers صراحةً · `console.log` في مسار الإنتاج · `var` · منطق أعمال في الواجهة.

---

## 7) Accessibility Standards (إلزامي — WCAG AA)

- **HTML دلالي:** `<button>` للأفعال · `<a>` للتنقّل · `<label for>` لكل حقل إدخال.
- **لوحة المفاتيح:** كل عنصر تفاعلي قابل للتركيز + **مؤشّر تركيز ظاهر** (`:focus-visible`).
- **قارئ الشاشة:** `aria-label` لأي زر أيقونة فقط · `aria-live="polite"` للـ toasts · `aria-modal` للـ overlays.
- **اللون ليس الدليل الوحيد:** الحالة = أيقونة + نص + لون (مش لون لوحده).
- **التباين:** توكنز الألوان تحقّق AA (نص/خلفية ≥ 4.5:1).
- **RTL:** `dir="rtl"` + خصائص منطقية (`margin-inline`, `inset-inline`) — لا `left/right` ثابتة.
- **حجم اللمس:** ≥ `--t-touch-min` (46px) لكل هدف تفاعلي.
- **الصور:** `alt` ذو معنى (أو `alt=""` للزخرفية).

---

## 8) Responsive Standards (إلزامي — Mobile First)

- **Mobile-First:** الأنماط الأساسية = موبايل. التحسينات في `@media (min-width: …)` **فقط** (لا `max-width` كأساس).
- **Breakpoints مركزية** (موثّقة في الدستور): `760px` (تابلت/ديسكتوب) · `1100px` (واسع). **ممنوع** نقاط عشوائية.
- **تخطيط مرن:** لا عرض ثابت يتجاوز `--t-container`. شبكات `auto-fill/minmax`.
- **اللمس أولاً:** `:hover` تحسين اختياري لا يعتمد عليه فعل أساسي.
- **اختبار إلزامي على:** `360px` · `768px` · `1280px` قبل أي دمج.

---

## 9) Performance Standards (إلزامي)

- **First Paint سريع:** ارسم الـ Shell فوراً، ثم حمّل البيانات تدريجياً (skeletons).
- **قراءات محدودة** بـ `limit()` + فهارس مناسبة.
- **Lazy load:** views عبر `import()` · صور `loading="lazy"`.
- **صفر مكتبات ثقيلة:** Vanilla JS — لا أطر ثقيلة.
- **DOM فعّال:** تجميع التحديثات (innerHTML/DocumentFragment) لا تعديلات متفرّقة في حلقة.
- **شبكة:** صفر استعلامات مكرّرة · تخزين مؤقت للحالة في `state/store`.
- **حجم:** صفر أصول غير مستخدمة · لا hex مكرّر (→ توكن).

---

## ✅ Definition of Done (شيك ليست إلزامية قبل أي دمج)
- [ ] الملف في المجلد الصحيح لطبقته · اسمه يتبع الـ Naming.
- [ ] Component نقي (لا fetch/state/منطق/لون).
- [ ] صفر قيم بصرية مطلقة — كلها `--t-*`.
- [ ] صفر كتابة Firestore في الواجهة · كل قراءة بـ `limit()`.
- [ ] صفر `onclick=` مضمّن / `style=` مضمّن / `!important`.
- [ ] Accessibility: labels · focus · aria · لمس ≥46px.
- [ ] Mobile-first + اختبار على 3 أحجام.
- [ ] حالات الشاشة الأربع موجودة: Loading · Default · Empty · Error.

## 🚫 ممنوعات قاطعة (Hard NOs)
1. لون/خط/مسافة مطلقة داخل Component أو View.
2. منطق أعمال أو حساب مالي في الواجهة.
3. كتابة Firestore خارج `clientActions`.
4. ملف خارج بنية المجلدات · `default export` · `var` · `onclick=` مضمّن.
5. مكوّن غير قابل لإعادة الاستخدام (مرتبط بصفحة بعينها).
