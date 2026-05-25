// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Accounts Domain Sidebar (Pilot)
// ════════════════════════════════════════════════════════════════════
//
// أول domain module يـ register نفسه في الـ Runtime Shell.
// يعرض context-aware sidebar لـ domain "accounts".
//
// المحتوى (Phase 2 — static/structural):
//   - Header: 💰 الحسابات + (+) add button
//   - Views: المحافظ، الخزنة، الموافقات، التحصيلات، المصروفات، التسويات
//     كل view = link لـ accounts.html بـ deep-link (?tab=X أو #section)
//   - Quick Actions: صرف / إيداع / موافقة / تقرير سريع
//     (Phase 3 سيـ wire الـ actions الفعلية)
//   - Signals: placeholder (Phase 4)
//   - Recent: placeholder (Phase 4)
//
// API: register-on-load
// ════════════════════════════════════════════════════════════════════

import { register } from '../../runtime-shell/domain-registry.js';

const VIEWS = [
  { id: 'wallets',   ico: '💼', label: 'المحافظ',       deepLink: 'accounts.html#wallets' },
  { id: 'safe',      ico: '🏦', label: 'الخزنة',         deepLink: 'accounts.html#safe' },
  { id: 'approvals', ico: '🔐', label: 'الموافقات',      deepLink: 'approvals.html' },
  { id: 'income',    ico: '📥', label: 'التحصيلات',      deepLink: 'accounts.html#income' },
  { id: 'expenses',  ico: '📤', label: 'المصروفات',      deepLink: 'accounts.html#expenses' },
  { id: 'settle',    ico: '🤝', label: 'التسويات',       deepLink: 'shipping-accounts.html' },
];

const QUICK_ACTIONS = [
  { id: 'transfer', ico: '🔄', label: 'تحويل بين محافظ', handler: 'openTransferDialog' },
  { id: 'expense',  ico: '💸', label: 'تسجيل مصروف',    handler: 'openExpenseDialog' },
  { id: 'approve',  ico: '✅', label: 'مراجعة الموافقات', handler: 'goToApprovals' },
  { id: 'report',   ico: '📊', label: 'تقرير سريع',     handler: 'openQuickReport' },
];

const SIGNALS_PLACEHOLDER = [
  { kind: 'warn', ico: '⚠', label: 'موافقات معلقة',  count: '—' },
  { kind: 'warn', ico: '⚠', label: 'كاش منخفض',     count: '—' },
  { kind: 'info', ico: 'ℹ', label: 'تسويات قيد الانتظار', count: '—' },
];

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function renderAccountsSidebar({ container, domain }) {
  let html = '';

  // ── Header ──
  html += '<div class="rt-ctx-header">';
  html +=   '<span class="rt-ctx-h-ico" aria-hidden="true">' + domain.icon + '</span>';
  html +=   '<span class="rt-ctx-h-title">' + _esc(domain.title) + '</span>';
  html +=   '<button type="button" class="rt-ctx-h-add" data-action="add" aria-label="إضافة عملية مالية" title="إضافة">+</button>';
  html += '</div>';

  // ── Views ──
  html += '<section class="rt-ctx-section" aria-label="العرض">';
  html +=   '<header class="rt-ctx-section-h">العرض</header>';
  for (const v of VIEWS) {
    html += '<a class="rt-ctx-item" data-view="' + v.id + '" href="' + _esc(v.deepLink) + '" data-deep-link="' + _esc(v.deepLink) + '">';
    html +=   '<span class="rt-ctx-item-ico" aria-hidden="true">' + v.ico + '</span>';
    html +=   '<span class="rt-ctx-item-lbl">' + _esc(v.label) + '</span>';
    html += '</a>';
  }
  html += '</section>';

  // ── Quick Actions ──
  html += '<section class="rt-ctx-section" aria-label="إجراءات سريعة">';
  html +=   '<header class="rt-ctx-section-h">إجراءات سريعة</header>';
  for (const a of QUICK_ACTIONS) {
    html += '<button type="button" class="rt-ctx-item" data-action="' + _esc(a.id) + '" data-handler="' + _esc(a.handler) + '">';
    html +=   '<span class="rt-ctx-item-ico" aria-hidden="true">' + a.ico + '</span>';
    html +=   '<span class="rt-ctx-item-lbl">' + _esc(a.label) + '</span>';
    html += '</button>';
  }
  html += '</section>';

  // ── Signals (placeholder) ──
  html += '<section class="rt-ctx-section" aria-label="تنبيهات">';
  html +=   '<header class="rt-ctx-section-h">تنبيهات</header>';
  for (const s of SIGNALS_PLACEHOLDER) {
    const cls = s.kind === 'warn' ? 'warn' : (s.kind === 'crit' ? 'crit' : '');
    html += '<div class="rt-ctx-item" aria-disabled="true" style="cursor:default">';
    html +=   '<span class="rt-ctx-item-ico" aria-hidden="true">' + s.ico + '</span>';
    html +=   '<span class="rt-ctx-item-lbl">' + _esc(s.label) + '</span>';
    html +=   '<span class="rt-ctx-item-cnt ' + cls + '">' + _esc(s.count) + '</span>';
    html += '</div>';
  }
  html += '</section>';

  // ── Recent (placeholder) ──
  html += '<section class="rt-ctx-section" aria-label="الأخيرة">';
  html +=   '<header class="rt-ctx-section-h">الأخيرة</header>';
  html +=   '<div class="rt-ctx-placeholder">يُملأ تلقائياً من نشاطك (قريباً)</div>';
  html += '</section>';

  container.innerHTML = html;

  // ── Wire view clicks → navigate workspace iframe ──
  container.querySelectorAll('[data-deep-link]').forEach(link => {
    link.addEventListener('click', (e) => {
      // ctrl/cmd/middle click → let browser open in new tab (default)
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const url = link.dataset.deepLink;
      if (!url) return;
      // visual feedback
      container.querySelectorAll('[data-deep-link]').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      // navigate the active workspace iframe (or fallback to full nav)
      const shell = window.top?.B2CShell || window.B2CShell;
      if (shell && typeof shell.openInWorkspace === 'function') {
        shell.openInWorkspace(url);
      } else {
        // fallback (no shell) — open as full nav
        location.href = url;
      }
    });
  });

  // ── Wire quick-action buttons (placeholders for Phase 3) ──
  container.querySelectorAll('[data-handler]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const handler = btn.dataset.handler;
      console.info('[accounts:action]', handler, '— Phase 3 سيـ wire الـ handler الفعلي');
      _toast(btn.querySelector('.rt-ctx-item-lbl')?.textContent || 'إجراء', 'info');
    });
  });

  // ── Add button → toast placeholder ──
  container.querySelector('[data-action="add"]')?.addEventListener('click', () => {
    _toast('إضافة عملية مالية — Phase 3', 'info');
  });

  // ── Cleanup (no listeners to dispose explicitly — innerHTML overwrite handles it) ──
  return { dispose: () => { /* noop */ } };
}

// ── Mini toast helper (no shared deps) ──
function _toast(msg, kind) {
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
    t.style.cssText = 'padding:10px 16px;background:rgba(15,23,42,.92);color:#fff;border-radius:8px;font-size:13px;font-weight:600;font-family:"IBM Plex Sans Arabic",sans-serif;backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:90vw;text-align:center;';
    host.appendChild(t);
    setTimeout(() => t.style.opacity = '0', 2500);
    setTimeout(() => t.remove(), 3000);
  } catch (_) {}
}

// ── Auto-register on import ──
register('accounts', renderAccountsSidebar);

export { renderAccountsSidebar };
