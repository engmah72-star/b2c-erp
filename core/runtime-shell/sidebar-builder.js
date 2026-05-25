// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Sidebar Builder (shared helper)
// ════════════════════════════════════════════════════════════════════
//
// Helper مشترك للـ domain modules. يأخذ config declarative ويبني الـ
// sidebar HTML + wiring (clicks، toasts، deep-link navigation).
//
// Phase 4: signals reactive — subscribes to signals.onChange ويحدّث
// الـ count DOM لكل signal item.
// ════════════════════════════════════════════════════════════════════

import * as signalStore from './signals.js';
import * as memory from './runtime-memory.js';
import * as fab from './fab.js';

const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

function _toast(msg) {
  try {
    const top = window.top || window;
    const doc = top.document;
    let host = doc.getElementById('rt-toast-host');
    if (!host) {
      host = doc.createElement('div');
      host.id = 'rt-toast-host';
      host.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
      doc.body.appendChild(host);
    }
    const t = doc.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'padding:10px 16px;background:rgba(15,23,42,.92);color:#fff;border-radius:8px;font-size:13px;font-weight:600;font-family:"IBM Plex Sans Arabic",sans-serif;backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:90vw;text-align:center;transition:opacity .3s;';
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; }, 2500);
    setTimeout(() => t.remove(), 3000);
  } catch (_) {}
}

export function buildSidebar({ container, domain, config = {} }) {
  if (!container || !domain) return { dispose: () => {} };
  const views   = Array.isArray(config.views)   ? config.views   : [];
  const actions = Array.isArray(config.actions) ? config.actions : [];

  let html = '';

  // ── Header (with explicit close button — always visible on mobile) ──
  html += '<div class="rt-ctx-header">';
  html +=   '<button type="button" class="rt-ctx-h-close" data-rt-close aria-label="إغلاق القائمة" title="إغلاق">✕</button>';
  html +=   '<span class="rt-ctx-h-ico" aria-hidden="true">' + domain.icon + '</span>';
  html +=   '<span class="rt-ctx-h-title">' + _esc(domain.title) + '</span>';
  html +=   '<button type="button" class="rt-ctx-h-add" data-rt-add aria-label="' + _esc(config.addLabel || 'إضافة') + '" title="' + _esc(config.addLabel || 'إضافة') + '">+</button>';
  html += '</div>';

  // ── Views ──
  if (views.length) {
    html += '<section class="rt-ctx-section" aria-label="العرض">';
    html +=   '<header class="rt-ctx-section-h">العرض</header>';
    for (const v of views) {
      const cnt = v.count != null ? '<span class="rt-ctx-item-cnt ' + _esc(v.countKind || '') + '">' + _esc(v.count) + '</span>' : '';
      html += '<a class="rt-ctx-item" data-view="' + _esc(v.id) + '" href="' + _esc(v.deepLink || '#') + '" data-deep-link="' + _esc(v.deepLink || '') + '">';
      html +=   '<span class="rt-ctx-item-ico" aria-hidden="true">' + (v.ico || '•') + '</span>';
      html +=   '<span class="rt-ctx-item-lbl">' + _esc(v.label) + '</span>';
      html +=   cnt;
      html += '</a>';
    }
    html += '</section>';
  }

  // ── Quick Actions ──
  if (actions.length) {
    html += '<section class="rt-ctx-section" aria-label="إجراءات سريعة">';
    html +=   '<header class="rt-ctx-section-h">إجراءات سريعة</header>';
    for (const a of actions) {
      html += '<button type="button" class="rt-ctx-item" data-handler="' + _esc(a.handler || a.id) + '">';
      html +=   '<span class="rt-ctx-item-ico" aria-hidden="true">' + (a.ico || '•') + '</span>';
      html +=   '<span class="rt-ctx-item-lbl">' + _esc(a.label) + '</span>';
      html += '</button>';
    }
    html += '</section>';
  }

  // ── Signals (live, reactive to signal store) ──
  const signalsList = Array.isArray(config.signals) ? config.signals : [];
  if (signalsList.length) {
    html += '<section class="rt-ctx-section" aria-label="تنبيهات">';
    html +=   '<header class="rt-ctx-section-h">تنبيهات</header>';
    for (const s of signalsList) {
      const cls = s.kind === 'warn' ? 'warn' : (s.kind === 'crit' ? 'crit' : '');
      const key = s.signalKey || s.id;
      const initialCount = key ? signalStore.getMetric(domain.id, key) : 0;
      const displayCount = initialCount > 0 ? initialCount : (s.count != null ? s.count : '—');
      const isActionable = !!s.target;
      const dataTarget = isActionable ? ' data-signal-target="' + _esc(s.target) + '"' : '';
      const role = isActionable ? 'button' : '';
      const tabIdx = isActionable ? 'tabindex="0"' : 'aria-disabled="true"';
      const styleAttr = isActionable ? '' : ' style="cursor:default"';
      html += '<button type="button" class="rt-ctx-item rt-ctx-signal" data-signal-key="' + _esc(key || '') + '"' + dataTarget + ' ' + tabIdx + styleAttr + '>';
      html +=   '<span class="rt-ctx-item-ico" aria-hidden="true">' + (s.ico || 'ℹ') + '</span>';
      html +=   '<span class="rt-ctx-item-lbl">' + _esc(s.label) + '</span>';
      html +=   '<span class="rt-ctx-item-cnt ' + cls + '">' + _esc(displayCount) + '</span>';
      html += '</button>';
    }
    html += '</section>';
  }

  // ── Recent (Phase 6: persistent + reactive) ──
  html += '<section class="rt-ctx-section rt-ctx-recent-section" aria-label="الأخيرة">';
  html +=   '<header class="rt-ctx-section-h">الأخيرة</header>';
  html +=   '<div class="rt-ctx-recent-list" data-rt-recent></div>';
  html += '</section>';

  container.innerHTML = html;

  // ── Wire view clicks → navigate workspace iframe ──
  container.querySelectorAll('[data-deep-link]').forEach(link => {
    link.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = link.dataset.deepLink;
      if (!url) return;
      e.preventDefault();
      container.querySelectorAll('[data-deep-link]').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      _navigate(url);
    });
  });

  // ── Wire signal clicks → navigate to filtered view (smart signals) ──
  container.querySelectorAll('[data-signal-target]').forEach(sig => {
    sig.addEventListener('click', (e) => {
      e.preventDefault();
      const url = sig.dataset.signalTarget;
      if (!url) return;
      _navigate(url);
    });
  });

  function _navigate(url) {
    const shell = (window.top && window.top.B2CShell) || window.B2CShell;
    if (shell && typeof shell.openInWorkspace === 'function') {
      shell.openInWorkspace(url);
      // close mobile drawer after navigation
      if (typeof shell.closeSidebar === 'function') shell.closeSidebar();
    } else {
      location.href = url;
    }
  }

  // ── Wire quick-action buttons (Phase 3 placeholders) ──
  container.querySelectorAll('[data-handler]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const handler = btn.dataset.handler;
      const label = btn.querySelector('.rt-ctx-item-lbl')?.textContent || handler;
      console.info('[' + domain.id + ':action]', handler);
      _toast(label + ' — Phase 3');
    });
  });

  // ── Add button (placeholder) ──
  container.querySelector('[data-rt-add]')?.addEventListener('click', () => {
    _toast((config.addLabel || 'إضافة') + ' — Phase 3');
  });

  // ── Close button (explicit) — closes mobile drawer ──
  container.querySelector('[data-rt-close]')?.addEventListener('click', () => {
    const shell = (window.top && window.top.B2CShell) || window.B2CShell;
    if (shell && typeof shell.closeSidebar === 'function') {
      shell.closeSidebar();
    }
  });

  // ── Sync FAB with this domain's primary action (Phase 7) ──
  if (config.primaryAction && config.primaryAction.icon) {
    fab.show(config.primaryAction);
  } else {
    fab.hide();
  }

  // ── Subscribe to signal changes (Phase 4: reactive counts) ──
  const unsubSignals = signalStore.onChange((emittedDomain, key, count) => {
    if (emittedDomain !== domain.id) return;
    const item = container.querySelector('.rt-ctx-signal[data-signal-key="' + key + '"] .rt-ctx-item-cnt');
    if (item) item.textContent = count > 0 ? String(count) : '—';
  });

  // ── Render + subscribe to recent (Phase 6) ──
  const recentHost = container.querySelector('[data-rt-recent]');
  function renderRecent() {
    if (!recentHost) return;
    const items = memory.getRecent(domain.id, 5);
    if (!items.length) {
      recentHost.innerHTML = '<div class="rt-ctx-placeholder">' + _esc(config.emptyRecent || 'يُملأ تلقائياً من نشاطك') + '</div>';
      return;
    }
    let h = '';
    for (const it of items) {
      const ago = _timeAgo(it.ts);
      h += '<button type="button" class="rt-ctx-item rt-ctx-recent-item" data-recent-url="' + _esc(it.url) + '" title="' + _esc(it.label) + '">';
      h +=   '<span class="rt-ctx-item-ico" aria-hidden="true">⏱</span>';
      h +=   '<span class="rt-ctx-item-lbl">' + _esc(it.label) + '</span>';
      h +=   '<span class="rt-ctx-item-cnt" style="background:transparent;color:var(--rt-dim,#647298);font-weight:400">' + _esc(ago) + '</span>';
      h += '</button>';
    }
    recentHost.innerHTML = h;
    recentHost.querySelectorAll('[data-recent-url]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = btn.dataset.recentUrl;
        if (!url) return;
        const shell = (window.top && window.top.B2CShell) || window.B2CShell;
        if (shell && typeof shell.openInWorkspace === 'function') shell.openInWorkspace(url);
      });
    });
  }
  renderRecent();
  const unsubRecent = memory.onRecentChange((emittedDomain) => {
    if (emittedDomain === domain.id) renderRecent();
  });

  return {
    dispose: () => {
      try { unsubSignals(); } catch (_) {}
      try { unsubRecent(); }  catch (_) {}
    }
  };
}

function _timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'الآن';
  if (diff < 3600_000) return Math.floor(diff/60_000) + 'د';
  if (diff < 86400_000) return Math.floor(diff/3600_000) + 'س';
  return Math.floor(diff/86400_000) + 'ي';
}
