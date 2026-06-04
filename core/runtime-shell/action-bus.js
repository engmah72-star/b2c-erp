// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Action Bus (Phase 3)
// ════════════════════════════════════════════════════════════════════
//
// يحوّل الـ quick-actions في الـ context sidebar، زرّ الـ header "+"،
// والـ mobile FAB من مجرّد placeholders (toast "Phase 3") إلى نوايا
// (action intents) حقيقية تُرسَل للـ workspace iframe النشط.
//
// الصفحة تشترك بأن تستمع لـ 'b2c:runtime-action' وتنفّذ الـ action ثم تردّ
// بـ 'b2c:runtime-action-ack' { nonce }. الـ dispatcher يُرجِع:
//   true  → صفحة اعتمدت الـ action (هتنفّذه) → نقفل الدرج بدل الـ toast.
//   false → محدّش ردّ خلال المهلة → الـ caller يعرض fallback toast (السلوك القديم).
//
// Cross-frame protocol (مطابق لـ runtime-state.js):
//   shell → iframe :  { type:'b2c:runtime-action', domain, action, payload, nonce }
//   iframe → shell :  { type:'b2c:runtime-action-ack', nonce }
//
// E1 compliance: additive · reversible · backward-compatible.
//   الصفحات غير المرحَّلة لا ترد ACK أبداً → dispatch يُرجِع false → toast
//   (نفس سلوك اليوم). لا تعديل على stable core ولا كسر لأي مسار قائم.
// ════════════════════════════════════════════════════════════════════

const ACK_TIMEOUT_MS = 500;

let _wired = false;
let _seq = 0;
const _pending = new Map(); // nonce → { resolve, timer }

/**
 * Wire the ACK listener. Idempotent. Call once from shell.html after
 * window.B2CActionBus is exposed.
 */
export function init() {
  if (_wired || typeof window === 'undefined') return;
  _wired = true;
  window.addEventListener('message', (e) => {
    const data = e && e.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'b2c:runtime-action-ack') return;
    _resolvePending(data.nonce, true);
  });
}

/**
 * Dispatch a named action to every workspace frame. Resolves a Promise<boolean>:
 *   true  → a page acknowledged within ACK_TIMEOUT_MS (it will handle the action)
 *   false → nobody acknowledged (caller should show its fallback toast)
 *
 * @param {string} domain  active domain id (so the right page filters)
 * @param {string} action  action identifier (e.g. 'openAddClient')
 * @param {object} payload optional extra data passed to the page
 */
export function dispatch(domain, action, payload = {}) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !action) { resolve(false); return; }
    const nonce = 'act-' + (++_seq) + '-' + Date.now();
    const msg = { type: 'b2c:runtime-action', domain: domain || null, action, payload, nonce };

    let sent = false;
    let frames = [];
    try { frames = document.querySelectorAll('.rt-workspace-frame'); } catch (_) { frames = []; }
    for (const f of frames) {
      try {
        const cw = f.contentWindow;
        if (cw && typeof cw.postMessage === 'function') { cw.postMessage(msg, '*'); sent = true; }
      } catch (_) { /* cross-origin frame — skip */ }
    }

    if (!sent) { resolve(false); return; }
    const timer = setTimeout(() => _resolvePending(nonce, false), ACK_TIMEOUT_MS);
    _pending.set(nonce, { resolve, timer });
  });
}

function _resolvePending(nonce, value) {
  const p = _pending.get(nonce);
  if (!p) return;
  try { clearTimeout(p.timer); } catch (_) {}
  _pending.delete(nonce);
  p.resolve(value);
}

// ── test hook — reset internal state between cases (not used in prod) ──
export function _reset() {
  for (const p of _pending.values()) { try { clearTimeout(p.timer); } catch (_) {} }
  _pending.clear();
  _seq = 0;
  _wired = false;
}
