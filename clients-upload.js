/**
 * Business2Card ERP — clients-upload.js
 *
 * ━━━ DESIGN FILE UPLOAD HELPERS FOR clients.html ━━━
 *
 * God-page decomposition PR-19 (RULE G5 / S1):
 * Extracts the image-compression + Firebase Storage upload helpers
 * from the inline saveNewOrder() function in clients.html.
 *
 *   - compressImage(file)    pure: returns Promise<File> (or original)
 *   - uploadDesignFiles({files, orderId, onProgress})
 *                            Firebase Storage compat — upload N files
 *                            with progress, return {firstUrl, allFiles}
 *
 * Why a module?
 *   - compressImage is a pure utility worth reusing across pages
 *   - uploadDesignFiles needs Firebase Storage (modular SDK via
 *     firebase-init.js).
 *
 * Storage path pattern:
 *   designs/order_<orderId>_<timestamp>_<index>
 *   (preserved verbatim from the in-page implementation)
 */

import { storage } from './core/firebase-init.js';
import { ref, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

/**
 * compressImage(file) → Promise<File>
 *
 * If the file is not an image, resolves with the original.
 * Otherwise: scales to max-800px on the long edge, encodes to webp
 * (quality 0.65) with jpeg fallback when webp unsupported.
 *
 * Pure: uses DOM canvas API; doesn't reach into the page DOM.
 */
// webp support is browser-global, not per-image — detect once (1×1 canvas)
// instead of re-encoding every full image just to probe support.
let _webpSupport;
function supportsWebp() {
  if (_webpSupport === undefined) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      _webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
    } catch { _webpSupport = false; }
  }
  return _webpSupport;
}

export function compressImage(file) {
  return new Promise((res) => {
    if (!file?.type?.startsWith('image/')) { res(file); return; }
    // settle-once guard: any failure path must still resolve (with the
    // original file) so the caller's await never hangs. Without this, a
    // canvas/getContext failure inside img.onload (seen on some remote /
    // hardware-accel-disabled desktops) left the Promise pending forever →
    // the order-save button stuck on "جاري الرفع..." and nothing saved.
    let done = false;
    let url = '';
    const settle = (out) => {
      if (done) return;
      done = true;
      try { if (url) URL.revokeObjectURL(url); } catch { /* noop */ }
      clearTimeout(timer);
      res(out);
    };
    // Hard timeout: if decode/encode stalls (huge image, stuck stream),
    // fall back to the original file instead of blocking the save flow.
    const timer = setTimeout(() => settle(file), 15000);

    const img = new Image();
    try { url = URL.createObjectURL(file); }
    catch { settle(file); return; }

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let { width: w, height: h } = img;
        const MAX = 800;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else       { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { settle(file); return; } // no 2d context → keep original
        ctx.drawImage(img, 0, 0, w, h);
        const fmt = supportsWebp() ? 'image/webp' : 'image/jpeg';
        canvas.toBlob(
          (blob) => settle(blob ? new File([blob], file.name, { type: fmt }) : file),
          fmt, 0.65
        );
      } catch {
        settle(file); // any canvas/encode throw → upload the original
      }
    };
    img.onerror = () => settle(file);
    img.src = url;
  });
}

/**
 * uploadDesignFiles({files, orderId, onProgress}) → Promise<{firstUrl, allFiles}>
 *
 * Compresses + uploads N files to Firebase Storage compat under:
 *   designs/order_<orderId>_<timestamp>_<index>
 *
 * - onProgress(avgPercent: number) — called as uploads advance.
 * - Returns the first uploaded URL + the full file metadata list.
 * - On empty input → {firstUrl:'', allFiles:[]}.
 *
 * Uses Firebase Storage modular SDK via firebase-init.js.
 */
export function uploadDesignFiles({
  files = [],
  orderId = '',
  onProgress = () => {},
  pathPrefix = 'designs/order_',
} = {}) {
  if (!files.length) {
    return Promise.resolve({ firstUrl: '', allFiles: [] });
  }
  if (!storage) {
    return Promise.reject(new Error('Firebase Storage SDK not loaded'));
  }
  const progress = new Array(files.length).fill(0);
  const updateProgress = () => {
    const avg = Math.round(progress.reduce((s, p) => s + p, 0) / files.length);
    onProgress(avg);
  };
  const uploadOne = (f, i) => compressImage(f).then(cf => new Promise((res, rej) => {
    const sRef = ref(storage, `${pathPrefix}${orderId}_${Date.now()}_${i}`);
    const task = uploadBytesResumable(sRef, cf);
    task.on(
      'state_changed',
      (s) => { progress[i] = Math.round(s.bytesTransferred / s.totalBytes * 100); updateProgress(); },
      rej,
      () => getDownloadURL(sRef)
        .then(url => res({ url, name: f.name, type: f.type }))
        .catch(rej),
    );
  }));
  return Promise.all(files.map((f, i) => uploadOne(f, i)))
    .then(results => ({ firstUrl: results[0]?.url || '', allFiles: results }));
}

// ─── SIDE-EFFECT: expose to window for compat (clients.html) ─────────
if (typeof window !== 'undefined') {
  Object.assign(window, { compressImage, uploadDesignFiles });
}
