/**
 * shipping-reconciliation.js — Settlement Reconciliation Engine
 *
 * Pure functions for pre-settlement reconciliation reports.
 * No side effects — just calculations.
 */

/**
 * Build a reconciliation report for a shipping company.
 * @param {Object[]} orders - Orders for this company pending settlement
 * @param {Object[]} settlements - Existing settlement records (for historical context)
 * @returns {Object} Reconciliation report
 */
export function buildReconciliationReport(orders, settlements = []) {
  const perOrder = orders.map(o => {
    const sale = parseFloat(o.salePrice) || 0;
    const disc = parseFloat(o.discount) || 0;
    const shipFee = parseFloat(o.customerShipFee) || 0;
    const paid = parseFloat(o.totalPaid) || 0;
    const shipCost = parseFloat(o.shippingCost) || 0;
    const collected = parseFloat(o.shipCollected) || 0;
    const gross = Math.max(0, sale + shipFee - disc);
    const expectedCollection = Math.max(0, gross - paid);
    const expectedFromCompany = collected > 0
      ? Math.max(0, collected - shipCost)
      : Math.max(0, expectedCollection - shipCost);

    return {
      orderId: o.orderId || o._id?.slice(0, 8) || '?',
      docId: o._id || '',
      clientName: o.clientName || '—',
      gross,
      paid,
      expectedCollection,
      shippingCost: shipCost,
      shipCollected: collected,
      expectedFromCompany,
      hasCollectionData: collected > 0,
      flags: [],
    };
  });

  // Flag anomalies
  for (const item of perOrder) {
    if (!item.hasCollectionData) item.flags.push('لم يُسجَل مبلغ التحصيل');
    if (item.shippingCost <= 0) item.flags.push('تكلفة الشحن غير مسجلة');
    if (item.expectedFromCompany < 0) item.flags.push('المتوقع سالب — راجع البيانات');
  }

  const expectedTotal = perOrder.reduce((s, i) => s + i.expectedFromCompany, 0);
  const settledTotal = settlements.reduce((s, st) => s + (parseFloat(st.amount) || 0), 0);
  const flaggedOrders = perOrder.filter(i => i.flags.length > 0);
  const cleanOrders = perOrder.filter(i => i.flags.length === 0);

  return {
    orderCount: orders.length,
    expectedTotal,
    settledTotal,
    variance: expectedTotal - settledTotal,
    perOrder,
    flaggedOrders,
    cleanOrders,
    flaggedCount: flaggedOrders.length,
  };
}

/**
 * Render reconciliation report as HTML.
 */
export function renderReconciliationHTML(report) {
  const fmt = n => (parseFloat(n) || 0).toLocaleString('ar-EG');

  let html = `
    <div style="background:var(--bg3);border-radius:var(--rad);padding:14px;margin-bottom:12px">
      <div style="font-size:var(--fs-base);font-weight:var(--fw-extra);margin-bottom:10px">\u{1F4CA} تقرير المطابقة</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        <div style="text-align:center;padding:8px;background:var(--bg2);border-radius:8px">
          <div style="font-size:var(--fs-xs);color:var(--dim2)">المتوقع من الشركة</div>
          <div style="font-size:var(--fs-lg);font-weight:var(--fw-bold);color:var(--b)">${fmt(report.expectedTotal)} ج</div>
        </div>
        <div style="text-align:center;padding:8px;background:var(--bg2);border-radius:8px">
          <div style="font-size:var(--fs-xs);color:var(--dim2)">تم تسويته</div>
          <div style="font-size:var(--fs-lg);font-weight:var(--fw-bold);color:var(--g)">${fmt(report.settledTotal)} ج</div>
        </div>
        <div style="text-align:center;padding:8px;background:var(--bg2);border-radius:8px">
          <div style="font-size:var(--fs-xs);color:var(--dim2)">الفرق</div>
          <div style="font-size:var(--fs-lg);font-weight:var(--fw-bold);color:${report.variance > 0.01 ? 'var(--r)' : 'var(--g)'}">${fmt(report.variance)} ج</div>
        </div>
      </div>
    </div>`;

  // Flagged orders warning
  if (report.flaggedCount > 0) {
    html += `<div style="background:rgba(255,170,0,.06);border:1px solid rgba(255,170,0,.25);border-radius:var(--rad);padding:10px;margin-bottom:12px">
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--y);margin-bottom:6px">⚠️ ${report.flaggedCount} طلب يحتاج مراجعة</div>
      ${report.flaggedOrders.map(o => `
        <div style="font-size:var(--fs-xs);color:var(--dim2);padding:3px 0">
          #${o.orderId} (${o.clientName}): ${o.flags.join(' · ')}
        </div>
      `).join('')}
    </div>`;
  }

  // Per-order breakdown
  html += `<div style="font-size:var(--fs-sm);font-weight:var(--fw-bold);margin-bottom:6px">تفصيل الطلبات (${report.orderCount})</div>`;
  html += `<div style="max-height:300px;overflow-y:auto">`;
  for (const o of report.perOrder) {
    const flagStyle = o.flags.length ? 'border-right:3px solid var(--y)' : '';
    html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:8px;background:var(--bg2);border-radius:8px;margin-bottom:4px;font-size:var(--fs-xs);${flagStyle}">
      <div><span style="color:var(--dim2)">#</span>${o.orderId}<br><span style="color:var(--dim2)">${o.clientName}</span></div>
      <div>شحن: ${fmt(o.shippingCost)}ج<br>محصّل: ${fmt(o.shipCollected)}ج</div>
      <div style="text-align:left;font-weight:var(--fw-bold);color:var(--b)">← ${fmt(o.expectedFromCompany)}ج</div>
    </div>`;
  }
  html += `</div>`;

  return html;
}

if (typeof window !== 'undefined') {
  window.ShippingReconciliation = { buildReconciliationReport, renderReconciliationHTML };
}
