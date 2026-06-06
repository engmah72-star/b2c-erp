/**
 * Business2Card ERP — core/gallery-actions.js
 *
 * ━━━ PORTAL DESIGNS (PUBLIC GALLERY) ACTIONS LAYER ━━━
 *
 * طبقة الأفعال المركزية لمجموعة `gallery` — "تصميمات البوابة" التي تظهر
 * للعملاء في النسخة العامة (portal.html → "معرض تصميماتنا").
 *
 * المصدر الوحيد للكتابة في `gallery` (RULE H1.1 — لا addDoc/updateDoc/
 * deleteDoc مباشر في HTML). كل action يُرجع عقد الأفعال الموحَّد:
 *   { ok, errors, warnings, ... }  (RULE H1.5)
 *
 * صلاحيات firestore.rules:
 *   - read   : عامة (دعاية للزوار).
 *   - create : auth && (admin || hasPage('design')).
 *   - update : auth && (admin || hasPage('design')).
 *   - delete : admin فقط — لذا غير المسؤول يستخدم الإخفاء (isVisible:false).
 *
 * كل mutation تحمل مُنفِّذاً (actor) + قيد audit (RULE H3) داخل
 * `auditTrail[]` على الـ doc نفسه (gallery = ميتاداتا تسويقية بلا أثر مالي).
 */

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, serverTimestamp, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  ref, uploadBytes, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { db as defaultDb, storage } from './firebase-init.js';
import { deleteFile } from './storage-helpers.js';
import { auditEntry } from './audit.js';

const GALLERY = 'gallery';

/** يتحقق من وجود مُنفِّذ صالح (RULE R) — يُرجع رسالة خطأ أو null. */
function _requireActor(actor) {
  if (!actor || !actor.userId) {
    return '⚠️ لا يمكن تنفيذ العملية بدون مستخدم معروف';
  }
  return null;
}

/** تطبيع الوسوم النصية: قصّ + lowercase + إزالة الفراغ والتكرار (حد 20). */
function _cleanKeywords(kw) {
  if (kw == null) return null;
  const arr = Array.isArray(kw) ? kw : String(kw).split(/[,،]/);
  const seen = new Set();
  const out = [];
  for (const k of arr) {
    const t = String(k).trim().toLowerCase();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); if (out.length >= 20) break; }
  }
  return out;
}

/**
 * نشر تصميم جديد في المعرض العام.
 *
 * @param {Object}  args
 * @param {File}    [args.file]      — صورة الموك أب (يُرفع لـ Storage). أو
 * @param {string}  [args.imageUrl]  — رابط جاهز (بديل عن file).
 * @param {string}  [args.title]     — عنوان (افتراضي = التصنيف).
 * @param {string}  args.productType — التصنيف / التخصص (إلزامي).
 * @param {Array}   [args.tags]      — ألوان/وسوم [{hex,name}] أو strings.
 * @param {Object}  args.actor       — { userId, userName }.
 * @returns {Promise<{ok, errors, warnings, id?}>}
 */
export async function publishGalleryItem({
  db = defaultDb, file, imageUrl, title, productType, tags, keywords, actor,
} = {}) {
  const actorErr = _requireActor(actor);
  if (actorErr) return { ok: false, errors: [actorErr], warnings: [] };
  if (!file && !imageUrl) return { ok: false, errors: ['⚠️ اختر صورة للموك أب'], warnings: [] };
  if (!productType || !productType.trim()) return { ok: false, errors: ['⚠️ أدخل التصنيف'], warnings: [] };

  const warnings = [];
  let url = (imageUrl || '').trim();
  let storagePath = null;

  try {
    // 1) رفع الصورة (لو File) — مسار gallery/ مطابق لـ storage.rules.
    if (file) {
      storagePath = `gallery/mockup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const r = ref(storage, storagePath);
      await uploadBytes(r, file);
      url = await getDownloadURL(r);
    }

    // 2) كشف التكرار — best effort (لا يمنع النشر).
    try {
      const dupSnap = await getDocs(query(collection(db, GALLERY), where('imageUrl', '==', url)));
      const dup = dupSnap.docs.find((d) => d.data().isVisible !== false);
      if (dup) warnings.push(`⚠️ صورة مكررة لـ "${dup.data().title || 'تصميم'}"`);
    } catch (_) { /* فهرس/صلاحية — تجاهل */ }

    const cat = productType.trim();
    const audit = auditEntry({
      action: '🖼️ نشر تصميم في المعرض العام',
      userId: actor.userId, userName: actor.userName, kind: 'op',
    });

    // 3) كتابة الـ doc — schema مطابق لِما يقرأه portal.html + حقول إضافية.
    const docRef = await addDoc(collection(db, GALLERY), {
      imageUrl:        url,
      storagePath,                       // يسهّل حذف ملف Storage لاحقاً
      title:           (title || '').trim() || cat,
      description:     '',
      productType:     cat,
      tags:            Array.isArray(tags) ? tags : [],
      keywords:        _cleanKeywords(keywords) || [],
      designerName:    actor.userName || '',
      publishedBy:     actor.userId,
      publishedByName: actor.userName || '',
      isVisible:       true,
      publishedAt:     serverTimestamp(),
      updatedAt:       serverTimestamp(),
      updatedBy:       actor.userId,
      updatedByName:   actor.userName || '',
      auditTrail:      [audit],
    });

    return { ok: true, errors: [], warnings, id: docRef.id };
  } catch (e) {
    return { ok: false, errors: [e?.message || 'فشل النشر'], warnings };
  }
}

/**
 * إظهار/إخفاء تصميم من بوابة العميل (soft toggle — متاح لكل قسم التصميم).
 * @param {Object} args — { id, isVisible:boolean, actor:{userId,userName} }
 */
export async function setGalleryVisibility({ db = defaultDb, id, isVisible, actor } = {}) {
  const actorErr = _requireActor(actor);
  if (actorErr) return { ok: false, errors: [actorErr], warnings: [] };
  if (!id) return { ok: false, errors: ['⚠️ معرّف التصميم مطلوب'], warnings: [] };

  const visible = !!isVisible;
  try {
    const audit = auditEntry({
      action: visible ? '👁 إظهار تصميم في البوابة' : '🚫 إخفاء تصميم من البوابة',
      userId: actor.userId, userName: actor.userName, kind: 'op',
    });
    await updateDoc(doc(db, GALLERY, id), {
      isVisible:     visible,
      updatedAt:     serverTimestamp(),
      updatedBy:     actor.userId,
      updatedByName: actor.userName || '',
      auditTrail:    arrayUnion(audit),
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e?.message || 'فشل تحديث الحالة'], warnings: [] };
  }
}

/**
 * تعديل بيانات تصميم منشور (العنوان/التصنيف/الوسوم).
 * @param {Object} args — { id, patch:{title?,productType?,tags?,description?}, actor }
 */
export async function updateGalleryItem({ db = defaultDb, id, patch = {}, actor } = {}) {
  const actorErr = _requireActor(actor);
  if (actorErr) return { ok: false, errors: [actorErr], warnings: [] };
  if (!id) return { ok: false, errors: ['⚠️ معرّف التصميم مطلوب'], warnings: [] };

  // اقبل فقط الحقول المسموح بتعديلها (لا لمس imageUrl/publishedBy/isVisible).
  const clean = {};
  if (typeof patch.title === 'string')       clean.title = patch.title.trim();
  if (typeof patch.productType === 'string') clean.productType = patch.productType.trim();
  if (typeof patch.description === 'string') clean.description = patch.description.trim();
  if (Array.isArray(patch.tags))             clean.tags = patch.tags;
  if (patch.keywords !== undefined)          clean.keywords = _cleanKeywords(patch.keywords) || [];

  if (!Object.keys(clean).length) {
    return { ok: false, errors: ['⚠️ لا توجد تغييرات صالحة للحفظ'], warnings: [] };
  }
  if ('productType' in clean && !clean.productType) {
    return { ok: false, errors: ['⚠️ التصنيف لا يمكن أن يكون فارغاً'], warnings: [] };
  }

  try {
    const audit = auditEntry({
      action: '✏️ تعديل بيانات تصميم في المعرض',
      userId: actor.userId, userName: actor.userName, kind: 'edit',
      meta: { fields: Object.keys(clean) },
    });
    await updateDoc(doc(db, GALLERY, id), {
      ...clean,
      updatedAt:     serverTimestamp(),
      updatedBy:     actor.userId,
      updatedByName: actor.userName || '',
      auditTrail:    arrayUnion(audit),
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e?.message || 'فشل حفظ التعديل'], warnings: [] };
  }
}

/**
 * حذف نهائي لتصميم من المعرض (admin فقط — تفرضه firestore.rules).
 * يحذف ملف Storage أيضاً إن توفّر storagePath (best effort، فشل صامت).
 * @param {Object} args — { id, storagePath?, actor }
 */
export async function deleteGalleryItem({ db = defaultDb, id, storagePath, actor } = {}) {
  const actorErr = _requireActor(actor);
  if (actorErr) return { ok: false, errors: [actorErr], warnings: [] };
  if (!id) return { ok: false, errors: ['⚠️ معرّف التصميم مطلوب'], warnings: [] };

  try {
    await deleteDoc(doc(db, GALLERY, id));
    // تنظيف Storage — لا يفشل العملية لو الملف غير موجود/غير معروف.
    if (storagePath) {
      try { await deleteFile(storagePath); } catch (_) { /* best effort */ }
    }
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    // رسالة أوضح لو رفضته القواعد (الحذف النهائي لـ admin فقط).
    const msg = /permission|insufficient/i.test(e?.message || '')
      ? '🚫 الحذف النهائي متاح للأدمن فقط — استخدم الإخفاء بدلاً منه'
      : (e?.message || 'فشل الحذف');
    return { ok: false, errors: [msg], warnings: [] };
  }
}
