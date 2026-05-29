# 🛎️ CLIENT PORTAL — Phase 1 Foundation Architecture

> **Status:** Foundation spec + module definition (RULE 7 / G10). Subordinate to `CLAUDE.md`.
> **Realized under RULE E1:** additive, feature-flagged (`clientPortal.v2`, default `false`),
> alongside the existing phone+order-code portal — *no rewrite, reversible by one PR revert*.
> **Scope guard (BUSINESS DNA):** serves exactly **one** of the 4 parties — **the Client**.
> No marketplace, no 3rd parties. The portal is a **view + intake surface** over the same
> ERP engine; it owns **no** workflow logic, **no** money, **no** stage authority (PC1, C1, A1).

---

## 0) Design Principles (how this satisfies the governance charter)

| Principle | How the Client Portal honors it |
|---|---|
| **Separated from Employee Portal** (PC3.1) | Distinct entry (`client-login.html` → `client-portal.html`), distinct auth (`client_users`), distinct capability registry. Clients **never** receive one of the 8 internal roles. |
| **Same ERP DB + workflow engine** | Reuses `orders`, `clients`, `design_items`, `client_decisions`, `returns_tickets`, and the central actions in `order-actions.js` / `orders.js`. No parallel workflow. |
| **Single Source of Truth** (RULE 1, W1.1, C1.2) | `order.stage` stays the only state. Client-facing statuses are a **pure projection** (`clientFacingStatus()`), never a stored 2nd state. |
| **System owns the rules** (PC1) | Client *executes* actions (create order, approve, request revision) through central actions/validators. Client cannot change a stage, a price, or a policy. |
| **Full audit** (RULE 5, H3) | Every client action → `auditEntry({kind:'op', userId:'client:<uid>'})` into `order.timeline` (order-bound) or `client_activity_log` (account-bound). |
| **Role-based access** (RULE 8, R1, P1) | A separate **client capability set** enforced in `firestore.rules` via `client_users/{uid}` ownership. Internal sensitive fields (`priceCost`, `supplierCost`, internal notes, designer identities) are **never** exposed to clients. |
| **Mobile-first, theme-ready** (U1, ARCHITECTURE.md L4–L8) | Reuses `shared.css` tokens + components; client pages are L5/L6 only — a rebrand never touches the engine. |
| **Future-proof** (E1, G9) | Expansion points (catalog, directory, referral, marketplace, mobile, AI) are explicit seams, all additive. |

---

## 1) Information Architecture

```
Client Portal (separate entry — PC3.1)
│
├── Public / Pre-auth
│   ├── Landing / Login            client-login.html        (existing — phone+code; extended)
│   ├── Register                   client-register.html     (Phase 1 — new, flagged)
│   ├── Forgot / Reset password    client-reset.html        (Phase 1 — new, flagged)
│   └── Privacy / Terms            privacy.html             (existing)
│
└── Authenticated (client_users/{uid})
    ├── Dashboard                  client-portal.html#dashboard   (Module 3)
    ├── Company Profile            client-portal.html#profile     (Module 2)
    ├── Orders
    │   ├── Orders list            #orders
    │   ├── Create order           #orders/new                    (Module 4)
    │   └── Order detail           #orders/:orderId               (Module 4)
    ├── Design Approval Center     #approvals  / #orders/:id/design (Module 5)
    ├── Notifications              #notifications                 (Module 6)
    └── Activity / Account log     #activity                      (Module 7)
```

> **One entry per actor** (PC3.1). The portal is a single SPA-style shell (`client-portal.html`)
> with hash-routed views **scoped to the portal only** — this does NOT conflict with N1.3
> (which reserves `#ctx=` for the *employee* runtime shell; the client portal is a separate app).

---

## 2) Database Entities & Relationships

### 2.1 Reused (existing — unchanged schema, RULE 6)

| Collection | Role in portal | SSOT for |
|---|---|---|
| `clients` | **Company profile** (Module 2). 1 client doc = 1 company. | Company identity, contacts, sector, governorate |
| `orders` | Order list/detail/tracking (Module 4). `order.stage` = state. | Order state, products, payment, shipping |
| `design_items` | Design previews + versions (Module 5). `versions[]` append-only. | Design artifacts shown to client |
| `client_decisions` | Approve / request-revision events (Module 5). | Client design decisions (append-only) |
| `returns_tickets` | Return requests (already wired to client portal). | Returns lifecycle |

### 2.2 New (Phase 1 — additive)

**`client_users/{authUid}`** — the auth ↔ company link (identity, NOT profile)
```js
{
  authUid:        string,        // Firebase Auth uid (doc id)
  clientId:       string,        // FK → clients/{clientId}  (the company)
  email:          string,        // lowercased
  phone:          string,        // normalized EG format
  loginMethods:   ['email','phone'],
  status:         'pending' | 'active' | 'disabled',   // X1.2 account lifecycle
  emailVerified:  boolean,
  phoneVerified:  boolean,
  termsAcceptedAt: timestamp,
  termsVersion:   string,
  capabilities:   { [cap]: boolean },   // overrides on top of DEFAULT_CLIENT_CAPABILITIES
  notifPrefs:     { inApp:true, email:true, whatsapp:false },
  commPrefs:      { language:'ar', channel:'whatsapp' },
  tenantId:       string,        // G7
  lastLoginAt:    timestamp,
  createdAt, updatedAt: timestamp,
  isDeleted:      false,
}
```
> **Why a separate doc, not a field on `clients`?** Keeps RULE 8 boundaries clean: `clients`
> is read by staff; credentials/auth-state live in `client_users` guarded so a client reads
> **only** their own. One company (`clients` doc) MAY have multiple `client_users` later
> (multi-seat) — Phase 1 enforces 1:1 but the schema is ready.

**`client_notifications/{id}`** — Module 6
```js
{
  clientId, authUid,
  type:    'design_uploaded'|'approval_required'|'revision_done'|'invoice_issued'|'shipping_update',
  orderId: string|null,
  title, body:        string,    // pre-rendered, client-safe (no internal data)
  channels: ['inApp','email','whatsapp'],
  deliveredVia: { inApp:true, email:false, whatsapp:false },
  read:    boolean,
  createdAt: timestamp,
  tenantId,
}
```

**`client_activity_log/{id}`** — Module 7 (account-bound actions; order-bound stay in `order.timeline`)
```js
{
  authUid, clientId,
  action:  'register'|'login'|'logout'|'profile_update'|'order_create'|'file_upload'
           |'design_approve'|'revision_request'|'password_reset',
  orderId: string|null,
  meta:    object,               // before/after for edits, ids, etc.
  ip, userAgent: string,
  ...auditEntry fields (date, by, byId, kind:'op'),   // H3 contract
  tenantId,
}
```

### 2.3 Relationships (ERD)

```
                         ┌──────────────┐
   Firebase Auth user ──▶│ client_users │ (authUid PK)
                         └──────┬───────┘
                                │ clientId (FK)
                                ▼
                         ┌──────────────┐         ┌─────────────────┐
                         │   clients    │◀────────│ client_activity │
                         │  (company)   │ clientId │     _log        │
                         └──────┬───────┘         └─────────────────┘
                 clientId (FK)  │
            ┌───────────────────┼────────────────────┐
            ▼                   ▼                     ▼
      ┌──────────┐       ┌──────────────┐      ┌────────────────────┐
      │  orders  │       │ design_items │      │ client_notifications│
      └────┬─────┘       └──────┬───────┘      └────────────────────┘
           │ orderDocId         │ itemId
           ▼                    ▼
   ┌───────────────┐    ┌──────────────────┐
   │ returns_tickets│    │ client_decisions │  (append-only)
   └───────────────┘    └──────────────────┘
```

---

## 3) Page Hierarchy

| Page | File | Auth | Module | Status |
|---|---|---|---|---|
| Login | `client-login.html` | public | 1 | exists → extend with email/password |
| Register | `client-register.html` | public | 1 | **Phase 1 (flagged)** |
| Password reset | `client-reset.html` | public | 1 | **Phase 1 (flagged)** |
| Portal shell | `client-portal.html` | client | 2–7 | exists → extend to multi-view shell |
| → Dashboard view | (hash `#dashboard`) | client | 3 | new view |
| → Company profile | `#profile` | client | 2 | new view |
| → Orders list/detail/new | `#orders*` | client | 4 | new views |
| → Design approval | `#approvals` | client | 5 | exists (tab) → formalize |
| → Notifications | `#notifications` | client | 6 | new view |
| → Activity | `#activity` | client | 7 | new view |

> All new views are **hash-routed inside `client-portal.html`** (single shell) and gated behind
> `clientPortal.v2`. The legacy single-order approval tab keeps working when the flag is off (E1.4).

---

## 4) Navigation Structure

```
client-portal.html  (mobile-first; bottom tab bar on mobile, side rail on desktop)
 ├─ 🏠 الرئيسية        → #dashboard
 ├─ 📦 طلباتي           → #orders        (+ FAB "＋ طلب جديد" → #orders/new)
 ├─ 🎨 الاعتمادات       → #approvals     (badge = count awaiting approval)
 ├─ 🔔 الإشعارات        → #notifications (badge = unread)
 └─ 🏢 الشركة           → #profile  (sub: settings, activity, logout)
```
- Navigation is **view-switching within one shell** (no full reloads) — mirrors the employee
  shell philosophy but in a separate app. Deep links: `client-portal.html#orders/<id>`.
- Signals/badges are **observers** over the client's own data (E1.6) — counts of
  awaiting-approval orders and unread notifications.

---

## 5) Component Inventory

> All built on `shared.css` tokens/components (U1) — **zero new color/spacing primitives**.
> Client-specific components live in (new) `features/client-portal/components/` (L5).

| Component | Reuses | New behavior |
|---|---|---|
| `cp-app-shell` | `.app-shell`, embed-mode tokens | client nav rail + bottom bar |
| `cp-stat-card` | `.card` | dashboard KPI tiles |
| `cp-order-card` | `.card`, `.bdg`/`.status-chip` | client-facing status chip (projection) |
| `cp-status-chip` | `.status-*` tokens | maps 8 client statuses → existing status colors |
| `cp-timeline` | `.tbl`/list | read-only order timeline (client-safe entries) |
| `cp-design-viewer` | existing image viewer | version switcher (v1/v2/v3), zoom |
| `cp-approve-bar` | `.btn-y`/`.btn` | Approve / Request-revision actions |
| `cp-upload` | `core/storage-helpers.js` | order-file upload (S1 paths) |
| `cp-notif-item` | `.card` | in-app notification row |
| `cp-form` (`.inp`, `.fg`) | `shared.css` inputs | profile + create-order forms |

---

## 6) User Flows

**Registration (Module 1)**
```
Register form → accept terms → create Firebase Auth user (email/phone+password)
  → OTP verify (email link / SMS code via Cloud Function)
  → match-or-create clients doc (dedupe by phone1/email — reuse clientActions logic)
  → create client_users/{uid} {status:'pending'→'active' on verify}
  → client_activity_log: 'register'  →  redirect to #dashboard
```

**Login**
```
email|phone + password (+ remember-me)
  → Firebase Auth signIn → load client_users/{uid} (status must be 'active')
  → client_activity_log: 'login' → #dashboard
```

**Create Order (Module 4)**
```
#orders/new → select service/product → upload files (storage-helpers, kind:'client-intake')
  → notes → submit
  → orderActions.createOrder({ source:'client_portal', intakeStatus:'new',
        stage:'design', designStage:'pending', clientId, clientName, clientPhone })
  → order.timeline += auditEntry('order created via client portal', userId:'client:<uid>')
  → notify CS (client_notifications + inbox signal)
```

**Design Approval (Module 5)**
```
Notification 'approval_required' → #orders/:id/design → view version N + designer notes
  ├─ Approve   → write client_decisions{decision:'approved', version:N}
  │              → order.timeline audit → staff/automation advances designStage→approved
  └─ Revise    → write client_decisions{decision:'revision', comment, attachments[]}
                 → order.timeline audit → returns design to design team (designStage→wip)
Versions are append-only (no deletion) — design_items.versions[] preserves v1..vN.
```

**Return request** — already wired (`returns_tickets`, `requestedBy:'client_portal'`); kept as-is.

---

## 7) API Contracts

> **Clients never write `orders`/`wallets`/`financial_ledger` directly** (A1, H1.1, X1.13).
> They call central actions (server-validated) or write to **client-owned** collections whose
> `firestore.rules` enforce ownership. Phase-1 client write surface is intentionally tiny.

### 7.1 Reused central actions (no change)
| Action | Source | Client use |
|---|---|---|
| `orderActions.createOrder(args)` | `order-actions.js` | create order from portal (`source:'client_portal'`) |
| `orderActions.recordPayment(...)` | `order-actions.js` | (Phase 2) client online payment |
| `dispatchFinancialEvent(...)` | `financial-sync-engine.js` | engine-only; never from client UI |

### 7.2 New client-scoped actions (Phase 1 — `features/client-portal/client-portal-actions.js`)
All return the uniform contract `{ ok, errors[], warnings[], ... }` (H1.5) and write audit (H3):

| Action | Writes | Rules guard |
|---|---|---|
| `registerClient({email,phone,password,terms})` | Auth + `clients`(dedupe) + `client_users` | open create, server OTP gate |
| `submitDesignDecision({orderId,itemId,decision,comment,files})` | `client_decisions` + `order.timeline` | `clientOwnsOrder()` |
| `updateCompanyProfile({clientId,changes})` | `clients` (whitelisted fields only) | `clientOwnsClient()` |
| `updateClientPrefs({notifPrefs,commPrefs})` | `client_users/{uid}` | `isSelf(uid)` |
| `markNotificationRead({id})` | `client_notifications` | `isSelf(uid)` |

> **Firestore rule helpers (new, server-side mirror of P1):**
> `isClient()` = `exists(/client_users/$(uid))` · `clientOwnsOrder(orderId)` =
> `get(order).clientId == get(client_users/uid).clientId` · field-write whitelists on `clients`
> so a client can edit profile fields but **never** `status`, `internalNotes`, `tags`, balances.

---

## 8) Permission Matrix

> The **client actor is NOT** one of the 8 internal roles (RULE 8 stays intact). It is a
> separate registry — `DEFAULT_CLIENT_CAPABILITIES` in `core/client-portal/client-portal-config.js`,
> mirrored by `firestore.rules` client helpers.

| Capability | Client | Notes |
|---|:--:|---|
| `cp_view_own_orders` | ✅ | only orders where `clientId == self.clientId` |
| `cp_create_order` | ✅ | via `orderActions.createOrder` |
| `cp_upload_files` | ✅ | order intake files (storage-helpers) |
| `cp_view_designs` | ✅ | own `design_items` only |
| `cp_approve_design` | ✅ | writes `client_decisions` |
| `cp_request_revision` | ✅ | writes `client_decisions` |
| `cp_view_company_profile` | ✅ | own `clients` doc |
| `cp_edit_company_profile` | ✅ | whitelisted fields only |
| `cp_manage_prefs` | ✅ | own `client_users` doc |
| `cp_request_return` | ✅ | existing `returns_tickets` flow |
| `cp_view_invoices` | ✅ | read-only payment summary (no cost/margin) |
| **Internal-only (always ❌ for client)** | ❌ | `priceCost`, `priceMargin`, `supplierCost`, `supplier*`, `internalNotes`, designer/printer identities, stage transitions, any `wallets`/`financial_ledger` access |

---

## 9) Audit Model

Every client action is recorded via `core/audit.js` (H3 — `date + by + byId + kind` mandatory):

| Action | Sink | `byId` | `kind` |
|---|---|---|---|
| register / login / logout | `client_activity_log` | `client:<uid>` | `op` |
| profile update | `client_activity_log` (+ `clients.editHistory`) | `client:<uid>` | `edit` |
| order create | `order.timeline` + `client_activity_log` | `client:<uid>` | `op` |
| file upload | `order.timeline` | `client:<uid>` | `op` |
| design approve / revise | `order.timeline` + `client_decisions` | `client:<uid>` | `op` |
| return request | `returns_tickets.timeline` | `client:<uid>` | `op` |

> `userId` namespacing `client:<uid>` keeps client actors distinguishable from staff in the
> shared audit trail without polluting the internal role system.

---

## 10) Future Expansion Points (all additive, flagged)

| Future feature | Seam already provided in Phase 1 |
|---|---|
| **Design Catalog** | `design_items` + `gallery.html`; add `catalog` read-model + `cp_browse_catalog` cap |
| **Business Directory** | `clients` already holds `sector`/`governorate`; add public opt-in flag + directory read-model |
| **Referral System** | `client_users` add `referredBy`/`referralCode`; new `referrals` collection + FSE event `REFERRAL_CREDIT` |
| **Marketplace** | FSE already has `MARKETPLACE_*`/`ESCROW_*`/`COMMISSION_*` event types reserved; portal becomes an order source |
| **Mobile App** | Same Firestore + central actions; `client-portal-actions.js` is the shared API layer; PWA already present (`manifest.json`, `sw.js`) |
| **AI Features** | `ai-engine.js` present; add client-side intents (order assistant, design brief helper) as observers over the same data |

> Each expansion is a **new module** subject to RULE 7 / G10 (8-point definition + approval)
> before any code — this document is the Phase-1 definition for the foundation only.

---

## 11) Phase 1 Build Plan (incremental, under E1 / G9)

| PR | Deliverable | Touches Stable Core? | Flag |
|---|---|:--:|---|
| **PR-1 (this)** | This architecture doc + `core/client-portal/client-portal-config.js` (foundation: flag, capabilities, status projection) + Node test | **No** | `clientPortal.v2` |
| PR-2 | `firestore.rules` client helpers + `client_users` rules (2-reviewer, smoke test per G8/H1.8) | Yes (rules) | — |
| PR-3 | Auth: `client-register.html`, `client-reset.html`, OTP Cloud Function | No | flagged |
| PR-4 | Portal shell multi-view + Dashboard + Profile | No | flagged |
| PR-5 | Orders list/detail/create (reuse `orderActions.createOrder`) | No | flagged |
| PR-6 | Design Approval Center (formalize existing tab) | No | flagged |
| PR-7 | Notifications + activity log + email/WhatsApp adapters | No | flagged |

**Rollback:** any PR reverts independently; with `clientPortal.v2=false` the legacy
phone+order-code portal is the only active surface — production is never disrupted (E1.9).
</content>
</invoke>
