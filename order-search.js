// ════════════════════════════════════════════════════════════════════
// order-search.js — بحث عام عن الأوردرات من أي صفحة
// ════════════════════════════════════════════════════════════════════
// يُحمَّل تلقائياً من sidebar-config.js على كل صفحة.
// يحقن زر 📦 في الـ topbar + يفتح بـ Ctrl+Shift+K.
// يبحث في: اسم العميل · تليفون · رقم الأوردر · المنتج.
// النتائج تعرض المرحلة الحالية (stage badge) مباشرةً.
// ════════════════════════════════════════════════════════════════════

import { auth, db } from './core/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { collection, query, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const PATH = (location.pathname.split('/').pop() || '').toLowerCase();
const SKIP = [
  'login.html', 'client-login.html', 'client-portal.html',
  'waybill.html', 'reset-sw.html', 'offline.html',
  'chat.html', 'privacy.html', '',
];
if (SKIP.includes(PATH)) { /* no-op: module top-level guard */ } else { init(); }

function init() {
  const STAGES = {
    design:     { label: 'تصميم',  ico: '✏️', col: '#a78bfa' },
    printing:   { label: 'طباعة',  ico: '🖨️', col: '#ffaa00' },
    production: { label: 'تنفيذ',  ico: '🏭', col: '#ff3d6e' },
    shipping:   { label: 'شحن',    ico: '🚚', col: '#00d9ff' },
    archived:   { label: 'أرشيف',  ico: '📁', col: '#7878a0' },
    cancelled:  { label: 'ملغي',   ico: '✕',  col: '#7878a0' },
  };

  let orders = null; // lazy-loaded
  let loadingPromise = null;
  let modal = null;
  let authed = false;

  onAuthStateChanged(auth, u => { authed = !!u; });

  // ── Load orders on first search ──
  function loadOrders() {
    if (orders) return Promise.resolve(orders);
    if (loadingPromise) return loadingPromise;
    loadingPromise = getDocs(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    ).then(snap => {
      orders = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
      return orders;
    }).catch(err => {
      console.warn('[order-search] load error', err);
      orders = [];
      return orders;
    }).finally(() => { loadingPromise = null; });
    return loadingPromise;
  }

  // ── Search ──
  function search(q) {
    if (!orders || !q) return [];
    const qL = q.toLowerCase().trim();
    if (!qL) return [];
    return orders.filter(o => {
      const hay = [
        o.clientName, o.clientPhone, o.orderId, o._id,
        o.product, o.clientBusiness, o.job,
      ].concat((o.products || []).map(p => p.name))
       .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(qL);
    }).slice(0, 30);
  }

  function stageBadge(stage) {
    const s = STAGES[stage] || { label: stage || '—', ico: '📋', col: '#7878a0' };
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:${s.col}1f;color:${s.col}">${s.ico} ${esc(s.label)}</span>`;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ── Styles ──
  function injectStyles() {
    if (document.getElementById('os-styles')) return;
    const s = document.createElement('style');
    s.id = 'os-styles';
    s.textContent = [
      '.os-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);z-index:100000;display:flex;align-items:flex-start;justify-content:center;padding-top:70px;animation:osFade .15s}',
      '@keyframes osFade{from{opacity:0}to{opacity:1}}',
      '.os-modal{background:var(--bg2,#161b27);border:1px solid var(--line,#2a2f3e);border-radius:14px;width:92%;max-width:600px;max-height:75vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.55);overflow:hidden;animation:osSlide .18s ease-out;direction:rtl}',
      '@keyframes osSlide{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}',
      '.os-header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line,#2a2f3e)}',
      '.os-header-title{font-size:15px;font-weight:800;color:var(--snow,#e8eaf0);flex:1}',
      '.os-close{background:none;border:none;color:var(--dim2,#5c6878);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:6px}',
      '.os-close:hover{background:rgba(255,255,255,.08)}',
      '.os-input-row{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--line,#2a2f3e)}',
      '.os-input{flex:1;background:transparent;border:none;outline:none;color:var(--snow,#e8eaf0);font-family:inherit;font-size:15px;padding:4px 0;direction:rtl}',
      '.os-input::placeholder{color:var(--dim2,#5c6878)}',
      '.os-list{flex:1;overflow-y:auto;padding:6px 0;min-height:100px}',
      '.os-item{display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;color:var(--snow,#e8eaf0);transition:background .08s;border-bottom:1px solid rgba(255,255,255,.04)}',
      '.os-item:hover,.os-item.os-active{background:rgba(74,142,245,.12)}',
      '.os-item-body{flex:1;min-width:0}',
      '.os-item-name{font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.os-item-sub{font-size:11px;color:var(--dim2,#5c6878);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap}',
      '.os-empty{padding:30px 16px;text-align:center;color:var(--dim2,#5c6878);font-size:14px}',
      '.os-loading{padding:30px 16px;text-align:center;color:var(--dim2,#5c6878);font-size:14px}',
      '.os-footer{padding:8px 14px;border-top:1px solid var(--line,#2a2f3e);font-size:10.5px;color:var(--dim2,#5c6878);display:flex;gap:14px;justify-content:flex-end;align-items:center}',
      '.os-kbd{display:inline-block;background:var(--bg3,#1e2433);border:1px solid var(--line,#2a2f3e);border-radius:4px;padding:1px 6px;font-family:monospace;font-size:10px;color:var(--snow,#e8eaf0)}',
      '@media(max-width:600px){.os-overlay{padding-top:30px;padding-inline:6px}.os-modal{width:100%;max-height:85vh}}',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Modal ──
  let inputEl = null, listEl = null;
  let selectedIdx = 0, results = [];

  function openModal() {
    if (modal) return;
    if (!authed) return;
    injectStyles();

    modal = document.createElement('div');
    modal.className = 'os-overlay';
    modal.innerHTML = `
      <div class="os-modal">
        <div class="os-header">
          <span style="font-size:20px">📦</span>
          <span class="os-header-title">بحث عن أوردر — الأوردر فين؟</span>
          <button type="button" class="os-close" title="إغلاق">✕</button>
        </div>
        <div class="os-input-row">
          <span style="font-size:16px;opacity:.6">🔍</span>
          <input class="os-input" type="text" placeholder="اكتب اسم العميل أو التليفون أو رقم الأوردر..." autocomplete="off">
        </div>
        <div class="os-list"><div class="os-empty">اكتب للبحث عن أوردر ومعرفة مرحلته</div></div>
        <div class="os-footer">
          <span><span class="os-kbd">↑↓</span> تنقّل</span>
          <span><span class="os-kbd">↵</span> فتح</span>
          <span><span class="os-kbd">Esc</span> إغلاق</span>
        </div>
      </div>`;
    document.body.appendChild(modal);

    inputEl = modal.querySelector('.os-input');
    listEl = modal.querySelector('.os-list');

    modal.querySelector('.os-close').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    let timer = 0;
    inputEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => doSearch(inputEl.value), 150);
    });

    // load orders in background
    if (!orders) {
      listEl.innerHTML = '<div class="os-loading">جارٍ تحميل الأوردرات...</div>';
      loadOrders().then(() => {
        if (modal && inputEl) {
          const v = inputEl.value.trim();
          if (v) doSearch(v);
          else listEl.innerHTML = '<div class="os-empty">اكتب للبحث عن أوردر ومعرفة مرحلته</div>';
        }
      });
    }

    setTimeout(() => { try { inputEl.focus(); } catch (_) {} }, 30);
  }

  function closeModal() {
    if (!modal) return;
    modal.remove();
    modal = null; inputEl = null; listEl = null;
    selectedIdx = 0; results = [];
  }

  function doSearch(q) {
    if (!listEl) return;
    if (!orders) {
      listEl.innerHTML = '<div class="os-loading">جارٍ تحميل الأوردرات...</div>';
      return;
    }
    const trimmed = q.trim();
    if (!trimmed) {
      results = [];
      listEl.innerHTML = '<div class="os-empty">اكتب للبحث عن أوردر ومعرفة مرحلته</div>';
      return;
    }
    results = search(trimmed);
    selectedIdx = 0;
    if (!results.length) {
      listEl.innerHTML = '<div class="os-empty">لا توجد نتائج — جرّب اسم عميل أو رقم أوردر آخر</div>';
      return;
    }
    renderResults();
  }

  function renderResults() {
    if (!listEl) return;
    listEl.innerHTML = results.map((o, i) => {
      const prodTxt = (o.products || []).map(p => p.name || '').filter(Boolean).join(' + ') || o.product || '';
      return `<div class="os-item${i === selectedIdx ? ' os-active' : ''}" data-idx="${i}" data-id="${esc(o._id)}">
        <div style="font-size:20px;flex:none;width:28px;text-align:center">${(STAGES[o.stage] || {}).ico || '📋'}</div>
        <div class="os-item-body">
          <div class="os-item-name">${esc(o.clientName || '—')} ${stageBadge(o.stage)}</div>
          <div class="os-item-sub">
            <span>#${esc(o.orderId || o._id.slice(-6))}</span>
            ${o.clientPhone ? `<span>📞 ${esc(o.clientPhone)}</span>` : ''}
            ${prodTxt ? `<span>📦 ${esc(prodTxt)}</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    if (!listEl.dataset.delegated) {
      listEl.dataset.delegated = '1';
      listEl.addEventListener('click', e => {
        const el = e.target.closest('.os-item');
        if (el) navigateToOrder(el.dataset.id);
      });
      listEl.addEventListener('mouseover', e => {
        const el = e.target.closest('.os-item');
        if (el) {
          selectedIdx = parseInt(el.dataset.idx, 10);
          updateActive();
        }
      });
    }
  }

  function updateActive() {
    if (!listEl) return;
    listEl.querySelectorAll('.os-item').forEach((el, i) => {
      el.classList.toggle('os-active', i === selectedIdx);
    });
    const active = listEl.querySelector('.os-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function navigateToOrder(id) {
    if (!id) return;
    closeModal();
    const url = 'order.html?id=' + encodeURIComponent(id);
    if (typeof window.navigatePage === 'function') window.navigatePage(url);
    else window.location.href = url;
  }

  // ── Keyboard ──
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (modal) closeModal(); else openModal();
      return;
    }
    if (!modal) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length) { selectedIdx = (selectedIdx + 1) % results.length; updateActive(); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length) { selectedIdx = (selectedIdx - 1 + results.length) % results.length; updateActive(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[selectedIdx];
      if (r) navigateToOrder(r._id);
    }
  });

  // ── Trigger button in topbar ──
  function injectButton() {
    if (document.getElementById('osSearchBtn')) return;
    const host = document.querySelector('.topbar-right');
    if (!host) return;
    const btn = document.createElement('button');
    btn.id = 'osSearchBtn';
    btn.type = 'button';
    btn.className = 'notif-bell';
    btn.style.cssText = 'cursor:pointer;position:relative';
    btn.title = 'بحث عن أوردر (Ctrl+Shift+K)';
    btn.setAttribute('aria-label', 'بحث عن أوردر');
    btn.textContent = '📦';
    btn.addEventListener('click', () => { if (modal) closeModal(); else openModal(); });
    host.insertBefore(btn, host.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
  window.addEventListener('load', injectButton);
  [200, 500, 1000, 2000].forEach(d => setTimeout(injectButton, d));

  window.__b2cOrderSearch = { open: openModal, close: closeModal };
}
