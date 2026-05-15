/**
 * marketplace-core.js — أساس منصة Marketplace
 * Platform Foundation — v1
 *
 * هذا الملف يحتوي على:
 *   - تعريف أطراف المنصة (ME — Marketplace Entities)
 *   - أحداث المنصة الجديدة (MFE — Marketplace Financial Events)
 *   - بنية collections الجديدة (SCHEMAS)
 *   - helpers للـ multi-tenancy
 *
 * هذا الملف لا يحرّك أي أموال بنفسه — Phase 1 (داخلي).
 * الـ handlers ستُضاف في PR لاحق عبر marketplace-engine.js.
 * لا يلمس أي صفحة من الـ 55 صفحة الحالية.
 *
 * RULE 2 + 3: كل كتابة لاحقة على collections المنصة ستمر عبر engine في batch واحد.
 * RULE 5: كل marketplace event سيُسجّل في financial_ledger بنفس قواعد التدقيق.
 * RULE 6: getCurrentTenantId() يرجع DEFAULT_TENANT_ID افتراضياً → الكود القديم يكمل شغّال.
 *
 * Business DNA: Own The Network, Not The Assets — المنصة ماسكة Escrow + Commission Split.
 */

console.log('[MKT] 🏛️ Marketplace Core v1 loaded — entities + events + schemas');

// ══════════════════════════════════════════════════════════════════
// TENANT — معرف الـ Tenant الافتراضي (شركتك = merchant_001)
// أي document قديم بدون tenantId يُعتبر تابع لهذا الـ tenant.
// Phase 1: tenant واحد. Phase 2: تتم إضافة tenants بدعوة. Phase 3: self-signup.
// ══════════════════════════════════════════════════════════════════
export const DEFAULT_TENANT_ID  = 'merchant_001';
export const OPERATOR_TENANT_ID = 'platform_operator'; // المنصة نفسها (للعمولات والإيرادات)

// ══════════════════════════════════════════════════════════════════
// ME — Marketplace Entities (الأطراف الستة)
// كل entity له role في الشبكة. لا يملك أي طرف أصولاً مالية مباشرة —
// كل الأموال تمر عبر Operator (RULE 4: No Module Owns Money).
// ══════════════════════════════════════════════════════════════════
export const ME = {
  OPERATOR:         'operator',          // المنصة (شركتك) — يأخذ عمولة، يحل النزاعات
  MERCHANT:         'merchant',          // بائع/تاجر — supply side
  CUSTOMER:         'customer',          // مستهلك نهائي — demand side
  SHIPPING:         'shipping_partner',  // شركة شحن
  SERVICE_PROVIDER: 'service_provider',  // مصمم/مطبعة/مصنع (B2B داخل المنصة)
  AGENT:            'agent',             // وكيل/مندوب مبيعات
};

// ══════════════════════════════════════════════════════════════════
// MFE — Marketplace Financial Events (18 event type)
// تُضاف لاحقاً إلى FE في financial-sync-engine.js عند بناء الـ handlers.
// كل event هنا له reversal مقابل في REVERSAL_MAP أدناه.
// ══════════════════════════════════════════════════════════════════
export const MFE = {
  // Merchant lifecycle
  MERCHANT_ONBOARDING:        'MERCHANT_ONBOARDING',
  MERCHANT_KYC_APPROVED:      'MERCHANT_KYC_APPROVED',
  MERCHANT_SUSPENDED:         'MERCHANT_SUSPENDED',

  // Order lifecycle
  MARKETPLACE_ORDER_CREATED:  'MARKETPLACE_ORDER_CREATED',
  MARKETPLACE_ORDER_CAPTURED: 'MARKETPLACE_ORDER_CAPTURED',
  MARKETPLACE_ORDER_CANCELLED:'MARKETPLACE_ORDER_CANCELLED',

  // Commission flow
  COMMISSION_ACCRUED:         'COMMISSION_ACCRUED',
  COMMISSION_SETTLED:         'COMMISSION_SETTLED',
  PLATFORM_FEE_COLLECTED:     'PLATFORM_FEE_COLLECTED',

  // Payouts
  MERCHANT_PAYOUT:            'MERCHANT_PAYOUT',
  MERCHANT_PAYOUT_REVERSAL:   'MERCHANT_PAYOUT_REVERSAL',
  AGENT_COMMISSION:           'AGENT_COMMISSION',
  AGENT_PAYOUT:               'AGENT_PAYOUT',

  // Escrow
  ESCROW_HOLD:                'ESCROW_HOLD',
  ESCROW_RELEASE:             'ESCROW_RELEASE',
  ESCROW_REFUND:              'ESCROW_REFUND',

  // Disputes
  DISPUTE_OPENED:             'DISPUTE_OPENED',
  DISPUTE_RESOLVED:           'DISPUTE_RESOLVED',
  CHARGEBACK:                 'CHARGEBACK',
};

// Reversal map — لكل حدث، الحدث المُعاكِس
export const MFE_REVERSAL = {
  MARKETPLACE_ORDER_CAPTURED: 'MARKETPLACE_ORDER_CANCELLED',
  MARKETPLACE_ORDER_CREATED:  'MARKETPLACE_ORDER_CANCELLED',
  COMMISSION_SETTLED:         'CHARGEBACK',
  MERCHANT_PAYOUT:            'MERCHANT_PAYOUT_REVERSAL',
  MERCHANT_PAYOUT_REVERSAL:   'MERCHANT_PAYOUT',
  ESCROW_HOLD:                'ESCROW_REFUND',
  ESCROW_RELEASE:             'CHARGEBACK',
  MERCHANT_KYC_APPROVED:      'MERCHANT_SUSPENDED',
  MERCHANT_SUSPENDED:         'MERCHANT_KYC_APPROVED',
};

// ══════════════════════════════════════════════════════════════════
// LIFECYCLE STATUSES
// ══════════════════════════════════════════════════════════════════
export const KYC_STATUS = {
  PENDING:      'pending',       // مرشنت سجّل، لم تتم مراجعته
  UNDER_REVIEW: 'under_review',  // قيد المراجعة من Operator
  APPROVED:     'approved',      // معتمد، يقدر يبيع
  REJECTED:     'rejected',      // مرفوض
  SUSPENDED:    'suspended',     // إيقاف مؤقت
};

export const ESCROW_STATE = {
  HELD:     'held',      // الأموال محتجزة لحين التسليم
  RELEASED: 'released',  // أُفرج عنها بعد التسليم → split بدأ
  REFUNDED: 'refunded',  // رُدّت للعميل
  DISPUTED: 'disputed',  // نزاع مفتوح، مجمدة
};

export const PAYOUT_STATE = {
  REQUESTED: 'requested',
  APPROVED:  'approved',
  PAID:      'paid',
  FAILED:    'failed',
  REVERSED:  'reversed',
};

// ══════════════════════════════════════════════════════════════════
// SCHEMAS — تعريف بنية collections الجديدة
// يُستخدم في validation و IDE hints. الـ engine سيلتزم بهذه الحقول.
// ══════════════════════════════════════════════════════════════════
export const SCHEMAS = {
  // tenants — سجل المرشنتس
  tenants: {
    id:            'string',     // unique tenant id (e.g. 'merchant_042')
    type:          'string',     // ME.MERCHANT | ME.SHIPPING | ME.SERVICE_PROVIDER | ME.AGENT
    legalName:     'string',     // الاسم القانوني
    displayName:   'string',     // اسم العرض في الـ catalog
    ownerName:     'string',     // اسم صاحب النشاط
    phone:         'string',
    email:         'string',
    city:          'string',
    governorate:   'string',     // محافظة (للتوسع الوطني)
    taxId:         'string',     // الرقم الضريبي
    kycStatus:     'string',     // KYC_STATUS.*
    kycDocs:       'array',      // URLs للوثائق
    commissionRate:'number',     // نسبة العمولة الافتراضية (0.0 - 1.0)
    bankAccount:   'object',     // { bank, iban, accountName }
    walletId:      'string',     // محفظة المرشنت للـ payouts
    isActive:      'boolean',
    createdAt:     'timestamp',
    createdBy:     'string',
    suspendedAt:   'timestamp',
    suspendReason: 'string',
  },

  // marketplace_orders — طلبات بين العميل والمرشنت (مختلف عن orders الحالي)
  marketplace_orders: {
    id:              'string',
    tenantId:        'string',   // المرشنت البائع
    customerId:      'string',
    customerName:    'string',
    items:           'array',    // [{productId, qty, price, ...}]
    grossAmount:     'number',   // إجمالي قيمة الطلب
    shippingFee:     'number',
    commissionAmount:'number',   // العمولة المستحقة للمنصة
    netToMerchant:   'number',   // الباقي للمرشنت بعد العمولة والشحن
    paymentMethod:   'string',   // 'online' | 'cod'
    escrowId:        'string',   // ربط بـ escrow_holds
    status:          'string',   // 'created' | 'captured' | 'fulfilled' | 'cancelled' | 'disputed'
    shippingPartnerId:'string',
    agentId:         'string',   // لو الطلب جاء عن طريق مندوب
    createdAt:       'timestamp',
    capturedAt:      'timestamp',
    fulfilledAt:     'timestamp',
  },

  // commissions — سجل العمولات المستحقة/المحصلة
  commissions: {
    id:           'string',
    tenantId:     'string',     // المرشنت
    orderId:      'string',     // ربط بـ marketplace_orders
    amount:       'number',
    rate:         'number',     // النسبة المطبقة
    state:        'string',     // 'accrued' | 'settled' | 'reversed'
    accruedAt:    'timestamp',
    settledAt:    'timestamp',
    reversedAt:   'timestamp',
    ledgerRefId:  'string',     // ربط بقيد financial_ledger
  },

  // escrow_holds — الأموال المحتجزة لحين التسليم
  escrow_holds: {
    id:           'string',
    orderId:      'string',
    tenantId:     'string',     // المرشنت المستحق
    customerId:   'string',
    amount:       'number',
    state:        'string',     // ESCROW_STATE.*
    heldAt:       'timestamp',
    releasedAt:   'timestamp',
    refundedAt:   'timestamp',
    disputedAt:   'timestamp',
    walletId:     'string',     // المحفظة اللي ماسكة الأموال (Escrow Wallet للمنصة)
  },

  // payouts — دفعات للمرشنتس/الشحن/الوكلاء
  payouts: {
    id:           'string',
    tenantId:     'string',     // المستفيد
    recipientType:'string',     // ME.MERCHANT | ME.SHIPPING | ME.AGENT
    amount:       'number',
    state:        'string',     // PAYOUT_STATE.*
    bankRef:      'string',     // مرجع التحويل البنكي
    orderIds:     'array',      // الطلبات اللي بتغطيها الدفعة
    requestedAt:  'timestamp',
    paidAt:       'timestamp',
    failedAt:     'timestamp',
    failReason:   'string',
  },

  // disputes — النزاعات
  disputes: {
    id:           'string',
    orderId:      'string',
    tenantId:     'string',     // المرشنت
    customerId:   'string',
    openedBy:     'string',     // 'customer' | 'merchant' | 'operator'
    reason:       'string',
    amount:       'number',     // المبلغ المتنازع عليه
    status:       'string',     // 'opened' | 'investigating' | 'resolved_customer' | 'resolved_merchant' | 'split'
    openedAt:     'timestamp',
    resolvedAt:   'timestamp',
    resolution:   'string',     // ملخص القرار
  },
};

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

/**
 * الـ tenant الحالي. في Phase 1 يرجع DEFAULT_TENANT_ID (شركتك).
 * في Phase 2+ سيُحسب من سياق المستخدم (auth.uid → tenantId).
 * هذا الـ helper يضمن أن كود الـ 55 صفحة الحالية يكمل شغّال بدون أي تعديل.
 */
export function getCurrentTenantId() {
  return DEFAULT_TENANT_ID;
}

/**
 * الـ Operator tenant — يُستخدم في قيود إيراد المنصة (العمولة، Ads، Subscription).
 */
export function getOperatorTenantId() {
  return OPERATOR_TENANT_ID;
}

/**
 * يُضيف حقول الـ tenancy لأي document جديد. استخدمه في أي write لاحقاً
 * علشان الـ multi-tenancy متطبّق بشكل موحد.
 */
export function tenantFields(tenantId) {
  return {
    tenantId: tenantId || getCurrentTenantId(),
  };
}

/**
 * يحسب split الطلب — كم للمنصة، كم للمرشنت، كم للشحن.
 * pure function — لا يكتب في أي database.
 */
export function calcOrderSplit({ grossAmount, shippingFee = 0, commissionRate = 0.10 }) {
  const gross         = parseFloat(grossAmount) || 0;
  const ship          = parseFloat(shippingFee) || 0;
  const rate          = Math.min(Math.max(parseFloat(commissionRate) || 0, 0), 1);
  const commissionAmt = +(gross * rate).toFixed(2);
  const netToMerchant = +(gross - commissionAmt).toFixed(2);
  return {
    gross,
    shippingFee:      ship,
    commissionRate:   rate,
    commissionAmount: commissionAmt,
    netToMerchant,
    totalCharged:     +(gross + ship).toFixed(2),
  };
}

/**
 * يرجع الحدث المُعاكِس لأي marketplace event.
 */
export function marketplaceReversal(eventType) {
  return MFE_REVERSAL[eventType] || eventType;
}

// ══════════════════════════════════════════════════════════════════
// EXPORT حزمة موحّدة (للاستيراد المختصر في الصفحات الجاية)
// ══════════════════════════════════════════════════════════════════
export const MarketplaceCore = {
  ME, MFE, MFE_REVERSAL,
  KYC_STATUS, ESCROW_STATE, PAYOUT_STATE,
  SCHEMAS,
  DEFAULT_TENANT_ID, OPERATOR_TENANT_ID,
  getCurrentTenantId, getOperatorTenantId,
  tenantFields, calcOrderSplit, marketplaceReversal,
};
