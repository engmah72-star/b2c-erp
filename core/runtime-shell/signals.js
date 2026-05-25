// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Signals (Phase 4: per-signal tracking)
// ════════════════════════════════════════════════════════════════════
//
// كل domain يقدر يحتوي signals متعددة (key → count).
// الـ rail dot يعرض السوم الإجمالي للـ domain.
// الـ sidebar يعرض كل signal individually.
//
// API:
//   setMetric(domainId, key, count)       → set per-signal count
//   getMetric(domainId, key)              → get one signal count
//   getDomainTotal(domainId)              → sum of all signals in domain
//   getAllMetrics(domainId)               → Map of all signals in domain
//   onChange(handler)                     → subscribe (domainId, key, count, total)
//   onDomainChange(handler)               → subscribe to total changes only
//   clear(domainId?, key?)                → clear specific or all
//
// Backward-compat aliases:
//   setCount(domainId, count)  → setMetric(domainId, '_total', count)
//   getCount(domainId)         → getDomainTotal(domainId)
// ════════════════════════════════════════════════════════════════════

const _metrics = new Map();   // domainId → Map(key → count)
const _listeners = new Set();
const _domainListeners = new Set();

function _getDomainMap(domainId) {
  if (!_metrics.has(domainId)) _metrics.set(domainId, new Map());
  return _metrics.get(domainId);
}

export function setMetric(domainId, key, count) {
  if (!domainId || !key) return;
  const n = Math.max(0, Number(count) || 0);
  const dmap = _getDomainMap(domainId);
  if (dmap.get(key) === n) return; // no change
  dmap.set(key, n);
  const total = getDomainTotal(domainId);
  _notify(domainId, key, n, total);
  _notifyDomain(domainId, total);
}

export function getMetric(domainId, key) {
  const dmap = _metrics.get(domainId);
  return dmap ? (dmap.get(key) || 0) : 0;
}

export function getDomainTotal(domainId) {
  const dmap = _metrics.get(domainId);
  if (!dmap) return 0;
  let total = 0;
  for (const v of dmap.values()) total += v;
  return total;
}

export function getAllMetrics(domainId) {
  return new Map(_metrics.get(domainId) || new Map());
}

export function clear(domainId, key) {
  if (!domainId) {
    // clear all
    const domainIds = Array.from(_metrics.keys());
    _metrics.clear();
    for (const d of domainIds) _notifyDomain(d, 0);
    return;
  }
  if (!key) {
    // clear domain
    if (_metrics.has(domainId)) {
      const dmap = _metrics.get(domainId);
      const keys = Array.from(dmap.keys());
      _metrics.delete(domainId);
      for (const k of keys) _notify(domainId, k, 0, 0);
      _notifyDomain(domainId, 0);
    }
    return;
  }
  // clear specific
  const dmap = _metrics.get(domainId);
  if (dmap && dmap.has(key)) {
    dmap.delete(key);
    const total = getDomainTotal(domainId);
    _notify(domainId, key, 0, total);
    _notifyDomain(domainId, total);
  }
}

export function onChange(handler) {
  if (typeof handler !== 'function') return () => {};
  _listeners.add(handler);
  return () => _listeners.delete(handler);
}

export function onDomainChange(handler) {
  if (typeof handler !== 'function') return () => {};
  _domainListeners.add(handler);
  return () => _domainListeners.delete(handler);
}

function _notify(domainId, key, count, total) {
  for (const h of _listeners) {
    try { h(domainId, key, count, total); }
    catch (e) { console.warn('[runtime-shell:signals] listener error', e); }
  }
}

function _notifyDomain(domainId, total) {
  for (const h of _domainListeners) {
    try { h(domainId, total); }
    catch (e) { console.warn('[runtime-shell:signals] domain listener error', e); }
  }
}

// ── Backward-compat (Phase 1 API) ──
export function setCount(domainId, count) {
  setMetric(domainId, '_total', count);
}

export function getCount(domainId) {
  return getDomainTotal(domainId);
}

export function getAll() {
  const m = new Map();
  for (const [d] of _metrics) m.set(d, getDomainTotal(d));
  return m;
}

export function increment(domainId, by = 1) {
  setCount(domainId, getCount(domainId) + by);
}
