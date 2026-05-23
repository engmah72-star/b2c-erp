/**
 * Business2Card ERP — core/reports-collection-stats.js
 *
 * ━━━ COLLECTION (AR) TAB AGGREGATOR (Phase-1F · reports god-page decomp) ━━━
 *
 * Pure aggregator for the collection tab — sums, status counts, stage counts,
 * critical post-design, aging buckets, flag counts, sort, per-client rollup.
 */

const _getPaid = (o) =>
  parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;

const _ageBucketFor = (days) => {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
};

/**
 * Sort and aggregate the collection tab dataset.
 *
 * @param {Object} args
 * @param {Array}    args.orders              — filtered orders (typically by date range)
 * @param {Function} args.calcRem             — (order) → number
 * @param {Function} [args.daysSince]         — (timestamp) → days
 * @param {Function} [args.isStaleOrder]      — (order) → boolean
 * @param {Function} [args.isMissingCost]     — (order) → boolean
 * @param {string}   [args.sortKey='date']    — date | client | sale | paid | rem
 * @param {string}   [args.sortDir='desc']    — asc | desc
 *
 * @returns {{
 *   sorted: Array,             // orders with salePrice > 0, sorted
 *   isEmpty: boolean,
 *   totals: { sale, paid, rem, cost, profit },
 *   counts: { fullPaid, partial, noPay, staleCount, noCostCount },
 *   stageCounts: { design, printing, production, shipping, archived },
 *   postDesignWithRem: Array,
 *   postDesignAmount: number,
 *   aging: { '0-30':{n,a}, '31-60':{n,a}, '61-90':{n,a}, '90+':{n,a} },
 * }}
 */
export function buildCollectionStats({
  orders = [],
  calcRem = (o) => parseFloat(o.remaining) || 0,
  daysSince = () => 0,
  isStaleOrder = () => false,
  isMissingCost = () => false,
  sortKey = 'date',
  sortDir = 'desc',
}) {
  const withSale = orders.filter(o => parseFloat(o.salePrice) > 0);
  if (!withSale.length) {
    return {
      sorted: [], isEmpty: true,
      totals: { sale: 0, paid: 0, rem: 0, cost: 0, profit: 0 },
      counts: { fullPaid: 0, partial: 0, noPay: 0, staleCount: 0, noCostCount: 0 },
      stageCounts: { design: 0, printing: 0, production: 0, shipping: 0, archived: 0 },
      postDesignWithRem: [], postDesignAmount: 0,
      aging: { '0-30': {n:0,a:0}, '31-60': {n:0,a:0}, '61-90': {n:0,a:0}, '90+': {n:0,a:0} },
    };
  }

  // Sort
  const dir = sortDir === 'asc' ? 1 : -1;
  const sortFns = {
    date:   (a, b) => ((a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)) * dir,
    client: (a, b) => ((a.clientName || '').localeCompare(b.clientName || '', 'ar')) * dir,
    sale:   (a, b) => ((parseFloat(a.salePrice) || 0) - (parseFloat(b.salePrice) || 0)) * dir,
    paid:   (a, b) => (_getPaid(a) - _getPaid(b)) * dir,
    rem:    (a, b) => (calcRem(a) - calcRem(b)) * dir,
  };
  const sorted = withSale.slice().sort(sortFns[sortKey] || sortFns.date);

  // Totals
  const totSale = withSale.reduce((s, o) => s + (parseFloat(o.salePrice) || 0), 0);
  const totPaid = withSale.reduce((s, o) => s + _getPaid(o), 0);
  const totRem  = withSale.reduce((s, o) => s + calcRem(o), 0);
  const totCost = withSale.reduce((s, o) =>
    s + (o.costItems || []).reduce((cs, c) => cs + (parseFloat(c.total) || 0), 0)
  , 0);
  const totProfit = totPaid - totCost;

  // Payment status counts
  const fullPaid = withSale.filter(o => calcRem(o) <= 0).length;
  const partial = withSale.filter(o => _getPaid(o) > 0 && calcRem(o) > 0).length;
  const noPay = withSale.filter(o => _getPaid(o) <= 0).length;

  // Stage counts
  const stageCounts = {
    design:     withSale.filter(o => o.stage === 'design').length,
    printing:   withSale.filter(o => o.stage === 'printing').length,
    production: withSale.filter(o => o.stage === 'production').length,
    shipping:   withSale.filter(o => o.stage === 'shipping').length,
    archived:   withSale.filter(o => o.stage === 'archived').length,
  };

  // Critical: post-design with remaining
  const postDesignWithRem = withSale.filter(o =>
    ['printing', 'production', 'shipping'].includes(o.stage) && calcRem(o) > 0
  );
  const postDesignAmount = postDesignWithRem.reduce((s, o) => s + calcRem(o), 0);

  // Aging buckets
  const aging = { '0-30': {n:0,a:0}, '31-60': {n:0,a:0}, '61-90': {n:0,a:0}, '90+': {n:0,a:0} };
  for (const o of withSale) {
    const r = calcRem(o);
    if (r <= 0) continue;
    const b = _ageBucketFor(daysSince(o.createdAt));
    aging[b].n++;
    aging[b].a += r;
  }

  // Flag counts
  const noCostCount = withSale.filter(isMissingCost).length;
  const staleCount  = withSale.filter(isStaleOrder).length;

  return {
    sorted, isEmpty: false,
    totals: { sale: totSale, paid: totPaid, rem: totRem, cost: totCost, profit: totProfit },
    counts: { fullPaid, partial, noPay, staleCount, noCostCount },
    stageCounts,
    postDesignWithRem,
    postDesignAmount,
    aging,
  };
}

/**
 * Per-client rollup of orders (used by "by client" view in collection tab).
 *
 * @param {Object} args
 * @param {Array}    args.orders
 * @param {Function} args.calcRem
 * @param {Function} [args.isStaleOrder]
 * @param {Function} [args.isMissingCost]
 *
 * @returns {Array<{name, phone, count, sale, paid, rem, lastTs, stale, noCost}>}
 *   sorted by remaining (desc)
 */
export function buildCollectionByClient({
  orders = [],
  calcRem = (o) => parseFloat(o.remaining) || 0,
  isStaleOrder = () => false,
  isMissingCost = () => false,
}) {
  const map = {};
  for (const o of orders) {
    const k = o.clientId || o.clientName || '—';
    if (!map[k]) map[k] = {
      name: o.clientName || '—', phone: o.clientPhone || '',
      count: 0, sale: 0, paid: 0, rem: 0, lastTs: 0,
      stale: 0, noCost: 0,
    };
    const r = map[k];
    r.count++;
    r.sale += parseFloat(o.salePrice) || 0;
    r.paid += _getPaid(o);
    r.rem  += calcRem(o);
    const ts = o.updatedAt?.seconds || o.createdAt?.seconds || 0;
    if (ts > r.lastTs) r.lastTs = ts;
    if (isStaleOrder(o)) r.stale++;
    if (isMissingCost(o)) r.noCost++;
  }
  return Object.values(map).sort((a, b) => b.rem - a.rem);
}
