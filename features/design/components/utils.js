/**
 * features/design/components/utils.js
 *
 * Utilities مشتركة بين الـ 3 tabs.
 * يحل محل التكرار الثلاثي لـ escapeHtml + toast + dom helpers.
 */

export const $ = (id) => document.getElementById(id);

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

export const escapeAttr = escapeHtml;

export const fn = (n) => Number(n || 0).toLocaleString('en-US');

export const setText = (id, txt) => {
  const el = $(id);
  if (el) el.textContent = txt;
};

export function toast(msg, kind = '') {
  const container = $('toasts') || _ensureToastsContainer();
  const t = document.createElement('div');
  t.className = 'toast ' + (kind === 'err' ? 'err' : kind === 'ok' ? 'ok' : '');
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function _ensureToastsContainer() {
  const c = document.createElement('div');
  c.id = 'toasts';
  c.style.cssText = 'position:fixed;top:80px;left:20px;z-index:9999;display:flex;flex-direction:column;gap:var(--space-sm)';
  document.body.appendChild(c);
  return c;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function formatDate(ts) {
  if (!ts) return '';
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Read latest version + files from a design_item (نمط مشترك)
export function getLatestVersion(item) {
  return (item?.versions || []).slice().sort((a, b) => (b.vNum || 0) - (a.vNum || 0))[0] || null;
}

export function getItemFiles(item) {
  const v = getLatestVersion(item);
  if (!v) return { mockup: null, pdf: null, source: null };
  const f = v.files || {};
  return {
    mockup: f.mockup || (v.imageUrl ? { url: v.imageUrl, fileName: v.fileName || '' } : null),
    pdf: f.pdf || null,
    source: f.source || null,
  };
}

export function getItemThumb(item) {
  const f = getItemFiles(item);
  return f.mockup?.url || '';
}
