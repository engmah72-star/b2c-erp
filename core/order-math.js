/**
 * Business2Card ERP — core/order-math.js
 *
 * ━━━ ORDER MATH HELPERS (RULE C2 · L1.5) ━━━
 *
 * Pure helpers used across many pages to compute order-level money fields.
 * Single Source of Truth — historically duplicated byte-identically in
 * reports.html / shipping-dashboard.html / cs-dashboard.html / accounts.html /
 * ops-dashboard.html / exec-dashboard.html.
 *
 * NOTE: archive.html uses a variant that delegates to calcSale/calcPaid;
 * shipping-followup.html uses a multi-line variant. Both kept local for now.
 */

/**
 * Remaining customer balance for an order:
 *   sale + customerShipFee − discount − totalPaid (clamp ≥ 0).
 *
 * Returns 0 when the order is fully returned (paymentStatus or shipStage).
 *
 * Memoized: keyed by (id + affecting fields). Auto-invalidates when any
 * field value changes. Bounded to 10 000 entries then cleared.
 *
 * @param {object} o — order document
 * @returns {number}
 */
const _remCache = new Map();
const _REM_MAX = 10000;

export const calcRem = (o) => {
  if (o.paymentStatus === 'returned' || o.shipStage === 'returned') return 0;
  const key = `${o._id}|${o.totalPaid}|${o.paid}|${o.deposit}|${o.salePrice}|${o.discount}|${o.customerShipFee}`;
  const hit = _remCache.get(key);
  if (hit !== undefined) return hit;
  const f = parseFloat(o.customerShipFee) || 0;
  const v = Math.max(
    0,
    (parseFloat(o.salePrice) || 0)
      + f
      - (parseFloat(o.discount) || 0)
      - (parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0),
  );
  if (_remCache.size >= _REM_MAX) _remCache.clear();
  _remCache.set(key, v);
  return v;
};

/**
 * Stages after the design phase where production/shipping work happens.
 * An order here with a positive customer balance is "critical collection"
 * (money owed while the order has already left design). RULE C2 — no magic
 * stage arrays scattered across pages.
 * @type {string[]}
 */
export const POST_DESIGN_STAGES = ['printing', 'production', 'shipping'];

/**
 * Is this a real (priced) order, past design, that still owes a balance?
 *   salePrice > 0 AND stage ∈ POST_DESIGN_STAGES AND calcRem(o) > 0.
 *
 * Single definition for the "critical post-design with remaining" rule used
 * by the collection badge + priority alerts. (Pure aggregator modules in
 * core/reports-*.js intentionally inline this instead — they receive calcRem
 * via dependency-injection to stay import-free and unit-testable.)
 *
 * @param {object} o — order document
 * @returns {boolean}
 */
export const isPostDesignWithRem = (o) =>
  (parseFloat(o?.salePrice) || 0) > 0
  && POST_DESIGN_STAGES.includes(o?.stage)
  && calcRem(o) > 0;

/**
 * Gross order total = salePrice + customerShipFee − discount (clamp ≥ 0).
 * The total the customer owes before any payment.
 *
 * @param {object} o — order document
 * @returns {number}
 */
export const orderGrossTotal = (o) => {
  const sale     = parseFloat(o?.salePrice)       || 0;
  const custShip = parseFloat(o?.customerShipFee) || 0;
  const disc     = parseFloat(o?.discount)        || 0;
  return Math.max(0, sale + custShip - disc);
};

/**
 * Has the customer fully paid this order (money already in our wallet)?
 *   totalPaid (or deposit fallback) covers the gross total.
 *
 * Used to exclude company-shipping orders from settlement: if the customer
 * already paid us in full, there's no money sitting at the shipping company
 * to settle — re-settling would double-credit the wallet. (Guards the bug
 * where an order paid via direct-collect still showed in the settle tab.)
 *
 * @param {object} o — order document
 * @returns {boolean} false when gross is 0 (nothing to pay)
 */
export const isFullyPaid = (o) => {
  const gross = orderGrossTotal(o);
  if (gross <= 0) return false;
  const paid = parseFloat(o?.totalPaid) || parseFloat(o?.deposit) || 0;
  return paid >= gross - 0.01;
};

/**
 * Net amount the shipping company owes us for this order = collected − cost.
 *
 *   collected = shipCollected, OR — if the "confirm collection" step was
 *   skipped (shipCollected = 0) while the customer still owes a balance —
 *   the company collects the customer's remaining (sale + ship − disc − paid).
 *   This fallback prevents settlement from computing 0 and failing to close
 *   the order. (Mirrors calcRem's customer-remaining formula.)
 *
 *   cost = shippingCost (what we pay the company).
 *
 * @param {object} o — order document
 * @returns {number} clamp ≥ 0
 */
export const expectedFromCompany = (o) => {
  let collected = parseFloat(o?.shipCollected) || 0;
  if (collected <= 0) {
    const sale = parseFloat(o?.salePrice)       || 0;
    const cust = parseFloat(o?.customerShipFee) || 0;
    const disc = parseFloat(o?.discount)        || 0;
    const paid = parseFloat(o?.totalPaid) || parseFloat(o?.deposit) || 0;
    collected = Math.max(0, sale + cust - disc - paid);
  }
  const cost = parseFloat(o?.shippingCost) || 0;
  return Math.max(0, collected - cost);
};
