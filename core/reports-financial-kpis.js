/**
 * Business2Card ERP — core/reports-financial-kpis.js
 *
 * ━━━ EXEC SUMMARY AGGREGATORS (Phase-1B · reports god-page decomp) ━━━
 *
 * Pure aggregators used by renderExec / monthly chart. No DOM, no Firestore.
 *
 * All inputs are arrays (transactions / orders / clients / suppliers / payments).
 * Caller passes in the date range computed by core/reports-date-filters.js.
 */

const _inRangeTx = (t, range) => {
  if (!range) return false;
  const sec = t?.createdAt?.seconds || 0;
  if (!sec) return false;
  const d = new Date(sec * 1000);
  return d >= range.from && d <= range.to;
};

/** Sum of {in, out, profit} for a transactions array within range. */
export function calcPeriodFlow(transactions = [], range) {
  let periodIn = 0, periodOut = 0;
  for (const t of transactions) {
    if (!_inRangeTx(t, range)) continue;
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'in') periodIn += amt;
    else if (t.type === 'out') periodOut += amt;
  }
  return { periodIn, periodOut, profit: periodIn - periodOut };
}

/** Order operational stats — active count + total remaining + late count. */
export function calcOrderStats(orders = [], calcRem = (o) => parseFloat(o.remaining) || 0) {
  const active = orders.filter(o => !['archived', 'cancelled'].includes(o.stage));
  const totalRem = active.reduce((s, o) => s + (parseFloat(calcRem(o)) || 0), 0);
  const now = new Date();
  const lateOrders = orders.filter(o =>
    o.deadline && new Date(o.deadline) < now && !['archived', 'shipping'].includes(o.stage)
  );
  return {
    totalOrders: orders.length,
    activeOrders: active,
    activeCount: active.length,
    activeWithRem: active.filter(o => (parseFloat(calcRem(o)) || 0) > 0).length,
    totalRem,
    lateOrders,
    lateCount: lateOrders.length,
  };
}

/** Count of clients created within range. */
export function calcNewClientsInRange(clients = [], range) {
  return clients.filter(c => _inRangeTx(c, range)).length;
}

/**
 * Monthly targets progress — achieved vs configured monthly target.
 *
 * - revenue achieved = sum of 'in' transactions within range (same source as
 *   the "إيرادات الشهر" KPI, via calcPeriodFlow).
 * - clients achieved = count of clients created within range.
 * - pct clamped to ≥ 0 (may exceed 100 to surface over-achievement).
 *
 * @returns {{
 *   revenueAchieved:number, revenueTarget:number, revenuePct:number,
 *   clientsAchieved:number, clientsTarget:number, clientsPct:number,
 *   hasTargets:boolean
 * }}
 */
export function calcTargetProgress({
  transactions = [], clients = [], range,
  revenueTarget = 0, clientTarget = 0,
} = {}) {
  const { periodIn } = calcPeriodFlow(transactions, range);
  const clientsAchieved = calcNewClientsInRange(clients, range);
  const rT = Math.max(0, parseFloat(revenueTarget) || 0);
  const cT = Math.max(0, parseFloat(clientTarget) || 0);
  const pct = (a, t) => (t > 0 ? Math.max(0, Math.round((a / t) * 100)) : 0);
  return {
    revenueAchieved: periodIn,
    revenueTarget: rT,
    revenuePct: pct(periodIn, rT),
    clientsAchieved,
    clientsTarget: cT,
    clientsPct: pct(clientsAchieved, cT),
    hasTargets: rT > 0 || cT > 0,
  };
}

/**
 * Total outstanding due to suppliers across all orders.
 * For each supplier: due = sum(orders.costItems where supplierId matches) - sum(payments)
 */
export function calcSupplierDue(suppliers = [], orders = [], payments = []) {
  return suppliers.reduce((s, sup) => {
    const paid = payments
      .filter(p => p.supplierId === sup._id)
      .reduce((ps, p) => ps + (parseFloat(p.amount) || 0), 0);
    const cost = orders.reduce((cs, o) =>
      cs + (o.costItems || [])
        .filter(ci => ci.supplierId === sup._id)
        .reduce((is, ci) => is + (parseFloat(ci.total) || 0), 0)
    , 0);
    return s + Math.max(0, cost - paid);
  }, 0);
}

/**
 * Count orders per stage key. Returns { key: count, ... } + total.
 *
 * @param {Array}  orders
 * @param {Array<string>} stageKeys — e.g. ['design','printing','production','shipping','archived']
 */
export function calcStageDistribution(orders = [], stageKeys = []) {
  const out = {};
  for (const k of stageKeys) {
    out[k] = orders.filter(o => o.stage === k).length;
  }
  return out;
}

/**
 * Top clients by revenue (sale price sum of their orders).
 * @returns {Array<{name, revenue, count, clientId}>}
 */
export function calcTopClientsByRevenue(orders = [], limit = 5) {
  const acc = {};
  for (const o of orders) {
    const id = o.clientId || o.clientName || '—';
    if (!acc[id]) acc[id] = { clientId: id, name: o.clientName || '—', revenue: 0, count: 0 };
    acc[id].revenue += parseFloat(o.salePrice) || 0;
    acc[id].count++;
  }
  return Object.values(acc).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/**
 * Top products by revenue. Aggregates across `order.products[]`.
 * @returns {Array<{name, qty, revenue}>}
 */
export function calcTopProductsByRevenue(orders = [], limit = 5) {
  const acc = {};
  for (const o of orders) {
    for (const p of (o.products || [])) {
      const name = p.name || '—';
      if (!acc[name]) acc[name] = { name, qty: 0, revenue: 0 };
      const qty = parseInt(p.qty) || 1;
      acc[name].qty += qty;
      acc[name].revenue += (parseFloat(p.price) || 0) * qty;
    }
  }
  return Object.values(acc).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/**
 * Top designers by archived orders. Falls back to designerName when id missing.
 * @returns {Array<{designerId, name, count}>}
 */
export function calcTopDesignersByCount(orders = [], limit = 5) {
  const acc = {};
  for (const o of orders) {
    if (o.stage !== 'archived' || !o.designerId) continue;
    const id = o.designerId;
    if (!acc[id]) acc[id] = { designerId: id, name: o.designerName || '—', count: 0 };
    acc[id].count++;
  }
  return Object.values(acc).sort((a, b) => b.count - a.count).slice(0, limit);
}

/**
 * Build a monthly revenue chart input (last N months).
 * Source: 'in' transactions OR special inflow categories (collection/advance/deposit).
 *
 * @returns {{keys:string[], data:Object, max:number}}
 *   - keys: ['2026-04', '2026-05', ...] sorted asc
 *   - data: { 'YYYY-MM': { rev, count } }
 *   - max: maximum rev (≥1 for safe normalization)
 */
export function calcMonthlyRevenueChart(transactions = [], months = 6) {
  const acc = {};
  for (const t of transactions) {
    if (t.type !== 'in' && !['collection', 'advance', 'deposit'].includes(t.category)) continue;
    const sec = t.createdAt?.seconds || 0;
    if (!sec) continue;
    const d = new Date(sec * 1000);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!acc[k]) acc[k] = { rev: 0, count: 0 };
    acc[k].rev += parseFloat(t.amount) || 0;
    acc[k].count++;
  }
  const keys = Object.keys(acc).sort().slice(-months);
  const max = Math.max(...keys.map(k => acc[k].rev), 1);
  return { keys, data: acc, max };
}

/**
 * Diff HTML between current and previous values (percentage).
 * Returns empty string if no prev or zero baseline.
 */
export function diffHTML(cur, prev) {
  if (!prev) return '';
  const pct = Math.round((cur - prev) / Math.max(prev, 1) * 100);
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'same';
  const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
  return `<div class="kpi-diff ${cls}">${arrow} ${Math.abs(pct)}% مقارنة بالسابق</div>`;
}
