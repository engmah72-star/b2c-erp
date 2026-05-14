// Business2Card ERP — FCM client initializer
// ─────────────────────────────────────────────
// Usage (from any page that already initialized firebase + auth):
//   import { initFcm } from './fcm-init.js';
//   onAuthStateChanged(auth, u => { if (u) initFcm(app, u); });
//
// Behavior:
//   1) Asks for browser permission the FIRST time the user lands on a page
//      after sign-in (silent skip if already granted/denied).
//   2) Registers /firebase-messaging-sw.js as the FCM SW.
//   3) Calls getToken() with the project's VAPID public key.
//   4) Persists the token via the `registerFcmToken` callable so the server
//      can target this device for pushes.
//   5) Wires onMessage (foreground) so the bell badge ticks even while a tab
//      is focused — the system notification only shows when the tab is hidden.
//
// One-time operator setup:
//   Firebase Console → Project Settings → Cloud Messaging → Web Push
//   certificates → Generate key pair → paste the value below.

import { getMessaging, getToken, onMessage, isSupported }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js';
import { getFunctions, httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';

// PUBLIC VAPID key — safe to expose in client code.
// Replace with the value from Firebase Console (see header comment).
const VAPID_KEY = 'REPLACE_WITH_VAPID_PUBLIC_KEY';

const PERM_ASKED_KEY = 'b2c_fcm_perm_asked';
const TOKEN_CACHE_KEY = 'b2c_fcm_token';

export async function initFcm(app, user) {
  try {
    if (!user || !user.uid) return;

    // Older browsers (notably Safari < 16, in-app webviews) may not support FCM
    if (!(await isSupported().catch(() => false))) {
      console.info('[fcm] not supported in this browser');
      return;
    }

    // Need a HTTPS origin (or localhost) for service workers
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      console.info('[fcm] requires HTTPS — skipping');
      return;
    }

    if (VAPID_KEY === 'REPLACE_WITH_VAPID_PUBLIC_KEY') {
      console.warn('[fcm] VAPID key not configured — skipping. Set it in fcm-init.js');
      return;
    }

    // Permission flow — ask only once per browser unless granted later from settings
    let perm = Notification.permission;
    if (perm === 'default' && !sessionStorage.getItem(PERM_ASKED_KEY)) {
      sessionStorage.setItem(PERM_ASKED_KEY, '1');
      perm = await Notification.requestPermission();
    }
    if (perm !== 'granted') {
      console.info('[fcm] permission not granted:', perm);
      return;
    }

    // Register SW (idempotent — browser dedupes by scope+url)
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) {
      console.warn('[fcm] no token returned');
      return;
    }

    // Skip the round-trip if we already saved this exact token in this session
    if (localStorage.getItem(TOKEN_CACHE_KEY) === token) {
      console.info('[fcm] token unchanged');
    } else {
      const fns = getFunctions(app, 'us-central1');
      const reg = httpsCallable(fns, 'registerFcmToken');
      try {
        await reg({
          token,
          userAgent: navigator.userAgent.slice(0, 200),
          platform: 'web',
        });
        localStorage.setItem(TOKEN_CACHE_KEY, token);
        console.info('[fcm] token registered');
      } catch (e) {
        console.warn('[fcm] register failed (will retry next visit):', e.message);
      }
    }

    // Foreground messages — increment the bell badge by writing into the
    // `notifications` collection? No: the SW already wrote nothing for fg
    // messages. We trigger a small badge bump via custom event so notifications.js
    // (or pages) can react. Keep this lightweight — no DOM writes here.
    onMessage(messaging, (payload) => {
      const detail = {
        title: payload.notification?.title || '',
        body:  payload.notification?.body  || '',
        data:  payload.data || {},
      };
      window.dispatchEvent(new CustomEvent('b2c:fcm:foreground', { detail }));
    });

  } catch (e) {
    // Never let FCM init break the page
    console.warn('[fcm] init error:', e.message || e);
  }
}

// Convenience: tear down on sign-out so a shared device doesn't keep pushing
// to the previous user. Call from your logout handler.
export async function teardownFcm(app, token) {
  try {
    if (!token) token = localStorage.getItem(TOKEN_CACHE_KEY);
    if (!token) return;
    const fns = getFunctions(app, 'us-central1');
    const unreg = httpsCallable(fns, 'unregisterFcmToken');
    await unreg({ token }).catch(() => {});
    localStorage.removeItem(TOKEN_CACHE_KEY);
  } catch (_) { /* ignore */ }
}
