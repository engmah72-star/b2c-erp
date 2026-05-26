# RUNTIME_OPERATING_MODEL

**Date:** 2026-05-26
**Scope:** Behavioral architecture of the B2C ERP Runtime — how the system *thinks* and *operates* day-to-day.
**Mode:** Operating contracts + cognitive limits + governance, grounded in current implementation.
**Authority:** Subordinate to RULE E1 (Runtime Evolution Safety). Anything in this document is **descriptive of operating behavior**, never a license to rebuild.

---

## 🧭 الفلسفة الأساسية — Operating Philosophy

النظام لم يعد **مجموعة صفحات + dashboards + sidebars** — أصبح:

> **Operational Runtime System**
>
> The shell drives navigation · The sidebar drives context · The workspace executes operations · The signals direct attention · The runtime reduces cognitive load.

العمل اليومي ينتقل من *"أين الصفحة؟"* إلى *"ما المهمة التالية؟"*.

**Inspiration (لا مُحاكاة):** Linear (workflow density) · Superhuman (keyboard-first speed) · Slack (signal hierarchy) · Raycast (command surface) · Notion (context continuity).
**لكن** بطابع ERP تشغيلي — يعمل تحت ضغط طلبات يومية، بـ8 أدوار، بمسؤوليات مالية حقيقية.

---

## 📐 الـ Runtime Layers (الواقع الحالي)

| الطبقة | الموقع | المسؤولية | الحالة |
|---|---|---|---|
| **Layer 1 — Rail** | `core/runtime-shell/rail.js` (127) | 8 domain icons + signal badges | Production |
| **Layer 2 — Context Sidebar** | `core/runtime-shell/context-sidebar.js` (126) + `core/domains/*/sidebar.js` (8) | Domain-specific views/actions/signals | Production |
| **Layer 3 — Workspace** | `core/runtime-shell/workspace-host.js` (168) + iframe loading any god page | Actual operations | Production |
| **Bridge — Runtime State** | `core/runtime-shell/runtime-state.js` (122) | Cross-frame `{domain, view, filters, mode}` sync | Phase 1 (god pages not consuming yet) |
| **Memory** | `core/runtime-shell/runtime-memory.js` (176) | localStorage: scroll, last-viewed, sidebar state | Production |
| **Signals** | `core/runtime-shell/signals.js` (132) + `signals-aggregator.js` (198) | Firestore→badge counts per domain | Production |
| **FAB (Mobile)** | `core/runtime-shell/fab.js` (97) | Primary action per domain on mobile | Production |
| **Navigation** | `core/shell-navigate.js` (43) | `navigatePage()` shell-aware routing | Production (35 hardcoded `location.href` still in legacy pages) |

**Entry point:** `shell.html` — `?d={domain}` query param drives default domain (default `accounts`).

---

# 1. Runtime Entry Model — كيف يدخل المستخدم؟

## 1.1 — Default Landing per Role

كل دور له **operational entry** يطابق مسؤوليته اليومية الأولى — لا "dashboard generic" لكل الأدوار.

| الدور | Default `?d=` | المبرر التشغيلي |
|---|---|---|
| `admin` | `accounts` | المراقبة المالية + الموافقات |
| `operation_manager` | `production` | متابعة الإنتاج اليومي |
| `customer_service` | `clients` | تواصل + متابعة طلبات |
| `graphic_designer` | `design` | قائمة المهام WIP |
| `design_operator` | `design` | review queue + توزيع |
| `production_agent` | `production` | الطلبات الموكّلة + Late |
| `shipping_officer` | `shipping` | Current + Late + Collections |
| `wallet_manager` | `accounts` | Wallets + Approvals |

**Contract:** الـ shell يحدد الـ default domain من `users/{uid}.role` عند أول تحميل. الـ user يقدر يغيّر default من Profile (مستقبلاً — Phase 2 من Runtime Memory).

**التطبيق الحالي:** `shell.html:73` بيستخدم `accounts` افتراضياً للجميع — يحتاج role-based mapping (Phase B من E1.5 incremental).

## 1.2 — Operational Startup Flow

ترتيب التحميل عند فتح الـ shell:
```
1. auth check          → onAuthStateChanged → redirect لو unauthenticated
2. user doc load       → role + permissions + tenantId
3. domain registry init → register 8 sidebar configs
4. signals subscribe   → onSnapshot لكل domain (limited)
5. rail render         → 8 icons، الـ active highlighted
6. context-sidebar     → render config للـ default domain
7. workspace load      → iframe بـ default page للـ domain
8. runtime-state ready → broadcast initial state
```

**SLA:** كل خطوة محدودة بـ `limit()` (RULE G3) — total cold-start budget < 2 ثانية.

## 1.3 — Session Restoration

عند العودة:
- آخر domain نشط (من `runtime-memory.js`)
- آخر view داخل الـ domain (مثلاً `?view=late` في shipping)
- scroll position للقائمة الرئيسية
- آخر entity مفتوحة (مستقبلاً — entity-tracker.js)

**ممنوع (E1.1):** فقدان السياق عند الـ refresh — يعطّل التشغيل.

## 1.4 — Active Operations Restore

لو في operation pending (مثلاً collect جزء من العميل) وقت الـ refresh:
- الـ idempotency layer (`core/idempotency.js`) يضمن لا duplicate
- الـ user يرى banner "هناك عملية قيد التنفيذ — افتحها / تخطّ"
- في حالات الـ shipping/collections، الـ list يفلتر تلقائياً للـ entity المتأثر

---

# 2. Runtime Context Switching Model — التنقل بدون فقدان السياق

## 2.1 — Cross-Domain Transitions

عند الـ user يتنقل بين domains، الـ context يجب أن:
- ✅ **يُحفظ** الـ view الحالي (المستخدم رجع للـ domain يلاقيه كما تركه)
- ✅ **يُنبَّه** الـ user لو هناك unsaved work في الـ workspace الحالي
- ❌ **لا** يفقد الـ filters المطبقة (search, period, tag)
- ❌ **لا** يعمل full page reload

**Mechanism:** `B2CShell.openInWorkspace(url)` (via `core/shell-navigate.js`) — iframe swap بدون reload للـ shell.

## 2.2 — Entity Context Continuity

عند الـ user يفتح **entity** (عميل، أوردر، موظف، مورد) من domain A، يقدر:
- يفتحها في domain B بدون فقدان (مثال: عميل من clients → نفس العميل في accounts للأرصدة)
- يرجع للقائمة الأصلية بـ "Back" بدون فقدان الـ filter
- يستخدم recent entities (LRU من `entity-tracker.js`) للقفز السريع

**Anti-pattern (ممنوع):**
- ❌ كل صفحة تفتح "نافذة جديدة"
- ❌ "خسرت الـ filter" بعد العودة من تفصيلة
- ❌ "أين الـ entity اللي كنت فيها قبل دقيقة؟"

## 2.3 — Hash Routing Reservation (RULE N1.3 reinforcement)

- `location.hash` بـ prefix `#ctx=` محجوز للـ shell context (مستقبلاً)
- الصفحات تستخدم `?` query params (مش `#`) للـ tab/filter state
- الـ pages اللي حالياً بتستخدم hash (my-profile, employee-profile, reports, order) → Phase 9 من CLEANUP_PLAN

## 2.4 — Active Workflow Preservation

الـ workspace iframe يبقى **mounted** حتى عند تغيير الـ domain (LRU cache في `workspace-host.js`):
- آخر 3 pages mounted (يتـ unload الأقدم)
- recovery سريع عند العودة
- form data يبقى محفوظ في الـ iframe

**Limit:** 3 iframes max — أي زيادة = memory bloat.

---

# 3. Operational Workflow Model — كيف تتدفق الأوردرات؟

## 3.1 — Order Lifecycle (Source of Truth: `orders.js:73-80`)

```
[CREATE] → DESIGN → PRINTING → PRODUCTION → SHIPPING → ARCHIVED
              ↑         ↑           ↑            ↑          ↑
         design.html  print.html  production.   shipping.   archive.
              ↑                       ↑            ↑
       graphic_     production_  shipping_officer  (read-only)
       designer     agent
       design_
       operator
                                                    ↓
                                                CANCELLED (terminal)
```

**Source of truth:** `order.stage` (RULE W1.1) — الـ field الوحيد المعتمد للقرار.
**Helpers (read-only):** `shipStage`, `approvalStatus`, `productStatus`, `returnStatus`.

## 3.2 — Stage Ownership Matrix

| Stage | Workspace | Owner Role | Sidebar Domain | Default View |
|---|---|---|---|---|
| DESIGN | `design.html` | graphic_designer, design_operator | design | `wip` (My queue) |
| PRINTING | `print.html` | production_agent | production | `print` |
| PRODUCTION | `production.html` | production_agent | production | `mine` |
| SHIPPING | `shipping.html` | shipping_officer | shipping | `current` |
| ARCHIVED | `archive.html` (read-only) | admin, ops_mgr | reports | `archive` |

**Transitions:** كلها عبر `orderActions.*` (RULE A1) — يحقق idempotency + validation + audit + financial events.

## 3.3 — Workflow Touchpoints

**كل تحويل بين stages هو:**
1. **Single click** من الـ workspace (button بـ confirm modal لو high-stakes)
2. **Pre-validated** عبر validator (RULE V1) — errors تمنع، warnings تتطلب تأكيد
3. **Atomic** — `writeBatch` واحد (RULE H1.1 + RULE 3)
4. **Audited** — `order.timeline` entry تلقائي (RULE H3)
5. **Idempotent** — repeat click في 60s = no-op cached (RULE H1.2)
6. **Signaled** — الـ sidebar badge في الـ destination domain يحدّث تلقائياً

## 3.4 — Sidebar vs Workspace Responsibility

**Sidebar (Context Layer):**
- ✅ يعرض الـ queues (lists, counts)
- ✅ يقدم quick actions (4 max per domain)
- ✅ يبرز الـ signals (critical, attention)
- ❌ لا يحتوي business logic
- ❌ لا يكتب على Firestore

**Workspace (Execution Layer):**
- ✅ ينفذ العمليات (forms, transitions, payments)
- ✅ يعرض تفاصيل الـ entity
- ✅ يستدعي central actions
- ❌ لا يفترض sidebar معين (يعمل standalone)

**Anti-pattern:** sidebar فيه business logic أو modal لإنشاء أوردر — مكانها الـ workspace.

## 3.5 — Customer Journey في النظام (مثال تشغيلي)

| الخطوة | Domain | Role | Workspace | Stage |
|---|---|---|---|---|
| تسجيل عميل جديد | clients | CS | `clients.html` | — |
| إنشاء أوردر | clients/order | CS | `order.html` | DESIGN |
| تصميم | design | designer | `design.html` | DESIGN |
| اعتماد العميل | design/approvals | CS | `approvals.html` | DESIGN |
| إرسال للطباعة | design | designer/CS | `design.html` action | → PRINTING |
| الطباعة | production | production_agent | `print.html` | PRINTING |
| الإنتاج | production | production_agent | `production.html` | PRODUCTION |
| الشحن | shipping | shipping_officer | `shipping.html` | SHIPPING |
| التحصيل | shipping/accounts | shipping/wallet_mgr | `shipping-accounts.html` | SHIPPING |
| الأرشفة | shipping/admin | admin/ops_mgr | action | → ARCHIVED |

**كل خطوة:** single click + central action + audit trail + signal update.

---

# 4. Runtime Intelligence Model — الذكاء التشغيلي

## 4.1 — تعريف "الذكاء" هنا

**ليس:** AI generative · ML predictions · LLM features.
**بل:** **context awareness** — النظام يفهم *أين* الـ user و*ماذا* يعمل و*ما الأهم الآن*.

## 4.2 — Signal Hierarchy (3 مستويات)

| Level | اللون | المعنى | المصدر | السلوك |
|---|---|---|---|---|
| **Critical** | أحمر (var(--r)) | تشغيل متوقف، فلوس على المحك | onSnapshot على Late > 48h, Drift > 0 | Badge + auto-route لو شديد |
| **Attention** | برتقالي/أصفر | يحتاج فعل خلال اليوم | Late 24-48h, pending approvals | Badge فقط |
| **Info** | أزرق سماوي | اطلع لما تقدر | counts عامة | Badge متى تحقق |

**الحد الأقصى:** 3 signals max per domain (الـ aggregate في الـ rail badge).
**Source:** `core/runtime-shell/signals-aggregator.js`.

## 4.3 — Contextual Visibility

العنصر يظهر **فقط** لما يكون ذو معنى للـ context الحالي:

| العنصر | يظهر متى |
|---|---|
| "Send to Printing" button | الـ order في DESIGN + designer assigned + approval done |
| "Settle from Company" button | shipMethod=COMPANY + shipped + not yet settled |
| "Mark Return" button | order shipped + within return window |
| Quick add client FAB | clients domain + role=CS |
| Drift warning banner | admin/ops_mgr + drift detected |

**Implementation:** عبر `canDo(capability, role)` + state-aware checks في الـ workspace.
**Anti-pattern:** زر يظهر دايماً ويعرض "ليس لديك صلاحية" عند الضغط — UX سيئة. الأفضل: مش يظهر أصلاً.

## 4.4 — Smart Queue Surfacing

الـ sidebar يجب يبرز **الأولوية الحقيقية**:
- "Late > 48h" قبل "All"
- "My queue" قبل queues أخرى لنفس الـ role
- "Unread + Urgent" مدمجين قبل "All inbox"

**التطبيق الحالي:** الـ design sidebar مرتب `wip > review > all > done` — صحيح. الـ shipping `current > late > collections` — صحيح. الـ clients `import` فقط — يحتاج enrichment (Phase clients).

## 4.5 — Attention Guidance

النظام يقترح **الـ next operational step** بناءً على state:
- Order paid 100% + shipped → suggest "Settle from company"
- Designer finished design + no approval → suggest "Send for approval"
- Client has remaining > 30 days → suggest "Follow-up call"

**Implementation horizon:** Phase 3 من Runtime Intelligence (بعد استقرار Phase 2 من runtime-state).
**ممنوع (E1):** auto-execution — الـ system يقترح، الـ user يقرر دائماً.

## 4.6 — Workflow Prediction (Conservative)

النظام يتعلم من patterns لكن **بدون LLMs**:
- "آخر 5 عمليات تحصيل من نفس الـ client كانت كاش" → default للـ payment method
- "هذا الـ designer دايماً يأخذ 2 أيام" → ETA suggestion
- "Friday بـ 30% طلبات أكتر من السابق" → workload warning

**كله بسيط: median/mode/count من آخر N records.**

---

# 5. Runtime Cognitive Load Model — منع الإرهاق العقلي

## 5.1 — Cognitive Density Limits (الحدود الإلزامية)

| المكون | الحد الأقصى | الحالي | الحالة |
|---|---|---|---|
| Rail icons (domains) | 8 | 8 | ✅ |
| Sidebar views per domain | **7±2** (Miller's Law) | 1-8 | ⚠️ admin/shipping/reports عند الحد |
| Quick actions per domain | 4 | 2-4 | ✅ |
| Signals per domain | 3 | 0-3 | ✅ |
| FAB actions (mobile) | 1 primary | 1 | ✅ |
| Open iframes (LRU) | 3 | 3 | ✅ |
| Toast notifications visible | 3 max | (varies) | ⚠️ |

**Enforcement:** أي domain يتجاوز يحتاج **decomposition** قبل إضافة view جديد.

## 5.2 — Always Visible vs Contextual vs Hidden

| العنصر | Always | Contextual | Hidden |
|---|---|---|---|
| Rail (8 domains) | ✅ | | |
| Active domain sidebar | ✅ | | |
| Critical signals | ✅ | | |
| Search bar (topbar) | ✅ | | |
| Quick actions | | ✅ (per role) | |
| Drift warnings | | ✅ (admin only) | |
| Secondary views | | ✅ (collapsed by default) | |
| Debug info | | | ✅ (DevTools only) |
| Hardcoded URLs | | | ✅ (use navigatePage) |

## 5.3 — Anti-patterns (ممنوع تماماً)

**❌ Dashboard Syndrome:**
- 12 KPI cards on landing — overwhelming
- "Total revenue" على كل شاشة — irrelevant للـ designer
- Charts بـ trends لا تساعد على فعل اليوم

**❌ Signal Explosion:**
- 8 badges في الـ rail (الواحد لكل domain) — كلهم يبقوا "أحمر" يفقد المعنى
- Threshold-less counts ("147 orders") — هل ده كثير ولا قليل؟

**❌ Sidebar Explosion:**
- 15 view chips في الـ sidebar — paralysis
- 10 quick actions — لا واحد فيهم سريع
- Sub-sub-menus

**❌ Workspace Clutter:**
- 5 tabs داخل الـ workspace + sidebar + topbar — coordinate overload
- Inline forms في كل ركن
- Modal على modal

## 5.4 — Lazy Loading Policy

- الـ secondary views في الـ sidebar — تـ render لكن content yet
- الـ workspace iframe — `loading="lazy"` لما يكون خارج viewport (mobile)
- الـ signals data — paged (latest 50 max)
- الـ reports charts — explicit user action (مش auto-render)

## 5.5 — Information Scent

كل عنصر له **scent واضح**:
- Number badge → count
- Color → severity (red/orange/green)
- Icon → action type
- Position → priority (الأهم على اليسار في RTL = ابتداء القراءة)

---

# 6. Runtime Memory Model — الاستمرارية

## 6.1 — ما يُحفظ (Persistent Memory)

**localStorage (per user, per device):**
| Key | المحتوى | TTL |
|---|---|---|
| `b2c.lastDomain` | آخر domain نشط | session |
| `b2c.{domain}.lastView` | آخر view per domain | persistent |
| `b2c.{domain}.filters` | الـ search/period/tag | 7 أيام |
| `b2c.{domain}.scroll` | scroll position | session |
| `b2c.recent.entities` | آخر 10 entities | persistent (LRU) |
| `b2c.pinned.queues` | الـ user's pinned views | persistent |
| `b2c.sidebar.collapsed` | secondary sections state | persistent |

**Implementation:** `core/runtime-shell/runtime-memory.js` (176 سطر).

## 6.2 — Active Workflows (Server-side)

في Firestore — `orders/{id}` يحمل الـ state الكامل. أي interrupted workflow:
- order.timeline يحفظ آخر action
- order.editHistory يحفظ التعديلات الجزئية
- idempotency operations table (`financial_operations`) يحفظ pending ops 60s

**Recovery contract:** الـ user يقدر يرجع لأي order بعد ساعات/أيام، يلاقي:
- الـ stage الفعلي
- timeline كامل
- آخر مَن لمسه + متى

## 6.3 — Interrupted Sessions

عند الـ crash/refresh:
1. الـ shell يقرأ `b2c.lastDomain` + `b2c.{domain}.lastView`
2. الـ workspace iframe يحمل الصفحة المعنية
3. الصفحة تقرأ filters من localStorage + ?query params
4. لو في pending idempotent op — banner "اكمل العملية / تخطّ"

## 6.4 — Quick Resume

**Goal:** الـ user يرجع للنظام بعد ساعة → يلاقي نفسه في **نفس النقطة بالضبط**.
- Domain ✅
- View ✅
- Filters ✅
- Scroll position ✅
- Open entity (إن وُجد) ✅

**Limit:** لا نحفظ form drafts (يخفّض الـ trust في الـ Submit). الـ user يكمل الـ form أو يلغي.

---

# 7. Mobile Runtime Operating Model — التشغيل المحمول

## 7.1 — الفلسفة

> **الموبايل ≠ Desktop مصغّر.**
>
> الموبايل = **Operational Companion Runtime** — يخدم التشغيل الميداني السريع، لا إدارة شاملة.

## 7.2 — Operations المسموحة على الموبايل

✅ **Quick actions (touch-optimized):**
- استلام طلب جديد (CS)
- تسجيل دفعة عميل
- متابعة حالة أوردر
- تأكيد شحن
- رفع صورة تصميم سريعة
- رد على رسالة من العميل
- استعراض signals + alerts

❌ **Operations ممنوعة على الموبايل (Desktop-only):**
- إنشاء أوردر معقد بـ multi-product
- تسوية الشحن (settle from company)
- مراجعة financial reports
- إدارة الموظفين / الصلاحيات
- إعدادات النظام
- مراجعة الـ drift / audit logs

**المبرر:** ضغط زر خطأ على الموبايل = صفقة fix معقدة. عمليات financial-critical تحتاج desktop screen.

## 7.3 — Mobile Runtime Depth

عمق الـ navigation محدود **3 levels max**:
```
Level 1: Rail (8 domains)
Level 2: Sidebar drawer (views + 1 FAB)
Level 3: Workspace (1 task at a time)
```

❌ لا level 4 (modal داخل modal داخل workspace).

## 7.4 — Critical Signals Only (Mobile)

الـ mobile rail يعرض **critical signals فقط**:
- 🔴 Late orders > 48h
- 🔴 Drift detected
- 🔴 Urgent client messages

الـ attention/info signals مخفية في الـ sidebar (تظهر عند الفتح).

## 7.5 — FAB Behavior

| Domain | Primary FAB | Behavior |
|---|---|---|
| clients | إضافة عميل | فتح modal سريع |
| design | رفع تصميم | camera/file picker |
| production | تأكيد مهمة | confirm + transition |
| shipping | شحن سريع | scan/select + send |
| accounts | تسجيل دفعة | quick payment form |
| inbox | رسالة جديدة | compose |
| reports | — | hidden (read-only domain) |
| admin | — | hidden (no mobile admin) |

**Implementation:** `core/runtime-shell/fab.js` — primaryAction per domain config.

## 7.6 — Workflows السريعة (Mobile-first)

**3-tap rule:** أي operation تشغيلية يومية = **3 taps max** على الموبايل.
- استلام دفعة: domain → entity → confirm = 3
- تأكيد شحن: signal → entity → confirm = 3
- رد على عميل: inbox badge → message → quick reply = 3

**> 3 taps = redesign للـ flow.**

## 7.7 — Mobile Constraints

- Touch targets ≥ 44px (per Apple HIG)
- No hover states (use focus/active)
- No keyboard shortcuts (assume touch-only)
- No tooltips (use clear labels)
- Forms ≤ 5 fields per screen (split if more)
- Network-aware (assume 3G occasionally)

---

# 8. Runtime Governance Model — ضبط النظام

## 8.1 — Ownership Boundaries

| Resource | Owner | Writers (Authorized) | Readers (Authorized) |
|---|---|---|---|
| `orders` | order-actions.js | `orders.js`, `order-actions.js`, FSE (payment fields) | all roles (filtered by RULE 8) |
| `wallets` | FSE only | `financial-sync-engine.js` | admin, ops_mgr, wallet_mgr |
| `transactions_v2` | FSE only | `financial-sync-engine.js` | admin, ops_mgr, wallet_mgr |
| `financial_ledger` | FSE only (append-only) | `financial-sync-engine.js` | admin, ops_mgr, wallet_mgr |
| `shipping_settlements` | shipping-actions | `addLedgerToBatch` | admin, ops_mgr, wallet_mgr, shipping |
| `users` | admin only | admin via Cloud Function | self + admin/ops_mgr |
| `clients`, `suppliers`, `employees` | per-page actions | respective pages via central actions | per RULE 8 |

## 8.2 — Domain Responsibilities

| Domain | Responsibility | Doesn't Touch |
|---|---|---|
| **accounts** | المالية، wallets، transfers | لا يحرّك stage، لا يعدّل clients |
| **admin** | إعدادات، employees، products | لا يحرّك orders، لا يكتب financial |
| **clients** | بيانات العملاء، calls، contacts | لا يحرّك stage مباشرة (عبر order.html) |
| **design** | تصميمات، ملفات، approvals | لا يكتب financial، لا يحرّك beyond DESIGN |
| **inbox** | الرسائل والإشعارات | لا يكتب على entities الأخرى |
| **production** | طباعة + إنتاج، supplier costs | لا يكتب shipping settlements |
| **reports** | قراءة فقط، tracking | ❌ **لا writes**، read-only domain |
| **shipping** | شحن + collections + returns | لا يكتب design data، لا يحرّك production |

## 8.3 — Signal Ownership

كل signal له **owner واضح** — مَن المسؤول عن إنتاجه + من المسؤول عن action عليه:

| Signal | Producer | Actor | Domain |
|---|---|---|---|
| Late orders > 48h | scheduled function | shipping_officer / ops_mgr | shipping |
| Unread urgent messages | inbox listener | CS / target user | inbox |
| Pending approvals | approvals listener | CS / admin | design (or approvals domain) |
| Drift detected | drift scan function | admin / ops_mgr | accounts |
| Low wallet balance | balance trigger | wallet_mgr / admin | accounts |
| Production blockers | production listener | production_agent / ops_mgr | production |

## 8.4 — Anti-Duplication Enforcement

**ممنوع (RULE C1.5):**
- ❌ نفس الـ list في sidebar + workspace (duplicate)
- ❌ نفس الـ action في 2 domains (مثلاً "settle" في shipping + accounts)
- ❌ counter محسوب في 2 places بطرق مختلفة
- ❌ stage stored في 2 fields (`stage` vs `currentStage`)

**Enforcement:** CI architecture-guard + code review + audit reports (RUNTIME_OWNERSHIP_AUDIT).

## 8.5 — Sidebar Governance

| Constraint | Value | Source |
|---|---|---|
| Max views per sidebar | 7±2 | Miller's Law |
| Max actions per sidebar | 4 | UX research |
| Max signals per sidebar | 3 | Cognitive load |
| Permission gating | required | `core/runtime-shell/domain-permissions.js` |
| Sidebar definition | `core/domains/{name}/sidebar.js` فقط | RULE C1.7 |
| No business logic in sidebar | enforced | RULE L1.2 |

## 8.6 — Workspace Governance

- صفحة واحدة = workspace واحد (لا frames داخل frames)
- لا direct writes to `orders/wallets/financial_ledger` (RULE H1.1)
- كل action عبر `orderActions.*` (RULE A1)
- god pages > 1500 سطر مجمَّدة (RULE G5)
- > 2500 سطر = freeze حتى decomposition plan

## 8.7 — Runtime Authority

**Final authorities (Stable Core, RULE H1.8):**
- `firestore.rules` — server trust boundary
- `financial-sync-engine.js` — money truth
- `orders.js` — state machine + validators
- `order-actions.js` — central actions
- `core/idempotency.js` — duplicate prevention
- `core/audit.js` — H3 universal audit
- `core/permissions-matrix.js` — role authority

كل تعديل على هؤلاء يحتاج 2-reviewer + smoke tests (RULE G1).

---

# 9. Runtime Scaling Model — كيف يكبر بدون فوضى؟

## 9.1 — Scaling Limits

| Resource | Soft Limit | Hard Limit | Action عند التجاوز |
|---|---|---|---|
| Domains | 8 | 10 | merge/split بدلاً من إضافة 11 |
| Views per domain | 7 | 9 | decompose الـ domain |
| Quick actions per domain | 4 | 5 | move to command palette |
| Signals per domain | 3 | 4 | aggregate أو escalate |
| Active iframes (LRU) | 3 | 5 | optimization needed |
| God pages > 1500 sloc | 0 new | (9 frozen موجودة) | decomposition plan إلزامي |
| Concurrent onSnapshots | 50 per session | 100 | review للـ teardown |
| Total Firestore reads/min | 1000 | 5000 | pagination + cache |

## 9.2 — Domain Growth Strategy

عند الحاجة لـ functionality جديدة:

```
1. هل تنتمي لـ domain موجود؟
   ✅ نعم → أضف view/action للـ domain existing (مع احترام الحدود)
   ❌ لا → استمر إلى 2

2. هل هي workflow operational حقيقي (مش feature isolated)؟
   ✅ نعم → استمر إلى 3
   ❌ لا → ربما sub-section في domain موجود

3. هل لها user يومي بـ default landing لها؟
   ✅ نعم → domain جديد محتمل
   ❌ لا → integrate في domain موجود

4. هل تستوفي RULE G10 (Module Definition Required)?
   ✅ نعم → ادخل في domain registry
   ❌ لا → معاد التصميم
```

## 9.3 — Sidebar Growth Strategy

عند الحاجة لـ view جديد في sidebar:
1. هل في view موجود يخدم نفس الـ purpose؟ → دمج
2. هل هو queue مهم يومياً؟ → primary view
3. هل هو advanced/secondary؟ → secondary view (collapsed)
4. هل هو one-off action؟ → quick action (مش view)

## 9.4 — Signal Growth Strategy

كل signal جديد لازم يستوفي:
- ✅ له owner واضح (Producer + Actor)
- ✅ له severity واضحة (Critical / Attention / Info)
- ✅ له resolution path (الـ user يقدر يفعل ماذا؟)
- ✅ له threshold واقعي (لا يصرخ كل دقيقة)
- ✅ يدخل في الـ 3-per-domain limit

**ممنوع:** "نضيف badge عشان نفكر فيه" — كل badge له تكلفة cognitive.

## 9.5 — Quick-Action Growth Strategy

الـ 4-actions-per-domain سقف صارم. عند الحاجة:
1. هل الـ action **بنسبة استخدام يومي > 30%** للـ role؟ → quick action
2. وإلا → يدخل **command palette** (Phase 4 من CLEANUP_PLAN)

## 9.6 — Domain Fragmentation Prevention

**Anti-pattern:** "نعمل domain جديد لكل feature" — يؤدي لـ 25 domains في عام.

**Rule:** عدد الـ domains = عدد الـ **operational personas** في الشركة. الحالي 8 domains لـ 8 roles — متطابق.

أي domain إضافي = role جديد + entity owner جديد + signals جديدة + audit trail جديد. **التكلفة عالية**.

## 9.7 — System-Wide Density

| Metric | Current | Target | Hard Limit |
|---|---|---|---|
| HTML page count | ~30 | <40 | 50 |
| God pages (>1500) | 9 | <5 | 10 |
| Total runtime-shell modules | 13 | <20 | 25 |
| Total domains | 8 | 8 | 10 |
| Total event types (FE) | ~15 | <25 | 35 |
| Total roles | 8 | 8 | 10 |
| Total Firestore collections | ~40 | <50 | 70 |

**تجاوز Hard Limit = freeze حتى refactor.**

---

# 10. Operational Deliverables (لكل feature جديد)

كل PR لـ feature/runtime/sidebar/shell يجب أن يحتوي:

| Deliverable | Format | Mandatory |
|---|---|---|
| **E1 Compliance Check** | 10-question table في PR description | ✅ |
| **Runtime Risk Assessment** | "ما الـ blast radius؟ أي domain تتأثر؟" | ✅ |
| **Rollback Strategy** | "كيف نرجع في < 5 دقائق؟" | ✅ |
| **Feature Flag Strategy** | اسم الـ flag + default + toggle path | ✅ (للـ features) |
| **Backward Compatibility Check** | "الـ legacy paths اللي تبقى تعمل؟" | ✅ |
| **Operational Impact Analysis** | "أي users/roles/workflows تتأثر؟" | ✅ |
| **Governance Impact Review** | "أي rules تتعزز / تتعارض؟" | ✅ |
| **Smoke Test Plan** | manual chaos tests (H2.6) | ✅ (للـ financial/state changes) |

---

# 11. الفلسفة النهائية — Operating Identity

النظام يجب أن يجعل الـ user **يفكر أقل ويفعل أكثر**:

| ❌ نظام سيئ | ✅ Runtime تشغيلي |
|---|---|
| "أين أجد الـ feature ده؟" | "أين أنا الآن؟ → اعمل التالي" |
| 12 KPI cards على الصفحة الرئيسية | 3 signals critical فقط |
| 8 sidebars تظهر معاً | sidebar واحد per context |
| كل page تعيد تحميل كاملة | iframe swap داخل shell |
| filters تضيع عند العودة | runtime-memory يحفظ |
| نفس الـ stage في 4 fields | `order.stage` واحد فقط |
| pop-up modal على كل action | inline action + idempotency |
| `location.hash` chaos | `?query` + shell-aware nav |

## أسئلة الـ Operating Identity Test

لكل feature جديد، اسأل:
1. هل يقلل cognitive load؟
2. هل يحترم الـ context الحالية؟
3. هل يعيد استخدام runtime موجود؟
4. هل يخدم role-based workflow حقيقي؟
5. هل يحافظ على Single Source of Truth؟
6. هل يبقى ضمن الحدود (Section 5.1)؟
7. هل يحترم انفصال sidebar/workspace (Section 3.4)؟
8. هل يحترم mobile constraints (Section 7)؟
9. هل يخدم الـ Operating Identity (هذا الجدول أعلاه)؟

**إذا "لا" على أي سؤال → إعادة تصميم قبل التنفيذ.**

---

# 12. References & Citations

**الـ Implementation الفعلي:**
- `shell.html` (entry)
- `core/runtime-shell/*` (13 modules)
- `core/domains/*/sidebar.js` (8 configs)
- `core/shell-navigate.js`
- `core/runtime-memory.js`
- `core/permissions-matrix.js`
- `orders.js:73-80` (ORDER_STAGES)
- `order-actions.js` (central actions)
- `financial-sync-engine.js` (FE event types)

**الـ Governance:**
- RULE E1 (Runtime Evolution Safety) — `CLAUDE.md`
- RULE N1 (Shell Navigation Contract) — `CLAUDE.md`
- RULE C1 (Centralization) — `CLAUDE.md`
- RULE W1 (Workflow Simplicity) — `CLAUDE.md`
- RULE 8 (Data Access Boundaries) — `CLAUDE.md`

**الـ Audits:**
- `RUNTIME_OWNERSHIP_AUDIT.md` (115+ violations)
- `RUNTIME_MOBILE_UX_AUDIT.md` (mobile risks)
- `SIDEBAR_GOVERNANCE_AUDIT.md` (navigation migration)
- `MOBILE_UX_AUDIT.md` (touch targets)
- `CLEANUP_PLAN.md` (8-phase roadmap)

---

**Document status:** Behavioral model — descriptive, not prescriptive of new code.
**Authority:** Subordinate to RULE E1. لا يبرر أي rewrite. كل application يتم تدريجياً عبر RULE G9.
**Maintenance:** يُحدَّث عند تغيير `core/runtime-shell/*` أو إضافة domain جديد أو role جديد.
