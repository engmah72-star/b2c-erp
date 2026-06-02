/* ════════════════════════════════════════════════════════════════
   text-select.js — Double-Click → Select Full Cell Text
   ────────────────────────────────────────────────────────────────
   • عند الدبل كليك على أي خلية/عنصر نصّي يحدّد النص كامله (مش كلمة واحدة)
     عشان النسخ يبقى أسهل في أي جدول (table أو صفوف div).
   • يعمل على كل الصفحات بدون أي تعديل في HTML غير سطر <script type="module"> واحد.
   • يتجاهل عناصر الإدخال/الأزرار/الروابط عشان ميكسرش سلوكها الطبيعي.
   • ES Module: يصدّر المنطق النقي للاختبار + يربط الـ listener عند توفّر DOM.
   ════════════════════════════════════════════════════════════════ */

// عناصر تفاعلية نسيبها بسلوكها الافتراضي (الدبل كليك العادي بيختار كلمة جواها)
const SKIP_TAGS = /^(INPUT|TEXTAREA|SELECT|BUTTON|OPTION|A|LABEL|IMG|SVG|VIDEO|AUDIO|CANVAS)$/;

/**
 * هل نعمل select لنص العنصر ده عند الدبل كليك؟ (دالة نقية — قابلة للاختبار)
 * @param {{nodeType?:number, tagName?:string, isContentEditable?:boolean,
 *          closest?:Function, textContent?:string}} el
 * @returns {boolean}
 */
export function shouldSelectElement(el) {
  if (!el || el.nodeType !== 1) return false;            // عنصر فقط
  if (SKIP_TAGS.test(el.tagName || '')) return false;    // تفاعلي → سيبه
  if (el.isContentEditable) return false;                // قابل للتحرير → سيبه
  if (typeof el.closest === 'function' &&
      el.closest('input, textarea, [contenteditable="true"]')) return false;
  if (!(el.textContent || '').trim()) return false;      // مفيش نص → بلاش
  return true;
}

/** يحدّد نص العنصر كامله (يحتاج DOM فعلي). */
export function selectElementText(el) {
  const sel = typeof window !== 'undefined' && window.getSelection && window.getSelection();
  if (!sel || typeof document === 'undefined') return;
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) { /* تجاهل أي متصفح قديم */ }
}

/** handler الـ dblclick. */
export function handleDblClick(e) {
  const el = e && e.target;
  if (!shouldSelectElement(el)) return;
  selectElementText(el);
}

// ── الربط بالـ DOM (يتخطّى في بيئة node/الاختبار) ──
if (typeof document !== 'undefined') {
  document.addEventListener('dblclick', handleDblClick, true);
}
