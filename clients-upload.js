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
 *   - uploadDesignFiles needs Firebase Storage (compat) which is on
 *     window via firebase.storage() — module can call it directly.
 *
 * Storage path pattern:
 *   designs/order_<orderId>_<timestamp>_<index>
 *   (preserved verbatim from the in-page implementation)
 */

/**
 * compressImage(file) → Promise<File>
 *
 * If the file is not an image, resolves with the original.
 * Otherwise: scales to max-800px on the long edge, encodes to webp
 * (quality 0.65) with jpeg fallback when webp unsupported.
 *
 * Pure: uses DOM canvas API; doesn't reach into the page DOM.
 */
export function compressImage(file) {
  return new Promise((res) => {
    if (!file?.type?.startsWith('image/')) { res(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width: w, height: h } = img;
      const MAX = 800;
      if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
      else       { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const fmt = canvas.toDataURL('image/webp', 0.1).startsWith('data:image/webp')
        ? 'image/webp' : 'image/jpeg';
      canvas.toBlob(
        (blob) => res(new File([blob], file.name, { type: fmt })),
        fmt, 0.65
      );
    };
    img.onerror = () => res(file);
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
 * Requires window.firebase (compat SDK) — the page loads it via
 * firebase-app-compat.js. Module reads firebase.storage() lazily.
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
  if (typeof window === 'undefined' || !window.firebase?.storage) {
    return Promise.reject(new Error('Firebase Storage SDK not loaded'));
  }
  const progress = new Array(files.length).fill(0);
  const updateProgress = () => {
    const avg = Math.round(progress.reduce((s, p) => s + p, 0) / files.length);
    onProgress(avg);
  };
  const uploadOne = (f, i) => compressImage(f).then(cf => new Promise((res, rej) => {
    const sRef = window.firebase.storage().ref(`${pathPrefix}${orderId}_${Date.now()}_${i}`);
    const task = sRef.put(cf);
    task.on(
      'state_changed',
      (s) => { progress[i] = Math.round(s.bytesTransferred / s.totalBytes * 100); updateProgress(); },
      rej,
      () => sRef.getDownloadURL()
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
