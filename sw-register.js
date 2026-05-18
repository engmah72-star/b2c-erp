// Centralized Service Worker registration with auto-reload on update.
//
// Why: when a new sw.js is deployed, the new SW installs in the background
// but does NOT control existing pages until they're reloaded. Even with
// skipWaiting() + clients.claim() the page still shows stale code (the
// HTML/JS that's already in the DOM) until the user reloads. This file
// listens for `controllerchange` — fired when clients.claim() takes effect —
// and reloads the page ONCE so the user immediately sees the new version
// without manual hard-reload.
//
// Replaces the inline `register('sw.js')` snippets that were duplicated
// across 17 HTML files.

if ('serviceWorker' in navigator) {
  let __swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (__swReloaded) return;
    __swReloaded = true;
    // Reload once so the page is now served by the new SW (network-first
    // will then fetch the latest HTML/JS).
    window.location.reload();
  });
  // updateViaCache: 'none' tells the browser NOT to cache sw.js itself —
  // ensures we always pick up new SW versions on next page load.
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .catch(() => {});
}
