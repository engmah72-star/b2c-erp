/**
 * UTILS LAYER · dom — مساعدات DOM نقية بلا حالة. (STANDARDS §3, §6)
 * لا fetch · لا منطق أعمال · لا قيم بصرية.
 */

/** يهرّب نصاً ليُحقن بأمان داخل HTML (يمنع injection). */
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

/** ينشئ عنصراً مع سمات وأبناء (children: نص HTML أو عُقد). */
export function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  if (html) node.innerHTML = html;
  return node;
}

/** اختصار querySelector داخل جذر. */
export const qs = (sel, root = document) => root.querySelector(sel);

/**
 * Event delegation — يربط حدثاً واحداً على الحاوية ويطابق المُحدِّد.
 * (STANDARDS §6: addEventListener + delegation، ممنوع onclick مضمّن)
 */
export function delegate(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const match = e.target.closest(selector);
    if (match && root.contains(match)) handler(match, e);
  });
}
