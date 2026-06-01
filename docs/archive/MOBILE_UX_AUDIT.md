# 📱 MOBILE UX AUDIT

> **Date:** 2026-05-24
> **Scope:** All HTML pages + CSS files, focused on mobile/touch UX.
> **Methodology:** static grep against WCAG/Apple/Material mobile guidelines.
> **No runtime testing** — manual device QA is a follow-up.

---

## 1) Executive snapshot

| Area | Status | Detail |
|------|--------|--------|
| Viewport meta tag | ✅ | All 50 HTML pages have one |
| PWA manifest link | ✅ | All pages link `manifest.json` |
| Service Worker | ✅ | 14 pages register `sw-register.js`; rest inherit via shared layout |
| Mobile breakpoints in `shared.css` | ✅ | `@media(max-width:400/480/600/767/768/1024px)` — comprehensive |
| Mobile bottom nav (`mob-nav`) | ✅ | 15 pages |
| `apple-mobile-web-app-capable` | ✅ | 11 pages (the role landing pages) |
| Safe-area / notch handling | ⚠️ | 10 `env(safe-area-*)` references — but inconsistent |
| Touch-target sizes | ⚠️ | `.btn-sm{min-height:36px}` < 44px iOS HIG; `.modal-x{width:30px;height:30px}` too small |
| `-webkit-tap-highlight-color` | ✅ | 14 rules — tap feedback handled |
| Viewport-fit values | ⚠️ | Mixed: some pages `viewport-fit=cover`, others not |

The system has a **good mobile foundation** (responsive grids, bottom nav, PWA setup). The remaining debt is **touch-target sizing** and **viewport meta consistency**.

---

## 2) Viewport meta inconsistency

Found **5 different viewport meta variants** across 50 pages:

| Variant | Pages |
|---------|------:|
| `width=device-width, initial-scale=1.0` | many |
| `width=device-width, initial-scale=1.0, viewport-fit=cover` | some |
| `width=device-width,initial-scale=1,viewport-fit=cover` | some (no spaces) |
| `width=device-width,initial-scale=1` | some |
| `width=device-width,initial-scale=1.0` | some |

**Issue:** Pages WITHOUT `viewport-fit=cover` show white bars under the notch on iPhone X+ in standalone PWA mode.

**Recommended:** standardize to `width=device-width,initial-scale=1,viewport-fit=cover` everywhere.

---

## 3) Touch-target sizing

### Apple HIG / WCAG 2.1 minimums
- **Apple HIG:** 44×44pt (≈ 44px CSS)
- **WCAG 2.5.5 (AAA):** 44×44px
- **WCAG 2.5.5 (AA):** 24×24px (relaxed)

### Found below 44px in shared.css
| Selector | Size | Risk |
|----------|------|------|
| `.btn-sm{min-height:36px}` | 36 px | borderline; OK if rarely tapped |
| `.modal-x{width:30px;height:30px}` | 30 px | **too small** — frequently tapped (modal close) |
| `.nav-avatar{width:34px;height:34px}` | 34 px | borderline; logout target |
| `.notif-bell{width:34px;height:34px}` | 34 px | borderline; frequently tapped |
| `.section-ico{width:26px;height:26px}` | 26 px | **decorative only** — usually not interactive |
| `.btn-xs{min-height:32px}` | 32 px | rarely-tapped form actions, acceptable |

**Recommended fix:** Bump `.modal-x` to 40px minimum (no visual disruption — it's just the X button). The others are borderline and depend on context.

---

## 4) Safe-area / notch handling

10 `env(safe-area-*)` usages across CSS files. Spot check:
- `shared.css`: `padding-bottom: max(8px, env(safe-area-inset-bottom))` on bottom nav ✅
- Some page CSS files: missing safe-area on fixed elements

**Recommended:** Add a checklist in `CLAUDE.md` for any new `position:fixed` element: "verify safe-area-inset on bottom/top + viewport-fit=cover on meta tag."

---

## 5) Fixed-position overlays — mobile cutoff risk

35 `position:fixed` rules across CSS files. Without `env(safe-area-inset-bottom)` padding, an iPhone notch can cut off content.

**Recommended sweep (future PR):** add `padding-bottom: max(0px, env(safe-area-inset-bottom))` to every fixed bottom panel/toast/sheet.

---

## 6) Mobile-specific issues by page (top targets)

### Heavy mobile users — verify in field
1. **cs-dashboard.html** — Customer Service primary tool; tapped hundreds of times/day
2. **shipping-dashboard.html** — Drivers use this on phones outdoors
3. **inbox.html** — Chat UI; many touch interactions
4. **production.html** — Production agents on shop floor; tap-tap-tap workflow

These warrant a **runtime device QA session** before any large UI change.

---

## 7) Phase-6 mobile sub-PR plan

| PR | Scope | Risk | Visual change? |
|---|---|---|---|
| **6A (this)** | Audit doc | none | none |
| **6B** | Standardize viewport meta tag across all 50 pages → `width=device-width,initial-scale=1,viewport-fit=cover` | low | possibly fewer white bars on iPhone X+ |
| **6C** | Touch-target fix: `.modal-x` 30→40px + small adjustments | low | tiny — slightly larger close X |
| **6D** | Safe-area pass on fixed-position elements | low-medium | none (additive padding) |
| **Deferred** | Device QA on 4 hot-path pages | needs hardware + people | — |

---

## 8) Out of scope

- Runtime device profiling (needs physical iPhone + Android)
- Image/video format optimization (separate sprint)
- Offline-mode UX (already covered by SW work)
- New gestures (swipe-to-archive, pull-to-refresh) — feature work, not cleanup
- React Native / Capacitor migration — completely different scope
