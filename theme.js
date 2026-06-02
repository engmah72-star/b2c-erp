/* ════════════════════════════════════════════════════════════════
   theme.js — Light / Dark / Auto Theme Engine
   ────────────────────────────────────────────────────────────────
   • يُحفَظ الاختيار في localStorage تحت المفتاح: b2c-theme
   • القيم الممكنة: "dark" (الافتراضي) | "light" | "auto"
   • يضبط <html data-theme="..."> فينعكس تلقائيًا على كل الـ CSS Variables
   • يحدّث <meta name="theme-color"> ليطابق شريط الموبايل
   • يحقن زر التبديل تلقائيًا في .topbar-right (إن وُجد) — بدون أي تعديل HTML
   • يعمل كـ ES Module + كـ Classic Script (يكتشف نفسه)
   ════════════════════════════════════════════════════════════════ */

(function(){
  'use strict';

  const KEY = 'b2c-theme';
  const VALID = ['dark', 'light', 'auto'];
  const DEFAULT = 'dark'; // الافتراضي = dark، الفاتح opt-in

  // ── قراءة التفضيل المحفوظ ──
  function getStored(){
    try {
      const v = localStorage.getItem(KEY);
      return VALID.includes(v) ? v : DEFAULT;
    } catch(e){ return DEFAULT; }
  }

  // ── حساب الـ effective theme (يحوّل auto إلى light/dark حسب النظام) ──
  function effective(t){
    if (t === 'auto'){
      return window.matchMedia &&
             window.matchMedia('(prefers-color-scheme: light)').matches
             ? 'light' : 'dark';
    }
    return t;
  }

  // ── تطبيق الوضع على <html> + body (لتغطية أي CSS يستهدف body) ──
  function apply(t){
    if (!VALID.includes(t)) t = DEFAULT;
    document.documentElement.setAttribute('data-theme', t);
    if (document.body) document.body.setAttribute('data-theme', t);
    // تحديث ميتا اللون لشريط الموبايل
    const eff = effective(t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', eff === 'light' ? '#FFFFFF' : '#0d0f1b');
    // بثّ event للصفحات لو محتاجة تتفاعل
    try {
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t, effective: eff } }));
    } catch(_) {}
  }

  // ── الحفظ + التطبيق ──
  function setTheme(t){
    if (!VALID.includes(t)) t = DEFAULT;
    try { localStorage.setItem(KEY, t); } catch(e){}
    apply(t);
    updateToggleUI();
  }

  // ── دائري: dark → light → auto → dark ──
  function cycle(e){
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    const order = ['dark','light','auto'];
    const cur = getStored();
    const next = order[(order.indexOf(cur) + 1) % order.length];
    animateBtn();
    setTheme(next);
    return next;
  }

  // ── أيقونات SVG احترافية (موحَّدة عبر الأجهزة) ──
  const ICONS = {
    light: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    dark:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    auto:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" fill="currentColor"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>'
  };

  // ── تحديث UI الزر لو موجود ──
  function updateToggleUI(){
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const order = ['dark','light','auto'];
    const cur = getStored();
    const next = order[(order.indexOf(cur) + 1) % order.length];
    const lblOf = (t) => t === 'light' ? 'فاتح' : t === 'dark' ? 'غامق' : 'تلقائي';
    const tip = `الوضع: ${lblOf(cur)} · انقر للانتقال إلى ${lblOf(next)} · Ctrl+Shift+L`;
    btn.innerHTML = `<span class="theme-ico-wrap" style="display:inline-flex;align-items:center;justify-content:center;line-height:1;transition:transform .35s cubic-bezier(.4,0,.2,1);">${ICONS[cur] || ICONS.dark}</span>`;
    btn.setAttribute('data-tip', tip);
    btn.setAttribute('aria-label', tip);
    btn.title = tip;
  }

  // ── ميكرو-أنيميشن عند الضغط (دوران الأيقونة) ──
  function animateBtn(){
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const wrap = btn.querySelector('.theme-ico-wrap');
    if (!wrap) return;
    wrap.style.transform = 'rotate(360deg) scale(.85)';
    setTimeout(() => { wrap.style.transform = 'rotate(0) scale(1)'; }, 50);
  }

  // ── حقن الزر تلقائيًا في الـ topbar ──
  function injectToggleButton(){
    // لو موجود بالفعل وله handler → نتركه
    const existing = document.getElementById('themeToggleBtn');
    if (existing){
      // التحقق إن الـ handler متربوط (لو الزر اتعاد بناء داخل re-render، لازم نربط تاني)
      if (!existing.__themeBound){
        existing.addEventListener('click', cycle);
        existing.__themeBound = true;
      }
      return;
    }
    const host = document.querySelector('.topbar-right');
    if (!host) return;

    const btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.type = 'button';
    btn.className = 'notif-bell'; // نفس استايل أيقونات الـ topbar (دائرة 34px)
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', cycle);
    btn.__themeBound = true;

    // نضعه أوّل عنصر (يمين أول حاجة في RTL)
    host.insertBefore(btn, host.firstChild);
    updateToggleUI();
  }

  // ── مراقبة تغيّر تفضيل النظام (للـ auto) ──
  function watchSystem(){
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => { if (getStored() === 'auto') apply('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler); // Safari قديم
  }

  // ── INIT — يجري فورًا قبل أي شيء ──
  apply(getStored());
  watchSystem();

  // ── حقن الزر بعد توفر DOM ──
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => {
      apply(getStored()); // ضبط data-theme على body بعد توفره
      injectToggleButton();
    });
  } else {
    apply(getStored());
    injectToggleButton();
  }

  // ── إعادة محاولات حقن الزر (للصفحات اللي تبني topbar متأخر) ──
  // بديل خفيف للـ MutationObserver subtree — مجرد محاولات مجدولة.
  // لا CPU overhead في الـ idle time (بعكس observer دائم).
  function retryInject(){
    if (document.getElementById('themeToggleBtn')) return;
    if (document.querySelector('.topbar-right')) injectToggleButton();
  }
  window.addEventListener('load', retryInject);
  [200, 500, 1000, 2000].forEach(d => setTimeout(retryInject, d));

  // ── مراقبة data-theme فقط (attribute واحد) — خفيف جدًا ──
  // لو سكربت ثانٍ مسح data-theme نُعيد ضبطه. attributeFilter يقصره على
  // attribute واحد، بدون subtree — مفيش performance hit.
  if (typeof MutationObserver !== 'undefined'){
    const mo = new MutationObserver(() => {
      if (!document.documentElement.hasAttribute('data-theme')){
        document.documentElement.setAttribute('data-theme', getStored());
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // ── Keyboard shortcut: Ctrl/Cmd + Shift + L ──
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l' || e.code === 'KeyL')){
      // لا تسرق الـ shortcut لو المستخدم في input/textarea (ما عدا الـ Ctrl)
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      e.preventDefault();
      cycle();
    }
  });

  // ── الـ API العام ──
  const API = {
    set: setTheme,
    get: getStored,
    effective: () => effective(getStored()),
    cycle,
    toggle: () => setTheme(effective(getStored()) === 'dark' ? 'light' : 'dark'),
  };
  window.B2CTheme = API;

  // دعم ES Module — لو حد عمل import
  if (typeof module !== 'undefined' && module.exports){
    module.exports = API;
  }
})();

/* ════════════════════════════════════════════════════════════════
   font.js (مدمج) — Font Choices Engine
   ────────────────────────────────────────────────────────────────
   • يُحفَظ الاختيار في localStorage تحت المفتاح: b2c-font
   • القيم: tajawal (الافتراضي) | cairo | almarai | plex | rubik | system
   • يضبط <html data-font="..."> فينعكس على --font-ar في shared.css
   • يحمّل خط Google ديناميكياً عند الاختيار (الافتراضي tajawal محمَّل أصلاً)
   • يحقن زر اختيار في .topbar-right (بعد زر الثيم) يفتح قائمة بمعاينة الخطوط
   • API: window.B2CFont
   ════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const KEY = 'b2c-font';
  const DEFAULT = 'tajawal';
  // label = الاسم المعروض · google = عائلة Google Fonts (null = خط نظام بلا تحميل)
  const FONTS = {
    tajawal: { label: 'تجوال',     google: 'Tajawal:wght@400;500;700;800' },
    cairo:   { label: 'القاهرة',   google: 'Cairo:wght@400;500;600;700' },
    almarai: { label: 'المراعي',   google: 'Almarai:wght@400;700;800' },
    plex:    { label: 'IBM Plex',  google: 'IBM+Plex+Sans+Arabic:wght@400;500;600;700' },
    rubik:   { label: 'روبيك',     google: 'Rubik:wght@400;500;600;700' },
    system:  { label: 'خط النظام', google: null },
  };
  const ORDER = ['tajawal','cairo','almarai','plex','rubik','system'];

  function getStored(){
    try { const v = localStorage.getItem(KEY); return FONTS[v] ? v : DEFAULT; }
    catch(e){ return DEFAULT; }
  }

  // حقن <link> لخط Google مرة واحدة لكل عائلة
  function ensureLoaded(key){
    const f = FONTS[key];
    if (!f || !f.google) return;
    const id = 'b2c-font-' + key;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + f.google + '&display=swap';
    document.head.appendChild(link);
  }

  function apply(key){
    if (!FONTS[key]) key = DEFAULT;
    document.documentElement.setAttribute('data-font', key);
    if (document.body) document.body.setAttribute('data-font', key);
    ensureLoaded(key);
    try { window.dispatchEvent(new CustomEvent('fontchange', { detail: { font: key } })); } catch(_){}
  }

  function setFont(key){
    if (!FONTS[key]) key = DEFAULT;
    try { localStorage.setItem(KEY, key); } catch(e){}
    apply(key);
    renderMenu();
  }

  // أيقونة typography (نفس أسلوب أيقونات theme.js)
  const ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>';

  let menuEl = null;

  function closeMenu(){
    if (menuEl){ menuEl.remove(); menuEl = null; }
    document.removeEventListener('click', onDocClick, true);
  }
  function onDocClick(e){
    if (menuEl && !menuEl.contains(e.target) && e.target.id !== 'fontToggleBtn' &&
        !(e.target.closest && e.target.closest('#fontToggleBtn'))) closeMenu();
  }

  function renderMenu(){
    if (!menuEl) return;
    const cur = getStored();
    menuEl.innerHTML =
      '<div style="padding:6px 10px;font-size:11px;font-weight:800;color:var(--dim2,#7c8db8);border-bottom:1px solid var(--line,rgba(130,160,235,.14));margin-bottom:4px;">اختيار الخط</div>' +
      ORDER.map(k => {
        const f = FONTS[k];
        const active = k === cur;
        const stack = k === 'system'
          ? "system-ui,-apple-system,'Segoe UI',sans-serif"
          : "'" + (k==='plex' ? 'IBM Plex Sans Arabic' : k==='tajawal' ? 'Tajawal' : k==='cairo' ? 'Cairo' : k==='almarai' ? 'Almarai' : 'Rubik') + "',sans-serif";
        return '<button type="button" data-font-key="' + k + '" ' +
          'style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:start;' +
          'padding:9px 12px;border:0;border-radius:8px;cursor:pointer;font-family:' + stack + ';font-size:15px;' +
          'background:' + (active ? 'var(--tint-b-soft,rgba(74,142,245,.12))' : 'transparent') + ';' +
          'color:' + (active ? 'var(--b,#4a8ef5)' : 'var(--snow,#e4ebfb)') + ';font-weight:' + (active ? '800' : '600') + ';">' +
          '<span>' + f.label + ' — أبجد هوز</span>' +
          (active ? '<span style="font-size:13px;">✓</span>' : '') +
        '</button>';
      }).join('');
    // ربط الأزرار
    menuEl.querySelectorAll('[data-font-key]').forEach(b => {
      b.addEventListener('mouseenter', () => { if (b.getAttribute('data-font-key') !== getStored()) b.style.background = 'var(--hover,rgba(255,255,255,.06))'; });
      b.addEventListener('mouseleave', () => { if (b.getAttribute('data-font-key') !== getStored()) b.style.background = 'transparent'; });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        setFont(b.getAttribute('data-font-key'));
        closeMenu();
      });
    });
  }

  function openMenu(btn){
    // حمّل كل الخطوط لتظهر المعاينة بشكلها الصحيح
    ORDER.forEach(ensureLoaded);
    menuEl = document.createElement('div');
    menuEl.id = 'fontMenu';
    const r = btn.getBoundingClientRect();
    Object.assign(menuEl.style, {
      position: 'fixed',
      top: (r.bottom + 8) + 'px',
      insetInlineEnd: Math.max(8, (window.innerWidth - r.right)) + 'px',
      minWidth: '220px',
      background: 'var(--bg2,#131c33)',
      border: '1px solid var(--line2,rgba(130,160,235,.22))',
      borderRadius: '12px',
      boxShadow: '0 16px 48px rgba(0,0,0,.45)',
      padding: '6px',
      zIndex: '9999',
    });
    document.body.appendChild(menuEl);
    renderMenu();
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  }

  function toggleMenu(e){
    if (e){ e.preventDefault(); e.stopPropagation(); }
    const btn = document.getElementById('fontToggleBtn');
    if (menuEl) { closeMenu(); return; }
    if (btn) openMenu(btn);
  }

  function injectButton(){
    const existing = document.getElementById('fontToggleBtn');
    if (existing){
      if (!existing.__fontBound){ existing.addEventListener('click', toggleMenu); existing.__fontBound = true; }
      return;
    }
    const host = document.querySelector('.topbar-right');
    if (!host) return;
    const btn = document.createElement('button');
    btn.id = 'fontToggleBtn';
    btn.type = 'button';
    btn.className = 'notif-bell';
    btn.style.cursor = 'pointer';
    btn.innerHTML = ICON;
    const tip = 'اختيار الخط';
    btn.title = tip; btn.setAttribute('aria-label', tip); btn.setAttribute('data-tip', tip);
    btn.addEventListener('click', toggleMenu);
    btn.__fontBound = true;
    // بعد زر الثيم إن وُجد، وإلا أول عنصر
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn && themeBtn.nextSibling) host.insertBefore(btn, themeBtn.nextSibling);
    else if (themeBtn) host.appendChild(btn);
    else host.insertBefore(btn, host.firstChild);
  }

  // INIT
  apply(getStored());
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => { apply(getStored()); injectButton(); });
  } else { apply(getStored()); injectButton(); }
  window.addEventListener('load', injectButton);
  [200,500,1000,2000].forEach(d => setTimeout(injectButton, d));
  window.addEventListener('resize', closeMenu);

  // حافظ على data-font لو مسحه سكربت آخر
  if (typeof MutationObserver !== 'undefined'){
    const mo = new MutationObserver(() => {
      if (!document.documentElement.hasAttribute('data-font'))
        document.documentElement.setAttribute('data-font', getStored());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-font'] });
  }

  window.B2CFont = { set: setFont, get: getStored, list: () => ORDER.slice() };
})();
