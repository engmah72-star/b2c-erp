/**
 * SERVICES · auth — مصادقة العميل. يغلّف Firebase Auth. لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';

/** يراقب حالة الدخول. cb(user|null). يُرجع دالة إلغاء الاشتراك. */
export async function watchAuth(cb) {
  const fb = await firebase();
  return fb.onAuthStateChanged(fb.auth, cb);
}

/** تسجيل الدخول بحساب Google (نافذة منبثقة). يُرجع { ok, user?, error? }. */
export async function signInWithGoogle() {
  const fb = await firebase();
  try {
    const provider = new fb.GoogleAuthProvider();
    const res = await fb.signInWithPopup(fb.auth, provider);
    return { ok: true, user: res.user };
  } catch (e) {
    return { ok: false, error: e?.code || 'auth/failed' };
  }
}

/** تسجيل الخروج. */
export async function signOut() {
  const fb = await firebase();
  return fb.signOut(fb.auth);
}
