/**
 * core/searchable-select.js — Reusable searchable combobox over native <select>
 *
 * طلب المستخدم: لما يدخل بند يكتب ويعمل filter (يطبَّق على السيستم كله تدريجياً).
 *
 * المبدأ:
 *  - الـ <select> الأصلي يبقى المصدر الوحيد للقيمة (form.elements.X.value يشتغل عادي)
 *  - نضيف فوقه UI: زر + popover فيه search input + list
 *  - filter on-typing
 *  - الاختيار → يكتب select.value + يطلق 'change' event
 *  - strict mode: لا free-text، اختيار من القائمة فقط
 *
 * الفوائد:
 *  - backward compatible — كود الفورم القديم لا يتغير
 *  - يدعم mobile (large touch targets)
 *  - reusable عبر النظام (RULE U1.4)
 *  - keyboard navigation: ↑↓ + Enter + Esc
 *
 * الاستخدام:
 *   import { makeSearchable } from './core/searchable-select.js';
 *   const sel = document.getElementById('my-select');
 *   const inst = makeSearchable(sel, { placeholder: 'ابحث...' });
 *   // لو الـ options تغيرت بعد كده:
 *   inst.refresh();
 *   // لإلغاء الـ enhancement:
 *   inst.destroy();
 *
 * RULE references:
 *  - U1.4 (Central Components) — مكون واحد يُستخدم في كل الصفحات
 *  - C1.7 (Central UI Behavior) — توحيد سلوك الـ dropdowns
 *  - E1 (Runtime Evolution Safety) — opt-in عبر makeSearchable(), legacy selects تبقى كما هي
 */

const REGISTRY = new WeakMap(); // selectEl → instance

/**
 * يحوّل <select> إلى searchable combobox.
 * @param {HTMLSelectElement} selectEl
 * @param {Object} [opts]
 * @param {string} [opts.placeholder='ابحث...']
 * @param {string} [opts.emptyText='لا توجد نتائج']
 * @param {boolean} [opts.strict=true]  — true: لا free-text، اختيار من القائمة فقط
 * @returns {{refresh, destroy, open, close, getValue, setValue}}
 */
export function makeSearchable(selectEl, opts = {}) {
  if (!selectEl || selectEl.tagName !== 'SELECT') {
    console.warn('[searchable-select] target must be a <select> element');
    return null;
  }
  // already enhanced? return existing instance
  const existing = REGISTRY.get(selectEl);
  if (existing) { existing.refresh(); return existing; }

  const placeholder = opts.placeholder || 'ابحث...';
  const emptyText   = opts.emptyText   || 'لا توجد نتائج';

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

  let activeIdx = -1; // keyboard nav
  let filteredOptions = [];

  // ── Methods ──────────────────────────────────────────────
  function renderTrigger() {
    const opt = selectEl.options[selectEl.selectedIndex];
    const label = opt && opt.value !== '' ? (opt.textContent || '').trim() : (selectEl.options[0]?.textContent || '').trim();
    if (label) {
      triggerLabel.textContent = label;
      triggerLabel.classList.remove('ss-placeholder');
    } else {
      triggerLabel.textContent = placeholder;
      triggerLabel.classList.add('ss-placeholder');
    }
  }

  function renderList(filter = '') {
    const f = (filter || '').trim().toLowerCase();
    const opts = [...selectEl.options];
    filteredOptions = opts
      .map((o, i) => ({ opt: o, i, text: (o.textContent || '').trim() }))
      .filter(x => {
        if (!f) return true;
        return x.text.toLowerCase().includes(f);
      });
    if (filteredOptions.length === 0) {
      list.innerHTML = '<div class="ss-empty">' + esc(emptyText) + '</div>';
      activeIdx = -1;
      return;
    }
    list.innerHTML = filteredOptions.map((x, j) => {
      const sel = (x.opt.selected) ? ' aria-selected="true" data-sel="1"' : '';
      const placeholderCls = (x.opt.value === '' && x.opt.disabled) ? ' ss-opt-placeholder' : '';
      return '<button type="button" class="ss-opt'+placeholderCls+'" data-idx="'+x.i+'" data-j="'+j+'" role="option"'+sel+'>' + esc(x.text) + '</button>';
    }).join('');
    activeIdx = filteredOptions.findIndex(x => x.opt.selected);
    refreshActiveHighlight();
  }

  function refreshActiveHighlight() {
    list.querySelectorAll('.ss-opt').forEach((el, j) => {
      el.classList.toggle('ss-opt-active', j === activeIdx);
    });
    // scroll into view
    if (activeIdx >= 0) {
      const el = list.querySelector('.ss-opt[data-j="'+activeIdx+'"]');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
  }

  function open() {
    if (!pop.hidden) return;
    pop.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    wrap.classList.add('ss-open');
    search.value = '';
    renderList('');
    // Focus search after paint so iOS keyboard opens
    setTimeout(() => search.focus(), 30);
    // close on outside click
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

  function selectByIdx(optIdx) {
    if (optIdx < 0 || optIdx >= selectEl.options.length) return;
    const opt = selectEl.options[optIdx];
    if (opt.disabled) return;
    selectEl.value = opt.value;
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    renderTrigger();
    close();
  }

  // ── Events ───────────────────────────────────────────────
  function onTriggerClick(e) {
    e.preventDefault();
    if (pop.hidden) open(); else close();
  }

  function onSearchInput() {
    renderList(search.value);
  }

  function onListClick(e) {
    const btn = e.target.closest('.ss-opt');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    selectByIdx(idx);
  }

  function onSearchKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!filteredOptions.length) return;
      activeIdx = Math.min(filteredOptions.length - 1, activeIdx + 1);
      // skip placeholder option
      if (filteredOptions[activeIdx]?.opt?.value === '' && filteredOptions[activeIdx]?.opt?.disabled) {
        activeIdx = Math.min(filteredOptions.length - 1, activeIdx + 1);
      }
      refreshActiveHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!filteredOptions.length) return;
      activeIdx = Math.max(0, activeIdx - 1);
      refreshActiveHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && filteredOptions[activeIdx]) {
        selectByIdx(filteredOptions[activeIdx].i);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
      trigger.focus();
    }
  }

  function onDocDown(e) {
    if (wrap.contains(e.target)) return;
    close();
  }

  // Re-render trigger if the underlying select changes (programmatic or other code)
  function onSelectChange() {
    renderTrigger();
  }

  trigger.addEventListener('click', onTriggerClick);
  search.addEventListener('input', onSearchInput);
  search.addEventListener('keydown', onSearchKeydown);
  list.addEventListener('click', onListClick);
  selectEl.addEventListener('change', onSelectChange);

  // ── Initial render ───────────────────────────────────────
  renderTrigger();

  // ── Public instance ──────────────────────────────────────
  const instance = {
    refresh() {
      renderTrigger();
      if (!pop.hidden) renderList(search.value);
    },
    destroy() {
      trigger.removeEventListener('click', onTriggerClick);
      search.removeEventListener('input', onSearchInput);
      search.removeEventListener('keydown', onSearchKeydown);
      list.removeEventListener('click', onListClick);
      selectEl.removeEventListener('change', onSelectChange);
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('touchstart', onDocDown, true);
      // unwrap
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
  };
  REGISTRY.set(selectEl, instance);
  return instance;
}

// ── Helpers ────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── Styles (injected once, scoped to .ss-* classes) ────────
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
  /* keep it focusable for form validation, just visually hidden */
}
.ss-wrap{
  position:relative;
  width:100%;
}
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
  justify-content:space-between;
  gap:8px;
  text-align:start;
  transition:border-color .15s;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
}
.ss-trigger:hover{border-color:var(--line2, #3a4458);}
.ss-wrap.ss-open .ss-trigger{border-color:var(--b, #3b9eff);}
.ss-trigger-label{
  flex:1;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.ss-trigger-label.ss-placeholder{color:var(--dim2, #647298);font-weight:500;}
.ss-chevron{color:var(--dim2, #647298);font-size:12px;flex-shrink:0;transition:transform .15s;}
.ss-wrap.ss-open .ss-chevron{transform:rotate(180deg);}
.ss-pop{
  position:absolute;
  inset-inline-start:0;
  inset-inline-end:0;
  top:calc(100% + 4px);
  background:var(--bg2, #161d2b);
  border:1px solid var(--line2, #3a4458);
  border-radius:var(--rad, 10px);
  box-shadow:0 8px 24px rgba(0,0,0,.4);
  z-index:1000;
  max-height:min(60vh, 360px);
  display:flex;
  flex-direction:column;
  overflow:hidden;
}
.ss-search{
  width:100%;
  padding:10px 12px;
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
}
.ss-opt{
  display:block;
  width:100%;
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
}
.ss-opt:hover{background:var(--hover, #232c3f);}
.ss-opt.ss-opt-active{background:var(--hover, #232c3f);outline:1px solid var(--b, #3b9eff);}
.ss-opt[data-sel="1"]{background:rgba(59,158,255,.12);color:var(--b, #3b9eff);font-weight:800;}
.ss-opt-placeholder{color:var(--dim2, #647298);font-weight:500;font-style:italic;}
.ss-empty{
  padding:18px 12px;
  text-align:center;
  color:var(--dim2, #647298);
  font-size:13px;
}
@media(max-width:480px){
  .ss-pop{max-height:min(70vh, 420px);}
  .ss-search,.ss-opt{font-size:15px;padding:12px;}
}
`;
  const style = document.createElement('style');
  style.id = 'ss-styles';
  style.textContent = css;
  document.head.appendChild(style);
}
