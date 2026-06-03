/**
 * UTILS LAYER · image — قص/تصغير الصور في المتصفّح (canvas). لا Firebase · لا UI. (STANDARDS §6)
 * يُستخدم قبل الرفع: center-crop لنسبة محدّدة + downscale + ضغط → File خفيف + معاينة.
 */

/** يحمّل ملف صورة كـ HTMLImageElement. */
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّر قراءة الصورة')); };
    img.src = url;
  });
}

/**
 * قص مركزي لنسبة (aspect) + تصغير لأقصى عرض (maxW) + ضغط.
 * يُرجع { file, dataUrl } — file جاهز للرفع، dataUrl للمعاينة.
 */
export async function cropResize(file, { aspect = 1, maxW = 800, type = 'image/jpeg', quality = 0.85 } = {}) {
  const { img, url } = await fileToImage(file);
  const sw = img.naturalWidth, sh = img.naturalHeight;
  // مستطيل القص المركزي بالنسبة المطلوبة
  let cw = sw, ch = Math.round(sw / aspect);
  if (ch > sh) { ch = sh; cw = Math.round(sh * aspect); }
  const sx = Math.round((sw - cw) / 2), sy = Math.round((sh - ch) / 2);
  // أبعاد الإخراج
  const dw = Math.min(maxW, cw), dh = Math.round(dw / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = dw; canvas.height = dh;
  canvas.getContext('2d').drawImage(img, sx, sy, cw, ch, 0, 0, dw, dh);
  URL.revokeObjectURL(url);
  const blob = await new Promise((res) => canvas.toBlob(res, type, quality));
  const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
  const out = new File([blob], `${baseName}.jpg`, { type });
  return { file: out, dataUrl: canvas.toDataURL(type, quality) };
}
