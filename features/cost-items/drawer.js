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
  let _draft = { type:'', supplierId:'', supplierName:'', total:'', mode:'int', note:'', walletId:'' };
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
    if(!c){ _drawer.innerHTML = '<div style="padding:20px;color:var(--ink-3)">⏳ تجهيز السياق...</div>'; return; }
    const o = c.getOrder(_orderId);
    if(!o){ _drawer.innerHTML = '<div style="padding:20px;color:var(--danger)">⚠️ الأوردر غير موجود</div>'; return; }
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
            <span>➕ إضافة بند جديد</span>
            <span class="cid-line"></span>
            <span class="cid-hint"><span class="cid-kbd">Enter</span> للإضافة</span>
          </div>

          <div class="cid-tbl">
            <div class="cid-tbl-head">
              <div>نوع البند</div>
              <div>المورد / الوصف</div>
              <div>المبلغ</div>
              <div>تنفيذ</div>
              <div></div>
            </div>
            ${renderDraftRow()}
            <div class="cid-tbl-totals">
              <div class="cid-tot-lbl">الإجمالي بعد الإضافة</div>
              <div class="cid-tot-ct">${ci.length + (_draft.total ? 1 : 0)} ${ci.length + (_draft.total ? 1 : 0) === 1 ? 'بند' : 'بنود'}</div>
              <div class="cid-tot-sum">${fn(total + (parseFloat(_draft.total)||0))}<small>ج</small></div>
              <div></div><div></div>
            </div>
          </div>

          ${(cmp || (total > 0 && qty > 0)) ? `
          <div class="cid-meter">
            <div class="cid-meter-card is-good">
              <div>
                <div class="cid-meter-k">تكلفة الوحدة</div>
                <div class="cid-meter-v cid-good">${unit.toFixed(2)} <small style="font-size:var(--fs-2xs);font-weight:600;color:var(--ink-3)">ج/قطعة</small></div>
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

          ${renderWalletSection()}
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
            <div class="cid-item-row">
              <div class="cid-item-main">
                <div class="cid-item-name">${getCostIco(it.type)} ${escapeHtml(it.type||'—')}</div>
                ${it.supplierName ? `<div class="cid-item-sub">🏭 ${escapeHtml(it.supplierName)}</div>` : ''}
                ${it.note ? `<div class="cid-item-sub">💬 ${escapeHtml(it.note)}</div>` : ''}
              </div>
              <div class="cid-item-amt">${fn(it.total)} ج</div>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
  }

  function renderDraftRow(){
    const c = ctx();
    const masterCats = c?.getMasterCategories ? c.getMasterCategories() : [];
    const isExternal = _draft.mode === 'ext';
    // Pick icon + color for the chosen type
    const typeLabel = _draft.type || '— اختر —';
    return `
      <div class="cid-tbl-row is-draft">
        <div class="cid-cell" data-cid-pop-anchor>
          <button class="cid-ttag" type="button" data-action="open-type-pop"
                  style="color:var(--info); border-color:var(--info-line); background:var(--info-soft);">
            <span class="cid-ttag-ico">${getCostIco(_draft.type)}</span>
            <span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(typeLabel)}</span>
            <span class="cid-ttag-chev">▾</span>
          </button>
        </div>
        <div class="cid-cell" data-cid-pop-anchor style="position:relative">
          <input type="text" placeholder="اسم المورد أو وصف..." value="${escapeHtml(_draft.supplierName)}"
                 data-cid-field="supplierName" data-action="supplier-input"/>
        </div>
        <div class="cid-cell cid-amt-cell">
          <input type="number" placeholder="0" value="${escapeHtml(String(_draft.total))}"
                 data-cid-field="total" inputmode="numeric" min="0"/>
        </div>
        <div class="cid-cell" style="display:flex;justify-content:center">
          <button class="cid-mode-btn ${isExternal ? 'cid-mode-ext' : 'cid-mode-int'}" type="button"
                  data-action="toggle-mode">
            ${isExternal ? '🏭 خارجي' : '🏠 داخلي'}
          </button>
        </div>
        <div style="display:flex;justify-content:center">
          <button class="cid-row-x cid-add" type="button" data-action="submit-draft" aria-label="إضافة">＋</button>
        </div>
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
    const c = ctx();
    const masterCats = c?.getMasterCategories ? c.getMasterCategories() : [];
    const groups = {};
    masterCats.forEach(cat => { const g = cat.group || 'أخرى'; if(!groups[g]) groups[g] = []; groups[g].push(cat.label); });
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
    const filtered = suppliers
      .filter(s => (s.name||'').toLowerCase().includes((query||'').toLowerCase()))
      .slice(0, 8);
    if(!filtered.length) return;
    const pop = document.createElement('div');
    pop.className = 'cid-pop';
    const rect = anchor.getBoundingClientRect();
    pop.style.top = `${rect.bottom + 4}px`;
    pop.style.right = `${window.innerWidth - rect.right}px`;
    pop.style.minWidth = `${rect.width}px`;
    pop.style.maxHeight = '240px';
    pop.style.overflowY = 'auto';
    pop.innerHTML = `
      <div class="cid-pop-section">موردون مقترحون</div>
      ${filtered.map(s => `
        <div class="cid-pop-item" data-action="pick-supplier" data-id="${escapeHtml(s._id)}" data-name="${escapeHtml(s.name)}">
          🏭 <span>${escapeHtml(s.name)}</span>
        </div>
      `).join('')}
    `;
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
      _draft.supplierName = ''; // reset supplier when type changes
      closePop();
      render();
    } else if(action === 'pick-supplier'){
      _draft.supplierId = el.dataset.id;
      _draft.supplierName = el.dataset.name;
      _draft.mode = 'ext';
      closePop();
      render();
    }
  }

  // ── event binding (delegated) ────────────────────────────
  function bindEvents(){
    // close button
    _drawer.querySelector('.cid-close')?.addEventListener('click', close);

    // suggestions
    _drawer.querySelectorAll('[data-action="apply-sugg"]').forEach(el => {
      el.addEventListener('click', () => {
        const sug = getSuggestions()[parseInt(el.dataset.i, 10)];
        if(!sug) return;
        applySuggestion(sug);
      });
    });
    _drawer.querySelector('[data-action="apply-all-sugg"]')?.addEventListener('click', () => {
      const all = getSuggestions();
      // Submit each suggestion sequentially (we use the existing addCostFromPanel pipeline)
      submitMany(all);
    });

    // draft row actions
    _drawer.querySelector('[data-action="open-type-pop"]')?.addEventListener('click', (e) => {
      openTypePop(e.currentTarget);
    });
    _drawer.querySelector('[data-action="toggle-mode"]')?.addEventListener('click', () => {
      _draft.mode = _draft.mode === 'ext' ? 'int' : 'ext';
      if(_draft.mode === 'int'){ _draft.supplierId = ''; _draft.supplierName = ''; }
      render();
    });
    _drawer.querySelector('[data-action="submit-draft"]')?.addEventListener('click', submitDraft);

    // supplier input — autocomplete on focus/type
    const supInput = _drawer.querySelector('[data-action="supplier-input"]');
    if(supInput){
      supInput.addEventListener('input', (e) => {
        _draft.supplierName = e.target.value;
        _draft.supplierId = ''; // typing → clear ID until pick from pop
        if(e.target.value.length >= 1 && _draft.mode === 'ext'){
          openSupplierPop(e.target.closest('.cid-cell'), e.target.value);
        } else {
          closePop();
        }
      });
      supInput.addEventListener('focus', (e) => {
        if(_draft.mode === 'ext') openSupplierPop(e.target.closest('.cid-cell'), e.target.value);
      });
    }

    // total input — Enter submits
    const totalInput = _drawer.querySelector('[data-cid-field="total"]');
    if(totalInput){
      totalInput.addEventListener('input', (e) => { _draft.total = e.target.value; updateTotalsPreview(); });
      totalInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){ e.preventDefault(); submitDraft(); }
      });
    }

    // wallet selector
    _drawer.querySelectorAll('[data-action="wallet"]').forEach(el => {
      el.addEventListener('click', () => { _draft.walletId = el.dataset.id || ''; render(); });
    });
    _drawer.querySelector('[data-action="wallet-select"]')?.addEventListener('change', (e) => {
      _draft.walletId = e.target.value;
      render();
    });
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
    _draft.type = sug.type || '';
    _draft.supplierId = sug.supplierId || '';
    _draft.supplierName = sug.supplierName || '';
    _draft.total = String(sug.total || '');
    _draft.mode = sug.supplierId || sug.supplierName ? 'ext' : 'int';
    render();
    // focus the total field for quick confirm
    setTimeout(() => _drawer.querySelector('[data-cid-field="total"]')?.focus(), 50);
  }

  // ── submit ────────────────────────────────────────────────
  // Calls orderActions.recordCostItem (RULE A1 central action) — single
  // source of truth for cost-item writes. No more DOM bridging.
  async function submitDraft(){
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
    const result = await actions.recordCostItem({
      db, orderId: _orderId, prodIdx: _prodIdx,
      payload: {
        type: _draft.type,
        total,
        supplierId: _draft.supplierId || '',
        supplierName: _draft.supplierName || '',
        note: _draft.note || '',
        walletId: _draft.walletId || '',
        paperMeta: {},
        isExternal: _draft.mode === 'ext',
      },
      role: c.getCurrentRole ? c.getCurrentRole() : '',
      userId: (c.getCurrentUser && c.getCurrentUser()?.uid) || '',
      userName: c.getUserName ? c.getUserName() : '',
      wallets,
      isEdit: false,
      editIdx: -1,
    });

    if(!result.ok){
      toast('❌ '+(result.errors?.[0] || 'فشل الحفظ'), 'err');
      return;
    }
    toast(_draft.supplierName
      ? `✅ تم — ${_draft.supplierName} · ${fn(total)} ج${_draft.walletId ? ' · خُصم من المحفظة' : ''}`
      : `✅ تم — ${fn(total)} ج${_draft.walletId ? ' · خُصم من المحفظة' : ''}`,
      'ok');
    // Clear draft + re-render with new state (order onSnapshot will update soon)
    _draft = { type:'', supplierId:'', supplierName:'', total:'', mode:'int', note:'', walletId:'' };
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
