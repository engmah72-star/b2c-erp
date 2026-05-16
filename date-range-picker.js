// ═══════════════════════════════════════════════════════════════
//  date-range-picker.js — Shared Range Filter Widget
//
//  Usage:
//    import { mountDateRangePicker, getRange } from './date-range-picker.js';
//    const picker = mountDateRangePicker({
//      container: document.getElementById('range-host'),
//      storageKey: 'exec-dash:range',
//      onChange: ({startMs, endMs, key, label}) => { renderAll(); }
//    });
//    // Inside renderers:
//    const { startMs, endMs } = getRange('exec-dash:range');
//
//  Presets: today | last7 | last30 | this_month | custom
//  Persists the selected range in localStorage so it survives reloads.
//
//  Strategic note (BUSINESS DNA): all dashboards must speak the same
//  language of "time window". This widget is the only source of truth
//  for the user-selected window; pages must NOT roll their own.
// ═══════════════════════════════════════════════════════════════

const PRESETS = [
  { key: 'today',      label: 'اليوم' },
  { key: 'last7',      label: 'آخر 7 أيام' },
  { key: 'last30',     label: 'آخر 30 يوم' },
  { key: 'this_month', label: 'هذا الشهر' },
  { key: 'custom',     label: 'مخصّص' },
];

function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d){ const x=new Date(d); x.setHours(23,59,59,999); return x; }

function computeRange(key, customStart, customEnd){
  const now = new Date();
  switch(key){
    case 'today': {
      return { startMs: startOfDay(now).getTime(), endMs: endOfDay(now).getTime(), label: 'اليوم' };
    }
    case 'last7': {
      const s = startOfDay(new Date(now.getTime() - 6*864e5));
      return { startMs: s.getTime(), endMs: endOfDay(now).getTime(), label: 'آخر 7 أيام' };
    }
    case 'last30': {
      const s = startOfDay(new Date(now.getTime() - 29*864e5));
      return { startMs: s.getTime(), endMs: endOfDay(now).getTime(), label: 'آخر 30 يوم' };
    }
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0);
      return { startMs: s.getTime(), endMs: endOfDay(now).getTime(), label: 'هذا الشهر' };
    }
    case 'custom': {
      if(customStart && customEnd){
        const s = startOfDay(new Date(customStart));
        const e = endOfDay(new Date(customEnd));
        return { startMs: s.getTime(), endMs: e.getTime(), label: `${customStart} → ${customEnd}` };
      }
      // fallback if invalid custom range
      return computeRange('this_month');
    }
    default: return computeRange('this_month');
  }
}

function loadState(storageKey){
  try {
    const raw = localStorage.getItem(storageKey);
    if(!raw) return { key:'this_month' };
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed.key !== 'string') return { key:'this_month' };
    return parsed;
  } catch { return { key:'this_month' }; }
}

function saveState(storageKey, state){
  try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
}

// Public: get the current resolved range without mounting UI
export function getRange(storageKey){
  const s = loadState(storageKey);
  return computeRange(s.key, s.customStart, s.customEnd);
}

export function mountDateRangePicker({ container, storageKey, onChange }){
  if(!container){ console.warn('[date-range-picker] container missing'); return null; }
  let state = loadState(storageKey);

  function render(){
    const active = state.key;
    const r = computeRange(state.key, state.customStart, state.customEnd);
    container.innerHTML = `
      <div class="drp-wrap" dir="rtl">
        <div class="drp-label">📅 الفترة:</div>
        <div class="drp-chips">
          ${PRESETS.map(p => `
            <button type="button" class="drp-chip ${p.key===active?'drp-active':''}" data-key="${p.key}">${p.label}</button>
          `).join('')}
        </div>
        <div class="drp-custom" style="display:${active==='custom'?'flex':'none'}">
          <input type="date" class="drp-date" id="drp-from" value="${state.customStart||''}">
          <span class="drp-arrow">→</span>
          <input type="date" class="drp-date" id="drp-to" value="${state.customEnd||''}">
        </div>
        <div class="drp-current">${r.label}</div>
      </div>`;

    container.querySelectorAll('.drp-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        state = { ...state, key: btn.dataset.key };
        saveState(storageKey, state);
        render();
        if(state.key !== 'custom' || (state.customStart && state.customEnd)){
          notify();
        }
      });
    });

    const from = container.querySelector('#drp-from');
    const to   = container.querySelector('#drp-to');
    if(from && to){
      const onCustom = () => {
        state = { ...state, key:'custom', customStart: from.value, customEnd: to.value };
        saveState(storageKey, state);
        if(from.value && to.value) notify();
        // Update label without re-rendering (preserve focus)
        const label = container.querySelector('.drp-current');
        if(label){
          const r2 = computeRange(state.key, state.customStart, state.customEnd);
          label.textContent = r2.label;
        }
      };
      from.addEventListener('change', onCustom);
      to.addEventListener('change', onCustom);
    }
  }

  function notify(){
    if(typeof onChange === 'function'){
      const r = computeRange(state.key, state.customStart, state.customEnd);
      onChange({ ...r, key: state.key });
    }
  }

  // Inject CSS once
  if(!document.getElementById('drp-styles')){
    const css = document.createElement('style');
    css.id = 'drp-styles';
    css.textContent = `
      .drp-wrap{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--bg2,#13141a);border:1px solid var(--line,rgba(255,255,255,.08));border-radius:14px;padding:10px 14px;margin-bottom:14px;}
      .drp-label{font-size:12px;font-weight:800;color:var(--dim2,#647298);}
      .drp-chips{display:flex;gap:6px;flex-wrap:wrap;}
      .drp-chip{background:var(--bg3,rgba(255,255,255,.04));border:1px solid var(--line,rgba(255,255,255,.08));color:var(--snow,#e7eaf6);border-radius:20px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;-webkit-tap-highlight-color:transparent;}
      .drp-chip:hover{border-color:rgba(74,142,245,.4);}
      .drp-active{background:rgba(74,142,245,.18);border-color:var(--b,#4a8ef5);color:var(--b,#4a8ef5);}
      .drp-custom{display:flex;align-items:center;gap:6px;}
      .drp-date{background:var(--bg3,rgba(255,255,255,.04));border:1px solid var(--line,rgba(255,255,255,.08));color:var(--snow,#e7eaf6);border-radius:8px;padding:4px 8px;font-size:11px;}
      .drp-arrow{color:var(--dim2,#647298);font-size:12px;}
      .drp-current{margin-inline-start:auto;font-size:11px;font-weight:700;color:var(--dim2,#647298);}
      @media(max-width:600px){
        .drp-wrap{padding:8px 10px;gap:6px;}
        .drp-chip{padding:5px 10px;font-size:10px;}
        .drp-current{width:100%;text-align:center;margin-inline-start:0;margin-top:4px;}
      }
    `;
    document.head.appendChild(css);
  }

  render();
  // Return the API so the caller can re-query the current range any time.
  return {
    getRange: () => computeRange(state.key, state.customStart, state.customEnd),
    refresh: render,
  };
}
