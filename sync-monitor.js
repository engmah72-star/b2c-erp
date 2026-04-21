// ══ Sync Monitor - يراقب الاتصال ويعيد التشغيل ══
(function(){
  const TIMEOUT = 30000; // 30 ثانية بدون بيانات = مشكلة
  let lastUpdate = Date.now();
  let syncBanner = null;

  // تسجيل آخر تحديث
  window.markSynced = function(){
    lastUpdate = Date.now();
    hideBanner();
  };

  // إنشاء بانر تحذير
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

  // راقب الاتصال كل 15 ثانية
  setInterval(function(){
    if(Date.now() - lastUpdate > TIMEOUT){
      showBanner();
    }
  }, 15000);

  // راقب online/offline
  window.addEventListener('online', function(){
    hideBanner();
    location.reload(); // أعد التحميل لما يرجع الاتصال
  });
  window.addEventListener('offline', function(){
    showBanner();
  });
})();
