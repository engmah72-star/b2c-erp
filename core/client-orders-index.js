/**
 * Business2Card ERP — core/client-orders-index.js
 *
 * ━━━ CLIENT → ORDERS INDEX (Phase-1 · clients god-page decomp) ━━━
 *
 * Pure index builder + cached cache factory for the clients page.
 * Builds `Map<clientId, orders[]>` with phone/name fallback matching.
 *
 * Resolution order:
 *   1. order.clientId === client._id
 *   2. order.clientPhone === client.phone1
 *   3. order.clientName === client.name
 *
 * Used by:
 *   - clients.html → renderGrid + renderPanel + reorderLastOrder
 *   - tests/core-client-orders-index.test.mjs
 */

/**
 * Pure builder: returns a Map<clientId, orders[]> from clients + orders arrays.
 *
 * @param {Array} clients — [{_id, phone1?, name?}]
 * @param {Array} orders  — [{clientId?, clientPhone?, clientName?, ...}]
 * @returns {Map<string, Array>}
 */
export function buildClientOrdersIndex(clients = [], orders = []) {
  const byId = new Map(), byPhone = new Map(), byName = new Map();
  for (const c of clients) {
    byId.set(c._id, c);
    if (c.phone1) byPhone.set(c.phone1, c);
    if (c.name) byName.set(c.name, c);
  }
  const idx = new Map();
  for (const c of clients) idx.set(c._id, []);
  for (const o of orders) {
    let target = null;
    if (o.clientId && byId.has(o.clientId)) target = byId.get(o.clientId);
    else if (o.clientPhone && byPhone.has(o.clientPhone)) target = byPhone.get(o.clientPhone);
    else if (o.clientName && byName.has(o.clientName)) target = byName.get(o.clientName);
    if (target) idx.get(target._id).push(o);
  }
  return idx;
}

/**
 * Factory: caching wrapper around buildClientOrdersIndex.
 * Cache key = `clients.length + '-' + orders.length` (cheap heuristic — invalidates
 * whenever any array changes count; explicit `invalidate()` for in-place edits).
 *
 * @returns {{
 *   get: (clients, orders) => Map<string, Array>,
 *   getForClient: (clients, orders, client) => Array,
 *   invalidate: () => void,
 * }}
 */
export function createClientOrdersIndexCache() {
  let cache = null;
  let cacheKey = '';

  return {
    get(clients, orders) {
      const key = (clients?.length || 0) + '-' + (orders?.length || 0);
      if (key === cacheKey && cache) return cache;
      cache = buildClientOrdersIndex(clients || [], orders || []);
      cacheKey = key;
      return cache;
    },
    getForClient(clients, orders, client) {
      if (!client) return [];
      const idx = this.get(clients, orders);
      return idx.get(client._id) || [];
    },
    invalidate() { cache = null; cacheKey = ''; },
  };
}
