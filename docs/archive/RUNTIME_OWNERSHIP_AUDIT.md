# RUNTIME_OWNERSHIP_AUDIT

**Date:** 2026-05-25
**Scope:** 15 god pages + their `*-actions.js` / `*-render.js` modules
**Mode:** Read-only audit of RULE L1 / A1 / H1.1 / G6 / P1 / C2 / V1 / G3 / S1.3 violations.

---

## Executive Summary

**Total violations found: 115+** across 8 governance rules.

| Rule | Concern | Count | Worst Offender |
|---|---|---|---|
| **H1.1** | Direct Firestore writes in UI | 26 | `shipping-accounts.html` (17), `design.html` (4), `employees.html` (3) |
| **G6** | Direct writes to financial collections | 26 | Same as H1.1 (overlap) |
| **A1** | Mutations bypassing central actions | 6 | `shipping-accounts.html`, `design.html`, `employees.html` |
| **P1** | Hardcoded `role === 'admin'` checks | 8 | `approvals.html` (6), `design.html` (2) |
| **C2** | Magic stage/role strings | 61+ | `clients.html`, `accounts.html`, `design.html`, `approvals.html` |
| **S1.3** | Direct `uploadBytes(...)` in pages | 10 | `design.html` (3), `inbox.html` (3), `print.html` (2), `approvals.html` (2) |
| **G3** | Unbounded `onSnapshot` | 0 | ✅ PASS — all listeners use `limit()` |
| **L1** | Cross-domain leakage | 2 | `shipping-accounts.html` writes to wallets/orders/transactions |

**Pareto:** Two pages account for ~40% of all violations:
- `shipping-accounts.html` — 17 batch ops mixing financial + order domains
- `design.html` — 4 batch ops including direct wallet/transaction writes

---

## RULE H1.1 — Direct Firestore writes in UI (26 violations)

Forbidden APIs in HTML pages: `updateDoc(`, `setDoc(`, `addDoc(`, `deleteDoc(`, `writeBatch(`, `runTransaction(`, `dispatchFinancialEvent(`, `addLedgerToBatch(`

### `shipping-accounts.html` — 17 violations (CRIT)

| Pattern | File:Line | Replacement |
|---|---|---|
| `batch.set(transactions_v2, ...)` × 7 | 1170, 1197, 1228, 1252, 1277, 1397, 1419, 1799 | `shippingActions.processReturn()` → FSE |
| `batch.update(wallets, ...)` × 4 | 1195, 1227, 1250, 1396 | `shippingActions.*` → `dispatchFinancialEvent` |
| `batch.update(orders, ...)` × 4 | 1181, 1380, 1670, 1818 | `shippingActions.*` → `orderActions.*` |
| `addLedgerToBatch(...)` × 2 | (lines also count for G6) | FSE only |

### `design.html` — 4 violations (CRIT)

| Pattern | File:Line | Replacement |
|---|---|---|
| `batch.update(wallets)` | 627 | `orderActions.archiveOrder()` |
| `batch.set(transactions_v2)` | 629 | FSE via `orderActions` |
| `addLedgerToBatch()` | 638 | FSE only |
| `batch.delete(orders)` | 646 | `orderActions.archiveOrder()` |

### `design.html` — 3 medium violations (non-financial)

| Pattern | File:Line | Replacement |
|---|---|---|
| `addDoc(attendance)` | 718 | `attendanceActions.checkIn()` (to create) |
| `updateDoc(attendance)` | 727 | `attendanceActions.checkOut()` |
| `addDoc(gallery)` | 809 | `galleryActions.publishDesign()` |

### `employees.html` — 3 violations (HIGH)

| Pattern | File:Line | Replacement |
|---|---|---|
| `dispatchFinancialEvent(PAYROLL)` | 1637 | `employeeActions.executePayroll()` wrapper |
| `dispatchFinancialEvent(SALARY_PAYMENT)` | 1781 | `employeeActions.paySalary()` |
| `dispatchFinancialEvent(SALARY_PAYMENT_REVERSAL)` | 1797 | `employeeActions.reverseSalary()` |

> ℹ Note: `dispatchFinancialEvent` IS the central financial API, but it's being called directly from a page. RULE A1 requires wrapping in domain action that adds role gating + validation + telemetry.

---

## RULE G6 — Engine-only financial collections (26 overlapping violations)

Collections that may **only** be written via `financial-sync-engine.js`:
- `wallets`
- `transactions_v2`
- `financial_ledger`
- `employee_payments`
- `supplier_payments`
- `shipping_settlements`

| Collection | Pages writing directly | Lines (sample) |
|---|---|---|
| `wallets` | `design.html`, `shipping-accounts.html` | 627, 1195, 1227, 1250, 1396 |
| `transactions_v2` | `design.html`, `shipping-accounts.html` | 629, 1170, 1197, 1228, 1252, 1277, 1397, 1419, 1799 |
| `financial_ledger` (via `addLedgerToBatch`) | `design.html`, `shipping-accounts.html`, `employees.html` | 638, 1206, 1216, 1236, 1266, 1284, 1408, 1426, 1691, 1808 |
| `orders` (stage/status fields) | `design.html`, `shipping-accounts.html` | 646, 1181, 1380, 1670, 1818 |

**Migration:** All financial writes must flow through:
1. UI calls `domainActions.method()` (e.g. `shippingActions.processReturn`)
2. Action validates + role-gates + calls `dispatchFinancialEvent(...)` or `addLedgerToBatch(...)`
3. FSE handles atomic batch + audit trail

---

## RULE A1 — Central actions required (6 violations)

| Page | Bypass | File:Line | Should call |
|---|---|---|---|
| `design.html` | `batch.delete(orders)` | 646 | `orderActions.archiveOrder({db, orderId, ...})` |
| `shipping-accounts.html` | `batch.update(orders)` × 4 | 1181, 1380, 1670, 1818 | `shippingActions.processReturn()` |
| `employees.html` | direct `dispatchFinancialEvent(PAYROLL)` | 1637 | `employeeActions.executePayroll()` |
| `employees.html` | direct `dispatchFinancialEvent(SALARY_PAYMENT)` | 1781 | `employeeActions.paySalary()` |
| `employees.html` | direct `dispatchFinancialEvent(SALARY_PAYMENT_REVERSAL)` | 1797 | `employeeActions.reverseSalary()` |

---

## RULE P1 — Capability-based access (8 violations)

Forbidden: `currentRole === 'admin'`, `role in [...]`. Required: `canDo('capability')` / `canSee('resource')`.

| Page | Pattern | File:Line | Should use |
|---|---|---|---|
| `approvals.html` | `currentRole === 'production_agent'` | 281 | `canDo('view_supplier_requests')` |
| `approvals.html` | `const isAdm = currentRole === 'admin'` | 298 | `canDo('approve_transaction')` |
| `approvals.html` | `const isOps = currentRole === 'operation_manager'` | 299 | `canDo('confirm_transaction')` |
| `approvals.html` | `if(role === 'production_agent')` | 326 | `canDo('submit_supplier_payment')` |
| `approvals.html` | `if(role === 'customer_service')` | 329 | `canDo('request_client_refund')` |
| `approvals.html` | `currentRole === 'operation_manager'` × 2 | 1048, 1054 | `canDo('confirm_pending_transaction')` |
| `approvals.html` | `currentRole === 'admin'` × 2 | 1055, 1063 | `canDo('approve_transaction')` |
| `design.html` | `if(!['graphic_designer','design_operator'].includes(currentRole))` | 691, 702 | `canSee('design_panel')` |

---

## RULE C2 — Magic strings (61+ violations)

Forbidden: hardcoded `'shipping'`, `'design'`, `'graphic_designer'`. Required: `ORDER_STAGES.*`, `USER_ROLES.*` constants.

### Sample (representative — not exhaustive)

| Page | Magic strings | Count | Sample lines |
|---|---|---|---|
| `clients.html` | `'design'`, `'printing'`, `'shipping'`, `'archived'`, `'graphic_designer'` | 8+ | 530, 1268, 1420, 1511, 1824, 2233, 2234 |
| `accounts.html` | `'design'`, `'printing'`, `'production'`, `'shipping'`, `'archived'` | 7+ | 686, 687, 937, 1053, 1054 |
| `design.html` | `'design'`, `'graphic_designer'`, `'design_operator'` | 5+ | 691, 702, 849, 864, 922 |
| `approvals.html` | `'archived'`, `'cancelled'`, role strings | 8+ | 281, 326, 329, 956, 1176 |

**Migration:**
```js
// before
if (order.stage === 'shipping') { ... }
if (role === 'graphic_designer') { ... }

// after
import { ORDER_STAGES, USER_ROLES } from './orders.js';
if (order.stage === ORDER_STAGES.SHIPPING) { ... }
if (role === USER_ROLES.GRAPHIC_DESIGNER) { ... }
```

> Note: `core/shared-constants.js` already exports `STAGE_AR`, `STAGE_COL`, `ROLE_LABELS`. The flat enums `ORDER_STAGES` / `USER_ROLES` are exported from `orders.js`.

---

## RULE S1.3 — Storage uploads via helper (10 violations)

Forbidden in pages: direct `uploadBytes(...)` or `uploadBytesResumable(...)`. Required: `core/storage-helpers.js`.

| Page | API | File:Line |
|---|---|---|
| `design.html` | `uploadBytes` × 2 | 792, 1215 |
| `design.html` | `uploadBytesResumable` | 1403 |
| `approvals.html` | `uploadBytesResumable` × 2 | 1429, 1531 |
| `inbox.html` | `uploadBytes` × 3 | 711, 999, 1657 |
| `print.html` | `uploadBytesResumable` × 2 | 1297, 1715 |

**Migration:** All 10 sites should use `core/storage-helpers.js` (RULE S1.3). The helper already exists — just plumb in.

---

## RULE G3 — Bounded listeners ✅ PASS

All `onSnapshot(query(...))` calls inspected on 15 god pages use `limit()`. No unbounded listeners detected.

Spot checks (all passing):
- `design.html:849` — `limit(500)`
- `employees.html:811` — `limit(5000)`
- `accounts.html:606` — `limit(TX_LIMIT)`

---

## RULE L1 — Cross-domain leakage (2 violations)

| Page | Issue | Severity |
|---|---|---|
| `shipping-accounts.html` | Writes to `wallets` + `transactions_v2` + `orders` directly — mixing shipping, financial, and order domains | **CRIT** |
| `design.html` | Writes to `gallery` collection from design page | MED |

---

## Detailed violations table (selected)

| Page | RULE | Violation | File:Line | Severity | Migration |
|---|---|---|---|---|---|
| `shipping-accounts.html` | H1.1+G6 | `batch.set(transactions_v2)` × 7 | 1170, 1197, 1228, 1252, 1277, 1397, 1419 | CRIT | `shippingActions.processReturn` |
| `shipping-accounts.html` | H1.1+G6 | `batch.update(wallets)` × 4 | 1195, 1227, 1250, 1396 | CRIT | FSE only |
| `shipping-accounts.html` | H1.1+A1 | `batch.update(orders)` × 4 | 1181, 1380, 1670, 1818 | CRIT | `orderActions.*` |
| `shipping-accounts.html` | G6 | `addLedgerToBatch` × 8 | 1206, 1216, 1236, 1266, 1284, 1408, 1426, 1691 | CRIT | FSE only |
| `design.html` | H1.1+G6+A1 | `batch.delete(orders)` | 646 | CRIT | `orderActions.archiveOrder()` |
| `design.html` | H1.1+G6 | `batch.update(wallets)` | 627 | CRIT | FSE delegation |
| `design.html` | H1.1+G6 | `batch.set(transactions_v2)` | 629 | CRIT | FSE delegation |
| `design.html` | H1.1+G6 | `addLedgerToBatch` | 638 | CRIT | FSE only |
| `design.html` | H1.1 | `addDoc(attendance)` | 718 | MED | `attendanceActions.checkIn` |
| `design.html` | H1.1 | `updateDoc(attendance)` | 727 | MED | `attendanceActions.checkOut` |
| `design.html` | H1.1+L1 | `addDoc(gallery)` | 809 | MED | `galleryActions.publishDesign` |
| `design.html` | P1 | role check inline | 691, 702 | HIGH | `canSee('design_panel')` |
| `design.html` | C2 | magic strings | 849, 864 | MED | `ORDER_STAGES.DESIGN` |
| `design.html` | S1.3 | `uploadBytes` × 2 | 792, 1215 | HIGH | storage-helpers |
| `design.html` | S1.3 | `uploadBytesResumable` | 1403 | HIGH | storage-helpers |
| `employees.html` | H1.1+G6+A1 | `dispatchFinancialEvent(PAYROLL)` | 1637 | HIGH | `employeeActions.executePayroll` |
| `employees.html` | H1.1+G6+A1 | `dispatchFinancialEvent(SALARY_PAYMENT)` | 1781 | HIGH | `employeeActions.paySalary` |
| `employees.html` | H1.1+G6+A1 | `dispatchFinancialEvent(SALARY_PAYMENT_REVERSAL)` | 1797 | HIGH | `employeeActions.reverseSalary` |
| `approvals.html` | P1 | 6 inline `currentRole ===` checks | 281, 298, 299, 326, 329, 1048, 1054, 1055, 1063 | HIGH | `canDo()` |
| `approvals.html` | C2 | magic stage strings | 956, 1176 | MED | `ORDER_STAGES.*` |
| `approvals.html` | S1.3 | `uploadBytesResumable` × 2 | 1429, 1531 | HIGH | storage-helpers |
| `inbox.html` | S1.3 | `uploadBytes` × 3 | 711, 999, 1657 | HIGH | storage-helpers |
| `print.html` | S1.3 | `uploadBytesResumable` × 2 | 1297, 1715 | HIGH | storage-helpers |
| `clients.html` | C2 | magic stage/role strings | 530, 1268, 1420, 1511, 1824, 2233, 2234 | MED | `ORDER_STAGES.*` / `USER_ROLES.*` |
| `accounts.html` | C2 | magic stage strings | 686, 687, 937, 1053, 1054 | MED | `ORDER_STAGES.*` |

---

## Migration priority

### P0 — Financial integrity (do first)
1. `shipping-accounts.html` returns flow → consolidate into `shippingActions.processReturn()` + `processSettlement()`. 17 batch ops collapse into 2-3 actions.
2. `design.html` order archival → use `orderActions.archiveOrder()`. 4 ops → 1 call.
3. `employees.html` payroll/salary → wrap in `employeeActions.*` with role gating.

### P1 — Permission system (do second)
4. `approvals.html` 8 inline role checks → `canDo()` capability-based.
5. `design.html` 2 inline role checks → `canSee('design_panel')`.

### P2 — Storage layer (do third)
6. 10 direct `uploadBytes` calls → route through `core/storage-helpers.js`.

### P3 — Hygiene (do later, can be incremental)
7. 61+ magic strings → bulk `find-replace` after constants are imported.
8. `design.html` non-financial writes (attendance, gallery) → new action modules.

---

## CI enforcement (already partially active)

`.github/workflows/architecture-guard.yml` blocks NEW H1.1 violations in PRs. Existing violations are grandfathered. Migrations should remove pages from allowlist as they're cleaned.

---

## Cross-references
- `SIDEBAR_GOVERNANCE_AUDIT.md` — many of these pages also have nav violations
- `CLEANUP_PLAN.md` — phased execution roadmap
