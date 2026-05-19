# RFC — إعادة هيكلة صفحات التصميم الثلاث (Design Modular Refactoring)

> **التاريخ:** 2026-05-19
> **النطاق:** `design.html` (2,238 سطر) + `design-workspace.html` (2,425 سطر) + `designer-dashboard.html` (760 سطر) = **5,423 سطر إجمالي**.
> **الحاكمية:** هذا RFC للمراجعة فقط — كل القرارات تخضع لـ Rules **G4 / G5 / G6 / G9** وأسئلة الحوكمة الستة في `CLAUDE.md`.
> **الفلسفة:** ليس refactor تجميلي. الهدف بناء `features/design/` كـ **bounded context** قابل للتطور لاحقاً إلى marketplace (Phase 2–3) — مصممون خارجيون يدخلون نفس الـ workspace.

---

## 1. جرد الوظائف (Function Inventory)

### 1.1 `design.html` — الـ Kanban CS/Admin
~70 وظيفة موزعة على 5 فئات:
- **Sidebar/Boilerplate:** `buildDynamicSidebar` (L407-475), `buildSidebar` (L486-508), `guardPage` (L510-526), `initSidebar` (L528-532)
- **Permissions:** `canSeePhone`/`showPhone` (L561-567)
- **Utility:** `fn/gv/sv/setText/nowStr/delay` (L569-574), `toast` (L577)
- **UI:** `showAdminSection` (L583-595), `toggleNav/closeNav/doLogout` (L578-580)
- **Business logic + Writes:**
  - `moveStage` (L607-635) — Write + Audit
  - `saveAdminFinance` (L637-655) — Write (مالي)
  - `escapeNotes/toggleEditNotes/saveDesignNotes` (L658-712)
  - `deleteOrderFull` (L714-749) — Write (مالي ذرّي)
  - `saveOrder` (L1693-1792) — Write (ذرّي مالي)
  - `confirmRecordPayment` (L2087-2152) — Write (ذرّي مالي)
  - `saveAssignDesigner` (L1795-1889)
  - `startWork/acceptOrder/pauseWork/finishWork` (L1891-2017)
  - `confirmSplitOrder` (L1924-1980) — Write (ذرّي)
  - `setProductStatus` (L1983-2000)
  - `setDS/approveOrder/confirmApproveWithPrinter` (L2019-2076)
  - `openReject/closeReject/confirmReject` (L2078-2084)
- **Listeners:** `startListeners` (L929-1039) — 6 `onSnapshot` (orders ×3 شروط، clients، products_v2، employees ×2، wallets)
- **UI Render:** `renderKanban` (L1057-1151), `renderDesignDashboard` (L1153-1223), `renderPanel` (L1272-1511 — **240 سطر god function**)
- **Upload:** `openUpload/closeUpload/previewDesignImg/saveDesignFile` (L1518-1563)
- **Search:** `searchClients/selectClient` (L1566-1588)
- **Gallery:** `saveToGallery` (L880-927)

### 1.2 `design-workspace.html` — Workspace + Portfolio
~75 وظيفة. الـ god functions: `renderPanel` (146 سطر، L1574-1720) + `renderItemsSection` (150 سطر، L1722-1872).

**أبرز الوظائف الفريدة:**
- `initDesignItems` (L1537-1571) — إنشاء `design_items` ذرّياً
- `processDecision` (L2101-2118) — قرار عميل
- `reqPublish/approvePublish/rejectPublish/cancelPublishReq/withdrawPublic` (L1063-1185) — visibility workflow
- `saveRevision` (L2057-2077) — تسجيل revision
- `uploadSlotFile/uploadVersion` (L1940-2032) — 3 سلوتات (mockup/pdf/source)
- `markApproved/togglePrintReady` (L2034-2054)
- `confirmGalleryPublish` (L2255-2400) — نشر معرض

### 1.3 `designer-dashboard.html` — داشبورد المصمم
~20 وظيفة. غالبها UI render. لا writes مالية.
- `render` (L424-640) — god function 215 سطر يبني كل الـ DOM
- `renderQueue` (L643-710) — الـ 3 تابات (active/tasks/done)
- `doAtt` (L727-749) — **مكرر من design.html**
- `completeTask` (L751-756)

---

## 2. جرد عمليات Firestore

### 2.1 إحصاء عام

| المؤشر | design.html | design-workspace.html | designer-dashboard.html | الإجمالي |
|---|---|---|---|---|
| `onSnapshot` نشطة | 7 | 5 | 8 | **20** |
| بدون `limit()` | 6 | 2 | 7 | **15 (75%) — انتهاك G3** |
| writes مالية عبر FSE | ✅ | n/a | n/a | ✅ |

### 2.2 `design.html` — التفاصيل

| Collection | العملية | الفلتر | limit؟ |
|------------|---------|--------|--------|
| `orders` (admin) | onSnapshot | `stage==design` | ❌ |
| `orders` (CS) | onSnapshot | `stage==design` | ❌ |
| `orders` (designer) | onSnapshot | `designerId==uid && stage==design` | ❌ |
| `orders` (unassigned) | onSnapshot | `stage==design` | ❌ |
| `clients` | onSnapshot | `orderBy(createdAt) limit(1500)` | ✅ |
| `products_v2` | onSnapshot | لا | ❌ |
| `employees` (designers) | onSnapshot | `role in [graphic_designer, design_operator]` | ❌ |
| `employees` (printers) | onSnapshot | `role==production_agent` | ❌ |
| `wallets` | onSnapshot | لا | ❌ |

### 2.3 `design-workspace.html` — التفاصيل

| Collection | العملية | limit؟ |
|------------|---------|--------|
| `orders` (admin/designer) | onSnapshot | ❌ |
| `design_items` | onSnapshot | `orderBy(updatedAt) limit(500)` ✅ |
| `client_decisions` | onSnapshot | `processed==false` ❌ |
| `gallery` (lazy) | onSnapshot | `isVisible==true limit(300)` ✅ |
| `design_items` (per-order) | onSnapshot | `orderDocId==X` ❌ |

### 2.4 `designer-dashboard.html` — التفاصيل

| Collection | العملية | limit؟ |
|------------|---------|--------|
| `employees` | onSnapshot كاملاً ❌ **G3 + لا داعي للقراءة الكاملة** |
| `employee_goals` | onSnapshot | ❌ |
| `employee_evaluations` | onSnapshot | ❌ |
| `employee_payments` | onSnapshot | ❌ |
| `orders` (designerId+stage) | onSnapshot | ❌ |
| `orders` (stage==design) | onSnapshot | `limit(500)` ✅ |
| `tasks` (assignedTo==uid) | onSnapshot | ❌ |
| `attendance` | onSnapshot | ❌ |

---

## 3. تحليل التكرار (Duplication Analysis)

| النوع | الموقع 1 | الموقع 2 | الموقع 3 | تقدير التكرار |
|------|----------|----------|----------|---------------|
| Sidebar (`buildDynamicSidebar` + `buildSidebar` + `guardPage`) | design.html L407-532 | design-workspace.html L729-774 | designer-dashboard.html L169-303 | **~95% identical** — ~360 سطر هدر |
| FB_CONFIG / firebase imports | يستوردون من `core/firebase-init.js` | نفس | نفس | ✅ G2 مطبَّق |
| `fn / gv / sv / setText / toast / nowStr` | L569-577 | L694-702 | L313-330 | **100% — copy/paste** |
| `canSeePhone` + `_PHONE_ROLES` | L560-567 | L687-688 | غير موجود | **مكرر 2×** |
| Order card (client+products+badges) | inline | inline (`.ord-item`) | inline (`.work-card`) | **متشابه ~60%** |
| Gallery publish modal/logic | L880-927 + `#ov-gallery` | L2255-2400 + `#ov-gallery` | n/a | **متطابقان جوهرياً ~85%** |
| Lightbox | `#img-viewer` + JS L2198-2233 | `#lb-overlay` + JS L2181-2207 | n/a | **متطابقان جوهرياً ~90%** |
| Attendance UI + `doAtt` | L788-831 | n/a | L727-749 + render | **متطابقان 100%** |
| `onAuthStateChanged` boot pattern | L753 | L777 | L342 | **متطابق structure ~80%** |
| onSnapshot orders by designer/stage | L979-1006 | L1287-1290 | L387-405 | **3 implementations لنفس الـ query** |
| Drag/drop file logic | L1655-1679 | L2210-2230 | n/a | **متشابه ~70%** |
| `delay`/`getPriority`/`daysUntil` | inline | `getPriority()` | `daysUntil()` | **3 implementations لنفس الحسبة** |

**تقدير إجمالي:** **35–40% من الـ 5,423 سطر مكرر** بشكل قابل للاستخراج (~1,900–2,200 سطر يمكن حذفها بعد التوحيد).

---

## 4. المنطق الفريد لكل ملف

### 4.1 فريد لـ `design.html`
- Kanban 4 أعمدة بمنطق designStage (pending/wip/awaiting_payment/rejected)
- CS recording client payment — modal `ov-pay` + `confirmRecordPayment` — تكامل مالي ذرّي
- Admin override stage (`moveStage`) مع audit log — RULE 8 + Audit
- New Order Modal مع clients search + multi-products + deposit + paste/drag ref file
- Approve → pick printer (`confirmApproveWithPrinter`)
- Split Order (`buildOrderSplit` من orders.js)
- Delete order full مع استرداد عربون (ledger reversal)

### 4.2 فريد لـ `design-workspace.html`
- `design_items` collection — entity جديدة بمنطق versions[] + 3 file slots
- Revision tracking (`saveRevision`)
- Client decisions integration (`processDecision`)
- Visibility workflow (private → pending → public)
- Portfolio + Public Gallery mirror
- Performance ring (نسبة قبول البنود)
- Drag/drop multi-file → auto slot distribution
- Pagination + Skeletons + Lazy gallery listener (**أكثر النضج المعماري في الـ 3 صفحات**)
- Keyboard shortcuts (j/k/`/`/Esc)
- Mobile slide-up workspace

### 4.3 فريد لـ `designer-dashboard.html`
- Live clock + greeting
- Income card يقرأ من `employee_payments` (RULE 1)
- Goals + last evaluation
- 3 Tabs (active/tasks/done)
- Tasks integration

---

## 5. الهيكلة المقترحة

```
features/design/
├── index.html                    ← entry point موحَّد (~250 سطر فقط)
├── design.entry.js               ← bootstrap الصفحة + auth + router داخلي
├── repository.js                 ← كل الـ Firestore queries (G4)
├── permissions.js                ← canSee* + role gates (RULE 8)
├── state.js                      ← AppState للصفحة
│
├── views/
│   ├── kanban-view.js            ← من design.html (CS/Admin)
│   ├── workspace-view.js         ← من design-workspace.html (orders tab + items)
│   ├── portfolio-view.js         ← من design-workspace.html (portfolio/review/public)
│   └── dashboard-view.js         ← من designer-dashboard.html
│
├── components/
│   ├── order-card.js             ← مكوّن موحّد (kanban + list + queue)
│   ├── status-pill.js            ← productStatus / designStage / time / rev
│   ├── filters-bar.js            ← بحث + select + month picker
│   ├── side-panel.js             ← الـ Panel الموحّد
│   ├── item-card.js              ← بند workspace + 3 slots + actions
│   ├── version-card.js           ← نسخة v بحوافها وسلوتاتها
│   ├── upload-zone.js            ← drag/drop + paste + progress
│   ├── lightbox.js               ← الـ image viewer (موحّد)
│   ├── attendance-card.js        ← بطاقة الحضور (موحّد)
│   ├── workload-bars.js          ← شرائط حمل المصممين
│   ├── pipeline.js               ← pipe-node + pipe-arrow
│   ├── modal-shell.js            ← غلاف modal خفيف
│   └── pf-grid.js                ← شبكة + skeleton + load-more
│
├── modals/
│   ├── new-order.modal.js
│   ├── assign-designer.modal.js
│   ├── pick-printer.modal.js
│   ├── split-order.modal.js
│   ├── reject.modal.js
│   ├── record-payment.modal.js
│   ├── upload-design.modal.js
│   ├── revision.modal.js
│   ├── edit-item.modal.js
│   ├── gallery-publish.modal.js  ← موحَّد
│   ├── reassign.modal.js
│   └── pf-detail.modal.js
│
└── services/
    ├── orders.service.js         ← create/move/split/delete + audit
    ├── design-items.service.js   ← init/upload-slot/approve/printReady/reset
    ├── revision.service.js
    ├── client-decisions.service.js
    ├── gallery.service.js
    ├── attendance.service.js
    ├── payments.service.js       ← يستدعي FSE
    ├── upload.service.js         ← Storage uploads
    └── tasks.service.js
```

### الـ Routing داخل `design.entry.js`

```
URL                              → view
/design                          → kanban-view (افتراضي للـ admin/CS)
/design?view=dashboard           → dashboard-view (افتراضي للمصمم)
/design?view=workspace           → workspace-view
/design?view=workspace&order=X   → workspace-view + open order
/design?view=portfolio           → portfolio-view (tab=portfolio)
/design?view=portfolio&tab=review|public  → portfolio sub-tabs
```

> الـ `designer-dashboard.html`، `design.html`، `design-workspace.html` تظل كـ **redirect shims** لمدة Sprint كامل لـ backward compatibility (G9).

---

## 6. المخاطر / Hot-spots

| # | المخاطر | تخفيف |
|---|--------|------|
| 1 | `renderPanel` god function (240 سطر) في design.html L1272-1511 | تقسيم لـ sub-components بـ slots |
| 2 | `renderItemsSection` (150 سطر) في workspace L1722-1872 | استخراج كل قسم لمكوّن مستقل |
| 3 | State global على window (`__assignedDesign`, `__unassignedDesign`, إلخ — 11 متغير) | استبدال بـ `state.js` module |
| 4 | Race في `startListeners` (design.html): assigned + unassigned snapshots كلاهما يكتب orders | توحيد في query واحدة عبر `or()` compound query |
| 5 | مودال gallery له شكلان مختلفان بنفس الـ id `ov-gallery` | prefix `dsg-` ولفّ في `<dialog>` |
| 6 | Lightbox مكرر بـ id مختلف (`#img-viewer` vs `#lb-overlay`) | component واحد + state واحد |
| 7 | 15 `onSnapshot` بدون `limit()` — انتهاك G3 | كل query عبر `repository.js` بـ DEFAULT_LIMIT=200 |
| 8 | listener leak عند الانتقال بين views | `currentView.dispose()` قبل `nextView.mount()` |
| 9 | `designer-dashboard.html` يقرأ `employees` كاملاً | استخدام `users.{uid}.employeeId` أو `where('authUid','==',uid)` |
| 10 | Auto-create `design_items` عند openOrder = side effect في قراءة | نقله لـ Cloud Function trigger، أو check للصلاحية |

---

## 7. خارطة الـ PRs المفصَّلة

### PR-1 — Skeleton + Repository + Permissions
- **ينشئ:** `features/design/repository.js`, `permissions.js`, `state.js`, services stubs
- **يُعدِّل:** لا شيء — additive فقط (G9)
- **الوقت الواقعي:** 8 ساعات
- **المخاطر:** صفر — لا أحد يستدعي الكود الجديد بعد

### PR-2 — Components (8 ملفات)
- order-card, status-pill, lightbox, attendance-card, modal-shell, pipeline, upload-zone, pf-grid
- **الوقت الواقعي:** 14 ساعة
- **المخاطر:** CSS selectors، event handlers inline

### PR-3 — Modals (12 ملف)
- استبدال overlays بـ mountModal pattern
- **الوقت الواقعي:** 12 ساعة
- **المخاطر:** drag/drop life-cycle، z-index، a11y

### PR-4 — Views + entry + router
- 4 views + index.html + design.entry.js
- **الوقت الواقعي:** 16 ساعة
- **المخاطر:** listener cleanup، deep links

### PR-5 — Cutover (redirect shims)
- 3 صفحات قديمة تصبح redirects
- تحديث ~25 موقع لـ links داخلية
- **الوقت الواقعي:** 6 ساعات

### PR-6 — Repository enforcement + G3 fixes
- كل onSnapshot عبر repository.js
- limit() مفروض في كل listener
- **الوقت الواقعي:** 8 ساعات

### PR-7 — Cleanup + Docs
- حذف الـ shims بعد 2 أسبوع مراقبة
- **الوقت الواقعي:** 4 ساعات

**الإجمالي الواقعي: 68 ساعة ≈ 9 أيام عمل.** التوصية: **3 أسابيع كاملة (15 يوم)** يوم بين كل PR للمراقبة (G9).

---

## 8. التحقق على الـ Vision (الأسئلة الست)

| السؤال | الإجابة بعد الـ refactor |
|---|---|
| 1. قابل للتوسع وطنياً؟ | ✅ `features/design/` معزول؛ يمكن نسخه لـ tenant آخر بـ tenantId scope (G7) |
| 2. يقلل الاعتماد على التنفيذ الداخلي؟ | ✅ workspace جاهز لـ Phase 2: مصمم خارجي يدخل بنفس الواجهة |
| 3. يزيد قوة الشبكة؟ | ✅ kpis + portfolio + gallery → reputation system للمصممين |
| 4. يزيد احتفاظ البيانات؟ | ✅ `design_items` ↔ versions ↔ revisions ↔ client_decisions = history غني |
| 5. يجعل الشركة مركز التحكم؟ | ✅ Admin filter / review queue / approve-publish = bottleneck محكم |
| 6. قابل للتحول إلى Marketplace Logic؟ | ✅ Phase 3: portfolio = "design listings"، gallery العام = storefront |

---

## 9. ملاحظات أخيرة

- **`buildOrderSplit`** و **`buildStageAdvance`** في `orders.js` تظل مصدر الحقيقة. الـ services تستدعيها.
- **`financial-sync-engine.js`** — كل الكتابات المالية في `services/payments.service.js` و `services/orders.service.js` (لـ `deleteOrderFull` فقط).
- **`core/permissions-matrix.js`** يجب أن يصبح الـ source لـ `canSee('client_phone')` و `canSee('design_data')` — حالياً كل صفحة تعرّف `_PHONE_ROLES` محلياً (RULE 8.4: ممنوع التكرار).
- **`design_items.designerId` vs `orders.designerId`** — نقطة هشة تتطلب data consistency check في Cloud Function (خارج النطاق).

---

**ملفات مفحوصة:**
- `/home/user/b2c-erp/design.html` (2,238 سطر)
- `/home/user/b2c-erp/design-workspace.html` (2,425 سطر)
- `/home/user/b2c-erp/designer-dashboard.html` (760 سطر)
- `/home/user/b2c-erp/orders.js` (helpers مرجعية)
- `/home/user/b2c-erp/core/firebase-init.js` (G2)
- `/home/user/b2c-erp/core/permissions-matrix.js` (RULE 8)
- `/home/user/b2c-erp/CLAUDE.md` (الحاكمية)
