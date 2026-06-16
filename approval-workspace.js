// approval-workspace.js — Approval Command Center Workspace Drawer
// Module extracted from approvals.html to keep that file under 2500 lines.
// Context is injected via syncWorkspaceCtx() — all state comes from caller.

let _ctx = {};

export function syncWorkspaceCtx(ctx) {
  _ctx = { ..._ctx, ...ctx };
}

let _activeId   = null;
let _activeType = null; // 'request' | 'tx'
let _activeTab  = 'summary';

export function openWorkspace(id, type) {
  _activeId   = id;
  _activeType = type;
  _activeTab  = 'summary';
  _render();
  document.getElementById('ws-drawer')?.classList.add('open');
  document.getElementById('ws-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeWorkspace() {
  document.getElementById('ws-drawer')?.classList.remove('open');
  document.getElementById('ws-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
  _activeId   = null;
  _activeType = null;
}

export function wsSetTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('.ws-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const c = document.getElementById('ws-content');
  if (c) c.innerHTML = _renderTabContent();
}

// ── helpers ──────────────────────────────────────────────────────────────────

function _getItem() {
  if (!_activeId) return null;
  if (_activeType === 'request') return (_ctx.requests || []).find(r => r._id === _activeId) || null;
  return (_ctx.txs || []).find(t => t._id === _activeId) || null;
}

const _esc  = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const _fn   = n => (parseFloat(n) || 0).toLocaleString('ar-EG');

function _fmtD(ts) {
  if (!ts) return '—';
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString('ar-EG', { dateStyle:'short', timeStyle:'short' });
  if (typeof ts === 'string') return ts;
  return '—';
}

function _fmtAge(h) {
  if (h >= 24) { const d=Math.floor(h/24); const rh=Math.round(h%24); return rh?`${d} ي ${rh} س`:`${d} يوم`; }
  return `${Math.max(1,Math.round(h))} ساعة`;
}

function _ctx_fn()   { return _ctx.fn   || _fn; }
function _ctx_esc()  { return _ctx.escapeHtml || _esc; }
function _ctx_fmt()  { return _ctx.fmtDate    || _fmtD; }

// ── main drawer render ────────────────────────────────────────────────────────

function _render() {
  const drawer = document.getElementById('ws-drawer');
  if (!drawer) return;
  const item = _getItem();
  if (!item) { closeWorkspace(); return; }

  const fn  = _ctx_fn();
  const esc = _ctx_esc();
  const isReq = _activeType === 'request';

  const typeLbl = isReq
    ? ((_ctx.REQ_TYPE_LBL || {})[item.type] || item.type)
    : ((_ctx.CAT_AR || {})[item.category] || item.category || 'حركة');
  const icon = isReq ? '💸' : ((_ctx.ICONS || {})[item.category] || '📝');

  const beneficiary = isReq
    ? (item.supplierName || item.employeeName || item.clientName || item.reason || '—')
    : (item.clientName || item.supplierName || item.employeeName || '—');

  const stLbl = isReq
    ? ({requested:'💸 بانتظار التنفيذ', awaiting_receipt:'📥 بانتظار الإيصال', pending:'⏳ بانتظار التأكيد', confirmed:'🔵 بانتظار الاعتماد', approved:'🔒 معتمدة', rejected:'❌ مرفوضة'})[item.status] || item.status
    : ({pending:'⏳ بانتظار التأكيد', confirmed:'🔵 مؤكّدة', approved:'🔒 معتمدة', rejected:'❌ مرفوضة'})[item.approvalStatus] || item.approvalStatus;

  const amount = parseFloat(item.amount) || 0;

  drawer.innerHTML = `
    <div class="ws-header">
      <div class="ws-header-info">
        <div class="ws-title">${icon} ${esc(typeLbl)} — ${esc(beneficiary)}</div>
        <div class="ws-subtitle">${stLbl} · <b style="font-family:monospace;color:var(--y)">${fn(amount)} ج</b></div>
      </div>
      <button class="ws-close" onclick="closeWorkspace()">✕</button>
    </div>
    <div class="ws-tabs">
      <button class="ws-tab on" data-tab="summary" onclick="wsSetTab('summary')">📋 ملخص</button>
      <button class="ws-tab" data-tab="order"   onclick="wsSetTab('order')">📦 الأوردر</button>
      <button class="ws-tab" data-tab="files"   onclick="wsSetTab('files')">🧾 الملفات</button>
      <button class="ws-tab" data-tab="history" onclick="wsSetTab('history')">📜 السجل</button>
      <button class="ws-tab" data-tab="action"  onclick="wsSetTab('action')">⚡ الإجراء</button>
    </div>
    <div id="ws-content" class="ws-content">${_renderTabContent()}</div>
  `;
}

function _renderTabContent() {
  switch (_activeTab) {
    case 'summary': return _tabSummary();
    case 'order':   return _tabOrder();
    case 'files':   return _tabFiles();
    case 'history': return _tabHistory();
    case 'action':  return _tabAction();
    default:        return _tabSummary();
  }
}

// ── Tab: ملخص ────────────────────────────────────────────────────────────────

function _tabSummary() {
  const item = _getItem();
  if (!item) return '';
  const fn  = _ctx_fn();
  const esc = _ctx_esc();
  const fmt = _ctx_fmt();
  const isReq = _activeType === 'request';

  const typeLbl = isReq
    ? ((_ctx.REQ_TYPE_LBL || {})[item.type] || item.type)
    : ((_ctx.CAT_AR || {})[item.category] || item.category || 'حركة');

  const wName = item.walletName || (_ctx.walletsMap?.get?.(item.walletId)) || item.walletId || '—';
  const createdBy = isReq ? item.requestedByName : item.createdByName;
  const createdAt = isReq ? item.requestedAt     : item.createdAt;

  // SLA / stale badge
  let slaBadge = '';
  if (isReq && _ctx.computeRequestAging) {
    const aging = _ctx.computeRequestAging(item, { staleHours: _ctx.staleHours || 48 });
    if (aging.isStale) {
      slaBadge = `<div style="margin-top:6px"><span style="background:rgba(255,61,110,.15);color:var(--r);padding:3px 10px;border-radius:8px;font-size:var(--fs-xs);font-weight:var(--fw-bold)">⏳ متأخر ${_fmtAge(aging.ageHours)}</span></div>`;
    }
  }

  // Risks
  let risksHtml = '';
  if (isReq && _ctx.detectRisks && _ctx.detectAnomaly) {
    const risks = [..._ctx.detectRisks(item), ..._ctx.detectAnomaly(item)];
    if (risks.length) {
      risksHtml = `<div class="ws-sec" style="border-color:rgba(255,61,110,.4)">
        <div class="ws-sec-title" style="color:var(--r)">⚠️ تنبيهات (${risks.length})</div>
        ${risks.map(r=>`<div style="font-size:var(--fs-sm);color:${r.lvl==='high'?'var(--r)':'var(--y)'};margin-top:4px">${r.txt}</div>`).join('')}
      </div>`;
    }
  }

  // Execution section
  let execHtml = '';
  if (isReq && item.executedByName) {
    const tx  = item.txId ? (_ctx.allTxs || []).find(t => t._id === item.txId) : null;
    const ws  = (tx && _ctx.computeWalletState) ? _ctx.computeWalletState(tx) : null;
    const liv = ws?.walletCurrent;
    execHtml = `<div class="ws-sec">
      <div class="ws-sec-title">💸 التنفيذ</div>
      <div style="display:grid;gap:7px;font-size:var(--fs-sm)">
        <div style="display:flex;justify-content:space-between"><span class="text-muted">المنفّذ</span><b class="text-snow">${esc(item.executedByName)}</b></div>
        <div style="display:flex;justify-content:space-between"><span class="text-muted">التاريخ</span><b class="text-snow">${fmt(item.executedAt)}</b></div>
        ${item.sourceWalletName?`<div style="display:flex;justify-content:space-between"><span class="text-muted">المحفظة</span><b class="text-snow">${esc(item.sourceWalletName)}</b></div>`:''}
        ${item.transferRef?`<div style="display:flex;justify-content:space-between"><span class="text-muted">مرجع التحويل</span><b style="font-family:monospace;color:var(--p)">${esc(item.transferRef)}</b></div>`:''}
        ${item.executeNote?`<div style="display:flex;justify-content:space-between"><span class="text-muted">ملاحظة</span><b class="text-snow">${esc(item.executeNote)}</b></div>`:''}
      </div>
      ${ws?`<div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:6px">snapshot: ${fn(ws.before)} → ${fn(ws.after)} ج</div>`:''}
      ${liv != null ? `<div class="ws-bal-bar" style="margin-top:8px;margin-bottom:0">
        <div style="font-size:var(--fs-xs);color:var(--dim2)">💰 الرصيد الحالي للمحفظة الآن</div>
        <div style="font-size:var(--fs-xl);font-weight:var(--fw-heavy);font-family:monospace;color:${liv<0?'var(--r)':'var(--g)'}">${fn(liv)} ج</div>
      </div>` : ''}
    </div>`;
  }

  // Receipt section
  let receiptHtml = '';
  if (isReq && item.receivedByName) {
    receiptHtml = `<div class="ws-sec">
      <div class="ws-sec-title">📥 الاستلام</div>
      <div style="display:grid;gap:7px;font-size:var(--fs-sm)">
        <div style="display:flex;justify-content:space-between"><span class="text-muted">مستلِم الإيصال</span><b class="text-snow">${esc(item.receivedByName)}</b></div>
        <div style="display:flex;justify-content:space-between"><span class="text-muted">التاريخ</span><b class="text-snow">${fmt(item.receivedAt)}</b></div>
      </div>
    </div>`;
  }

  return `
    ${risksHtml}
    <div class="ws-sec">
      <div class="ws-sec-title">📋 تفاصيل</div>
      <div style="display:grid;gap:8px;font-size:var(--fs-sm)">
        <div style="display:flex;justify-content:space-between"><span class="text-muted">النوع</span><b class="text-snow">${esc(typeLbl)}</b></div>
        <div style="display:flex;justify-content:space-between"><span class="text-muted">المبلغ</span><b style="font-family:monospace;font-size:var(--fs-md);color:var(--y)">${fn(parseFloat(item.amount)||0)} ج</b></div>
        <div style="display:flex;justify-content:space-between"><span class="text-muted">المحفظة</span><b class="text-snow">${esc(wName)}</b></div>
        <div style="display:flex;justify-content:space-between"><span class="text-muted">الطالب / المُنشئ</span><b class="text-snow">${esc(createdBy||'—')}</b></div>
        <div style="display:flex;justify-content:space-between"><span class="text-muted">التاريخ</span><b class="text-snow">${fmt(createdAt)}</b></div>
        ${(item.reason||item.description)?`<div style="display:flex;justify-content:space-between;gap:8px"><span class="text-muted">السبب</span><b class="text-snow" style="text-align:left;max-width:200px">${esc((item.reason||item.description||'').slice(0,120))}</b></div>`:''}
      </div>
      ${slaBadge}
    </div>
    ${execHtml}
    ${receiptHtml}
    ${_renderEntitySummary(item)}
  `;
}

function _renderEntitySummary(item) {
  if (!item.supplierId && !item.employeeId && !item.clientId) return '';
  const fn  = _ctx_fn();
  const esc = _ctx_esc();
  const entityType = item.supplierId ? '🏭 المورد' : item.employeeId ? '👤 الموظف' : '👥 العميل';
  const entityName = item.supplierName || item.employeeName || item.clientName || '—';
  let histHtml = '';
  if (_ctx.entityHistory) {
    const hist = _ctx.entityHistory(item);
    const cnt  = hist?.count  ?? 0;
    const tot  = hist?.total  ?? 0;
    const rec  = hist?.recent ?? [];
    histHtml = `
      <div style="display:flex;gap:14px;font-size:var(--fs-sm);margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)">
        <div><span class="text-muted">دفعات سابقة</span><br><b style="color:${cnt>5?'var(--y)':'var(--snow)'}">${cnt}</b></div>
        <div><span class="text-muted">إجمالي</span><br><b class="text-y">${fn(tot)} ج</b></div>
      </div>
      ${rec.length?`<div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:6px">آخر دفعات: ${rec.slice(0,3).map(t=>`${fn(t.amount)} ج (${t.date||'—'})`).join(' · ')}</div>`:''}`;
  }
  return `<div class="ws-sec">
    <div class="ws-sec-title">${entityType}</div>
    <div style="font-size:var(--fs-base);font-weight:var(--fw-bold);color:var(--snow)">${esc(entityName)}</div>
    ${item.supplierType?`<div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:2px">${item.supplierType==='shipper'?'شركة شحن':'مطبعة / مورد'}</div>`:''}
    ${item.salaryType?`<div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:4px">نوع: <b>${esc(item.salaryType)}</b>${item.salaryMonth?` · شهر: <b>${esc(item.salaryMonth)}</b>`:''}</div>`:''}
    ${histHtml}
  </div>`;
}

// ── Tab: الأوردر ─────────────────────────────────────────────────────────────

function _tabOrder() {
  const item = _getItem();
  if (!item) return '';
  const fn  = _ctx_fn();
  const esc = _ctx_esc();
  const STAGE_AR  = _ctx.STAGE_AR  || {};
  const STAGE_COL = _ctx.STAGE_COL || {};
  const ordersMap = _ctx.ordersMap;
  const displayPhone = _ctx.displayPhone || (p => p);

  // grouped request (no single order)
  if (_activeType === 'request' && item.costItemRefs?.length && !item.orderId) {
    const orders = new Set(item.costItemRefs.map(x => x.orderId)).size;
    return `<div class="ws-sec">
      <div class="ws-sec-title">📋 طلب مُجمَّع — ${item.costItemRefs.length} بند من ${orders} أوردر</div>
      <div style="font-size:var(--fs-sm);line-height:var(--lh-relaxed)">
        ${item.costItemRefs.map(x=>`<div style="padding:6px 0;border-bottom:1px dashed var(--line)">
          <b class="mono">${esc(x.orderRefId||'')}</b> — ${esc(x.clientName||'')}
          <br><span class="text-muted">${esc(x.type||'بند')}</span> · <b class="text-y">${fn(x.amount)} ج</b>
        </div>`).join('')}
      </div>
    </div>`;
  }

  const oid = item.orderId;
  let order = oid ? ordersMap?.get?.(oid) : null;
  if (!order && oid) {
    for (const o of (ordersMap?.values?.() || [])) { if (o.orderId === oid) { order = o; break; } }
  }

  if (!order) {
    return `<div class="ws-sec"><div class="text-muted text-center" style="padding:24px">لا يوجد أوردر مرتبط</div></div>`;
  }

  const stColor = STAGE_COL[order.stage] || '#888';
  const stLabel = STAGE_AR[order.stage]  || order.stage;
  const totalCost = (order.costItems||[]).reduce((s,c)=>s+(parseFloat(c.total)||0),0);
  const paidCost  = (order.costItems||[]).filter(c=>c.paid).reduce((s,c)=>s+(parseFloat(c.total)||0),0);
  const products  = (order.products||[]).map(p=>`${esc(p.name||'منتج')}${p.qty>1?' ×'+p.qty:''}`).join(' · ') || esc(order.product||'—');
  const phone     = order.clientPhone ? esc(displayPhone(order.clientPhone)) : '';

  const costItems = (order.costItems||[]).map((c,idx)=>{
    const highlight = _activeType==='request' && item.costItemIndex===idx;
    return `<div style="display:flex;justify-content:space-between;padding:4px ${highlight?'8px':'0'};font-size:var(--fs-sm);border-bottom:1px dashed var(--line);${highlight?'background:rgba(167,139,250,.15);border-radius:4px':''}">
      <span>${highlight?'<b class="text-p">⬅ هذا الطلب: </b>':''}${esc(c.type||'بند')}${c.supplierName?' — '+esc(c.supplierName):''}</span>
      <span>${fn(c.total||0)} ج ${c.paid?'<span style="color:var(--g)">✓</span>':'<span style="color:var(--y)">⏳</span>'}</span>
    </div>`;
  }).join('');

  return `<div class="ws-sec">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div class="ws-sec-title" style="margin-bottom:0">📦 الأوردر</div>
      <button type="button" onclick="openOrderDetails('${order._id}')" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(167,139,250,.4);background:rgba(167,139,250,.15);color:var(--p);cursor:pointer;font-size:var(--fs-xs);font-weight:var(--fw-extra);font-family:inherit">🔗 فتح كاملاً</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
      <b style="font-family:monospace;font-size:var(--fs-base);color:var(--snow)">${esc(order.orderId||order._id.slice(-8))}</b>
      <span style="background:${stColor}22;color:${stColor};padding:2px 10px;border-radius:8px;font-size:var(--fs-xs);font-weight:var(--fw-extra)">${stLabel}</span>
    </div>
    <div style="display:grid;gap:7px;font-size:var(--fs-sm)">
      <div style="display:flex;justify-content:space-between"><span class="text-muted">العميل</span><b class="text-snow">${esc(order.clientName||'—')}</b></div>
      ${phone?`<div style="display:flex;justify-content:space-between"><span class="text-muted">التليفون</span><b style="font-family:monospace;color:var(--snow)">${phone}</b></div>`:''}
      <div style="display:flex;justify-content:space-between"><span class="text-muted">المنتجات</span><b class="text-snow">${products}</b></div>
      <div style="display:flex;justify-content:space-between"><span class="text-muted">السعر</span><b class="text-snow">${fn(order.salePrice||0)} ج</b></div>
      <div style="display:flex;justify-content:space-between"><span class="text-muted">المدفوع</span><b class="text-g">${fn(order.totalPaid||order.paid||order.deposit||0)} ج</b></div>
      <div style="display:flex;justify-content:space-between"><span class="text-muted">إجمالي التكلفة</span><b class="text-y">${fn(totalCost)} ج</b></div>
    </div>
    ${(order.costItems||[]).length ? `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--line)">
      <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:6px">بنود التكلفة (مدفوع: ${fn(paidCost)} / ${fn(totalCost)} ج):</div>
      ${costItems}
    </div>` : ''}
  </div>`;
}

// ── Tab: الملفات ─────────────────────────────────────────────────────────────

function _tabFiles() {
  const item = _getItem();
  if (!item) return '';
  const esc = _ctx_esc();
  const imgs = [];

  if (_activeType === 'request') {
    if (item.receiptImageUrl)  imgs.push({ url: item.receiptImageUrl,  label: '🧾 إيصال الاستلام' });
    if (item.executeReceiptUrl) imgs.push({ url: item.executeReceiptUrl, label: '📤 إيصال التنفيذ' });
  } else {
    const url = item.receiptUrl || item.receiptImageUrl;
    if (url) imgs.push({ url, label: '🧾 إيصال التحويل' });
  }

  const oid = item.orderId;
  if (oid && _ctx.ordersMap) {
    let ord = _ctx.ordersMap.get?.(oid);
    if (!ord) for (const o of (_ctx.ordersMap.values?.() || [])) { if (o.orderId===oid) { ord=o; break; } }
    if (ord) {
      if (ord.designFileUrl) imgs.push({ url: ord.designFileUrl, label: '🎨 ملف التصميم' });
      (ord.designFiles||[]).forEach((f,i) => f.url && imgs.push({ url: f.url, label: `🎨 تصميم ${i+1}` }));
      if (ord.printFinalUrl) imgs.push({ url: ord.printFinalUrl, label: '🖨️ ملف الطباعة النهائي' });
    }
  }

  if (!imgs.length) {
    return `<div class="ws-sec"><div class="text-muted text-center" style="padding:24px">لا توجد ملفات أو صور مرفقة</div></div>`;
  }

  return `<div class="ws-sec">
    <div class="ws-sec-title">📎 الملفات والصور (${imgs.length})</div>
    <div class="ws-file-grid">
      ${imgs.map(f=>`
        <div class="ws-file-item" onclick="openLb('${esc(f.url)}')">
          <img src="${esc(f.url)}" loading="lazy" decoding="async" alt="${esc(f.label)}" class="ws-file-img">
          <div class="ws-file-lbl">${esc(f.label)}</div>
        </div>`).join('')}
    </div>
  </div>`;
}

// ── Tab: السجل ───────────────────────────────────────────────────────────────

function _tabHistory() {
  const item = _getItem();
  if (!item) return '';
  const fn  = _ctx_fn();
  const esc = _ctx_esc();
  const fmt = _ctx_fmt();
  const CAT_AR = _ctx.CAT_AR || {};
  const isReq  = _activeType === 'request';

  // Build timeline
  const tl = [];
  if (isReq) {
    if (item.requestedAt) tl.push({ ico:'💸', label:'طُلب',               by: item.requestedByName, at: item.requestedAt });
    if (item.executedAt)  tl.push({ ico:'✅', label:'نُفِّذ',              by: item.executedByName,  at: item.executedAt  });
    if (item.receivedAt)  tl.push({ ico:'📥', label:'استُلم الإيصال',     by: item.receivedByName,  at: item.receivedAt  });
    if (item.confirmedAt) tl.push({ ico:'🔵', label:'أُكِّد',             by: item.confirmedByName, at: item.confirmedAt });
    if (item.approvedAt)  tl.push({ ico:'🔒', label:'اعتُمِد',            by: item.approvedByName,  at: item.approvedAt  });
    if (item.rejectedAt)  tl.push({ ico:'❌', label:`رُفض (${esc(item.rejectReason||'—')})`, by: item.rejectedByName, at: item.rejectedAt });
  } else {
    if (item.createdAt)   tl.push({ ico:'📝', label:'أُنشئ',             by: item.createdByName,   at: item.createdAt   });
    if (item.confirmedAt) tl.push({ ico:'🔵', label:'أُكِّد',            by: item.confirmedByName,  at: item.confirmedAt });
    if (item.approvedAt)  tl.push({ ico:'🔒', label:'اعتُمِد',           by: item.approvedByName,   at: item.approvedAt  });
    if (item.rejectedAt)  tl.push({ ico:'❌', label:`رُفض (${esc(item.rejectReason||'—')})`, by: item.rejectedByName, at: item.rejectedAt });
  }

  const timelineHtml = tl.length ? `<div class="ws-sec">
    <div class="ws-sec-title">📅 تسلسل الأحداث</div>
    ${tl.map(e=>`<div class="ws-timeline-row">
      <span style="font-size:var(--fs-lg);line-height:1">${e.ico}</span>
      <div>
        <div style="font-weight:var(--fw-bold);color:var(--snow)">${e.label}</div>
        <div style="color:var(--dim2);font-size:var(--fs-xs)">${esc(e.by||'—')} · ${fmt(e.at)}</div>
      </div>
    </div>`).join('')}
  </div>` : '';

  // Client history
  let cliHtml = '';
  if (item.clientId && _ctx.getClientHistory) {
    const h = _ctx.getClientHistory(item.clientId);
    if (h && (h.totalOrders || h.clientTxs?.length)) {
      const recent = (h.approvedTxs||[]).slice(0,6).map(x=>`
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);padding:4px 0;border-bottom:1px dashed var(--line)">
          <span>${x.approvalStatus==='approved'?'🔒':'🔵'} ${CAT_AR[x.category]||x.category||'حركة'}${x.description?' — '+esc(x.description.slice(0,40)):''}</span>
          <span style="color:var(--dim2);font-family:monospace">${fn(x.amount)} ج</span>
        </div>`).join('') || `<div class="txt-meta-sm">لا اعتمادات سابقة</div>`;
      const totRem = h.totalRem || 0;
      cliHtml = `<div class="ws-sec">
        <div class="ws-sec-title">👥 سجل العميل: ${esc(item.clientName||'—')}</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:var(--fs-sm);margin-bottom:10px">
          <div><span class="text-muted">الأوردرات:</span> <b class="text-snow">${h.totalOrders}</b></div>
          <div><span class="text-muted">السعر الإجمالي:</span> <b class="text-snow">${fn(h.totalSale)} ج</b></div>
          <div><span class="text-muted">المدفوع:</span> <b class="text-g">${fn(h.totalPaid)} ج</b></div>
          <div><span class="text-muted">المتبقي:</span> <b style="color:${totRem>0?'var(--r)':'var(--g)'}">${fn(totRem)} ج</b></div>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-bottom:4px">آخر الاعتمادات:</div>
        ${recent}
      </div>`;
    }
  }

  const result = timelineHtml + cliHtml;
  return result || `<div class="ws-sec"><div class="text-muted text-center" style="padding:24px">لا يوجد سجل</div></div>`;
}

// ── Tab: الإجراء ─────────────────────────────────────────────────────────────

function _tabAction() {
  const item = _getItem();
  if (!item) return '';
  const fn  = _ctx_fn();
  const esc = _ctx_esc();
  const isReq = _activeType === 'request';

  // Wallet state (tx only)
  let walletHtml = '';
  if (!isReq && _ctx.computeWalletState) {
    const state = _ctx.computeWalletState(item);
    if (state) {
      const { before, after, walletCurrent } = state;
      const delta  = after - before;
      const dSign  = delta >= 0 ? '+' : '−';
      const dColor = delta >= 0 ? 'var(--g)' : 'var(--r)';
      const wName  = item.walletName || _ctx.walletsMap?.get?.(item.walletId) || '—';
      walletHtml = `<div class="ws-sec">
        <div class="ws-sec-title">💼 حركة المحفظة — ${esc(wName)}</div>
        ${walletCurrent != null ? `<div class="ws-bal-bar">
          <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:2px">💰 الرصيد الحالي الآن</div>
          <div style="font-size:var(--fs-2xl);font-weight:var(--fw-heavy);font-family:monospace;color:${walletCurrent<0?'var(--r)':'var(--g)'}">${fn(walletCurrent)} ج</div>
        </div>` : ''}
        <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:8px">📸 snapshot وقت التنفيذ:</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="text-align:center"><div style="font-size:var(--fs-xs);color:var(--dim2)">قبل</div><b style="font-family:monospace;color:var(--snow)">${fn(before)} ج</b></div>
          <span style="color:var(--dim2)">→</span>
          <div style="text-align:center;background:rgba(0,0,0,.15);border-radius:8px;padding:4px 10px">
            <div style="font-size:var(--fs-xs);color:var(--dim2)">${item.type==='in'?'دخول':'خروج'}</div>
            <b style="color:${dColor};font-family:monospace">${dSign} ${fn(Math.abs(delta))} ج</b>
          </div>
          <span style="color:var(--dim2)">→</span>
          <div style="text-align:center"><div style="font-size:var(--fs-xs);color:var(--dim2)">بعد</div><b style="font-family:monospace;color:${after<0?'var(--r)':'var(--snow)'}">${fn(after)} ج</b></div>
        </div>
      </div>`;
    }
  }

  const { canDo, requiresStrictSeparation, financialPolicy, currentUid, currentRole, currentPerms, _requestTierAction } = _ctx;
  const _wait = txt => `<div style="font-size:var(--fs-sm);color:var(--dim2);padding:var(--space-sm)">${txt}</div>`;
  let acts = '';

  if (isReq) {
    const r = item;
    const _exec  = canDo?.('execute_payments', currentRole, currentPerms);
    const _final = canDo?.('final_approve_payments', currentRole, currentPerms);
    const _strict = requiresStrictSeparation?.(financialPolicy);
    const canExecute = () => _exec || (_final && !_strict);
    const _btnReject  = `<button type="button" class="btn-reject"  onclick="rejectRequest('${r._id}')">✕ رفض</button>`;
    const _btnConfirm = `<button type="button" class="btn-confirm" onclick="confirmRequest('${r._id}')">✓ تأكيد</button>`;
    const _btnApprove = `<button type="button" class="btn-approve" onclick="approveRequest('${r._id}')">✅ اعتماد نهائي</button>`;

    if (r.status === 'requested' && canExecute()) {
      acts = `<button type="button" class="btn-execute" onclick="openExecuteModal('${r._id}')">💸 تنفيذ + رفع إيصال</button>${_btnReject}`;
    } else if (r.status === 'awaiting_receipt' && (_exec || _final || r.requestedBy === currentUid)) {
      acts = `<button type="button" class="btn-receive" onclick="openReceiptModal('${r._id}')">📤 رفع الإيصال</button>${_btnReject}`;
    } else if (r.status === 'awaiting_receipt') {
      acts = _wait('⏳ بانتظار رفع الإيصال من المنفّذ');
    } else if (r.status === 'pending' || r.status === 'confirmed') {
      const stage = _requestTierAction?.(r, { canExec:_exec, canFinal:_final, strict:_strict, userId:currentUid });
      if      (stage === 'confirm')              acts = `${_btnConfirm}${_btnReject}`;
      else if (stage === 'confirm_or_approve')   acts = `${_btnConfirm}<button type="button" class="btn-approve" onclick="approveRequest('${r._id}')">✅ اعتماد مباشر</button>${_btnReject}`;
      else if (stage === 'await_confirm')        acts = _wait('⏳ بانتظار تأكيد مسؤول التشغيل');
      else if (stage === 'approve')              acts = `${_btnApprove}${_btnReject}`;
      else if (stage === 'self_confirmed')       acts = _wait('⛔ الفصل الصارم: أنت من أكّد — يلزم أدمن مختلف') + _btnReject;
      else if (stage === 'await_approve')        acts = _wait('⏳ بانتظار اعتماد الأدمن');
    } else if (r.status === 'approved') {
      acts = `<div style="font-size:var(--fs-sm);color:var(--g);padding:10px;background:rgba(0,217,126,.08);border-radius:8px">🔒 تم الاعتماد النهائي بواسطة ${esc(r.approvedByName||'—')} · ${_ctx_fmt()(r.approvedAt)}</div>`;
    } else if (r.status === 'rejected') {
      acts = `<div style="font-size:var(--fs-sm);color:var(--r);padding:10px;background:rgba(255,61,110,.08);border-radius:8px">❌ مرفوض بواسطة ${esc(r.rejectedByName||'—')}${r.rejectReason?' — '+esc(r.rejectReason):''}</div>`;
    }
  } else {
    const t = item;
    const _canExec  = canDo?.('execute_payments', currentRole, currentPerms);
    const _canFinal = canDo?.('final_approve_payments', currentRole, currentPerms);
    const _strict   = requiresStrictSeparation?.(financialPolicy);
    const isOwnRec  = t.isRecovery && t.createdBy === currentUid;

    if (t.approvalStatus === 'pending' && _canExec && !_canFinal) {
      acts = isOwnRec
        ? `<div style="font-size:var(--fs-sm);color:var(--r)">⛔ لا يمكنك مراجعة عمليتك الخاصة (مبدأ الأربع عيون)</div>`
        : `<button type="button" class="btn-confirm" onclick="confirmTx('${t._id}')">✓ تأكيد</button>
           <button type="button" class="btn-reject"  onclick="rejectTx('${t._id}')">✕ رفض</button>`;
    } else if (t.approvalStatus === 'pending' && _canFinal) {
      acts = isOwnRec
        ? `<div style="font-size:var(--fs-sm);color:var(--r)">⛔ لا يمكنك مراجعة استردادك الخاص</div>`
        : `<button type="button" class="btn-confirm" onclick="confirmTx('${t._id}')">✓ تأكيد</button>
           ${_strict?'':` <button type="button" class="btn-approve" onclick="approveTx('${t._id}')">✅ اعتماد مباشر</button>`}
           <button type="button" class="btn-reject"  onclick="rejectTx('${t._id}')">✕ رفض</button>`;
    } else if (t.approvalStatus === 'confirmed' && _canFinal) {
      if (isOwnRec) {
        acts = `<div style="font-size:var(--fs-sm);color:var(--r)">⛔ لا يمكنك اعتماد استردادك الخاص</div>
                <button type="button" class="btn-reject" onclick="rejectTx('${t._id}')">✕ رفض</button>`;
      } else if (_strict && t.confirmedBy === currentUid) {
        acts = `<div style="font-size:var(--fs-sm);color:var(--r)">⛔ الفصل الصارم: أنت من أكّد — يلزم admin مختلف للاعتماد</div>
                <button type="button" class="btn-reject" onclick="rejectTx('${t._id}')">✕ رفض</button>`;
      } else {
        acts = `<button type="button" class="btn-approve" onclick="approveTx('${t._id}')">✅ اعتماد + أرشفة</button>
                <button type="button" class="btn-reject"  onclick="rejectTx('${t._id}')">✕ رفض</button>`;
      }
    } else if (t.approvalStatus === 'approved') {
      acts = `<div style="font-size:var(--fs-sm);color:var(--g);padding:10px;background:rgba(0,217,126,.08);border-radius:8px">🔒 معتمدة بواسطة ${esc(t.approvedByName||'—')} · ${_ctx_fmt()(t.approvedAt)}</div>`;
    } else if (t.approvalStatus === 'rejected') {
      acts = `<div style="font-size:var(--fs-sm);color:var(--r);padding:10px;background:rgba(255,61,110,.08);border-radius:8px">❌ مرفوضة${t.rejectReason?' — '+esc(t.rejectReason):''}</div>`;
    }
  }

  const actionsHtml = acts ? `<div class="ws-sec">
    <div class="ws-sec-title">⚡ الإجراء</div>
    <div class="ws-actions">${acts}</div>
  </div>` : '';

  return walletHtml + actionsHtml || `<div class="ws-sec"><div class="text-muted text-center" style="padding:24px">لا توجد إجراءات متاحة</div></div>`;
}
