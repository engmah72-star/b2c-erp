/**
 * UI · EmptyState — حالة فارغة موحّدة + CTA اختياري. عرض نقي. (STANDARDS §4)
 * props: { icon, title, hint, action(HTML زر موثوق) }
 */
import { escapeHtml } from '../utils/dom.js';

export function EmptyState({ icon = '📭', title = '', hint = '', action = '' } = {}) {
  return `<div class="cp-empty">
    <span class="cp-empty__icon" aria-hidden="true">${escapeHtml(icon)}</span>
    ${title ? `<div class="cp-empty__title">${escapeHtml(title)}</div>` : ''}
    ${hint ? `<div>${escapeHtml(hint)}</div>` : ''}
    ${action ? `<div class="cp-empty__action">${action}</div>` : ''}
  </div>`;
}
