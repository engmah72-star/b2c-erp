/**
 * SERVICES · auth — مصادقة العميل. يغلّف Firebase Auth. لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';

/** يراقب حالة الدخول. cb(user|null). يُرجع دالة إلغاء الاشتراك. */
export async function watchAuth(cb) {
  const fb = await firebase();
  return fb.onAuthStateChanged(fb.auth, cb);
}

/** تسجيل الخروج. */
export async function signOut() {
  const fb = await firebase();
  return fb.signOut(fb.auth);
}
