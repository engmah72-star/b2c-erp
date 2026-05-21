// ════════════════════════════════════════════════════════════════════
// command-palette.js — Quick navigation via Ctrl+K / Cmd+K
// ════════════════════════════════════════════════════════════════════
// تجربة احترافية للتنقل السريع بين 30+ صفحة:
//   • Ctrl+K (أو Cmd+K) → يفتح popup بحث
//   • اكتب أي حرف → فلترة فورية على أسماء/icons الصفحات
//   • ↑↓ للتنقّل، Enter للفتح، Esc للإغلاق
//   • أقسام ذكية: المفضّلة (من smart-sidebar) + الأخيرة + الكل
//   • يحفظ آخر 8 صفحات افتُتحت في localStorage
//
// يعمل تلقائياً على كل صفحة تحمّل sidebar-config.js
// ════════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // ── Skip on guest/redirect pages ──
  const PATH = (location.pathname.split('/').pop() || '').toLowerCase();
  const SKIP = [
    'login.html', 'client-login.html', 'client-portal.html',
    'waybill.html', 'reset-sw.html', 'offline.html',
    'chat.html', 'privacy.html',
    'firebase-messaging-sw.js', 'sw.js', '',
  ];
  if (SKIP.includes(PATH)) return;

  // ── Storage ──
  const LS_RECENT = 'cp_recent_v1';
  const LS_FAVORITES = 'sb_favorites_v1'; // مشترك مع smart-sidebar.js
  const MAX_RECENT = 8;

  function getRecent() {
    try { return JSON.parse(localStorage.getItem(LS_RECENT) || '[]'); }
    catch(_) { return []; }
  }
  function setRecent(arr) {
    try { localStorage.setItem(LS_RECENT, JSON.stringify(arr.slice(0, MAX_RECENT))); }
    catch(_) {}
  }
  function getFavorites() {
    try { return JSON.parse(localStorage.getItem(LS_FAVORITES) || '[]'); }
    catch(_) { return []; }
  }

  // سجّل الصفحة الحالية كأخيرة مفتوحة
  function recordVisit() {
    if (!PATH) return;
    const recent = getRecent().filter(p => p !== PATH);
    recent.unshift(PATH);
    setRecent(recent);
  }
  recordVisit();

  // ── Get pages list (with role filter when available) ──
  function getCurrentRole() {
    return (window.AppState && window.AppState.currentRole)
        || window.currentRole
        || window.myRole
        || '';
  }
  function getUserPermPages() {
    const ap = window.AppState;
    if (ap && ap.userPerms && Array.isArray(ap.userPerms.pages)) return ap.userPerms.pages;
    if (window.userPerms && Array.isArray(window.userPerms.pages)) return window.userPerms.pages;
    return null; // unknown → show all
  }

  function isAccessible(page) {
    const role = getCurrentRole();
    if (!role) return true; // before auth ready, show everything
    const isAdm = role === 'admin' || role === 'operation_manager';
    if (isAdm) return true;
    if (page.public) return true;
    if (page.adminOnly) return false;
    const pages = getUserPermPages();
    if (!pages) return true; // perms not loaded → optimistic
    if (pages.includes('*')) return true;
    const perm = page.perm || page.file.replace('.html', '');
    return pages.includes(perm);
  }

  function getAllPages() {
    const all = window.SIDEBAR_PAGES || [];
    return all.filter(isAccessible);
  }

  // ── Build groups for display ──
  function buildGroups(query) {
    const all = getAllPages();
    const byFile = Object.fromEntries(all.map(p => [p.file, p]));
    const recent = getRecent().map(f => byFile[f]).filter(p => p && p.file !== PATH);
    const favs = getFavorites().map(f => byFile[f]).filter(p => p && p.file !== PATH);

    const q = (query || '').trim().toLowerCase();
    if (q) {
      // Search: fuzzy match label + file
      const matches = all.filter(p => {
        const lbl = (p.label || '').toLowerCase();
        const fil = (p.file || '').toLowerCase();
        return lbl.includes(q) || fil.includes(q);
      });
      return [{ section: null, items: matches }];
    }

    const usedFiles = new Set([...favs.map(p => p.file), ...recent.map(p => p.file)]);
    const others = all.filter(p => p.file !== PATH && !usedFiles.has(p.file));
    return [
      favs.length ? { section: '⭐ المفضّلة', items: favs } : null,
      recent.length ? { section: '🕐 آخر المفتوحة', items: recent.slice(0, 5) } : null,
      others.length ? { section: 'الكل', items: others } : null,
    ].filter(Boolean);
  }

  // ── Modal state ──
  let modal = null, input = null, list = null;
  let selectedIdx = 0, flatItems = [];

  function injectStyles() {
    if (document.getElementById('cp-styles')) return;
    const s = document.createElement('style');
    s.id = 'cp-styles';
    s.textContent = ''
      + '.cp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;animation:cpFade .15s}'
      + '@keyframes cpFade{from{opacity:0}to{opacity:1}}'
      + '.cp-modal{background:var(--bg2,#161b27);border:1px solid var(--line,#2a3348);border-radius:14px;width:92%;max-width:560px;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.55);overflow:hidden;animation:cpSlide .18s ease-out;direction:rtl}'
      + '@keyframes cpSlide{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}'
      + '.cp-input-row{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line,#2a3348)}'
      + '.cp-input-icon{font-size:var(--fs-2xl);opacity:.6}'
      + '.cp-input{flex:1;background:transparent;border:none;outline:none;color:var(--snow,#e8eaf0);font-family:inherit;font-size:15px;padding:4px 0;direction:rtl}'
      + '.cp-input::placeholder{color:var(--dim2,#5c6878)}'
      + '.cp-list{flex:1;overflow-y:auto;padding:6px 0;min-height:120px}'
      + '.cp-section{padding:8px 14px 4px;font-size:10.5px;color:var(--dim2,#5c6878);font-weight:800;letter-spacing:.4px}'
      + '.cp-item{display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;color:var(--snow,#e8eaf0);font-size:var(--fs-md);font-weight:600;transition:background .08s}'
      + '.cp-item:hover,.cp-item.cp-active{background:rgba(167,139,250,.18)}'
      + '.cp-item-ico{font-size:var(--fs-2xl);width:24px;text-align:center;flex-shrink:0}'
      + '.cp-item-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.cp-item-hint{font-size:var(--fs-xs);color:var(--dim2,#5c6878);opacity:.7}'
      + '.cp-empty{padding:30px 16px;text-align:center;color:var(--dim2,#5c6878);font-size:var(--fs-md)}'
      + '.cp-footer{padding:8px 14px;border-top:1px solid var(--line,#2a3348);font-size:10.5px;color:var(--dim2,#5c6878);display:flex;gap:14px;justify-content:flex-end;align-items:center;flex-wrap:wrap}'
      + '.cp-kbd{display:inline-block;background:var(--bg3,#1e2535);border:1px solid var(--line,#2a3348);border-radius:4px;padding:1px 6px;font-family:monospace;font-size:var(--fs-xs);color:var(--snow,#e8eaf0)}'
      + '@media(max-width:600px){.cp-overlay{padding-top:40px;padding-inline:10px}.cp-modal{width:100%;max-height:80vh}.cp-footer{font-size:var(--fs-xs);gap:8px}}'
    ;
    document.head.appendChild(s);
  }

  function open() {
    if (modal) return;
    injectStyles();
    modal = document.createElement('div');
    modal.className = 'cp-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'فتح صفحة');
    modal.innerHTML = ''
      + '<div class="cp-modal">'
      + '  <div class="cp-input-row">'
      + '    <span class="cp-input-icon">🔍</span>'
      + '    <input class="cp-input" type="text" placeholder="اكتب اسم الصفحة..." autocomplete="off" aria-label="بحث">'
      + '  </div>'
      + '  <div class="cp-list"></div>'
      + '  <div class="cp-footer">'
      + '    <span><span class="cp-kbd">↑↓</span> تنقّل</span>'
      + '    <span><span class="cp-kbd">↵</span> فتح</span>'
      + '    <span><span class="cp-kbd">Esc</span> إغلاق</span>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(modal);

    input = modal.querySelector('.cp-input');
    list = modal.querySelector('.cp-list');

    input.addEventListener('input', () => { selectedIdx = 0; render(input.value); });
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    render('');
    // delay focus to avoid losing it
    setTimeout(() => { try { input.focus(); } catch(_){} }, 30);
  }

  function close() {
    if (!modal) return;
    modal.remove();
    modal = null; input = null; list = null;
    selectedIdx = 0; flatItems = [];
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function render(query) {
    const groups = buildGroups(query);
    if (groups.length === 0 || groups.every(g => g.items.length === 0)) {
      list.innerHTML = '<div class="cp-empty">لا نتائج — جرّب كلمة أخرى</div>';
      flatItems = [];
      return;
    }
    flatItems = [];
    let html = '';
    groups.forEach(g => {
      if (g.section) html += '<div class="cp-section">' + g.section + '</div>';
      g.items.forEach(p => {
        const idx = flatItems.length;
        flatItems.push(p);
        html += '<div class="cp-item' + (idx === selectedIdx ? ' cp-active' : '')
              + '" data-idx="' + idx + '" data-file="' + escapeHtml(p.file) + '">'
              + '  <span class="cp-item-ico">' + (p.ico || '·') + '</span>'
              + '  <span class="cp-item-label">' + escapeHtml(p.label) + '</span>'
              + '</div>';
      });
    });
    list.innerHTML = html;
    list.querySelectorAll('.cp-item').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.file));
      el.addEventListener('mouseenter', () => {
        selectedIdx = parseInt(el.dataset.idx, 10);
        updateActive();
      });
    });
    if (selectedIdx >= flatItems.length) selectedIdx = Math.max(0, flatItems.length - 1);
    updateActive();
  }

  function updateActive() {
    if (!list) return;
    list.querySelectorAll('.cp-item').forEach((el, i) => {
      el.classList.toggle('cp-active', i === selectedIdx);
    });
    const activeEl = list.querySelector('.cp-active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function navigate(file) {
    if (!file) return;
    close();
    window.location.href = file;
  }

  // ── Global keyboard handler ──
  document.addEventListener('keydown', e => {
    // Ctrl+K / Cmd+K to toggle
    if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (modal) close(); else open();
      return;
    }
    if (!modal) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatItems.length > 0) {
        selectedIdx = (selectedIdx + 1) % flatItems.length;
        updateActive();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatItems.length > 0) {
        selectedIdx = (selectedIdx - 1 + flatItems.length) % flatItems.length;
        updateActive();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = flatItems[selectedIdx];
      if (p) navigate(p.file);
    }
  });

  // Expose for programmatic use
  window.__b2cCommandPalette = { open, close };
})();
