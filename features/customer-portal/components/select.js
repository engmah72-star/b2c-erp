/**
 * UI · Select — قائمة منسدلة. عرض نقي + A11y. (STANDARDS §4, §7)
 * props: { id, label, options:[{value,label}], value, required }
 */
import { escapeHtml } from '../utils/dom.js';

export function Select({ id = '', label = '', options = [], value = '', required = false } = {}) {
  const opts = options.map((o) =>
    `<option value="${escapeHtml(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('');
  return `<div class="cp-field">
    ${label ? `<label class="cp-field__label" for="${escapeHtml(id)}">${escapeHtml(label)}${required ? ' <span class="cp-field__req">*</span>' : ''}</label>` : ''}
    <select class="cp-input" id="${escapeHtml(id)}"${required ? ' aria-required="true"' : ''}>${opts}</select>
  </div>`;
}
