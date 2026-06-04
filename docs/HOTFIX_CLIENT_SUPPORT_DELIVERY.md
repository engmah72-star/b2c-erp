# HOTFIX — Client↔Employee Message Delivery (Critical)

> **Severity:** 🔴 Critical (silent customer-message orphaning) · **Type:** Production hotfix.
> **Root cause:** client support conversations were created with **no employee participant**,
> so client messages were stored but invisible to all non-admin staff — and not even admins
> could reply. Full RCA: `docs/ARCHITECTURE_CENTRALITY_AUDIT.md` thread + the investigation in PR.

## Root cause (fixed)
`clientActions.openClientThread` built the support thread (`csupport_{uid}`) with
`staff = order?.createdBy ? [order.createdBy] : []`; the live support chat passes no order,
so `participants = [clientUid]` only. The entire inbox is participant-gated
(`inbox.html`, `inbox-badge.js`: `where participants array-contains uid`; rules
`firestore.rules` message read/create require participant membership). → undeliverable.

## The fix (4 parts)
1. **Central CS pool config** `master_lists/support_agents = { uids:[…] }` (read: any auth →
   client can read; write: admin only). New loader `_loadSupportAgents()` in `client-actions.js`.
2. **Inject staff at creation** — `openClientThread`:
   - `kind:'support'` → `staff = supportAgents` (always routed to CS pool).
   - `kind:'order'` → assigned team, **fallback to `supportAgents`** when no team is assigned yet.
   - Existing threads **self-heal**: the re-open path already `arrayUnion`s participants.
3. **Admin intervention via rules** (`firestore.rules`): `isAdmin()` bypass added to message
   `create`/`update` and conversation `update` — an admin can always read **and reply** in any thread.
4. **Backfill migration** for orphaned production threads: `scripts/backfill-support-participants.mjs`.

## Files changed
| File | Change |
|---|---|
| `client-actions.js` | `_loadSupportAgents()` + `openClientThread` staff injection / order fallback |
| `firestore.rules` | `isAdmin()` bypass on message create+update and conversation update |
| `scripts/backfill-support-participants.mjs` | **new** — seed config + heal orphaned `isClientThread` convs (Admin SDK, idempotent, `--dry-run`) |
| `tests/rules/client-support-delivery.test.js` | **new** — 12 emulator assertions |
| `tests/rules/package.json` | wire new test into `test`/`test:ci` (blocking CI gate) |

## Migration / backfill (run once on production)
```bash
export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
node scripts/backfill-support-participants.mjs --dry-run     # preview
node scripts/backfill-support-participants.mjs               # derive CS pool from users, seed config, heal threads
# or: node scripts/backfill-support-participants.mjs --agents=uidA,uidB
```
The script (1) derives CS pool from `users` (roles: customer_service/admin/operation_manager,
active only) or `--agents`, (2) writes `master_lists/support_agents`, (3) `arrayUnion`s the
pool into every `isClientThread==true` conversation missing them. Idempotent.

## Test results (Firestore emulator, this branch)
```
client-support-delivery (NEW)  12/12 ✅   ← Client→CS · CS→Client · Admin×3 · Order fallback · controls
role-escalation                 7/7  ✅
financial-write                35/35 ✅
storage-order-upload            8/8  ✅   (no regression from rules edits)
architecture-order-centric      7/7  ✅
```
Covered required scenarios: Client→CS delivery, CS→Client reply, Admin intervention
(read/reply/update), Order conversation fallback routing; plus controls proving
non-participants are blocked and the pre-fix orphaned state was indeed undeliverable.

## Remaining risks
- **Config must be populated**: until `master_lists/support_agents` exists, *new* support
  threads fall back to client-only (degraded, not worse than today). The backfill script seeds
  it; deploy order = run script after rules deploy. **Mitigation:** run migration immediately.
- **CS pool membership drift**: if staff change roles, re-run the backfill (or wire a small
  admin settings UI / Cloud Function later). Not blocking.
- **No push notification yet**: delivery now works via inbox listener + unread; a server-side
  `notifications` emitter on new client message is a recommended follow-up (design doc §4).
- **Large pools**: every client thread gains all CS uids as participants — fine at current
  scale; revisit with a routing/queue model if staff count grows large.

## Production Readiness Score: 9/10
Root cause fixed and proven by emulator tests across all four scenarios + controls; rules
hardened with admin intervention; idempotent backfill for existing data; zero regressions.
−1 until the migration script is actually executed against production and the CS pool config
is confirmed populated.
