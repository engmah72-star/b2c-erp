/**
 * features/gallery/views/grid-view.js
 *
 * عرض المعرض (view فقط — L1): شبكة + فلاتر تصنيف + lightbox + لوحة رفع للمصمم.
 * كل كتابة عبر gallery.service (لا writes هنا).
 *
 * هيكلة مهمّة: لوحة الرفع (compose) لها host مستقل لا يُعاد بناؤه عند وصول
 * snapshot جديد — حتى لا يُمسح الملف المختار/المُدخلات أثناء التعبئة.
 * الـ snapshot يحدّث الشبكة + الفلاتر فقط.
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
  if (!c) { console.log('[gallery toast]', msg); return; }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 4200);
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

  // ── card ──
  function cardHtml(it) {
    const cat = esc(it.productType || it.category || 'عام');
    const hidden = it.isVisible === false;
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

  function chipsHtml() {
    const cats = deriveCategories(items);
    const chip = (label, val) => `<button type="button" class="g-chip${activeCat === val ? ' active' : ''}" data-act="cat" data-cat="${esc(val)}">${esc(label)}</button>`;
    return [chip('الكل', ALL), ...cats.map((c) => chip(c, c))].join('');
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
        <button type="submit" class="g-btn primary" id="g-submit">🖼️ نشر للمعرض</button>
      </div>
      <div class="g-progress" id="g-progress" hidden><div class="g-progress-bar" id="g-progress-bar"></div></div>
    </form>`;
  }

  // ── shell (يُبنى مرة + عند تغيّر حالة composing) ──
  function renderShell() {
    const visCount = items.filter((i) => i.isVisible !== false).length;
    container.innerHTML = `
      <div class="g-head">
        <div>
          <h1 class="g-h1">🖼️ معرض التصاميم</h1>
          <p class="g-sub">بورتفوليو أعمال الشركة${items.length ? ` · ${visCount} تصميم` : ''}</p>
        </div>
      </div>
      <div class="g-toolbar">
        <div class="g-chips" id="g-chips">${chipsHtml()}</div>
        ${canManage ? `<button type="button" class="g-btn primary" data-act="toggle-compose">${composing ? '✕ إغلاق' : '➕ أضف تصميم'}</button>` : ''}
      </div>
      <div id="g-compose-host">${composeHtml()}</div>
      <div id="g-grid-host">${gridHtml()}</div>`;
    wireShell();
    wireCompose();
    wireGrid();
  }

  // ── تحديثات جزئية (لا تمسّ لوحة الرفع) ──
  function refreshChips() {
    const host = container.querySelector('#g-chips');
    if (host) { host.innerHTML = chipsHtml(); wireChips(host); }
  }
  function refreshGrid() {
    const host = container.querySelector('#g-grid-host');
    if (host) { host.innerHTML = gridHtml(); wireGrid(); }
    const sub = container.querySelector('.g-sub');
    if (sub) sub.textContent = `بورتفوليو أعمال الشركة${items.length ? ` · ${items.filter((i) => i.isVisible !== false).length} تصميم` : ''}`;
  }

  // ── wiring ──
  function wireChips(scope = container) {
    scope.querySelectorAll('[data-act="cat"]').forEach((el) => {
      el.onclick = () => { activeCat = el.getAttribute('data-cat'); renderShell(); };
    });
  }
  function wireShell() {
    wireChips();
    const tc = container.querySelector('[data-act="toggle-compose"]');
    if (tc) tc.onclick = () => { composing = !composing; renderShell(); };
  }
  function wireGrid() {
    const host = container.querySelector('#g-grid-host') || container;
    host.querySelectorAll('[data-act="zoom"]').forEach((el) => {
      el.onclick = () => openLightbox(el.getAttribute('data-src'), el.getAttribute('data-title'));
    });
    host.querySelectorAll('[data-act="vis"],[data-act="feature"],[data-act="del"]').forEach((el) => {
      const act = el.getAttribute('data-act');
      el.onclick = () => {
        const it = items.find((x) => x.id === el.getAttribute('data-id'));
        if (!it) return;
        if (act === 'vis') doVisibility(it);
        else if (act === 'feature') doFeature(it);
        else doDelete(it);
      };
    });
  }
  function wireCompose() {
    const form = container.querySelector('#g-compose');
    if (!form) return;
    const cancel = form.querySelector('[data-act="cancel-compose"]');
    if (cancel) cancel.onclick = () => { composing = false; renderShell(); };
    const fileInput = form.querySelector('#g-file');
    const pick = form.querySelector('#g-pick');
    const label = form.querySelector('#g-file-label');
    if (pick && fileInput) pick.onclick = (e) => { e.preventDefault(); fileInput.click(); };
    if (fileInput) fileInput.onchange = () => {
      const f = fileInput.files && fileInput.files[0];
      if (f && !isGalleryImage(f)) { toast('❌ صور فقط (jpg/png/webp…)', 'err'); fileInput.value = ''; if (label) label.textContent = '📷 اختر صورة'; return; }
      if (label) label.textContent = f ? ('📷 ' + f.name).slice(0, 40) : '📷 اختر صورة';
    };
    form.onsubmit = (e) => { e.preventDefault(); submitCompose(form); };
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

  // ── actions (إدارة) ──
  async function doVisibility(it) {
    const r = await svc.setVisibility({ itemId: it.id, isVisible: it.isVisible === false, actorId: uid, actorName: userDoc?.name });
    if (!r.ok) { console.error('[gallery] setVisibility', r.errors); toast('❌ ' + (r.errors || []).join(' · '), 'err'); }
  }
  async function doFeature(it) {
    const r = await svc.toggleFeature({ itemId: it.id, isFeatured: !it.isFeatured, actorId: uid, actorName: userDoc?.name });
    if (!r.ok) { console.error('[gallery] toggleFeature', r.errors); toast('❌ ' + (r.errors || []).join(' · '), 'err'); }
  }
  async function doDelete(it) {
    if (!window.confirm('حذف هذا التصميم من المعرض نهائياً؟')) return;
    const r = await svc.removeGalleryItem({ itemId: it.id, imagePath: it.imagePath, actorId: uid });
    if (!r.ok) { console.error('[gallery] remove', r.errors); toast('❌ ' + (r.errors || []).join(' · '), 'err'); }
    else toast('🗑️ تم الحذف', 'ok');
  }

  // ── publish ──
  async function submitCompose(form) {
    if (busy) return;
    if (!uid) { toast('❌ سجّل الدخول أولاً للنشر', 'err'); return; }
    const file = (form.querySelector('#g-file') || {}).files && form.querySelector('#g-file').files[0] || null;
    const title = (form.querySelector('#g-title') || {}).value || '';
    const category = (form.querySelector('#g-cat') || {}).value || '';
    const tags = (form.querySelector('#g-tags') || {}).value || '';
    const v = validateGalleryInput({ title, file });
    if (!v.ok) { toast('❌ ' + v.errors.join(' · '), 'err'); return; }

    busy = true;
    const submitBtn = form.querySelector('#g-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'جارٍ النشر…'; }
    const prog = form.querySelector('#g-progress');
    const bar = form.querySelector('#g-progress-bar');
    if (prog) prog.hidden = false;

    let r;
    try {
      r = await svc.publishToGallery({
        file, title, category, tags,
        designerId: uid, designerName: userDoc?.name || '',
        tenantId, actorId: uid, actorName: userDoc?.name || '',
        onProgress: (p) => { if (bar) bar.style.width = p + '%'; },
      });
    } catch (e) {
      console.error('[gallery] publish threw:', e);
      r = { ok: false, errors: [(e && e.message) || 'خطأ غير متوقع'] };
    }
    busy = false;
    if (r && r.ok) {
      composing = false;
      toast('✅ تم نشر التصميم للمعرض', 'ok');
      renderShell();
    } else {
      console.error('[gallery] publish failed:', r && r.errors);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🖼️ نشر للمعرض'; }
      if (prog) prog.hidden = true;
      if (bar) bar.style.width = '0%';
      toast('❌ ' + ((r && r.errors) || ['تعذّر النشر']).join(' · '), 'err');
    }
  }

  // ── boot ──
  renderShell();
  const off = subscribeGallery({
    tenantId,
    onUpdate: (arr) => { items = arr; refreshChips(); refreshGrid(); },
    onError: (e) => { console.error('[gallery] subscribe error', e); toast('تعذّر تحميل المعرض: ' + (e?.message || ''), 'err'); },
  });

  return () => { try { off(); } catch (_) {} };
}
