# CSS_GOVERNANCE_REPORT

**Date:** 2026-05-25
**Scope:** ~8,700 lines CSS across 36 files + inline `<style>` blocks in 6 HTML pages
**Mode:** Read-only audit. Cataloged violations of RULE U1.* (tokens-only) + cleanup candidates.

---

## Executive Summary

| Category | Items | Severity Mix |
|---|---|---|
| Duplicate panel/modal definitions | 3 files | **CRIT** — same class defined 2-3 times with different z-index |
| Z-index fragmentation | 50+ declarations across 20 files | **CRIT** — no documented hierarchy; arbitrary values 9000-10000 |
| `!important` overuse | 150 total, 85 in `shared.css` alone | **CRIT** — cascade fights, hard to override |
| Obsolete sidebar styles | 5 root classes | **HIGH** — load-bearing for legacy pages, delete only after migration |
| Unused tokens | 10 (`--st-*`, `--ring-r`, `--tint-o-*`) | **MED** — safe to remove `--ring-r` and orange tints; verify `--st-*` |
| Dead keyframe | 1 (`journeyPulse`) | **LOW** — never applied to any element |
| Large inline `<style>` blocks (30-44 lines) | 3 pages | **MED** — should extract to CSS files |
| Dead class names | 3 (`.modal-card`, `.modal-overlay`, `.dialog`) | n/a — defined nowhere, just legacy references |

**Biggest single fix:** Consolidate z-index system + remove duplicate `.panel-ov`/`.modal`/`.overlay` definitions = ~50 lines deleted, eliminates stacking bugs.

**Riskiest cleanup:** Refactoring 85 `!important` rules in `shared.css` — wide blast radius, requires full visual regression test.

---

## 1. Duplicate panel/modal definitions (CRIT)

| Class | Defined In | Z-index | Action |
|---|---|---|---|
| `.panel-ov` | `shared.css:383` | 200 | **KEEP** (canonical) |
| `.panel-ov` | `production.css:35` | 200 | **DELETE** (duplicate) |
| `.panel-ov` | `production-dashboard.css:34` | 200 | **DELETE** (duplicate) |
| `.modal` | `shared.css:396` | (inherits from `.overlay` 300) | **KEEP** (canonical) |
| `.modal` override | `shipping.css:118` | 9999 | **DELETE** — bumps z to arbitrary high, breaks layering |
| `.overlay` | `shared.css:394` | 300 | **KEEP** (canonical) |
| `.overlay` | `exec-cost-entry.css:98` | 300 | **DELETE** (duplicate) |

**Net cleanup:** 4 duplicate definitions removable. Zero behavior change expected (definitions are identical except the shipping override which is the actual bug).

---

## 2. Z-index fragmentation (CRIT)

### Conflict zones

| Z-index | Count | Classes | Risk |
|---|---|---|---|
| **100** | 3+ | `.sidenav`, `.mob-nav`, `.nav-overlay`, `.waybill .ov` | DOM-order dependent stacking; mobile menu may not overlay sidebar |
| **200** | 5+ | `.panel-ov` (3 dups), `.ov-exp`, `.print-container` | Multiple overlays at same level |
| **300** | 2+ | `.overlay`, `.ov-exp` (production-dashboard) | Modal + expanding panels compete |
| **9000-10000** | 5+ | `.ib-modal-ov` (9000), `.ib-actions-ov` (9500), `.modal` shipping override (9999), `.toasts` (9999), `.ib-sv-ov` (10000) | Arbitrary max layers, no documented hierarchy |

### Runtime Shell vs Legacy z-index conflict

| System | Z range | Classes |
|---|---|---|
| **Runtime Shell** | 55-70 | `.rt-backdrop` (55), `.rt-drawer`/`.cs-search-results` (60), `.rt-fab` (70) |
| **Legacy mobile** | 90-100 | `.fab` (90), `.sidenav`/`.mob-nav` (100) |

**Issue:** If both systems are active simultaneously (which happens when god pages load in iframe with `?embed=1`), the legacy `.fab` (90) appears above the runtime `.rt-drawer` (60) — confusing UX.

### Recommended token system (proposed for `shared.css`)

```css
--z-sticky: 5;          /* table headers, sticky filters */
--z-dropdown: 20;       /* menus, popovers */
--z-topbar: 50;         /* page top bar */
--z-shell-backdrop: 55; /* runtime shell mobile backdrop */
--z-shell-drawer: 60;   /* runtime shell mobile drawer */
--z-shell-fab: 70;      /* runtime shell FAB */
--z-modal-backdrop: 200;
--z-modal: 300;
--z-toast: 9999;        /* top-most for transient UI */
```

Migrate all arbitrary z-index values to these tokens. ~50 declarations to update.

---

## 3. `!important` overuse (CRIT)

| File | Count | Sample lines | Notes |
|---|---|---|---|
| `shared.css` | **85** | 747 (nav-overlay), 908, 1320 (light mode) | Heavy in responsive + theme switching — cascade design issue |
| `shipping-guide.css` | 11 | print rules | Acceptable for `@media print` |
| `shipping.css` | 8 | modal/lightbox | Suspect |
| `reports.css` | 7 | print view | Mostly acceptable |
| `clients.css` | 7 | responsive fixes | Suspect |
| `waybill.css` | 5 | print | Acceptable |
| `runtime-shell.css` | 4 | new system | ⚠ New code shouldn't need `!important` — refactor |
| others | ≤3 each | minor | Tolerable |

**Pattern of misuse (shared.css:1320):**
```css
/* WRONG — uses !important to override theme */
:root[data-theme="light"] .card { border: 1px solid #ccc !important; }

/* RIGHT — change the token, cascade handles it */
:root[data-theme="light"] { --line: #ccc; }
.card { border: 1px solid var(--line); }
```

**Priority:** Fix `runtime-shell.css` (4 instances) first — it's a NEW file and should not need overrides. Then chip away at `shared.css` (85) in small batches per visual area.

---

## 4. Obsolete sidebar styles (HIGH — load-bearing)

| Class | File:Line | Status |
|---|---|---|
| `.sidenav` | `shared.css:246` | Active in 28+ legacy pages. Not used by Runtime Shell. |
| `.nav-link` | `shared.css:268` | Same |
| `.nav-scroll` | `shared.css:278` | Same |
| `.mob-nav` | `shared.css:313` | Same |
| `.nav-brand`, `.nav-logo` | `shared.css:251-256` | Same |
| `.sb-ctx-*` (entire system) | `sidebar-context-drawer.css:9-346` | Loaded only by `sidebar-context-drawer.js` — both queued for removal |

**Don't delete yet.** These are load-bearing for every god page. Delete in coordination with `SIDEBAR_GOVERNANCE_AUDIT.md` migration phase.

---

## 5. Unused tokens (MED)

| Token | File:Line | Action |
|---|---|---|
| `--ring-r` | `shared.css:78` | **Safe delete** — 0 references |
| `--tint-o-soft` | `shared.css:75` | **Safe delete** — 0 references |
| `--tint-o-med` | `shared.css:123` | **Safe delete** — 0 references |
| `--tint-o-line` | `shared.css:153` | **Safe delete** — 0 references |
| `--st-new`, `--st-design`, `--st-print`, `--st-late`, `--st-urgent`, `--st-completed` | `shared.css:26-31` | **Verify first** — may be referenced by inline JS badge styling |

**Verification command for `--st-*`:**
```bash
grep -rn "st-new\|st-design\|st-print\|st-late\|st-urgent\|st-completed" \
  --include='*.js' --include='*.html' --include='*.css' .
```

---

## 6. Dead animations

| Keyframe | File:Line | Status |
|---|---|---|
| `@keyframes journeyPulse` | `clients.css:18` | **DEAD** — never applied to any `.journey-*` class. Safe delete. |
| `@keyframes skeleton` | `design-system/components.css:876` | Verify usage — likely internal. |

---

## 7. Large inline `<style>` blocks (MED — extract to CSS)

| Page | Lines in `<style>` | Action |
|---|---|---|
| `report-bug.html` | 44 | Extract → `report-bug.css` |
| `validate-financial.html` | 36 | Extract → `validate-financial.css` |
| `supplier-requests.html` | 34 | Extract → `supplier-requests.css` |
| `offline.html` | 24 | Keep inline (diagnostic page, minimal) |
| `reset-sw.html` | 16 | Keep inline (diagnostic page, minimal) |
| `exec-dashboard.html` | 1 (`body.auth-gate{visibility:hidden}`) | Keep (auth gate pattern) |

RULE U1.6 says no `<style>` block > 50 lines. The 3 candidates (34-44 lines) are approaching the limit and should migrate.

---

## 8. Dead class names (never defined)

These are referenced in code/comments but **defined nowhere**:
- `.modal-card`
- `.modal-overlay`
- `.dialog`

Likely legacy from older design. No CSS rules to remove — only documentation to update.

---

## 9. Duplicate spacing (low-grade RULE U1.1 drift)

`approvals.css` mixes tokens and hardcoded pixels:

```css
approvals.css:1   .tabs-bar { gap: 6px }                    /* should be var(--space-xs) */
approvals.css:14  .ac-head  { gap: var(--space-md) }         /* CORRECT */
approvals.css:25  .ac-actions { gap: var(--space-sm) }       /* CORRECT */
```

`production.css`, `production-dashboard.css` have similar inconsistency. **Not urgent** — values are token-equivalent. Tackle in a focused PR if/when normalizing.

---

## Risk Matrix

| Action | Risk | Reversibility |
|---|---|---|
| Delete `journeyPulse` keyframe | None | Easy (re-add if needed) |
| Delete unused tokens (`--ring-r`, `--tint-o-*`) | None | Easy |
| Remove duplicate `.panel-ov` from production* | Low | Easy |
| Remove `.modal` override in `shipping.css` | Low | Test shipping modal stacking |
| Remove `.overlay` duplicate in `exec-cost-entry.css` | Low | Test exec-cost-entry modals |
| Extract inline `<style>` blocks | None | Pure mechanical |
| Refactor 85 `!important` in `shared.css` | **HIGH** | Visual regression test all pages |
| Introduce z-index token system | Med | Migrate gradually per page |
| Delete `--st-*` status tokens | Med | Verify no JS consumer first |
| Delete legacy sidebar CSS (`.sidenav`, `.mob-nav`, etc.) | **CRIT** | Only after all god pages embedded in shell |

---

## Cross-references
- `RUNTIME_DEAD_CODE_REPORT.md` — coordinates `sidebar-context-drawer.css` deletion
- `SIDEBAR_GOVERNANCE_AUDIT.md` — coordinates legacy sidebar CSS removal
- `CLEANUP_PLAN.md` — phased execution
