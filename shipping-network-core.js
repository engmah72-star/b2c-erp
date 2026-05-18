/**
 * shipping-network-core.js — أساس Shipping Network Platform
 * Shipping Network Foundation — v1
 *
 * هذا الملف يحتوي على:
 *   - تعريف أطراف الشحن (SNE — Shipping Network Entities)
 *   - أحداث الشبكة (SNFE — Shipping Network Financial Events)
 *   - lifecycle states للـ shipments
 *   - schemas للـ collections الجديدة
 *   - helpers للتسعير + المناطق + الـ SLA
 *
 * هذا الملف لا يحرّك أي أموال بنفسه — handlers في shipping-network-engine.js.
 * لا يلمس shipping.html / shipping-accounts.html القديمة (RULE 6 — Backward Compat).
 * الـ collections القديمة (shippers_v2, shipping_settlements, shipping_returns) تكمل شغّالة.
 *
 * Business DNA: Own The Network, Not The Assets — المنصة:
 *   - تدير شبكة الشركاء (لا تمتلك الأسطول)
 *   - تأخذ commission على كل shipment
 *   - تحتفظ بالـ tracking + ratings + SLA data
 *   - تربط العميل بأفضل شريك جغرافياً/سعرياً/تقييمياً
 *
 * اختبار 6 أسئلة الحوكمة:
 *   ✅ قابل للتوسع جمهورياً (cityId/governorateId)
 *   ✅ يقلل الاعتماد الداخلي (أي شركة شحن تنضم)
 *   ✅ يزيد قوة الشبكة (كل partner = توسع تغطية)
 *   ✅ يحتفظ بالبيانات (كل tracking event في DB المنصة)
 *   ✅ المنصة مركز التحكم (commission + escrow + SLA enforcement)
 *   ✅ Marketplace-ready (shipment_bids جاهز من Phase 1)
 */

console.log('[SNC] 🚚 Shipping Network Core v1 loaded — entities + events + schemas');

import { DEFAULT_TENANT_ID, OPERATOR_TENANT_ID } from './marketplace-core.js';

// ══════════════════════════════════════════════════════════════════
// SNE — Shipping Network Entities (الأطراف الخمسة)
// كل entity له role محدد. لا يملك أي طرف أصولاً مالية مباشرة —
// كل الأموال تمر عبر Operator wallet (RULE 4: No Module Owns Money).
// ══════════════════════════════════════════════════════════════════
export const SNE = {
  OPERATOR:       'operator',          // المنصة (شركتك) — تأخذ commission + تحل النزاعات
  SHIPPING_CO:    'shipping_company',  // شركة شحن كبيرة (SMSA, Aramex, Bosta...)
  COURIER:        'freelance_courier', // كابتن/سائق مستقل (Uber-like)
  FRANCHISE:      'franchise_branch',  // فرع امتياز في محافظة
  INTERNAL_FLEET: 'internal_fleet',    // أسطول داخلي (الحالة الحالية للشركة)
};

// ══════════════════════════════════════════════════════════════════
// SNFE — Shipping Network Financial Events (12 event types)
// تُضاف إلى FE في financial-sync-engine.js عبر handlers في الـ engine.
// كل event له reversal مقابل في SNFE_REVERSAL.
// ══════════════════════════════════════════════════════════════════
export const SNFE = {
  // Partner lifecycle
  PARTNER_ONBOARDED:           'PARTNER_ONBOARDED',
  PARTNER_KYC_APPROVED:        'PARTNER_KYC_APPROVED',
  PARTNER_SUSPENDED:           'PARTNER_SUSPENDED',

  // Shipment lifecycle (financial-impacting)
  SHIPMENT_CREATED:            'SHIPMENT_CREATED',           // حجز escrow من العميل (إن وُجد)
  SHIPMENT_ASSIGNED:           'SHIPMENT_ASSIGNED',          // تسجيل التزام مالي مع الشريك
  SHIPMENT_PICKED_UP:          'SHIPMENT_PICKED_UP',         // accrual لتكلفة الشريك
  SHIPMENT_DELIVERED:          'SHIPMENT_DELIVERED',         // تحرير escrow + إثبات الالتزام
  SHIPMENT_CANCELLED:          'SHIPMENT_CANCELLED',         // إلغاء + استرداد escrow

  // Settlement + payouts
  PARTNER_PAYOUT:              'PARTNER_PAYOUT',             // صرف للشريك (بعد خصم العمولة)
  PARTNER_PAYOUT_REVERSAL:     'PARTNER_PAYOUT_REVERSAL',    // عكس الصرف
  PLATFORM_SHIPPING_COMMISSION:'PLATFORM_SHIPPING_COMMISSION',// عمولة المنصة (income)

  // Quality / SLA
  SLA_PENALTY:                 'SLA_PENALTY',                // غرامة تأخير/تلف على الشريك
  SLA_PENALTY_REVERSAL:        'SLA_PENALTY_REVERSAL',       // إلغاء الغرامة (نزاع تم حله للشريك)
  SHIPMENT_DISPUTE_HOLD:       'SHIPMENT_DISPUTE_HOLD',      // تجميد أموال عند نزاع
  SHIPMENT_DISPUTE_RESOLVED:   'SHIPMENT_DISPUTE_RESOLVED',  // فك التجميد بعد الحل
};

// Reversal map — كل event وعكسه
export const SNFE_REVERSAL = {
  PARTNER_ONBOARDED:            'PARTNER_SUSPENDED',
  PARTNER_KYC_APPROVED:         'PARTNER_SUSPENDED',
  PARTNER_SUSPENDED:            'PARTNER_KYC_APPROVED',
  SHIPMENT_CREATED:             'SHIPMENT_CANCELLED',
  SHIPMENT_ASSIGNED:            'SHIPMENT_CANCELLED',
  SHIPMENT_DELIVERED:           'SHIPMENT_DISPUTE_HOLD',
  PARTNER_PAYOUT:               'PARTNER_PAYOUT_REVERSAL',
  PARTNER_PAYOUT_REVERSAL:      'PARTNER_PAYOUT',
  SLA_PENALTY:                  'SLA_PENALTY_REVERSAL',
  SLA_PENALTY_REVERSAL:         'SLA_PENALTY',
  SHIPMENT_DISPUTE_HOLD:        'SHIPMENT_DISPUTE_RESOLVED',
};

// ══════════════════════════════════════════════════════════════════
// SHIPMENT LIFECYCLE — State Machine
// كل انتقال موثق في shipment_events (audit log)
// ══════════════════════════════════════════════════════════════════
export const SHIPMENT_STATE = {
  CREATED:         'created',          // أُنشئت، لم تُسند بعد
  BIDDING:         'bidding',          // مفتوحة للعروض (Phase 3 — Marketplace)
  ASSIGNED:        'assigned',         // أُسندت لشريك (manual / auto / bid_won)
  ACCEPTED:        'accepted',         // الشريك قَبِل المهمة
  PICKED_UP:       'picked_up',        // الشريك استلمها من نقطة الـ pickup
  IN_TRANSIT:      'in_transit',       // في الطريق
  OUT_FOR_DELIVERY:'out_for_delivery', // مع السائق للتسليم
  DELIVERED:       'delivered',        // تم التسليم بنجاح
  DELIVERY_FAILED: 'delivery_failed',  // محاولة تسليم فاشلة (يُعاد المحاولة)
  RETURNED:        'returned',         // مرتجعة للمصدر
  SETTLED:         'settled',          // تمت التسوية المالية
  CANCELLED:       'cancelled',        // أُلغيت
  DISPUTED:        'disputed',         // نزاع مفتوح
};

// الانتقالات المسموحة (state machine validation)
export const SHIPMENT_TRANSITIONS = {
  created:          ['bidding', 'assigned', 'cancelled'],
  bidding:          ['assigned', 'cancelled'],
  assigned:         ['accepted', 'cancelled', 'disputed'],
  accepted:         ['picked_up', 'cancelled', 'disputed'],
  picked_up:        ['in_transit', 'returned', 'disputed'],
  in_transit:       ['out_for_delivery', 'returned', 'disputed'],
  out_for_delivery: ['delivered', 'delivery_failed', 'returned', 'disputed'],
  delivery_failed:  ['out_for_delivery', 'returned', 'disputed'],
  delivered:        ['settled', 'disputed', 'returned'],
  returned:         ['settled', 'disputed'],
  settled:          ['disputed'],        // can re-open dispute even after settlement
  cancelled:        [],                  // terminal
  disputed:         ['delivered', 'returned', 'settled', 'cancelled'],
};

export const SHIPMENT_STATE_META = {
  created:          { label:'مُنشأة',          ico:'📋', col:'#4e5672', isTerminal:false },
  bidding:          { label:'فتح عروض',         ico:'🎯', col:'#a78bfa', isTerminal:false },
  assigned:         { label:'مُسندة',           ico:'📨', col:'#3b9eff', isTerminal:false },
  accepted:         { label:'قُبِلت',            ico:'✅', col:'#00d97e', isTerminal:false },
  picked_up:        { label:'استلام',           ico:'📦', col:'#22d3ee', isTerminal:false },
  in_transit:       { label:'في الطريق',        ico:'🚚', col:'#ffaa00', isTerminal:false },
  out_for_delivery: { label:'للتسليم',          ico:'📍', col:'#ff3d6e', isTerminal:false },
  delivered:        { label:'تم التسليم',       ico:'🎉', col:'#00d97e', isTerminal:false },
  delivery_failed:  { label:'فشل التسليم',      ico:'⚠️', col:'#ffaa00', isTerminal:false },
  returned:         { label:'مرتجعة',           ico:'↩️', col:'#ff3d6e', isTerminal:false },
  settled:          { label:'تمت التسوية',      ico:'💰', col:'#00d97e', isTerminal:true  },
  cancelled:        { label:'ملغاة',            ico:'✕',  col:'#4e5672', isTerminal:true  },
  disputed:         { label:'نزاع',             ico:'⚖️', col:'#ff3d6e', isTerminal:false },
};

export function canTransition(fromState, toState) {
  return (SHIPMENT_TRANSITIONS[fromState] || []).includes(toState);
}

// ══════════════════════════════════════════════════════════════════
// KYC / PARTNER STATUS
// ══════════════════════════════════════════════════════════════════
export const PARTNER_KYC_STATUS = {
  PENDING:    'pending',     // بيانات تم رفعها، في انتظار المراجعة
  APPROVED:   'approved',    // مُعتمد — يقدر يستلم shipments
  REJECTED:   'rejected',    // مرفوض (مع سبب)
  SUSPENDED:  'suspended',   // مُعتمد سابقاً، مُجمَّد الآن (نزاع/شكوى/SLA breach)
};

export const PARTNER_TYPE_LABEL = {
  shipping_company:   { label:'شركة شحن',       ico:'🏢', col:'#3b9eff' },
  freelance_courier:  { label:'كابتن مستقل',    ico:'🏍️', col:'#a78bfa' },
  franchise_branch:   { label:'فرع امتياز',     ico:'🏪', col:'#00d97e' },
  internal_fleet:     { label:'أسطول داخلي',    ico:'🚐', col:'#ffaa00' },
};

// ══════════════════════════════════════════════════════════════════
// COLLECTION NAMES — مصدر واحد لأسماء الـ collections الجديدة
// ══════════════════════════════════════════════════════════════════
export const SN_COLLECTIONS = {
  PARTNERS:        'shipping_partners',       // سجل الشركاء الجديد (يحل محل shippers_v2 تدريجياً)
  ZONES:           'shipping_zones',          // المناطق الجغرافية + الأسعار
  SHIPMENTS:       'shipments',               // الشحنات الجديدة (parallel for orders.ship*)
  SHIPMENT_BIDS:   'shipment_bids',           // العروض في الـ Marketplace mode
  SHIPMENT_EVENTS: 'shipment_events',         // audit + tracking log (every state change + GPS)
  SLA_BREACHES:    'sla_breaches',            // سجل خرق الـ SLA لحساب الـ rating
  PARTNER_RATINGS: 'partner_ratings',         // تقييمات العملاء + متوسطات
  DRIVERS:         'drivers',                 // السائقين (تابعين لـ partner)
  ROUTES:          'driver_routes',           // مسارات السائقين اليومية
};

// ══════════════════════════════════════════════════════════════════
// SCHEMAS — الـ document shape لكل collection
// (للتوثيق فقط — Firestore schemaless لكن الـ engine يلتزم بهذه الحقول)
// ══════════════════════════════════════════════════════════════════

export const PARTNER_SCHEMA = `
{
  // Identity
  partnerType: 'shipping_company' | 'freelance_courier' | 'franchise_branch' | 'internal_fleet',
  name: string,                       // اسم الشركة/الكابتن
  legalName: string,                  // الاسم القانوني (لو شركة)
  taxId: string,                      // رقم تسجيل ضريبي
  contactPerson: { name, phone, email, role },
  phones: { primary, secondary, whatsapp },
  email: string,

  // Geography & Coverage
  headquartersCity: cityId,
  governorateId: string,
  coverageZones: [zoneId, ...],       // المناطق اللي يغطيها
  coverageGovernorates: [govId, ...], // المحافظات اللي يخدمها

  // Pricing
  pricingMode: 'flat' | 'per_zone' | 'per_weight' | 'per_km' | 'custom',
  basePricing: {
    flatRate: number,                 // لو flat mode
    perKmRate: number,                // لو per_km
    minPrice: number,
    maxPrice: number,
    expressMultiplier: number,        // x2 للتوصيل السريع
  },
  commissionPct: number,              // النسبة اللي تأخذها المنصة (مثلاً 10%)

  // KYC
  kycStatus: 'pending' | 'approved' | 'rejected' | 'suspended',
  kycDocs: { commercialRegister, taxCard, idCard, vehicleLicense },
  kycReviewedBy: userId,
  kycReviewedAt: timestamp,
  kycRejectionReason: string,

  // Performance (calculated, updated by engine)
  ratingAvg: number,                  // 0..5
  ratingCount: number,
  totalShipments: number,
  successfulDeliveries: number,
  failedDeliveries: number,
  onTimePct: number,                  // 0..100
  avgDeliveryHours: number,
  damageRate: number,                 // % of shipments with damage reports
  cancellationRate: number,

  // SLA targets (per partner — agreed at onboarding)
  slaTargets: {
    maxDeliveryHours: number,         // مثلاً 48 ساعة
    minOnTimePct: number,             // مثلاً 90%
    maxDamageRate: number,            // مثلاً 2%
  },

  // Financial
  walletId: walletRef,                // محفظة الشريك المستقلة في wallets
  payoutMethod: 'cash' | 'bank' | 'wallet',
  bankAccount: { iban, bankName, accountName },
  pendingPayout: number,              // مستحق له (يُحدّث بعد كل delivery)
  totalPaidOut: number,               // إجمالي ما تم صرفه

  // Status
  status: 'active' | 'paused' | 'suspended' | 'pending',
  isOnline: boolean,                  // (للـ couriers) متاح الآن لاستقبال shipments
  joinedAt: timestamp,

  // Multi-tenancy + audit
  tenantId: string,
  createdBy: userId,
  createdAt: timestamp,
  updatedAt: timestamp,
}
`;

export const ZONE_SCHEMA = `
{
  name: string,                       // "القاهرة - مدينة نصر"
  code: string,                       // "CAI-NSR"
  type: 'urban' | 'suburban' | 'rural' | 'remote',
  cityId: string,
  governorateId: string,
  polygon: GeoJSON | [{lat,lng},...], // حدود المنطقة (Phase 3 — للـ routing الجغرافي)
  centerPoint: {lat, lng},

  // Distance-based pricing context
  distanceFromHub: number,            // km من المركز اللوجستي
  estimatedDeliveryHours: number,     // متوسط الوقت المتوقع

  // Surge / pricing modifiers
  surgeMultiplier: number,            // 1.0 default، يرتفع للأماكن البعيدة
  baseShippingFee: number,            // سعر الشحن الافتراضي للزون

  // Availability
  activePartners: [partnerId, ...],   // اللي يغطون هذا الزون

  tenantId: string,
  createdAt: timestamp,
  updatedAt: timestamp,
}
`;

export const SHIPMENT_SCHEMA = `
{
  // References
  orderId: orderRef,                  // الأوردر المرتبط
  partnerId: partnerRef | null,       // الشريك (null لو لسه في bidding)
  partnerName: string,                // snapshot للعرض السريع
  driverId: driverRef | null,         // السائق المُكلَّف (للـ couriers الكبار)

  // Assignment
  assignmentMethod: 'manual' | 'auto_route' | 'bid_won' | 'partner_self_claim',
  assignedAt: timestamp,
  assignedBy: userId,                 // لو manual

  // Locations
  pickup: {
    address: string,
    point: {lat, lng},
    zoneId: string,
    contactName, contactPhone,
  },
  delivery: {
    address: string,
    point: {lat, lng},
    zoneId: string,
    contactName, contactPhone,        // مُقنَّع للأدوار غير المصرّحة (RULE 8)
  },

  // Lifecycle
  state: 'created' | 'bidding' | 'assigned' | ... ,  // SHIPMENT_STATE
  stateHistory: [{state, at, by, notes}],

  // Timing & SLA
  promisedDeliveryAt: timestamp,      // الوقت الموعود للعميل
  pickedUpAt: timestamp,
  deliveredAt: timestamp,
  actualDeliveryHours: number,
  slaBreached: boolean,
  slaBreachMinutes: number,

  // Pricing & Financial
  pricing: {
    customerFee: number,              // ما يدفعه العميل (يظهر في الفاتورة)
    partnerCost: number,              // ما تأخذه الشريك
    platformCommission: number,       // الفرق = ربح المنصة
    commissionPct: number,            // النسبة المطبقة
    weightKg: number,                 // الوزن (لو per_weight)
    distanceKm: number,
    surgeMultiplier: number,
    isExpress: boolean,
  },
  paymentMethod: 'prepaid' | 'cod' | 'wallet',  // كيف يدفع العميل
  codAmount: number,                  // المبلغ المطلوب تحصيله (لو cod)
  codCollected: boolean,
  codCollectedAt: timestamp,

  // Proof of Delivery
  proofOfDelivery: {
    photos: [storagePath],
    signatureUrl: storagePath,
    recipientName: string,
    notes: string,
    gpsAtDelivery: {lat, lng},
  },

  // Settlement
  settled: boolean,
  settledAt: timestamp,
  settlementId: settlementRef,
  partnerPayoutId: ledgerRef,

  // Multi-tenancy
  tenantId: string,
  createdBy: userId,
  createdAt: timestamp,
  updatedAt: timestamp,
}
`;

export const SHIPMENT_EVENT_SCHEMA = `
{
  shipmentId: shipmentRef,
  eventType: 'state_change' | 'gps_ping' | 'note' | 'photo' | 'sla_breach' | 'dispute',
  fromState: string,                  // (لو state_change)
  toState: string,
  by: userId | partnerId,
  byName: string,
  byRole: string,
  gps: {lat, lng, accuracy},          // optional
  photoUrl: string,                   // optional
  notes: string,
  at: timestamp,
  tenantId: string,
}
`;

export const BID_SCHEMA = `
{
  shipmentId: shipmentRef,
  partnerId: partnerRef,
  partnerName: string,
  bidAmount: number,                  // ما يطلبه الشريك
  proposedDeliveryHours: number,
  notes: string,
  status: 'pending' | 'won' | 'lost' | 'expired' | 'withdrawn',
  expiresAt: timestamp,               // العرض ينتهي صلاحيته (مثلاً 30 دقيقة)
  createdAt: timestamp,
  tenantId: string,
}
`;

export const DRIVER_SCHEMA = `
{
  partnerId: partnerRef,              // الشريك التابع له
  name: string,
  phone: string,
  email: string,
  nationalId: string,
  drivingLicense: string,
  vehicleType: 'motorcycle' | 'car' | 'van' | 'truck',
  vehiclePlate: string,
  photoUrl: string,
  isActive: boolean,
  isOnline: boolean,
  lastGpsAt: timestamp,
  lastGps: {lat, lng},
  authUid: string,                    // ربط بـ Firebase Auth (للـ mobile app)
  tenantId: string,
  createdAt: timestamp,
}
`;

// ══════════════════════════════════════════════════════════════════
// PRICING ENGINE — يحسب سعر الشحنة بناءً على الزون والوزن والمسافة
// ══════════════════════════════════════════════════════════════════
export function calculateShippingPrice(opts) {
  // opts: { partner, zone, weightKg, distanceKm, isExpress }
  const { partner, zone, weightKg = 1, distanceKm = 0, isExpress = false } = opts;
  if (!partner) return { customerFee:0, partnerCost:0, platformCommission:0, commissionPct:0 };

  const bp = partner.basePricing || {};
  const mode = partner.pricingMode || 'flat';
  let partnerCost = 0;

  if (mode === 'flat') {
    partnerCost = bp.flatRate || 0;
  } else if (mode === 'per_km') {
    partnerCost = (bp.perKmRate || 0) * distanceKm;
  } else if (mode === 'per_weight') {
    partnerCost = (bp.flatRate || 0) + (bp.perKgRate || 0) * weightKg;
  } else if (mode === 'per_zone' && zone) {
    partnerCost = zone.baseShippingFee || bp.flatRate || 0;
  }

  // Apply surge + express modifiers
  if (zone?.surgeMultiplier) partnerCost *= zone.surgeMultiplier;
  if (isExpress && bp.expressMultiplier) partnerCost *= bp.expressMultiplier;

  // Clamp to min/max
  if (bp.minPrice) partnerCost = Math.max(partnerCost, bp.minPrice);
  if (bp.maxPrice) partnerCost = Math.min(partnerCost, bp.maxPrice);
  partnerCost = Math.round(partnerCost * 100) / 100;

  // Platform commission
  const commissionPct = parseFloat(partner.commissionPct) || 0;
  const platformCommission = Math.round(partnerCost * commissionPct) / 100;
  const customerFee = partnerCost + platformCommission;

  return {
    customerFee:        Math.round(customerFee * 100) / 100,
    partnerCost,
    platformCommission,
    commissionPct,
    weightKg,
    distanceKm,
    surgeMultiplier: zone?.surgeMultiplier || 1,
    isExpress,
  };
}

// ══════════════════════════════════════════════════════════════════
// SLA EVALUATOR — يفحص لو الشحنة كسرت الـ SLA
// ══════════════════════════════════════════════════════════════════
export function evaluateSLA(shipment, partner) {
  if (!shipment.deliveredAt || !shipment.promisedDeliveryAt) {
    return { breached:false, breachMinutes:0 };
  }
  const promised = shipment.promisedDeliveryAt.toDate?.() || new Date(shipment.promisedDeliveryAt);
  const actual   = shipment.deliveredAt.toDate?.()        || new Date(shipment.deliveredAt);
  const breachMinutes = Math.max(0, Math.floor((actual - promised) / 60000));
  const target = partner?.slaTargets?.maxDeliveryHours;
  const actualHours = Math.floor((actual - shipment.createdAt.toDate?.()) / 3600000);
  return {
    breached: breachMinutes > 0 || (target && actualHours > target),
    breachMinutes,
    actualHours,
  };
}

// ══════════════════════════════════════════════════════════════════
// COMMISSION SPLIT — كيف يُوزَّع المبلغ على المنصة + الشريك
// ══════════════════════════════════════════════════════════════════
export function splitShipmentPayment(shipment) {
  const p = shipment.pricing || {};
  return {
    toPartner:  p.partnerCost || 0,
    toPlatform: p.platformCommission || 0,
    total:      p.customerFee || 0,
  };
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════
export function snTenantFields(tenantId) {
  return { tenantId: tenantId || DEFAULT_TENANT_ID };
}

export function shipmentStateLabel(state) {
  return SHIPMENT_STATE_META[state]?.label || state || '—';
}

export function shipmentStateBadge(state) {
  const m = SHIPMENT_STATE_META[state] || { label:state, ico:'❓', col:'#4e5672' };
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:.85em;background:${m.col}18;color:${m.col}">${m.ico} ${m.label}</span>`;
}

// Export the operator tenant id for convenience
export { DEFAULT_TENANT_ID, OPERATOR_TENANT_ID };
