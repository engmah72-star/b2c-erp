// ══════════════════════════════════════════════════════════════════
// smart-sidebar.js — Universal sidebar enhancer
// ══════════════════════════════════════════════════════════════════
// يضيف لكل sidebar في النظام:
//   • شريط أدوات أعلى (بحث + تبديل الوضع المضغوط)
//   • نجمة "مفضّلة" بجوار كل عنصر — يربط في أعلى القائمة
//   • تتبع الاستخدام — أيقونة 🔥 على أكثر 3 صفحات استخداماً
//   • طي/فتح المجموعات بضغطة على العنوان
//   • وضع مضغوط (أيقونات فقط) — يحفظ مساحة الشاشة
//   • تحسينات بصرية: hover animations، active state، gradient
//
// مبدأ التشغيل: لا يستبدل الـ HTML الموجود، فقط يحسّنه.
// يستخدم MutationObserver للصفحات التي تبني sidebar ديناميكياً.
// كل الإعدادات في localStorage — مستقلة لكل مستخدم.
// ══════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const PATH = (location.pathname.split('/').pop() || '').toLowerCase();
  const SKIP = ['login.html','client-login.html','client-portal.html',
                'waybill.html','chat.html','whatsapp.html','order-tracking.html',''];
  if (SKIP.includes(PATH)) return;

  // ── localStorage keys (per browser) ──
  const LS_FAVORITES = 'sb_favorites_v1';
  const LS_USAGE     = 'sb_usage_v1';
  const LS_COMPACT   = 'sb_compact_v1';

  const getFavs   = () => JSON.parse(localStorage.getItem(LS_FAVORITES) || '[]');
  const setFavs   = (arr) => localStorage.setItem(LS_FAVORITES, JSON.stringify(arr));
  const getUsage  = () => JSON.parse(localStorage.getItem(LS_USAGE) || '{}');
  const setUsage  = (obj) => localStorage.setItem(LS_USAGE, JSON.stringify(obj));
  const isCompact = () => localStorage.getItem(LS_COMPACT) === '1';

  // ── Inject styles once ──
  function injectStyles() {
    if (document.getElementById('sb-smart-styles')) return;
    const s = document.createElement('style');
    s.id = 'sb-smart-styles';
    s.textContent = ''
      // Toolbar at top of sidebar
      + '.sb-tools{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:6px;display:flex;flex-direction:column;gap:6px;position:sticky;top:0;background:inherit;z-index:5;}'
      + '.sb-search-row{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:5px 8px;transition:border-color .15s;}'
      + '.sb-search-row:focus-within{border-color:rgba(167,139,250,.45);background:rgba(167,139,250,.05);}'
      + '.sb-search-row input{flex:1;background:transparent;border:none;outline:none;color:inherit;font-family:inherit;font-size:12px;min-width:0;padding:2px 0;}'
      + '.sb-search-row input::placeholder{color:rgba(255,255,255,.35);}'
      + '.sb-search-ico{font-size:11px;opacity:.55;}'
      + '.sb-tools-btns{display:flex;gap:4px;align-items:center;}'
      + '.sb-tool-btn{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.55);font-size:10px;padding:4px 8px;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:600;transition:all .15s;flex:1;}'
      + '.sb-tool-btn:hover{color:#fff;border-color:rgba(167,139,250,.4);}'
      + '.sb-tool-btn.on{background:rgba(167,139,250,.18);color:#a78bfa;border-color:rgba(167,139,250,.45);}'
      // Star (favorite) button on nav-link
      + '.nav-link{position:relative;}'
      + '.sb-star{position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:11px;opacity:0;cursor:pointer;padding:4px 6px;border-radius:4px;transition:opacity .15s,background .15s,color .15s;color:rgba(255,255,255,.35);z-index:2;line-height:1;}'
      + '.nav-link:hover .sb-star{opacity:.7;}'
      + '.sb-star:hover{opacity:1!important;background:rgba(167,139,250,.18);color:#fff;}'
      + '.sb-star.on{opacity:1;color:#fbbf24;}'
      // Usage flame badge
      + '.sb-flame{margin-left:6px;font-size:10px;opacity:.8;}'
      // Hidden via search
      + '.nav-link.sb-hidden,.nav-group.sb-hidden{display:none!important;}'
      // No-results state
      + '.sb-noresults{padding:16px 12px;color:rgba(255,255,255,.45);font-size:11px;text-align:center;font-style:italic;}'
      // Favorites section
      + '.sb-favs-section{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04);margin-bottom:6px;}'
      + '.nav-group.sb-favs-label{color:#fbbf24!important;opacity:.85;}'
      // Collapsible groups (click to collapse)
      + '.nav-group{cursor:pointer;user-select:none;display:flex;align-items:center;gap:4px;transition:opacity .15s;}'
      + '.nav-group:hover{opacity:.7;}'
      + '.nav-group::before{content:"▼";font-size:8px;opacity:.5;transition:transform .2s;}'
      + '.nav-group.collapsed::before{transform:rotate(-90deg);}'
      // Compact mode — icons only
      + '.sidenav.sb-compact{width:62px!important;min-width:62px!important;}'
      + '.sidenav.sb-compact .nav-link{justify-content:center;padding:10px 4px!important;}'
      + '.sidenav.sb-compact .nav-link>:not(.nav-ico):not(.sb-star){display:none;}'
      + '.sidenav.sb-compact .nav-group,.sidenav.sb-compact .sb-search-row,.sidenav.sb-compact .sb-tools-btns>button:not(.sb-compact-toggle){display:none;}'
      + '.sidenav.sb-compact .nav-brand-name,.sidenav.sb-compact .nav-brand-role,.sidenav.sb-compact .nav-user-name,.sidenav.sb-compact .nav-user-role{display:none;}'
      + '.sidenav.sb-compact .nav-link.active{background:linear-gradient(135deg,rgba(167,139,250,.18),rgba(74,142,245,.12));}'
      + '.sidenav.sb-compact .sb-star{position:absolute;left:2px;top:2px;}'
      + '.sidenav.sb-compact .sb-flame{display:none;}'
      // Polish active state
      + '.nav-link.active{background:linear-gradient(135deg,rgba(167,139,250,.14),rgba(74,142,245,.08))!important;border-right:2px solid #a78bfa;}'
      + '@media(max-width:768px){.sidenav.sb-compact{transform:none!important;width:auto!important;}}';
    document.head.appendChild(s);
  }

  function pageKey(href) {
    return (href || '').split('/').pop().split('?')[0].split('#')[0].toLowerCase();
  }

  // ── Track clicks on nav links ──
  function trackClick(href) {
    const key = pageKey(href);
    if (!key) return;
    const u = getUsage();
    u[key] = (u[key] || 0) + 1;
    setUsage(u);
  }

  // ── Get top N most-used pages ──
  function topUsed(n) {
    const u = getUsage();
    return Object.entries(u).sort((a,b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  }

  // ── Build toolbar (search + buttons) ──
  function buildToolbar(navScroll) {
    if (navScroll.querySelector('.sb-tools')) return;
    const tools = document.createElement('div');
    tools.className = 'sb-tools';
    tools.innerHTML = ''
      + '<div class="sb-search-row">'
      +   '<span class="sb-search-ico">🔍</span>'
      +   '<input type="text" placeholder="ابحث في القائمة..." aria-label="بحث">'
      + '</div>'
      + '<div class="sb-tools-btns">'
      +   '<button class="sb-tool-btn sb-compact-toggle" type="button" title="وضع مضغوط">📌 مضغوط</button>'
      +   '<button class="sb-tool-btn sb-reset-favs" type="button" title="مسح المفضلة">⭐ مسح</button>'
      + '</div>';
    navScroll.insertBefore(tools, navScroll.firstChild);

    // Search filter
    const input = tools.querySelector('input');
    input.addEventListener('input', () => filterLinks(navScroll, input.value.trim().toLowerCase()));
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.value = ''; filterLinks(navScroll, ''); }});

    // Compact toggle
    const compactBtn = tools.querySelector('.sb-compact-toggle');
    const sidenav = document.querySelector('.sidenav');
    const applyCompact = (on) => {
      if (sidenav) sidenav.classList.toggle('sb-compact', on);
      compactBtn.classList.toggle('on', on);
      compactBtn.textContent = on ? '📐 موسّع' : '📌 مضغوط';
    };
    applyCompact(isCompact());
    compactBtn.addEventListener('click', () => {
      const next = !isCompact();
      localStorage.setItem(LS_COMPACT, next ? '1' : '0');
      applyCompact(next);
    });

    // Reset favorites
    tools.querySelector('.sb-reset-favs').addEventListener('click', () => {
      if (!confirm('مسح كل المفضّلات؟')) return;
      setFavs([]);
      enhanceLinks(navScroll);
    });
  }

  // ── Filter visible links by search query ──
  function filterLinks(navScroll, q) {
    let visible = 0;
    navScroll.querySelectorAll('.nav-link').forEach(a => {
      if (!q) { a.classList.remove('sb-hidden'); visible++; return; }
      const txt = (a.textContent || '').toLowerCase();
      const hit = txt.includes(q);
      a.classList.toggle('sb-hidden', !hit);
      if (hit) visible++;
    });
    // Hide group headers if all their items are hidden
    navScroll.querySelectorAll('.nav-group').forEach(g => {
      if (g.classList.contains('sb-favs-label')) { g.classList.remove('sb-hidden'); return; }
      // collect siblings until next group
      let sib = g.nextElementSibling, anyVisible = false;
      while (sib && !sib.classList.contains('nav-group')) {
        if (sib.classList.contains('nav-link') && !sib.classList.contains('sb-hidden')) anyVisible = true;
        sib = sib.nextElementSibling;
      }
      g.classList.toggle('sb-hidden', !anyVisible);
    });
    // Show "no results" message if nothing matched
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

    // Add star + flame to existing links
    navScroll.querySelectorAll('.nav-link').forEach(a => {
      const key = pageKey(a.getAttribute('href') || '');
      if (!key) return;
      // Track click for usage
      if (!a.dataset.sbBound) {
        a.dataset.sbBound = '1';
        a.addEventListener('click', () => trackClick(a.getAttribute('href') || ''));
      }
      // Star (favorite toggle)
      let star = a.querySelector('.sb-star');
      if (!star) {
        star = document.createElement('span');
        star.className = 'sb-star';
        star.title = 'إضافة إلى المفضلة';
        star.textContent = '⭐';
        star.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          const cur = getFavs();
          const idx = cur.indexOf(key);
          if (idx >= 0) cur.splice(idx, 1); else cur.push(key);
          setFavs(cur);
          enhanceLinks(navScroll);
        });
        a.appendChild(star);
      }
      star.classList.toggle('on', favs.includes(key));
      // Flame for top-3 used
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

    // Rebuild favorites section at the top (after toolbar, before regular items)
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
        // re-bind star toggle on the clone
        const cstar = clone.querySelector('.sb-star');
        if (cstar) cstar.replaceWith(cstar.cloneNode(true));
        section.appendChild(clone);
      });
      // Insert after toolbar
      const tools = navScroll.querySelector('.sb-tools');
      if (tools) tools.after(section); else navScroll.insertBefore(section, navScroll.firstChild);
    }
  }

  // ── Make .nav-group elements collapsible ──
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

  // ── Apply all enhancements to a sidebar ──
  function enhance(navScroll) {
    if (!navScroll || navScroll.dataset.sbEnhanced) return;
    navScroll.dataset.sbEnhanced = '1';
    buildToolbar(navScroll);
    enhanceLinks(navScroll);
    bindCollapsibleGroups(navScroll);
  }

  // ── Wait for nav links to be populated (handles dynamic sidebars) ──
  function waitForLinks(navScroll, maxWaitMs = 4000) {
    if (navScroll.querySelectorAll('.nav-link').length > 0) {
      enhance(navScroll);
      // Re-enhance when dynamic sidebars re-render items
      const obs = new MutationObserver(() => {
        enhanceLinks(navScroll);
        bindCollapsibleGroups(navScroll);
      });
      obs.observe(navScroll, { childList: true });
      return;
    }
    // Wait for items to appear
    const start = Date.now();
    const obs = new MutationObserver(() => {
      if (navScroll.querySelectorAll('.nav-link').length > 0) {
        obs.disconnect();
        enhance(navScroll);
        // Continue watching for future dynamic re-renders
        const obs2 = new MutationObserver(() => {
          enhanceLinks(navScroll);
          bindCollapsibleGroups(navScroll);
        });
        obs2.observe(navScroll, { childList: true });
      } else if (Date.now() - start > maxWaitMs) {
        obs.disconnect();
        // Still inject toolbar even if no links (graceful)
        enhance(navScroll);
      }
    });
    obs.observe(navScroll, { childList: true });
    setTimeout(() => obs.disconnect(), maxWaitMs);
  }

  function init() {
    injectStyles();
    const navScroll = document.querySelector('.nav-scroll, #nav-links');
    if (!navScroll) return; // page without sidebar (rare)
    waitForLinks(navScroll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
