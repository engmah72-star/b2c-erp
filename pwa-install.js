// ══════════════════════════════════════════════════════════
// pwa-install.js — Smart PWA install prompt
// ══════════════════════════════════════════════════════════
// يُحقن في كل الصفحات. يستقبل beforeinstallprompt event ويعرض
// banner ذكي في أسفل-وسط الصفحة بعد:
//   • مرور 30 ثانية على الـ session (لا spam لـ first-visit)
//   • عدم تثبيت التطبيق سابقاً (display-mode standalone check)
//   • عدم رفض الـ banner خلال آخر 30 يوم (localStorage)
// ══════════════════════════════════════════════════════════
(function(){
  'use strict';

  // Skip on public/redirect pages
  const PATH = (location.pathname.split('/').pop() || '').toLowerCase();
  const SKIP = ['waybill.html','chat.html',''];
  if (SKIP.includes(PATH)) return;

  // Already installed? (running in standalone mode)
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (window.navigator.standalone) return; // iOS Safari

  // Recently dismissed? Skip for 30 days
  const DISMISS_KEY = 'pwa_install_dismissed_at';
  const dismissedAt = parseInt(localStorage.getItem(DISMISS_KEY) || '0');
  if (dismissedAt && (Date.now() - dismissedAt) < 30 * 86400000) return;

  let deferredPrompt = null;
  let bannerShown = false;

  // Capture the install prompt event (Chrome/Edge/Brave)
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    // Schedule banner after 30s on page
    setTimeout(() => { if (!bannerShown) showBanner(); }, 30000);
  });

  // iOS: no beforeinstallprompt — show iOS-specific banner after 60s
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    setTimeout(() => { if (!bannerShown) showBanner('ios'); }, 60000);
  }

  function showBanner(mode) {
    if (bannerShown) return;
    bannerShown = true;
    if (document.getElementById('pwa-install-banner')) return;

    const style = document.createElement('style');
    style.id = 'pwa-install-style';
    style.textContent = ''
      + '#pwa-install-banner{position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(110%);'
      + 'z-index:9990;background:linear-gradient(135deg,#1e2536,#161b27);border:1px solid rgba(167,139,250,.35);'
      + 'border-radius:var(--rad2);padding:14px 16px;color:#e8eaf0;font-family:IBM Plex Sans Arabic,Arial,sans-serif;'
      + 'direction:rtl;display:flex;align-items:center;gap:var(--space-md);max-width:92vw;width:380px;'
      + 'box-shadow:0 12px 32px rgba(0,0,0,.5),0 0 0 1px rgba(167,139,250,.1);'
      + 'transition:transform .4s cubic-bezier(.4,0,.2,1);}'
      + '#pwa-install-banner.show{transform:translateX(-50%) translateY(0);}'
      + '#pwa-install-banner .pwa-ico{font-size:var(--fs-4xl);flex-shrink:0;line-height:1}'
      + '#pwa-install-banner .pwa-body{flex:1;min-width:0}'
      + '#pwa-install-banner .pwa-title{font-size:var(--fs-md);font-weight:var(--fw-extra);color:#fff;margin-bottom:2px}'
      + '#pwa-install-banner .pwa-sub{font-size:var(--fs-sm);color:#a8b4cc;line-height:var(--lh-base)}'
      + '#pwa-install-banner .pwa-actions{display:flex;gap:6px;flex-shrink:0}'
      + '#pwa-install-banner button{border:none;cursor:pointer;font-family:inherit;font-weight:var(--fw-bold);'
      + 'padding:7px 13px;border-radius:9px;font-size:var(--fs-base);transition:opacity .15s}'
      + '#pwa-install-banner .pwa-btn-install{background:linear-gradient(135deg,var(--p),#3b9aff);color:#fff}'
      + '#pwa-install-banner .pwa-btn-install:hover{opacity:.9}'
      + '#pwa-install-banner .pwa-btn-dismiss{background:transparent;color:#7878a0;padding:7px 9px}'
      + '#pwa-install-banner .pwa-btn-dismiss:hover{color:#fff}'
      + '@media (max-width:600px){#pwa-install-banner{bottom:78px;width:calc(100vw - 28px)}}';
    document.head.appendChild(style);

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    const iosHint = mode === 'ios'
      ? '<div class="pwa-sub">اضغط <b style="color:#fff">⎙ مشاركة</b> ثم <b style="color:#fff">إضافة إلى الشاشة الرئيسية</b></div>'
      : '<div class="pwa-sub">وصول أسرع بدون فتح browser</div>';
    const actionBtns = mode === 'ios'
      ? '<button class="pwa-btn-dismiss" type="button">حسناً</button>'
      : '<button class="pwa-btn-install" type="button">📲 تثبيت</button><button class="pwa-btn-dismiss" type="button">لاحقاً</button>';
    banner.innerHTML = ''
      + '<div class="pwa-ico">📱</div>'
      + '<div class="pwa-body">'
      +   '<div class="pwa-title">ثبّت Business2Card على شاشتك</div>'
      +   iosHint
      + '</div>'
      + '<div class="pwa-actions">' + actionBtns + '</div>';
    document.body.appendChild(banner);
    // Slide in
    requestAnimationFrame(() => banner.classList.add('show'));

    const installBtn = banner.querySelector('.pwa-btn-install');
    const dismissBtn = banner.querySelector('.pwa-btn-dismiss');

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) { hideBanner(); return; }
        deferredPrompt.prompt();
        try {
          const { outcome } = await deferredPrompt.userChoice;
          console.log('[pwa-install] outcome:', outcome);
        } catch(e) { console.warn('[pwa-install] error:', e?.message); }
        deferredPrompt = null;
        hideBanner();
        // Don't re-prompt for 365 days regardless of outcome
        localStorage.setItem(DISMISS_KEY, String(Date.now() + 335 * 86400000));
      });
    }

    dismissBtn.addEventListener('click', () => {
      hideBanner();
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    });
  }

  function hideBanner() {
    const b = document.getElementById('pwa-install-banner');
    if (b) { b.classList.remove('show'); setTimeout(() => b.remove(), 400); }
  }

  // If user installs via browser menu, clear our prompt state
  window.addEventListener('appinstalled', () => {
    console.log('[pwa-install] installed via browser');
    hideBanner();
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 365 * 86400000));
  });
})();
