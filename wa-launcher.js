// ══════════════════════════════════════════════════════════
// wa-launcher.js — Floating "WhatsApp Web" button (popup-based, no API)
// ══════════════════════════════════════════════════════════
// يُحقن في كل الصفحات. يضيف زر عائم بأسفل-يسار الشاشة يفتح web.whatsapp.com
// في popup منبثقة. القيد التقني: Meta تمنع iframe embedding عبر
// X-Frame-Options:DENY — لذا popup هو الحل العملي الوحيد.
// كل الصفحات تستخدم نفس popup name 'b2c_whatsapp_work' → re-use واحد للجلسة.
// ══════════════════════════════════════════════════════════
(function(){
  'use strict';

  // Skip pages that don't need the button (public/print/redirect-only)
  const PATH = (location.pathname.split('/').pop() || '').toLowerCase();
  const SKIP = [
    'login.html','client-login.html','client-portal.html',
    'order-tracking.html','waybill.html','whatsapp.html','chat.html','',
  ];
  if (SKIP.includes(PATH)) return;

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  let waWindow = null;

  function launch() {
    if (isMobile) {
      // على الموبايل: يفتح تطبيق الواتساب مباشرة
      window.open('https://wa.me/', '_blank');
      return;
    }
    // ديسكتوب: popup persistent — re-focus أو فتح جديد
    if (waWindow && !waWindow.closed) {
      try { waWindow.focus(); flash('ok'); return; } catch(e) { waWindow = null; }
    }
    const features = 'width=900,height=720,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no';
    waWindow = window.open('https://web.whatsapp.com/', 'b2c_whatsapp_work', features);
    if (!waWindow) {
      flash('err');
      alert('⛔ الـ popup blocked — اسمح للموقع بفتح popups في إعدادات الـ browser ثم اضغط الزر مرة أخرى.');
      return;
    }
    flash('ok');
  }

  function flash(kind) {
    const btn = document.getElementById('wa-fab');
    if (!btn) return;
    btn.classList.remove('wa-flash-ok','wa-flash-err');
    void btn.offsetWidth; // restart animation
    btn.classList.add(kind === 'err' ? 'wa-flash-err' : 'wa-flash-ok');
    setTimeout(() => btn.classList.remove('wa-flash-ok','wa-flash-err'), 700);
  }

  function inject() {
    if (document.getElementById('wa-fab')) return;

    const style = document.createElement('style');
    style.id = 'wa-fab-style';
    style.textContent = ''
      + '#wa-fab{position:fixed;bottom:22px;left:22px;z-index:9998;width:54px;height:54px;'
      + 'border-radius:50%;background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;'
      + 'font-size:24px;text-align:center;border:none;cursor:pointer;padding:0;'
      + 'box-shadow:0 4px 16px rgba(37,211,102,.42);'
      + 'transition:transform .15s ease,box-shadow .15s ease;'
      + 'font-family:inherit;display:flex;align-items:center;justify-content:center;}'
      + '#wa-fab:hover{transform:scale(1.08);box-shadow:0 6px 22px rgba(37,211,102,.55);}'
      + '#wa-fab:active{transform:scale(.96);}'
      + '#wa-fab.wa-flash-ok{animation:wa-flash-ok .55s ease-out;}'
      + '#wa-fab.wa-flash-err{animation:wa-flash-err .55s ease-out;}'
      + '@keyframes wa-flash-ok{0%,100%{background:linear-gradient(135deg,#25d366,#128c7e);}50%{background:#00ff88;}}'
      + '@keyframes wa-flash-err{0%,100%{background:linear-gradient(135deg,#25d366,#128c7e);}50%{background:#ff3d6e;}}'
      + '@media (max-width:768px){#wa-fab{bottom:80px;left:14px;width:50px;height:50px;font-size:22px;}}';
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.id = 'wa-fab';
    btn.type = 'button';
    btn.title = 'واتساب الشغل — افتح WhatsApp Web';
    btn.setAttribute('aria-label', 'واتساب الشغل');
    btn.innerHTML = '<span style="line-height:1">💚</span>';
    btn.addEventListener('click', launch);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  // Expose for programmatic access (e.g., whatsapp.html page or other launchers)
  window.b2cWA = {
    launch: launch,
    isOpen: function(){ return !!(waWindow && !waWindow.closed); },
  };
})();
