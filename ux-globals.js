// ════════════════════════════════════════════════════════════════════
// ux-globals.js — Global modal ergonomics & input helpers
// ════════════════════════════════════════════════════════════════════
// Self-contained IIFE — auto-loaded by sidebar-config.js (35+ pages).
// Mirrors the same handlers in shared.js so pages that import shared.js
// as a module also get them. A guard (window.__b2cUxGlobals) prevents
// double-registration when both files load on the same page.
//
// Provides on every page that loads it:
//   1. Backdrop click → closes the .overlay
//   2. Escape key   → closes the top-most open .overlay
//   3. Enter inside a text-like input in an open modal → invokes the
//      primary action (last non-ghost button in .modal-foot)
//   4. Auto-focus the first text-like input when a modal opens
//   5. window.debounce(fn, ms) — small helper for search inputs
//
// No HTML changes required. Designed to be additive — pages with their
// own keyboard / focus handling that calls e.preventDefault() keep
// priority (defaultPrevented is checked).
// ════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // Guard — shared.js may also register the same handlers when imported as
  // a module. Whichever loads first wins.
  if (window.__b2cUxGlobals) return;
  window.__b2cUxGlobals = true;

  // ── 1. Backdrop click closes the overlay ────────────────────────────
  document.addEventListener('click', e => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('overlay') && t.classList.contains('open')) {
      t.classList.remove('open');
    }
  });

  // ── 2/3. Escape / Enter inside a modal ──────────────────────────────
  const PRIMARY_INPUT_TYPES = new Set([
    'text', 'number', 'email', 'tel', 'password', 'url', 'search',
    'date', 'time', 'datetime-local', 'month', 'week',
  ]);
  document.addEventListener('keydown', e => {
    // Escape → close top-most open overlay
    if (e.key === 'Escape') {
      const opened = document.querySelectorAll('.overlay.open');
      if (!opened.length) return;
      opened[opened.length - 1].classList.remove('open');
      return;
    }
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    const type = (t.type || 'text').toLowerCase();
    if (!PRIMARY_INPUT_TYPES.has(type)) return;
    const overlay = t.closest('.overlay.open');
    if (!overlay) return;
    const foot = overlay.querySelector('.modal-foot');
    if (!foot) return;
    const buttons = foot.querySelectorAll('button:not([disabled])');
    let primary = null;
    for (let i = buttons.length - 1; i >= 0; i--) {
      if (!buttons[i].classList.contains('btn-ghost')) { primary = buttons[i]; break; }
    }
    if (!primary) return;
    e.preventDefault();
    primary.click();
  });

  // ── 4. Auto-focus the first text-like input when an overlay opens ──
  // Saves a click on every modal open. Skips if the page already
  // designated focus via [autofocus] or programmatic focus, and skips
  // hidden / disabled / non-text inputs.
  const SKIP_INPUT_TYPES = new Set(['hidden','checkbox','radio','submit','button','file','image','reset','range','color']);
  function autoFocusFirstInput(overlay) {
    // Defer a frame so any modal that swaps content on open finishes first.
    requestAnimationFrame(() => {
      if (!overlay.classList.contains('open')) return; // closed again already
      // Already focused inside? Don't steal focus.
      const active = document.activeElement;
      if (active && overlay.contains(active) && active.tagName !== 'BODY') return;
      // Page-designated autofocus? Browser handled it (or page focus logic will run).
      if (overlay.querySelector('[autofocus]')) return;
      // First visible text-like input/textarea.
      const cands = overlay.querySelectorAll('input, textarea');
      for (const el of cands) {
        if (el.disabled || el.readOnly) continue;
        if (el.offsetParent === null) continue; // hidden via display:none
        if (el.tagName === 'INPUT' && SKIP_INPUT_TYPES.has((el.type || 'text').toLowerCase())) continue;
        try { el.focus({ preventScroll: false }); } catch (_) { try { el.focus(); } catch (_) {} }
        return;
      }
    });
  }

  // Observe class attribute changes on every existing .overlay.
  const classObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
      const el = m.target;
      if (!el.classList) continue;
      const wasOpen = (m.oldValue || '').split(/\s+/).includes('open');
      const isOpen = el.classList.contains('open');
      if (!wasOpen && isOpen && el.classList.contains('overlay')) {
        autoFocusFirstInput(el);
      }
    }
  });
  function attach(el) {
    classObserver.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
  }
  function attachExisting() {
    document.querySelectorAll('.overlay').forEach(attach);
  }
  // Watch the body for newly added .overlay nodes (rare, but defensive).
  const treeObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList && node.classList.contains('overlay')) attach(node);
        // Also handle nested overlays inside an added subtree
        if (node.querySelectorAll) node.querySelectorAll('.overlay').forEach(attach);
      }
    }
  });
  function bootObservers() {
    attachExisting();
    treeObserver.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootObservers, { once: true });
  } else {
    bootObservers();
  }

  // ── 5. Debounce helper — exposed to non-module callers ──────────────
  if (typeof window.debounce !== 'function') {
    window.debounce = function debounce(fn, ms) {
      let t;
      const wait = (typeof ms === 'number') ? ms : 200;
      return function () {
        const args = arguments;
        const ctx = this;
        clearTimeout(t);
        t = setTimeout(() => fn.apply(ctx, args), wait);
      };
    };
  }
})();
