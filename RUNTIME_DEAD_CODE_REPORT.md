# RUNTIME_DEAD_CODE_REPORT

**Date:** 2026-05-25
**Scope:** JS modules, helpers, listeners, feature flags, abandoned experiments
**Mode:** Read-only audit — لا حذف ولا تعديل. Reports only.

---

## Executive Summary

| Category | Count | Notes |
|---|---|---|
| **SAFE to delete** | 4 | Pure stubs + truly orphan modules. No imports anywhere. |
| **RISKY** | 6 | Still loaded — but role overlaps with new Runtime Shell. Delete only after full god-page migration. |
| **NEEDS VERIFICATION** | 8 | Partially used, unclear intent, or dynamically loaded. Verify usage manually before action. |
| **NO (load-bearing)** | n/a | Old takeover defensive code in `sidebar-config.js` — keep until cache TTL clears. |

**Biggest single win:** Delete `ai-context.js` (398 lines / 16KB) — exports never imported anywhere. Pure dead code.

**Next-biggest:** Delete 3 redirect stub pages (`chat.html`, `gallery.html`, `client-design-library.html`) — ~3KB combined, zero behavior.

---

## SAFE to delete (4 items)

| File / Symbol | Type | Lines | Evidence | Action |
|---|---|---|---|---|
| `chat.html` | stub HTML | 23 | `<meta http-equiv="refresh" content="0; url=inbox.html">` + JS `location.replace('inbox.html')` | Delete |
| `gallery.html` | stub HTML | 18 | Same redirect pattern → `designer-hub.html` | Delete |
| `client-design-library.html` | stub HTML | 18 | Same redirect pattern → `designer-hub.html` | Delete |
| `ai-context.js` | orphan module | 398 | Exports `DOMAIN_ACCESS`, `DOMAIN_LABELS`, `getAccessibleDomains`, `buildContext`, 8 builders — **0 grep references** outside the file | Delete |

**Verification command:**
```bash
grep -rn "from ['\"].*ai-context" --include='*.js' --include='*.html' .
# expected: 0 results
```

---

## RISKY — delete only after full Runtime Shell migration (6 items)

These files are **still actively loaded** by god pages. They overlap functionally with the new Runtime Shell but are NOT dead while god pages remain standalone.

| File | Lines | Currently Loaded By | Role | When safe |
|---|---|---|---|---|
| `sidebar.js` | 134 | All god pages (35+ HTML) | Old multi-page nav guard + builder | After all god pages embedded in `shell.html` |
| `smart-sidebar.js` | 456 | 35+ dashboard/main pages | Old sidebar: favorites, search, usage flames | After full shell rollout |
| `sidebar-config.js` | 165 | Every god page (head script) | `SIDEBAR_PAGES`, `ROLE_HOME`, embed-mode detection | After full shell rollout |
| `sidebar-context-drawer.js` | 203 | Auto-loaded by `sidebar-config.js` line 139 | Old "context drawer" — superseded by `core/runtime-shell/context-sidebar.js` | After god pages drop sidebar-config |
| `sidebar-context-drawer.css` | 346 | Auto-loaded by `sidebar-config.js` line 133 | CSS for above | Same as above |
| `finance-core.js` | 110 | `shipping-accounts.html`, `print.html` (script tag, not ES6 import) | Pre-FSE financial helpers; partially superseded | Verify pages still need it |

**⚠ Cross-cutting:** `sidebar-context-drawer.js` + `.css` were the bridge between "sidebar takeover" experiment (replaced) and Runtime Shell (current). Now functionally replaced by `core/runtime-shell/context-sidebar.js`. But still loaded — removing requires confirming no god page consumes `B2CContext` API.

---

## NEEDS VERIFICATION (8 items)

| File / Symbol | Loaded? | Concern | Verification step |
|---|---|---|---|
| `core/storage-helpers.js` | Imports exist | Some exported `KINDs` may be unused. RULE S1.3 says all uploads should pass through this — but god pages still call `uploadBytes` inline (see Ownership audit S1.3). | Audit each export. Mark unused KINDs for removal. |
| `mobile-bridge.js` | Dynamic import in `shared.js` | Capacitor/PWA bridge. Verify mobile app build still uses it. | `grep -rn "mobile-bridge\|Capacitor" .` |
| `fcm-init.js` | Imported by `notifications.js` | FCM push notifications. Verify backend topic subscriptions active. | Test on staging — does FCM ever deliver? |
| `ai-launcher.js` + `ai-engine.js` + `ai-search.js` + `ai-today.js` + `clients-ai-search.js` | Loaded on 30+ pages | AI feature — uses external API key. Whose key? Still budgeted? | Check `localStorage` for `OPENAI_API_KEY`; ask user. |
| `core/sidebar-context.js` | Auto-loaded by `sidebar-config.js:125` | Pub/sub bus for entity selection. Primary consumer is `sidebar-context-drawer.js` (queued for removal). Without that, B2CContext has no consumers. | Confirm no Runtime Shell module subscribes to `B2CContext.on()`. |
| `core/context-renderers/order-renderer.js` | Dynamic import from `sidebar-context-drawer.js` | Renders order detail in context panel. Dies with parent. | Remove together with sidebar-context-drawer. |
| `--st-new`, `--st-design`, `--st-print`, `--st-late`, `--st-urgent`, `--st-completed` tokens | shared.css:26-31 | 0 references in CSS. May be referenced by JS for inline badge styling. | `grep -rn "st-new\|st-design\|st-print" --include='*.js' --include='*.html'` |
| `_archive/*` | Already in archive | 4 files moved by PR #789 (Phase-4B). Confirm no commit references them. | `git log --all --diff-filter=A --name-only -- _archive/ | head` |

---

## Active dead code patterns

### Defensive cleanup for stale takeover experiment

`sidebar-config.js:36-58` actively kills old DOM from the abandoned "sidebar takeover" experiment (PR #873, replaced in #875). The cleanup loop runs on every page load:

```js
window.B2C_TAKEOVER_ENABLED = false;
// purges .sb-panel-host, .sb-takeover-* classes from any cached DOM
```

**Status:** Keep for 2-4 weeks more (until aggressive PWA cache TTL clears for all users). Tag for removal in CLEANUP phase 4.

### Zombie listeners

**Searched:** all `addEventListener` calls in legacy modules.
**Result:** ✅ No zombie listeners found. All attach to `document`/`window` or use optional chaining (`?.addEventListener`).

### Duplicate validators

**Searched:** `isAdmin()`, role checks, money formatters, status checks.
**Result:** ⚠ Two-tier role checks intentionally present:
- `sidebar.js` `isAdmin()` (line 48) — lightweight nav-gating
- `core/permissions-matrix.js` `canDo()` — strict capability check (RULE P1)

This is **intentional separation**, not duplication. But the long-term direction is `canDo()` everywhere (P1.3).

---

## Files by category

### HTML stubs (pure redirects — safe delete)
- `chat.html`
- `gallery.html`
- `client-design-library.html`

### Orphan JS modules (safe delete)
- `ai-context.js`

### Legacy sidebar system (delete after Runtime Shell migration)
- `sidebar.js`
- `smart-sidebar.js`
- `sidebar-config.js`
- `sidebar-context-drawer.js`
- `sidebar-context-drawer.css`
- `core/sidebar-context.js`
- `core/context-renderers/order-renderer.js`

### Pre-FSE legacy helpers (verify then delete)
- `finance-core.js`

### Verification queue
- `core/storage-helpers.js` (exports audit)
- `mobile-bridge.js` (Capacitor active?)
- `fcm-init.js` (FCM active?)
- AI cluster (5 files — budget question)
- Status tokens `--st-*` (any JS consumer?)

---

## Order of operations

| Order | Action | Lines removed | Risk |
|---|---|---|---|
| 1 | Delete 3 HTML stubs | ~60 | None |
| 2 | Delete `ai-context.js` | 398 | None |
| 3 | Verify storage-helpers exports + delete unused KINDs | varies | Low |
| 4 | Verify AI cluster usage with user — keep or delete all 5 together | ~600 | Medium (UX feature flag) |
| 5 | Verify mobile-bridge + fcm-init are wired in mobile app build | n/a | Medium |
| 6 | **Wait** — leave legacy sidebar system intact until Runtime Shell migration plan executes | ~1300 | High (breaks every god page if premature) |

---

**Cross-references:**
- See `CSS_GOVERNANCE_REPORT.md` for `sidebar-context-drawer.css` deletion coordination
- See `SIDEBAR_GOVERNANCE_AUDIT.md` for the order in which god pages can drop legacy sidebar
- See `CLEANUP_PLAN.md` for phased execution roadmap
