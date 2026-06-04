/**
 * SERVICES · requests — طلبات بوابة العميل كـ كيان مُهيكل (order_requests).
 * نقطة البداية الرسمية للعملية عبر clientActions (H1.1) — لا رسالة محادثة.
 * الموظف يحوّلها لأوردر عبر orderActions.createOrderFromRequest. لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';

/**
 * يُنشئ طلباً مُهيكلاً (type: 'new' | 'reorder' | 'quote'). يُرجع { ok, requestId? }.
 */
export async function createRequest({ type = 'new', uid, name, phone, order = null, product = '', qty = '', notes = '' }) {
  const fb = await firebase();
  return fb.clientActions.createOrderRequest({
    type,
    clientUid: uid, clientName: name, clientPhone: phone || '',
    sourceOrderId: order?._id || '',
    product, qty, notes,
  });
}
