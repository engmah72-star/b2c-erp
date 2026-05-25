// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Sidebar Builder (shared helper)
// ════════════════════════════════════════════════════════════════════
//
// Helper مشترك للـ domain modules. يأخذ config declarative ويبني الـ
// sidebar HTML + wiring (clicks، toasts، deep-link navigation).
//
// Domains تكتفي بـ config object — لا تكرار للـ HTML/event code.
//
// Usage:
//   import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';
//   buildSidebar({ container, domain, config: { views, actions, signals } });
//
// Config shape:
//   {
//     views?:  [{ id, ico, label, deepLink }],
//     actions?: [{ id, ico, label, handler }],   // handler = string id (Phase 3 wires it)
//     signals?: [{ kind, ico, label, count }],   // kind: 'warn' | 'crit' | 'info'
//     addLabel?: string,                          // tooltip for (+) button
//     emptyRecent?: string,
//   }
// ════════════════════════════════════════════════════════════════════

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
  const signals = Array.isArray(config.signals) ? config.signals : [];

  let html = '';

  // ── Header ──
  html += '<div class="rt-ctx-header">';
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

  // ── Signals (placeholder display) ──
  if (signals.length) {
    html += '<section class="rt-ctx-section" aria-label="تنبيهات">';
    html +=   '<header class="rt-ctx-section-h">تنبيهات</header>';
    for (const s of signals) {
      const cls = s.kind === 'warn' ? 'warn' : (s.kind === 'crit' ? 'crit' : '');
      html += '<div class="rt-ctx-item" aria-disabled="true" style="cursor:default">';
      html +=   '<span class="rt-ctx-item-ico" aria-hidden="true">' + (s.ico || 'ℹ') + '</span>';
      html +=   '<span class="rt-ctx-item-lbl">' + _esc(s.label) + '</span>';
      html +=   '<span class="rt-ctx-item-cnt ' + cls + '">' + _esc(s.count != null ? s.count : '—') + '</span>';
      html += '</div>';
    }
    html += '</section>';
  }

  // ── Recent (placeholder) ──
  html += '<section class="rt-ctx-section" aria-label="الأخيرة">';
  html +=   '<header class="rt-ctx-section-h">الأخيرة</header>';
  html +=   '<div class="rt-ctx-placeholder">' + _esc(config.emptyRecent || 'يُملأ تلقائياً من نشاطك (قريباً)') + '</div>';
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
      const shell = (window.top && window.top.B2CShell) || window.B2CShell;
      if (shell && typeof shell.openInWorkspace === 'function') {
        shell.openInWorkspace(url);
      } else {
        location.href = url;
      }
    });
  });

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

  return { dispose: () => {} };
}
