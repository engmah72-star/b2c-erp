/**
 * UI · Chip / Chips — فلتر قابل للتبديل. عرض نقي + A11y (aria-pressed). (STANDARDS §4, §7)
 * يبلّغ النية عبر data-chip (delegation في الـ View).
 */
import { escapeHtml } from '../utils/dom.js';

export function Chip({ label = '', value = '', active = false } = {}) {
  return `<button type="button" class="cp-chip" data-chip="${escapeHtml(value)}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
}

export function Chips(items = [], activeValue = '') {
  const inner = items.map((i) => Chip({ label: i.label, value: i.value, active: i.value === activeValue })).join('');
  return `<div class="cp-chips" role="group" aria-label="فلترة">${inner}</div>`;
}
