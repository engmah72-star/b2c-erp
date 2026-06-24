// ══ Sync Monitor - يراقب الاتصال الفعلي بالإنترنت ══
(function(){
  let syncBanner = null;
  let _isOffline = !navigator.onLine;

  function showBanner(){
    if(syncBanner) return;
    syncBanner = document.createElement('div');
    syncBanner.id = 'sync-banner';
    syncBanner.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:9999;
      background:var(--r);color:#fff;text-align:center;
      padding:10px;font-size:var(--fs-md);font-weight:var(--fw-bold);
      font-family:IBM Plex Sans Arabic,sans-serif;
    `;
    syncBanner.innerHTML = `
      ⚠️ وضع بدون إنترنت — قراءة فقط (البيانات من الكاش)
      <button type="button" onclick="location.reload()" style="margin-right:12px;padding:4px 12px;border:none;border-radius:6px;background:#fff;color:var(--r);cursor:pointer;font-weight:var(--fw-bold)">🔄 تحديث</button>
    `;
    document.body.prepend(syncBanner);
  }

  function hideBanner(){
    if(syncBanner){ syncBanner.remove(); syncBanner = null; }
  }

  // لو الصفحة اتفتحت وهي offline
  if(_isOffline) showBanner();

  window.addEventListener('online', function(){
    _isOffline = false;
    hideBanner();
    location.reload();
  });

  window.addEventListener('offline', function(){
    _isOffline = true;
    showBanner();
  });

  // متاح للصفحات اللي بتستخدمه
  window.markSynced = function(){ hideBanner(); };

  window.isAppOffline = function(){ return _isOffline; };

  window.guardOnline = function(actionName){
    if(!_isOffline) return true;
    const msg = actionName
      ? `⚠️ لا يمكن تنفيذ "${actionName}" بدون اتصال بالإنترنت`
      : '⚠️ هذا الإجراء يحتاج اتصال بالإنترنت';
    if(typeof window.toast === 'function') window.toast(msg, 'err');
    else alert(msg);
    return false;
  };

  // ── مؤشر حالة الكاش — يظهر عند عرض بيانات من الكاش وينتهي عند المزامنة ──
  let cacheBadge = null;

  window.showCacheIndicator = function() {
    if (cacheBadge || !document.body) return;
    cacheBadge = document.createElement('div');
    cacheBadge.id = 'cache-indicator';
    cacheBadge.style.cssText = `
      position:fixed;bottom:16px;left:16px;z-index:9998;
      background:var(--y, #f59e0b);color:#fff;
      padding:6px 14px;border-radius:20px;
      font-size:13px;font-weight:600;
      font-family:IBM Plex Sans Arabic,sans-serif;
      opacity:0.9;transition:opacity 0.3s;
      pointer-events:none;
    `;
    cacheBadge.textContent = '⏳ بيانات مؤقتة — جاري التحديث...';
    document.body.appendChild(cacheBadge);
  };

  window.hideCacheIndicator = function() {
    if (cacheBadge) {
      cacheBadge.style.opacity = '0';
      setTimeout(() => { cacheBadge?.remove(); cacheBadge = null; }, 300);
    }
  };
})();
