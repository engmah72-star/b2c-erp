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
 *   - SALARY_PAYMENT + REVERSAL يمران عبر `dispatchFinancialEvent` مباشرة في
 *     الصفحة لأن FSE هو الـ trust boundary — لا قيمة من wrapping إضافي
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
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db as defaultDb } from './core/firebase-init.js';

// ══════════════════════════════════════════
// INCIDENTS
// ══════════════════════════════════════════

export async function addIncident({
  db = defaultDb,
  employeeId, employeeName, authUid = '',
  date, type, severity,
  title = '', description = '',
  orderId = null, clientName = null,
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
      title, description,
      orderId: orderId || null,
      clientName: clientName || null,
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
  assignedToUid, assignedToName,
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!title || !title.trim()) return { ok: false, errors: ['⚠️ أدخل عنوان المهمة'], warnings: [] };
  try {
    const ref = await addDoc(collection(db, 'tasks'), {
      title: title.trim(), description, priority,
      dueDate, orderId,
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
 */
export async function recordAttendanceCheckIn({
  db = defaultDb,
  employeeId, employeeUid, employeeName,
  date, monthKey, lateMinutes = 0,
  recordedBy, recordedByName,
}) {
  if (!employeeId) return { ok: false, errors: ['⚠️ employeeId مطلوب'], warnings: [] };
  if (!date) return { ok: false, errors: ['⚠️ date مطلوب'], warnings: [] };
  if (!recordedBy) return { ok: false, errors: ['⚠️ recordedBy مطلوب'], warnings: [] };
  const attId = `${employeeId}_${date}`;
  const attRef = doc(db, 'attendance', attId);
  const nowD = new Date();
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
        lateMinutes: parseInt(lateMinutes) || 0,
        recordedBy,
        recordedByName: recordedByName || '',
        createdAt: serverTimestamp(),
      });
    });
    return { ok: true, errors: [], warnings: [], attendanceId: attId, lateMinutes: parseInt(lateMinutes) || 0 };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [] };
  }
}

export async function recordAttendanceCheckOut({
  db = defaultDb, attendanceId,
}) {
  if (!attendanceId) return { ok: false, errors: ['⚠️ attendanceId مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'attendance', attendanceId), {
      checkOut: true,
      checkOutStr: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════

export const employeeActions = {
  addIncident, deleteIncident,
  updateEmployeeSkills, updateEmployeeData, updateEmployeeSchedule,
  softDeleteEmployee,
  recordPasswordChange, recordPasswordResetEmailSent,
  linkRebuiltAuth,
  saveUserPermissions, clearUserPermissions,
  addEmployeeTask, setTaskStatus,
  addEmployeeLeave, deleteEmployeeLeave,
  recordAttendanceCheckIn, recordAttendanceCheckOut,
};

export default employeeActions;

if (typeof window !== 'undefined') {
  window.employeeActions = employeeActions;
}
