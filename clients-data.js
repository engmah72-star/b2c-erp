/**
 * Business2Card ERP — clients-data.js
 *
 * ━━━ PURE STATISTICS + AGGREGATIONS FOR clients.html ━━━
 *
 * God-page decomposition (RULE G5 + L1): the clients page used to
 * inline a 90-line `updateStats()` function that mixed data
 * computation with DOM writes. This module exposes the pure
 * computation; the page wrapper does the DOM writes.
 *
 * No Firestore reads, no DOM writes — pure functions over the
 * `clients` + `allOrders` arrays already loaded by clients.html.
 */

/**
 * computeClientStats({clients, orders, calcRem, ordersIndex}) → stats
 *
 * Returns the entire stats payload `updateStats` needs in one pass:
 *   - top totals (sales / remaining / count)
 *   - time-period buckets (today / yesterday / week / month / lastMonth)
 *   - month-over-month delta (count %)
 *   - quick-filter counts (all / vip / active / rem / risk / new / sleep)
 *
 * ordersIndex is the pre-built `Map<clientId, orders[]>` (page calls
 * buildClientOrdersIndex() and passes it in for O(N) quick-filter scan).
 *
 * @param {Object}  args
 * @param {Array}   args.clients      — all clients
 * @param {Array}   args.orders       — all orders (filtered to clients' own)
 * @param {(o:any)=>number} args.calcRem  — page's remaining-balance fn
 * @param {Map<string, Array>} args.ordersIndex — clientId → orders[]
 * @returns {{
 *   totals: {sales:number, rem:number, clientCount:number},
 *   periods: {today, yesterday, week, month, lastMonth: {n:number,r:number}},
 *   monthDelta: {pct:number|null, direction:'up'|'down'|null},
 *   quickFilters: {all,vip,active,rem,risk,new,sleep},
 * }}
 */
export function computeClientStats({
  clients = [],
  orders: allOrders = [],
  calcRem = () => 0,
  ordersIndex = new Map(),
} = {}) {
  // ── Top totals (client-owned orders only) ──
  const cIds = new Set(clients.map(c => c._id));
  const myOrders = (allOrders || []).filter(o =>
    cIds.has(o.clientId) ||
    (o.clientPhone && clients.find(c => c.phone1 === o.clientPhone))
  );
  const sumPaid = (arr) =>
    arr.reduce((s, o) =>
      s + (parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0), 0);
  const sales = sumPaid(myOrders);
  const rem   = myOrders.reduce((s, o) => s + calcRem(o), 0);

  // ── Time-period boundaries ──
  const now             = new Date();
  const todayStart      = new Date(); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart  = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart       = new Date(todayStart); weekStart.setDate(weekStart.getDate() - todayStart.getDay());
  const monthStart      = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd    = new Date(now.getFullYear(), now.getMonth(), 1);

  const clientInRange = (c, from, to) => {
    const ts = c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000) : null;
    if (!ts) return false;
    return ts >= from && (!to || ts < to);
  };
  const ordersInRange = (from, to) => myOrders.filter(o => {
    const t = o.createdAt?.toDate?.()?.getTime() || ((o.createdAt?.seconds || 0) * 1000);
    return t >= from.getTime() && (!to || t < to.getTime());
  });

  const todayC     = clients.filter(c => clientInRange(c, todayStart));
  const yestC      = clients.filter(c => clientInRange(c, yesterdayStart, todayStart));
  const weekC      = clients.filter(c => clientInRange(c, weekStart));
  const monthC     = clients.filter(c => clientInRange(c, monthStart));
  const lastMonthC = clients.filter(c => clientInRange(c, lastMonthStart, lastMonthEnd));

  const periods = {
    today:     { n: todayC.length,     r: sumPaid(ordersInRange(todayStart,     null)) },
    yesterday: { n: yestC.length,      r: sumPaid(ordersInRange(yesterdayStart, todayStart)) },
    week:      { n: weekC.length,      r: sumPaid(ordersInRange(weekStart,      null)) },
    month:     { n: monthC.length,     r: sumPaid(ordersInRange(monthStart,     null)) },
    lastMonth: { n: lastMonthC.length, r: sumPaid(ordersInRange(lastMonthStart, lastMonthEnd)) },
  };

  // Month-over-month count delta
  let monthDelta = { pct: null, direction: null };
  if (lastMonthC.length > 0) {
    const diff = Math.round(((monthC.length - lastMonthC.length) / lastMonthC.length) * 100);
    monthDelta = { pct: diff, direction: diff >= 0 ? 'up' : 'down' };
  }

  // ── Quick-filter counts (uses pre-built ordersIndex for O(N)) ──
  const nowSec = Date.now() / 1000;
  let nVip = 0, nActive = 0, nRem = 0, nRisk = 0, nNew = 0, nSleep = 0;
  for (const c of clients) {
    if (c.status === 'legacy') continue;
    const ords = ordersIndex.get(c._id) || [];
    let cRem = 0, hasAct = false, lastTs = 0;
    for (const o of ords) {
      cRem += calcRem(o);
      if (o.stage !== 'archived') hasAct = true;
      const t = o.createdAt?.seconds || 0;
      if (t > lastTs) lastTs = t;
    }
    const daysSince = lastTs ? Math.floor((nowSec - lastTs) / 86400) : 999;
    if (ords.length >= 3)              nVip++;
    if (hasAct)                        nActive++;
    if (cRem > 0)                      nRem++;
    if (daysSince >= 30 && daysSince < 90) nRisk++;
    if (clientInRange(c, weekStart))   nNew++;
    if (daysSince >= 90 && daysSince < 999) nSleep++;
  }

  return {
    totals: { sales, rem, clientCount: clients.length },
    periods,
    monthDelta,
    quickFilters: {
      all:    clients.filter(c => c.status !== 'legacy').length,
      vip:    nVip,
      active: nActive,
      rem:    nRem,
      risk:   nRisk,
      new:    nNew,
      sleep:  nSleep,
    },
  };
}

// ─── SIDE-EFFECT: expose to window for compat (clients.html) ─────────
if (typeof window !== 'undefined') {
  Object.assign(window, { computeClientStats });
}
