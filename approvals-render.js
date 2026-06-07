/**
 * Business2Card ERP — approvals-render.js
 *
 * ━━━ PURE RENDER + FORMATTING LAYER FOR approvals.html ━━━
 *
 * God-page decomposition (RULE G5/H1.7 + L1):
 * يستخرج طبقة التصيير النقية (HTML builders + formatters + display
 * constants) خارج `approvals.html` (1940 سطر → أصغر) إلى موديول مُركَّز.
 *
 * كل دالة تصيير نقية: تأخذ بياناتها + كائن `ctx` يحمل حالة التشغيل
 * (الهوية/الصلاحيات/البيانات/السياسة) ولا تلمس الـ DOM ولا تكتب شيئاً.
 * المنطق الحسابي يبقى مُمَركَزاً في `core/approvals-utils.js`؛ هذا الموديول
 * يستهلكه فقط. العقود مطابقة تماماً للأصل في الصفحة → السلوك بلا تغيير.
 *
 *   ctx = {
 *     currentUid, currentRole, currentPerms, financialPolicy,
 *     walletsArr, walletsMap, allTxs, ordersMap, requests,
 *     displayPhone,   // (phone) => مُقنَّع/كامل حسب الصلاحية (RULE 8)
 *     staleHours,     // عتبة الـ SLA بالساعات
 *     activeTab,      // (لـ bulkBar فقط)
 *   }
 */

import { canDo } from './core/permissions-matrix.js';
import { requiresStrictSeparation } from './core/financial-policy.js';
import { STAGE_AR, STAGE_COL, ROLE_LABELS } from './core/shared-constants.js';
import {
  computeWalletState as _computeWalletState,
  detectRisks as _detectRisks,
  detectSupplierAnomaly as _detectSupplierAnomaly,
  computeRequestAging as _computeRequestAging,
  requestTierAction as _requestTierAction,
  selectBulkEligible as _selectBulkEligible,
} from './core/approvals-utils.js';

// ─── DISPLAY CONSTANTS ───────────────────────────────────────────────
export const ICONS = { client_payment:'💰', refund:'↩️', salary:'👤', bonus:'🎁', deduction:'✂️', printer_payment:'🏭', shipper_payment:'🚚', shipping_cost:'🚚', shipping_settlement:'📦', transfer:'🔄', opening_balance:'🏦', adjustment:'⚖️', expense:'💸' };
export const CAT_AR = { client_payment:'دفعة عميل', refund:'استرداد عميل', salary:'راتب', bonus:'مكافأة', deduction:'خصم', printer_payment:'دفعة مطبعة', shipper_payment:'دفعة شركة شحن', shipping_cost:'تكلفة شحن', shipping_settlement:'تسوية شحن', transfer:'تحويل بين محافظ', opening_balance:'رصيد افتتاحي', adjustment:'تسوية رصيد', expense:'مصروف', admin_edit:'تعديل أدمن', transfer_fee:'رسوم تحويل', withdrawal:'سحب', withdrawal_fee:'رسوم سحب' };
export const REQ_TYPE_LBL = { supplier_payment:'🏭 دفعة مورد', salary:'👤 مرتب', advance:'💵 سلفة', bonus:'🎁 مكافأة', general:'💸 مصروف عام', client_refund:'↩️ استرداد عميل' };

// ─── PURE FORMATTERS ─────────────────────────────────────────────────
export const fn = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

export function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function fmtDate(ts){
  if(!ts) return '—';
  if(ts.seconds) return new Date(ts.seconds*1000).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'});
  if(typeof ts === 'string') return ts;
  return '—';
}

export function fmtAge(h){
  if(h>=24){ const d=Math.floor(h/24); const rh=Math.round(h%24); return rh?`${d} ي ${rh} س`:`${d} يوم`; }
  return `${Math.max(1,Math.round(h))} ساعة`;
}

// ─── INTERNAL ctx-DERIVED HELPERS ────────────────────────────────────
const _walletState = (t, ctx) => _computeWalletState(t, { wallets: ctx.walletsArr || [], transactions: ctx.allTxs || [] });
const _risks       = (r, ctx) => _detectRisks(r, { allRequests: ctx.requests || [], ordersMap: ctx.ordersMap || new Map(), format: fn, policy: ctx.financialPolicy });
const _anomaly     = (r, ctx) => _detectSupplierAnomaly(r, { allTxns: ctx.allTxs || [], format: fn });

// ══ سجل العميل: إحصائيات + كل الحركات + آخر تصميم ══
export function getClientHistory(clientId, ctx = {}){
  if(!clientId) return null;
  const ordersMap = ctx.ordersMap || new Map();
  const allTxs = ctx.allTxs || [];
  const clientOrders = [...ordersMap.values()].filter(o => o.clientId === clientId);
  const clientTxs = allTxs.filter(t => t.clientId === clientId);
  const totalOrders = clientOrders.length;
  const totalSale = clientOrders.reduce((s,o)=>s+(parseFloat(o.salePrice)||0),0);
  const totalPaid = clientOrders.reduce((s,o)=>s+(parseFloat(o.totalPaid)||parseFloat(o.paid)||parseFloat(o.deposit)||0),0);
  const totalRem  = clientOrders.reduce((s,o)=>{
    const sale = parseFloat(o.salePrice)||0;
    const disc = parseFloat(o.discount)||0;
    const sFee = parseFloat(o.customerShipFee)||0;
    const paid = parseFloat(o.totalPaid)||parseFloat(o.paid)||parseFloat(o.deposit)||0;
    return s + Math.max(0, sale + sFee - disc - paid);
  },0);
  let latestDesignUrl = null, latestDesignDate = null;
  for(const o of clientOrders){
    const url = o.designFileUrl || (o.designFiles && o.designFiles[0]?.url) || null;
    if(url){
      const dt = o.createdAt?.seconds || 0;
      if(!latestDesignDate || dt > latestDesignDate){ latestDesignUrl = url; latestDesignDate = dt; }
    }
  }
  const approvedTxs = clientTxs.filter(t => t.approvalStatus === 'approved' || t.approvalStatus === 'confirmed')
    .sort((a,b)=>(b.approvedAt?.seconds||b.confirmedAt?.seconds||0)-(a.approvedAt?.seconds||a.confirmedAt?.seconds||0))
    .slice(0,8);
  return { totalOrders, totalSale, totalPaid, totalRem, latestDesignUrl, clientOrders, clientTxs, approvedTxs };
}

export function renderClientHistory(t, ctx = {}){
  const clientId = t.clientId;
  if(!clientId) return '';
  const h = getClientHistory(clientId, ctx);
  if(!h || (!h.totalOrders && !h.clientTxs.length)) return '';
  const recentApprovals = h.approvedTxs.map(x=>{
    const cat = CAT_AR[x.category] || x.category || 'حركة';
    const stIco = x.approvalStatus === 'approved' ? '🔒' : '🔵';
    const dt = fmtDate(x.approvedAt || x.confirmedAt);
    const by = x.approvedByName || x.confirmedByName || '—';
    return `<div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);padding:4px 0;border-bottom:1px dashed var(--line)">
      <span>${stIco} ${cat}${x.description?' — '+escapeHtml(x.description.slice(0,40)):''}</span>
      <span style="color:var(--dim2);font-family:monospace">${fn(x.amount)} ج · ${dt} · ${escapeHtml(by)}</span>
    </div>`;
  }).join('') || '<div class="txt-meta-sm">لا اعتمادات سابقة</div>';

  const recentTxs = h.clientTxs.slice(-5).reverse().map(x=>{
    const isIn = x.type === 'in';
    return `<div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);padding:3px 0">
      <span style="color:${isIn?'var(--g)':'var(--r)'}">${isIn?'+':'−'} ${fn(x.amount)} ج</span>
      <span class="text-muted">${escapeHtml(x.description||x.category||'').slice(0,40)} · ${escapeHtml(x.date||'')}</span>
    </div>`;
  }).join('');

  return `
    <div style="background:rgba(34,211,238,.06);border:1px solid rgba(34,211,238,.25);border-radius:var(--rad);padding:10px 12px;margin-top:8px">
      <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-extra);margin-bottom:8px">👥 سجل العميل: ${escapeHtml(t.clientName || '—')}</div>
      <div style="display:grid;grid-template-columns:${h.latestDesignUrl?'90px ':''}1fr;gap:10px">
        ${h.latestDesignUrl ? `<div><a href="${escapeHtml(h.latestDesignUrl)}" target="_blank" title="آخر تصميم"><img src="${escapeHtml(h.latestDesignUrl)}" loading="lazy" decoding="async" alt="design" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--line);cursor:zoom-in"></a></div>` : ''}
        <div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:var(--space-xs);font-size:var(--fs-sm)">
            <div><span class="text-muted">أوردرات:</span> <b class="text-snow">${h.totalOrders}</b></div>
            <div><span class="text-muted">السعر الإجمالي:</span> <b class="text-snow">${fn(h.totalSale)}</b></div>
            <div><span class="text-muted">المدفوع:</span> <b class="text-g">${fn(h.totalPaid)}</b></div>
            <div><span class="text-muted">المتبقي:</span> <b style="color:${h.totalRem>0?'var(--r)':'var(--g)'}">${fn(h.totalRem)}</b></div>
          </div>
        </div>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)">
        <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-bottom:4px">📜 الاعتمادات السابقة (آخر 8):</div>
        ${recentApprovals}
      </div>
      ${recentTxs ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)">
        <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-bottom:4px">💰 آخر 5 حركات:</div>
        ${recentTxs}
      </div>` : ''}
    </div>`;
}

export function renderOrderDetails(o, costOnly = false, ctx = {}){
  if(!o) return '';
  const displayPhone = ctx.displayPhone || ((p)=>p||'');
  const totalCost = (o.costItems||[]).reduce((s,c)=>s+(parseFloat(c.total)||0),0);
  const stage = o.stage || '—';
  const stColor = STAGE_COL[stage] || '#888';
  const stLabel = STAGE_AR[stage] || stage;
  const products = (o.products || []).map(p => `${escapeHtml(p.name||'منتج')}${p.qty>1?' ×'+p.qty:''}`).join(' · ') || escapeHtml(o.product || '—');
  const phone = o.clientPhone ? escapeHtml(displayPhone(o.clientPhone)) : '';

  const costRows = costOnly ? `
      <div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:6px;padding-top:8px;border-top:1px dashed var(--line)">
        <div style="margin-bottom:4px">بنود التكلفة (مجموع <b class="text-y">${fn(totalCost)} ج</b>):</div>
        ${(o.costItems||[]).length ? (o.costItems||[]).map(c=>`<div>• ${escapeHtml(c.type||'بند')}: ${fn(c.total||0)} ج${c.supplierName?' — '+escapeHtml(c.supplierName):''}</div>`).join('') : '<div class="text-muted">لا توجد بنود تكلفة بعد</div>'}
      </div>` : `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(85px,1fr));gap:6px;font-size:var(--fs-sm);padding-top:8px;border-top:1px dashed var(--line)">
        <div><span class="text-muted">السعر:</span> <b class="text-snow">${fn(o.salePrice||0)}</b></div>
        <div><span class="text-muted">المدفوع:</span> <b class="text-g">${fn(o.totalPaid||o.paid||o.deposit||0)}</b></div>
        <div><span class="text-muted">التكلفة:</span> <b class="text-y">${fn(totalCost)}</b></div>
      </div>`;

  return `
    <div style="background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.25);border-radius:var(--rad);padding:10px 12px;margin-top:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:var(--space-sm)">
        <div style="font-size:var(--fs-sm);color:var(--dim2);font-weight:var(--fw-bold);display:flex;align-items:center;gap:var(--space-sm)">
          <span>📋 تفاصيل الأوردر</span>
          <button type="button" onclick="openOrderDetails('${o._id}')" style="padding:3px 9px;border-radius:6px;border:1px solid rgba(167,139,250,.4);background:rgba(167,139,250,.15);color:var(--p);cursor:pointer;font-size:var(--fs-xs);font-weight:var(--fw-extra);font-family:inherit">🔗 فتح كاملاً</button>
        </div>
        <span style="background:${stColor}22;color:${stColor};padding:2px 9px;border-radius:var(--rad);font-size:var(--fs-xs);font-weight:var(--fw-extra)">${stLabel}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;font-size:var(--fs-sm);margin-bottom:6px">
        <div><span class="text-muted">رقم:</span> <b style="font-family:monospace;color:var(--snow)">${escapeHtml(o.orderId || o._id.slice(-8))}</b></div>
        <div><span class="text-muted">العميل:</span> <b class="text-snow">${escapeHtml(o.clientName || '—')}</b></div>
        ${phone?`<div><span class="text-muted">تليفون:</span> <b style="font-family:monospace;color:var(--snow)">${phone}</b></div>`:''}
      </div>
      <div style="font-size:var(--fs-sm);color:var(--dim2);margin-bottom:4px">المنتجات: <span class="text-snow">${products}</span></div>
      ${costRows}
    </div>`;
}

// ══ تاريخ الكيان: كم دفعت له قبل كده + متى ══
export function entityHistory(r, ctx = {}){
  const allTxs = ctx.allTxs || [];
  const hist = { count:0, total:0, recent:[] };
  if(!allTxs.length) return hist;
  const matches = allTxs.filter(t => {
    if(t._id === r.txId) return false;
    if(t.isReversal) return false;
    if(r.type === 'supplier_payment' && r.supplierId)
      return t.supplierId === r.supplierId && (t.type === 'out');
    if(r.type === 'salary' && r.employeeId)
      return t.employeeId === r.employeeId && t.category === 'salary';
    if(r.type === 'client_refund' && r.clientId)
      return t.clientId === r.clientId && t.category === 'refund';
    return false;
  });
  hist.count = matches.length;
  hist.total = matches.reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  hist.recent = matches.slice(-5).reverse();
  return hist;
}

export function renderWalletState(t, wName, isIn, ctx = {}){
  if(!t.walletId) return '';
  const state = _walletState(t, ctx);
  if(!state) return '';
  const allTxs = ctx.allTxs || [];
  const { before, after, walletCurrent } = state;
  const delta = after - before;
  const deltaSign = delta >= 0 ? '+' : '−';
  const deltaColor = delta >= 0 ? 'var(--g)' : 'var(--r)';
  const isLastOnWallet = (() => {
    if(!walletCurrent && walletCurrent !== 0) return false;
    for(let i = allTxs.length - 1; i >= 0; i--){
      const x = allTxs[i];
      if(x.walletId === t.walletId) return x._id === t._id;
    }
    return false;
  })();
  const drift = (walletCurrent != null && isLastOnWallet) ? (walletCurrent - after) : 0;
  const hasDrift = Math.abs(drift) > 0.01;
  const canAdjust = canDo('execute_payments', ctx.currentRole, ctx.currentPerms);

  return `
    <div style="background:rgba(59,158,255,.08);border:1px solid rgba(59,158,255,.25);border-radius:var(--rad);padding:10px 12px;margin-top:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:var(--space-sm)">
        <div style="font-size:var(--fs-sm);color:var(--dim2);font-weight:var(--fw-bold)">💼 حركة المحفظة — ${escapeHtml(wName)}</div>
        ${walletCurrent != null ? `<div class="txt-meta-xs">الرصيد الحالي للمحفظة الآن: <b style="color:${walletCurrent<0?'var(--r)':'var(--snow)'};font-family:monospace">${fn(walletCurrent)} ج</b></div>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:var(--space-sm);align-items:center;font-size:var(--fs-base)">
        <div class="text-center"><div style="color:var(--dim2);font-size:var(--fs-xs);margin-bottom:2px">الرصيد قبل</div><div style="font-weight:var(--fw-heavy);color:var(--snow);font-size:var(--fs-lg)">${fn(before)} ج</div></div>
        <div style="color:var(--dim2);font-size:var(--fs-lg)">→</div>
        <div style="text-align:center;background:rgba(0,0,0,.15);border-radius:8px;padding:var(--space-xs)"><div style="color:var(--dim2);font-size:var(--fs-xs);margin-bottom:2px">${isIn?'دخول':'خروج'}</div><div style="font-weight:var(--fw-heavy);color:${deltaColor};font-size:var(--fs-lg)">${deltaSign} ${fn(Math.abs(delta))} ج</div></div>
        <div style="color:var(--dim2);font-size:var(--fs-lg)">→</div>
        <div class="text-center"><div style="color:var(--dim2);font-size:var(--fs-xs);margin-bottom:2px">الرصيد بعد</div><div style="font-weight:var(--fw-heavy);color:${after<0?'var(--r)':'var(--snow)'};font-size:var(--fs-lg)">${fn(after)} ج</div></div>
      </div>
      ${hasDrift ? `
        <div style="background:rgba(255,61,110,.08);border:1px solid rgba(255,61,110,.3);border-radius:8px;padding:8px 10px;margin-top:8px;font-size:var(--fs-sm)">
          <div style="color:var(--r);font-weight:var(--fw-extra);margin-bottom:4px">⚠️ انحراف بين الرصيد المتوقع والمحفوظ</div>
          <div style="color:var(--dim);line-height:1.6">
            الرصيد المحسوب من الـtx: <b style="color:var(--snow);font-family:monospace">${fn(after)} ج</b><br>
            الرصيد المحفوظ في المحفظة: <b style="color:var(--snow);font-family:monospace">${fn(walletCurrent)} ج</b><br>
            الفرق: <b style="color:${drift>=0?'var(--g)':'var(--r)'};font-family:monospace">${drift>=0?'+':''}${fn(drift)} ج</b>
          </div>
          ${canAdjust ? `<button type="button" onclick="openAdjustWallet('${t.walletId}', ${after}, ${walletCurrent})" style="margin-top:8px;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,61,110,.5);background:rgba(255,61,110,.15);color:var(--r);cursor:pointer;font-weight:var(--fw-bold);font-size:var(--fs-sm);font-family:inherit">⚖️ ضبط رصيد المحفظة</button>` : ''}
        </div>` : ''}
    </div>`;
}

export function renderRequestCard(r, ctx = {}){
  const { currentUid, currentRole, currentPerms, financialPolicy } = ctx;
  const ordersMap = ctx.ordersMap || new Map();
  const allTxs = ctx.allTxs || [];
  const displayPhone = ctx.displayPhone || ((p)=>p||'');
  const staleHours = ctx.staleHours || 48;

  const typeLbl = REQ_TYPE_LBL[r.type] || r.type;
  const beneficiary = r.supplierName || r.employeeName || r.clientName || r.reason || '—';
  const order = r.orderId ? ordersMap.get(r.orderId) : null;
  const stCls = 'st-' + r.status;
  const stLbl = {requested:'💸 بانتظار التنفيذ', awaiting_receipt:'📥 بانتظار استلام إيصال', pending:'⏳ بانتظار التأكيد', confirmed:'🔵 بانتظار الاعتماد', approved:'🔒 معتمدة ومؤرشَفة', rejected:'❌ مرفوضة'}[r.status] || r.status;
  const _aging = _computeRequestAging(r, { staleHours });
  const _ageBadge = _aging.isStale
    ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:6px;background:rgba(255,61,110,.15);color:var(--r);font-size:var(--fs-xs);font-weight:var(--fw-bold)" title="معلّق منذ ${fmtAge(_aging.ageHours)} — تجاوز عتبة الـ SLA">⏳ متأخّر ${fmtAge(_aging.ageHours)}</span>`
    : '';

  const requesterRoleLbl = ROLE_LABELS[r.requesterRole] || r.requesterRole || '';
  const sectionRequester = `
    <div style="background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.18);border-radius:8px;padding:10px 12px;margin-top:10px">
      <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-extra);margin-bottom:6px">👤 الطالب</div>
      <div style="font-size:var(--fs-base)"><b>${escapeHtml(r.requestedByName||'—')}</b>${requesterRoleLbl?` <span class="txt-meta-xs">(${escapeHtml(requesterRoleLbl)})</span>`:''}</div>
      <div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:2px">⏱ ${fmtDate(r.requestedAt)}</div>
      <div style="font-size:var(--fs-sm);color:var(--snow);margin-top:4px;padding-top:4px;border-top:1px dashed var(--line)">السبب: ${escapeHtml(r.reason||'—')}</div>
    </div>`;

  let sectionExec = '';
  if(r.executedByName){
    const wState = r.txId ? (allTxs.find(t=>t._id===r.txId)) : null;
    const ws = wState ? _walletState(wState, ctx) : null;
    sectionExec = `
      <div style="background:rgba(59,158,255,.05);border:1px solid rgba(59,158,255,.2);border-radius:8px;padding:10px 12px;margin-top:8px">
        <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-extra);margin-bottom:6px">💸 التنفيذ</div>
        <div style="font-size:var(--fs-base)"><b>${escapeHtml(r.executedByName)}</b> — <span class="text-muted">${fmtDate(r.executedAt)}</span></div>
        <div style="font-size:var(--fs-sm);color:var(--dim);margin-top:4px">📤 المحفظة: <b>${escapeHtml(r.sourceWalletName||'—')}</b>${ws?` <span class="text-muted">(${fn(ws.before)} → ${fn(ws.after)} ج)</span>`:''}</div>
        ${r.transferRef?`<div style="font-size:var(--fs-sm);margin-top:2px">📋 رقم التحويل: <b style="font-family:monospace;color:var(--p)">${escapeHtml(r.transferRef)}</b></div>`:''}
        ${r.executeNote?`<div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:2px">ملاحظة: ${escapeHtml(r.executeNote)}</div>`:''}
      </div>`;
  }

  let sectionReceipt = '';
  if(r.receivedByName){
    sectionReceipt = `
      <div style="background:rgba(0,217,126,.05);border:1px solid rgba(0,217,126,.2);border-radius:8px;padding:10px 12px;margin-top:8px">
        <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-extra);margin-bottom:6px">📥 الاستلام بالإيصال</div>
        <div style="font-size:var(--fs-base)"><b>${escapeHtml(r.receivedByName)}</b> — <span class="text-muted">${fmtDate(r.receivedAt)}</span></div>
        ${r.receiptImageUrl?`<div style="margin-top:8px"><a href="${escapeHtml(r.receiptImageUrl)}" target="_blank" title="اضغط للتكبير"><img src="${escapeHtml(r.receiptImageUrl)}" class="receipt-img" loading="lazy" decoding="async" alt="receipt"></a></div>`:'<div style="font-size:var(--fs-sm);color:var(--y);margin-top:4px">⚠️ بدون صورة إيصال</div>'}
      </div>`;
  }

  let sectionEntity = '';
  const hist = entityHistory(r, ctx);
  if(r.supplierId || r.employeeId || r.clientId){
    const entityType = r.supplierId ? '🏭 المورد' : r.employeeId ? '👤 الموظف' : '👥 العميل';
    const entityName = beneficiary;
    sectionEntity = `
      <div style="background:rgba(255,170,0,.04);border:1px solid rgba(255,170,0,.18);border-radius:8px;padding:10px 12px;margin-top:8px">
        <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-extra);margin-bottom:6px">${entityType}</div>
        <div style="font-size:var(--fs-base)"><b>${escapeHtml(entityName)}</b>${r.supplierType?` <span class="txt-meta-xs">(${r.supplierType==='shipper'?'شركة شحن':'مطبعة/مورد'})</span>`:''}</div>
        ${r.salaryType?`<div style="font-size:var(--fs-sm);color:var(--dim);margin-top:2px">نوع: <b>${escapeHtml(r.salaryType)}</b>${r.salaryMonth?` · شهر: <b>${escapeHtml(r.salaryMonth)}</b>`:''}</div>`:''}
        <div style="font-size:var(--fs-sm);color:var(--dim);margin-top:6px;padding-top:6px;border-top:1px dashed var(--line)">
          📊 سجل الدفعات السابقة:
          <b style="color:${hist.count>5?'var(--y)':'var(--snow)'}">${hist.count} دفعة</b> · <b class="text-y">${fn(hist.total)} ج</b>
        </div>
        ${hist.recent.length?`<div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:4px">آخرها: ${hist.recent.slice(0,3).map(t=>`${fn(t.amount)} ج (${t.date||'—'})`).join(' · ')}</div>`:''}
      </div>`;
  }

  let sectionOrder = '';
  if(order){
    const totalCost = (order.costItems||[]).reduce((s,c)=>s+(parseFloat(c.total)||0),0);
    const paidCost = (order.costItems||[]).filter(c=>c.paid).reduce((s,c)=>s+(parseFloat(c.total)||0),0);
    const items = (order.costItems||[]).map((c,idx)=>{
      const isHighlight = r.costItemIndex === idx;
      return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:var(--fs-sm);${isHighlight?'background:rgba(167,139,250,.15);padding:4px 6px;border-radius:4px;margin:2px 0':''}">
        <span>${isHighlight?'<b class="text-p">⬅ هذا الطلب يخص:</b> ':''}${escapeHtml(c.type||'بند')}${c.supplierName?' — '+escapeHtml(c.supplierName):''}</span>
        <span>${fn(c.total||0)} ج ${c.paid?'<span style="color:var(--g);font-weight:var(--fw-extra)">✓ مدفوع</span>':'<span class="text-y">⏳ غير مدفوع</span>'}</span>
      </div>`;
    }).join('');
    sectionOrder = `
      <div style="background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.18);border-radius:8px;padding:10px 12px;margin-top:8px">
        <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-extra);margin-bottom:6px">📦 الأوردر المرتبط</div>
        <div style="font-size:var(--fs-base)"><b class="mono">${escapeHtml(order.orderId||order._id.slice(-8))}</b> — ${escapeHtml(order.clientName||'')}${order.clientPhone?` · <span style="color:var(--dim2);font-family:monospace">${escapeHtml(displayPhone(order.clientPhone))}</span>`:''}</div>
        <div style="display:flex;gap:var(--space-sm);margin-top:4px;flex-wrap:wrap;font-size:var(--fs-xs)">
          <span style="background:${STAGE_COL[order.stage]||'#888'}22;color:${STAGE_COL[order.stage]||'#888'};padding:2px 8px;border-radius:8px;font-weight:var(--fw-extra)">${STAGE_AR[order.stage]||order.stage}</span>
          <span class="text-muted">السعر: <b class="text-snow">${fn(order.salePrice||0)}</b></span>
          <span class="text-muted">المدفوع: <b class="text-g">${fn(order.totalPaid||order.paid||order.deposit||0)}</b></span>
        </div>
        ${(order.costItems||[]).length?`
          <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)">
            <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:4px">بنود التكلفة (${(order.costItems||[]).length} بند · مدفوع ${fn(paidCost)}/${fn(totalCost)} ج):</div>
            ${items}
          </div>`:'<div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:4px">لا توجد بنود تكلفة</div>'}
      </div>`;
  }

  const risks = [..._risks(r, ctx), ..._anomaly(r, ctx)];
  let sectionRisks = '';
  if(risks.length){
    sectionRisks = `
      <div style="background:rgba(255,61,110,.06);border:1px solid rgba(255,61,110,.3);border-radius:8px;padding:10px 12px;margin-top:8px">
        <div style="font-size:var(--fs-xs);color:var(--r);font-weight:var(--fw-extra);margin-bottom:6px">⚠️ تنبيهات (${risks.length})</div>
        ${risks.map(rsk=>`<div style="font-size:var(--fs-sm);color:${rsk.lvl==='high'?'var(--r)':'var(--y)'};margin-top:2px">${rsk.txt}</div>`).join('')}
      </div>`;
  }

  const _exec  = canDo('execute_payments', currentRole, currentPerms);
  const _final = canDo('final_approve_payments', currentRole, currentPerms);
  const _strict = requiresStrictSeparation(financialPolicy);
  const _btnReject = `<button type="button" class="btn-reject" onclick="rejectRequest('${r._id}')">✕ رفض</button>`;
  const _btnConfirm = `<button type="button" class="btn-confirm" onclick="confirmRequest('${r._id}')">✓ تأكيد</button>`;
  const _btnApprove = `<button type="button" class="btn-approve" onclick="approveRequest('${r._id}')">✅ اعتماد نهائي</button>`;
  const _wait = (txt) => `<div style="font-size:var(--fs-sm);color:var(--dim2);padding:var(--space-sm)">${txt}</div>`;
  let actions = '';
  if(r.status === 'requested' && _exec){
    actions = `<button type="button" class="btn-execute" onclick="openExecuteModal('${r._id}')">💸 تنفيذ + رفع إيصال</button>${_btnReject}`;
  } else if(r.status === 'awaiting_receipt' && (_exec || _final || r.requestedBy === currentUid)){
    actions = `<button type="button" class="btn-receive" onclick="openReceiptModal('${r._id}')">📤 رفع الإيصال</button>${_btnReject}`;
  } else if(r.status === 'awaiting_receipt'){
    actions = _wait('⏳ بانتظار رفع الإيصال من المنفّذ');
  } else if(r.status === 'pending' || r.status === 'confirmed'){
    const stage = _requestTierAction(r, { canExec:_exec, canFinal:_final, strict:_strict, userId:currentUid });
    if(stage === 'confirm')              actions = `${_btnConfirm}${_btnReject}`;
    else if(stage === 'confirm_or_approve') actions = `${_btnConfirm}<button type="button" class="btn-approve" onclick="approveRequest('${r._id}')">✅ اعتماد مباشر</button>${_btnReject}`;
    else if(stage === 'await_confirm')   actions = _wait('⏳ بانتظار تأكيد مسؤول التشغيل');
    else if(stage === 'approve')         actions = `${_btnApprove}${_btnReject}`;
    else if(stage === 'self_confirmed')  actions = _wait('⛔ الفصل الصارم: أنت من أكّد — يلزم أدمن مختلف للاعتماد')+_btnReject;
    else if(stage === 'await_approve')   actions = _wait('⏳ بانتظار اعتماد الأدمن');
  }

  return `
    <div class="approval-card">
      <div class="ac-head">
        <div style="flex:1;min-width:200px">
          <div class="ac-title">${typeLbl} — ${escapeHtml(beneficiary)}</div>
          <div class="ac-status ${stCls}">${stLbl}</div>
          ${_ageBadge}
        </div>
        <div class="ac-amount out">− ${fn(r.amount)} ج</div>
      </div>
      ${sectionRisks}
      ${sectionRequester}
      ${sectionExec}
      ${sectionReceipt}
      ${sectionEntity}
      ${r.costItemRefs && r.costItemRefs.length > 1 ? `
        <div style="background:rgba(0,217,126,.05);border:1px solid rgba(0,217,126,.2);border-radius:8px;padding:10px 12px;margin-top:8px">
          <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-extra);margin-bottom:6px">📋 طلب مُجمَّع — ${r.costItemRefs.length} بند من ${new Set(r.costItemRefs.map(x=>x.orderId)).size} أوردر</div>
          <div style="font-size:var(--fs-sm);line-height:1.8">${r.costItemRefs.map(x=>`• ${escapeHtml(x.type||'بند')} — <b class="mono">${escapeHtml(x.orderRefId||'')}</b> — ${escapeHtml(x.clientName||'')} — <b class="text-y">${fn(x.amount)} ج</b>`).join('<br>')}</div>
        </div>
      ` : ''}
      ${sectionOrder}
      ${r.clientId ? renderClientHistory(r, ctx) : ''}
      ${r.rejectedByName?`<div style="background:rgba(255,61,110,.06);border:1px solid rgba(255,61,110,.3);border-radius:8px;padding:8px 12px;margin-top:8px;font-size:var(--fs-sm);color:var(--r)">❌ <b>رفض من ${escapeHtml(r.rejectedByName)}</b> · ${fmtDate(r.rejectedAt)}${r.rejectReason?' · '+escapeHtml(r.rejectReason):''}</div>`:''}
      ${actions?`<div class="ac-actions">${actions}</div>`:''}
    </div>
  `;
}

// ═══════════════════ Suppliers Due (أرصدة الموردين) ═══════════════════
// يأخذ الصفوف محسوبة مسبقاً (computeSupplierDues في الصفحة) ويرجع HTML فقط.
export function renderSuppliersDue(rows = []){
  if(!rows.length){
    return `<div class="empty-pl">✨ لا توجد مديونيات للموردين — كل البنود مدفوعة أو ليس بها مورد</div>`;
  }
  const grandUnpaid = rows.reduce((s,r)=>s+r.totalUnpaid, 0);
  const grandPending = rows.reduce((s,r)=>s+r.totalPending, 0);
  const head = `
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:140px;background:rgba(255,170,0,.08);border:1px solid rgba(255,170,0,.3);border-radius:var(--rad);padding:10px 14px">
        <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold)">💰 إجمالي المستحق (غير مطلوب)</div>
        <div style="font-size:20px;font-weight:var(--fw-heavy);color:var(--y)">${fn(grandUnpaid)} ج</div>
      </div>
      <div style="flex:1;min-width:140px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.3);border-radius:var(--rad);padding:10px 14px">
        <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold)">⏳ تحت طلب قائم</div>
        <div style="font-size:20px;font-weight:var(--fw-heavy);color:var(--p)">${fn(grandPending)} ج</div>
      </div>
    </div>
  `;
  const body = rows.map(r=>{
    const unpaidItems = r.items.filter(i=>!i.pendingReqId);
    const pendingItems = r.items.filter(i=>i.pendingReqId);
    const canRequest = unpaidItems.length > 0;
    return `
      <div class="approval-card" style="padding:12px 14px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:160px">
            <div style="font-weight:var(--fw-heavy);font-size:var(--fs-lg);color:var(--snow)">🏭 ${escapeHtml(r.name)}</div>
            <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:2px">${r.items.length} بند — ${unpaidItems.length} غير مطلوب · ${pendingItems.length} تحت طلب</div>
          </div>
          <div class="text-left">
            <div class="txt-meta-sm">المستحق</div>
            <div style="font-size:var(--fs-2xl);font-weight:var(--fw-heavy);color:var(--y)">${fn(r.totalUnpaid)} ج</div>
            ${r.totalPending > 0 ? `<div style="font-size:var(--fs-xs);color:var(--p)">+ ${fn(r.totalPending)} ج تحت طلب</div>` : ''}
          </div>
          ${canRequest ? `<button type="button" onclick="requestForSupplier('${r.id}','${escapeHtml(r.name).replace(/'/g,"\\'")}','${r.type||''}')" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(0,217,126,.4);background:rgba(0,217,126,.12);color:var(--g);cursor:pointer;font-family:inherit;font-size:var(--fs-base);font-weight:var(--fw-extra)">💸 طلب دفع</button>` : ''}
        </div>
        <details style="margin-top:10px">
          <summary style="cursor:pointer;font-size:var(--fs-sm);color:var(--dim2);font-weight:var(--fw-bold)">تفاصيل البنود (${r.items.length})</summary>
          <div style="margin-top:8px;font-size:var(--fs-sm);line-height:var(--lh-relaxed)">
            ${r.items.map(i=>`
              <div style="display:flex;justify-content:space-between;gap:var(--space-sm);padding:6px 8px;border-bottom:1px dashed var(--line)">
                <div class="flex-1 min-w-0">
                  <b class="text-snow">${escapeHtml(i.type||'بند')}</b>
                  <span class="txt-meta-xs">— ${escapeHtml(i.orderRefId)} — ${escapeHtml(i.clientName)}</span>
                  ${i.note ? `<div class="txt-meta-xs">${escapeHtml(i.note)}</div>` : ''}
                </div>
                <div class="text-left">
                  <span style="font-weight:var(--fw-extra);color:${i.pendingReqId?'var(--p)':'var(--y)'}">${fn(i.amount)} ج</span>
                  ${i.pendingReqId ? `<div style="font-size:var(--fs-tiny);color:var(--p)">⏳ تحت طلب</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </details>
      </div>
    `;
  }).join('');
  return head + body;
}

export function renderCard(t, ctx = {}){
  const { currentUid, currentRole, currentPerms, financialPolicy } = ctx;
  const walletsMap = ctx.walletsMap || new Map();
  const ordersMap = ctx.ordersMap || new Map();

  const cat = CAT_AR[t.category] || t.category || 'حركة';
  const icon = ICONS[t.category] || '📝';
  const wName = t.walletName || walletsMap.get(t.walletId) || t.walletId || '—';
  const isIn = t.type === 'in';
  const entityName = t.clientName || t.supplierName || t.employeeName || '—';
  const isRecovery = t.isRecovery === true;
  const isOwnRecovery = isRecovery && t.createdBy === currentUid;

  let order = null;
  if(t.orderId){
    order = ordersMap.get(t.orderId);
    if(!order){
      for(const o of ordersMap.values()){ if(o.orderId === t.orderId){ order = o; break; } }
    }
  }

  const _canExec  = canDo('execute_payments', currentRole, currentPerms);
  const _canFinal = canDo('final_approve_payments', currentRole, currentPerms);
  const _strict   = requiresStrictSeparation(financialPolicy);
  let actions = '';
  if(t.approvalStatus === 'pending' && _canExec && !_canFinal){
    if(isOwnRecovery){
      actions = `<div style="font-size:var(--fs-sm);color:var(--r);padding:var(--space-sm);background:rgba(255,61,110,.08);border-radius:6px">⛔ لا يمكنك مراجعة عمليتك الخاصة (مبدأ الأربع عيون) — شخص آخر يجب أن يراجع</div>`;
    } else {
      actions = `<button type="button" class="btn-confirm" onclick="confirmTx('${t._id}')">✓ تأكيد</button>
                 <button type="button" class="btn-reject" onclick="rejectTx('${t._id}')">✕ رفض</button>`;
    }
  } else if(t.approvalStatus === 'pending' && _canFinal){
    if(isOwnRecovery){
      actions = `<div style="font-size:var(--fs-sm);color:var(--r);padding:var(--space-sm);background:rgba(255,61,110,.08);border-radius:6px">⛔ لا يمكنك مراجعة استردادك الخاص (مبدأ الأربع عيون) — يحتاج admin/ops آخر</div>`;
    } else {
      actions = `<button type="button" class="btn-confirm" onclick="confirmTx('${t._id}')">✓ تأكيد</button>
                 ${_strict ? '' : `<button type="button" class="btn-approve" onclick="approveTx('${t._id}')">✅ اعتماد مباشر</button>`}
                 <button type="button" class="btn-reject" onclick="rejectTx('${t._id}')">✕ رفض</button>`;
    }
  } else if(t.approvalStatus === 'confirmed' && _canFinal){
    if(isOwnRecovery){
      actions = `<div style="font-size:var(--fs-sm);color:var(--r);padding:var(--space-sm);background:rgba(255,61,110,.08);border-radius:6px">⛔ لا يمكنك اعتماد استردادك الخاص — admin آخر يجب أن يعتمد</div>`;
    } else if(_strict && t.confirmedBy === currentUid){
      actions = `<div style="font-size:var(--fs-sm);color:var(--r);padding:var(--space-sm);background:rgba(255,61,110,.08);border-radius:6px">⛔ الفصل الصارم: أنت من أكّد هذه العملية — يلزم admin مختلف للاعتماد</div>
                 <button type="button" class="btn-reject" onclick="rejectTx('${t._id}')">✕ رفض</button>`;
    } else {
      actions = `<button type="button" class="btn-approve" onclick="approveTx('${t._id}')">✅ اعتماد + أرشفة</button>
                 <button type="button" class="btn-reject" onclick="rejectTx('${t._id}')">✕ رفض</button>`;
    }
  }

  let trail = '';
  if(t.confirmedByName) trail += `<span>🔵 أكّد: <b>${escapeHtml(t.confirmedByName)}</b> · ${fmtDate(t.confirmedAt)}</span>`;
  if(t.approvedByName)  trail += `<span>✅ اعتمد: <b>${escapeHtml(t.approvedByName)}</b> · ${fmtDate(t.approvedAt)}</span>`;
  if(t.rejectedByName)  trail += `<span class="text-r">❌ رفض: <b>${escapeHtml(t.rejectedByName)}</b>${t.rejectReason?' · '+escapeHtml(t.rejectReason):''}</span>`;

  const stCls = 'st-' + t.approvalStatus;
  const stLbl = {pending:'⏳ بانتظار التأكيد', confirmed:'🔵 مؤكَّدة', approved:'🔒 معتمدة', rejected:'❌ مرفوضة'}[t.approvalStatus] || t.approvalStatus;

  const recoveryBanner = isRecovery ? `
    <div style="background:linear-gradient(90deg,rgba(255,61,110,.15),rgba(255,170,0,.1));border:2px solid rgba(255,61,110,.5);border-radius:8px;padding:8px 12px;margin-bottom:10px;display:flex;align-items:center;gap:10px">
      <div style="font-size:var(--fs-2xl)">🔧</div>
      <div class="flex-1">
        <div style="font-weight:var(--fw-heavy);color:var(--r);font-size:var(--fs-base)">استرداد آلي (Recovery) — يحتاج مراجعة دقيقة</div>
        <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:2px">${t.recoveryDate ? `أُنشئ: ${fmtDate({seconds:new Date(t.recoveryDate).getTime()/1000})}` : 'تصحيح آلي عبر أداة الإصلاح'} · <b>مبدأ الأربع عيون نشط</b></div>
      </div>
    </div>` : '';

  return `
    <div class="approval-card${isRecovery?' recovery-card':''}">
      ${recoveryBanner}
      <div class="ac-head">
        <div style="flex:1;min-width:200px">
          <div class="ac-title">${icon} ${cat}${entityName!=='—'?' — '+escapeHtml(entityName):''}${isRecovery?' <span style="background:rgba(255,61,110,.2);color:var(--r);padding:2px 8px;border-radius:8px;font-size:var(--fs-tiny);margin-right:6px">🔧 استرداد</span>':''}</div>
          <div class="ac-meta">${escapeHtml(t.description || '—')}</div>
          <div class="ac-status ${stCls}">${stLbl}</div>
        </div>
        <div class="ac-amount ${isIn?'in':'out'}">${isIn?'+':'−'} ${fn(t.amount)} ج</div>
      </div>
      <div class="ac-body">
        <div class="ac-field">المحفظة <b>${escapeHtml(wName)}</b></div>
        <div class="ac-field">التاريخ <b>${escapeHtml(t.date) || fmtDate(t.createdAt)}</b></div>
        <div class="ac-field">أنشأها <b>${escapeHtml(t.createdByName || '—')}</b></div>
      </div>
      ${renderWalletState(t, wName, isIn, ctx)}
      ${order ? renderOrderDetails(order, true, ctx) : ''}
      ${t.clientId ? renderClientHistory(t, ctx) : ''}
      ${trail?`<div class="ac-trail">${trail}</div>`:''}
      ${actions?`<div class="ac-actions">${actions}</div>`:''}
    </div>
  `;
}

// شريط الإجراء الجماعي (تأكيد الكل / اعتماد الكل) — يحترم القدرات والضوابط.
export function bulkBar(visibleTxs, ctx = {}){
  const { currentUid, currentRole, currentPerms, financialPolicy, activeTab } = ctx;
  const strict = requiresStrictSeparation(financialPolicy);
  let action = '', label = '', handler = '';
  if(activeTab === 'pending' && canDo('execute_payments', currentRole, currentPerms)){
    action = 'confirm'; handler = 'bulkConfirm()'; label = '✓ تأكيد الكل';
  } else if(activeTab === 'confirmed' && canDo('final_approve_payments', currentRole, currentPerms)){
    action = 'approve'; handler = 'bulkApprove()'; label = '✅ اعتماد الكل';
  } else { return ''; }
  const n = _selectBulkEligible(visibleTxs, { action, userId: currentUid, strict }).length;
  if(n < 2) return '';
  return `<div style="display:flex;justify-content:flex-end;margin-bottom:10px">
    <button type="button" class="btn-approve" onclick="${handler}">${label} (${n})</button>
  </div>`;
}
