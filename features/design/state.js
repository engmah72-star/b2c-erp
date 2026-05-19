/**
 * features/design/state.js
 *
 * Module-scoped state container للـ design feature بـ pub/sub بسيط.
 * يحل محل الـ globals الـ ~11 على window في الصفحات القديمة
 * (__assignedDesign, __unassignedDesign, __myUid, __refFile, ...).
 *
 * لا framework — Object.assign + Set من listeners.
 *
 * الاستخدام:
 *   import { getState, setState, subscribe } from './state.js';
 *   const off = subscribe('orders', (orders) => render(orders));
 *   setState({ orders: [...] });
 *   off();  // cleanup عند dispose view
 */

const _state = {
  // ── Auth/User context ──
  user: null,           // Firebase auth user
  userDoc: null,        // users/{uid} doc data
  role: null,           // userDoc.role
  userPerms: null,      // userDoc.permissions
  employeeId: null,     // users.employeeId or resolved
  myUid: null,

  // ── Orders data ──
  orders: [],           // كل الأوردرات في scope الحالي
  assignedOrders: [],   // المسند للمصمم (لو scope=mine)
  unassignedOrders: [], // بدون مصمم (لو scope=all)

  // ── Design items (workspace) ──
  designItems: [],      // كل design_items في view الحالي
  currentOrderItems: [], // بنود الأوردر المفتوح

  // ── Lookups ──
  clients: [],
  products: [],
  designers: [],
  printers: [],
  wallets: [],

  // ── Workspace specifics ──
  clientDecisions: [],
  galleryItems: [],

  // ── Dashboard specifics ──
  attendance: [],
  tasks: [],
  myGoals: null,
  myEvaluations: [],
  myPayments: [],

  // ── UI state ──
  currentView: null,    // 'kanban' | 'workspace' | 'portfolio' | 'dashboard'
  openOrderId: null,
  filters: {},
};

const _listeners = new Map(); // key → Set<callback>

// ══ Public API ════════════════════════════════════════════

export function getState(key) {
  if (key === undefined) return { ..._state };
  return _state[key];
}

/**
 * تحديث state. ينشر فقط للمفاتيح المتغيرة.
 * patch: object — مفاتيح فقط (لا nested updates).
 */
export function setState(patch) {
  const changed = [];
  for (const key in patch) {
    if (_state[key] !== patch[key]) {
      _state[key] = patch[key];
      changed.push(key);
    }
  }
  for (const key of changed) _notify(key);
}

/**
 * اشترك في تغييرات مفتاح واحد.
 * يرجّع دالة unsubscribe.
 */
export function subscribe(key, callback) {
  if (!_listeners.has(key)) _listeners.set(key, new Set());
  _listeners.get(key).add(callback);
  return () => {
    const set = _listeners.get(key);
    if (set) set.delete(callback);
  };
}

/**
 * استدعاء كل listeners الـ key الواحد.
 */
function _notify(key) {
  const set = _listeners.get(key);
  if (!set) return;
  for (const cb of set) {
    try { cb(_state[key]); }
    catch (e) { console.error(`[state] listener for "${key}" threw:`, e); }
  }
}

/**
 * تنظيف كل الـ subscribers (للاستخدام عند unmount كامل).
 */
export function resetSubscribers() {
  _listeners.clear();
}

/**
 * Debug helper — لا تستخدمه في production code.
 */
export function _debug() {
  return {
    state: { ..._state },
    listenerKeys: [..._listeners.keys()],
    counts: Object.fromEntries(
      [..._listeners.entries()].map(([k, v]) => [k, v.size])
    ),
  };
}
