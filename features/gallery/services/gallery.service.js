/**
 * features/gallery/services/gallery.service.js
 *
 * طبقة الكتابة على collection `gallery` (بورتفوليو الشركة).
 * كل التعديلات تمرّ هنا — لا writes مباشرة في الـ view (L1 / H1.1).
 *
 * غير مالي بالكامل (G6 — لا FSE, لا wallets/ledger).
 * كل mutation يحمل audit entry (H3). العقد: { ok, errors, ... } (H1.5).
 * الإلغاء = soft (isVisible=false) — reversible (E1)؛ الحذف النهائي للأدمن فقط.
 */

import { db } from '../../../core/firebase-init.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  arrayUnion, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { auditEntry } from '../../../core/audit.js';
import { uploadGalleryFile, deleteFile } from '../../../core/storage-helpers.js';
import { buildGalleryItem, validateGalleryInput } from '../model.js';

/**
 * نشر تصميم جديد للمعرض: رفع الصورة + إنشاء doc.
 * @returns { ok, errors, id?, item? }
 */
export async function publishToGallery({
  file, title, category, tags,
  designerId, designerName, tenantId = null,
  actorId, actorName, onProgress,
}) {
  const v = validateGalleryInput({ title, file });
  if (!v.ok) return { ok: false, errors: v.errors };
  if (!actorId) return { ok: false, errors: ['غير مصرّح — لا مستخدم'] };

  let uploaded;
  try {
    uploaded = await uploadGalleryFile({ file, designerId: designerId || actorId, onProgress });
  } catch (e) {
    return { ok: false, errors: ['تعذّر رفع الصورة: ' + (e?.message || '')] };
  }

  const base = buildGalleryItem({
    title, category, tags,
    imageUrl: uploaded.url,
    imagePath: uploaded.path,
    designerId: designerId || actorId,
    designerName: designerName || actorName || '',
    tenantId,
  });

  try {
    const ref = await addDoc(collection(db, 'gallery'), {
      ...base,
      publishedAt: serverTimestamp(),
      publishedBy: actorId,
      publishedByName: actorName || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      audit: [auditEntry({ action: '🖼️ نشر تصميم للمعرض', userId: actorId, userName: actorName, kind: 'op' })],
    });
    return { ok: true, errors: [], id: ref.id, item: { id: ref.id, ...base } };
  } catch (e) {
    // تنظيف الصورة المرفوعة لتفادي ملفات يتيمة
    try { await deleteFile(uploaded.path); } catch (_) { /* best-effort */ }
    return { ok: false, errors: ['تعذّر حفظ العنصر: ' + (e?.message || '')] };
  }
}

/**
 * إظهار/إخفاء عنصر (soft reversal — لا حذف).
 * @returns { ok, errors }
 */
export async function setVisibility({ itemId, isVisible, actorId, actorName }) {
  if (!itemId) return { ok: false, errors: ['itemId مطلوب'] };
  if (!actorId) return { ok: false, errors: ['غير مصرّح'] };
  try {
    await updateDoc(doc(db, 'gallery', itemId), {
      isVisible: !!isVisible,
      updatedAt: serverTimestamp(),
      audit: arrayUnion(auditEntry({
        action: isVisible ? '👁️ إظهار في المعرض' : '🙈 إخفاء من المعرض',
        userId: actorId, userName: actorName, kind: isVisible ? 'op' : 'reversal',
      })),
    });
    return { ok: true, errors: [] };
  } catch (e) {
    return { ok: false, errors: [e?.message || 'تعذّر التحديث'] };
  }
}

/**
 * تمييز/إلغاء تمييز عنصر (feature) — admin فقط (يُفرض في firestore + UI).
 * @returns { ok, errors }
 */
export async function toggleFeature({ itemId, isFeatured, actorId, actorName }) {
  if (!itemId) return { ok: false, errors: ['itemId مطلوب'] };
  if (!actorId) return { ok: false, errors: ['غير مصرّح'] };
  try {
    await updateDoc(doc(db, 'gallery', itemId), {
      isFeatured: !!isFeatured,
      updatedAt: serverTimestamp(),
      audit: arrayUnion(auditEntry({
        action: isFeatured ? '⭐ تمييز في المعرض' : '↩️ إلغاء التمييز',
        userId: actorId, userName: actorName, kind: 'op',
      })),
    });
    return { ok: true, errors: [] };
  } catch (e) {
    return { ok: false, errors: [e?.message || 'تعذّر التحديث'] };
  }
}

/**
 * حذف نهائي — admin فقط. يحذف الـ doc + الصورة من Storage.
 * @returns { ok, errors }
 */
export async function removeGalleryItem({ itemId, imagePath, actorId }) {
  if (!itemId) return { ok: false, errors: ['itemId مطلوب'] };
  if (!actorId) return { ok: false, errors: ['غير مصرّح'] };
  try {
    await deleteDoc(doc(db, 'gallery', itemId));
    if (imagePath) { try { await deleteFile(imagePath); } catch (_) { /* best-effort */ } }
    return { ok: true, errors: [] };
  } catch (e) {
    return { ok: false, errors: [e?.message || 'تعذّر الحذف'] };
  }
}
