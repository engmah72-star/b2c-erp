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

  // ════════════════════════════════════════════════════════════════
  // WHITE-LABEL TENANT LOADER (static CSS, no backend) — ARCHITECTURE.md §6
  // ────────────────────────────────────────────────────────────────
  // No-op unless a tenant is resolved → default deployments are unaffected.
  // Resolution order (first wins), then persisted:
  //   1. ?tenant=<id>   2. localStorage b2c-tenant
  //   3. existing <html data-tenant>   4. HOST_TENANTS[hostname]
  // Loads themes/tenants/<id>.css which overrides palette/brand/surface tokens
  // under :root[data-tenant="<id>"] — re-skins the whole product with ZERO
  // changes to any page, component, or the business engine.
  // ════════════════════════════════════════════════════════════════
  const TENANT_KEY = 'b2c-tenant';
  // Map deployment hostnames → tenant id for SaaS white-label (optional):
  const HOST_TENANTS = { /* 'acme.example.com': 'acme' */ };

  function sanitizeTenant(t){
    return String(t || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  }
  function resolveTenant(){
    try {
      const u = new URLSearchParams(window.location.search).get('tenant');
      if (u){ try { localStorage.setItem(TENANT_KEY, u); } catch(_){} return u; }
    } catch(_){}
    try { const ls = localStorage.getItem(TENANT_KEY); if (ls) return ls; } catch(_){}
    const attr = document.documentElement.getAttribute('data-tenant');
    if (attr) return attr;
    try { const h = HOST_TENANTS[window.location.hostname]; if (h) return h; } catch(_){}
    return '';
  }
  function applyTenant(){
    const t = sanitizeTenant(resolveTenant());
    if (!t) return;                                  // default deployment → no-op
    document.documentElement.setAttribute('data-tenant', t);
    if (document.querySelector('link[data-tenant-css]')) return; // already injected
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-tenant-css', t);
    link.href = 'themes/tenants/' + t + '.css';
    // If the tenant sheet is missing, fall back cleanly to the default identity.
    link.onerror = () => {
      try { link.remove(); } catch(_){}
      document.documentElement.removeAttribute('data-tenant');
    };
    (document.head || document.documentElement).appendChild(link);
  }

  // ── INIT — يجري فورًا قبل أي شيء ──
  applyTenant();
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
    // White-label tenant (static loader)
    getTenant: () => { try { return localStorage.getItem(TENANT_KEY) || document.documentElement.getAttribute('data-tenant') || ''; } catch(_) { return document.documentElement.getAttribute('data-tenant') || ''; } },
    setTenant: (t) => {
      const v = sanitizeTenant(t);
      try { v ? localStorage.setItem(TENANT_KEY, v) : localStorage.removeItem(TENANT_KEY); } catch(_){}
      // remove any previously injected sheet, then re-apply
      const prev = document.querySelector('link[data-tenant-css]');
      if (prev) { try { prev.remove(); } catch(_){} }
      document.documentElement.removeAttribute('data-tenant');
      applyTenant();
      return v;
    },
  };
  window.B2CTheme = API;

  // دعم ES Module — لو حد عمل import
  if (typeof module !== 'undefined' && module.exports){
    module.exports = API;
  }
})();
