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
// ROLES
// ═══════════════════════════════════════
export const ROLES = {
  admin:            { label:'Admin',           ico:'👑', col:'#a78bfa' },
  operation_manager:{ label:'Ops Manager',     ico:'📋', col:'#3b9eff' },
  customer_service: { label:'Cust. Service',   ico:'💬', col:'#22d3ee' },
  graphic_designer: { label:'Designer',        ico:'✏️', col:'#a78bfa' },
  design_operator:  { label:'Design Supervisor', ico:'⚙️', col:'#ffaa00' },
  production_agent: { label:'Production',      ico:'🏭', col:'#ff3d6e' },
  shipping_officer: { label:'Shipping',        ico:'🚚', col:'#22d3ee' },
  wallet_manager:   { label:'Wallet Mgr',      ico:'💰', col:'#00d97e' },
};

// Which pages each role can access
// ملاحظة: 'approvals' مفتوح للجميع — فيها إنشاء الطلبات + تأكيد الاستلام
export const ROLE_PAGES = {
  admin:            ['clients','design','production','print','shipping','accounts','approvals','products','suppliers','reports','employees','role-viewer','suggestions-admin','settings','returns','marketplace'],
  operation_manager:['clients','design','production','print','shipping','approvals','suppliers','reports','employees','role-viewer','suggestions-admin','returns','marketplace'],
  customer_service: ['clients','design','approvals','returns'],
  graphic_designer: ['design','approvals'],
  design_operator:  ['design','approvals','suppliers'],
  production_agent: ['production','print','approvals'],
  shipping_officer: ['print','shipping','approvals','returns'],
  wallet_manager:   ['accounts','approvals','returns'],
};

// ═══════════════════════════════════════
// WORKFLOW ENGINE
// ═══════════════════════════════════════
export const STAGES = {
  'design_pending':  { label:'تصميم',       ico:'✏️',  col:'#a78bfa', next:'design_approved',  page:'design',      badge:'bg-p' },
  'design_approved': { label:'اعتمد',       ico:'✅',  col:'#00d97e', next:'production',        page:'production',  badge:'bg-g' },
  'production':      { label:'تنفيذ',       ico:'🏭',  col:'#ff3d6e', next:'printing',          page:'print',       badge:'bg-r' },
  'printing':        { label:'طباعة',       ico:'🖨️', col:'#ffaa00', next:'ready',             page:'print',       badge:'bg-y' },
  'ready':           { label:'جاهز',        ico:'📦',  col:'#3b9eff', next:'shipped',           page:'shipping',    badge:'bg-b' },
  'shipped':         { label:'شحن',         ico:'🚚',  col:'#22d3ee', next:'delivered',         page:'shipping',    badge:'bg-c' },
  'delivered':       { label:'تسليم',       ico:'🎉',  col:'#00d97e', next:'archived',          page:'archive',     badge:'bg-g' },
  'archived':        { label:'أرشيف',       ico:'📁',  col:'#4e5672', next:null,                page:'archive',     badge:'bg-d' },
  'cancelled':       { label:'ملغي',        ico:'✕',   col:'#4e5672', next:null,                page:null,          badge:'bg-d' },
};

// Who can advance each stage
export const STAGE_PERMISSIONS = {
  'design_pending':  ['admin','operation_manager','design_operator','graphic_designer'],
  'design_approved': ['admin','operation_manager','design_operator'],
  'production':      ['admin','operation_manager','production_agent'],
  'printing':        ['admin','operation_manager','production_agent','customer_service'],
  'ready':           ['admin','operation_manager','shipping_officer'],
  'shipped':         ['admin','operation_manager','shipping_officer'],
  'delivered':       ['admin','operation_manager'],
  'archived':        ['admin'],
};

/**
 * Advance order to next stage
 */
export async function advanceOrder(orderId, currentStage, userRole) {
  const stage = STAGES[currentStage];
  if (!stage?.next) throw new Error('لا توجد مرحلة تالية');
  if (!STAGE_PERMISSIONS[currentStage]?.includes(userRole)) {
    throw new Error('ليس لديك صلاحية تقدم هذه المرحلة');
  }
  const now = nowStr();
  await updateDoc(doc(db, 'orders', orderId), {
    stage:   stage.next,
    [`stage_${stage.next}_at`]: now,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Get orders for a specific page/stage
 */
export function getOrdersForPage(orders, page, userRole, userId) {
  return orders.filter(o => {
    const stage = STAGES[o.stage];
    if (!stage) return false;

    // Graphic designer only sees own orders
    if (userRole === 'graphic_designer') {
      return o.designerId === userId && stage.page === page;
    }
    // Production agent only sees production+printing
    if (userRole === 'production_agent') {
      return ['production','printing','ready'].includes(o.stage);
    }
    // Shipping officer only sees ready+shipped
    if (userRole === 'shipping_officer') {
      return ['ready','shipped'].includes(o.stage);
    }
    return stage.page === page;
  });
}

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
// shipping-lite.html keep working without modification.
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
  await signOut(auth);
  window.location.href = 'login.html';
}

// ═══════════════════════════════════════
// DATA LISTENERS — subscribe once, share everywhere
// ═══════════════════════════════════════
// S0-8 FIX: Bounded listeners. كانت تُحمَّل collections كاملة بدون حد →
// عند 50k order = browser hang + Firestore reads bill explosion.
// الآن: limit مفروض على collections الكبيرة (orders, clients).
// products + wallets صغيرة طبعيًا (عشرات/مئات) — لا limit.
//
// الـ caller يقدر يخصّص الحدود عبر opts:
//   startListeners({...}, { orderLimit: 500, clientLimit: 300 })
// أو يمكنه أن يعطّل listener معين عبر opts.skip = ['orders', ...] لو
// الصفحة تستخدم repository بديل.
export function startListeners(callbacks = {}, opts = {}) {
  const subs = [];
  const orderLimit  = opts.orderLimit  || 200;
  const clientLimit = opts.clientLimit || 200;
  const skip = new Set(opts.skip || []);

  // Clients — bounded. الـ "آخر 200 عميل" يكفي للـ dropdown lookups والـ
  // dashboards. الصفحات اللي تحتاج العملاء كاملين (clients.html, reports)
  // تستخدم paginated queries محلية.
  if (!skip.has('clients')) {
    subs.push(onSnapshot(
      query(collection(db,'clients'), orderBy('createdAt','desc'), limit(clientLimit)),
      snap => {
        AppState.clients = snap.docs.map(d => ({...d.data(), _id: d.id}));
        callbacks.onClients?.(AppState.clients);
      }
    ));
  }

  // Orders (unified collection) — bounded. أهم إصلاح أداء.
  // الـ archived و cancelled مستبعدة لتقليل الـ payload (هم >50% عادة).
  if (!skip.has('orders')) {
    subs.push(onSnapshot(
      query(collection(db,'orders'), orderBy('createdAt','desc'), limit(orderLimit)),
      snap => {
        AppState.orders = snap.docs.map(d => ({...d.data(), _id: d.id}));
        callbacks.onOrders?.(AppState.orders);
      }
    ));
  }

  // Products — لا limit (عادة < 200 منتج). لو نمت → نضيف limit لاحقاً.
  if (!skip.has('products')) {
    subs.push(onSnapshot(query(collection(db,'products_v2'), orderBy('name','asc')), snap => {
      AppState.products = snap.docs.map(d => ({...d.data(), _id: d.id}));
      callbacks.onProducts?.(AppState.products);
    }));
  }

  // Wallets — لا limit (عشرات في كل الأحوال).
  if (!skip.has('wallets')) {
    subs.push(onSnapshot(query(collection(db,'wallets'), orderBy('name','asc')), snap => {
      AppState.wallets = snap.docs.map(d => ({...d.data(), _id: d.id}));
      callbacks.onWallets?.(AppState.wallets);
    }));
  }

  // Settings — doc واحدة، آمنة.
  if (!skip.has('settings')) {
    subs.push(onSnapshot(doc(db,'settings','main'), snap => {
      if (snap.exists()) AppState.settings = snap.data();
      callbacks.onSettings?.(AppState.settings);
    }));
  }

  AppState._unsubs = subs;
  return () => subs.forEach(u => u());
}

// S0-8 PART 2: Auto-cleanup عند navigation/unload لتفادي memory leak.
// الصفحات SPA-like (التي تستبدل URL بدون reload) ترث listeners قديمة.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try { (AppState._unsubs || []).forEach(u => u?.()); } catch(_){}
  }, { once: true });
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
    { key:'marketplace',ico:'🏛️', label:'المنصة (Marketplace)' },
    { key:'products',   ico:'◈',  label:'المنتجات' },
    { key:'suppliers',  ico:'▣',  label:'الموردين' },
    { key:'employees',  ico:'👥', label:'الموظفين' },
    { key:'role-viewer', ico:'🔍', label:'معاينة الأدوار' },
    { key:'reports',    ico:'📊', label:'التقارير' },
    { key:'suggestions-admin', ico:'💡', label:'اقتراحات الموظفين' },
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
      <button class="mob-menu-btn" onclick="toggleMobMenu()">☰</button>
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
