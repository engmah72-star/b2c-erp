/**
 * features/gallery/services/gallery.service.js
 *
 * محوّل رفيع (adapter) فوق المصدر الوحيد للكتابة في مجموعة `gallery`:
 *   core/gallery-actions.js  (RULE 1 / H1.1 — كاتب واحد، صفر ازدواج schema).
 *
 * هذه الطبقة تُترجم فقط مدخلات الـ view (category/actorId/...) إلى عقد
 * gallery-actions ({ actor, productType, ... })، وتحافظ على عقد العائد
 * { ok, errors, id? } الذي يعتمده grid-view. لا writes مباشرة هنا.
 */

import {
  publishGalleryItem, setGalleryVisibility, setGalleryFeatured, deleteGalleryItem,
} from '../../../core/gallery-actions.js';
import { normalizeTags } from '../model.js';

const _actor = (id, name) => ({ userId: id, userName: name || '' });

/**
 * نشر تصميم جديد للمعرض (يفوّض إلى الكاتب الوحيد).
 * @returns { ok, errors, id? }
 */
export async function publishToGallery({
  file, title, category, tags,
  designerName, actorId, actorName, onProgress,
  // tenantId/designerId مقبولة للتوافق لكن لا تُمرَّر — الـ schema الموحّد يديرها.
}) {
  if (!actorId) return { ok: false, errors: ['غير مصرّح — لا مستخدم'] };
  const r = await publishGalleryItem({
    file,
    title,
    productType: (category || '').trim() || 'عام',
    tags: normalizeTags(tags),
    actor: _actor(actorId, actorName || designerName),
    onProgress,
  });
  return { ok: r.ok, errors: r.errors || [], warnings: r.warnings, id: r.id };
}

/** إظهار/إخفاء عنصر (soft reversal). */
export async function setVisibility({ itemId, isVisible, actorId, actorName }) {
  if (!actorId) return { ok: false, errors: ['غير مصرّح'] };
  const r = await setGalleryVisibility({ id: itemId, isVisible, actor: _actor(actorId, actorName) });
  return { ok: r.ok, errors: r.errors || [] };
}

/** تمييز/إلغاء تمييز عنصر. */
export async function toggleFeature({ itemId, isFeatured, actorId, actorName }) {
  if (!actorId) return { ok: false, errors: ['غير مصرّح'] };
  const r = await setGalleryFeatured({ id: itemId, isFeatured, actor: _actor(actorId, actorName) });
  return { ok: r.ok, errors: r.errors || [] };
}

/** حذف نهائي (admin فقط — يُفرض في firestore). يحذف الـ doc + الصورة. */
export async function removeGalleryItem({ itemId, imagePath, actorId, actorName }) {
  if (!actorId) return { ok: false, errors: ['غير مصرّح'] };
  const r = await deleteGalleryItem({ id: itemId, storagePath: imagePath, actor: _actor(actorId, actorName) });
  return { ok: r.ok, errors: r.errors || [] };
}
