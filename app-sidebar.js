// ════════════════════════════════════════════════════════════════════
// app-sidebar.js — Unified sidebar Web Component (PROTOTYPE · flag-gated)
// ════════════════════════════════════════════════════════════════════
// إثبات مفهوم لتوحيد السايد بار في مكوّن واحد مكتفٍ بذاته:
//   <app-sidebar current="employee-control.html"></app-sidebar>
//
// • يُفعَّل فقط خلف flag (?sb=v2 أو ?feat.sidebarV2=1 أو localStorage) —
//   الافتراضي مُطفأ، فالإنتاج يبقى على السايد بار الحالي تماماً (صفر تأثير).
// • يبني الروابط عبر المنطق النقي core/sidebar-model.js (مطابق لـ sidebar.js،
//   يضمنه parity test) — مصدر صلاحيات واحد عبر ROLE_PAGES.
// • عند التفعيل: يرسم <aside> خاصاً ويُخفي السايد بار القديم، فلا تنازع
//   (لا MutationObserver، لا دمج مزدوج) — يعالج جذر #4/#7.
// • a11y: <nav> landmark · aria-current للنشط · زر خروج بلوحة المفاتيح ·
//   درج موبايل بإغلاق Esc/overlay.
//
// ملف جديد لا يلمس أي من ملفات السايد بار الحالية (E1: alongside-not-instead).
// ════════════════════════════════════════════════════════════════════
import { auth, db } from './core/firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { ROLE_PAGES } from './core/permissions-matrix.js';
import { computeNavModel } from './core/sidebar-model.js';

const FLAG_ON = (() => {
  try {
    const qs = new URLSearchParams(location.search);
    if (qs.get('feat.sidebarV2') === '0') return false;       // explicit kill
    if (qs.get('sb') === 'v2' || qs.get('feat.sidebarV2') === '1') return true;
    return localStorage.getItem('feat.sidebarV2') === '1';
  } catch (_) { return false; }
})();

const ROLE_LABELS = {
  admin: 'مدير عام', operation_manager: 'مدير تشغيل', customer_service: 'خدمة عملاء',
  graphic_designer: 'مصمم', design_operator: 'منفّذ تصميم', production_agent: 'إنتاج',
  shipping_officer: 'شحن', wallet_manager: 'محاسب',
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function opsAdminPagesFlag() {
  try {
    const qs = new URLSearchParams(location.search || '');
    return (qs.get('feat.opsAdminPages') || localStorage.getItem('feat.opsAdminPages')) === '1';
  } catch (_) { return false; }
}

class AppSidebar extends HTMLElement {
  connectedCallback() {
    if (!FLAG_ON || this._mounted) return;   // flag off → no-op (legacy untouched)
    this._mounted = true;
    this._current = this.getAttribute('current') ||
      (location.pathname.split('/').pop() || '').replace(/\?.*/, '');
    this._injectStyles();
    this._renderShell('', '');               // skeleton until auth resolves
    onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      let d = {};
      try {
        const s = await getDoc(doc(db, 'users', user.uid));
        d = s.exists() ? s.data() : {};
      } catch (_) {}
      this._render({
        role: d.role || 'customer_service',
        permissions: d.permissions || {},
        name: d.name || user.email,
      });
    });
  }

  _injectStyles() {
    if (document.getElementById('app-sb-style')) return;
    const st = document.createElement('style');
    st.id = 'app-sb-style';
    // display:contents → الـ <aside> الداخلي يصير عنصر الـ grid مباشرةً.
    // وإخفاء السايد بار القديم عند التفعيل (لا تنازع بصري).
    st.textContent =
      'app-sidebar{display:contents;}' +
      'aside.sidenav:not(.app-sb){display:none!important;}' +
      '.app-sb-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99;opacity:0;' +
      'pointer-events:none;transition:opacity .25s;}' +
      '.app-sb-ov.show{opacity:1;pointer-events:auto;}' +
      '.app-sb .nav-link[aria-current="page"]{font-weight:var(--fw-bold,700);}';
    document.head.appendChild(st);
  }

  _renderShell(roleLabel, name) {
    const initial = ((name || '').trim().charAt(0) || 'U').toUpperCase();
    this.innerHTML =
      '<aside class="sidenav app-sb">' +
        '<div class="nav-brand"><div class="nav-logo" aria-hidden="true">🎨</div><div>' +
          '<div class="nav-brand-name">Business2Card</div>' +
          '<div class="nav-brand-role" id="app-sb-role">' + esc(roleLabel) + '</div></div></div>' +
        '<nav class="nav-scroll" id="app-sb-links" aria-label="القائمة الرئيسية"></nav>' +
        '<div class="nav-foot">' +
          '<div class="nav-user" role="button" tabindex="0" aria-label="تسجيل خروج">' +
            '<div class="nav-avatar" id="app-sb-av" aria-hidden="true">' + esc(initial) + '</div>' +
            '<div><div class="nav-user-name" id="app-sb-name">' + esc(name) + '</div>' +
            '<div class="nav-user-role">تسجيل خروج</div></div></div>' +
        '</div>' +
      '</aside>';
    this._wireChrome();
  }

  _render(ud) {
    this._renderShell(ROLE_LABELS[ud.role] || ud.role || '', ud.name || '');
    const model = computeNavModel(ud, this._current, {
      SIDEBAR_PAGES: window.SIDEBAR_PAGES || [],
      ROLE_HOME:     window.ROLE_HOME     || {},
      GROUP_LABELS:  window.GROUP_LABELS  || {},
      rolePages:     ROLE_PAGES,
      opsAdminPages: opsAdminPagesFlag(),
    });
    let html = '';
    for (const it of model.items) {
      if (it.type === 'group') {
        html += '<div class="nav-group">' + esc(it.label) + '</div>';
      } else {
        const active = it.active ? ' active' : '';
        const aria = it.active ? ' aria-current="page"' : '';
        html += '<a class="nav-link' + active + '" href="' + esc(it.file) + '"' + aria + '>' +
                '<span class="nav-ico" aria-hidden="true">' + (it.ico || '•') + '</span> ' +
                esc(it.label) + '</a>';
      }
    }
    const linksEl = this.querySelector('#app-sb-links');
    if (linksEl) linksEl.innerHTML = html;
  }

  _wireChrome() {
    const aside = this.querySelector('aside.sidenav');
    if (!aside) return;

    // ── logout (keyboard accessible) ──
    const userEl = this.querySelector('.nav-user');
    const logout = () => { try { signOut(auth); } finally { location.href = 'login.html'; } };
    userEl?.addEventListener('click', logout);
    userEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); logout(); }
    });

    // ── mobile drawer: نعيد توجيه toggleNav/closeNav العامين للسايد بار الجديد
    //    (الصفحة وزر ☰ بينادوهم) — متاح فقط أثناء التفعيل (flag on). ──
    let ov = document.querySelector('.app-sb-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'app-sb-ov';
      ov.addEventListener('click', () => this._close());
      document.body.appendChild(ov);
    }
    this._ov = ov;
    window.toggleNav = () => {
      const open = aside.classList.toggle('mob-open');
      ov.classList.toggle('show', open);
    };
    window.closeNav = () => this._close();
    // إغلاق بالضغط على رابط أو Esc
    aside.addEventListener('click', (e) => { if (e.target.closest('a.nav-link')) this._close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._close(); });
  }

  _close() {
    const aside = this.querySelector('aside.sidenav');
    if (aside) aside.classList.remove('mob-open');
    if (this._ov) this._ov.classList.remove('show');
  }
}

if (!customElements.get('app-sidebar')) {
  customElements.define('app-sidebar', AppSidebar);
}
