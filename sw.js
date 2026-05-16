// Business2Card ERP — Service Worker
// Strategy: Stale-While-Revalidate for app shell + cacheable CDNs.
//           Firebase API endpoints are never intercepted (data must stay live).
// Cache name is auto-bumped to b2c-<commit-sha> by deploy.yml on every release,
// so old caches are deleted on activate and users get fresh code on next load.
const CACHE = 'b2c-v141';

// App shell — fetched on install. Relative paths so the SW works at any scope.
// Includes role-landing dashboards so any signed-in user lands on a usable
// shell when first opening the app offline.
const PRECACHE = [
  './',
  './login.html',
  './index.html',
  './offline.html',
  './shared.css',
  './shared.js',
  './financial-sync-engine.js',
  './cs-dashboard.html',
  './ops-dashboard.html',
  './designer-dashboard.html',
  './production-dashboard.html',
  './shipping-dashboard.html',
];

// Third-party hosts that serve immutable / near-immutable assets.
const CACHEABLE_HOSTS = [
  'www.gstatic.com',       // Firebase SDK (versioned URLs)
  'fonts.googleapis.com',  // Google Fonts stylesheet
  'fonts.gstatic.com',     // Google Fonts woff2 files
];

// Firebase API endpoints — dynamic data, must not be cached.
const NEVER_CACHE_HOSTS = [
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebasestorage.googleapis.com',
  'fcm.googleapis.com',
  'firebase.googleapis.com',
  'firebaseio.com',
];

// ─── Install ─────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // Per-URL add() with catch — a single missing file won't abort install.
      Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))
    )
  );
  self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch — Stale-While-Revalidate ─────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  if (NEVER_CACHE_HOSTS.some(h => url.hostname.endsWith(h))) return;

  const sameOrigin = url.origin === self.location.origin;
  const cacheableCdn = CACHEABLE_HOSTS.some(h => url.hostname === h);
  if (!sameOrigin && !cacheableCdn) return;

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && res.status === 200 && res.type !== 'opaqueredirect') {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      }).catch(async () => {
        // Both cache miss + network fail → show offline shell for navigations,
        // so users see a branded fallback instead of the browser's dino page.
        if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
          return (await cache.match('./offline.html')) || cached;
        }
        return cached;
      });
      return cached || network;
    })
  );
});
