/**
 * Business2Card ERP — features/clients/new-order-form.js
 *
 * ━━━ NEW ORDER MODAL HELPERS (Phase-2C · clients god-page decomp) ━━━
 *
 * Pure helpers for the "new order" modal opened from a client panel:
 *   - buildDesignerOptions(designers, designLoad) → HTML
 *   - buildWalletOptionsHTML(wallets, format)      → HTML
 *   - getOrderTypePriceHint(stage)                 → string (hint label)
 *   - validateNewOrderForm({stage, products, salePrice}) → {ok, errors[]}
 *   - generateOrderId()                            → 'ORD-NNNNNNNN'
 *   - getOrderTypeCardClasses(stage)               → { design, printing } classes
 *
 * No DOM mutation, no Firestore. الصفحة تجمع inputs ثم تنادي الـ helpers.
 */

const defaultFormat = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build designer dropdown options with workload indicators.
 *
 * @param {Array} designers   — [{_id, name?, email?}]
 * @param {Object} designLoad — { [designerId]: number_of_active_design_orders }
 * @returns {string} HTML — starts with sentinel option
 */
export function buildDesignerOptions(designers = [], designLoad = {}) {
  const opts = designers.map(d => {
    const n = d.name || d.email || '—';
    const load = designLoad[d._id] || 0;
    const ico = load === 0 ? '🟢' : load <= 3 ? '🟡' : '🔴';
    return `<option value="${escAttr(d._id)}">${ico} ${escAttr(n)} — ${load} أوردر نشط</option>`;
  }).join('');
  return '<option value="">— بدون مصمم —</option>' + opts;
}

/**
 * Compute the active design load per designer from orders.
 *
 * @param {Array} orders — [{designerId, stage}]
 * @returns {Object} { [designerId]: count }
 */
export function computeDesignerLoad(orders = []) {
  const load = {};
  for (const o of orders) {
    if (o.designerId && o.stage === 'design') {
      load[o.designerId] = (load[o.designerId] || 0) + 1;
    }
  }
  return load;
}

/**
 * Build wallet dropdown options with balance label.
 *
 * @param {Array} wallets — [{_id, name, balance?}]
 * @param {Function} [format]
 * @returns {string} HTML — starts with sentinel option
 */
export function buildWalletOptionsHTML(wallets = [], format = defaultFormat) {
  const opts = wallets.map(w =>
    `<option value="${escAttr(w._id)}">${escAttr(w.name)} (${format(w.balance || 0)} ج)</option>`
  ).join('');
  return '<option value="">— اختر المحفظة —</option>' + opts;
}

/**
 * Get the price-hint label for a given order type.
 *  - 'design'   → اختياري
 *  - 'printing' → إجباري
 *  - other      → empty
 */
export function getOrderTypePriceHint(stage) {
  if (stage === 'design')   return '(اختياري — يمكن تحديده لاحقاً)';
  if (stage === 'printing') return '(إجباري)';
  return '';
}

/**
 * Get CSS class strings for the two type-card buttons given the selected stage.
 *
 * @returns {{ design: string, printing: string }}
 */
export function getOrderTypeCardClasses(stage) {
  return {
    design:   'type-card' + (stage === 'design'   ? ' sel-design'   : ''),
    printing: 'type-card' + (stage === 'printing' ? ' sel-printing' : ''),
  };
}

/**
 * Validate new-order form inputs before submission.
 *
 * @param {Object} args
 * @param {string} args.stage          — 'design' | 'printing' | ''
 * @param {Array}  args.products       — collected from DOM
 * @param {number} args.salePrice
 * @param {number} [args.deposit=0]
 * @param {string} [args.walletId='']
 *
 * @returns {{ ok: boolean, errors: string[], focusField?: string }}
 */
export function validateNewOrderForm({
  stage,
  products = [],
  salePrice = 0,
  deposit = 0,
  walletId = '',
  deadline = '',
  receiptCount = 0,
} = {}) {
  if (!stage) return { ok: false, errors: ['⚠️ اختر نوع الأوردر'] };
  if (!products.length) return { ok: false, errors: ['⚠️ أضف منتجاً على الأقل'] };
  if (stage === 'printing' && parseFloat(salePrice) <= 0) {
    return { ok: false, errors: ['⚠️ يجب إدخال سعر الأوردر'], focusField: 'no-sale-price' };
  }
  if (!deadline) {
    return { ok: false, errors: ['⚠️ موعد التسليم مطلوب'], focusField: 'no-deadline' };
  }
  if (parseFloat(deposit) > 0 && !walletId) {
    return { ok: false, errors: ['⚠️ اختر المحفظة للعربون'] };
  }
  if (parseFloat(deposit) > 0 && parseInt(receiptCount) <= 0) {
    return {
      ok: false,
      errors: ['⚠️ ارفع صورة التحويل/الإيصال للعربون'],
      focusField: 'no-receipt-zone',
    };
  }
  return { ok: true, errors: [] };
}

/**
 * Generate a stable client-side order id (used for storage paths + display).
 * Format: 'ORD-' + last 8 digits of Date.now().
 */
export function generateOrderId(now = Date.now) {
  const t = typeof now === 'function' ? now() : now;
  return 'ORD-' + String(t).slice(-8);
}
