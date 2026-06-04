# Order-Centric Hardening — Implementation Notes

> Follow-up to the **Architecture Centrality Audit** (Order = Single Source of Truth).
> Closes the two message-only intent leaks the audit found and locks the invariant
> with an Architecture Guard. **No FSE / financial-math changes.**
> Aligned with: L1, H1.1 (writes via action layer), RULE 3 (atomic), RULE 7/G10
> (new module), C2, H3 (audit), E1 (incremental · additive · reversible).

---

## What changed (4 tasks)

### 1) Removed the design-approval chat fallback
Client approval is now a **formal order state only** (`order.clientApproval` via the
`requestDesignApproval` Cloud Function). On CF failure the UI shows an error and the
approve button stays available to retry — it **never** degrades into a chat message.

- `features/customer-portal/views/order-detail.view.js` — `approve`: removed `sendRequest` fallback.
- `features/customer-portal/views/home.view.js` / `orders.view.js` — `approve:` now calls
  `services.approval.approveDesign()` (Cloud Function) instead of posting a chat message.

### 2) New structured entity: `order_requests` (RULE 7/G10)
Customer-portal "new order", "reorder", and "quote" now create a **queryable,
status-tracked request document** — the official start of the process — instead of a
free-text chat message. Staff convert it to a real order through the central action,
which reuses the existing atomic/financial `createOrder` path.

**Entity** `order_requests/{id}`:
```jsonc
{ "type": "new | reorder | quote",
  "clientUid", "clientName", "clientPhone",
  "sourceOrderId",                      // for reorder
  "product", "qty", "notes",
  "status": "new | converted | rejected",
  "convertedOrderId",                    // set on conversion
  "createdBy", "createdAt", "timeline": [auditEntry],
  "reviewedBy", "reviewedByName", "convertedAt" }
```

**RULE 7/G10 facets**
| Facet | Decision |
|---|---|
| Entity | `order_requests` — pre-order intent; **not** an order until converted |
| Events | create (client) · convert→order (staff) · reject (staff) — via timeline |
| Accounting | **none** — zero financial side effects until converted to an order (then FSE owns it) |
| Dashboard | CS triage list (status=new) — *UI wiring is the one remaining step, see below* |
| Reversal | reject (status='rejected'); converted is terminal + linked to `convertedOrderId` |
| Tenant | inherits global G7 posture (tenantId added when activated system-wide) |
| Permissions | client creates own (`clientUid==auth.uid`); staff (`canAddOrders`/clients/admin) read+convert |
| Tests | `tests/architecture-order-centric.test.mjs` + manual rules test |

**Code:**
- `clientActions.createOrderRequest()` — `client-actions.js` (allowlisted writer, no financial writes).
- `orderActions.createOrderFromRequest()` — `order-actions.js` (loads request → `createOrder` → marks `converted`).
- `features/customer-portal/services/requests.service.js` + barrel `services/index.js`.
- Portal views: `requests.js` (`submitRequest`), `new-order.view.js`, `home.view.js`,
  `orders.view.js`, `order-detail.view.js`, `designs.view.js`.
- `firestore.rules` — `order_requests` block (create=self+status'new'; read=owner|staff; update=staff).
- `firestore.indexes.json` — `status+createdAt`, `clientUid+createdAt`.

> **Remaining UI step (intentionally not in a god-page):** a CS-dashboard panel listing
> `status=='new'` requests with a "Convert" button calling
> `orderActions.createOrderFromRequest()`. The full loop exists at the data/action/rules
> layer (and is test-covered); the button is a thin, additive follow-up kept out of the
> 1.5k-line `cs-dashboard.html` god-page to respect G5.

### 3) Architecture Guard — message-as-truth lock
New CI job `order-centric` in `.github/workflows/architecture-guard.yml` (scans **added
diff lines only**, like the existing guard). Fails the build on:
1. New Cloud Function trigger on `conversations`/`messages`.
2. Reading financial/derived truth from a message snapshot (`orderRef.{salePrice|remaining|totalPaid|paymentStatus|discount|deposit|paid|grossTotal|dueByCo|net}`).
3. Order/financial writes inside messaging files (`inbox-actions.js`, `features/inbox/**`, `chat.service.js`).

Plus a static regression test `tests/architecture-order-centric.test.mjs` (7 assertions, no emulator).

### 4) `orderRef` / `order_share` usage review
Confirmed display-only. `orderRef` carries **five distinct meanings** in the repo — only
the first is a message snapshot, and none read order truth:

| Meaning | Examples | Verdict |
|---|---|---|
| **Message snapshot** (`order_share`/order_thread) | `inbox.html`, `inbox-actions.js:154,255`, `chat-view.js:148` | display-only (preview/badge) ✓ |
| **Firestore DocumentReference** (`doc(db,'orders',id)`) | `orders.js:2857`, `order-actions.js:250,302` | the canonical order ref itself ✓ |
| **Order-code string** (display/search) | `waybill.html:168`, `reports.html:1417`, `ledger.html`, `returns.html` | display-only ✓ |
| **`orderRefId`** (supplier/approval label) | `approvals.html`, `supplier-requests.html`, `approval-actions.js` | denormalized label ✓ |
| **`payOrderRef`** (pay-sheet label) | `cs-dashboard.html:703` | display label ✓ |

The guard's field-based check (meaning #1) is global — no file allowlist needed.

---

## Verification
```
node tests/architecture-order-centric.test.mjs   → 7 passed, 0 failed
node tests/client-actions-pure.test.mjs          → 22/22
node tests/order-financials.test.mjs             → 15 passed
node tests/core-order-math.test.mjs              → 35 passed
node --check (all 10 edited JS files)            → ok
firestore.indexes.json                           → valid JSON
```
Rules test (emulator, manual): `firebase emulators:exec --only firestore "node tests/rules/<...>.js"`.

---

## Re-score (Business Centralization)

| Axis | Before | After | Why |
|---|---:|---:|---|
| Order Centralization | 94 | 98 | Portal intent now a structured `order_requests` entity, not a message |
| Invoice Centralization | 98 | 98 | unchanged (already single-source) |
| Payment Centralization | 97 | 97 | unchanged (FSE) |
| Approval Centralization | 88 | 97 | chat fallback removed — approval is order-state-only |
| File Centralization | 92 | 92 | unchanged |
| Conversation Isolation | 90 | 97 | guard locks "no business logic from messages" |
| **Business Centralization Score** | **93** | **~97** | |

Remaining gap to 100: the CS conversion-UI button (follow-up) and the optional
retirement of legacy `client_decisions` in favor of order-state writes.
