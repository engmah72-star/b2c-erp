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
  const DEFAULT = 'dark'; // الافتراضي = dark (الـ navy chrome من PR #811 يفضل ثابت في الـ themes الاتنين)

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
    // كلا الـ themes يستخدمان نفس الـ topbar navy → لون شريط الموبايل ثابت
    if (meta) meta.setAttribute('content', '#0E2848');
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
