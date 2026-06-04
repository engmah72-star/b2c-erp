/* cp-sw.js — Service Worker لتطبيق العميل (PWA).
   network-first: دائمًا أحدث نسخة من الشبكة، والكاش fallback للأوفلاين فقط
   (فلا مشكلة تقادم، ولا حاجة لـ bump نسخة عند كل نشر). منفصل عن sw.js (الطاقم). */
const CACHE = 'cp-app-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // تجاهُل طلبات غير http(s) (chrome-extension…)
  if (!req.url.startsWith('http')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        try {
          if (new URL(req.url).origin === self.location.origin && res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
        } catch (_) { /* تجاهل */ }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
