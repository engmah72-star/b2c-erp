/**
 * features/gallery/views/grid-view.js
 *
 * عرض المعرض (view فقط — L1): شبكة + فلاتر تصنيف + lightbox + لوحة رفع للمصمم.
 * كل كتابة عبر gallery.service (لا writes هنا).
 */

import { subscribeGallery } from '../repository.js';
import * as svc from '../services/gallery.service.js';
import {
  deriveCategories, sortForDisplay, validateGalleryInput, isGalleryImage,
} from '../model.js';
import {
  canPublishGallery, canToggleVisibility, canCurateGallery, canDeleteGalleryItem,
} from '../permissions.js';

const ALL = '__all__';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function toast(msg, type = '') {
  const c = document.getElementById('toasts');
  if (!c) { console.log('[toast]', msg); return; }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function mountGalleryView({ container, user, userDoc }) {
  const role = userDoc?.role || null;
  const uid = user?.uid || null;
  const tenantId = userDoc?.tenantId || null;
  const canManage = canPublishGallery(role);

  let items = [];
  let activeCat = ALL;
  let composing = false;
  let busy = false;

  // العناصر المرئية للمستخدم: المُدير/الرافع يرى المخفي (موسوماً)؛ غيره المرئي فقط.
  const visibleItems = () => {
    const base = canManage ? items : items.filter((i) => i.isVisible !== false);
    const cats = activeCat === ALL ? base : base.filter((i) => (i.productType || i.category || 'عام') === activeCat);
    return sortForDisplay(cats);
  };

  function cardHtml(it) {
    const cat = esc(it.productType || it.category || 'عام');
    const hidden = it.isVisible === false;
    const owner = uid && it.designerId === uid;
    const tags = Array.isArray(it.tags) ? it.tags.slice(0, 4) : [];
    const actions = [];
    if (canCurateGallery(role)) {
      actions.push(`<button type="button" class="g-act ${it.isFeatured ? 'on' : ''}" data-act="feature" data-id="${esc(it.id)}" title="${it.isFeatured ? 'إلغاء التمييز' : 'تمييز'}">⭐</button>`);
    }
    if (canToggleVisibility(role, { uid, item: it })) {
      actions.push(`<button type="button" class="g-act" data-act="vis" data-id="${esc(it.id)}" title="${hidden ? 'إظهار' : 'إخفاء'}">${hidden ? '👁️' : '🙈'}</button>`);
    }
    if (canDeleteGalleryItem(role)) {
      actions.push(`<button type="button" class="g-act danger" data-act="del" data-id="${esc(it.id)}" title="حذف">🗑️</button>`);
    }
    return `<figure class="g-card${hidden ? ' is-hidden' : ''}${it.isFeatured ? ' is-feat' : ''}">
      <div class="g-thumb-wrap">
        <img class="g-thumb" loading="lazy" src="${esc(it.imageUrl)}" alt="${esc(it.title)}" data-act="zoom" data-src="${esc(it.imageUrl)}" data-title="${esc(it.title)}">
        ${it.isFeatured ? '<span class="g-badge g-feat">⭐ مميّز</span>' : ''}
        ${hidden ? '<span class="g-badge g-hid">مخفي</span>' : ''}
        ${actions.length ? `<div class="g-actions">${actions.join('')}</div>` : ''}
      </div>
      <figcaption class="g-cap">
        <div class="g-title">${esc(it.title)}</div>
        <div class="g-meta"><span class="g-cat">${cat}</span>${it.designerName ? `<span class="g-by">· ${esc(it.designerName)}</span>` : ''}</div>
        ${tags.length ? `<div class="g-tags">${tags.map((t) => `<span class="g-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </figcaption>
    </figure>`;
  }

  function composeHtml() {
    if (!canManage || !composing) return '';
    return `<form class="g-compose" id="g-compose">
      <div class="g-compose-row">
        <label class="g-file" id="g-pick">
          <input type="file" id="g-file" accept="image/*" hidden>
          <span id="g-file-label">📷 اختر صورة</span>
        </label>
        <input class="g-input" id="g-title" type="text" placeholder="عنوان التصميم" maxlength="120">
      </div>
      <div class="g-compose-row">
        <input class="g-input" id="g-cat" type="text" placeholder="التصنيف (كروت / بنرات / تغليف…)" maxlength="40">
        <input class="g-input" id="g-tags" type="text" placeholder="وسوم مفصولة بفاصلة (اختياري)">
      </div>
      <div class="g-compose-actions">
        <button type="button" class="g-btn ghost" data-act="cancel-compose">إلغاء</button>
        <button type="submit" class="g-btn primary" id="g-submit" ${busy ? 'disabled' : ''}>${busy ? 'جارٍ النشر…' : '🖼️ نشر للمعرض'}</button>
      </div>
      <div class="g-progress" id="g-progress" hidden><div class="g-progress-bar" id="g-progress-bar"></div></div>
    </form>`;
  }

  function toolbarHtml() {
    const cats = deriveCategories(items);
    const chip = (label, val) => `<button type="button" class="g-chip${activeCat === val ? ' active' : ''}" data-act="cat" data-cat="${esc(val)}">${esc(label)}</button>`;
    const chips = [chip('الكل', ALL), ...cats.map((c) => chip(c, c))].join('');
    return `<div class="g-toolbar">
      <div class="g-chips">${chips}</div>
      ${canManage ? `<button type="button" class="g-btn primary" data-act="toggle-compose">${composing ? '✕ إغلاق' : '➕ أضف تصميم'}</button>` : ''}
    </div>
    ${composeHtml()}`;
  }

  function gridHtml() {
    const vis = visibleItems();
    if (!items.length) {
      return `<div class="g-empty"><div class="g-empty-ico">🖼️</div>
        <div class="g-empty-title">المعرض فارغ بعد</div>
        <div class="g-empty-sub">${canManage ? 'ابدأ بإضافة أول تصميم لبورتفوليو الشركة.' : 'لا توجد تصاميم منشورة حالياً.'}</div></div>`;
    }
    if (!vis.length) {
      return `<div class="g-empty"><div class="g-empty-ico">🔍</div>
        <div class="g-empty-title">لا تصاميم في هذا التصنيف</div></div>`;
    }
    return `<div class="g-grid">${vis.map(cardHtml).join('')}</div>`;
  }

  function render() {
    container.innerHTML = `
      <div class="g-head">
        <div>
          <h1 class="g-h1">🖼️ معرض التصاميم</h1>
          <p class="g-sub">بورتفوليو أعمال الشركة${items.length ? ` · ${items.filter((i) => i.isVisible !== false).length} تصميم` : ''}</p>
        </div>
      </div>
      ${toolbarHtml()}
      ${gridHtml()}`;
    wire();
  }

  // ── lightbox ──
  function openLightbox(src, title) {
    let lb = document.getElementById('g-lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'g-lightbox';
      lb.className = 'g-lightbox';
      lb.innerHTML = '<button type="button" class="g-lb-close" aria-label="إغلاق">✕</button><img class="g-lb-img" alt=""><div class="g-lb-cap"></div>';
      document.body.appendChild(lb);
      lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('g-lb-close')) lb.classList.remove('open'); });
    }
    lb.querySelector('.g-lb-img').src = src;
    lb.querySelector('.g-lb-cap').textContent = title || '';
    lb.classList.add('open');
  }

  // ── actions ──
  async function doVisibility(it) {
    const r = await svc.setVisibility({ itemId: it.id, isVisible: it.isVisible === false, actorId: uid, actorName: userDoc?.name });
    if (!r.ok) toast('❌ ' + (r.errors || []).join(' · '), 'err');
  }
  async function doFeature(it) {
    const r = await svc.toggleFeature({ itemId: it.id, isFeatured: !it.isFeatured, actorId: uid, actorName: userDoc?.name });
    if (!r.ok) toast('❌ ' + (r.errors || []).join(' · '), 'err');
  }
  async function doDelete(it) {
    if (!window.confirm('حذف هذا التصميم من المعرض نهائياً؟')) return;
    const r = await svc.removeGalleryItem({ itemId: it.id, imagePath: it.imagePath, actorId: uid });
    if (!r.ok) toast('❌ ' + (r.errors || []).join(' · '), 'err');
    else toast('🗑️ تم الحذف', 'ok');
  }

  async function submitCompose(form) {
    if (busy) return;
    const file = form.querySelector('#g-file')?.files?.[0] || null;
    const title = form.querySelector('#g-title')?.value || '';
    const category = form.querySelector('#g-cat')?.value || '';
    const tags = form.querySelector('#g-tags')?.value || '';
    const v = validateGalleryInput({ title, file });
    if (!v.ok) { toast('❌ ' + v.errors.join(' · '), 'err'); return; }

    busy = true;
    const submitBtn = form.querySelector('#g-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'جارٍ النشر…'; }
    const prog = form.querySelector('#g-progress');
    const bar = form.querySelector('#g-progress-bar');
    if (prog) prog.hidden = false;

    const r = await svc.publishToGallery({
      file, title, category, tags,
      designerId: uid, designerName: userDoc?.name || '',
      tenantId, actorId: uid, actorName: userDoc?.name || '',
      onProgress: (p) => { if (bar) bar.style.width = p + '%'; },
    });
    busy = false;
    if (r.ok) {
      composing = false;
      toast('✅ تم نشر التصميم للمعرض', 'ok');
      // الـ snapshot listener سيحدّث الشبكة؛ نعيد الرسم لإغلاق اللوحة فوراً.
      render();
    } else {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🖼️ نشر للمعرض'; }
      if (prog) prog.hidden = true;
      toast('❌ ' + (r.errors || []).join(' · '), 'err');
    }
  }

  function wire() {
    // delegation على الـ container
    container.querySelectorAll('[data-act]').forEach((el) => {
      const act = el.getAttribute('data-act');
      if (act === 'cat') {
        el.onclick = () => { activeCat = el.getAttribute('data-cat'); render(); };
      } else if (act === 'toggle-compose') {
        el.onclick = () => { composing = !composing; render(); };
      } else if (act === 'cancel-compose') {
        el.onclick = () => { composing = false; render(); };
      } else if (act === 'zoom') {
        el.onclick = () => openLightbox(el.getAttribute('data-src'), el.getAttribute('data-title'));
      } else if (act === 'vis' || act === 'feature' || act === 'del') {
        el.onclick = () => {
          const it = items.find((x) => x.id === el.getAttribute('data-id'));
          if (!it) return;
          if (act === 'vis') doVisibility(it);
          else if (act === 'feature') doFeature(it);
          else doDelete(it);
        };
      }
    });

    // compose form
    const form = container.querySelector('#g-compose');
    if (form) {
      const fileInput = form.querySelector('#g-file');
      const pick = form.querySelector('#g-pick');
      const label = form.querySelector('#g-file-label');
      if (pick && fileInput) pick.onclick = (e) => { e.preventDefault(); fileInput.click(); };
      if (fileInput) fileInput.onchange = () => {
        const f = fileInput.files?.[0];
        if (f && !isGalleryImage(f)) { toast('❌ صور فقط', 'err'); fileInput.value = ''; return; }
        if (label) label.textContent = f ? ('📷 ' + f.name).slice(0, 40) : '📷 اختر صورة';
      };
      form.onsubmit = (e) => { e.preventDefault(); submitCompose(form); };
    }
  }

  // ── boot ──
  render();
  const off = subscribeGallery({
    tenantId,
    onUpdate: (arr) => { items = arr; render(); },
    onError: (e) => { console.error('[gallery] subscribe error', e); toast('تعذّر تحميل المعرض', 'err'); },
  });

  return () => { try { off(); } catch (_) {} };
}
