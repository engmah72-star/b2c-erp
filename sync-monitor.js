// ══ Sync Monitor - يراقب الاتصال الفعلي بالإنترنت ══
(function(){
  let syncBanner = null;

  function showBanner(){
    if(syncBanner) return;
    syncBanner = document.createElement('div');
    syncBanner.id = 'sync-banner';
    syncBanner.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:9999;
      background:#ff3d6e;color:#fff;text-align:center;
      padding:10px;font-size:13px;font-weight:700;
      font-family:IBM Plex Sans Arabic,sans-serif;
    `;
    syncBanner.innerHTML = `
      ⚠️ انقطع الاتصال — البيانات قد لا تكون محدّثة
      <button onclick="location.reload()" style="margin-right:12px;padding:4px 12px;border:none;border-radius:6px;background:#fff;color:#ff3d6e;cursor:pointer;font-weight:700">🔄 تحديث</button>
    `;
    document.body.prepend(syncBanner);
  }

  function hideBanner(){
    if(syncBanner){ syncBanner.remove(); syncBanner = null; }
  }

  // لو الصفحة اتفتحت وهي offline
  if(!navigator.onLine) showBanner();

  window.addEventListener('online', function(){
    hideBanner();
    location.reload();
  });

  window.addEventListener('offline', function(){
    showBanner();
  });

  // متاح للصفحات اللي بتستخدمه
  window.markSynced = function(){ hideBanner(); };
})();
