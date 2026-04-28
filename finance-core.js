// ══════════════════════════════════════════════════
// finance-core.js — الحسابات المركزية لـ Business2Card
// كل الأرقام المالية تمر من هنا
// ══════════════════════════════════════════════════

window.FinanceCore = {

  // ══ الحصول على المدفوع الفعلي ══
  getPaid(order) {
    return parseFloat(order?.totalPaid)
      || parseFloat(order?.paid)
      || parseFloat(order?.deposit)
      || 0;
  },

  // ══ الحصول على السعر الكلي بعد الخصم ══
  getNet(order) {
    const sale = parseFloat(order?.salePrice) || 0;
    const disc = parseFloat(order?.discount) || 0;
    return Math.max(0, sale - disc);
  },

  // ══ الباقي على العميل ══
  getRemaining(order) {
    const stored = parseFloat(order?.remaining);
    if (!isNaN(stored) && stored >= 0) return stored;
    return Math.max(0, this.getNet(order) - this.getPaid(order));
  },

  // ══ ما على شركة الشحن (dueByCo) ══
  getDueByCo(order) {
    const net = this.getNet(order);
    const paid = this.getPaid(order);
    return Math.max(0, net - paid);
  },

  // ══ حالة الدفع ══
  getPaymentStatus(order) {
    const rem = this.getRemaining(order);
    const paid = this.getPaid(order);
    if (rem <= 0) return 'paid';
    if (paid > 0) return 'partial';
    return 'pending';
  },

  // ══ نسبة التحصيل ══
  getCollectionPct(order) {
    const net = this.getNet(order);
    if (!net) return 0;
    return Math.min(100, Math.round(this.getPaid(order) / net * 100));
  },

  // ══ إجماليات مجموعة أوردرات ══
  sumOrders(orders) {
    return orders.reduce((acc, o) => {
      acc.salePrice  += parseFloat(o.salePrice) || 0;
      acc.paid       += this.getPaid(o);
      acc.remaining  += this.getRemaining(o);
      acc.dueByCo    += this.getDueByCo(o);
      acc.costs      += (o.costItems || []).reduce((s, c) => s + (parseFloat(c.total) || 0), 0);
      return acc;
    }, { salePrice: 0, paid: 0, remaining: 0, dueByCo: 0, costs: 0 });
  },

  // ══ تحديث الأوردر بعد دفعة جديدة ══
  calcAfterPayment(order, paymentAmount) {
    const oldPaid = this.getPaid(order);
    const newPaid = oldPaid + paymentAmount;
    const net = this.getNet(order);
    const newRem = Math.max(0, net - newPaid);
    return {
      totalPaid: newPaid,
      paid: newPaid,
      remaining: newRem,
      paymentStatus: newRem <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'pending'
    };
  },

  // ══ عكس دفعة (حذف) ══
  calcAfterRefund(order, refundAmount) {
    const oldPaid = this.getPaid(order);
    const newPaid = Math.max(0, oldPaid - refundAmount);
    const net = this.getNet(order);
    const newRem = Math.max(0, net - newPaid);
    return {
      totalPaid: newPaid,
      paid: newPaid,
      remaining: newRem,
      paymentStatus: newRem <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'pending'
    };
  },

  // ══ فلتر أوردرات الشحن (بدون pickup + مسوّى) ══
  getShippingDebt(orders) {
    return orders.filter(o =>
      o.shipCompanyName &&
      ['shipping', 'archived'].includes(o.stage) &&
      !o.shipSettled &&
      o.shipMethod !== 'pickup'
    );
  },

  // ══ تنسيق الأرقام ══
  format(n) {
    return (parseFloat(n) || 0).toLocaleString('ar-EG');
  },

  // ══ التحقق من صحة الدفعة ══
  validatePayment(amount, maxAllowed, walletBalance) {
    if (!amount || amount <= 0) return { ok: false, msg: '⚠️ أدخل مبلغ صحيح' };
    if (amount > maxAllowed + 0.01) return { ok: false, msg: `⚠️ المبلغ أكبر من المتبقي (${this.format(maxAllowed)} ج)` };
    if (walletBalance !== null && amount > walletBalance + 0.01) return { ok: false, msg: `⚠️ رصيد المحفظة غير كافٍ (${this.format(walletBalance)} ج)` };
    return { ok: true };
  }
};

// ══ اختصارات سريعة ══
window.FC = window.FinanceCore;
