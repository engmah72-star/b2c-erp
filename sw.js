// Business2Card ERP — Service Worker
const CACHE = 'b2c-v1';
const OFFLINE_PAGES = [
  '/b2c-erp/login.html',
  '/b2c-erp/index.html',
  '/b2c-erp/shared.css',
];

// Install — cache الملفات الأساسية
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(OFFLINE_PAGES))
  );
  self.skipWaiting();
});

// Activate — امسح الـ cache القديم
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — Network First (Firebase محتاج internet)
self.addEventListener('fetch', e => {
  // Firebase requests — مش نعمل cache
  if (e.request.url.includes('firebase') || 
      e.request.url.includes('googleapis') ||
      e.request.url.includes('gstatic')) {
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // خزّن في cache
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
