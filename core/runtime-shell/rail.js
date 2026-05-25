// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Global Rail (Layer 1)
// ════════════════════════════════════════════════════════════════════
//
// 56px (desktop) / horizontal bottom bar (mobile)
// Icons-only، active indicator، notification dots، keyboard nav، RTL-aware.
//
// API:
//   init({ container, onSelect, initialDomain? })  → renders rail
//   setActive(domainId)                            → updates visual active state
//   setSignalCount(domainId, count)                → updates notification dot
//
// Keyboard:
//   ArrowUp / ArrowDown (desktop) أو ArrowLeft / ArrowRight (mobile)
//   Enter / Space → activate
// ════════════════════════════════════════════════════════════════════

import { DOMAINS } from './domain-registry.js';

let _container = null;
let _onSelect = null;
let _activeId = null;
let _allowedDomains = null;  // null = all domains visible (default)

export function init({ container, onSelect, allowedDomains }) {
  if (!container) throw new Error('[rt-rail] container required');
  _container = container;
  _onSelect = typeof onSelect === 'function' ? onSelect : () => {};
  _allowedDomains = Array.isArray(allowedDomains) ? allowedDomains.slice() : null;
  _render();
}

/**
 * Set the list of domains the user is allowed to see.
 * Pass null to show all domains (default).
 * Re-renders the rail.
 */
export function setAllowedDomains(allowedDomains) {
  _allowedDomains = Array.isArray(allowedDomains) ? allowedDomains.slice() : null;
  _render();
  // restore active state after re-render
  if (_activeId) setActive(_activeId);
}

function _isAllowed(domainId) {
  return _allowedDomains == null || _allowedDomains.includes(domainId);
}

function _render() {
  let html = '<nav class="rt-rail" role="tablist" aria-label="Domain navigation">';
  for (const d of DOMAINS) {
    if (!_isAllowed(d.id)) continue;
    html += '<button type="button" class="rt-rail-btn" '
      + 'role="tab" '
      + 'data-domain="' + d.id + '" '
      + 'aria-label="' + _esc(d.title) + '" '
      + 'aria-selected="false" '
      + 'tabindex="0" '
      + 'title="' + _esc(d.title) + '">'
      + '<span class="rt-rail-ico" aria-hidden="true">' + d.icon + '</span>'
      + '<span class="rt-rail-lbl">' + _esc(d.title) + '</span>'
      + '<span class="rt-rail-dot" hidden aria-hidden="true"></span>'
      + '</button>';
  }
  html += '</nav>';
  _container.innerHTML = html;

  // ── Click handlers ──
  _container.querySelectorAll('.rt-rail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.domain;
      _onSelect(id);
    });
  });

  // ── Keyboard navigation ──
  _container.addEventListener('keydown', (e) => {
    const isVertical = window.matchMedia('(min-width: 769px)').matches;
    const next = isVertical ? 'ArrowDown' : 'ArrowLeft';   // RTL: arrow-left = next visually
    const prev = isVertical ? 'ArrowUp'   : 'ArrowRight';
    if (e.key !== next && e.key !== prev && e.key !== 'Home' && e.key !== 'End') return;

    e.preventDefault();
    const btns = Array.from(_container.querySelectorAll('.rt-rail-btn'));
    const idx = btns.findIndex(b => b === document.activeElement);
    let target = idx;
    if (e.key === next) target = (idx + 1) % btns.length;
    else if (e.key === prev) target = (idx - 1 + btns.length) % btns.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = btns.length - 1;
    btns[target].focus();
  });
}

export function setActive(domainId) {
  if (!_container) return;
  _activeId = domainId;
  _container.querySelectorAll('.rt-rail-btn').forEach(btn => {
    const isActive = btn.dataset.domain === domainId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

export function setSignalCount(domainId, count) {
  if (!_container) return;
  const dot = _container.querySelector('.rt-rail-btn[data-domain="' + domainId + '"] .rt-rail-dot');
  if (!dot) return;
  const n = Math.max(0, Number(count) || 0);
  if (n === 0) {
    dot.hidden = true;
    dot.textContent = '';
  } else {
    dot.hidden = false;
    dot.textContent = n > 9 ? '9+' : String(n);
  }
}

export function getActive() {
  return _activeId;
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
