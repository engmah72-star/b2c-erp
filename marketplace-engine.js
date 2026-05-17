/**
 * marketplace-engine.js — محرك عمليات المنصة
 * Marketplace Operations Engine — v1
 *
 * كل عملية MFE تمر عبر handler واحد هنا، يلتزم بـ:
 *   - RULE 2 + 3: writeBatch ذري — لا writes متسلسلة، لا chained .then()
 *   - RULE 5: financial_ledger في نفس الـ batch لكل حركة مالية
 *   - RULE 6: لا يلمس أي صفحة من الـ 55 صفحة الحالية
 *
 * Business DNA:
 *   - Commission flat 10% على صافي سعر المنتج (بدون شحن وخصومات)
 *   - merchant_001 (شركتك) معفاة من العمولة (rate = 0)
 *   - Escrow يُفرج T+3 من التسليم (scheduler خارجي ينادي ESCROW_RELEASE)
 *   - Refund window 7 أيام → clawback من Merchant Wallet لو دخل > T+3
 *   - COD: شركة الشحن تجمع → تحويل أسبوعي → ESCROW_HOLD → split عند T+3
 *
 * Idempotency: كل dispatch يأخذ idempotencyKey اختياري.
 *   لو الـ key موجود في marketplace_idempotency → skip.
 */
import {
  writeBatch, doc, collection, getDoc, serverTimestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { addLedgerToBatch } from "./financial-sync-engine.js";
import {
  MFE, ME, KYC_STATUS, ESCROW_STATE, PAYOUT_STATE,
  DEFAULT_TENANT_ID, OPERATOR_TENANT_ID,
} from "./marketplace-core.js";

console.log('[MKE] 🛒 Marketplace Engine v1 loaded');

// ══════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════
export const PLATFORM_COMMISSION_RATE = 0.10;
export const ESCROW_HOLD_DAYS         = 3;
export const REFUND_WINDOW_DAYS       = 7;

// المحافظ المركزية للمنصة — لازم تُنشأ مرة واحدة عبر bootstrapPlatformWallets()
export const PLATFORM_WALLETS = {
  ESCROW:  'platform_escrow',   // wallets/platform_escrow — يحتجز فلوس العملاء قبل التسليم
  REVENUE: 'platform_revenue',  // wallets/platform_revenue — إيرادات المنصة من العمولة
};

// خيارات وجهة الاسترداد (Hybrid: العميل يختار)
export const REFUND_DESTINATION = {
  ORIGINAL_PAYMENT: 'original_payment',  // يرجع لوسيلة الدفع الأصلية (تحويل خارجي)
  PLATFORM_WALLET:  'platform_wallet',   // رصيد على customer_wallets
};

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

/**
 * 10% × صافي سعر المنتج. لو tenantCommissionRate موجود يتقدم على الـ default.
 * merchant_001 يُسجَّل بـ commissionRate = 0 → لا عمولة.
 */
export function calcCommission(netProductAmount, tenantCommissionRate) {
  const amt  = Math.max(0, parseFloat(netProductAmount) || 0);
  const rate = (tenantCommissionRate != null && !isNaN(tenantCommissionRate))
    ? Math.min(Math.max(parseFloat(tenantCommissionRate), 0), 1)
    : PLATFORM_COMMISSION_RATE;
  return +(amt * rate).toFixed(2);
}

/**
 * Idempotency pre-check. لو الـ key اتسجّل قبل كده → return true (skip).
 * يُنادى مرة في بداية كل handler قبل الـ batch.
 */
async function isAlreadyProcessed(db, idempotencyKey) {
  if (!idempotencyKey) return false;
  const snap = await getDoc(doc(db, 'marketplace_idempotency', idempotencyKey));
  return snap.exists();
}

/**
 * يضيف علامة idempotency للـ batch (يُستهلك مع باقي العمليات ذرياً).
 */
function markIdempotency(batch, db, idempotencyKey, eventType) {
  if (!idempotencyKey) return;
  batch.set(doc(db, 'marketplace_idempotency', idempotencyKey), {
    eventType,
    processedAt: serverTimestamp(),
  });
}

/**
 * يضيف audit log entry للـ batch — للأحداث غير المالية (KYC، dispute…).
 * financial_ledger مخصص للحركات المالية فقط (RULE 5).
 */
function addAuditToBatch(batch, db, action, p) {
  const ref = doc(collection(db, 'marketplace_audit_log'));
  batch.set(ref, {
    action,
    tenantId:    p.tenantId    || null,
    customerId:  p.customerId  || null,
    orderId:     p.orderId     || null,
    actorId:     p.userId      || p.actorId     || '',
    actorName:   p.userName    || p.actorName   || '',
    payload:     p.payload     || {},
    notes:       p.notes       || '',
    createdAt:   serverTimestamp(),
  });
  return ref;
}

/**
 * يضيف event للـ notifier queue (delivery لاحقاً عبر service منفصل).
 */
function addNotificationToBatch(batch, db, type, p) {
  const ref = doc(collection(db, 'marketplace_events'));
  batch.set(ref, {
    type,
    tenantId:   p.tenantId   || null,
    customerId: p.customerId || null,
    orderId:    p.orderId    || null,
    payload:    p.payload    || {},
    delivered:  false,
    createdAt:  serverTimestamp(),
  });
  return ref;
}

// ══════════════════════════════════════════════════════════════════
// BOOTSTRAP — يُنادى مرة واحدة من admin لإنشاء محافظ المنصة
// ══════════════════════════════════════════════════════════════════
export async function bootstrapPlatformWallets(db, p = {}) {
  const batch  = writeBatch(db);
  const esRef  = doc(db, 'wallets', PLATFORM_WALLETS.ESCROW);
  const revRef = doc(db, 'wallets', PLATFORM_WALLETS.REVENUE);

  const esSnap  = await getDoc(esRef);
  const revSnap = await getDoc(revRef);

  if (!esSnap.exists()) {
    batch.set(esRef, {
      name: 'Platform Escrow', balance: 0, currency: 'EGP',
      type: 'escrow', isSystem: true,
      createdAt: serverTimestamp(), createdBy: p.userId || '',
    });
  }
  if (!revSnap.exists()) {
    batch.set(revRef, {
      name: 'Platform Revenue', balance: 0, currency: 'EGP',
      type: 'revenue', isSystem: true,
      createdAt: serverTimestamp(), createdBy: p.userId || '',
    });
  }
  await batch.commit();
  console.log('[MKE] 🏛️ platform wallets bootstrapped');
  return { escrow: PLATFORM_WALLETS.ESCROW, revenue: PLATFORM_WALLETS.REVENUE };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 1 — MERCHANT ONBOARDING
// ينشئ tenant + merchant wallet في batch.
// payload: { tenantId, type, legalName, displayName, ownerName, phone, email,
//            city, governorate, taxId, commissionRate?, bankAccount?, userId, userName }
// ══════════════════════════════════════════════════════════════════
async function handleMerchantOnboarding(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) {
    console.log('[MKE] ⏭️ skipped — duplicate:', p.idempotencyKey);
    return { skipped: true };
  }
  if (!p.tenantId || !p.legalName) throw new Error('[MKE] tenantId و legalName مطلوبان');

  const batch = writeBatch(db);
  const tenantRef = doc(db, 'tenants', p.tenantId);
  const walletRef = doc(collection(db, 'wallets'));

  batch.set(tenantRef, {
    id:             p.tenantId,
    type:           p.type || ME.MERCHANT,
    legalName:      p.legalName,
    displayName:    p.displayName || p.legalName,
    ownerName:      p.ownerName   || '',
    phone:          p.phone       || '',
    email:          p.email       || '',
    city:           p.city        || '',
    governorate:    p.governorate || '',
    taxId:          p.taxId       || '',
    kycStatus:      KYC_STATUS.PENDING,
    kycDocs:        p.kycDocs || [],
    commissionRate: p.commissionRate != null ? p.commissionRate : PLATFORM_COMMISSION_RATE,
    bankAccount:    p.bankAccount || null,
    walletId:       walletRef.id,
    isActive:       false,
    createdAt:      serverTimestamp(),
    createdBy:      p.userId || '',
  });

  batch.set(walletRef, {
    name:       `${p.displayName || p.legalName} — Merchant Wallet`,
    balance:    0,
    currency:   'EGP',
    type:       'merchant',
    tenantId:   p.tenantId,
    isSystem:   false,
    createdAt:  serverTimestamp(),
    createdBy:  p.userId || '',
  });

  addAuditToBatch(batch, db, MFE.MERCHANT_ONBOARDING, p);
  addNotificationToBatch(batch, db, MFE.MERCHANT_ONBOARDING, p);
  markIdempotency(batch, db, p.idempotencyKey, MFE.MERCHANT_ONBOARDING);

  await batch.commit();
  console.log('[MKE] ✅ MERCHANT_ONBOARDING:', p.tenantId);
  return { tenantId: p.tenantId, walletId: walletRef.id };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 2 — MERCHANT KYC APPROVED / SUSPENDED
// ══════════════════════════════════════════════════════════════════
async function handleMerchantKycChange(db, eventType, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.tenantId) throw new Error('[MKE] tenantId مطلوب');

  const isApproval = eventType === MFE.MERCHANT_KYC_APPROVED;
  const batch = writeBatch(db);
  batch.update(doc(db, 'tenants', p.tenantId), {
    kycStatus: isApproval ? KYC_STATUS.APPROVED : KYC_STATUS.SUSPENDED,
    isActive:  isApproval,
    ...(isApproval ? { approvedAt: serverTimestamp(), approvedBy: p.userId || '' }
                   : { suspendedAt: serverTimestamp(), suspendReason: p.reason || '' }),
  });
  addAuditToBatch(batch, db, eventType, p);
  addNotificationToBatch(batch, db, eventType, p);
  markIdempotency(batch, db, p.idempotencyKey, eventType);

  await batch.commit();
  console.log('[MKE] ✅', eventType, ':', p.tenantId);
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 3 — MARKETPLACE ORDER CREATED
// ينشئ marketplace_orders + escrow_hold (state: HELD) — لم تُدفع فلوس بعد.
// ══════════════════════════════════════════════════════════════════
async function handleMarketplaceOrderCreated(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.tenantId || !(p.grossAmount > 0)) throw new Error('[MKE] tenantId و grossAmount مطلوبان');

  // اقرأ tenant علشان commissionRate
  const tenantSnap = await getDoc(doc(db, 'tenants', p.tenantId));
  const tenant = tenantSnap.exists() ? tenantSnap.data() : {};
  const commissionAmount = calcCommission(p.grossAmount, tenant.commissionRate);
  const netToMerchant    = +(p.grossAmount - commissionAmount).toFixed(2);

  const batch = writeBatch(db);
  const orderRef  = p.orderId ? doc(db, 'marketplace_orders', p.orderId) : doc(collection(db, 'marketplace_orders'));
  const escrowRef = doc(collection(db, 'escrow_holds'));

  batch.set(orderRef, {
    tenantId:         p.tenantId,
    customerId:       p.customerId    || null,
    customerName:     p.customerName  || '',
    items:            p.items         || [],
    grossAmount:      p.grossAmount,
    shippingFee:      p.shippingFee   || 0,
    commissionAmount, netToMerchant,
    commissionRate:   tenant.commissionRate != null ? tenant.commissionRate : PLATFORM_COMMISSION_RATE,
    paymentMethod:    p.paymentMethod || 'cod',
    escrowId:         escrowRef.id,
    status:           'created',
    shippingPartnerId: p.shippingPartnerId || null,
    agentId:          p.agentId || null,
    createdAt:        serverTimestamp(),
    createdBy:        p.userId || '',
  });

  batch.set(escrowRef, {
    orderId:    orderRef.id,
    tenantId:   p.tenantId,
    customerId: p.customerId || null,
    amount:     p.grossAmount,
    state:      ESCROW_STATE.HELD,
    walletId:   PLATFORM_WALLETS.ESCROW,
    heldAt:     serverTimestamp(),
  });

  addAuditToBatch(batch, db, MFE.MARKETPLACE_ORDER_CREATED, { ...p, orderId: orderRef.id });
  addNotificationToBatch(batch, db, MFE.MARKETPLACE_ORDER_CREATED, { ...p, orderId: orderRef.id });
  markIdempotency(batch, db, p.idempotencyKey, MFE.MARKETPLACE_ORDER_CREATED);

  await batch.commit();
  console.log('[MKE] ✅ MARKETPLACE_ORDER_CREATED:', orderRef.id);
  return { orderId: orderRef.id, escrowId: escrowRef.id, commissionAmount, netToMerchant };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 4 — MARKETPLACE ORDER CAPTURED
// الفلوس وصلت للمنصة (دفع إلكتروني أو تحويل أسبوعي COD) → تدخل Escrow.
// ══════════════════════════════════════════════════════════════════
async function handleMarketplaceOrderCaptured(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.orderId || !(p.amount > 0)) throw new Error('[MKE] orderId و amount مطلوبان');

  const batch = writeBatch(db);
  batch.update(doc(db, 'wallets', PLATFORM_WALLETS.ESCROW), { balance: increment(p.amount) });
  batch.update(doc(db, 'marketplace_orders', p.orderId), {
    status:     'captured',
    capturedAt: serverTimestamp(),
  });
  addLedgerToBatch(batch, db, MFE.MARKETPLACE_ORDER_CAPTURED, {
    amount:     p.amount,
    walletId:   PLATFORM_WALLETS.ESCROW,
    walletName: 'Platform Escrow',
    orderId:    p.orderId,
    clientId:   p.customerId   || null,
    clientName: p.customerName || '',
    refId:      p.orderId,
    notes:      `تحصيل ${p.paymentMethod || ''} — ${p.notes || ''}`,
    userId:     p.userId, userName: p.userName,
    direction:  'in',
  });
  addNotificationToBatch(batch, db, MFE.MARKETPLACE_ORDER_CAPTURED, p);
  markIdempotency(batch, db, p.idempotencyKey, MFE.MARKETPLACE_ORDER_CAPTURED);

  await batch.commit();
  console.log('[MKE] ✅ MARKETPLACE_ORDER_CAPTURED:', p.orderId, '+', p.amount);
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 5 — ESCROW RELEASE (يُنادى T+3 من التسليم)
// يُفرج Escrow → split: عمولة → Operator Revenue، باقي → Merchant Wallet.
// ══════════════════════════════════════════════════════════════════
async function handleEscrowRelease(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.escrowId) throw new Error('[MKE] escrowId مطلوب');

  const escrowSnap = await getDoc(doc(db, 'escrow_holds', p.escrowId));
  if (!escrowSnap.exists()) throw new Error('[MKE] escrow غير موجود: ' + p.escrowId);
  const escrow = escrowSnap.data();
  if (escrow.state !== ESCROW_STATE.HELD) throw new Error('[MKE] escrow ليس في state=HELD: ' + escrow.state);

  const orderSnap = await getDoc(doc(db, 'marketplace_orders', escrow.orderId));
  const order = orderSnap.exists() ? orderSnap.data() : {};
  const tenantSnap = await getDoc(doc(db, 'tenants', escrow.tenantId));
  const tenant = tenantSnap.exists() ? tenantSnap.data() : {};
  const merchantWalletId = tenant.walletId;
  if (!merchantWalletId) throw new Error('[MKE] merchant بدون wallet: ' + escrow.tenantId);

  const commissionAmount = +(order.commissionAmount || 0);
  const netToMerchant    = +(order.netToMerchant    || (escrow.amount - commissionAmount));

  const batch = writeBatch(db);
  // 1. سحب من Escrow
  batch.update(doc(db, 'wallets', PLATFORM_WALLETS.ESCROW), { balance: increment(-escrow.amount) });
  // 2. إيداع العمولة في Platform Revenue
  if (commissionAmount > 0) {
    batch.update(doc(db, 'wallets', PLATFORM_WALLETS.REVENUE), { balance: increment(commissionAmount) });
  }
  // 3. إيداع الباقي في Merchant Wallet
  batch.update(doc(db, 'wallets', merchantWalletId), { balance: increment(netToMerchant) });
  // 4. تحديث Escrow + Order
  batch.update(doc(db, 'escrow_holds', p.escrowId), {
    state:      ESCROW_STATE.RELEASED,
    releasedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'marketplace_orders', escrow.orderId), {
    status:     'fulfilled',
    fulfilledAt: serverTimestamp(),
  });
  // 5. إنشاء سجل commission
  const commRef = doc(collection(db, 'commissions'));
  batch.set(commRef, {
    tenantId:    escrow.tenantId,
    orderId:     escrow.orderId,
    amount:      commissionAmount,
    rate:        order.commissionRate || PLATFORM_COMMISSION_RATE,
    state:       'settled',
    accruedAt:   serverTimestamp(),
    settledAt:   serverTimestamp(),
  });

  // 6. financial_ledger entries (RULE 5)
  addLedgerToBatch(batch, db, MFE.ESCROW_RELEASE, {
    amount: escrow.amount, walletId: PLATFORM_WALLETS.ESCROW, walletName: 'Platform Escrow',
    orderId: escrow.orderId, refId: p.escrowId,
    notes: `إفراج Escrow — ${escrow.tenantId}`,
    userId: p.userId, userName: p.userName,
  });
  if (commissionAmount > 0) {
    addLedgerToBatch(batch, db, MFE.COMMISSION_SETTLED, {
      amount: commissionAmount, walletId: PLATFORM_WALLETS.REVENUE, walletName: 'Platform Revenue',
      orderId: escrow.orderId, refId: commRef.id,
      vendorId: escrow.tenantId, vendorName: tenant.displayName || tenant.legalName || '',
      notes: `عمولة ${(order.commissionRate || PLATFORM_COMMISSION_RATE) * 100}% — order ${escrow.orderId}`,
      userId: p.userId, userName: p.userName,
    });
  }
  // قيد إيداع للـ merchant wallet — نفس event ESCROW_RELEASE لكن direction=in
  // (type=transfer يتسق مع كلا الاتجاهين بدون تضارب سيمانتيكي).
  addLedgerToBatch(batch, db, MFE.ESCROW_RELEASE, {
    amount: netToMerchant, walletId: merchantWalletId, walletName: tenant.displayName || '',
    orderId: escrow.orderId, refId: p.escrowId,
    vendorId: escrow.tenantId, vendorName: tenant.displayName || tenant.legalName || '',
    notes: `حصة المرشنت من إفراج Escrow — order ${escrow.orderId}`,
    userId: p.userId, userName: p.userName,
    direction: 'in',
  });

  addNotificationToBatch(batch, db, MFE.ESCROW_RELEASE, { ...p, tenantId: escrow.tenantId, orderId: escrow.orderId });
  markIdempotency(batch, db, p.idempotencyKey, MFE.ESCROW_RELEASE);

  await batch.commit();
  console.log('[MKE] ✅ ESCROW_RELEASE:', p.escrowId, '→ merchant:', netToMerchant, '/ commission:', commissionAmount);
  return { netToMerchant, commissionAmount };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 6 — ESCROW REFUND / ORDER CANCELLED قبل التسليم
// يرد Escrow كاملاً للعميل (refund destination: original_payment أو platform_wallet).
// ══════════════════════════════════════════════════════════════════
async function handleEscrowRefund(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.escrowId) throw new Error('[MKE] escrowId مطلوب');

  const escrowSnap = await getDoc(doc(db, 'escrow_holds', p.escrowId));
  if (!escrowSnap.exists()) throw new Error('[MKE] escrow غير موجود');
  const escrow = escrowSnap.data();
  if (escrow.state === ESCROW_STATE.REFUNDED) return { skipped: true, reason: 'already refunded' };
  if (escrow.state === ESCROW_STATE.RELEASED) {
    throw new Error('[MKE] Escrow أُفرج بالفعل — استخدم CHARGEBACK بدلاً من REFUND');
  }

  const refundAmount = +(p.amount || escrow.amount);
  if (refundAmount > escrow.amount + 0.01) throw new Error('[MKE] refund > escrow amount');
  const destination = p.destination || REFUND_DESTINATION.ORIGINAL_PAYMENT;

  const batch = writeBatch(db);
  batch.update(doc(db, 'wallets', PLATFORM_WALLETS.ESCROW), { balance: increment(-refundAmount) });
  batch.update(doc(db, 'escrow_holds', p.escrowId), {
    state:      ESCROW_STATE.REFUNDED,
    refundedAt: serverTimestamp(),
    refundAmount,
    refundDestination: destination,
  });
  batch.update(doc(db, 'marketplace_orders', escrow.orderId), {
    status:      'refunded',
    refundedAt:  serverTimestamp(),
  });

  if (destination === REFUND_DESTINATION.PLATFORM_WALLET && escrow.customerId) {
    // أنشئ/حدّث customer_wallet
    batch.set(doc(db, 'customer_wallets', escrow.customerId), {
      balance:    increment(refundAmount),
      currency:   'EGP',
      updatedAt:  serverTimestamp(),
    }, { merge: true });
  }
  // لو original_payment → التحويل البنكي خارج النظام، نسجّل فقط

  addLedgerToBatch(batch, db, MFE.ESCROW_REFUND, {
    amount: refundAmount, walletId: PLATFORM_WALLETS.ESCROW, walletName: 'Platform Escrow',
    orderId: escrow.orderId, refId: p.escrowId,
    clientId: escrow.customerId, clientName: p.customerName || '',
    notes: `استرداد Escrow → ${destination} — ${p.reason || ''}`,
    userId: p.userId, userName: p.userName,
  });
  addNotificationToBatch(batch, db, MFE.ESCROW_REFUND, { ...p, orderId: escrow.orderId });
  markIdempotency(batch, db, p.idempotencyKey, MFE.ESCROW_REFUND);

  await batch.commit();
  console.log('[MKE] ✅ ESCROW_REFUND:', p.escrowId, '→', destination, refundAmount);
  return { refundAmount, destination };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 7 — MERCHANT PAYOUT (request + paid)
// REQUESTED: ينشئ payout record، لا يحرك أموال (الـ admin يحول بنكياً ثم ينادي PAID).
// PAID:      يخصم من Merchant Wallet + يسجل في financial_ledger.
// ══════════════════════════════════════════════════════════════════
async function handleMerchantPayout(db, action, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.tenantId || !(p.amount > 0)) throw new Error('[MKE] tenantId و amount مطلوبان');

  const tenantSnap = await getDoc(doc(db, 'tenants', p.tenantId));
  const tenant = tenantSnap.exists() ? tenantSnap.data() : {};
  if (!tenant.walletId) throw new Error('[MKE] merchant بدون wallet');

  const batch = writeBatch(db);

  if (action === 'request') {
    const payoutRef = doc(collection(db, 'payouts'));
    batch.set(payoutRef, {
      tenantId:      p.tenantId,
      recipientType: ME.MERCHANT,
      amount:        p.amount,
      state:         PAYOUT_STATE.REQUESTED,
      bankRef:       '',
      orderIds:      p.orderIds || [],
      requestedAt:   serverTimestamp(),
      requestedBy:   p.userId || '',
    });
    addAuditToBatch(batch, db, 'PAYOUT_REQUESTED', { ...p, payload: { payoutId: payoutRef.id } });
    addNotificationToBatch(batch, db, 'PAYOUT_REQUESTED', p);
    markIdempotency(batch, db, p.idempotencyKey, 'PAYOUT_REQUESTED');
    await batch.commit();
    console.log('[MKE] ✅ PAYOUT_REQUESTED:', payoutRef.id);
    return { payoutId: payoutRef.id };
  }

  if (action === 'paid') {
    if (!p.payoutId) throw new Error('[MKE] payoutId مطلوب');
    batch.update(doc(db, 'wallets', tenant.walletId), { balance: increment(-p.amount) });
    batch.update(doc(db, 'payouts', p.payoutId), {
      state:    PAYOUT_STATE.PAID,
      bankRef:  p.bankRef || '',
      paidAt:   serverTimestamp(),
      paidBy:   p.userId || '',
    });
    addLedgerToBatch(batch, db, MFE.MERCHANT_PAYOUT, {
      amount: p.amount, walletId: tenant.walletId, walletName: tenant.displayName || '',
      vendorId: p.tenantId, vendorName: tenant.displayName || tenant.legalName || '',
      refId:  p.payoutId,
      notes:  `payout ${p.bankRef || ''}`,
      userId: p.userId, userName: p.userName,
    });
    addNotificationToBatch(batch, db, 'PAYOUT_PAID', p);
    markIdempotency(batch, db, p.idempotencyKey, MFE.MERCHANT_PAYOUT);
    await batch.commit();
    console.log('[MKE] ✅ PAYOUT_PAID:', p.payoutId, '-', p.amount);
    return {};
  }

  throw new Error('[MKE] action غير معروف لـ payout: ' + action);
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 8 — CHARGEBACK
// نزاع بعد إفراج Escrow → عكس العمولة + خصم من Merchant Wallet + رد للعميل.
// ══════════════════════════════════════════════════════════════════
async function handleChargeback(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.orderId || !(p.amount > 0)) throw new Error('[MKE] orderId و amount مطلوبان');

  const orderSnap = await getDoc(doc(db, 'marketplace_orders', p.orderId));
  if (!orderSnap.exists()) throw new Error('[MKE] order غير موجود');
  const order = orderSnap.data();
  const tenantSnap = await getDoc(doc(db, 'tenants', order.tenantId));
  const tenant = tenantSnap.exists() ? tenantSnap.data() : {};
  if (!tenant.walletId) throw new Error('[MKE] merchant بدون wallet');

  const chargebackAmount = +p.amount;
  // نسبة الـ chargeback من الـ order → تحدد كم commission نعكس
  const ratio        = chargebackAmount / order.grossAmount;
  const commReversal = +((order.commissionAmount || 0) * ratio).toFixed(2);
  const merchantHit  = +(chargebackAmount - commReversal).toFixed(2);
  const destination  = p.destination || REFUND_DESTINATION.ORIGINAL_PAYMENT;

  const batch = writeBatch(db);
  // 1. خصم من Merchant Wallet (قد يصبح سالباً — debt)
  batch.update(doc(db, 'wallets', tenant.walletId), { balance: increment(-merchantHit) });
  // 2. عكس العمولة من Platform Revenue
  if (commReversal > 0) {
    batch.update(doc(db, 'wallets', PLATFORM_WALLETS.REVENUE), { balance: increment(-commReversal) });
  }
  // 3. رد للعميل
  if (destination === REFUND_DESTINATION.PLATFORM_WALLET && order.customerId) {
    batch.set(doc(db, 'customer_wallets', order.customerId), {
      balance:   increment(chargebackAmount),
      currency:  'EGP',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  // 4. تحديث الـ order
  batch.update(doc(db, 'marketplace_orders', p.orderId), {
    status:           'chargedback',
    chargebackAt:     serverTimestamp(),
    chargebackAmount,
    chargebackReason: p.reason || '',
  });
  // 5. سجل commission reversal
  const commRevRef = doc(collection(db, 'commissions'));
  batch.set(commRevRef, {
    tenantId:    order.tenantId,
    orderId:     p.orderId,
    amount:      -commReversal,
    rate:        order.commissionRate || PLATFORM_COMMISSION_RATE,
    state:       'reversed',
    reversedAt:  serverTimestamp(),
  });

  // 6. financial_ledger
  addLedgerToBatch(batch, db, MFE.CHARGEBACK, {
    amount: chargebackAmount, walletId: tenant.walletId, walletName: tenant.displayName || '',
    orderId: p.orderId, refId: p.orderId,
    vendorId: order.tenantId, vendorName: tenant.displayName || tenant.legalName || '',
    clientId: order.customerId, clientName: order.customerName || '',
    notes: `chargeback — ${p.reason || ''} (commReversal: ${commReversal}, merchantHit: ${merchantHit})`,
    userId: p.userId, userName: p.userName,
  });
  addNotificationToBatch(batch, db, MFE.CHARGEBACK, { ...p, tenantId: order.tenantId });
  markIdempotency(batch, db, p.idempotencyKey, MFE.CHARGEBACK);

  await batch.commit();
  console.log('[MKE] ⚠️ CHARGEBACK:', p.orderId, '→ merchantHit:', merchantHit, '/ commReversal:', commReversal);
  return { merchantHit, commReversal, chargebackAmount };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 9 — ESCROW HOLD (standalone)
// لسيناريوهات escrow خارج marketplace_order (B2B، escrow مخصص).
// payload: { customerId?, amount, walletSourceId?, reason, notes }
// ══════════════════════════════════════════════════════════════════
async function handleEscrowHold(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!(p.amount > 0)) throw new Error('[MKE] amount مطلوب وموجب');

  const batch = writeBatch(db);
  const escrowRef = doc(collection(db, 'escrow_holds'));

  batch.update(doc(db, 'wallets', PLATFORM_WALLETS.ESCROW), { balance: increment(p.amount) });
  batch.set(escrowRef, {
    orderId:    p.orderId    || null,
    tenantId:   p.tenantId   || null,
    customerId: p.customerId || null,
    amount:     p.amount,
    state:      ESCROW_STATE.HELD,
    walletId:   PLATFORM_WALLETS.ESCROW,
    sourceWalletId: p.walletSourceId || null,
    reason:     p.reason     || '',
    heldAt:     serverTimestamp(),
    createdBy:  p.userId     || '',
  });

  addLedgerToBatch(batch, db, MFE.ESCROW_HOLD, {
    amount:     p.amount,
    walletId:   PLATFORM_WALLETS.ESCROW,
    walletName: 'Platform Escrow',
    orderId:    p.orderId    || null,
    clientId:   p.customerId || null,
    refId:      escrowRef.id,
    notes:      `حجز Escrow — ${p.reason || p.notes || ''}`,
    userId: p.userId, userName: p.userName,
  });
  addNotificationToBatch(batch, db, MFE.ESCROW_HOLD, { ...p, escrowId: escrowRef.id });
  markIdempotency(batch, db, p.idempotencyKey, MFE.ESCROW_HOLD);

  await batch.commit();
  console.log('[MKE] ✅ ESCROW_HOLD:', escrowRef.id, '+', p.amount);
  return { escrowId: escrowRef.id };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 10 — PLATFORM FEE COLLECTED
// رسوم منصة لمرة واحدة من المرشنت (listing fee، subscription، promoted).
// payload: { tenantId, amount, feeType, notes }
// ══════════════════════════════════════════════════════════════════
async function handlePlatformFeeCollected(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.tenantId || !(p.amount > 0)) throw new Error('[MKE] tenantId و amount مطلوبان');

  const tenantSnap = await getDoc(doc(db, 'tenants', p.tenantId));
  const tenant = tenantSnap.exists() ? tenantSnap.data() : {};
  if (!tenant.walletId) throw new Error('[MKE] merchant بدون wallet');

  const batch = writeBatch(db);
  batch.update(doc(db, 'wallets', tenant.walletId),     { balance: increment(-p.amount) });
  batch.update(doc(db, 'wallets', PLATFORM_WALLETS.REVENUE), { balance: increment(p.amount) });

  addLedgerToBatch(batch, db, MFE.PLATFORM_FEE_COLLECTED, {
    amount:     p.amount,
    walletId:   PLATFORM_WALLETS.REVENUE,
    walletName: 'Platform Revenue',
    vendorId:   p.tenantId,
    vendorName: tenant.displayName || tenant.legalName || '',
    refId:      p.refId || null,
    notes:      `${p.feeType || 'platform_fee'} — ${p.notes || ''}`,
    userId: p.userId, userName: p.userName,
  });
  addNotificationToBatch(batch, db, MFE.PLATFORM_FEE_COLLECTED, p);
  markIdempotency(batch, db, p.idempotencyKey, MFE.PLATFORM_FEE_COLLECTED);

  await batch.commit();
  console.log('[MKE] ✅ PLATFORM_FEE_COLLECTED:', p.tenantId, '-', p.amount);
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 11 — COMMISSION ACCRUED (standalone)
// تسجيل عمولة مستحقة (قبل التحصيل) لمسار الفوترة الشهرية.
// لا يحرك أرصدة — pure accrual.
// payload: { tenantId, orderId, amount, rate, notes }
// ══════════════════════════════════════════════════════════════════
async function handleCommissionAccrued(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.tenantId || !(p.amount > 0)) throw new Error('[MKE] tenantId و amount مطلوبان');

  const batch = writeBatch(db);
  const commRef = doc(collection(db, 'commissions'));
  batch.set(commRef, {
    tenantId:    p.tenantId,
    orderId:     p.orderId || null,
    amount:      p.amount,
    rate:        p.rate != null ? p.rate : PLATFORM_COMMISSION_RATE,
    state:       'accrued',
    accruedAt:   serverTimestamp(),
    createdBy:   p.userId || '',
  });

  // قيد accrual في الـ ledger (نوع other — ليس حركة نقدية فعلية)
  addLedgerToBatch(batch, db, MFE.COMMISSION_ACCRUED, {
    amount:     p.amount,
    walletId:   PLATFORM_WALLETS.REVENUE,
    walletName: 'Platform Revenue',
    orderId:    p.orderId || null,
    vendorId:   p.tenantId,
    refId:      commRef.id,
    notes:      `عمولة مستحقة — ${p.notes || ''}`,
    userId: p.userId, userName: p.userName,
  });
  addNotificationToBatch(batch, db, MFE.COMMISSION_ACCRUED, { ...p, commissionId: commRef.id });
  markIdempotency(batch, db, p.idempotencyKey, MFE.COMMISSION_ACCRUED);

  await batch.commit();
  console.log('[MKE] ✅ COMMISSION_ACCRUED:', p.tenantId, '+', p.amount);
  return { commissionId: commRef.id };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 12 — COMMISSION SETTLED (standalone)
// تحصيل عمولة accrued سابقاً (دفع شهري من merchant wallet → platform revenue).
// payload: { commissionId, tenantId, amount?, notes }
// ══════════════════════════════════════════════════════════════════
async function handleCommissionSettled(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.commissionId) throw new Error('[MKE] commissionId مطلوب');

  const commSnap = await getDoc(doc(db, 'commissions', p.commissionId));
  if (!commSnap.exists()) throw new Error('[MKE] commission غير موجود');
  const comm = commSnap.data();
  if (comm.state === 'settled') return { skipped: true, reason: 'already settled' };
  if (comm.state === 'reversed') throw new Error('[MKE] commission مُعكَسة بالفعل');

  const tenantSnap = await getDoc(doc(db, 'tenants', comm.tenantId));
  const tenant = tenantSnap.exists() ? tenantSnap.data() : {};
  if (!tenant.walletId) throw new Error('[MKE] merchant بدون wallet');

  const amount = +(p.amount || comm.amount);
  const batch  = writeBatch(db);
  batch.update(doc(db, 'wallets', tenant.walletId),         { balance: increment(-amount) });
  batch.update(doc(db, 'wallets', PLATFORM_WALLETS.REVENUE), { balance: increment(amount) });
  batch.update(doc(db, 'commissions', p.commissionId), {
    state:     'settled',
    settledAt: serverTimestamp(),
    settledBy: p.userId || '',
  });

  addLedgerToBatch(batch, db, MFE.COMMISSION_SETTLED, {
    amount, walletId: PLATFORM_WALLETS.REVENUE, walletName: 'Platform Revenue',
    orderId:   comm.orderId || null,
    vendorId:  comm.tenantId,
    vendorName: tenant.displayName || tenant.legalName || '',
    refId:     p.commissionId,
    notes:     `تحصيل عمولة — ${p.notes || ''}`,
    userId: p.userId, userName: p.userName,
  });
  addNotificationToBatch(batch, db, MFE.COMMISSION_SETTLED, p);
  markIdempotency(batch, db, p.idempotencyKey, MFE.COMMISSION_SETTLED);

  await batch.commit();
  console.log('[MKE] ✅ COMMISSION_SETTLED:', p.commissionId, '+', amount);
  return { amount };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 13 — AGENT COMMISSION (accrual)
// تسجيل عمولة لمندوب على طلب — معلّقة لحين الـ payout.
// payload: { agentId, orderId, amount, rate?, notes }
// ══════════════════════════════════════════════════════════════════
async function handleAgentCommission(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.agentId || !(p.amount > 0)) throw new Error('[MKE] agentId و amount مطلوبان');

  const agentSnap = await getDoc(doc(db, 'tenants', p.agentId));
  const agent = agentSnap.exists() ? agentSnap.data() : {};

  const batch = writeBatch(db);
  const commRef = doc(collection(db, 'commissions'));
  batch.set(commRef, {
    tenantId:     p.agentId,
    recipientType: ME.AGENT,
    orderId:      p.orderId || null,
    amount:       p.amount,
    rate:         p.rate || null,
    state:        'accrued',
    accruedAt:    serverTimestamp(),
    createdBy:    p.userId || '',
  });

  addLedgerToBatch(batch, db, MFE.AGENT_COMMISSION, {
    amount:     p.amount,
    walletId:   PLATFORM_WALLETS.REVENUE,
    walletName: 'Platform Revenue',
    orderId:    p.orderId || null,
    vendorId:   p.agentId,
    vendorName: agent.displayName || agent.legalName || '',
    refId:      commRef.id,
    notes:      `عمولة مندوب — ${p.notes || ''}`,
    userId: p.userId, userName: p.userName,
  });
  addNotificationToBatch(batch, db, MFE.AGENT_COMMISSION, { ...p, commissionId: commRef.id });
  markIdempotency(batch, db, p.idempotencyKey, MFE.AGENT_COMMISSION);

  await batch.commit();
  console.log('[MKE] ✅ AGENT_COMMISSION:', p.agentId, '+', p.amount);
  return { commissionId: commRef.id };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 14 — AGENT PAYOUT (request + paid)
// نفس نمط MERCHANT_PAYOUT. الـ agent له wallet مستقل (في tenants.walletId).
// ══════════════════════════════════════════════════════════════════
async function handleAgentPayout(db, action, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.agentId || !(p.amount > 0)) throw new Error('[MKE] agentId و amount مطلوبان');

  // ملاحظة: الـ agent لا يملك wallet متراكم في النظام (commissions تُسجَّل كـ accrual فقط).
  // الـ payout يخصم من Platform Revenue مباشرة → تحويل بنكي خارجي.
  const agentSnap = await getDoc(doc(db, 'tenants', p.agentId));
  const agent = agentSnap.exists() ? agentSnap.data() : {};

  const batch = writeBatch(db);

  if (action === 'request') {
    const payoutRef = doc(collection(db, 'payouts'));
    batch.set(payoutRef, {
      tenantId:      p.agentId,
      recipientType: ME.AGENT,
      amount:        p.amount,
      state:         PAYOUT_STATE.REQUESTED,
      bankRef:       '',
      orderIds:      p.orderIds || [],
      commissionIds: p.commissionIds || [],
      requestedAt:   serverTimestamp(),
      requestedBy:   p.userId || '',
    });
    addAuditToBatch(batch, db, 'AGENT_PAYOUT_REQUESTED', { ...p, payload: { payoutId: payoutRef.id } });
    addNotificationToBatch(batch, db, 'AGENT_PAYOUT_REQUESTED', p);
    markIdempotency(batch, db, p.idempotencyKey, 'AGENT_PAYOUT_REQUESTED');
    await batch.commit();
    console.log('[MKE] ✅ AGENT_PAYOUT_REQUESTED:', payoutRef.id);
    return { payoutId: payoutRef.id };
  }

  if (action === 'paid') {
    if (!p.payoutId) throw new Error('[MKE] payoutId مطلوب');
    // الـ agent payout يخصم من Platform Revenue (لأن العمولة كانت income سابقاً)
    batch.update(doc(db, 'wallets', PLATFORM_WALLETS.REVENUE), { balance: increment(-p.amount) });
    batch.update(doc(db, 'payouts', p.payoutId), {
      state:   PAYOUT_STATE.PAID,
      bankRef: p.bankRef || '',
      paidAt:  serverTimestamp(),
      paidBy:  p.userId || '',
    });
    addLedgerToBatch(batch, db, MFE.AGENT_PAYOUT, {
      amount: p.amount,
      walletId: PLATFORM_WALLETS.REVENUE, walletName: 'Platform Revenue',
      vendorId: p.agentId, vendorName: agent.displayName || agent.legalName || '',
      refId:  p.payoutId,
      notes:  `agent payout ${p.bankRef || ''}`,
      userId: p.userId, userName: p.userName,
    });
    addNotificationToBatch(batch, db, 'AGENT_PAYOUT_PAID', p);
    markIdempotency(batch, db, p.idempotencyKey, MFE.AGENT_PAYOUT);
    await batch.commit();
    console.log('[MKE] ✅ AGENT_PAYOUT_PAID:', p.payoutId, '-', p.amount);
    return {};
  }

  throw new Error('[MKE] action غير معروف لـ agent payout: ' + action);
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 15 — MERCHANT PAYOUT REVERSAL
// عكس payout تم سابقاً (مثلاً تحويل بنكي فشل بعد ما اتسجل PAID).
// يعيد الأموال إلى Merchant Wallet ويحدّث الـ payout إلى REVERSED.
// payload: { payoutId, tenantId, reason }
// ══════════════════════════════════════════════════════════════════
async function handleMerchantPayoutReversal(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.payoutId) throw new Error('[MKE] payoutId مطلوب');

  const payoutSnap = await getDoc(doc(db, 'payouts', p.payoutId));
  if (!payoutSnap.exists()) throw new Error('[MKE] payout غير موجود');
  const payout = payoutSnap.data();
  if (payout.state !== PAYOUT_STATE.PAID) {
    throw new Error('[MKE] لا يمكن عكس payout state=' + payout.state);
  }

  const tenantSnap = await getDoc(doc(db, 'tenants', payout.tenantId));
  const tenant = tenantSnap.exists() ? tenantSnap.data() : {};
  if (!tenant.walletId) throw new Error('[MKE] merchant بدون wallet');

  const batch = writeBatch(db);
  batch.update(doc(db, 'wallets', tenant.walletId), { balance: increment(payout.amount) });
  batch.update(doc(db, 'payouts', p.payoutId), {
    state:        PAYOUT_STATE.REVERSED,
    reversedAt:   serverTimestamp(),
    reversedBy:   p.userId || '',
    reverseReason: p.reason || '',
  });

  addLedgerToBatch(batch, db, MFE.MERCHANT_PAYOUT_REVERSAL, {
    amount:     payout.amount,
    walletId:   tenant.walletId,
    walletName: tenant.displayName || '',
    vendorId:   payout.tenantId,
    vendorName: tenant.displayName || tenant.legalName || '',
    refId:      p.payoutId,
    notes:      `عكس payout — ${p.reason || ''}`,
    userId: p.userId, userName: p.userName,
  });
  addNotificationToBatch(batch, db, MFE.MERCHANT_PAYOUT_REVERSAL, p);
  markIdempotency(batch, db, p.idempotencyKey, MFE.MERCHANT_PAYOUT_REVERSAL);

  await batch.commit();
  console.log('[MKE] ⚠️ MERCHANT_PAYOUT_REVERSAL:', p.payoutId, '+', payout.amount);
  return { amount: payout.amount };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 16 — DISPUTE OPENED
// فتح نزاع على طلب. لا يحرك أموال — يجمد Escrow لو كان HELD.
// payload: { orderId, openedBy, reason, amount?, notes }
// ══════════════════════════════════════════════════════════════════
async function handleDisputeOpened(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.orderId) throw new Error('[MKE] orderId مطلوب');

  const orderSnap = await getDoc(doc(db, 'marketplace_orders', p.orderId));
  if (!orderSnap.exists()) throw new Error('[MKE] order غير موجود');
  const order = orderSnap.data();

  const batch = writeBatch(db);
  const disputeRef = doc(collection(db, 'disputes'));
  batch.set(disputeRef, {
    orderId:    p.orderId,
    tenantId:   order.tenantId,
    customerId: order.customerId,
    openedBy:   p.openedBy || 'customer',  // customer | merchant | operator
    reason:     p.reason || '',
    amount:     +(p.amount || order.grossAmount || 0),
    status:     'opened',
    openedAt:   serverTimestamp(),
    notes:      p.notes || '',
    createdBy:  p.userId || '',
  });

  // لو فيه escrow وما زال HELD → جمّده
  if (order.escrowId) {
    const escrowSnap = await getDoc(doc(db, 'escrow_holds', order.escrowId));
    if (escrowSnap.exists() && escrowSnap.data().state === ESCROW_STATE.HELD) {
      batch.update(doc(db, 'escrow_holds', order.escrowId), {
        state:      ESCROW_STATE.DISPUTED,
        disputedAt: serverTimestamp(),
      });
    }
  }
  batch.update(doc(db, 'marketplace_orders', p.orderId), {
    status:        'disputed',
    disputedAt:    serverTimestamp(),
    activeDisputeId: disputeRef.id,
  });

  // dispute = حدث غير مالي → audit log فقط (RULE 5: ledger للحركات المالية)
  addAuditToBatch(batch, db, MFE.DISPUTE_OPENED, {
    ...p, payload: { disputeId: disputeRef.id, tenantId: order.tenantId },
  });
  addNotificationToBatch(batch, db, MFE.DISPUTE_OPENED, { ...p, tenantId: order.tenantId, disputeId: disputeRef.id });
  markIdempotency(batch, db, p.idempotencyKey, MFE.DISPUTE_OPENED);

  await batch.commit();
  console.log('[MKE] 🚩 DISPUTE_OPENED:', disputeRef.id, 'order:', p.orderId);
  return { disputeId: disputeRef.id };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 17 — DISPUTE RESOLVED
// إغلاق النزاع. الحركة المالية الفعلية تأتي عبر event منفصل يختاره القرار:
//   - resolved_customer → استدعِ ESCROW_REFUND/CHARGEBACK بعد كده
//   - resolved_merchant → استدعِ ESCROW_RELEASE بعد كده
//   - split            → استدعِ ESCROW_REFUND جزئي + إفراج تكميلي
// هذا الـ handler يحدّث سجل النزاع + يفك تجميد الـ escrow فقط.
// payload: { disputeId, resolution, resolvedStatus, notes }
// ══════════════════════════════════════════════════════════════════
async function handleDisputeResolved(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.disputeId) throw new Error('[MKE] disputeId مطلوب');

  const dispSnap = await getDoc(doc(db, 'disputes', p.disputeId));
  if (!dispSnap.exists()) throw new Error('[MKE] dispute غير موجود');
  const disp = dispSnap.data();
  if (disp.status !== 'opened' && disp.status !== 'investigating') {
    throw new Error('[MKE] dispute مُغلَق بالفعل: ' + disp.status);
  }

  const validStatuses = ['resolved_customer', 'resolved_merchant', 'split'];
  if (!validStatuses.includes(p.resolvedStatus)) {
    throw new Error('[MKE] resolvedStatus يجب أن يكون: ' + validStatuses.join('|'));
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'disputes', p.disputeId), {
    status:     p.resolvedStatus,
    resolution: p.resolution || '',
    resolvedAt: serverTimestamp(),
    resolvedBy: p.userId || '',
    notes:      p.notes || disp.notes || '',
  });

  // فك تجميد الـ escrow (الـ event المالي التالي سيحدّد المسار)
  const orderSnap = await getDoc(doc(db, 'marketplace_orders', disp.orderId));
  if (orderSnap.exists()) {
    const order = orderSnap.data();
    if (order.escrowId) {
      const escrowSnap = await getDoc(doc(db, 'escrow_holds', order.escrowId));
      if (escrowSnap.exists() && escrowSnap.data().state === ESCROW_STATE.DISPUTED) {
        // ارجع للحالة HELD حتى الـ event التالي (REFUND/RELEASE) يعمل
        batch.update(doc(db, 'escrow_holds', order.escrowId), {
          state:        ESCROW_STATE.HELD,
          undisputedAt: serverTimestamp(),
        });
      }
    }
    // الأوردر ييجي status من نتيجة الـ event المالي التالي — هنا نشير فقط أن الـ dispute أُغلق
    batch.update(doc(db, 'marketplace_orders', disp.orderId), {
      activeDisputeId: null,
      lastDisputeOutcome: p.resolvedStatus,
    });
  }

  addAuditToBatch(batch, db, MFE.DISPUTE_RESOLVED, {
    ...p, payload: { disputeId: p.disputeId, outcome: p.resolvedStatus },
  });
  addNotificationToBatch(batch, db, MFE.DISPUTE_RESOLVED, { ...p, tenantId: disp.tenantId });
  markIdempotency(batch, db, p.idempotencyKey, MFE.DISPUTE_RESOLVED);

  await batch.commit();
  console.log('[MKE] ✅ DISPUTE_RESOLVED:', p.disputeId, '→', p.resolvedStatus);
  return { resolvedStatus: p.resolvedStatus, nextActionHint: p.resolvedStatus === 'resolved_customer' ? 'dispatch ESCROW_REFUND or CHARGEBACK' : p.resolvedStatus === 'resolved_merchant' ? 'dispatch ESCROW_RELEASE' : 'dispatch partial REFUND + RELEASE' };
}

// ══════════════════════════════════════════════════════════════════
// PUBLIC DISPATCHER — entry point لكل marketplace event
// ══════════════════════════════════════════════════════════════════
export async function dispatchMarketplaceEvent(db, eventType, payload) {
  console.log('[MKE] 📥 dispatch:', eventType);
  switch (eventType) {
    case MFE.MERCHANT_ONBOARDING:        return handleMerchantOnboarding(db, payload);
    case MFE.MERCHANT_KYC_APPROVED:
    case MFE.MERCHANT_SUSPENDED:         return handleMerchantKycChange(db, eventType, payload);
    case MFE.MARKETPLACE_ORDER_CREATED:  return handleMarketplaceOrderCreated(db, payload);
    case MFE.MARKETPLACE_ORDER_CAPTURED: return handleMarketplaceOrderCaptured(db, payload);
    case MFE.MARKETPLACE_ORDER_CANCELLED:
    case MFE.ESCROW_REFUND:              return handleEscrowRefund(db, payload);
    case MFE.ESCROW_RELEASE:             return handleEscrowRelease(db, payload);
    case MFE.ESCROW_HOLD:                return handleEscrowHold(db, payload);
    case MFE.MERCHANT_PAYOUT:            return handleMerchantPayout(db, payload.action || 'paid', payload);
    case MFE.MERCHANT_PAYOUT_REVERSAL:   return handleMerchantPayoutReversal(db, payload);
    case MFE.PLATFORM_FEE_COLLECTED:     return handlePlatformFeeCollected(db, payload);
    case MFE.COMMISSION_ACCRUED:         return handleCommissionAccrued(db, payload);
    case MFE.COMMISSION_SETTLED:         return handleCommissionSettled(db, payload);
    case MFE.AGENT_COMMISSION:           return handleAgentCommission(db, payload);
    case MFE.AGENT_PAYOUT:               return handleAgentPayout(db, payload.action || 'paid', payload);
    case MFE.DISPUTE_OPENED:             return handleDisputeOpened(db, payload);
    case MFE.DISPUTE_RESOLVED:           return handleDisputeResolved(db, payload);
    case MFE.CHARGEBACK:                 return handleChargeback(db, payload);
    default:
      throw new Error('[MKE] eventType غير مدعوم: ' + eventType);
  }
}

// Named exports للاستخدام المباشر بدون dispatcher
export {
  handleMerchantOnboarding,
  handleMerchantKycChange,
  handleMarketplaceOrderCreated,
  handleMarketplaceOrderCaptured,
  handleEscrowRelease,
  handleEscrowRefund,
  handleEscrowHold,
  handleMerchantPayout,
  handleMerchantPayoutReversal,
  handlePlatformFeeCollected,
  handleCommissionAccrued,
  handleCommissionSettled,
  handleAgentCommission,
  handleAgentPayout,
  handleDisputeOpened,
  handleDisputeResolved,
  handleChargeback,
};
