// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Context Sidebar (Layer 2)
// ════════════════════════════════════════════════════════════════════
//
// 260px (desktop) / fullscreen sheet (mobile)
// Dynamic content per domain. الـ domain registry بيستضيف renderers.
// لو الـ domain ما عندوش renderer → placeholder UI.
//
// API:
//   init({ container })             → setup
//   showDomain(domainId)            → swap content for the active domain
//   refresh()                       → re-render current domain
//
// Domain renderer signature:
//   renderer({ container, domain }) → { dispose? }
//   - container: HTMLElement لـ render فيه
//   - domain: { id, icon, title, workspace }
//   - returns optional { dispose } للـ cleanup عند الـ switch
// ════════════════════════════════════════════════════════════════════

import { getDomain, getRenderer } from './domain-registry.js';

let _container = null;
let _currentDomain = null;
let _disposeFn = null;

export function init({ container }) {
  if (!container) throw new Error('[rt-ctx-sidebar] container required');
  _container = container;
  _renderEmpty();
}

export function showDomain(domainId) {
  if (!_container) return;
  if (domainId === _currentDomain) return;

  // Dispose previous renderer
  _disposeCurrent();
  _currentDomain = domainId;

  const domain = getDomain(domainId);
  if (!domain) { _renderEmpty(); return; }

  const renderer = getRenderer(domainId);
  if (!renderer) { _renderPlaceholder(domain); return; }

  // Custom renderer registered
  _container.innerHTML = '';
  try {
    const result = renderer({ container: _container, domain });
    if (result && typeof result.dispose === 'function') {
      _disposeFn = result.dispose;
    }
  } catch (e) {
    console.error('[rt-ctx-sidebar] renderer error', e);
    _renderError(domain, e.message);
  }
}

export function refresh() {
  if (_currentDomain) {
    const id = _currentDomain;
    _currentDomain = null;  // force re-render
    showDomain(id);
  }
}

export function getCurrentDomain() {
  return _currentDomain;
}

function _disposeCurrent() {
  if (_disposeFn) {
    try { _disposeFn(); }
    catch (e) { console.warn('[rt-ctx-sidebar] dispose error', e); }
    _disposeFn = null;
  }
}

function _renderEmpty() {
  _container.innerHTML = '<div class="rt-ctx-empty">اختر domain من الـ rail</div>';
}

function _renderPlaceholder(domain) {
  _container.innerHTML = ''
    + '<div class="rt-ctx-header">'
    +   '<span class="rt-ctx-h-ico" aria-hidden="true">' + domain.icon + '</span>'
    +   '<span class="rt-ctx-h-title">' + _esc(domain.title) + '</span>'
    +   '<button type="button" class="rt-ctx-h-add" aria-label="إضافة" title="إضافة">+</button>'
    + '</div>'

    + '<section class="rt-ctx-section" aria-label="العرض">'
    +   '<header class="rt-ctx-section-h">العرض</header>'
    +   '<div class="rt-ctx-placeholder">يُسجَّل الـ domain هنا في مرحلة لاحقة</div>'
    + '</section>'

    + '<section class="rt-ctx-section" aria-label="إجراءات سريعة">'
    +   '<header class="rt-ctx-section-h">إجراءات سريعة</header>'
    +   '<div class="rt-ctx-placeholder">Quick actions</div>'
    + '</section>'

    + '<section class="rt-ctx-section" aria-label="تنبيهات">'
    +   '<header class="rt-ctx-section-h">تنبيهات</header>'
    +   '<div class="rt-ctx-placeholder">Signals</div>'
    + '</section>'

    + '<section class="rt-ctx-section" aria-label="الأخيرة">'
    +   '<header class="rt-ctx-section-h">الأخيرة</header>'
    +   '<div class="rt-ctx-placeholder">Recent activity</div>'
    + '</section>';
}

function _renderError(domain, msg) {
  _container.innerHTML = ''
    + '<div class="rt-ctx-header">'
    +   '<span class="rt-ctx-h-ico" aria-hidden="true">' + domain.icon + '</span>'
    +   '<span class="rt-ctx-h-title">' + _esc(domain.title) + '</span>'
    + '</div>'
    + '<div class="rt-ctx-error">⚠ خطأ في الـ renderer: ' + _esc(msg || 'unknown') + '</div>';
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
