// core/lifecycle-manager.js — Android lifecycle & state restore
//
// Detects Cold Start vs Warm Resume vs SW-Reload and persists the
// current page URL so login.html can redirect back after process kill.
//
// Storage keys (localStorage — survives process kill):
//   b2c_last_page   – { url, ts }
//   b2c_boot_type   – last detected boot type (debug)

const LAST_PAGE_KEY = 'b2c_last_page';
const BOOT_TYPE_KEY = 'b2c_boot_type';
const LAST_PAGE_MAX_AGE = 4 * 60 * 60 * 1000; // 4 hours
const RESUME_WINDOW_MS = 3000;

let _bootType = 'cold';
let _hiddenAt = 0;
let _initialized = false;

function _detectBootType() {
  const navEntries = performance?.getEntriesByType?.('navigation');
  const navType = navEntries?.[0]?.type || performance?.navigation?.type;

  if (navType === 'back_forward' || navType === 2) return 'bfcache';
  if (navType === 'reload' || navType === 1) return 'reload';
  return 'cold';
}

function _saveCurrentPage() {
  try {
    const url = location.href;
    if (!url || url.includes('login.html') || url.includes('change-password.html')) return;
    localStorage.setItem(LAST_PAGE_KEY, JSON.stringify({
      url: location.pathname + location.search,
      ts: Date.now(),
    }));
  } catch (_) {}
}

function getLastPage() {
  try {
    const raw = localStorage.getItem(LAST_PAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.ts > LAST_PAGE_MAX_AGE) {
      localStorage.removeItem(LAST_PAGE_KEY);
      return null;
    }
    return data;
  } catch (_) { return null; }
}

function clearLastPage() {
  try { localStorage.removeItem(LAST_PAGE_KEY); } catch (_) {}
}

function init() {
  if (_initialized) return;
  _initialized = true;

  _bootType = _detectBootType();
  try { localStorage.setItem(BOOT_TYPE_KEY, _bootType); } catch (_) {}
  console.info(`[lifecycle] boot=${_bootType} page=${location.pathname}`);

  _saveCurrentPage();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _hiddenAt = Date.now();
      _saveCurrentPage();
    } else {
      const elapsed = _hiddenAt ? Date.now() - _hiddenAt : 0;
      console.info(`[lifecycle] resume after ${Math.round(elapsed / 1000)}s`);
    }
  });

  window.addEventListener('pagehide', () => {
    _saveCurrentPage();
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      console.info('[lifecycle] restored from bfcache');
      _bootType = 'bfcache';
    }
  });
}

function getBootType() { return _bootType; }

function isWarmResume() {
  return _hiddenAt > 0 && (Date.now() - _hiddenAt) < RESUME_WINDOW_MS;
}

export const lifecycle = { init, getBootType, isWarmResume, getLastPage, clearLastPage };

if (typeof window !== 'undefined') {
  window.__lifecycle = lifecycle;
}
