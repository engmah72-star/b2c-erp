// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Runtime State Controller (Layer 4)
// ════════════════════════════════════════════════════════════════════
//
// Phase 1 (per CLIENTS_UX_OWNERSHIP_AUDIT.md) — single source of truth
// for the operational state shared between sidebar (controller) and
// workspace iframe (renderer).
//
// State shape:
//   {
//     domain:  'clients' | 'design' | ...    // current active domain
//     view:    'active'  | 'rem' | ...       // domain-specific view id
//     filters: { search, period, tag, ... }  // optional in-domain filters
//     mode:    'cards'   | 'list' | ...      // presentation mode
//   }
//
// API (window.B2CRuntime):
//   setView(partial)              → merge into state + notify + broadcast
//   getState()                    → defensive copy
//   subscribe(handler)            → in-shell subscribers (returns unsub)
//   init()                        → wire postMessage bridge
//
// Cross-frame protocol:
//   shell → iframe :  { type:'b2c:runtime-state', state }
//   iframe → shell :  { type:'b2c:runtime-ready', domain }  (handshake)
//                     shell replies with current state for that domain.
//
// Backward-compat (Phase 1a):
//   The legacy URL-based navigation (B2CShell.openInWorkspace) still
//   works. Sidebar items with `state:` use the new path; items with
//   only `deepLink:` keep the old behaviour. Pages without a listener
//   simply ignore postMessage — no breakage.
// ════════════════════════════════════════════════════════════════════

const _initial = Object.freeze({
  domain: null,
  view: null,
  filters: {},
  mode: null,
});

let _state = { ..._initial, filters: {} };
const _subscribers = new Set();
let _wired = false;

/**
 * Merge a partial state update. Pass any subset of {domain, view, filters, mode}.
 * `filters` is shallow-merged (so you can update one filter without resetting others).
 */
export function setView(partial = {}) {
  if (partial == null || typeof partial !== 'object') return;
  const next = {
    domain:  Object.prototype.hasOwnProperty.call(partial, 'domain') ? partial.domain : _state.domain,
    view:    Object.prototype.hasOwnProperty.call(partial, 'view')   ? partial.view   : _state.view,
    mode:    Object.prototype.hasOwnProperty.call(partial, 'mode')   ? partial.mode   : _state.mode,
    filters: partial.filters
      ? { ..._state.filters, ...partial.filters }
      : _state.filters,
  };
  // No-op if nothing actually changed (avoids needless broadcasts).
  if (_shallowEqual(next, _state) && _shallowEqual(next.filters, _state.filters)) return;
  _state = next;
  _notify();
  _broadcast();
}

export function getState() {
  return { ..._state, filters: { ..._state.filters } };
}

export function subscribe(handler) {
  if (typeof handler !== 'function') return () => {};
  _subscribers.add(handler);
  return () => _subscribers.delete(handler);
}

/**
 * Wire postMessage bridge. Idempotent. Call once from shell.html after
 * window.B2CRuntime is exposed.
 */
export function init() {
  if (_wired || typeof window === 'undefined') return;
  _wired = true;
  window.addEventListener('message', (e) => {
    const data = e?.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'b2c:runtime-ready') return;
    // The iframe just loaded and wants the current state. Reply.
    const target = e.source;
    if (target && typeof target.postMessage === 'function') {
      try {
        target.postMessage({ type: 'b2c:runtime-state', state: getState() }, '*');
      } catch (_) { /* ignore */ }
    }
  });
}

// ── internals ──
function _notify() {
  for (const h of _subscribers) {
    try { h(getState()); } catch (err) { console.warn('[runtime-state] subscriber error', err); }
  }
}

function _broadcast() {
  if (typeof document === 'undefined') return;
  const frames = document.querySelectorAll('.rt-workspace-frame');
  for (const f of frames) {
    try {
      f.contentWindow?.postMessage({ type: 'b2c:runtime-state', state: getState() }, '*');
    } catch (_) { /* cross-origin frames silently skipped */ }
  }
}

function _shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}
