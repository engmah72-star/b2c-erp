/**
 * UI · Avatar — صورة/حرف. عرض نقي. (STANDARDS §4)
 * props: { src, initial, size: md|sm|lg }
 */
import { escapeHtml } from '../utils/dom.js';

export function Avatar({ src = '', initial = '', size = 'md' } = {}) {
  const cls = 'cp-avatar' + (size === 'sm' ? ' cp-avatar--sm' : size === 'lg' ? ' cp-avatar--lg' : '');
  const inner = src
    ? `<img src="${escapeHtml(src)}" alt="">`
    : escapeHtml((initial || '?').trim().slice(0, 1).toUpperCase());
  return `<span class="${cls}" aria-hidden="true">${inner}</span>`;
}
