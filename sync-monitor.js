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

  // ── Connection quality detection ──
  const _conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  let _isSlow = false;

  function _checkConnectionQuality() {
    if (!_conn) return;
    const eff = _conn.effectiveType || '';
    _isSlow = eff === 'slow-2g' || eff === '2g' || _conn.saveData === true;
  }
  _checkConnectionQuality();
  if (_conn) _conn.addEventListener('change', _checkConnectionQuality);

  window.isSlowConnection = function() {
    if (!_conn) return false;
    _checkConnectionQuality();
    return _isSlow;
  };

  window.getConnectionInfo = function() {
    if (!_conn) return { effectiveType: 'unknown', downlink: -1, rtt: -1, saveData: false };
    return {
      effectiveType: _conn.effectiveType || 'unknown',
      downlink: _conn.downlink || -1,
      rtt: _conn.rtt || -1,
      saveData: !!_conn.saveData
    };
  };

  // ── Slow network banner (amber, non-blocking) ──
  let slowBadge = null;
  function _showSlowBanner() {
    if (slowBadge || _isOffline) return;
    slowBadge = document.createElement('div');
    slowBadge.id = 'slow-net-banner';
    slowBadge.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:9998;
      background:var(--y, #f59e0b);color:#fff;text-align:center;
      padding:6px;font-size:13px;font-weight:600;
      font-family:IBM Plex Sans Arabic,sans-serif;
      transition:opacity 0.3s;
    `;
    slowBadge.textContent = '🐢 اتصال بطيء — يتم عرض البيانات من الكاش لتسريع التجربة';
    document.body.prepend(slowBadge);
  }
  function _hideSlowBanner() {
    if (slowBadge) { slowBadge.remove(); slowBadge = null; }
  }
  if (_conn) {
    _conn.addEventListener('change', function() {
      _checkConnectionQuality();
      if (_isSlow && !_isOffline) _showSlowBanner();
      else _hideSlowBanner();
    });
    if (_isSlow && !_isOffline && document.body) _showSlowBanner();
    else if (_isSlow) document.addEventListener('DOMContentLoaded', function() { if (_isSlow && !_isOffline) _showSlowBanner(); }, { once: true });
  }

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
