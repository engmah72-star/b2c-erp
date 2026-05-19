/**
 * features/design/services/gallery.service.js
 *
 * نشر تصميم للمعرض العام (gallery collection) ذرّياً.
 * Status: MVP — كافٍ لزر "نشر للمعرض" في الـ Work tab.
 */

import { db } from '../../../core/firebase-init.js';
import {
  collection, doc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/**
 * نشر بند design_item للمعرض العام.
 * يُحدِّث:
 *   - gallery (إنشاء doc جديد)
 *   - design_items.{itemId}.galleryId (للربط)
 *
 * Atomic writeBatch — RULE 3.
 *
 * payload:
 *   itemId, imageUrl, title, description, productType,
 *   designerName, designerUid, tenantId
 */
export async function publishToGallery({
  itemId, imageUrl, title, description, productType,
  designerName, designerUid, tenantId,
  userId, userName,
}) {
  if (!itemId) throw new Error('publishToGallery: itemId required');
  if (!imageUrl) throw new Error('publishToGallery: imageUrl required');

  const batch = writeBatch(db);
  const galRef = doc(collection(db, 'gallery'));

  batch.set(galRef, {
    sourceItemId: itemId,
    imageUrl,
    title: title || '',
    description: description || '',
    productType: productType || '',
    designerName: designerName || '',
    designerUid: designerUid || null,
    publishedByName: userName || '',
    publishedBy: userId || null,
    publishedAt: serverTimestamp(),
    isVisible: true,
    tenantId: tenantId || null,
  });

  batch.update(doc(db, 'design_items', itemId), {
    galleryId: galRef.id,
    galleryPublishedAt: serverTimestamp(),
    galleryPublishedBy: userId || null,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { galleryId: galRef.id };
}
