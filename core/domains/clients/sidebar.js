// Clients domain sidebar — Phase 1e (pilot runtime-state consumer)
//
// Pilot goal: prove the Sidebar → Runtime State → Workspace flow works
// inline (no reload, no iframe refresh, no URL navigation) on a real
// domain. Infrastructure already exists end-to-end:
//   - Store + postMessage:  core/runtime-shell/runtime-state.js
//   - Sidebar dispatcher:   core/runtime-shell/sidebar-builder.js (lines 163-196)
//   - Workspace consumer:   clients.html:709-760 (applyViewFilter via postMessage)
// This module adds the *sidebar entry points* that hook into that flow,
// guarded by a feature flag for instant rollback.
//
// Feature flag: window.B2C_RUNTIME_STATE_ENABLED
//   - undefined / true / any non-false  → pilot views active (default)
//   - explicit `false`                  → revert to Phase 1b config (single "import" view)
//
// Rollback path (no redeploy needed):
//   1. Open DevTools console on shell.html
//   2. window.top.B2C_RUNTIME_STATE_ENABLED = false
//   3. Click any other domain, then click clients → renders legacy config
//
// E1 compliance:
//   - Reuses existing runtime-state.js (no duplicate store — spec §1 + §7)
//   - No changes to stable core (sidebar-builder.js / runtime-state.js / clients.html)
//   - Pure additive — legacy navigation paths intact
//   - Flag-gated, reversible, layered

import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

// ── Feature flag (default ON; explicit `false` reverts to legacy) ──
function isRuntimeStateEnabled() {
  try {
    const top = (typeof window !== 'undefined' && window.top) || (typeof window !== 'undefined' ? window : null);
    if (!top) return true;
    return top.B2C_RUNTIME_STATE_ENABLED !== false;
  } catch (_) {
    return true;
  }
}

// ── Pilot runtime-driven views ──
// Each emits a runtime-state event via `data-rt-state` plumbing (no reload).
// The view IDs (`all`/`atrisk`/`new`) match clients.html VALID set (line 715)
// and clients-shell.js chip handlers (lines 71/83/86) — consumer applies
// setQuickFilter() inline.
// deepLink: kept as a graceful fallback if the consumer is unsubscribed
// (e.g., standalone clients.html opened outside the shell).
const PILOT_VIEWS = [
  { id: 'all',     ico: '👥', label: 'كل العملاء',         state: { view: 'all'    }, deepLink: 'clients.html?filter=all'    },
  { id: 'delayed', ico: '⏰', label: 'العملاء المتأخرين', state: { view: 'atrisk' }, deepLink: 'clients.html?filter=atrisk' },
  { id: 'recent',  ico: '🆕', label: 'العملاء الجدد',      state: { view: 'new'    }, deepLink: 'clients.html?filter=new'    },
];

// ── Cross-page navigation (always shown — not a runtime view) ──
const NAV_VIEWS = [
  { id: 'import', ico: '📥', label: 'استيراد بيانات', deepLink: 'import-data.html' },
];

function buildConfig(enabled) {
  return {
    addLabel: 'إضافة عميل',
    primaryAction: { icon: '➕', label: 'عميل جديد', handler: 'openAddClient' },
    // Pilot views only when flag is on. Legacy config (Phase 1b) keeps only
    // the cross-page nav view — page chips own the filters in that mode.
    views: enabled ? [...PILOT_VIEWS, ...NAV_VIEWS] : NAV_VIEWS,
    secondaryViews: [],
    actions: [
      { id: 'add-client', ico: '➕', label: 'عميل جديد',    handler: 'openAddClient' },
      { id: 'log-call',   ico: '📞', label: 'تسجيل اتصال',  handler: 'openLogCall' },
      { id: 'log-pay',    ico: '💰', label: 'تسجيل تحصيل',  handler: 'openLogPayment' },
      { id: 'note',       ico: '📝', label: 'ملاحظة سريعة', handler: 'openNote' },
    ],
    signals: [
      { kind: 'warn', ico: '⚠', label: 'محتاج اهتمام', signalKey: 'delayed', target: 'clients.html?filter=atrisk' },
    ],
  };
}

// ── Lightweight telemetry (spec §9) ──
// Subscribe once to the runtime-state store; log view-changes for the
// clients domain. Must never throw — telemetry failure ≠ feature failure.
let _telemetryWired = false;
function wireTelemetry() {
  if (_telemetryWired) return;
  try {
    const top = (typeof window !== 'undefined' && window.top) || window;
    const runtime = top && top.B2CRuntime;
    if (!runtime || typeof runtime.subscribe !== 'function') return;
    runtime.subscribe((state) => {
      if (state && state.domain === 'clients') {
        console.info('[runtime-state] view-change', { domain: state.domain, view: state.view });
      }
    });
    _telemetryWired = true;
  } catch (_) { /* swallow */ }
}

register('clients', ({ container, domain }) => {
  const enabled = isRuntimeStateEnabled();
  console.info('[runtime-state] sidebar-action', { domain: 'clients', pilot: enabled ? 'on' : 'off' });
  wireTelemetry();
  return buildSidebar({ container, domain, config: buildConfig(enabled) });
});
