// Business2Card ERP — Native (Capacitor) bridge
// ────────────────────────────────────────────────
// Loaded by the production web app when it detects it's running inside
// the Capacitor WebView. It bridges:
//   1) Native push notifications  → registerFcmToken callable
//   2) Hardware back button        → in-page navigation
//   3) Status bar / splash         → branded look once auth has settled
//
// Web pages do NOT need to import this directly. shared.js auto-loads it
// when `window.Capacitor` is present.

const isNative = !!(globalThis.Capacitor?.isNativePlatform?.());

export async function initNativeBridge(app, user) {
  if (!isNative || !user?.uid) return;

  try {
    const { Capacitor } = globalThis;
    const platform = Capacitor.getPlatform(); // 'ios' | 'android'

    // 1) Hide splash now that we have an authenticated session
    try {
      const { SplashScreen } = await import('https://cdn.jsdelivr.net/npm/@capacitor/splash-screen@6/dist/esm/index.js');
      await SplashScreen.hide();
    } catch (_) { /* plugin missing — silent */ }

    // 2) Status bar styling — keep parity with the web theme
    try {
      const { StatusBar, Style } = await import('https://cdn.jsdelivr.net/npm/@capacitor/status-bar@6/dist/esm/index.js');
      await StatusBar.setStyle({ style: Style.Dark });
      if (platform === 'android') {
        await StatusBar.setBackgroundColor({ color: '#07080f' });
      }
    } catch (_) { /* silent */ }

    // 3) Hardware back-button on Android — go back in WebView history,
    //    or exit if there's nowhere to go.
    try {
      const { App } = await import('https://cdn.jsdelivr.net/npm/@capacitor/app@6/dist/esm/index.js');
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack && history.length > 1) {
          history.back();
        } else {
          App.exitApp();
        }
      });
    } catch (_) { /* silent */ }

    // 4) Push notifications — request permission, register with FCM/APNs,
    //    forward the token to the existing registerFcmToken callable.
    await registerNativePush(app, platform);

  } catch (e) {
    console.warn('[native-bridge] init error:', e?.message || e);
  }
}

async function registerNativePush(app, platform) {
  const TOKEN_CACHE_KEY = 'b2c_native_push_token';

  try {
    const { PushNotifications } = await import(
      'https://cdn.jsdelivr.net/npm/@capacitor/push-notifications@6/dist/esm/index.js'
    );

    // 1) Permission
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.info('[native-bridge] push permission not granted:', perm.receive);
      return;
    }

    // 2) Register — fires `registration` (with token) or `registrationError`
    await PushNotifications.register();

    PushNotifications.addListener('registration', async (t) => {
      const token = t?.value;
      if (!token) return;

      // Avoid re-registering the same token across launches
      if (localStorage.getItem(TOKEN_CACHE_KEY) === token) {
        console.info('[native-bridge] token unchanged');
        return;
      }

      try {
        const { getFunctions, httpsCallable } = await import(
          'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js'
        );
        const fns = getFunctions(app, 'us-central1');
        const reg = httpsCallable(fns, 'registerFcmToken');
        await reg({
          token,
          userAgent: navigator.userAgent.slice(0, 200),
          platform,                  // 'ios' | 'android' — server side filters by this
        });
        localStorage.setItem(TOKEN_CACHE_KEY, token);
        console.info('[native-bridge] native push token registered (' + platform + ')');
      } catch (e) {
        console.warn('[native-bridge] registerFcmToken failed:', e.message);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[native-bridge] push registration error:', err);
    });

    // 3) Foreground notification — surface a custom event so the
    //    in-app bell badge can tick, mirroring fcm-init.js behavior.
    PushNotifications.addListener('pushNotificationReceived', (notif) => {
      window.dispatchEvent(new CustomEvent('b2c:fcm:foreground', {
        detail: {
          title: notif?.title || '',
          body:  notif?.body  || '',
          data:  notif?.data  || {},
        },
      }));
    });

    // 4) User tapped a notification — navigate to the related page if any
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action?.notification?.data?.url;
      if (url && typeof url === 'string') {
        try { location.assign(url); } catch (_) { /* ignore */ }
      }
    });

  } catch (e) {
    console.warn('[native-bridge] push init failed:', e?.message || e);
  }
}
