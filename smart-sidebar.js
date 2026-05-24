// ══════════════════════════════════════════════════════════════════
// smart-sidebar.js — Universal sidebar enhancer (v2 — survives rebuilds)
// ══════════════════════════════════════════════════════════════════
// التحدّي: بعض الصفحات (clients/index/dashboards) تستخدم
//          navScroll.innerHTML = "..." لإعادة بناء الـ items
//          ديناميكياً → كان يمسح أي toolbar داخلها.
//
// الحل (v2): الـ toolbar يُحقَن خارج .nav-scroll، كـ sibling داخل
//            .sidenav، فلا يتأثر بـ innerHTML re-renders.
//            الـ MutationObserver يعيد حقن favorites + stars + flames
//            لكل re-render.
// ══════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const PATH = (location.pathname.split('/').pop() || '').toLowerCase();
  const SKIP = ['login.html','client-login.html','client-portal.html',
                'waybill.html','chat.html','order-tracking.html',''];
  if (SKIP.includes(PATH)) return;

  // ── localStorage keys (per browser) ──
  const LS_FAVORITES = 'sb_favorites_v1';
  const LS_USAGE     = 'sb_usage_v1';
  const LS_COMPACT   = 'sb_compact_v1';
  const LS_HIDDEN    = 'sb_hidden_v1';

  const getFavs   = () => { try { return JSON.parse(localStorage.getItem(LS_FAVORITES) || '[]'); } catch(_) { return []; } };
  const setFavs   = (a) => { try { localStorage.setItem(LS_FAVORITES, JSON.stringify(a)); } catch(_) {} };
  const getUsage  = () => { try { return JSON.parse(localStorage.getItem(LS_USAGE) || '{}'); } catch(_) { return {}; } };
  const setUsage  = (o) => { try { localStorage.setItem(LS_USAGE, JSON.stringify(o)); } catch(_) {} };
  const isCompact = () => localStorage.getItem(LS_COMPACT) === '1';
  const isHidden  = () => localStorage.getItem(LS_HIDDEN) === '1';

  function pageKey(href) {
    return (href || '').split('/').pop().split('?')[0].split('#')[0].toLowerCase();
  }

  // ── Inject styles once ──
  function injectStyles() {
    if (document.getElementById('sb-smart-styles')) return;
    const s = document.createElement('style');
    s.id = 'sb-smart-styles';
    s.textContent = ''
      // Toolbar — sibling of .nav-scroll inside .sidenav (no longer nested)
      + '.sb-tools{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);'
      + 'display:flex;flex-direction:column;gap:6px;background:rgba(0,0,0,.18);flex-shrink:0;}'
      + '.sb-search-row{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.04);'
      + 'border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:5px 8px;transition:border-color .15s;}'
      + '.sb-search-row:focus-within{border-color:rgba(167,139,250,.45);background:rgba(167,139,250,.05);}'
      + '.sb-search-row input{flex:1;background:transparent;border:none;outline:none;color:inherit;'
      + 'font-family:inherit;font-size:var(--fs-base);min-width:0;padding:2px 0;}'
      + '.sb-search-row input::placeholder{color:rgba(255,255,255,.35);}'
      + '.sb-search-ico{font-size:var(--fs-sm);opacity:.55;flex-shrink:0;}'
      + '.sb-tools-btns{display:flex;gap:4px;align-items:center;}'
      + '.sb-tool-btn{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);'
      + 'color:rgba(255,255,255,.55);font-size:var(--fs-xs);padding:4px 8px;border-radius:6px;cursor:pointer;'
      + 'font-family:inherit;font-weight:var(--fw-semi);transition:all .15s;flex:1;line-height:1.3;}'
      + '.sb-tool-btn:hover{color:#fff;border-color:rgba(167,139,250,.4);}'
      + '.sb-tool-btn.on{background:rgba(167,139,250,.18);color:var(--p);border-color:rgba(167,139,250,.45);}'
      // Star (favorite) — appearance only when nav-link has class
      + '.sb-star{position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:var(--fs-sm);'
      + 'opacity:0;cursor:pointer;padding:4px 5px;border-radius:4px;'
      + 'transition:opacity .15s,background .15s,color .15s;color:rgba(255,255,255,.35);z-index:2;line-height:1;}'
      + '.nav-link{position:relative;}'
      + '.nav-link:hover .sb-star{opacity:.65;}'
      + '.sb-star:hover{opacity:1!important;background:rgba(167,139,250,.18);color:#fff;}'
      + '.sb-star.on{opacity:1;color:#fbbf24;}'
      // Usage flame badge
      + '.sb-flame{margin-inline-start:6px;font-size:var(--fs-xs);opacity:.85;}'
      // Search-hidden
      + '.nav-link.sb-hidden,.nav-group.sb-hidden{display:none!important;}'
      // No-results state
      + '.sb-noresults{padding:14px 12px;color:rgba(255,255,255,.45);font-size:var(--fs-sm);'
      + 'text-align:center;font-style:italic;}'
      // Favorites section
      + '.sb-favs-section{padding:4px 0 6px;border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:4px;}'
      + '.nav-group.sb-favs-label{color:#fbbf24!important;opacity:.85;}'
      // Collapsible groups
      + '.nav-group{cursor:pointer;user-select:none;}'
      + '.nav-group:hover{opacity:.75;}'
      + '.nav-group.collapsed::after{content:" ◀";font-size:8px;opacity:.5;}'
      // Compact mode — narrow sidebar, icons only
      + '.sidenav.sb-compact{width:64px!important;min-width:64px!important;}'
      + '.sidenav.sb-compact .nav-link{justify-content:center;padding:10px 4px!important;text-align:center;}'
      + '.sidenav.sb-compact .nav-link>:not(.nav-ico):not(.sb-star){display:none!important;}'
      + '.sidenav.sb-compact .nav-link .nav-ico{margin:0!important;font-size:var(--fs-2xl);}'
      + '.sidenav.sb-compact .nav-group{display:none;}'
      + '.sidenav.sb-compact .sb-search-row{display:none;}'
      + '.sidenav.sb-compact .sb-tools-btns{flex-direction:column;}'
      + '.sidenav.sb-compact .sb-tools-btns .sb-tool-btn{width:100%;font-size:var(--fs-tiny);padding:5px 2px;}'
      + '.sidenav.sb-compact .sb-tools-btns .sb-reset-favs{display:none;}'
      + '.sidenav.sb-compact .nav-brand-name,'
      + '.sidenav.sb-compact .nav-brand-role,'
      + '.sidenav.sb-compact .nav-user-name,'
      + '.sidenav.sb-compact .nav-user-role{display:none;}'
      + '.sidenav.sb-compact .sb-flame{display:none;}'
      + '.sidenav.sb-compact .sb-star{position:absolute;left:2px;top:2px;transform:none;font-size:8px;padding:var(--space-2xs);}'
      // Active link polish — no !important (let page styles take precedence if needed)
      + '.nav-link.active{background:linear-gradient(135deg,rgba(167,139,250,.16),rgba(74,142,245,.08));}'
      // Mobile compact toolbar (يوفر مساحة عمودية للعناصر)
      + '@media (max-width:768px){'
      +   '.sb-tools{padding:6px 8px;gap:4px;}'
      +   '.sb-search-row{padding:4px 7px;}'
      +   '.sb-search-row input{font-size:var(--fs-md);}'
      +   '.sb-tool-btn{padding:5px 6px;font-size:var(--fs-xs);}'
      +   '.sidenav.sb-compact{width:auto!important;min-width:0!important;}'
      + '}';
    document.head.appendChild(s);
  }

  // ── Track clicks for usage analytics ──
  function trackClick(href) {
    const key = pageKey(href);
    if (!key) return;
    const u = getUsage();
    u[key] = (u[key] || 0) + 1;
    setUsage(u);
  }

  function topUsed(n) {
    const u = getUsage();
    return Object.entries(u).sort((a,b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  }

  // ── Apply compact mode class to sidenav ──
  function applyCompact(sidenav, on) {
    if (!sidenav) return;
    sidenav.classList.toggle('sb-compact', on);
    const btn = sidenav.querySelector('.sb-compact-toggle');
    if (btn) {
      btn.classList.toggle('on', on);
      btn.textContent = on ? '📐 موسّع' : '📌 مضغوط';
    }
  }

  // ── Apply hidden mode (full hide, desktop only) ──
  // CSS in shared.css handles the actual hide via @media(min-width:769px).
  // On mobile, .mob-open + the default slide-off behavior take precedence,
  // so toggling this class on mobile is a no-op visually (safe).
  function applyHidden(sidenav, on) {
    if (!sidenav) return;
    sidenav.classList.toggle('sb-hidden', on);
    document.body.classList.toggle('sb-hidden', on);
    const btn = sidenav.querySelector('.sb-hide-toggle');
    if (btn) btn.textContent = on ? '👁️‍🗨️ إظهار' : '👁️ إخفاء';
  }

  // ── Floating reveal button (created once, lives on document.body) ──
  function ensureShowButton(sidenav) {
    if (document.querySelector('.sb-show-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'sb-show-btn';
    btn.type = 'button';
    btn.title = 'إظهار القائمة';
    btn.setAttribute('aria-label', 'إظهار القائمة');
    btn.textContent = '☰';
    btn.addEventListener('click', () => {
      try { localStorage.setItem(LS_HIDDEN, '0'); } catch(_) {}
      document.body.classList.remove('sb-peek');
      applyHidden(sidenav, false);
    });
    document.body.appendChild(btn);
  }

  // ── Hover-peek (Notion-style) — show sidebar as overlay when mouse
  // ── approaches the right edge (RTL); hide again on mouseleave ──
  function setupHoverPeek(sidenav) {
    if (document.querySelector('.sb-hot-zone')) return;

    const hot = document.createElement('div');
    hot.className = 'sb-hot-zone';
    hot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(hot);

    let hideTimer = null;
    const HIDE_DELAY = 220; // ms — pause before re-hiding to avoid flicker

    const peekOn  = () => {
      clearTimeout(hideTimer);
      // Only peek while persistently hidden — otherwise sidebar is already visible
      if (!document.body.classList.contains('sb-hidden')) return;
      document.body.classList.add('sb-peek');
    };

    const peekOff = (immediate) => {
      clearTimeout(hideTimer);
      // Don't hide while a focused input inside the sidebar is active
      // (e.g., user typing in the search box)
      if (sidenav.contains(document.activeElement)) return;
      const delay = immediate ? 0 : HIDE_DELAY;
      hideTimer = setTimeout(() => {
        document.body.classList.remove('sb-peek');
      }, delay);
    };

    hot.addEventListener('mouseenter', peekOn);
    sidenav.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    sidenav.addEventListener('mouseleave', () => peekOff(false));
    // Clicking a nav link → navigate; clear peek immediately so the new page
    // doesn't briefly render with the overlay still on
    sidenav.addEventListener('click', (e) => {
      const link = e.target.closest('a.nav-link');
      if (link) peekOff(true);
    });
  }

  // ── Build toolbar — INSERTED BETWEEN .nav-brand AND .nav-scroll ──
  // ── (i.e., as a sibling INSIDE .sidenav, NOT inside .nav-scroll) ──
  function buildToolbar(sidenav, navScroll) {
    if (sidenav.querySelector('.sb-tools')) return;
    const tools = document.createElement('div');
    tools.className = 'sb-tools';
    tools.innerHTML = ''
      + '<div class="sb-search-row">'
      +   '<span class="sb-search-ico">🔍</span>'
      +   '<input type="text" placeholder="ابحث في القائمة..." aria-label="بحث">'
      + '</div>'
      + '<div class="sb-tools-btns">'
      +   '<button class="sb-tool-btn sb-compact-toggle" type="button" title="وضع مضغوط">📌 مضغوط</button>'
      +   '<button class="sb-tool-btn sb-hide-toggle" type="button" title="إخفاء القائمة">👁️ إخفاء</button>'
      +   '<button class="sb-tool-btn sb-reset-favs" type="button" title="مسح المفضلة">⭐ مسح</button>'
      + '</div>';
    // Insert before .nav-scroll (so it stays even if nav-scroll is rebuilt)
    sidenav.insertBefore(tools, navScroll);

    // Search filter
    const input = tools.querySelector('input');
    input.addEventListener('input', () => filterLinks(navScroll, input.value.trim().toLowerCase()));
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { input.value = ''; filterLinks(navScroll, ''); }
    });

    // Compact toggle
    const compactBtn = tools.querySelector('.sb-compact-toggle');
    applyCompact(sidenav, isCompact());
    compactBtn.addEventListener('click', () => {
      const next = !isCompact();
      try { localStorage.setItem(LS_COMPACT, next ? '1' : '0'); } catch(_) {}
      applyCompact(sidenav, next);
    });

    // Hide toggle (desktop full-hide; hover-peek + floating ☰ reveal it)
    const hideBtn = tools.querySelector('.sb-hide-toggle');
    applyHidden(sidenav, isHidden());
    hideBtn.addEventListener('click', () => {
      const next = !isHidden();
      try { localStorage.setItem(LS_HIDDEN, next ? '1' : '0'); } catch(_) {}
      // Reset peek state so the hide/show transition is clean
      document.body.classList.remove('sb-peek');
      applyHidden(sidenav, next);
    });

    // Reset favorites
    tools.querySelector('.sb-reset-favs').addEventListener('click', () => {
      if (!confirm('مسح كل المفضّلات؟')) return;
      setFavs([]);
      enhanceLinks(navScroll);
    });
  }

  // ── Filter nav links by search query ──
  function filterLinks(navScroll, q) {
    let visible = 0;
    navScroll.querySelectorAll('.nav-link').forEach(a => {
      if (a.classList.contains('sb-fav-clone')) return; // skip favorites clones in search
      if (!q) { a.classList.remove('sb-hidden'); visible++; return; }
      const txt = (a.textContent || '').toLowerCase();
      const hit = txt.includes(q);
      a.classList.toggle('sb-hidden', !hit);
      if (hit) visible++;
    });
    // Hide group headers if all their items are hidden
    navScroll.querySelectorAll('.nav-group').forEach(g => {
      if (g.classList.contains('sb-favs-label')) { g.classList.remove('sb-hidden'); return; }
      let sib = g.nextElementSibling, anyVisible = false;
      while (sib && !sib.classList.contains('nav-group')) {
        if (sib.classList.contains('nav-link') && !sib.classList.contains('sb-hidden')) anyVisible = true;
        sib = sib.nextElementSibling;
      }
      g.classList.toggle('sb-hidden', !anyVisible);
    });
    // No-results message
    let nores = navScroll.querySelector('.sb-noresults');
    if (q && visible === 0) {
      if (!nores) {
        nores = document.createElement('div');
        nores.className = 'sb-noresults';
        nores.textContent = '— لا نتائج —';
        navScroll.appendChild(nores);
      }
    } else if (nores) {
      nores.remove();
    }
  }

  // ── Add star + flame to each link, plus favorites section at top ──
  function enhanceLinks(navScroll) {
    const favs = getFavs();
    const top3 = topUsed(3);

    navScroll.querySelectorAll('.nav-link').forEach(a => {
      const key = pageKey(a.getAttribute('href') || '');
      if (!key) return;

      // Click tracker (once per link)
      if (!a.dataset.sbClickBound) {
        a.dataset.sbClickBound = '1';
        a.addEventListener('click', () => trackClick(a.getAttribute('href') || ''));
      }

      // Star — fav-clones don't get a (re-bindable) star
      if (!a.classList.contains('sb-fav-clone')) {
        let star = a.querySelector('.sb-star');
        if (!star) {
          star = document.createElement('span');
          star.className = 'sb-star';
          star.title = 'إضافة إلى المفضلة';
          star.textContent = '⭐';
          star.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const cur = getFavs();
            const idx = cur.indexOf(key);
            if (idx >= 0) cur.splice(idx, 1); else cur.push(key);
            setFavs(cur);
            enhanceLinks(navScroll);
          });
          a.appendChild(star);
        }
        star.classList.toggle('on', favs.includes(key));
      }

      // Flame
      const existingFlame = a.querySelector('.sb-flame');
      if (top3.includes(key) && !existingFlame) {
        const flame = document.createElement('span');
        flame.className = 'sb-flame';
        flame.textContent = '🔥';
        flame.title = 'من الأكثر استخداماً';
        a.appendChild(flame);
      } else if (!top3.includes(key) && existingFlame) {
        existingFlame.remove();
      }
    });

    // Rebuild favorites section at top of nav-scroll
    const oldSection = navScroll.querySelector('.sb-favs-section');
    if (oldSection) oldSection.remove();
    if (favs.length) {
      const section = document.createElement('div');
      section.className = 'sb-favs-section';
      const label = document.createElement('div');
      label.className = 'nav-group sb-favs-label';
      label.textContent = '⭐ المفضّلة';
      section.appendChild(label);
      favs.forEach(key => {
        const original = navScroll.querySelector(`.nav-link[href$="${key}"]:not(.sb-fav-clone)`);
        if (!original) return;
        const clone = original.cloneNode(true);
        clone.classList.add('sb-fav-clone');
        // الـ clone هو اختصار — الـ active state تبقى فقط على الأصلي
        // (لتفادي ظهور highlight مكرّر للصفحة الحالية)
        clone.classList.remove('active');
        // تنظيف بصري: star/flame تظهر فقط على الأصلي
        clone.querySelectorAll('.sb-star, .sb-flame').forEach(el => el.remove());
        section.appendChild(clone);
      });
      navScroll.insertBefore(section, navScroll.firstChild);
    }
  }

  // ── Make .nav-group elements collapsible (idempotent) ──
  function bindCollapsibleGroups(navScroll) {
    navScroll.querySelectorAll('.nav-group').forEach(g => {
      if (g.dataset.sbCollapseBound) return;
      g.dataset.sbCollapseBound = '1';
      g.addEventListener('click', () => {
        g.classList.toggle('collapsed');
        let sib = g.nextElementSibling;
        while (sib && !sib.classList.contains('nav-group')) {
          if (sib.classList.contains('nav-link')) {
            sib.style.display = g.classList.contains('collapsed') ? 'none' : '';
          }
          sib = sib.nextElementSibling;
        }
      });
    });
  }

  // ── Initialize once we have a .sidenav + .nav-scroll ──
  function init() {
    injectStyles();
    const sidenav = document.querySelector('aside.sidenav, .sidenav');
    if (!sidenav) return; // page without sidebar
    let navScroll = sidenav.querySelector('.nav-scroll, #nav-links');
    if (!navScroll) {
      // Some pages might create nav-scroll later — wait briefly
      const obs0 = new MutationObserver(() => {
        navScroll = sidenav.querySelector('.nav-scroll, #nav-links');
        if (navScroll) { obs0.disconnect(); attach(sidenav, navScroll); }
      });
      obs0.observe(sidenav, { childList: true, subtree: true });
      setTimeout(() => obs0.disconnect(), 6000);
      return;
    }
    attach(sidenav, navScroll);
  }

  function attach(sidenav, navScroll) {
    // 1) Toolbar — outside .nav-scroll so it survives innerHTML rebuilds
    buildToolbar(sidenav, navScroll);

    // 1b) Floating reveal button on document.body (needed while sidebar hidden)
    ensureShowButton(sidenav);

    // 1c) Hover-peek — sidebar reveals as overlay when mouse hits right edge
    setupHoverPeek(sidenav);

    // 2) First enhancement
    enhanceLinks(navScroll);
    bindCollapsibleGroups(navScroll);

    // 3) Watch for re-renders of .nav-scroll content (clients/index/dashboards)
    //    استخدام disconnect/reconnect + debounce لمنع حلقة الـ observer
    //    (التعديلات اللي أعملها داخل enhanceLinks كانت تطلق الـ observer
    //     مرة تانية → loop → بطء في كل الصفحات).
    let scheduled = false;
    let obs;
    function runEnhance() {
      if (!obs) return;
      obs.disconnect();
      try {
        enhanceLinks(navScroll);
        bindCollapsibleGroups(navScroll);
      } finally {
        obs.observe(navScroll, { childList: true });
      }
      scheduled = false;
    }
    obs = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      // debounce — لو page بتعمل innerHTML متكرر، نشتغل مرة واحدة بعد ما تستقر
      setTimeout(runEnhance, 80);
    });
    obs.observe(navScroll, { childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
