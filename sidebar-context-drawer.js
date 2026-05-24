// ════════════════════════════════════════════════════════════════════
// Business2Card ERP — Sidebar Context Drawer
// ════════════════════════════════════════════════════════════════════
//
// يستمع لـ B2CContext events ويرسم تفاصيل الـ entity داخل الـ sidebar،
// مكان الـ nav-links (الـ navigation تختفي مؤقتاً، تظهر context).
//
// Renderer Registry:
//   B2CContextDrawer.registerRenderer(entity, factoryFn)
//   factoryFn({id, container}) → returns { dispose? } | undefined
//
// الـ pages بتسجل renderers (مثل production.html بـ order renderer).
// الـ drawer يـ orchestrates: ينظف القديم، يفوّت للـ renderer الجديد.
//
// Back button → B2CContext.clear() → sidebar ترجع nav-links.
// ════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  try { if (window.self !== window.top) return; } catch(_) { return; }

  let drawer = null;
  let headEl = null;
  let backBtn = null;
  let titleEl = null;
  let contentEl = null;
  let navScrollEl = null;
  let smartTools = null; // .sb-tools (smart-sidebar) — يتخفّى أثناء context
  let currentRendererCleanup = null;
  let renderToken = 0; // race-guard للـ async renders
  const rendererRegistry = new Map(); // entity → factoryFn

  // Lazy-loaded built-in renderers (لا تتطلب per-page setup).
  // الصفحة تنشر ctx، الـ drawer بيـ import الـ module للأول مرة.
  const LAZY_RENDERERS = {
    'order': { module: './core/context-renderers/order-renderer.js?v=1', export: 'createOrderRenderer' },
  };

  async function ensureRenderer(entity) {
    if (rendererRegistry.has(entity)) return rendererRegistry.get(entity);
    const spec = LAZY_RENDERERS[entity];
    if (!spec) return null;
    try {
      const mod = await import(spec.module);
      const factory = mod[spec.export];
      if (typeof factory === 'function') {
        rendererRegistry.set(entity, factory);
        return factory;
      }
    } catch (e) {
      console.warn('[ctx-drawer] lazy load failed for ' + entity, e);
    }
    return null;
  }

  function ensureDrawer() {
    if (drawer) return drawer;
    const sidenav = document.querySelector('.sidenav');
    if (!sidenav) return null;

    navScrollEl = sidenav.querySelector('.nav-scroll');
    smartTools = sidenav.querySelector('.sb-tools');
    if (!navScrollEl) return null;

    drawer = document.createElement('div');
    drawer.className = 'sb-ctx-drawer';
    drawer.setAttribute('role', 'region');
    drawer.setAttribute('aria-label', 'تفاصيل العنصر');
    drawer.hidden = true;

    headEl = document.createElement('div');
    headEl.className = 'sb-ctx-head';

    backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'sb-ctx-back';
    backBtn.setAttribute('aria-label', 'رجوع للقائمة');
    backBtn.textContent = '←';
    backBtn.addEventListener('click', () => {
      if (window.B2CContext) window.B2CContext.clear();
    });

    titleEl = document.createElement('div');
    titleEl.className = 'sb-ctx-title';
    titleEl.textContent = '';

    headEl.appendChild(backBtn);
    headEl.appendChild(titleEl);

    contentEl = document.createElement('div');
    contentEl.className = 'sb-ctx-content';

    drawer.appendChild(headEl);
    drawer.appendChild(contentEl);

    // Insert كـ sibling لـ nav-scroll (داخل sidenav، نفس المكان)
    if (navScrollEl.nextSibling) {
      sidenav.insertBefore(drawer, navScrollEl.nextSibling);
    } else {
      sidenav.appendChild(drawer);
    }

    return drawer;
  }

  function disposeCurrentRenderer() {
    if (currentRendererCleanup) {
      try { currentRendererCleanup(); } catch (e) { console.warn('[ctx-drawer] dispose error', e); }
      currentRendererCleanup = null;
    }
  }

  async function render(state) {
    ensureDrawer();
    if (!drawer) return;

    const token = ++renderToken;
    disposeCurrentRenderer();

    if (!state) {
      // عودة للـ nav-links
      drawer.hidden = true;
      drawer.setAttribute('aria-hidden', 'true');
      if (navScrollEl) navScrollEl.style.display = '';
      if (smartTools) smartTools.style.display = '';
      document.body.classList.remove('sb-ctx-active');
      if (contentEl) contentEl.innerHTML = '';
      if (titleEl) titleEl.textContent = '';
      return;
    }

    // Context active
    if (navScrollEl) navScrollEl.style.display = 'none';
    if (smartTools) smartTools.style.display = 'none';
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sb-ctx-active');

    titleEl.textContent = state.entity + (state.id ? ' · ' + state.id : '');
    contentEl.innerHTML = '<div class="sb-ctx-loading">جاري التحميل</div>';

    // Resolve renderer (sync registered أو lazy-load module)
    let factory = rendererRegistry.get(state.entity);
    if (!factory) factory = await ensureRenderer(state.entity);

    // Race-guard: لو الـ user فتح context تاني وإحنا لسه بنحمّل، تجاهل
    if (token !== renderToken) return;

    if (!factory) {
      contentEl.innerHTML = '<div class="sb-ctx-empty">لا يوجد عرض متاح لـ <code>' + escape(state.entity) + '</code></div>';
      return;
    }

    contentEl.innerHTML = '';
    try {
      const res = factory({ id: state.id, container: contentEl, setTitle: (t) => { if (titleEl) titleEl.textContent = t || ''; } });
      if (res && typeof res.dispose === 'function') {
        currentRendererCleanup = res.dispose;
      }
    } catch (e) {
      console.error('[ctx-drawer] renderer error', e);
      contentEl.innerHTML = '<div class="sb-ctx-error">خطأ في التحميل: ' + escape(e.message || 'unknown') + '</div>';
    }
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function registerRenderer(entity, factory) {
    if (!entity || typeof factory !== 'function') return;
    rendererRegistry.set(entity, factory);
    // لو في context active للـ entity ده، أعد الـ render
    const cur = window.B2CContext && window.B2CContext.get && window.B2CContext.get();
    if (cur && cur.entity === entity) render(cur);
  }

  function unregisterRenderer(entity) {
    rendererRegistry.delete(entity);
  }

  function init() {
    if (!window.B2CContext) {
      console.warn('[ctx-drawer] B2CContext not loaded — ensure core/sidebar-context.js loaded first');
      return;
    }
    window.B2CContext.on(render);
    // Initial render
    const initial = window.B2CContext.get();
    if (initial) render(initial);
  }

  window.B2CContextDrawer = { registerRenderer, unregisterRenderer };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
