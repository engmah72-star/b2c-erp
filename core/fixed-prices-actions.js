/**
 * core/fixed-prices-actions.js
 * ──────────────────────────────────────────────────────────
 * أسعار ثابتة مرجعية — تُعرَّف مرة واحدة وتُملأ تلقائياً
 *
 * المخزن: master_lists/fixed_prices  { prices: [...] }
 * كل سعر: { id, type, amount, printType?, supplierId?, supplierName?, note?, updatedAt, updatedBy }
 */

import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
  const t = type.trim().toLowerCase();
  const pt = (printType || '').trim().toLowerCase();
  let exact = null, generic = null;
  for (const p of prices) {
    if ((p.type || '').trim().toLowerCase() !== t) continue;
    const ppt = (p.printType || '').trim().toLowerCase();
    if (ppt && pt && ppt === pt) { exact = p; break; }
    if (!ppt) generic = p;
  }
  return exact || generic || null;
}

export async function saveFixedPrice(db, { id, type, amount, printType, supplierId, supplierName, note }, userName) {
  if (!type?.trim()) return { ok: false, errors: ['نوع البند مطلوب'] };
  const amt = parseFloat(amount);
  if (!(amt > 0)) return { ok: false, errors: ['المبلغ مطلوب'] };

  const snap = await getDoc(FP_REF(db));
  const prices = snap.exists() ? (snap.data().prices || []) : [];

  const priceId = id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const entry = {
    id: priceId,
    type: type.trim(),
    amount: amt,
    printType: (printType || '').trim() || null,
    supplierId: supplierId || null,
    supplierName: (supplierName || '').trim() || null,
    note: (note || '').trim() || null,
    updatedAt: new Date().toISOString().slice(0, 10),
    updatedBy: userName || '',
  };

  const idx = prices.findIndex(p => p.id === priceId);
  if (idx >= 0) prices[idx] = entry; else prices.push(entry);
  await setDoc(FP_REF(db), { prices }, { merge: true });
  return { ok: true, priceId };
}

export async function deleteFixedPrice(db, priceId) {
  const snap = await getDoc(FP_REF(db));
  if (!snap.exists()) return { ok: true };
  const prices = (snap.data().prices || []).filter(p => p.id !== priceId);
  await setDoc(FP_REF(db), { prices });
  return { ok: true };
}
