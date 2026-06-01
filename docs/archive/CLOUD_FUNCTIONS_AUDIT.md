# ☁️ CLOUD FUNCTIONS AUDIT

> **Date:** 2026-05-24
> **Scope:** `functions/index.js` (3371 lines) + `functions/genkit-flows.js` (248 lines)
> **Goal:** Same governance lens that produced UI_DEBT.md / DEAD_CODE_AUDIT.md — find centralization gaps, validation gaps, dead code, and risk hotspots in the server-side Cloud Functions.
> **Methodology:** static analysis via grep + targeted reads. No runtime profiling.

---

## 1) Executive snapshot

| Metric | Value | Notes |
|--------|------:|---|
| Exports (callables + triggers) | **45** | All in `functions/index.js` |
| File size | 3371 lines | At RULE G5 threshold (warn ≥ 1500, freeze ≥ 2500) — but server code, different rules |
| `console.*` calls | 79 | Should ideally route through structured logging |
| `try/catch` blocks | 47 | Decent coverage, some still missing |
| Hardcoded role/email checks | **17** | Duplicated `['admin', 'operation_manager']` pattern — same C2 violation as client code had |
| FSE/dispatchFinancialEvent usage | **1** | CF mostly READ from financial collections; minimal direct writes |
| Direct writes to wallets/transactions_v2 | **0** | ✅ CF doesn't shadow the engine |
| TODOs/FIXMEs | **0** | Clean |

**Verdict:** Functionally healthy. Main debt is **centralization** (hardcoded role checks) and **file-size hygiene** (3371 lines = decomposition candidate, though not as urgent as client-side god pages were).

---

## 2) Exports overview

### Callables (`onCall`) — 11
| Export | Purpose | Auth gate |
|--------|---------|---|
| `sendWhatsAppTest` | Test WhatsApp integration | admin/ops |
| `adminResetEmployeePassword` | Force-reset Firebase Auth password | admin/ops |
| `adminSetEmployeePassword` | Set displayPassword | admin/ops |
| `impersonateUser` | Custom token impersonation | admin only |
| `registerFcmToken` / `unregisterFcmToken` | FCM token mgmt | any auth |
| `analyzeClientWithAI` | AI client insights | admin/ops |
| `analyzeSuggestionWithAI` | AI suggestion analysis | admin/ops |
| (~3 more in 2700-3300 range) | Various | per-export |

### Triggers — ~25
| Trigger type | Count | Examples |
|---|--:|---|
| `onDocumentCreated` | ~10 | `onOrderCreated`, `onPaymentLogged`, `onCriticalFinancialEntry`, `detectEngineBypass` |
| `onDocumentUpdated` | ~6 | `onOrderStageChanged`, `onOrderAssigned`, `onOrderStagePushedToClient` |
| `onSchedule` | ~6 | `dailyFollowupReminders`, `autoArchiveOldPaidOrders`, `scheduledFirestoreBackup`, `weeklyChurnRfmAnalysis`, `dailyFinancialAnomalyScan`, `weeklyRevenueForecast`, `weeklyProductRecommendations` |
| Auth triggers | ~1 | `syncUserAuthClaims` |

### Most-touched collections (writes)
| Collection | CF writes |
|---|--:|
| `orders` | 13 |
| `users` | 8 |
| `admin_alerts` | 6 |
| `whatsapp_logs` | 4 |
| `notifications` | 3 |
| `financial_ledger` | 3 (all reads — no inserts) |
| `transactions_v2` | 2 (reads only) |
| `design_items` | 3 |
| `returns_tickets` | 2 |

CF **does not directly write** to `wallets` or `employee_payments` or `supplier_payments` (compliant with RULE F1.5 spirit even though admin SDK could).

---

## 3) Centralization debt (RULE C2)

### Hardcoded role lists — 17 occurrences
The pattern `['admin', 'operation_manager']` appears 13+ times in `functions/index.js`. Plus `'admin'` alone (strict admin) in 4 places. This is the same RULE C2 violation that was fixed in client code via `core/permissions-matrix.js`.

**Recommended:** Add a small helper at the top of `functions/index.js`:
```js
const ROLES = Object.freeze({
  ADMIN: 'admin',
  OPS_MGR: 'operation_manager',
  CS: 'customer_service',
  // ...
});
const ADMIN_OR_OPS = [ROLES.ADMIN, ROLES.OPS_MGR];
function isAdminOrOps(role) { return ADMIN_OR_OPS.includes(role); }
function isStrictAdmin(role) { return role === ROLES.ADMIN; }
```
Then sweep all 17 occurrences. Same pattern, zero behavior change.

### Other duplications
- `getRoleTokens(['admin', 'operation_manager'])` appears 3 times — could be `getAdminAndOpsTokens()`
- `db.collection('users').where('role', 'in', [...])` appears 2 times — could be `usersByRoles(...)`

---

## 4) Validation / error-handling debt

### `console.*` (79 calls)
Mostly debug/info logging. Cloud Logging captures them but they could be more structured. Low priority unless observability becomes a focus.

### `try/catch` coverage
47 try/catch blocks across 45 exports. Spot-check shows the critical paths (financial, password, impersonate) are well-guarded. Schedule jobs have outer try/catch + per-batch retry. **No urgent action.**

### Missing: idempotency keys on scheduled jobs
Some `onSchedule` jobs do bulk writes (`autoArchiveOldPaidOrders`, `weeklyChurnRfmAnalysis`). If a run fails mid-batch and Firebase retries, partial work could repeat. The client-side `core/idempotency.js` pattern isn't applied here. **Deferred** — Firebase scheduler typically doesn't retry, but this is a latent risk if the trigger config ever changes.

---

## 5) Performance observations

### Bounded queries
| Sample queries | Has `limit()` |
|---|---|
| `autoArchiveOldPaidOrders` reads orders | ✅ `limit(ARCHIVE_BATCH_LIMIT=100)` |
| `weeklyChurnRfmAnalysis` reads orders | ✅ `limit(RFM_MAX_ORDERS=50000)` |
| `dailyFinancialAnomalyScan` reads financial_ledger | needs spot-check |
| `weeklyRevenueForecast` reads transactions_v2 | needs spot-check |

Sample of these looks OK — explicit constants like `ARCHIVE_BATCH_LIMIT` show G3 awareness.

### Hot-path observation
`onOrderStageChanged` (line 226) fires on every order update. Each firing reads neighboring docs (orders + users for notifications). With 1500 orders × multiple updates/day, this is a high-frequency function. **Should be profiled at scale**, deferred to runtime profiling sprint.

---

## 6) Dead code candidates

### ~~Suspect: `genkit-flows.js`~~ — **CORRECTION (after PR-5B sweep):**
On closer inspection, `genkit-flows.js` IS used: `functions/index.js:1731` does
`const { analyzeClient, analyzeSuggestion } = require('./genkit-flows');`
and these are wired into `exports.analyzeClientWithAI` and
`exports.analyzeSuggestionWithAI` Cloud Function callables.

**NOT a dead-code candidate.** Original audit grep missed the require() because
it searched for `genkit-flows` as a literal but `require()` resolves the bare
path. Keep `genkit-flows.js` + its `genkit`/`@genkit-ai/*` package.json deps.

### Suspect: tenant-related code (e.g., `tenants` collection write)
`functions/index.js` line ~1614 writes to `'tenants'` collection. But multi-tenant rollout was paused (per DEAD_CODE_AUDIT findings). **Verify** this CF code path isn't wired to a deprecated trigger.

---

## 7) Phase-5 sub-PR plan

| PR | Scope | Status |
|---|---|---|
| **5A** | Audit doc | ✅ merged (#791) |
| **5B** | Add role constants + 19 hardcoded role checks → helpers (C2 fix) | ✅ merged (#793) |
| ~~5C~~ | ~~Archive `genkit-flows.js`~~ | ❌ cancelled — file is in use (see §6) |
| **5D** | (deferred) Apply `core/idempotency.js`-style guards to scheduled bulk jobs | not started — medium-risk, needs careful design |

Phase-5 wraps with 2 PRs merged. The biggest concrete win was PR-5B: 19 small mechanical role-check swaps, zero behavior change, makes future role changes a 1-line edit.

---

## 8) Out of scope for Phase-5

- **Runtime profiling** of hot-path triggers (`onOrderStageChanged`, `onPaymentLogged`) — needs Cloud Logging metrics + cost analysis sprint
- **Structured logging** — would require pulling in a logging lib + retrofitting 79 console calls
- **Decomposition** of `functions/index.js` (3371 lines) — server file is less critical than client god pages; could wait
- **Cloud Functions tests** — Firebase emulator setup + test infrastructure is a separate sprint
- **Multi-tenant rollout** — needs business decision (CF code is ready but unused)
