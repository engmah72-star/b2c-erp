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
import { computeNavModel, topUsed } from './core/sidebar-model.js';
import * as signals from './core/runtime-shell/signals.js';
import * as signalsAgg from './core/runtime-shell/signals-aggregator.js';

// خريطة الشارات الحيّة: ملف الصفحة → [(domain, signalKey), ...] تُجمع.
// تعيد استخدام عدّادات signals-aggregator الموجودة (محدودة + آمنة للصلاحيات).
const BADGE_MAP = {
  'approvals.html':  [['accounts', 'pending-approvals']],
  'production.html': [['production', 'late']],
  'shipping.html':   [['shipping', 'late']],
  'clients.html':    [['clients', 'delayed']],
  'inbox.html':      [['inbox', 'unread']],
};

// ── Smart features state (نفس مفاتيح smart-sidebar → الحالة تنتقل بسلاسة) ──
const LS_FAV = 'sb_favorites_v1';
const LS_USE = 'sb_usage_v1';
const getFavs  = () => { try { return JSON.parse(localStorage.getItem(LS_FAV) || '[]'); } catch (_) { return []; } };
const setFavs  = (a) => { try { localStorage.setItem(LS_FAV, JSON.stringify(a)); } catch (_) {} };
const getUsage = () => { try { return JSON.parse(localStorage.getItem(LS_USE) || '{}'); } catch (_) { return {}; } };
const setUsage = (o) => { try { localStorage.setItem(LS_USE, JSON.stringify(o)); } catch (_) {} };
const pageKey  = (h) => (h || '').split('/').pop().split('?')[0].split('#')[0].toLowerCase();

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
      '.app-sb .nav-link[aria-current="page"]{font-weight:var(--fw-bold,700);}' +
      // search toolbar
      '.app-sb-tools{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.18);flex-shrink:0;}' +
      '.app-sb-search{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:5px 8px;}' +
      '.app-sb-search:focus-within{border-color:rgba(167,139,250,.45);}' +
      '.app-sb-search input{flex:1;background:transparent;border:none;outline:none;color:inherit;font-family:inherit;font-size:var(--fs-base);min-width:0;}' +
      '.app-sb-search input::placeholder{color:rgba(255,255,255,.35);}' +
      // star + flame
      '.app-sb .nav-link{position:relative;}' +
      '.app-sb-star{position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:var(--fs-sm);opacity:0;cursor:pointer;padding:4px 5px;border-radius:4px;color:rgba(255,255,255,.35);transition:opacity .15s,color .15s;z-index:2;line-height:1;}' +
      '.app-sb .nav-link:hover .app-sb-star{opacity:.65;}' +
      '.app-sb-star:hover{opacity:1!important;color:#fff;}' +
      '.app-sb-star.on{opacity:1;color:var(--y-amber,#fbbf24);}' +
      '.app-sb-flame{margin-inline-start:6px;font-size:var(--fs-xs);opacity:.85;}' +
      // search-hidden + collapsible + favorites
      '.app-sb .nav-link.hidden,.app-sb .nav-group.hidden{display:none!important;}' +
      '.app-sb .nav-group{cursor:pointer;user-select:none;}' +
      '.app-sb .nav-group.collapsed::after{content:" ◀";font-size:8px;opacity:.5;}' +
      '.app-sb-favs{padding:4px 0 6px;border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:4px;}' +
      '.app-sb-favs .nav-group{color:var(--y-amber,#fbbf24);opacity:.85;}' +
      '.app-sb-none{padding:14px 12px;color:rgba(255,255,255,.45);font-size:var(--fs-sm);text-align:center;font-style:italic;}' +
      // live count badge
      '.app-sb-badge{margin-inline-start:6px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;' +
      'background:var(--p,#a78bfa);color:#fff;font-size:var(--fs-xs,11px);font-weight:700;' +
      'display:inline-flex;align-items:center;justify-content:center;line-height:1;vertical-align:middle;}';
    document.head.appendChild(st);
  }

  _renderShell(roleLabel, name) {
    const initial = ((name || '').trim().charAt(0) || 'U').toUpperCase();
    this.innerHTML =
      '<aside class="sidenav app-sb">' +
        '<div class="nav-brand"><div class="nav-logo" aria-hidden="true">🎨</div><div>' +
          '<div class="nav-brand-name">Business2Card</div>' +
          '<div class="nav-brand-role" id="app-sb-role">' + esc(roleLabel) + '</div></div></div>' +
        '<div class="app-sb-tools"><div class="app-sb-search">' +
          '<span aria-hidden="true">🔍</span>' +
          '<input type="text" placeholder="ابحث في القائمة..." aria-label="بحث في القائمة">' +
        '</div></div>' +
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
    if (linksEl) { linksEl.innerHTML = html; this._enhance(linksEl); this._wireBadges(linksEl); }
  }

  // ── Live count badges (reuse signals-aggregator — bounded + permission-safe) ──
  _wireBadges(linksEl) {
    try { signalsAgg.start(); } catch (_) {}        // idempotent (guarded by _started)
    const apply = () => {
      linksEl.querySelectorAll('a.nav-link').forEach(a => {
        if (a.closest('.app-sb-favs')) return;       // favorites clones excluded
        const file = (a.getAttribute('href') || '').split('/').pop();
        const keys = BADGE_MAP[file];
        let badge = a.querySelector('.app-sb-badge');
        if (!keys) { badge?.remove(); return; }
        const total = keys.reduce((s, [d, k]) => s + (signals.getMetric(d, k) || 0), 0);
        if (total > 0) {
          if (!badge) { badge = document.createElement('span'); badge.className = 'app-sb-badge'; a.appendChild(badge); }
          badge.textContent = total > 99 ? '99+' : String(total);
          badge.setAttribute('aria-label', total + ' عنصر يحتاج إجراء');
        } else if (badge) { badge.remove(); }
      });
    };
    apply();
    if (this._badgeUnsub) { try { this._badgeUnsub(); } catch (_) {} }
    this._badgeUnsub = signals.onChange(() => apply());
  }

  // ── Smart features (search · favorites · usage flames · collapsible) ──
  _enhance(linksEl) {
    const favs = getFavs();
    const top3 = topUsed(getUsage(), 3);

    // idempotent: شيل أي favs/نجوم/شعلات سابقة قبل إعادة البناء
    linksEl.querySelector('.app-sb-favs')?.remove();
    linksEl.querySelectorAll('.app-sb-star, .app-sb-flame').forEach(x => x.remove());

    linksEl.querySelectorAll('a.nav-link').forEach(a => {
      const key = pageKey(a.getAttribute('href') || '');
      if (!key) return;
      // click → usage tracking (مرة واحدة لكل رابط)
      if (!a.dataset.tracked) {
        a.dataset.tracked = '1';
        a.addEventListener('click', () => {
          const u = getUsage(); u[key] = (u[key] || 0) + 1; setUsage(u);
        });
      }
      // star (favorite toggle)
      const star = document.createElement('span');
      star.className = 'app-sb-star' + (favs.includes(key) ? ' on' : '');
      star.textContent = '⭐';
      star.title = 'إضافة إلى المفضّلة';
      star.setAttribute('role', 'button');
      star.setAttribute('aria-label', 'إضافة إلى المفضّلة');
      star.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const cur = getFavs(); const i = cur.indexOf(key);
        if (i >= 0) cur.splice(i, 1); else cur.push(key);
        setFavs(cur); this._enhance(linksEl);   // re-render features only
      });
      a.appendChild(star);
      // usage flame
      if (top3.includes(key)) {
        const f = document.createElement('span');
        f.className = 'app-sb-flame'; f.textContent = '🔥'; f.title = 'من الأكثر استخداماً';
        f.setAttribute('aria-hidden', 'true');
        a.appendChild(f);
      }
    });

    // favorites shortcut section (rebuilt each enhance)
    linksEl.querySelector('.app-sb-favs')?.remove();
    if (favs.length) {
      const sec = document.createElement('div');
      sec.className = 'app-sb-favs';
      sec.innerHTML = '<div class="nav-group">⭐ المفضّلة</div>';
      favs.forEach(key => {
        const orig = linksEl.querySelector(`a.nav-link[href$="${key}"]`);
        if (!orig) return;
        const clone = orig.cloneNode(true);
        clone.classList.remove('active'); clone.removeAttribute('aria-current');
        clone.querySelectorAll('.app-sb-star, .app-sb-flame').forEach(x => x.remove());
        sec.appendChild(clone);
      });
      linksEl.insertBefore(sec, linksEl.firstChild);
    }

    // collapsible groups (keyboard accessible) — skip favorites label
    linksEl.querySelectorAll('.nav-group').forEach(g => {
      if (g.closest('.app-sb-favs') || g.dataset.bound) return;
      g.dataset.bound = '1';
      g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0'); g.setAttribute('aria-expanded', 'true');
      const toggle = () => {
        const col = g.classList.toggle('collapsed');
        g.setAttribute('aria-expanded', String(!col));
        let s = g.nextElementSibling;
        while (s && !s.classList.contains('nav-group')) {
          if (s.classList.contains('nav-link')) s.style.display = col ? 'none' : '';
          s = s.nextElementSibling;
        }
      };
      g.addEventListener('click', toggle);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });

    // wire search (once)
    const input = this.querySelector('.app-sb-search input');
    if (input && !input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('input', () => this._filter(linksEl, input.value.trim().toLowerCase()));
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; this._filter(linksEl, ''); } });
    }
  }

  _filter(linksEl, q) {
    let visible = 0;
    linksEl.querySelectorAll('a.nav-link').forEach(a => {
      if (a.closest('.app-sb-favs')) return;   // favorites shortcuts excluded from filtering
      const hit = !q || (a.textContent || '').toLowerCase().includes(q);
      a.classList.toggle('hidden', !hit);
      if (hit) visible++;
    });
    // hide group headers whose items are all hidden
    linksEl.querySelectorAll('.nav-group').forEach(g => {
      if (g.closest('.app-sb-favs')) return;
      let s = g.nextElementSibling, any = false;
      while (s && !s.classList.contains('nav-group')) {
        if (s.classList.contains('nav-link') && !s.classList.contains('hidden')) any = true;
        s = s.nextElementSibling;
      }
      g.classList.toggle('hidden', !any);
    });
    let none = linksEl.querySelector('.app-sb-none');
    if (q && visible === 0) {
      if (!none) { none = document.createElement('div'); none.className = 'app-sb-none'; none.textContent = '— لا نتائج —'; linksEl.appendChild(none); }
    } else if (none) { none.remove(); }
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
