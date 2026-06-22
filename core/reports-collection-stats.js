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

function _buildInsights() { return []; }

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
 *   sorted: Array,
 *   isEmpty: boolean,
 *   totals: { sale, paid, rem, cost, profit },
 *   counts: { fullPaid, partial, noPay, staleCount, noCostCount },
 *   stageCounts: { design, printing, production, shipping, archived },
 *   postDesignWithRem: Array,
 *   postDesignAmount: number,
 *   aging: { '0-30':{n,a}, '31-60':{n,a}, '61-90':{n,a}, '90+':{n,a} },
 *   collectionRate: number,
 *   shippingCompanyDebt: Object.<string,{count:number,amount:number}>,
 *   totalShippingDebt: number,
 *   insights: Array<{type:string,cls:string,icon:string,text:string}>,
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
  const _empty = {
    sorted: [], isEmpty: true,
    totals: { sale: 0, paid: 0, rem: 0, cost: 0, profit: 0 },
    counts: { fullPaid: 0, partial: 0, noPay: 0, staleCount: 0, noCostCount: 0 },
    stageCounts: { design: 0, printing: 0, production: 0, shipping: 0, archived: 0 },
    postDesignWithRem: [], postDesignAmount: 0,
    aging: { '0-30': {n:0,a:0}, '31-60': {n:0,a:0}, '61-90': {n:0,a:0}, '90+': {n:0,a:0} },
    collectionRate: 0,
    shippingCompanyDebt: {}, totalShippingDebt: 0,
    insights: [],
  };
  if (!withSale.length) return _empty;

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

  // Collection rate
  const collectionRate = totSale > 0 ? Math.round(totPaid / totSale * 100) : 0;

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

  // Shipping company debt (company-method orders not yet settled)
  const shippingCompanyDebt = {};
  for (const o of withSale) {
    if (o.shipMethod !== 'company' || o.shipSettled) continue;
    const rem = calcRem(o);
    if (rem <= 0) continue;
    const company = o.shipCompanyName || 'غير محدد';
    if (!shippingCompanyDebt[company]) shippingCompanyDebt[company] = { count: 0, amount: 0 };
    shippingCompanyDebt[company].count++;
    shippingCompanyDebt[company].amount += rem;
  }
  const totalShippingDebt = Object.values(shippingCompanyDebt)
    .reduce((s, c) => s + c.amount, 0);

  // Smart insights
  const insights = _buildInsights({
    withSale, collectionRate, totRem, totPaid, totCost, totProfit,
    postDesignWithRem, postDesignAmount,
    fullPaid, partial, noPay, staleCount, noCostCount,
    aging, totalShippingDebt, calcRem, daysSince,
  });

  return {
    sorted, isEmpty: false,
    totals: { sale: totSale, paid: totPaid, rem: totRem, cost: totCost, profit: totProfit },
    counts: { fullPaid, partial, noPay, staleCount, noCostCount },
    stageCounts,
    postDesignWithRem,
    postDesignAmount,
    aging,
    collectionRate,
    shippingCompanyDebt,
    totalShippingDebt,
    insights,
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

/**
 * Stages from production onwards — used for collection tracking.
 * User requirement: "نحسب من أول مرحلة التنفيذ".
 * @type {string[]}
 */
export const PRODUCTION_ONWARDS_STAGES = ['production', 'shipping', 'archived'];

/**
 * Daily collection summary with trends and comparison.
 *
 * @param {Object} args
 * @param {Array}    args.transactions  — transactions_v2 snapshot
 * @param {Array}    args.orders        — all orders
 * @param {Function} args.calcRem       — (order) → number
 *
 * @returns {{
 *   todayCol: number, yesterdayCol: number,
 *   last7Col: number, prev7Col: number,
 *   dailyBreakdown: Array<{date:Date,label:string,amount:number}>,
 *   avg7: number,
 *   totalRemProd: number, totalSaleProd: number, totalPaidProd: number,
 *   collectionPct: number, prodOrderCount: number,
 * }}
 */
export function buildDailyCollectionSummary({
  transactions = [],
  orders = [],
  calcRem = (o) => parseFloat(o.remaining) || 0,
}) {
  const isCollection = (t) =>
    t.type === 'in' || ['collection', 'advance', 'deposit'].includes(t.category);

  const txInRange = (t, from, to) => {
    const s = t.createdAt?.seconds || 0;
    if (!s) return false;
    const ms = s * 1000;
    return ms >= from.getTime() && ms <= to.getTime();
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayEnd = new Date(yesterday);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const sumTx = (arr) =>
    arr.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

  const todayCol = sumTx(
    transactions.filter((t) => isCollection(t) && txInRange(t, today, todayEnd)),
  );
  const yesterdayCol = sumTx(
    transactions.filter(
      (t) => isCollection(t) && txInRange(t, yesterday, yesterdayEnd),
    ),
  );

  const last7Start = new Date(today);
  last7Start.setDate(last7Start.getDate() - 6);
  const last7Col = sumTx(
    transactions.filter(
      (t) => isCollection(t) && txInRange(t, last7Start, todayEnd),
    ),
  );

  const prev7Start = new Date(today);
  prev7Start.setDate(prev7Start.getDate() - 13);
  const prev7End = new Date(today);
  prev7End.setDate(prev7End.getDate() - 7);
  prev7End.setHours(23, 59, 59, 999);
  const prev7Col = sumTx(
    transactions.filter(
      (t) => isCollection(t) && txInRange(t, prev7Start, prev7End),
    ),
  );

  const dailyBreakdown = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(today);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const dayCol = sumTx(
      transactions.filter(
        (t) => isCollection(t) && txInRange(t, dayStart, dayEnd),
      ),
    );
    dailyBreakdown.push({
      date: dayStart,
      label: dayStart.toLocaleDateString('ar-EG', {
        weekday: 'short',
        day: 'numeric',
      }),
      amount: dayCol,
    });
  }

  const prodOrders = orders.filter((o) =>
    PRODUCTION_ONWARDS_STAGES.includes(o.stage),
  );
  const totalSaleProd = prodOrders.reduce(
    (s, o) => s + (parseFloat(o.salePrice) || 0),
    0,
  );
  const totalPaidProd = prodOrders.reduce((s, o) => s + _getPaid(o), 0);
  const totalRemProd = prodOrders.reduce((s, o) => s + calcRem(o), 0);
  const collectionPct =
    totalSaleProd > 0 ? Math.round((totalPaidProd / totalSaleProd) * 100) : 0;

  return {
    todayCol,
    yesterdayCol,
    last7Col,
    prev7Col,
    dailyBreakdown,
    avg7: last7Col / 7,
    totalRemProd,
    totalSaleProd,
    totalPaidProd,
    collectionPct,
    prodOrderCount: prodOrders.length,
  };
}

/**
 * Detailed aging report with per-client breakdown.
 * Only includes orders from production stage onwards with remaining > 0.
 *
 * @param {Object} args
 * @param {Array}    args.orders
 * @param {Function} args.calcRem
 * @param {Function} [args.daysSince]
 *
 * @returns {{
 *   buckets: Object,
 *   grandTotal: number,
 *   totalOrders: number,
 * }}
 */
export function buildAgingDetailed({
  orders = [],
  calcRem = (o) => parseFloat(o.remaining) || 0,
  daysSince = () => 0,
}) {
  const prodOrders = orders.filter(
    (o) => PRODUCTION_ONWARDS_STAGES.includes(o.stage) && calcRem(o) > 0,
  );

  const buckets = {
    '0-30': { label: 'حديث', orders: [], total: 0, color: 'var(--g)', clients: {} },
    '31-60': { label: 'متوسط', orders: [], total: 0, color: 'var(--y)', clients: {} },
    '61-90': { label: 'متأخر', orders: [], total: 0, color: '#ff8a4a', clients: {} },
    '90+': { label: 'حرج جداً', orders: [], total: 0, color: 'var(--r)', clients: {} },
  };

  for (const o of prodOrders) {
    const rem = calcRem(o);
    const days = daysSince(o.createdAt);
    const key = _ageBucketFor(days);
    const bucket = buckets[key];
    bucket.orders.push(o);
    bucket.total += rem;

    const clientKey = o.clientId || o.clientName || '—';
    if (!bucket.clients[clientKey]) {
      bucket.clients[clientKey] = {
        name: o.clientName || '—',
        phone: o.clientPhone || '',
        count: 0,
        rem: 0,
      };
    }
    bucket.clients[clientKey].count++;
    bucket.clients[clientKey].rem += rem;
  }

  for (const key of Object.keys(buckets)) {
    buckets[key].clientList = Object.values(buckets[key].clients).sort(
      (a, b) => b.rem - a.rem,
    );
    delete buckets[key].clients;
  }

  const grandTotal = prodOrders.reduce((s, o) => s + calcRem(o), 0);

  return { buckets, grandTotal, totalOrders: prodOrders.length };
}

/**
 * Collection grouped by shipping company.
 *
 * @param {Object} args
 * @param {Array}    args.orders
 * @param {Function} args.calcRem
 *
 * @returns {{
 *   list: Array<{name:string,count:number,sale:number,paid:number,rem:number,settled:number,unsettled:number,delivered:number,pending:number,pct:number}>,
 *   totals: {count:number,sale:number,paid:number,rem:number,settled:number,unsettled:number},
 * }}
 */
export function buildCollectionByShipper({
  orders = [],
  calcRem = (o) => parseFloat(o.remaining) || 0,
}) {
  const companyOrders = orders.filter(
    (o) => o.shipMethod === 'company' && o.shipCompanyName,
  );

  const map = {};
  for (const o of companyOrders) {
    const key = o.shipCompanyId || o.shipCompanyName;
    if (!map[key])
      map[key] = {
        name: o.shipCompanyName,
        count: 0,
        sale: 0,
        paid: 0,
        rem: 0,
        settled: 0,
        unsettled: 0,
        delivered: 0,
        pending: 0,
      };
    const r = map[key];
    r.count++;
    r.sale += parseFloat(o.salePrice) || 0;
    r.paid += _getPaid(o);
    r.rem += calcRem(o);

    if (o.shipSettled) r.settled++;
    else r.unsettled++;

    if (['delivered', 'collected', 'closed'].includes(o.shipStage))
      r.delivered++;
    else r.pending++;
  }

  const list = Object.values(map)
    .map((c) => ({
      ...c,
      pct: c.sale > 0 ? Math.round((c.paid / c.sale) * 100) : 0,
    }))
    .sort((a, b) => b.rem - a.rem);

  const totals = {
    count: companyOrders.length,
    sale: list.reduce((s, c) => s + c.sale, 0),
    paid: list.reduce((s, c) => s + c.paid, 0),
    rem: list.reduce((s, c) => s + c.rem, 0),
    settled: list.reduce((s, c) => s + c.settled, 0),
    unsettled: list.reduce((s, c) => s + c.unsettled, 0),
  };

  return { list, totals };
}
