// ══════════════════════════════════════════════════════════
// accounts-render.js v2 — مساحة العمل المالية المتكاملة
// ══════════════════════════════════════════════════════════
// RULE H1.7: extracted from accounts.html (god page reduction).
// Pure view module — receives state + helpers, returns HTML strings.
// No Firebase writes. No business logic. Actions wired in accounts.html.

const _esc = s => (s || '').replace(/'/g, "\\'");

// ── Urgency scoring ────────────────────────────────────────
// Orders in SHIPPING stage = critical (goods delivered, collect NOW)
// Old orders (> 14 days) = high
// Production stage = medium
// Design/Printing = low
// Score drives the unified action queue sort order.
function _urgency(order, calcRem, ORDER_STAGES) {
  const daysOld = order.createdAt
    ? Math.floor((Date.now() - (order.createdAt.toDate?.() || new Date(order.createdAt)).getTime()) / 86400000)
    : 0;
  const rem = calcRem(order);

  if (order.stage === ORDER_STAGES.SHIPPING) {
    return { color: 'var(--r)', badge: '🚚 شحن', score: 10000 + rem };
  }
  if (daysOld > 14) {
    return { color: 'var(--y)', badge: `📅 ${daysOld}ي`, score: 5000 + rem };
  }
  if (order.stage === ORDER_STAGES.PRODUCTION) {
    return { color: 'var(--c)', badge: '🏭 تنفيذ', score: 2000 + rem };
  }
  if (rem > 1000) {
    return { color: 'var(--b)', badge: '💰 كبير', score: 1000 + rem };
  }
  const stAr = {
    [ORDER_STAGES.DESIGN]  : '✏️ تصميم',
    [ORDER_STAGES.PRINTING]: '🖨️ طباعة',
  }[order.stage] || order.stage;
  return { color: 'var(--dim2)', badge: stAr, score: rem };
}

// ── Alert strip ────────────────────────────────────────────
// Proactive alerts surfaced above the dashboard.
// Only renders when there are actionable critical states.
function _alertStrip({ allOrders, wallets, calcRem, fn, ORDER_STAGES }) {
  const alerts = [];

  // 1. Shipping orders with pending collection (HIGHEST PRIORITY)
  const shippingPending = allOrders.filter(o =>
    o.stage === ORDER_STAGES.SHIPPING && calcRem(o) > 0
  );
  if (shippingPending.length) {
    const total = shippingPending.reduce((s, o) => s + calcRem(o), 0);
    alerts.push({
      type: 'critical',
      html: `<span class="al-icon">🚚</span>
        <span class="al-body">
          <strong>${shippingPending.length} طلبات شحن</strong> وصلت للعميل وتنتظر التحصيل الفوري —
          <strong class="text-r">${fn(total)} ج</strong>
        </span>
        <button type="button" class="btn btn-danger btn-xs"
          onclick="switchSec(document.querySelector('.stab[onclick*=pending]'),&quot;pending&quot;)">
          تحصيل الآن ←</button>`,
    });
  }

  // 2. Negative wallet balances
  wallets.filter(w => (parseFloat(w.balance)||0) < 0).forEach(w => {
    alerts.push({
      type: 'critical',
      html: `<span class="al-icon">⚠️</span>
        <span class="al-body">رصيد سالب في <strong>${w.name}</strong> —
          <strong class="text-r">${fn(w.balance)} ج</strong></span>
        <button type="button" class="btn btn-ghost btn-xs" onclick="openWallet('${w._id}')">عرض</button>`,
    });
  });

  // 3. Orders overdue > 14 days
  const overdueOrders = allOrders.filter(o => {
    if (o.stage === ORDER_STAGES.ARCHIVED || calcRem(o) <= 0) return false;
    const days = o.createdAt
      ? Math.floor((Date.now() - (o.createdAt.toDate?.() || new Date(o.createdAt)).getTime()) / 86400000)
      : 0;
    return days > 14;
  });
  if (overdueOrders.length) {
    const tot = overdueOrders.reduce((s, o) => s + calcRem(o), 0);
    alerts.push({
      type: 'warning',
      html: `<span class="al-icon">📅</span>
        <span class="al-body"><strong>${overdueOrders.length} طلبات</strong> متأخرة أكثر من 14 يوم —
          <strong class="text-y">${fn(tot)} ج</strong></span>
        <button type="button" class="btn btn-ghost btn-xs"
          onclick="switchSec(document.querySelector('.stab[onclick*=pending]'),&quot;pending&quot;)">
          مراجعة</button>`,
    });
  }

  if (!alerts.length) return '';
  return `<div class="al-strip">
    ${alerts.map(a => `<div class="al-item al-${a.type}">${a.html}</div>`).join('')}
  </div>`;
}

// ── Unified financial action queue ─────────────────────────
// Merges collections + supplier obligations into ONE priority-sorted queue.
// Finance person sees: "what must I act on RIGHT NOW?" — not two separate lists.
function _actionQueue({ allOrders, suppliers, supplierPays, calcRem, fn, ORDER_STAGES, SPCOL, cap = 12 }) {
  // --- Collection items ---
  const collectItems = allOrders
    .filter(o => o.stage !== ORDER_STAGES.ARCHIVED && calcRem(o) > 0)
    .map(o => {
      const u    = _urgency(o, calcRem, ORDER_STAGES);
      const paid = parseFloat(o.totalPaid)||parseFloat(o.deposit)||0;
      const sale = parseFloat(o.salePrice)||0;
      const pct  = sale > 0 ? Math.min(paid / sale * 100, 100) : 0;
      return {
        kind: 'collect',
        score: u.score,
        color: u.color,
        badge: u.badge,
        name: o.clientName || '—',
        sub: `${o.orderId||o._id.slice(-6)} · ${Math.round(pct)}% محصّل`,
        amount: calcRem(o),
        pct,
        onclick: `quickCollect('${o._id}','${_esc(o.clientName)}',${calcRem(o)})`,
        btnClass: 'btn-g',
        btnIcon: '💰',
      };
    });

  // --- Supplier payment items ---
  const supItems = suppliers.map(s => {
    const cost = allOrders.flatMap(o => o.costItems||[])
      .filter(ci => ci.supplierId === s._id)
      .reduce((sum, ci) => sum + (parseFloat(ci.total)||0), 0);
    const paid = supplierPays
      .filter(p => p.supplierId === s._id)
      .reduce((sum, p) => sum + (parseFloat(p.amount)||0), 0);
    const due = Math.max(0, cost - paid);
    if (!due) return null;
    const col = SPCOL[s.specialty] || 'var(--b)';
    return {
      kind: 'pay',
      score: due > 3000 ? 4000 + due : due > 1000 ? 1500 + due : due,
      color: col,
      badge: `🏭 ${s.specialty||'مورد'}`,
      name: s.name,
      sub: `تكاليف: ${fn(cost)} · دُفع: ${fn(paid)} ج`,
      amount: due,
      pct: null,
      onclick: `quickPaySup('${s._id}','${_esc(s.name)}',${due})`,
      btnClass: 'btn-danger',
      btnIcon: '💸',
    };
  }).filter(Boolean);

  const all = [...collectItems, ...supItems].sort((a, b) => b.score - a.score);

  const totalCollect = collectItems.reduce((s, x) => s + x.amount, 0);
  const totalPay     = supItems.reduce((s, x)    => s + x.amount, 0);

  if (!all.length) {
    return {
      html: '<div class="empty-sm">✅ لا توجد إجراءات مالية معلقة</div>',
      countCollect: 0, countPay: 0, totalCollect: 0, totalPay: 0,
    };
  }

  const rows = all.slice(0, cap).map(item => `
    <div class="aq-row">
      <div class="aq-badge" style="color:${item.color};border-color:${item.color}50;background:${item.color}12">
        ${item.badge}
      </div>
      <div style="flex:1;min-width:0">
        <div class="aq-name">${item.name}</div>
        <div class="aq-sub">${item.sub}</div>
        ${item.pct !== null
          ? `<div class="pend-item-bar"><div class="pend-item-bar-fill" style="width:${item.pct}%"></div></div>`
          : ''}
      </div>
      <div class="aq-amt" style="color:${item.kind==='collect'?'var(--g)':'var(--r)'}">
        ${fn(item.amount)} ج
      </div>
      <button type="button" onclick="${item.onclick}"
        class="btn ${item.btnClass} btn-xs" style="flex-shrink:0">
        ${item.btnIcon}
      </button>
    </div>`
  ).join('');

  const more = all.length > cap
    ? `<div class="empty-sm">+${all.length - cap} إجراءات أخرى — <button type="button" class="btn btn-ghost btn-xs"
        onclick="switchSec(document.querySelector('.stab[onclick*=pending]'),&quot;pending&quot;)">عرض الكل</button></div>`
    : '';

  return { html: rows + more, countCollect: collectItems.length, countPay: supItems.length, totalCollect, totalPay };
}

// ── Wallet compact rows ──────────────────────────────────
function _walletRows({ wallets, transactions, isInPeriod, fn, WICO, WCOLS, WTONE }) {
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
          · <span style="color:${netCol};font-weight:var(--fw-bold)">${net>=0?'+':''}${fn(net)}</span> ج
        </div>
      </div>
      <div class="wlt-row-bal">${fn(w.balance||0)} <span class="wc-bal-unit">ج</span></div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button type="button" class="btn btn-g btn-xs"
          onclick="event.stopPropagation();prepTx('${w._id}','in')" title="تسجيل دخل">📥</button>
        <button type="button" class="btn btn-danger btn-xs"
          onclick="event.stopPropagation();prepTx('${w._id}','out')" title="تسجيل خرج">📤</button>
      </div>
    </div>`;
  }).join('');
}

// ── Transaction feed (2-col grid, today highlighted) ──────
function _txFeed({ transactions, wallets, CAT, fn, limit = 12 }) {
  const todayStr = new Date().toLocaleDateString('ar-EG');
  const recent   = transactions.slice(0, limit);
  if (!recent.length) return '<div class="empty-sm">لا توجد حركات</div>';
  return recent.map(t => {
    const isIn   = t.type === 'in';
    const wName  = wallets.find(x => x._id === t.walletId)?.name || '';
    const isToday = t.date === todayStr;
    return `<div class="txf-row${isToday ? ' txf-today' : ''}">
      <div class="txf-dot" style="background:${isIn?'var(--g)':'var(--r)'}"></div>
      <div style="flex:1;min-width:0">
        <div class="txf-desc">${t.description || CAT[t.category] || '—'}</div>
        <div class="txf-meta">${isToday ? '<strong style="color:var(--b)">اليوم</strong>' : (t.date||'—')}${wName ? ' · '+wName : ''}</div>
      </div>
      <div class="txf-amt" style="color:${isIn?'var(--g)':'var(--r)'}">
        ${isIn?'↑':'↓'}${fn(t.amount)} ج
      </div>
    </div>`;
  }).join('');
}

// ── Shipping companies overview ──────────────────────────
function _shippingCos({ allOrders, fn, ORDER_STAGES }) {
  const map = {};
  allOrders
    .filter(o => o.shipCompanyName &&
      [ORDER_STAGES.SHIPPING, ORDER_STAGES.ARCHIVED].includes(o.stage) &&
      !o.shipSettled && o.shipMethod !== 'pickup')
    .forEach(o => {
      const due = Math.max(0,
        (parseFloat(o.salePrice)||0) - (parseFloat(o.discount)||0) -
        (parseFloat(o.totalPaid)||parseFloat(o.deposit)||0)
      );
      if (!map[o.shipCompanyName]) map[o.shipCompanyName] = { count: 0, due: 0 };
      map[o.shipCompanyName].count++;
      map[o.shipCompanyName].due += due;
    });
  const entries = Object.entries(map).sort((a, b) => b[1].due - a[1].due);
  const total   = entries.reduce((s, [, v]) => s + v.due, 0);
  if (!entries.length) return { html: '', total: 0 };

  const rows = entries.slice(0, 4).map(([name, data]) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <div>
        <div style="font-size:var(--fs-md);font-weight:var(--fw-bold)">📦 ${name}</div>
        <div style="font-size:var(--fs-xs);color:var(--dim2)">${data.count} شحنة غير مسوّاة</div>
      </div>
      <span style="font-size:14px;font-weight:var(--fw-heavy);color:var(--b)">${fn(data.due)} ج</span>
    </div>`
  ).join('');

  return { html: rows, total };
}

// ── KPI Bar (4 أرقام في الأعلى) ───────────────────────────
function _kpiBar({ totalBal, totalCollect, totalPay, periodRevenue, activePeriod, PERIOD_NAMES_AR, fn }) {
  const items = [
    { ico: '💼', val: fn(totalBal),      lbl: 'إجمالي الأرصدة',                              col: 'var(--g)' },
    { ico: '⏳', val: fn(totalCollect),  lbl: 'تحصيلات معلقة',                               col: 'var(--y)' },
    { ico: '🏭', val: fn(totalPay),      lbl: 'مستحق للموردين',                              col: 'var(--r)' },
    { ico: '📥', val: fn(periodRevenue), lbl: `إيرادات ${PERIOD_NAMES_AR[activePeriod]||'الفترة'}`, col: 'var(--b)' },
  ];
  return `<div class="kpi-bar">
    ${items.map(x => `<div class="kpi-bar-item" style="--kc:${x.col}">
      <div class="kpi-bar-ico">${x.ico}</div>
      <div class="kpi-bar-val">${x.val} <span class="kpi-bar-unit">ج</span></div>
      <div class="kpi-bar-lbl">${x.lbl}</div>
    </div>`).join('')}
  </div>`;
}

// ── Period picker (مُختار الفترة داخل لوحة التشغيل) ────────
// Reuses .period-btn class so setPeriod() syncs is-active automatically.
function _periodPicker({ activePeriod, PERIOD_NAMES_AR }) {
  return `<div class="period-dash-bar">
    ${Object.entries(PERIOD_NAMES_AR).map(([k, v]) => `
      <button type="button" class="period-btn period-dash-btn${k === activePeriod ? ' is-active' : ''}"
        data-period="${k}" onclick="setPeriod('${k}')">
        ${v}
      </button>`).join('')}
  </div>`;
}

// ── Pipeline (قيمة الأوردرات في كل مرحلة) ──────────────────
function _pipeline({ allOrders, ORDER_STAGES, fn }) {
  const stages = [
    { key: ORDER_STAGES.DESIGN,     ico: '✏️',  lbl: 'تصميم',  col: 'var(--p)', link: 'design.html' },
    { key: ORDER_STAGES.PRINTING,   ico: '🖨️', lbl: 'طباعة',  col: 'var(--b)', link: 'print.html' },
    { key: ORDER_STAGES.PRODUCTION, ico: '🏭',  lbl: 'تنفيذ',  col: 'var(--r)', link: 'production.html' },
    { key: ORDER_STAGES.SHIPPING,   ico: '🚚',  lbl: 'شحن',    col: 'var(--c)', link: 'shipping.html' },
  ];
  const active   = allOrders.filter(o => o.stage !== ORDER_STAGES.ARCHIVED && o.stage !== ORDER_STAGES.CANCELLED);
  const totalVal = active.reduce((s, o) => s + (parseFloat(o.salePrice)||0), 0);

  const data = stages.map(st => {
    const ords = active.filter(o => o.stage === st.key);
    const val  = ords.reduce((s, o) => s + (parseFloat(o.salePrice)||0), 0);
    return { ...st, count: ords.length, val, pct: totalVal > 0 ? val / totalVal * 100 : 0 };
  });

  return `<div class="dash-panel">
    <div class="dash-panel-head">
      <div class="dash-panel-title">🔄 Pipeline الأوردرات</div>
      <span class="dash-panel-badge" style="background:var(--tint-b-soft);color:var(--b)">
        ${active.length} طلب · ${fn(totalVal)} ج
      </span>
    </div>
    <div class="pip-grid">
      ${data.map(st => `
        <a href="${st.link}" class="pip-stage" style="--pc:${st.col}">
          <div class="pip-stage-ico">${st.ico}</div>
          <div class="pip-stage-val">${fn(st.val)} <span class="kpi-bar-unit">ج</span></div>
          <div class="pip-stage-lbl">${st.lbl} · ${st.count} طلب</div>
          <div class="pip-bar"><div class="pip-bar-fill" style="width:${st.pct.toFixed(1)}%"></div></div>
        </a>`).join('')}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
// renderDashboard — المُصدِّر الرئيسي
// ════════════════════════════════════════════════════════════
export function renderDashboard({
  wallets, transactions, allOrders, suppliers, supplierPays,
  shippingSettlements,
  isInPeriod, fn, calcRem, activePeriod, PERIOD_NAMES_AR,
  ORDER_STAGES, CAT, WICO, WNAME, WCOLS, WTONE, SPCOL,
}) {
  const totalBal       = wallets.reduce((s, w) => s + (parseFloat(w.balance)||0), 0);
  const totalCollected = shippingSettlements.reduce((s, r) => s + (parseFloat(r.amount)||0), 0);
  const periodRevenue  = transactions
    .filter(t => t.type === 'in' && isInPeriod(t.createdAt))
    .reduce((s, t) => s + (parseFloat(t.amount)||0), 0);

  // Compute all panels
  const alertStrip  = _alertStrip({ allOrders, wallets, calcRem, fn, ORDER_STAGES });
  const walletsHtml = _walletRows({ wallets, transactions, isInPeriod, fn, WICO, WCOLS, WTONE });
  const { html: shipHtml, total: shipTotal } = _shippingCos({ allOrders, fn, ORDER_STAGES });
  const {
    html: aqHtml,
    countCollect, countPay,
    totalCollect, totalPay,
  } = _actionQueue({ allOrders, suppliers, supplierPays, calcRem, fn, ORDER_STAGES, SPCOL });
  const txFeedHtml  = _txFeed({ transactions, wallets, CAT, fn });
  const kpiBarHtml  = _kpiBar({ totalBal, totalCollect, totalPay, periodRevenue, activePeriod, PERIOD_NAMES_AR, fn });
  const periodHtml  = _periodPicker({ activePeriod, PERIOD_NAMES_AR });
  const pipelineHtml = _pipeline({ allOrders, ORDER_STAGES, fn });

  // Collection efficiency (total paid / total sale across ALL orders)
  const totalSale = allOrders.reduce((s, o) => s + (parseFloat(o.salePrice)||0), 0);
  const totalPaid = allOrders.reduce((s, o) => s + (parseFloat(o.totalPaid)||parseFloat(o.deposit)||0), 0);
  const collEff   = totalSale > 0 ? Math.min(totalPaid / totalSale * 100, 100) : 0;
  const collEffCol = collEff >= 80 ? 'var(--g)' : collEff >= 50 ? 'var(--y)' : 'var(--r)';

  return `
    ${kpiBarHtml}
    ${periodHtml}
    ${alertStrip}

    <div class="dash-grid">

      <!-- ═══ COL 1 (أضيق): الحسابات + الشحن + كفاءة التحصيل ═══ -->
      <div style="display:flex;flex-direction:column;gap:var(--space-md)">

        <!-- المحافظ -->
        <div class="dash-panel">
          <div class="dash-panel-head">
            <div class="dash-panel-title">💼 الحسابات والمحافظ</div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="dash-panel-badge" style="background:var(--tint-g-soft);color:var(--g)">${fn(totalBal)} ج</span>
              <button type="button" class="btn btn-g btn-xs" onclick="oM('new-wallet')" title="إضافة حساب">＋</button>
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

        <!-- شركات الشحن (فقط إن وُجدت) -->
        ${shipHtml ? `<div class="dash-panel">
          <div class="dash-panel-head">
            <div class="dash-panel-title">📦 شركات الشحن</div>
            <div style="display:flex;gap:6px;align-items:center">
              <span class="dash-panel-badge" style="background:var(--tint-b-soft);color:var(--b)">${fn(shipTotal)} ج مستحق</span>
            </div>
          </div>
          ${shipHtml}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:var(--fs-xs);color:var(--dim2)">
            <span>تحصّل حتى الآن: <strong class="text-g">${fn(totalCollected)} ج</strong></span>
            <a href="shipping-accounts.html" style="color:var(--b);font-weight:var(--fw-bold);text-decoration:none">إدارة ←</a>
          </div>
        </div>` : ''}

        <!-- كفاءة التحصيل -->
        <div class="dash-panel">
          <div class="dash-panel-head">
            <div class="dash-panel-title">📈 كفاءة التحصيل</div>
            <span class="dash-panel-badge" style="background:${collEffCol}18;color:${collEffCol}">${Math.round(collEff)}%</span>
          </div>
          <div style="height:8px;background:var(--bg3);border-radius:99px;overflow:hidden;margin-bottom:8px">
            <div style="height:100%;width:${collEff}%;background:linear-gradient(90deg,var(--b),${collEffCol});border-radius:99px;transition:.5s"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--dim2)">
            <span>محصّل: <strong class="text-g">${fn(totalPaid)} ج</strong></span>
            <span>متبقي: <strong class="text-r">${fn(Math.max(0, totalSale - totalPaid))} ج</strong></span>
          </div>
        </div>

      </div>

      <!-- ═══ COL 2 (أوسع): طابور الإجراءات المالية ═══ -->
      <div class="dash-panel" style="display:flex;flex-direction:column">
        <div class="dash-panel-head">
          <div>
            <div class="dash-panel-title">⚡ طابور الإجراءات المالية</div>
            <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:2px">
              مرتّب حسب الأولوية · تحصيلات + مستحق موردين
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
            <span class="dash-panel-badge" style="background:var(--tint-g-soft);color:var(--g)">
              📥 ${countCollect} · ${fn(totalCollect)} ج</span>
            <span class="dash-panel-badge" style="background:var(--tint-r-soft);color:var(--r)">
              📤 ${countPay} · ${fn(totalPay)} ج</span>
          </div>
        </div>
        <div style="flex:1;overflow-y:auto;max-height:480px">
          ${aqHtml}
        </div>
      </div>

    </div>

    <!-- ═══ Pipeline الأوردرات ═══ -->
    ${pipelineHtml}

    <!-- ═══ آخر الحركات المالية (full width, 2-col grid) ═══ -->
    <div class="dash-panel">
      <div class="dash-panel-head">
        <div class="dash-panel-title">📋 آخر الحركات المالية</div>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn btn-g btn-xs"
            onclick="oM('new-tx');setTimeout(updateTxCats,100)">＋ حركة</button>
          <button type="button" class="btn btn-ghost btn-xs"
            onclick="switchSec(document.querySelector('.stab[onclick*=transactions]'),&quot;transactions&quot;)">
            الكل ←</button>
        </div>
      </div>
      <div class="txf-grid">${txFeedHtml}</div>
    </div>
  `;
}
