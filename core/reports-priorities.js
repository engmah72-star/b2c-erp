/**
 * Business2Card ERP — core/reports-priorities.js
 *
 * ━━━ PRIORITY ITEMS + SALES + EXPENSE BUILDERS (Phase-1D · reports decomp) ━━━
 *
 * Pure aggregators for:
 *   - buildPriorityItems(...)       — "تحتاج اهتمام" top-N priority list
 *   - buildSalesTabStats(orders, prev) — sales tab KPIs + product chart
 *   - buildExpenseBreakdown(transactions, range) — expense drawer aggregates
 */

const inRangeTx = (t, range) => {
  if (!range) return false;
  const sec = t?.createdAt?.seconds || 0;
  if (!sec) return false;
  const d = new Date(sec * 1000);
  return d >= range.from && d <= range.to;
};

// ── PRIORITY ITEMS ─────────────────────────────────────────────────

const STAGE_AR = { design: 'تصميم', printing: 'طباعة', production: 'تنفيذ', shipping: 'شحن' };

/**
 * Build the top-N priority list shown in the overview tab.
 *
 * Categories (descending priority):
 *   1) post-design with remaining > 0 (printing/production/shipping)  — score: 5×rem
 *   2) late delivery (deadline past, not archived)                    — score: 4×(sale + daysLate×100)
 *   3) no cost recorded (data hygiene)                                — score: 3×sale
 *   4) stale + remaining (no movement)                                — score: 2×rem
 *   5) vendor due > 500                                               — score: 1.5×due
 *
 * @param {Object} args
 * @param {Array}    args.orders
 * @param {Array}    args.suppliers
 * @param {Array}    args.payments
 * @param {Function} args.calcRem        — (order) → number
 * @param {Function} args.daysSince      — (timestamp) → days int
 * @param {Function} args.isMissingCost  — (order) → boolean
 * @param {Function} args.isStaleOrder   — (order) → boolean
 * @param {Date}     [args.now=new Date()]
 * @param {number}   [args.limit=8]
 *
 * @returns {Array<{key, type, score, amount, icon, color, title, phone, subtitle, orderId?, actions[]}>}
 */
export function buildPriorityItems({
  orders = [], suppliers = [], payments = [],
  calcRem = () => 0,
  daysSince = () => 0,
  isMissingCost = () => false,
  isStaleOrder = () => false,
  now = new Date(),
  limit = 8,
}) {
  const items = [];

  // 1) post-design with remaining
  for (const o of orders) {
    if (!(parseFloat(o.salePrice) > 0)) continue;
    if (!['printing', 'production', 'shipping'].includes(o.stage)) continue;
    const rem = calcRem(o);
    if (rem <= 0) continue;
    const days = daysSince(o.updatedAt || o.createdAt);
    items.push({
      key: 'pd_' + o._id, type: 'post-design', score: 5 * rem, amount: rem,
      icon: '🚨', color: 'var(--r)',
      title: o.clientName || '—', phone: o.clientPhone || '',
      subtitle: `بعد التصميم · ${days} يوم`,
      orderId: o._id, actions: ['phone', 'wa', 'open'],
    });
  }

  // 2) late delivery
  for (const o of orders) {
    if (!o.deadline || o.stage === 'archived') continue;
    const d = new Date(o.deadline);
    if (isNaN(d) || d >= now) continue;
    const daysLate = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (daysLate <= 0) continue;
    items.push({
      key: 'lt_' + o._id, type: 'late',
      score: 4 * ((parseFloat(o.salePrice) || 1) + daysLate * 100),
      amount: parseFloat(o.salePrice) || 0,
      icon: '⏰', color: 'var(--y)',
      title: o.clientName || '—', phone: o.clientPhone || '',
      subtitle: `متأخر تسليم ${daysLate} يوم · ${STAGE_AR[o.stage] || o.stage || ''}`,
      orderId: o._id, actions: ['phone', 'open'],
    });
  }

  // 3) missing cost
  for (const o of orders) {
    if (!isMissingCost(o)) continue;
    items.push({
      key: 'nc_' + o._id, type: 'no-cost',
      score: 3 * (parseFloat(o.salePrice) || 1),
      amount: parseFloat(o.salePrice) || 0,
      icon: '🚫', color: 'var(--r)',
      title: o.clientName || '—', phone: o.clientPhone || '',
      subtitle: 'تنفيذ بدون تكلفة مسجّلة',
      orderId: o._id, actions: ['open'],
    });
  }

  // 4) stale + remaining
  for (const o of orders) {
    if (!(parseFloat(o.salePrice) > 0)) continue;
    const rem = calcRem(o);
    if (rem <= 0 || !isStaleOrder(o)) continue;
    const days = daysSince(o.updatedAt || o.createdAt);
    items.push({
      key: 'st_' + o._id, type: 'stale', score: 2 * rem, amount: rem,
      icon: '🐢', color: 'var(--y)',
      title: o.clientName || '—', phone: o.clientPhone || '',
      subtitle: `راكد ${days} يوم · عليه باقي`,
      orderId: o._id, actions: ['phone', 'wa', 'open'],
    });
  }

  // 5) vendor due > 500
  for (const sup of suppliers) {
    const paidSum = payments
      .filter(x => x.supplierId === sup._id)
      .reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
    const purSum = orders.reduce((s, o) =>
      s + (o.costItems || [])
        .filter(c => c.supplierId === sup._id)
        .reduce((cs, c) => cs + (parseFloat(c.total) || 0), 0)
    , 0);
    const due = purSum - paidSum;
    if (due <= 500) continue;
    items.push({
      key: 'sv_' + sup._id, type: 'vendor', score: 1.5 * due, amount: due,
      icon: '🏭', color: 'var(--y)',
      title: sup.name || '—', phone: sup.phone || '',
      subtitle: 'مستحق دفع للمورد',
      actions: sup.phone ? ['phone'] : [],
    });
  }

  items.sort((a, b) => b.score - a.score);

  // dedup by orderId (so same order doesn't appear in multiple categories)
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const sig = it.orderId || it.key;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

// ── SALES TAB ──────────────────────────────────────────────────────

/**
 * Sales tab aggregates: revenue/cost/profit + product breakdown.
 *
 * @returns {{
 *   tot, contractTot, costs, profit, margin,
 *   pTot, pCosts,
 *   sortedProducts: [[name, {count, qty, rev}]],
 *   maxProductCount: number,
 * }}
 */
export function buildSalesTabStats(filteredOrders = [], prevOrders = []) {
  const withPrice = filteredOrders.filter(o => parseFloat(o.salePrice) > 0 || parseFloat(o.totalPaid) > 0);
  const tot = withPrice.reduce((s, o) =>
    s + (parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0)
  , 0);
  const contractTot = withPrice.reduce((s, o) => s + (parseFloat(o.salePrice) || 0), 0);
  const costs = withPrice.reduce((s, o) =>
    s + (o.costItems || []).reduce((cs, c) => cs + (parseFloat(c.total) || 0), 0)
  , 0);
  const profit = tot - costs;
  const margin = tot > 0 ? Math.round(profit / tot * 100) : 0;

  const pWithPrice = prevOrders.filter(o => parseFloat(o.salePrice) > 0 || parseFloat(o.totalPaid) > 0);
  const pTot = pWithPrice.reduce((s, o) =>
    s + (parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0)
  , 0);
  const pCosts = pWithPrice.reduce((s, o) =>
    s + (o.costItems || []).reduce((cs, c) => cs + (parseFloat(c.total) || 0), 0)
  , 0);

  // products
  const prodMap = {};
  for (const o of filteredOrders) {
    for (const p of (o.products || [])) {
      const name = p.name || '—';
      if (!prodMap[name]) prodMap[name] = { count: 0, qty: 0, rev: 0 };
      prodMap[name].count++;
      prodMap[name].qty += parseFloat(p.qty) || 0;
      prodMap[name].rev += parseFloat(p.salePrice) ||
        ((parseFloat(o.salePrice) || 0) / Math.max((o.products || []).length, 1));
    }
  }
  const sortedProducts = Object.entries(prodMap).sort((a, b) => b[1].count - a[1].count);
  const maxProductCount = Math.max(...sortedProducts.map(([, v]) => v.count), 1);

  return { tot, contractTot, costs, profit, margin, pTot, pCosts, sortedProducts, maxProductCount };
}

// ── EXPENSE BREAKDOWN ──────────────────────────────────────────────

/**
 * Aggregate the expense drawer data: total + per-category buckets + avg.
 *
 * Categories bucketed:
 *   - vendor   (printer_payment | supplier | vendor_payment)
 *   - shipper  (shipper_payment | shipping_settlement | shipping_expense)
 *   - salary   (salary | salary_payment | payroll)
 *   - general  (general_expense | expense | '')
 *   - other    (everything else)
 *
 * @param {Array} transactions
 * @param {{from: Date, to: Date}} range
 *
 * @returns {{
 *   data: Array, total: number, avg: number,
 *   buckets: { vendor, shipper, salary, general, other },
 * }}
 */
export function buildExpenseBreakdown(transactions = [], range) {
  const data = transactions
    .filter(t => t.type === 'out' && inRangeTx(t, range))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const total = data.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const avg = total / Math.max(1, data.length);

  const buckets = { vendor: 0, shipper: 0, salary: 0, general: 0, other: 0 };
  for (const t of data) {
    const c = t.category || '';
    const amt = parseFloat(t.amount) || 0;
    if (c === 'printer_payment' || c === 'supplier' || c === 'vendor_payment') buckets.vendor += amt;
    else if (c === 'shipper_payment' || c === 'shipping_settlement' || c === 'shipping_expense') buckets.shipper += amt;
    else if (c === 'salary' || c === 'salary_payment' || c === 'payroll') buckets.salary += amt;
    else if (c === 'general_expense' || c === 'expense' || !c) buckets.general += amt;
    else buckets.other += amt;
  }

  return { data, total, avg, buckets };
}
