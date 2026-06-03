/**
 * UTILS LAYER · qr — توليد QR + تنزيله PNG. (STANDARDS §6)
 * يستخدم خدمة QR (نفس المستخدمة في card.html) · تنزيل عبر fetch→blob مع fallback.
 */

/** رابط صورة QR لبيانات (data) بحجم مربّع. */
export const qrSrc = (data, size = 300) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(data)}`;

/** ينزّل QR كـ PNG (يعود لفتح الصورة لو منع CORS). */
export async function downloadQR(data, filename = 'qr.png') {
  const url = qrSrc(data, 600);
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    return true;
  } catch (_) {
    window.open(url, '_blank', 'noopener');
    return false;
  }
}
