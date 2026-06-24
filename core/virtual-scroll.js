/**
 * core/virtual-scroll.js — Virtual scrolling for large lists
 *
 * Renders only visible items + buffer, recycling DOM on scroll.
 * Replaces the .slice(0,N).map().join('') pattern with smooth
 * scrolling through the full dataset.
 *
 * Usage:
 *   const vl = new VirtualList({
 *     container: document.getElementById('list'),
 *     rowHeight: 72,
 *     renderRow: (item, idx) => `<div class="ocard">...</div>`,
 *     buffer: 5
 *   });
 *   vl.update(items);  // call whenever data changes
 */

export class VirtualList {
  constructor({ container, rowHeight, renderRow, buffer = 5, emptyHtml = '' }) {
    this._container = container;
    this._rowHeight = rowHeight;
    this._renderRow = renderRow;
    this._buffer = buffer;
    this._emptyHtml = emptyHtml;
    this._data = [];
    this._startIdx = -1;
    this._endIdx = -1;

    this._viewport = document.createElement('div');
    this._viewport.style.cssText = 'overflow-y:auto;-webkit-overflow-scrolling:touch;height:100%';
    this._spacer = document.createElement('div');
    this._spacer.style.cssText = 'position:relative;width:100%';
    this._content = document.createElement('div');
    this._content.style.cssText = 'position:absolute;left:0;right:0';

    this._spacer.appendChild(this._content);
    this._viewport.appendChild(this._spacer);
    container.innerHTML = '';
    container.appendChild(this._viewport);

    this._scrollRaf = null;
    this._viewport.addEventListener('scroll', () => {
      if (this._scrollRaf) return;
      this._scrollRaf = requestAnimationFrame(() => {
        this._scrollRaf = null;
        this._render();
      });
    }, { passive: true });
  }

  update(data) {
    this._data = data || [];
    this._startIdx = -1;
    this._endIdx = -1;
    this._spacer.style.height = (this._data.length * this._rowHeight) + 'px';
    if (!this._data.length && this._emptyHtml) {
      this._content.style.transform = '';
      this._content.innerHTML = this._emptyHtml;
      return;
    }
    this._render();
  }

  _render() {
    const scrollTop = this._viewport.scrollTop;
    const viewportH = this._viewport.clientHeight;
    if (!viewportH || !this._data.length) return;

    const start = Math.max(0, Math.floor(scrollTop / this._rowHeight) - this._buffer);
    const visible = Math.ceil(viewportH / this._rowHeight);
    const end = Math.min(this._data.length, start + visible + this._buffer * 2);

    if (start === this._startIdx && end === this._endIdx) return;
    this._startIdx = start;
    this._endIdx = end;

    let html = '';
    for (let i = start; i < end; i++) {
      html += this._renderRow(this._data[i], i);
    }
    this._content.innerHTML = html;
    this._content.style.transform = `translateY(${start * this._rowHeight}px)`;
  }

  scrollToTop() {
    this._viewport.scrollTop = 0;
  }

  destroy() {
    this._data = [];
    if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf);
    this._container.innerHTML = '';
  }
}
