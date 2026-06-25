/**
 * core/static-store.js — one-shot cached reads for rarely-changing docs
 *
 * Replaces onSnapshot for settings/main, master_lists/*, wallets —
 * data that changes once a month but was burning live WebSocket listeners.
 *
 * Uses dataCache.getDoc (Memory → IndexedDB → Firestore) with a 10-min TTL.
 * Pages get instant data from cache, background revalidation keeps it fresh.
 */

import { dataCache } from './data-cache.js';

const MAX_AGE = 10 * 60 * 1000; // 10 minutes

const _cache = new Map();
const _listeners = new Map();

function _notify(key, data) {
  const cbs = _listeners.get(key);
  if (cbs) cbs.forEach(fn => { try { fn(data); } catch (_) {} });
}

export async function getStatic(collection, docId, cb) {
  const key = `${collection}/${docId}`;

  if (_cache.has(key)) {
    const cached = _cache.get(key);
    if (cb) cb(cached);
    if (Date.now() - (cached._fetchedAt || 0) < MAX_AGE) return cached;
  }

  if (cb) {
    if (!_listeners.has(key)) _listeners.set(key, new Set());
    _listeners.get(key).add(cb);
  }

  const result = await dataCache.getDoc(collection, docId, { maxAge: MAX_AGE });
  if (result.data) {
    result.data._fetchedAt = Date.now();
    _cache.set(key, result.data);
    _notify(key, result.data);
  }
  return result.data;
}

export async function getSettings(cb) {
  return getStatic('settings', 'main', cb);
}

export async function getMasterList(docId, cb) {
  return getStatic('master_lists', docId, cb);
}

export function invalidate(collection, docId) {
  _cache.delete(`${collection}/${docId}`);
}
