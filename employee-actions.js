/**
 * Business2Card ERP — employee-actions.js
 *
 * ━━━ EMPLOYEE ACTIONS LAYER (P2.3) ━━━
 *
 * طبقة الأفعال للموظفين — incidents/skills/salary-data/permissions/tasks/
 * schedule/leaves/attendance.
 *
 * الفلسفة:
 *   - الـ Firestore writes تمر هنا (الـ Architecture Guard يفرض ذلك)
 *   - الـ Firebase Auth operations (createUser/signIn/updatePassword) تبقى في
 *     الصفحة لأنها mixed flow — الـ caller يوفّر الـ Auth params الناتجة كـ
 *     newAuthUid مثلاً ويستدعي linkRebuiltAuth بعدها
 *   - SALARY_PAYMENT + REVERSAL يمرّان عبر `recordSalaryPayment` /
 *     `reverseSalaryPayment` هنا (Phase-0 H1.1 fix) — الـ wrappers تضيف
 *     `withIdempotency` على الكتابة المالية وتمنع double-submit
 *
 * كل action يُرجع: { ok, errors[], warnings[], ... }
 */

import {
  doc,
  collection,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  getDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db as defaultDb } from './core/firebase-init.js';
import { dispatchFinancialEvent, FE } from './financial-sync-engine.js';
import { withIdempotency } from './core/idempotency.js';
import { auditEntry } from './core/audit.js';
import { computeLateMinutes, attendanceDocId } from './core/attendance-core.js';

// ══════════════════════════════════════════
// INCIDENTS
// ══════════════════════════════════════════

export async function addIncident({
  db = defaultDb,
  employeeId, employeeName, authUid = '',
  date, type, severity,
  reasonCode = '', reasonLabel = '',
  title = '', description = '',
  orderId = null, clientName = null,
  imageUrl = '', imagePath = '',
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  try {
    const ref = await addDoc(collection(db, 'employee_incidents'), {
      employeeId,
      employeeName: employeeName || '',
      authUid: authUid || '',
      date,
      monthKey: (date || '').slice(0, 7),
      type, severity,
      reasonCode: reasonCode || '',
      reasonLabel: reasonLabel || '',
      title, description,
      orderId: orderId || null,
      clientName: clientName || null,
      imageUrl: imageUrl || '',
      imagePath: imagePath || '',
      createdBy: userId,
      createdByName: userName || '',
      createdAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [], incidentId: ref.id };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [] };
  }
}

export async function deleteIncident({ db = defaultDb, incidentId }) {
  if (!incidentId) return { ok: false, errors: ['⚠️ incidentId مطلوب'], warnings: [] };
  try {
    await deleteDoc(doc(db, 'employee_incidents', incidentId));
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [] };
  }
}

/**
 * تظلّم الموظف على إخفاق مسجّل — يكتب الموظف نفسه (authUid يطابق صاحب الإخفاق).
 * يضع التظلّم بحالة 'pending' فقط؛ القرار للأدمن عبر decideIncidentAppeal.
 * (firestore.rules يسمح للموظف بتعديل حقل appeal وحده على إخفاقه بحالة pending).
 */
export async function submitIncidentAppeal({ db = defaultDb, incidentId, reason }) {
  if (!incidentId) return { ok: false, errors: ['⚠️ incidentId مطلوب'], warnings: [] };
  if (!reason || !reason.trim()) return { ok: false, errors: ['⚠️ اكتب سبب التظلّم'], warnings: [] };
  try {
    await updateDoc(doc(db, 'employee_incidents', incidentId), {
      appeal: {
        status: 'pending',
        reason: reason.trim(),
        submittedAt: serverTimestamp(),
      },
    });
    return { ok: true, errors: [], warnings: [], status: 'pending' };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل إرسال التظلّم'], warnings: [] };
  }
}

/**
 * قرار الأدمن في التظلّم: 'accepted' (يُلغى أثر الإخفاق على التقييم لكن يُحفظ
 * للشفافية) أو 'rejected'. القبول لا يحذف الإخفاق — يُعلّمه فقط (isVoided).
 */
export async function decideIncidentAppeal({
  db = defaultDb, incidentId, decision, note = '', userId, userName,
}) {
  if (!incidentId) return { ok: false, errors: ['⚠️ incidentId مطلوب'], warnings: [] };
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!['accepted', 'rejected'].includes(decision)) {
    return { ok: false, errors: ['⚠️ قرار غير صالح'], warnings: [] };
  }
  try {
    const snap = await getDoc(doc(db, 'employee_incidents', incidentId));
    const prev = snap.exists() ? (snap.data().appeal || {}) : {};
    await updateDoc(doc(db, 'employee_incidents', incidentId), {
      appeal: {
        ...prev,
        status: decision,
        decisionNote: note || '',
        decidedBy: userId,
        decidedByName: userName || '',
        decidedAt: serverTimestamp(),
      },
    });
    return { ok: true, errors: [], warnings: [], status: decision };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل حفظ القرار'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// EMPLOYEE RECORD (employees/{id})
// ══════════════════════════════════════════

export async function updateEmployeeSkills({ db = defaultDb, employeeId, skills }) {
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'employees', employeeId), { skills: skills || [] });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

export async function updateEmployeeData({
  db = defaultDb, employeeId,
  baseSalary, commissionPct, status,
}) {
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'employees', employeeId), {
      baseSalary: parseFloat(baseSalary) || 0,
      commissionPct: parseFloat(commissionPct) || 0,
      status: status || 'active',
      updatedAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

/**
 * Atomic Firestore writes for new employee creation: employees doc + users doc.
 * Firebase Auth creation happens in the caller (mixed-flow) — pass the resulting
 * newAuthUid here. Same pattern as linkRebuiltAuth.
 */
export async function createEmployeeWithUser({
  db = defaultDb,
  newAuthUid, email,
  employeeData, // full employees doc shape (already has email/authUid/permissions inserted)
  userDocData,  // full users doc shape
}) {
  if (!newAuthUid) return { ok: false, errors: ['⚠️ newAuthUid مطلوب'], warnings: [] };
  if (!employeeData) return { ok: false, errors: ['⚠️ employeeData مطلوب'], warnings: [] };
  if (!userDocData) return { ok: false, errors: ['⚠️ userDocData مطلوب'], warnings: [] };
  try {
    const batch = writeBatch(db);
    const empRef = doc(collection(db, 'employees'));
    batch.set(empRef, employeeData);
    batch.set(doc(db, 'users', newAuthUid), userDocData);
    await batch.commit();
    return { ok: true, errors: [], warnings: [], employeeId: empRef.id };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الإنشاء'], warnings: [] };
  }
}

/**
 * إنشاء "ملف موظف" لمستخدم موجود بالفعل (له حساب Auth + users doc) — مثل الأدمن
 * الذي يريد أن يصبح له ملف موظف (حضور/راتب/تقييم) دون إنشاء حساب Auth جديد ولا
 * الكتابة فوق users doc الحالي (حفاظاً على الدور والصلاحيات). يكتب employees doc
 * فقط، مرتبطاً بالـ authUid الحالي. يرفض التكرار لو فيه ملف موظف بنفس الـ authUid.
 * (يختلف عن createEmployeeWithUser الذي ينشئ حساباً جديداً + يكتب users doc.)
 */
export async function createSelfEmployeeFile({
  db = defaultDb, authUid, employeeData,
}) {
  if (!authUid) return { ok: false, errors: ['⚠️ authUid مطلوب'], warnings: [] };
  if (!employeeData || typeof employeeData !== 'object') {
    return { ok: false, errors: ['⚠️ employeeData مطلوب'], warnings: [] };
  }
  try {
    const { getDocs, query, where, collection: coll } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    // حارس تكرار: لو فيه ملف موظف مرتبط بنفس الحساب، أوقف بدل إنشاء نسخة ثانية.
    const existing = await getDocs(query(coll(db, 'employees'), where('authUid', '==', authUid)));
    if (!existing.empty) {
      return { ok: false, errors: ['⚠️ يوجد ملف موظف مرتبط بهذا الحساب بالفعل'], warnings: [] };
    }
    const empRef = doc(collection(db, 'employees'));
    await setDoc(empRef, { ...employeeData, authUid });
    return { ok: true, errors: [], warnings: [], employeeId: empRef.id };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الإنشاء'], warnings: [] };
  }
}

/**
 * Full employee profile edit — accepts the entire form shape.
 * Used by employees.html admin edit flow (covers name/phone/role/salary/etc).
 */
export async function updateEmployeeProfile({
  db = defaultDb, employeeId, profileData,
}) {
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  if (!profileData || typeof profileData !== 'object') {
    return { ok: false, errors: ['⚠️ profileData مطلوب'], warnings: [] };
  }
  try {
    await updateDoc(doc(db, 'employees', employeeId), {
      ...profileData,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

export async function updateEmployeeSchedule({
  db = defaultDb, employeeId, days, startTime, endTime,
}) {
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  if (!Array.isArray(days) || !days.length) {
    return { ok: false, errors: ['⚠️ اختر يوم عمل واحد على الأقل'], warnings: [] };
  }
  try {
    await updateDoc(doc(db, 'employees', employeeId), {
      workSchedule: {
        days,
        startTime: startTime || '09:00',
        endTime: endTime || '17:00',
      },
      updatedAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

/**
 * Soft-delete موظف: يحذف document من employees + يقفل حساب users.
 * الـ Firebase Auth account نفسه يبقى — حذفه manual من Firebase Console.
 */
export async function softDeleteEmployee({
  db = defaultDb, employeeId, authUid = '',
}) {
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'employees', employeeId));
    if (authUid) {
      batch.update(doc(db, 'users', authUid), {
        isActive: false,
        deleted: true,
        deletedAt: serverTimestamp(),
        permissions: { pages: [] },
      });
    }
    await batch.commit();
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// USER ACCOUNT (users/{uid}) — auth-related Firestore meta
// (الـ Firebase Auth operations نفسها تبقى في الـ caller)
// ══════════════════════════════════════════

/**
 * بعد نجاح Firebase Auth update، يحدّث Firestore بـ displayPassword + التواريخ.
 */
export async function recordPasswordChange({
  db = defaultDb, authUid,
  newPassword, userId, userName,
  mustChangeOnNextLogin = true,
}) {
  if (!authUid) return { ok: false, errors: ['⚠️ authUid مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'users', authUid), {
      displayPassword: newPassword,
      displayPasswordSetAt: serverTimestamp(),
      displayPasswordSetBy: userId || '',
      displayPasswordSetByName: userName || '',
      mustChangePassword: !!mustChangeOnNextLogin,
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [] };
  }
}

/**
 * Audit-only: تسجيل وقت إرسال reset-email للموظف.
 */
export async function recordPasswordResetEmailSent({
  db = defaultDb, authUid, userId,
}) {
  if (!authUid) return { ok: false, errors: ['⚠️ authUid مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'users', authUid), {
      passwordResetEmailSentAt: serverTimestamp(),
      passwordResetEmailSentBy: userId || '',
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [] };
  }
}

/**
 * بعد إعادة إنشاء Firebase Auth account: ربط الـ employee بالـ newAuthUid +
 * إنشاء users/{newAuthUid} + أرشفة users/{oldAuthUid}.
 */
export async function linkRebuiltAuth({
  db = defaultDb,
  employeeDocId, newAuthUid, oldAuthUid = '',
  email, employeeData,
  newPassword, userPermissions = {},
  userId, userName,
}) {
  if (!employeeDocId) return { ok: false, errors: ['⚠️ employeeDocId مطلوب'], warnings: [] };
  if (!newAuthUid) return { ok: false, errors: ['⚠️ newAuthUid مطلوب'], warnings: [] };
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'employees', employeeDocId), { authUid: newAuthUid, email });
    batch.set(doc(db, 'users', newAuthUid), {
      name: employeeData?.name || '',
      role: employeeData?.role || 'customer_service',
      email,
      phone: employeeData?.phone || '',
      isActive: true,
      mustChangePassword: false,
      displayPassword: newPassword,
      displayPasswordSetAt: serverTimestamp(),
      displayPasswordSetBy: userId || '',
      displayPasswordSetByName: userName || '',
      permissions: userPermissions || {},
      rebuiltFrom: oldAuthUid || null,
      rebuiltAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    if (oldAuthUid && oldAuthUid !== newAuthUid) {
      batch.update(doc(db, 'users', oldAuthUid), {
        isActive: false,
        archivedAt: serverTimestamp(),
        replacedBy: newAuthUid,
      });
    }
    await batch.commit();
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الربط'], warnings: [] };
  }
}

export async function saveUserPermissions({ db = defaultDb, authUid, permissions }) {
  if (!authUid) return { ok: false, errors: ['⚠️ authUid مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'users', authUid), { permissions: permissions || {} });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

export async function clearUserPermissions({ db = defaultDb, authUid }) {
  return saveUserPermissions({
    db, authUid,
    permissions: {
      pages: [],
      canSeePrices: false,
      canSeeAllOrders: false,
      canAddOrders: false,
      canAddClients: false,
      canAssignDesigner: false,
      canAssignTasks: false,
    },
  });
}

// ══════════════════════════════════════════
// TASKS
// ══════════════════════════════════════════

export async function addEmployeeTask({
  db = defaultDb,
  title, description = '', priority = 'normal',
  dueDate = '', orderId = '',
  taskType = 'fixed', recurrence = '',
  assignedToUid, assignedToName,
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!title || !title.trim()) return { ok: false, errors: ['⚠️ أدخل عنوان المهمة'], warnings: [] };
  // نوع المهمة: محدّدة (fixed) أو دائمة متكرّرة (recurring)
  const type = taskType === 'recurring' ? 'recurring' : 'fixed';
  if (type === 'recurring' && !['daily', 'weekly', 'monthly'].includes(recurrence)) {
    return { ok: false, errors: ['⚠️ اختر تكرار المهمة الدائمة (يومي/أسبوعي/شهري)'], warnings: [] };
  }
  try {
    const ref = await addDoc(collection(db, 'tasks'), {
      title: title.trim(), description, priority,
      // المهمة الدائمة لا تحمل dueDate؛ المحدّدة فقط
      dueDate: type === 'recurring' ? '' : dueDate,
      orderId,
      taskType: type,
      recurrence: type === 'recurring' ? recurrence : '',
      lastCompletedPeriod: '',
      assignedTo: assignedToUid,
      assignedToName: assignedToName || '',
      assignedBy: userId,
      assignedByName: userName || '',
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [], taskId: ref.id };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الإضافة'], warnings: [] };
  }
}

export async function setTaskStatus({ db = defaultDb, taskId, status }) {
  if (!taskId) return { ok: false, errors: ['⚠️ taskId مطلوب'], warnings: [] };
  if (!['pending', 'done', 'cancelled'].includes(status)) {
    return { ok: false, errors: ['⚠️ status غير صالح'], warnings: [] };
  }
  try {
    await updateDoc(doc(db, 'tasks', taskId), {
      status,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [], status };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [] };
  }
}

/**
 * إنجاز مهمة دائمة (متكرّرة) لفترتها الحالية — لا تُغلق المهمة نهائياً، بل
 * تُختم بمفتاح الفترة `periodKey` ثم تُعاد فتحها تلقائياً للفترة التالية.
 * (للمهام المحدّدة استخدم setTaskStatus العادي).
 */
export async function completeRecurringTask({ db = defaultDb, taskId, periodKey, reopen = false }) {
  if (!taskId) return { ok: false, errors: ['⚠️ taskId مطلوب'], warnings: [] };
  if (!reopen && !periodKey) return { ok: false, errors: ['⚠️ periodKey مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'tasks', taskId), {
      // reopen ⇒ مسح ختم الفترة (تعود المهمة «مستحقّة» للفترة الحالية)
      lastCompletedPeriod: reopen ? '' : periodKey,
      lastCompletedAt: reopen ? null : serverTimestamp(),
      status: 'pending',
      updatedAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [], periodKey: reopen ? '' : periodKey };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// LEAVES
// ══════════════════════════════════════════

export async function addEmployeeLeave({
  db = defaultDb,
  employeeId, employeeName,
  type, startDate, endDate, days, reason = '',
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  if (!startDate) return { ok: false, errors: ['⚠️ حدد تاريخ البداية'], warnings: [] };
  if (endDate && endDate < startDate) {
    return { ok: false, errors: ['⚠️ تاريخ النهاية قبل البداية'], warnings: [] };
  }
  try {
    const ref = await addDoc(collection(db, 'employee_leaves'), {
      employeeId,
      employeeName: employeeName || '',
      type,
      startDate,
      endDate: endDate || startDate,
      days: parseFloat(days) || 0,
      reason,
      createdAt: serverTimestamp(),
      createdBy: userName || '',
      createdById: userId,
    });
    return { ok: true, errors: [], warnings: [], leaveId: ref.id };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [] };
  }
}

export async function deleteEmployeeLeave({ db = defaultDb, leaveId }) {
  if (!leaveId) return { ok: false, errors: ['⚠️ leaveId مطلوب'], warnings: [] };
  try {
    await deleteDoc(doc(db, 'employee_leaves', leaveId));
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// ATTENDANCE
// ══════════════════════════════════════════

/**
 * Idempotent check-in: doc id = `${employeeId}_${dateStr}` يمنع التكرار حتى لو
 * تنافس tabs. الـ runTransaction يضمن fail لو سُجِّل مسبقاً.
 *
 * التأخير (lateMinutes): لو مُرِّر `expectedStart` ('HH:MM') يُحسب آلياً من جدول
 * الموظف (المصدر الوحيد `attendance-core.computeLateMinutes`) ويتجاوز أي قيمة
 * مُمرَّرة؛ غياب `expectedStart` يُبقي السلوك القديم (يستعمل `lateMinutes` كما هو).
 * `source` يميّز التسجيل الذاتي ('self') عن المركزي ('central').
 */
export async function recordAttendanceCheckIn({
  db = defaultDb,
  employeeId, employeeUid, employeeName,
  date, monthKey, lateMinutes = 0,
  expectedStart = '', graceMinutes = 0,
  source = 'central',
  recordedBy, recordedByName,
}) {
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  if (!date) return { ok: false, errors: ['⚠️ date مطلوب'], warnings: [] };
  if (!recordedBy) return { ok: false, errors: ['⚠️ recordedBy مطلوب'], warnings: [] };
  // Canonical id (attendance-core) — one record per employee/day across ALL
  // surfaces; never reconstruct the id locally (RULE 1).
  const attId = attendanceDocId({ employeeUid, employeeId, date });
  const attRef = doc(db, 'attendance', attId);
  const nowD = new Date();
  // auto-late from schedule when available; otherwise honour the passed value
  const lateMin = expectedStart
    ? computeLateMinutes(nowD, expectedStart, graceMinutes)
    : (parseInt(lateMinutes) || 0);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(attRef);
      if (snap.exists()) throw new Error('سُجِّل حضور مسبقاً');
      tx.set(attRef, {
        employeeUid: employeeUid || employeeId,
        employeeId,
        employeeName: employeeName || '',
        date,
        monthKey: monthKey || date.slice(0, 7),
        checkIn: true,
        checkInStr: nowD.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        checkInAt: serverTimestamp(),
        lateMinutes: lateMin,
        source: source === 'self' ? 'self' : 'central',
        recordedBy,
        recordedByName: recordedByName || '',
        timeline: [auditEntry({
          action: source === 'self' ? '🟢 تسجيل حضور (ذاتي)' : '🟢 تسجيل حضور',
          userId: recordedBy,
          userName: recordedByName || '',
          kind: 'op',
          meta: { source: source === 'self' ? 'self' : 'central', date, lateMinutes: lateMin },
        })],
        createdAt: serverTimestamp(),
      });
    });
    return { ok: true, errors: [], warnings: [], attendanceId: attId, lateMinutes: lateMin };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [] };
  }
}

export async function recordAttendanceCheckOut({
  db = defaultDb, attendanceId,
  employeeUid, employeeId, date,
}) {
  // Accept an explicit id OR derive the canonical one — so callers can never
  // target a different doc than the matching check-in (RULE 1).
  const attId = attendanceId || (date ? attendanceDocId({ employeeUid, employeeId, date }) : '');
  if (!attId) return { ok: false, errors: ['⚠️ attendanceId مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'attendance', attId), {
      checkOut: true,
      checkOutStr: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      checkOutAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [] };
  }
}

/**
 * يبدأ «أوفر تايم» على سجل اليوم: الموظف وصل نهاية ورديته واختار يكمّل، فيكتب
 * بنفسه الشغل اللي هيعمله (`note`). يُعلّم السجل `overtime:true` ويختم بدايته —
 * دقائق الأوفر تايم تُشتقّ لاحقاً من `attendance-core.computeOvertimeMinutes`
 * (worked − scheduled)، فلا نخزّن قيمة محسوبة هنا (RULE 1). نفس مُعرّف السجل
 * المركزي حتى لا يتفرّع عن الحضور/الانصراف.
 */
export async function startAttendanceOvertime({
  db = defaultDb, attendanceId,
  employeeUid, employeeId, date, note = '',
  recordedBy, recordedByName,
}) {
  const attId = attendanceId || (date ? attendanceDocId({ employeeUid, employeeId, date }) : '');
  if (!attId) return { ok: false, errors: ['⚠️ attendanceId مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'attendance', attId), {
      overtime: true,
      overtimeNote: String(note || '').slice(0, 500),
      overtimeStartedAt: serverTimestamp(),
      overtimeBy: recordedBy || '',
      overtimeByName: recordedByName || '',
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [] };
  }
}

/**
 * اعتماد المدير لأوفر تايم الموظف («أكّد على الأوفر تايم»). يُعلّم السجل
 * `overtimeApproved:true` بمن اعتمد ومتى، فتُحتسَب ساعاته الإضافية رسمياً. لا
 * يكتب دقائق — تظل مُشتقّة مركزياً (RULE 1). نفس مُعرّف السجل المركزي.
 */
export async function approveAttendanceOvertime({
  db = defaultDb, attendanceId,
  employeeUid, employeeId, date,
  approvedBy, approvedByName,
}) {
  const attId = attendanceId || (date ? attendanceDocId({ employeeUid, employeeId, date }) : '');
  if (!attId) return { ok: false, errors: ['⚠️ attendanceId مطلوب'], warnings: [] };
  if (!approvedBy) return { ok: false, errors: ['⚠️ approvedBy مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'attendance', attId), {
      overtimeApproved: true,
      overtimeApprovedBy: approvedBy,
      overtimeApprovedByName: approvedByName || '',
      overtimeApprovedAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الاعتماد'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// ATTENDANCE PERMISSIONS (أذونات) — Phase-3
// ══════════════════════════════════════════

/**
 * طلب/منح إذن (collection: attendance_permissions).
 * - الموظف يطلب لنفسه → status:'pending'.
 * - المدير يمنح مباشرةً → status:'approved' (يُمرَّر صراحةً).
 * إذن معتمد من نوع late_in/mission/remote/partial يُلغي خصم تأخير اليوم في
 * حاسبة الراتب (عبر attendance-core.excusedLateMinutes).
 */
export async function requestAttendancePermission({
  db = defaultDb,
  employeeId, employeeUid, employeeName,
  type, date, fromTime = '', toTime = '', minutes = 0, reason = '',
  status = 'pending',
  requestedBy, requestedByName,
}) {
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  if (!type) return { ok: false, errors: ['⚠️ نوع الإذن مطلوب'], warnings: [] };
  if (!date) return { ok: false, errors: ['⚠️ التاريخ مطلوب'], warnings: [] };
  if (!requestedBy) return { ok: false, errors: ['⚠️ requestedBy مطلوب'], warnings: [] };
  const st = status === 'approved' ? 'approved' : 'pending';
  try {
    const ref = await addDoc(collection(db, 'attendance_permissions'), {
      employeeId,
      employeeUid: employeeUid || employeeId,
      employeeName: employeeName || '',
      type, date, monthKey: date.slice(0, 7),
      fromTime: fromTime || '', toTime: toTime || '',
      minutes: parseInt(minutes) || 0,
      reason: reason || '',
      status: st,
      requestedBy, requestedByName: requestedByName || '',
      requestedAt: serverTimestamp(),
      decidedBy: st === 'approved' ? requestedBy : null,
      decidedByName: st === 'approved' ? (requestedByName || '') : null,
      decidedAt: st === 'approved' ? serverTimestamp() : null,
      decisionNote: '',
      timeline: [auditEntry({
        action: st === 'approved' ? '🟢 منح إذن' : '📝 طلب إذن',
        userId: requestedBy, userName: requestedByName || '', kind: 'op',
        meta: { type, date, status: st, minutes: parseInt(minutes) || 0 },
      })],
      createdAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [], permissionId: ref.id, status: st };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل تسجيل الإذن'], warnings: [] };
  }
}

/**
 * اعتماد/رفض إذن قيد الانتظار (للمدير / حامل manage_attendance — تُفرَض في rules).
 */
export async function decideAttendancePermission({
  db = defaultDb, permissionId, decision, decisionNote = '',
  decidedBy, decidedByName,
}) {
  if (!permissionId) return { ok: false, errors: ['⚠️ permissionId مطلوب'], warnings: [] };
  if (decision !== 'approved' && decision !== 'rejected') {
    return { ok: false, errors: ['⚠️ decision لازم approved أو rejected'], warnings: [] };
  }
  if (!decidedBy) return { ok: false, errors: ['⚠️ decidedBy مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'attendance_permissions', permissionId), {
      status: decision,
      decidedBy, decidedByName: decidedByName || '',
      decidedAt: serverTimestamp(),
      decisionNote: decisionNote || '',
      timeline: arrayUnion(auditEntry({
        action: decision === 'approved' ? '✅ اعتماد إذن' : '🚫 رفض إذن',
        userId: decidedBy, userName: decidedByName || '', kind: 'op',
        meta: { decision },
      })),
    });
    return { ok: true, errors: [], warnings: [], status: decision };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الاعتماد'], warnings: [] };
  }
}

/** إلغاء/حذف إذن (الموظف يلغي طلبه، أو المدير — تُفرَض في rules). */
export async function cancelAttendancePermission({ db = defaultDb, permissionId }) {
  if (!permissionId) return { ok: false, errors: ['⚠️ permissionId مطلوب'], warnings: [] };
  try {
    await deleteDoc(doc(db, 'attendance_permissions', permissionId));
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الإلغاء'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// ROLE CHANGE + USER DELETE (settings.html flows)
// ══════════════════════════════════════════

/**
 * Atomic: تغيير role في users + employees (لو موجود) معاً.
 */
export async function changeUserRole({
  db = defaultDb, authUid, newRole, newPermissions,
}) {
  if (!authUid) return { ok: false, errors: ['⚠️ authUid مطلوب'], warnings: [] };
  if (!newRole) return { ok: false, errors: ['⚠️ newRole مطلوب'], warnings: [] };
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', authUid), {
      role: newRole,
      permissions: newPermissions || {},
    });
    // find matching employee doc (if any)
    const { getDocs, query, where, collection: coll } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const empSnap = await getDocs(query(coll(db, 'employees'), where('authUid', '==', authUid)));
    if (!empSnap.empty) {
      batch.update(empSnap.docs[0].ref, { role: newRole, updatedAt: serverTimestamp() });
    }
    await batch.commit();
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التغيير'], warnings: [] };
  }
}

/**
 * حذف users doc بشكل مباشر (لا cascade — softDeleteEmployee يفعل العكس).
 * Admin tool فقط — احذر.
 */
export async function deleteUserDoc({ db = defaultDb, authUid }) {
  if (!authUid) return { ok: false, errors: ['⚠️ authUid مطلوب'], warnings: [] };
  try {
    await deleteDoc(doc(db, 'users', authUid));
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// ACTIVE/INACTIVE STATUS
// ══════════════════════════════════════════

export async function setEmployeeStatus({ db = defaultDb, employeeId, status }) {
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  if (!['active', 'inactive', 'suspended'].includes(status)) {
    return { ok: false, errors: [`⚠️ status '${status}' غير صالح`], warnings: [] };
  }
  try {
    await updateDoc(doc(db, 'employees', employeeId), {
      status,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// KPI: GOALS + EVALUATIONS (upsert pattern)
// ══════════════════════════════════════════

/**
 * Upsert employee goal — لو في existing record يحدّثه، وإلا يضيف جديد.
 * يحتاج existing._id لو موجود (caller يلقطه من الـ snapshot).
 */
export async function upsertEmployeeGoal({
  db = defaultDb, existingId = '', data,
}) {
  if (!data) return { ok: false, errors: ['⚠️ data مطلوب'], warnings: [] };
  try {
    if (existingId) {
      await updateDoc(doc(db, 'employee_goals', existingId), data);
      return { ok: true, errors: [], warnings: [], goalId: existingId, action: 'update' };
    }
    const ref = await addDoc(collection(db, 'employee_goals'), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return { ok: true, errors: [], warnings: [], goalId: ref.id, action: 'create' };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

export async function upsertEmployeeEvaluation({
  db = defaultDb, existingId = '', data,
}) {
  if (!data) return { ok: false, errors: ['⚠️ data مطلوب'], warnings: [] };
  try {
    if (existingId) {
      await updateDoc(doc(db, 'employee_evaluations', existingId), data);
      return { ok: true, errors: [], warnings: [], evaluationId: existingId, action: 'update' };
    }
    const ref = await addDoc(collection(db, 'employee_evaluations'), data);
    return { ok: true, errors: [], warnings: [], evaluationId: ref.id, action: 'create' };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// SALARY PAYMENT (H1.1 fix · Phase-0 god-page decomp)
// ══════════════════════════════════════════
// تمرير SALARY_PAYMENT + REVERSAL عبر hier (بدل dispatchFinancialEvent المباشر
// من الصفحة) يحقّق:
//   - H1.1: لا direct financial dispatch من UI layer
//   - H1.2: idempotency على salary actions (double-click، parallel tabs، retry)
//   - Result contract موحَّد { ok, errors[], warnings[], operationId, idempotent }

export async function recordSalaryPayment({
  db = defaultDb,
  employeeId, employeeName,
  amount, salaryType = 'salary', isDeduction = false,
  walletId, walletName = '',
  note = '', month,
  baseSalary = 0, commission = 0,
  absenceDeduction = 0, tardinessDeduction = 0, attendanceBonus = 0,
  daysPresent = null, daysAbsent = null,
  tardinessDays = 0, lateRecords = 0,
  date = '',
  userId, userName = '',
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  if (!walletId) return { ok: false, errors: ['⚠️ اختر المحفظة'], warnings: [] };
  const amt = parseFloat(amount) || 0;
  if (amt <= 0) return { ok: false, errors: ['⚠️ أدخل المبلغ'], warnings: [] };
  if (!month) return { ok: false, errors: ['⚠️ month مطلوب'], warnings: [] };

  return withIdempotency(db, {
    actionType: 'salary_payment',
    entityId: `${employeeId}|${month}`,
    actorId: userId,
    actorName: userName,
    payload: { amount: amt, salaryType, isDeduction, walletId },
  }, async () => {
    try {
      const eventResult = await dispatchFinancialEvent(db, FE.SALARY_PAYMENT, {
        employeeId, employeeName: employeeName || '',
        amount: amt, salaryType, isDeduction,
        walletId, walletName,
        note, month,
        baseSalary, commission,
        absenceDeduction, tardinessDeduction, attendanceBonus,
        daysPresent, daysAbsent,
        tardinessDays, lateRecords,
        date: date || new Date().toLocaleDateString('ar-EG'),
        userId, userName,
      });
      return {
        ok: true,
        errors: [],
        warnings: [],
        eventType: FE.SALARY_PAYMENT,
        action: isDeduction ? 'salary_deduction' : 'salary_payment',
        txId: eventResult?.txId,
        epId: eventResult?.epId,
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.message || 'فشل تسجيل الدفعة'],
        warnings: [],
      };
    }
  });
}

export async function reverseSalaryPayment({
  db = defaultDb,
  txId, epId,
  walletId, walletName = '',
  amount, isDeduction = false,
  employeeId, employeeName,
  userId, userName = '',
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  if (!walletId) return { ok: false, errors: ['⚠️ walletId مطلوب'], warnings: [] };
  const amt = parseFloat(amount) || 0;
  if (amt <= 0) return { ok: false, errors: ['⚠️ amount مطلوب'], warnings: [] };

  return withIdempotency(db, {
    actionType: 'salary_payment_reversal',
    entityId: txId || epId || `${employeeId}|reversal`,
    actorId: userId,
    actorName: userName,
    payload: { amount: amt, isDeduction, walletId, txId, epId },
  }, async () => {
    try {
      const eventResult = await dispatchFinancialEvent(db, FE.SALARY_PAYMENT_REVERSAL, {
        txId, epId,
        walletId, walletName,
        amount: amt, isDeduction,
        employeeId, employeeName: employeeName || '',
        userId, userName,
      });
      return {
        ok: true,
        errors: [],
        warnings: [],
        eventType: FE.SALARY_PAYMENT_REVERSAL,
        action: 'salary_reversal',
        eventResult,
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.message || 'فشل حذف الدفعة'],
        warnings: [],
      };
    }
  });
}

// ══════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════

export const employeeActions = {
  addIncident, deleteIncident,
  submitIncidentAppeal, decideIncidentAppeal,
  updateEmployeeSkills, updateEmployeeData, updateEmployeeProfile, updateEmployeeSchedule,
  createEmployeeWithUser, createSelfEmployeeFile,
  changeUserRole, deleteUserDoc,
  setEmployeeStatus,
  softDeleteEmployee,
  recordPasswordChange, recordPasswordResetEmailSent,
  linkRebuiltAuth,
  saveUserPermissions, clearUserPermissions,
  addEmployeeTask, setTaskStatus, completeRecurringTask,
  addEmployeeLeave, deleteEmployeeLeave,
  recordAttendanceCheckIn, recordAttendanceCheckOut,
  startAttendanceOvertime, approveAttendanceOvertime,
  requestAttendancePermission, decideAttendancePermission, cancelAttendancePermission,
  upsertEmployeeGoal, upsertEmployeeEvaluation,
  recordSalaryPayment, reverseSalaryPayment,
};

export default employeeActions;

if (typeof window !== 'undefined') {
  window.employeeActions = employeeActions;
}
