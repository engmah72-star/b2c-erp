// ════════════════════════════════════════════════════════════════════
// Page State Persistence — sessionStorage-based state restore across navigation
// ════════════════════════════════════════════════════════════════════
//
// Saves page state (filters, search, scroll, active item) to sessionStorage
// on beforeunload. When the user returns within TTL, state is restored.
//
// Usage (from any page's inline <script>):
//
//   const ps = PageState.init('print', {
//     fields: () => ({ statusFilter, sortBy, mineOnly, activeId }),
//     search: 'search',          // input element ID
//     scroll: '.content',        // scroll container selector
//   });
//
//   // On page load, restore saved values:
//   if (ps.data) {
//     statusFilter = ps.data.statusFilter || 'all';
//     sortBy       = ps.data.sortBy || 'newest';
//   }
//
//   // After first data render, restore scroll + active item:
//   ps.restoreUI(() => {
//     if (ps.data?.activeId) openOrder(ps.data.activeId);
//   });
//
// ════════════════════════════════════════════════════════════════════

(function () {
  if (typeof window === 'undefined') return;

  var TTL = 30 * 60 * 1000; // 30 minutes
  var _staleEl = null;

  function _showStaleIndicator() {
    if (_staleEl || typeof document === 'undefined' || !document.body) return;
    _staleEl = document.createElement('div');
    _staleEl.id = 'ps-stale';
    _staleEl.style.cssText =
      'position:fixed;bottom:16px;left:16px;z-index:9998;' +
      'background:rgba(245,158,11,.9);color:#fff;' +
      'padding:5px 14px;border-radius:20px;' +
      'font-size:12px;font-weight:600;' +
      'font-family:IBM Plex Sans Arabic,sans-serif;' +
      'pointer-events:none;transition:opacity .4s;opacity:.85;' +
      'display:flex;align-items:center;gap:6px;';
    _staleEl.innerHTML =
      '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fff;animation:ps-pulse 1.2s ease-in-out infinite"></span>' +
      'جاري تحديث البيانات...';
    var style = document.createElement('style');
    style.textContent = '@keyframes ps-pulse{0%,100%{opacity:.3}50%{opacity:1}}';
    _staleEl.appendChild(style);
    document.body.appendChild(_staleEl);
  }

  function _hideStaleIndicator() {
    if (!_staleEl) return;
    _staleEl.style.opacity = '0';
    var el = _staleEl;
    _staleEl = null;
    setTimeout(function () { el.remove(); }, 400);
  }

  function init(pageKey, opts) {
    var storageKey = pageKey + '.pageState';
    var restored = _load(storageKey);
    var _uiRestored = false;
    var _snapsRestored = false;

    window.addEventListener('beforeunload', function () {
      _save(storageKey, opts);
    });

    return {
      data: restored,
      hasSnapshots: !!(restored && (restored._snaps || restored._htmlSnaps)),
      restoreSnapshots: function () {
        if (_snapsRestored || !restored) return false;
        _snapsRestored = true;
        var applied = false;
        if (restored._snaps) {
          for (var id in restored._snaps) {
            var el = document.getElementById(id);
            if (el) { el.textContent = restored._snaps[id]; applied = true; }
          }
        }
        if (restored._htmlSnaps) {
          for (var id in restored._htmlSnaps) {
            var el = document.getElementById(id);
            if (el) { el.innerHTML = restored._htmlSnaps[id]; applied = true; }
          }
        }
        if (applied) _showStaleIndicator();
        return applied;
      },
      markFresh: _hideStaleIndicator,
      restoreUI: function (openFn) {
        if (_uiRestored || !restored) return;
        _uiRestored = true;
        if (typeof openFn === 'function' && restored.activeId) {
          setTimeout(openFn, 150);
        }
        if (restored._scrollY && opts.scroll) {
          setTimeout(function () {
            var c = document.querySelector(opts.scroll);
            if (c) c.scrollTop = restored._scrollY;
          }, 200);
        }
      }
    };
  }

  function _save(key, opts) {
    try {
      var state = typeof opts.fields === 'function' ? opts.fields() : {};
      if (opts.search) {
        var el = document.getElementById(opts.search);
        if (el) state._search = el.value || '';
      }
      if (opts.scroll) {
        var c = document.querySelector(opts.scroll);
        if (c) state._scrollY = c.scrollTop || 0;
      }
      if (opts.snapshots) {
        state._snaps = {};
        for (var i = 0; i < opts.snapshots.length; i++) {
          var sid = opts.snapshots[i];
          var sel = document.getElementById(sid);
          if (sel && sel.textContent) state._snaps[sid] = sel.textContent;
        }
      }
      if (opts.htmlSnapshots) {
        state._htmlSnaps = {};
        for (var i = 0; i < opts.htmlSnapshots.length; i++) {
          var hid = opts.htmlSnapshots[i];
          var hel = document.getElementById(hid);
          if (hel && hel.innerHTML && hel.innerHTML.length < 8000) {
            state._htmlSnaps[hid] = hel.innerHTML;
          }
        }
      }
      state._ts = Date.now();
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch (_) {}
  }

  function _load(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      sessionStorage.removeItem(key);
      var st = JSON.parse(raw);
      if (Date.now() - st._ts > TTL) return null;
      return st;
    } catch (_) { return null; }
  }

  window.PageState = { init: init };
})();
