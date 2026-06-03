/**
 * UI · Input — حقل إدخال (نص/إيميل/هاتف/textarea). عرض نقي + A11y. (STANDARDS §4, §7)
 * props: { id, label, type, value, placeholder, required, error, hint, dir, readonly }
 */
import { escapeHtml } from '../utils/dom.js';

export function Input({
  id = '', label = '', type = 'text', value = '', placeholder = '',
  required = false, error = '', hint = '', dir = '', readonly = false,
} = {}) {
  const common = [
    'class="cp-input"', `id="${escapeHtml(id)}"`,
    dir ? `dir="${escapeHtml(dir)}"` : '',
    placeholder ? `placeholder="${escapeHtml(placeholder)}"` : '',
    required ? 'aria-required="true"' : '',
    readonly ? 'readonly' : '',
  ].filter(Boolean).join(' ');

  const control = type === 'textarea'
    ? `<textarea ${common}>${escapeHtml(value)}</textarea>`
    : `<input ${common} type="${escapeHtml(type)}" value="${escapeHtml(value)}">`;

  return `<div class="cp-field${error ? ' cp-field--error' : ''}">
    ${label ? `<label class="cp-field__label" for="${escapeHtml(id)}">${escapeHtml(label)}${required ? ' <span class="cp-field__req">*</span>' : ''}</label>` : ''}
    ${control}
    ${error ? `<div class="cp-field__error" role="alert">${escapeHtml(error)}</div>` : ''}
    ${hint && !error ? `<div class="cp-field__hint">${escapeHtml(hint)}</div>` : ''}
  </div>`;
}
