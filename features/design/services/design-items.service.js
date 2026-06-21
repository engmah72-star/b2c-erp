/**
 * features/design/services/design-items.service.js
 *
 * طبقة الكتابة على entity `design_items`.
 * كل التعديلات تمر هنا (RULE G4 friendly).
 *
 * Status: MVP — تكفي للـ tab Work في PR-2.
 */

import { db } from '../../../core/firebase-init.js';
import {
  collection, doc, addDoc, updateDoc, arrayUnion, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

/**
 * إنشاء بند تصميم جديد لأوردر (order-level upload — Phase 1).
 * يرجّع id البند الجديد. يضبط updatedAt (إلزامي ليظهر في listeners المرتّبة).
 */
export async function createDesignItem({
  orderDocId, orderId = '', clientId = null, clientName = '',
  designerId = null, designerName = '', itemName = '', itemQty = null,
  userId, userName,
}) {
  if (!orderDocId) throw new Error('createDesignItem: orderDocId required');
  const ref = await addDoc(collection(db, 'design_items'), {
    orderDocId,
    orderId: orderId || '',
    clientId: clientId || null,
    clientName: clientName || '',
    designerId: designerId || null,
    designerName: designerName || '',
    itemName: itemName || 'تصميم جديد',
    itemQty: itemQty || null,
    versions: [],
    isApproved: false,
    isPrintReady: false,
    visibility: 'internal',
    status: 'wip',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId || null,
    createdByName: userName || '',
    editHistory: [{
      at: new Date().toISOString(),
      by: userName || userId || 'system',
      action: 'created',
    }],
  });
  return ref.id;
}

/**
 * تعليم بند كمعتمد.
 */
export async function markApproved({ itemId, userId, userName }) {
  if (!itemId) throw new Error('markApproved: itemId required');
  await updateDoc(doc(db, 'design_items', itemId), {
    isApproved: true,
    approvedAt: serverTimestamp(),
    approvedBy: userId || null,
    approvedByName: userName || null,
    updatedAt: serverTimestamp(),
    editHistory: arrayUnion({
      at: new Date().toISOString(),
      by: userName || userId || 'system',
      action: 'approved',
    }),
  });
}

/**
 * إلغاء/توحيد جاهزية الطباعة.
 */
export async function togglePrintReady({ itemId, isPrintReady, userId, userName }) {
  if (!itemId) throw new Error('togglePrintReady: itemId required');
  await updateDoc(doc(db, 'design_items', itemId), {
    isPrintReady: !!isPrintReady,
    updatedAt: serverTimestamp(),
    editHistory: arrayUnion({
      at: new Date().toISOString(),
      by: userName || userId || 'system',
      action: isPrintReady ? 'mark_print_ready' : 'unmark_print_ready',
    }),
  });
}

/**
 * نشر البند للعميل (visibility=published).
 */
export async function publishToClient({ itemId, userId, userName }) {
  if (!itemId) throw new Error('publishToClient: itemId required');
  await updateDoc(doc(db, 'design_items', itemId), {
    visibility: 'published',
    publishedToClientAt: serverTimestamp(),
    publishedToClientBy: userId || null,
    updatedAt: serverTimestamp(),
    editHistory: arrayUnion({
      at: new Date().toISOString(),
      by: userName || userId || 'system',
      action: 'published_to_client',
    }),
  });
}

/**
 * إضافة نسخة جديدة لـ versions[] على بند.
 * version object: { vNum, uploadedAt, uploadedByName, files: {...} }
 */
export async function appendVersion({ itemId, version, userId, userName }) {
  if (!itemId || !version) throw new Error('appendVersion: itemId + version required');
  await updateDoc(doc(db, 'design_items', itemId), {
    versions: arrayUnion(version),
    updatedAt: serverTimestamp(),
    editHistory: arrayUnion({
      at: new Date().toISOString(),
      by: userName || userId || 'system',
      action: 'version_added',
      vNum: version.vNum,
    }),
  });
}
