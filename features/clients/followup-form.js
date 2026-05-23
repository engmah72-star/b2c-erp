/**
 * Business2Card ERP — features/clients/followup-form.js
 *
 * ━━━ FOLLOWUP FORM HELPERS (Phase-2B · clients god-page decomp) ━━━
 *
 * Pure helpers for the client-followup modal:
 *   - buildFollowupOrderOptions(orders, stageAr) → HTML string
 *   - buildFollowupPayload(args) → data object for clientActions.saveFollowup
 *   - getFollowupRatingLabel(n) → label string (— / ⭐ ضعيف / ⭐⭐ مقبول / …)
 *
 * No DOM, no Firestore. الصفحة تجمع inputs ثم تنادي الـ pure helpers.
 */

const RATING_LABELS = {
  0: '— غير مُقيَّم —',
  1: '⭐ ضعيف',
  2: '⭐⭐ مقبول',
  3: '⭐⭐⭐ جيد',
  4: '⭐⭐⭐⭐ ممتاز',
  5: '⭐⭐⭐⭐⭐ رائع',
};

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Get the human label for a 0-5 star rating value.
 * Clamps to 0..5.
 */
export function getFollowupRatingLabel(n) {
  const val = Math.max(0, Math.min(5, parseInt(n) || 0));
  return RATING_LABELS[val] || RATING_LABELS[0];
}

/**
 * Build the `<option>` list for the followup → order dropdown.
 * Sorts by `createdAt.seconds` desc (most recent first).
 *
 * @param {Array} orders   — pre-filtered client orders
 * @param {Object} stageAr — STAGE_AR map (key → Arabic label)
 * @returns {string} HTML (starts with the "no order" sentinel option)
 */
export function buildFollowupOrderOptions(orders = [], stageAr = {}) {
  const sorted = orders.slice().sort((a, b) =>
    (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
  );
  return '<option value="">— لا يخص أوردر معيّن —</option>' +
    sorted.map(o => {
      const nm = o.product ||
        (o.products || []).map(p => p.name + '×' + p.qty).join(' + ') || '—';
      const code = o.orderId || (o._id ? o._id.slice(-6) : '');
      const stage = stageAr[o.stage] || o.stage || '';
      return `<option value="${escAttr(o._id)}">${escAttr(code)} · ${escAttr(nm)} · ${escAttr(stage)}</option>`;
    }).join('');
}

/**
 * Build the full followup payload for clientActions.saveFollowup.
 * Computes orderCode + productName snapshots from the linked order.
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {string} [args.clientName]
 * @param {string} args.type           — 'call' | 'visit' | 'message' | ...
 * @param {string} [args.outcome]
 * @param {string} [args.note]
 * @param {string} [args.orderId]      — linked order (or '')
 * @param {Object} [args.linkedOrder]  — pre-loaded order object for snapshot
 * @param {number} [args.productRating=0]
 * @param {string} [args.productReview]
 * @param {string} [args.nextActionDateRaw] — date input value (local datetime)
 * @param {boolean} [args.nextActionDone]
 * @param {string} args.assignedTo
 * @param {string} [args.assignedToName]
 *
 * @returns {Object} payload
 */
export function buildFollowupPayload({
  clientId, clientName = '',
  type, outcome = '', note = '',
  orderId = '', linkedOrder = null,
  productRating = 0, productReview = '',
  nextActionDateRaw = '', nextActionDone = false,
  assignedTo, assignedToName = '',
}) {
  let orderCode = '', productName = '';
  if (orderId && linkedOrder) {
    orderCode = linkedOrder.orderId ||
      (linkedOrder._id ? linkedOrder._id.slice(-6) : '');
    productName = linkedOrder.product ||
      (linkedOrder.products || []).map(p => p.name + '×' + p.qty).join(' + ') || '';
  }
  return {
    clientId,
    clientName,
    type,
    outcome,
    note: (note || '').trim(),
    orderId: orderId || '',
    orderCode,
    productName,
    productRating: parseInt(productRating) || 0,
    productReview: (productReview || '').trim(),
    nextActionDate: nextActionDateRaw ? new Date(nextActionDateRaw).toISOString() : '',
    nextActionDone: !!(nextActionDone || !nextActionDateRaw),
    assignedTo,
    assignedToName,
  };
}
