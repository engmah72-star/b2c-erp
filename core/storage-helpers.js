/**
 * core/storage-helpers.js
 *
 * ━━━ CENTRAL STORAGE HELPERS (RULE S1) ━━━
 *
 * طبقة موحَّدة لرفع وإدارة الملفات في Firebase Storage.
 *
 * كل الـ uploads في النظام تمر من هنا — لا inline `uploadBytes(...)`.
 *
 * Structured paths:
 *   {module}/{entityId}/{kind}/{timestamp}_{filename}
 *
 * أمثلة:
 *   orders/{orderId}/design/1716130000_logo.pdf
 *   orders/{orderId}/print-final/1716130000_card.pdf
 *   orders/{orderId}/production/1716130000_proof.jpg
 *   clients/{clientId}/avatar/1716130000_photo.jpg
 *   employees/{empId}/documents/1716130000_id.pdf
 *
 * كل upload يُرجع:
 *   { url, path, fileName, size, contentType, kind, timestamp }
 */

import { storage } from './firebase-init.js';
import {
  ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

// ══════════════════════════════════════════
// CONSTANTS — kinds معتمدة لكل module
// ══════════════════════════════════════════

export const ORDER_FILE_KINDS = Object.freeze({
  DESIGN:       'design',       // ملف التصميم الأصلي
  MOCKUP:       'mockup',       // معاينة بصرية
  PRINT_FINAL:  'print-final',  // الملف النهائي للطباعة
  PRODUCTION:   'production',   // صور أو ملفات التنفيذ
  PROOF:        'proof',        // proof من المطبعة
  REFERENCE:    'reference',    // ملف مرجعي من العميل عند إنشاء الأوردر
});

export const CLIENT_FILE_KINDS = Object.freeze({
  AVATAR:    'avatar',
  DOCUMENTS: 'documents',
  // وسائط الكارت الرقمي (قراءة عامة في storage.rules) — يبنيها العميل بنفسه.
  LOGO:      'logo',
  COVER:     'cover',
  WORKS:     'works',
  GALLERY:   'gallery',
  // مرفقات محادثة العميل (قراءة بالـtoken عبر رابط التنزيل — لا قراءة عامة بالمسار).
  CHAT:      'chat',
});

export const EMPLOYEE_FILE_KINDS = Object.freeze({
  AVATAR:    'avatar',
  DOCUMENTS: 'documents',
  CONTRACTS: 'contracts',
  INCIDENTS: 'incidents',   // صور إثبات الإخفاقات/المخالفات
});

export const SUPPLIER_FILE_KINDS = Object.freeze({
  DOCUMENTS: 'documents',
  CATALOG:   'catalog',
});

// ══════════════════════════════════════════
// INTERNAL HELPERS
// ══════════════════════════════════════════

/** sanitize filename لمنع issues مع Storage paths */
export function sanitizeFileName(name) {
  if (!name) return 'unnamed';
  // remove path separators, keep only word chars/dots/dashes
  return name
    .replace(/[\\\/]/g, '_')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120); // max 120 chars
}

/** infer kind من mime type (للحالات اللي الـ caller مش متأكد) */
export function inferKind(file) {
  if (!file) return 'unknown';
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (/\.(ai|psd|eps|indd|svg|fig)$/i.test(name)) return 'source';
  return 'other';
}

/** بنِ path موحَّد */
function _buildPath({ module, entityId, kind, fileName }) {
  if (!module || !entityId || !kind || !fileName) {
    throw new Error('[storage] _buildPath: module + entityId + kind + fileName كلها مطلوبة');
  }
  const ts = Date.now();
  const safeName = sanitizeFileName(fileName);
  return `${module}/${entityId}/${kind}/${ts}_${safeName}`;
}

/** internal: actual upload.
 * contentType اختياري — لو مُرِّر يُفرَض في الـ metadata (مهم لقواعد storage التي
 * تشترط contentType.matches('image/.*') — ملف بلا MIME كان يُرفع كـ octet-stream فيُرفَض). */
async function _upload({ path, file, onProgress, contentType }) {
  if (!path) throw new Error('[storage] _upload: path مطلوب');
  if (!file) throw new Error('[storage] _upload: file مطلوب');

  const fileRef = ref(storage, path);
  const ct = contentType || file.type || 'application/octet-stream';
  const metadata = { contentType: ct };

  // لو onProgress callback موجود، استخدم resumable upload
  if (typeof onProgress === 'function') {
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(fileRef, file, metadata);
      task.on('state_changed',
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          onProgress(pct);
        },
        reject,
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({
            url, path,
            fileName:    sanitizeFileName(file.name),
            size:        file.size,
            contentType: ct,
          });
        }
      );
    });
  }

  // simple upload (no progress)
  const snap = await uploadBytes(fileRef, file, metadata);
  const url = await getDownloadURL(snap.ref);
  return {
    url, path,
    fileName:    sanitizeFileName(file.name),
    size:        file.size,
    contentType: ct,
  };
}

// ══════════════════════════════════════════
// PUBLIC API — Upload Functions
// ══════════════════════════════════════════

/**
 * رفع ملف على Order.
 *
 * @param {Object} args
 * @param {string} args.orderId
 * @param {File}   args.file
 * @param {string} args.kind — من ORDER_FILE_KINDS
 * @param {Function} [args.onProgress] (pct: 0-100) => void
 * @returns { url, path, fileName, size, contentType, kind, timestamp }
 */
export async function uploadOrderFile({ orderId, file, kind, onProgress }) {
  if (!orderId) throw new Error('[storage] uploadOrderFile: orderId مطلوب');
  if (!file)    throw new Error('[storage] uploadOrderFile: file مطلوب');
  if (!Object.values(ORDER_FILE_KINDS).includes(kind)) {
    throw new Error(`[storage] uploadOrderFile: kind غير معروف "${kind}". المعتمد: ${Object.values(ORDER_FILE_KINDS).join(', ')}`);
  }
  const path = _buildPath({ module: 'orders', entityId: orderId, kind, fileName: file.name });
  const result = await _upload({ path, file, onProgress });
  return { ...result, kind, timestamp: Date.now() };
}

/** رفع ملف على Client */
export async function uploadClientFile({ clientId, file, kind, onProgress }) {
  if (!clientId) throw new Error('[storage] uploadClientFile: clientId مطلوب');
  if (!Object.values(CLIENT_FILE_KINDS).includes(kind)) {
    throw new Error(`[storage] uploadClientFile: kind غير معروف "${kind}"`);
  }
  const path = _buildPath({ module: 'clients', entityId: clientId, kind, fileName: file.name });
  const result = await _upload({ path, file, onProgress });
  return { ...result, kind, timestamp: Date.now() };
}

/** رفع ملف على Employee */
export async function uploadEmployeeFile({ employeeId, file, kind, onProgress }) {
  if (!employeeId) throw new Error('[storage] uploadEmployeeFile: employeeId مطلوب');
  if (!Object.values(EMPLOYEE_FILE_KINDS).includes(kind)) {
    throw new Error(`[storage] uploadEmployeeFile: kind غير معروف "${kind}"`);
  }
  const path = _buildPath({ module: 'employees', entityId: employeeId, kind, fileName: file.name });
  const result = await _upload({ path, file, onProgress });
  return { ...result, kind, timestamp: Date.now() };
}

/** رفع ملف على Supplier */
export async function uploadSupplierFile({ supplierId, file, kind, onProgress }) {
  if (!supplierId) throw new Error('[storage] uploadSupplierFile: supplierId مطلوب');
  if (!Object.values(SUPPLIER_FILE_KINDS).includes(kind)) {
    throw new Error(`[storage] uploadSupplierFile: kind غير معروف "${kind}"`);
  }
  const path = _buildPath({ module: 'suppliers', entityId: supplierId, kind, fileName: file.name });
  const result = await _upload({ path, file, onProgress });
  return { ...result, kind, timestamp: Date.now() };
}

/**
 * رفع صورة لمعرض الشركة (بورتفوليو).
 * المسار يبدأ بـ `gallery/` ليطابق storage.rules (match /gallery/{file=**}).
 * صور فقط — storage.rules تفرض contentType=image/* و < 20MB.
 *
 * @param {Object} args
 * @param {File}   args.file
 * @param {string} [args.designerId]  — يُستخدم كـ entityId (تجميع ملفات المصمم). افتراضي 'shared'.
 * @param {Function} [args.onProgress] (pct: 0-100) => void
 * @returns { url, path, fileName, size, contentType, kind, timestamp }
 */
const _EXT_IMAGE_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
};
export async function uploadGalleryFile({ file, designerId, onProgress }) {
  if (!file) throw new Error('[storage] uploadGalleryFile: file مطلوب');
  // ضغط/تصغير client-side قبل الرفع (أداء + تكلفة تخزين) — fail-safe: الأصل عند التعذّر.
  let img = file;
  try {
    const { compressImage } = await import('./image-compress.js');
    img = await compressImage(file);
  } catch (_) { img = file; }
  const mime = (img.type || '').toLowerCase();
  // contentType صريح: من الـ MIME لو صورة، وإلا من الامتداد — يمنع رفض storage
  // لملفات صورة بـ MIME فارغ (كانت تُرفع octet-stream فترفضها القاعدة).
  let contentType = mime.startsWith('image/') ? mime : null;
  if (!contentType) {
    const ext = (img.name || '').toLowerCase().split('.').pop();
    contentType = _EXT_IMAGE_MIME[ext] || null;
  }
  if (!contentType) {
    throw new Error('[storage] uploadGalleryFile: صور فقط مسموحة في المعرض');
  }
  const path = _buildPath({
    module: 'gallery',
    entityId: designerId || 'shared',
    kind: 'items',
    fileName: img.name,
  });
  const result = await _upload({ path, file: img, onProgress, contentType });
  return { ...result, kind: 'items', timestamp: Date.now() };
}

// ══════════════════════════════════════════
// DELETE / GET HELPERS
// ══════════════════════════════════════════

/**
 * حذف ملف من Storage (RULE S1.6 — يحتاج admin confirmation).
 * يفشل بصمت لو الملف غير موجود — لتسهيل cleanup.
 */
export async function deleteFile(path) {
  if (!path) throw new Error('[storage] deleteFile: path مطلوب');
  try {
    const fileRef = ref(storage, path);
    await deleteObject(fileRef);
    return { ok: true, path };
  } catch (e) {
    // object-not-found ليس خطأ
    if (e?.code === 'storage/object-not-found') return { ok: true, path, alreadyDeleted: true };
    return { ok: false, path, error: e.message };
  }
}

/** Get download URL لمسار معروف */
export async function getFileUrl(path) {
  if (!path) throw new Error('[storage] getFileUrl: path مطلوب');
  return await getDownloadURL(ref(storage, path));
}

// ══════════════════════════════════════════
// REVERSE LOOKUP HELPERS (RULE S1.7)
// ══════════════════════════════════════════

/**
 * Parse storage path للحصول على entity owner + kind + timestamp.
 * @returns { module, entityId, kind, fileName, timestamp } | null
 */
export function parseStoragePath(path) {
  if (!path || typeof path !== 'string') return null;
  // pattern: {module}/{entityId}/{kind}/{ts}_{filename}
  const match = path.match(/^([^\/]+)\/([^\/]+)\/([^\/]+)\/(\d+)_(.+)$/);
  if (!match) return null;
  return {
    module:    match[1],
    entityId:  match[2],
    kind:      match[3],
    timestamp: parseInt(match[4], 10),
    fileName:  match[5],
  };
}
