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
  const DEFAULT = 'dark'; // الافتراضي = نفس التجربة الحالية، الفاتح Opt-in

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

  // ── تطبيق الوضع على <html> ──
  function apply(t){
    if (!VALID.includes(t)) t = DEFAULT;
    document.documentElement.setAttribute('data-theme', t);
    // تحديث ميتا اللون لشريط الموبايل
    const eff = effective(t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', eff === 'light' ? '#FFFFFF' : '#0d0f1b');
    // بثّ event للصفحات لو محتاجة تتفاعل
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t, effective: eff } }));
  }

  // ── الحفظ + التطبيق ──
  function setTheme(t){
    if (!VALID.includes(t)) t = DEFAULT;
    try { localStorage.setItem(KEY, t); } catch(e){}
    apply(t);
    updateToggleUI();
  }

  // ── دائري: dark → light → auto → dark ──
  function cycle(){
    const order = ['dark','light','auto'];
    const cur = getStored();
    const next = order[(order.indexOf(cur) + 1) % order.length];
    setTheme(next);
    return next;
  }

  // ── تحديث UI الزر لو موجود ──
  function updateToggleUI(){
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const cur = getStored();
    const ico = cur === 'light' ? '☀' : cur === 'dark' ? '☾' : '⚙';
    const lbl = cur === 'light' ? 'فاتح' : cur === 'dark' ? 'غامق' : 'تلقائي';
    btn.innerHTML = `<span style="font-size:14px;line-height:1">${ico}</span>`;
    btn.setAttribute('data-tip', `الوضع: ${lbl} — انقر للتبديل`);
    btn.setAttribute('aria-label', `تبديل الوضع، الحالي: ${lbl}`);
  }

  // ── حقن الزر تلقائيًا في الـ topbar ──
  function injectToggleButton(){
    if (document.getElementById('themeToggleBtn')) return;
    const host = document.querySelector('.topbar-right');
    if (!host) return;

    const btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.type = 'button';
    btn.className = 'notif-bell'; // نستعمل نفس استايل أيقونات الـ topbar الموجودة (دائرة 34px)
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', cycle);

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
    document.addEventListener('DOMContentLoaded', injectToggleButton);
  } else {
    injectToggleButton();
  }
  // مراقبة لو الـ topbar اتحط متأخر (بعض الصفحات تبنيه ديناميكيًا)
  if (typeof MutationObserver !== 'undefined'){
    const mo = new MutationObserver(() => {
      if (document.querySelector('.topbar-right') && !document.getElementById('themeToggleBtn')){
        injectToggleButton();
      }
    });
    document.addEventListener('DOMContentLoaded', () => {
      mo.observe(document.body, { childList: true, subtree: true });
      // نوقفه بعد 5 ثوان (طلبنا اتعمل، خلاص)
      setTimeout(() => mo.disconnect(), 5000);
    });
  }

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
