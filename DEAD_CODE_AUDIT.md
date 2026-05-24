# 🗑️ DEAD CODE AUDIT

> **Date:** 2026-05-24
> **Goal:** Catalog unreferenced files (HTML, JS, docs) that add maintenance burden + bundle weight without value.
> **Methodology:** static grep + manual verification per candidate.
> **Phase-4 follow-up PRs will move suspects to `_archive/`, then delete after verification window.**

---

## 1) Executive snapshot

| Category | Total | Active | Suspect |
|------|---:|---:|---:|
| HTML pages | 50 | 46 | **4** |
| JS modules (root + core + features) | ~85 | ~83 | **2** |
| Audit/planning `.md` docs | 21 | — | **~5 candidates for consolidation** |

Total bytes of suspect files: **~93 KB** (small in absolute terms but adds parse/index time on each grep + tooling pass; cognitive load is the bigger cost).

---

## 2) Suspect HTML pages (4)

| File | Size | Why suspect | Recommended action |
|------|---:|---|---|
| `ml-dashboard.html` | 17 KB | Never linked from any sidebar / nav / location.href | **Archive** — likely an experimental ML page from an early sprint, not in production use |
| `order-handoff-mockup.html` | 21 KB | Explicitly marked as a mockup in `UI_DEBT.md`; carved out of every Phase-2 sweep | **Archive** — purpose served (it was a design reference) |
| `tenant-migration.html` | 13 KB | Multi-tenant migration UI; tenantId rollout never executed | **Archive** — keep accessible until multi-tenant work resumes |
| `validate-financial.html` | 22 KB | Testing/validation tool, already admin-gated per PR-7's S0-3 work | **Keep** — useful diagnostic; document its purpose in `CLAUDE.md` |

**`validate-financial.html`** is a deliberate diagnostic tool; the SECURITY_AUDIT P0-3 was already addressed (admin role check inside). NOT for archiving.

---

## 3) Suspect JS modules (2 confirmed safe)

| File | Size | Code refs | Doc refs | Recommended action |
|------|---:|---:|---:|---|
| `ai-anomalies.js` | 6 KB | 0 | 1 (CLAUDE.md mention) | **Archive** — appears to be an AI-experiment that was never wired up |
| `core/storage-helpers.js` | 9 KB | 0 | 6 (RULE F1.9, S1.3 references) | **Keep** — RULE S1.3 mandates uploads go through this; not yet adopted but the rule is in force. Don't delete. |

**Other modules flagged by initial grep but NOT for archiving:**
| File | Code refs | Why keep |
|------|---:|---|
| `core/financial-invariants.js` | 3 | Stable Core per RULE H1.8; used by drift detection |
| `core/projection.js` | 7 | Stable Core; rebuildFinancialProjection used by admin tools |
| `features/design/state.js` | 44 | Heavily used internally by the design feature module |
| `command-palette.js`, `mobile-bridge.js`, `shipping-pricing.js`, `ux-globals.js` | 1-3 each | Loaded dynamically via `<script src="...">` or similar — keep |
| `firebase-messaging-sw.js`, `sw.js` | (special) | Service Workers — registered via separate mechanism |

So only **`ai-anomalies.js`** is a safe-to-archive JS module.

---

## 4) `.md` documentation files (~21 in root)

Audit observation: 21 .md files at the root, totaling ~440 KB. Some are clearly superseded:

| File | Status | Superseded by |
|------|--------|---|
| `AUDIT_REPORT.md` (17 May) | superseded | `AUDIT_REPORT_v2.md` (19 May) |
| `PERFORMANCE_AUDIT.md` | superseded | `PERFORMANCE_AUDIT_v2.md` (this branch) |
| `STABILIZATION_PLAN.md` (46 KB) | mostly executed | retrospectives capture what was done |
| `REGRESSION_PREVENTION.md` (42 KB) | enforced via CI now | could move to `docs/`  |
| `PHASE_2_DIAGNOSIS.md` | superseded | `UI_DESIGN_SYSTEM_RETROSPECTIVE.md` |

**Recommended action:** keep all docs (history is cheap to store), but move superseded ones to `docs/archive/` so the root stays focused on currently-relevant material.

---

## 5) Phase-4 sub-PR plan

| PR | Scope | Risk |
|---|---|---|
| **4A (this)** | Audit doc | none |
| **4B** | Move 4 files to `_archive/` (`ml-dashboard.html`, `order-handoff-mockup.html`, `tenant-migration.html`, `ai-anomalies.js`) + sw.js cleanup | low — files still in repo, easy revert |
| **4C** | Reorganize stale docs into `docs/archive/` (5 docs) + update CLAUDE.md to reference the new locations | low — pure file move |

After PR-4B, give it 1-2 weeks of validation before any actual deletion.

---

## 6) Out of scope for Phase-4

- **Multi-tenant rollout** — `tenant-migration.html` will be un-archived if that work resumes; not a deletion decision now
- **Core module pruning** — `core/storage-helpers.js` is governed by RULE S1.3; deletion would require rule deprecation
- **Cloud Functions audit** — `functions/index.js` not analyzed here; separate sprint
- **HTML pages with low traffic** — staying not used isn't the same as dead; would need usage analytics
