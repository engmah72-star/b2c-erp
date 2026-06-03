/**
 * UI · Card — حاوية محتوى. عرض نقي. (STANDARDS §4)
 * props: { body(HTML موثوق من مكوّنات أخرى), interactive, action, dataset:{} }
 * ملاحظة: body يُمرَّر مُركَّباً من مكوّنات (مهرّبة مسبقاً) — لا يُهرَّب هنا.
 */
import { escapeHtml } from '../utils/dom.js';

export function Card({ body = '', interactive = false, action = '', dataset = {} } = {}) {
  const cls = 'cp-card' + (interactive ? ' cp-card--interactive' : '');
  const data = Object.entries(dataset)
    .map(([k, v]) => `data-${escapeHtml(k)}="${escapeHtml(v)}"`).join(' ');
  const attrs = [
    `class="${cls}"`,
    action ? `data-action="${escapeHtml(action)}"` : '',
    data,
  ].filter(Boolean).join(' ');
  return `<div ${attrs}>${body}</div>`;
}
