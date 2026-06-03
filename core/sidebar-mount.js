// ════════════════════════════════════════════════════════════════════
// core/sidebar-mount.js — CENTRAL SIDEBAR (مصدر واحد لكل الصفحات)
// ════════════════════════════════════════════════════════════════════
// يبني الـ sidebar الكامل (brand + أقسام مجمّعة + footer) على أي صفحة فيها
// <aside class="sidenav">، من المصدر المركزي:
//   - window.SIDEBAR_PAGES  (sidebar-config.js)
//   - window.B2CSidebar.build (sidebar.js) → الأقسام المجمّعة في #nav-links
//
// يلغي الحاجة لأي باني sidebar محلي مكرّر في الصفحات (buildDynamicSidebar...).
//
// التحميل (بعد sidebar-config.js + sidebar.js):
//   <script type="module" src="core/sidebar-mount.js?v=1"></script>
// ════════════════════════════════════════════════════════════════════
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { ROLE_PAGES } from './permissions-matrix.js';

// ── Expose canonical role→pages defaults to the plain-script world ──
// sidebar.js (plain IIFE، لا يستطيع import) يستخدمها كـ fallback عندما تكون
// users/{uid}.permissions.pages مفقودة (مستخدمون قدام). يُضبط هنا وقت تقييم
// الـ module (sync) فيكون جاهزاً قبل أي build/guard. المصدر الوحيد يبقى
// permissions-matrix — لا تكرار.
try { if (typeof window !== 'undefined' && !window.ROLE_PAGES) window.ROLE_PAGES = ROLE_PAGES; } catch (_) {}

const CUR = (location.pathname.split('/').pop() || '').toLowerCase();
const SKIP = ['login.html', 'client-login.html', 'client-portal.html', 'waybill.html',
  'order-tracking.html', 'chat.html', '404.html', 'offline.html', ''];

const ROLE_LABELS = {
  admin: 'مدير عام', operation_manager: 'مدير تشغيل', customer_service: 'خدمة عملاء',
  graphic_designer: 'مصمم', design_operator: 'منفّذ تصميم', production_agent: 'إنتاج',
  shipping_officer: 'شحن', wallet_manager: 'محاسب',
};

// logout مركزي — أي footer يستخدمه
window.appLogout = () => { try { signOut(auth); } finally { location.href = 'login.html'; } };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function mount(ud) {
  const aside = document.querySelector('.sidenav');
  if (!aside) return;
  const name = ud.name || '';
  const initial = (name.trim().charAt(0) || 'U').toUpperCase();
  const roleLabel = ROLE_LABELS[ud.role] || ud.role || '';
  aside.innerHTML =
    '<div class="nav-brand"><div class="nav-logo">🎨</div><div>'
    + '<div class="nav-brand-name">Business2Card</div>'
    + '<div class="nav-brand-role" id="role-badge">' + esc(roleLabel) + '</div></div></div>'
    + '<div class="nav-scroll" id="nav-links"></div>'
    + '<div class="nav-foot"><div class="nav-user" onclick="appLogout()">'
    + '<div class="nav-avatar" id="nav-av">' + esc(initial) + '</div>'
    + '<div><div class="nav-user-name" id="nav-name">' + esc(name) + '</div>'
    + '<div class="nav-user-role">تسجيل خروج</div></div></div></div>';
  // الأقسام المجمّعة (الرئيسية/الأوردرات/الإدارة) عبر الباني المركزي
  buildLinks(ud);

  // حارس مركزي (MutationObserver): لو أي باني محلي قديم (مهما كان اسمه/توقيته)
  // كتب قائمة مسطّحة فوق المركزي، نعيد فرض المجمّع فوراً. self-stabilizing:
  // build() بيضيف .nav-group → الـ observer يشوفها → ما يعملش حاجة (مفيش loop).
  // ده يضمن المركزي يكسب على كل الصفحات بدون حذف البواني المحلية واحدة واحدة.
  try {
    const links = document.getElementById('nav-links');
    if (links && !window.__sbGuard) {
      window.__sbGuard = true;
      let fixing = false;
      const obs = new MutationObserver(() => {
        if (fixing) return;
        const el = document.getElementById('nav-links');
        if (el && !el.querySelector('.nav-group')) {
          fixing = true;
          buildLinks(ud);
          fixing = false;
        }
      });
      obs.observe(links, { childList: true, subtree: true });
      // أوقف المراقبة بعد 8 ثوانٍ — بعدها كل البواني المحلية الـ async خلصت
      setTimeout(() => { try { obs.disconnect(); } catch (_) {} }, 8000);
    }
  } catch (_) {}
}

function buildLinks(ud) {
  try {
    if (window.B2CSidebar && typeof window.B2CSidebar.build === 'function') {
      window.B2CSidebar.build(ud, CUR);
    }
  } catch (e) { try { console.warn('[sidebar-mount] build failed', e); } catch (_) {} }
}

if (!SKIP.includes(CUR)) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    let d = {};
    try {
      const s = await getDoc(doc(db, 'users', user.uid));
      d = s.exists() ? s.data() : {};
    } catch (_) {}
    mount({ role: d.role || 'customer_service', permissions: d.permissions || {}, name: d.name || user.email });
  });
}
