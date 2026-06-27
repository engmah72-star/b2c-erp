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

  // ══ الحصول على السعر الكلي بعد الخصم — مطابق لـ calcOrderPayment في financial-sync-engine ══
  // يشمل customerShipFee لأنها جزء من فاتورة العميل (يحصّلها مندوب الشحن)
  getNet(order) {
    const sale    = parseFloat(order?.salePrice)      || 0;
    const disc    = parseFloat(order?.discount)        || 0;
    const shipFee = parseFloat(order?.customerShipFee) || 0;
    return Math.max(0, sale + shipFee - disc);
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
      acc.costs      += (o.costItems || []).reduce((s, c) => s + (c.status !== 'voided' ? (parseFloat(c.total) || 0) : 0), 0);
      return acc;
    }, { salePrice: 0, paid: 0, remaining: 0, dueByCo: 0, costs: 0 });
  },

  // ══ تحديث الأوردر بعد دفعة جديدة (delta موجب) أو refund (delta سالب) ══
  calcAfterPayment(order, paymentAmount) {
    const oldPaid = this.getPaid(order);
    const newPaid = Math.max(0, oldPaid + paymentAmount);
    const net = this.getNet(order);
    const newRem = Math.max(0, net - newPaid);
    return {
      totalPaid: newPaid,
      remaining: newRem,
      paymentStatus: newRem <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'pending'
    };
  },

  // ══ عكس دفعة (حذف) ══
  calcAfterRefund(order, refundAmount) {
    return this.calcAfterPayment(order, -Math.abs(refundAmount));
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

  // ══ بنود تكلفة منتج واحد (reverse lookup) ══
  getProductCosts(order, productIdx) {
    const items = order?.costItems || [];
    const prods = order?.products || [];
    if (!items.length) return [];
    const prod = prods[productIdx];
    const pid = prod?.productId || null;
    return items.filter(ci => {
      if (!ci || ci.status === 'voided') return false;
      if (pid && ci.productId === pid) return true;
      if (ci.productId && pid && ci.productId !== pid) return false;
      return ci.prodIdx === productIdx || ci.prodIdx == null;
    });
  },

  // ══ ملخص تكلفة منتج واحد ══
  getProductCostSummary(order, productIdx) {
    const stored = order?.costSummaries?.[String(productIdx)];
    if (stored) return { totalCost: stored.totalCost || 0, itemCount: stored.itemCount || 0, costs: this.getProductCosts(order, productIdx) };
    const costs = this.getProductCosts(order, productIdx);
    const totalCost = costs.reduce((s, c) => s + (parseFloat(c.total) || 0), 0);
    return { totalCost, itemCount: costs.length, costs };
  },

  // ══ ملخص تكاليف كل المنتجات ══
  getAllProductCostSummaries(order) {
    const prods = order?.products || [];
    return prods.map((p, i) => ({
      productId: p.productId || null,
      name: p.name || '',
      index: i,
      ...this.getProductCostSummary(order, i),
    }));
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
