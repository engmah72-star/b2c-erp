/**
 * Business2Card ERP — error-report-actions.js
 *
 * ━━━ ERROR REPORTS ACTION LAYER (RULE A1) ━━━
 *
 * Wraps the 2 mutations the admin viewer (report-bug.html) needs.
 * Centralized so the architecture-guard CI passes — UI pages must
 * NOT call updateDoc/deleteDoc directly.
 */

import { doc, updateDoc, deleteDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

/**
 * Update an error report's status.
 * @returns {Promise<{ok:boolean,errors:string[]}>}
 */
export async function updateReportStatus({ db, reportId, status, userId }) {
  if (!db || !reportId || !status) {
    return { ok: false, errors: ['db / reportId / status مطلوب'] };
  }
  const allowed = ['new', 'investigating', 'resolved', 'wontfix'];
  if (!allowed.includes(status)) {
    return { ok: false, errors: [`status غير صالح: ${status}`] };
  }
  try {
    const patch = { status };
    if (status === 'resolved' || status === 'wontfix') {
      patch.resolvedAt = serverTimestamp();
      patch.resolvedBy = userId || '';
    }
    await updateDoc(doc(db, 'error_reports', reportId), patch);
    return { ok: true, errors: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التحديث'] };
  }
}

/**
 * Hard-delete an error report (admin only — Firestore rules enforce).
 * @returns {Promise<{ok:boolean,errors:string[]}>}
 */
export async function deleteReport({ db, reportId }) {
  if (!db || !reportId) {
    return { ok: false, errors: ['db / reportId مطلوب'] };
  }
  try {
    await deleteDoc(doc(db, 'error_reports', reportId));
    return { ok: true, errors: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحذف'] };
  }
}

export const reportActions = { updateReportStatus, deleteReport };
