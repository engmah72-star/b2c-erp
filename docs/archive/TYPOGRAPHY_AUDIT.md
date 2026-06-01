# Typography System Audit & Refactor — 2026-05-30

> **Scope:** Typography, readability, consistency, visual quality **only**.
> No business logic, APIs, workflows, permissions, routing, or backend changes.
> Aligned with **RULE U1.3 (Central Typography)** and **RULE E1 (Runtime Evolution Safety)** —
> additive, backward-compatible, reversible by reverting the touched files.

---

## 1. Typography Architecture

The system now has a **single source of truth** for the font family, exposed as the
CSS variable `--font-ar`, defined once per token context and kept byte-identical
everywhere:

```
Token context                     Used by
──────────────────────────────────────────────────────────────
shared.css                  →  ~50 app pages (main ERP shell + god pages)
design-system/tokens.css    →  *-ds.html showcase pages + components.css
runtime-shell.css           →  shell.html runtime chrome
features/cost-items/drawer.css → cost-items drawer component
login.css / client-portal.css / order-tracking.css / waybill.css → standalone portals
change-password / client-login / privacy / 404 (inline :root) → standalone pages
```

Layers (unchanged structure, now consistent values):

```
HTML <link> (one canonical Google Fonts URL on every page)
        +
@import in shared.css / colors_and_type.css / runtime-shell.css  (safety net)
        ↓
--font-ar  (family SSOT)  ──┐
--fs-*     (size scale)     ├─ shared.css :root (RULE U1.3 tokens)
--fw-*     (weight scale)   │
--lh-*     (line-height)  ──┘
        ↓
body { font-family: var(--font-ar); -webkit-font-smoothing:antialiased; ... }
        ↓
Components/pages reference var(--font-ar) / var(--fs-*) / var(--fw-*) — never literals
```

---

## 2. Design Token Structure (already centralized in `shared.css`)

| Group | Tokens |
|-------|--------|
| **Font family** | `--font-ar` (primary bilingual), `--font-num` (numeric/UI emphasis), `--font-mono` (tabular/code) |
| **Size scale** | `--fs-tiny:9` `--fs-xs:10` `--fs-sm:11` `--fs-base:12` `--fs-md:13` `--fs-lg:14` `--fs-xl:16` `--fs-2xl:18` `--fs-3xl:22` `--fs-4xl:28` |
| **Weight scale** | `--fw-normal:400` `--fw-medium:500` `--fw-semi:600` `--fw-bold:700` `--fw-extra:800` `--fw-heavy:900` |
| **Line height** | `--lh-tight:1.1` `--lh-snug:1.3` `--lh-base:1.5` `--lh-relaxed:1.7` |
| **Semantic helpers** | `.b2c-display / .b2c-h1..h4 / .b2c-body / .b2c-small / .b2c-meta / .b2c-label-caps / .b2c-kpi / .b2c-mono / .b2c-num` (in `colors_and_type.css`) — cover Heading / Body / Caption / Button / Table / Form text roles |

These token groups were already present and are preserved; this refactor unified the
**font family** value and the **font loading**, which were previously divergent.

---

## 3. Fonts Selected

| Role | Font | Rationale |
|------|------|-----------|
| **Latin / digits / UI** | **Inter** | Crisp, modern, excellent at the system's small UI sizes (9–16px); great tabular numerals for financial tables. |
| **Arabic** | **Cairo** | Modern, highly legible Arabic; same designer lineage as the previous Tajawal so metrics are close (low layout-shift risk). |
| **Fallbacks** | Tajawal → IBM Plex Sans Arabic → `system-ui` → `-apple-system` → Segoe UI → sans-serif | Zero-regression: if Inter/Cairo fail to load, the previous fonts still apply. |

**Canonical stack:**
```css
--font-ar: 'Inter','Cairo','Tajawal','IBM Plex Sans Arabic',system-ui,-apple-system,'Segoe UI',sans-serif;
```
Browsers resolve fonts **per glyph**: Latin/digits use Inter (no Arabic glyphs → falls
through), Arabic uses Cairo. This delivers excellent bilingual rendering in one stack.

**Canonical loader (every page):**
```html
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

---

## 4. Files Modified (61)

**Central token / loading (5):**
- `shared.css` — font `@import` → Cairo+Inter; `--font-ar` → bilingual stack; added `--font-num`; added cross-platform font-smoothing on `body`.
- `design-system/tokens.css` — `--font-ar` synced.
- `colors_and_type.css` — font `@import` → Cairo+Inter+Roboto Mono.
- `runtime-shell.css` — font `@import` → Cairo+Inter; added `--font-ar` token; `body.rt-body` → `var(--font-ar)`.
- `features/cost-items/drawer.css` — `--font-ar` synced.

**Hardcoded `font-family` → `var(--font-ar)` (CSS, 4):**
- `production.css` (×7), `login.css`, `client-portal.css`, `order-tracking.css`, `waybill.css` (added own `:root` token).

**Hardcoded `font-family` → `var(--font-ar)` (HTML inline, 9):**
- `gallery.html`, `client-design-library.html`, `design-workspace.html`, `chat.html`,
  `offline.html`, `financial-dashboard.html`, `change-password.html`, `client-login.html`, `privacy.html`.
- `404.html` — has no token system → uses the canonical literal stack directly.

**Unified Google Fonts `<link>` (46 HTML pages):** all `*.html` that loaded the lone
Tajawal stylesheet now load the single canonical Cairo+Inter URL.

**Cache:** `sw.js` `CACHE` bumped `b2c-v292 → b2c-v293` so the new fonts/CSS propagate.

---

## 5. Components Updated

- **Buttons / tabs / inputs / tables / cards / modals** — already used `font-family:inherit`
  (inherits `--font-ar` from `body`); no change needed, now inherit the new stack automatically.
- **Production workspace controls** (`.ftab .sup-btn .wa-btn .cost-add-btn .status-btn .ship-btn .note-inp`) — switched from hardcoded Tajawal to `var(--font-ar)`.
- **Runtime shell chrome** (`body.rt-body`) — tokenized.
- **Standalone portals** (login, client portal, order tracking, waybill, change-password, client-login, privacy) — tokenized via their own `:root`.

---

## 6. Remaining Typography Issues (flagged, intentionally out of scope)

1. **Size-scale divergence between `shared.css` and `design-system/tokens.css`.**
   `--fs-sm` = 11px in `shared.css` but 13px in `tokens.css` (different 8-step scale).
   On app pages `shared.css` wins (loaded last); on `*-ds.html` showcase pages `tokens.css`
   wins. Reconciling the **size** scales would change showcase-page metrics and risks layout
   shifts, so it is deferred (RULE E1 / G9 — incremental). Font **family** is now unified.
2. **`mobile/www/index.html`** — native Cordova splash using a system stack with Cairo/Tajawal
   fallback. It renders before any web font loads and has no token access; left as-is.
3. **`_archive/*`** — mockups/legacy, deliberately untouched.
4. **Many `font-size`/`font-weight` literals** still exist inline across god pages (e.g.
   `font-size:15px`). These predate this work; migrating them to `--fs-*`/`--fw-*` is tracked
   under RULE U1 debt and should proceed page-by-page.

---

## 7. Before / After Summary

| Aspect | Before | After |
|--------|--------|-------|
| Arabic font | Tajawal (loaded), IBM Plex (shared.css @import) — inconsistent | **Cairo** (primary), legacy kept as fallback |
| Latin/UI font | Same as Arabic (Tajawal) | **Inter** (per-glyph), crisp at small sizes |
| Font `<link>` | 46 duplicated Tajawal-only tags + diverging @imports | **1 canonical** Cairo+Inter URL everywhere |
| `--font-ar` value | 4 different definitions (shared/tokens/drawer/_archive) | **1 identical** value in 11 contexts |
| Hardcoded `font-family` (brand) | 22 occurrences | **0** (only `404.html` uses the canonical literal by necessity) |
| Cross-platform rendering | no smoothing hints on body | `-webkit-font-smoothing` + `text-rendering` added (no layout impact) |
| Reversibility | n/a | Revert these files → exact previous state |

**Validation performed:** static audit (grep) confirms 0 stray brand `font-family` literals,
0 leftover old font loads, and 11 byte-identical `--font-ar` definitions. RTL (`dir="rtl"`)
and the dark/light theme tokens are untouched, so RTL and dark mode behave exactly as before.
Visual per-page/responsive verification in a live browser is recommended as a follow-up
(no automated browser is available in this environment).
