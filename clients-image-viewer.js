/**
 * Business2Card ERP — clients-image-viewer.js
 *
 * ━━━ IMAGE LIGHTBOX FOR clients.html ━━━
 *
 * God-page decomposition PR-21 (RULE G5):
 * Full-screen image viewer with prev/next/close + keyboard navigation.
 * Previously inlined in clients.html (~52 lines markup + JS).
 *
 *   window.openImageViewer(idx, urls)
 *   window.closeImageViewer()
 *   window.imgViewerNav(dir)        dir: -1 (prev) / 1 (next)
 *
 * The module mounts its markup into <body> on DOMContentLoaded and
 * registers a keyboard handler (Esc / Arrow keys).
 */

const VIEWER_HTML = `
<div id="img-viewer" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)" onclick="if(event.target===this)window.closeImageViewer()">
  <div style="position:absolute;top:16px;right:16px;left:16px;display:flex;justify-content:space-between;align-items:center;z-index:2">
    <span id="iv-counter" style="color:#fff;font-size:var(--fs-md);font-weight:800;background:rgba(0,0,0,.4);padding:8px 14px;border-radius:99px">1 / 1</span>
    <div style="display:flex;gap:8px">
      <a id="iv-download" href="#" target="_blank" title="فتح في تبويب جديد" style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;display:flex;align-items:center;justify-content:center;font-size:var(--fs-2xl);text-decoration:none;backdrop-filter:blur(10px)">↗</a>
      <button onclick="window.closeImageViewer()" title="إغلاق" style="width:42px;height:42px;border-radius:50%;background:rgba(255,61,110,.2);border:1px solid rgba(255,61,110,.4);color:#fff;font-size:var(--fs-2xl);cursor:pointer;backdrop-filter:blur(10px)">✕</button>
    </div>
  </div>
  <img id="iv-img" src="" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);max-width:92vw;max-height:82vh;border-radius:12px;box-shadow:0 20px 80px rgba(0,0,0,.6);user-select:none;-webkit-user-drag:none">
  <button id="iv-prev" onclick="window.imgViewerNav(-1)" style="position:absolute;top:50%;right:16px;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:24px;cursor:pointer;backdrop-filter:blur(10px);font-weight:300">›</button>
  <button id="iv-next" onclick="window.imgViewerNav(1)" style="position:absolute;top:50%;left:16px;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:24px;cursor:pointer;backdrop-filter:blur(10px);font-weight:300">‹</button>
</div>
`;

function _ivRender() {
  const s = window.__ivState;
  const img = document.getElementById('iv-img');
  const counter = document.getElementById('iv-counter');
  const dl = document.getElementById('iv-download');
  const prev = document.getElementById('iv-prev');
  const next = document.getElementById('iv-next');
  if (img) img.src = s.urls[s.idx] || '';
  if (counter) counter.textContent = (s.idx + 1) + ' / ' + s.urls.length;
  if (dl) dl.href = s.urls[s.idx] || '#';
  if (prev) prev.style.display = s.urls.length > 1 ? '' : 'none';
  if (next) next.style.display = s.urls.length > 1 ? '' : 'none';
}

function mount() {
  if (document.getElementById('img-viewer')) return; // idempotent
  document.body.insertAdjacentHTML('beforeend', VIEWER_HTML);
}

if (typeof window !== 'undefined') {
  window.__ivState = window.__ivState || { urls: [], idx: 0 };

  window.openImageViewer = function (idx, urls) {
    if (!urls || !urls.length) return;
    window.__ivState = { urls, idx: idx || 0 };
    _ivRender();
    document.getElementById('img-viewer').style.display = 'block';
    document.body.style.overflow = 'hidden';
  };

  window.closeImageViewer = function () {
    const el = document.getElementById('img-viewer');
    if (el) el.style.display = 'none';
    document.body.style.overflow = '';
  };

  window.imgViewerNav = function (dir) {
    const s = window.__ivState;
    if (!s.urls.length) return;
    s.idx = (s.idx + dir + s.urls.length) % s.urls.length;
    _ivRender();
  };

  // Keyboard nav (Esc / Arrow keys) — same behavior as the in-page handler.
  document.addEventListener('keydown', (e) => {
    const v = document.getElementById('img-viewer');
    if (!v || v.style.display !== 'block') return;
    if (e.key === 'Escape')          window.closeImageViewer();
    else if (e.key === 'ArrowLeft')  window.imgViewerNav(1);
    else if (e.key === 'ArrowRight') window.imgViewerNav(-1);
  });

  // Mount markup on DOMContentLoaded (or now if DOM ready).
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
}
