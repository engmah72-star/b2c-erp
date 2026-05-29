# 🏛️ ERP LAYERED ARCHITECTURE — Strict Separation of Concerns

> **Purpose:** A complete architectural framework where **Business Logic, Data, UI, UX,
> Branding, Themes, Colors, Typography, and Visual Components are fully independent**.
> Changing the *entire* UI/UX or branding must **never** touch the operational engine.
>
> **Status:** Canonical target architecture (descriptive of where the system is + where it goes).
> **Authority:** Subordinate to `CLAUDE.md`. Realized **incrementally** under **RULE E1**
> (Runtime Evolution Safety) — *no rewrite, alongside-not-instead-of, reversible*.
> **Consolidates existing rules:** L1 (Layer Independence) · U1 (UI Centralization) ·
> V1 (Validation) · A1 (Actions) · C1/C2 (Centralization/Constants) · P1 (Permissions) ·
> PC1–PC3 (Process-Centric) · F1/R1 (Firebase/Rules) · H3 (Audit).

---

## 0) The One Rule Above All

> **Dependencies point in ONE direction: from the volatile (pixels) toward the stable (money).**
> The operational engine never imports, references, or knows about the UI, theme, or brand.

```
   VOLATILE  ───────────────────────────────────────────────▶  STABLE
   (changes weekly)                                       (changes ~never)

   Theme/Brand → Design System → UI Components → UX/Workflow → Business Logic → Data
        ▲ may be swapped wholesale                              ▲ never changed by a redesign
```

If a layer on the left disappeared entirely, every layer to its right must still compile,
run, and pass its tests. That single property is what makes "rebrand everything" a CSS-file
operation, not an ERP rewrite.

---

## 1) The Layer Model (9 layers, 1 direction)

| # | Layer | Owns | Volatility | Location (today) |
|---|-------|------|-----------|------------------|
| **L0** | **Data** | Collections, schemas, indexes, security rules | Very low | Firestore + `firestore.rules` + `firestore.indexes.json` |
| **L1** | **Business Logic** | Workflows, validation, calculations, financial events, automation, statuses | Very low | `orders.js`, `order-actions.js`, `financial-sync-engine.js`, `core/*.js` (pure) |
| **L2** | **Permissions & Policy** | Who-can-do-what, data-access boundaries | Low | `core/permissions-matrix.js`, `firestore.rules` |
| **L3** | **Audit & Telemetry** | Immutable history, operation tracing | Low | `core/audit.js`, `core/telemetry.js`, `financial_ledger` |
| **L4** | **UX / Workflow Orchestration** | Navigation flows, task routing, information hierarchy, signals | Medium | `core/runtime-shell/*`, `core/domains/*`, `core/process-pipeline/*` |
| **L5** | **UI Components** | Reusable buttons, tables, forms, cards, modals, sidebars, nav | Medium-high | `design-system/components.css`, `features/*/components/` |
| **L6** | **Design System (Tokens)** | Colors, typography, spacing, shadows, radius, icons, responsive rules | High | `design-system/tokens.css` |
| **L7** | **Theme Engine** | Token *values* per identity, theme switching | High | `theme.js` + `[data-theme]` + (new) `themes/*` |
| **L8** | **Branding / White-Label** | Per-tenant identity: logo, palette, name, fonts | Very high | (new) `tenant_branding` doc + `themes/<tenant>.css` |

> **L0–L3 = the Operational Engine.** It is the asset. **L4–L8 = the Experience.**
> A white-label deployment changes **only L6–L8**. A redesign changes **only L4–L7**.
> Neither ever edits L0–L3.

---

## 2) Layer Contracts (responsibility · owns · must-NOT)

### L0 — Data Layer
- **Owns:** Firestore collection shapes, field names, `tenantId`, indexes, write/read rules.
- **Must NOT:** contain any presentation field (no `color`, no `cssClass`, no `iconUrl` that
  drives layout). Status is a **semantic enum** (`stage: 'shipping'`), never a visual value.
- **Rule:** *Changes in screens, layouts, colors, or themes must never require a schema change.*
  Conversely, a schema change must never be motivated by a visual need.
- **Test:** Drop the entire UI; the data and rules still validate and migrate.

### L1 — Business Logic Layer
- **Owns:** stage machine (`buildStageAdvance/Revert`, `advanceOrderStageWithLock`),
  validators (`validate*` → `{ok, errors, warnings}`), money engine (`dispatchFinancialEvent`,
  `addLedgerToBatch`), pure calculators (`calcRem`, KPIs), automation rules.
- **Must NOT:** import any file from L4–L8. No DOM, no CSS, no `window`, no color, no label
  intended for a specific screen. Arabic *domain* labels (`STAGES[x].label`) are data, not styling.
- **Shape:** every operation returns the **uniform contract** `{ ok, errors, warnings, operationId, ... }` (H1.5).
- **Test:** runs headless in Node (proven: `core/order-math.js`, `core/audit.js`,
  `core/process-pipeline/pipeline-model.js` are Node-tested with zero browser deps).

### L2 — Permissions & Policy
- **Owns:** `canDo(capability)`, `canSee(field)`, `hasPage(page)`, `STAGE_PERMISSIONS`, role→capability defaults.
- **Single source:** `core/permissions-matrix.js` (UI) mirrored by `firestore.rules` (server).
- **Must NOT:** hardcode roles in pages (`if role in [...]`) or grant authority by uid/email (PC1.6/X1.3).

### L3 — Audit & Telemetry
- **Owns:** universal audit entry (`auditEntry` — date+actor mandatory, H3), action traces.
- **Must NOT:** be optional. Every mutation in L1 emits an audit entry; append-only (H1.3).

### L4 — UX / Workflow Orchestration
- **Owns:** *how the user moves* — rail, context sidebar, workspace host, signals, the
  process pipeline stepper, default landing per role, session/entity continuity.
- **Consumes:** L1 actions, L2 permissions, L5 components. **Produces:** navigation + attention.
- **Must NOT:** contain business rules, validation, or money writes. It *routes to* L1, never *reimplements* it.
- **Test:** changing a navigation flow (e.g., reorder the pipeline view) touches no validator and no ledger.

### L5 — UI Components
- **Owns:** the *only* implementations of buttons, tables, forms, cards, modals, sidebars, badges, nav.
- **Rule:** pages **consume** components; pages never craft bespoke visual elements.
- **Must NOT:** embed business logic, permission checks, or raw design values — components read **tokens** (L6) only.
- **Contract:** a component takes data + callbacks in, emits events out. It does not call Firestore.

### L6 — Design System (Tokens)
- **Owns:** every visual primitive as a CSS custom property in **one file** (`design-system/tokens.css`):
  color, typography scale, spacing scale, shadows, radius, z-index, transitions, responsive breakpoints.
- **Rule (U1.1/U1.2):** zero raw hex / raw px / inline `style=` for design values anywhere outside this file.
- **Test (U1.7):** change a token here → the whole system changes; no other file edited.

### L7 — Theme Engine
- **Owns:** *which set of token values is active*. Switches by `<html data-theme="...">`.
- **Today:** `theme.js` → `dark | light | auto` via `localStorage('b2c-theme')`.
- **Extension:** themes become **data**, not code (see §6) — unlimited themes register a token map.

### L8 — Branding / White-Label
- **Owns:** per-company identity: logo, product name, primary palette, font family, favicon.
- **Sourced from data** (`tenant_branding/{tenantId}`) + an optional `themes/<tenant>.css` override.
- **Rule:** a new white-label client = new branding row + token override file. **Zero** L0–L5 edits.

---

## 3) Dependency Rules (the enforced import matrix)

A layer may import **only** from layers strictly below it (toward stable). **Upward and
sideways-into-volatile imports are forbidden** and CI-blocked.

| From ↓ \ May import → | L0 Data | L1 Logic | L2 Perm | L3 Audit | L4 UX | L5 UI | L6 Tokens | L7 Theme | L8 Brand |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **L0 Data** | — | ✅¹ | — | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| **L1 Logic** | ✅ | — | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **L2 Perm** | ✅ | — | — | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **L3 Audit** | ✅ | — | — | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| **L4 UX** | read² | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| **L5 UI** | ❌ | ❌³ | ❌³ | ❌ | ❌ | — | ✅ | ✅ | ✅ |
| **L6 Tokens** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | — | — |
| **L7 Theme** | data⁴ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | — | — |
| **L8 Brand** | data⁴ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | — |

¹ Cloud Functions (L0-adjacent) call L1 helpers (FSE) — same trust boundary.
² UX reads Firestore for display via `onSnapshot`/`getDoc` (bounded, G3); **writes only through L1 actions**.
³ A UI component never calls logic/permissions directly — the **page (L4)** passes results in as props.
⁴ Theme/Brand read their *values* from a Firestore doc but contain **no business logic**.

**The cardinal forbidden edges (CI-enforced):**
- ❌ `L1 → L4/L5/L6/L7/L8` — any color/DOM/component import inside business logic.
- ❌ `L5 → Firestore` — a visual component touching the database.
- ❌ pages writing Firestore directly (must go through `orderActions.*` / FSE — A1 + architecture-guard).

---

## 4) Target Folder Structure (grounded in today's tree)

```
/                          # repo root
├── core/                  # L1–L3 — the engine (pure, Node-testable, no DOM)
│   ├── orders.js              · stage machine + validators + constants   (L1)
│   ├── order-actions.js       · central actions (orderActions.*)         (L1)
│   ├── financial-sync-engine.js · money engine (FSE)                     (L1)
│   ├── order-math.js / *-kpis.js · pure calculators                      (L1)
│   ├── permissions-matrix.js  · canDo/canSee/hasPage                     (L2)
│   ├── audit.js / telemetry.js · universal audit + traces               (L3)
│   ├── financial-invariants.js / projection.js / idempotency.js         (L1)
│   ├── firebase-init.js       · single Firebase init (G2)                (L0 bridge)
│   └── storage-helpers.js     · structured file paths (S1)              (L1)
│
├── core/runtime-shell/    # L4 — UX orchestration (rail, sidebar, workspace, signals)
├── core/domains/          # L4 — per-domain navigation config (8 domains)
├── core/process-pipeline/ # L4 — order pipeline model + stepper
│
├── design-system/         # L5 + L6 — the visual language
│   ├── tokens.css             · ALL design tokens (L6) — single source
│   ├── components.css         · reusable component classes (L5)
│   └── showcase.html          · living component gallery
│
├── themes/                # L7/L8 — NEW: theme + white-label token overrides
│   ├── _base.css              · maps brand vars → component vars (contract)
│   ├── default.dark.css       · dark token values
│   ├── default.light.css      · light token values
│   └── tenants/<tenant>.css   · per-company overrides (logo color, accent, font)
├── theme.js               # L7 — theme engine (data-theme switch + tenant load)
│
├── features/              # L4/L5 composition — one folder per module
│   └── <module>/
│       ├── components/        · module-specific reusable views (L5)
│       ├── services/          · thin adapters to core actions (NO logic) (L4)
│       ├── views/             · render functions (consume components)    (L5)
│       └── <module>.repository.js · all Firestore queries for module (G4) (L0 access)
│
├── pages (*.html)         # L4 shells — consume features + components; thin
├── firestore.rules        # L0/L2 — server trust boundary
├── firestore.indexes.json # L0
└── functions/             # L0-adjacent — Cloud Functions reuse core/ (L1)
```

**Naming law:** a file's directory declares its layer. `core/*` may not contain DOM;
`design-system/*` may not contain logic; `themes/*` may not contain anything but token values.

---

## 5) Module Boundaries & the Plug-In Contract (scalability)

A **module** = one business capability (orders, clients, suppliers, employees, shipping…).
New modules **plug in** without editing existing ones (Open/Closed). To add a module you provide:

| # | Artifact | Layer | Contract |
|---|----------|-------|----------|
| 1 | `features/<m>/<m>.repository.js` | L0 access | All reads/writes for the module; bounded queries (`limit()`); `tenantId` filtered (G7) |
| 2 | `<m>-actions.js` or extend `orderActions` | L1 | Central actions returning `{ok, errors, warnings}`; atomic; audited |
| 3 | capabilities in `permissions-matrix.js` | L2 | New `canDo` keys + role defaults; mirrored in `firestore.rules` |
| 4 | events in `financial-sync-engine.js` (if money) | L1 | `FE.*` type + handler + reversal (RULE 7) |
| 5 | `core/domains/<m>/sidebar.js` | L4 | Navigation config (views/actions/signals) — registers itself |
| 6 | `features/<m>/views/*` + `components/*` | L5 | Render from props; consume `design-system` components only |
| 7 | tokens? | L6 | **None** — reuse existing tokens; new token ⇒ added to `tokens.css` first |

**Registration, not modification:** modules *register* into the shell domain registry and
permission matrix; the shell discovers them. No central `switch(module)` to edit. Removing a
module = deleting its folder + its registrations; nothing else breaks.

**Module isolation test:** delete any one `features/<m>/` folder → the build still runs and
other modules still function (degraded only by the missing nav entry).

---

## 6) Theme Engine & White-Label (the headline requirement)

### 6.1 Three-tier token cascade
Components never read a color directly — they read a **semantic component variable**, which
resolves to a **brand variable**, which resolves to a **palette value**. Swapping any tier
above leaves the tier below untouched.

```
PALETTE (raw)          BRAND (semantic identity)        COMPONENT (usage)
--blue-500:#4a8ef5  →  --brand-primary: var(--blue-500) → --btn-bg: var(--brand-primary)
--red-500:#ff3d6e   →  --brand-danger:  var(--red-500)  → --badge-error: var(--brand-danger)
```

- **Components** use only the COMPONENT tier (`--btn-bg`, `--card-bd`, `--badge-error`).
- A **theme** redefines BRAND→PALETTE mappings.
- A **white-label tenant** overrides only the PALETTE + a few BRAND vars (accent, logo color, font).

### 6.2 Switching mechanism (extends today's `theme.js`)
```html
<html data-theme="dark" data-tenant="acme">
```
- `data-theme` selects the theme token set (today: dark/light/auto — unlimited tomorrow).
- `data-tenant` loads `themes/tenants/acme.css` (palette/brand overrides) — lazy, cached.
- `theme.js` resolves both at first paint (before content) to avoid flash; persists in `localStorage`.

### 6.3 Themes & branding as DATA
```
tenant_branding/{tenantId} = {
  name: "Acme Print", logoUrl, faviconUrl,
  fontFamily: "Tajawal",
  palette: { primary:"#...", danger:"#...", accent:"#..." },  // values only — no logic
  theme: "light",   // default theme for this tenant
}
```
- The engine reads this doc and injects a `<style>` of `:root[data-tenant="acme"]{ --brand-primary:… }`.
- **Adding a white-label client = inserting one Firestore row** (+ optional override CSS). Zero engine edits.

### 6.4 Hard guarantees
- A theme/brand file may contain **only** CSS custom-property assignments — no selectors with
  layout, no logic, no component restructuring.
- Removing every theme except one must leave the app fully functional (default tokens in L6).
- **Proof obligation:** "rebrand the entire product" = edit `themes/tenants/<x>.css` +
  `tenant_branding` doc. Grep confirms **no diff** under `core/`, `*-actions.js`, `firestore.rules`.

---

## 7) Governance & CI Enforcement

Architecture is only real if a machine rejects violations. Each rule maps to existing CI
(`.github/workflows/architecture-guard.yml`, `pr-quality.yml`) + new guards.

| Guard | Forbids | Layer protected | Mechanism |
|-------|---------|-----------------|-----------|
| **No UI writes** | `updateDoc/addLedgerToBatch/...` in pages/components | L0/L1 | architecture-guard (exists) |
| **No logic→view import** | `core/*` importing DOM/CSS/`design-system`/`themes` | L1 | new grep guard: fail if `core/*.js` imports `.css`/`features`/`window.document` color |
| **No raw design values** | hex/px/inline `style=` for color/size outside `design-system` & dynamic runtime | L6 | new grep guard (extends U1) |
| **No view→DB** | `features/*/components|views` importing repository/Firestore | L5 | new grep guard |
| **No hardcoded roles** | `if (role==='admin')` / uid backdoors in pages | L2 | grep guard (X1.3) |
| **One Firebase config** | `FB_CONFIG` outside `core/firebase-init.js` | L0 | pr-quality (exists, G2) |
| **Bounded listeners** | `onSnapshot` without `limit()` | L0/L4 | pr-quality (exists, G3) |
| **God page budget** | files > 1500 lines | all | pr-quality warning (exists, G5) |
| **Audit present** | mutation without `auditEntry` | L3 | review + future lint (H3) |

**Stable Core (2-reviewer):** `firestore.rules`, `financial-sync-engine.js`, `order-actions.js`,
`orders.js`, `core/permissions-matrix.js`, `core/audit.js`, `design-system/tokens.css`, `theme.js`.

---

## 8) Best Practices (per layer, do / don't)

- **L1 Logic:** pure functions; uniform result contract; Node-testable; no `try/catch`-swallow —
  surface `{ok:false, errors}`. *Don't* read `document` or import a component.
- **L4 UX:** call exactly **one** central action per user gesture; handle `{ok, warnings}`;
  hide controls the role can't use (P1.5 — never "click → permission error").
- **L5 UI:** props in / events out; one component per concept; no Firestore; no business `if`.
- **L6 Tokens:** name by **purpose** (`--btn-bg`) not value (`--blue`); add a token before using a new color.
- **L7/L8 Theme:** values only; default must stand alone; test contrast/a11y per theme.
- **Everywhere:** one concern per PR; backward-compatible; reversible; `tenantId` on every doc/query (G7).

---

## 9) Acceptance Gate — "The Redesign Test"

Before merging any change, it must pass the layer-independence questions (extends L1.4):

1. Could I delete **all** of `design-system/`, `themes/`, and every `*.html` and still have
   `core/` compile and pass its Node tests? → **must be yes.**
2. Could I replace the **entire** visual identity (new brand, fonts, palette, layout) by editing
   only L6–L8? → **must be yes.** (Grep: zero diff in `core/`, `*-actions.js`, rules.)
3. Could I add a new white-label tenant with **only** a Firestore row + one override CSS? → **yes.**
4. Could I add a new module **without editing** any existing module's files? → **yes.**
5. Does changing a navigation flow (L4) touch **no** validator or ledger (L1)? → **yes.**
6. Does changing the DB schema get motivated by a **business** need, never a visual one? → **yes.**

**Any "no" → the change violates separation of concerns and is redesigned before merge.**

---

## 10) Migration Approach (RULE E1 — incremental, never big-bang)

This document is the **target**, reached one safe PR at a time. The engine already largely
satisfies L0–L3 today. The active glide path:

```
Existing system (engine solid; tokens/theme partial)
   ↓  each step = one PR, one concern, reversible, flag-guarded where user-facing
1. Tokenize remaining raw colors/sizes  → L6 single source        (UI_DEBT.md plan, in progress)
2. Extract inline <style> → component CSS → L5 consolidation
3. Introduce 3-tier token cascade (palette→brand→component)       ✅ DONE (brand accent colors)
4. themes/ folder + data-theme/tenant loader extension            → L7 unlimited themes  (themes/ created)
5. tenant_branding doc + override CSS                             → L8 white-label
6. New-module template + CI guards for the forbidden edges        → lock the architecture
```

> **Step 3 status (2026-05-29):** the cascade is **live** for both brand accents
> **and neutrals** in `shared.css`:
> - **Brand accents:** `palette (--red-500 … --orange-500, per-theme)` →
>   `BRAND (--brand-danger/primary/…, global)` → aliases (`--r … --o`).
> - **Neutrals:** themed semantic `--surface-* / --border-* / --text-*` (per-theme)
>   → aliases (`--bg/--bg2…/--line/--line2/--snow/--dim/--dim2`).
>
> All 43 pages untouched; every chain verified byte-identical in dark/light/auto.
> White-label proven by `themes/example-tenant.css` (override palette/brand/surface
> under `[data-tenant]`). Remaining literals: `--st-*` (already global+semantic) and
> derived helpers (`--hover`, shadows, rings) — optional later.
> *Next:* the `data-tenant` loader (step 4) + `tenant_branding` doc (step 5).

**Never:** delete a load-bearing layer before its replacement is proven (E1.1).
**Always:** the operational engine keeps running, untouched, through every step.

---

### TL;DR
The ERP engine (data + business logic + permissions + audit) is the durable asset and points
**downward only**. Experience (UX, components, tokens, themes, branding) sits on top and is
**replaceable wholesale**. Dependencies flow one way, CI blocks the forbidden edges, and the
"redesign test" guarantees that swapping the entire look — or white-labeling for a new company —
is a token/theme operation that the operational engine never even notices.
