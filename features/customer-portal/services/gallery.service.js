/**
 * SERVICES · gallery — معرض تصاميم الشركة (مجموعة gallery العامة). لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';

const ts = (g) => (g.publishedAt?.seconds ?? 0);

/** يحمّل التصاميم المنشورة (الأحدث أولاً). */
export async function loadGallery() {
  const fb = await firebase();
  const snap = await fb.getDocs(
    fb.query(fb.collection(fb.db, 'gallery'), fb.where('isVisible', '==', true), fb.limit(60)),
  );
  return snap.docs.map((d) => ({ ...d.data(), _id: d.id })).sort((a, b) => ts(b) - ts(a));
}

/** التصنيفات المتاحة (من productType). */
export function categoriesOf(items = []) {
  const set = new Set();
  items.forEach((g) => { const c = (g.productType || '').trim(); if (c) set.add(c); });
  return [...set];
}
