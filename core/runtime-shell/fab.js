// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Mobile FAB (Phase 7)
// ════════════════════════════════════════════════════════════════════
//
// Floating Action Button — يظهر فقط على mobile (max-width:768px).
// يـ swap الـ primary action بحسب الـ active domain.
// كل domain يقدر يحدّد primaryAction في config (icon, label, handler).
//
// Position: fixed bottom-left (RTL = visually left، logical end).
// مساحة فوق الـ rail (bottom-bar) + safe area.
//
// API:
//   init({ container })
//   show(config)  → config: { icon, label, handler, kind? }
//   hide()
// ════════════════════════════════════════════════════════════════════

let _container = null;
let _btn = null;
let _currentConfig = null;

const TOAST_TIMEOUT = 2500;

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function _toast(msg) {
  try {
    const doc = document;
    let host = doc.getElementById('rt-toast-host');
    if (!host) {
      host = doc.createElement('div');
      host.id = 'rt-toast-host';
      host.style.cssText = 'position:fixed;bottom:140px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
      doc.body.appendChild(host);
    }
    const t = doc.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'padding:10px 16px;background:rgba(15,23,42,.92);color:#fff;border-radius:8px;font-size:13px;font-weight:600;font-family:"IBM Plex Sans Arabic",sans-serif;backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:90vw;text-align:center;transition:opacity .3s;';
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; }, TOAST_TIMEOUT);
    setTimeout(() => t.remove(), TOAST_TIMEOUT + 500);
  } catch (_) {}
}

export function init({ container }) {
  if (!container) throw new Error('[rt-fab] container required');
  _container = container;
  _btn = document.createElement('button');
  _btn.type = 'button';
  _btn.className = 'rt-fab';   // class-based visibility (no hidden attr)
  _btn.setAttribute('aria-label', '');
  _btn.style.display = 'none';  // explicit initial hidden
  _btn.addEventListener('click', _onClick);
  _container.appendChild(_btn);
}

function _onClick(e) {
  e.preventDefault();
  if (!_currentConfig) return;
  // visual: scale press
  _btn.classList.add('press');
  setTimeout(() => _btn.classList.remove('press'), 180);
  try {
    if (typeof _currentConfig.handler === 'function') {
      _currentConfig.handler();
    } else {
      // string handler → dispatch a real action intent to the workspace
      // (Phase 3). Falls back to a toast if the page hasn't been ported.
      console.info('[rt-fab:action]', _currentConfig.handler);
      const label = _currentConfig.label || 'إجراء';
      const bus = (window.top && window.top.B2CActionBus) || window.B2CActionBus;
      if (bus && typeof bus.dispatch === 'function' && _currentConfig.handler) {
        bus.dispatch(_currentConfig.domain || null, _currentConfig.handler, { label }).then((handled) => {
          if (!handled) _toast(label + ' — قريباً');
        });
      } else {
        _toast(label + ' — قريباً');
      }
    }
  } catch (err) {
    console.warn('[rt-fab] handler error', err);
  }
}

export function show(config) {
  if (!_btn) return;
  if (!config || !config.icon) { hide(); return; }
  _currentConfig = config;
  const cls = config.kind === 'primary' ? '' : (config.kind ? ' rt-fab-' + config.kind : '');
  _btn.className = 'rt-fab rt-fab-visible' + cls;
  _btn.innerHTML = '<span class="rt-fab-ico" aria-hidden="true">' + (config.icon || '+') + '</span>';
  _btn.setAttribute('aria-label', _esc(config.label || 'إجراء'));
  _btn.setAttribute('title', _esc(config.label || ''));
  _btn.style.display = '';  // let CSS take over
}

export function hide() {
  if (!_btn) return;
  _btn.classList.remove('rt-fab-visible');
  _btn.style.display = 'none';
  _currentConfig = null;
}
