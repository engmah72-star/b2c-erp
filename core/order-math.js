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
 * @param {object} o — order document
 * @returns {number}
 */
export const calcRem = (o) => {
  if (o.paymentStatus === 'returned' || o.shipStage === 'returned') return 0;
  const f = parseFloat(o.customerShipFee) || 0;
  return Math.max(
    0,
    (parseFloat(o.salePrice) || 0)
      + f
      - (parseFloat(o.discount) || 0)
      - (parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0),
  );
};
