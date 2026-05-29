/**
 * Business2Card ERP — features/employee-profile/views/tab-router.js
 *
 * ━━━ TAB ROUTER + UI INTERACTION HELPERS (Phase-3 · god-page decomp) ━━━
 *
 * Wiring utilities for the profile page UI. Each helper accepts the necessary
 * callbacks from the page (so renderer references stay in the page).
 *
 * Exports:
 *   - TAB_KEYS                       — ordered tab id list
 *   - setupStickyHero()              — toggles sticky compact hero on scroll
 *   - setupKeyboardShortcuts(handlers)— Esc + 1-5 + s/t/e shortcuts
 *   - setupQAMenuOutsideClick()      — closes overflow menu on outside click
 *   - toggleQAMenu / closeQAMenu     — DOM-side helpers (id-based)
 */

export const TAB_KEYS = ['overview', 'attendance', 'salaries', 'tasks', 'performance', 'admin'];

// ── QA overflow menu ───────────────────────────────────────────────

export function toggleQAMenu(menuId = 'qa-menu') {
  const m = document.getElementById(menuId);
  if (!m) return;
  m.classList.toggle('open');
}

export function closeQAMenu(menuId = 'qa-menu') {
  document.getElementById(menuId)?.classList.remove('open');
}

/**
 * Closes the QA menu when clicking outside of it. Returns the listener
 * for optional removal.
 */
export function setupQAMenuOutsideClick(menuId = 'qa-menu') {
  const listener = (e) => {
    if (!e.target.closest('#' + menuId) && !e.target.closest('[onclick*="toggleQAMenu"]')) {
      closeQAMenu(menuId);
    }
  };
  document.addEventListener('click', listener);
  return listener;
}

// ── Sticky compact hero on scroll ───────────────────────────────────

/**
 * Toggles `.show` on the compact-hero element when the main hero scrolls off.
 *
 * @param {Object} [opts]
 * @param {string} [opts.compactId='hero-compact']
 * @param {string} [opts.coverSelector='.hero-cover']
 * @param {number} [opts.threshold=60]    — px of cover.bottom below which compact shows
 */
export function setupStickyHero({
  compactId = 'hero-compact',
  coverSelector = '.hero-cover',
  threshold = 60,
} = {}) {
  let ticking = false;
  const listener = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const compact = document.getElementById(compactId);
      const cover = document.querySelector(coverSelector);
      if (compact && cover) {
        const r = cover.getBoundingClientRect();
        compact.classList.toggle('show', r.bottom < threshold);
      }
      ticking = false;
    });
  };
  window.addEventListener('scroll', listener, { passive: true });
  return listener;
}

// ── Keyboard shortcuts ──────────────────────────────────────────────

/**
 * Installs keyboard shortcuts:
 *   Esc       — close QA menu + close all .overlay.open
 *   1-5       — switch tab via handlers.onSwitchTab(TAB_KEYS[n-1])
 *   s / S     — handlers.onSalary()
 *   t / T     — handlers.onTask()
 *   e / E     — handlers.onEdit()
 *
 * Shortcuts are ignored when typing in INPUT/TEXTAREA/SELECT or with modifiers.
 *
 * @param {Object} handlers
 * @param {Function} [handlers.onSwitchTab]
 * @param {Function} [handlers.onSalary]
 * @param {Function} [handlers.onTask]
 * @param {Function} [handlers.onEdit]
 * @param {Function} [handlers.isReady]   — returns false to skip all shortcuts (e.g. no employee loaded)
 * @param {Array<string>} [handlers.tabKeys=TAB_KEYS]
 */
export function setupKeyboardShortcuts(handlers = {}) {
  const tabKeys = handlers.tabKeys || TAB_KEYS;
  const listener = (e) => {
    const tag = (e.target?.tagName || '').toUpperCase();
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.key === 'Escape') {
      closeQAMenu();
      document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
      return;
    }
    if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return;
    if (handlers.isReady && !handlers.isReady()) return;

    // tab shortcuts 1-N
    if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
      e.preventDefault();
      const idx = +e.key - 1;
      const key = tabKeys[idx];
      if (key && handlers.onSwitchTab) handlers.onSwitchTab(key);
      return;
    }
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); handlers.onSalary?.(); }
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); handlers.onTask?.(); }
    else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handlers.onEdit?.(); }
  };
  document.addEventListener('keydown', listener);
  return listener;
}
