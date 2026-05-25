// Business2Card ERP — Service Worker
// Strategy:
//   - Network-First (no artificial timeout) for HTML navigations + critical
//     app shell JS. Guarantees users see new releases on the next page load.
//     Falls back to cache only when the network actually fails (offline).
//   - Stale-While-Revalidate for static assets (CSS, images, fonts, CDN libs).
//   - Firebase API endpoints are never intercepted (data must stay live).
// Cache name is auto-bumped to b2c-<commit-sha> by deploy.yml on every release.
const CACHE = 'b2c-v255';

// Files we ALWAYS want fresh when online — code paths that change between
// deploys. Match by URL suffix.
const NETWORK_FIRST_SUFFIXES = [
  '.html',
  '/shared.js',
  '/shared.css',
  '/theme.js',
  '/financial-sync-engine.js',
  '/sw.js',
  // ── Core JS modules without version pins — must stay fresh across deploys ──
  '/sidebar-config.js',
  '/smart-sidebar.js',
  '/viewas.js',
  '/financial-guard.js',
  '/inbox-badge.js',
  '/notifications.js',
  '/finance-core.js',
  '/sync-monitor.js',
  '/sw-register.js',
  '/pwa-install.js',
  '/ai-launcher.js',
  '/ai-engine.js',
  '/orders.js',
  '/order-actions.js',
  '/client-actions.js',
  // ── Clients page modules — frequently updated, must stay fresh ──
  // (السبب: PR #821 fix كان stale-while-revalidate فضّل cache يخدم نسخة قديمة
  //  حتى مع hard refresh. الـ modules دي بتتعدل كتير، فنطلب network-first.)
  '/clients-render.js',
  '/clients-data.js',
  '/clients-modals.js',
  '/clients-shell.js',
  '/clients-upload.js',
  '/clients-image-viewer.js',
  '/clients-ai-search.js',
  '/clients-constants.js',
  '/clients-sidebar.js',
  '/clients-bridge.js',
  '/shipping-actions.js',
  '/inbox-actions.js',
  '/employee-actions.js',
  '/wallet-actions.js',
  '/approval-actions.js',
  '/master-lists-actions.js',
  '/shipping-service.js',
  '/shipping-pricing.js',
  '/core/idempotency.js',
  '/core/telemetry.js',
  '/core/projection.js',
  '/core/financial-invariants.js',
  '/core/audit.js',
  '/fcm-init.js',
  '/firebase-messaging-sw.js',
  '/returns-core.js',
  '/command-palette.js',
  '/ux-globals.js',
  '/clients-render.js',
  '/clients-data.js',
  '/clients-modals.js',
  '/clients-shell.js',
  '/clients-upload.js',
  '/clients-image-viewer.js',
  '/clients-ai-search.js',
  '/clients-constants.js',
  '/clients-sidebar.js',
  '/design-render.js',
  '/design.css',
  '/clients.css',
  // ── Page CSS files extracted in Phase-2D (PRs #771-#777) ──
  '/inbox.css',
  '/reports.css',
  '/shipping.css',
  '/approvals.css',
  '/employees.css',
  '/employee-profile.css',
  '/production.css',
  '/print.css',
  '/cs-dashboard.css',
  '/exec-dashboard.css',
  '/designer-dashboard.css',
  '/production-dashboard.css',
  '/shipping-accounts.css',
  '/suppliers.css',
  '/products.css',
  '/settings.css',
  '/my-profile.css',
  // ── features/* view modules (Phase-1 extracts) — change with deploys ──
  '/features/clients/bizcard-form.js',
  '/features/clients/client-form.js',
  '/features/clients/control-grid.js',
  '/features/clients/followup-form.js',
  '/features/clients/new-order-form.js',
  '/features/cost-items/drawer.js',
  '/features/employee-profile/views/render-admin-tab.js',
  '/features/employee-profile/views/render-attendance.js',
  '/features/employee-profile/views/render-hero.js',
  '/features/employee-profile/views/render-overview-tab.js',
  '/features/employee-profile/views/render-password-card.js',
  '/features/employee-profile/views/render-permissions.js',
  '/features/employee-profile/views/render-salary.js',
  '/features/employee-profile/views/render-score.js',
  '/features/employee-profile/views/tab-router.js',
  '/features/inbox/views/chat-view.js',
  '/features/inbox/views/conv-list-view.js',
  '/features/inbox/views/picker-views.js',
  '/features/inbox/views/stories-view.js',
  '/features/reports/views/render-designers-sales.js',
  '/features/reports/views/render-overview-detailed.js',
  '/features/reports/views/render-returns.js',
  '/features/reports/views/render-shipping-clients.js',
  // ── core/* helpers (Phase-2 extracts) — change with deploys ──
  '/core/dom-utils.js',
  '/core/order-math.js',
  '/core/shared-constants.js',
  '/clients-bridge.js',
  // ── Error tracking (Phase-7) — change with deploys ──
  '/core/error-reporter.js',
  '/error-reporter-init.js',
  '/bug-reporter.js',
  '/core/report-actions.js',
];

// App shell — fetched on install. Relative paths so the SW works at any scope.
// Includes role-landing dashboards so any signed-in user lands on a usable
// shell when first opening the app offline.
const PRECACHE = [
  './',
  './login.html',
  './offline.html',
  './shared.css',
  './shared.js',
  './theme.js',
  './financial-sync-engine.js',
  // Role-landing dashboards (HTML)
  './cs-dashboard.html',
  './ops-dashboard.html',
  './designer-dashboard.html',
  './production-dashboard.html',
  './shipping-dashboard.html',
  // Their dedicated CSS (Phase-2D extracts) — so the role-landing page
  // renders styled on offline first-launch, not just unstyled HTML.
  './cs-dashboard.css',
  './designer-dashboard.css',
  './production-dashboard.css',
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

  // Kill switch: never intercept reset-sw.html — it must always come from
  // the network so the user has a way out if the SW itself is broken.
  if (sameOriginPath(url, 'reset-sw.html')) return;

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

// Network-First (no timeout): wait for the network as long as it takes.
// Only fall back to cache when the network ACTUALLY fails (offline / DNS / etc).
// Why no timeout? A 3s timeout broke slow mobile networks — the page would
// fall back to cache (or empty) before the response arrived. Pure network-first
// matches the browser's natural loading behavior: slow but correct.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type !== 'opaqueredirect') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
      const offline = await cache.match('./offline.html');
      if (offline) return offline;
    }
    // Genuine failure — let the browser show its native error.
    return Response.error();
  }
}

function sameOriginPath(url, path) {
  return url.origin === self.location.origin &&
    (url.pathname === '/' + path || url.pathname.endsWith('/' + path));
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
