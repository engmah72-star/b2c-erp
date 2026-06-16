// ══════════════════════════════════════════════════════════
// accounts-render.js — Dashboard renderer (لوحة التشغيل المالية)
// ══════════════════════════════════════════════════════════
// Extracted from accounts.html (RULE H1.7 — god page reduction).
// Pure view module: receives state + helpers, returns HTML string.
// No Firebase writes. No business logic. All actions stay in accounts.html.
//
// Usage:
//   import { renderDashboard } from './accounts-render.js';
//   el.innerHTML = renderDashboard({ wallets, transactions, ... });

const _esc = s => (s || '').replace(/'/g, "\\'");
const _stageAr = (stage, ORDER_STAGES) => ({
  [ORDER_STAGES.DESIGN]     : 'تصميم',
  [ORDER_STAGES.PRINTING]   : 'طباعة',
  [ORDER_STAGES.PRODUCTION] : 'تنفيذ',
  [ORDER_STAGES.SHIPPING]   : 'شحن',
})[stage] || stage;

// ── Wallet compact row ──────────────────────────────────────
function _walletRows({ wallets, transactions, isInPeriod, fn, WICO, WCOLS, WTONE, PERIOD_NAMES_AR, activePeriod }) {
  if (!wallets.length) return '<div class="empty-sm">لا توجد حسابات</div>';
  return wallets.map((w, i) => {
    const col  = WTONE[w.type] || WCOLS[i % WCOLS.length];
    const wTx  = transactions.filter(t => t.walletId === w._id && isInPeriod(t.createdAt));
    const wIn  = wTx.filter(t => t.type === 'in').reduce((s, t)  => s + (parseFloat(t.amount)||0), 0);
    const wOut = wTx.filter(t => t.type === 'out').reduce((s, t) => s + (parseFloat(t.amount)||0), 0);
    const net  = wIn - wOut;
    const netCol = net > 0 ? 'var(--g)' : net < 0 ? 'var(--r)' : 'var(--dim2)';
    return `<div class="wlt-row" style="--wlt-tone:${col}" onclick="openWallet('${w._id}')">
      <span style="font-size:17px;flex-shrink:0">${WICO[w.type]||'💼'}</span>
      <div style="flex:1;min-width:0">
        <div class="wlt-row-name">${w.name}</div>
        <div class="wlt-row-flow">
          <span class="text-g">↑${fn(wIn)}</span> · <span class="text-r">↓${fn(wOut)}</span>
          · صافي <span style="color:${netCol};font-weight:var(--fw-bold)">${net>=0?'+':''}${fn(net)}</span> ج
        </div>
      </div>
      <div class="wlt-row-bal">${fn(w.balance||0)} <span style="font-size:var(--fs-sm);font-weight:var(--fw-normal);color:var(--dim2)">ج</span></div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button type="button" class="btn btn-g btn-xs" onclick="event.stopPropagation();prepTx('${w._id}','in')" title="تسجيل دخل">📥</button>
        <button type="button" class="btn btn-danger btn-xs" onclick="event.stopPropagation();prepTx('${w._id}','out')" title="تسجيل خرج">📤</button>
      </div>
    </div>`;
  }).join('');
}

// ── Pending collections ─────────────────────────────────────
function _pendingRows({ allOrders, calcRem, fn, ORDER_STAGES, cap = 8 }) {
  const active = allOrders
    .filter(o => o.stage !== ORDER_STAGES.ARCHIVED && calcRem(o) > 0)
    .sort((a, b) => calcRem(b) - calcRem(a));
  const totalRem = active.reduce((s, o) => s + calcRem(o), 0);
  if (!active.length) return { html: '<div class="empty-sm">✅ لا توجد تحصيلات معلقة</div>', count: 0, total: 0 };

  const rows = active.slice(0, cap).map(o => {
    const rem  = calcRem(o);
    const paid = parseFloat(o.totalPaid)||parseFloat(o.deposit)||0;
    const sale = parseFloat(o.salePrice)||0;
    const pct  = sale > 0 ? Math.min(paid / sale * 100, 100) : 0;
    const stAr = _stageAr(o.stage, ORDER_STAGES);
    return `<div class="pend-item">
      <div style="flex:1;min-width:0">
        <div class="pend-item-n">${o.clientName||'—'}</div>
        <div class="pend-item-s">${o.orderId||o._id.slice(-6)} · ${stAr} · ${Math.round(pct)}% محصّل</div>
        <div class="pend-item-bar"><div class="pend-item-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="pend-item-amt">${fn(rem)} ج</div>
      <button type="button" onclick="quickCollect('${o._id}','${_esc(o.clientName)}',${rem})"
        class="btn btn-g btn-xs" style="flex-shrink:0" title="تحصيل سريع">💰</button>
    </div>`;
  }).join('');

  const more = active.length > cap
    ? `<div style="text-align:center;padding:8px 0;font-size:var(--fs-sm);color:var(--dim2)">
        +${active.length - cap} أوردر ·
        <button type="button" class="btn btn-ghost btn-xs"
          onclick="switchSec(document.querySelector('.stab[onclick*=pending]'),&quot;pending&quot;)">عرض الكل</button>
       </div>`
    : '';
  return { html: rows + more, count: active.length, total: totalRem };
}

// ── Supplier obligations ────────────────────────────────────
function _supplierOblig({ suppliers, supplierPays, allOrders, fn, SPCOL, cap = 5 }) {
  const list = suppliers.map(s => {
    const cost = allOrders.flatMap(o => o.costItems||[])
      .filter(ci => ci.supplierId === s._id)
      .reduce((sum, ci) => sum + (parseFloat(ci.total)||0), 0);
    const paid = supplierPays
      .filter(p => p.supplierId === s._id)
      .reduce((sum, p) => sum + (parseFloat(p.amount)||0), 0);
    return { ...s, due: Math.max(0, cost - paid) };
  }).filter(s => s.due > 0).sort((a, b) => b.due - a.due);

  const total = list.reduce((s, x) => s + x.due, 0);
  if (!list.length) return { html: '<div class="empty-sm">✅ لا توجد مستحقات</div>', total: 0, count: 0 };

  const rows = list.slice(0, cap).map(s => {
    const col = SPCOL[s.specialty] || 'var(--dim2)';
    return `<div class="sup-obl-row">
      <div class="sup-obl-av" style="background:${col}18;color:${col}">${(s.name||'?')[0]}</div>
      <div style="flex:1;min-width:0">
        <div class="sup-obl-name">${s.name}</div>
        <div style="font-size:var(--fs-xs);color:${col}">${s.specialty||''}</div>
      </div>
      <div style="font-size:15px;font-weight:var(--fw-heavy);color:var(--r);white-space:nowrap;margin-inline-start:auto">${fn(s.due)} ج</div>
      <button type="button" onclick="quickPaySup('${s._id}','${_esc(s.name)}',${s.due})"
        class="btn btn-danger btn-xs" style="flex-shrink:0" title="دفع">💸</button>
    </div>`;
  }).join('');

  const more = list.length > cap
    ? `<div class="empty-sm">+${list.length - cap} موردين آخرين</div>`
    : '';
  return { html: rows + more, total, count: list.length };
}

// ── Shipping companies owed ────────────────────────────────
function _shippingCos({ allOrders, fn, ORDER_STAGES, cap = 5 }) {
  const shipMap = {};
  allOrders
    .filter(o => o.shipCompanyName &&
      [ORDER_STAGES.SHIPPING, ORDER_STAGES.ARCHIVED].includes(o.stage) &&
      !o.shipSettled && o.shipMethod !== 'pickup')
    .forEach(o => {
      const due = Math.max(0,
        (parseFloat(o.salePrice)||0) - (parseFloat(o.discount)||0) -
        (parseFloat(o.totalPaid)||parseFloat(o.deposit)||0)
      );
      if (!shipMap[o.shipCompanyName]) shipMap[o.shipCompanyName] = { count: 0, due: 0 };
      shipMap[o.shipCompanyName].count++;
      shipMap[o.shipCompanyName].due += due;
    });
  const entries = Object.entries(shipMap).sort((a, b) => b[1].due - a[1].due);
  const total   = entries.reduce((s, [, v]) => s + v.due, 0);
  if (!entries.length) return { html: '', total: 0 };

  const rows = entries.slice(0, cap).map(([name, data]) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <div>
        <div style="font-size:var(--fs-md);font-weight:var(--fw-bold)">📦 ${name}</div>
        <div style="font-size:var(--fs-xs);color:var(--dim2)">${data.count} شحنة غير مسوّاة</div>
      </div>
      <span style="font-size:15px;font-weight:var(--fw-heavy);color:var(--b)">${fn(data.due)} ج</span>
    </div>`
  ).join('');
  return { html: rows, total };
}

// ── Recent transactions feed ──────────────────────────────
function _recentTxFeed({ transactions, wallets, CAT, fn, limit = 12 }) {
  const recent = transactions.slice(0, limit);
  if (!recent.length) return '<div class="empty-sm">لا توجد حركات</div>';
  return recent.map(t => {
    const isIn  = t.type === 'in';
    const wName = wallets.find(x => x._id === t.walletId)?.name || '';
    return `<div class="txf-row">
      <div class="txf-dot" style="background:${isIn?'var(--g)':'var(--r)'}"></div>
      <div style="flex:1;min-width:0">
        <div class="txf-desc">${t.description || CAT[t.category] || '—'}</div>
        <div class="txf-meta">${t.date||'—'}${wName?' · '+wName:''}</div>
      </div>
      <div class="txf-amt" style="color:${isIn?'var(--g)':'var(--r)'}">
        ${isIn?'↑':'↓'}${fn(t.amount)} ج
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
// renderDashboard — المصدّر الرئيسي
// ════════════════════════════════════════════════════════════
export function renderDashboard({
  wallets, transactions, allOrders, suppliers, supplierPays,
  shippingSettlements,
  isInPeriod, fn, calcRem, activePeriod, PERIOD_NAMES_AR,
  ORDER_STAGES, CAT, WICO, WNAME, WCOLS, WTONE, SPCOL,
}) {
  const totalBal = wallets.reduce((s, w) => s + (parseFloat(w.balance)||0), 0);

  const walletsHtml = _walletRows({ wallets, transactions, isInPeriod, fn, WICO, WCOLS, WTONE, PERIOD_NAMES_AR, activePeriod });
  const { html: pendHtml, count: pendCount, total: pendTotal } = _pendingRows({ allOrders, calcRem, fn, ORDER_STAGES });
  const { html: supHtml,  total: supTotal,  count: supCount  } = _supplierOblig({ suppliers, supplierPays, allOrders, fn, SPCOL });
  const { html: shipHtml, total: shipTotal  }                  = _shippingCos({ allOrders, fn, ORDER_STAGES });
  const txFeedHtml = _recentTxFeed({ transactions, wallets, CAT, fn });

  // ── Audit drift quick-check ──
  const totalCollected = shippingSettlements.reduce((s, r) => s + (parseFloat(r.amount)||0), 0);

  return `
    <div class="dash-grid">

      <!-- ═══ COL 1 (أضيق): الحسابات + شركات الشحن ═══ -->
      <div style="display:flex;flex-direction:column;gap:var(--space-md)">

        <!-- المحافظ -->
        <div class="dash-panel">
          <div class="dash-panel-head">
            <div class="dash-panel-title">💼 الحسابات والمحافظ</div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="dash-panel-badge" style="background:var(--tint-g-soft);color:var(--g)">${fn(totalBal)} ج</span>
              <button type="button" class="btn btn-g btn-xs"
                onclick="oM('new-wallet')" title="حساب جديد">＋</button>
            </div>
          </div>
          ${walletsHtml}
          <div style="display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
            <button type="button" class="btn btn-b btn-xs" style="flex:1"
              onclick="oM('transfer');fillTransferInfo()">🔄 تحويل</button>
            <a href="ledger.html" class="btn btn-ghost btn-xs"
              style="flex:1;text-align:center;text-decoration:none">📊 السجل</a>
            <button type="button" class="btn btn-ghost btn-xs" style="flex:1"
              onclick="switchSec(document.querySelector('.stab[onclick*=wallets]'),&quot;wallets&quot;)">⚙️ إدارة</button>
          </div>
        </div>

        <!-- شركات الشحن -->
        ${shipHtml ? `<div class="dash-panel">
          <div class="dash-panel-head">
            <div class="dash-panel-title">📦 شركات الشحن المديونة</div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="dash-panel-badge" style="background:var(--tint-b-soft);color:var(--b)">${fn(shipTotal)} ج</span>
              <span style="font-size:var(--fs-xs);color:var(--dim2)">تحصّل: ${fn(totalCollected)} ج</span>
            </div>
          </div>
          ${shipHtml}
          <a href="shipping-accounts.html"
            style="display:block;text-align:center;margin-top:8px;font-size:var(--fs-sm);color:var(--b);font-weight:var(--fw-bold);text-decoration:none">
            إدارة التسويات ←</a>
        </div>` : ''}

      </div>

      <!-- ═══ COL 2 (أوسع): التحصيلات + الموردين ═══ -->
      <div style="display:flex;flex-direction:column;gap:var(--space-md)">

        <!-- التحصيلات المعلقة -->
        <div class="dash-panel">
          <div class="dash-panel-head">
            <div class="dash-panel-title">⏳ التحصيلات المعلقة</div>
            <span class="dash-panel-badge" style="background:var(--tint-r-soft);color:var(--r)">
              ${pendCount} أوردر · ${fn(pendTotal)} ج
            </span>
          </div>
          ${pendHtml}
        </div>

        <!-- مستحق الموردين -->
        ${supCount > 0 ? `<div class="dash-panel">
          <div class="dash-panel-head">
            <div class="dash-panel-title">🏭 مستحق للموردين</div>
            <span class="dash-panel-badge" style="background:var(--tint-r-soft);color:var(--r)">${fn(supTotal)} ج</span>
          </div>
          ${supHtml}
          <button type="button" class="btn btn-ghost btn-xs" style="width:100%;margin-top:8px"
            onclick="switchSec(document.querySelector('.stab[onclick*=suppliers]'),&quot;suppliers&quot;)">
            عرض كل الموردين ←</button>
        </div>` : ''}

      </div>
    </div>

    <!-- ═══ آخر الحركات (full width) ═══ -->
    <div class="dash-panel">
      <div class="dash-panel-head">
        <div class="dash-panel-title">📋 آخر الحركات المالية</div>
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" class="btn btn-g btn-xs" onclick="oM('new-tx');setTimeout(updateTxCats,100)">＋ حركة</button>
          <button type="button" class="btn btn-ghost btn-xs"
            onclick="switchSec(document.querySelector('.stab[onclick*=transactions]'),&quot;transactions&quot;)">
            عرض الكل ←</button>
        </div>
      </div>
      <div class="txf-grid">${txFeedHtml}</div>
    </div>
  `;
}
