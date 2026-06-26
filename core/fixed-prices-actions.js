/**
 * core/fixed-prices-actions.js
 * ──────────────────────────────────────────────────────────
 * أسعار ثابتة مرجعية — تُعرَّف مرة واحدة وتُملأ تلقائياً
 *
 * T6 Migration: moved from single-doc array (master_lists/fixed_prices)
 * to individual docs in collection (fixed_prices/{priceId}).
 * Legacy fallback reads old doc if collection is empty.
 */

import {
  doc, getDoc, setDoc, deleteDoc, writeBatch,
  collection, getDocs, query, limit,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { normalizeCostType } from './cost-type-normalize.js';
import { resolveSupplierName } from './supplier-resolve.js';

const FP_COL = (db) => collection(db, 'fixed_prices');
const FP_DOC = (db, id) => doc(db, 'fixed_prices', id);
const LEGACY_REF = (db) => doc(db, 'master_lists', 'fixed_prices');

export async function getFixedPrices(db) {
  const colSnap = await getDocs(query(FP_COL(db), limit(500)));
  if (!colSnap.empty) {
    return colSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const legacySnap = await getDoc(LEGACY_REF(db));
  return legacySnap.exists() && !legacySnap.data().migrated
    ? (legacySnap.data().prices || [])
    : [];
}

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

  await setDoc(FP_DOC(db, priceId), entry);

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
  await deleteDoc(FP_DOC(db, priceId));
  return { ok: true };
}

export async function migrateFixedPrices(db) {
  const legacySnap = await getDoc(LEGACY_REF(db));
  if (!legacySnap.exists() || legacySnap.data().migrated) return { ok: true, migrated: 0 };
  const prices = legacySnap.data().prices || [];
  if (!prices.length) {
    await setDoc(LEGACY_REF(db), { migrated: true, migratedAt: new Date().toISOString() }, { merge: true });
    return { ok: true, migrated: 0 };
  }
  const batch = writeBatch(db);
  for (const p of prices) {
    batch.set(FP_DOC(db, p.id), p);
  }
  batch.set(LEGACY_REF(db), { migrated: true, migratedAt: new Date().toISOString() }, { merge: true });
  await batch.commit();
  return { ok: true, migrated: prices.length };
}
