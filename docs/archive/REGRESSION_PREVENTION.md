# 🛡️ REGRESSION PREVENTION & FEATURE ISOLATION
## كروت شخصية / Business2Card ERP — منع الانهيار التدريجي

> **تاريخ:** 2026-05-19
> **مكمّل لـ:** `AUDIT_REPORT_v2.md` (WHAT) و `STABILIZATION_PLAN.md` (HOW)
> **تخصص هذه الوثيقة:** Architecture Maps · Coupling Analysis · Feature Isolation · Governance · Regression Testing
> **القاعدة الأساسية:** **incremental فقط — لا big-bang**.

---

## 0) Executive Summary

النظام يعاني من **Coupling Cascade**: كل feature جديد يلامس عشرات الملفات. هذا ليس فرضية — هذه الأرقام الفعلية:

- **`/orders` collection** تُكتَب من **43 ملف HTML/JS**. أي تغيير في schema الطلب = مراجعة 43 ملف.
- **`/wallets`** تُكتَب من **28 ملف**.
- **`/employees`** من **21 ملف**.
- **`/suppliers_v2`** من **18 ملف**.
- **`shared.js`** يُستورد من **12 ملف من 80** — معظم الصفحات تتجاوزه (تعرّف Firebase config محليًا، تفتح listeners خاصة).

**التشخيص:** النظام لا يفتقر إلى shared modules — يفتقر إلى **boundaries** (حدود) بين الـ features. كل صفحة تتصرف كـ "monolith صغير" تنادي Firestore مباشرة، تكرر business logic، تفتح listeners خاصة.

**أكبر 3 مخاطر regression:**
1. **High-churn files** — `shipping.html` (12 تعديل/30 يوم)، `clients.html` (14)، `reports.html` (13). أي تعديل يضرب كل users.
2. **`shared.js` غير-shared فعليًا** — 12/80 صفحة تستخدمه. أي تحديث له لا يصل لـ 68 صفحة.
3. **`notifications.js` injected في كل صفحة** عبر 7 paths مع 8 listeners — لكن client-side filter → كل صفحة تحمّل آلاف الـ docs.

**الحلول الموصى بها (incremental):**
- **Stable Core**: 5 ملفات يُمنَع لمسها بدون 2-reviewer approval.
- **Feature Folders**: انتقال تدريجي إلى `features/{name}/` (15-20 صفحة في الشهر).
- **Engineering Governance**: PR template + 8 checklists.
- **Regression Test Suite**: 35 smoke tests على critical workflows.

---

## 1) System Understanding — Architecture Map

### 1.1 الطبقات الفعلية (وليس النظرية)

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER (Vanilla JS)                       │
├──────────────────────────────────────────────────────────────────┤
│  80 HTML pages (each = standalone module)                         │
│  ├─ "Shell" layer: theme.js (54 files) · viewas.js (48) ·         │
│  │   ai-launcher.js (46) · suggestions-fab.js (50)                │
│  ├─ "Sometimes-shared" layer: shared.js (12 files only!) ·        │
│  │   notifications.js (7) · sidebar-config.js (13) ·              │
│  │   financial-guard.js (18)                                       │
│  └─ "Engine" layer: financial-sync-engine.js (21) · orders.js (14)│
│      · marketplace-engine.js (1) · returns-core.js (1) ·          │
│      · workforce-core.js (1)                                       │
├──────────────────────────────────────────────────────────────────┤
│                    Firebase SDK v10.12.0 (CDN)                    │
│  ⚠️ 60+ ملف يعرّف FB_CONFIG محليًا (تكرار)                       │
├──────────────────────────────────────────────────────────────────┤
│                            Firestore                              │
│  ~50 collection · 1213-line rules · 486-line indexes              │
├──────────────────────────────────────────────────────────────────┤
│              36 Cloud Functions (us-central1, v2)                 │
│  Triggers (10) · Callables (12) · Scheduled (8) · Helpers (6)     │
├──────────────────────────────────────────────────────────────────┤
│      Storage (8 paths) · Auth · FCM · Secrets · Backup GCS        │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 خريطة الاعتماديات الفعلية (Dependency Graph)

```
                    ┌─────────────┐
                    │  shared.js  │  ← 12 files import (15% coverage!)
                    │  (572 LOC)  │
                    └──────┬──────┘
                           │ uses
                ┌──────────▼──────────┐
                │     theme.js        │ ← 54 files (68% — good)
                └─────────────────────┘
                           │
       ┌───────────────────┼──────────────────┐
       │                   │                  │
┌──────▼──────┐  ┌─────────▼─────────┐ ┌─────▼────────┐
│ viewas.js   │  │ financial-sync-   │ │ orders.js    │
│ (48 files)  │  │ engine.js (21)    │ │ (14 files)   │
│ 60% cover   │  │ ✅ atomic         │ │ ✅ pure logic│
└─────────────┘  └─────────┬─────────┘ └──────────────┘
                           │
              ┌────────────┴───────────┐
              │                        │
     ┌────────▼────────┐    ┌──────────▼──────────┐
     │ marketplace-    │    │ returns-core.js     │
     │ engine.js (1)   │    │ (1 file)            │
     └─────────────────┘    └─────────────────────┘

                    ┌────────────────────┐
                    │ notifications.js   │ ← 7 files
                    │ (8 listeners each) │
                    └────────────────────┘

                    ❓ Possibly dead:
                    sidebar-manager.js (1) · finance-core.js (3)
                    marketplace-core.js (2) · ai-search.js (2)
                    ai-today.js (1)
```

### 1.3 خريطة الكتابة على Collections (Data Coupling)

| Collection | Writers | المتوقع | الواقع |
|---|---|---|---|
| `orders` | **43** ملف | engine + 5 صفحات حالة | god collection — كل feature يلمسه |
| `wallets` | **28** ملف | Engine فقط (RULE 1) | تحقّقتُ — 2 فقط يكتبون فعلاً، الباقي قراءة + reference. **OK** |
| `transactions_v2` | **20** ملف | Engine فقط | معظمها قراءة، الكتابة من FSE |
| `employees` | **21** ملف | settings + employees | tight coupling |
| `suppliers_v2` | **18** ملف | suppliers + production | acceptable |
| `financial_ledger` | **6** ملف | Engine فقط | ✅ نظيف |
| `shipping_settlements` | **6** ملف | shipping engine | ✅ |
| `returns_tickets` | **4** ملف | returns engine | ✅ |
| `marketplace_orders` | **3** ملف | MKE engine | ✅ |
| `client_decisions` | 3 | client portal | ✅ |

> **النمط الواضح:** الـ collections القديمة (`orders`, `employees`, `suppliers_v2`) متشعبة. الـ collections الحديثة (شُيِّدت بعد إنشاء الـ engines) نظيفة. **الإصلاح:** اعتبر `orders` كـ engine-owned collection وحَوِّل كل writers لمنادة `orderEngine.update()`.

### 1.4 خريطة الـ Listeners (Realtime Coupling)

| Collection | Listeners في | الخطورة |
|---|---|---|
| `orders` | 10 صفحات HTML | عند 50k order = duplicate fetch |
| `clients` | 8 صفحات (منها shared.js) | shared.js يخدم 12 فقط — البقية تفتح خاص! |
| `wallets` | 10 صفحات | معظمها يحتاج read-only للعرض — لا داعي لـ realtime |
| `transactions_v2` | 8 صفحات | financial views |
| `employee_payments` | 5 صفحات | unbounded! |
| `supplier_payments` | 6 صفحات | unbounded! |
| `tasks` | 3 صفحات | bounded but client-filtered |
| `financial_ledger` | 2 صفحات | sane |
| `returns_tickets` | 1 صفحة | sane |

**الـ insight:** كل صفحة تفتح listener خاص بدل subscribe لـ **shared cache**. عند 30 موظف نشط × 8 listeners/صفحة = **240 listener متزامن** × سيرفر Firestore = bills explode + latency.

### 1.5 خريطة الـ Routes (Navigation Coupling)

```
[login.html] ──┬──> [index.html] (role-dispatch)
               │       │
               │       ├──> cs-dashboard (CS role)
               │       ├──> designer-dashboard (designer)
               │       ├──> ops-dashboard (ops_manager)
               │       └──> exec-dashboard (admin)
               │
               └──> [client-login.html] ──> [client-portal.html]

[cs-dashboard]
  ├──> clients.html (CRM)
  │     ├──> design.html (per order)
  │     └──> design-workspace.html (per order — ?duplicate)
  ├──> approvals.html
  └──> returns.html

[ops-dashboard]
  ├──> production.html ──> print.html
  ├──> shipping.html ──> shipping-accounts.html
  ├──> ledger.html / accounts.html / financial-dashboard.html
  └──> employees.html ──> employee-profile.html

[admin extras]
  ├──> settings.html
  ├──> role-viewer.html ──> [View-As anywhere]
  ├──> suggestions-admin.html
  └──> admin-alerts.html

[partner]
  └──> partner-portal.html (custom-token auth)
```

**الـ insight:** لا navigation موحَّد — كل صفحة تبني تنقّلها. `sidebar-config.js` (PR #479) خطوة في الاتجاه الصحيح لكن مغطّى 13/80 صفحة فقط.

---

## 2) Regression Detection — أدلة فعلية، ليست فرضيات

### 2.1 High-Churn Files (آخر 30 يوم)

| الملف | عدد التعديلات | المخاطرة |
|---|---|---|
| `sw.js` | 15 | كل تعديل يبطّل cache كل المستخدمين فورًا |
| `clients.html` (295KB) | 14 | god page، أي تعديل = صعوبة review |
| `reports.html` (192KB) | 13 | تقارير ـ كل تعديل = users يفقدون بياناتهم لو خطأ |
| `firestore.rules` | 13 | كل تعديل rules = potential lockout |
| `designer-dashboard.html` | 13 | dashboard مخصَّص |
| `shipping.html` (200KB) | 12 | god page، تتدفق منها مبالغ كبيرة |
| `employees.html`, `design.html` | 12 | god pages |
| `shared.js` | 10 | يؤثر على 12 صفحة معتمدة + ironically: لا يصل لـ 68 صفحة |
| `functions/index.js` | 10 | backend churn |

**نتيجة:** الـ top 7 files تأكل ~40% من commits. أي مساهم يتعلم النظام يجد نفسه يعدّل في نفس الـ 7 ملفات — وهذه ملفات ضخمة (مجموع ~1.5MB).

### 2.2 ما الذي يُعطَّل أو يُبطَأ عند كل feature جديد

#### Pattern 1: Schema Migration بدون coordination
- إضافة حقل `tenantId` (Phase 2) → كل query في 43 ملف يكتب على `orders` يحتاج تحديث لو فلترة بـ tenant.
- إضافة `shipSettled` (PR قديم) → 7 ملفات شحن تحتاج تحديث كل واحدة بشكل مستقل.

#### Pattern 2: Recent listener changes تكسر pages قديمة
- PR #491 (theme variables) — إذا كانت صفحة تستخدم hex مباشر، الـ dark mode يكسرها. وُجد `workforce-live.html:145, 455` ما زال يستخدم hex.
- PR #479 (sidebar refactor) — 12 صفحة استبدلت بـ sidebar-config، لكن 68 صفحة لم تتغير → اختلاف بصري عميق.

#### Pattern 3: Engine bypass عبر copy-paste
- في تقرير v2: 2 ملفات فقط تكتب على wallets خارج FSE (`clients.html` و `settings.html`). تحققت — `settings.html` فقط ينشئ wallets جديدة (admin path) وهذا مقبول. **لا engine bypass فعلي** ✅.
- لكن `notifications.js` يكرر شيفرة فلترة الأوردرات clientside في 4 listeners منفصلة — كل واحد يدير stage filter بنفسه. بدلاً من orderRepo.byStage([...]).

#### Pattern 4: Performance Drift
- `shared.js startListeners` بلا limit → كل صفحة تستخدمه تتدهور خطيًا مع نمو البيانات.
- لا APM (Application Performance Monitoring) → التدهور لا يُكتشف حتى يصبح كارثة.

### 2.3 Broken Old Features Suspected (يحتاج verification)

| الـ feature | الـ symptom المحتمَل | لماذا؟ | كيف نتحقق |
|---|---|---|---|
| Print routes (`print-routes.html`) | unclear ownership | not modified recently، 47KB، unclear inter-relation | grep references |
| Shipping audit (`shipping-audit.html`) | overlaps with shipping-followup | duplicate UX | UX audit |
| Job orders (`job-orders.html`) | unclear if used | mentions in 5 commits، not on sidebar by default | check ROLE_PAGES |
| Admin alerts (`admin-alerts.html`) | works but isolation? | depends on Cloud Function alerts | verify alert pipeline |
| Workforce live (`workforce-live.html`) | hardcoded hex (PR #491 incomplete) | line 145+ still has `--sc:#7c5cff` | dark mode test |
| Order tracking (public) | requires orderId + clientPhone | spam vector | rate-limit (S0-6) |

**التوصية:** اعقد "Feature Health Check" review — مرّ على كل صفحة، تحقق:
- هل ما زالت مستخدَمة؟ (analytics)
- هل تعمل في dark mode؟
- هل تعمل في mobile؟
- هل permissions تعمل صحيحًا؟ (Run via View-As)

---

## 3) Shared Chaos Report

### 3.1 الملفات "shared" التي ليست shared فعلاً

| الملف | المتوقع (coverage) | الفعلي | الفجوة |
|---|---|---|---|
| `shared.js` | 100% (80/80) | 12/80 (15%) | **85%** صفحة لا تستخدمه — تكتب Firebase config محلي وlisteners خاصة |
| `theme.js` | 100% | 54/80 (68%) | 32% — يفسر mismatched dark mode |
| `viewas.js` | 100% | 48/80 (60%) | 40% — impersonation lost |
| `financial-sync-engine.js` | 100% للصفحات المالية (~15) | 21/80 (26%) | عالية — كثير من الصفحات تتعامل مع entities مالية |
| `orders.js` | كل صفحة تعدل أوردرات | 14/80 (18%) | كل الـ 43 ملف الذي يكتب orders **يجب** أن يستوردها |
| `sidebar-config.js` | 100% | 13/80 (16%) | معظم الصفحات تبني sidebar محليًا |
| `financial-guard.js` | 100% للصفحات المالية | 18/80 (23%) | error UX inconsistent |
| `notifications.js` | 100% للداخلي | 7/80 (9%) | bell rings فقط في 7 صفحات! |

**النمط:** كل ملف "shared" يتم تجاهله من معظم الصفحات. **لماذا؟**
1. التطوير التاريخي: pages قديمة كُتبت قبل أن تكون shared modules.
2. لا CI gate يفرض الاستخدام.
3. كل مطوّر/AI ينشئ صفحة جديدة بـ pattern مختلف.

### 3.2 God Files

| الملف | حجم | السبب |
|---|---|---|
| `clients.html` | 4760 سطر / 295KB | CRM + RFM + followups + filters + import/export + modals + reports |
| `employee-profile.html` | 3168 سطر / 178KB | profile + payments + goals + evaluations + attendance + tasks |
| `shipping.html` | 3096 سطر / 200KB | shipping ops + companies + tracking + settlements + waybill |
| `reports.html` | 3047 سطر / 192KB | كل التقارير في صفحة واحدة |
| `approvals.html` | 2530 سطر / 140KB | client decisions + internal approvals + payment requests (المخلوط!) |
| `inbox.html` | 2526 سطر / 133KB | كل الدردشة + الإشعارات |
| `design-workspace.html` | 2438 سطر / 131KB | (لاحظ overlap مع design.html 2250 سطر) |
| `production.html` | 2432 سطر / 159KB | كل عمليات الإنتاج |
| `accounts.html` | 2412 سطر / 153KB | كل المعاملات المالية في صفحة واحدة |
| `shared.js` | 572 سطر | acceptable لكن يفعل كثيرًا (auth + state + listeners + UI helpers) |
| `marketplace-engine.js` | 1097 سطر | acceptable للـ engine |
| `orders.js` | 1084 سطر | acceptable للـ engine |
| `functions/index.js` | 2678 سطر | 36 function — يجب تقسيمه |

### 3.3 المشاكل في `shared.js` تحديدًا

```js
// shared.js يفعل كل شيء:
// 1. Firebase init
// 2. Theme load (re-exports theme.js)
// 3. Roles + permissions
// 4. STAGES workflow
// 5. Auth manager
// 6. Global state (AppState)
// 7. 5 startListeners (clients, orders, products, wallets, settings)
// 8. Order operations
// 9. Sidebar render
// 10. Topbar render
// 11. Mobile menu
// 12. Toast
// 13. Modal
// 14. Utils (nowStr, fn, gv, sv, setText, calcDelay, isToday)
// 15. Stage badge
// 16. Pipeline
```
**التقييم:** 16 مسؤولية في ملف واحد = god module. لكن **التقسيم خطر** الآن — 12 صفحة تعتمد عليه. الـ refactor المقترَح في §6.

---

## 4) Performance Degradation Report

### 4.1 الـ Patterns الخطيرة

#### P1: Unbounded shared.js listeners
- `shared.js:301-326` — 4 listeners بلا حد على collections كاملة. **التأثير على كل dependents.**

#### P2: notifications.js client-side filter
- `notifications.js:81-155` — 4 listeners فيهم filter بـ `.docs.filter(d => stage in [...])` بعد fetch كامل.

#### P3: Dashboards realtime على collections كاملة
- `accounts.html`, `financial-dashboard.html`, `exec-dashboard.html` يفتحوا snapshot على `transactions_v2` كاملاً للعرض.

#### P4: god pages مع 10+ listeners
- `clients.html` 10 listener — كل لـ collection مختلفة. زيارة واحدة = 10 round-trip متوازي.

#### P5: HTML payload كبير
- متوسط صفحة كبيرة = 200-300KB raw + 60+ ملف يعيد تحميل Firebase SDK من CDN.

### 4.2 Performance Degradation عبر الزمن

```
معدل Firestore reads/user/day:
                          
   2024: ~5k   ─────●─────────────────────
                                          
   2025 Q1: ~25k                          
                  ●─────────────          
                                          
   2026 today: ~95k (تقدير)               
                          ●─────────●     
                                          
   2027 (لو لم نُصلح): ~250k+             
                                  ●       
```

**السبب الرئيسي للتزايد:**
- إضافة dashboards (8 الآن) — كل واحد realtime.
- إضافة notifications system — 8 listeners/page.
- نمو الـ collections (orders linearly + transactions × 3-5).

### 4.3 خريطة الـ Memory Pressure

```
Page load → 
  60+ ملف فيه FB_CONFIG → كل صفحة re-init (تأخير ~200ms)
  ↓
  startListeners() أو محلي:
    └─ onSnapshot × N → IndexedDB cache + memory:
        ├─ orders[]: ~30MB عند 50k order
        ├─ clients[]: ~5MB عند 10k client
        ├─ products[]: ~1MB
        └─ wallets[]: ~50KB
  ↓
  notifications.js:
    └─ × 8 listeners × ~1MB each cache
  ↓
  ai-launcher.js (46/80 يستوردها):
    └─ context loading
  ↓
  suggestions-fab.js (50/80):
    └─ extra listener
  ↓
  TOTAL initial memory: ~50-80MB before user does anything
```

### 4.4 Render Storms

أمثلة محتملة:
- في `clients.html`، any update to clients/orders triggers full re-render of 4760-line page.
- لا use of `requestAnimationFrame` للـ batched updates.
- لا debouncing في filter inputs.

---

## 5) Feature Coupling Report

### 5.1 الـ Coupling Matrix

| Feature | يعتمد على (read/write) |
|---|---|
| Orders | clients, products, employees, wallets, suppliers, shipping, design, financial_ledger |
| Clients | orders, client_followups, returns_tickets, client_segments |
| Finance | wallets, transactions_v2, financial_ledger, orders, employees, suppliers, shipping_settlements, payment_requests |
| Production | orders, products, supplier_orders, employees, materials |
| Shipping | orders, shippers_v2, shipping_settlements, shipping_returns |
| Approvals | orders, transactions_v2, financial_ledger, payment_requests, client_decisions |
| Returns | returns_tickets, orders, transactions_v2, financial_ledger, wallets |
| Marketplace | tenants, marketplace_orders, commissions, escrow_holds, payouts, disputes, customer_wallets |

**الـ insight:**
- **Finance** هو **سنترال coupling node** — مرتبط بكل شيء.
- **Approvals** خلط داخلي + خارجي = UX coupling.
- **Marketplace** isolated (good — حديث).

### 5.2 الـ Coupling الحرج

#### الـ feature couplings الواجب فكّها (Decoupling)
1. **Approvals: client decisions + staff approvals** → فصل لـ صفحتين (recommended في v1).
2. **Design vs Design-Workspace** → دمج أو تعريف واضح.
3. **8 dashboards مع overlap كبير** → unified registry.

#### الـ couplings المقبولة لكن تحتاج interfaces
4. **Orders ↔ Finance** — Engine يعمل interface جيد. ابقَى عليه.
5. **Orders ↔ Production ↔ Shipping** — workflow طبيعي، لا تفك.

---

## 6) Suggested Feature Isolation Structure

### 6.1 الهيكل المستهدف

```
features/
├── auth/
│   ├── pages/        login.html, client-login.html, change-password.html
│   ├── services/     authService.js (wrap onAuthStateChanged)
│   └── README.md     contract + boundaries
│
├── orders/
│   ├── pages/        (none — used by other features)
│   ├── repository.js bounded queries (byStage, byClient, byDate)
│   ├── workflow.js   buildStageAdvance, valid transitions
│   ├── permissions.js  STAGE_PERMISSIONS
│   └── README.md
│
├── clients/
│   ├── pages/        clients.html (يُقسَّم لاحقًا)
│   ├── repository.js
│   ├── service.js    addClient, updateClient, archive
│   └── permissions.js
│
├── finance/
│   ├── pages/        accounts.html, ledger.html, financial-dashboard.html, approvals.html (staff side)
│   ├── engine/       financial-sync-engine.js (المركز)
│   ├── repository.js wallets, transactions, ledger queries
│   ├── validators.js validTx, validLedger (mirror rules)
│   └── permissions.js
│
├── design/
│   ├── pages/        design.html, design-workspace.html (دمج)
│   ├── service.js    file upload, version control
│   └── permissions.js
│
├── production/
│   ├── pages/        production.html, print.html, job-orders.html
│   ├── service.js
│   └── permissions.js
│
├── shipping/
│   ├── pages/        shipping.html (دمج 7 → 2)
│   ├── engine/       shipping-accounts engine
│   ├── repository.js
│   └── permissions.js
│
├── returns/
│   ├── pages/        returns.html
│   ├── engine/       returns-core.js
│   ├── repository.js
│   └── permissions.js
│
├── marketplace/
│   ├── pages/        marketplace.html, partner-portal.html
│   ├── engine/       marketplace-engine.js, marketplace-core.js
│   ├── repository.js
│   └── permissions.js
│
├── employees/
│   ├── pages/        employees.html, employee-profile.html, my-profile.html
│   ├── service.js
│   └── permissions.js
│
├── reports/
│   ├── pages/        reports.html (يُقسَّم لـ subreports)
│   └── repository.js
│
├── admin/
│   ├── pages/        settings.html, role-viewer.html, suggestions-admin.html, admin-alerts.html
│   └── governance.js
│
└── client-portal/    (للعملاء — public)
    ├── pages/        client-portal.html, order-tracking.html
    └── api.js        Cloud Function client (no direct Firestore)

core/                 ← STABLE — يُعدَّل بـ 2 reviewer approval فقط
├── firebase-init.js  ← الـ FB_CONFIG الوحيد
├── auth.js
├── permissions-matrix.js
├── rules-helpers.js
└── shared-state.js   ← AppState مع interfaces واضحة

ui/                   ← shared components
├── shared.css
├── theme.js
├── viewas.js
├── sidebar/
├── topbar/
├── components/       ← x-table, x-modal, x-empty-state
└── ai-launcher.js

functions/            ← (موجود — يُقسَّم داخليًا)
├── triggers/
├── callables/
├── scheduled/
└── shared/
```

### 6.2 Migration Path — Incremental (لا big-bang)

#### Phase A — Foundation (Sprint 14 يوم — موازٍ للـ STABILIZATION_PLAN)
- [ ] أنشئ `core/firebase-init.js` — exports `app`, `db`, `auth`, `storage`. لا يلمس أي صفحة بعد.
- [ ] أنشئ `core/permissions-matrix.js` — انقل `DEFAULT_PERMISSIONS` + `SENSITIVE_FIELDS` من shared.js + viewas.js (يحلّ الـ duplication).
- [ ] أنشئ `features/orders/repository.js` — bounded queries.
- [ ] أنشئ `features/clients/repository.js` — bounded queries.
- [ ] **لا تنقل أي ملف موجود بعد.**

#### Phase B — Adoption (شهر)
- [ ] صفحة واحدة كـ pilot — اختر `archive.html` (43KB، نسبيًا منعزلة):
  - Migrate إلى import `core/firebase-init.js`.
  - Migrate listeners إلى `features/orders/repository.js`.
  - Verify لا regression.
- [ ] إذا نجح → اكرر مع 5 صفحات أكثر.

#### Phase C — Migration Scale (3 أشهر)
- [ ] 15-20 صفحة شهريًا.
- [ ] أولوية: pages لها high churn (clients, shipping, reports — تحت feature freeze).
- [ ] لكل migration: 2-reviewer approval + smoke test.

#### Phase D — Cleanup (6 أشهر)
- [ ] حذف الـ duplicate FB_CONFIG من كل ملف.
- [ ] تجزئة god pages.
- [ ] التحقق من 100% adoption.

> **القاعدة الحديدية:** لا "Big Refactor". كل ملف ينتقل بمفرده. النظام يكمل تشغيله أثناء الانتقال.

---

## 7) Suggested Stable Core Architecture

### 7.1 The "Stable Core" — لا يُلمس بسهولة

5 modules تُحدَّد كـ **Stable Core**. أي تعديل عليها يحتاج:
- 2 reviewer approval.
- Test suite passing.
- Migration plan for dependents.

| Module | الحجم | لماذا core |
|---|---|---|
| `core/firebase-init.js` (جديد) | ~30 سطر | كل صفحة تستخدمه؛ تغيير = ripple massive |
| `core/permissions-matrix.js` (جديد) | ~100 سطر | RULE 8 governance |
| `core/auth.js` (extract من shared.js) | ~80 سطر | identity + session |
| `engines/financial-sync-engine.js` | 811 سطر (الموجود) | المالية الأم — RULE 2/3/5 |
| `firestore.rules` | 1213 سطر | server-side trust boundary |

### 7.2 The "Volatile Periphery" — مسموح بتجريب

- أي pages داخل `features/`.
- أي components داخل `ui/components/`.
- أي Cloud Function غير financial-critical.

### 7.3 The "Frozen" — لا تُلمس قبل migration

- god pages في حالتها الحالية (`clients.html`, `shipping.html`, etc.) — تجميد كامل بدون Feature Freeze.
- mockup files (سيُحذَفون).

---

## 8) Engineering Governance

### 8.1 PR Template (`.github/PULL_REQUEST_TEMPLATE.md`)

```markdown
## What & Why
- [ ] Summary (1-3 lines)
- [ ] Why this PR exists (ticket link)

## Scope
- [ ] Files changed: count and reason for each
- [ ] No god file (>1500 lines) modified without refactor plan

## Security Checklist
- [ ] No new write to `wallets`/`transactions_v2`/`financial_ledger` outside FSE
- [ ] No new collection without Firestore rules
- [ ] No new sensitive field without `RULE 8` enforcement
- [ ] No new write rule that allows self-update to `role`/`permissions`/`tenantId`

## Performance Checklist
- [ ] No new `onSnapshot` without `limit()`
- [ ] No client-side filter that should be Firestore `where`
- [ ] No fetch of full collection where pagination fits

## Tenant Awareness
- [ ] All new docs include `tenantId`
- [ ] All new queries filter by `tenantId`
- [ ] All new rules use `inSameTenant()`

## Test Plan
- [ ] Smoke test run (link / log)
- [ ] Emulator rules tests pass
- [ ] Manual test على pinned scenarios (انظر §9)

## Backward Compatibility
- [ ] Existing pages still work (link the pages affected)
- [ ] Schema change: migration script attached

## Rollback
- [ ] How to revert if production breaks
```

### 8.2 Architecture Review Matrix (مَن يراجع ماذا)

| التغيير في | يحتاج موافقة من |
|---|---|
| `firestore.rules` | Security + Senior backend |
| `core/*` | 2 reviewers + senior architect |
| `engines/*` | Senior backend + financial-aware |
| `features/*/repository.js` | Senior frontend |
| Storage paths | Security + Senior backend |
| Cloud Functions (new) | Senior backend |
| HTML pages في `apps/` | 1 reviewer |
| New collection | Senior architect (Module Definition required — RULE 7) |
| `package.json` (functions) | Senior backend + Security |

### 8.3 PR Quality Bars (CI-Enforced)

`.github/workflows/pr-quality.yml`:
```yaml
on: pull_request
jobs:
  security-lint:
    steps:
      - name: No FB_CONFIG outside core
        run: |
          if grep -rln 'AIzaSy' --include="*.html" --include="*.js" \
             | grep -v "^core/firebase-init.js"; then
            echo "::error::Firebase config found outside core/firebase-init.js"
            exit 1
          fi
      - name: No unbounded onSnapshot in changed files
        run: |
          NEW=$(git diff --name-only origin/main..HEAD | grep -E '\.(js|html)$')
          for f in $NEW; do
            if grep -q "onSnapshot" "$f" && ! grep -q "limit(" "$f"; then
              echo "::error::$f has onSnapshot without limit()"
              exit 1
            fi
          done
      - name: viewas.js inclusion in new pages
        run: |
          NEW=$(git diff --name-only origin/main..HEAD --diff-filter=A | grep -E '\.html$')
          for f in $NEW; do
            grep -q "viewas.js" "$f" || \
              { echo "::error::$f missing viewas.js"; exit 1; }
          done
  rules-test:
    runs-on: ubuntu-latest
    steps:
      - run: firebase emulators:exec --only firestore "npm test --prefix tests/rules"
```

### 8.4 New Feature Workflow

كل feature جديدة تمر بـ:

1. **Pre-Coding (24h before any commit)**:
   - Module Definition (RULE 7) — entity, events, accounting impact, dashboard impact, reversal logic.
   - Architecture review — أين تذهب في `features/`?
   - Security review — أي rules؟ أي permissions؟
   - Performance review — كم Firestore reads/page load؟
   - Tenant isolation review — كل docs بـ tenantId؟

2. **During Development**:
   - PR draft early (يومين-3 أيام).
   - Smoke test يُكتَب مع الـ feature.
   - Tests على rules لو touched.

3. **Pre-Merge**:
   - 8 checkboxes في PR template passed.
   - CI green.
   - Reviewer matrix matched.

4. **Post-Merge**:
   - Smoke test على staging.
   - Monitor metrics لـ 48 ساعة.
   - Rollback plan documented.

---

## 9) Suggested Regression Testing Strategy

### 9.1 الـ Tiers

```
Tier 1: Critical Path Smoke Tests (60 sec total, run on every PR)
   - Login + permissions check per role
   - Order creation + state machine progress
   - Payment + ledger write
   - Logout + cleanup

Tier 2: Workflow Tests (10 min, run on merge to main)
   - Full order lifecycle (CS → Design → Print → Production → Ship → Deliver)
   - Refund workflow (Returns → Approval → Ledger)
   - Shipping settlement (Multi-order → company sum → reconciliation)
   - Payroll month-end

Tier 3: Security Tests (30 min, run nightly)
   - 50 Firestore rules tests per role × collection
   - Privilege escalation attempts
   - Cross-tenant leak attempts
   - Engine bypass detection

Tier 4: Performance Baseline (run weekly)
   - Firestore reads/login (must stay < 200)
   - Page load time (must stay < 3s on 4G)
   - Memory peak (must stay < 100MB)
```

### 9.2 Pinned Critical Scenarios (35 smoke tests)

#### Orders (8)
- [ ] Admin creates order — state = `design_pending`.
- [ ] Designer assigned — sees only own orders.
- [ ] Designer advances to `printing` — rule allows.
- [ ] Production picks up order at `production` stage.
- [ ] Shipping ships order — stage → `shipped`.
- [ ] Order delivered — paymentStatus = paid → archived.
- [ ] Cancel order before payment — works for client+CS.
- [ ] Cancel order with payment — refund flow triggered.

#### Finance (10)
- [ ] CS records customer payment via FSE — ledger + tx + wallet update atomic.
- [ ] Same payment cannot be created twice (idempotency).
- [ ] Refund creates reversal entry, doesn't delete original.
- [ ] Vendor payment via FSE.
- [ ] Vendor reversal.
- [ ] Salary payroll batch — N employees → N entries + 1 wallet update.
- [ ] Bonus/penalty separate event types.
- [ ] Wallet transfer — balanced (in + out + ledger).
- [ ] Ops manager confirms tx — only flips approvalStatus.
- [ ] Admin approves tx — isLocked=true, no further edits.

#### Security (5)
- [ ] graphic_designer cannot update own role.
- [ ] designer cannot write to /wallets.
- [ ] CS cannot see clientPhone if role doesn't allow.
- [ ] partner cannot read another tenant's marketplace_orders.
- [ ] Anonymous create on returns_tickets blocked after 5/hour.

#### Workflow (5)
- [ ] Returns flow: requested → inspected → approved → refunded.
- [ ] Shipping settlement: order list → totals → wallet credit → orders updated.
- [ ] Suggestion → GitHub issue → claude.yml trigger.
- [ ] Impersonate user — admin enters Light Mode, banner shows.
- [ ] Auto-archive: paid + delivered + > 6 months → archived_orders.

#### Performance (4)
- [ ] Open dashboard — < 200 docs fetched.
- [ ] notifications.js — < 50 docs per listener.
- [ ] shared.js — < 200 orders loaded.
- [ ] Firestore reads/min < 100 in idle state.

#### Integration (3)
- [ ] WhatsApp stub log on order_created.
- [ ] FCM token registered on login.
- [ ] Backup function runs without error (mock).

### 9.3 Implementation

```javascript
// tests/smoke/orders.test.js
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

describe('Order workflow', () => {
  let env;
  beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'b2c-test', firestore: { rules: fs.readFileSync('firestore.rules','utf8') } }); });
  afterAll(() => env.cleanup());

  test('graphic_designer cannot read unrelated orders', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/des1').set({role:'graphic_designer'});
      await c.firestore().doc('orders/o1').set({designerId:'OTHER',stage:'design'});
    });
    const des = env.authenticatedContext('des1');
    await assertFails(des.firestore().doc('orders/o1').get());
  });

  // ... 34 more
});
```

### 9.4 Continuous Monitoring

```
Daily auto-run:
  - 50 rules tests (Tier 3) → Slack on red.
  - Performance baseline (Tier 4) → Slack on regression > 20%.

Weekly auto-run:
  - Full workflow Tier 2.
  - Generated regression report.

Pre-release manual:
  - All 4 tiers.
  - Manual UI walkthrough على 5 critical pages.
```

---

## 10) 14-Day Regression Prevention Sprint
> **مكمّل لـ STABILIZATION_PLAN §17** — هذه Sprint موازية تركّز على الـ regression-proofing.

### Days 1-3: Foundation
- **Day 1** — Create `core/firebase-init.js` + `core/permissions-matrix.js`. **لا نقل لأي صفحة بعد.**
- **Day 2** — Create `features/orders/repository.js` (bounded queries) + tests.
- **Day 3** — Create `features/clients/repository.js` + tests.

### Days 4-7: PR Governance
- **Day 4** — `.github/PULL_REQUEST_TEMPLATE.md` + `.github/workflows/pr-quality.yml`.
- **Day 5** — 5 smoke tests (Tier 1) wired in CI.
- **Day 6** — Documentation: `core/README.md`, `features/README.md` with contracts.
- **Day 7** — Reviewer matrix in repo settings.

### Days 8-11: Pilot Migration
- **Day 8** — Pilot: migrate `archive.html` to use `core/firebase-init.js` + `features/orders/repository.js`.
- **Day 9** — Verify no regression. Smoke test.
- **Day 10** — Pilot 2: `ledger.html` (similar profile).
- **Day 11** — Document lessons learned.

### Days 12-14: Coverage Push
- **Day 12** — Migrate 3 more dashboard pages.
- **Day 13** — Migrate `returns.html` + `marketplace.html` (already isolated, easy wins).
- **Day 14** — Sprint review, metrics check, next sprint planning.

### Sprint Acceptance
- [ ] `core/` directory created with 3 modules.
- [ ] `features/` directory has 2 working repositories.
- [ ] PR template + CI quality gates active.
- [ ] 5 smoke tests in CI.
- [ ] 7 pages migrated to new structure (10% adoption).
- [ ] No regression in existing pages.

---

## 11) 30 / 90 / 180 Refactoring Roadmap

### 30 يوم — Foundation + 15% Adoption
- Core modules created (firebase-init, permissions, auth, state).
- 7 features have repository.js.
- 12 pages migrated (15%).
- PR governance live.
- Tier 1 smoke tests (35) in CI.
- 0 unbounded listeners in **NEW** code.

### 90 يوم — 40% Adoption + Tooling
- 32 pages migrated (40%).
- 4 god pages partially decomposed (clients, shipping, reports, employee-profile).
- Vite build pipeline introduced (optional — incremental).
- TypeScript on engines + repositories.
- Tier 2 workflow tests live.
- 50 rules tests live.
- Performance dashboard with daily KPIs.

### 180 يوم — 80% Adoption + Stability
- 64 pages migrated (80%).
- god pages fully decomposed.
- Old `shared.js` slimmed to 100 sloc, just shell glue.
- Engineering velocity recovered — feature delivery 50% faster than 2026 Q1.
- 0 P0/P1 outstanding.
- Tier 3 + Tier 4 in CI.
- DR drill quarterly cadence.
- **System rating: 8.5/10.**

---

## 12) Final Engineering Principles (للنشر في CLAUDE.md)

أضف هذه الـ 10 قواعد في CLAUDE.md تحت "Governance":

```
RULE G1: Stable Core — لا تعديل على core/ أو engines/* بدون 2-reviewer approval.
RULE G2: One FB_CONFIG — مصدر واحد في core/firebase-init.js.
RULE G3: Bounded Listeners — كل onSnapshot له limit() مفروض.
RULE G4: Repository Pattern — كل query على Firestore عبر features/*/repository.js.
RULE G5: No God Pages — أي ملف > 1500 سطر يجب تقسيمه قبل أي feature إضافي.
RULE G6: Engine Writes Only — wallets/transactions_v2/financial_ledger via FSE فقط.
RULE G7: Tenant Aware — كل doc له tenantId، كل query يفلتر به.
RULE G8: Test First — أي feature جديدة معها smoke test.
RULE G9: Incremental Migration — لا big-bang refactor.
RULE G10: Module Definition Required — RULE 7 من CLAUDE.md (موجود).
```

---

## 13) خاتمة — لماذا هذا يهم

**النظام اليوم:** Fragile growing system. كل feature جديد يضيف entropy.

**النظام بعد 6 أشهر مع الـ governance:** Stable scalable platform. الـ features تُضاف بدون كسر القديم.

**القرار المطلوب من القيادة:**
1. **اعتماد الـ Stable Core** — تعيين 5 modules كـ "off-limits بدون 2-reviewer".
2. **تجميد god pages** — `clients.html`, `shipping.html`, `reports.html` لا يُلمَسون بدون decomposition plan.
3. **PR Template + CI gates** — تطبيق فوري، لا exceptions.
4. **Smoke tests في CI** — 35 test pinned.
5. **Reviewer matrix** — الـ trust boundaries واضحة.

**الـ ROI:**
- **شهر 1:** 0% feature regression جديدة.
- **شهر 3:** 50% انخفاض في bug reports بعد PR merges.
- **شهر 6:** 30% أسرع feature delivery (لأن الـ AI/الـ developers يفهمون الـ boundaries).

**الـ Anti-ROI لو لم نُطبق:**
- **شهر 6:** فقدان السيطرة الكامل. كل feature جديد يكسر 2-3 features قديمة.
- **سنة 1:** Rewrite كامل ضروري — سيستغرق سنة من توقف التطوير.

---

## 14) المرجع السريع

- **AUDIT_REPORT_v2.md** — التشخيص (WHAT): 7 P0 + 8 P1 + 7 P2.
- **STABILIZATION_PLAN.md** — التنفيذ (HOW): 14-day sprint للـ security/perf.
- **REGRESSION_PREVENTION.md** (هذه) — الحدود (BOUNDARIES): governance + feature isolation + tests.

> **الثلاثة معًا = خطة تثبيت كاملة.** تنفذ بالتوازي على فرعَين منفصلَين (security/perf سprint + governance sprint).

**النهاية.**
