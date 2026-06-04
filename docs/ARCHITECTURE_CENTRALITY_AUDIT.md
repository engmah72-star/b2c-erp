# Architecture Centrality Audit — Is the Order the Single Source of Truth?

> **One question only:** Does business logic live on the **Order**, or inside
> **Conversations/Messages**? **Code-evidence only** — no docs trusted, nothing assumed.
> **Auditor hat:** Software Architect + ERP Systems Auditor.
> **Method:** End-to-end trace of 8 flows against the real implementation
> (`orders.js`, `order-actions.js`, `financial-sync-engine.js`, `functions/index.js`,
> `core/order-math.js`, `core/storage-helpers.js`, `inbox-actions.js`, `client-actions.js`,
> `firestore.rules`, customer-portal views/services). Out of scope: code quality, UI, performance.

---

## TL;DR — Verdict

**The system is `A) Order-Centric Architecture`.** The `orders/{id}` document (plus the
financial collections written exclusively by the FSE) is the canonical source of truth for
every core business operation: creation, state, approval, invoice, payment, and files.
**Conversations carry zero authoritative business data** — deleting the entire `messages`
subcollection would not break a single business process.

**Two real (non-critical) leaks** keep it from being *purely* order-centric: (1) the
**customer-portal "new order"/"reorder" emits only a chat message**, not a structured order
or request entity; (2) the **client design-approval falls back to a chat message** if the
Cloud Function fails. In both cases a *business intent* can temporarily live **only inside a
message** with no structured backing record.

**Business Centralization Score: 93 / 100.**

---

## Flow-by-Flow Evidence

### FLOW 1 — Create new order ("اطلب الآن" / "إنشاء طلب")
**Staff/admin path → REAL order.** `clients.html:1598 saveNewOrder()` → `orderActions.createOrder()`
(`order-actions.js:179–359`). A full `orders/{auto-id}` doc is created via `writeBatch`:
`batch.set(orderRef, orderData)` (`order-actions.js:302`) with stage, financial fields,
products, responsibility, timeline. If `deposit>0`, the **same batch** also writes `wallets`,
`transactions_v2`, and a `financial_ledger` entry (`order-actions.js:304–326`). Wrapped in
`withIdempotency()` (`:215`). **No conversation/message is created by order creation.**

**Customer-portal path → message only.** `features/customer-portal/views/new-order.view.js:52`
calls `sendRequest(ctx, { text, kind:'support' })` — it writes a **chat message**, not an order.
Rule-consistent: `orders` create requires `isAdmin() || can('canAddOrders')` (`firestore.rules:377`),
so a client *cannot* self-create an order. **But the purchase intent exists only as free text in a thread.**

> **Verdict:** Canonical record = `orders/{id}` (staff). Client "order" requests are message-only. ⚠️

### FLOW 2 — Reorder ("إعادة الطلب" / "اطلب تاني")
- **Admin** `clients.html:1383 reorderLastOrder()` pre-fills the new-order modal → `createOrder()`
  → **new `orders/{id}` doc**.
- **Customer-portal** `home.view.js:106` / `order-detail.view.js:31` → `sendRequest({kind:'order', text: reorderText(o)})`
  (`requests.js:23` builds `"🔁 أرغب بإعادة طلب…"`). **Message only — no order, no request doc.**

> **Verdict:** Acted reorders become real orders (staff). Client reorder = message only. ⚠️

### FLOW 3 — Design approval (اعتماد التصميم)
**Primary path → ORDER + recorded event.** `approval.service.js:8` calls Cloud Function
`requestDesignApproval` (`functions/index.js:3503–3528`), which verifies ownership
(`order.clientPhone === client.phone1`) and precondition (`stage==='design'`), then **updates the order**:
```js
orders/{orderId}.update({
  clientApproval: { status:'approved', at, by: uid },
  timeline: arrayUnion({ action:'✅ اعتمد العميل التصميم عبر البوابة', ... }),
})
```
Staff approvals likewise mutate the order + timeline (`approval-actions.js`).
**Fallback → message only.** `order-detail.view.js:40–46`: if the Cloud Function returns `!ok`,
it falls back to `sendRequest({ kind:'order', text: approveText(order) })` — i.e. the approval
becomes **just a chat message** with no `clientApproval` field set on the order.

> **Verdict:** Canonical = `order.clientApproval` + `timeline`. Rare CF-failure path leaks approval into a message only. ⚠️

### FLOW 4 — Order state change (تغيير حالة الطلب)
Source of truth = **`order.stage`**. Constants in `orders.js:78` (`ORDER_STAGES`). Transitions go
through the pure validator `buildStageAdvance()` (`orders.js:1264`) and the atomic executor
`advanceOrderStageWithLock()` (`orders.js:2845`), which runs `runTransaction`, enforces an
optimistic lock (`expectedCurrentStage`), and writes `stage`, `stageEnteredAt/CompletedAt`,
`timeline`, plus responsibility fields — all on `orders/{id}`. Gated by role/permission +
`isValidStageUpdate()` in `firestore.rules:345–400` (`canAdvanceFromStage`, archive-payment guard).

> **Verdict:** Canonical = `order.stage`, transactional + audited + ACL-gated. **No message path exists.** ✅

### FLOW 5 — Invoice issuance (إصدار الفاتورة)
**No invoice document exists.** The invoice is **computed at read time** from order fields:
`calcRem()` / `orderGrossTotal()` / `isFullyPaid()` (`core/order-math.js:24–62`),
`getRemaining()` (`finance-core.js:26`), `invoiceOf()` (`core/order-financials.js:29`).
The waybill prints the live `order.remaining` (`waybill.html:159`). No invoice number is persisted —
the order id is the reference. Grep confirms **no financial arithmetic in HTML/messages** outside
`order-math.js` / `finance-core.js` / `order-financials.js` / FSE.

> **Verdict:** Single derived source (order + order-math). No duplicate invoice store. ✅

### FLOW 6 — Payment recording (تسجيل المدفوعات)
**Every** payment flows through one door: `orderActions.recordPayment()` (`order-actions.js:976`)
→ `dispatchFinancialEvent(db, FE.CUSTOMER_PAYMENT, …)` → `handleCustomerPayment()`
(`financial-sync-engine.js:525–575`), which commits **one atomic `writeBatch`** to:
`wallets` (balance `increment`), `transactions_v2` (tx record + approval workflow),
`financial_ledger` (audit entry + `engineSignature:'FSE_v1'`), and `orders/{id}`
(`totalPaid/remaining/paymentStatus/paidAt` via `calcOrderPayment()`). All call sites
(`print.html:1509`, `design.html`, `cs-dashboard.html`, `clients.html:1734`, `shipping-actions.js`)
converge here. Rules restrict writes to `canFinancialWrite()` (`firestore.rules:92,476–500,832`).
`inbox-actions.js` performs **zero** financial writes; message rules forbid financial fields.

> **Verdict:** Fully centralized in FSE; `order.totalPaid` canonical; no message path. ✅

### FLOW 7 — Design file upload (رفع ملفات التصميم)
Files are persisted **on the order**: `orders/{id}.designFileUrl / designFiles[] / designFileNote`
(`order-actions.js:282, 2397–2399`; initialized `orders.js:1012`). Storage path is order-scoped:
`orders/{orderId}/design/{ts}_{file}` (`core/storage-helpers.js`). The upload is *business logic*,
not chat: `saveDesignFile()` (`order-actions.js:2380–2420`) can auto-advance `designStage`
WIP→AWAITING_PAYMENT and append a timeline entry. Chat-shared images/files are **separate copies**
stored under `chat/{convId}/…` — not the authoritative design asset.

> **Verdict:** Canonical design files belong to the order; chat copies are non-authoritative. ✅ (minor dup)

### FLOW 8 — Order-linked conversations (المحادثات المرتبطة بالأوردر)
`ensureOrderThread()` (`inbox-actions.js:131`) builds `conversations/order_{orderId}` with an
`orderRef: order` **snapshot** and an `order_share` message carries an `orderRef` **copy**
(`inbox.html:1107`). These are **denormalized display caches**, never read as truth.
`functions/index.js` has **no `onCreate`/trigger on `conversations` or `messages`** — messages drive
no order or financial mutation. **Delete-all-messages test:** stage, approval, files, payments,
timeline all live on `orders/{id}` + financial collections → **order processing is 100% unaffected.**

> **Verdict:** Conversations = pure communication. No business logic. ✅ (orderRef snapshots are duplication)

---

## Entity Relationship Map (actual, from code)

```
                         ┌──────────────┐
                         │   CUSTOMER   │  source: clients/{uid}  (portal: phone-matched)
                         └──────┬───────┘
                                │ clientId / clientPhone (denormalized onto order)
                                ▼
   FILES ───────────────▶ ┌─────────────────────────────────────────────┐
   source: orders/{id}    │                  ORDER                        │ ◀── SINGLE SOURCE OF TRUTH
   .designFileUrl /       │              orders/{id}                      │
   .designFiles[]         │  stage · designStage · clientApproval ·       │
   storage:               │  timeline · salePrice · discount · custShip · │
   orders/{id}/design/…   │  totalPaid · remaining · paymentStatus        │
   (chat copies =         └───┬───────────┬───────────────┬──────────────┘
    non-authoritative)        │           │               │
                              │           │               │ derived (read-time, NOT stored)
        APPROVAL ◀────────────┘           │               ▼
        source: order.clientApproval      │        ┌───────────────┐
        + order.timeline                  │        │    INVOICE    │ = calcRem()/invoiceOf()
        (CF requestDesignApproval)        │        │  (computed)   │   order-math.js
                                          │        └───────────────┘
                                          │ FSE writes payment fields onto order
                                          ▼
                                  ┌────────────────┐    atomic batch (FSE only)
                                  │    PAYMENT     │───▶ wallets · transactions_v2 ·
                                  │ source: FSE →  │     financial_ledger (engineSignature)
                                  │ transactions_v2│
                                  │ +financial_    │
                                  │  ledger        │
                                  └────────────────┘
                              ┌────────────────────────────┐
   CONVERSATION ─────────────│  conversations/{id}         │  pure comms · NO business logic
   source: conversations/{id}│  + order_share / orderRef   │  orderRef = SNAPSHOT (duplication,
   (order_{id} / clord_{id}) │    = denormalized snapshot  │   non-authoritative, can be stale)
                             └────────────────────────────┘  no Cloud Function triggers
```

| Entity | Single Source of Truth | Derived data | Duplication / denormalization |
|---|---|---|---|
| **Order** | `orders/{id}` | — | `orderRef` snapshots in convs/messages |
| **Invoice** | computed (`order-math.js` from order) | gross/rem/paid at read time | none persisted (no invoice doc) |
| **Payment** | `transactions_v2` + `financial_ledger` (FSE) | `order.totalPaid/remaining/paymentStatus` (atomic mirror) | `order.*` mirror is canonical & atomic — acceptable |
| **Approval** | `order.clientApproval` + `order.timeline` | — | CF-failure fallback → chat message ⚠️ |
| **Files** | `orders/{id}.designFiles[]` + storage `orders/{id}/…` | — | chat attachment copies; `design_items` secondary |
| **Conversation** | `conversations/{id}` (comms only) | — | holds copies of order fields (display) |
| **Customer** | `clients/{uid}` | order denormalizes `clientName/Phone` | name/phone copied onto order |

---

## Risk Classification

### 🔴 Critical — core business operation executed via Message ONLY
**NONE.** No authoritative business state (stage, approval-of-record, payment, invoice, files)
is stored exclusively in a message. The delete-all-messages test passes.

### 🟠 High Impact — duplication / non-centralization / intent-only-in-chat
1. **Customer-portal "new order" & "reorder" are message-only** (`new-order.view.js:52`,
   `home.view.js:106`, `order-detail.view.js:31`). A customer's purchase intent lives **only as free
   text** in a conversation — there is **no structured `order_requests` entity** backing it. If the
   message is missed, muted, pruned, or the thread archived, the intent is lost with no queryable record.
2. **Design-approval fallback to message** (`order-detail.view.js:40–46`). On Cloud Function failure,
   the approval becomes a chat message and **`order.clientApproval` is never set** — the order's
   canonical approval state silently diverges from what the client believes they did.
3. **`orderRef` snapshots in threads/messages** (`inbox-actions.js:131`, `inbox.html:1107`) duplicate
   order fields (price/stage/deadline) that **go stale** — safe today (display-only) but a latent
   "second source" if any future code reads them as truth.

### ⚪ Low Impact — future improvements
- Dual file location: `orders/{id}.designFiles[]` **and** `design_items/{id}` — clarify the canonical one.
- No persisted invoice number (acceptable; order id is the reference) — fine unless legal/audit needs it.
- Chat-shared file copies under `chat/{convId}/…` are untracked duplicates of design assets.

---

## Final Scorecard

| Axis | Score /100 | Evidence basis |
|---|---:|---|
| **Order Centralization** | 94 | Real `orders/{id}` on staff create/reorder; client paths emit messages, not orders ⚠️ |
| **Invoice Centralization** | 98 | Pure read-time derivation from order; no duplicate store; no stray math |
| **Payment Centralization** | 97 | All via FSE → 4-collection atomic batch; engine signature; no message path |
| **Approval Centralization** | 88 | Canonical on `order.clientApproval`+timeline; CF-failure fallback leaks to message ⚠️ |
| **File Centralization** | 92 | Order-owned + order-scoped storage; minor `design_items`/chat-copy duplication |
| **Conversation Isolation** | 90 | Zero business logic, no triggers, delete-test passes; `orderRef` snapshots dock points |
| **Business Centralization Score** | **93** | Strongly order-centric with two message-only intent leaks |

---

## Architectural Decision

> ## ✅ **A) Order-Centric Architecture**

The Order is unambiguously the single source of truth. Every authoritative state transition —
stage, approval, invoice derivation, payment, file ownership — is written to `orders/{id}` or to
the FSE-owned financial collections, transactionally and ACL-gated. Conversations are a pure
communication layer with **no Cloud Function triggers and no business writes**; the entire `messages`
subcollection could be deleted without breaking order processing.

It is **not** Conversation-Centric and not truly Hybrid. The only places where business *intent*
(not state) lives solely in a message are the **customer-portal order/reorder requests** and the
**rare approval CF-failure fallback** — both intent-capture gaps at the system's edge, not the core.

### Recommended fixes (to reach pure order-centricity)
1. Back portal order/reorder with a structured **`order_requests`** entity (queryable, status-tracked,
   convertible to an order) instead of a free-text message.
2. Remove the approval **message fallback**, or have it create a durable `client_decisions`/order
   write so `order.clientApproval` is never bypassed.
3. Treat `orderRef`/`order_share` snapshots as **display-only by contract** (never read as truth);
   add a lint/guard so future code cannot promote them to a data source.
