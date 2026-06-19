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

  function init(pageKey, opts) {
    var storageKey = pageKey + '.pageState';
    var restored = _load(storageKey);
    var _uiRestored = false;

    window.addEventListener('beforeunload', function () {
      _save(storageKey, opts);
    });

    return {
      data: restored,
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
