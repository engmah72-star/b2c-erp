/**
 * features/design/services/upload.service.js
 *
 * رفع ملفات لـ Firebase Storage في سياق design feature.
 * يدعم 3 سلوتات: mockup (image) / pdf (proofing) / source (editable).
 */

import { storage } from '../../../core/firebase-init.js';
import {
  ref, uploadBytesResumable, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

/**
 * Infer slot kind من MIME/extension.
 *   image/*               → 'mockup'
 *   application/pdf       → 'pdf'
 *   .ai/.psd/.eps/.indd/.svg/.fig/...  → 'source'
 *   else                  → 'source' (afe default)
 */
export function inferSlotKind(file) {
  if (!file) return 'source';
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'mockup';
  if (mime === 'application/pdf') return 'pdf';
  const name = (file.name || '').toLowerCase();
  if (/\.(pdf)$/i.test(name)) return 'pdf';
  if (/\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(name)) return 'mockup';
  return 'source';
}

/**
 * Upload ملف لـ slot معيّن على بند.
 * يرجّع { url, fileName, contentType, size, slot }.
 *
 * @param {Object} params
 * @param {string} params.itemId
 * @param {File}   params.file
 * @param {string} params.slot       'mockup' | 'pdf' | 'source'
 * @param {Function} [params.onProgress]  (pct: 0-100) => void
 */
export async function uploadSlotFile({ itemId, file, slot, onProgress }) {
  if (!itemId) throw new Error('uploadSlotFile: itemId required');
  if (!file) throw new Error('uploadSlotFile: file required');
  if (!['mockup', 'pdf', 'source'].includes(slot)) {
    throw new Error(`uploadSlotFile: invalid slot "${slot}"`);
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const ts = Date.now();
  const path = `design_items/${itemId}/${slot}/${ts}_${safeName}`;
  const fileRef = ref(storage, path);
  const task = uploadBytesResumable(fileRef, file, {
    contentType: file.type || undefined,
  });

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (onProgress) {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          onProgress(pct);
        }
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({
            url, slot,
            fileName: file.name,
            contentType: file.type || '',
            size: file.size,
            path,
          });
        } catch (e) { reject(e); }
      }
    );
  });
}

/**
 * Helper: build a version object from one or more uploaded slot files.
 * يستخدمه work-view لما يرفع المصمم ملف واحد أو أكثر.
 */
export function buildVersion({ vNum, files, uploadedByName, uploadedBy }) {
  const filesByKind = { mockup: null, pdf: null, source: null };
  for (const f of files || []) {
    if (f.slot && filesByKind[f.slot] !== undefined) {
      filesByKind[f.slot] = { url: f.url, fileName: f.fileName, size: f.size };
    }
  }
  return {
    vNum,
    uploadedAt: new Date().toISOString(),
    uploadedBy: uploadedBy || null,
    uploadedByName: uploadedByName || '',
    files: filesByKind,
    // Backward-compat: keep imageUrl للقراء القديمة
    imageUrl: filesByKind.mockup?.url || '',
    fileName: filesByKind.mockup?.fileName || '',
  };
}
