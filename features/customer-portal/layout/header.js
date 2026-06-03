/**
 * LAYOUT · Header — رأس ثابت موحّد لكل الشاشات. عرض نقي. (STANDARDS §4)
 * لا بيانات · لا منطق · الأفعال تُبلَّغ عبر data-action (delegation في app-shell).
 *
 * props: { brand:{icon,title,sub}, actions:[{key,icon,label}] }
 */
import { escapeHtml } from '../utils/dom.js';

export function Header({ brand = {}, actions = [] } = {}) {
  const acts = actions.map((a) => `
    <button class="cp-header__action" type="button"
            data-action="${escapeHtml(a.key)}" aria-label="${escapeHtml(a.label || a.key)}">
      ${escapeHtml(a.icon || '')}
    </button>`).join('');

  return `
    <header class="cp-header">
      <div class="cp-header__brand">
        <div class="cp-header__logo" aria-hidden="true">${escapeHtml(brand.icon || '🎨')}</div>
        <div class="cp-header__titles">
          <b class="cp-header__title" data-role="header-title">${escapeHtml(brand.title || '')}</b>
          <span class="cp-header__sub" data-role="header-sub">${escapeHtml(brand.sub || '')}</span>
        </div>
      </div>
      <div class="cp-header__actions">${acts}</div>
    </header>`;
}
