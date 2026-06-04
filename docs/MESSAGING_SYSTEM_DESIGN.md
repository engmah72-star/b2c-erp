# Conversations & Messaging System — Design & Architecture

> **Scope:** Complete analysis + target architecture for the Business2Card
> (b2c-erp) communication layer between **Client · Customer Service · Designer ·
> Production · Administration**.
> **Author role hat:** Senior PM / UX Architect / System Analyst / QA / Full-Stack Architect.
> **Constitution alignment:** This design respects the Internal-ERP DNA (4 parties only),
> the Layered architecture (L1 — page is view only), Zero-direct-UI-writes (H1.1),
> Atomic writes (RULE 3), bounded listeners (G3), constants (C2), audit (H3),
> permissions-matrix as single source (§4), and Evolution Safety (E1 — incremental,
> backward-compatible, feature-flagged, reversible).

---

## 0) Executive Summary

Business2Card **already has a real, working messaging spine** — it is not a
greenfield build. The `conversations` collection with a `messages` subcollection
powers DMs, team channels, and order threads; a client bridge
(`openClientThread`) already routes customers into the same collection; presence,
typing, reactions, replies, pins, voice notes, read receipts (DM), and a
notification bell all exist.

The work ahead is **consolidation, hardening, and reach** — not reinvention:

- **Unify** the parallel comms surfaces (`conversations`, `notifications`,
  `client_decisions`, FCM) under one model and one action layer.
- **Harden** security (rules are broad), retention, search, and rate-limiting.
- **Extend reach** to a first-class client chat + design-approval-in-thread, and
  formalize the internal escalation workflow.

**Current State Score: 6.0 / 10** · **Target State Score: 9.0 / 10** (details in §20).

---

## 1) Current-State Analysis

### 1.1 What exists today (verified in code)

| Capability | Status | Location |
|---|---|---|
| 1:1 DMs | ✅ | `inbox-actions.js: ensureDM`, `inbox.html` |
| Team channels (`#عام`, `#التصميم`, …) | ✅ | `ensureChannelConversation` |
| Order threads | ✅ | `ensureOrderThread` (team auto-added) |
| Client→company threads | ✅ (basic) | `client-actions.js: openClientThread` (`clord_*`, `csupport_*`) |
| Text / image / file / voice / order_share / system messages | ✅ | `sendMessage`, message `type` |
| Replies, reactions, pins, forward, edit, soft-delete | ✅ | `inbox-actions.js` |
| Read receipts (per-message `readBy`) | ✅ (DM only in UI) | `markConversationRead`, `chat-view.js` |
| Per-user unread counts | ✅ | `unreadCount{uid:n}` |
| Presence + typing + heartbeat (25s) | ✅ | `setPresence`, `/presence/{uid}` |
| Mute / archive / clear-for-me / wallpaper per user | ✅ | conv-level maps |
| Notification bell (multi-source) | ✅ | `notifications.js` |
| FCM push (foreground + SW) | ✅ | `fcm-init.js`, `firebase-messaging-sw.js` |
| Unread FAB badge across pages | ✅ | `inbox-badge.js` |
| Client design approve/reject | ✅ (separate flow) | `client-portal.html` → `client_decisions` |

### 1.2 Data model (as-is)

**`/conversations/{convId}`** — `type ∈ {dm, channel, order_thread}` plus the client
variants (`clord_{orderDocId}`, `csupport_{uid}`). Universal fields: `participants[]`,
`unreadCount{uid}`, `archivedBy[]`, `mutedBy[]`, `clearedAt{uid}`, `lastMessageAt`,
`lastMessagePreview`, `lastSenderId/Name`, `lastReadByAll`.

**`/conversations/{convId}/messages/{msgId}`** — `senderId/Name`, `type`, `text`,
`mentions[]`, `attachments[]`, `orderRef`, `replyTo`, `reactions{emoji:[uid]}`,
`pinned*`, `forwarded`, `readBy{uid:ts}`, `editedAt`, `deletedAt`, `createdAt`.

**`/notifications/{notId}`** — `toUid`, `type`, `severity`, `ico`, `title`, `desc`,
`link`, `read`, `archived`, `createdAt`. (Note: the bell ALSO synthesizes
notifications client-side from `tasks`/`orders`/`client_followups` — see §4.)

**`/presence/{uid}`** — `online`, `lastSeen`, `typingIn`, `name`, `role`.

**`/client_decisions/{id}`** — parallel approval channel (unauthenticated client write).

---

## 2) Weaknesses, Risks, Bottlenecks & Gaps

Severity: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low.

### 2.1 Architecture / consistency
- 🔴 **Four parallel comms surfaces** (`conversations`, `notifications`,
  `client_decisions`, FCM events) with overlapping intent and no single
  orchestration point → drift, double-handling, missed events.
- 🟠 **Bell notifications are client-synthesized** from operational collections
  (tasks/orders/followups) rather than persisted events → no server truth, no
  cross-device read state, recomputed on every login, N listeners per user.
- 🟠 **Design approval lives outside the thread** (`client_decisions`), so the
  approve/reject conversation is invisible to CS/designer in the chat timeline.

### 2.2 Security (rules are too broad)
- 🔴 `messages.update` allows **any participant to edit any message** (needed for
  `readBy`/`reactions`, but currently also permits overwriting another user's
  `text`). No field-scoping.
- 🔴 `notifications.create: if isAuth()` — **any user can write any notification to
  any `toUid`** (spoofing/spam).
- 🟠 No **rate-limiting** on message/reaction creation (spam, cost).
- 🟠 Attachment URLs are broadly readable; **no AV/type validation beyond
  whitelist**, no signed-URL expiry strategy for sensitive design source files.
- 🟡 `@mention` does not verify the mentioned user is a participant.

### 2.3 Scale / performance
- 🟠 Hard caps: conversations `limit(300)`, presence/users `limit(500)`, orders
  `limit(2000)`, messages `limit(200)` — **no pagination**; large org/old threads
  silently truncated.
- 🟠 Presence heartbeat fixed at 25s → **mobile battery drain**; no adaptive backoff.
- 🟡 `/presence` and soft-deleted messages **never garbage-collected**.
- 🟡 Notification bell loads 100 items, no pagination.

### 2.4 Missing features
- 🔴 **No server-side message search** (UI scaffold exists, no backend index).
- 🟠 **No delivery state** (only `sent`→`read`; no `delivered`).
- 🟠 **No read receipts for channels/order threads** (DM-only in UI).
- 🟠 **No internal notes** on a customer conversation (private-to-staff lane).
- 🟠 **No escalation workflow** (assign/handoff/SLA/resolve states).
- 🟠 **No conversation assignment & status** (`open/pending/resolved`) for CS triage.
- 🟡 **No admin oversight surface** (monitor all, metrics, reassign).
- 🟡 **No retention/legal-hold policy**; no edit history audit.
- 🟡 **No @mention or per-thread notification granularity** (mute is all-or-nothing).

### 2.5 Governance debt
- 🟡 `inbox.html` is ~1.8k lines (G5 “caution” zone) — listeners + UI + actions
  intermixed; should move logic fully behind `inbox-actions.js` / control-center.
- 🟡 `inbox-actions.js` intentionally skips `auditEntry()`; acceptable for chat,
  but **assignment/escalation/resolve actions MUST be audited (H3)**.

---

## 3) Target Information Architecture

```
                          ┌─────────────────────────────┐
                          │     CONVERSATION (entity)    │
                          │  type · scope · status · SLA │
                          └──────────────┬──────────────┘
            ┌──────────────┬─────────────┼──────────────┬───────────────┐
            ▼              ▼             ▼              ▼               ▼
        dm            channel      order_thread     client          internal_note
   (staff↔staff)  (team topic)  (linked order)  (client↔company)   (lane within
                                                                     any conv)
            │              │             │              │
            └──────────────┴─────────────┴──────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    ▼                             ▼
              MESSAGES (subcol)            PARTICIPANTS (roles per conv)
        text/image/file/voice/            owner · members · watchers
        design_proof/approval/            (client | cs | designer |
        invoice/system/note               production | admin)
                    │
                    ▼
        DERIVED: unread · receipts · search index · events → NOTIFICATIONS
```

**Three planes, one model:**
1. **Conversation plane** — the durable record (this design's core).
2. **Notification plane** — derived, fan-out alerts (push/bell/email), generated by
   a single server emitter, never hand-written by clients.
3. **Presence plane** — ephemeral online/typing (kept as-is, with GC + adaptive HB).

---

## 4) Notification System (target)

Replace client-side synthesis with a **single server-side emitter** (Cloud Function
on message/event triggers) writing to `/notifications`. The bell becomes a *pure
reader* of `/notifications` (one listener, paginated), not 8 collection listeners.

```
event (new message / mention / assignment / approval / SLA breach)
        │
        ▼  Cloud Function: emitNotification()
  /notifications/{id}  { toUid, channelHint, type, severity, title, desc,
                         link, sourceConvId, sourceMsgId, read:false, dedupeKey }
        │                         │                         │
        ▼ in-app bell        ▼ FCM push (if !muted)    ▼ email digest (Phase 4)
```

- **Dedupe**: `dedupeKey = type:source:toUid:window` → no notification storms.
- **Respect mute**: emitter checks `mutedBy`/per-thread prefs before push.
- **Read sync**: `read` lives server-side → consistent across devices (fixes the
  current `localStorage` seen-state).
- **Channels**: in-app (always) · push (mention/DM/assignment/SLA only) · email
  (digest + escalations).

---

## 5) Real-Time Messaging Architecture

Keep **Firestore `onSnapshot`** as the realtime transport (already in place, zero
new infra, offline-capable, matches the stack). Add structure:

```
Client/Staff UI ──onSnapshot──▶ conversations (participant-scoped, paginated)
       │                              │
       │ write via ACTION layer       └─ onSnapshot ▶ messages (active conv, windowed)
       ▼
 inbox-actions.js / clientActions  ──▶ writeBatch (RULE 3): message + conv summary
       │                                          (+ counters atomically)
       ▼
 Cloud Function triggers ──▶ emitNotification · updateSearchIndex · SLA timers
```

- **Atomic send (RULE 3):** message doc + conversation summary (`lastMessage*`,
  `unreadCount` increments) committed in one `writeBatch`. Counters use
  `FieldValue.increment`.
- **Windowing:** message listener loads newest `limit(50)` + “load older”
  cursor pagination (replaces hard 200 cap).
- **Receipts at scale:** for channels/order threads, store a **per-user
  `lastReadAt`** on a participant sub-doc instead of per-message `readBy` maps
  (O(participants) not O(messages×participants)). Keep per-message `readBy` for DMs.
- **Delivery state:** add `delivered` via a lightweight ack (recipient’s
  client writes `lastDeliveredAt`), giving sent → delivered → read.
- **Backpressure:** adaptive presence heartbeat (25s active → 60s idle → off on hidden).

---

## 6) Database Schema (target)

> Additive & backward-compatible (E1). New fields are optional; existing readers keep working.

### 6.1 `/conversations/{convId}`
```jsonc
{
  "type": "dm | channel | order_thread | client | broadcast",
  "scope": "internal | client_facing",        // NEW: drives field-level security
  "subject": "string",                          // NEW: human title (search/triage)
  "participants": ["uid", "..."],               // existing — index source
  "roles": { "uid": "owner|member|watcher" },   // NEW: per-conv role
  "clientPhone": "string|null",                 // for client convs (ownership match)
  "orderRef": { "orderId", "orderCode", "clientName", "stage" },

  // Triage / workflow (NEW — Phase 2/3)
  "status": "open | pending | resolved | closed",
  "assignedTo": "uid|null",
  "assignedAt": "ts|null",
  "priority": "low | normal | high | urgent",
  "tags": ["complaint", "design", "..."],
  "sla": { "firstResponseDueAt": "ts", "resolveDueAt": "ts", "breached": false },

  // Summary (existing)
  "lastMessageAt": "ts", "lastMessagePreview": "string",
  "lastSenderId": "uid", "lastSenderName": "string",

  // Per-user maps (existing)
  "unreadCount": { "uid": 0 }, "mutedBy": ["uid"], "archivedBy": ["uid"],
  "clearedAt": { "uid": "ts" },

  "createdAt": "ts", "createdBy": "uid", "tenantId": "string|null" // G7-ready
}
```

### 6.2 `/conversations/{convId}/participants/{uid}` *(NEW sub-doc — scalable receipts)*
```jsonc
{ "uid", "role": "owner|member|watcher", "joinedAt",
  "lastReadAt": "ts", "lastDeliveredAt": "ts", "muted": false, "notifyPref": "all|mentions|none" }
```

### 6.3 `/conversations/{convId}/messages/{msgId}`
```jsonc
{
  "senderId", "senderName", "senderRole",          // senderRole NEW
  "lane": "public | internal_note",                // NEW: internal notes (§9)
  "type": "text|image|file|voice|design_proof|approval|invoice|order_share|system",
  "text": "string",
  "mentions": ["uid"],
  "attachments": [{ "url", "name", "size", "mime", "duration?", "storagePath" }],
  "orderRef": { ... },
  "designRef": { "itemId", "vNum", "mockupUrl", "pdfUrl" },   // NEW (design_proof)
  "approval": { "decision": "approved|rejected", "itemId", "vNum", "comment" }, // NEW
  "invoiceRef": { "orderId", "amount", "url" },               // NEW (invoice msg)
  "replyTo": { "msgId", "senderName", "preview" },
  "reactions": { "👍": ["uid"] },
  "readBy": { "uid": "ts" },          // DM only; channels use participant.lastReadAt
  "pinned": false, "forwarded": false,
  "editedAt": "ts|null", "editHistory": [{ "text", "at" }],   // NEW (audit)
  "deletedAt": "ts|null",
  "createdAt": "ts"
}
```

### 6.4 `/notifications/{id}` (server-emitted only)
```jsonc
{ "toUid", "type", "severity", "ico", "title", "desc", "link",
  "sourceConvId", "sourceMsgId", "dedupeKey", "read": false, "archived": false, "createdAt" }
```

### 6.5 `/message_search/{convId}` *(or Algolia/Typesense index — Phase 2)*
Denormalized, tokenized recent message text per conversation for fast search/filter.

### 6.6 Relationships
- `conversation.orderRef.orderId → orders/{id}` (and reverse: `order.conversationId`
  back-pointer added so order pages can deep-link the thread).
- `conversation.participants[] → users/{uid}` / clients.
- `message.designRef.itemId → design_items/{id}`; `approval` mirrors into the order’s
  approval flow (replaces standalone `client_decisions` over time, E1-safe).

---

## 7) User Roles & Permissions Matrix (messaging)

Source of truth stays `core/permissions-matrix.js`. Add **one capability**:
`manage_conversations` (assign/resolve/monitor). Day-to-day chat needs no new cap —
participation is membership-based.

| Action | client | customer_service | graphic_designer | design_operator | production_agent | shipping_officer | operation_manager | admin |
|---|---|---|---|---|---|---|---|---|
| Read conv (if participant) | ✅ own | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Send public message | ✅ own | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Send **internal note** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Start client thread | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Approve/reject design (in-thread) | ✅ own order | — | — | — | — | — | — | ✅ |
| Assign / change status / set SLA | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Escalate | via CS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Monitor **all** conversations | ❌ | scope: assigned/team | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Performance metrics | ❌ | own | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Delete message | own | own | own | own | own | own | ✅ | ✅ |

**Field-level (RULE 8) inside client-facing convs:** `internal_note` lane and
`supplierCost`/cost fields never serialize to client readers; `client_phone` masked
for roles outside {admin, ops, CS, shipping}. Enforced UI (`canSee`) + rules.

---

## 8) Customer Chat Experience

```
Client opens client-portal ▶ "محادثاتي" (My Conversations)
  ├─ Support thread (csupport_{uid})         → talk to Customer Service
  ├─ Order thread per order (clord_{orderId}) → status, files, questions
  │     ├─ sees: order status timeline (read from order.stage / getOrderDates)
  │     ├─ receives: design_proof messages → [Approve] [Request changes]
  │     │      └─ tap → writes `approval` message + mirrors to order flow (atomic)
  │     ├─ receives: invoice message → view/download
  │     └─ uploads: brief files/images (whitelisted types, sized)
  └─ Notifications: new reply, design ready, invoice issued, order shipped
```

- **One identity, one inbox:** client sees only their own threads (participant +
  `clientPhone` match), never internal notes, costs, or other clients.
- **Approve/reject in-thread** replaces the opaque `client_decisions` doc — the
  decision becomes a visible, audited message and still drives the existing
  approval workflow (E1: write both during migration, then retire the old path).
- **Status tracking** reads from the single source `order.stage` / `getOrderDates()`
  — no duplicated state in chat.

---

## 9) Employee Chat Experience

- **Internal notes lane** (`lane:"internal_note"`) inside any client/order thread:
  staff-only sidebar comments invisible to the client — for handoff context,
  warnings, pricing notes.
- **Assignment discussions:** order threads auto-include the order team
  (designer/printer/production/shipping/creator + admins) via `ensureOrderThread`;
  reassignment posts a `system` message.
- **Design revision requests:** designer posts `design_proof`; CS/admin/client
  respond; rejection auto-creates a revision task linked to the thread.
- **Escalation workflow:**
  ```
  open ──escalate──▶ pending(assignedTo=manager, priority↑, SLA timer)
       ◀─resolve──  resolved ──reopen──▶ open      closed (admin)
  ```
  Each transition: audited (H3), emits notification, optional SLA breach alert.

---

## 10) Admin Experience

- **Monitor-all console** (`manage_conversations`): every conversation, filter by
  status/priority/assignee/tag/SLA-breach/role/order/date.
- **Search**: full-text across messages (Phase 2 index) + structured filters.
- **Assign / reassign / resolve**; bulk triage.
- **Performance metrics dashboard:** first-response time, resolution time, open
  backlog, SLA breach rate, per-agent volume, CSAT (Phase 4). Reuses
  `core/report-actions.js` patterns.

---

## 11) Security Model

Defense in depth (UI `canSee` + `firestore.rules` fail-closed + audit). Hardenings:

1. **Field-scoped message updates:** a participant may update **only**
   `readBy[self]`, `reactions[*][self]`; only the **author** (within an edit window)
   may change `text`/`editedAt`; only admin/owner may pin/delete. Enforce via
   rule field-diff checks (`request.resource.data.diff(...)`).
2. **Notifications are server-write-only:** `create: if false` for clients; written
   exclusively by Cloud Functions (Admin SDK). Clients may only flip their own
   `read`.
3. **Scope-based client isolation:** client reads require `participant` **and**
   `scope=="client_facing"`; `internal_note` lane stripped server-side (separate
   sub-collection or rule that blocks client read of `lane=="internal_note"`).
4. **Rate-limit** message/reaction creates (Cloud Function counter or App Check +
   per-uid token bucket).
5. **Attachments:** keep `core/storage-helpers.js` whitelist; design *source* files
   require staff role; add (Phase 4) AV scan on upload trigger.
6. **App Check** on all messaging reads/writes to block non-app clients.
7. **Audit (H3):** assignment/escalation/resolve/delete/edit logged via
   `auditEntry()` (actor + date + kind). Chat sends remain self-auditing.

---

## 12) Mobile Experience

- PWA-first (existing `mobile/`, `pwa-install.js`, SW). Chat list → thread → composer.
- Adaptive presence heartbeat (battery); pause listeners on `visibilitychange:hidden`.
- Push via FCM (existing `fcm-init.js`); tapping a push deep-links to the conv (`link`).
- Voice notes (existing WebM capture); image capture from camera; chunked upload.
- Windowed message loading (50 + infinite scroll) for low-memory devices.
- Offline: Firestore persistence already buffers sends; show pending/sent/delivered ticks.

## 13) Web Experience

- Three-pane inbox (list · thread · context/order panel). Order panel shows live
  `order.stage`, files, invoice, and approve/reject controls.
- Command-palette integration (existing `command-palette.js`) → jump to conversation.
- Keyboard shortcuts, drag-drop attachments, `@mention` autocomplete (participant-scoped).
- Admin console as a separate domain in `shell.html` (permission-gated).

---

## 14) User-Flow Diagrams

**A. Client design approval (in-thread):**
```
Designer uploads proof ─▶ design_proof message in clord_{order}
   ─▶ notify client (push+bell) ─▶ client taps [Approve]/[Request changes]
        approve  ─▶ approval message (atomic: + order approval advance) ─▶ notify team
        reject   ─▶ approval(rejected)+comment ─▶ auto revision task ─▶ notify designer
```

**B. CS escalation:**
```
Client message ─▶ open conv (assignedTo=CS, SLA started)
   CS resolves ─▶ resolved        OR    CS escalates ─▶ pending(manager, priority↑)
   SLA breach (timer) ─▶ notify manager + flag conv
```

**C. Notification fan-out:** see §4 diagram.

---

## 15) Phased Implementation Roadmap

> Every phase is incremental, feature-flagged, backward-compatible, reversible (E1).
> Logic lands in `inbox-actions.js` / `clientActions` / Cloud Functions — never in HTML (H1.1/L1).

### Phase 1 — Core Messaging (hardening) · *complexity: M*
- Field-scoped `messages.update` + `notifications` server-only rules. 🔴
- Atomic send via `writeBatch` + `increment` counters (RULE 3). 
- Message pagination (50 + cursor); adaptive presence heartbeat; presence/message GC. 
- Delivery state (`lastDeliveredAt`) → sent/delivered/read ticks.
- Move remaining inbox logic out of `inbox.html` into action layer (G5 debt).

### Phase 2 — Order Conversations + Client Reach · *complexity: M–L*
- Client “My Conversations” UI in portal (read `clord_*`/`csupport_*`).
- Design approve/reject **in-thread** (dual-write with `client_decisions`, then retire).
- Invoice + status messages in order threads; order↔conversation back-pointer.
- Message **search index** + structured filters (status/tag/order/date).
- Per-user `participants` sub-doc receipts for channel/order-thread read state.

### Phase 3 — Internal Team Chat + Triage · *complexity: M*
- `internal_note` lane; conversation `status`/`assignedTo`/`priority`/`tags`/`sla`.
- Escalation workflow + assignment (audited H3); admin monitor-all console.
- SLA timers (Cloud Function) + breach notifications.
- Performance metrics dashboard (first-response/resolution/backlog/SLA).

### Phase 4 — Automation & AI · *complexity: M–L*
- Server-side notification emitter consolidation + email digests.
- AI assist: auto-tag/triage, suggested replies, summarize-thread, smart routing
  (reuse `ai-engine.js`/`genkit-flows.js`). Attachment AV scan.
- Canned responses / templates; auto-close stale resolved threads.

### Phase 5 — Enterprise · *complexity: L*
- Multi-tenant `tenantId` on every conv/message/notification + query filter (G7).
- Retention/legal-hold policy + archival tiering; full edit-history audit export.
- CSAT, analytics export, message encryption-at-rest for sensitive lanes,
  broadcast/announcement type, webhook/API for external channels (WhatsApp bridge).

---

## 16) firestore.rules — target sketch (illustrative)

```
match /conversations/{cid} {
  allow read: if isAuth() && (isAdmin() || isParticipant(cid));
  allow create: if isAuth() && request.auth.uid in request.resource.data.participants;
  allow update: if isAuth() && (isAdmin()
     || (isParticipant(cid) && onlyAllowedConvFields()));  // unread/mute/archive/status by cap
  allow delete: if isAdminOnly();

  match /participants/{uid} {
    allow read: if isParticipant(cid) || isAdmin();
    allow write: if request.auth.uid == uid;   // own receipt/pref only
  }
  match /messages/{mid} {
    allow read: if isParticipant(cid) &&
       (resource.data.lane != 'internal_note' || isStaff());   // client never sees notes
    allow create: if isParticipant(cid)
       && request.resource.data.senderId == request.auth.uid
       && (request.resource.data.lane != 'internal_note' || isStaff());
    allow update: if onlyUpdatesReadByOrReactionsForSelf()      // any participant
       || (isAuthor() && withinEditWindow() && onlyTextEdited())
       || isAdmin();
    allow delete: if isAdmin() || resource.data.senderId == request.auth.uid;
  }
}
match /notifications/{id} {
  allow read:   if isAuth() && (isAdmin() || resource.data.toUid == request.auth.uid);
  allow create: if false;                       // Cloud Functions (Admin SDK) only
  allow update: if isOwner() && onlyReadFlagChanged();
  allow delete: if isAdminOnly();
}
```

---

## 17) Required Firestore Indexes (new)
- `conversations`: `participants array-contains` + `status` + `lastMessageAt desc`.
- `conversations`: `assignedTo` + `status` + `priority`.
- `conversations`: `orderRef.orderId`.
- `notifications`: `toUid` + `read` + `createdAt desc` (partly exists).
- `messages` (collection-group) for admin search fallback: `createdAt desc`.

---

## 18) QA & Test Strategy
- **Unit (action layer):** send/edit/delete/react/assign/escalate contracts
  (`{ok, errors, warnings}` H1.5); receipt math; unread increments.
- **Rules tests** (emulator): client cannot read `internal_note`/costs; cannot
  write notifications; cannot edit others’ text; cross-client isolation; mention
  must be participant.
- **Integration:** atomic send (no partial writes on failure); approval-in-thread
  advances order; SLA timer fires; notification dedupe.
- **Realtime/perf:** pagination correctness; listener cleanup on logout/nav (no
  leaks); heartbeat backoff; 10k-message thread scroll.
- **E2E:** client approve/reject; CS escalate→resolve; admin monitor/reassign.
- **Security review** (`/security-review`) before each phase push; financial
  validator unaffected (no FSE changes).

---

## 19) Quick Wins (≤ 1–2 days each, high ROI)
1. 🔴 Tighten `notifications.create` to server-only + flip-`read`-only updates.
2. 🔴 Field-scope `messages.update` (block editing others’ text).
3. 🟠 Atomic send `writeBatch` + `increment` (replaces sequential writes).
4. 🟠 Add `delivered` tick (one client write) — perceived-quality jump.
5. 🟠 Surface **client “My Conversations”** list in the portal (data already exists).
6. 🟡 Adaptive presence heartbeat (battery) + pause-on-hidden.
7. 🟡 Notification read-state server-side (kill `localStorage` seen drift).
8. 🟡 Order↔conversation back-pointer (deep-link from order page).

---

## 20) Scorecard

| Dimension | Current /10 | Target /10 | Notes |
|---|---|---|---|
| Conversation model | 7 | 9 | Strong base; add status/assignment/notes |
| Roles & permissions | 6 | 9 | Matrix exists; add `manage_conversations`, scope client |
| Storage/attachments | 6 | 8 | Whitelist good; add AV + signed-URL policy |
| Notifications | 5 | 9 | Consolidate to server emitter |
| Real-time | 7 | 9 | Solid; add pagination + delivery + scalable receipts |
| Read/delivery receipts | 5 | 9 | DM-only today |
| Search & filters | 2 | 8 | Missing backend; biggest gap |
| Security | 4 | 9 | Rules too broad |
| Client experience | 4 | 9 | Bridge exists, no UI/approval-in-thread |
| Admin oversight | 3 | 9 | No console/metrics |
| Mobile | 6 | 9 | PWA good; battery/windowing |
| **Overall** | **6.0** | **9.0** | |

### Top Risks
- 🔴 **Security regression** if rules tightened without field-diff care → break
  reactions/receipts. *Mitigation:* emulator rules tests before deploy.
- 🟠 **Migration drift** moving `client_decisions` into threads. *Mitigation:*
  dual-write window + reconciliation (E1).
- 🟠 **Cost/scale** of search + listeners. *Mitigation:* pagination, index choice
  (start with denormalized Firestore index, graduate to Typesense if needed).
- 🟡 **inbox.html God-page** growth (G5). *Mitigation:* extract during Phase 1.

### Priorities (ordered)
1. Security hardening (rules) — Quick Wins 1–2.
2. Atomic send + delivery + pagination (Phase 1).
3. Client “My Conversations” + approval-in-thread (Phase 2).
4. Search & filters (Phase 2).
5. Internal notes + escalation/assignment + admin console (Phase 3).

### Estimated Development Complexity
| Phase | Complexity | Rough effort |
|---|---|---|
| 1 Core hardening | **M** | ~1–1.5 sprints |
| 2 Order/client reach + search | **M–L** | ~2 sprints |
| 3 Internal team + triage | **M** | ~1.5 sprints |
| 4 Automation & AI | **M–L** | ~2 sprints |
| 5 Enterprise | **L** | ~2–3 sprints |

---

## 21) Alignment Checklist (constitution)
- ✅ 4-party DNA preserved (no 5th party).
- ✅ L1 / H1.1 — all writes via `inbox-actions.js` / `clientActions` / Functions.
- ✅ RULE 3 — atomic batched sends.
- ✅ G3 — bounded + paginated listeners.
- ✅ C2 — message/conv `type`, `status` as constants (extend `orders.js` enums).
- ✅ H3 — assignment/escalation/resolve audited.
- ✅ RULE 8 — internal-note lane + cost/phone field protection.
- ✅ E1 — every phase incremental, flagged, reversible; legacy paths retired only after dual-write.
- ✅ G7-ready — `tenantId` field reserved on new docs (Phase 5 activation).
```
