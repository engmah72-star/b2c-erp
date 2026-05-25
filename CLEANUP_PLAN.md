# CLEANUP_PLAN

**Date:** 2026-05-25
**Phase:** Runtime Governance Cleanup — Synthesis of 4 audits
**Inputs:**
- `RUNTIME_DEAD_CODE_REPORT.md`
- `CSS_GOVERNANCE_REPORT.md`
- `RUNTIME_OWNERSHIP_AUDIT.md`
- `SIDEBAR_GOVERNANCE_AUDIT.md`

---

## القاعدة الذهبية للمرحلة

> **Audit first → Safe incremental cleanup.**
> لا حذف جماعي. لا rewrite. لا big-bang. كل PR = concern واحد + قابل للرجوع + verified.

---

## ممنوع (Guardrails)

- ❌ حذف أي business logic فعّالة
- ❌ كسر التشغيل الحالي
- ❌ rewrite الـ god pages
- ❌ تغيير Firestore schema
- ❌ تعديل `financial-sync-engine.js` core behavior
- ❌ تعديل `orderActions.*` core behavior
- ❌ حذف أي شيء بدون verification (grep + smoke test)
- ❌ Phase G (Legacy sidebar removal) قبل اكتمال Phases A-F

---

## Phasing — 8 phases مرتّبة من الأقل خطر للأعلى

### Phase 1 — Pure-dead cleanup (Quick win)

| Item | Source audit | Risk | Reversible? | Status |
|---|---|---|---|---|
| Delete `ai-context.js` (398 lines, 0 references) | DEAD §SAFE | None | Trivial | ✅ **Done** |
| ~~Delete `chat.html`, `gallery.html`, `client-design-library.html`~~ | DEAD §SAFE | — | — | ❌ **Reverted** — still referenced as nav links in 10+ sidebars; redirect stubs serve real purpose (graceful migration for old bookmarks). Need coordinated nav-link removal first. |
| ~~Delete `@keyframes journeyPulse` from `clients.css:18`~~ | CSS §6 | — | — | ❌ **Reverted** — actively used in `clients-render.js:1269` as inline `animation:journeyPulse`. Audit missed JS template-string usage. |
| ~~Delete unused tokens `--ring-r`, `--tint-o-soft`, `--tint-o-med`, `--tint-o-line`~~ | CSS §5 | — | — | ⏸ **Deferred** — also defined in `design-system/tokens.css:324-325` (parallel system). Touch both or neither. Defer to a focused token-system PR. |

**Actual scope:** 1 file deleted, 398 lines removed. Zero behavior change.
**Audit correction:** 3 of 4 original items were overconfident. Verification (grep against `.js` AND `.html` AND template-string usage) caught them before deletion. **Lesson:** before any future Phase delete, run the verification commands in §Verification (bottom of this doc) on full reference patterns, not just `import` statements.

---

### Phase 2 — Safety net plumbing

| Item | Source audit | Risk | Reversible? | Status |
|---|---|---|---|---|
| Create `core/shell-navigate.js` with `navigatePage()` helper | SIDEBAR §A | None | Trivial | ✅ **Done** |
| Auto-load helper via `sidebar-config.js` (sync, before any onclick) | — | None | Trivial | ✅ **Done** |
| Document embed-mode contract in `CLAUDE.md` (RULE N1.2) | SIDEBAR §A, §7 | None | Trivial | ✅ **Done** |
| Document `#ctx=` hash reservation in `CLAUDE.md` (RULE N1.3) | SIDEBAR §3 | None | Trivial | ✅ **Done** |
| Delete `sidebar-context-drawer.js` + remove loader block in `sidebar-config.js` | DEAD §RISKY, SIDEBAR §4 | None — verified 0 publishers to `B2CContext.set()` | Easy revert | ✅ **Done** |
| Delete `sidebar-context-drawer.css` | CSS §4 | None | Easy revert | ✅ **Done** |
| Delete `core/sidebar-context.js` (the pub/sub bus — 0 publishers) | DEAD §NEEDS-VERIFICATION | None — verified | Easy revert | ✅ **Done** |
| Delete `core/context-renderers/order-renderer.js` (only consumed by deleted drawer) | DEAD §NEEDS-VERIFICATION | None | Easy revert | ✅ **Done** |
| Bonus: removed loader block (lines 118-142) from `sidebar-config.js` | — | None | Easy revert | ✅ **Done** |

**Goal achieved:** Established migration plumbing + removed 4 orphan files + documented runtime navigation contracts. ~580 lines deleted, ~40 lines added (helper + RULE N1 docs). Net cleanup ~540 lines.

**Verification done:**
- `grep -rn "sidebar-context-drawer\|B2CContext\|context-renderers" .` → 0 results
- `grep -rn "B2CContext\.set\|B2CContextDrawer" .` → 0 publishers found before deletion

**Net effect:** Foundation laid for Phases 4-6 (command-palette, notifications, dashboards all become shell-aware via `navigatePage()`).

---

### Phase 3 — CSS hygiene (no visual change)

| Item | Source audit | Risk | Reversible? | Status |
|---|---|---|---|---|
| Extract inline `<style>` blocks from `report-bug.html`, `validate-financial.html`, `supplier-requests.html` → dedicated CSS files | CSS §7 | None | Trivial | ✅ **Done** |
| ~~Remove duplicate `.panel-ov` from `production.css:35` + `production-dashboard.css:34`~~ | CSS §1 | — | — | ❌ **Reverted** — NOT duplicates. `shared.css:383` is a left-sliding side panel (`top:0;left:0;transform:translateX(-100%)`); production/production-dashboard define a BOTTOM-SHEET panel (`align-items:flex-end`, slide-up) sharing the class name. Deleting would break production order detail. |
| ~~Remove `.modal` override from `shipping.css:118`~~ | CSS §1 | — | — | ❌ **Reverted** — shipping uses a different API (`.modal.on` toggle, modal IS the overlay). `shared.css:396` uses `.overlay.open .modal` parent/child pattern. Removing breaks shipping modals. |
| ~~Remove duplicate `.overlay` from `exec-cost-entry.css:98`~~ | CSS §1 | — | — | ❌ **Reverted** — exec-cost-entry uses display:none/flex toggle. `shared.css:394` uses opacity-based. Different mechanics. |
| ~~Fix the 4 `!important` rules in `runtime-shell.css`~~ | CSS §3 | — | — | ❌ **Reverted** — all 4 are legitimate: 2× `@media (min-width: 769px)` desktop visibility overrides, 1× class-based visibility flag (override of default `display:none`), 1× `prefers-reduced-motion` a11y. Removing breaks responsive layout + a11y. |

**Actual scope:** 3 HTML inline `<style>` blocks extracted to 3 new CSS files. ~111 lines net relocation (no behavior change). Pages now load `<link rel="stylesheet" href="*.css?v=1">` instead of inline `<style>`.

**Audit correction:** 4 of 5 original items were overconfident — same pattern as Phases 1 + 2. The CSS agent treated same-named classes across files as duplicates without checking the actual rules (different positioning, different APIs). The 4 `!important` rules in the new `runtime-shell.css` are all defensive/responsive/a11y — not cascade fights.

**Lesson:** before any future CSS "duplicate" removal, diff the actual rule bodies — not just class names.

---

### Phase 4 — Navigation: shell-aware command palette + notifications

| Item | Source audit | Risk | Reversible? | Status |
|---|---|---|---|---|
| `command-palette.js:234` — route via `navigatePage()` | SIDEBAR §5 | Low — fallback preserved | Easy | ✅ **Done** |
| `notifications.js:346` — route via `navigatePage()` | SIDEBAR §6 | Low — fallback preserved | Easy | ✅ **Done** |

Both call sites check `typeof window.navigatePage === 'function'` and fall back to `location.href` if the helper isn't loaded (defensive — works on legacy pages that don't load `sidebar-config.js`).

---

### Phase 5 — Dashboard navigation refactor (per-page)

5 dashboards × 1 PR each. Mechanical replacement.

| Page | Sites | Source |
|---|---|---|
| `designer-dashboard.html` | 3 | SIDEBAR §1 |
| `cs-dashboard.html` | 4 | SIDEBAR §1 |
| `exec-dashboard.html` | 6 | SIDEBAR §1 |
| `ops-dashboard.html` | 5 | SIDEBAR §1 |
| `shipping-dashboard.html` | 2 | SIDEBAR §1 |

**Goal:** 20 hardcoded `location.href` → `navigatePage()`.
**Risk:** Low per page. Reversible per PR.
**Time:** 5 PRs, 1 hour each.

---

### Phase 6 — Workflow page redirects

Replace post-action `location.href=...` in workflow pages with `navigatePage()`. Similar mechanical.

| Page | Sites |
|---|---|
| `design.html` | 2 |
| `clients.html` | 3 |
| `archive.html` | 1 |
| `shipping-accounts.html` | 2 |
| `financial-dashboard.html` | 1 |
| `settings.html` | 1 |
| `employee-profile.html` | 3 |

**Goal:** 13 more sites cleaned.
**Time:** 2-3 PRs.

---

### Phase 7 — Ownership migrations (RULE H1.1 / G6 / A1 / P1 / S1.3)

**Sub-phases (financial first — highest stakes):**

#### 7.A — `shipping-accounts.html` consolidation (CRIT)
- 17 batch ops → `shippingActions.processReturn()` + `processSettlement()` + `reverseSettlement()`
- All financial writes go through FSE
- **Effort:** 3-4 days. Requires thorough chaos tests (RULE H2.6).

#### 7.B — `design.html` order archival (CRIT)
- 4 batch ops including direct wallet/transaction writes → `orderActions.archiveOrder()`
- 3 medium ops (attendance/gallery) → new `attendanceActions` + `galleryActions`
- **Effort:** 1-2 days.

#### 7.C — `employees.html` payroll/salary wrappers (HIGH)
- 3 direct `dispatchFinancialEvent` calls → `employeeActions.executePayroll` / `paySalary` / `reverseSalary`
- Each wrapper adds: role gate (`canDo('payroll')`) + validation + idempotency
- **Effort:** 1-2 days.

#### 7.D — `approvals.html` capability gating (HIGH)
- 8 inline `currentRole ===` checks → `canDo()` calls
- May require new capabilities in `core/permissions-matrix.js`: `approve_transaction`, `confirm_transaction`, `view_supplier_requests`, `submit_supplier_payment`, `request_client_refund`
- **Effort:** 2 days.

#### 7.E — Storage helpers migration (HIGH)
- 10 direct `uploadBytes`/`uploadBytesResumable` calls → `core/storage-helpers.js`
- Pages: `design.html` (3), `inbox.html` (3), `print.html` (2), `approvals.html` (2)
- **Effort:** 2 days.

#### 7.F — Magic strings sweep (MED — bulk)
- 61+ hardcoded stage/role strings → `ORDER_STAGES.*` / `USER_ROLES.*` imports
- Pages: `clients.html`, `accounts.html`, `design.html`, `approvals.html`
- **Effort:** 1 day (largely find-replace + smoke test).

**Goal of Phase 7:** Bring CI architecture-guard to **zero grandfathered violations**.

---

### Phase 8 — Panel-ov sunset (UX migration per page)

For each of 11 pages with `panel-ov`:
1. Decide: standalone (`order.html?id=X`) or shell-context dispatch
2. Migrate detail UI
3. Remove `panel-ov` HTML/CSS/JS
4. Test on mobile + desktop

**Order:**
1. `design.html` — highest traffic
2. `clients.html`
3. `production.html` (most complex — nested `cpanel-ov`)
4. `accounts.html`
5. `archive.html`
6. `production-dashboard.html`
7. `print.html`
8. `shipping-accounts.html`
9. `shipping.html`
10. `suppliers.html` (defer — non-order entity)
11. `employees.html` (defer — non-order entity)

**Effort:** 1 PR per page, ~6-8 weeks total.

---

### Phase 9 — Hash routing separation

| Page | Migration |
|---|---|
| `my-profile.html` | tabs `#overview` → `?tab=overview` |
| `employee-profile.html` | same |
| `reports.html` | hash filters → query string |
| `order.html:292` | `#client=X` link → shell context |

**Effort:** 1-2 PRs.

---

### Phase 10 — Legacy sidebar removal (FINAL — irreversible)

**Preconditions (ALL must be true):**
- ✅ Phases 1-9 complete
- ✅ All god pages tested inside `shell.html`
- ✅ No god page references `B2CContext`, `sidebar-context`, `sidebar-config`
- ✅ User explicitly approves the irreversible step

**Steps:**
1. Remove `<script src="sidebar.js">` from all god pages (35+)
2. Remove `<script src="smart-sidebar.js">` from all god pages
3. Remove `<script src="sidebar-config.js">` from all god pages
4. Delete `sidebar.js` (134 lines)
5. Delete `smart-sidebar.js` (456 lines)
6. Delete `sidebar-config.js` (165 lines)
7. Delete `core/sidebar-context.js`
8. Delete `core/context-renderers/order-renderer.js`
9. Remove legacy CSS from `shared.css`: `.sidenav`, `.nav-link`, `.nav-scroll`, `.mob-nav`, `.nav-brand`, `.nav-logo`, mobile media query overrides for these
10. Update `sw.js` cache to drop deleted files
11. Bump cache version

**Net cleanup:** ~1300 lines JS + ~500 lines CSS removed.
**Risk:** **VERY HIGH if any precondition is unmet.** Breaks every standalone page.
**Reversibility:** Possible via git revert, but every cached PWA needs cache reset.

---

## Cumulative impact

| Phase | Lines removed | Net risk | Time |
|---|---|---|---|
| 1 | ~420 | None | 30m |
| 2 | ~550 (sidebar-context-drawer) | Low | 1h |
| 3 | ~150 | Low (visual diff) | 2h |
| 4 | 0 (refactor only) | Low | 30m |
| 5 | 0 (refactor only) | Low | 5h |
| 6 | 0 (refactor only) | Low | 3h |
| 7 | ~0 (centralized — code moves) | **HIGH** (financial) | ~2 weeks |
| 8 | ~600 (panel-ov machinery × 11 pages) | High (UX) | 6-8 weeks |
| 9 | ~0 (refactor only) | Med | 1-2 days |
| 10 | ~1800 | **CRITICAL** (irreversible) | 1 PR + bake time |

**Total expected cleanup:** ~3500 lines deleted, ~150 violations resolved, zero behavior regression if phases followed in order.

---

## Quality gates per PR (apply to every cleanup PR)

1. ✅ Single concern (one phase item or one page)
2. ✅ Diff is minimal — no opportunistic reformatting
3. ✅ No business logic touched
4. ✅ No `financial-sync-engine.js` core behavior changed
5. ✅ No `orderActions.*` core behavior changed
6. ✅ No Firestore schema changes
7. ✅ Smoke test: shell.html loads, 3 god pages load, login flow works
8. ✅ CI architecture-guard passes
9. ✅ Cache version bumped if CSS/JS deleted (`sw.js` CACHE name)
10. ✅ Reversible: git revert alone restores behavior (no out-of-band data changes)

---

## Verification commands (use before each PR)

```bash
# Confirm no remaining references before deleting a file
grep -rn "from ['\"].*<filename>" --include='*.js' --include='*.html' .
grep -rn "src=['\"]<filename>" --include='*.html' .

# Confirm sidebar-context-drawer is orphan
grep -rn "sidebar-context-drawer\|B2CContext\.on" .

# Confirm no god page imports a legacy nav file (Phase 10 precondition)
grep -rn "sidebar\.js\|smart-sidebar\.js\|sidebar-config\.js" --include='*.html' .

# CI guard locally
node .github/workflows/architecture-guard-check.js 2>/dev/null || \
  echo "(architecture-guard runs only in CI)"
```

---

## Reversibility ladder

| Phase | Reversibility |
|---|---|
| 1, 2, 3, 4 | Single `git revert` restores everything |
| 5, 6 | Single revert per PR; full restore requires reverting all PRs in phase |
| 7.A-F | Revertible per PR, but each PR ships behavior change — coordinated rollback only |
| 8 | Per-page revert preserves other pages |
| 9 | Per-page revert |
| 10 | Revert restores files but cached browsers need manual cache clear |

---

## Open questions for the user (Phase 7+ entry checkpoints)

Before starting Phase 7:
1. ✅ Confirm `core/permissions-matrix.js` is the central capability source (currently exists). Any new capabilities OK to add?
2. ✅ Confirm we may create new action modules: `shippingActions.js`, `employeeActions.js`, `attendanceActions.js`, `galleryActions.js`. Each wraps central FSE/orderActions — no new business logic.
3. ⚠ AI cluster (5 files, ~600 lines): keep, delete, or feature-flag? Used on 30+ pages. (See `RUNTIME_DEAD_CODE_REPORT.md` §Verify.)
4. ⚠ Status tokens `--st-*` in `shared.css`: any JS consumer for badge styling? If not, delete.

Before starting Phase 10:
5. ✅ All god pages verified inside shell on mobile + desktop?
6. ✅ Cache reset plan for offline PWA users?

---

## Recommended starting point

**Open one PR for Phase 1 only.**

Smallest, safest, immediate visible cleanup. ~420 lines, zero risk. Validates the cleanup process and gives momentum before deeper phases.

Then Phase 2 (safety net plumbing) — sets up `navigatePage()` so the rest of the work has a clean target.

Phases 5-6 (dashboard + workflow `location.href` refactors) can run in parallel with each other after Phase 2.

**Phases 7-10 require user sign-off per sub-phase.**

---

## Cross-references

- `RUNTIME_DEAD_CODE_REPORT.md` — drives Phase 1, 2, 10
- `CSS_GOVERNANCE_REPORT.md` — drives Phase 3, parts of 10
- `RUNTIME_OWNERSHIP_AUDIT.md` — drives all of Phase 7
- `SIDEBAR_GOVERNANCE_AUDIT.md` — drives Phase 4, 5, 6, 8, 9
- `CLAUDE.md` — governance rules being enforced
- `GOVERNANCE_AUDIT.md` (existing) — log new drift findings here

---

**End of plan.** This document is the entry point for cleanup PRs. Each PR should reference back to the specific phase + item it executes.
