/**
 * UI · Button — زر قابل لإعادة الاستخدام. عرض نقي. (STANDARDS §4)
 * props: { label, variant: primary|ghost|wa|danger, size: md|sm, icon,
 *          action, type, block, disabled, loading }
 * يبلّغ النية عبر data-action (delegation في الـ View).
 */
import { escapeHtml } from '../utils/dom.js';

export function Button({
  label = '', variant = 'primary', size = 'md', icon = '',
  action = '', type = 'button', block = true, disabled = false, loading = false,
} = {}) {
  const cls = ['cp-btn', `cp-btn--${variant}`];
  if (size === 'sm') cls.push('cp-btn--sm');
  if (block) cls.push('cp-btn--block');
  if (loading) cls.push('is-loading');
  const attrs = [
    `type="${escapeHtml(type)}"`,
    `class="${cls.join(' ')}"`,
    action ? `data-action="${escapeHtml(action)}"` : '',
    disabled ? 'disabled' : '',
    loading ? 'aria-busy="true"' : '',
  ].filter(Boolean).join(' ');
  const ic = icon ? `<span aria-hidden="true">${escapeHtml(icon)}</span>` : '';
  return `<button ${attrs}>${ic}${escapeHtml(label)}</button>`;
}
