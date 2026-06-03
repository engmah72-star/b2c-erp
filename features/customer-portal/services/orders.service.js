/**
 * SERVICES · orders — طلبات العميل + الفاتورة (مشتقّة من حقول الطلب).
 * الفاتورة عبر order-math (المصدر المالي الوحيد · RULE 1) — لا قراءة transactions.
 * لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';
import { calcRem, orderGrossTotal } from '../../../core/order-math.js';

const ts = (o) => (o.createdAt?.seconds ?? 0);

/** يحمّل طلبات العميل بمطابقة الهاتف، الأحدث أولاً. */
export async function loadOrders(phone) {
  if (!phone) return [];
  const fb = await firebase();
  const snap = await fb.getDocs(
    fb.query(fb.collection(fb.db, 'orders'), fb.where('clientPhone', '==', phone), fb.limit(50)),
  );
  return snap.docs.map((d) => ({ ...d.data(), _id: d.id }))
    .filter((o) => !o.isDeleted)
    .sort((a, b) => ts(b) - ts(a));
}

/** فاتورة طلب واحد: { gross, paid, rem } — قيم مُقصّرة ≥ 0. */
export function invoiceOf(order) {
  const gross = Math.max(0, orderGrossTotal(order));
  const rem = Math.max(0, calcRem(order));
  return { gross, rem, paid: Math.max(0, gross - rem) };
}

/** إجمالي مالي عبر كل الطلبات. */
export function totalsOf(orders = []) {
  return orders.reduce((acc, o) => {
    const inv = invoiceOf(o);
    acc.gross += inv.gross; acc.paid += inv.paid; acc.rem += inv.rem;
    return acc;
  }, { gross: 0, paid: 0, rem: 0 });
}
