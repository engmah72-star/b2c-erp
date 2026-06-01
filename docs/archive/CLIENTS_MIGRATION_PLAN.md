# Clients Domain Migration Plan
**Codename:** ember-spreads-to-clients
**Date:** 2026-05-22
**Branch target:** TBD (continue on `claude/optimize-system-performance-KQ1nl` or fresh branch after PR #632 merge)
**Approach:** 8 PRs incremental migration (RULE G9), follows the proven scalable-drifting-ember template.

---

## Section 1 — Context

Post-PR #632 (shipping domain), `clients.html` is the **largest god page** (4829 lines) and the next target for architectural hardening. The audit revealed it's a **three-domain hybrid** with the worst financial entanglement outside the shipping pages.

### What the audit found
| Metric | Count |
|---|---|
| Direct Firestore writes in UI | **28** (10+ functions) |
| Direct FSE event calls | **0** — financial writes go inline via `batch.set(financial_ledger)` |
| Inline financial math copies | **3** (lines 2917, 4222, 4484 — same formula 3x) |
| Inline `paymentStatus` calculations | **3** (same locations) |
| Inline `addLedgerToBatch` equivalent | **0** uses, but writes ledger raw |
| Imports from `order-actions.js` | **0** |
| `orderActions` references | **0** |
| Bulk operations | **6** (archive, reopen, stage move, assign, problem, export) |

### Three concerns colliding
1. **Client CRUD** — add/edit/delete client, phone dedup, bizCard, followups → no financial coupling, easy migration.
2. **Order creation** with deposit — `saveNewOrder` (140 lines) writes orders + wallets + transactions_v2 + financial_ledger in one batch. **Critical path.**
3. **Order grid mutations** — `cgridSaveFinancial`, `cgridSaveStatus`, `cgridSaveRowEdit`, bulk actions — entangle field edits with financial math.

---

## Section 2 — Target Architecture

### Three module split
```
clients.html (UI only, < 3000 lines target)
   ↓
clientActions.js (NEW) ─── client / bizCard / followup CRUD
   ↓
orderActions.js (EXTENDED) ─── createOrder, editPayment, bulkArchive, bulkStageMove
   ↓
financial-sync-engine.js ─── all financial events
```

### Existing primitives we'll reuse
- `orderActions.advanceStage(...)` — already covers stage transitions (PR #632)
- `orderActions.archiveOrder(...)` — already exists via `buildArchiveSpec`
- `orderActions.editShipFee(...)` — pattern for payment-field edits
- `withIdempotency(...)` — wrapper for new financial actions
- `dispatchFinancialEvent(FE.CUSTOMER_PAYMENT, ...)` — for deposit + payment edits
- `validatePayment(...)` from orders.js — central validation

### NEW primitives needed
- `clientActions.js` module (new file)
- `orderActions.createOrder({order, depositAmount, walletId, ...})` (new)
- `orderActions.editOrderPayment({orderId, newSale, newPaid, newDiscount, ...})` (new — replaces inline cgridSaveFinancial math)

---

## Section 3 — 8 PR Migration Plan

### Phase 1 — Foundation (low risk)

#### PR-1 — Create `clientActions.js` module
**Scope:**
- New file `clientActions.js` with stubs for `addClient`, `editClient`, `deleteClient`, `saveBizCard`, `saveFollowup`, `editFollowup`, `markFollowupDone`, `deleteFollowup`, `convertToActive`.
- Each wrapped with `withIdempotency` for non-CRUD ops (e.g., convertToActive). Pure CRUD ops (add/edit) don't need idempotency since they're keyed by user input.
- Internal validators: phone format, dedup by phone, required fields.
- No changes to `clients.html` yet.
**Risk:** LOW.
**Verification:** module loads, exports verified, no behavior change.

#### PR-2 — Migrate clients.html to clientActions (CRUD only)
**Scope:**
- Replace `saveClient` body (line 3111) with `clientActions.addClient` / `clientActions.editClient`.
- Replace `deleteClient` (3215) with `clientActions.deleteClient`.
- Replace `saveBizCard` (2199) with `clientActions.saveBizCard`.
- Replace 4 followup functions with `clientActions.*`.
- Replace `convertToActive` (3345) with `clientActions.convertToActive`.
- Update imports.
**Lines removed from clients.html:** ~200 (estimated).
**Risk:** LOW — non-financial paths.
**Verification:** Manual smoke: add new client, edit, delete, add followup, save bizcard.

### Phase 2 — Order Creation Migration (critical)

#### PR-3 — Extend `orderActions.createOrder` with deposit handling
**Scope:**
- New action `orderActions.createOrder({clientId, products, salePrice, discount, depositAmount, walletId, ...})`:
  - Validates payload (calls existing validators).
  - Builds order doc (uses existing `createOrderData` from orders.js).
  - If `depositAmount > 0`: calls `dispatchFinancialEvent(FE.CUSTOMER_PAYMENT, {...})` with the order context — atomic order create + wallet credit + tx + ledger.
  - Wrapped in `withIdempotency`.
- FSE handler `handleCustomerPayment` already supports `orderData` for order-creation context — verify it can create the order doc or extend it.
- `dispatchFinancialEvent` may need slight extension to accept `createOrderDoc: true` flag.
**Risk:** **CRITICAL** — money path.
**Verification:** dry-run on staging order; verify ledger entry created; verify wallet credit matches deposit; chaos runner Test 1 on `createOrder`.

#### PR-4 — Migrate `saveNewOrder` in clients.html
**Scope:**
- Replace `saveNewOrder` (line 2827, 140 lines) with `await orderActions.createOrder(...)`.
- Remove inline batch (wallet/tx/ledger).
- Remove inline `paymentStatus` math (line 2919).
- Keep UI orchestration: form collection, file uploads, modal close, toast.
**Lines removed:** ~110 (from 140 → ~30).
**Risk:** **CRITICAL** — touches money on every new order.
**Verification:** Create order with deposit → verify wallet + ledger + order all created atomically.

### Phase 3 — Grid Mutations Migration (high risk)

#### PR-5 — Extend `orderActions` for payment edits
**Scope:**
- New action `orderActions.editOrderPayment({orderId, newSalePrice, newTotalPaid, newDiscount, newCustomerShipFee, walletId, reason, ...})`:
  - Loads order.
  - Validates: locked tx check (mirrors current line 4194-4204), price not below paid, etc.
  - Computes delta between old/new paid.
  - If `delta > 0`: `dispatchFinancialEvent(FE.CUSTOMER_PAYMENT, {amount: delta, ...})`.
  - If `delta < 0`: `dispatchFinancialEvent(FE.CUSTOMER_REFUND, {amount: -delta, ...})`.
  - If `delta = 0` but other fields changed: pure `updateDoc` for the order.
  - Computes new `remaining` and `paymentStatus` via central helper.
  - Wrapped in `withIdempotency`.
**Risk:** **CRITICAL**.
**Verification:** chaos runner Test 1 on the new action; verify locked tx still blocks; verify financial-ledger entry per edit.

#### PR-6 — Migrate `cgridSaveFinancial` + `cgridSaveRowEdit`
**Scope:**
- Replace `cgridSaveFinancial` (line 4183, ~85 lines) with `orderActions.editOrderPayment`.
- Replace financial branch of `cgridSaveRowEdit` (line 4445, ~130 lines) with same.
- Remove inline `newRem` / `newPayStatus` / `newPaid` calculations.
- Replace `cgridSaveField` (line 4178) with `orderActions.editOrderField` (small new action OR direct field-edit action).
**Lines removed:** ~180 from clients.html.
**Risk:** **HIGH**.
**Verification:** edit salePrice on order → verify wallet/ledger/tx all updated atomically; edit discount → verify remaining recomputed; bulk edits don't break.

### Phase 4 — Bulk Operations Migration

#### PR-7 — `orderActions` bulk handlers
**Scope:**
- New action `orderActions.bulkArchive(orderIds[])` wrapping `buildArchiveSpec` per order in batches of 400.
- New action `orderActions.bulkStageMove(orderIds[], targetStage)`.
- New action `orderActions.bulkAssign(orderIds[], employeeId)`.
- Each returns `{ ok, processed, succeeded, failed: [{orderId, error}] }`.
- Migrate `cgridBulkAction` switch statement to call the bulk actions.
**Risk:** MEDIUM — bulk operations have larger blast radius but no new financial path.
**Verification:** Bulk archive 10 orders, verify all archived; partial-fail scenario; verify count matches.

### Phase 5 — Cleanup

#### PR-8 — Final cleanup + verification
**Scope:**
- Remove unused imports from clients.html.
- Update CLAUDE.md to add `clientActions` to stable-core list.
- Remove any remaining inline `paymentStatus` math.
- SW cache bump.
- CI architecture-guard.yml passes (zero direct writes in clients.html).
**Risk:** LOW.
**Verification:** Final audit script:
```
grep -cE "updateDoc\(|setDoc\(|writeBatch\(|addDoc\(|deleteDoc\(" clients.html  # target: 0
grep -cE "newPaid|newRem|newPayStatus|balanceBefore|balanceAfter" clients.html  # target: 0 in mutation context
```

---

## Section 4 — Risk Sequencing

```
PR-1 (foundation)  ──►  PR-2 (CRUD migrate)
                              ↓
PR-3 (createOrder)  ──►  PR-4 (saveNewOrder migrate)
                              ↓
PR-5 (editPayment)  ──►  PR-6 (grid migrate)
                              ↓
PR-7 (bulk actions) ──►  PR-8 (cleanup)
```

Each pair (odd = extend action layer, even = migrate caller) follows the proven pattern from scalable-drifting-ember. The user-facing layer (clients.html) is migrated AFTER the action layer is verified.

---

## Section 5 — Verification Per PR

| PR | Smoke Test | Code Audit |
|---|---|---|
| 1 | Module loads, exports verified | `node --check clientActions.js` |
| 2 | Add/edit/delete client + followup | `grep updateDoc.*clients clients.html` = 0 |
| 3 | createOrder on staging order with deposit | FSE ledger entry verified, wallet credit verified |
| 4 | New order from UI with deposit | clients.html `saveNewOrder` no direct firestore writes |
| 5 | Edit payment via DevTools call | Locked tx still blocks, financial-ledger entries correct |
| 6 | Edit financial via grid UI | clients.html no `newRem`/`newPayStatus` math |
| 7 | Bulk archive 10, bulk reopen 5 | Verify partial-fail handling returns `failed[]` |
| 8 | Architecture-guard CI passes | `grep` all forbidden patterns → 0 |

---

## Section 6 — Out of Scope

- Client comments / inbox integration (separate domain)
- Image viewer / file management (UI-only, no migration needed)
- Stats drawer (read-only renders)
- AI analysis integration (Cloud Function call, already centralized)
- CSV export (UI-only utility)
- Compat SDK → Modular SDK migration (separate concern — orthogonal to this plan)

---

## Section 7 — Acceptance Criteria

النجاح إذا:
1. ✅ `clients.html` صفر direct Firestore writes
2. ✅ صفر inline financial math (newPaid/newRem/newPayStatus/balanceBefore)
3. ✅ كل العمليات المالية عبر `orderActions.*` + FSE
4. ✅ `clientActions.js` module واحد لكل client/bizCard/followup CRUD
5. ✅ Architecture-guard CI passes على PR
6. ✅ clients.html line count تنخفض ~500 سطر صافي
7. ✅ كل الـ flows اليدوية passed على staging (add client, edit, deposit, payment edit, bulk archive)
8. ✅ idempotency على كل financial action (P3, P4, P5, P7)

---

## Section 8 — Estimated Effort

| Phase | PRs | Days | Risk |
|---|---|---|---|
| Phase 1 (foundation) | 2 | 1.5 | LOW |
| Phase 2 (order creation) | 2 | 3 | **CRITICAL** |
| Phase 3 (grid mutations) | 2 | 4 | **HIGH** |
| Phase 4 (bulk) | 1 | 1 | MEDIUM |
| Phase 5 (cleanup) | 1 | 0.5 | LOW |
| **Total** | **8** | **~10 days** | mixed |

Optimistic: 8 working days. Realistic: 2-3 weeks with chaos testing between phases.

---

**Prerequisite:** PR #632 (shipping migration) must be merged to main first. The `clientActions.js` module and extensions to `orderActions` build on the foundation laid by the shipping work — including `withIdempotency`, `dispatchFinancialEvent`, and the central validators in `orders.js`.

**Next concrete step:** Once PR #632 is merged → start PR-1 (create clientActions.js module).
