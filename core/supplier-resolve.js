/**
 * core/supplier-resolve.js
 * Resolve a supplier's current name by ID from Firestore.
 * Avoids stale denormalized supplierName across cost items, library, fixed prices.
 */

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export async function resolveSupplierName(db, supplierId, fallbackName) {
  if (!supplierId) return fallbackName || '';

  const cached = _cache.get(supplierId);
  if (cached && (Date.now() - cached.ts < CACHE_TTL)) return cached.name;

  try {
    const snap = await getDoc(doc(db, 'suppliers_v2', supplierId));
    const name = snap.exists() ? (snap.data().name || '').trim() : '';
    const resolved = name || fallbackName || '';
    _cache.set(supplierId, { name: resolved, ts: Date.now() });
    return resolved;
  } catch (_) {
    return fallbackName || '';
  }
}
