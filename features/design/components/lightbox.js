/**
 * features/design/components/lightbox.js
 *
 * Lightbox موحَّد — يحل محل التكرار بين gallery.html و design-workspace.html.
 * يدعم: keyboard navigation (Esc + Arrow keys with RTL flip)، prev/next buttons.
 *
 * الاستخدام:
 *   import { mountLightbox, openLightbox } from './components/lightbox.js';
 *   mountLightbox(); // مرة واحدة عند bootstrap
 *   openLightbox(items, 0); // items: [{ imageUrl, title, meta, description }]
 */

import { escapeHtml, escapeAttr, $ } from './utils.js';

let _items = [];
let _index = 0;
let _mounted = false;

const HTML = `
<div class="dh-lightbox" id="dh-lightbox" onclick="if(event.target===this)window._dhCloseLightbox()">
  <div class="dh-lb-inner">
    <button type="button" class="dh-lb-close" onclick="window._dhCloseLightbox()" aria-label="إغلاق">×</button>
    <button type="button" class="dh-lb-nav prev" onclick="window._dhNavLightbox(-1)" aria-label="السابق">‹</button>
    <button type="button" class="dh-lb-nav next" onclick="window._dhNavLightbox(1)" aria-label="التالي">›</button>
    <img class="dh-lb-img" id="dh-lb-img" alt="">
    <div class="dh-lb-info">
      <div class="dh-lb-title" id="dh-lb-title"></div>
      <div class="dh-lb-meta" id="dh-lb-meta"></div>
      <div class="dh-lb-desc" id="dh-lb-desc"></div>
      <div class="dh-lb-counter" id="dh-lb-counter"></div>
    </div>
  </div>
</div>`;

const CSS = `
.dh-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;z-index:10000;padding:var(--space-xl);backdrop-filter:blur(8px)}
.dh-lightbox.open{display:flex}
.dh-lb-inner{position:relative;max-width:1200px;width:100%;max-height:90vh;display:flex;flex-direction:column;align-items:center;gap:14px}
.dh-lb-img{max-width:100%;max-height:75vh;border-radius:8px;object-fit:contain;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.dh-lb-info{text-align:center;color:#fff;max-width:720px}
.dh-lb-title{font-size:var(--fs-2xl);font-weight:var(--fw-bold);margin-bottom:6px}
.dh-lb-meta{font-size:var(--fs-md);opacity:.8;margin-bottom:8px}
.dh-lb-desc{font-size:var(--fs-lg);opacity:.85;line-height:1.6;margin-bottom:10px}
.dh-lb-counter{font-size:var(--fs-base);opacity:.6}
.dh-lb-close{position:absolute;top:-14px;right:-14px;width:42px;height:42px;border-radius:50%;border:none;background:#fff;color:#000;font-size:var(--fs-3xl);font-weight:var(--fw-bold);cursor:pointer;line-height:1;box-shadow:0 4px 12px rgba(0,0,0,.4)}
.dh-lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:32px;cursor:pointer;line-height:1;transition:background .2s}
.dh-lb-nav:hover:not(:disabled){background:rgba(255,255,255,.3)}
.dh-lb-nav:disabled{opacity:.3;cursor:not-allowed}
.dh-lb-nav.prev{right:-60px}
.dh-lb-nav.next{left:-60px}
@media(max-width:768px){
  .dh-lb-nav.prev{right:8px}.dh-lb-nav.next{left:8px}
  .dh-lb-close{top:8px;right:8px}
}
`;

export function mountLightbox() {
  if (_mounted) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const wrap = document.createElement('div');
  wrap.innerHTML = HTML;
  document.body.appendChild(wrap.firstElementChild);
  document.addEventListener('keydown', _onKey);
  window._dhCloseLightbox = closeLightbox;
  window._dhNavLightbox = navLightbox;
  _mounted = true;
}

export function openLightbox(items, startIndex = 0) {
  if (!_mounted) mountLightbox();
  if (!Array.isArray(items) || !items.length) return;
  _items = items;
  _index = Math.max(0, Math.min(startIndex, items.length - 1));
  _render();
  $('dh-lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeLightbox() {
  $('dh-lightbox')?.classList.remove('open');
  document.body.style.overflow = '';
}

export function navLightbox(dir) {
  const next = _index + dir;
  if (next < 0 || next >= _items.length) return;
  _index = next;
  _render();
}

function _render() {
  const item = _items[_index];
  if (!item) return;
  $('dh-lb-img').src = item.imageUrl || '';
  $('dh-lb-img').alt = item.title || '';
  $('dh-lb-title').textContent = item.title || '';
  $('dh-lb-meta').innerHTML = item.meta || '';
  const desc = $('dh-lb-desc');
  desc.textContent = item.description || '';
  desc.style.display = item.description ? '' : 'none';
  $('dh-lb-counter').textContent = `${_index + 1} / ${_items.length}`;
  document.querySelector('.dh-lb-nav.prev').disabled = _index === 0;
  document.querySelector('.dh-lb-nav.next').disabled = _index === _items.length - 1;
}

function _onKey(e) {
  const open = $('dh-lightbox')?.classList.contains('open');
  if (!open) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') navLightbox(1);   // RTL flip
  else if (e.key === 'ArrowRight') navLightbox(-1); // RTL flip
}
