/**
 * core/order-panel.js — Shared Order Detail Panel
 *
 * Unified, configurable panel builder for order detail views across all pages.
 * Each page calls renderOrderPanel() with the sections it needs.
 *
 * RULES:
 *  - Pure function — no DOM mutation, no Firestore calls (L1)
 *  - Only imports from orders.js for constants/helpers
 *  - All labels in Arabic
 *  - Styles use ONLY CSS variables from shared.css (U1)
 *  - E1: new file — existing panel implementations untouched
 */

import {
  stageProgressBar,
  productStatusBadge,
  PRODUCT_STATUS,
  getShipStageLabel,
  getShipMethodLabel,
} from '../orders.js';

// ─── LOCAL HELPERS ─────────────────────────────────────────────────────

/** Currency-formatted number (Arabic locale). */
const fmtCurrency = (n) => {
  const v = parseFloat(n) || 0;
  return v.toLocaleString('ar-EG');
};

/** Format a date value for display (accepts string, Date, or Firestore Timestamp-like). */
const fmtDate = (d) => {
  if (!d) return '—';
  if (typeof d === 'string') return d;
  if (typeof d.toDate === 'function') {
    return d.toDate().toLocaleDateString('ar-EG');
  }
  if (d instanceof Date) return d.toLocaleDateString('ar-EG');
  if (typeof d === 'object' && typeof d.seconds === 'number') {
    return new Date(d.seconds * 1000).toLocaleDateString('ar-EG');
  }
  return String(d);
};

/** Days past deadline (0 if not late or no deadline). */
const daysLate = (dl) =>
  dl ? Math.max(0, Math.floor((Date.now() - new Date(dl).getTime()) / 864e5)) : 0;

/** HTML-escape (handles &<>"'). */
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Info-row card: label + value (optional color override). */
const infoRow = (lbl, val, col = null) =>
  `<div style="background:var(--bg3);border-radius:var(--rad);padding:8px 10px">` +
  `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:2px">${lbl}</div>` +
  `<div style="font-size:var(--fs-base);font-weight:var(--fw-bold)${col ? ';color:' + col : ''}">${val}</div>` +
  `</div>`;

// ─── SECTION RENDERERS ─────────────────────────────────────────────────

/** Client + order basics section. */
function renderClientSection(order, options) {
  const o = order;
  const { canSeePhone = () => false, showPhone = (p) => p } = options;
  const d = daysLate(o.deadline);

  return `
    <div style="margin-bottom:12px">
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:8px">👤 العميل والطلب</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-sm)">
        ${infoRow('العميل', esc(o.clientName || '—'))}
        ${canSeePhone()
          ? infoRow('الهاتف', `<a href="tel:${esc(o.clientPhone)}" style="color:var(--b);text-decoration:none">${esc(o.clientPhone || '—')}</a>`)
          : infoRow('الهاتف', `<span style="color:var(--dim2)">${esc(showPhone(o.clientPhone))} <small>(محجوب)</small></span>`)}
        ${infoRow('الأوردر', esc(o.orderId || '—'))}
        ${infoRow('تاريخ الطلب', fmtDate(o.createdDate || o.createdAt))}
        ${infoRow(
          'موعد التسليم',
          o.deadline ? esc(o.deadline) + (d > 0 ? ` <span style="color:var(--r)">(متأخر ${d} يوم)</span>` : '') : 'لم يُحدد',
          d > 0 ? 'var(--r)' : null,
        )}
      </div>
    </div>`;
}

/** Products list with status badges. */
function renderProductsSection(order) {
  const prods = order.products || [];
  if (!prods.length) {
    return `
      <div style="margin-bottom:12px">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:8px">📦 المنتجات</div>
        <div style="font-size:var(--fs-md);padding:var(--space-sm);background:var(--bg3);border-radius:var(--rad)">${esc(order.product || '—')}</div>
      </div>`;
  }
  const rows = prods.map((p) => {
    const status = p.productStatus || 'pending';
    const sConf = PRODUCT_STATUS[status] || PRODUCT_STATUS.pending;
    return `
      <div style="padding:8px 10px;background:var(--bg3);border-radius:var(--rad);margin-bottom:4px;border-right:3px solid ${sConf.col}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:var(--fs-sm);font-weight:var(--fw-bold)">${esc(p.name)} <span style="color:var(--dim2);font-weight:var(--fw-semi)">× ${esc(String(p.qty || 1))}</span></span>
          ${productStatusBadge(status)}
        </div>
      </div>`;
  }).join('');

  return `
    <div style="margin-bottom:12px">
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:8px">📦 المنتجات</div>
      ${rows}
    </div>`;
}

/** Financial summary section. */
function renderFinancialSection(order) {
  const o = order;
  const sale = parseFloat(o.salePrice) || 0;
  const disc = parseFloat(o.discount) || 0;
  const custShip = parseFloat(o.customerShipFee) || 0;
  const paid = parseFloat(o.totalPaid) || 0;
  const gross = Math.max(0, sale + custShip - disc);
  const rem = Math.max(0, gross - paid);

  const finBox = (label, value, color) =>
    `<div style="background:var(--bg3);border-radius:var(--rad);padding:8px 10px;text-align:center">` +
    `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:2px">${label}</div>` +
    `<div style="font-size:var(--fs-md);font-weight:var(--fw-bold);color:${color}">${fmtCurrency(value)} ج</div>` +
    `</div>`;

  return `
    <div style="margin-bottom:12px">
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:8px">💰 الحساب</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-sm)">
        ${finBox('سعر البيع', sale, 'var(--snow)')}
        ${disc > 0 ? finBox('الخصم', disc, 'var(--y)') : ''}
        ${custShip > 0 ? finBox('شحن العميل', custShip, 'var(--dim2)') : ''}
        ${finBox('المدفوع', paid, 'var(--g)')}
        ${finBox('الإجمالي', gross, 'var(--b)')}
        ${finBox('المتبقي', rem, rem > 0 ? 'var(--r)' : 'var(--g)')}
      </div>
    </div>`;
}

/** Timeline section (newest first). */
function renderTimelineSection(order) {
  const tl = order.timeline || [];
  if (!tl.length) {
    return `
      <div style="margin-bottom:12px">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:8px">📋 السجل</div>
        <div style="font-size:var(--fs-sm);color:var(--dim2);padding:var(--space-sm);background:var(--bg3);border-radius:var(--rad)">لا توجد أحداث مسجَّلة</div>
      </div>`;
  }

  const entries = tl.slice().reverse().map((t) => {
    const dateStr = fmtDate(t.date || t.at || t.createdAt);
    const actor = t.by || t.byName || t.userName || '';
    return `
      <div style="padding:6px 0;border-bottom:1px solid var(--line);font-size:var(--fs-sm)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="color:var(--snow);font-weight:var(--fw-semi)">${esc(t.action || '—')}</span>
          <span style="color:var(--dim2);font-size:var(--fs-xs)">${esc(dateStr)}</span>
        </div>
        ${actor ? `<div style="color:var(--dim);font-size:var(--fs-xs);margin-top:2px">👤 ${esc(actor)}</div>` : ''}
      </div>`;
  }).join('');

  return `
    <div style="margin-bottom:12px">
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:8px">📋 السجل</div>
      ${entries}
    </div>`;
}

/** Design files section. */
function renderFilesSection(order) {
  const o = order;
  const files = [];

  // Collect product design images
  (o.products || []).forEach((p) => {
    if (p.designImageUrl) {
      files.push({ url: p.designImageUrl, name: p.name || 'تصميم', type: 'image' });
    }
  });

  // Fallback to order-level design image
  if (o.designImageUrl && !files.length) {
    files.push({ url: o.designImageUrl, name: 'التصميم', type: 'image' });
  }

  // Design files (uploaded attachments)
  const designFiles = o.designFiles || [];
  if (designFiles.length) {
    designFiles.forEach((f) => {
      files.push({ url: f.url, name: f.name || 'ملف', type: f.type || '' });
    });
  } else if (o.designFileUrl && !files.some((f) => f.url === o.designFileUrl)) {
    files.push({ url: o.designFileUrl, name: 'ملف التصميم', type: '' });
  }

  if (!files.length) {
    return `
      <div style="margin-bottom:12px">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:8px">📎 الملفات</div>
        <div style="font-size:var(--fs-sm);color:var(--dim2);padding:var(--space-sm);background:var(--bg3);border-radius:var(--rad)">لم يُرفع ملف بعد</div>
      </div>`;
  }

  const items = files.map((f) => {
    const isPdf = (f.type || '').includes('pdf') || (f.url || '').includes('.pdf') || (f.name || '').endsWith('.pdf');
    const isImg = !isPdf && ((f.type || '').startsWith('image') || /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(f.url || f.name || ''));
    const icon = isImg ? '🖼️' : isPdf ? '📄' : '📎';
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:var(--space-sm);background:var(--bg3);border:1px solid var(--line);border-radius:var(--rad);margin-bottom:6px">
        ${isImg
          ? `<img src="${esc(f.url)}" loading="lazy" style="width:48px;height:48px;border-radius:6px;object-fit:cover;border:1px solid var(--line);flex-shrink:0" alt="">`
          : `<div style="width:48px;height:48px;border-radius:6px;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:var(--fs-2xl);flex-shrink:0">${icon}</div>`}
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--snow);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</div>
          <a href="${esc(f.url)}" target="_blank" rel="noopener" style="font-size:var(--fs-xs);color:var(--b);text-decoration:none;font-weight:var(--fw-bold)">فتح ↗</a>
        </div>
      </div>`;
  }).join('');

  return `
    <div style="margin-bottom:12px">
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:8px">📎 الملفات</div>
      ${items}
    </div>`;
}

/** Shipping details section. */
function renderShippingSection(order) {
  const o = order;
  const shipStage = getShipStageLabel(o);
  const shipMethod = getShipMethodLabel(o);

  return `
    <div style="margin-bottom:12px">
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:8px">🚚 الشحن</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-sm)">
        ${infoRow('طريقة الشحن', `${shipMethod.ico} ${esc(shipMethod.text)}`)}
        ${infoRow('حالة الشحن', `${shipStage.ico} ${esc(shipStage.text)}`)}
        ${o.shipCompanyName ? infoRow('شركة الشحن', esc(o.shipCompanyName)) : ''}
        ${o.trackingNumber ? infoRow('رقم التتبع', esc(o.trackingNumber)) : ''}
        ${o.deliveryAddress ? infoRow('العنوان', esc(o.deliveryAddress)) : ''}
        ${o.deliveryCity ? infoRow('المدينة', esc(o.deliveryCity)) : ''}
      </div>
    </div>`;
}

/** Cost items section. */
function renderCostsSection(order) {
  const ci = order.costItems || [];
  if (!ci.length) {
    return `
      <div style="margin-bottom:12px">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:8px">🧾 بنود التكلفة</div>
        <div style="font-size:var(--fs-sm);color:var(--dim2);padding:var(--space-sm);background:var(--bg3);border-radius:var(--rad)">لم تُسجَّل بنود تكلفة</div>
      </div>`;
  }

  const total = ci.reduce((s, c) => s + (parseFloat(c.total) || 0), 0);
  const rows = ci.map((c) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--bg3);border-radius:var(--rad);margin-bottom:4px">
      <div>
        <span style="font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--snow)">${esc(c.type || '—')}</span>
        ${c.supplierName ? `<span style="font-size:var(--fs-xs);color:var(--dim2);margin-right:6px">· ${esc(c.supplierName)}</span>` : ''}
      </div>
      <span style="font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--y)">${fmtCurrency(c.total || 0)} ج</span>
    </div>`,
  ).join('');

  return `
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2)">🧾 بنود التكلفة</div>
        <span style="font-size:var(--fs-xs);color:var(--y);font-weight:var(--fw-bold)">إجمالي: ${fmtCurrency(total)} ج</span>
      </div>
      ${rows}
    </div>`;
}

// ─── SECTION REGISTRY ──────────────────────────────────────────────────

const SECTIONS = {
  client: renderClientSection,
  products: renderProductsSection,
  financial: renderFinancialSection,
  timeline: renderTimelineSection,
  files: renderFilesSection,
  shipping: renderShippingSection,
  costs: renderCostsSection,
};

// ─── MAIN EXPORT ───────────────────────────────────────────────────────

/**
 * renderOrderPanel(order, options) — builds HTML for the order detail panel.
 *
 * @param {Object} order — the order document
 * @param {Object} [options]
 * @param {string[]} [options.sections] — which sections to render (default: client, products, financial)
 * @param {string}   [options.role]     — current user's role
 * @param {Object}   [options.capabilities] — user capabilities map
 * @param {Function} [options.canSeePhone]  — () => boolean
 * @param {Function} [options.showPhone]    — (phone) => string (masked or full)
 * @param {boolean}  [options.compact]      — compact mode (less spacing)
 * @param {boolean}  [options.showProgressBar] — show stageProgressBar at the top
 * @returns {string} HTML string (pure — no side effects)
 */
export function renderOrderPanel(order, options = {}) {
  if (!order) return '';

  const {
    sections = ['client', 'products', 'financial'],
    showProgressBar = false,
    compact = false,
  } = options;

  const padding = compact ? '8px 10px' : '10px 14px';
  const parts = [];

  // Optional stage progress bar at the top
  if (showProgressBar) {
    parts.push(stageProgressBar(order));
  }

  // Build sections
  const sectionHTML = sections
    .filter((s) => SECTIONS[s])
    .map((s) => SECTIONS[s](order, options))
    .join('');

  parts.push(sectionHTML);

  return `<div style="padding:${padding}">${parts.join('')}</div>`;
}

// ─── EXPOSE TO WINDOW (for non-module callers) ─────────────────────────

if (typeof window !== 'undefined') {
  window.renderOrderPanel = renderOrderPanel;
}
