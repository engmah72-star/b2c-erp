// Business2Card ERP — Firebase Cloud Messaging Service Worker
//
// Required scope: served from origin root so it covers the whole site.
// FCM web requires the "compat" SDK in the SW context (the modular SDK
// doesn't ship a SW build).
//
// Background message flow:
//   Cloud Function sends → FCM → this SW receives via onBackgroundMessage
//   → we render a system notification + click handler that opens the link.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyDEK3I06IMrJPiYX09ULF7OIcbsMOsasUk",
  authDomain:        "business2card-c041b.firebaseapp.com",
  projectId:         "business2card-c041b",
  storageBucket:     "business2card-c041b.firebasestorage.app",
  messagingSenderId: "235622448899",
  appId:             "1:235622448899:web:d8652ff71082f7d003f336",
});

const messaging = firebase.messaging();

// BASE: المجلد الذي يحتوي على هذا الـ SW (مع slash نهائي). يدعم أي host:
//   - Firebase Hosting:  business2card-c041b.web.app/    → BASE = '/'
//   - GitHub Pages user: engmah72-star.github.io/        → BASE = '/'
//   - GitHub Pages repo: engmah72-star.github.io/b2c-erp/ → BASE = '/b2c-erp/'
const BASE = self.location.pathname.replace(/[^/]+$/, '');

messaging.onBackgroundMessage(payload => {
  const n     = payload.notification || {};
  const data  = payload.data || {};
  const title = n.title || 'إشعار جديد';
  const body  = n.body  || '';
  const link  = (payload.fcmOptions && payload.fcmOptions.link)
             || data.link
             || (BASE + 'accounts.html');

  self.registration.showNotification(title, {
    body,
    icon:  BASE + 'icon-192.png',
    badge: BASE + 'icon-192.png',
    dir:   'rtl',
    lang:  'ar',
    data:  { link, ...data },
    tag:   data.type || 'b2c-notif', // collapse same-type bursts
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || (BASE + 'accounts.html');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Reuse an open tab on the same origin if any
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(link);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    })
  );
});
