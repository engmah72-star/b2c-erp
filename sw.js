// Business2Card ERP — Service Worker
// Strategy:
//   - Network-First (3s timeout) for HTML navigations + critical app shell JS.
//     Guarantees users see new releases on the next page load, not the load
//     after that. Falls back to cache only when offline / network is slow.
//   - Stale-While-Revalidate for static assets (CSS, images, fonts, CDN libs).
//   - Firebase API endpoints are never intercepted (data must stay live).
// Cache name is auto-bumped to b2c-<commit-sha> by deploy.yml on every release.
const CACHE = 'b2c-v151';

// Files we ALWAYS want fresh when online — code paths that change between
// deploys and where stale-while-revalidate caused users to miss new nav
// entries / fixes for one extra reload. Match by URL suffix.
const NETWORK_FIRST_SUFFIXES = [
  '.html',
  '/shared.js',
  '/financial-sync-engine.js',
  '/sw.js',
];
const NETWORK_FIRST_TIMEOUT_MS = 3000;

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

// ─── Fetch ───────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  if (NEVER_CACHE_HOSTS.some(h => url.hostname.endsWith(h))) return;

  const sameOrigin = url.origin === self.location.origin;
  const cacheableCdn = CACHEABLE_HOSTS.some(h => url.hostname === h);
  if (!sameOrigin && !cacheableCdn) return;

  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  const isNetworkFirst = sameOrigin && (
    isNavigation ||
    NETWORK_FIRST_SUFFIXES.some(s => url.pathname.endsWith(s))
  );

  if (isNetworkFirst) {
    e.respondWith(networkFirst(req));
  } else {
    e.respondWith(staleWhileRevalidate(req));
  }
});

// Network-First: try network with a short timeout. Cache the fresh response
// for offline fallback. If network fails or times out, serve from cache.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetchWithTimeout(req, NETWORK_FIRST_TIMEOUT_MS);
    if (res && res.status === 200 && res.type !== 'opaqueredirect') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
      return (await cache.match('./offline.html')) || Response.error();
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then(res => {
    if (res && res.status === 200 && res.type !== 'opaqueredirect') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  }).catch(async () => {
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
      return (await cache.match('./offline.html')) || cached;
    }
    return cached;
  });
  return cached || network;
}

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network-timeout')), ms);
    fetch(req).then(res => { clearTimeout(timer); resolve(res); },
                    err => { clearTimeout(timer); reject(err); });
  });
}
