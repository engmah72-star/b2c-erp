/**
 * features/design/repository.js
 *
 * Single source لكل Firestore queries في feature التصميم (RULE G4).
 * كل listener يحتوي limit() مفروض (RULE G3).
 * كل query تدعم tenant scoping عبر optional `tenantId` param (RULE G7).
 *
 * Conventions:
 *   - كل subscribe* يرجّع unsubscribe function
 *   - كل subscribe* يأخذ onUpdate callback يتلقى array/object
 *   - الأخطاء تُنشَر عبر onError optional callback (وإلا console.error)
 *
 * الاستخدام (مثال):
 *   const off = subscribeDesignOrders({
 *     scope: 'mine',
 *     uid: currentUser.uid,
 *     onUpdate: (orders) => setState({ orders }),
 *   });
 *   // ... لاحقاً عند unmount:
 *   off();
 */

import { db } from '../../core/firebase-init.js';
import {
  collection, doc, getDoc, getDocs,
  onSnapshot, query, where, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ══ Defaults — يخدمون G3 (bounded listeners) ════════════
export const LIMITS = Object.freeze({
  orders: 200,
  unassigned: 100,
  items: 500,
  perOrderItems: 100,
  clientDecisions: 200,
  gallery: 300,
  attendance: 60,
  goals: 12,
  evaluations: 24,
  payments: 100,
  tasks: 100,
  designers: 50,
  printers: 50,
  clients: 1500,
  products: 500,
  wallets: 50,
  employees: 200,
});

// ══ Helpers ══════════════════════════════════════════════
function _snapHandler(onUpdate, onError) {
  return [
    (snap) => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      try { onUpdate(arr); } catch (e) { console.error('[repository] onUpdate threw:', e); }
    },
    (err) => {
      if (onError) onError(err);
      else console.error('[repository] snapshot error:', err);
    },
  ];
}

function _tenantFilter(tenantId) {
  return tenantId ? [where('tenantId', '==', tenantId)] : [];
}

// ════════════════════════════════════════════════════════════════════
//  ORDERS — Design stage
// ════════════════════════════════════════════════════════════════════

/**
 * Subscribe to design-stage orders.
 * scope:
 *   'all'        → كل الأوردرات في stage=design (admin/CS view)
 *   'mine'       → designerId == uid (designer view)
 *   'unassigned' → بدون designerId (admin panel للأوردرات المتاحة)
 */
export function subscribeDesignOrders({
  scope = 'all', uid = null, tenantId = null,
  max, onUpdate, onError,
}) {
  const ordersRef = collection(db, 'orders');
  const conds = [where('stage', '==', 'design'), ..._tenantFilter(tenantId)];

  if (scope === 'mine') {
    if (!uid) throw new Error('subscribeDesignOrders: scope=mine requires uid');
    conds.push(where('designerId', '==', uid));
  }

  const q = query(
    ordersRef,
    ...conds,
    orderBy('createdAt', 'desc'),
    limit(max || (scope === 'unassigned' ? LIMITS.unassigned : LIMITS.orders)),
  );

  const [next, err] = _snapHandler((arr) => {
    // الـ unassigned filter client-side (لا index لـ designerId is null)
    const out = scope === 'unassigned'
      ? arr.filter(o => !o.designerId)
      : arr;
    onUpdate(out);
  }, onError);

  return onSnapshot(q, next, err);
}

/**
 * Get a single order document (one-off read).
 */
export async function getOrder(orderId) {
  const snap = await getDoc(doc(db, 'orders', orderId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ════════════════════════════════════════════════════════════════════
//  DESIGN ITEMS — workspace entity
// ════════════════════════════════════════════════════════════════════

/**
 * Subscribe to design_items.
 * scope:
 *   'all'         → كل البنود (admin/library view)
 *   'mine'        → designerId == uid
 *   'perOrder'    → orderDocId == orderId (للأوردر المفتوح)
 *   'perClient'   → clientId == clientId (للمكتبة لعميل واحد)
 */
export function subscribeDesignItems({
  scope = 'all', uid = null, orderDocId = null, clientId = null, tenantId = null,
  max, onUpdate, onError,
}) {
  const itemsRef = collection(db, 'design_items');
  const conds = [..._tenantFilter(tenantId)];

  if (scope === 'mine') {
    if (!uid) throw new Error('subscribeDesignItems: scope=mine requires uid');
    conds.push(where('designerId', '==', uid));
  } else if (scope === 'perOrder') {
    if (!orderDocId) throw new Error('subscribeDesignItems: scope=perOrder requires orderDocId');
    conds.push(where('orderDocId', '==', orderDocId));
  } else if (scope === 'perClient') {
    if (!clientId) throw new Error('subscribeDesignItems: scope=perClient requires clientId');
    conds.push(where('clientId', '==', clientId));
  }

  const q = query(
    itemsRef,
    ...conds,
    orderBy('updatedAt', 'desc'),
    limit(max || (scope === 'perOrder' ? LIMITS.perOrderItems : LIMITS.items)),
  );

  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

// ════════════════════════════════════════════════════════════════════
//  CLIENT DECISIONS — workspace
// ════════════════════════════════════════════════════════════════════

export function subscribeClientDecisions({
  processed = false, tenantId = null,
  max, onUpdate, onError,
}) {
  const q = query(
    collection(db, 'client_decisions'),
    where('processed', '==', processed),
    ..._tenantFilter(tenantId),
    orderBy('createdAt', 'desc'),
    limit(max || LIMITS.clientDecisions),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

// ════════════════════════════════════════════════════════════════════
//  GALLERY — public + portfolio
// ════════════════════════════════════════════════════════════════════

export function subscribeGallery({
  visibleOnly = true, tenantId = null,
  max, onUpdate, onError,
}) {
  const conds = [..._tenantFilter(tenantId)];
  if (visibleOnly) conds.push(where('isVisible', '==', true));

  const q = query(
    collection(db, 'gallery'),
    ...conds,
    orderBy('publishedAt', 'desc'),
    limit(max || LIMITS.gallery),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

// ════════════════════════════════════════════════════════════════════
//  ATTENDANCE — designer dashboard + design header
// ════════════════════════════════════════════════════════════════════

export function subscribeAttendance({
  uid, max, onUpdate, onError,
}) {
  if (!uid) throw new Error('subscribeAttendance requires uid');
  const q = query(
    collection(db, 'attendance'),
    where('employeeUid', '==', uid),
    orderBy('checkInAt', 'desc'),
    limit(max || LIMITS.attendance),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

// ════════════════════════════════════════════════════════════════════
//  EMPLOYEE — goals / evaluations / payments
//  (designer-dashboard اليوم يقرأ كل employees collection بدون داعٍ)
// ════════════════════════════════════════════════════════════════════

/**
 * Resolve employee id لـ user معيّن — بدون قراءة كل employees collection.
 * Strategy:
 *   1) users.{uid}.employeeId (لو موجود)
 *   2) employees where authUid==uid (limit 1)
 */
export async function getEmployeeIdForUser(uid, userDoc = null) {
  if (userDoc?.employeeId) return userDoc.employeeId;
  const qy = query(
    collection(db, 'employees'),
    where('authUid', '==', uid),
    limit(1),
  );
  const snap = await getDocs(qy);
  return snap.empty ? null : snap.docs[0].id;
}

export function subscribeEmployeeGoals({
  employeeId, monthKey,
  onUpdate, onError,
}) {
  if (!employeeId || !monthKey) throw new Error('subscribeEmployeeGoals requires employeeId + monthKey');
  const q = query(
    collection(db, 'employee_goals'),
    where('employeeId', '==', employeeId),
    where('monthKey', '==', monthKey),
    limit(LIMITS.goals),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

export function subscribeEmployeeEvaluations({
  employeeId, max, onUpdate, onError,
}) {
  if (!employeeId) throw new Error('subscribeEmployeeEvaluations requires employeeId');
  const q = query(
    collection(db, 'employee_evaluations'),
    where('employeeId', '==', employeeId),
    orderBy('createdAt', 'desc'),
    limit(max || LIMITS.evaluations),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

export function subscribeEmployeePayments({
  employeeId, max, onUpdate, onError,
}) {
  if (!employeeId) throw new Error('subscribeEmployeePayments requires employeeId');
  const q = query(
    collection(db, 'employee_payments'),
    where('employeeId', '==', employeeId),
    orderBy('createdAt', 'desc'),
    limit(max || LIMITS.payments),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

// ════════════════════════════════════════════════════════════════════
//  TASKS — designer dashboard
// ════════════════════════════════════════════════════════════════════

export function subscribeMyTasks({
  uid, max, onUpdate, onError,
}) {
  if (!uid) throw new Error('subscribeMyTasks requires uid');
  const q = query(
    collection(db, 'tasks'),
    where('assignedTo', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(max || LIMITS.tasks),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

// ════════════════════════════════════════════════════════════════════
//  LOOKUPS — designers / printers / clients / products / wallets
// ════════════════════════════════════════════════════════════════════

export function subscribeDesigners({ tenantId = null, max, onUpdate, onError }) {
  const q = query(
    collection(db, 'employees'),
    where('role', 'in', ['graphic_designer', 'design_operator']),
    ..._tenantFilter(tenantId),
    limit(max || LIMITS.designers),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

export function subscribePrinters({ tenantId = null, max, onUpdate, onError }) {
  const q = query(
    collection(db, 'employees'),
    where('role', '==', 'production_agent'),
    ..._tenantFilter(tenantId),
    limit(max || LIMITS.printers),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

export function subscribeClients({ tenantId = null, max, onUpdate, onError }) {
  const q = query(
    collection(db, 'clients'),
    ..._tenantFilter(tenantId),
    orderBy('createdAt', 'desc'),
    limit(max || LIMITS.clients),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

export function subscribeProducts({ tenantId = null, max, onUpdate, onError }) {
  const q = query(
    collection(db, 'products_v2'),
    ..._tenantFilter(tenantId),
    orderBy('name', 'asc'),
    limit(max || LIMITS.products),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

export function subscribeWallets({ tenantId = null, max, onUpdate, onError }) {
  const q = query(
    collection(db, 'wallets'),
    ..._tenantFilter(tenantId),
    orderBy('name', 'asc'),
    limit(max || LIMITS.wallets),
  );
  return onSnapshot(q, ..._snapHandler(onUpdate, onError));
}

// ════════════════════════════════════════════════════════════════════
//  USER doc
// ════════════════════════════════════════════════════════════════════

export async function getUserDoc(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
