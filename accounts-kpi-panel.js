// ══════════════════════════════════════════════════════════
// accounts-kpi-panel.js — KPI drill-down panel renderer
// ══════════════════════════════════════════════════════════
// Extracted from accounts.html (RULE H1.7 — god page reduction, PR 5/5).
// Pure view module: takes state + helpers as input, returns the HTML body
// for the side panel. Page wiring (DOM injection, panel open) stays in
// accounts.html — this module just owns the render template.
//
// Usage:
//   import { renderKpiDrill } from './accounts-kpi-panel.js';
import { costTypesMatch } from './core/cost-type-normalize.js';
import { calcSupplierDueBreakdown } from './core/accounts-kpis.js';
//   const { title, html } = renderKpiDrill({
//     drillType: 'in',
//     walletFilter: '',
//     state: { transactions, wallets, allOrders, suppliers, supplierPays },
//     helpers: { isInPeriod, getPeriodSubLabel, fn, CAT, WICO, WNAME, calcRem },
//     constants: { ORDER_STAGES, TXC, TT },
//   });

const escForJs = s => (s || '')
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\n/g, '\\n')
  .replace(/"/g, '&quot;');

/**
 * Renders the KPI drill-down panel content for a given drill type.
 * @returns {{ title: string, html: string }}
 */
export function renderKpiDrill({ drillType, walletFilter = '', state, helpers, constants }) {
  const { transactions, wallets, allOrders, suppliers, supplierPays } = state;
  const { isInPeriod, getPeriodSubLabel, fn, CAT, WICO, WNAME } = helpers;
  const { ORDER_STAGES, TT } = constants;

  const label = getPeriodSubLabel();
  const periodTx = transactions.filter(t => isInPeriod(t.createdAt));
  let title = '', html = '';

  // ── شريط فلتر المحافظ (scroll أفقي نظيف بدل wrap) ──
  function walletBar(txType) {
    const col = txType === TT.IN ? 'var(--g)' : 'var(--r)';
    const colBg = txType === TT.IN ? 'rgba(0,217,126,' : 'rgba(255,61,110,';
    const wData = wallets.map(w => {
      const tot = periodTx.filter(t => t.type === txType && t.walletId === w._id).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      return { ...w, tot };
    }).filter(w => w.tot > 0).sort((a, b) => b.tot - a.tot);
    if (!wData.length) return '';
    return `<div style="margin-bottom:12px">
      <div style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">📲 طريقة الدفع</div>
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;-ms-overflow-style:none;scrollbar-width:none">
        <button type="button" onclick="openKpiDrill('${drillType}','')" style="flex-shrink:0;padding:7px 14px;border-radius:20px;border:1px solid ${walletFilter === '' ? col : 'var(--line)'};background:${walletFilter === '' ? colBg + '.18)' : 'transparent'};color:${walletFilter === '' ? col : 'var(--dim2)'};font-size:var(--fs-base);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit;white-space:nowrap">الكل</button>
        ${wData.map(w => `<button type="button" onclick="openKpiDrill('${drillType}','${w._id}')" style="flex-shrink:0;padding:7px 12px;border-radius:20px;border:1px solid ${walletFilter === w._id ? col : 'var(--line)'};background:${walletFilter === w._id ? colBg + '.18)' : 'transparent'};color:${walletFilter === w._id ? col : 'var(--dim2)'};font-size:var(--fs-base);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap">
          <span>${WICO[w.type] || '💼'} ${w.name}</span>
          <span style="font-size:var(--fs-xs);font-weight:var(--fw-heavy);color:${col};background:${colBg}.12);padding:1px 6px;border-radius:var(--rad)">${fn(w.tot)}</span>
        </button>`).join('')}
      </div>
    </div>`;
  }

  // ── Category block — collapsible + percent of total + expand-all ──
  function catBlock(cat, txs, isIn, parentTotal) {
    if (!txs.length) return '';
    const total = txs.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const col = isIn ? 'var(--g)' : 'var(--r)';
    const bgCol = isIn ? 'rgba(0,217,126,' : 'rgba(255,61,110,';
    const pct = parentTotal > 0 ? Math.round(total / parentTotal * 100) : 0;
    const catId = 'c_' + cat.replace(/[^a-z0-9]/gi, '_');

    function renderRows(rows) {
      return rows.map(t => {
        const w = wallets.find(x => x._id === t.walletId);
        const meta = [t.date || '', t.clientName || t.supplierName || t.employeeName || '', w ? w.name : ''].filter(Boolean).join(' · ');
        return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-sm);font-size:var(--fs-sm);padding:6px 0;border-bottom:1px solid var(--line)">
          <div style="flex:1;min-width:0">
            <div style="color:var(--snow);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:var(--fw-semi)">${t.description || '—'}</div>
            <div style="color:var(--dim2);margin-top:1px">${meta}</div>
          </div>
          <span style="font-weight:var(--fw-extra);color:${col};white-space:nowrap">${fn(t.amount)} ج</span>
        </div>`;
      }).join('');
    }

    return `<div data-cat="${catId}" style="background:var(--bg2);border:1px solid var(--line);border-radius:12px;margin-bottom:8px;overflow:hidden">
      <div onclick="(function(el){const b=el.nextElementSibling;const a=el.querySelector('.cat-arrow');const open=b.style.display!=='none';b.style.display=open?'none':'block';a.style.transform=open?'rotate(-90deg)':'rotate(0)';})(this)"
        style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:pointer;background:${bgCol}.04);transition:background .15s" onmouseover="this.style.background='${bgCol}.08)'" onmouseout="this.style.background='${bgCol}.04)'">
        <div style="display:flex;align-items:center;gap:var(--space-sm);flex:1;min-width:0">
          <span class="cat-arrow" style="font-size:var(--fs-xs);color:var(--dim2);transition:transform .2s;display:inline-block">▼</span>
          <span style="font-size:var(--fs-md);font-weight:var(--fw-extra);color:var(--snow)">${CAT[cat] || cat}</span>
          <span style="font-size:var(--fs-xs);color:var(--dim2);background:var(--bg3);padding:2px 7px;border-radius:var(--rad);font-weight:var(--fw-bold)">${txs.length}</span>
          ${pct > 0 ? `<span style="font-size:var(--fs-tiny);color:${col};background:${bgCol}.12);padding:2px 6px;border-radius:var(--rad);font-weight:var(--fw-extra)">${pct}%</span>` : ''}
        </div>
        <span style="font-size:var(--fs-lg);font-weight:var(--fw-heavy);color:${col};white-space:nowrap">${fn(total)} ج</span>
      </div>
      <div style="display:block;padding:4px 12px 10px">
        <div data-cat-rows="${catId}">${renderRows(txs.slice(0, 7))}</div>
        ${txs.length > 7 ? `<button type="button" onclick="(function(b){const c=document.querySelector('[data-cat-rows=&quot;${catId}&quot;]');c.innerHTML='${escForJs(renderRows(txs))}';b.style.display='none';})(this)" style="width:100%;margin-top:6px;padding:7px;border:1px dashed ${col};background:transparent;color:${col};border-radius:8px;font-family:inherit;font-size:var(--fs-sm);font-weight:var(--fw-extra);cursor:pointer">+ عرض ${txs.length - 7} حركة أخرى ↓</button>` : ''}
      </div>
    </div>`;
  }

  if (drillType === 'in') {
    title = `📥 الإيرادات — ${label}`;
    let inTx = periodTx.filter(t => t.type === TT.IN);
    if (walletFilter) inTx = inTx.filter(t => t.walletId === walletFilter);
    const total = inTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const byCat = {}; inTx.forEach(t => { const c = t.category || 'other'; (byCat[c] = byCat[c] || []).push(t); });
    const sorted = Object.entries(byCat).sort(([, a], [, b]) => b.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0) - a.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0));
    const wName = walletFilter ? wallets.find(w => w._id === walletFilter)?.name : '';
    html = walletBar(TT.IN) + `<div class="acc-sumcard acc-sumcard-row acc-sumcard-lg acc-tint-g" style="margin-bottom:12px">
      <span style="font-weight:var(--fw-extra);font-size:var(--fs-md);color:var(--dim2)">${inTx.length} حركة${wName ? ' · ' + wName : ''}</span>
      <span class="sc-val">${fn(total)} ج</span>
    </div>${sorted.map(([cat, txs]) => catBlock(cat, txs, true, total)).join('') || `<div style="text-align:center;padding:var(--space-lg);color:var(--dim2)">لا توجد إيرادات للفترة المحددة</div>`}`;

  } else if (drillType === 'out') {
    title = `📤 المصروفات — ${label}`;
    let outTx = periodTx.filter(t => t.type === TT.OUT);
    if (walletFilter) outTx = outTx.filter(t => t.walletId === walletFilter);
    const total = outTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const byCat = {}; outTx.forEach(t => { const c = t.category || 'other'; (byCat[c] = byCat[c] || []).push(t); });
    const sorted = Object.entries(byCat).sort(([, a], [, b]) => b.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0) - a.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0));
    const wName = walletFilter ? wallets.find(w => w._id === walletFilter)?.name : '';
    html = walletBar(TT.OUT) + `<div class="acc-sumcard acc-sumcard-row acc-sumcard-lg acc-tint-r" style="margin-bottom:12px">
      <span style="font-weight:var(--fw-extra);font-size:var(--fs-md);color:var(--dim2)">${outTx.length} حركة${wName ? ' · ' + wName : ''}</span>
      <span class="sc-val">${fn(total)} ج</span>
    </div>${sorted.map(([cat, txs]) => catBlock(cat, txs, false, total)).join('') || `<div style="text-align:center;padding:var(--space-lg);color:var(--dim2)">لا توجد مصروفات للفترة المحددة</div>`}`;

  } else if (drillType === 'profit') {
    title = `💹 الصافي — ${label}`;
    const inTx = periodTx.filter(t => t.type === TT.IN);
    const outTx = periodTx.filter(t => t.type === TT.OUT);
    const totalIn = inTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const totalOut = outTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const profit = totalIn - totalOut;
    const pct = totalIn > 0 ? Math.round(totalOut / totalIn * 100) : 0;
    const byCatOut = {}; outTx.forEach(t => { const c = t.category || 'other'; byCatOut[c] = (byCatOut[c] || 0) + (parseFloat(t.amount) || 0); });
    const expRows = Object.entries(byCatOut).sort(([, a], [, b]) => b - a);
    html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="acc-sumcard acc-tint-g"><div class="sc-lbl">📥 إيرادات</div><div class="sc-val">${fn(totalIn)} ج</div></div>
      <div class="acc-sumcard acc-tint-r"><div class="sc-lbl">📤 مصروفات</div><div class="sc-val">${fn(totalOut)} ج</div></div>
    </div>
    <div class="acc-sumcard ${profit >= 0 ? 'acc-tint-g' : 'acc-tint-r'}" style="padding:14px;margin-bottom:12px">
      <div style="font-size:var(--fs-sm);color:var(--dim2);margin-bottom:4px">💹 الصافي</div>
      <div style="font-size:var(--fs-4xl);font-weight:var(--fw-heavy);color:var(--sum-tone)">${profit >= 0 ? '+' : ''}${fn(profit)} ج</div>
      ${totalIn > 0 ? `<div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:4px">نسبة المصاريف: ${pct}% من الإيرادات</div>` : ''}
    </div>
    ${expRows.length ? `<div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">توزيع المصروفات</div>
    ${expRows.map(([cat, tot]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:var(--bg3);border-radius:8px;margin-bottom:5px">
      <span style="font-size:var(--fs-base)">${CAT[cat] || cat}</span>
      <div style="display:flex;align-items:center;gap:var(--space-sm)">
        ${totalOut > 0 ? `<span class="txt-meta-xs">${Math.round(tot / totalOut * 100)}%</span>` : ''}
        <span style="font-size:var(--fs-md);font-weight:var(--fw-extra);color:var(--r)">${fn(tot)} ج</span>
      </div>
    </div>`).join('')}` : ''}`;

  } else if (drillType === 'sup_due') {
    title = '🏭 استحقاقات الموردين';
    // نفس مصدر رقم الـ KPI (RULE 1) — الصفوف هنا تجمع بالضبط للرقم في الكارت
    const bd = calcSupplierDueBreakdown(allOrders, supplierPays);
    const supList = bd.entries
      .filter(e => e.cost > 0 || e.paid > 0)
      .map(e => {
        const s = suppliers.find(x => x._id === e.supplierId);
        return {
          ...e,
          name: e.supplierId ? (s?.name || '⚠️ مورد محذوف من القائمة') : '⚠️ بنود بدون مورد',
          payable: !!s, // زر الدفع فقط لمورد موجود فعلاً في القائمة
        };
      });
    const totalCostAll = supList.reduce((s, x) => s + x.cost, 0);
    const totalPaidAll = supList.reduce((s, x) => s + x.paid, 0);
    html = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-sm);margin-bottom:12px">
      <div class="acc-sumcard acc-tint-r"><div class="sc-lbl">إجمالي التكاليف</div><div class="sc-val">${fn(totalCostAll)} ج</div></div>
      <div class="acc-sumcard acc-tint-g"><div class="sc-lbl">المدفوع</div><div class="sc-val">${fn(totalPaidAll)} ج</div></div>
      <div class="acc-sumcard acc-tint-r"><div class="sc-lbl">المستحق</div><div class="sc-val">${fn(bd.total)} ج</div></div>
    </div>
    ${supList.map(s => `<div style="background:var(--bg3);border-radius:var(--rad);padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
        <span class="txt-bold-md">${s.name}</span>
        <span style="font-size:var(--fs-md);font-weight:var(--fw-heavy);color:${s.due > 0 ? 'var(--r)' : 'var(--g)'}">${s.due > 0 ? fn(s.due) + ' ج' : '✅ مسدد'}</span>
      </div>
      <div style="display:flex;gap:var(--space-md);font-size:var(--fs-xs);color:var(--dim2);margin-bottom:${s.due > 0 && s.payable ? '8' : '0'}px">
        <span>تكاليف: ${fn(s.cost)} ج</span>
        <span style="color:var(--g)">مدفوع: ${fn(s.paid)} ج</span>
      </div>
      ${s.due > 0 && s.payable ? `<button type="button" onclick="quickPaySup('${s.supplierId}','${(s.name || '').replace(/'/g, "\\'")}',${s.due});closePanel();" style="width:100%;padding:7px;border-radius:8px;border:none;background:var(--r);color:#fff;font-size:var(--fs-base);font-weight:var(--fw-extra);cursor:pointer">💸 دفع ${fn(s.due)} ج</button>` : ''}
      ${s.due > 0 && !s.payable ? `<div style="font-size:var(--fs-xs);color:var(--y);margin-top:4px">${s.supplierId ? 'أعد إضافة المورد أو صحّح بنود التكلفة لربطها بمورد موجود' : 'اربط بنود التكلفة دي بمورد من شاشة إدخال التكاليف عشان تقدر تدفعها'}</div>` : ''}
    </div>`).join('') || `<div style="text-align:center;padding:var(--space-xl);color:var(--dim2)">لا توجد تكاليف مسجّلة</div>`}`;

  } else if (drillType === 'bal') {
    title = '💼 إجمالي الأرصدة — تفصيل المحافظ';
    const ws = wallets.slice().sort((a, b) => (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0));
    const total = ws.reduce((s, w) => s + (parseFloat(w.balance) || 0), 0);
    html = `<div class="acc-sumcard acc-sumcard-row acc-sumcard-lg acc-tint-g" style="margin-bottom:12px">
      <span style="font-weight:var(--fw-extra);font-size:var(--fs-md);color:var(--dim2)">${ws.length} محفظة</span>
      <span class="sc-val">${fn(total)} ج</span>
    </div>
    ${ws.map(w => {
      const bal = parseFloat(w.balance) || 0;
      const pct = total > 0 ? Math.round(bal / total * 100) : 0;
      const col = bal >= 0 ? 'var(--g)' : 'var(--r)';
      return `<div style="background:var(--bg3);border-radius:var(--rad);padding:10px 12px;margin-bottom:6px;cursor:pointer" onclick="closePanel();openWallet('${w._id}')">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:var(--space-sm)">
            <span style="font-size:var(--fs-2xl)">${WICO[w.type] || '💼'}</span>
            <div>
              <div class="txt-bold-md">${w.name}</div>
              <div class="txt-meta-xs">${WNAME[w.type] || w.type || 'حساب'}</div>
            </div>
          </div>
          <span style="font-size:15px;font-weight:var(--fw-heavy);color:${col}">${fn(bal)} ج</span>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-sm)">
          <div style="flex:1;height:4px;background:var(--hover);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${Math.max(0, pct)}%;background:linear-gradient(90deg,var(--g),var(--c));border-radius:99px"></div>
          </div>
          <span style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);min-width:32px;text-align:left">${pct}%</span>
        </div>
      </div>`;
    }).join('') || `<div style="text-align:center;padding:var(--space-lg);color:var(--dim2)">لا توجد محافظ</div>`}
    <div style="font-size:var(--fs-xs);color:var(--dim2);text-align:center;margin-top:10px">اضغط على محفظة لعرض حركاتها</div>`;

  } else if (drillType === 'earned') {
    title = `✅ الإيرادات المكتسبة — ${label}`;
    const archived = allOrders.filter(o => o.stage === ORDER_STAGES.ARCHIVED && isInPeriod(o.updatedAt || o.createdAt));
    const total = archived.reduce((s, o) => s + (parseFloat(o.salePrice) || 0), 0);
    const byProduct = {};
    archived.forEach(o => {
      const prod = o.product || (o.products || []).map(p => p.name).filter(Boolean).join(' + ') || '—';
      if (!byProduct[prod]) byProduct[prod] = { count: 0, total: 0, orders: [] };
      byProduct[prod].count++;
      byProduct[prod].total += parseFloat(o.salePrice) || 0;
      byProduct[prod].orders.push(o);
    });
    const sorted = Object.entries(byProduct).sort(([, a], [, b]) => b.total - a.total);
    html = `<div class="acc-sumcard acc-sumcard-row acc-sumcard-lg acc-tint-y" style="margin-bottom:12px">
      <span style="font-weight:var(--fw-extra);font-size:var(--fs-md);color:var(--dim2)">${archived.length} طلب مكتمل</span>
      <span class="sc-val">${fn(total)} ج</span>
    </div>
    ${sorted.map(([prod, d]) => `<div style="background:var(--bg3);border-radius:var(--rad);padding:10px 12px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span class="txt-bold-md">${prod}</span>
        <div style="text-align:left">
          <div style="font-size:var(--fs-lg);font-weight:var(--fw-heavy);color:var(--y)">${fn(d.total)} ج</div>
          <div class="txt-meta-xs">${d.count} طلب · متوسط ${fn(Math.round(d.total / d.count))} ج</div>
        </div>
      </div>
      ${d.orders.slice(0, 5).map(o => `<div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);padding:3px 0;border-bottom:1px solid var(--line)">
        <span style="color:var(--snow);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65%">${o.clientName || '—'}</span>
        <span style="color:var(--y);font-weight:var(--fw-bold)">${fn(parseFloat(o.salePrice) || 0)} ج</span>
      </div>`).join('')}
      ${d.orders.length > 5 ? `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:4px;text-align:center">+ ${d.orders.length - 5} طلب آخر</div>` : ''}
    </div>`).join('') || `<div style="text-align:center;padding:var(--space-lg);color:var(--dim2)">لا توجد أوردرات مكتملة في الفترة</div>`}`;

  } else if (drillType === 'printing') {
    title = '🖨️ إجمالي الطباعة';
    // كل بنود التكلفة من نوع "طباعة" عبر الأوردرات — مجمّعة حسب المورد.
    const rows = [];
    allOrders.forEach(o => (o.costItems || []).forEach(ci => {
      if (!costTypesMatch(ci.type, 'طباعة')) return;
      rows.push({ ...ci, _orderClient: o.clientName || '', _orderId: o.orderId || o._id });
    }));
    const total = rows.reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
    const paid  = rows.reduce((s, r) => s + (r.paid ? (parseFloat(r.total) || 0) : 0), 0);
    const due   = Math.max(0, total - paid);
    const bySup = {};
    rows.forEach(r => {
      const key = r.supplierName || 'بدون مورد';
      if (!bySup[key]) bySup[key] = { total: 0, count: 0, items: [] };
      bySup[key].total += parseFloat(r.total) || 0;
      bySup[key].count++;
      bySup[key].items.push(r);
    });
    const sorted = Object.entries(bySup).sort(([, a], [, b]) => b.total - a.total);
    html = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-sm);margin-bottom:12px">
      <div class="acc-sumcard acc-tint-b"><div class="sc-lbl">الإجمالي</div><div class="sc-val">${fn(total)} ج</div></div>
      <div class="acc-sumcard acc-tint-g"><div class="sc-lbl">المدفوع</div><div class="sc-val">${fn(paid)} ج</div></div>
      <div class="acc-sumcard acc-tint-r"><div class="sc-lbl">المستحق</div><div class="sc-val">${fn(due)} ج</div></div>
    </div>
    <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">${rows.length} بند طباعة · حسب المورد</div>
    ${sorted.map(([sup, d]) => `<div style="background:var(--bg3);border-radius:var(--rad);padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span class="txt-bold-md">${sup}</span>
        <div style="text-align:left">
          <div style="font-size:var(--fs-lg);font-weight:var(--fw-heavy);color:var(--b)">${fn(d.total)} ج</div>
          <div class="txt-meta-xs">${d.count} بند</div>
        </div>
      </div>
      ${d.items.slice(0, 5).map(it => `<div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);padding:3px 0;border-bottom:1px solid var(--line)">
        <span style="color:var(--snow);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65%">${it._orderClient || it._orderId || '—'}${it.note ? ' · ' + it.note : ''}</span>
        <span style="color:${it.paid ? 'var(--g)' : 'var(--b)'};font-weight:var(--fw-bold)">${fn(parseFloat(it.total) || 0)} ج${it.paid ? ' ✅' : ''}</span>
      </div>`).join('')}
      ${d.items.length > 5 ? `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:4px;text-align:center">+ ${d.items.length - 5} بند آخر</div>` : ''}
    </div>`).join('') || `<div style="text-align:center;padding:var(--space-xl);color:var(--dim2)">لا توجد بنود طباعة مسجّلة</div>`}`;
  }

  return { title, html };
}
