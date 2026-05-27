// core/bottom-sheet.js
// Reusable bottom-sheet primitive — mobile-first, RTL-aware, accessible.
//
// Usage:
//   import { openBottomSheet } from './core/bottom-sheet.js';
//   openBottomSheet({
//     title: 'تواصل مع العميل',
//     items: [
//       { icon: '📞', label: 'اتصال', variant: 'primary', onClick: () => location.href='tel:01000000000' },
//       { icon: '💬', label: 'واتساب', hint: '01000000000', variant: 'success', href: 'https://wa.me/...' },
//       { icon: '🗑', label: 'حذف', variant: 'danger', onClick: () => handleDelete(), disabled: !isAdmin },
//     ],
//     cancelLabel: 'إلغاء',
//   });
//
// The sheet auto-closes after an item is clicked unless onClick returns
// `false` (which signals "keep open"). Esc + backdrop click also close.

let __activeSheet = null;
let __escHandler = null;

function ensureStylesheet() {
  if (document.getElementById('bsheet-styles')) return;
  const link = document.createElement('link');
  link.id = 'bsheet-styles';
  link.rel = 'stylesheet';
  link.href = './core/bottom-sheet.css';
  document.head.appendChild(link);
}

function escape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildItemEl(item, index, closeFn) {
  const variant = item.variant ? `is-${escape(item.variant)}` : '';
  const disabled = item.disabled ? 'disabled aria-disabled="true"' : '';
  const tag = item.href && !item.disabled ? 'a' : 'button';
  const href = tag === 'a' ? `href="${escape(item.href)}"` : 'type="button"';
  const target = item.target ? `target="${escape(item.target)}"` : '';
  const rel = item.target === '_blank' ? 'rel="noopener noreferrer"' : '';
  const hint = item.hint ? `<div class="bsheet-item-hint">${escape(item.hint)}</div>` : '';
  const ico = item.icon ? `<div class="bsheet-item-ico" aria-hidden="true">${escape(item.icon)}</div>` : '';

  const wrap = document.createElement('div');
  wrap.innerHTML = `<${tag} class="bsheet-item ${variant}" ${href} ${target} ${rel} ${disabled} data-bsheet-idx="${index}">
    ${ico}
    <div class="bsheet-item-text">
      <div class="bsheet-item-label">${escape(item.label || '')}</div>
      ${hint}
    </div>
  </${tag}>`;
  const el = wrap.firstElementChild;

  if (!item.disabled) {
    el.addEventListener('click', (ev) => {
      if (typeof item.onClick === 'function') {
        let keepOpen = false;
        try { keepOpen = item.onClick(ev) === false; }
        catch (e) { console.warn('[bottom-sheet] item.onClick threw', e); }
        if (!keepOpen && !item.href) closeFn();
      } else if (item.href) {
        // Native navigation will happen; close after a tick so the link fires.
        setTimeout(closeFn, 0);
      } else {
        closeFn();
      }
    });
  }
  return el;
}

export function openBottomSheet({
  title = '',
  subtitle = '',
  items = [],
  cancelLabel = 'إلغاء',
  onClose = null,
} = {}) {
  // Close any existing sheet first.
  if (__activeSheet) closeBottomSheet();
  ensureStylesheet();

  const ov = document.createElement('div');
  ov.className = 'bsheet-ov';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  if (title) ov.setAttribute('aria-label', title);

  const sheet = document.createElement('div');
  sheet.className = 'bsheet';

  const grabber = document.createElement('div');
  grabber.className = 'bsheet-grabber';
  grabber.setAttribute('aria-hidden', 'true');
  sheet.appendChild(grabber);

  if (title) {
    const t = document.createElement('div');
    t.className = 'bsheet-title';
    t.textContent = title;
    sheet.appendChild(t);
  }
  if (subtitle) {
    const s = document.createElement('div');
    s.className = 'bsheet-subtitle';
    s.textContent = subtitle;
    sheet.appendChild(s);
  }
  if (title || subtitle) {
    const d = document.createElement('div');
    d.className = 'bsheet-divider';
    sheet.appendChild(d);
  }

  const list = document.createElement('div');
  list.className = 'bsheet-items';
  sheet.appendChild(list);

  const closeFn = () => closeBottomSheet();

  let lastSection = null;
  items.forEach((it, i) => {
    if (!it) return;
    if (it.section && it.section !== lastSection) {
      const lbl = document.createElement('div');
      lbl.className = 'bsheet-section-label';
      lbl.textContent = it.section;
      list.appendChild(lbl);
      lastSection = it.section;
    }
    list.appendChild(buildItemEl(it, i, closeFn));
  });

  if (cancelLabel) {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'bsheet-cancel';
    cancel.textContent = cancelLabel;
    cancel.addEventListener('click', closeFn);
    sheet.appendChild(cancel);
  }

  ov.appendChild(sheet);
  // Backdrop click closes (but not clicks inside sheet).
  ov.addEventListener('click', (e) => { if (e.target === ov) closeFn(); });

  document.body.appendChild(ov);

  // Force reflow then open (so transition triggers).
  void ov.offsetHeight;
  ov.classList.add('open');

  __escHandler = (e) => { if (e.key === 'Escape') closeFn(); };
  document.addEventListener('keydown', __escHandler);

  __activeSheet = { ov, sheet, onClose };
  return { close: closeFn };
}

export function closeBottomSheet() {
  if (!__activeSheet) return;
  const { ov, onClose } = __activeSheet;
  ov.classList.remove('open');
  if (__escHandler) {
    document.removeEventListener('keydown', __escHandler);
    __escHandler = null;
  }
  const a = __activeSheet;
  __activeSheet = null;
  setTimeout(() => {
    try { ov.remove(); } catch (_) {}
    if (typeof onClose === 'function') {
      try { onClose(); } catch (e) { console.warn('[bottom-sheet] onClose threw', e); }
    }
  }, 220);
}

// Expose globally for inline event handlers.
try {
  window.openBottomSheet = openBottomSheet;
  window.closeBottomSheet = closeBottomSheet;
} catch (_) {}
