# UI CONSISTENCY & STANDARDIZATION AUDIT

> **Date:** 2026-05-30 · **Scope:** entire app (all `*.html` + `features/**/*.js` + `*.css`)
> **Mandate:** *standardize & unify the existing visual language — NO redesign, NO logic/workflow/permission change, NO new/removed features.*
> **Method:** drive adoption of the central design system in `shared.css` (RULE U1 / C1.7 / L1), incrementally & reversibly (RULE E1 / G9). No big-bang.

---

## 0) Executive snapshot — the system is already centralized at the token level

The central design system in `shared.css` is **complete and well-built**:
tokens (`--b/--g/--r/--y/--p/--c/--o`, `--fs-*`, `--fw-*`, `--space-*`, tint
tokens, status colors), and components (`.btn*`, `.inp`, `.card`, `.tbl`/`.data-table`,
`.bdg*`, `.bdg-mini*`, `.alert*`, `.status-*`, `.txt-meta-*`, `.text-*`, flex/align utils).

Prior standardization PRs (#1326/#1328/#1330) already:
- migrated **every** exact-match color inline style to `var(--token)` utilities (0 remain),
- extracted nearly all large page-local `<style>` blocks to `*.css`,
- unified the employee-profile mini-badges (`.bdg-mini`) and info boxes (`.alert`).

**The remaining inconsistency is non-adoption of the central system, not its absence.**

| Metric (2026-05-30) | Value |
|---|---|
| Inline `style="…"` in root `*.html` | **~3,380** (was 5,759 in 2026-05) |
| Inline `style="…"` in `features/**/*.js` | **~10** |
| Exact-match color inline styles | **0** (fully migrated) |
| Page-local `<style>` blocks > 80 lines | **1** (`order.html`, 215 lines) |
| Inline buttons reinventing `.btn` | **~26** |
| Inline badges/pills reinventing `.bdg` | **~62** |
| Raw non-token hex literals | `#fff`×43, `#ff3d6e`×12, `#f03660`×7, misc |
| Pre-existing duplicate `class=` on nav links | **5** (`<a class="nav-link" … class="nav-link active">`) |

---

## 1) Phase 1 — DONE this PR (byte-equal, zero visual change)

Folded **95** repeated layout/align inline styles onto existing utilities across 30+ files:

| inline (before) | utility (after) |
|---|---|
| `style="flex:1;min-width:0"` | `flex-1 min-w-0` |
| `style="width:100%"` | `w-full` |
| `style="text-align:center/left/right"` | `text-center/text-left/text-right` |
| `style="cursor:pointer"` | `cursor-pointer` |

Added additive utilities to `shared.css`: `.text-left/.text-center/.text-right`,
`.cursor-pointer` (the `.flex-1/.min-w-0/.w-full` already existed).
Migration is guarded against JS-comparison false-matches (`scripts/migrate-layout-utils.py`).

---

## 2) Roadmap — follow-up phases (each = its own reviewed PR, RULE G9/E1)

These involve **visual normalization** (elements that currently *look* slightly
different snap to the canonical component). Each is small, reversible, and
needs a quick visual check before merge — hence separate PRs, not a big-bang.

| Phase | Concern | Target | Risk |
|---|---|---|---|
| **2 — Buttons** | ~26 inline buttons with custom `padding/border-radius` | `.btn` + size/color variants → identical primary/secondary actions | low-med (minor padding/radius normalization) |
| **3 — Badges/pills** | ~62 inline pills | `.bdg` / `.bdg-mini` + tonal modifiers | low (shade normalization to tint tokens) |
| **4 — Hex normalization** | `#ff3d6e`→`var(--r)`, `#f03660`→`var(--r)`, green/blue variants | canonical tokens (RULE U1.2/U1.5) | low (`#f03660` byte-equal; others tiny shade shift) |
| **5 — order.html `<style>`** | 215-line page-local block | extract to `order.css`, reuse `.card`/`.kpi` | low (move, no rule change) |
| **6 — Page-local CSS reinvention** | review 37 page `*.css` for classes that duplicate `shared.css` (`.rep-card`≈`.card`, period buttons, custom cards) | consolidate onto shared components | med |
| **7 — Nav active-state bug** | 5 `<a>` with duplicate `class=` (browser ignores `active`) | merge into one `class` | low (restores intended active styling — visible change) |
| **8 — Forms** | input/select/textarea/date — confirm all use `.inp` + `.fg` label pattern; normalize stragglers | `.inp` / `.fg` | low-med |
| **9 — Tables** | confirm all tables use `.data-table`/`.tbl`; unify header/row-height/action-button style | shared table classes | med |
| **10 — Responsive** | audit desktop/tablet/mobile for broken spacing / misalignment; fix via existing breakpoints in `shared.css` (no functional change) | tokens + existing media queries | med |

---

## 3) Non-negotiables (held throughout)

- ✅ No business logic / workflow / permission / backend / schema change.
- ✅ No new colors — existing palette only.
- ✅ No redesign — keep current design language.
- ✅ Every change byte-equal or a documented minor token-normalization.
- ✅ Incremental, reversible, one concern per PR (E1 / G9).
- ✅ Migrations verified with: corruption scan + `node --check` + leftover/double-class checks.

---

**Status:** Phase 1 shipped. Phases 2–10 await go-ahead, one PR at a time.
