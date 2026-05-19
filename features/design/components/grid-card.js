/**
 * features/design/components/grid-card.js
 *
 * بطاقة موحَّدة بـ variants تخدم الـ 3 tabs:
 *   - variant='gallery'   → معرض عام (gallery)
 *   - variant='library'   → بطاقة تصميم في المكتبة (مع status badge + meta)
 *   - variant='work-item' → بند داخل أوردر (مع actions)
 *   - variant='client'    → بطاقة عميل مع الإحصاءات
 *
 * يحل محل التكرار الثلاثي لـ cdl-card / pf-card / gal-card.
 */

import { escapeHtml, escapeAttr, getItemThumb, getLatestVersion, fn } from './utils.js';

// ════════════════════════════════════════════════════════════════
// Gallery card (للـ public gallery)
// ════════════════════════════════════════════════════════════════
export function galleryCard(item, idx) {
  const cat = item.productType || 'تصميم';
  const designer = item.publishedByName || item.designerName || '';
  const delay = Math.min(idx * .035, .45);
  return `
    <div class="dh-card dh-card-gal" style="animation-delay:${delay}s" data-idx="${idx}" data-action="open-lightbox">
      <div class="dh-card-img-wrap">
        <img src="${escapeAttr(item.imageUrl || '')}" alt="${escapeAttr(item.title || cat)}" loading="lazy">
        <div class="dh-card-zoom">🔍</div>
      </div>
      <div class="dh-card-info">
        <div class="dh-card-cat">${escapeHtml(cat)}</div>
        ${item.title ? `<div class="dh-card-title">${escapeHtml(item.title)}</div>` : ''}
        ${item.description ? `<div class="dh-card-desc">${escapeHtml(item.description)}</div>` : ''}
        ${designer ? `<div class="dh-card-designer">🎨 <span>${escapeHtml(designer)}</span></div>` : ''}
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
// Library card (تصميم في المكتبة)
// ════════════════════════════════════════════════════════════════
export function libraryCard(item, ctx = {}) {
  const v = getLatestVersion(item);
  const thumb = getItemThumb(item);
  const orderCode = ctx.orderCode || item.orderId?.slice?.(0, 6) || '—';
  const status = _itemStatus(item);
  return `
    <div class="dh-card dh-card-lib">
      <div class="dh-card-img-wrap" data-action="open-work-item" data-item-id="${escapeAttr(item._id || item.id || '')}" data-order-id="${escapeAttr(item.orderDocId || '')}">
        ${thumb ? `<img src="${escapeAttr(thumb)}" loading="lazy" alt="">` : `<div class="dh-card-empty">🎨</div>`}
        ${v?.vNum ? `<span class="dh-card-pill">v${v.vNum} · ${(item.versions || []).length} نسخة</span>` : ''}
        <span class="dh-card-status" style="color:${status.col}" title="${escapeAttr(status.label)}">${status.ico}</span>
      </div>
      <div class="dh-card-info">
        <div class="dh-card-title">${escapeHtml(item.itemName || '—')}</div>
        <div class="dh-card-meta">
          <span>📦 #${escapeHtml(orderCode)}</span>
          ${item.itemQty ? `<span>· الكمية ${fn(item.itemQty)}</span>` : ''}
          ${v?.uploadedByName ? `<span>· ✍️ ${escapeHtml(v.uploadedByName)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
// Client card (بطاقة عميل في المكتبة)
// ════════════════════════════════════════════════════════════════
export function clientCard(clientId, group, ctx = {}) {
  const items = group.items;
  const versions = items.reduce((s, i) => s + (i.versions || []).length, 0);
  const sources = items.filter(i => _hasSource(i)).length;
  const pdfs = items.filter(i => _hasPdf(i)).length;
  const initial = (group.name || '?')[0].toUpperCase();
  const clientName = ctx.showPhone === false
    ? group.name
    : (group.name + (group.phone ? ` · ${ctx.maskedPhone || group.phone}` : ''));

  return `
    <div class="dh-card dh-card-client" data-action="open-client" data-client-id="${escapeAttr(clientId)}">
      <div class="dh-card-name">
        <div class="dh-card-avatar">${escapeHtml(initial)}</div>
        ${escapeHtml(clientName || '—')}
      </div>
      <div class="dh-card-counts">
        <span class="dh-cc">🎨 ${items.length} تصميم</span>
        <span class="dh-cc">📁 ${versions} نسخة</span>
        ${sources ? `<span class="dh-cc ok">📁 ${sources} مصدر</span>` : ''}
        ${pdfs ? `<span class="dh-cc info">📄 ${pdfs} PDF</span>` : ''}
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
// Order card (للـ Work view — الأوردرات المسندة)
// ════════════════════════════════════════════════════════════════
export function orderCard(order, ctx = {}) {
  const orderCode = order.orderId || order._id?.slice(0, 6) || order.id?.slice(0, 6) || '—';
  const clientName = order.clientName || '—';
  const itemsCount = order.products?.length || ctx.itemsCount || 0;
  const designStage = order.designStage || 'pending';
  const stageLabel = {
    pending: 'لم يبدأ',
    wip: 'قيد العمل',
    awaiting_payment: 'بانتظار الدفع',
    rejected: 'مرفوض',
    approved: 'معتمد',
  }[designStage] || designStage;
  const stageColor = {
    pending: 'var(--dim2)',
    wip: 'var(--y)',
    awaiting_payment: 'var(--b)',
    rejected: 'var(--r)',
    approved: 'var(--g)',
  }[designStage] || 'var(--dim2)';

  return `
    <div class="dh-order-card" data-action="open-order" data-order-id="${escapeAttr(order._id || order.id)}">
      <div class="dh-order-head">
        <div class="dh-order-code">📦 #${escapeHtml(orderCode)}</div>
        <span class="dh-order-stage" style="color:${stageColor};border-color:${stageColor}">${escapeHtml(stageLabel)}</span>
      </div>
      <div class="dh-order-client">${escapeHtml(clientName)}</div>
      <div class="dh-order-meta">
        <span>🎨 ${itemsCount} منتج</span>
        ${order.designerName ? `<span>· ✍️ ${escapeHtml(order.designerName)}</span>` : ''}
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════
function _itemStatus(item) {
  if (item.isPrintReady) return { label: 'جاهز للطباعة', col: 'var(--g)', ico: '🖨️' };
  if (item.isApproved) return { label: 'معتمد', col: 'var(--g)', ico: '✅' };
  if (item.status === 'revision_requested') return { label: 'تعديل مطلوب', col: 'var(--y)', ico: '🔄' };
  if (item.visibility === 'published') return { label: 'منشور للعميل', col: 'var(--b)', ico: '👁' };
  if ((item.versions || []).length) return { label: 'قيد العمل', col: 'var(--dim2)', ico: '✏️' };
  return { label: 'لم يبدأ', col: 'var(--dim2)', ico: '📝' };
}

function _hasSource(item) {
  const v = getLatestVersion(item);
  return !!(v?.files?.source);
}

function _hasPdf(item) {
  const v = getLatestVersion(item);
  return !!(v?.files?.pdf);
}
