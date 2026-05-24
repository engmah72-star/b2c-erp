// ============================================================
// features/cost-items/drawer.js
// ============================================================
// Vanilla module — Cost Items Drawer for production.html
//
// PRINCIPLES:
//  • UI-only layer. Save logic lives in orderActions.recordCostItem
//    (RULE A1 central action) — drawer just builds the payload.
//  • Reads order/suppliers/wallets/master-cats from window.__costItemsCtx
//    (set by production.html when its globals are ready).
//  • On submit: lazy-imports orderActions + Firestore db, then calls
//    orderActions.recordCostItem(...) which does atomic batch write +
//    addLedgerToBatch (FE.VENDOR_PAYMENT | GENERAL_EXPENSE) +
//    supplier_orders + transactions. Single source of truth.
//  • Module exports nothing; registers window.openCostDrawer /
//    window.closeCostDrawer when loaded. If this file fails to load,
//    production.html's openCostPanel still works as fallback.
//
// EXPECTED CONTEXT (production.html provides):
//   window.__costItemsCtx = {
//     getOrder(id) → order doc | null
//     getSuppliers()     → [{_id, name, phone, specialties, printType, ...}]
//     getWallets()       → [{_id, name, balance, ...}]
//     getMasterCategories() → [{label, group}]
//     getProductsCatalog()  → catalog with costHistory
//     getCurrentRole()      → string
//   }
// ============================================================

(function(){
  'use strict';

  const ctx = () => window.__costItemsCtx;
  const fn = n => (parseFloat(n)||0).toLocaleString('ar-EG');

  // Cost type icon helper (mirror of production.html's COST_ICO)
  const COST_ICO = {طباعة:'🖨️',ورق:'📄',قص:'✂️',سلفنة:'✨',زنكات:'🔵',تجميع:'📦',شحن:'🚚',تصميم:'✏️',أخرى:'📌'};
  function getCostIco(t){
    if(COST_ICO[t]) return COST_ICO[t];
    const l = (t||'').toLowerCase();
    if(['طباع','فلكس','حريرية','uv','ريزو','لارج'].some(k=>l.includes(k))) return '🖨️';
    if(['ورق','كرتون'].some(k=>l.includes(k))) return '📄';
    if(['زنكات','ألواح'].some(k=>l.includes(k))) return '🔵';
    if(['سلفنة','تشطيب','تذهيب','نقر','كريز','تجليد'].some(k=>l.includes(k))) return '✨';
    if(l.includes('قص')) return '✂️';
    if(l.includes('تجميع')) return '📦';
    if(['تصميم','تصوير','موشن'].some(k=>l.includes(k))) return '✏️';
    if(l.includes('شحن')) return '🚚';
    return '📌';
  }

  // State (scoped per drawer instance — only one open at a time)
  let _open = false;
  let _orderId = null;
  let _prodIdx = -1;
  // PR-854: شِيل `mode` (داخلي/خارجي) — كل بند لازم له مورد.
  // أضفت `supplierSpecialties` لـ filter قائمة الأنواع حسب المورد المختار.
  // أضفت `paperMeta` لحاسبة الورق.
  let _draft = {
    supplierId:'', supplierName:'', supplierSpecialties:[],
    type:'',
    total:'',
    note:'',
    paperMeta:null,
  };
  let _editIdx = -1; // -1 = creating; >=0 = editing item at this index in order.costItems
  let _pop = null; // current popover element (auto-close on outside click)

  // ── DOM references (mounted once) ────────────────────────
  let _root, _backdrop, _drawer;

  function mount(){
    if(_root) return;
    _root = document.createElement('div');
    _root.className = 'cid-root';
    _root.innerHTML = `
      <div class="cid-backdrop" data-close-on-click="1"></div>
      <aside class="cid-drawer" role="dialog" aria-modal="true" aria-label="بنود التكلفة"></aside>
    `;
    document.body.appendChild(_root);
    _backdrop = _root.querySelector('.cid-backdrop');
    _drawer   = _root.querySelector('.cid-drawer');

    // outside click → close drawer (backdrop only)
    _backdrop.addEventListener('click', close);
    // Esc → close
    document.addEventListener('keydown', (e) => {
      if(_open && e.key === 'Escape'){
        // if a popover is open, close it first; else close drawer
        if(_pop){ closePop(); return; }
        close();
      }
    });
    // outside click → close popover
    document.addEventListener('mousedown', (e) => {
      if(_pop && !_pop.contains(e.target) && !e.target.closest('[data-cid-pop-anchor]')) closePop();
    });
  }

  // ── render: header + body + footer (re-renders on every state change) ───
  function render(){
    const c = ctx();
    if(!c){ _drawer.innerHTML = '<div style="padding:var(--space-xl);color:var(--ink-3)">⏳ تجهيز السياق...</div>'; return; }
    const o = c.getOrder(_orderId);
    if(!o){ _drawer.innerHTML = '<div style="padding:var(--space-xl);color:var(--danger)">⚠️ الأوردر غير موجود</div>'; return; }
    const prods = o.products || [];
    const prod = _prodIdx >= 0 ? prods[_prodIdx] : null;
    const prodName = prod?.name || prods[0]?.name || 'عام';
    const qty = parseFloat(prod?.qty || prods[0]?.qty) || 0;

    const allCi = o.costItems || [];
    const ci = _prodIdx >= 0
      ? allCi.filter(c => c.prodIdx === _prodIdx || c.prodIdx == null)
      : allCi;
    const total = ci.reduce((s, x) => s + (parseFloat(x.total)||0), 0);
    const unit = qty > 0 ? total / qty : 0;

    // ── suggestions (from products catalog) ──
    const catalog = c.getProductsCatalog ? c.getProductsCatalog() : [];
    let lastRefEntry = null;
    if(prod && catalog && catalog.length){
      const pName = (prod.name||'').trim().toLowerCase();
      const pQty = parseFloat(prod.qty) || 0;
      const cat = catalog.find(cp =>
        (cp.name||'').trim().toLowerCase() === pName ||
        (pName && (cp.name||'').trim().toLowerCase().includes(pName))
      );
      if(cat && (cat.costHistory||[]).length){
        const sameQty = cat.costHistory.filter(h => parseFloat(h.qty) === pQty);
        lastRefEntry = sameQty.length ? sameQty[sameQty.length-1] : cat.costHistory[cat.costHistory.length-1];
      }
    }
    const lastUnitCost = lastRefEntry ? (lastRefEntry.qty > 0 ? lastRefEntry.total / lastRefEntry.qty : 0) : 0;
    const suggestions = (lastRefEntry?.items || []).map(it => ({
      type: it.type,
      supplierName: it.supplierName || '',
      total: parseFloat(it.total) || 0,
    }));

    // ── compute comparison (vs last unit cost) ──
    let cmp = null;
    if(total > 0 && lastUnitCost > 0){
      const diff = ((unit - lastUnitCost) / lastUnitCost) * 100;
      cmp = { diff: Math.abs(diff).toFixed(1), dir: unit < lastUnitCost ? 'down' : unit > lastUnitCost ? 'up' : 'flat' };
    }

    _drawer.innerHTML = `
      <header class="cid-head">
        <button class="cid-close" type="button" aria-label="إغلاق (Esc)">✕</button>
        <div class="cid-head-thumb">${prod?.name?.slice(0,12) || 'بند'}</div>
        <div class="cid-head-title">
          <b>${escapeHtml(prodName)}</b>
          <div class="cid-head-meta">
            ${prod?.size ? `<span>${escapeHtml(prod.size)}</span><span class="cid-dot"></span>` : ''}
            ${qty ? `<span class="cid-qty" dir="ltr">${fn(qty)} قطعة</span><span class="cid-dot"></span>` : ''}
            <span>${escapeHtml(o.orderId || o._id?.slice(-6) || '')}</span>
          </div>
        </div>
        <div class="cid-head-total">
          <div class="cid-sum">${fn(total)}<small>ج</small></div>
          <div class="cid-sum-lbl">الإجمالي</div>
          ${total > 0 && qty > 0 ? `<div class="cid-unit">${unit.toFixed(2)} ج/قطعة</div>` : ''}
        </div>
      </header>

      <div class="cid-body">
        ${suggestions.length ? `
        <section class="cid-sect">
          <div class="cid-sect-label">
            <span>⚡ اقتراحات من آخر تكلفة</span>
            <span class="cid-line"></span>
            <span class="cid-hint">${lastRefEntry?.qty ? `${fn(lastRefEntry.qty)}ق · ${lastUnitCost.toFixed(2)} ج/قطعة` : ''}</span>
          </div>
          <div class="cid-suggs">
            ${suggestions.map((s, i) => `
              <button class="cid-sugg" type="button" data-action="apply-sugg" data-i="${i}">
                ${getCostIco(s.type)} <span>${escapeHtml(s.type||'—')}</span>
                ${s.supplierName ? `<span class="cid-sup">· ${escapeHtml(s.supplierName)}</span>` : ''}
                <span class="cid-amt">＋ ${fn(s.total)}ج</span>
              </button>
            `).join('')}
            ${suggestions.length > 1 ? `
              <button class="cid-sugg cid-sugg-all" type="button" data-action="apply-all-sugg">
                📥 <span>استيراد الكل</span>
                <span class="cid-amt">${fn(suggestions.reduce((s,x)=>s+(x.total||0),0))}ج</span>
              </button>
            ` : ''}
          </div>
          <div class="cid-kbd-foot" style="margin-top:4px">
            <span>اضغط على بند لإضافة صف جديد بقيمه</span>
          </div>
        </section>` : ''}

        ${ci.length ? `
        <section class="cid-sect">
          <div class="cid-sect-label">
            <span>📋 البنود المسجّلة (${ci.length})</span>
            <span class="cid-line"></span>
            <span class="cid-hint">إجمالي ${fn(total)} ج</span>
          </div>
          ${renderItemsList(ci, allCi)}
        </section>` : ''}

        <section class="cid-sect">
          <div class="cid-sect-label">
            <span>${_editIdx >= 0 ? '✏️ تعديل البند' : '➕ إضافة بند جديد'}</span>
            <span class="cid-line"></span>
            ${_editIdx >= 0
              ? `<button class="cid-cancel-edit" type="button" data-action="cancel-edit">إلغاء التعديل</button>`
              : `<span class="cid-hint"><span class="cid-kbd">Enter</span> للإضافة</span>`}
          </div>

          <div class="cid-tbl">
            <div class="cid-tbl-head">
              <div>المورد</div>
              <div>نوع البند</div>
              <div>المبلغ</div>
              <div></div>
            </div>
            ${renderDraftRow()}
            <div class="cid-tbl-totals">
              <div class="cid-tot-lbl">الإجمالي بعد الإضافة</div>
              <div class="cid-tot-ct">${ci.length + (_draft.total ? 1 : 0)} ${ci.length + (_draft.total ? 1 : 0) === 1 ? 'بند' : 'بنود'}</div>
              <div class="cid-tot-sum">${fn(total + (parseFloat(_draft.total)||0))}<small>ج</small></div>
              <div></div>
            </div>
          </div>

          ${renderPaperCalc()}
          ${renderNoteInput()}

          ${(cmp || (total > 0 && qty > 0)) ? `
          <div class="cid-meter">
            <div class="cid-meter-card is-good">
              <div>
                <div class="cid-meter-k">تكلفة الوحدة</div>
                <div class="cid-meter-v cid-good">${unit.toFixed(2)} <small style="font-size:var(--fs-2xs);font-weight:var(--fw-semi);color:var(--ink-3)">ج/قطعة</small></div>
              </div>
              <div class="cid-meter-ic">💰</div>
            </div>
            <div class="cid-meter-card ${cmp ? (cmp.dir === 'down' ? 'is-better' : cmp.dir === 'up' ? 'is-worse' : 'is-good') : ''}">
              <div>
                <div class="cid-meter-k">مقارنة بآخر تكلفة</div>
                <div class="cid-meter-v ${cmp ? (cmp.dir === 'down' ? 'cid-down' : cmp.dir === 'up' ? 'cid-up' : '') : ''}">
                  ${!cmp ? '— لا مرجع' : cmp.dir === 'flat' ? 'نفس التكلفة' : `${cmp.dir === 'down' ? '↓' : '↑'} ${cmp.diff}%`}
                </div>
              </div>
              <div class="cid-meter-ic">📊</div>
            </div>
          </div>` : ''}

          <!-- PR-854: حذف renderWalletSection — التكلفة بترصد دين على الشركة
               في supplier_orders، الدفع الفعلي بيتم لاحقاً عبر approval flow -->
        </section>

        <div class="cid-kbd-foot">
          <span>⌨️ اختصارات:</span>
          <span><span class="cid-kbd">Tab</span> تنقل</span>
          <span><span class="cid-kbd">Enter</span> أضف</span>
          <span><span class="cid-kbd">Esc</span> أغلق</span>
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderItemsList(ci, allCi){
    // Group by date for display
    const byDate = {};
    ci.forEach(item => {
      const gi = allCi.indexOf(item);
      const d = item.date || item.addedAt?.slice(0,10) || '—';
      if(!byDate[d]) byDate[d] = [];
      byDate[d].push({...item, _gi: gi});
    });
    const fmtDate = (d) => { try{ return new Date(d).toLocaleDateString('ar-EG',{day:'numeric',month:'long'}); } catch{ return d; } };
    return Object.keys(byDate).sort().map(date => {
      const dayItems = byDate[date];
      const dayTotal = dayItems.reduce((s,x)=>s+(parseFloat(x.total)||0),0);
      return `
        <div class="cid-items-day">
          <div class="cid-items-day-head">
            <span>📅 ${fmtDate(date)}</span>
            <span>${fn(dayTotal)} ج</span>
          </div>
          ${dayItems.map(it => `
            <div class="cid-item-row${_editIdx === it._gi ? ' is-editing' : ''}">
              <div class="cid-item-main">
                <div class="cid-item-name">${getCostIco(it.type)} ${escapeHtml(it.type||'—')}${it.paid ? ' <span class="cid-paid-tag">مدفوع</span>' : ''}</div>
                ${it.supplierName ? `<div class="cid-item-sub">🏭 ${escapeHtml(it.supplierName)}</div>` : ''}
                ${it.note ? `<div class="cid-item-sub">💬 ${escapeHtml(it.note)}</div>` : ''}
              </div>
              <div class="cid-item-amt">${fn(it.total)} ج</div>
              <div class="cid-item-actions">
                <button class="cid-item-btn cid-item-btn-edit" type="button" data-action="edit-item" data-gi="${it._gi}" title="تعديل">✏️</button>
                <button class="cid-item-btn cid-item-btn-del" type="button" data-action="delete-item" data-gi="${it._gi}" title="حذف">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
  }

  function renderDraftRow(){
    // PR-854: المورد بقى أول حقل (والـ source).
    // النوع بقى filtered حسب specialties المورد لو اتحدد.
    // الـ mode toggle (داخلي/خارجي) اتشال — كل بند لازم له مورد.
    const supLabel = _draft.supplierName || '— اختر المورد —';
    const typeLabel = _draft.type || (_draft.supplierId ? '— اختر النوع —' : '— اختر المورد أولاً —');
    const typeDisabled = !_draft.supplierId;
    return `
      <div class="cid-tbl-row is-draft">
        <div class="cid-cell" data-cid-pop-anchor>
          <button class="cid-ttag" type="button" data-action="open-supplier-pop"
                  style="color:var(--warning); border-color:var(--warning-line); background:var(--warning-soft);">
            <span class="cid-ttag-ico">🏭</span>
            <span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(supLabel)}</span>
            <span class="cid-ttag-chev">▾</span>
          </button>
        </div>
        <div class="cid-cell" data-cid-pop-anchor>
          <button class="cid-ttag" type="button" data-action="open-type-pop" ${typeDisabled ? 'disabled' : ''}
                  style="color:var(--info); border-color:var(--info-line); background:var(--info-soft);${typeDisabled ? 'opacity:.5;cursor:not-allowed;' : ''}">
            <span class="cid-ttag-ico">${getCostIco(_draft.type)}</span>
            <span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(typeLabel)}</span>
            <span class="cid-ttag-chev">▾</span>
          </button>
        </div>
        <div class="cid-cell cid-amt-cell">
          <input type="number" placeholder="0" value="${escapeHtml(String(_draft.total))}"
                 data-cid-field="total" inputmode="numeric" min="0"/>
        </div>
        <div style="display:flex;justify-content:center">
          <button class="cid-row-x cid-add" type="button" data-action="submit-draft" aria-label="${_editIdx >= 0 ? 'حفظ التعديل' : 'إضافة'}">${_editIdx >= 0 ? '💾' : '＋'}</button>
        </div>
      </div>
    `;
  }

  // PR-854: حاسبة الورق — تظهر تلقائياً لو النوع يحتوي "ورق" أو "كرتون".
  // الإجمالي = sheets × pricePerSheet → يـ fill حقل المبلغ تلقائياً.
  // الـ paperMeta كله يـ store في الـ costItem (نفس schema exec-cost-entry).
  function renderPaperCalc(){
    const t = (_draft.type || '').toLowerCase();
    const showCalc = t.includes('ورق') || t.includes('كرتون');
    if(!showCalc) return '';
    const m = _draft.paperMeta || {};
    return `
      <div class="cid-paper-calc">
        <div class="cid-paper-head">📄 حاسبة الورق</div>
        <div class="cid-paper-grid">
          <label>نوع الورق
            <input type="text" placeholder="كوشيه / بريستول..." value="${escapeHtml(m.paperType||'')}"
                   data-cid-paper="paperType"/>
          </label>
          <label>الوزن (جم)
            <input type="number" placeholder="300" value="${escapeHtml(String(m.paperWeight||''))}"
                   data-cid-paper="paperWeight" inputmode="numeric"/>
          </label>
          <label>الأفرخ
            <input type="number" placeholder="0" value="${escapeHtml(String(m.sheets||''))}"
                   data-cid-paper="sheets" inputmode="numeric"/>
          </label>
          <label>سعر الفرخة (ج)
            <input type="number" step="0.01" placeholder="0.00" value="${escapeHtml(String(m.pricePerSheet||''))}"
                   data-cid-paper="pricePerSheet" inputmode="decimal"/>
          </label>
        </div>
        <div class="cid-paper-hint">↕️ اكتب الأفرخ × السعر، الإجمالي بيتحسب تلقائياً</div>
      </div>
    `;
  }

  // PR-854: حقل ملاحظة اختياري (موجود في exec-cost-entry — نقلناه للـ drawer)
  function renderNoteInput(){
    return `
      <div class="cid-note-row">
        <label class="cid-note-label">📝 ملاحظة (اختياري)
          <input type="text" placeholder="مثال: دفعة جزئية، طلب خاص..."
                 value="${escapeHtml(_draft.note||'')}" data-cid-field="note"/>
        </label>
      </div>
    `;
  }

  function renderWalletSection(){
    const c = ctx();
    const wallets = c?.getWallets ? c.getWallets() : [];
    const isExternal = _draft.mode === 'ext';
    const sel = _draft.walletId || '';
    const selWallet = wallets.find(w => w._id === sel);
    const hintText = sel
      ? (selWallet ? `${selWallet.name} — رصيد ${fn(selWallet.balance)} ج` : '—')
      : 'البند يُسجَّل في الحساب فقط بدون خصم';
    return `
      <div class="cid-wallet">
        <div class="cid-wallet-head">
          <span class="cid-wallet-title">💼 الخصم من المحفظة</span>
          <div class="cid-wallet-toggle">
            <button type="button" class="${!sel ? 'is-on' : ''}" data-action="wallet" data-id="">بدون</button>
            ${wallets.slice(0, 3).map(w => `
              <button type="button" class="${sel === w._id ? 'is-on' : ''}" data-action="wallet" data-id="${w._id}">
                ${escapeHtml(w.name.split(' ')[0])}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="cid-wallet-hint">${escapeHtml(hintText)}</div>
        ${wallets.length > 3 ? `
        <select class="cid-form-inp" data-action="wallet-select" style="margin-top:var(--space-2);width:100%;padding:var(--space-2) var(--space-3);background:var(--bg-2);border:1px solid var(--border);border-radius:var(--r-md);color:var(--ink);font-family:inherit;font-size:var(--fs-sm)">
          <option value="">— اختر محفظة (اختياري) —</option>
          ${wallets.map(w => `<option value="${w._id}" ${sel === w._id ? 'selected' : ''}>${escapeHtml(w.name)} · ${fn(w.balance)} ج</option>`).join('')}
        </select>
        ` : ''}
      </div>
    `;
  }

  // ── popover (type chooser) ────────────────────────────────
  function openTypePop(anchor){
    closePop();
    if(!_draft.supplierId){
      toast('⚠️ اختر المورد أولاً', 'err');
      return;
    }
    const c = ctx();
    const masterCats = c?.getMasterCategories ? c.getMasterCategories() : [];
    // PR-854: لو فيه supplier specialties، نـ filter الـ types عليهم.
    // لو الـ supplier ما عنده specialties، نظهر كل الـ types (fallback).
    const specs = _draft.supplierSpecialties || [];
    const filtered = specs.length
      ? masterCats.filter(cat => specs.includes(cat.label))
      : masterCats;
    const groups = {};
    filtered.forEach(cat => { const g = cat.group || 'أخرى'; if(!groups[g]) groups[g] = []; groups[g].push(cat.label); });
    const pop = document.createElement('div');
    pop.className = 'cid-pop';
    const rect = anchor.getBoundingClientRect();
    pop.style.top = `${rect.bottom + 4}px`;
    pop.style.right = `${window.innerWidth - rect.right}px`;
    pop.style.minWidth = `${rect.width}px`;
    pop.innerHTML = Object.keys(groups).length
      ? Object.entries(groups).map(([g, labels]) => `
          <div class="cid-pop-section">${escapeHtml(g)}</div>
          ${labels.map(l => `
            <div class="cid-pop-item ${_draft.type === l ? 'is-active' : ''}" data-action="pick-type" data-val="${escapeHtml(l)}">
              ${getCostIco(l)} <span>${escapeHtml(l)}</span>
            </div>
          `).join('')}
        `).join('')
      : '<div class="cid-pop-empty">لا توجد أنواع — أضف من إعدادات</div>';
    document.body.appendChild(pop);
    _pop = pop;
    pop.addEventListener('click', onPopClick);
  }

  function openSupplierPop(anchor, query){
    closePop();
    const c = ctx();
    const suppliers = c?.getSuppliers ? c.getSuppliers() : [];
    // PR-852: لو الـ query فارغ، نعرض كل الموردين — قبلاً كان يـ return early
    // فالـ field يبدو مكسور لو المستخدم بس click من غير ما يكتب.
    const q = (query || '').toLowerCase().trim();
    const filtered = q
      ? suppliers.filter(s => (s.name||'').toLowerCase().includes(q)).slice(0, 10)
      : suppliers.slice(0, 10);
    const pop = document.createElement('div');
    pop.className = 'cid-pop';
    const rect = anchor.getBoundingClientRect();
    pop.style.top = `${rect.bottom + 4}px`;
    pop.style.right = `${window.innerWidth - rect.right}px`;
    pop.style.minWidth = `${rect.width}px`;
    pop.style.maxHeight = '240px';
    pop.style.overflowY = 'auto';
    if(!filtered.length){
      pop.innerHTML = `<div class="cid-pop-empty">${q ? 'لا موردين بهذا الاسم' : 'لا موردين مسجلين'}</div>`;
    } else {
      pop.innerHTML = `
        <div class="cid-pop-section">${q ? 'موردون مطابقون' : 'الموردون'} (${filtered.length})</div>
        ${filtered.map(s => `
          <div class="cid-pop-item" data-action="pick-supplier" data-id="${escapeHtml(s._id)}" data-name="${escapeHtml(s.name)}">
            🏭 <span>${escapeHtml(s.name)}</span>
          </div>
        `).join('')}
      `;
    }
    document.body.appendChild(pop);
    _pop = pop;
    pop.addEventListener('click', onPopClick);
  }

  function closePop(){ if(_pop){ _pop.remove(); _pop = null; } }
  function onPopClick(e){
    const el = e.target.closest('[data-action]');
    if(!el) return;
    const action = el.dataset.action;
    if(action === 'pick-type'){
      _draft.type = el.dataset.val;
      // PR-854: ما نـ reset supplier هنا — الـ supplier هو الـ source.
      // النوع follows من الـ supplier specialties.
      closePop();
      render();
    } else if(action === 'pick-supplier'){
      // PR-854: المورد بقى الـ source. نخزن الـ specialties لـ filter قائمة الأنواع.
      // لو المستخدم غيّر المورد، نـ reset النوع لو مش في specialties الجديدة.
      const c = ctx();
      const suppliers = c?.getSuppliers ? c.getSuppliers() : [];
      const sup = suppliers.find(s => s._id === el.dataset.id);
      const specs = sup
        ? (Array.isArray(sup.specialties) && sup.specialties.length
            ? sup.specialties
            : (sup.printType ? [sup.printType] : []))
        : [];
      _draft.supplierId = el.dataset.id;
      _draft.supplierName = el.dataset.name;
      _draft.supplierSpecialties = specs;
      // لو النوع الحالي مش في specialties الجديدة، reset
      if(_draft.type && specs.length && !specs.includes(_draft.type)){
        _draft.type = '';
        _draft.paperMeta = null;
      }
      closePop();
      render();
    }
  }

  // ── event binding (delegated) ────────────────────────────
  function bindEvents(){
    // close button
    _drawer.querySelector('.cid-close')?.addEventListener('click', close);

    // suggestions
    // PR-850: ضغط الـ chip بيـ auto-submit (نفس slogan الـ hint:
    // "اضغط على بند لإضافة صف جديد بقيمه"). قبلاً كان بـ pre-fill بس
    // و المستخدم لازم يضغط "+" تاني — مربك.
    _drawer.querySelectorAll('[data-action="apply-sugg"]').forEach(el => {
      el.addEventListener('click', async () => {
        const sug = getSuggestions()[parseInt(el.dataset.i, 10)];
        if(!sug) return;
        applySuggestion(sug);
        await submitDraft();
      });
    });
    _drawer.querySelector('[data-action="apply-all-sugg"]')?.addEventListener('click', () => {
      const all = getSuggestions();
      // Submit each suggestion sequentially (we use the existing addCostFromPanel pipeline)
      submitMany(all);
    });

    // draft row actions
    // PR-854: المورد بقى popup-based (button). شيلنا الـ text input handler
    // و شيلنا toggle-mode (الـ mode toggle مالوش معنى — كل بند له مورد).
    _drawer.querySelector('[data-action="open-supplier-pop"]')?.addEventListener('click', (e) => {
      openSupplierPop(e.currentTarget, '');
    });
    _drawer.querySelector('[data-action="open-type-pop"]')?.addEventListener('click', (e) => {
      if(e.currentTarget.hasAttribute('disabled')) return;
      openTypePop(e.currentTarget);
    });
    _drawer.querySelector('[data-action="submit-draft"]')?.addEventListener('click', submitDraft);

    // edit/delete on existing items
    _drawer.querySelectorAll('[data-action="edit-item"]').forEach(el => {
      el.addEventListener('click', () => startEdit(parseInt(el.dataset.gi, 10)));
    });
    _drawer.querySelectorAll('[data-action="delete-item"]').forEach(el => {
      el.addEventListener('click', () => deleteItem(parseInt(el.dataset.gi, 10)));
    });
    _drawer.querySelector('[data-action="cancel-edit"]')?.addEventListener('click', cancelEdit);

    // total input — Enter submits
    const totalInput = _drawer.querySelector('[data-cid-field="total"]');
    if(totalInput){
      totalInput.addEventListener('input', (e) => { _draft.total = e.target.value; updateTotalsPreview(); });
      totalInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){ e.preventDefault(); submitDraft(); }
      });
    }

    // PR-854: note input — يـ store على blur (مش بـ render في كل keystroke)
    const noteInput = _drawer.querySelector('[data-cid-field="note"]');
    if(noteInput){
      noteInput.addEventListener('input', (e) => { _draft.note = e.target.value; });
    }

    // PR-854: paper calc inputs — يـ update الـ paperMeta و يحسب الإجمالي تلقائياً
    _drawer.querySelectorAll('[data-cid-paper]').forEach(el => {
      el.addEventListener('input', (e) => {
        if(!_draft.paperMeta) _draft.paperMeta = {};
        const field = el.dataset.cidPaper;
        const v = el.value;
        _draft.paperMeta[field] = (field === 'paperType') ? v : (parseFloat(v) || 0);
        // Auto-calc total = sheets × pricePerSheet
        const sheets = parseFloat(_draft.paperMeta.sheets) || 0;
        const price = parseFloat(_draft.paperMeta.pricePerSheet) || 0;
        if(sheets > 0 && price > 0){
          _draft.total = String(Math.round(sheets * price * 100) / 100);
          const totalInputEl = _drawer.querySelector('[data-cid-field="total"]');
          if(totalInputEl) totalInputEl.value = _draft.total;
          updateTotalsPreview();
        }
      });
    });

    // (wallet selector removed in PR-854 — التكلفة بترصد دين على الشركة في
    //  supplier_orders، الدفع الفعلي بيتم لاحقاً عبر approval flow)
  }

  function updateTotalsPreview(){
    // Cheap update of totals without full re-render — refresh just the totals row text
    const c = ctx();
    const o = c?.getOrder(_orderId);
    if(!o) return;
    const allCi = o.costItems || [];
    const ci = _prodIdx >= 0 ? allCi.filter(c => c.prodIdx === _prodIdx || c.prodIdx == null) : allCi;
    const total = ci.reduce((s,x)=>s+(parseFloat(x.total)||0),0);
    const draftAmt = parseFloat(_draft.total) || 0;
    const sumEl = _drawer.querySelector('.cid-tot-sum');
    const ctEl = _drawer.querySelector('.cid-tot-ct');
    if(sumEl) sumEl.innerHTML = `${fn(total + draftAmt)}<small>ج</small>`;
    if(ctEl){
      const count = ci.length + (draftAmt ? 1 : 0);
      ctEl.textContent = `${count} ${count === 1 ? 'بند' : 'بنود'}`;
    }
  }

  function getSuggestions(){
    const c = ctx();
    const o = c?.getOrder(_orderId);
    if(!o) return [];
    const prods = o.products || [];
    const prod = _prodIdx >= 0 ? prods[_prodIdx] : prods[0];
    if(!prod) return [];
    const catalog = c.getProductsCatalog ? c.getProductsCatalog() : [];
    const pName = (prod.name||'').trim().toLowerCase();
    const pQty = parseFloat(prod.qty) || 0;
    const cat = catalog.find(cp =>
      (cp.name||'').trim().toLowerCase() === pName ||
      (pName && (cp.name||'').trim().toLowerCase().includes(pName))
    );
    if(!cat || !(cat.costHistory||[]).length) return [];
    const sameQty = cat.costHistory.filter(h => parseFloat(h.qty) === pQty);
    const lastEntry = sameQty.length ? sameQty[sameQty.length-1] : cat.costHistory[cat.costHistory.length-1];
    return (lastEntry?.items || []).map(it => ({
      type: it.type,
      supplierId: it.supplierId || '',
      supplierName: it.supplierName || '',
      total: parseFloat(it.total) || 0,
    }));
  }

  function applySuggestion(sug){
    // PR-854: نـ resolve specialties من suppliers collection (الـ catalog history
    // مش بيخزن specialties مع الـ supplier reference).
    const c = ctx();
    const suppliers = c?.getSuppliers ? c.getSuppliers() : [];
    const sup = suppliers.find(s =>
      (sug.supplierId && s._id === sug.supplierId) ||
      (sug.supplierName && (s.name||'').trim() === (sug.supplierName||'').trim())
    );
    const specs = sup
      ? (Array.isArray(sup.specialties) && sup.specialties.length
          ? sup.specialties
          : (sup.printType ? [sup.printType] : []))
      : [];
    _draft.supplierId = sup?._id || sug.supplierId || '';
    _draft.supplierName = sup?.name || sug.supplierName || '';
    _draft.supplierSpecialties = specs;
    _draft.type = sug.type || '';
    _draft.total = String(sug.total || '');
    _draft.note = '';
    _draft.paperMeta = null;
    _editIdx = -1; // suggestions always create new
    render();
    // focus the total field for quick confirm
    setTimeout(() => _drawer.querySelector('[data-cid-field="total"]')?.focus(), 50);
  }

  // ── edit mode: pre-fill draft row from an existing item ────
  function startEdit(gi){
    const c = ctx();
    const o = c?.getOrder(_orderId);
    const item = (o?.costItems || [])[gi];
    if(!item){ toast('⚠️ البند غير موجود', 'err'); return; }
    if(item.paid){
      toast('⛔ البند مدفوع — التعديل من اللوحة القديمة فقط (admin only)', 'warn');
      return;
    }
    // PR-854: نعيد populate supplierSpecialties من الـ suppliers collection
    const suppliers = c?.getSuppliers ? c.getSuppliers() : [];
    const sup = suppliers.find(s => s._id === item.supplierId);
    const specs = sup
      ? (Array.isArray(sup.specialties) && sup.specialties.length
          ? sup.specialties
          : (sup.printType ? [sup.printType] : []))
      : [];
    _editIdx = gi;
    _draft = {
      supplierId: item.supplierId || '',
      supplierName: item.supplierName || '',
      supplierSpecialties: specs,
      type: item.type || '',
      total: String(item.total || ''),
      note: item.note || '',
      paperMeta: item.paperMeta || null,
    };
    render();
    setTimeout(() => _drawer.querySelector('[data-cid-field="total"]')?.focus(), 50);
  }

  function cancelEdit(){
    _editIdx = -1;
    _draft = {
      supplierId:'', supplierName:'', supplierSpecialties:[],
      type:'', total:'', note:'', paperMeta:null,
    };
    render();
  }

  // ── delete: confirms then delegates to legacy window.rmCost ────
  // rmCost in production.html handles the complex paid-item reversal flow
  // (notifications, supplier_orders void, payment_request cleanup). We
  // delegate instead of duplicating that logic.
  async function deleteItem(gi){
    const c = ctx();
    const o = c?.getOrder(_orderId);
    const item = (o?.costItems || [])[gi];
    if(!item){ toast('⚠️ البند غير موجود', 'err'); return; }
    if(typeof window.rmCost !== 'function'){
      toast('❌ نظام الحذف غير متاح', 'err');
      return;
    }
    if(!item.paid){
      if(!confirm(`حذف البند: ${item.type || ''} — ${fn(item.total||0)} ج؟`)) return;
    }
    // window.rmCost handles its own confirmations for paid items + does
    // the atomic batch + notifications. We just trigger it.
    try {
      await window.rmCost(gi);
      if(_editIdx === gi) cancelEdit();
    } catch(e){
      console.error('cost-items drawer delete failed', e);
    }
  }

  // ── submit ────────────────────────────────────────────────
  // Calls orderActions.recordCostItem (RULE A1 central action) — single
  // source of truth for cost-item writes. No more DOM bridging.
  async function submitDraft(){
    // PR-854: المورد مطلوب — مفيش "داخلي" بعد دلوقتي.
    if(!_draft.supplierId){ toast('⚠️ اختر المورد أولاً', 'err'); return; }
    if(!_draft.type){ toast('⚠️ اختر نوع البند', 'err'); return; }
    const total = parseFloat(_draft.total) || 0;
    if(total <= 0){ toast('⚠️ أدخل التكلفة', 'err'); return; }

    const c = ctx();
    if(!c){ toast('❌ السياق غير جاهز', 'err'); return; }
    const o = c.getOrder(_orderId);
    if(!o){ toast('❌ الأوردر غير متاح', 'err'); return; }

    // Lazy-load orderActions (cached after first use) — keeps drawer.js
    // independent of production.html's module scope
    let actions = window.__orderActions;
    if(!actions){
      try {
        actions = (await import('../../order-actions.js')).orderActions;
        window.__orderActions = actions;
      } catch(e){
        toast('❌ فشل تحميل نظام الحفظ', 'err');
        console.error('cost-items drawer: failed to import orderActions', e);
        return;
      }
    }

    // Resolve Firestore db from the existing firebase-init module
    let db = window.__firestoreDb;
    if(!db){
      try {
        db = (await import('../../core/firebase-init.js')).db;
        window.__firestoreDb = db;
      } catch(e){
        toast('❌ فشل تحميل Firestore', 'err');
        console.error('cost-items drawer: failed to import db', e);
        return;
      }
    }

    const wallets = c.getWallets ? c.getWallets() : [];
    const isEdit = _editIdx >= 0;
    // PR-854: walletId دايماً '' (مفيش خصم فوري). paperMeta من الـ draft.
    // isExternal دايماً true (المورد مطلوب).
    const result = await actions.recordCostItem({
      db, orderId: _orderId, prodIdx: _prodIdx,
      payload: {
        type: _draft.type,
        total,
        supplierId: _draft.supplierId,
        supplierName: _draft.supplierName,
        note: _draft.note || '',
        walletId: '',
        paperMeta: _draft.paperMeta || {},
        isExternal: true,
      },
      role: c.getCurrentRole ? c.getCurrentRole() : '',
      userId: (c.getCurrentUser && c.getCurrentUser()?.uid) || '',
      userName: c.getUserName ? c.getUserName() : '',
      wallets,
      isEdit,
      editIdx: _editIdx,
    });

    if(!result.ok){
      toast('❌ '+(result.errors?.[0] || 'فشل الحفظ'), 'err');
      return;
    }
    toast(isEdit
      ? `✅ تم التعديل — ${fn(total)} ج`
      : `✅ تم — ${_draft.supplierName} · ${fn(total)} ج`,
      'ok');
    // Clear draft + exit edit mode; onSnapshot will refresh the order soon
    _editIdx = -1;
    _draft = {
      supplierId:'', supplierName:'', supplierSpecialties:[],
      type:'', total:'', note:'', paperMeta:null,
    };
    render();
  }

  async function submitMany(sugs){
    for(const s of sugs){
      applySuggestion(s);
      await submitDraft();
      // small delay so toasts don't overlap
      await new Promise(r => setTimeout(r, 80));
    }
  }

  // ── escape helper ─────────────────────────────────────────
  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg, t=''){
    if(typeof window.toast === 'function'){ window.toast(msg, t); return; }
    // fallback DOM toast
    const c = document.getElementById('toasts');
    if(!c) return;
    const el = document.createElement('div');
    el.className = 'toast ' + t;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // ── public API ────────────────────────────────────────────
  function open(orderId, prodIdx){
    mount();
    _orderId = orderId;
    _prodIdx = (prodIdx == null || prodIdx < 0) ? -1 : parseInt(prodIdx, 10);
    _draft = { type:'', supplierId:'', supplierName:'', total:'', mode:'int', note:'', walletId:'' };
    _editIdx = -1;
    _open = true;
    render();
    // Animate in
    requestAnimationFrame(() => {
      _backdrop.classList.add('is-open');
      _drawer.classList.add('is-open');
    });
  }

  function close(){
    if(!_open) return;
    _open = false;
    closePop();
    _backdrop.classList.remove('is-open');
    _drawer.classList.remove('is-open');
  }

  // Bridge: production.html calls openCostDrawer(prodIdx) — the active order is in window.__costItemsCtx
  window.openCostDrawer = function(prodIdx){
    const c = ctx();
    if(!c){
      // Context not ready — fallback to legacy panel
      if(typeof window.openCostPanel === 'function') return window.openCostPanel(prodIdx);
      return;
    }
    // production.html keeps activeId on its own; expose via context
    const activeId = (typeof c.getActiveOrderId === 'function') ? c.getActiveOrderId() : null;
    if(!activeId){
      if(typeof window.openCostPanel === 'function') return window.openCostPanel(prodIdx);
      return;
    }
    open(activeId, prodIdx);
  };
  window.closeCostDrawer = close;
})();
