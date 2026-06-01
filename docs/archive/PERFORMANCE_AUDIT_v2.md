# ⚡ PERFORMANCE AUDIT v2 — Business2Card ERP

> **Date:** 2026-05-24
> **Goal:** Identify concrete performance debt that affects end-users.
> Phase-3 Performance Sprint will consume this list incrementally.
> **Scope:** Firestore listeners + JS bundle sizes + N+1 query patterns + image lazy loading + service-worker cache strategy.
> **Methodology:** static analysis via grep + file metadata. No runtime profiling.

---

## 1) Executive snapshot

| Area | Status | Risk if untreated |
|------|--------|---|
| `onSnapshot` listeners without bounded queries | **163** total calls across 251 lines — many bounded, some not | unbounded reads = slow page, costly billing as data grows |
| JS bundle sizes (top files) | 6 files over **800 lines**, top is 2924 | parse/eval time on slow devices; mobile cellular cost |
| N+1 Firestore query patterns | **0 detected** via static analysis | (good — but worth runtime verification) |
| Images without `loading="lazy"` | **27** (vs 32 already lazy) | wasted bandwidth + slow first-paint on image-heavy pages |
| Service Worker precache | **12 files** precached, **65** network-first | first-launch offline experience is minimal |

The system is **already in reasonable shape on most performance vectors**. The biggest concrete wins are:
1. Lazy-loading the remaining 27 images (G3-adjacent)
2. Pruning the network-first whitelist now that pages have dedicated CSS files
3. Adding the 28 new `*.css` files to PRECACHE (offline first-launch)

---

## 2) Firestore — `onSnapshot` analysis

### Per-file counts (top 15)
| File | Listeners |
|------|---:|
| `features/design/repository.js` | 14 |
| `design.html` | 13 |
| `employee-profile.html` | 12 |
| `accounts.html` | 12 |
| `reports.html` | 10 |
| `clients.html` | 10 |
| `ops-dashboard.html` | 9 |
| `notifications.js` | 9 |
| `financial-dashboard.html` | 9 |
| `designer-dashboard.html` | 9 |
| `print.html` | 8 |
| `my-profile.html` | 8 |
| `employees.html` | 8 |
| `shared.js` | 7 |
| `production.html` | 7 |

### RULE G3 compliance gauge
Sample grep on the heaviest files shows most `onSnapshot` calls do use `query(...)` with `where(...)` and `limit(N)`. The 42 line-level "violations" the simple grep finds are mostly:
- **Doc snapshots** (`onSnapshot(doc(db, ...), cb)`) — single-doc, `limit()` not applicable
- **Pre-filtered queries** where `limit()` is on a different line

**Manual sample verification needed** to identify true violations before bulk edits.

### Concrete action (PR 2/4)
Per-file scan + add `limit(N)` to any `query(collection(...))` listener that lacks it. Conservative N values per known data growth (e.g., orders limit 200, transactions limit 100).

---

## 3) JS bundle sizes (top 20 by line count)

| File | Lines | Note |
|---|--:|---|
| `order-actions.js` | 2924 | Stable Core (H1.8) — large by necessity |
| `orders.js` | 2348 | Stable Core — state machine + validators + builders |
| `clients-render.js` | 1587 | View templates — could split per-section |
| `financial-sync-engine.js` | 870 | Stable Core (FSE) |
| `returns-core.js` | 818 | Domain module |
| `approval-actions.js` | 793 | Action layer |
| `shipping-actions.js` | 779 | Action layer |
| `features/cost-items/drawer.js` | 773 | View module |
| `employee-actions.js` | 726 | Action layer |
| `client-actions.js` | 724 | Action layer |
| `wallet-actions.js` | 710 | Action layer |
| `clients-data.js` | 686 | Data helpers |
| `shared.js` | 626 | Bootstrap (12+ pages import it) |
| `viewas.js` | 498 | Admin impersonation |
| `smart-sidebar.js` | 454 | UI helper |

**Verdict:** Most of these are domain-critical and intentionally centralized. Splitting them further would violate Single Source of Truth (RULE 1) without clear benefit. **No action recommended** unless runtime profiling shows specific bottlenecks.

The only candidate for decomposition is `clients-render.js` (1587 lines, all view templates) — could split into per-tab modules. **Deferred** — view module decomposition is a Phase-1-style refactor, not a perf win.

---

## 4) N+1 query patterns

Static analysis pattern: `forEach`/`map` followed by `await getDocs(...)` or `await getDoc(...)` within 5 lines.
**Result: 0 matches.**

This is good — the codebase consistently uses batched reads or pre-computed indexes. But static analysis can miss patterns like:
- `Promise.all(items.map(i => getDoc(...)))` — concurrent N+1 (still N reads)
- Loops over results where each iteration fetches a sub-collection

**Action:** spot-check the hottest paths (clients list, orders list, reports) at runtime via DevTools Network panel. Defer fixes to a follow-up PR if hotspots are found.

---

## 5) Image lazy loading

**Audit:**
- 27 `<img>` tags WITHOUT `loading="lazy"`
- 32 already have it

**Top offenders:**
| File | Non-lazy `<img>` |
|---|--:|
| `shipping-guide.html` | 7 |
| `design.html` | 3 |
| `client-portal.html` | 3 |
| (smaller counts spread across many) | 14 |

**Action (PR 3/4):** Bulk-add `loading="lazy"` to all `<img>` that lack it. Safe, zero-risk; modern browsers fall back gracefully if unsupported.

---

## 6) Service Worker cache strategy

**Current state (`sw.js` v241):**
- `CACHE = 'b2c-v241'` — versioned, auto-bumped per deploy ✅
- **PRECACHE** (12 files): app shell + 5 role dashboards. Critical first-launch path.
- **NETWORK_FIRST** (~65 files): HTML + JS that change frequently. Fresh on every fetch when online.
- **stale-while-revalidate** for everything else (CSS, images, fonts, gstatic).
- **NEVER_CACHE**: Firestore/Auth/Storage hosts. ✅

**Drift since Phase-2 cleanup:**
- 28 new `*.css` files exist (one per major page) — currently all served via stale-while-revalidate (good for unchanged content) but **NOT in PRECACHE** → first launch on a brand-new install can't render those pages offline.
- Many new `features/**/*.js` view modules are not in `NETWORK_FIRST_SUFFIXES` — they get stale-while-revalidate (could serve stale code after a deploy until first online fetch).

**Action (PR 4/4):**
1. Add the most-used `*.css` files to PRECACHE (cs-dashboard.css, exec-dashboard.css, ops-dashboard.css — the dashboards users land on)
2. Add `features/**/*.js` view modules to NETWORK_FIRST_SUFFIXES so they always pick up latest after deploy
3. Bump `CACHE` to `b2c-v242` to flush the old cache for users on the next page load

---

## 7) Phase-3 sprint plan

| PR | Scope | Risk | Expected impact |
|---|---|---|---|
| **3A (this)** | Audit doc | none | foundation |
| **3B** | RULE G3 enforcement — add `limit()` to ~5-15 violating listeners | low | bounded reads, less Firestore billing as data grows |
| **3C** | Bulk `loading="lazy"` for 27 images | none | faster first-paint on image-heavy pages |
| **3D** | SW tuning — add new CSS to PRECACHE + view modules to NETWORK_FIRST + bump cache version | low | better offline first-launch + guaranteed fresh code after deploy |

Each sub-PR is small, scriptable, and CI-gated. No runtime regressions expected.

---

## 8) Out of scope for Phase-3 (deferred)

- **Runtime profiling** — needs DevTools sessions per page; better as a follow-up sprint with concrete data
- **`clients-render.js` decomposition** (1587 lines of view templates) — Phase-1-style refactor, not a perf win
- **Multi-tenant tenantId rollout** — large schema change, separate phase
- **N+1 query fixes** — none detected statically; do after runtime profiling identifies hotspots
- **Image format optimization** (WebP, lazy `srcset`) — needs design decision per image
- **Code splitting / dynamic imports** — would require build tooling (currently no bundler)
