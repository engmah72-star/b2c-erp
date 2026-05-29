# DESIGN_SYSTEM_MIGRATION_PLAN.md — خطة ترحيل النظام للتصميم الجديد (slate)

> **الهدف:** نقل كل صفحات النظام إلى نظام التصميم الرسمي (`design-system/` — slate) **بدون كسر التشغيل الحالي**، تدريجياً، وقابل للتراجع بالكامل.
>
> **القاعدة الحاكمة:** RULE **E1** (Evolve the Runtime, Do Not Disrupt the Business) + **G9** (Incremental Migration). **ممنوع** Big-bang.
>
> آخر تحديث: 2026-05-29

---

## 1. الخلاصة المُتعلَّمة (Why this plan exists)

بعد تنفيذ **٣ صفحات** (التقارير، التصميم، الشحن) بنفس الأسلوب بنجاح، اتثبت إن في **recipe متكرر** آمن وسريع. الدرس الأساسي:

> **النجاح جه من إن طبقة البيانات والأفعال والصلاحيات كانت بالفعل مركزية (`core/`, `*-actions.js`, `*-service.js`).**
> فبناء واجهة جديدة = **إعادة استخدام** الـ logic الموجود، مش إعادة كتابته. الصفحة الجديدة = **View** بس (RULE L1).

الدرس الثاني:

> **الأمان جه من البناء "بجانب" (alongside) مش "بدل" (instead-of).** كل صفحة جديدة `*-ds.html` ملف standalone، القديمة تفضل شغّالة، والتراجع = حذف ملف واحد. صفر خطر على المباشر.

---

## 2. النمط المتكرر (The Recipe — اتبعه لكل صفحة)

### الخطوة 0 — لا big-bang
صفحة واحدة في الـ PR الواحد. القديمة تفضل تعمل. ممنوع لمس Stable Core.

### الخطوة 1 — افحص الصفحة الحالية (Explore agent)
استخرج بدقة (file:line):
- **Bootstrap/imports** (firebase-init, actions, helpers, permissions)
- **Auth + permission gating** (نمط `onAuthStateChanged` + `users/{uid}` + role/pages + `RMAP`)
- **Data queries** (collections + query shapes + limits + onSnapshot/getDocs + الحقول المقروءة)
- **Constants/sub-states** (stage, designStage, shipStage…)
- **الأفعال المركزية** (أهم حاجة: اسم الدالة + الموديول + شكل الـ params + idempotency)
- **RULE 8** (`canSee`/`maskPhone`/`ROLE_CAN_SEE_*`)
- **Helpers/aggregators** المتاحة في `core/` و `*-service.js`

### الخطوة 2 — تحقق من التواقيع فعلياً
لا تثق في الملخّص للأفعال **المالية**. افتح `*-actions.js` وأكّد:
- هل `db` مطلوب أم له default؟ (مثال: `order-actions.js` له default، `shipping-actions.js` **لا**)
- شكل الـ params بالظبط + قيم enum المسموحة.

### الخطوة 3 — ابنِ `{page}-ds.html` (candidate جديد بجانب القديم)
- `<link rel="stylesheet" href="design-system/preview-kit/kit.css">` (slate tokens + components + order-card + status/stage chips)
- `data-theme="dark"`، sidebar + topbar بنفس نمط الصفحات المنفّذة
- استورد **نفس** الـ aggregators/actions/permissions من `core/` و `*-service.js` و `*-actions.js`
- KPIs (`.stats` → 2-up على الموبايل) + filters (`.ds-tabs`) + board (`.order-card`) + drawer للتفاصيل والأفعال

### الخطوة 4 — القواعد الإلزامية داخل الصفحة
| القاعدة | التطبيق |
|--------|---------|
| **A1 / H1.1** | **صفر** `updateDoc/setDoc/addDoc/deleteDoc/writeBatch/runTransaction/dispatchFinancialEvent/addLedgerToBatch` في الـ HTML. كل كتابة عبر `orderActions.*` / `shippingActions.*` |
| **RULE 2/4/G6** | المال يمرّ عبر FSE **جوّا** الأفعال — الصفحة تنادي action بس |
| **RULE 8** | تليفون العميل عبر `maskPhone(phone, ROLE_CAN_SEE_PHONE.has(role))`؛ بيانات التصميم خلف `ROLE_CAN_SEE_DESIGN` |
| **G3** | كل `onSnapshot`/`getDocs` فيه `limit()` |
| **W1 / C2** | `order.stage` مصدر الحالة الوحيد؛ الـ sub-states عبر helpers (`normalizeShipStage`…)؛ القيم الثابتة من الثوابت المركزية |
| **L1** | الصفحة View فقط — لا business logic، لا validation، لا workflow inline |
| **C1.5** | صفر تكرار logic — أعِد استخدام `*-service.js`/aggregators |

### الخطوة 5 — تحقّق محلياً قبل الـ PR
```bash
# 1) صفر كتابة مباشرة
grep -nE "updateDoc\(|setDoc\(|addDoc\(|deleteDoc\(|writeBatch\(|runTransaction\(|dispatchFinancialEvent\(|addLedgerToBatch\(" {page}-ds.html   # لازم NONE
# 2) كل الـ imports موجودة (export ... في الموديولات)
# 3) syntax: استخرج <script type="module"> وشغّل node --check
```

### الخطوة 6 — PR (draft) → CI → merge
- CI الحقيقي = 4 checks: **Forbidden Firestore writes · Bundle Size · God-page · Security Lint** (كلها لازم خضرا)
- **TestSprite "No tests detected"** = check خارجي تجميلي، بيفشل دايماً مع تغيير بدون tests — **يُتجاهَل** (زي كل PRs المنفّذة)
- merge عبر fast-forward لـ `main` (مفوَّض auto-merge)، الموقع يُنشر تلقائياً

### الخطوة 7 — المستخدم يحكم
يفتح `https://business2card-c041b.web.app/{page}-ds.html`، يقارن بالقديمة، يبعت screenshots موبايل + ديسكتوب.

---

## 3. تتبّع التقدّم (Progress Tracker)

| # | الصفحة | الملف الجديد | الحالة | ملاحظات |
|---|--------|-------------|--------|---------|
| 1 | التقارير | `reports-ds.html` | ✅ مدموج | بيانات حقيقية (read-only) |
| 2 | التصميم | `design-ds.html` | ✅ مدموج | تشغيلي + أفعال workflow كاملة |
| 3 | الشحن | `shipping-ds.html` | ✅ مدموج | تشغيلي؛ التسوية الجماعية في حسابات الشحن |
| 4 | الإنتاج | `production-ds.html` | ⏳ التالي | submitToShipping + costItems + product status |
| 5 | الحسابات | `accounts-ds.html` | ⏳ | wallets + ledger (read) + مدفوعات عبر FSE |
| 6 | العملاء | `clients-ds.html` | ⏳ | god page (4760 سطر) — view فقط أولاً |
| 7 | الموردين | `suppliers-ds.html` | ⏳ | supplier_payments عبر FSE |
| 8 | الاعتمادات | `approvals-ds.html` | ⏳ | approval-actions + approve_designs |
| 9 | حسابات الشحن | `shipping-accounts-ds.html` | ⏳ | التسوية الجماعية (settleWithCompany) |
| 10 | الأرشيف / لوحات الأدوار | لاحقاً | ⏳ | dashboards لكل دور |

**أولوية الترتيب** = حسب تسلسل الـ workflow التشغيلي (تصميم → طباعة/إنتاج → شحن → حسابات) ثم الصفحات المساندة.

---

## 4. Definition of Done لكل صفحة (Acceptance Checklist)

- [ ] auth gate مطابق للصفحة الأصلية (role + pages + `RMAP`)
- [ ] كل الكتابة عبر central actions — `grep` للكتابة المباشرة = NONE
- [ ] RULE 8 مطبّق (phone/design data)
- [ ] listeners bounded (`limit`)
- [ ] reuse للـ aggregators/actions الموجودة (صفر تكرار)
- [ ] الأرقام/الحالات مطابقة للصفحة القديمة (تحقّق المستخدم)
- [ ] الموبايل مظبوط (KPIs 2-up، drawer full-width)
- [ ] القديمة لسه شغّالة (لم تُلمَس)
- [ ] CI الحقيقي أخضر · merge · المستخدم وافق

---

## 5. خطة الـ Cutover النهائي (إزاي الجديد يحلّ محل القديم — لاحقاً، خلف flag)

> **لا يبدأ إلا بعد ما كل الصفحات الأساسية تتعمل ويوافق عليها المستخدم.**

1. **Lucide self-host** (شرط إلزامي قبل الإنتاج): تثبيت/تضمين نسخة Lucide محلياً (`vendor/`) بدل unpkg CDN — عشان الأيقونات تشتغل offline وبدون اعتماد خارجي. *(مؤجَّل حالياً لأن الـ outbound network محجوب في بيئة التطوير — يُنفَّذ أول ما يسمح.)*
2. **Feature flag** (E1.8): `localStorage`/query toggle (افتراضي off) يحوّل روابط الـ sidebar من `{page}.html` إلى `{page}-ds.html`.
3. **Rollout تدريجي**: تفعيل الـ flag لدور/مستخدم واحد، مراقبة، توسعة.
4. **Usage validation**: متابعة الأخطاء (telemetry) + feedback المستخدمين.
5. **Retire legacy**: لمّا الجديد يغطّي ١٠٠٪ ويستقر، الصفحة القديمة تتحوّل لـ redirect للجديدة (مش حذف فوري — RULE E1.1).
6. كل خطوة قابلة للـ rollback بـ flag toggle بدون redeploy.

---

## 6. المخاطر المفتوحة (Open Risks)

| الخطر | الأثر | التخفيف |
|------|------|---------|
| **Lucide عبر unpkg CDN** | لو الـ CDN وقع/offline → أيقونات فاضية (مش كسر وظيفي) | مثبّت على `0.479.0` (مش `@latest`)؛ self-host قبل أي cutover إنتاجي |
| **اختلاف الأرقام عن القديمة** | ثقة المستخدم | reuse نفس الـ aggregators بالظبط + تحقّق مقارن من المستخدم |
| **أفعال مالية حساسة** | corruption | تُنادى الأفعال المركزية فقط (FSE + idempotency)؛ التسوية الجماعية متروكة لصفحتها المتخصّصة |
| **God pages (clients 4760 سطر)** | تعقيد | الجديد = view فقط أولاً؛ الأفعال تدريجياً عبر central actions |

---

## 7. القاعدة النهائية

> **كل صفحة جديدة لازم:** تعمل بجانب القديمة · View فقط · صفر كتابة مباشرة · reuse الـ core · RULE 8 · bounded · قابلة للتراجع بحذف ملف.
>
> النتيجة المستهدفة: **النظام كله بالتصميم الجديد — بدون إعادة بناء، بدون كسر تشغيل، بدون chaos.**

أي drift عن الخطة دي يُعامَل تحت RULE E1/G9.
