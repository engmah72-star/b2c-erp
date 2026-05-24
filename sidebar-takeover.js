// ════════════════════════════════════════════════════════════════════
// Business2Card ERP — Sidebar Takeover (Phase 1)
// ════════════════════════════════════════════════════════════════════
//
// تحويل الـ sidebar إلى shell يحوي محتوى الصفحات داخلياً (slide takeover)
// بدل التنقّل لصفحة جديدة بـ full reload. الـ god pages تُحمَّل كـ iframes
// (لا تعديل عليها) عبر panel-host مدرج داخل .sidenav بجانب #nav-links.
//
// API: window.B2CSidebar.openPanel(file) / .closePanel() / .isOpen()
//
// Feature flag: window.B2C_TAKEOVER_ENABLED
// Deny-list:    window.B2C_TAKEOVER_SKIP (login/portal/print/...)
// Hash sync:    #p=<file> ↔ history.pushState/popstate
//
// Phase 1: كل nav links مفعّلة افتراضياً، إلا اللي في TAKEOVER_SKIP أو
//          cfg.takeover === false. iframes تُحمَّل بـ ?embed=1 → CSS rules
//          في shared.css تخفي الـ topbar/sidenav/mob-nav المكررة جوّاها.
//          + Loading skeleton + Error UI (open in new tab fallback) +
//          Page title extraction من iframe (same-origin).
// ════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── Skip لو جوا iframe (الـ takeover للـ top window فقط) ──
  // sidebar-config.js يُحمَّل في كل صفحة بما فيها الـ ?embed=1 frames.
  // بدون الـ check ده هيحصل nested takeover (panel-host جوا panel-host).
  try { if (window.self !== window.top) return; } catch(_) { return; }

  // ── Config ──
  // Mobile detection: LRU=1 على mobile لتوفير الـ RAM (memory constraint).
  // Override: localStorage.B2C_PANEL_CACHE_MAX يفوز على الـ defaults.
  const IS_MOBILE = (() => {
    try { return window.matchMedia && window.matchMedia('(max-width:768px)').matches; }
    catch(_) { return false; }
  })();
  const MAX_CACHE = (() => {
    try {
      const ov = parseInt(localStorage.B2C_PANEL_CACHE_MAX, 10);
      if (ov > 0) return ov;
    } catch(_) {}
    return IS_MOBILE ? 1 : 3;
  })();
  const HASH_PREFIX = '#p=';

  // ── State ──
  let host = null;          // .sb-panel-host element
  let head = null;          // .sb-panel-head element
  let titleEl = null;       // .sb-panel-title element
  let framesWrap = null;    // .sb-panel-frames element
  let skeletonEl = null;    // .sb-panel-skeleton (loading hint)
  let errorEl = null;       // .sb-panel-error (fallback on load failure)
  let skeletonTimer = 0;    // setTimeout id للـ delay-reveal
  let currentFile = '';     // file currently shown
  let lastFocusEl = null;   // element focused before open (restore on close)
  const cache = new Map();  // file → { iframe, lastUsed, loaded, errored }

  // ── Helpers ──
  function pageLabel(file) {
    const list = window.SIDEBAR_PAGES || [];
    const cfg = list.find(p => p.file === file);
    return cfg ? cfg.label : file;
  }

  // Phase 1: deny-list — كل الـ nav items مفعّلة، إلا اللي في SKIP أو takeover:false
  function isTakeoverFile(file) {
    if (!window.B2C_TAKEOVER_ENABLED) return false;
    if (!file) return false;
    const skip = window.B2C_TAKEOVER_SKIP || [];
    if (skip.indexOf(file) >= 0) return false;
    const list = window.SIDEBAR_PAGES || [];
    const cfg = list.find(p => p.file === file);
    if (!cfg) return false;                   // الـ takeover للـ nav items فقط
    if (cfg.takeover === false) return false; // explicit opt-out
    return true;
  }

  function hashFile() {
    const h = location.hash || '';
    if (!h.startsWith(HASH_PREFIX)) return '';
    return decodeURIComponent(h.slice(HASH_PREFIX.length));
  }

  // ── DOM ──
  function ensureHost() {
    if (host) return host;
    const sidenav = document.querySelector('.sidenav');
    if (!sidenav) return null;

    host = document.createElement('div');
    host.className = 'sb-panel-host';
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'لوحة المحتوى');
    host.setAttribute('aria-hidden', 'true');
    host.hidden = true;

    head = document.createElement('div');
    head.className = 'sb-panel-head';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'sb-back-btn';
    backBtn.setAttribute('aria-label', 'رجوع للقائمة');
    backBtn.textContent = '←';
    backBtn.addEventListener('click', () => closePanel());

    titleEl = document.createElement('div');
    titleEl.className = 'sb-panel-title';

    head.appendChild(backBtn);
    head.appendChild(titleEl);

    framesWrap = document.createElement('div');
    framesWrap.className = 'sb-panel-frames';

    // Loading skeleton + Error — overlay فوق الـ frames (position:relative parent)
    skeletonEl = document.createElement('div');
    skeletonEl.className = 'sb-panel-skeleton';
    skeletonEl.hidden = true;
    skeletonEl.innerHTML = '<div class="sb-skel-bar"></div>' +
                           '<div class="sb-skel-bar"></div>' +
                           '<div class="sb-skel-bar"></div>';

    errorEl = document.createElement('div');
    errorEl.className = 'sb-panel-error';
    errorEl.hidden = true;

    framesWrap.appendChild(skeletonEl);
    framesWrap.appendChild(errorEl);

    host.appendChild(head);
    host.appendChild(framesWrap);

    // الـ panel-host بعد nav-scroll (sibling)؛ nav-brand فوق، nav-foot تحت يفضلوا
    const navScroll = sidenav.querySelector('.nav-scroll');
    if (navScroll && navScroll.nextSibling) {
      sidenav.insertBefore(host, navScroll.nextSibling);
    } else {
      sidenav.appendChild(host);
    }

    return host;
  }

  function getOrCreateFrame(file) {
    let entry = cache.get(file);
    if (entry) {
      entry.lastUsed = Date.now();
      return entry;
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'sb-panel-frame';
    iframe.setAttribute('title', pageLabel(file));
    iframe.setAttribute('loading', 'lazy');
    // ?embed=1 → html.embed-mode rules تخفي الـ topbar/sidenav الداخلي (sidebar-config.js)
    const sep = file.includes('?') ? '&' : '?';
    const src = file + sep + 'embed=1';
    iframe.src = src;
    iframe.dataset.sbFile = file;
    framesWrap.appendChild(iframe);

    const e = { iframe, lastUsed: Date.now(), loaded: false, errored: false };
    cache.set(file, e);

    iframe.addEventListener('load', () => onFrameLoad(file, iframe), { once: false });
    iframe.addEventListener('error', () => onFrameError(file), { once: false });

    evictIfNeeded();
    return e;
  }

  function onFrameLoad(file, iframe) {
    const e = cache.get(file);
    if (!e) return;
    e.loaded = true;
    e.errored = false;
    // اخفي skeleton لو الـ file ده هو الـ active
    if (file === currentFile) hideSkeleton();
    // استخرج الـ title الحقيقي من الـ iframe (same-origin)
    try {
      const doc = iframe.contentDocument;
      const t = doc && doc.title ? doc.title.trim() : '';
      if (t && file === currentFile && titleEl) {
        // النص بصيغة "Business2Card — X" → خد X بس لو موجود
        const clean = t.split('—').slice(-1)[0].trim() || t;
        titleEl.textContent = clean || pageLabel(file);
      }
    } catch(_) {}
  }

  function onFrameError(file) {
    const e = cache.get(file);
    if (!e) return;
    e.errored = true;
    if (file === currentFile) showError(file);
  }

  function evictIfNeeded() {
    if (cache.size <= MAX_CACHE) return;
    // أقدم non-current iframe → tear down (about:blank + remove)
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (k === currentFile) continue;
      if (v.lastUsed < oldestTime) { oldestTime = v.lastUsed; oldestKey = k; }
    }
    if (!oldestKey) return;
    const e = cache.get(oldestKey);
    try { e.iframe.src = 'about:blank'; } catch(_) {}
    if (e.iframe.parentNode) e.iframe.parentNode.removeChild(e.iframe);
    cache.delete(oldestKey);
  }

  function showFrame(file) {
    for (const [k, v] of cache) {
      v.iframe.style.display = (k === file) ? 'block' : 'none';
    }
  }

  // ── Skeleton (delay-reveal 120ms) ──
  function scheduleSkeleton() {
    if (skeletonTimer) { clearTimeout(skeletonTimer); skeletonTimer = 0; }
    skeletonTimer = setTimeout(() => {
      if (skeletonEl) skeletonEl.hidden = false;
      skeletonTimer = 0;
    }, 120);
  }
  function hideSkeleton() {
    if (skeletonTimer) { clearTimeout(skeletonTimer); skeletonTimer = 0; }
    if (skeletonEl) skeletonEl.hidden = true;
  }

  // ── Error UI ──
  function showError(file) {
    hideSkeleton();
    if (!errorEl) return;
    errorEl.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'sb-err-msg';
    msg.textContent = '⚠ فشل تحميل ' + pageLabel(file);
    const link = document.createElement('a');
    link.className = 'sb-err-link';
    link.href = file;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'فتح في tab جديد';
    errorEl.appendChild(msg);
    errorEl.appendChild(link);
    errorEl.hidden = false;
  }
  function hideError() {
    if (errorEl) errorEl.hidden = true;
  }

  // ── Public API ──
  function openPanel(file) {
    if (!file) return false;
    // Re-guard: تأكد إن المستخدم ليه صلاحية يفتح الصفحة دي
    const userData = window.__B2C_USER_DATA__ || null;
    if (userData && window.B2CSidebar && typeof window.B2CSidebar.guard === 'function') {
      // الـ guard الموجود يـ redirect لو رفض. هنا بدل ما نـ redirect، نرفض الفتح.
      const list = window.SIDEBAR_PAGES || [];
      const cfg = list.find(p => p.file === file);
      if (cfg && !cfg.public) {
        const role = userData.role || 'customer_service';
        const isAdmin = role === 'admin' || role === 'operation_manager';
        if (!isAdmin) {
          if (cfg.adminOnly) {
            console.warn('[sidebar-takeover] adminOnly page denied for', file);
            return false;
          }
          const perms = userData.permissions || {};
          const pages = perms.pages || [];
          const ok = pages.includes('*') || pages.includes(cfg.perm || '') ||
                     (cfg.perm === 'clients' && perms.canViewClients === true);
          if (!ok) {
            console.warn('[sidebar-takeover] permission denied for', file);
            return false;
          }
        }
      }
    }

    ensureHost();
    if (!host) return false;

    // احفظ الـ focus الحالي للـ restore على الـ close (قبل أي DOM change)
    if (!isOpen()) lastFocusEl = document.activeElement;

    currentFile = file;
    const entry = getOrCreateFrame(file);
    showFrame(file);

    titleEl.textContent = pageLabel(file);
    host.hidden = false;
    host.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sb-takeover');

    // Skeleton / Error state
    hideError();
    if (entry.errored) {
      showError(file);
    } else if (entry.loaded) {
      hideSkeleton();
    } else {
      scheduleSkeleton();
    }

    // Re-paint active state على nav-links
    repaintActive(file);

    // Hash sync (لو الـ hash مش متطابق بالفعل)
    if (hashFile() !== file) {
      try { history.pushState({ sbPanel: file }, '', HASH_PREFIX + encodeURIComponent(file)); }
      catch(_) { location.hash = HASH_PREFIX + encodeURIComponent(file); }
    }

    // Mirror title إلى document.title (restored on close)
    if (!document.body.dataset.sbOrigTitle) {
      document.body.dataset.sbOrigTitle = document.title;
    }
    try { document.title = pageLabel(file) + ' — Business2Card'; } catch(_) {}

    return true;
  }

  function closePanel() {
    if (!isOpen()) return false;

    hideSkeleton();
    hideError();
    host.hidden = true;
    host.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sb-takeover');
    currentFile = '';
    repaintActive('');

    // Restore document.title
    const orig = document.body.dataset.sbOrigTitle;
    if (orig) {
      try { document.title = orig; } catch(_) {}
      delete document.body.dataset.sbOrigTitle;
    }

    // امسح الـ hash لو الـ hash لسه بتاعنا
    if (hashFile()) {
      if (history.state && history.state.sbPanel) {
        try { history.back(); }
        catch(_) {
          try { history.replaceState({}, '', location.pathname + location.search); }
          catch(__) {}
        }
      } else {
        try { history.replaceState({}, '', location.pathname + location.search); }
        catch(_) {}
      }
    }

    // Restore focus
    if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
      try { lastFocusEl.focus(); } catch(_) {}
    }
    lastFocusEl = null;
    return true;
  }

  function isOpen() {
    return !!host && !host.hidden;
  }

  // M2: re-paint active على nav-link (sidebar) و mob-nav-item (bottom-tab) معاً.
  function repaintActive(file) {
    const links = document.querySelectorAll('.nav-link, .mob-nav-item');
    const fallback = (location.pathname.split('/').pop() || '').replace(/\?.*/, '');
    const target = file || fallback;
    links.forEach(a => {
      const href = (a.getAttribute('href') || '').split('?')[0].split('#')[0];
      a.classList.toggle('active', href === target);
    });
  }

  // ── Click interception (delegated على document — يصمد لـ re-renders) ──
  // M2: يلتقط nav-link (sidebar) و mob-nav-item (bottom-tab) معاً.
  function onDocClick(e) {
    if (!window.B2C_TAKEOVER_ENABLED) return;
    // ignore middle-click / cmd-click / ctrl-click → بيفتح في tab جديد
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a.nav-link, a.mob-nav-item');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const file = href.split('?')[0].split('#')[0];
    if (!file) return;
    if (!isTakeoverFile(file)) return;
    e.preventDefault();
    openPanel(file);
  }

  // ── Hash / popstate ──
  function syncFromHash() {
    if (!window.B2C_TAKEOVER_ENABLED) return;
    const f = hashFile();
    if (f && isTakeoverFile(f)) {
      if (f !== currentFile) openPanel(f);
    } else if (isOpen()) {
      // الـ hash اتشال (browser back) → اقفل
      closePanel();
    }
  }

  function onKey(e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      // ignore لو الـ active element جواه data-sb-stop-esc
      const ae = document.activeElement;
      if (ae && ae.closest && ae.closest('[data-sb-stop-esc]')) return;
      e.preventDefault();
      closePanel();
    }
  }

  // ── Init ──
  function init() {
    document.addEventListener('click', onDocClick, true);
    window.addEventListener('popstate', syncFromHash);
    window.addEventListener('hashchange', syncFromHash);
    document.addEventListener('keydown', onKey);

    // Deep-link على الـ load: لو الـ hash فيه #p=<file> افتحه
    if (hashFile()) {
      // أجّل لما الـ sidebar تتبني (sidebar.js عادةً يـ build بعد auth)
      const tryOpen = () => {
        const f = hashFile();
        if (f && isTakeoverFile(f)) openPanel(f);
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryOpen, { once: true });
      } else {
        // wait one tick للسماح للـ build بإلحاق nav-links
        setTimeout(tryOpen, 0);
      }
    }
  }

  // ── Expose ──
  if (!window.B2CSidebar) window.B2CSidebar = {};
  window.B2CSidebar.openPanel  = openPanel;
  window.B2CSidebar.closePanel = closePanel;
  window.B2CSidebar.isOpen     = isOpen;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
