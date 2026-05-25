// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Runtime Memory (Phase 6: persistent)
// ════════════════════════════════════════════════════════════════════
//
// Recent entities per domain — localStorage persisted.
// Pinned/saved-views/last-filter — in-memory للـ Phase 6.
// IndexedDB upgrade مستقبلي (Phase 7+) لو الـ recent list كبرت.
//
// API:
//   recordRecent(domainId, entity)       → push to recent (dedupe + persist)
//   getRecent(domainId, limit?)          → array of {id, label, url, ts}
//   onRecentChange(handler)              → subscribe (domainId) → unsub
//   clearRecent(domainId?)               → clear domain or all
//   (pinned/views/filters APIs — in-memory only)
// ════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'b2c_runtime_recent_v1';
const RECENT_MAX = 10;

// ── Persistent: recent ──
let _recent = {};  // domainId → [{id, label, url, ts}]
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) _recent = JSON.parse(raw) || {};
} catch (_) { _recent = {}; }

function _persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_recent)); }
  catch (_) {}
}

// ── In-memory: pinned, views, filters ──
const _pinned = new Map();
const _views = new Map();
const _filters = new Map();

// ── Listeners ──
const _recentListeners = new Set();

function _notifyRecent(domainId) {
  for (const h of _recentListeners) {
    try { h(domainId); }
    catch (e) { console.warn('[runtime-memory] recent listener error', e); }
  }
}

// ── Recent API ──
export function recordRecent(domainId, entity) {
  if (!domainId || !entity || !entity.id) return;
  const list = _recent[domainId] || [];
  // dedupe by id
  const filtered = list.filter(x => x.id !== entity.id);
  filtered.unshift({
    id: entity.id,
    label: entity.label || entity.id,
    url: entity.url || '',
    type: entity.type || '',
    ts: Date.now(),
  });
  if (filtered.length > RECENT_MAX) filtered.length = RECENT_MAX;
  _recent[domainId] = filtered;
  _persist();
  _notifyRecent(domainId);
}

export function getRecent(domainId, limit = 5) {
  const list = _recent[domainId] || [];
  return list.slice(0, Math.max(0, limit));
}

export function onRecentChange(handler) {
  if (typeof handler !== 'function') return () => {};
  _recentListeners.add(handler);
  return () => _recentListeners.delete(handler);
}

export function clearRecent(domainId) {
  if (!domainId) {
    const domainIds = Object.keys(_recent);
    _recent = {};
    _persist();
    for (const d of domainIds) _notifyRecent(d);
  } else if (_recent[domainId]) {
    delete _recent[domainId];
    _persist();
    _notifyRecent(domainId);
  }
}

// ── Pinned (in-memory) ──
export function pin(domainId, item) {
  if (!domainId || !item || !item.id) return false;
  const list = _pinned.get(domainId) || [];
  if (list.some(x => x.id === item.id)) return false;
  list.push({ id: item.id, label: item.label || '' });
  _pinned.set(domainId, list);
  return true;
}

export function unpin(domainId, itemId) {
  const list = _pinned.get(domainId) || [];
  const filtered = list.filter(x => x.id !== itemId);
  _pinned.set(domainId, filtered);
  return filtered.length !== list.length;
}

export function getPinned(domainId) {
  return (_pinned.get(domainId) || []).slice();
}

// ── Saved Views (in-memory) ──
export function saveView(domainId, name, state) {
  if (!domainId || !name) return null;
  const list = _views.get(domainId) || [];
  const view = { id: 'v_' + Date.now(), name, state: state || {} };
  list.push(view);
  _views.set(domainId, list);
  return view;
}

export function getSavedViews(domainId) {
  return (_views.get(domainId) || []).slice();
}

// ── Filters (session-scoped, in-memory) ──
export function setLastFilter(domainId, viewId, filterState) {
  if (!domainId || !viewId) return;
  _filters.set(domainId + ':' + viewId, filterState || null);
}

export function getLastFilter(domainId, viewId) {
  return _filters.get(domainId + ':' + viewId) || null;
}

// Test/reset utility
export function _reset() {
  _recent = {};
  _persist();
  _pinned.clear();
  _views.clear();
  _filters.clear();
}
