/**
 * features/design/services/attendance.service.js
 *
 * حضور/انصراف للمصمم. مكرر حالياً بين design.html و designer-dashboard.html —
 * يُوحَّد هنا.
 *
 * Status: STUB — التنفيذ الفعلي في PR-3.
 */

// import { db } from '../../../core/firebase-init.js';

/**
 * Toggle check-in/out.
 * كتابة atomic: إنشاء سجل جديد أو إغلاق المفتوح.
 * @returns {Promise<{ status: 'in' | 'out', recordId: string }>}
 */
export async function toggleAttendance(/* { uid, employeeId }, ctx */) {
  throw new Error('attendance.service.toggleAttendance: not implemented (PR-3)');
}

/**
 * Get today's status quickly (one-off).
 */
export async function getTodayStatus(/* uid */) {
  throw new Error('attendance.service.getTodayStatus: not implemented (PR-3)');
}
