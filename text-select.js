/* ════════════════════════════════════════════════════════════════
   text-select.js — Double-Click → Select Full Cell Text
   ────────────────────────────────────────────────────────────────
   • عند الدبل كليك على أي خلية/عنصر نصّي يحدّد النص كامله (مش كلمة واحدة)
     عشان النسخ يبقى أسهل في أي جدول (table أو صفوف div).
   • يعمل على كل الصفحات بدون أي تعديل في HTML غير سطر <script> واحد.
   • يتجاهل عناصر الإدخال/الأزرار/الروابط عشان ميكسرش سلوكها الطبيعي.
   • يعمل كـ Classic Script (IIFE) — نفس نمط theme.js.
   ════════════════════════════════════════════════════════════════ */

(function(){
  'use strict';

  // عناصر تفاعلية نسيبها بسلوكها الافتراضي (الدبل كليك العادي بيختار كلمة جواها)
  const SKIP_TAGS = /^(INPUT|TEXTAREA|SELECT|BUTTON|OPTION|A|LABEL|IMG|SVG|VIDEO|AUDIO|CANVAS)$/;

  function selectText(e){
    const el = e.target;
    if (!el || el.nodeType !== 1) return;            // عنصر فقط
    if (SKIP_TAGS.test(el.tagName)) return;          // تفاعلي → سيبه
    if (el.isContentEditable) return;                // قابل للتحرير → سيبه
    if (el.closest('input, textarea, [contenteditable="true"]')) return;

    const text = (el.textContent || '').trim();
    if (!text) return;                               // مفيش نص → بلاش

    const sel = window.getSelection && window.getSelection();
    if (!sel) return;

    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) { /* تجاهل أي متصفح قديم */ }
  }

  document.addEventListener('dblclick', selectText, true);
})();
