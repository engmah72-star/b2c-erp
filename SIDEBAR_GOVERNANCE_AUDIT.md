# SIDEBAR_GOVERNANCE_AUDIT

**Date:** 2026-05-25
**Scope:** Navigation patterns, sidebar systems, panel-ov modals, hash routing, embed-mode handling
**Mode:** Read-only audit of legacy navigation vs new Runtime Shell adoption.

---

## Executive Summary

النظام في **منتصف الانتقال** من Legacy Multi-Page ERP إلى Sidebar-driven Runtime Platform. الـ shell الجديد كامل وشغّال، لكن god pages لسه تستخدم الأنماط القديمة.

**Migration readiness: ~25%** — shell infrastructure stable, page-level adoption lagging.

| Concern | Count | Severity |
|---|---|---|
| Hardcoded `location.href` navigations | 35 across 13 pages | HIGH — full reloads inside shell |
| `panel-ov` modal overlays still active | 11 pages | CRIT — competes with shell context-sidebar |
| Hash-routing collision points | 5 pages | HIGH — page tabs vs `#ctx=order:X` |
| Pages using `B2CShell.openInWorkspace()` | 0 god pages | — API exists but not consumed |
| Abandoned navigation files | 1 (`sidebar-context-drawer.js`) | LOW — 0 references |
| Command-palette not shell-aware | 1 file | MED — full reload on Ctrl+K |
| Notifications force full reload | 1 file | MED — `notifications.js:346` |
| Mobile nav conflicts | 0 | ✅ Rail unifies mobile + desktop |
| Embed-mode handling | Assumed working | LOW — CSS exists, verify per page |

**The shell is solid — the work is plumbing god pages to use it.**

---

## 1. Hardcoded `location.href` (35 sites, 13 pages)

Each of these triggers a **full page reload** even when loaded inside `shell.html` iframe. Auth, state, listeners re-init.

### Dashboard pages (highest volume — drill-downs)

| File | Lines | Pattern |
|---|---|---|
| `designer-dashboard.html` | 367, 378, 532 | `onclick="location.href='design.html'"` (3 sites) |
| `cs-dashboard.html` | 414, 440, 516, 752 | Order detail cards + "Add Order" (4 sites) |
| `exec-dashboard.html` | 59, 296, 338, 347, 410, 423 | KPI drill-down to `accounts.html`/`reports.html` (6 sites) |
| `ops-dashboard.html` | 314, 319, 324, 329, 397 | Pipeline boxes → process step pages (5 sites) |
| `shipping-dashboard.html` | 71, 355 | Quick access + cards (2 sites) |

### Workflow pages (post-action redirects)

| File | Lines | Pattern |
|---|---|---|
| `design.html` | 1163, 1176 | `location.href='inbox.html'` after action |
| `clients.html` | 1042, 1056, 1511 | Same — redirect to inbox after stage change |
| `archive.html` | 664 | `setTimeout(()=>window.location.href='design.html',800)` |
| `shipping-accounts.html` | 1710, 1711 | `→ shipping-followup.html?...` |
| `financial-dashboard.html` | 387 | `setTimeout(...) → accounts.html` |
| `settings.html` | 590 | `setTimeout(...) → accounts.html` |
| `employee-profile.html` | 441, 462, 1427 | Back button + error recovery |
| `waybill.html` | 87 | History-empty fallback |
| `order.html` | 524 | Workflow-empty fallback |

**Migration helper to introduce:**

```js
// core/shell-navigate.js (new file)
export function navigatePage(url) {
  const shell = (window.top && window.top.B2CShell) || window.B2CShell;
  if (shell && typeof shell.openInWorkspace === 'function') {
    shell.openInWorkspace(url);
  } else {
    window.location.href = url; // standalone fallback
  }
}
```

Then bulk-replace `location.href = 'x'` → `navigatePage('x')` in the 13 pages.

---

## 2. `panel-ov` modal overlays (11 pages — CRIT)

Pre-shell pattern: clicking a row opens an inline overlay modal over the page grid. This **competes** with the new shell context-sidebar (which is the intended detail view).

| File | Panel ID | Notes |
|---|---|---|
| `production.html` | `#panel-ov` + `#cpanel-ov` | **CRIT** — nested modals (order + cost sub-panel) |
| `design.html` | `#panel-ov` | Order details over grid |
| `clients.html` | `#panel-ov` | Order preview from client row |
| `accounts.html` | `#panel-ov` | Wallet/transaction detail |
| `employees.html` | `#panel-ov` | Edit + KPI panel |
| `suppliers.html` | `#panel-ov` | Supplier detail |
| `archive.html` | `#panel-ov` | Archived order detail |
| `production-dashboard.html` | `#panel-ov` | Status modal |
| `print.html` | `#panel-ov` | Print job detail |
| `shipping-accounts.html` | `#acc-panel-ov` (variant id) | Account panel |
| `shipping.html` | `panel-ov` + `panel-card` structure | Modal-driven shipping workflow |

**Migration paths (choose per page):**

A. **Standalone:** route to `order.html?id=X` (already the new pattern — used by `production.html` for orders).
B. **Context-sidebar:** dispatch to shell context (`shell.openInContext({type:'order', id})`) — needs new sidebar-builder support.
C. **Defer:** keep panel-ov for non-order entities (suppliers/employees) until those domains migrate.

Start with: `design.html`, `clients.html`, `production.html` (highest traffic + already partially using `order.html`).

---

## 3. Hash-routing collisions (5 pages)

The shell uses `#ctx=<type>:<id>` for context navigation. Some god pages also read `location.hash` for their own state — collision risk.

| File | Pattern | Purpose | Risk |
|---|---|---|---|
| `my-profile.html` | `let activeTab=(location.hash\|\|'#overview').slice(1)` | Tab switching | Shell context overwrite |
| `employee-profile.html` | same | Tab switching | Same |
| `order.html` line 292 | `#client=${clientId}` hardcoded link | Deep link to client | Conflicts with `#ctx=order:X` |
| `reports.html` | `URLSearchParams(location.hash.slice(1))` | Report filters | Same |
| `core/sidebar-context.js` | `#ctx=...` (reserved by shell) | Shell context | **Owner** |

**Recommended fix:**
- Move page-internal state (tabs/filters) to **query string** `?tab=overview&filter=...`
- Reserve `location.hash` **only** for shell context navigation (`#ctx=...`)
- Pages embedded in shell (`html.embed-mode`) should ignore hash changes

---

## 4. Abandoned navigation files (1)

| File | Loaded by | Status |
|---|---|---|
| `sidebar-context-drawer.js` (203 lines) | **0 `<script>` tags load it directly** | Dead — still cached in `sw.js`. Loaded indirectly via `sidebar-config.js:139` (which is itself queued for removal) |
| `sidebar-context-drawer.css` (346 lines) | Same | Same |

Both can be deleted **together** as part of legacy sidebar removal. See `RUNTIME_DEAD_CODE_REPORT.md`.

---

## 5. Command-palette is not shell-aware

`command-palette.js:234`:
```js
function navigate(file) {
  window.location.href = file;  // ← full reload
}
```

Loaded on 53+ pages. Triggered by Ctrl+K. Should use the new `navigatePage()` helper.

**1-line fix** (after introducing helper):
```js
function navigate(file) {
  const shell = window.top?.B2CShell || window.B2CShell;
  if (shell?.openInWorkspace) shell.openInWorkspace(file);
  else window.location.href = file;
}
```

---

## 6. Notifications also force full reload

`notifications.js:346`:
```js
if (n?.link) window.location.href = n.link;
```

Same fix as command-palette. Clicking a notification while inside the shell should navigate the iframe, not reload the whole page.

---

## 7. Embed-mode handling (assumed working)

`sidebar-config.js:26-28` sets `html.embed-mode` in `<head>` if `?embed=1` is in the URL. The runtime shell appends this to every iframe load.

**Assumed working:** `shared.css` has rules to hide `.sidenav`, `.topbar`, `.mob-nav` when `html.embed-mode` is set. Cross-reference `CSS_GOVERNANCE_REPORT.md` for the obsolete sidebar styles section.

**Verification recommended:** spot-check 5 random god pages in iframe with `?embed=1`. Confirm no duplicate chrome appears.

---

## 8. Mobile navigation — ✅ no conflicts

The new rail system is the only mobile bottom-bar in the system. Old `.mob-nav` (shared.css:313) is the same bar — used for legacy pages only. Both can't be visible simultaneously due to embed-mode CSS.

**Searched for duplicate mobile menus:** `mobile.*nav`, `bottom-bar` outside `rail.js` — **0 conflicts**.

---

## 9. B2CShell API adoption

The API exists in `shell.html:131`:

```js
window.B2CShell = {
  activate, toggleSidebar, openSidebar, closeSidebar,
  openInWorkspace: (url) => ws.navigate(url),
  signals, logout, getUser, registerDomain,
};
```

**Current consumers:**
- `core/runtime-shell/sidebar-builder.js` lines 140, 167, 212 — used internally by domain configs
- **0 god pages** call `B2CShell.openInWorkspace()` directly

**Why:** Backward compatibility. God pages don't know they're in a shell.
**Cost:** Full reloads on every link click. UX broken inside shell.

---

## Migration roadmap (7 phases)

### Phase A — Safety net (1 PR)
1. Create `core/shell-navigate.js` with `navigatePage()` helper.
2. Delete `sidebar-context-drawer.js` + `.css` (zero references).
3. Document embed-mode contract in `CLAUDE.md`.

### Phase B — Dashboard refactor (1 PR per dashboard)
4. Replace `onclick="location.href='X'"` with `onclick="navigatePage('X')"` in:
   - `designer-dashboard.html` (3 sites)
   - `cs-dashboard.html` (4 sites)
   - `exec-dashboard.html` (6 sites)
   - `ops-dashboard.html` (5 sites)
   - `shipping-dashboard.html` (2 sites)

### Phase C — Post-action redirects (1 PR)
5. Replace `location.href=...` in workflow pages:
   - `design.html` (2)
   - `clients.html` (3)
   - `archive.html` (1)
   - `shipping-accounts.html` (2)
   - `financial-dashboard.html` (1)
   - `settings.html` (1)
   - `employee-profile.html` (3)

### Phase D — Shell-aware Ctrl+K + notifications (1 PR)
6. `command-palette.js:234` — wrap in `navigatePage()`.
7. `notifications.js:346` — wrap in `navigatePage()`.

### Phase E — Hash routing separation (1 PR per page)
8. Move `my-profile.html`, `employee-profile.html`, `reports.html` tabs from hash to query string.
9. Update `order.html:292` `#client=` deep link to use shell context.

### Phase F — Panel-ov sunset (1 PR per page, 6-8 weeks)
10. Page-by-page, replace `panel-ov` with either `order.html?id=` or shell context dispatch:
    - First: `design.html`, `clients.html`, `production.html`
    - Then: `accounts.html`, `archive.html`, `production-dashboard.html`, `print.html`, `shipping-accounts.html`
    - Defer: `suppliers.html`, `employees.html` (non-order entities, await domain migration)

### Phase G — Legacy sidebar removal (final PR)
11. After all god pages plumbed to shell:
    - Remove `<script src="sidebar.js">` from each page
    - Remove `<script src="smart-sidebar.js">` from each page
    - Remove `<script src="sidebar-config.js">` from each page
    - Delete `sidebar.js`, `smart-sidebar.js`, `sidebar-config.js`
    - Delete legacy CSS classes (`.sidenav`, `.mob-nav`, `.nav-*`) from `shared.css`

---

## Risk matrix

| Phase | Effort | Risk | Reversible? |
|---|---|---|---|
| A. Safety net | Low | None | Yes |
| B. Dashboard refactor | Med | Low | Yes (per page) |
| C. Workflow redirects | Med | Low | Yes (per page) |
| D. Ctrl+K + notifications | Low | Low | Yes |
| E. Hash separation | Med | Med (page state migration) | Yes |
| F. Panel-ov sunset | High | High (UX flow change per page) | Yes (per page) |
| G. Legacy sidebar removal | Low | **Very high if premature** | No (cache + 35 pages affected) |

**Phase G is the irreversible step.** All other phases preserve dual-mode (works inside shell + standalone).

---

## Cross-references
- `RUNTIME_DEAD_CODE_REPORT.md` — confirms which legacy files can be deleted in Phase G
- `CSS_GOVERNANCE_REPORT.md` — coordinates CSS removal in Phase G
- `RUNTIME_OWNERSHIP_AUDIT.md` — many of these pages also have governance violations
- `CLEANUP_PLAN.md` — synthesizes phasing across all four audits
