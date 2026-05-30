/**
 * Business2Card ERP — core/shipping-utils.js
 *
 * ━━━ SHIPPING PURE UTILITIES (Phase-1 · shipping decomp) ━━━
 *
 * Pure helpers (read-only, no Firestore, no DOM mutations) for the shipping page.
 * Safe to extract — zero impact on chaos test coverage for financial ops.
 */

/**
 * Resolve the canonical delivery address for an order.
 * Prefers `deliveryAddress` {gov, city, street} written by the print operator
 * via prepareForShipping, then falls back to the historical flat fields
 * (shipGov / shipAddress / clientGov). Backward compatible (RULE 6).
 *
 * @returns {{gov, addr, full}}
 */
export function getDeliveryAddress(order) {
  if (!order) return { gov: '', addr: '', full: '' };
  const da = (order.deliveryAddress && typeof order.deliveryAddress === 'object')
    ? order.deliveryAddress : {};
  const gov = da.gov || order.shipGov || order.clientGov || '';
  const addr = [da.city, da.street || da.address].filter(Boolean).join('، ')
             || order.shipAddress || '';
  return { gov, addr, full: [gov, addr].filter(Boolean).join(' — ') };
}

/**
 * Is a timestamp from today (local date match)?
 */
export function isCreatedToday(ts, now = new Date()) {
  if (!ts) return false;
  const d = ts.toDate?.() || (typeof ts === 'string' ? new Date(ts) : ts);
  if (!(d instanceof Date) || isNaN(d.getTime())) return false;
  return d.getDate() === now.getDate() &&
         d.getMonth() === now.getMonth() &&
         d.getFullYear() === now.getFullYear();
}

/**
 * Customer context flags for a given order — counts + new/loyal/multiActive flags.
 *
 * @param {Object} order
 * @param {Array}  allOrders — all orders (used to find sibling orders for this client)
 *
 * @returns {{count, isNew, isLoyal, activeCount, multipleActive}}
 */
export function getCustomerContext(order, allOrders = []) {
  if (!order?.clientId) {
    return { count: 1, isNew: true, isLoyal: false, activeCount: 0, multipleActive: false };
  }
  const all = allOrders.filter(x => x.clientId === order.clientId);
  const active = all.filter(x => x.stage !== 'archived' && x.stage !== 'cancelled');
  return {
    count: all.length,
    isNew: all.length === 1,
    isLoyal: all.length >= 5,
    activeCount: active.length,
    multipleActive: active.length >= 2,
  };
}

/**
 * Is this order urgent in the shipping stage?
 * Per-substage thresholds (days):
 *   ready=2, wait_delivery=7, wait_collection=3, collected=5
 *
 * @returns {boolean}
 */
export function isUrgentOrder(order, now = Date.now()) {
  if (!order || order.stage !== 'shipping' || order.shipStage === 'returned') return false;
  const ref = order.shipDispatchedAt || order.shipDate || order.updatedAt;
  if (!ref) return false;
  const d = ref.toDate?.() || new Date(ref);
  if (isNaN(d.getTime())) return false;
  const days = (now - d.getTime()) / (1000 * 60 * 60 * 24);
  const ss = order.shipStage || 'ready';
  const thr = { ready: 2, wait_delivery: 7, wait_collection: 3, collected: 5 }[ss];
  return Boolean(thr && days >= thr);
}

/**
 * Render smart context badges for an order (today / new / loyal / multi-active / urgent).
 *
 * @returns {string} HTML
 */
export function renderSmartBadges(order, { allOrders = [], now = new Date() } = {}) {
  const ctx = getCustomerContext(order, allOrders);
  const out = [];
  if (isCreatedToday(order?.createdAt, now)) out.push('<span class="smart-bdg smart-bdg-today">📅 اليوم</span>');
  if (ctx.isNew) out.push('<span class="smart-bdg smart-bdg-new">🆕 عميل جديد</span>');
  else if (ctx.isLoyal) out.push(`<span class="smart-bdg smart-bdg-loyal">🔁 ${ctx.count} طلبات</span>`);
  if (ctx.multipleActive) out.push(`<span class="smart-bdg smart-bdg-multi">⊞ ${ctx.activeCount} طلب نشط</span>`);
  if (isUrgentOrder(order, now.getTime())) out.push('<span class="smart-bdg smart-bdg-urgent">⚡ عاجل</span>');
  if (isMissingShippingData(order)) out.push('<span class="smart-bdg smart-bdg-missing">⚠️ بيانات الشحن ناقصة</span>');
  return out.join('');
}

/**
 * Does an order in the shipping stage lack the shipping data the print operator
 * should have entered (method + delivery address for non-pickup)? Surfaces a
 * badge prompting manual entry on legacy orders that reached shipping before the
 * data-entry feature existed. Reads address via getDeliveryAddress so legacy
 * shipGov counts as present. pickup needs no address.
 *
 * @returns {boolean}
 */
export function isMissingShippingData(order) {
  if (!order || order.stage !== 'shipping') return false;
  if (!order.shipMethod) return true;
  if (order.shipMethod === 'pickup') return false;
  const { gov } = getDeliveryAddress(order);
  return !gov;
}

/**
 * Format Firestore Timestamp / Date / ISO-string → ar-EG short date.
 * Returns '—' on null/invalid.
 */
export function fmtTimestamp(ts) {
  if (!ts) return '—';
  const d = ts.toDate?.() || (typeof ts === 'string' ? new Date(ts) : ts);
  if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-EG');
}
