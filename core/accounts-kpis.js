/**
 * Business2Card ERP — core/accounts-kpis.js
 *
 * ━━━ ACCOUNTS KPI AGGREGATORS (Phase-1 · accounts decomp) ━━━
 *
 * Pure aggregators for accounts page KPIs.
 */

const _getPaid = (o) => parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;

/** Total balance across all wallets. */
export function calcWalletBalanceTotal(wallets = []) {
  return wallets.reduce((s, w) => s + (parseFloat(w.balance) || 0), 0);
}

/**
 * Total in/out for transactions matched by a period predicate.
 * @returns {{income, expense, profit}}
 */
export function calcPeriodFlow(transactions = [], isInPeriod) {
  let income = 0, expense = 0;
  for (const t of transactions) {
    if (!isInPeriod(t.createdAt)) continue;
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'in') income += amt;
    else if (t.type === 'out') expense += amt;
  }
  return { income, expense, profit: income - expense };
}

/**
 * Pending revenue stats from active (non-archived) orders that have salePrice or paid.
 * @returns {{pendTotal, pendCount, remTotal}}
 */
export function calcPendingRevenue(activeOrders = [], calcRem = (o) => 0) {
  let pendTotal = 0, pendCount = 0, remTotal = 0;
  for (const o of activeOrders) {
    const sale = parseFloat(o.salePrice) || 0;
    const paid = _getPaid(o);
    if (sale > 0 || paid > 0) {
      pendTotal += paid;
      pendCount++;
      remTotal += calcRem(o);
    }
  }
  return { pendTotal, pendCount, remTotal };
}

/**
 * Earned revenue stats from archived orders that had a sale price.
 * @returns {{earnTotal, earnCount, archivedRemTotal}}
 */
export function calcEarnedRevenue(archivedOrders = [], calcRem = (o) => 0) {
  let earnTotal = 0, earnCount = 0, archivedRemTotal = 0;
  for (const o of archivedOrders) {
    const sale = parseFloat(o.salePrice) || 0;
    const paid = _getPaid(o);
    if (sale > 0) {
      earnTotal += paid;
      earnCount++;
    }
    archivedRemTotal += calcRem(o);
  }
  return { earnTotal, earnCount, archivedRemTotal };
}

/**
 * Outstanding debt owed by shipping companies (orders shipped but not settled, non-pickup).
 */
export function calcShippingDebt(allOrders = []) {
  return allOrders
    .filter(o =>
      o.shipCompanyName &&
      ['shipping', 'archived'].includes(o.stage) &&
      !o.shipSettled &&
      o.shipMethod !== 'pickup'
    )
    .reduce((s, o) => {
      const sale = parseFloat(o.salePrice) || 0;
      const disc = parseFloat(o.discount) || 0;
      const paid = _getPaid(o);
      return s + Math.max(0, sale - disc - paid);
    }, 0);
}

/**
 * Client debt — sum of remaining across orders NOT covered by shipping debt.
 */
export function calcClientDebt(allOrders = [], calcRem = (o) => 0) {
  return allOrders
    .filter(o => {
      const rem = calcRem(o);
      if (rem <= 0) return false;
      // Exclude orders covered by shipping debt
      if (o.shipCompanyName && ['shipping', 'archived'].includes(o.stage) &&
          !o.shipSettled && o.shipMethod !== 'pickup') return false;
      return true;
    })
    .reduce((s, o) => s + calcRem(o), 0);
}

/**
 * Total cost items across all orders.
 */
export function calcTotalOrderCosts(allOrders = []) {
  return allOrders.reduce((s, o) =>
    s + (o.costItems || []).reduce((cs, ci) => cs + (parseFloat(ci.total) || 0), 0)
  , 0);
}

/**
 * Supplier due = total cost items - sum of supplier_payments (clamped at 0).
 */
export function calcSupplierDue(allOrders = [], supplierPays = []) {
  const totalCosts = calcTotalOrderCosts(allOrders);
  const totalPaid = supplierPays.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  return Math.max(0, totalCosts - totalPaid);
}

/**
 * Shipping settlements collected in a period.
 */
export function calcShippingCollected(shippingSettlements = [], isInPeriod) {
  return shippingSettlements
    .filter(s => isInPeriod(s.createdAt))
    .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
}

/**
 * Audit wallet balances against transaction sums.
 * @returns {Array<{wallet, computed, drift}>}  drift = wallet.balance - computed
 */
export function auditWalletBalances(wallets = [], transactions = []) {
  const out = [];
  for (const w of wallets) {
    const ins = transactions
      .filter(t => t.walletId === w._id && t.type === 'in')
      .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const outs = transactions
      .filter(t => t.walletId === w._id && t.type === 'out')
      .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const computed = ins - outs;
    const balance = parseFloat(w.balance) || 0;
    out.push({ wallet: w, computed, balance, drift: balance - computed });
  }
  return out;
}
