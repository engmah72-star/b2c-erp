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

  // ── One-time migration: مسح أي compact/hidden state محفوظ من نسخة قديمة ──
  // الـ toggles دي اتشالت بناءً على feedback (الـ sidebar كان بيلاقي نفسه stuck في
  // icons-only mode أو مخفي بالكامل). كل مستخدم بيفتح الصفحة بعد التحديث ده
  // بيتم clear للـ keys مرة واحدة فيرجع للـ default full-width.
  try { localStorage.removeItem(LS_COMPACT); } catch(_) {}
  try { localStorage.removeItem(LS_HIDDEN); }  catch(_) {}

  // ── Defensive cleanup: force-remove أي sb-hidden/sb-peek classes متعلقة في الـ
  // DOM من قبل (لو الـ user كان عنده cached state من نسخة قديمة). الـ classes دي
  // كانت بتخلي .main {margin-right:0} يفعّل فالـ sidebar كانت بتطفو فوق الـ content.
  function clearStaleSidebarClasses() {
    try {
      document.documentElement.classList.remove('sb-hidden', 'sb-peek');
      if (document.body) document.body.classList.remove('sb-hidden', 'sb-peek');
      document.querySelectorAll('.sidenav.sb-hidden, .sidenav.sb-compact').forEach(el => {
        el.classList.remove('sb-hidden', 'sb-compact');
      });
    } catch(_) {}
  }
  clearStaleSidebarClasses();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', clearStaleSidebarClasses);
  }

  const getFavs   = () => { try { return JSON.parse(localStorage.getItem(LS_FAVORITES) || '[]'); } catch(_) { return []; } };
  const setFavs   = (a) => { try { localStorage.setItem(LS_FAVORITES, JSON.stringify(a)); } catch(_) {} };
  const getUsage  = () => { try { return JSON.parse(localStorage.getItem(LS_USAGE) || '{}'); } catch(_) { return {}; } };
  const setUsage  = (o) => { try { localStorage.setItem(LS_USAGE, JSON.stringify(o)); } catch(_) {} };

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
      + '.sb-tools-btns{display:flex;gap:var(--space-xs);align-items:center;}'
      + '.sb-tool-btn{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);'
      + 'color:rgba(255,255,255,.55);font-size:var(--fs-xs);padding:4px 8px;border-radius:6px;cursor:pointer;'
      + 'font-family:inherit;font-weight:var(--fw-semi);transition:all .15s;flex:1;line-height:var(--lh-snug);}'
      + '.sb-tool-btn:hover{color:#fff;border-color:rgba(167,139,250,.4);}'
      + '.sb-tool-btn.on{background:rgba(167,139,250,.18);color:var(--p);border-color:rgba(167,139,250,.45);}'
      // Star (favorite) — appearance only when nav-link has class
      + '.sb-star{position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:var(--fs-sm);'
      + 'opacity:0;cursor:pointer;padding:4px 5px;border-radius:4px;'
      + 'transition:opacity .15s,background .15s,color .15s;color:rgba(255,255,255,.35);z-index:2;line-height:1;}'
      + '.nav-link{position:relative;}'
      + '.nav-link:hover .sb-star{opacity:.65;}'
      + '.sb-star:hover{opacity:1!important;background:rgba(167,139,250,.18);color:#fff;}'
      + '.sb-star.on{opacity:1;color:var(--y-amber);}'
      // Usage flame badge
      + '.sb-flame{margin-inline-start:6px;font-size:var(--fs-xs);opacity:.85;}'
      // Search-hidden
      + '.nav-link.sb-hidden,.nav-group.sb-hidden{display:none!important;}'
      // No-results state
      + '.sb-noresults{padding:14px 12px;color:rgba(255,255,255,.45);font-size:var(--fs-sm);'
      + 'text-align:center;font-style:italic;}'
      // Favorites section
      + '.sb-favs-section{padding:4px 0 6px;border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:4px;}'
      + '.nav-group.sb-favs-label{color:var(--y-amber)!important;opacity:.85;}'
      // Collapsible groups
      + '.nav-group{cursor:pointer;user-select:none;}'
      + '.nav-group:hover{opacity:.75;}'
      + '.nav-group.collapsed::after{content:" ◀";font-size:8px;opacity:.5;}'
      // Active link polish — no !important (let page styles take precedence if needed)
      + '.nav-link.active{background:linear-gradient(135deg,rgba(167,139,250,.16),rgba(74,142,245,.08));}'
      // Mobile compact toolbar (يوفر مساحة عمودية للعناصر)
      + '@media (max-width:768px){'
      +   '.sb-tools{padding:6px 8px;gap:var(--space-xs);}'
      +   '.sb-search-row{padding:4px 7px;}'
      +   '.sb-search-row input{font-size:var(--fs-md);}'
      +   '.sb-tool-btn{padding:5px 6px;font-size:var(--fs-xs);}'
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
      +   '<button class="sb-tool-btn sb-reset-favs" type="button" title="مسح المفضلة">⭐ مسح المفضلة</button>'
      + '</div>';
    // Insert before .nav-scroll (so it stays even if nav-scroll is rebuilt)
    sidenav.insertBefore(tools, navScroll);

    // Search filter
    const input = tools.querySelector('input');
    input.addEventListener('input', () => filterLinks(navScroll, input.value.trim().toLowerCase()));
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { input.value = ''; filterLinks(navScroll, ''); }
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
      // a11y: مجموعة قابلة للطي = زر يُشغَّل بلوحة المفاتيح (Enter/Space)
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '0');
      g.setAttribute('aria-expanded', 'true');
      const toggle = () => {
        const collapsed = g.classList.toggle('collapsed');
        g.setAttribute('aria-expanded', String(!collapsed));
        let sib = g.nextElementSibling;
        while (sib && !sib.classList.contains('nav-group')) {
          if (sib.classList.contains('nav-link')) {
            sib.style.display = collapsed ? 'none' : '';
          }
          sib = sib.nextElementSibling;
        }
      };
      g.addEventListener('click', toggle);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          toggle();
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

    // NOTE: hide/compact toggles + floating ☰ + hover-peek أُزيلت بالكامل بعد
    // PR #819 — الـ sidebar تبقى ظاهرة دائماً (لا overlay machinery، لا overlap).

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
