/**
 * LAYOUT · Navigation — شريط تنقّل أساسي موحّد. عرض نقي. (STANDARDS §4, §7)
 * لا منطق · يبلّغ النية عبر data-nav-key (delegation في app-shell).
 * A11y: role=tablist + aria-selected.
 *
 * props: { tabs:[{key,icon,label}], activeKey }
 */
import { escapeHtml } from '../utils/dom.js';

export function Nav({ tabs = [], activeKey = '' } = {}) {
  const items = tabs.map((t) => `
    <button class="cp-nav__item" type="button" role="tab"
            data-nav-key="${escapeHtml(t.key)}"
            aria-selected="${t.key === activeKey ? 'true' : 'false'}"
            aria-label="${escapeHtml(t.label)}">
      <span class="cp-nav__icon" aria-hidden="true">${escapeHtml(t.icon || '')}</span>
      <span>${escapeHtml(t.label)}</span>
    </button>`).join('');

  return `<nav class="cp-nav" role="tablist" aria-label="التنقّل الرئيسي">${items}</nav>`;
}

/** يحدّث التبويب النشط بصرياً دون إعادة بناء (أداء · STANDARDS §9). */
export function setActiveNav(root, key) {
  root.querySelectorAll('.cp-nav__item').forEach((b) => {
    b.setAttribute('aria-selected', b.dataset.navKey === key ? 'true' : 'false');
  });
}
