// core/contextual-shortcuts.js
// Contextual Shortcuts Bar — page-aware action chips at the bottom of every page.
//
// Usage:
//   import { initContextualShortcuts, updateShortcuts } from './core/contextual-shortcuts.js';
//
//   initContextualShortcuts({
//     shortcuts: [
//       { icon: '🏭', label: 'تسليم للتنفيذ', action: () => moveToProduction(), variant: 'success' },
//       { icon: '📞', label: 'تواصل', action: () => openContact(), variant: 'primary' },
//       { icon: '✏️', label: 'التصميم', navigate: 'design.html' },
//     ]
//   });
//
//   // Dynamic update (e.g., when order is selected):
//   updateShortcuts([...newShortcuts]);

let __bar = null;
let __currentShortcuts = [];

function ensureStylesheet() {
  if (document.getElementById('ctx-shortcuts-styles')) return;
  const link = document.createElement('link');
  link.id = 'ctx-shortcuts-styles';
  link.rel = 'stylesheet';
  link.href = './core/contextual-shortcuts.css';
  document.head.appendChild(link);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildChip(shortcut) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'ctx-chip' + (shortcut.variant ? ' is-' + shortcut.variant : '');
  if (shortcut.disabled) {
    el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
  }

  const ico = shortcut.icon ? `<span class="ctx-chip-ico" aria-hidden="true">${esc(shortcut.icon)}</span>` : '';
  el.innerHTML = ico + esc(shortcut.label || '');

  if (!shortcut.disabled) {
    el.addEventListener('click', () => {
      if (typeof shortcut.action === 'function') {
        try { shortcut.action(); } catch (e) { console.warn('[ctx-shortcuts] action error', e); }
      } else if (shortcut.navigate) {
        if (typeof window.navigatePage === 'function') {
          window.navigatePage(shortcut.navigate);
        } else {
          window.location.href = shortcut.navigate;
        }
      }
    });
  }

  return el;
}

function render(shortcuts) {
  if (!__bar) return;
  const chips = __bar.querySelector('.ctx-chips');
  if (!chips) return;

  const visible = shortcuts.filter(s => {
    if (typeof s.when === 'function') {
      try { return s.when(); } catch (_) { return false; }
    }
    return true;
  });

  chips.innerHTML = '';
  if (visible.length === 0) {
    __bar.classList.add('hidden');
    return;
  }

  visible.forEach(s => chips.appendChild(buildChip(s)));
  __bar.classList.remove('hidden');
}

export function initContextualShortcuts({ shortcuts = [] } = {}) {
  ensureStylesheet();

  if (__bar) {
    __currentShortcuts = shortcuts;
    render(shortcuts);
    return;
  }

  const bar = document.createElement('nav');
  bar.className = 'ctx-bar hidden';
  bar.setAttribute('aria-label', 'اختصارات سريعة');

  const chips = document.createElement('div');
  chips.className = 'ctx-chips';
  bar.appendChild(chips);

  document.body.appendChild(bar);
  __bar = bar;
  __currentShortcuts = shortcuts;

  void bar.offsetHeight;
  render(shortcuts);
}

export function updateShortcuts(shortcuts) {
  __currentShortcuts = shortcuts;
  if (__bar) render(shortcuts);
}

export function refreshShortcuts() {
  if (__bar) render(__currentShortcuts);
}

export function hideShortcuts() {
  if (__bar) __bar.classList.add('hidden');
}

export function showShortcuts() {
  if (__bar) {
    render(__currentShortcuts);
  }
}

try {
  window.B2CShortcuts = { init: initContextualShortcuts, update: updateShortcuts, refresh: refreshShortcuts, hide: hideShortcuts, show: showShortcuts };
} catch (_) {}
