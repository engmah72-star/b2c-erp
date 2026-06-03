/**
 * SERVICES · approval — اعتماد العميل لتصميم أوردره عبر الفعل المركزي (Cloud Function).
 * يغلّف callable requestDesignApproval. لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';

/** يطلب اعتماد تصميم أوردر. يُرجع { ok, error? }. */
export async function approveDesign(orderId) {
  const fb = await firebase();
  try {
    const fn = fb.httpsCallable(fb.fns, 'requestDesignApproval');
    const res = await fn({ orderId });
    return { ok: !!(res && res.data && res.data.ok) };
  } catch (e) {
    return { ok: false, error: e?.code || e?.message || 'failed' };
  }
}
