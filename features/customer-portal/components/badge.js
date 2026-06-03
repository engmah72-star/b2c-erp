/**
 * UI · Badge — شارة حالة/وسم. عرض نقي. الألوان من Theme. (STANDARDS §4)
 * props: { text, tone: neutral|ok|danger|design|printing|production|shipping|archived|cancelled }
 */
import { escapeHtml } from '../utils/dom.js';

export function Badge({ text = '', tone = 'neutral' } = {}) {
  const cls = 'cp-badge' + (tone && tone !== 'neutral' ? ` cp-badge--${escapeHtml(tone)}` : '');
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}
