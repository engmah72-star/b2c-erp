// ════════════════════════════════════════════════════════════════════
// Service Worker Registration — Aggressive Auto-Update
// ════════════════════════════════════════════════════════════════════
//
// The mobile PWA cache was causing repeated user frustration: even after
// deploying fixes, updates wouldn't propagate without manual reset.
//
// This implementation:
//
// 1. controllerchange → auto-reload (one-shot, loop-guarded)
//    Fires when sw.js calls clients.claim() during activate. The new SW
//    is now controlling the page → reload to apply fresh assets.
//
// 2. registration.update() on every visibility change
//    When user switches back to the PWA (app-switcher resume), force a
//    fresh sw.js fetch. Handles the case where PWA was backgrounded
//    while a new version deployed.
//
// 3. registration.update() every 5 min while page is visible
//    Catches deploys that happen while the user has the page open.
//
// 4. registration.update() once on initial load
//    Standard check.
//
// 5. updateViaCache: 'none'
//    Tells browser to NEVER http-cache sw.js itself. Critical — without
//    this, the browser could serve stale sw.js for up to 24h and the
//    above checks would never see the new version.
//
// Combined with sw.js's skipWaiting() + clients.claim(), new versions
// reach the user within seconds of detection (vs hours/days previously).

// ════════════════════════════════════════════════════════════════════
// Legacy host redirect — GitHub Pages (.io) → Firebase (.app)
// ════════════════════════════════════════════════════════════════════
// الإنتاج الرسمي على business2card-c041b.web.app (Firebase) — اللي بيتحدّث
// أوتوماتيك مع كل deploy. الـ GitHub Pages mirror (engmah72-star.github.io)
// مش متربوط بأي نشر تلقائي فبيتجمّد على نسخة قديمة. أي حد يفتح القديم
// نحوّله فوراً للرسمي. مشروط بالـ hostname → الـ .app مايتأثرش (لا loop).
(function () {
  try {
    var h = location.hostname;
    if (h.indexOf('github.io') !== -1) {
      var target = 'https://business2card-c041b.web.app'
                 + location.pathname.replace(/^\/b2c-erp/, '')
                 + location.search + location.hash;
      location.replace(target);
      return; // أوقف باقي السكريبت — إحنا بنغادر الصفحة
    }
  } catch (_) {}
})();

if ('serviceWorker' in navigator) {
  const RELOAD_KEY = '__b2c_sw_last_reload';
  const LOOP_WINDOW_MS = 10000;
  const PERIODIC_UPDATE_MS = 300000; // 5 min
  const RESUME_GRACE_MS = 5000;

  // Track when the page was last hidden (app-switcher / backgrounded).
  // controllerchange during a warm resume is suppressed — the new SW
  // will serve future navigations; no need to disrupt the current session.
  var _lastHiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') _lastHiddenAt = Date.now();
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Suppress reload loops (original guard)
    let last = 0;
    try { last = +sessionStorage.getItem(RELOAD_KEY) || 0; } catch (_) {}
    const now = Date.now();
    if (now - last < LOOP_WINDOW_MS) {
      try { console.warn('[sw-register] suppressing reload loop'); } catch (_) {}
      return;
    }

    // On Android, returning from another app triggers visibilitychange →
    // reg.update() → if a deploy happened while away, controllerchange fires
    // and the page reloads mid-session. Suppress reload during warm resume;
    // the new SW will handle future navigations without disrupting state.
    if (_lastHiddenAt && (now - _lastHiddenAt) < RESUME_GRACE_MS) {
      console.info('[sw-register] new SW activated during resume — deferring reload');
      return;
    }

    try { sessionStorage.setItem(RELOAD_KEY, String(now)); } catch (_) {}
    window.location.reload();
  });

  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => {
      // Initial update check on page load
      reg.update().catch(() => {});

      // Update check whenever user comes back to the PWA.
      // Debounced — Android can fire multiple visibilitychange on resume.
      var _resumeTimer = 0;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          clearTimeout(_resumeTimer);
          _resumeTimer = setTimeout(() => reg.update().catch(() => {}), 2000);
        }
      });

      // Periodic check while page is visible — catches deploys mid-session
      setInterval(() => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
        }
      }, PERIODIC_UPDATE_MS);
    })
    .catch(() => {});
}
