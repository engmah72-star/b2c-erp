// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Workspace Host (Layer 3)
// ════════════════════════════════════════════════════════════════════
//
// iframe-based workspace loader. الـ god pages الموجودة تـ load كما هي
// بدون أي تعديل (RULE H1.1: no DOM injection — iframe isolation فقط).
//
// LRU cache: يحتفظ بـ 3 iframes (last-3-used). الـ active visible،
// الباقي display:none للحفاظ على state (scroll, filters, listeners).
// عند تجاوز الـ LRU → أقدم غير-active يُحذف (about:blank + remove).
//
// API:
//   init({ container, titleElement?, onLoadStart?, onLoadEnd? })
//   showDomain(domainId)                → activate (load if not cached)
//   reload(domainId?)                   → force reload (defaults to active)
//   clearCache()                        → tear down all iframes
// ════════════════════════════════════════════════════════════════════

import { getDomain } from './domain-registry.js';
import { trackIframeLoad } from './entity-tracker.js';

const DEFAULT_MAX_CACHE = 3;

let _hostEl = null;
let _titleEl = null;
let _onLoadStart = () => {};
let _onLoadEnd = () => {};
let _maxCache = DEFAULT_MAX_CACHE;
let _currentDomain = null;
const _cache = new Map(); // domainId → { iframe, lastUsed, loaded }

export function init({ container, titleElement, onLoadStart, onLoadEnd, maxCache }) {
  if (!container) throw new Error('[rt-workspace] container required');
  _hostEl = container;
  _titleEl = titleElement || null;
  if (typeof onLoadStart === 'function') _onLoadStart = onLoadStart;
  if (typeof onLoadEnd === 'function') _onLoadEnd = onLoadEnd;
  if (maxCache > 0) _maxCache = maxCache;

  // Auto-detect mobile to reduce cache size
  try {
    if (window.matchMedia('(max-width: 768px)').matches) _maxCache = 1;
  } catch (_) {}
}

export function showDomain(domainId) {
  if (!_hostEl) return false;
  const domain = getDomain(domainId);
  if (!domain || !domain.workspace) { _showError(domainId); return false; }

  if (_titleEl) _titleEl.textContent = domain.title;
  _currentDomain = domainId;

  let entry = _cache.get(domainId);
  if (!entry) {
    entry = _createFrame(domain);
    _cache.set(domainId, entry);
    _evictIfNeeded();
  } else {
    entry.lastUsed = Date.now();
  }

  // Show active، hide others.
  // الـ iframes مخزّنة (LRU) للحفاظ على scroll/filters/listeners. لكن أي
  // modal مفتوح كان يفضل عالقاً ويظهر تاني عند الرجوع للتبويب. نُبلّغ الـ
  // iframe اللي بيتخفي عشان يقفل أي modal مفتوح → الرجوع للتبويب نظيف.
  for (const [k, v] of _cache) {
    const active = (k === domainId);
    if (!active && v.iframe.style.display !== 'none') {
      try {
        v.iframe.contentWindow?.postMessage({ __b2cShell: 'domain-hidden' }, location.origin);
      } catch (_) {}
    }
    v.iframe.style.display = active ? 'block' : 'none';
  }
  return true;
}

export function reload(domainId) {
  const id = domainId || _currentDomain;
  if (!id) return;
  const entry = _cache.get(id);
  if (!entry) return;
  const domain = getDomain(id);
  if (!domain) return;
  _onLoadStart(id);
  entry.loaded = false;
  entry.iframe.src = domain.workspace;
}

export function clearCache() {
  for (const [, v] of _cache) {
    try { v.iframe.src = 'about:blank'; } catch (_) {}
    if (v.iframe.parentNode) v.iframe.parentNode.removeChild(v.iframe);
  }
  _cache.clear();
}

export function getCurrentDomain() {
  return _currentDomain;
}

/**
 * Navigate the active workspace iframe to a different URL within the same domain
 * (e.g., accounts.html#wallets, or a related page treated as a sub-view).
 * Used by domain sidebar renderers to deep-link views inside the workspace.
 */
export function navigate(url) {
  if (!_currentDomain || !url) return false;
  const entry = _cache.get(_currentDomain);
  if (!entry) return false;
  _onLoadStart(_currentDomain);
  entry.loaded = false;
  entry.iframe.src = _withEmbed(url);
  return true;
}

/**
 * Append ?embed=1 to a URL (or replace if already present).
 * shared.css picks up html.embed-mode + hides internal chrome.
 */
function _withEmbed(url) {
  if (!url) return url;
  if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  const hashIdx = url.indexOf('#');
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
  let base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  if (base.indexOf('embed=1') >= 0) return base + hash;
  const sep = base.indexOf('?') >= 0 ? '&' : '?';
  return base + sep + 'embed=1' + hash;
}

function _createFrame(domain) {
  const iframe = document.createElement('iframe');
  iframe.className = 'rt-workspace-frame';
  iframe.src = _withEmbed(domain.workspace);
  iframe.setAttribute('title', domain.title);
  iframe.setAttribute('loading', 'lazy');
  // referrer-policy = same-origin (default) — keeps cookies/auth
  // sandbox: NOT set — we trust same-origin and need full functionality

  const entry = { iframe, lastUsed: Date.now(), loaded: false };

  iframe.addEventListener('load', () => {
    entry.loaded = true;
    _onLoadEnd(domain.id);
    // Track entity for Recent (Phase 6) — defer a tick so title is settled
    setTimeout(() => trackIframeLoad(domain.id, iframe), 100);
  });
  iframe.addEventListener('error', () => {
    console.warn('[rt-workspace] iframe error', domain.id);
    _onLoadEnd(domain.id);
  });

  _onLoadStart(domain.id);
  _hostEl.appendChild(iframe);
  return entry;
}

function _evictIfNeeded() {
  if (_cache.size <= _maxCache) return;
  let oldestKey = null;
  let oldestTime = Infinity;
  for (const [k, v] of _cache) {
    if (k === _currentDomain) continue;
    if (v.lastUsed < oldestTime) { oldestTime = v.lastUsed; oldestKey = k; }
  }
  if (!oldestKey) return;
  const e = _cache.get(oldestKey);
  try { e.iframe.src = 'about:blank'; } catch (_) {}
  if (e.iframe.parentNode) e.iframe.parentNode.removeChild(e.iframe);
  _cache.delete(oldestKey);
}

function _showError(domainId) {
  _hostEl.innerHTML = '<div class="rt-workspace-error">⚠ Domain غير معروف: ' + String(domainId) + '</div>';
}
