/**
 * core/searchable-select.js — Professional searchable combobox over native <select>
 *
 * Features (طلب المستخدم — التنفيذ احترافي يساعد على سهولة الإدخال):
 *  ✅ Filter on typing (substring match, case-insensitive, diacritic-insensitive)
 *  ✅ Match highlighting — يبرز الجزء المطابق بصرياً
 *  ✅ Type-ahead على الـ trigger — اكتب مباشرة بدون فتح
 *  ✅ زر مسح (×) لإلغاء الاختيار
 *  ✅ "الأخيرة" — يحفظ آخر 5 اختيارات في localStorage ويظهرهم على الأعلى
 *  ✅ Selected state واضح — ✓ + خلفية + font-weight
 *  ✅ Secondary text — سطر تحتاني للـ metadata (من data-secondary attribute)
 *  ✅ Empty state مع action — onCreate callback (للأدمن)
 *  ✅ Keyboard navigation: ↑↓ Enter Esc + Home/End
 *  ✅ Mobile: full-width popover، touch targets ≥ 44px
 *  ✅ Backward compatible — الـ <select> الأصلي يبقى مصدر الحقيقة
 *
 * المبدأ:
 *  - الـ <select> الأصلي يبقى المصدر الوحيد للقيمة (form.elements.X.value يشتغل عادي)
 *  - نضيف فوقه UI: trigger button + popover (search input + list)
 *  - الاختيار → يكتب select.value + يطلق 'change' event
 *  - strict mode (default): لا free-text، اختيار من القائمة فقط
 *
 * الاستخدام:
 *   import { makeSearchable } from './core/searchable-select.js';
 *   const sel = document.getElementById('my-select');
 *   const inst = makeSearchable(sel, {
 *     placeholder: 'ابحث عن مورد...',
 *     emptyText: 'لا يوجد موردون',
 *     recentKey: 'cost-supplier',   // مفتاح الـ localStorage للأخيرة
 *     maxRecent: 5,                  // (default 5)
 *     onCreate: (query) => { ... },  // optional: action عند Empty state
 *     onCreateLabel: '+ إضافة "{q}"', // optional: نص زر create
 *   });
 *   inst.refresh();    // لما الـ options تتغير
 *   inst.setValue(v);  // برمجياً
 *   inst.destroy();    // إلغاء الـ enhancement
 *
 * Option metadata (HTML):
 *   <option value="123" data-secondary="🏭 مطبعة">حماده</option>
 *   → الـ option في القائمة بيظهر السطر الثاني تحت الاسم.
 *
 * RULE references:
 *  - U1.4 (Central Components) — مكون واحد يُستخدم في كل الصفحات
 *  - C1.7 (Central UI Behavior) — توحيد سلوك الـ dropdowns
 *  - E1 (Runtime Evolution Safety) — opt-in عبر makeSearchable()
 */

const REGISTRY = new WeakMap(); // selectEl → instance
const LS_PREFIX = 'b2c.ss.recent.';

export function makeSearchable(selectEl, opts = {}) {
  if (!selectEl || selectEl.tagName !== 'SELECT') {
    console.warn('[searchable-select] target must be a <select> element');
    return null;
  }
  const existing = REGISTRY.get(selectEl);
  if (existing) { existing.refresh(); return existing; }

  const placeholder    = opts.placeholder    || 'ابحث...';
  const emptyText      = opts.emptyText      || 'لا توجد نتائج';
  const recentKey      = opts.recentKey      || '';
  const maxRecent      = Math.max(0, opts.maxRecent ?? 5);
  const onCreate       = typeof opts.onCreate === 'function' ? opts.onCreate : null;
  const onCreateLabel  = opts.onCreateLabel  || '+ إضافة "{q}"';
  const recentLabel    = opts.recentLabel    || '🕒 الأخيرة';

  ensureStylesInjected();

  // ── Build wrapper UI ─────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'ss-wrap';
  wrap.setAttribute('data-ss', '1');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ss-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'ss-trigger-label';
  trigger.appendChild(triggerLabel);

  const clearBtn = document.createElement('span');
  clearBtn.className = 'ss-clear';
  clearBtn.setAttribute('role', 'button');
  clearBtn.setAttribute('aria-label', 'مسح الاختيار');
  clearBtn.innerHTML = '✕';
  clearBtn.style.display = 'none';
  trigger.appendChild(clearBtn);

  const chevron = document.createElement('span');
  chevron.className = 'ss-chevron';
  chevron.textContent = '▾';
  trigger.appendChild(chevron);

  const pop = document.createElement('div');
  pop.className = 'ss-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'listbox');

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'ss-search';
  search.placeholder = placeholder;
  search.setAttribute('aria-label', placeholder);
  search.setAttribute('autocomplete', 'off');
  search.setAttribute('autocorrect', 'off');
  search.setAttribute('autocapitalize', 'off');
  search.setAttribute('inputmode', 'search');

  const list = document.createElement('div');
  list.className = 'ss-list';

  pop.appendChild(search);
  pop.appendChild(list);

  // Insert wrap right after the select; hide the native select
  selectEl.parentNode.insertBefore(wrap, selectEl);
  wrap.appendChild(selectEl);
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  selectEl.classList.add('ss-native-hidden');

  // ── State ────────────────────────────────────────────────
  let activeIdx = -1;        // index INTO renderedItems
  let renderedItems = [];    // [{ kind:'opt'|'create', opt, optIdx, text, secondary, isRecent }]

  // ── Methods ──────────────────────────────────────────────
  function getRecentValues() {
    if (!recentKey || !maxRecent) return [];
    try {
      const raw = localStorage.getItem(LS_PREFIX + recentKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function pushRecent(val) {
    if (!recentKey || !maxRecent || !val) return;
    try {
      const cur = getRecentValues().filter(v => v !== val);
      cur.unshift(val);
      const trimmed = cur.slice(0, maxRecent);
      localStorage.setItem(LS_PREFIX + recentKey, JSON.stringify(trimmed));
    } catch (_) {}
  }

  function renderTrigger() {
    const opt = selectEl.options[selectEl.selectedIndex];
    const hasValue = opt && opt.value !== '';
    const label = hasValue ? (opt.textContent || '').trim() : '';
    if (label) {
      triggerLabel.textContent = label;
      triggerLabel.classList.remove('ss-placeholder');
      clearBtn.style.display = 'inline-flex';
    } else {
      triggerLabel.textContent = (selectEl.options[0]?.textContent || placeholder).trim();
      triggerLabel.classList.add('ss-placeholder');
      clearBtn.style.display = 'none';
    }
  }

  function normalize(s) {
    // case-insensitive + remove Arabic diacritics + remove tatweel for tolerant matching
    return String(s || '')
      .toLowerCase()
      .replace(/[ً-ْٰـ]/g, '');
  }

  function buildItems(filter) {
    const f = normalize(filter);
    const opts = [...selectEl.options];
    // Exclude placeholder option (value === '') from results unless filter empty AND it's the only "—" hint
    const valid = opts
      .map((o, i) => ({
        opt: o, optIdx: i,
        text: (o.textContent || '').trim(),
        secondary: o.getAttribute('data-secondary') || '',
        value: o.value,
      }))
      .filter(x => x.value !== '' || (!f && opts.length === 1)); // hide "— اختر —" from list

    // Filter by query (text OR secondary)
    let matches = valid;
    if (f) {
      matches = valid.filter(x =>
        normalize(x.text).includes(f) || normalize(x.secondary).includes(f)
      );
    }

    // Recents on top (only when no filter)
    const result = [];
    if (!f && recentKey && maxRecent) {
      const recentVals = getRecentValues();
      const recentItems = [];
      for (const rv of recentVals) {
        const found = matches.find(x => x.value === rv);
        if (found) recentItems.push({ kind:'opt', ...found, isRecent:true });
      }
      if (recentItems.length) {
        result.push({ kind:'header', text: recentLabel });
        result.push(...recentItems);
        // remaining (not recent)
        const recentSet = new Set(recentVals);
        const rest = matches.filter(x => !recentSet.has(x.value));
        if (rest.length) {
          result.push({ kind:'header', text: '📋 الكل' });
          result.push(...rest.map(x => ({ kind:'opt', ...x, isRecent:false })));
        }
        return result;
      }
    }
    result.push(...matches.map(x => ({ kind:'opt', ...x, isRecent:false })));

    // Empty + onCreate fallback
    if (result.length === 0 && f && onCreate) {
      result.push({ kind:'create', text: onCreateLabel.replace('{q}', filter), query: filter });
    }
    return result;
  }

  function highlightHTML(text, filter) {
    if (!filter || !text) return esc(text);
    const f = filter.trim();
    if (!f) return esc(text);
    // case-insensitive, escape regex meta-chars
    const re = new RegExp('(' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    const parts = String(text).split(re);
    return parts.map(p => re.test(p) ? '<mark class="ss-mark">' + esc(p) + '</mark>' : esc(p)).join('');
  }

  function renderList(filter = '') {
    renderedItems = buildItems(filter);
    if (renderedItems.length === 0) {
      list.innerHTML = '<div class="ss-empty">' + esc(emptyText) + '</div>';
      activeIdx = -1;
      return;
    }
    const selVal = selectEl.value;
    list.innerHTML = renderedItems.map((it, j) => {
      if (it.kind === 'header') {
        return '<div class="ss-group">' + esc(it.text) + '</div>';
      }
      if (it.kind === 'create') {
        return '<button type="button" class="ss-opt ss-opt-create" data-j="'+j+'" role="option">'
          + '<span style="display:flex;align-items:center;gap:6px"><span style="font-size:16px">＋</span>' + esc(it.text) + '</span>'
          + '</button>';
      }
      // opt
      const isSel = it.value === selVal && it.value !== '';
      const recentBadge = it.isRecent ? '<span class="ss-badge">🕒</span>' : '';
      const checkmark = isSel ? '<span class="ss-check">✓</span>' : '';
      const primary = highlightHTML(it.text, filter);
      const secondary = it.secondary
        ? '<span class="ss-opt-secondary">' + highlightHTML(it.secondary, filter) + '</span>'
        : '';
      return '<button type="button" class="ss-opt'+(isSel?' ss-opt-sel':'')+'" data-j="'+j+'" data-opt-idx="'+it.optIdx+'" role="option"'+(isSel?' aria-selected="true"':'')+'>'
        + '<span class="ss-opt-main">'
        + '<span class="ss-opt-primary">' + primary + recentBadge + '</span>'
        + secondary
        + '</span>'
        + checkmark
        + '</button>';
    }).join('');
    // Reset/recompute activeIdx
    if (filter) {
      activeIdx = renderedItems.findIndex(it => it.kind === 'opt');
    } else {
      activeIdx = renderedItems.findIndex(it => it.kind === 'opt' && it.value === selVal);
      if (activeIdx < 0) activeIdx = renderedItems.findIndex(it => it.kind === 'opt');
    }
    refreshActiveHighlight();
  }

  function refreshActiveHighlight() {
    list.querySelectorAll('.ss-opt').forEach((el) => {
      const j = parseInt(el.dataset.j, 10);
      el.classList.toggle('ss-opt-active', j === activeIdx);
    });
    if (activeIdx >= 0) {
      const el = list.querySelector('.ss-opt[data-j="'+activeIdx+'"]');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
  }

  function moveActive(delta) {
    if (!renderedItems.length) return;
    let i = activeIdx;
    for (let n = 0; n < renderedItems.length; n++) {
      i = (i + delta + renderedItems.length) % renderedItems.length;
      if (renderedItems[i] && (renderedItems[i].kind === 'opt' || renderedItems[i].kind === 'create')) {
        activeIdx = i;
        refreshActiveHighlight();
        return;
      }
    }
  }

  function open(prefill = '') {
    if (!pop.hidden) {
      if (prefill) { search.value = prefill; renderList(prefill); }
      return;
    }
    pop.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    wrap.classList.add('ss-open');
    search.value = prefill || '';
    renderList(search.value);
    setTimeout(() => search.focus(), 30);
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('touchstart', onDocDown, true);
  }

  function close() {
    if (pop.hidden) return;
    pop.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('ss-open');
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('touchstart', onDocDown, true);
  }

  function selectItem(item) {
    if (!item) return;
    if (item.kind === 'create') {
      if (onCreate) {
        try { onCreate(item.query); } catch (e) { console.warn('onCreate error', e); }
      }
      close();
      return;
    }
    const opt = selectEl.options[item.optIdx];
    if (!opt || opt.disabled) return;
    selectEl.value = opt.value;
    pushRecent(opt.value);
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    renderTrigger();
    close();
    trigger.focus();
  }

  // ── Events ───────────────────────────────────────────────
  function onTriggerClick(e) {
    e.preventDefault();
    if (pop.hidden) open(); else close();
  }

  function onTriggerKeydown(e) {
    // Type-ahead: any printable char while focused → open + prefill
    if (pop.hidden && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      open(e.key);
      return;
    }
    if (pop.hidden && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      open();
    }
  }

  function onClearClick(e) {
    e.stopPropagation();
    e.preventDefault();
    selectEl.value = '';
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    renderTrigger();
  }

  function onSearchInput() {
    renderList(search.value);
  }

  function onListClick(e) {
    const btn = e.target.closest('.ss-opt');
    if (!btn) return;
    const j = parseInt(btn.dataset.j, 10);
    selectItem(renderedItems[j]);
  }

  function onSearchKeydown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Home') { e.preventDefault(); activeIdx = renderedItems.findIndex(it => it.kind === 'opt' || it.kind === 'create'); refreshActiveHighlight(); }
    else if (e.key === 'End') { e.preventDefault(); for (let i = renderedItems.length-1; i >= 0; i--) if (renderedItems[i].kind === 'opt' || renderedItems[i].kind === 'create') { activeIdx = i; break; } refreshActiveHighlight(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && renderedItems[activeIdx]) selectItem(renderedItems[activeIdx]);
    }
    else if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); }
    else if (e.key === 'Tab') { /* allow tab to close + move */ close(); }
  }

  function onDocDown(e) {
    if (wrap.contains(e.target)) return;
    close();
  }

  function onSelectChange() { renderTrigger(); }

  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKeydown);
  clearBtn.addEventListener('click', onClearClick);
  clearBtn.addEventListener('mousedown', e => e.stopPropagation()); // avoid trigger click
  search.addEventListener('input', onSearchInput);
  search.addEventListener('keydown', onSearchKeydown);
  list.addEventListener('click', onListClick);
  selectEl.addEventListener('change', onSelectChange);

  renderTrigger();

  // ── Public instance ──────────────────────────────────────
  const instance = {
    refresh() {
      renderTrigger();
      if (!pop.hidden) renderList(search.value);
    },
    destroy() {
      trigger.removeEventListener('click', onTriggerClick);
      trigger.removeEventListener('keydown', onTriggerKeydown);
      clearBtn.removeEventListener('click', onClearClick);
      search.removeEventListener('input', onSearchInput);
      search.removeEventListener('keydown', onSearchKeydown);
      list.removeEventListener('click', onListClick);
      selectEl.removeEventListener('change', onSelectChange);
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('touchstart', onDocDown, true);
      if (wrap.parentNode) {
        wrap.parentNode.insertBefore(selectEl, wrap);
        wrap.remove();
      }
      selectEl.classList.remove('ss-native-hidden');
      REGISTRY.delete(selectEl);
    },
    open, close,
    getValue() { return selectEl.value; },
    setValue(v) { selectEl.value = v; renderTrigger(); },
    clearRecent() {
      if (recentKey) try { localStorage.removeItem(LS_PREFIX + recentKey); } catch(_){}
    },
  };
  REGISTRY.set(selectEl, instance);
  return instance;
}

// ── Helpers ────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── Styles (injected once) ─────────────────────────────────
let __stylesInjected = false;
function ensureStylesInjected() {
  if (__stylesInjected) return;
  __stylesInjected = true;
  const css = `
.ss-native-hidden{
  position:absolute!important;
  width:1px;height:1px;
  padding:0;margin:-1px;
  overflow:hidden;clip:rect(0,0,0,0);
  border:0;
}
.ss-wrap{position:relative;width:100%;}
.ss-trigger{
  width:100%;
  padding:10px 12px;
  background:var(--bg3, #1f2735);
  border:1px solid var(--line, #2b3447);
  border-radius:var(--rad, 10px);
  color:var(--snow, #fff);
  font-size:14px;
  font-family:inherit;
  font-weight:600;
  cursor:pointer;
  display:flex;
  align-items:center;
  gap:8px;
  text-align:start;
  transition:border-color .15s, box-shadow .15s;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
  min-height:44px;
}
.ss-trigger:hover{border-color:var(--line2, #3a4458);}
.ss-trigger:focus{outline:0;border-color:var(--b, #3b9eff);box-shadow:0 0 0 3px rgba(59,158,255,.15);}
.ss-wrap.ss-open .ss-trigger{border-color:var(--b, #3b9eff);box-shadow:0 0 0 3px rgba(59,158,255,.15);}
.ss-trigger-label{
  flex:1;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.ss-trigger-label.ss-placeholder{color:var(--dim2, #647298);font-weight:500;}
.ss-clear{
  width:22px;height:22px;
  display:inline-flex;align-items:center;justify-content:center;
  border-radius:50%;
  background:var(--bg2, #161d2b);
  color:var(--dim2, #647298);
  font-size:11px;
  cursor:pointer;
  flex-shrink:0;
  transition:background .15s, color .15s;
  user-select:none;
}
.ss-clear:hover{background:var(--r, #ff3d6e);color:#fff;}
.ss-chevron{
  color:var(--dim2, #647298);
  font-size:12px;
  flex-shrink:0;
  transition:transform .15s;
}
.ss-wrap.ss-open .ss-chevron{transform:rotate(180deg);}
.ss-pop{
  position:absolute;
  inset-inline-start:0;
  inset-inline-end:0;
  top:calc(100% + 4px);
  background:var(--bg2, #161d2b);
  border:1px solid var(--line2, #3a4458);
  border-radius:var(--rad, 10px);
  box-shadow:0 8px 32px rgba(0,0,0,.5);
  z-index:1000;
  max-height:min(60vh, 380px);
  display:flex;
  flex-direction:column;
  overflow:hidden;
  animation:ssFadeIn .14s ease-out;
}
@keyframes ssFadeIn{
  from{opacity:0;transform:translateY(-4px);}
  to{opacity:1;transform:translateY(0);}
}
.ss-search{
  width:100%;
  padding:11px 14px;
  background:var(--bg3, #1f2735);
  border:0;
  border-bottom:1px solid var(--line, #2b3447);
  color:var(--snow, #fff);
  font-size:14px;
  font-family:inherit;
  outline:0;
}
.ss-search::placeholder{color:var(--dim2, #647298);}
.ss-list{
  flex:1;
  min-height:0;
  overflow-y:auto;
  padding:4px;
  scrollbar-width:thin;
}
.ss-list::-webkit-scrollbar{width:6px;}
.ss-list::-webkit-scrollbar-thumb{background:var(--line2, #3a4458);border-radius:3px;}
.ss-group{
  padding:8px 12px 4px;
  font-size:11px;
  font-weight:800;
  color:var(--dim2, #647298);
  text-transform:uppercase;
  letter-spacing:.5px;
  user-select:none;
}
.ss-opt{
  display:flex;
  width:100%;
  align-items:center;
  gap:8px;
  text-align:start;
  padding:10px 12px;
  background:transparent;
  border:0;
  border-radius:var(--rad, 8px);
  color:var(--snow, #fff);
  font-size:14px;
  font-family:inherit;
  font-weight:600;
  cursor:pointer;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
  min-height:44px;
  transition:background .1s;
}
.ss-opt:hover{background:var(--hover, #232c3f);}
.ss-opt.ss-opt-active{background:var(--hover, #232c3f);box-shadow:inset 0 0 0 1px var(--b, #3b9eff);}
.ss-opt.ss-opt-sel{background:rgba(59,158,255,.1);color:var(--b, #3b9eff);font-weight:800;}
.ss-opt.ss-opt-sel:hover{background:rgba(59,158,255,.16);}
.ss-opt-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.ss-opt-primary{
  display:flex;align-items:center;gap:6px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.ss-opt-secondary{
  font-size:11px;
  font-weight:600;
  color:var(--dim2, #647298);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.ss-mark{
  background:rgba(255,170,0,.25);
  color:var(--y, #ffaa00);
  padding:0 2px;
  border-radius:2px;
  font-weight:800;
}
.ss-badge{
  font-size:10px;
  opacity:.8;
}
.ss-check{
  color:var(--g, #00d97e);
  font-size:14px;
  font-weight:900;
  flex-shrink:0;
}
.ss-opt-create{
  color:var(--g, #00d97e);
  border:1px dashed var(--g, #00d97e);
  background:rgba(0,217,126,.06);
  margin-top:4px;
  font-weight:800;
  justify-content:flex-start;
}
.ss-opt-create:hover{background:rgba(0,217,126,.14);}
.ss-empty{
  padding:24px 14px;
  text-align:center;
  color:var(--dim2, #647298);
  font-size:13px;
}
@media(max-width:480px){
  .ss-pop{max-height:min(70vh, 440px);}
  .ss-search{font-size:15px;padding:13px 14px;}
  .ss-opt{font-size:15px;padding:12px 14px;}
  .ss-trigger{font-size:15px;}
}
`;
  const style = document.createElement('style');
  style.id = 'ss-styles';
  style.textContent = css;
  document.head.appendChild(style);
}
