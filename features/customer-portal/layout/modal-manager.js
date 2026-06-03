/**
 * LAYOUT · ModalManager — يدير طبقة Overlay واحدة موحّدة لكل الشاشات.
 * فتح/إغلاق/تكديس · A11y (aria-modal · ESC · استرجاع التركيز). لا منطق أعمال.
 * (STANDARDS §4, §7)
 *
 * createModalManager(mountRoot) → { open({title, content, onClose}), close(), isOpen() }
 *   content: نص HTML أو عقدة DOM (محتوى محايد — تحقنه الـ Views لاحقاً)
 */
import { el, qs } from '../utils/dom.js';

export function createModalManager(mountRoot) {
  const overlay = el('div', {
    class: 'cp-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-hidden': 'true',
  }, `
    <div class="cp-overlay__head">
      <button class="cp-overlay__back" type="button" data-role="overlay-back" aria-label="رجوع">→</button>
      <h2 class="cp-overlay__title" data-role="overlay-title"></h2>
    </div>
    <div class="cp-overlay__body" data-role="overlay-body"></div>
  `);
  mountRoot.appendChild(overlay);

  const titleEl = qs('[data-role="overlay-title"]', overlay);
  const bodyEl = qs('[data-role="overlay-body"]', overlay);
  const stack = [];           // دعم التكديس (overlay فوق overlay منطقياً)
  let lastFocused = null;

  function render(top) {
    titleEl.textContent = top?.title || '';
    bodyEl.replaceChildren();
    if (top?.content instanceof Node) bodyEl.appendChild(top.content);
    else bodyEl.innerHTML = top?.content || '';
  }

  function open({ title = '', content = '', onClose = null } = {}) {
    if (!stack.length) lastFocused = document.activeElement;
    stack.push({ title, content, onClose });
    render(stack[stack.length - 1]);
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    qs('[data-role="overlay-back"]', overlay).focus();
  }

  function close() {
    const top = stack.pop();
    if (top?.onClose) { try { top.onClose(); } catch (_) {} }
    if (stack.length) { render(stack[stack.length - 1]); return; }
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  // الإغلاق: زر الرجوع + مفتاح ESC (A11y)
  qs('[data-role="overlay-back"]', overlay).addEventListener('click', close);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return { open, close, isOpen: () => stack.length > 0, body: bodyEl };
}
