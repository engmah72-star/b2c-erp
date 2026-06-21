/**
 * features/gallery/repository.js
 *
 * المصدر الوحيد لكل Firestore queries في module المعرض (RULE G4).
 * كل listener له limit() مفروض (RULE G3). كل query تقبل tenantId optional (RULE G7).
 *
 * ملاحظة: collection `gallery` قراءته عامة (firestore.rules) — يعمل بدون auth أيضاً.
 * نتجنّب الـ composite indexes: نرتّب بـ publishedAt فقط ونفلتر (visible/category)
 * في الذاكرة عبر model.sortForDisplay — limit يحمي الحجم.
 */

import { db } from '../../core/firebase-init.js';
import {
  collection, doc, getDoc,
  onSnapshot, query, where, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const GALLERY_LIMIT = 120;

function _tenantFilter(tenantId) {
  return tenantId ? [where('tenantId', '==', tenantId)] : [];
}

/**
 * اشترك في عناصر المعرض (الأحدث نشراً أولاً).
 * @param {Object} args
 * @param {string} [args.tenantId]
 * @param {number} [args.max]
 * @param {Function} args.onUpdate  (items: Array) => void
 * @param {Function} [args.onError]
 * @returns {Function} unsubscribe
 */
export function subscribeGallery({ tenantId = null, max, onUpdate, onError } = {}) {
  const q = query(
    collection(db, 'gallery'),
    ..._tenantFilter(tenantId),
    orderBy('publishedAt', 'desc'),
    limit(max || GALLERY_LIMIT),
  );
  return onSnapshot(
    q,
    (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      try { onUpdate(arr); } catch (e) { console.error('[gallery] onUpdate threw:', e); }
    },
    (err) => { if (onError) onError(err); else console.error('[gallery] snapshot error:', err); },
  );
}

/** قراءة عنصر واحد (one-off). */
export async function getGalleryItem(itemId) {
  if (!itemId) return null;
  const snap = await getDoc(doc(db, 'gallery', itemId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
