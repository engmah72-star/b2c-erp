/**
 * core/order-financials — الواجهة المركزية الوحيدة لقراءة ماليّات الأوردر (#1 مركزية).
 * نقي · ESM · يبني فوق order-math (المصدر الحسابي · RULE 1) — لا يكرّر صيغة.
 *
 * الهدف: نقطة قراءة واحدة لـ {gross, paid, rem, status} بدل تشتّت الحقول، +
 * كاشف انحراف بين القيمة **المخزّنة** (order.remaining/paymentStatus) والقيمة
 * **المحسوبة** (calcRem) — أداة للهجرة الآمنة دون حذف الحقول المخزّنة الآن.
 *
 * ملاحظة [دين موثّق]: «المدفوع» للأوردر له 3 حقول مصدر (totalPaid/paid/deposit)؛
 * هذه الواجهة تعتمد ترتيب order-math نفسه (totalPaid أولاً) — التوحيد الكامل
 * (حقل واحد + حذف remaining المخزّن) هجرة مُراجَعة على النواة المجمّدة.
 */
import { calcRem, orderGrossTotal } from './order-math.js';

const EPS = 0.01;
const num = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

/** حالة سداد مشتقّة من المتبقّي (لا من الحقل المخزّن). */
export function payStatusOf(order) {
  const gross = Math.max(0, orderGrossTotal(order));
  const rem = Math.max(0, calcRem(order));
  if (gross <= 0) return 'none';
  if (rem <= EPS) return 'paid';
  if (rem < gross - EPS) return 'partial';
  return 'pending';
}

/** الفاتورة الموحّدة لأوردر واحد: { gross, paid, rem, status }. */
export function invoiceOf(order) {
  const gross = Math.max(0, orderGrossTotal(order));
  const rem = Math.max(0, calcRem(order));
  return { gross, rem, paid: Math.max(0, gross - rem), status: payStatusOf(order) };
}

/** إجمالي عبر مجموعة أوردرات. */
export function totalsOf(orders = []) {
  return orders.reduce((a, o) => {
    const inv = invoiceOf(o);
    a.gross += inv.gross; a.paid += inv.paid; a.rem += inv.rem; return a;
  }, { gross: 0, paid: 0, rem: 0 });
}

/**
 * يكشف انحراف القيمة المخزّنة عن المحسوبة (للمراقبة/الهجرة).
 * يُرجع { hasDrift, remStored, remComputed, remDelta, statusStored, statusComputed, statusDrift }.
 */
export function detectDrift(order) {
  const remComputed = Math.max(0, calcRem(order));
  const remStored = order?.remaining;
  const remDelta = remStored == null ? null : Math.abs(num(remStored) - remComputed);
  const statusComputed = payStatusOf(order);
  const statusStored = order?.paymentStatus || null;
  const statusDrift = !!statusStored && statusStored !== 'returned' && statusStored !== statusComputed;
  return {
    hasDrift: (remDelta != null && remDelta > EPS) || statusDrift,
    remStored: remStored == null ? null : num(remStored), remComputed, remDelta,
    statusStored, statusComputed, statusDrift,
  };
}
