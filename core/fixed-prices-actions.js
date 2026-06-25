/**
 * core/fixed-prices-actions.js
 * ──────────────────────────────────────────────────────────
 * أسعار ثابتة مرجعية — تُعرَّف مرة واحدة وتُملأ تلقائياً
 *
 * المخزن: master_lists/fixed_prices  { prices: [...] }
 * كل سعر: { id, type, amount, printType?, supplierId?, supplierName?, note?, updatedAt, updatedBy }
 */

import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { normalizeCostType } from './cost-type-normalize.js';
import { resolveSupplierName } from './supplier-resolve.js';

const FP_REF = (db) => doc(db, 'master_lists', 'fixed_prices');

export async function getFixedPrices(db) {
  const snap = await getDoc(FP_REF(db));
  return snap.exists() ? (snap.data().prices || []) : [];
}

/**
 * Find matching fixed price for a cost type + optional print type.
 * Returns the best match: exact printType match > no-printType entry > null.
 */
export function lookupFixedPrice(prices, type, printType) {
  if (!type || !prices.length) return null;
  const nt = normalizeCostType(type);
  const pt = (printType || '').trim().toLowerCase();
  let exact = null, generic = null;
  for (const p of prices) {
    if (normalizeCostType(p.type) !== nt) continue;
    const ppt = (p.printType || '').trim().toLowerCase();
    if (ppt && pt && ppt === pt) { exact = p; break; }
    if (!ppt) generic = p;
  }
  return exact || generic || null;
}

export async function saveFixedPrice(db, { id, type, amount, printType, supplierId, supplierName: rawSupplierName, note, size }, userName) {
  if (!type?.trim()) return { ok: false, errors: ['نوع البند مطلوب'] };
  const amt = parseFloat(amount);
  if (!(amt > 0)) return { ok: false, errors: ['المبلغ مطلوب'] };

  const resolvedName = supplierId
    ? await resolveSupplierName(db, supplierId, rawSupplierName).catch(() => rawSupplierName || '')
    : (rawSupplierName || '');

  const snap = await getDoc(FP_REF(db));
  const prices = snap.exists() ? (snap.data().prices || []) : [];

  const priceId = id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const entry = {
    id: priceId,
    type: type.trim(),
    amount: amt,
    printType: (printType || '').trim() || null,
    supplierId: supplierId || null,
    supplierName: resolvedName.trim() || null,
    note: (note || '').trim() || null,
    size: (size || '').trim() || null,
    updatedAt: new Date().toISOString().slice(0, 10),
    updatedBy: userName || '',
  };

  const idx = prices.findIndex(p => p.id === priceId);
  if (idx >= 0) prices[idx] = entry; else prices.push(entry);
  await setDoc(FP_REF(db), { prices }, { merge: true });

  // fire-and-forget: sync fixed price → library pinnedPrice
  import('./cost-library-actions.js').then(({ searchCostLibrary, pinLibraryPrice }) => {
    searchCostLibrary({ db, type: type.trim() }).then(items => {
      for (const item of items) {
        pinLibraryPrice({ db, itemId: item.id, price: amt, userName: userName || 'fixed-price-sync' }).catch(() => {});
      }
    }).catch(() => {});
  }).catch(() => {});

  return { ok: true, priceId };
}

export async function deleteFixedPrice(db, priceId) {
  const snap = await getDoc(FP_REF(db));
  if (!snap.exists()) return { ok: true };
  const prices = (snap.data().prices || []).filter(p => p.id !== priceId);
  await setDoc(FP_REF(db), { prices });
  return { ok: true };
}
