/**
 * features/design/views/gallery-view.js
 *
 * Tab "المعرض" — يعرض gallery collection (isVisible=true).
 * يحل محل gallery.html.
 */

import { subscribeGallery } from '../repository.js';
import { $, escapeHtml, debounce } from '../components/utils.js';
import { galleryCard } from '../components/grid-card.js';
import { openLightbox } from '../components/lightbox.js';

const state = {
  items: [],
  visible: [],
  activeCat: 'all',
  sortMode: 'newest',
  searchTerm: '',
  unsub: null,
};

export function mountGalleryView({ container }) {
  container.innerHTML = `
    <div class="dh-gal-stats" id="dh-gal-stats" style="display:none">
      <div class="dh-stat"><div class="dh-stat-val" id="dh-stat-designs">0</div><div class="dh-stat-lbl">🎨 تصميم</div></div>
      <div class="dh-stat"><div class="dh-stat-val" id="dh-stat-cats">0</div><div class="dh-stat-lbl">📂 تصنيف</div></div>
      <div class="dh-stat"><div class="dh-stat-val" id="dh-stat-designers">0</div><div class="dh-stat-lbl">👤 مصمم</div></div>
    </div>

    <div class="dh-toolbar">
      <input type="text" class="dh-search" id="dh-gal-search" placeholder="🔍 بحث في المعرض…">
      <button class="dh-sort-btn" id="dh-gal-sort-btn"><span id="dh-gal-sort-ico">🆕</span> <span id="dh-gal-sort-lbl">الأحدث</span></button>
    </div>

    <div class="dh-chips" id="dh-gal-cats">
      <button class="dh-chip active" data-cat="all">كل التصاميم</button>
    </div>

    <div class="dh-count" id="dh-gal-count">0 تصميم</div>

    <div class="dh-grid" id="dh-gal-grid"></div>
    <div class="dh-empty" id="dh-gal-empty" style="display:none">
      <div class="dh-empty-ico">🖼️</div>
      <div>لا توجد تصاميم في المعرض بعد</div>
    </div>
    <div class="dh-loader" id="dh-gal-loader"><div class="dh-spinner"></div></div>
  `;

  $('dh-gal-search').addEventListener('input', debounce(() => {
    state.searchTerm = ($('dh-gal-search').value || '').toLowerCase().trim();
    render();
  }, 200));

  $('dh-gal-sort-btn').addEventListener('click', toggleSort);

  $('dh-gal-cats').addEventListener('click', (e) => {
    const btn = e.target.closest('.dh-chip');
    if (!btn) return;
    state.activeCat = btn.dataset.cat;
    document.querySelectorAll('#dh-gal-cats .dh-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });

  $('dh-gal-grid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-action="open-lightbox"]');
    if (!card) return;
    const idx = parseInt(card.dataset.idx, 10);
    if (!isNaN(idx)) {
      openLightbox(state.visible.map(toLightboxItem), idx);
    }
  });

  state.unsub = subscribeGallery({
    visibleOnly: true,
    onUpdate: (items) => {
      state.items = items;
      $('dh-gal-loader').style.display = 'none';
      if (!items.length) {
        $('dh-gal-empty').style.display = 'block';
        $('dh-gal-stats').style.display = 'none';
        return;
      }
      $('dh-gal-empty').style.display = 'none';
      updateStats();
      buildCategoryFilters();
      render();
    },
    onError: (err) => {
      console.error('[gallery-view] error:', err);
      $('dh-gal-loader').style.display = 'none';
      $('dh-gal-empty').style.display = 'block';
      $('dh-gal-empty').innerHTML = `<div class="dh-empty-ico">⚠️</div><div>تعذّر تحميل المعرض</div><div style="font-size:12px;opacity:.6">${escapeHtml(err.message || '')}</div>`;
    },
  });
}

export function unmountGalleryView() {
  if (state.unsub) state.unsub();
  state.unsub = null;
}

function updateStats() {
  const cats = new Set(state.items.map(i => i.productType).filter(Boolean));
  const designers = new Set(state.items.map(i => i.publishedByName || i.designerName).filter(Boolean));
  $('dh-stat-designs').textContent = state.items.length;
  $('dh-stat-cats').textContent = cats.size;
  $('dh-stat-designers').textContent = designers.size;
  $('dh-gal-stats').style.display = 'flex';
}

function buildCategoryFilters() {
  const counts = {};
  state.items.forEach(i => {
    const c = i.productType || 'بدون تصنيف';
    counts[c] = (counts[c] || 0) + 1;
  });
  const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const cfEl = $('dh-gal-cats');
  cfEl.innerHTML = `<button class="dh-chip ${state.activeCat === 'all' ? 'active' : ''}" data-cat="all">كل التصاميم <span class="dh-chip-count">${state.items.length}</span></button>`;
  for (const cat of cats) {
    cfEl.insertAdjacentHTML('beforeend',
      `<button class="dh-chip ${state.activeCat === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)} <span class="dh-chip-count">${counts[cat]}</span></button>`);
  }
}

function toggleSort() {
  const order = ['newest', 'oldest', 'name'];
  const labels = {
    newest: ['🆕', 'الأحدث'],
    oldest: ['📅', 'الأقدم'],
    name: ['🔤', 'الاسم'],
  };
  state.sortMode = order[(order.indexOf(state.sortMode) + 1) % order.length];
  $('dh-gal-sort-ico').textContent = labels[state.sortMode][0];
  $('dh-gal-sort-lbl').textContent = labels[state.sortMode][1];
  render();
}

function sortItems(items) {
  const sorted = [...items];
  if (state.sortMode === 'newest') {
    sorted.sort((a, b) => (b.publishedAt?.seconds || 0) - (a.publishedAt?.seconds || 0));
  } else if (state.sortMode === 'oldest') {
    sorted.sort((a, b) => (a.publishedAt?.seconds || 0) - (b.publishedAt?.seconds || 0));
  } else if (state.sortMode === 'name') {
    sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ar'));
  }
  return sorted;
}

function render() {
  let items = state.items;
  if (state.activeCat !== 'all') {
    items = items.filter(i => (i.productType || 'بدون تصنيف') === state.activeCat);
  }
  if (state.searchTerm) {
    items = items.filter(i => {
      const hay = [i.title || '', i.productType || '', i.designerName || '', i.publishedByName || '', i.description || ''].join(' ').toLowerCase();
      return hay.includes(state.searchTerm);
    });
  }
  items = sortItems(items);
  state.visible = items;

  $('dh-gal-count').textContent = `${items.length} تصميم`;

  const grid = $('dh-gal-grid');
  if (!items.length) {
    grid.innerHTML = '';
    $('dh-gal-empty').style.display = 'block';
    return;
  }
  $('dh-gal-empty').style.display = 'none';
  grid.innerHTML = items.map((item, idx) => galleryCard(item, idx)).join('');
}

function toLightboxItem(item) {
  const cat = item.productType || 'تصميم';
  const designer = item.publishedByName || item.designerName || '';
  const metaParts = [`<b>${escapeHtml(cat)}</b>`];
  if (designer) metaParts.push(`🎨 ${escapeHtml(designer)}`);
  return {
    imageUrl: item.imageUrl || '',
    title: item.title || cat,
    meta: metaParts.join(' · '),
    description: item.description || '',
  };
}
