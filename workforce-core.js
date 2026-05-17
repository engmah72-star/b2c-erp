/**
 * Business2Card ERP — Workforce Core
 * طبقة الـ Workforce Network — الـ helper الموحد لتعيين الموظفين على الأوردرات.
 *
 * ───────────────────────────────────────────────────────────────────
 * BUSINESS DNA: Own the Network, Not the Assets.
 *
 * كل ربط موظف ↔ أوردر يمر من هنا. الفائدة:
 *  - مصدر واحد لمنطق التعيين (RULE 1 — Single Source of Truth for assignments)
 *  - سجل تاريخي كامل في /order_assignments (Phase 2 ready: شركاء خارجيين)
 *  - Phase 3 ready: assignments قابلة للتحول إلى open jobs في Marketplace
 *
 * الـ "active assignment" يبقى على /orders (designerId/productionAgent/shippingOfficerId)
 * عشان الـ queries السريعة + backward compatibility مع production.html و shipping.html.
 * هنا بنضيف entry في /order_assignments بالتوازي لكل تعيين/فك تعيين/تحويل.
 * ───────────────────────────────────────────────────────────────────
 */

import {
  collection, doc, addDoc, updateDoc, getDocs, getDoc, query, where, orderBy, limit,
  serverTimestamp, writeBatch, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ═══════════════════════════════════════
// ASSIGNMENT EVENT TYPES (RULE 2 — Event Driven)
// ═══════════════════════════════════════
export const WF_EVENT = Object.freeze({
  ASSIGNMENT_CREATED:     'ASSIGNMENT_CREATED',
  ASSIGNMENT_ACCEPTED:    'ASSIGNMENT_ACCEPTED',
  ASSIGNMENT_REJECTED:    'ASSIGNMENT_REJECTED',
  ASSIGNMENT_COMPLETED:   'ASSIGNMENT_COMPLETED',
  ASSIGNMENT_REASSIGNED:  'ASSIGNMENT_REASSIGNED',
  ASSIGNMENT_CANCELLED:   'ASSIGNMENT_CANCELLED',
  TASK_AUTO_GENERATED:    'TASK_AUTO_GENERATED',
});

export const WF_STAGE = Object.freeze({
  DESIGN:     'design',
  PRODUCTION: 'production',
  PRINTING:   'printing',
  SHIPPING:   'shipping',
});

export const WF_STATUS = Object.freeze({
  ASSIGNED:    'assigned',
  ACCEPTED:    'accepted',
  IN_PROGRESS: 'in_progress',
  DONE:        'done',
  REASSIGNED:  'reassigned',
  REJECTED:    'rejected',
  CANCELLED:   'cancelled',
});

// خريطة المرحلة → الحقل على /orders (للـ active assignment)
export const STAGE_FIELD = Object.freeze({
  design:     { uid: 'designerId',         name: 'designerName',         acceptedAt: 'designerAcceptedAt' },
  production: { uid: 'productionAgent',    name: 'productionAgentName',  acceptedAt: 'productionAcceptedAt' },
  printing:   { uid: 'printerId',          name: 'printerName',          acceptedAt: 'printerAcceptedAt' },
  shipping:   { uid: 'shippingOfficerId',  name: 'shippingOfficerName',  acceptedAt: 'shippingAcceptedAt' },
});

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
function safeName(v) { return (v || '').toString().trim(); }

/**
 * بنية موحدة للـ assignment document.
 * @param {object} p
 * @param {string} p.orderId
 * @param {string} p.orderDisplayId
 * @param {string} p.clientName
 * @param {string} p.stage          - design|production|printing|shipping
 * @param {string} p.assigneeUid
 * @param {string} p.assigneeName
 * @param {string} p.assigneeRole
 * @param {string} p.assignedBy     - uid
 * @param {string} p.assignedByName
 * @param {string} [p.status]       - assigned (default)
 * @param {string} [p.reassignedFrom]
 * @param {string} [p.notes]
 */
function buildAssignmentPayload(p) {
  return {
    orderId:           p.orderId || '',
    orderDisplayId:    p.orderDisplayId || '',
    clientName:        safeName(p.clientName),
    stage:             p.stage,
    assigneeUid:       p.assigneeUid || '',
    assigneeName:      safeName(p.assigneeName),
    assigneeRole:      p.assigneeRole || '',
    status:            p.status || WF_STATUS.ASSIGNED,
    assignedBy:        p.assignedBy || '',
    assignedByName:    safeName(p.assignedByName),
    assignedAt:        serverTimestamp(),
    acceptedAt:        null,
    completedAt:       null,
    reassignedFrom:    p.reassignedFrom || null,
    notes:             p.notes || '',
    isActive:          true,
    editHistory:       [],
  };
}

// ═══════════════════════════════════════
// CORE API
// ═══════════════════════════════════════

/**
 * تعيين موظف لمرحلة من أوردر.
 *  - يكتب على /orders (الحقل المناسب للمرحلة)
 *  - يكتب entry في /order_assignments (للسجل + Phase 2/3)
 *  - يقفل الـ assignment السابق لنفس المرحلة (لو موجود) كـ reassigned
 *  - بيُولّد task auto للموظف
 *
 * كل ده في writeBatch واحد (RULE 3 — Atomic Writes).
 *
 * @returns {Promise<{assignmentId:string, taskId:string|null}>}
 */
export async function assignOrderStage(db, p) {
  if (!p.orderId)      throw new Error('orderId مطلوب');
  if (!p.stage)        throw new Error('stage مطلوب');
  if (!p.assigneeUid)  throw new Error('assigneeUid مطلوب');
  if (!STAGE_FIELD[p.stage]) throw new Error('stage غير صالح: ' + p.stage);

  const fields = STAGE_FIELD[p.stage];
  const batch  = writeBatch(db);

  // 1) قفل الـ assignment القديم على نفس المرحلة (لو موجود) كـ reassigned
  const prevQ = query(
    collection(db, 'order_assignments'),
    where('orderId', '==', p.orderId),
    where('stage', '==', p.stage),
    where('isActive', '==', true),
    limit(5)
  );
  const prevSnap = await getDocs(prevQ);
  let reassignedFromUid = null;
  prevSnap.forEach(d => {
    const data = d.data() || {};
    if (data.assigneeUid !== p.assigneeUid) {
      reassignedFromUid = data.assigneeUid || reassignedFromUid;
      batch.update(d.ref, {
        status:      WF_STATUS.REASSIGNED,
        isActive:    false,
        completedAt: serverTimestamp(),
        editHistory: [...(data.editHistory || []), {
          at: new Date().toISOString(),
          by: p.assignedBy || '',
          action: 'reassigned',
          to: p.assigneeUid,
        }],
      });
    } else {
      // نفس الشخص — مش محتاج تكرار
    }
  });

  // 2) أضف الـ assignment الجديد
  const assignRef = doc(collection(db, 'order_assignments'));
  batch.set(assignRef, buildAssignmentPayload({ ...p, reassignedFrom: reassignedFromUid }));

  // 3) حدّث الـ order نفسه (الحقل النشط للمرحلة)
  const orderRef = doc(db, 'orders', p.orderId);
  const orderPatch = {
    [fields.uid]:  p.assigneeUid,
    [fields.name]: safeName(p.assigneeName),
    updatedAt:     serverTimestamp(),
    timeline:      null, // placeholder, override below
  };
  delete orderPatch.timeline;
  batch.update(orderRef, orderPatch);

  // 4) Auto-task generation للموظف
  let taskRef = null;
  try {
    taskRef = doc(collection(db, 'tasks'));
    batch.set(taskRef, {
      title:        `مرحلة ${stageLabel(p.stage)} — ${safeName(p.clientName) || p.orderDisplayId || p.orderId}`,
      description:  p.notes || '',
      orderId:      p.orderId,
      orderDisplayId: p.orderDisplayId || '',
      assignmentId: assignRef.id,
      stage:        p.stage,
      assignedTo:   p.assigneeUid,
      assignedToName: safeName(p.assigneeName),
      assignedBy:   p.assignedBy || '',
      assignedByName: safeName(p.assignedByName),
      status:       'open',
      priority:     'normal',
      source:       'workforce-auto',
      createdAt:    serverTimestamp(),
    });
  } catch (e) {
    // الـ tasks اختيارية — مش هتقفل الـ assignment لو فشلت
    console.warn('[workforce-core] task creation failed:', e?.message);
    taskRef = null;
  }

  await batch.commit();
  return { assignmentId: assignRef.id, taskId: taskRef?.id || null };
}

/**
 * تأكيد قبول الـ assignment من الموظف نفسه.
 */
export async function acceptAssignment(db, assignmentId, byUid, byName) {
  const ref = doc(db, 'order_assignments', assignmentId);
  await updateDoc(ref, {
    status:     WF_STATUS.ACCEPTED,
    acceptedAt: serverTimestamp(),
    editHistory: null, // will be merged client-side if needed
  });
  // best-effort: حدّث الحقل على الأوردر
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d = snap.data();
    const f = STAGE_FIELD[d.stage];
    if (f && d.orderId) {
      try {
        await updateDoc(doc(db, 'orders', d.orderId), {
          [f.acceptedAt]: serverTimestamp(),
          updatedAt:      serverTimestamp(),
        });
      } catch (e) { /* ignore */ }
    }
  }
}

/**
 * إنهاء assignment (الموظف خلّص شغله على المرحلة دي).
 */
export async function completeAssignment(db, assignmentId, byUid, byName) {
  const ref = doc(db, 'order_assignments', assignmentId);
  const batch = writeBatch(db);
  batch.update(ref, {
    status:      WF_STATUS.DONE,
    isActive:    false,
    completedAt: serverTimestamp(),
  });

  // اقفل الـ task المرتبط
  try {
    const tQ = query(collection(db, 'tasks'),
      where('assignmentId', '==', assignmentId), limit(3));
    const tSnap = await getDocs(tQ);
    tSnap.forEach(t => {
      batch.update(t.ref, {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: byUid || '',
      });
    });
  } catch (e) { /* ignore */ }

  await batch.commit();
}

/**
 * رفض الـ assignment (يرجع الـ slot fading للـ pool).
 */
export async function rejectAssignment(db, assignmentId, byUid, byName, reason) {
  const ref = doc(db, 'order_assignments', assignmentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Assignment غير موجود');
  const d = snap.data();
  const f = STAGE_FIELD[d.stage];

  const batch = writeBatch(db);
  batch.update(ref, {
    status:      WF_STATUS.REJECTED,
    isActive:    false,
    completedAt: serverTimestamp(),
    notes:       (d.notes || '') + (reason ? ' | rejected: ' + reason : ''),
  });

  // امسح الحقل على الأوردر
  if (f && d.orderId) {
    batch.update(doc(db, 'orders', d.orderId), {
      [f.uid]:  '',
      [f.name]: '',
      updatedAt: serverTimestamp(),
    });
  }

  // اقفل الـ task
  try {
    const tQ = query(collection(db, 'tasks'),
      where('assignmentId', '==', assignmentId), limit(3));
    const tSnap = await getDocs(tQ);
    tSnap.forEach(t => batch.update(t.ref, { status: 'cancelled' }));
  } catch (e) { /* ignore */ }

  await batch.commit();
}

/**
 * نقل assignment لموظف تاني (workload balancer).
 */
export async function reassignTo(db, fromAssignmentId, newAssignee) {
  const ref = doc(db, 'order_assignments', fromAssignmentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Assignment غير موجود');
  const old = snap.data();

  return assignOrderStage(db, {
    orderId:        old.orderId,
    orderDisplayId: old.orderDisplayId,
    clientName:     old.clientName,
    stage:          old.stage,
    assigneeUid:    newAssignee.uid,
    assigneeName:   newAssignee.name,
    assigneeRole:   newAssignee.role || old.assigneeRole,
    assignedBy:     newAssignee.byUid || '',
    assignedByName: newAssignee.byName || '',
    notes:          'reassigned from ' + (old.assigneeName || old.assigneeUid),
  });
}

// ═══════════════════════════════════════
// LIVE WORKLOAD COMPUTATION
// ═══════════════════════════════════════

/**
 * يحسب حمل الشغل لكل موظف من الأوردرات المفتوحة.
 * بنحسبها من /orders مباشرة (الحقل النشط) — مش من /order_assignments
 * عشان نضمن اتساقها مع الكود القديم (RULE 6).
 *
 * @param {Array} orders - كل الأوردرات (cached من /orders)
 * @param {Array} employees - كل الموظفين
 * @returns {Map<uid, {uid,name,role,empId,assignments:[{orderId,clientName,stage,ageHours}],counts:{...},pressure:number}>}
 */
export function computeLiveWorkload(orders, employees) {
  const byUid = new Map();

  // Pre-index الموظفين على الـ authUid + الـ docId
  employees.forEach(e => {
    const uid = e.authUid || e._id;
    if (!uid) return;
    byUid.set(uid, {
      uid,
      empId:   e._id,
      name:    e.name || e.email || 'موظف',
      role:    e.role || '',
      role_label: e.role || '',
      assignments: [],
      counts:  { design:0, production:0, printing:0, shipping:0 },
      oldestHours: 0,
      pressure: 0,
    });
    // duplicate index for docId-only references
    if (e.authUid && e._id && e.authUid !== e._id) {
      byUid.set(e._id, byUid.get(uid));
    }
  });

  // Map الـ stage الفعلي للأوردر → "workload bucket"
  // الأوردر اللي stage='production' هو على المنفذ
  // الأوردر اللي stage='printing' أيضاً على المنفذ (production_agent)
  // الأوردر اللي stage='ready' أو 'shipped' على شركة الشحن
  // الأوردر اللي stage='design_pending' أو 'design_approved' على المصمم
  const STAGE_BUCKET = {
    'design_pending':   'design',
    'design_approved':  'design',
    'production':       'production',
    'printing':         'printing',
    'ready':            'shipping',
    'shipped':          'shipping',
  };

  const now = Date.now();
  orders.forEach(o => {
    const bucket = STAGE_BUCKET[o.stage];
    if (!bucket) return;
    // أي من الـ ids ينطبق على الـ bucket؟
    const candidates = [];
    if (bucket === 'design'     && o.designerId)        candidates.push({ uid: o.designerId,        name: o.designerName });
    if (bucket === 'production' && o.productionAgent)   candidates.push({ uid: o.productionAgent,   name: o.productionAgentName });
    if (bucket === 'printing'   && o.productionAgent)   candidates.push({ uid: o.productionAgent,   name: o.productionAgentName });
    if (bucket === 'shipping'   && o.shippingOfficerId) candidates.push({ uid: o.shippingOfficerId, name: o.shippingOfficerName });

    candidates.forEach(c => {
      const w = byUid.get(c.uid);
      if (!w) return;
      const updatedAt = o.updatedAt?.toDate?.() || o.createdAt?.toDate?.();
      const ageHours = updatedAt ? Math.max(0, Math.floor((now - updatedAt.getTime()) / 3600000)) : 0;
      w.assignments.push({
        orderId:        o._id,
        orderDisplayId: o.id || o._id,
        clientName:     o.clientName || '',
        stage:          o.stage,
        bucket,
        ageHours,
        prodStatus:     o.prodStatus || '',
        deadline:       o.deadline || o.deliveryDate || null,
      });
      w.counts[bucket] = (w.counts[bucket] || 0) + 1;
      if (ageHours > w.oldestHours) w.oldestHours = ageHours;
    });
  });

  // احسب ضغط الشغل (0-100). فوق 8 شغلات في إيدك = 100%
  byUid.forEach(w => {
    const total = w.assignments.length;
    const ageWeight = Math.min(20, w.oldestHours / 48 * 20); // 48h old = +20
    const load = Math.min(80, total * 10); // 8 orders = 80%
    w.pressure = Math.min(100, Math.round(load + ageWeight));
  });

  // ارجع لـ unique entries فقط (مش الـ duplicates بالـ docId)
  const result = new Map();
  byUid.forEach(v => {
    if (!result.has(v.uid)) result.set(v.uid, v);
  });
  return result;
}

/**
 * Snapshot listener موحد للأوردرات + الموظفين → بيستدعي callback كل ما الحمل يتغير.
 * @returns {Function} unsubscribe
 */
export function watchLiveWorkload(db, onChange) {
  let orders = [], employees = [];
  let ready = { orders:false, employees:false };
  const fire = () => {
    if (!ready.orders || !ready.employees) return;
    onChange(computeLiveWorkload(orders, employees), { orders, employees });
  };
  const u1 = onSnapshot(query(collection(db, 'orders'), orderBy('updatedAt', 'desc'), limit(500)), snap => {
    orders = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    ready.orders = true; fire();
  });
  const u2 = onSnapshot(collection(db, 'employees'), snap => {
    employees = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    ready.employees = true; fire();
  });
  return () => { try { u1(); u2(); } catch(_) {} };
}

// ═══════════════════════════════════════
// HISTORY READERS — للـ employee-profile
// ═══════════════════════════════════════

/**
 * كل assignments لموظف معين (شامل المنتهية).
 */
export async function getAssignmentsForEmployee(db, uid, { limitN = 50 } = {}) {
  const q = query(
    collection(db, 'order_assignments'),
    where('assigneeUid', '==', uid),
    orderBy('assignedAt', 'desc'),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _id: d.id }));
}

/**
 * كل الـ assignments المفتوحة لموظف.
 */
export async function getOpenAssignmentsForEmployee(db, uid) {
  const q = query(
    collection(db, 'order_assignments'),
    where('assigneeUid', '==', uid),
    where('isActive', '==', true),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _id: d.id }));
}

// ═══════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════
export function stageLabel(stage) {
  return {
    design:      'تصميم',
    production:  'تنفيذ',
    printing:    'طباعة',
    shipping:    'شحن',
  }[stage] || stage;
}

export function stageIcon(stage) {
  return {
    design:      '✏️',
    production:  '🏭',
    printing:    '🖨️',
    shipping:    '🚚',
  }[stage] || '•';
}

export function stageColor(stage) {
  return {
    design:      '#a78bfa',
    production:  '#ff3d6e',
    printing:    '#ffaa00',
    shipping:    '#22d3ee',
  }[stage] || '#888';
}

export function pressureColor(p) {
  if (p >= 80) return '#ff3d6e';
  if (p >= 50) return '#ffaa00';
  if (p >= 25) return '#22d3ee';
  return '#00d97e';
}

// expose to non-module pages too
if (typeof window !== 'undefined') {
  window.WorkforceCore = {
    WF_EVENT, WF_STAGE, WF_STATUS, STAGE_FIELD,
    assignOrderStage, acceptAssignment, completeAssignment,
    rejectAssignment, reassignTo,
    computeLiveWorkload, watchLiveWorkload,
    getAssignmentsForEmployee, getOpenAssignmentsForEmployee,
    stageLabel, stageIcon, stageColor, pressureColor,
  };
}
