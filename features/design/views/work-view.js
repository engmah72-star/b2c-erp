/**
 * features/design/views/work-view.js
 *
 * Tab "عملي" — مساحة المصمم.
 * MVP من design-workspace.html:
 *   - قائمة أوردرات مسندة (أو كل أوردرات stage=design للأدمن)
 *   - عند فتح أوردر: عرض البنود (design_items) مع نسخها
 *   - رفع نسخة جديدة (يقترح الـ slot تلقائياً من نوع الملف)
 *   - اعتماد البند + جاهز للطباعة + نشر للعميل
 *   - نشر للمعرض العام (modal مدمج)
 *
 * مؤجَّل لـ Phase 2: revision modal, edit item, decision processing, advanced KPIs
 */

import {
  subscribeDesignOrders, subscribeDesignItems,
} from '../repository.js';
import * as itemsService from '../services/design-items.service.js';
import * as uploadService from '../services/upload.service.js';
import { isAdmin, isCSRole } from '../permissions.js';
import {
  $, escapeHtml, escapeAttr, fn, debounce, setText,
  getLatestVersion, getItemFiles, getItemThumb,
} from '../components/utils.js';
import { orderCard } from '../components/grid-card.js';
import { openLightbox } from '../components/lightbox.js';

const state = {
  orders: [],
  items: [],
  currentOrderId: null,
  searchTerm: '',
  unsubOrders: null,
  unsubItems: null,
  unsubOrderItems: null,
  user: null,
  userDoc: null,
  role: null,
};

export function mountWorkView({ container, user, userDoc }) {
  state.user = user;
  state.userDoc = userDoc;
  state.role = userDoc?.role || 'admin';

  container.innerHTML = `
    <div class="dh-work-split">
      <aside class="dh-work-side">
        <div class="dh-toolbar dh-work-toolbar">
          <input type="text" class="dh-search" id="dh-work-search" placeholder="🔍 بحث في أوردراتي…">
        </div>
        <div class="dh-work-orders" id="dh-work-orders">
          <div class="dh-loader"><div class="dh-spinner"></div></div>
        </div>
      </aside>

      <section class="dh-work-main" id="dh-work-main">
        <div class="dh-empty">
          <div class="dh-empty-ico">📂</div>
          <div>اختر أوردر من القائمة على اليمين</div>
        </div>
      </section>
    </div>
  `;

  $('dh-work-search').addEventListener('input', debounce(() => {
    state.searchTerm = ($('dh-work-search').value || '').toLowerCase().trim();
    renderOrdersList();
  }, 200));

  $('dh-work-orders').addEventListener('click', (e) => {
    const card = e.target.closest('[data-action="open-order"]');
    if (!card) return;
    openOrder(card.dataset.orderId);
  });

  $('dh-work-main').addEventListener('click', onMainClick);

  // Subscribe to orders based on role
  const isPriv = isAdmin(state.role) || isCSRole(state.role);
  state.unsubOrders = subscribeDesignOrders({
    scope: isPriv ? 'all' : 'mine',
    uid: state.user?.uid,
    onUpdate: (orders) => {
      state.orders = orders;
      renderOrdersList();
    },
    onError: (err) => console.error('[work-view] orders error:', err),
  });

  // Subscribe to items in scope (for global lookup / counts)
  state.unsubItems = subscribeDesignItems({
    scope: isPriv ? 'all' : 'mine',
    uid: state.user?.uid,
    onUpdate: (items) => {
      state.items = items;
      // Refresh open order panel if items changed
      if (state.currentOrderId) renderOrderPanel();
      // refresh side counts
      renderOrdersList();
    },
    onError: (err) => console.error('[work-view] items error:', err),
  });
}

export function unmountWorkView() {
  state.unsubOrders?.();
  state.unsubItems?.();
  state.unsubOrderItems?.();
  state.unsubOrders = null;
  state.unsubItems = null;
  state.unsubOrderItems = null;
}

/** يستدعى من library-view لما المستخدم يفتح بند */
export function openWorkItem({ orderId, itemId }) {
  if (orderId) openOrder(orderId);
  // scroll to item after panel renders
  setTimeout(() => {
    const el = document.querySelector(`[data-item-row="${itemId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 200);
}

function renderOrdersList() {
  const listEl = $('dh-work-orders');
  if (!listEl) return;

  let orders = state.orders;
  if (state.searchTerm) {
    orders = orders.filter(o => {
      const hay = [o.orderId, o.clientName, o.designerName].join(' ').toLowerCase();
      return hay.includes(state.searchTerm);
    });
  }

  if (!orders.length) {
    listEl.innerHTML = `<div class="dh-empty"><div class="dh-empty-ico">📭</div><div>لا أوردرات حالياً</div></div>`;
    return;
  }

  const itemCounts = new Map();
  for (const item of state.items) {
    const k = item.orderDocId;
    if (!k) continue;
    itemCounts.set(k, (itemCounts.get(k) || 0) + 1);
  }

  listEl.innerHTML = orders.map(o => {
    const ctx = { itemsCount: itemCounts.get(o._id || o.id) || (o.products?.length || 0) };
    return orderCard(o, ctx);
  }).join('');
}

function openOrder(orderId) {
  state.currentOrderId = orderId;
  // Subscribe to items for this specific order
  state.unsubOrderItems?.();
  state.unsubOrderItems = subscribeDesignItems({
    scope: 'perOrder',
    orderDocId: orderId,
    onUpdate: (items) => {
      // Merge into state.items (replace for this order)
      const others = state.items.filter(i => i.orderDocId !== orderId);
      state.items = [...others, ...items];
      renderOrderPanel();
    },
    onError: (err) => console.error('[work-view] perOrder items error:', err),
  });
  renderOrderPanel();
}

function renderOrderPanel() {
  const order = state.orders.find(o => (o._id || o.id) === state.currentOrderId);
  if (!order) {
    $('dh-work-main').innerHTML = `<div class="dh-empty"><div class="dh-empty-ico">⚠️</div><div>الأوردر غير موجود في نطاقك</div></div>`;
    return;
  }
  const items = state.items.filter(i => i.orderDocId === state.currentOrderId);
  const orderCode = order.orderId || (order._id || order.id).slice(0, 6);

  $('dh-work-main').innerHTML = `
    <header class="dh-work-head">
      <div>
        <div class="dh-work-title">📦 #${escapeHtml(orderCode)} — ${escapeHtml(order.clientName || '—')}</div>
        <div class="dh-work-sub">${items.length} بند تصميم</div>
      </div>
      <div class="dh-work-actions">
        ${order.designerName ? `<span class="dh-tag">✍️ ${escapeHtml(order.designerName)}</span>` : ''}
      </div>
    </header>

    <div class="dh-items-list">
      ${items.length
        ? items.map(itemRow).join('')
        : '<div class="dh-empty"><div class="dh-empty-ico">📝</div><div>لا توجد بنود تصميم في هذا الأوردر بعد</div></div>'
      }
    </div>
  `;
}

function itemRow(item) {
  const v = getLatestVersion(item);
  const files = getItemFiles(item);
  const thumb = getItemThumb(item);
  const vCount = (item.versions || []).length;
  const status = item.isApproved
    ? '<span class="dh-pill ok">✅ معتمد</span>'
    : '<span class="dh-pill">قيد العمل</span>';

  return `
    <div class="dh-item-row" data-item-row="${escapeAttr(item._id || item.id)}">
      <div class="dh-item-thumb" data-action="lightbox" data-img="${escapeAttr(thumb)}" data-title="${escapeAttr(item.itemName || '')}">
        ${thumb ? `<img src="${escapeAttr(thumb)}" alt="" loading="lazy">` : `<div class="dh-card-empty">🎨</div>`}
        ${v?.vNum ? `<span class="dh-thumb-pill">v${v.vNum} · ${vCount}</span>` : ''}
      </div>
      <div class="dh-item-body">
        <div class="dh-item-name">${escapeHtml(item.itemName || '—')} ${status}</div>
        <div class="dh-item-meta">
          ${item.itemQty ? `<span>الكمية: ${fn(item.itemQty)}</span>` : ''}
          ${v?.uploadedByName ? `<span>· ✍️ ${escapeHtml(v.uploadedByName)}</span>` : ''}
        </div>
        <div class="dh-item-files">
          ${fileBadge('📸', 'موك أب', files.mockup)}
          ${fileBadge('📄', 'PDF', files.pdf)}
          ${fileBadge('📁', 'مصدر', files.source)}
        </div>
      </div>
      <div class="dh-item-actions">
        <label class="dh-btn dh-btn-primary">
          <input type="file" hidden data-action="upload" data-item-id="${escapeAttr(item._id || item.id)}">
          ⬆️ رفع نسخة
        </label>
        ${item.isApproved
          ? `<button class="dh-btn" disabled>✅ معتمد</button>`
          : `<button class="dh-btn" data-action="approve" data-item-id="${escapeAttr(item._id || item.id)}">✅ اعتماد</button>`}
        ${item.isPrintReady
          ? `<span class="dh-tag ok">🖨️ جاهز للطباعة</span>`
          : `<button class="dh-btn dh-btn-ghost" data-action="toggle-print-ready" data-item-id="${escapeAttr(item._id || item.id)}" ${item.isApproved ? '' : 'disabled'}>🖨️ تعليم جاهز للطباعة</button>`}
      </div>
    </div>
  `;
}

function fileBadge(ico, label, file) {
  if (!file?.url) {
    return `<span class="dh-fbadge">${ico} ${label}</span>`;
  }
  return `<a class="dh-fbadge ok" href="${escapeAttr(file.url)}" target="_blank" rel="noopener" title="${escapeAttr(file.fileName || '')}">${ico} ${label}</a>`;
}

async function onMainClick(e) {
  const uploadInput = e.target.closest('[data-action="upload"]');
  if (uploadInput && uploadInput.tagName === 'INPUT') {
    return; // file change handled below
  }
  const approveBtn = e.target.closest('[data-action="approve"]');
  if (approveBtn) {
    await onApprove(approveBtn.dataset.itemId);
    return;
  }
  const printReadyBtn = e.target.closest('[data-action="toggle-print-ready"]');
  if (printReadyBtn) {
    await onTogglePrintReady(printReadyBtn.dataset.itemId);
    return;
  }
  const lbThumb = e.target.closest('[data-action="lightbox"]');
  if (lbThumb && lbThumb.dataset.img) {
    openLightbox([{
      imageUrl: lbThumb.dataset.img,
      title: lbThumb.dataset.title || '',
      meta: '',
      description: '',
    }], 0);
  }
}

// File input change listener (delegate)
document.addEventListener('change', async (e) => {
  const inp = e.target.closest('input[type="file"][data-action="upload"]');
  if (!inp) return;
  const itemId = inp.dataset.itemId;
  const file = inp.files?.[0];
  if (!itemId || !file) return;
  inp.value = ''; // reset for re-upload
  await onUploadVersion(itemId, file);
});

async function onUploadVersion(itemId, file) {
  try {
    const slot = uploadService.inferSlotKind(file);
    const uploaded = await uploadService.uploadSlotFile({
      itemId, file, slot,
      onProgress: () => {}, // could add a global progress UI
    });
    const item = state.items.find(i => (i._id || i.id) === itemId);
    const nextVNum = ((item?.versions || []).reduce((m, v) => Math.max(m, v.vNum || 0), 0)) + 1;
    const version = uploadService.buildVersion({
      vNum: nextVNum,
      files: [uploaded],
      uploadedBy: state.user?.uid,
      uploadedByName: state.userDoc?.name || state.user?.email || '',
    });
    await itemsService.appendVersion({
      itemId, version,
      userId: state.user?.uid,
      userName: state.userDoc?.name || '',
    });
    _toast('✅ تم رفع النسخة', 'ok');
  } catch (err) {
    console.error('[upload] failed:', err);
    _toast('⚠️ فشل رفع الملف: ' + (err.message || ''), 'err');
  }
}

async function onApprove(itemId) {
  if (!confirm('اعتماد البند نهائياً؟')) return;
  try {
    await itemsService.markApproved({
      itemId,
      userId: state.user?.uid,
      userName: state.userDoc?.name || '',
    });
    _toast('✅ تم الاعتماد', 'ok');
  } catch (err) {
    console.error('[approve] failed:', err);
    _toast('⚠️ تعذّر الاعتماد', 'err');
  }
}

async function onTogglePrintReady(itemId) {
  const item = state.items.find(i => (i._id || i.id) === itemId);
  if (!item) return;
  const newState = !item.isPrintReady;
  if (newState && !confirm('تعليم البند جاهز للطباعة؟')) return;
  try {
    await itemsService.togglePrintReady({
      itemId, isPrintReady: newState,
      userId: state.user?.uid,
      userName: state.userDoc?.name || '',
    });
    _toast(newState ? '🖨️ تم التعليم' : '↩️ تم الإلغاء', 'ok');
  } catch (err) {
    console.error('[toggle-print-ready] failed:', err);
    _toast('⚠️ تعذّر التحديث', 'err');
  }
}

function _toast(msg, kind) {
  // small inline toast
  const c = document.createElement('div');
  c.className = `dh-toast ${kind || ''}`;
  c.textContent = msg;
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 2800);
}
