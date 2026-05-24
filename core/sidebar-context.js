// ════════════════════════════════════════════════════════════════════
// Business2Card ERP — Sidebar Context Bus
// ════════════════════════════════════════════════════════════════════
//
// Pub/sub bus لـ "اللي شُغّال عليه الآن" (entity selection). الصفحات
// بتنشر context بـ B2CContext.set({entity, id}) → الـ sidebar context
// drawer بياخد الـ event ويعرض تفاصيل الـ entity.
//
// مش navigation. مش takeover. مجرد state bus.
//
// URL hash sync: #ctx=order:ORD-123 → deep link + browser back/forward.
//
// API:
//   B2CContext.set({entity, id, page?})  → publish + push state
//   B2CContext.clear()                   → reset to nav default
//   B2CContext.get()                     → current state | null
//   B2CContext.on(handler)               → subscribe، returns unsubscribe
// ════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // Skip لو جوا iframe (defensive — context للـ top window فقط)
  try { if (window.self !== window.top) return; } catch(_) { return; }

  const HASH_PREFIX = '#ctx=';
  let state = null;            // { entity, id, page? } | null
  const handlers = new Set();
  let suppressNextSync = false; // avoid feedback loop set→hashchange→set

  function eq(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.entity === b.entity && a.id === b.id;
  }

  function parseHash() {
    const h = location.hash || '';
    if (!h.startsWith(HASH_PREFIX)) return null;
    const raw = decodeURIComponent(h.slice(HASH_PREFIX.length));
    const idx = raw.indexOf(':');
    if (idx < 0) return null;
    const entity = raw.slice(0, idx);
    const id = raw.slice(idx + 1);
    if (!entity || !id) return null;
    return { entity, id };
  }

  function formatHash(s) {
    if (!s) return '';
    return HASH_PREFIX + encodeURIComponent(s.entity + ':' + s.id);
  }

  function notify() {
    for (const h of handlers) {
      try { h(state); } catch (e) { console.warn('[ctx] handler error', e); }
    }
    try {
      window.dispatchEvent(new CustomEvent('b2c:context', { detail: state }));
    } catch (_) {}
  }

  function set(next) {
    // next: {entity, id, page?} or null
    if (eq(next, state)) return;
    state = next ? { ...next } : null;

    // URL hash sync (push history entry for back support)
    const targetHash = formatHash(state);
    if ((location.hash || '') !== targetHash) {
      suppressNextSync = true;
      try {
        if (state) {
          history.pushState({ sbCtx: targetHash }, '', targetHash);
        } else {
          // Clear hash (replace, not push — لا history entry للـ clear)
          const cleanUrl = location.pathname + location.search;
          history.replaceState({}, '', cleanUrl);
        }
      } catch (_) {
        // Fallback: direct hash manipulation
        try { location.hash = targetHash; } catch (__) {}
      }
    }
    notify();
  }

  function clear() { set(null); }

  function get() { return state ? { ...state } : null; }

  function on(handler) {
    if (typeof handler !== 'function') return () => {};
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  function syncFromHash() {
    if (suppressNextSync) { suppressNextSync = false; return; }
    const fromHash = parseHash();
    if (!eq(fromHash, state)) {
      state = fromHash;
      notify();
    }
  }

  window.addEventListener('popstate', syncFromHash);
  window.addEventListener('hashchange', syncFromHash);

  // Initial state من الـ hash (deep link support)
  const initial = parseHash();
  if (initial) state = initial;

  window.B2CContext = { set, clear, get, on };
})();
