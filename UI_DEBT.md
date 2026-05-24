# 🎨 UI TECHNICAL DEBT — AUDIT REPORT

> **Date:** 2026-05-24
> **Scope:** All `*.html` + `features/**/*.js` view modules + `*.css`
> **Goal:** Catalog every drift from RULE U1 (Central Design Tokens) — preserves current look, no visual change.
> **Phase 2 sub-PRs (2B-2E) will consume this list incrementally.**

---

## 1) Executive snapshot

| Category | Count | RULE violated |
|----------|------:|---|
| Inline `style="..."` in HTML pages | **~3700** | U1.6 |
| Inline `style="..."` in view modules | **~310** | U1.6 |
| Raw hex literals in pages/CSS | **~600+** | U1.2 |
| Raw `font-size:Npx` (not token) | **~400** | U1.3 |
| Raw `padding/margin:Npx` (not token) | **~2070** | U1.1 |
| Large inline `<style>` blocks per page | **15+ pages** > 80 lines | U1.6 |

These numbers reflect **existing technical debt** — not violations introduced by recent decomposition work. Phase 2 will reduce them in safe increments.

---

## 2) Inline style hotspots (top files)

### HTML pages

| File | `style="..."` count |
|------|---:|
| accounts.html | 355 |
| reports.html | 256 |
| print.html | 251 |
| approvals.html | 250 |
| shipping-accounts.html | 231 |
| employees.html | 212 |
| production.html | 211 |
| suppliers.html | 172 |
| employee-profile.html | 148 |
| design.html | 146 |
| products.html | 141 |
| my-profile.html | 109 |

### View modules (`features/`)

| File | `style="..."` count |
|------|---:|
| `employee-profile/views/render-overview-tab.js` | 48 |
| `employee-profile/views/render-admin-tab.js` | 44 |
| `reports/views/render-overview-detailed.js` | 41 |
| `employee-profile/views/render-password-card.js` | 31 |
| `reports/views/render-returns.js` | 28 |
| `employee-profile/views/render-score.js` | 25 |
| `employee-profile/views/render-salary.js` | 20 |
| `employee-profile/views/render-hero.js` | 20 |

---

## 3) Hex literal hotspots — RULE U1.2 violations

### Top 15 hex codes used (raw, not via `var(--*)`)

| Hex | Count | Should be | Notes |
|---|--:|---|---|
| `#fff` | 157 | `var(--snow)` | many in dark-mode contexts; tokenize to `--on-bright` or `--snow` per use |
| `#3b9eff` | 43 | `var(--b)` (#4a8ef5) | **legacy `--b`** — was `#3b9eff` before unification, drift remains |
| `#10b981` | 24 | `var(--g)` (#00d97e) | **legacy `--g`** — close-but-not-equal |
| `#ff3d6e` | 23 | `var(--r)` | byte-equal to current `--r` |
| `#000` | 22 | usually `var(--bg)` or context-specific | many in shadows/borders |
| `#a78bfa` | 21 | `var(--p)` | byte-equal to current `--p` |
| `#22d3ee` | 21 | `var(--c)` (#10c4de) | **legacy `--c`** — close-but-not-equal |
| `#647298` | 20 | `var(--dim2)` | byte-equal to current `--dim2` |
| `#a8b1cc` | 19 | `var(--snow)` adjacent | legacy contextual |
| `#ffffff` | 18 | `var(--snow)` | uppercase variant |
| `#4a8ef5` | 18 | `var(--b)` | byte-equal — should already be tokenized |
| `#fbbf24` | 16 | `var(--y)` adjacent (#ffaa00) | legacy yellow |
| `#2a3348` | 16 | `var(--bg5)` adjacent | legacy bg |
| `#4e5672` | 14 | `var(--dim2)` adjacent | legacy |
| `#FFFFFF` | 13 | `var(--snow)` | uppercase variant |

### Files with most hex literals

| File | Hex count |
|------|---:|
| `inbox.html` | 56 |
| `shared.css` | 55 (legitimate — tokens defined here) |
| `shipping-guide.html` | 43 |
| `waybill.html` | 41 |
| `order-handoff-mockup.html` | 28 (mockup — can be excluded) |
| `validate-financial.html` | 27 |
| `reports.html` | 17 |
| `employees.html` | 16 |
| `design.html` | 16 |

---

## 4) Per-page `<style>` block bloat — RULE U1.6 violations

Pages with inline `<style>` > 80 lines (should extract to `*.css`):

| File | Inline CSS lines |
|------|---:|
| `order-handoff-mockup.html` | 562 (mockup — low priority) |
| `exec-cost-entry.html` | 361 |
| `inbox.html` | 336 |
| `reports.html` | 329 |
| `shipping.html` | 319 |
| `waybill.html` | 154 |
| `employees.html` | 131 |
| `employee-profile.html` | 127 |
| `cs-dashboard.html` | 127 |
| `designer-hub.html` | 118 |
| `production.html` | 115 |
| `exec-dashboard.html` | 102 |

---

## 5) Phase 2 sub-PR plan

| PR | Scope | Estimated reduction |
|---|---|---|
| **2B-1** | Replace `#ff3d6e`, `#a78bfa`, `#4a8ef5`, `#647298`, `#10c4de` with their tokens (byte-equal subset) | ~80 hex literals removed |
| **2B-2** | Replace legacy variants (`#3b9eff`, `#10b981`, `#22d3ee`, `#fbbf24`) — **needs verification: same color or token's color wins** | ~95 hex literals removed |
| **2C-1** | High-frequency `style="display:flex;..."` patterns → `.row-flex`, `.row-gap-{sm/md}` utilities | ~200 inline styles consolidated |
| **2C-2** | `style="font-size:Npx"` → `var(--fs-*)` | ~400 raw font-sizes → tokens |
| **2D-1** | Extract `inbox.html` inline `<style>` (336 lines) → `inbox.css` | −336 lines from HTML |
| **2D-2** | Extract `reports.html`, `shipping.html`, `exec-cost-entry.html` `<style>` blocks | −1000+ lines from HTMLs |
| **2E** | View module inline styles → utility classes in `components.css` | ~310 inline styles consolidated |

Each sub-PR is small (one file or one concern), CI-gated, and visually behavior-equivalent (no look change).

---

## 6) Out of scope for Phase 2 (deferred)

- Light-theme polish (separate phase: visual refresh)
- New components/widgets (separate phase: feature work)
- Accessibility audit (separate phase: a11y)
- Performance (lazy load, virtualization — separate phase)
- Per-page redesigns (separate phase: UX)
- `order-handoff-mockup.html` (clearly a mockup, can be archived or excluded from cleanup)
