// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Page Bridge (Layer 4 client-side)
// ════════════════════════════════════════════════════════════════════
//
// Reusable bootstrap helper for god pages (clients/production/design/
// shipping/inbox) to participate in B2CRuntime state messaging.
//
// Each page:
//   1. Provides an `applyView(view)` function that knows how to apply
//      a view id to its own filter handlers (setFilter, setQuickFilter,
//      setMineFilter, etc).
//   2. Imports + calls installPageBridge({ domain, applyView }).
//
// The helper:
//   - Parses ?filter=<view> on first paint (URL fallback for direct nav)
//   - Subscribes to 'b2c:runtime-state' messages from the shell
//   - Announces 'b2c:runtime-ready' so the shell replays current state
//   - Retries applyView once if it returns falsy (chips may not be
//     mounted yet — race against deferred page-shell modules)
//
// Usage:
//   <script type="module">
//     import { installPageBridge } from './core/runtime-shell/page-bridge.js?v=1';
//     installPageBridge({
//       domain: 'production',
//       applyView: (view) => {
//         // page-specific routing to setFilter / setMineFilter / etc.
//         // return truthy on success, falsy to request retry.
//       }
//     });
//   </script>
//
// Same-origin frames only. Cross-origin frames silently no-op.
// ════════════════════════════════════════════════════════════════════

const RETRY_DELAY_MS = 80;

export function installPageBridge({ domain, applyView }) {
  if (!domain || typeof applyView !== 'function') return;

  function tryApply(view) {
    if (!view) return false;
    let ok = false;
    try { ok = !!applyView(view); } catch (e) { console.warn('[page-bridge:' + domain + '] applyView error', e); }
    if (!ok) setTimeout(() => { try { applyView(view); } catch (_) {} }, RETRY_DELAY_MS);
    return ok;
  }

  function fromUrl() {
    try {
      const v = new URLSearchParams(location.search).get('filter');
      if (v) tryApply(v);
    } catch (_) { /* ignore */ }
  }

  function onMessage(e) {
    const data = e?.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'b2c:runtime-state') return;
    const state = data.state || {};
    if (state.domain && state.domain !== domain) return;
    if (state.view) tryApply(state.view);
  }

  function announceReady() {
    if (typeof window === 'undefined') return;
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'b2c:runtime-ready', domain }, '*');
      } catch (_) { /* not embedded — fine */ }
    }
  }

  // Boot
  window.addEventListener('message', onMessage);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      fromUrl();
      announceReady();
    }, { once: true });
  } else {
    fromUrl();
    announceReady();
  }
}
