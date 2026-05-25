// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Runtime Memory (placeholder)
// ════════════════════════════════════════════════════════════════════
//
// Phase 1: API skeleton فقط. لا IndexedDB، لا saved views، لا pinning logic.
//
// Phase 4 سيبني:
//   - localStorage للـ pinned items (per domain)
//   - sessionStorage للـ last filters
//   - IndexedDB لـ recent entities LRU (cap 20 per domain)
//   - Firestore users/{uid}/views للـ saved views (cross-device)
//
// Phase 1 API skeleton:
//   recordRecent(domainId, entityRef)    → record a visit
//   getRecent(domainId, limit)           → returns []
//   pin(domainId, item)                  → no-op
//   unpin(domainId, itemId)              → no-op
//   getPinned(domainId)                  → returns []
//   saveView(domainId, name, state)      → no-op
//   getSavedViews(domainId)              → returns []
//   getLastFilter(domainId, viewId)      → returns null
//   setLastFilter(domainId, viewId, f)   → no-op
// ════════════════════════════════════════════════════════════════════

// In-memory only (Phase 1) — لا persistence
const _recent = new Map();   // domainId → [{ id, label, ts }]
const _pinned = new Map();   // domainId → [{ id, label }]
const _views  = new Map();   // domainId → [{ id, name, state }]
const _filters = new Map();  // domainId:viewId → filter state

const RECENT_MAX = 20;

export function recordRecent(domainId, entityRef) {
  if (!domainId || !entityRef) return;
  const list = _recent.get(domainId) || [];
  // dedupe by id
  const filtered = list.filter(x => x.id !== entityRef.id);
  filtered.unshift({ id: entityRef.id, label: entityRef.label || '', ts: Date.now() });
  if (filtered.length > RECENT_MAX) filtered.length = RECENT_MAX;
  _recent.set(domainId, filtered);
}

export function getRecent(domainId, limit = 10) {
  const list = _recent.get(domainId) || [];
  return list.slice(0, Math.max(0, limit));
}

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

export function setLastFilter(domainId, viewId, filterState) {
  if (!domainId || !viewId) return;
  _filters.set(domainId + ':' + viewId, filterState || null);
}

export function getLastFilter(domainId, viewId) {
  return _filters.get(domainId + ':' + viewId) || null;
}

// reset (testing)
export function _reset() {
  _recent.clear();
  _pinned.clear();
  _views.clear();
  _filters.clear();
}
