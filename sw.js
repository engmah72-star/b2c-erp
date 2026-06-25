// Business2Card ERP — Service Worker
// Strategy:
//   - Network-First (no artificial timeout) for HTML navigations + critical
//     app shell JS. Guarantees users see new releases on the next page load.
//     Falls back to cache only when the network actually fails (offline).
//   - Stale-While-Revalidate for static assets (CSS, images, fonts, CDN libs).
//   - Firebase API endpoints are never intercepted (data must stay live).
// Cache name is auto-bumped to b2c-<commit-sha> by deploy.yml on every release.
const CACHE = 'b2c-v315';
const IMAGE_CACHE = 'b2c-images-v1';
const MAX_IMAGE_CACHE = 200;

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
  '/app-sidebar.js',
  '/core/sidebar-mount.js',
  '/core/sidebar-model.js',
  '/core/runtime-shell/signals-aggregator.js',
  '/viewas.js',
  '/financial-guard.js',
  '/inbox-badge.js',
  '/notifications.js',
  '/finance-core.js',
  '/sync-monitor.js',
  '/sw-register.js',
  '/pwa-install.js',
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
  '/core/perf-vitals.js',
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
  '/features/employee-profile/views/render-modals.js',
  '/features/employee-control/controller.js',
  '/features/employee-control/quick-actions.js',
  '/features/employee-control/render.js',
  '/features/my-home/controller.js',
  '/features/my-home/render.js',
  '/core/incident-reasons.js',
  '/core/task-recurrence.js',
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
  '/core/comms-utils.js',
  '/core/shared-constants.js',
  '/clients-bridge.js',
  // ── Error tracking (Phase-7) — change with deploys ──
  '/core/error-reporter.js',
  '/error-reporter-init.js',
  '/bug-reporter.js',
  '/core/error-report-actions.js',
  // ── Offline-critical core modules — must stay fresh ──
  '/core/data-cache.js',
  '/core/firebase-init.js',
  '/core/permissions-matrix.js',
  '/core/collection-registry.js',
  '/core/query-limits.js',
  '/core/lazy-subs.js',
  '/core/virtual-scroll.js',
  '/core/prefetch-map.js',
  '/core/image-cache.js',
  '/core/page-state.js',
  '/core/storage-helpers.js',
  '/core/auth-reset.js',
  '/core/client-orders-index.js',
  '/core/searchable-select.js',
  '/core/bottom-sheet.js',
  '/core/approvals-utils.js',
  '/core/page-shortcuts.js',
  '/core/offline-warmup.js',
  '/core/static-store.js',
  '/core/perf-monitor.js',
  '/core/live-kpis.js',
  '/sidebar.js',
  '/sidebar-config.js',
  '/clients-data.js',
  '/clients-shell.js',
  '/clients-constants.js',
  '/accounts-render.js',
  '/accounts-kpi-panel.js',
  '/design-control-center.js',
  '/print-control-center.js',
  '/production-actions.js',
  '/supplier-actions.js',
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
  // Role-landing dashboards (HTML + CSS)
  './cs-dashboard.html',
  './cs-dashboard.css',
  './ops-dashboard.html',
  './designer-dashboard.html',
  './designer-dashboard.css',
  './production-dashboard.html',
  './production-dashboard.css',
  './shipping-dashboard.html',
  './exec-dashboard.html',
  './exec-dashboard.css',
  './financial-dashboard.html',
  './accounts.html',
  './clients.html',
  './clients.css',
  // Operational pages — full offline app shell
  './design.html',
  './design.css',
  './order.html',
  './shipping.html',
  './shipping.css',
  './shipping-accounts.html',
  './shipping-accounts.css',
  './production.html',
  './production.css',
  './print.html',
  './print.css',
  './approvals.html',
  './approvals.css',
  './reports.html',
  './reports.css',
  './returns.html',
  './employees.html',
  './employees.css',
  './employee-profile.html',
  './employee-profile.css',
  './suppliers.html',
  './suppliers.css',
  './products.html',
  './products.css',
  './settings.html',
  './settings.css',
  './inbox.html',
  './inbox.css',
  './my-profile.html',
  './my-profile.css',
  './my-home.html',
  './ledger.html',
  // Core modules (offline-critical)
  './core/firebase-init.js',
  './core/data-cache.js',
  './core/permissions-matrix.js',
  './core/lazy-subs.js',
  './core/offline-warmup.js',
  './orders.js',
  './order-actions.js',
  './sync-monitor.js',
  // Design system
  './design-system/components.css',
  './design-system/tokens.css',
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
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMAGE_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Pre-computed Set from NETWORK_FIRST_SUFFIXES for O(1) lookup.
// Entries like '/core/data-cache.js' are stored as-is and matched against
// the full pathname or its last segment (filename).
const _nfSet = new Set(NETWORK_FIRST_SUFFIXES);

// ─── Fetch ───────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Firebase Storage download URLs (alt=media) → cache-first (immutable, token-addressed)
  const isStorageDownload = url.hostname === 'firebasestorage.googleapis.com'
    && url.searchParams.get('alt') === 'media';
  if (isStorageDownload) {
    e.respondWith(cacheFirstImage(req));
    return;
  }

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
    url.pathname.endsWith('.html') ||
    _nfSet.has(url.pathname) || _nfSet.has(url.pathname.slice(url.pathname.lastIndexOf('/')))
  );

  if (isNetworkFirst) {
    e.respondWith(networkFirst(req));
  } else {
    e.respondWith(staleWhileRevalidate(req));
  }
});

// Network-First with smart timeout:
//   - If we HAVE a cached copy → race network vs 4s timeout; serve cache if slow.
//     Background revalidation still updates the cache for the next load.
//   - If we have NO cache → wait indefinitely (can't serve empty).
// This avoids the old 3s-timeout bug (empty page on slow network) while
// eliminating multi-second hangs when a cached version is available.
const NF_TIMEOUT = 4000;

function _raceTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); },
                 e => { clearTimeout(t); reject(e); });
  });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);

  if (cached) {
    const revalidate = fetch(req).then(res => {
      if (res && res.status === 200 && res.type !== 'opaqueredirect') {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    });
    try {
      return await _raceTimeout(revalidate, NF_TIMEOUT);
    } catch (_) {
      revalidate.catch(() => {});
      return cached;
    }
  }

  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type !== 'opaqueredirect') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (_) {
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
      const offline = await cache.match('./offline.html');
      if (offline) return offline;
    }
    return Response.error();
  }
}

function sameOriginPath(url, path) {
  return url.origin === self.location.origin &&
    (url.pathname === '/' + path || url.pathname.endsWith('/' + path));
}

// ─── Cache Size Management ────────────────────────────────
const MAX_CACHE_ENTRIES = 500;

self.addEventListener('message', e => {
  if (e.data === 'TRIM_CACHE') {
    caches.open(CACHE).then(async cache => {
      const keys = await cache.keys();
      if (keys.length <= MAX_CACHE_ENTRIES) return;
      const imgKeys = keys.filter(r => {
        const u = r.url;
        return /\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?|$)/i.test(u);
      });
      const toRemove = imgKeys.slice(0, imgKeys.length - Math.floor(MAX_CACHE_ENTRIES * 0.3));
      for (const r of toRemove) await cache.delete(r).catch(() => {});
    });
    caches.open(IMAGE_CACHE).then(async cache => {
      const keys = await cache.keys();
      if (keys.length <= MAX_IMAGE_CACHE) return;
      const toRemove = keys.slice(0, keys.length - MAX_IMAGE_CACHE);
      for (const r of toRemove) await cache.delete(r).catch(() => {});
    });
  }

  if (e.data === 'PURGE_IMAGE_CACHE') {
    caches.delete(IMAGE_CACHE).catch(() => {});
  }

  if (e.data?.type === 'WARM_IMAGES' && Array.isArray(e.data.urls)) {
    caches.open(IMAGE_CACHE).then(async cache => {
      const batch = e.data.urls.slice(0, 50);
      const uncached = [];
      for (const u of batch) {
        if (!(await cache.match(u))) uncached.push(u);
      }
      const CONCURRENCY = 3;
      for (let i = 0; i < uncached.length; i += CONCURRENCY) {
        await Promise.all(uncached.slice(i, i + CONCURRENCY).map(async u => {
          try {
            const res = await fetch(u);
            if (res.ok && (res.headers.get('content-type') || '').startsWith('image/')) {
              await cache.put(u, res).catch(() => {});
            }
          } catch (_) {}
        }));
      }
    });
  }
});

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

// Cache-First for Firebase Storage images.
// Download URLs are immutable (token-addressed) — safe to serve from cache indefinitely.
async function cacheFirstImage(req) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const ct = res.headers.get('content-type') || '';
      if (ct.startsWith('image/')) {
        cache.put(req, res.clone()).catch(() => {});
      }
    }
    return res;
  } catch (_) {
    return Response.error();
  }
}
