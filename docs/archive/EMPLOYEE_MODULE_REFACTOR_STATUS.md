# Employee Module Refactor Status

> **النطاق:** فصل UI Architecture لقسم الموظفين (Phase 0 + Phase 1A→1D).
> **القاعدة الحاكمة:** RULE U1 / L1 / E1 / G9 — Additive · Reversible · Zero Visual Regression.
> آخر تحديث: 2026-05-31 · الفرع: `claude/employee-module-architecture-9qZX1` · PR #1351

---

## 1. ملخّص تنفيذي

| المؤشر | قبل المشروع | بعد المشروع | التغيير |
|--------|------------:|------------:|:-------:|
| **Static Inline Styles** (الصفحات المكتملة) | **104** | **0** | ✅ −104 |
| **Inline Events** (الصفحات المكتملة) | **31** | **0** | ✅ −31 |
| **Local `<style>` blocks** | 1 | 0 | ✅ −1 |
| **Runtime/Dynamic Styles** (مُستثناة U1.6) | 22 | 22 | ⏸️ محفوظة عمدًا |

> **ملاحظة منهجية:** الأرقام أعلاه هي **inline `style="..."` attributes** الفعلية (القياس الدقيق). تقرير Phase 1A ذكر "174" لأنه استخدم `grep -o style=` فضفاض شمل أسطر الـ `<style>` block الـ CSS — القيمة الدقيقة لـ `my-requests` كانت **33 attribute + كتلة `<style>` 42 سطر**، وكلها أُزيلت.

---

## 2. إجمالي Inline Styles — قبل/بعد

### قبل المشروع (104 static)
| الصفحة | Static Styles | Dynamic (runtime) | `<style>` block |
|--------|--------------:|------------------:|:---------------:|
| `my-requests.html` | 33 | 0 | ✅ (42 سطر) |
| `my-profile.html` | 71 | 22 | — |
| `my-home.html` | 0 | 0 | — |
| `employee-control.html` | 0 | 0 | — |
| **الإجمالي** | **104** | **22** | **1** |

### بعد المشروع (0 static)
| الصفحة | Static Styles | Dynamic (محفوظ U1.6) | `<style>` block |
|--------|--------------:|---------------------:|:---------------:|
| `my-requests.html` | **0** | 0 | ❌ مُزال |
| `my-profile.html` | **0** | 22 | — |
| `my-home.html` | **0** | 0 | — |
| `employee-control.html` | **0** | 0 | — |
| **الإجمالي** | **0** | **22** | **0** |

---

## 3. إجمالي Inline Events — قبل/بعد

| الصفحة | قبل | بعد |
|--------|----:|----:|
| `my-requests.html` | 20 | **0** |
| `my-profile.html` | 7 | **0** |
| `my-home.html` | 2 | **0** |
| `employee-control.html` | 2 | **0** |
| **الإجمالي** | **31** | **0** |

كل الأحداث حُوّلت إلى `addEventListener` + **event delegation** على حاويات مستقرة (`data-tab`, `data-act`, `data-close`).

---

## 4. الصفحات المكتملة (4)

| # | الصفحة | Phase | ملف CSS مصاحب | ملاحظات |
|---|--------|:-----:|---------------|---------|
| 1 | `my-requests.html` | 1A | `my-requests.css` (جديد) | + إصلاح bug R2 (مُوثَّق أدناه) |
| 2 | `my-profile.html` | 1B | `my-profile.css` (موسَّع) | 22 runtime style محفوظة |
| 3 | `my-home.html` | 1C | (نظيف مسبقًا) | MVC مثالي — events فقط |
| 4 | `employee-control.html` | 1D | (نظيف مسبقًا) | MVC مثالي — events فقط |

**أساس Design System (Phase 0):** `design-system/employee.css` + استكمال الحالات الأربع في `components.css` + `EMPLOYEE_DS.md` (Adoption Matrix).

---

## 5. Bugs

### مكتشفة مسبقًا (موجودة قبل المشروع)
| ID | الصفحة | الوصف | الحالة |
|----|--------|-------|--------|
| **R2** | `my-requests.html` | حقول `fg-employee/salary-type/month/client` لها `class="fg hide"` مع `.hide{!important}` فكانت لا تظهر عند اختيار "مرتب" | ✅ **أُصلح في Phase 1A كـ Bug Fix مستقل** (تحويل لـ `hide-soft`) |
| **R5** | `my-requests.html` | `serverTimestamp()` مُستخدم بدون import (latent) | ⏸️ **مُؤجَّل عمدًا** — خارج نطاق الترحيل، يُعالَج في PR منفصل |

### تم إصلاحها اضطراريًا أثناء الترحيل
| الصفحة | الإصلاح | السبب |
|--------|---------|-------|
| `my-requests.html` (R2) | إظهار الحقول المعطّلة | كان لا بد من تحويل آلية show/hide لتحقيق inline=0، وكشف التحويل أن الحقول معطّلة — أُصلح بموافقة صريحة |

> **الفصل محفوظ:** R2 هو الإصلاح الاضطراري الوحيد، وكان بموافقتك المسبقة وموثَّقًا كـ Bug Fix مستقل. لا إصلاحات أخرى في 1B/1C/1D (نظيفة تمامًا).

---

## 6. الصفحات المتبقية في قسم الموظفين

### God Pages المتبقية (Phase 2)
| الصفحة | الأسطر | الحالة | inline styles (static, تقديري) |
|--------|-------:|--------|:-------------------------------:|
| `employees.html` | 1810 | 🔴 god page (> 1500) | ~174 |
| `employee-profile.html` | 2023 | 🔴 god page (> 1500، فوق حد H1.7) | ~123 |

> هاتان الصفحتان **مُجمَّدتان** تحت RULE G5/H1.7 — تحتاجان **خطة تفكيك** قبل أو أثناء الترحيل، لا ترحيل مباشر.

### ملفات CSS مصاحبة قائمة (للمراجعة في Phase 3 — UI Consistency)
`employees.css` (131) · `employee-profile.css` (127) — تحتوي مكوّنات مكرّرة قابلة للتوحيد مع `employee.css` (مغطّاة في Adoption Matrix).

---

## 7. التوصية المعمارية للمرحلة التالية (Phase 2)

> **القاعدة:** God pages لا تُرحَّل مباشرة (E1/G5). التفكيك يسبق الترحيل.

**المسار الموصى به لـ `employee-profile.html` (2023 سطر) و `employees.html` (1810):**

1. **لا big-bang.** صفحة واحدة لكل PR، والقديمة تظل تعمل (E1).
2. **استغلال التفكيك الجزئي القائم:** `employee-profile.html` لديه بالفعل `features/employee-profile/views/*` (8 ملفات render مفصولة). الترحيل = نقل الـ markup المتبقّي + inline styles إلى تلك الـ views + استدعاؤها، **بدون لمس** business logic.
3. **النمط المُثبَت:** كرّر منهجية 1A/1B — static→classes، events→delegation، runtime يبقى (U1.6)، CSS page-scoped أو DS حيث يطابق بكسل.
4. **هدف الحجم:** خفض كل god page تحت 1500 سطر تدريجيًا (إخراج الـ render إلى الـ feature modules)، مما **يرفع تجميد H1.7** تلقائيًا.
5. **الأولوية:** `employee-profile.html` أولًا (الأعلى أسطرًا + الأكثر inline + بنيته المفكَّكة جاهزة)، ثم `employees.html`.
6. **معيار القبول لكل PR:** static inline=0 · events=0 · runtime محفوظ · business logic IDENTICAL · 0 Firestore writes · CI أخضر · الحجم ينخفض.

**بعد Phase 2 → Phase 3 (UI Consistency):** توحيد المكوّنات المكرّرة (cards/tabs/badges/states) عبر `employee.css` حسب الـ Adoption Matrix، وتبنّي DS حيث يطابق.

---

## 8. الحالة الإجمالية

```
Phase 0  ✅ Design System Foundation        (employee.css + states + Adoption Matrix)
Phase 1A ✅ my-requests.html                 (33 static + <style> + 20 events → 0 · +R2 fix)
Phase 1B ✅ my-profile.html                  (71 static + 7 events → 0 · 22 runtime kept)
Phase 1C ✅ my-home.html                     (2 events → 0)
Phase 1D ✅ employee-control.html            (2 events → 0)
─────────────────────────────────────────────────────────────────────
Phase 2  ⏳ God pages decomposition          (employee-profile.html, employees.html)
Phase 3  ⏳ UI Consistency                    (component unification via Adoption Matrix)
```

**النتيجة:** كل الصفحات غير-god في قسم الموظفين أصبحت **خالية تمامًا** من static inline styles والـ inline events، مع صفر visual regression وصفر تغيير في business logic أو Firestore.
