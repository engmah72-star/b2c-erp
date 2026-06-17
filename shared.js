/**
 * Business2Card ERP v4 — Shared Engine
 * Central Firebase, Auth, State, Workflow, Permissions
 */

// ── Theme Engine (Light/Dark/Auto) — يُحمَّل أولاً ليطبق الـ theme قبل أي rendering ──
// theme.js يطبّق الاختيار المحفوظ في localStorage على <html data-theme="...">
// ويحقن زر التبديل تلقائيًا في .topbar-right لكل الصفحات بدون تعديل HTML.
import './theme.js';

import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, doc,
  onSnapshot, addDoc, updateDoc, deleteDoc, getDoc,
  query, orderBy, serverTimestamp, getDocs, where, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ═══════════════════════════════════════
// FIREBASE — Single Source via core/firebase-init.js (RULE G2)
// ═══════════════════════════════════════
// shared.js يعتمد الآن على core/firebase-init.js كـ singleton مصدر لـ
// app/auth/db/storage. الصفحات القديمة لا تحتاج تعديل لأن shared.js يُعيد
// التصدير. الصفحات الجديدة يجب أن تستورد مباشرة من core/firebase-init.js.
import { app as _coreApp, auth as _coreAuth, db as _coreDb, storage as _coreStorage } from './core/firebase-init.js';
export const app = _coreApp;
export const auth = _coreAuth;
export const db = _coreDb;
export const storage = _coreStorage;

// ═══════════════════════════════════════
// ROLES — re-export من المصدر الوحيد (orders.js) — RULE C1.5
// ═══════════════════════════════════════
// لا نعرّف ROLES هنا. المصدر الوحيد في orders.js.
// نستوردها للـ local scope (renderSidebar يحتاجها) ونعيد التصدير معًا.
import { ROLES } from './orders.js';
export { ROLES };

// Which pages each role can access
// ملاحظة: 'approvals' مفتوح للجميع — فيها إنشاء الطلبات + تأكيد الاستلام
export const ROLE_PAGES = {
  admin:            ['clients','design','production','print','shipping','accounts','approvals','products','suppliers','reports','employees','role-viewer','settings','returns'],
  operation_manager:['clients','design','production','print','shipping','approvals','suppliers','reports','employees','role-viewer','returns'],
  customer_service: ['clients','design','approvals','returns'],
  graphic_designer: ['design','approvals'],
  design_operator:  ['design','approvals','suppliers'],
  production_agent: ['production','print','approvals'],
  shipping_officer: ['print','shipping','approvals','returns'],
  wallet_manager:   ['accounts','approvals','returns'],
};

// ═══════════════════════════════════════
// WORKFLOW ENGINE — موجود في orders.js (المصدر الوحيد)
// ═══════════════════════════════════════
// تم حذف STAGES / STAGE_PERMISSIONS / advanceOrder / getOrdersForPage
// التي كانت معرَّفة هنا بقيم legacy متعارضة (design_pending, design_approved,
// ready, shipped, delivered) ولم تكن مستخدَمة من أي صفحة.
// المصدر الوحيد الآن: orders.js (RULE C1.5 + قاعدة Central Constants).
// لو احتجت STAGES أو STAGE_PERMISSIONS: import { STAGES } from './orders.js'.

// ═══════════════════════════════════════
// PERMISSIONS ENGINE
// ═══════════════════════════════════════
// G9 Incremental Migration: المصدر الوحيد لـ DEFAULT_PERMISSIONS و
// SENSITIVE_FIELDS هو core/permissions-matrix.js. هنا نُعيد التصدير فقط
// للحفاظ على التوافق مع الصفحات القديمة (`import { DEFAULT_PERMISSIONS } from './shared.js'`).
//
// RULE 8 — DATA ACCESS BOUNDARIES (انظر CLAUDE.md):
// - client_phone:   CS + Admin + Ops + Shipping فقط
// - design_data:    CS + Admin + Designer + Design Op + Production فقط
// - supplier_cost / price_cost / price_margin: ضمن SENSITIVE_FIELDS (fail-closed)
import {
  DEFAULT_PERMISSIONS as _DEFAULT_PERMISSIONS,
  canSeeField as _canSeeField,
  maskPhone as _maskPhone,
} from './core/permissions-matrix.js';

export const DEFAULT_PERMISSIONS = _DEFAULT_PERMISSIONS;
/**
 * Multi-tenant helper — الـ tenant الحالي للمستخدم.
 * Phase 1: الكل في merchant_001 (الشركة الأساسية).
 * Phase 2+: يُقرَأ من users.{uid}.tenantId.
 *
 * Usage:
 *   import { getCurrentTenantId, tenantFields } from './shared.js';
 *   const tid = getCurrentTenantId(userDoc);
 *   batch.set(ref, { ...data, ...tenantFields(tid) });
 */
export const DEFAULT_TENANT_ID = 'merchant_001';
export function getCurrentTenantId(userDoc) {
  return (userDoc && userDoc.tenantId) || DEFAULT_TENANT_ID;
}
export function tenantFields(tenantId) {
  return { tenantId: tenantId || DEFAULT_TENANT_ID };
}

// Backward-compat wrapper: shared.js's legacy signature is canSee(field, userPerms, userRole)
// while core/permissions-matrix.js uses canSeeField(field, userRole, userPerms).
// Keep the legacy order stable so existing call sites in approvals.html, returns.html,
// shipping.html keep working without modification.
export function canSee(field, userPerms, userRole) {
  return _canSeeField(field, userRole, userPerms);
}

// Re-export maskPhone from core (same signature, no transformation needed).
export const maskPhone = _maskPhone;

// Expose masking helper to non-module pages (legacy HTML that loads shared.js as a regular script)
if (typeof window !== 'undefined') {
  window.maskPhone = maskPhone;
  window.canSeeField = canSee;
}

// ═══════════════════════════════════════
// GLOBAL APP STATE
// ═══════════════════════════════════════
export const AppState = {
  currentUser:  null,
  currentRole:  'customer_service',
  userPerms:    {},
  userName:     '',
  // cached data
  clients:      [],
  orders:       [],
  products:     [],
  wallets:      [],
  settings:     {},
  // listeners cleanup
  _unsubs:      [],
};

// Expose AppState to non-module siblings (e.g. ai-launcher) that can't
// import shared.js without re-running its side effects.
if (typeof window !== 'undefined') window.AppState = AppState;

// Pages call setOpenEntity when the user focuses a row/panel/modal so the
// floating AI knows which entity to talk about. Cleared on panel close.
// type ∈ {'order','client','supplier','employee'}; doc is the in-memory
// document so the launcher avoids an extra Firestore round-trip.
AppState.openEntity = null;
AppState.setOpenEntity = function(type, id, doc) {
  AppState.openEntity = (type && id) ? { type, id, doc: doc || null } : null;
};
AppState.clearOpenEntity = function() { AppState.openEntity = null; };

// ═══════════════════════════════════════
// AUTH MANAGER
// ═══════════════════════════════════════
export function initAuth(onReady, onUnauth) {
  onAuthStateChanged(auth, async user => {
    if (!user) { onUnauth?.(); return; }

    AppState.currentUser = user;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const d = snap.data();
      AppState.currentRole = d.role || 'customer_service';
      AppState.userPerms   = d.permissions || {};
      AppState.userName    = d.name || user.email;
    }

    // Native shell (Capacitor) — register for APNs/FCM and wire status bar.
    // No-op on the web; module is fetched lazily so it doesn't ship to web users.
    if (globalThis.Capacitor?.isNativePlatform?.()) {
      import('./mobile-bridge.js')
        .then(m => m.initNativeBridge(app, user))
        .catch(e => console.warn('[native-bridge] load failed:', e?.message || e));
    }

    onReady?.(AppState);
  });
}

export async function logout() {
  AppState._unsubs.forEach(u => u?.());
  dataCache.unsubscribeAll();
  await signOut(auth);
  window.location.href = 'login.html';
}

// ═══════════════════════════════════════
// DATA LISTENERS — subscribe once, share everywhere
// ═══════════════════════════════════════
// Cache-first pattern: يعرض البيانات من الكاش فوراً عند فتح النظام،
// ثم يزامن مع Firestore في الخلفية عبر onSnapshot.
// الكاش = طبقة أداء فقط. قاعدة البيانات = المصدر الوحيد للحقيقة.
//
// S0-8 FIX: Bounded listeners. limit مفروض على كل query (RULE G3).
//
// الـ caller يقدر يخصّص الحدود عبر opts:
//   startListeners({...}, { orderLimit: 500, clientLimit: 300 })
// أو يمكنه أن يعطّل listener معين عبر opts.skip = ['orders', ...] لو
// الصفحة تستخدم repository بديل.
//
// opts.useCache (default: true): تفعيل الكاش. false = السلوك القديم (onSnapshot فقط).
import { startListenersWithCache, dataCache } from './core/data-cache.js';

export function startListeners(callbacks = {}, opts = {}) {
  const useCache = opts.useCache !== false;

  if (useCache) {
    return startListenersWithCache(AppState, callbacks, opts);
  }

  // === السلوك القديم بدون كاش (fallback) ===
  const subs = [];
  const orderLimit  = opts.orderLimit  || 200;
  const clientLimit = opts.clientLimit || 200;
  const skip = new Set(opts.skip || []);

  if (!skip.has('clients')) {
    subs.push(onSnapshot(
      query(collection(db,'clients'), orderBy('createdAt','desc'), limit(clientLimit)),
      snap => {
        AppState.clients = snap.docs.map(d => ({...d.data(), _id: d.id}));
        callbacks.onClients?.(AppState.clients);
      }
    ));
  }

  if (!skip.has('orders')) {
    const ordersQuery = opts.orderStage
      ? query(collection(db,'orders'), where('stage','==',opts.orderStage), orderBy('createdAt','desc'), limit(orderLimit))
      : query(collection(db,'orders'), orderBy('createdAt','desc'), limit(orderLimit));
    subs.push(onSnapshot(
      ordersQuery,
      snap => {
        AppState.orders = snap.docs.map(d => ({...d.data(), _id: d.id}));
        callbacks.onOrders?.(AppState.orders);
      }
    ));
  }

  const productLimit = opts.productLimit || 500;
  if (!skip.has('products')) {
    subs.push(onSnapshot(query(collection(db,'products_v2'), orderBy('name','asc'), limit(productLimit)), snap => {
      AppState.products = snap.docs.map(d => ({...d.data(), _id: d.id}));
      callbacks.onProducts?.(AppState.products);
    }));
  }

  const walletLimit = opts.walletLimit || 100;
  if (!skip.has('wallets')) {
    subs.push(onSnapshot(query(collection(db,'wallets'), orderBy('name','asc'), limit(walletLimit)), snap => {
      AppState.wallets = snap.docs.map(d => ({...d.data(), _id: d.id}));
      callbacks.onWallets?.(AppState.wallets);
    }));
  }

  if (!skip.has('settings')) {
    subs.push(onSnapshot(doc(db,'settings','main'), snap => {
      if (snap.exists()) AppState.settings = snap.data();
      callbacks.onSettings?.(AppState.settings);
    }));
  }

  AppState._unsubs = subs;
  return () => subs.forEach(u => u());
}

export { dataCache };

// S0-8 PART 2: Auto-cleanup عند navigation/unload لتفادي memory leak.
// الصفحات SPA-like (التي تستبدل URL بدون reload) ترث listeners قديمة.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try {
      (AppState._unsubs || []).forEach(u => u?.());
      dataCache.unsubscribeAll();
    } catch(_){}
  }, { once: true });
}

// ═══════════════════════════════════════
// GLOBAL MODAL ERGONOMICS — auto-applied
// ═══════════════════════════════════════
// قاعدة UX موحَّدة على مستوى النظام:
//   • Escape يغلق الـ overlay الأعلى المفتوح
//   • الضغط على الخلفية (خارج .modal) يغلق الـ overlay
//   • Enter داخل input في modal يستدعي الزر الأساسي في .modal-foot
//   • Auto-focus لأول text input عند فتح modal
// كل ذلك بدون تعديل الصفحات.
//
// الـ logic مكرَّر في ux-globals.js (يُحمَّل من sidebar-config.js على
// 35+ صفحة). الـ guard window.__b2cUxGlobals يمنع double-registration
// عند تحميل الملفين معاً.
//
// Convention الـ footer (موجودة بالفعل في كل الصفحات):
//   .modal-foot → buttons من الـ left:
//     btn.btn-ghost (إلغاء) … btn.btn-g/btn-r/btn-b/btn-y (الأساسي = آخر زر)
const PRIMARY_INPUT_TYPES = new Set([
  'text','number','email','tel','password','url','search','date','time',
  'datetime-local','month','week',
]);
const SKIP_INPUT_TYPES = new Set(['hidden','checkbox','radio','submit','button','file','image','reset','range','color']);
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__b2cUxGlobals) {
  window.__b2cUxGlobals = true;

  // Click on the backdrop (the .overlay element itself, not its children) → close
  document.addEventListener('click', e => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('overlay') && t.classList.contains('open')) {
      t.classList.remove('open');
    }
  });

  // Escape → close the most recently opened .overlay
  // Enter inside an input in an open modal → invoke the primary action button
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const opened = document.querySelectorAll('.overlay.open');
      if (!opened.length) return;
      opened[opened.length - 1].classList.remove('open');
      return;
    }
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    const type = (t.type || 'text').toLowerCase();
    if (!PRIMARY_INPUT_TYPES.has(type)) return;
    const overlay = t.closest('.overlay.open');
    if (!overlay) return;
    const foot = overlay.querySelector('.modal-foot');
    if (!foot) return;
    const buttons = foot.querySelectorAll('button:not([disabled])');
    let primary = null;
    for (let i = buttons.length - 1; i >= 0; i--) {
      if (!buttons[i].classList.contains('btn-ghost')) { primary = buttons[i]; break; }
    }
    if (!primary) return;
    e.preventDefault();
    primary.click();
  });

  // Auto-focus the first text-like input when an overlay opens.
  function _autoFocusFirstInput(overlay) {
    requestAnimationFrame(() => {
      if (!overlay.classList.contains('open')) return;
      const active = document.activeElement;
      if (active && overlay.contains(active) && active.tagName !== 'BODY') return;
      if (overlay.querySelector('[autofocus]')) return;
      const cands = overlay.querySelectorAll('input, textarea');
      for (const el of cands) {
        if (el.disabled || el.readOnly) continue;
        if (el.offsetParent === null) continue;
        if (el.tagName === 'INPUT' && SKIP_INPUT_TYPES.has((el.type || 'text').toLowerCase())) continue;
        try { el.focus(); } catch (_) {}
        return;
      }
    });
  }
  const _classObserver = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
      const el = m.target;
      const wasOpen = (m.oldValue || '').split(/\s+/).includes('open');
      const isOpen = el.classList.contains('open');
      if (!wasOpen && isOpen && el.classList.contains('overlay')) _autoFocusFirstInput(el);
    }
  });
  function _attach(el) {
    _classObserver.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
  }
  function _bootObservers() {
    document.querySelectorAll('.overlay').forEach(_attach);
    new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList && node.classList.contains('overlay')) _attach(node);
          if (node.querySelectorAll) node.querySelectorAll('.overlay').forEach(_attach);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootObservers, { once: true });
  } else {
    _bootObservers();
  }
}

// ═══════════════════════════════════════
// ORDER OPERATIONS
// ═══════════════════════════════════════
export async function createOrder(data) {
  const id = 'ORD-' + Date.now().toString().slice(-8);
  const ref = await addDoc(collection(db, 'orders'), {
    ...data, id,
    stage:     'design_pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    stage_design_pending_at: nowStr(),
  });
  return ref.id;
}

export async function updateOrder(orderId, data) {
  await updateDoc(doc(db, 'orders', orderId), {
    ...data, updatedAt: serverTimestamp()
  });
}

// ═══════════════════════════════════════
// SIDEBAR — renders itself from role
// ═══════════════════════════════════════
export function renderSidebar(activePage) {
  const role  = AppState.currentRole;
  const pages = ROLE_PAGES[role] || [];
  const r     = ROLES[role] || ROLES.customer_service;

  const NAV_ITEMS = [
    { key:'clients',    ico:'👤', label:'العملاء' },
    { key:'design',     ico:'✏️', label:'التصميم' },
    { key:'production', ico:'🏭', label:'التنفيذ' },
    { key:'print',      ico:'🖨️',label:'الطباعة' },
    { key:'shipping',   ico:'🚚', label:'الشحن' },
    { key:'accounts',   ico:'💰', label:'الحسابات' },
    { key:'approvals',  ico:'🔐', label:'الاعتمادات' },
    { key:'returns',    ico:'↩️',  label:'المرتجعات' },
    { key:'products',   ico:'◈',  label:'المنتجات' },
    { key:'suppliers',  ico:'▣',  label:'الموردين' },
    { key:'employees',  ico:'👥', label:'الموظفين' },
    { key:'role-viewer', ico:'🔍', label:'معاينة الأدوار' },
    { key:'reports',    ico:'📊', label:'التقارير' },
    { key:'settings',   ico:'⚙️', label:'الإعدادات' },
  ];

  const nav = document.querySelector('.sidenav');
  if (!nav) return;

  const allowed = NAV_ITEMS.filter(n => pages.includes(n.key));

  nav.innerHTML = `
    <div class="nav-brand">
      <div class="nav-logo">🎨</div>
      <div>
        <div class="nav-brand-name">Business2Card</div>
        <div class="nav-brand-role" style="background:${r.col}18;color:${r.col}">${r.label}</div>
      </div>
    </div>
    <div class="nav-scroll">
      ${allowed.map(n => `
        <a class="nav-link ${n.key === activePage ? 'active' : ''}"
           href="${n.key}.html">
          <span class="nav-ico">${n.ico}</span>
          ${n.label}
        </a>`).join('')}
    </div>
    <div class="nav-foot">
      <div class="nav-user" onclick="window.appLogout()">
        <div class="nav-avatar" style="background:${r.col}20;color:${r.col}">
          ${AppState.userName[0]?.toUpperCase() || 'U'}
        </div>
        <div>
          <div class="nav-user-name">${AppState.userName}</div>
          <div class="nav-user-role">تسجيل خروج</div>
        </div>
      </div>
    </div>
  `;

  window.appLogout = logout;
}

// ═══════════════════════════════════════
// TOPBAR
// ═══════════════════════════════════════
export function renderTopbar(title, subtitle, actions = '') {
  const el = document.querySelector('.topbar');
  if (!el) return;
  el.innerHTML = `
    <div class="topbar-left">
      <button type="button" class="mob-menu-btn" onclick="toggleMobMenu()">☰</button>
      <div>
        <h1>${title}</h1>
        ${subtitle ? `<p>${subtitle}</p>` : ''}
      </div>
    </div>
    <div class="topbar-right">${actions}</div>
  `;
}

// ═══════════════════════════════════════
// MOBILE MENU
// ═══════════════════════════════════════
export function initMobileMenu() {
  window.toggleMobMenu = function() {
    document.querySelector('.sidenav')?.classList.toggle('mob-open');
  };
  // close on outside click
  document.addEventListener('click', e => {
    const nav = document.querySelector('.sidenav');
    if (nav?.classList.contains('mob-open') && !nav.contains(e.target)) {
      nav.classList.remove('mob-open');
    }
  });
}

// ═══════════════════════════════════════
// TOAST
// ═══════════════════════════════════════
export function toast(msg, type = '') {
  let container = document.getElementById('toasts');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toasts';
    container.id = 'toasts';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ═══════════════════════════════════════
// MODAL HELPERS
// ═══════════════════════════════════════
export function openModal(id) {
  document.getElementById('ov-' + id)?.classList.add('open');
}
export function closeModal(id) {
  document.getElementById('ov-' + id)?.classList.remove('open');
}
export function initModals() {
  document.querySelectorAll('.overlay').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target === el) el.classList.remove('open');
    });
  });
}

// ═══════════════════════════════════════
// UTILS
// ═══════════════════════════════════════
export function nowStr() {
  return new Date().toLocaleDateString('ar-EG') + ' ' +
    new Date().toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});
}

export function fn(n) {
  return (parseFloat(n) || 0).toLocaleString('ar-EG');
}

export function gv(id) {
  return document.getElementById(id)?.value || '';
}

export function sv(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v;
}

export function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

export function calcDelay(dateStr, closedAt) {
  if (!dateStr || closedAt) return 0;
  const diff = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

export function isToday(ts) {
  if (!ts) return false;
  const d = ts.toDate?.() || new Date(ts);
  const t = new Date();
  return d.getDate()===t.getDate() && d.getMonth()===t.getMonth() && d.getFullYear()===t.getFullYear();
}

// Debounce helper — used by search inputs to avoid running an expensive
// render on every keystroke. ms=200 matches the human input cadence: fast
// enough to feel live, slow enough to skip ~80% of intermediate renders.
//
// Usage:
//   const onSearch = debounce(renderList, 200);
//   $('search').oninput = e => onSearch(e.target.value);
export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

if (typeof window !== 'undefined') window.debounce = debounce;

// ═══════════════════════════════════════
// WALLET OPERATIONS — REMOVED
// كانت هنا recordCollection/recordPayment كـ helpers مباشرة على wallets+transactions_v2،
// تم حذفها لمخالفتها RULE 2/3/5. للعمليات المالية استخدم financial-sync-engine.js.
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// STAGE BADGE HTML
// ═══════════════════════════════════════
export function stageBadge(stage) {
  const s = STAGES[stage] || STAGES['design_pending'];
  return `<span class="badge" style="background:${s.col}18;color:${s.col}">${s.ico} ${s.label}</span>`;
}

// ═══════════════════════════════════════
// PIPELINE HTML (for dashboard)
// ═══════════════════════════════════════
export function renderPipeline(orders, onStageClick) {
  const counts = {};
  Object.keys(STAGES).forEach(k => counts[k] = 0);
  orders.forEach(o => { if (counts[o.stage] !== undefined) counts[o.stage]++; });

  const mainStages = ['design_pending','design_approved','production','printing','ready','shipped','delivered'];

  return `<div class="pipeline">
    ${mainStages.map((key, i) => {
      const s = STAGES[key];
      const n = counts[key] || 0;
      return `
        <div class="pipe-step ${n > 0 ? 'has-items' : ''}" onclick="${onStageClick ? `(${onStageClick})('${key}')` : ''}">
          <div class="ps-ico">${s.ico}</div>
          <div class="ps-count" style="color:${s.col}">${n}</div>
          <div class="ps-name">${s.label}</div>
        </div>
        ${i < mainStages.length - 1 ? '<div class="pipe-arrow">←</div>' : ''}
      `;
    }).join('')}
  </div>`;
}

// Export db helpers for direct use
export { onSnapshot, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
         collection, doc, query, orderBy, serverTimestamp, where };
