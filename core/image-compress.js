/**
 * core/image-compress.js
 *
 * ضغط/تصغير صورة client-side قبل الرفع (canvas) — يقلّل زمن التحميل وتكلفة
 * التخزين/الـ bandwidth لصور المعرض (تُعرض على الويب/الموبايل، لا تحتاج دقّة
 * الطباعة). يُطبَّق على مسار رفع المعرض الموحّد (uploadGalleryFile).
 *
 * مبادئ E1: incremental · reversible · fail-safe. عند أي تعذّر (متصفّح لا يدعم،
 * صيغة متجهة/متحرّكة، خطأ canvas، أو نتيجة أكبر) → يُرجع الملف الأصلي كما هو،
 * فلا يكسر الرفع أبداً. كِل سويتش: localStorage feat.imgCompress='0'.
 */

/** هل التصغير مُعطَّل عبر kill-switch؟ */
function _disabled() {
  try {
    const qs = new URLSearchParams(location.search || '');
    return (qs.get('feat.imgCompress') || localStorage.getItem('feat.imgCompress')) === '0';
  } catch (_) { return false; }
}

/**
 * يضغط صورة إلى أقصى بُعد + جودة محدّدين.
 * @param {File} file
 * @param {Object} [opts]
 * @param {number} [opts.maxDim=1600]   أقصى عرض/ارتفاع (px).
 * @param {number} [opts.quality=0.85]  جودة الضغط (0-1).
 * @param {string} [opts.mime='image/webp'] صيغة الهدف (fallback تلقائي لـ jpeg).
 * @returns {Promise<File>} ملف مضغوط، أو الأصل لو تعذّر/لا فائدة.
 */
export async function compressImage(file, { maxDim = 1600, quality = 0.85, mime = 'image/webp' } = {}) {
  try {
    if (_disabled()) return file;
    if (!file || !(file.type || '').startsWith('image/')) return file;
    // الصيغ المتجهة/المتحرّكة لا تُضغط عبر canvas (SVG vector · GIF قد يكون متحرّكاً).
    if (/svg|gif/i.test(file.type)) return file;
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;

    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;

    const { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width || 1, height || 1));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close && bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close && bitmap.close();

    const toBlob = (m) => new Promise((res) => canvas.toBlob(res, m, quality));
    let outMime = mime;
    let blob = await toBlob(outMime);
    // بعض المتصفّحات (Safari قديم) لا تدعم webp في toBlob → null → نجرّب jpeg.
    if (!blob && outMime !== 'image/jpeg') { outMime = 'image/jpeg'; blob = await toBlob(outMime); }
    if (!blob) return file;

    // لا تستبدل لو ما في فائدة (النتيجة ليست أصغر ولا حصل تصغير أبعاد).
    if (blob.size >= file.size && scale === 1) return file;

    const ext = outMime === 'image/webp' ? 'webp' : 'jpg';
    const base = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}.${ext}`, { type: outMime, lastModified: Date.now() });
  } catch (_) {
    return file; // fail-safe مطلق: الأصل
  }
}
