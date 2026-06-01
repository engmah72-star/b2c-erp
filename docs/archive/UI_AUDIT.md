# UI CENTRALIZATION AUDIT

**النوع:** تقرير تشخيصي قراءة-فقط — لا توصيات تنفيذية مفصَّلة (الترحيل في PRs منفصلة).
**التاريخ:** 2026-05-19
**الفرع:** `claude/ui-centralization-rule-and-audit`
**السياق:** بعد إضافة **RULE U1 — UI Centralization** في `CLAUDE.md`، هذا التقرير يحصر الـ technical debt الحالي قبل أي ترحيل.

---

## 0) ملخص تنفيذي

| المؤشر | العدد | الحالة |
|--------|------|---------|
| إجمالي `style="..."` في الـ HTML | **5,759** | 🔴 شديد |
| `display:none` مكرر | **216** | 🔴 quick win |
| `font-size: 11px` تكرارات | **947** | 🔴 typography بلا tokens |
| `font-size: 10/11/12/13/14 px` مجموع | **3,061** | 🔴 5 قيم تغطي ~52% من font sizes |
| CSS variables في `shared.css` | **58** | ✅ نظام موجود ومتوفر |
| `#ff3d6e` متكرر (يطابق `--r` تقريباً) | **138** | 🔴 يجب استبداله بـ `var(--r)` |
| `#a78bfa` متكرر (purple variant) | **78** | 🔴 |
| `<style>` blocks محلية كبيرة (>100 سطر) | **3 صفحات** (clients/reports/production) | 🟡 |

**خلاصة:** عندنا token system جيد في `shared.css` (58 متغير)، لكنه **غير مُعتَمَد بشكل منهجي** في الـ HTML. ~85% من الـ inline styles تتجاوز النظام.

---

## 1) النظام المركزي الموجود في `shared.css`

### 1.1 — توكنز الألوان الأساسية

| Token | Value (Dark) | Value (Light) | الاستخدام |
|-------|------|------|-----------|
| `--b` | `#4a8ef5` | `#2563EB` | أزرق رئيسي |
| `--g` | `#00c87a` | `#059669` | نجاح/مدفوع |
| `--r` | `#f03660` | `#DC2626` | خطأ/مرفوض |
| `--y` | `#f0a020` | `#D97706` | تحذير/معلَّق |
| `--p` | `#8b7af8` | `#7C3AED` | بنفسجي/تصميم |
| `--c` | `#10c4de` | `#0891B2` | سماوي/شحن |
| `--o` | `#f47048` | `#EA580C` | برتقالي |

### 1.2 — توكنز حالات (Stages)
- `--st-new` `--st-design` `--st-print` `--st-late` `--st-urgent` `--st-completed`

### 1.3 — توكنز Tints (3 طبقات لكل لون)
- `--tint-{color}-soft` / `--tint-{color}-med` / `--tint-{color}-line`
- مفيد للـ badges و alerts — متوفر لكل من r, g, b, y, p, c, o

### 1.4 — Components مركزية في `shared.css`
- **Buttons:** `.btn`, `.btn-sm/xs/lg/full`, `.btn-r/g/b/y/p/c`, `.btn-ghost`
- **Badges:** `.badge`, `.bg-{color}`, `.bdg`, `.bdg-success/warn/danger/info`
- **Tables:** `.data-table`, `.table-wrap`
- **Cards:** `.card`, `.card-head`, `.card-body`

**ملاحظة:** النظام المركزي **كامل ومُصمَّم جيداً**. المشكلة في عدم الاستخدام، لا في غياب الأدوات.

---

## 2) أعلى الـ Hex Codes تكراراً (مع التحقق بـ grep)

| Hex | تكرار | يطابق Token؟ | الإجراء المقترح |
|-----|------|-------|------|
| `#fff` | **146** | يطابق `--snow` (text on dark) | استبدال بـ `var(--snow)` |
| `#ff3d6e` | **138** | قريب جداً من `--r` (`#f03660`) | **توحيد**: استخدم `var(--r)` |
| `#a78bfa` | **78** | قريب من `--p` (`#8b7af8`) | **توحيد**: استخدم `var(--p)` |
| `#00d97e` | **61** | قريب من `--g` (`#00c87a`) | **توحيد**: استخدم `var(--g)` |
| `#ffaa00` | **60** | لا token (orphan) | **خياران**: إما أضف `--amber`، أو طابق مع `--y` |
| `#3b9eff` | ~44 | لا token | orphan — يحتاج تقييم |
| `#7c5cff` | ~39 | قريب من `--p` | توحيد محتمل |

**📊 ملاحظة دقيقة:** أربعة hex codes فقط (#ff3d6e, #a78bfa, #00d97e, #ffaa00) تمثل **337 inline style**. توحيدهم لـ tokens موجودة = أكبر quick win لوني.

---

## 3) `<style>` Blocks المحلية

| الملف | عدد `<style>` blocks | السطور | المحتوى الرئيسي |
|------|---------------------|--------|-------------------|
| `reports.html` | 1 | **331 سطر** | KPI cards, charts, tabs, insights panels — معظمها يُكرِّر `.card`/`.kpi` بأسماء جديدة |
| `clients.html` | 1 | **194 سطر** | time period strips, hero stats, client cards (`.cc`, `.tp-tile`) |
| `production.html` | 1 | **117 سطر** | Work cards, timeline, custom animations |
| `design.html` | 1 | 39 سطر | Light page-level rules |
| `accounts.html` | 1 | 33 سطر | Minimal — يعتمد على shared.css |

**المجموع:** ~714 سطر CSS موزَّع داخل HTML بدل `shared.css`.

**ملاحظة جوهرية:** كثير من القواعد في الـ blocks محلية **تُعيد اختراع** ما هو موجود في `shared.css`. مثال: `.rep-card` في `reports.html` (46 سطر) ≈ `.card` في `shared.css` بأسماء مختلفة.

---

## 4) فحص اتساق ألوان الحالات (Status Colors)

| الحالة | اللون المتوقع | الواقع | الاتساق |
|--------|---------------|---------|---------|
| **مدفوع** | أخضر | `#00d97e` (61×) — قريب من `--g` (`#00c87a`) | ⚠️ near-duplicate |
| **غير مدفوع** | برتقالي/أصفر | `#ffaa00` في approvals.html — **ثابت** عبر الـ flows | ✅ ثابت داخل أكتر سياق |
| **مرفوض / خطأ** | أحمر | `#ff3d6e` (138×) — يختلف عن `--r` (`#f03660`) | 🔴 hex مختلف عن الـ token |
| **معلَّق / تصميم** | بنفسجي | `#a78bfa` (78×) — يختلف عن `--p` (`#8b7af8`) | 🔴 hex مختلف عن الـ token |
| **شحن** | سماوي | `--c` / `#22d3ee` / `#06b6d4` — 3 نسخ | ⚠️ multiple variants |

**تصحيح من الـ audit الأصلي:** ادعاء "unpaid = both red AND orange" خطأ. التحقق:
- `accounts.html:2218` يستخدم `#ff3d6e` للـ **رسوم سحب** (fees) — معنى مالي مختلف (loss = red)، **ليس** حالة unpaid
- "غير مدفوع" في approvals.html ثابت دائماً على `#ffaa00`

✅ الـ status colors اتساقها أفضل مما قاله الـ audit الأولي، لكن لسه فيه فرصة توحيد عبر استخدام tokens.

---

## 5) Typography — صفر tokens

| Font Size | تكرارات | المقترح |
|-----------|---------|---------|
| `11px` | **947** | `var(--fs-sm)` |
| `10px` | **771** | `var(--fs-xs)` |
| `12px` | **715** | `var(--fs-base)` |
| `13px` | **421** | `var(--fs-md)` |
| `14px` | **207** | `var(--fs-lg)` |
| **المجموع** | **3,061** | 5 قيم تغطي معظم الـ typography |

**النتيجة:** `shared.css` لا يحتوي على `--fs-*` tokens. كل font-size مكتوب بالقيمة المطلقة.

**font-weight:** نفس المشكلة — `400/600/700/800/900` موزَّعة بدون tokens (`--fw-*`).

---

## 6) أنماط Inline Style الأكثر تكراراً

| النمط | تكرارات | Migration target |
|------|---------|-------------------|
| `display:none` | **216** | `.hide { display:none !important; }` |
| `font-size:11px;color:var(--dim2)` | ~95 | `.text-sm-muted` |
| `flex:1;min-width:0` | ~65 | `.flex-1.truncate` |
| `color:var(--dim2)` | ~69 | `.text-muted` |
| `color:var(--r)` | ~56 | `.text-r` |
| `color:var(--g)` | ~45 | `.text-g` |
| `margin-bottom:10px` | ~47 | `.mb-md` |

**Quick wins:** الـ 3 أنماط الأولى وحدها = ~376 inline style → 3 utility classes.

---

## 7) Component Duplication

### 7.1 — Buttons
- `shared.css` فيها 8 button classes + 4 size variants ✅
- لكن **40-60 button** في الـ HTML تستخدم `style="padding:5px 16px;border-radius:20px;..."` بدل `class="btn btn-sm"`
- نمط شائع: period buttons في `clients.html`, `reports.html`, `accounts.html`

### 7.2 — Badges/Chips
- `shared.css` فيها `.badge`, `.bdg`, `.chip-*` (~15 class)
- **50+ inline badge** يُعيد بناء `.bg-y` etc. من الصفر بـ inline styles
- نمط متكرر: `style="background:rgba(255,170,0,.15);color:#ffaa00;padding:1px 7px;border-radius:10px;..."`

### 7.3 — Cards
- `shared.css` فيها `.card`, `.card-head`, `.card-body`
- لكن كل من `reports.html` (`.rep-card`), `clients.html` (`.cc`), `admin-alerts.html` (`.exec-card`) تعيد التعريف بأسماء جديدة → ~150 سطر CSS مكرر

---

## 8) Quick Wins — ترتيب الأولوية

> هذه **خطط لـ PRs منفصلة** — لا تنفيذ في هذا التقرير. كل واحد قابل للتنفيذ في PR صغير حسب RULE G9.

| # | Quick Win | الأثر | التعقيد |
|---|-----------|-------|---------|
| **W1** | استبدال `#ff3d6e` (138) و `#a78bfa` (78) و `#00d97e` (61) بـ `var(--r/p/g)` | 277 inline style مُوحَّد | منخفض |
| **W2** | إضافة `.hide` class وحذف 216 instance من `style="display:none"` | -216 inline styles | منخفض جداً |
| **W3** | إضافة typography tokens (`--fs-xs/sm/base/md/lg`, `--fw-*`) وutility classes | يفتح الباب لتقليل ~3000 inline | متوسط |
| **W4** | إضافة spacing tokens (`--space-xs/sm/md/lg/xl`) | يفتح الباب لتقليل ~350 inline padding/margin | متوسط |
| **W5** | إضافة status badge utility set (`.status-paid/pending/unpaid/rejected`) | -50 inline badge | منخفض |
| **W6** | استبدال inline buttons بـ `.btn` classes | -40 button | منخفض |
| **W7** | استخراج orphan colors (`#ffaa00`, `#3b9eff`, `#7c5cff`) إلى tokens | تجهيز للترحيل | منخفض |
| **W8** | توحيد green variants (5 hex مختلفة) على `var(--g)` | -100 inline | منخفض |
| **W9** | flex utilities (`.flex-1`, `.truncate`) | -100 inline | منخفض جداً |
| **W10** | استبدال page-specific cards (`.rep-card`, `.cc`) بـ `.card` + variants | -150 سطر CSS محلي | متوسط/مرتفع |

**ترتيب مقترح للتنفيذ:**
1. **W2** (display:none → .hide) — أسهل، أسرع، يبني الثقة
2. **W1** (4 hex codes → tokens) — أعلى ROI
3. **W3** (typography tokens) — يفتح موجة كاملة
4. **W4** (spacing tokens) — نفس الفكرة
5. الباقي حسب الأولوية

---

## 9) ما تم التحقق منه vs ما لم يتم

### ✅ تم التحقق بـ `grep`
- إجمالي 5,759 `style=""` (تأكيد دقيق)
- font-size:11px = 947 (تأكيد 100%)
- `#ff3d6e` = 138, `#a78bfa` = 78, `#00d97e` = 61, `#ffaa00` = 60 ✓
- 58 CSS variables في shared.css
- `display:none` = 216 (الـ audit الأصلي قال 103 — الواقع أكتر)

### ⚠️ تم تصحيحه من الـ audit الأولي
- **"unpaid in red"** — خطأ. accounts.html:2218 يعرض رسوم سحب بالأحمر، ليس حالة unpaid
- **status color inconsistency أقل حدة مما ظهر** — معظم الحالات ثابتة داخل سياقها

### ⚠️ لم يتم التحقق التفصيلي
- التعداد الكامل لـ inline button styles (40-60 تقدير)
- اتساق ألوان الـ stages عبر الـ status colors لكل الصفحات

---

## 10) الخطوة التالية (تحتاج موافقة)

التقرير ده **تشخيصي فقط**. الخطوات التنفيذية المقترحة (PRs منفصلة):

1. **PR-U2** (P0): إضافة `.hide` utility + استبدال 216 instance
2. **PR-U3** (P0): استبدال 4 hex codes بأكثر التكرارات → tokens موجودة
3. **PR-U4** (P1): إضافة typography tokens (`--fs-*`, `--fw-*`) + utility classes
4. **PR-U5** (P1): إضافة spacing tokens (`--space-*`)
5. **PR-U6** (P2): status badge utility set
6. **PR-U7+** (P3): الباقي حسب الأولوية

> **لا تنفيذ بدون موافقة المستخدم على كل بند على حدة (تطبيقاً لـ RULE G9 — Incremental Migration و RULE U1).**

---

**نهاية التقرير**
