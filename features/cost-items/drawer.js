// ============================================================
// features/cost-items/drawer.js  (v2 — multi-row batch entry)
// ============================================================
// Vanilla module — Cost Items Drawer
//
// PRINCIPLES:
//  • UI-only layer. Save logic lives in orderActions.recordCostItem
//    (RULE A1 central action) — drawer just builds the payload.
//  • Reads order/suppliers/wallets/master-cats from window.__costItemsCtx.
//  • On submit: lazy-imports orderActions + Firestore db, then calls
//    orderActions.recordCostItem() which does atomic batch write.
//  • Multi-row batch entry: add several items at once (each can have a
//    different supplier). Submit all in sequence.
//  • Existing items grouped by supplier for quick overview.
//
// EXPECTED CONTEXT (window.__costItemsCtx):
//   getOrder(id)          → order doc | null
//   getSuppliers()        → [{_id, name, specialties, printType, ...}]
//   getWallets()          → [{_id, name, balance, ...}]
//   getMasterCategories() → [{label, group}]  (optional — falls back to
//                           supplier specialties or DEFAULT_TYPES)
//   getProductsCatalog()  → catalog with costHistory
//   getCurrentRole()      → string
//   getActiveOrderId()    → string
//   getCurrentUser()      → {uid, ...}
//   getUserName()         → string
// ============================================================

(function(){
  'use strict';

  const ctx = () => window.__costItemsCtx;
  const fn = n => (parseFloat(n)||0).toLocaleString('ar-EG');

  const DEFAULT_TYPES = [
    'طباعة أوفست','طباعة ديجيتال','طباعة UV','طباعة فلكس','طباعة حريرية','طباعة ريزو',
    'ورق','كرتون','زنكات','قص','سلفنة','تذهيب','نقر','كريز','تجليد','تجميع',
    'تصميم','تصوير','موشن','شحن','أخرى',
  ];

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

  // ── State ─────────────────────────────────────────────────
  let _open = false;
  let _orderId = null;
  let _prodIdx = -1;
  let _drafts = [];        // Array of draft rows for batch entry
  let _editDraft = null;   // Single draft for edit mode
  let _editIdx = -1;       // -1 = batch mode; >=0 = editing saved item
  let _pop = null;
  let _popRowId = null;    // Row ID for active popover ('edit' for edit form)

  let _libSuggestions = []; // Loaded from cost_item_library
  let _libLoading    = false;

  let _root, _backdrop, _drawer;

  function newEmptyRow(){
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      supplierId:'', supplierName:'', supplierSpecialties:[],
      type:'', total:'', note:'', paperMeta:null,
    };
  }

  // ── DOM mount ─────────────────────────────────────────────
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

    _backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if(!_open) return;
      if(e.key === 'Escape'){
        if(_pop){ closePop(); return; }
        close();
      }
    });
    document.addEventListener('mousedown', (e) => {
      if(_pop && !_pop.contains(e.target) && !e.target.closest('[data-cid-pop-anchor]')) closePop();
    });
  }

  // ── Main render ───────────────────────────────────────────
  function render(){
    const c = ctx();
    if(!c){ _drawer.innerHTML = '<div style="padding:var(--space-5);color:var(--ink-3)">⏳ تجهيز السياق...</div>'; return; }
    const o = c.getOrder(_orderId);
    if(!o){ _drawer.innerHTML = '<div style="padding:var(--space-5);color:var(--danger)">⚠️ الأوردر غير موجود</div>'; return; }

    const prods = o.products || [];
    const prod  = _prodIdx >= 0 ? prods[_prodIdx] : null;
    const prodName = prod?.name || prods[0]?.name || 'عام';
    const qty = parseFloat(prod?.qty || prods[0]?.qty) || 0;

    const allCi = o.costItems || [];
    const ci = _prodIdx >= 0
      ? allCi.filter(x => x.prodIdx === _prodIdx || x.prodIdx == null)
      : allCi;
    const existingTotal = ci.reduce((s,x) => s + (parseFloat(x.total)||0), 0);
    const pendingTotal  = _editIdx >= 0
      ? (parseFloat(_editDraft?.total)||0)
      : _drafts.reduce((s,r) => s + (parseFloat(r.total)||0), 0);

    // Catalog suggestions
    const catalog = c.getProductsCatalog ? c.getProductsCatalog() : [];
    let lastRefEntry = null;
    if(prod && catalog.length){
      const pName = (prod.name||'').trim().toLowerCase();
      const pQty  = parseFloat(prod.qty) || 0;
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
      type: it.type, supplierName: it.supplierName || '',
      supplierId: it.supplierId || '', total: parseFloat(it.total) || 0,
    }));

    const grandTotal = existingTotal + pendingTotal;
    const unit = grandTotal > 0 && qty > 0 ? grandTotal / qty : 0;
    let cmp = null;
    if(grandTotal > 0 && lastUnitCost > 0){
      const diff = ((unit - lastUnitCost) / lastUnitCost) * 100;
      cmp = { diff: Math.abs(diff).toFixed(1), dir: unit < lastUnitCost ? 'down' : unit > lastUnitCost ? 'up' : 'flat' };
    }

    _drawer.innerHTML = `
      <header class="cid-head">
        <button class="cid-close" type="button" aria-label="إغلاق (Esc)">✕</button>
        <div class="cid-head-thumb">${escapeHtml(prod?.name?.slice(0,10) || 'بند')}</div>
        <div class="cid-head-title">
          <b>${escapeHtml(prodName)}</b>
          <div class="cid-head-meta">
            ${prod?.size ? `<span>${escapeHtml(prod.size)}</span><span class="cid-dot"></span>` : ''}
            ${qty ? `<span class="cid-qty" dir="ltr">${fn(qty)} قطعة</span><span class="cid-dot"></span>` : ''}
            <span>${escapeHtml(o.orderId || o._id?.slice(-6) || '')}</span>
          </div>
        </div>
        <div class="cid-head-total">
          <div class="cid-sum">${fn(grandTotal)}<small>ج</small></div>
          <div class="cid-sum-lbl">الإجمالي</div>
          ${grandTotal > 0 && qty > 0 ? `<div class="cid-unit">${unit.toFixed(2)} ج/قطعة</div>` : ''}
        </div>
      </header>

      <div class="cid-body">
        ${suggestions.length ? _renderSuggestions(suggestions, lastRefEntry, lastUnitCost) : ''}
        ${(_libLoading || _libSuggestions.length) ? _renderLibrarySuggestions() : ''}
        ${ci.length ? _renderExistingItems(ci, allCi) : ''}
        ${_editIdx >= 0 ? _renderEditSection() : _renderBatchSection()}
        ${(cmp || (existingTotal > 0 && qty > 0)) ? `
        <div class="cid-meter">
          <div class="cid-meter-card is-good">
            <div>
              <div class="cid-meter-k">تكلفة الوحدة</div>
              <div class="cid-meter-v cid-good">${unit.toFixed(2)} <small style="font-size:var(--fs-2xs);color:var(--ink-3)">ج/قطعة</small></div>
            </div>
            <div class="cid-meter-ic">💰</div>
          </div>
          <div class="cid-meter-card ${cmp ? (cmp.dir==='down'?'is-better':cmp.dir==='up'?'is-worse':'is-good') : ''}">
            <div>
              <div class="cid-meter-k">مقارنة بآخر تكلفة</div>
              <div class="cid-meter-v ${cmp ? (cmp.dir==='down'?'cid-down':cmp.dir==='up'?'cid-up':'') : ''}">
                ${!cmp ? '— لا مرجع' : cmp.dir==='flat' ? 'نفس التكلفة' : `${cmp.dir==='down'?'↓':'↑'} ${cmp.diff}%`}
              </div>
            </div>
            <div class="cid-meter-ic">📊</div>
          </div>
        </div>` : ''}
        <div class="cid-kbd-foot">
          <span>⌨️</span>
          <span><span class="cid-kbd">Enter</span> صف جديد</span>
          <span><span class="cid-kbd">Tab</span> تنقل</span>
          <span><span class="cid-kbd">Esc</span> أغلق</span>
        </div>
      </div>
    `;

    _bindEvents();
  }

  // ── Suggestions section ───────────────────────────────────
  function _renderSuggestions(suggestions, lastRefEntry, lastUnitCost){
    return `
      <section class="cid-sect">
        <div class="cid-sect-label">
          <span>⚡ اقتراحات من آخر تكلفة</span>
          <span class="cid-line"></span>
          <span class="cid-hint">${lastRefEntry?.qty ? `${fn(lastRefEntry.qty)}ق · ${lastUnitCost.toFixed(2)} ج/قطعة` : ''}</span>
        </div>
        <div class="cid-suggs">
          ${suggestions.map((s,i) => `
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
        <div class="cid-kbd-foot" style="margin-top:4px"><span>اضغط على بند لإضافته مباشرةً</span></div>
      </section>`;
  }

  // ── Library suggestions section ───────────────────────────
  function _renderLibrarySuggestions(){
    if(_libLoading) return `
      <section class="cid-sect">
        <div class="cid-sect-label"><span>📚 من المكتبة</span><span class="cid-line"></span></div>
        <div class="cid-lib-loading">⏳ جارٍ تحميل اقتراحات المكتبة...</div>
      </section>`;
    if(!_libSuggestions.length) return '';
    return `
      <section class="cid-sect">
        <div class="cid-sect-label">
          <span>📚 من المكتبة</span>
          <span class="cid-line"></span>
          <span class="cid-hint">الأكثر استخداماً · أرخص مورد أولاً</span>
        </div>
        <div class="cid-lib-grid">
          ${_libSuggestions.map(sg => `
            <button class="cid-lib-card" type="button" data-action="add-lib-item"
                    data-type="${escapeHtml(sg.type)}"
                    data-sup-id="${escapeHtml(sg.cheapest.supplierId||'')}"
                    data-sup-name="${escapeHtml(sg.cheapest.supplierName||'')}"
                    data-total="${sg.cheapest.lastTotal||0}">
              <div class="cid-lib-ico">${getCostIco(sg.type)}</div>
              <div class="cid-lib-info">
                <div class="cid-lib-type">${escapeHtml(sg.type)}</div>
                <div class="cid-lib-sup">${escapeHtml(sg.cheapest.supplierName||'—')}</div>
                ${sg.cheapest.avgUnitCost > 0 ? `<div class="cid-lib-price">${sg.cheapest.avgUnitCost.toFixed(2)} ج/قطعة</div>` : ''}
              </div>
              <div class="cid-lib-meta">
                <span class="cid-lib-badge">× ${sg.usageCount||0}</span>
                ${sg.alts.length ? `<span class="cid-lib-alts-hint">+${sg.alts.length}</span>` : ''}
              </div>
            </button>
          `).join('')}
        </div>
      </section>`;
  }

  // ── Existing items grouped by SUPPLIER ────────────────────
  function _renderExistingItems(ci, allCi){
    const total = ci.reduce((s,x) => s + (parseFloat(x.total)||0), 0);
    // Group by supplier
    const bySupplier = {};
    ci.forEach(item => {
      const gi  = allCi.indexOf(item);
      const key = item.supplierId || '__none__';
      if(!bySupplier[key]) bySupplier[key] = { name: item.supplierName || '— بدون مورد', items:[], subtotal:0 };
      bySupplier[key].items.push({...item, _gi:gi});
      bySupplier[key].subtotal += parseFloat(item.total)||0;
    });

    const groups = Object.values(bySupplier).map(sup => `
      <div class="cid-sup-group">
        <div class="cid-sup-group-head">
          <span>🏭 ${escapeHtml(sup.name)}</span>
          <span class="cid-sup-group-total">${fn(sup.subtotal)} ج</span>
        </div>
        ${sup.items.map(it => `
          <div class="cid-item-row${_editIdx === it._gi ? ' is-editing' : ''}">
            <div class="cid-item-main">
              <div class="cid-item-name">${getCostIco(it.type)} ${escapeHtml(it.type||'—')}${it.paid ? ' <span class="cid-paid-tag">مدفوع</span>' : ''}</div>
              ${it.note ? `<div class="cid-item-sub">💬 ${escapeHtml(it.note)}</div>` : ''}
              ${it.date ? `<div class="cid-item-sub">📅 ${it.date}</div>` : ''}
            </div>
            <div class="cid-item-amt">${fn(it.total)} ج</div>
            <div class="cid-item-actions">
              <button class="cid-item-btn cid-item-btn-edit" type="button" data-action="edit-item" data-gi="${it._gi}" title="تعديل">✏️</button>
              <button class="cid-item-btn cid-item-btn-del" type="button" data-action="delete-item" data-gi="${it._gi}" title="حذف">✕</button>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');

    return `
      <section class="cid-sect">
        <div class="cid-sect-label">
          <span>📋 البنود المسجّلة (${ci.length})</span>
          <span class="cid-line"></span>
          <span class="cid-hint">إجمالي ${fn(total)} ج</span>
        </div>
        ${groups}
      </section>`;
  }

  // ── Batch entry section (multi-row table) ─────────────────
  function _renderBatchSection(){
    const validCount = _drafts.filter(r => r.supplierId && r.type && parseFloat(r.total) > 0).length;
    const batchTotal = _drafts.reduce((s,r) => s + (parseFloat(r.total)||0), 0);
    return `
      <section class="cid-sect">
        <div class="cid-sect-label">
          <span>➕ إضافة بنود جديدة</span>
          <span class="cid-line"></span>
          <span class="cid-hint">كل صف = بند منفصل بمورده الخاص</span>
        </div>
        <div class="cid-batch">
          <div class="cid-batch-head">
            <div>المورد</div>
            <div>النوع</div>
            <div>المبلغ</div>
            <div class="cid-batch-note-col">ملاحظة</div>
            <div></div>
          </div>
          ${_drafts.map(row => _renderBatchRow(row)).join('')}
          <div class="cid-batch-foot">
            <button class="cid-add-row-btn" type="button" data-action="add-row">＋ صف جديد</button>
            <div class="cid-batch-summary">
              ${validCount > 0 ? `<span class="cid-batch-count">${validCount} جاهز</span>` : ''}
              ${batchTotal > 0 ? `<span class="cid-batch-sum">${fn(batchTotal)} ج</span>` : ''}
            </div>
            <button class="cid-submit-all-btn${validCount===0?' is-disabled':''}" type="button" data-action="submit-all" ${validCount===0?'disabled':''}>
              💾 إضافة ${validCount>0?validCount+' ':''}بند${validCount!==1?'اً':''}
            </button>
          </div>
        </div>
      </section>`;
  }

  function _renderBatchRow(row){
    const supLabel  = row.supplierName || '— المورد —';
    const typeLabel = row.type || (row.supplierId ? '— النوع —' : '...');
    const typeOff   = !row.supplierId;
    const isValid   = !!(row.supplierId && row.type && parseFloat(row.total) > 0);
    return `
      <div class="cid-batch-row${isValid?' is-valid':''}" data-rid="${row.id}">
        <div class="cid-cell" data-cid-pop-anchor>
          <button class="cid-ttag" type="button" data-action="open-supplier-pop" data-rid="${row.id}"
                  style="${row.supplierId?'':'color:var(--warning);border-color:var(--warning-line);background:var(--warning-soft);'}">
            <span class="cid-ttag-ico">🏭</span>
            <span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(supLabel)}</span>
            <span class="cid-ttag-chev">▾</span>
          </button>
        </div>
        <div class="cid-cell" data-cid-pop-anchor>
          <button class="cid-ttag" type="button" data-action="open-type-pop" data-rid="${row.id}" ${typeOff?'disabled':''}
                  style="color:var(--info);border-color:var(--info-line);background:var(--info-soft);${typeOff?'opacity:.4;cursor:not-allowed;':''}">
            <span class="cid-ttag-ico">${getCostIco(row.type)}</span>
            <span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(typeLabel)}</span>
            <span class="cid-ttag-chev">▾</span>
          </button>
        </div>
        <div class="cid-cell cid-amt-cell">
          <input type="number" placeholder="0" value="${escapeHtml(String(row.total))}"
                 data-cid-field="total" data-rid="${row.id}" inputmode="numeric" min="0"/>
        </div>
        <div class="cid-cell cid-batch-note-col">
          <input type="text" placeholder="ملاحظة..." value="${escapeHtml(row.note||'')}"
                 data-cid-field="note" data-rid="${row.id}"/>
        </div>
        <div class="cid-cell cid-del-cell">
          <button class="cid-row-x" type="button" data-action="remove-row" data-rid="${row.id}" title="حذف الصف">✕</button>
        </div>
      </div>`;
  }

  // ── Edit section (single row for editing existing items) ──
  function _renderEditSection(){
    const d = _editDraft;
    if(!d) return '';
    const supLabel  = d.supplierName || '— اختر المورد —';
    const typeLabel = d.type || (d.supplierId ? '— اختر النوع —' : '— اختر المورد أولاً —');
    const typeOff   = !d.supplierId;
    return `
      <section class="cid-sect">
        <div class="cid-sect-label">
          <span>✏️ تعديل البند</span>
          <span class="cid-line"></span>
          <button class="cid-cancel-edit" type="button" data-action="cancel-edit">↩️ إلغاء</button>
        </div>
        <div class="cid-tbl">
          <div class="cid-tbl-head">
            <div>المورد</div><div>نوع البند</div><div>المبلغ</div><div></div>
          </div>
          <div class="cid-tbl-row is-draft">
            <div class="cid-cell" data-cid-pop-anchor>
              <button class="cid-ttag" type="button" data-action="open-supplier-pop" data-rid="edit"
                      style="color:var(--warning);border-color:var(--warning-line);background:var(--warning-soft);">
                <span class="cid-ttag-ico">🏭</span>
                <span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(supLabel)}</span>
                <span class="cid-ttag-chev">▾</span>
              </button>
            </div>
            <div class="cid-cell" data-cid-pop-anchor>
              <button class="cid-ttag" type="button" data-action="open-type-pop" data-rid="edit" ${typeOff?'disabled':''}
                      style="color:var(--info);border-color:var(--info-line);background:var(--info-soft);${typeOff?'opacity:.5;cursor:not-allowed;':''}">
                <span class="cid-ttag-ico">${getCostIco(d.type)}</span>
                <span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(typeLabel)}</span>
                <span class="cid-ttag-chev">▾</span>
              </button>
            </div>
            <div class="cid-cell cid-amt-cell">
              <input type="number" placeholder="0" value="${escapeHtml(String(d.total))}"
                     data-cid-field="total" data-rid="edit" inputmode="numeric" min="0"/>
            </div>
            <div style="display:flex;justify-content:center">
              <button class="cid-row-x cid-add" type="button" data-action="submit-edit" aria-label="حفظ التعديل">💾</button>
            </div>
          </div>
        </div>
        ${_renderPaperCalc(d)}
        ${_renderNoteInput(d)}
      </section>`;
  }

  function _renderPaperCalc(d){
    const t = (d?.type||'').toLowerCase();
    if(!t.includes('ورق') && !t.includes('كرتون')) return '';
    const m = d?.paperMeta || {};
    return `
      <div class="cid-paper-calc">
        <div class="cid-paper-head">📄 حاسبة الورق</div>
        <div class="cid-paper-grid">
          <label>نوع الورق<input type="text" placeholder="كوشيه / بريستول..." value="${escapeHtml(m.paperType||'')}" data-cid-paper="paperType"/></label>
          <label>الوزن (جم)<input type="number" placeholder="300" value="${escapeHtml(String(m.paperWeight||''))}" data-cid-paper="paperWeight" inputmode="numeric"/></label>
          <label>الأفرخ<input type="number" placeholder="0" value="${escapeHtml(String(m.sheets||''))}" data-cid-paper="sheets" inputmode="numeric"/></label>
          <label>سعر الفرخة (ج)<input type="number" step="0.01" placeholder="0.00" value="${escapeHtml(String(m.pricePerSheet||''))}" data-cid-paper="pricePerSheet" inputmode="decimal"/></label>
        </div>
        <div class="cid-paper-hint">↕️ اكتب الأفرخ × السعر، الإجمالي بيتحسب تلقائياً</div>
      </div>`;
  }

  function _renderNoteInput(d){
    return `
      <div class="cid-note-row">
        <label class="cid-note-label">📝 ملاحظة (اختياري)
          <input type="text" placeholder="مثال: دفعة جزئية، طلب خاص..." value="${escapeHtml(d?.note||'')}" data-cid-field="note" data-rid="edit"/>
        </label>
      </div>`;
  }

  // ── Event binding (delegated) ─────────────────────────────
  function _bindEvents(){
    _drawer.querySelector('.cid-close')?.addEventListener('click', close);

    // Library suggestions
    _drawer.querySelectorAll('[data-action="add-lib-item"]').forEach(el => {
      el.addEventListener('click', () => {
        const type    = el.dataset.type    || '';
        const supId   = el.dataset.supId   || '';
        const supName = el.dataset.supName || '';
        const total   = parseFloat(el.dataset.total) || 0;
        const c = ctx();
        const suppliers = c?.getSuppliers ? c.getSuppliers() : [];
        const sup = suppliers.find(s => s._id === supId);
        const specs = sup
          ? (Array.isArray(sup.specialties) && sup.specialties.length
              ? sup.specialties : (sup.printType ? [sup.printType] : []))
          : [];
        if(_editIdx >= 0 && _editDraft){
          Object.assign(_editDraft, { supplierId: supId, supplierName: supName,
            supplierSpecialties: specs, type, total: String(total||'') });
        } else {
          const emptyRow = _drafts.find(r => !r.supplierId && !r.type && !r.total);
          const target   = emptyRow || (() => { const r = newEmptyRow(); _drafts.push(r); return r; })();
          Object.assign(target, { supplierId: supId, supplierName: supName,
            supplierSpecialties: specs, type, total: String(total||'') });
        }
        render();
      });
    });

    // Suggestions
    _drawer.querySelectorAll('[data-action="apply-sugg"]').forEach(el => {
      el.addEventListener('click', () => {
        const sug = _getSuggestions()[parseInt(el.dataset.i, 10)];
        if(!sug) return;
        if(_editIdx >= 0) _applyToEdit(sug);
        else _addSuggestionAsRow(sug);
      });
    });
    _drawer.querySelector('[data-action="apply-all-sugg"]')?.addEventListener('click', () => {
      _applyAllSuggestions(_getSuggestions());
    });

    // Batch: add row
    _drawer.querySelector('[data-action="add-row"]')?.addEventListener('click', () => {
      _drafts.push(newEmptyRow());
      render();
      setTimeout(() => {
        const rows = _drawer.querySelectorAll('.cid-batch-row');
        rows[rows.length-1]?.querySelector('[data-action="open-supplier-pop"]')?.focus();
      }, 30);
    });

    // Batch: remove row
    _drawer.querySelectorAll('[data-action="remove-row"]').forEach(el => {
      el.addEventListener('click', () => _removeRow(el.dataset.rid));
    });

    // Batch: submit all
    _drawer.querySelector('[data-action="submit-all"]')?.addEventListener('click', _submitAll);

    // Edit: submit edit
    _drawer.querySelector('[data-action="submit-edit"]')?.addEventListener('click', _submitEdit);

    // Edit: cancel
    _drawer.querySelector('[data-action="cancel-edit"]')?.addEventListener('click', _cancelEdit);

    // Edit/delete existing items
    _drawer.querySelectorAll('[data-action="edit-item"]').forEach(el => {
      el.addEventListener('click', () => _startEdit(parseInt(el.dataset.gi, 10)));
    });
    _drawer.querySelectorAll('[data-action="delete-item"]').forEach(el => {
      el.addEventListener('click', () => _deleteItem(parseInt(el.dataset.gi, 10)));
    });

    // Supplier/type popover triggers
    _drawer.querySelectorAll('[data-action="open-supplier-pop"]').forEach(el => {
      el.addEventListener('click', (e) => _openSupplierPop(e.currentTarget, el.dataset.rid));
    });
    _drawer.querySelectorAll('[data-action="open-type-pop"]').forEach(el => {
      el.addEventListener('click', (e) => {
        if(e.currentTarget.hasAttribute('disabled')) return;
        _openTypePop(e.currentTarget, el.dataset.rid);
      });
    });

    // Amount inputs
    _drawer.querySelectorAll('[data-cid-field="total"][data-rid]').forEach(el => {
      const rid = el.dataset.rid;
      el.addEventListener('input', (e) => {
        if(rid === 'edit'){ if(_editDraft) _editDraft.total = e.target.value; }
        else { const r = _drafts.find(x => x.id === rid); if(r) r.total = e.target.value; }
        _updateTotals();
      });
      el.addEventListener('keydown', (e) => {
        if(e.key !== 'Enter') return;
        e.preventDefault();
        if(rid === 'edit'){ _submitEdit(); return; }
        // Enter on amount = add new row
        _drafts.push(newEmptyRow());
        render();
        setTimeout(() => {
          const rows = _drawer.querySelectorAll('.cid-batch-row');
          rows[rows.length-1]?.querySelector('[data-action="open-supplier-pop"]')?.focus();
        }, 30);
      });
    });

    // Note inputs
    _drawer.querySelectorAll('[data-cid-field="note"][data-rid]').forEach(el => {
      const rid = el.dataset.rid;
      el.addEventListener('input', (e) => {
        if(rid === 'edit'){ if(_editDraft) _editDraft.note = e.target.value; }
        else { const r = _drafts.find(x => x.id === rid); if(r) r.note = e.target.value; }
      });
    });

    // Paper calc inputs (edit mode only)
    _drawer.querySelectorAll('[data-cid-paper]').forEach(el => {
      el.addEventListener('input', (e) => {
        if(!_editDraft) return;
        if(!_editDraft.paperMeta) _editDraft.paperMeta = {};
        const field = el.dataset.cidPaper;
        _editDraft.paperMeta[field] = field === 'paperType' ? e.target.value : (parseFloat(e.target.value)||0);
        const sheets = parseFloat(_editDraft.paperMeta.sheets)||0;
        const price  = parseFloat(_editDraft.paperMeta.pricePerSheet)||0;
        if(sheets > 0 && price > 0){
          _editDraft.total = String(Math.round(sheets * price * 100) / 100);
          const ti = _drawer.querySelector('[data-cid-field="total"][data-rid="edit"]');
          if(ti) ti.value = _editDraft.total;
        }
      });
    });
  }

  // ── Cheap totals update (no re-render) ────────────────────
  function _updateTotals(){
    const c = ctx();
    const o = c?.getOrder(_orderId);
    if(!o) return;
    const allCi = o.costItems || [];
    const ci = _prodIdx >= 0 ? allCi.filter(x => x.prodIdx === _prodIdx || x.prodIdx == null) : allCi;
    const existingTotal = ci.reduce((s,x)=>s+(parseFloat(x.total)||0), 0);
    const batchTotal    = _drafts.reduce((s,r)=>s+(parseFloat(r.total)||0), 0);
    const validCount    = _drafts.filter(r => r.supplierId && r.type && parseFloat(r.total) > 0).length;

    const sumEl = _drawer.querySelector('.cid-sum');
    if(sumEl) sumEl.innerHTML = `${fn(existingTotal + batchTotal)}<small>ج</small>`;

    const batchSumEl = _drawer.querySelector('.cid-batch-sum');
    if(batchSumEl) batchSumEl.textContent = batchTotal > 0 ? `${fn(batchTotal)} ج` : '';

    const batchCountEl = _drawer.querySelector('.cid-batch-count');
    if(batchCountEl) batchCountEl.textContent = validCount > 0 ? `${validCount} جاهز` : '';

    const submitBtn = _drawer.querySelector('[data-action="submit-all"]');
    if(submitBtn){
      submitBtn.disabled = validCount === 0;
      submitBtn.classList.toggle('is-disabled', validCount === 0);
      submitBtn.textContent = `💾 إضافة ${validCount>0?validCount+' ':''}بند${validCount!==1?'اً':''}`;
    }
  }

  // ── Popovers ──────────────────────────────────────────────
  function _openSupplierPop(anchor, rowId){
    closePop();
    _popRowId = rowId;
    const c = ctx();
    const suppliers = c?.getSuppliers ? c.getSuppliers() : [];
    const pop = document.createElement('div');
    pop.className = 'cid-pop';
    const rect = anchor.getBoundingClientRect();
    pop.style.top  = `${rect.bottom + 4}px`;
    pop.style.right = `${window.innerWidth - rect.right}px`;
    pop.style.minWidth = `${Math.max(rect.width, 190)}px`;
    pop.style.maxHeight = '240px';
    pop.style.overflowY = 'auto';
    pop.innerHTML = !suppliers.length
      ? `<div class="cid-pop-empty">لا موردين مسجلين</div>`
      : `<div class="cid-pop-section">الموردون (${suppliers.length})</div>
         ${suppliers.slice(0,12).map(s => `
           <div class="cid-pop-item" data-action="pick-supplier"
                data-id="${escapeHtml(s._id)}" data-name="${escapeHtml(s.name)}">
             🏭 <span>${escapeHtml(s.name)}</span>
           </div>
         `).join('')}`;
    document.body.appendChild(pop);
    _pop = pop;
    pop.addEventListener('click', _onPopClick);
  }

  function _openTypePop(anchor, rowId){
    closePop();
    const currentRow = rowId === 'edit' ? _editDraft : _drafts.find(r => r.id === rowId);
    if(!currentRow?.supplierId){ toast('⚠️ اختر المورد أولاً', 'err'); return; }
    _popRowId = rowId;
    const c = ctx();
    const masterCats = c?.getMasterCategories ? c.getMasterCategories() : [];
    const specs = currentRow.supplierSpecialties || [];

    // Priority: supplier specialties > masterCategories > DEFAULT_TYPES
    let typeList;
    if(specs.length){
      typeList = specs;
    } else if(masterCats.length){
      typeList = masterCats.map(x => x.label);
    } else {
      typeList = DEFAULT_TYPES;
    }

    // If masterCats available, use grouped display
    let bodyHtml;
    if(masterCats.length && !specs.length){
      const groups = {};
      masterCats.forEach(cat => {
        const g = cat.group || 'أخرى';
        if(!groups[g]) groups[g] = [];
        groups[g].push(cat.label);
      });
      bodyHtml = Object.entries(groups).map(([g, labels]) => `
        <div class="cid-pop-section">${escapeHtml(g)}</div>
        ${labels.map(l => `
          <div class="cid-pop-item ${currentRow.type===l?'is-active':''}" data-action="pick-type" data-val="${escapeHtml(l)}">
            ${getCostIco(l)} <span>${escapeHtml(l)}</span>
          </div>`).join('')}
      `).join('');
    } else {
      bodyHtml = (specs.length
        ? `<div class="cid-pop-section">تخصصات المورد</div>`
        : `<div class="cid-pop-section">الأنواع</div>`)
        + typeList.map(l => `
          <div class="cid-pop-item ${currentRow.type===l?'is-active':''}" data-action="pick-type" data-val="${escapeHtml(l)}">
            ${getCostIco(l)} <span>${escapeHtml(l)}</span>
          </div>`).join('');
    }

    const pop = document.createElement('div');
    pop.className = 'cid-pop';
    const rect = anchor.getBoundingClientRect();
    pop.style.top    = `${rect.bottom + 4}px`;
    pop.style.right  = `${window.innerWidth - rect.right}px`;
    pop.style.minWidth = `${Math.max(rect.width, 160)}px`;
    pop.style.maxHeight = '280px';
    pop.style.overflowY = 'auto';
    pop.innerHTML = bodyHtml || '<div class="cid-pop-empty">لا توجد أنواع</div>';
    document.body.appendChild(pop);
    _pop = pop;
    pop.addEventListener('click', _onPopClick);
  }

  function closePop(){ if(_pop){ _pop.remove(); _pop = null; _popRowId = null; } }

  function _onPopClick(e){
    const el  = e.target.closest('[data-action]');
    if(!el) return;
    const action = el.dataset.action;
    const rowId  = _popRowId;
    const row = rowId === 'edit' ? _editDraft : _drafts.find(r => r.id === rowId);
    if(!row){ closePop(); return; }

    if(action === 'pick-supplier'){
      const c = ctx();
      const suppliers = c?.getSuppliers ? c.getSuppliers() : [];
      const sup = suppliers.find(s => s._id === el.dataset.id);
      const specs = sup
        ? (Array.isArray(sup.specialties) && sup.specialties.length
            ? sup.specialties
            : (sup.printType ? [sup.printType] : []))
        : [];
      row.supplierId  = el.dataset.id;
      row.supplierName = el.dataset.name;
      row.supplierSpecialties = specs;
      // Reset type if not in new supplier's specs
      if(row.type && specs.length && !specs.includes(row.type)){
        row.type = ''; row.paperMeta = null;
      }
      closePop();
      render();
      setTimeout(() => {
        const typeBtn = _drawer.querySelector(`[data-action="open-type-pop"][data-rid="${rowId}"]`);
        typeBtn?.focus();
      }, 50);

    } else if(action === 'pick-type'){
      row.type = el.dataset.val;
      if(!(row.type.toLowerCase().includes('ورق') || row.type.toLowerCase().includes('كرتون'))){
        row.paperMeta = null;
      }
      closePop();
      render();
      setTimeout(() => {
        const amtInput = _drawer.querySelector(`[data-cid-field="total"][data-rid="${rowId}"]`);
        amtInput?.focus();
      }, 50);
    }
  }

  // ── Library suggestions loader ────────────────────────────
  async function _loadLibrarySuggestions(){
    _libLoading = true;
    try {
      const loaded = await _getActionsDb();
      if(!loaded){ _libLoading = false; return; }
      const { db } = loaded;
      const { getCostLibraryItems } = await import('../../core/cost-library-actions.js');
      const items = await getCostLibraryItems({ db, limitN: 60 });
      const active = items.filter(x => x.isActive !== false);

      // Group by type, sort cheapest supplier first
      const byType = {};
      active.forEach(item => {
        const t = item.type || '—';
        if(!byType[t]) byType[t] = [];
        byType[t].push(item);
      });

      _libSuggestions = Object.entries(byType)
        .map(([type, list]) => {
          const sorted   = [...list].sort((a, b) => (a.avgUnitCost||Infinity) - (b.avgUnitCost||Infinity));
          const cheapest = sorted[0];
          const totalUsage = list.reduce((s, x) => s + (x.usageCount||0), 0);
          return { type, cheapest, alts: sorted.slice(1, 3), usageCount: totalUsage };
        })
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 8);
    } catch(e){
      console.warn('[cost-drawer] library load failed:', e?.message);
      _libSuggestions = [];
    }
    _libLoading = false;
    if(_open) render();
  }

  // ── Suggestions helpers ───────────────────────────────────
  function _getSuggestions(){
    const c = ctx();
    const o = c?.getOrder(_orderId);
    if(!o) return [];
    const prods = o.products || [];
    const prod = _prodIdx >= 0 ? prods[_prodIdx] : prods[0];
    if(!prod) return [];
    const catalog = c.getProductsCatalog ? c.getProductsCatalog() : [];
    const pName   = (prod.name||'').trim().toLowerCase();
    const pQty    = parseFloat(prod.qty) || 0;
    const cat = catalog.find(cp =>
      (cp.name||'').trim().toLowerCase() === pName ||
      (pName && (cp.name||'').trim().toLowerCase().includes(pName))
    );
    if(!cat || !(cat.costHistory||[]).length) return [];
    const sameQty = cat.costHistory.filter(h => parseFloat(h.qty) === pQty);
    const lastEntry = sameQty.length ? sameQty[sameQty.length-1] : cat.costHistory[cat.costHistory.length-1];
    return (lastEntry?.items || []).map(it => ({
      type: it.type, supplierId: it.supplierId||'', supplierName: it.supplierName||'',
      total: parseFloat(it.total)||0,
    }));
  }

  function _resolveSupplier(sug){
    const c = ctx();
    const suppliers = c?.getSuppliers ? c.getSuppliers() : [];
    const sup = suppliers.find(s =>
      (sug.supplierId && s._id === sug.supplierId) ||
      (sug.supplierName && (s.name||'').trim() === (sug.supplierName||'').trim())
    );
    return {
      supplierId:   sup?._id || sug.supplierId || '',
      supplierName: sup?.name || sug.supplierName || '',
      specs: sup ? (Array.isArray(sup.specialties) && sup.specialties.length
                    ? sup.specialties : (sup.printType ? [sup.printType] : []))
                 : [],
    };
  }

  function _applyToEdit(sug){
    if(!_editDraft) return;
    const { supplierId, supplierName, specs } = _resolveSupplier(sug);
    Object.assign(_editDraft, { supplierId, supplierName, supplierSpecialties: specs,
      type: sug.type||'', total: String(sug.total||'') });
    render();
    setTimeout(() => _drawer.querySelector('[data-cid-field="total"][data-rid="edit"]')?.focus(), 50);
  }

  function _addSuggestionAsRow(sug){
    const { supplierId, supplierName, specs } = _resolveSupplier(sug);
    const emptyRow = _drafts.find(r => !r.supplierId && !r.type && !r.total);
    const target = emptyRow || (() => { const r = newEmptyRow(); _drafts.push(r); return r; })();
    Object.assign(target, { supplierId, supplierName, supplierSpecialties: specs,
      type: sug.type||'', total: String(sug.total||'') });
    render();
  }

  function _applyAllSuggestions(sugs){
    if(!sugs.length) return;
    _drafts = sugs.map(sug => {
      const { supplierId, supplierName, specs } = _resolveSupplier(sug);
      return { ...newEmptyRow(), supplierId, supplierName, supplierSpecialties: specs,
               type: sug.type||'', total: String(sug.total||'') };
    });
    if(!_drafts.length) _drafts = [newEmptyRow()];
    render();
    toast(`📥 تم استيراد ${sugs.length} بند`, '');
  }

  // ── Edit mode ─────────────────────────────────────────────
  function _startEdit(gi){
    const c = ctx();
    const o = c?.getOrder(_orderId);
    const item = (o?.costItems || [])[gi];
    if(!item){ toast('⚠️ البند غير موجود', 'err'); return; }
    if(item.paid){ toast('⛔ البند مدفوع — التعديل من اللوحة القديمة فقط (admin only)', 'warn'); return; }
    const suppliers = c?.getSuppliers ? c.getSuppliers() : [];
    const sup = suppliers.find(s => s._id === item.supplierId);
    const specs = sup ? (Array.isArray(sup.specialties) && sup.specialties.length
                          ? sup.specialties : (sup.printType ? [sup.printType] : []))
                      : [];
    _editIdx  = gi;
    _editDraft = {
      supplierId: item.supplierId||'', supplierName: item.supplierName||'',
      supplierSpecialties: specs, type: item.type||'',
      total: String(item.total||''), note: item.note||'', paperMeta: item.paperMeta||null,
    };
    render();
    setTimeout(() => _drawer.querySelector('[data-cid-field="total"][data-rid="edit"]')?.focus(), 50);
  }

  function _cancelEdit(){
    _editIdx  = -1;
    _editDraft = null;
    render();
  }

  // ── Lazy-load actions & db ────────────────────────────────
  async function _getActionsDb(){
    let actions = window.__orderActions;
    if(!actions){
      try { actions = (await import('../../order-actions.js')).orderActions; window.__orderActions = actions; }
      catch(e){ toast('❌ فشل تحميل نظام الحفظ', 'err'); return null; }
    }
    let db = window.__firestoreDb;
    if(!db){
      try { db = (await import('../../core/firebase-init.js')).db; window.__firestoreDb = db; }
      catch(e){ toast('❌ فشل تحميل Firestore', 'err'); return null; }
    }
    return { actions, db };
  }

  // ── Submit all batch rows ─────────────────────────────────
  async function _submitAll(){
    const valid = _drafts.filter(r => r.supplierId && r.type && parseFloat(r.total) > 0);
    if(!valid.length){ toast('⚠️ لا توجد بنود جاهزة — تأكد من المورد والنوع والمبلغ', 'err'); return; }
    const c = ctx();
    if(!c){ toast('❌ السياق غير جاهز', 'err'); return; }
    const o = c.getOrder(_orderId);
    if(!o){ toast('❌ الأوردر غير متاح', 'err'); return; }
    const { actions, db } = await _getActionsDb() || {};
    if(!actions) return;

    const role     = c.getCurrentRole ? c.getCurrentRole() : '';
    const userId   = (c.getCurrentUser && c.getCurrentUser()?.uid) || '';
    const userName = c.getUserName ? c.getUserName() : '';
    const wallets  = c.getWallets ? c.getWallets() : [];

    const btn = _drawer.querySelector('[data-action="submit-all"]');
    if(btn){ btn.disabled = true; btn.textContent = `⏳ جاري الإضافة (0/${valid.length})...`; }

    let okCount = 0;
    let lastErr = '';
    for(let i = 0; i < valid.length; i++){
      const row = valid[i];
      if(btn) btn.textContent = `⏳ ${i+1}/${valid.length}...`;
      const res = await actions.recordCostItem({
        db, orderId: _orderId, prodIdx: _prodIdx,
        payload: {
          type: row.type, total: parseFloat(row.total),
          supplierId: row.supplierId, supplierName: row.supplierName,
          note: row.note||'', walletId:'', paperMeta: row.paperMeta||{},
          isExternal: true,
        },
        role, userId, userName, wallets, isEdit:false, editIdx:-1,
      });
      if(res.ok){
        okCount++;
        const idx = _drafts.indexOf(row);
        if(idx >= 0) _drafts.splice(idx, 1);
      } else {
        lastErr = res.errors?.[0] || 'فشل الحفظ';
      }
    }

    if(okCount > 0) toast(`✅ تمت إضافة ${okCount} بند`, 'ok');
    if(lastErr)     toast(`❌ بعض البنود لم تُحفظ: ${lastErr}`, 'err');

    if(!_drafts.length) _drafts = [newEmptyRow()];
    render();
  }

  // ── Submit edit ───────────────────────────────────────────
  async function _submitEdit(){
    if(!_editDraft){ toast('⚠️ لا يوجد بند للتعديل', 'err'); return; }
    if(!_editDraft.supplierId){ toast('⚠️ اختر المورد أولاً', 'err'); return; }
    if(!_editDraft.type){ toast('⚠️ اختر نوع البند', 'err'); return; }
    const total = parseFloat(_editDraft.total)||0;
    if(total <= 0){ toast('⚠️ أدخل مبلغاً أكبر من صفر', 'err'); return; }
    const c = ctx();
    if(!c){ toast('❌ السياق غير جاهز', 'err'); return; }
    const { actions, db } = await _getActionsDb() || {};
    if(!actions) return;
    const wallets = c.getWallets ? c.getWallets() : [];
    const res = await actions.recordCostItem({
      db, orderId: _orderId, prodIdx: _prodIdx,
      payload: {
        type: _editDraft.type, total,
        supplierId: _editDraft.supplierId, supplierName: _editDraft.supplierName,
        note: _editDraft.note||'', walletId:'', paperMeta: _editDraft.paperMeta||{},
        isExternal: true,
      },
      role: c.getCurrentRole ? c.getCurrentRole() : '',
      userId: (c.getCurrentUser && c.getCurrentUser()?.uid)||'',
      userName: c.getUserName ? c.getUserName() : '',
      wallets, isEdit:true, editIdx: _editIdx,
    });
    if(!res.ok){ toast('❌ '+(res.errors?.[0]||'فشل التعديل'), 'err'); return; }
    toast(`✅ تم التعديل — ${fn(total)} ج`, 'ok');
    _editIdx  = -1;
    _editDraft = null;
    render();
  }

  // ── Delete existing item ──────────────────────────────────
  async function _deleteItem(gi){
    const c = ctx();
    const o = c?.getOrder(_orderId);
    const item = (o?.costItems||[])[gi];
    if(!item){ toast('⚠️ البند غير موجود', 'err'); return; }
    if(typeof window.rmCost !== 'function'){ toast('❌ نظام الحذف غير متاح', 'err'); return; }
    if(!item.paid && !confirm(`حذف البند: ${item.type||''} — ${fn(item.total||0)} ج؟`)) return;
    try {
      await window.rmCost(gi);
      if(_editIdx === gi) _cancelEdit();
    } catch(e){ console.error('cost-items drawer delete failed', e); }
  }

  // ── Remove draft row ──────────────────────────────────────
  function _removeRow(rid){
    const idx = _drafts.findIndex(r => r.id === rid);
    if(idx < 0) return;
    if(_drafts.length === 1){ _drafts[0] = newEmptyRow(); }
    else _drafts.splice(idx, 1);
    render();
  }

  // ── Helpers ───────────────────────────────────────────────
  function escapeHtml(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function toast(msg, t=''){
    if(typeof window.toast === 'function'){ window.toast(msg, t); return; }
    const c = document.getElementById('toasts');
    if(!c) return;
    const el = document.createElement('div');
    el.className = 'toast ' + t;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // ── Public API ────────────────────────────────────────────
  function open(orderId, prodIdx){
    mount();
    _orderId = orderId;
    _prodIdx = (prodIdx == null || prodIdx < 0) ? -1 : parseInt(prodIdx, 10);
    _drafts  = [newEmptyRow()];
    _editDraft = null;
    _editIdx  = -1;
    _libSuggestions = [];
    _libLoading = false;
    _open = true;
    render();
    _loadLibrarySuggestions(); // fire-and-forget; re-renders when done
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

  // Bridge: production.html calls openCostDrawer(prodIdx) or openCostDrawer(orderId, prodIdx)
  window.openCostDrawer = function(orderIdOrProdIdx, prodIdx){
    const c = ctx();
    if(!c){
      if(typeof window.openCostPanel === 'function') return window.openCostPanel(orderIdOrProdIdx);
      return;
    }
    // If called with (orderId, prodIdx) directly use them
    if(prodIdx !== undefined){
      open(orderIdOrProdIdx, prodIdx);
      return;
    }
    // Otherwise (prodIdx) — get activeId from context
    const activeId = typeof c.getActiveOrderId === 'function' ? c.getActiveOrderId() : null;
    if(!activeId){
      if(typeof window.openCostPanel === 'function') return window.openCostPanel(orderIdOrProdIdx);
      return;
    }
    open(activeId, orderIdOrProdIdx);
  };
  window.closeCostDrawer = close;
})();
