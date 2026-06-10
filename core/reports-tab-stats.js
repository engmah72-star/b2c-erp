/**
 * Business2Card ERP — core/reports-tab-stats.js
 *
 * ━━━ PER-TAB AGGREGATORS (Phase-1C · reports god-page decomp) ━━━
 *
 * Pure aggregators for designers / shipping / clients tabs. No DOM.
 *
 * Each function returns the *data* needed to render — the page composes HTML
 * from these results (Phase 2 will move HTML out to features/*).
 */

/**
 * Designer performance stats for the designers tab.
 *
 * @param {Array}    filteredOrders
 * @param {Array}    employees
 * @param {Function} resolveDesigner — (employees, designerId, designerName) → employee|null
 *
 * @returns {{ stats: Array, topId: string|null }}
 *   stats: sorted desc by score = done * (pct/100)
 */
export function buildDesignerStats(filteredOrders = [], employees = [], resolveDesigner) {
  const dOrds = filteredOrders.filter(o => o.designStage || o.stage === 'design' || o.designerId);
  const buckets = new Map();
  for (const o of dOrds) {
    const can = resolveDesigner ? resolveDesigner(employees, o.designerId, o.designerName) : null;
    if (!can) continue;
    const key = can.authUid || can._id;
    if (!buckets.has(key)) buckets.set(key, { name: can.name || '—', orders: [], emp: can });
    buckets.get(key).orders.push(o);
  }

  const stats = [...buckets.values()].map(b => {
    const done = b.orders.filter(o => o.stage !== 'design').length;
    const pending = b.orders.filter(o => o.stage === 'design').length;
    const withDays = b.orders.filter(o => o.designDays);
    const avgDays = withDays.length
      ? withDays.reduce((s, o) => s + (parseFloat(o.designDays) || 0), 0) / withDays.length
      : 0;
    const pct = b.orders.length ? Math.round(done / b.orders.length * 100) : 0;
    const score = done * (pct / 100);
    return { ...b, done, pending, avgDays, pct, score };
  }).sort((a, b) => b.score - a.score);

  const topId = stats[0]?.emp?._id || stats[0]?.emp?.authUid || null;
  return { stats, topId };
}

/**
 * Shipping tab aggregates.
 *
 * @param {Array}    filteredOrders
 * @param {Array}    prevOrders
 * @param {Array}    shippers
 * @param {Function} isDelivered — (order) → boolean
 *
 * @returns {{
 *   shipOrds, companies, totShip, delivered, returned, totShipCost, pTot,
 *   perCompany: [{name, count, delivered, returned, rate, shipper}]
 * }}
 */
export function buildShippingStats(filteredOrders = [], prevOrders = [], shippers = [], isDelivered) {
  const shipOrds = filteredOrders.filter(o =>
    ['shipping', 'archived'].includes(o.stage) || o.shipCompanyName
  );
  const inOrderCos = [...new Set(shipOrds.map(o => o.shipCompanyName || o.shippingCompany).filter(Boolean))];
  const companies = [...new Set([...inOrderCos, ...shippers.map(s => s.name)].filter(Boolean))];

  const totShip = shipOrds.length;
  const delivered = isDelivered ? shipOrds.filter(isDelivered).length : 0;
  const returned = shipOrds.filter(o => o.shipStage === 'returned').length;
  const totShipCost = shipOrds.reduce((s, o) => s + (parseFloat(o.shippingCost) || 0), 0);
  const pTot = prevOrders.filter(o =>
    ['shipping', 'archived'].includes(o.stage) || o.shipCompanyName
  ).length;

  const perCompany = companies.map(co => {
    const coOrds = shipOrds.filter(o => (o.shipCompanyName || o.shippingCompany) === co);
    const del = isDelivered ? coOrds.filter(isDelivered).length : 0;
    const ret = coOrds.filter(o => o.shipStage === 'returned').length;
    const rate = coOrds.length ? Math.round(del / coOrds.length * 100) : 0;
    const shipper = shippers.find(s => s.name === co) || {};
    return { name: co, count: coOrds.length, delivered: del, returned: ret, rate, shipper };
  });

  return { shipOrds, companies, totShip, delivered, returned, totShipCost, pTot, perCompany };
}

/**
 * Client activity stats for the clients tab.
 *
 * @param {Array} filteredOrders
 * @param {Array} clients
 * @param {{from: Date}} range — used to count new clients in range
 *
 * @returns {{
 *   sorted: [{name, phone, count, total, paid}],
 *   newCount: number,
 *   repeatCount: number,
 *   avgOrder: number,
 *   activeCount: number,
 *   maxTotal: number,
 * }}
 */
export function buildClientActivityStats(filteredOrders = [], clients = [], range) {
  const clientMap = {};
  for (const o of filteredOrders) {
    const k = o.clientId || o.clientName;
    if (!k) continue;
    if (!clientMap[k]) clientMap[k] = {
      name: o.clientName || '—',
      phone: o.clientPhone || '',
      count: 0, total: 0, paid: 0,
    };
    clientMap[k].count++;
    clientMap[k].total += parseFloat(o.salePrice) || 0;
    clientMap[k].paid += parseFloat(o.totalPaid) || parseFloat(o.paid) || 0;
  }
  const sorted = Object.values(clientMap).sort((a, b) => b.total - a.total);

  let newCount = 0;
  if (range?.from) {
    for (const o of filteredOrders) {
      const c = clients.find(x => x._id === o.clientId);
      if (c && c.createdAt?.seconds && new Date(c.createdAt.seconds * 1000) >= range.from) {
        newCount++;
      }
    }
  }

  const activeCount = sorted.length;
  const totalRev = sorted.reduce((s, c) => s + c.total, 0);
  const avgOrder = activeCount ? Math.round(totalRev / activeCount) : 0;
  const repeatCount = sorted.filter(c => c.count > 1).length;
  const maxTotal = Math.max(...sorted.map(c => c.total), 1);

  return { sorted, newCount, repeatCount, avgOrder, activeCount, maxTotal };
}

/**
 * أداء الأفراد: مدة إنجاز كل فرد عبر الأوردرات + الالتزام بالـ SLA.
 *
 * يجمّع المراحل المكتملة (status='done') حسب (المسؤول، المرحلة):
 * عدد الأوردرات، متوسط مدة الإنجاز، عدد ضمن المدة / متأخر، ونسبة الالتزام.
 *
 * Pure — يأخذ getStageDurations + formatDurationAr من orders.js كـ params
 * (نفس نمط buildDesignerStats مع resolveDesigner — بدون import coupling).
 *
 * @param {Array}    orders
 * @param {Function} getStageDurations — (order) → { stages: [...] }
 * @param {Function} [formatDurationAr] — (ms) → string
 * @param {Array}    [employees] — canonical employee list (من dedupEmployees)
 * @param {Function} [resolveEmployee] — (employees, id, name) → employee|null
 * @returns {{ people: Array<{name,stageKey,stageLabel,slaHours,count,avgMs,avgText,onTime,late,slaPct}> }}
 */
export function buildStagePerformanceStats(orders = [], getStageDurations, formatDurationAr, employees = [], resolveEmployee) {
  if (typeof getStageDurations !== 'function') return { people: [] };
  const buckets = new Map();
  for (const o of orders) {
    const res = getStageDurations(o) || {};
    for (const s of (res.stages || [])) {
      if (s.status !== 'done' || !s.owner) continue; // فقط المكتمل بمسؤول معروف
      // حل مشكلة التكرار: أوردرات بدون ownerId (قديمة) + أوردرات بـ ownerId (جديدة)
      // لنفس الشخص تنتهي في buckets منفصلة. resolveEmployee يوحّد عبر _mergedIds + name.
      let key, displayName = s.owner;
      if (typeof resolveEmployee === 'function' && employees.length) {
        const can = resolveEmployee(employees, s.ownerId, s.owner);
        if (can) {
          key = (can.authUid || can._id) + '@' + s.key;
          displayName = can.name || s.owner;
        }
      }
      if (!key) key = (s.ownerId || s.owner) + '@' + s.key;
      if (!buckets.has(key)) {
        buckets.set(key, { name: displayName, stageKey: s.key, stageLabel: s.label, slaHours: s.slaHours, count: 0, totalMs: 0, onTime: 0, late: 0 });
      }
      const b = buckets.get(key);
      b.count++; b.totalMs += s.ms;
      if (s.rating === 'late') b.late++; else b.onTime++;
    }
  }
  const people = [...buckets.values()].map(b => {
    const avgMs = b.count ? Math.round(b.totalMs / b.count) : 0;
    const slaPct = b.count ? Math.round(b.onTime / b.count * 100) : 0;
    return {
      name: b.name, stageKey: b.stageKey, stageLabel: b.stageLabel, slaHours: b.slaHours,
      count: b.count, avgMs,
      avgText: typeof formatDurationAr === 'function' ? formatDurationAr(avgMs) : String(avgMs),
      onTime: b.onTime, late: b.late, slaPct,
    };
  }).sort((a, b) => b.count - a.count || b.slaPct - a.slaPct);
  return { people };
}
