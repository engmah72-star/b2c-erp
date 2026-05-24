# `docs/archive/` — superseded planning + audit docs

These docs were active at one point but have since been **superseded** by newer audits or fully executed via retrospectives. Kept for historical reference — feel free to consult them for context on **why** decisions were made, but **don't treat them as current truth**.

## Index

| Doc | Superseded by | Reason |
|-----|--------------|--------|
| `AUDIT_REPORT.md` (2026-05-17) | `AUDIT_REPORT_v2.md` (2026-05-19) | v2 updated all scores and added P0 items that have since been addressed |
| `PERFORMANCE_AUDIT.md` (2026-05-23) | `PERFORMANCE_AUDIT_v2.md` (2026-05-24) | v2 is post Phase-1/2 cleanup and reflects current state |
| `STABILIZATION_PLAN.md` (2026-05-19) | retrospectives | Most of the 14-day sprint executed across PRs #743+; remaining items are in `SECURITY_AUDIT.md` |
| `PHASE_2_DIAGNOSIS.md` | `UI_DESIGN_SYSTEM_RETROSPECTIVE.md` | Phase 2 completed in 14 PRs (#769-#783); the retrospective captures what was done |
| `REGRESSION_PREVENTION.md` | enforced via CI workflows | The patterns are now codified as `architecture-guard.yml`, god-page-line-count check, etc. |

## How to use this folder

- **Browsing for context** → read freely
- **Looking up "what's current"** → check the root-level docs first (`AUDIT_REPORT_v2.md`, `PERFORMANCE_AUDIT_v2.md`, `UI_DESIGN_SYSTEM_RETROSPECTIVE.md`, `GOD_PAGE_DECOMPOSITION_RETROSPECTIVE.md`)
- **Adding a new audit** → put it in the repo root; when it gets superseded later, move it here

## Currently active root-level docs

| Doc | Status |
|-----|--------|
| `CLAUDE.md` | Project constitution — always current |
| `AUDIT_REPORT_v2.md` | Latest system audit |
| `PERFORMANCE_AUDIT_v2.md` | Latest perf audit |
| `SECURITY_AUDIT.md` | Latest security audit (still has open P1 items) |
| `FIREBASE_AUDIT.md`, `RULES_AUDIT.md`, `UI_AUDIT.md`, `WORKFLOW_AUDIT.md`, `HIDDEN_FEATURES_AUDIT.md`, `CONSTANTS_AUDIT.md` | Domain-specific audits; check date inside |
| `GOD_PAGE_DECOMPOSITION_RETROSPECTIVE.md`, `UI_DESIGN_SYSTEM_RETROSPECTIVE.md` | Sprint retrospectives (Phase 1, Phase 2) |
| `DEAD_CODE_AUDIT.md`, `UI_DEBT.md` | Live debt registers |
| `CLIENTS_MIGRATION_PLAN.md`, `SETTINGS_MIGRATION_REPORT.md`, `FIREBASE_RULES_SETUP.md` | Targeted plans/reports |
