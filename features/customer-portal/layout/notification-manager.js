/**
 * LAYOUT · NotificationManager — مصدر موحّد لكل التنبيهات (Toasts).
 * غير معطّل · مكدّس · A11y (aria-live). لا منطق أعمال. (STANDARDS §4, §7)
 *
 * createNotificationManager(mountRoot) → { notify(message, type?, duration?), region }
 *   type: '' | 'ok' | 'err'
 */
import { el } from '../utils/dom.js';

export function createNotificationManager(mountRoot) {
  const region = el('div', { class: 'cp-toasts', role: 'status', 'aria-live': 'polite' });
  mountRoot.appendChild(region);

  function notify(message, type = '', duration = 2600) {
    const toast = el('div', { class: `cp-toast${type ? ' cp-toast--' + type : ''}` });
    toast.textContent = String(message ?? '');
    region.appendChild(toast);
    const t = setTimeout(() => {
      toast.classList.add('is-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
    toast.addEventListener('click', () => { clearTimeout(t); toast.remove(); });
    return toast;
  }

  return { notify, region };
}
