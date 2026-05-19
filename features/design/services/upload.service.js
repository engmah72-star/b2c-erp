/**
 * features/design/services/upload.service.js
 *
 * Firebase Storage uploads لـ design feature (مرجعيات + ملفات تصميم + slots).
 *
 * Status: STUB — التنفيذ الفعلي في PR-3.
 */

// import { storage } from '../../../core/firebase-init.js';

/**
 * Upload reference file (للـ new-order modal).
 * يرجّع { url, path, contentType }.
 */
export async function uploadReferenceFile(/* { orderId, file, onProgress }, ctx */) {
  throw new Error('upload.service.uploadReferenceFile: not implemented (PR-3)');
}

/**
 * Upload design file (final design).
 */
export async function uploadDesignFile(/* { orderId, file, onProgress }, ctx */) {
  throw new Error('upload.service.uploadDesignFile: not implemented (PR-3)');
}

/**
 * Upload to a specific slot in design_items (mockup/pdf/source).
 * inferSlotKind() يفهم نوع الملف من mime/ext.
 */
export async function uploadSlotFile(/* { itemId, slot, file, onProgress }, ctx */) {
  throw new Error('upload.service.uploadSlotFile: not implemented (PR-3)');
}

/**
 * Upload a new version (3 slots together).
 */
export async function uploadVersion(/* { itemId, files, onProgress }, ctx */) {
  throw new Error('upload.service.uploadVersion: not implemented (PR-3)');
}

/**
 * Infer slot kind from file metadata.
 * Pure function — لا I/O.
 */
export function inferSlotKind(/* file */) {
  throw new Error('upload.service.inferSlotKind: not implemented (PR-3)');
}
