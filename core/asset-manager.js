/**
 * core/asset-manager.js — إدارة ذكية للأصول الثقيلة (صور/ملفات/معاينات)
 *
 * الفلسفة (Enterprise-grade):
 *   يحتفظ النظام بحالة العمل (State) وسياق المستخدم (Context).
 *   الأصول الثقيلة (صور كبيرة، PDF، معاينات) تُدار بسياسات ذكية:
 *   - الصور خارج نطاق الرؤية تُفرَّغ بعد فترة
 *   - Blob URLs تُتبَّع وتُلغى عند مغادرة الصفحة
 *   - ضغط الذاكرة يُراقَب ويُستجاب له تلقائياً
 *
 * الاستخدام:
 *   import { assetManager } from './core/asset-manager.js';
 *   assetManager.observe('#list');          // مراقبة صور الحاوية
 *   const url = assetManager.trackBlob(URL.createObjectURL(file));
 *   assetManager.releaseSection('#old-panel');  // تحرير أصول قسم مخفي
 */

const OFFSCREEN_DELAY = 30_000;
const MEMORY_CHECK_INTERVAL = 60_000;
const MEMORY_HIGH_THRESHOLD = 0.80;
const MEMORY_CRITICAL_THRESHOLD = 0.92;
const MAX_TRACKED_BLOBS = 50;

const _blobRegistry = new Set();
const _observedContainers = new Map();
const _offscreenTimers = new WeakMap();
let _intersectionObserver = null;
let _memoryInterval = null;

function _getIO() {
  if (_intersectionObserver) return _intersectionObserver;
  if (typeof IntersectionObserver === 'undefined') return null;

  _intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const img = entry.target;
      if (entry.isIntersecting) {
        const timer = _offscreenTimers.get(img);
        if (timer) { clearTimeout(timer); _offscreenTimers.delete(img); }
        if (img.dataset.assetSrc && !img.src) {
          img.src = img.dataset.assetSrc;
          img.removeAttribute('data-asset-src');
        }
      } else {
        if (img.src && !_offscreenTimers.has(img)) {
          const t = setTimeout(() => {
            _offscreenTimers.delete(img);
            if (!img.isConnected) return;
            img.dataset.assetSrc = img.src;
            img.removeAttribute('src');
          }, OFFSCREEN_DELAY);
          _offscreenTimers.set(img, t);
        }
      }
    }
  }, { rootMargin: '200px' });

  return _intersectionObserver;
}

function _observeImages(container) {
  const io = _getIO();
  if (!io) return;
  const imgs = container.querySelectorAll('img[src]');
  for (const img of imgs) {
    if (img.naturalWidth > 200 || img.width > 200 ||
        (img.src && img.src.length > 200)) {
      io.observe(img);
    }
  }
}

function _unobserveAll(container) {
  const io = _getIO();
  if (!io) return;
  const imgs = container.querySelectorAll('img');
  for (const img of imgs) {
    io.unobserve(img);
    const timer = _offscreenTimers.get(img);
    if (timer) { clearTimeout(timer); _offscreenTimers.delete(img); }
    if (img.dataset.assetSrc) {
      img.src = img.dataset.assetSrc;
      img.removeAttribute('data-asset-src');
    }
  }
}

function _getMemoryPressure() {
  try {
    if (performance.memory) {
      const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
      return usedJSHeapSize / jsHeapSizeLimit;
    }
  } catch (_) {}
  return 0;
}

function _onMemoryPressure(level) {
  if (level === 'critical') {
    for (const [, container] of _observedContainers) {
      const el = typeof container === 'string'
        ? document.querySelector(container) : container;
      if (!el) continue;
      const imgs = el.querySelectorAll('img[src]');
      for (const img of imgs) {
        if (!_isVisible(img)) {
          img.dataset.assetSrc = img.src;
          img.removeAttribute('src');
        }
      }
    }
    _pruneBlobs();
    if (window.__dataCache) {
      const stats = window.__dataCache.getStats();
      if (stats.memoryCacheSize > 100) {
        window.__dataCache.evictStaleEntries(10 * 60 * 1000);
      }
    }
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage('TRIM_CACHE');
    }
  } else if (level === 'high') {
    _pruneBlobs();
  }
}

function _isVisible(el) {
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight + 200 && rect.bottom > -200;
}

function _pruneBlobs() {
  if (_blobRegistry.size <= MAX_TRACKED_BLOBS) return;
  const excess = _blobRegistry.size - MAX_TRACKED_BLOBS;
  let pruned = 0;
  for (const url of _blobRegistry) {
    if (pruned >= excess) break;
    const inUse = document.querySelector(`[src="${url}"], [href="${url}"]`);
    if (!inUse) {
      try { URL.revokeObjectURL(url); } catch (_) {}
      _blobRegistry.delete(url);
      pruned++;
    }
  }
}

function _startMemoryMonitor() {
  if (_memoryInterval || !performance.memory) return;
  _memoryInterval = setInterval(() => {
    const pressure = _getMemoryPressure();
    if (pressure >= MEMORY_CRITICAL_THRESHOLD) {
      _onMemoryPressure('critical');
    } else if (pressure >= MEMORY_HIGH_THRESHOLD) {
      _onMemoryPressure('high');
    }
  }, MEMORY_CHECK_INTERVAL);
}

export const assetManager = {

  observe(containerSelector) {
    const id = typeof containerSelector === 'string'
      ? containerSelector : containerSelector.id || 'anon';
    _observedContainers.set(id, containerSelector);

    const el = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector) : containerSelector;
    if (el) _observeImages(el);

    if (!_mutObservers.has(id) && el) {
      const mo = new MutationObserver(() => _observeImages(el));
      mo.observe(el, { childList: true, subtree: true });
      _mutObservers.set(id, mo);
    }
    _startMemoryMonitor();
  },

  unobserve(containerSelector) {
    const id = typeof containerSelector === 'string'
      ? containerSelector : containerSelector.id || 'anon';
    const el = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector) : containerSelector;
    if (el) _unobserveAll(el);
    _observedContainers.delete(id);
    const mo = _mutObservers.get(id);
    if (mo) { mo.disconnect(); _mutObservers.delete(id); }
  },

  trackBlob(blobUrl) {
    _blobRegistry.add(blobUrl);
    if (_blobRegistry.size > MAX_TRACKED_BLOBS) _pruneBlobs();
    return blobUrl;
  },

  revokeBlob(blobUrl) {
    try { URL.revokeObjectURL(blobUrl); } catch (_) {}
    _blobRegistry.delete(blobUrl);
  },

  releaseSection(selector) {
    const el = typeof selector === 'string'
      ? document.querySelector(selector) : selector;
    if (!el) return;
    const imgs = el.querySelectorAll('img[src]');
    for (const img of imgs) {
      if (img.src.startsWith('blob:')) {
        try { URL.revokeObjectURL(img.src); } catch (_) {}
        _blobRegistry.delete(img.src);
      }
      img.dataset.assetSrc = img.src;
      img.removeAttribute('src');
    }
  },

  restoreSection(selector) {
    const el = typeof selector === 'string'
      ? document.querySelector(selector) : selector;
    if (!el) return;
    const imgs = el.querySelectorAll('img[data-asset-src]');
    for (const img of imgs) {
      img.src = img.dataset.assetSrc;
      img.removeAttribute('data-asset-src');
    }
  },

  getStatus() {
    return {
      trackedBlobs: _blobRegistry.size,
      observedContainers: _observedContainers.size,
      memoryPressure: _getMemoryPressure(),
      offscreenImages: document.querySelectorAll('img[data-asset-src]').length,
    };
  },

  cleanup() {
    for (const url of _blobRegistry) {
      try { URL.revokeObjectURL(url); } catch (_) {}
    }
    _blobRegistry.clear();
    for (const [, container] of _observedContainers) {
      const el = typeof container === 'string'
        ? document.querySelector(container) : container;
      if (el) _unobserveAll(el);
    }
    _observedContainers.clear();
    for (const [, mo] of _mutObservers) mo.disconnect();
    _mutObservers.clear();
    if (_memoryInterval) { clearInterval(_memoryInterval); _memoryInterval = null; }
    if (_intersectionObserver) { _intersectionObserver.disconnect(); _intersectionObserver = null; }
  },
};

const _mutObservers = new Map();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => assetManager.cleanup(), { once: true });
  window.__assetManager = assetManager;
}
