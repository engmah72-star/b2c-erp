# Chaos Test Code-Trace Audit — PR #632
**Date:** 2026-05-22
**Branch:** `claude/optimize-system-performance-KQ1nl`
**Scope:** Trace each of the 8 chaos tests through the actual code path and predict pass/fail BEFORE manual testing.

---

## Summary Table

| Test | Prediction | Severity if fails | Confidence |
|---|---|---|---|
| 1 — Double-click settle | ✅ PASS (within same tab) | — | High |
| 2 — Parallel tabs | ⚠️ **POTENTIAL FAIL** | crit | High — verified bug |
| 3 — Refresh during collect | ⚠️ PARTIAL — integrity ok, UX stuck | warn | Medium |
| 4 — Retry after timeout | ⚠️ PARTIAL — depends on commit boundary | warn | Medium |
| 5 — Reverse after return | ❌ **FAIL** — double-deduction bug | crit | High — verified bug |
| 6 — Partial return twice | ✅ PASS — validator catches | — | High |
| 7 — Network disconnect | ⚠️ DEPENDS — batch atomic but flag drift | warn | Medium |
| 8 — Projection rebuild | ✅ PASS | — | High |

**2 confirmed bugs that need fixing before merge.** Both documented below with fixes proposed.

---

## Test 1 — Double-click Settlement (within same tab)

**Code path:**
```
shipping.html confirmSettle()
  → btn.disabled = true; btn.textContent = '⏳ جارٍ...'  // line ~2334
  → await orderActions.settleFromCompany(args)
    → withIdempotency(db, { actionType:'settle_from_company',
                            entityId: orderIds.sort().join(','),
                            actorId: userId,
                            payload: {walletId, amount, prepaid} }, fn)
      → mintOperationId(...) — deterministic hash within 60s window
      → getDoc(opRef) — first time: doesn't exist
      → setDoc(opRef, {status:'pending'})
      → fn() executes mutation
      → updateDoc(opRef, {status:'completed', result})
```

**Trace for double-click:**
- Click 1 fires `confirmSettle()` → button disabled instantly (synchronous DOM update)
- Click 2 (in 50-200ms): button is disabled, the click event still fires but `confirmSettle()` is in-flight — but the `pendingOrder` is the same, the form state hasn't changed, the second `confirmSettle()` would queue the same operation

**Prediction:** ✅ PASS — the disabled button + minute-bucket idempotency double-protects. Even if both calls fire:
- First: `setDoc(opRef, pending)` succeeds → executes → marks completed
- Second: `getDoc` returns completed → returns cached `idempotent:true`

**Risk:** very low. Sequential calls within a tab are well-ordered.

---

## Test 2 — Parallel Tabs Settlement ⚠️ **VERIFIED BUG**

**Code path** (same as Test 1, two tabs).

**Trace for parallel call:**
```
Tab A: getDoc(opRef) → null
Tab B: getDoc(opRef) → null   ← race window opens
Tab A: setDoc(opRef, pending)
Tab B: setDoc(opRef, pending) ← OVERWRITES Tab A's pending (no rejection)
Tab A: executes mutation
Tab B: executes mutation      ← DUPLICATE MUTATION
```

**Root cause:** `setDoc(opRef, data)` (or `setDoc(opRef, data, {merge:false})`) does NOT throw if the doc exists — it OVERWRITES. There's no "create-only" primitive in Firestore Web SDK except via transactions.

**Code reference:** `core/idempotency.js:160-180` — the `try { await setDoc(...) } catch { ... race ... }` block assumes setDoc throws on duplicate. It doesn't.

**Prediction:** ❌ FAIL — parallel tabs would both execute. Double payment.

**Fix required:** Replace the check-then-set pattern with a `runTransaction(db, async tx => { const snap = await tx.get(opRef); if (snap.exists()) throw new Error('EXISTS:'+JSON.stringify(snap.data())); tx.set(opRef, pendingDoc); })`. Transactions guarantee atomic read+write.

---

## Test 3 — Refresh During Collect

**Code path:**
```
shipping.html confirmCollect()
  → orderActions.collectFromCustomer
    → withIdempotency: setDoc(opRef, pending) ✓
    → dispatchFinancialEvent(CUSTOMER_PAYMENT) — calls writeBatch.commit()
    [USER REFRESHES HERE]
    → updateDoc(opRef, completed)  // never runs
    [follow-up batch for shipStage] // never runs
```

**Three scenarios:**
| When refresh hits | Result |
|---|---|
| BEFORE `batch.commit()` | financial_operations stuck `pending`. No money moved. User retries → blocked by pending until minute-bucket flips (≤60s). |
| DURING `batch.commit()` | Firestore commits atomically server-side. Client never sees confirmation. `financial_operations` stuck `pending`. Wallet credited but order's totalPaid update is also in the same commit (atomic), so order IS updated. |
| AFTER commit, BEFORE updateDoc to 'completed' | Money credited, order updated. `financial_operations.status='pending'` forever. |

**Prediction:** ⚠️ PARTIAL — **financial integrity is preserved** (Firestore writeBatch is all-or-nothing). But:
- Stuck-pending state degrades UX
- The follow-up shipStage update (line 633 `followBatch.commit()` after the FSE call) is a SEPARATE batch — if user refreshes between the two, order.totalPaid is updated but order.shipStage is not. Self-heal would detect this.

**Severity:** warn. Not financial corruption, but order state drift requiring `detectOrderIssues` to clean up.

---

## Test 4 — Retry After Timeout

**Code path:**
```
User clicks settle, slow 3G, request times out (browser default ~30s)
→ withIdempotency: setDoc(opRef, pending) might have succeeded server-side
→ fn() might have committed server-side
→ Error thrown to client
→ Catch block: updateDoc(opRef, failed) — might or might not succeed
→ User clicks retry
→ Same minute → same operationId
→ getDoc(opRef) → status = ???
```

| Server state | Client state | Behavior |
|---|---|---|
| pending (setDoc succeeded, no further progress) | error | Retry sees 'pending' → REJECTED (until minute flips) |
| failed (catch ran) | error | Retry allowed → re-executes mutation. If mutation succeeded server-side originally, DOUBLE-COMMIT. |
| completed (full success but client lost connection) | error | Retry sees 'completed' → returns cached. Safe. |

**Prediction:** ⚠️ FAIL in the "failed but mutation actually succeeded" case. The idempotency layer trusts the failed status but the server may have actually committed.

**Mitigation:** the FSE batch.commit() is atomic. If it succeeded server-side, the order's totalPaid is updated. A re-execute attempt would build a new batch with the SAME data (since the action loads fresh state for some cases) — would result in double payment.

**Fix idea:** Before re-executing on retry-after-failed, the action should re-verify the underlying state (e.g., for collectFromCustomer, check if a transaction with this operationId already exists in transactions_v2). Not currently implemented.

---

## Test 5 — Reverse After Return ⚠️ **VERIFIED BUG**

**Code path:**
```
1. collect → totalPaid increases
2. settle → shipSettled=true, shipping_settlements/{S} created
3. full return → markFullReturn step 3 reverses the settlement INLINE
   - decrements wallet (line 1001)
   - creates settlement_reversal tx (line 1003)
   - adds SHIPPING_SETTLEMENT_REVERSAL ledger (line 1016)
   - sets order.shipSettled = false, shipSettledAmount = 0
   - DOES NOT mark shipping_settlements/{S}.reversed = true  ← BUG
4. User clicks "Reverse Settlement" on the shipping-accounts page
   - shipping-accounts.html still shows the settlement (because reversed!=true)
   - User clicks delete
   - orderActions.reverseSettlement loads shipping_settlements/{S}
   - Check: if (s.reversed === true) return; → false, proceeds
   - dispatchFinancialEvent(SHIPPING_SETTLEMENT_REVERSAL):
     - decrements wallet AGAIN (line 640 of FSE)
     - creates another settlement_reversal tx
     - marks shipping_settlements/{S}.reversed = true (now)
     - decrements order.totalPaid AGAIN
```

**Result:** Wallet decremented twice, order.totalPaid potentially negative, ledger has TWO REVERSAL entries for one settlement.

**Code reference:**
- `order-actions.js:997-1018` — markFullReturn step 3 (creates ledger reversal but doesn't mark settlement doc)
- `financial-sync-engine.js:659-674` — handleShippingSettlementReversal (marks reversed:true only when called via this path)

**Prediction:** ❌ FAIL — confirmed double-deduction bug.

**Fix required:** In `markFullReturn` step 3, query for the active settlement(s) for this order and mark them `reversed: true` within the same atomic batch. Similar to the deposit/collection pre-fetch already in place.

---

## Test 6 — Partial Return Twice

**Code path:**
```
1. partial return on items [1, 2] with qty 3 each
2. validatePartialReturn:
   - Loops returnedItems, checks idx in range, qty > 0, qty <= origQty
3. markPartialReturn step 2: reduces products[idx].qty (or removes if zero)
4. User submits same returnedItems again:
   - validatePartialReturn:
     - For items with reduced qty: qty (3) > new origQty (0 or less)
     - → ⚠️ pushes error: "كمية المرتجع أكبر من الكمية الأصلية"
5. Action rejects before any mutation
```

**Prediction:** ✅ PASS for repeat with same qty. Validator catches.

**Edge case:** what if user picks DIFFERENT items than first time, but they're already returned? products[] mutations may have removed them, leading to `idx >= products.length` → "فهرس منتج غير صالح".

**Invariant I13** (PARTIAL_RETURN_NEGATIVE_QTY) catches if qty would underflow. ✅

---

## Test 7 — Network Disconnect Mid-Action

Similar to Test 4. Firestore `writeBatch.commit()` is server-side atomic. If the network drops:
- BEFORE commit reaches server → no write, action throws
- DURING commit (in-flight) → server may apply or not, client sees timeout. Standard Firestore behavior is to retry with idempotency token (Firestore handles this internally for the batch).
- AFTER commit (response lost) → action throws, but data is persisted.

**Prediction:** ⚠️ PARTIAL — order data is consistent (atomic batch). idempotency layer marks 'failed' even if write succeeded. Retry would re-execute (subject to Test 4 issue).

---

## Test 8 — Projection Rebuild Integrity

**Code path:**
```
rebuildFinancialProjection(db, orderId)
  → query financial_ledger where orderId == X
  → sum by eventType:
     CUSTOMER_PAYMENT      → derivedPaid += amount
     CUSTOMER_REFUND       → derivedPaid -= amount; totalRefund += amount
     SHIPPING_SETTLEMENT   → derivedPaid += amount; totalSettled += amount
     SHIPPING_SETTLEMENT_REVERSAL → derivedPaid -= amount
     RETURN_LOSS           → totalReturnLoss += amount
     GENERAL_EXPENSE       → netGeneralExpense ±= amount
```

For a clean flow (collect → settle → reverse → return), all event types are present, and the math should balance:
- Collect: +CUSTOMER_PAYMENT
- Settle: +SHIPPING_SETTLEMENT
- Reverse: -SHIPPING_SETTLEMENT_REVERSAL
- Return: -CUSTOMER_REFUND (deposit + each collection reversal)

derived = paid - settled + settled - reversal - all-refunds ≈ 0 (if total return)
stored: order.totalPaid = 0 (set by markFullReturn step 2)

**Prediction:** ✅ PASS for clean flows. **But:** if Test 5 bug triggers a duplicate reversal, derived would be -amount (negative). `compareProjectionVsLedger` would flag this as drift. Good — chaos test actually catches the Test 5 bug.

---

## Critical Bugs Identified

### BUG #2: Idempotency TOCTOU race
- **File:** `core/idempotency.js:115-180`
- **Impact:** Parallel calls from different tabs could both execute the mutation. Direct corruption.
- **Severity:** CRITICAL
- **Fix:** Replace check-then-setDoc with `runTransaction(db, tx => tx.get → if exists abort, else tx.set)`. Atomic.

### BUG #5: markFullReturn doesn't mark shipping_settlements.reversed
- **File:** `order-actions.js:997-1018`
- **Impact:** Subsequent reverseSettlement call double-deducts wallet and order.totalPaid.
- **Severity:** CRITICAL
- **Fix:** Pre-fetch active settlements for orderId, mark them `reversed:true` in the same markFullReturn batch.

### MINOR: Stuck pending operations
- **File:** `core/idempotency.js`
- **Impact:** After refresh/network drop mid-action, financial_operations may stay 'pending' for up to 60s. UX issue.
- **Mitigation:** Document for admin cleanup; future PR could add TTL-based cleanup or detect on retry.

---

## Recommended Action

Before any merge to main:
1. **Fix Bug #2** — replace setDoc with runTransaction in `withIdempotency`. ~15 lines change.
2. **Fix Bug #5** — extend markFullReturn to mark settlements reversed atomically. ~20 lines change.
3. **Run chaos runner page** (tests/chaos-runner.html) on staging to verify the 4 automatable tests (1, 2, 5, 6, 8).
4. **Manual tests** for 3, 4, 7 (require actual refresh/network manipulation).

Without these two fixes, the system is NOT safe to merge for production financial workflows.
