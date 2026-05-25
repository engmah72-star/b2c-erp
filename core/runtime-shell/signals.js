// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Signals (placeholder)
// ════════════════════════════════════════════════════════════════════
//
// Phase 1: API skeleton فقط. لا Firestore integration.
//
// Phase 4 سيبني:
//   - aggregation queries (delayed orders, pending approvals، إلخ)
//   - cross-domain signal links
//   - persistent dismissal state
//
// API الحالي:
//   getCount(domainId)         → عدد الـ signals النشطة لـ domain
//   setCount(domainId, count)  → set manually (للـ testing أو الـ pilot)
//   onChange(handler)          → subscribe، يستقبل (domainId, count)
//                                returns unsubscribe function
//   getAll()                   → Map من كل الـ domains وعدد signals
//   clear(domainId?)           → clear count لـ domain أو الكل
// ════════════════════════════════════════════════════════════════════

const _counts = new Map(); // domainId → count
const _listeners = new Set();

export function getCount(domainId) {
  return _counts.get(domainId) || 0;
}

export function setCount(domainId, count) {
  if (!domainId) return;
  const n = Math.max(0, Number(count) || 0);
  if (_counts.get(domainId) === n) return; // no change
  _counts.set(domainId, n);
  _notify(domainId, n);
}

export function increment(domainId, by = 1) {
  const current = getCount(domainId);
  setCount(domainId, current + by);
}

export function clear(domainId) {
  if (domainId) {
    if (_counts.has(domainId)) {
      _counts.delete(domainId);
      _notify(domainId, 0);
    }
  } else {
    // clear all
    const keys = Array.from(_counts.keys());
    _counts.clear();
    for (const k of keys) _notify(k, 0);
  }
}

export function onChange(handler) {
  if (typeof handler !== 'function') return () => {};
  _listeners.add(handler);
  return () => _listeners.delete(handler);
}

export function getAll() {
  return new Map(_counts);
}

function _notify(domainId, count) {
  for (const h of _listeners) {
    try { h(domainId, count); }
    catch (e) { console.warn('[runtime-shell:signals] listener error', e); }
  }
}
