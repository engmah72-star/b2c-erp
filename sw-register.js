// Centralized Service Worker registration with safe auto-reload.
//
// Why: when a new sw.js is deployed, the new SW installs in the background
// but does NOT control existing pages until they're reloaded. We listen for
// `controllerchange` (fired when clients.claim() takes effect) and reload
// once so the user immediately sees the new version.
//
// Loop protection: a 10-second sessionStorage timestamp guards against
// pathological cases where controllerchange fires on every load — without
// this, the page could reload infinitely.

if ('serviceWorker' in navigator) {
  const RELOAD_KEY = '__b2c_sw_last_reload';
  const LOOP_WINDOW_MS = 10000;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    let last = 0;
    try { last = +sessionStorage.getItem(RELOAD_KEY) || 0; } catch (_) {}
    const now = Date.now();
    if (now - last < LOOP_WINDOW_MS) {
      // Reloaded less than 10s ago — refuse to reload again to avoid a loop.
      try { console.warn('[sw-register] suppressing reload loop'); } catch (_) {}
      return;
    }
    try { sessionStorage.setItem(RELOAD_KEY, String(now)); } catch (_) {}
    window.location.reload();
  });

  // updateViaCache: 'none' tells the browser NOT to cache sw.js itself —
  // ensures we always pick up new SW versions on next page load.
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .catch(() => {});
}
