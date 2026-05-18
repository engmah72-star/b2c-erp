/**
 * shipping-network-engine.js — محرك Shipping Network
 * Shipping Network Engine — v1
 *
 * كل عملية على الـ shipping network تمر عبر هذا المحرك:
 *   - dispatchShippingNetworkEvent(db, SNFE.X, payload)
 *   - كل كتابة atomic داخل writeBatch واحد (RULE 3)
 *   - كل event مالي ينعكس في financial_ledger عبر addLedgerToBatch (RULE 5)
 *
 * النموذج الـ Event-driven (RULE 2):
 *   pages → dispatchShippingNetworkEvent → handler → batch.commit() → onSnapshot UI updates
 *
 * Backward compat (RULE 6):
 *   - shipping.html القديمة تكمل تكتب على /orders.ship* — لا نلمسها
 *   - shipping-accounts.html القديمة تكمل تستخدم shipping_settlements + SHIPPING_SETTLEMENT
 *   - هذا الـ engine يضيف collections + events جديدة بدون تعديل القديم
 */

import {
  writeBatch, doc, collection, serverTimestamp, increment,
  getDoc, getDocs, query, where, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { addLedgerToBatch, approvalFields } from './financial-sync-engine.js';
import {
  SNE, SNFE, SNFE_REVERSAL,
  SHIPMENT_STATE, SHIPMENT_TRANSITIONS, SHIPMENT_STATE_META, canTransition,
  PARTNER_KYC_STATUS, SN_COLLECTIONS,
  calculateShippingPrice, evaluateSLA, splitShipmentPayment,
  snTenantFields, DEFAULT_TENANT_ID, OPERATOR_TENANT_ID,
} from './shipping-network-core.js';

console.log('[SNE] 🚚 Shipping Network Engine v1 loaded — handlers active');

// ══════════════════════════════════════════════════════════════════
// INTERNAL: write a shipment_event audit log (every state change + GPS ping)
// ══════════════════════════════════════════════════════════════════
function addShipmentEvent(batch, db, payload) {
  const ref = doc(collection(db, SN_COLLECTIONS.SHIPMENT_EVENTS));
  batch.set(ref, {
    shipmentId:  payload.shipmentId || null,
    eventType:   payload.eventType || 'state_change',
    fromState:   payload.fromState || null,
    toState:     payload.toState   || null,
    by:          payload.userId    || payload.partnerId || '',
    byName:      payload.userName  || payload.partnerName || '',
    byRole:      payload.userRole  || '',
    partnerId:   payload.partnerId || null,
    gps:         payload.gps       || null,
    photoUrl:    payload.photoUrl  || null,
    notes:       payload.notes     || '',
    at:          serverTimestamp(),
    ...snTenantFields(payload.tenantId),
  });
  return ref;
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: PARTNER_ONBOARDED
// إنشاء سجل partner جديد + إنشاء محفظة مخصصة له + audit
// ══════════════════════════════════════════════════════════════════
async function handlePartnerOnboarded(db, p) {
  if (!p.name) throw new Error('[SNE] PARTNER_ONBOARDED: name مطلوب');
  if (!p.partnerType) throw new Error('[SNE] PARTNER_ONBOARDED: partnerType مطلوب');

  const batch = writeBatch(db);

  // 1) Create wallet for the partner
  const walletRef = doc(collection(db, 'wallets'));
  batch.set(walletRef, {
    name: `محفظة شريك — ${p.name}`,
    type: 'partner_shipping',
    balance: 0,
    partnerId: '',   // سيُحدَّث بعد ما نعرف id الشريك
    isPartnerWallet: true,
    isSystem: false,
    ...snTenantFields(p.tenantId),
    createdAt: serverTimestamp(),
    createdBy: p.userId || '',
  });

  // 2) Create partner record
  const partnerRef = doc(collection(db, SN_COLLECTIONS.PARTNERS));
  batch.set(partnerRef, {
    partnerType:  p.partnerType,
    name:         p.name,
    legalName:    p.legalName || p.name,
    taxId:        p.taxId || '',
    contactPerson:    p.contactPerson    || { name:'', phone:'', email:'', role:'' },
    phones:           p.phones           || { primary:'', secondary:'', whatsapp:'' },
    email:            p.email || '',
    headquartersCity: p.headquartersCity || '',
    governorateId:    p.governorateId    || '',
    coverageZones:        p.coverageZones        || [],
    coverageGovernorates: p.coverageGovernorates || [],
    pricingMode:   p.pricingMode  || 'flat',
    basePricing:   p.basePricing  || { flatRate:0, minPrice:0, maxPrice:0, expressMultiplier:1.5 },
    commissionPct: parseFloat(p.commissionPct) || 0,
    kycStatus:     PARTNER_KYC_STATUS.PENDING,
    kycDocs:       p.kycDocs || {},
    // performance (initialized at 0)
    ratingAvg: 0, ratingCount: 0,
    totalShipments: 0, successfulDeliveries: 0, failedDeliveries: 0,
    onTimePct: 0, avgDeliveryHours: 0, damageRate: 0, cancellationRate: 0,
    slaTargets:   p.slaTargets || { maxDeliveryHours:48, minOnTimePct:90, maxDamageRate:2 },
    walletId:     walletRef.id,
    payoutMethod: p.payoutMethod || 'wallet',
    bankAccount:  p.bankAccount  || {},
    pendingPayout: 0, totalPaidOut: 0,
    status:        'pending',
    isOnline:      false,
    joinedAt:      serverTimestamp(),
    ...snTenantFields(p.tenantId),
    createdBy:     p.userId   || '',
    createdByName: p.userName || '',
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
  });

  // 3) Update wallet with partner id link (note: we can't do this in same batch without the partnerRef.id which we have)
  batch.update(walletRef, { partnerId: partnerRef.id });

  await batch.commit();
  console.log('[SNE] ✅ PARTNER_ONBOARDED:', { partnerId: partnerRef.id, walletId: walletRef.id });
  return { partnerId: partnerRef.id, walletId: walletRef.id };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: PARTNER_KYC_APPROVED / PARTNER_SUSPENDED
// ══════════════════════════════════════════════════════════════════
async function handlePartnerKycChange(db, p, newStatus) {
  if (!p.partnerId) throw new Error('[SNE] partnerId مطلوب');

  const batch = writeBatch(db);
  batch.update(doc(db, SN_COLLECTIONS.PARTNERS, p.partnerId), {
    kycStatus:        newStatus,
    kycReviewedBy:    p.userId   || '',
    kycReviewedByName:p.userName || '',
    kycReviewedAt:    serverTimestamp(),
    kycRejectionReason: newStatus === 'rejected' ? (p.reason || '') : '',
    status:           newStatus === 'approved' ? 'active' : (newStatus === 'suspended' ? 'suspended' : 'pending'),
    updatedAt:        serverTimestamp(),
  });
  await batch.commit();
  console.log('[SNE] ✅ Partner KYC updated:', { partnerId: p.partnerId, newStatus });
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: SHIPMENT_CREATED
// إنشاء شحنة جديدة مرتبطة بأوردر، حساب التسعير المبدئي
// ══════════════════════════════════════════════════════════════════
async function handleShipmentCreated(db, p) {
  if (!p.orderId)       throw new Error('[SNE] SHIPMENT_CREATED: orderId مطلوب');
  if (!p.pickup || !p.delivery) throw new Error('[SNE] SHIPMENT_CREATED: pickup و delivery مطلوبان');

  // لو في partnerId مُمرَّر → احسب التسعير الآن
  let pricing = p.pricing;
  if (!pricing && p.partnerId) {
    const pSnap = await getDoc(doc(db, SN_COLLECTIONS.PARTNERS, p.partnerId));
    if (pSnap.exists()) {
      let zone = null;
      if (p.delivery.zoneId) {
        const zSnap = await getDoc(doc(db, SN_COLLECTIONS.ZONES, p.delivery.zoneId));
        if (zSnap.exists()) zone = zSnap.data();
      }
      pricing = calculateShippingPrice({
        partner:   pSnap.data(),
        zone,
        weightKg:  p.weightKg  || 1,
        distanceKm:p.distanceKm || 0,
        isExpress: p.isExpress || false,
      });
    }
  }
  pricing = pricing || { customerFee:0, partnerCost:0, platformCommission:0, commissionPct:0 };

  const batch = writeBatch(db);
  const initialState = p.partnerId ? SHIPMENT_STATE.ASSIGNED : SHIPMENT_STATE.CREATED;
  const shipmentRef = doc(collection(db, SN_COLLECTIONS.SHIPMENTS));
  batch.set(shipmentRef, {
    orderId:     p.orderId,
    partnerId:   p.partnerId   || null,
    partnerName: p.partnerName || '',
    driverId:    null,
    assignmentMethod: p.assignmentMethod || (p.partnerId ? 'manual' : 'manual'),
    assignedAt:  p.partnerId ? serverTimestamp() : null,
    assignedBy:  p.partnerId ? (p.userId || '') : '',
    pickup:      p.pickup,
    delivery:    p.delivery,
    state:       initialState,
    stateHistory: [{
      state: initialState,
      at:    new Date().toISOString(),
      by:    p.userId || '',
      byName:p.userName || '',
      notes: 'إنشاء الشحنة',
    }],
    promisedDeliveryAt: p.promisedDeliveryAt || null,
    pickedUpAt:         null,
    deliveredAt:        null,
    actualDeliveryHours:0,
    slaBreached:        false,
    slaBreachMinutes:   0,
    pricing,
    paymentMethod: p.paymentMethod || 'prepaid',
    codAmount:     parseFloat(p.codAmount) || 0,
    codCollected:  false,
    codCollectedAt:null,
    proofOfDelivery: { photos:[], signatureUrl:'', recipientName:'', notes:'', gpsAtDelivery:null },
    settled:       false,
    settledAt:     null,
    settlementId:  null,
    partnerPayoutId:null,
    ...snTenantFields(p.tenantId),
    createdBy:     p.userId   || '',
    createdByName: p.userName || '',
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
  });

  // Cross-link the order to the new shipment (parallel to existing ship* fields — RULE 6)
  batch.update(doc(db, 'orders', p.orderId), {
    shipmentRef: shipmentRef.id,
    shipmentState: initialState,
    shipmentPartnerId: p.partnerId || null,
    shipmentPartnerName: p.partnerName || '',
    updatedAt: serverTimestamp(),
  });

  // Audit event
  addShipmentEvent(batch, db, {
    shipmentId: shipmentRef.id,
    eventType: 'state_change',
    fromState: null,
    toState:   initialState,
    userId:    p.userId,
    userName:  p.userName,
    userRole:  p.userRole,
    notes:     'إنشاء الشحنة',
    tenantId:  p.tenantId,
  });

  // No money moves yet — financial event only if escrow is enabled (Phase 2+).
  // For Phase 1 we just log the network event (info-only) to ledger if amount > 0.
  if (pricing.customerFee > 0 && p.escrowWalletId) {
    addLedgerToBatch(batch, db, 'SHIPPING_EXPENSE', {
      amount:     0,  // placeholder — no money moved yet, just tracking accrual
      orderId:    p.orderId,
      walletId:   p.escrowWalletId,
      walletName: p.escrowWalletName || '',
      notes:      `Shipment created — ${p.partnerName || 'unassigned'} — تكلفة متوقعة: ${pricing.partnerCost}`,
      refId:      shipmentRef.id,
      userId:     p.userId,
      userName:   p.userName,
      categoryOverride: 'shipping_accrual',
    });
  }

  await batch.commit();
  console.log('[SNE] ✅ SHIPMENT_CREATED:', { shipmentId: shipmentRef.id, state: initialState });
  return { shipmentId: shipmentRef.id, pricing };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: SHIPMENT_ASSIGNED — يُسند شحنة موجودة لشريك
// ══════════════════════════════════════════════════════════════════
async function handleShipmentAssigned(db, p) {
  if (!p.shipmentId) throw new Error('[SNE] SHIPMENT_ASSIGNED: shipmentId مطلوب');
  if (!p.partnerId)  throw new Error('[SNE] SHIPMENT_ASSIGNED: partnerId مطلوب');

  const shipSnap = await getDoc(doc(db, SN_COLLECTIONS.SHIPMENTS, p.shipmentId));
  if (!shipSnap.exists()) throw new Error('[SNE] SHIPMENT_ASSIGNED: shipment غير موجود');
  const ship = shipSnap.data();

  if (!canTransition(ship.state, SHIPMENT_STATE.ASSIGNED)) {
    throw new Error(`[SNE] انتقال غير مسموح من ${ship.state} إلى assigned`);
  }

  // Re-calc pricing with the new partner
  let pricing = ship.pricing;
  const pSnap = await getDoc(doc(db, SN_COLLECTIONS.PARTNERS, p.partnerId));
  if (pSnap.exists()) {
    let zone = null;
    if (ship.delivery?.zoneId) {
      const zSnap = await getDoc(doc(db, SN_COLLECTIONS.ZONES, ship.delivery.zoneId));
      if (zSnap.exists()) zone = zSnap.data();
    }
    pricing = calculateShippingPrice({
      partner:    pSnap.data(),
      zone,
      weightKg:   ship.pricing?.weightKg   || 1,
      distanceKm: ship.pricing?.distanceKm || 0,
      isExpress:  ship.pricing?.isExpress  || false,
    });
  }

  const batch = writeBatch(db);
  batch.update(doc(db, SN_COLLECTIONS.SHIPMENTS, p.shipmentId), {
    partnerId:        p.partnerId,
    partnerName:      p.partnerName || (pSnap.exists() ? pSnap.data().name : ''),
    assignmentMethod: p.assignmentMethod || 'manual',
    assignedAt:       serverTimestamp(),
    assignedBy:       p.userId || '',
    state:            SHIPMENT_STATE.ASSIGNED,
    pricing,
    updatedAt:        serverTimestamp(),
  });

  // Update order's cross-link
  if (ship.orderId) {
    batch.update(doc(db, 'orders', ship.orderId), {
      shipmentPartnerId: p.partnerId,
      shipmentPartnerName: p.partnerName || '',
      shipmentState: SHIPMENT_STATE.ASSIGNED,
      updatedAt: serverTimestamp(),
    });
  }

  addShipmentEvent(batch, db, {
    shipmentId: p.shipmentId,
    eventType:  'state_change',
    fromState:  ship.state,
    toState:    SHIPMENT_STATE.ASSIGNED,
    userId:     p.userId,
    userName:   p.userName,
    partnerId:  p.partnerId,
    notes:      `تم الإسناد لـ ${p.partnerName || 'شريك'}`,
    tenantId:   p.tenantId,
  });

  await batch.commit();
  console.log('[SNE] ✅ SHIPMENT_ASSIGNED:', { shipmentId: p.shipmentId, partnerId: p.partnerId });
  return { pricing };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: state transitions (PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY)
// generic — just validates transition and writes audit event
// ══════════════════════════════════════════════════════════════════
async function handleStateTransition(db, p, targetState) {
  if (!p.shipmentId) throw new Error('[SNE] shipmentId مطلوب');

  const shipSnap = await getDoc(doc(db, SN_COLLECTIONS.SHIPMENTS, p.shipmentId));
  if (!shipSnap.exists()) throw new Error('[SNE] shipment غير موجود');
  const ship = shipSnap.data();
  if (!canTransition(ship.state, targetState)) {
    throw new Error(`[SNE] انتقال غير مسموح من ${ship.state} إلى ${targetState}`);
  }

  const batch = writeBatch(db);
  const updates = { state: targetState, updatedAt: serverTimestamp() };

  if (targetState === SHIPMENT_STATE.PICKED_UP) {
    updates.pickedUpAt = serverTimestamp();
  }
  if (p.gps) updates.lastGps = p.gps;

  batch.update(doc(db, SN_COLLECTIONS.SHIPMENTS, p.shipmentId), updates);

  if (ship.orderId) {
    batch.update(doc(db, 'orders', ship.orderId), {
      shipmentState: targetState,
      updatedAt: serverTimestamp(),
    });
  }

  addShipmentEvent(batch, db, {
    shipmentId: p.shipmentId,
    eventType:  'state_change',
    fromState:  ship.state,
    toState:    targetState,
    userId:     p.userId,
    userName:   p.userName,
    partnerId:  ship.partnerId,
    gps:        p.gps,
    photoUrl:   p.photoUrl,
    notes:      p.notes || '',
    tenantId:   p.tenantId,
  });

  await batch.commit();
  console.log('[SNE] ✅ State transition:', { shipmentId: p.shipmentId, from: ship.state, to: targetState });
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: SHIPMENT_DELIVERED — أكبر event مالي
// يفعّل: تسجيل التسليم + حساب SLA + accrual للـ partner payout + commission المنصة
// ══════════════════════════════════════════════════════════════════
async function handleShipmentDelivered(db, p) {
  if (!p.shipmentId) throw new Error('[SNE] SHIPMENT_DELIVERED: shipmentId مطلوب');

  const shipSnap = await getDoc(doc(db, SN_COLLECTIONS.SHIPMENTS, p.shipmentId));
  if (!shipSnap.exists()) throw new Error('[SNE] shipment غير موجود');
  const ship = shipSnap.data();
  if (!canTransition(ship.state, SHIPMENT_STATE.DELIVERED)) {
    throw new Error(`[SNE] انتقال غير مسموح من ${ship.state} إلى delivered`);
  }

  // Pull partner for SLA check
  let partner = null;
  if (ship.partnerId) {
    const pSnap = await getDoc(doc(db, SN_COLLECTIONS.PARTNERS, ship.partnerId));
    if (pSnap.exists()) partner = pSnap.data();
  }

  // Build "virtual" updated shipment for SLA calc
  const virtualShipment = { ...ship, deliveredAt: { toDate:()=> new Date() } };
  const sla = evaluateSLA(virtualShipment, partner);
  const split = splitShipmentPayment(ship);

  const batch = writeBatch(db);

  // 1) Update shipment
  batch.update(doc(db, SN_COLLECTIONS.SHIPMENTS, p.shipmentId), {
    state:               SHIPMENT_STATE.DELIVERED,
    deliveredAt:         serverTimestamp(),
    actualDeliveryHours: sla.actualHours || 0,
    slaBreached:         sla.breached,
    slaBreachMinutes:    sla.breachMinutes,
    codCollected:        ship.paymentMethod === 'cod' ? true : ship.codCollected,
    codCollectedAt:      ship.paymentMethod === 'cod' ? serverTimestamp() : ship.codCollectedAt,
    proofOfDelivery: {
      photos:        p.photos        || [],
      signatureUrl:  p.signatureUrl  || '',
      recipientName: p.recipientName || '',
      notes:         p.deliveryNotes || '',
      gpsAtDelivery: p.gps           || null,
    },
    updatedAt:           serverTimestamp(),
  });

  // 2) Update order
  if (ship.orderId) {
    batch.update(doc(db, 'orders', ship.orderId), {
      shipmentState: SHIPMENT_STATE.DELIVERED,
      shipmentDeliveredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 3) Audit event
  addShipmentEvent(batch, db, {
    shipmentId: p.shipmentId,
    eventType:  'state_change',
    fromState:  ship.state,
    toState:    SHIPMENT_STATE.DELIVERED,
    userId:     p.userId,
    userName:   p.userName,
    partnerId:  ship.partnerId,
    gps:        p.gps,
    photoUrl:   (p.photos && p.photos[0]) || null,
    notes:      `تم التسليم — المستلم: ${p.recipientName || ''}`,
    tenantId:   p.tenantId,
  });

  // 4) Update partner stats + pending payout (denormalized cache for fast UI)
  if (ship.partnerId) {
    batch.update(doc(db, SN_COLLECTIONS.PARTNERS, ship.partnerId), {
      totalShipments:       increment(1),
      successfulDeliveries: increment(1),
      pendingPayout:        increment(split.toPartner),
      updatedAt:            serverTimestamp(),
    });
  }

  // 5) SLA breach → log it for later penalty
  if (sla.breached && ship.partnerId) {
    const breachRef = doc(collection(db, SN_COLLECTIONS.SLA_BREACHES));
    batch.set(breachRef, {
      shipmentId:    p.shipmentId,
      partnerId:     ship.partnerId,
      partnerName:   ship.partnerName,
      breachMinutes: sla.breachMinutes,
      actualHours:   sla.actualHours,
      penaltyAmount: 0,   // يُحسب في صفحة SLA admin
      status:        'pending_review',
      ...snTenantFields(p.tenantId),
      createdAt:     serverTimestamp(),
    });
  }

  // 6) Financial: ledger entry للـ commission accrual (لا حركة wallet فعلية بعد، فقط accrual)
  if (split.toPlatform > 0) {
    addLedgerToBatch(batch, db, 'COMMISSION_ACCRUED', {
      amount:     split.toPlatform,
      orderId:    ship.orderId,
      walletId:   p.platformWalletId || '',
      walletName: p.platformWalletName || 'محفظة المنصة',
      notes:      `عمولة شحن — ${ship.partnerName || ''} — shipment ${p.shipmentId}`,
      refId:      p.shipmentId,
      userId:     p.userId,
      userName:   p.userName,
    });
  }

  await batch.commit();
  console.log('[SNE] ✅ SHIPMENT_DELIVERED:', { shipmentId: p.shipmentId, sla });
  return { sla, split };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: SHIPMENT_CANCELLED
// ══════════════════════════════════════════════════════════════════
async function handleShipmentCancelled(db, p) {
  if (!p.shipmentId) throw new Error('[SNE] SHIPMENT_CANCELLED: shipmentId مطلوب');

  const shipSnap = await getDoc(doc(db, SN_COLLECTIONS.SHIPMENTS, p.shipmentId));
  if (!shipSnap.exists()) throw new Error('[SNE] shipment غير موجود');
  const ship = shipSnap.data();
  if (!canTransition(ship.state, SHIPMENT_STATE.CANCELLED)) {
    throw new Error(`[SNE] انتقال غير مسموح من ${ship.state} إلى cancelled`);
  }

  const batch = writeBatch(db);
  batch.update(doc(db, SN_COLLECTIONS.SHIPMENTS, p.shipmentId), {
    state:           SHIPMENT_STATE.CANCELLED,
    cancelledAt:     serverTimestamp(),
    cancelledBy:     p.userId || '',
    cancelReason:    p.reason || '',
    updatedAt:       serverTimestamp(),
  });

  if (ship.orderId) {
    batch.update(doc(db, 'orders', ship.orderId), {
      shipmentState: SHIPMENT_STATE.CANCELLED,
      updatedAt: serverTimestamp(),
    });
  }

  if (ship.partnerId) {
    batch.update(doc(db, SN_COLLECTIONS.PARTNERS, ship.partnerId), {
      // increment cancellation count (will be used to update rate periodically)
      cancellationCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }

  addShipmentEvent(batch, db, {
    shipmentId: p.shipmentId,
    eventType:  'state_change',
    fromState:  ship.state,
    toState:    SHIPMENT_STATE.CANCELLED,
    userId:     p.userId,
    userName:   p.userName,
    notes:      `إلغاء: ${p.reason || ''}`,
    tenantId:   p.tenantId,
  });

  await batch.commit();
  console.log('[SNE] ✅ SHIPMENT_CANCELLED:', { shipmentId: p.shipmentId });
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: PARTNER_PAYOUT — صرف للشريك من محفظة المنصة لمحفظة الشريك
// (أو cash payout — في الحالة دي مش بتلمس wallet الشريك)
// ══════════════════════════════════════════════════════════════════
async function handlePartnerPayout(db, p) {
  if (!p.partnerId)        throw new Error('[SNE] PARTNER_PAYOUT: partnerId مطلوب');
  if (!(p.amount > 0))     throw new Error('[SNE] PARTNER_PAYOUT: amount غير صالح');
  if (!p.fromWalletId)     throw new Error('[SNE] PARTNER_PAYOUT: fromWalletId مطلوب (محفظة المنصة)');

  const pSnap = await getDoc(doc(db, SN_COLLECTIONS.PARTNERS, p.partnerId));
  if (!pSnap.exists()) throw new Error('[SNE] partner غير موجود');
  const partner = pSnap.data();
  const toWalletId = p.toWalletId || partner.walletId;

  const batch = writeBatch(db);

  // 1) From platform wallet (out)
  batch.update(doc(db, 'wallets', p.fromWalletId), { balance: increment(-p.amount) });

  // 2) To partner wallet (in) — لو payoutMethod = wallet
  if (toWalletId && p.payoutMethod !== 'cash') {
    batch.update(doc(db, 'wallets', toWalletId), { balance: increment(p.amount) });
  }

  // 3) tx records (2 if wallet, 1 if cash)
  const dateStr = p.date || new Date().toLocaleDateString('ar-EG');
  const outTxRef = doc(collection(db, 'transactions_v2'));
  batch.set(outTxRef, {
    walletId: p.fromWalletId, walletName: p.fromWalletName || '',
    type: 'out', amount: p.amount, fees: 0,
    description: `صرف لشريك — ${partner.name}${p.note ? ' — ' + p.note : ''}`,
    category: 'partner_payout',
    partnerId: p.partnerId, partnerName: partner.name,
    shipmentIds: p.shipmentIds || [],
    date: dateStr,
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
    ...approvalFields(),
  });

  if (toWalletId && p.payoutMethod !== 'cash') {
    const inTxRef = doc(collection(db, 'transactions_v2'));
    batch.set(inTxRef, {
      walletId: toWalletId, walletName: `محفظة شريك — ${partner.name}`,
      type: 'in', amount: p.amount, fees: 0,
      description: `استلام دفعة من المنصة${p.note ? ' — ' + p.note : ''}`,
      category: 'partner_payout',
      partnerId: p.partnerId, partnerName: partner.name,
      shipmentIds: p.shipmentIds || [],
      date: dateStr,
      createdBy: p.userId || '', createdByName: p.userName || '',
      createdAt: serverTimestamp(),
      ...approvalFields(),
    });
  }

  // 4) Update partner pendingPayout + totalPaidOut
  batch.update(doc(db, SN_COLLECTIONS.PARTNERS, p.partnerId), {
    pendingPayout: increment(-p.amount),
    totalPaidOut:  increment(p.amount),
    lastPayoutAt:  serverTimestamp(),
    updatedAt:     serverTimestamp(),
  });

  // 5) Mark shipments as settled
  for (const sid of (p.shipmentIds || [])) {
    batch.update(doc(db, SN_COLLECTIONS.SHIPMENTS, sid), {
      settled: true,
      settledAt: serverTimestamp(),
      settlementId: outTxRef.id,
      state: SHIPMENT_STATE.SETTLED,
      updatedAt: serverTimestamp(),
    });
  }

  // 6) Ledger entry (using existing MERCHANT_PAYOUT until we add PARTNER_PAYOUT to FE)
  addLedgerToBatch(batch, db, 'MERCHANT_PAYOUT', {
    amount: p.amount,
    walletId: p.fromWalletId, walletName: p.fromWalletName || '',
    vendorId: p.partnerId, vendorName: partner.name,
    notes: `صرف لشريك شحن — ${partner.name}${p.note ? ' — ' + p.note : ''}`,
    refId: outTxRef.id,
    userId: p.userId, userName: p.userName,
    categoryOverride: 'shipping_partner_payout',
  });

  await batch.commit();
  console.log('[SNE] ✅ PARTNER_PAYOUT:', { partnerId: p.partnerId, amount: p.amount });
  return { txId: outTxRef.id };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: SLA_PENALTY — خصم غرامة من الـ pending payout للشريك
// ══════════════════════════════════════════════════════════════════
async function handleSlaPenalty(db, p) {
  if (!p.partnerId)    throw new Error('[SNE] SLA_PENALTY: partnerId مطلوب');
  if (!(p.amount > 0)) throw new Error('[SNE] SLA_PENALTY: amount غير صالح');

  const batch = writeBatch(db);

  // 1) Reduce partner pending payout
  batch.update(doc(db, SN_COLLECTIONS.PARTNERS, p.partnerId), {
    pendingPayout: increment(-p.amount),
    totalPenalties: increment(p.amount),
    updatedAt: serverTimestamp(),
  });

  // 2) Log to platform wallet (gain)
  if (p.platformWalletId) {
    batch.update(doc(db, 'wallets', p.platformWalletId), { balance: increment(p.amount) });
  }

  // 3) Mark the breach as resolved with this penalty
  if (p.breachId) {
    batch.update(doc(db, SN_COLLECTIONS.SLA_BREACHES, p.breachId), {
      penaltyAmount: p.amount,
      status: 'penalty_applied',
      resolvedAt: serverTimestamp(),
      resolvedBy: p.userId || '',
    });
  }

  // 4) Ledger (use PENALTY type)
  addLedgerToBatch(batch, db, 'PENALTY', {
    amount: p.amount,
    walletId: p.platformWalletId || '',
    walletName: p.platformWalletName || 'محفظة المنصة',
    employeeId: p.partnerId,    // re-using employeeId field for partnerId
    employeeName: p.partnerName,
    notes: `غرامة SLA — ${p.partnerName} — shipment ${p.shipmentId || ''} — ${p.reason || ''}`,
    refId: p.breachId,
    userId: p.userId, userName: p.userName,
    categoryOverride: 'sla_penalty',
  });

  await batch.commit();
  console.log('[SNE] ✅ SLA_PENALTY applied:', { partnerId: p.partnerId, amount: p.amount });
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: RATING_SUBMITTED — تقييم العميل للشريك
// يحدّث الـ rating aggregate بشكل atomic
// ══════════════════════════════════════════════════════════════════
async function handleRatingSubmitted(db, p) {
  if (!p.partnerId)    throw new Error('[SNE] RATING: partnerId مطلوب');
  if (!p.shipmentId)   throw new Error('[SNE] RATING: shipmentId مطلوب');
  const stars = Math.max(1, Math.min(5, parseInt(p.stars) || 0));
  if (!stars) throw new Error('[SNE] RATING: stars 1-5 مطلوبة');

  const pSnap = await getDoc(doc(db, SN_COLLECTIONS.PARTNERS, p.partnerId));
  if (!pSnap.exists()) throw new Error('[SNE] partner غير موجود');
  const partner = pSnap.data();
  const oldAvg   = partner.ratingAvg || 0;
  const oldCount = partner.ratingCount || 0;
  const newCount = oldCount + 1;
  const newAvg   = Math.round(((oldAvg * oldCount + stars) / newCount) * 100) / 100;

  const batch = writeBatch(db);

  const ratingRef = doc(collection(db, SN_COLLECTIONS.PARTNER_RATINGS));
  batch.set(ratingRef, {
    partnerId:   p.partnerId,
    partnerName: partner.name,
    shipmentId:  p.shipmentId,
    orderId:     p.orderId || null,
    stars,
    comment:     p.comment || '',
    submittedBy: p.userId || '',
    submittedByName: p.userName || '',
    ...snTenantFields(p.tenantId),
    createdAt:   serverTimestamp(),
  });

  batch.update(doc(db, SN_COLLECTIONS.PARTNERS, p.partnerId), {
    ratingAvg:   newAvg,
    ratingCount: newCount,
    updatedAt:   serverTimestamp(),
  });

  await batch.commit();
  console.log('[SNE] ✅ Rating submitted:', { partnerId: p.partnerId, stars, newAvg });
  return { newAvg, newCount };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: BID_PLACED — شريك يقدم عرض على شحنة (Marketplace mode)
// ══════════════════════════════════════════════════════════════════
async function handleBidPlaced(db, p) {
  if (!p.shipmentId) throw new Error('[SNE] BID: shipmentId مطلوب');
  if (!p.partnerId)  throw new Error('[SNE] BID: partnerId مطلوب');
  if (!(p.bidAmount > 0)) throw new Error('[SNE] BID: bidAmount غير صالح');

  const batch = writeBatch(db);
  const bidRef = doc(collection(db, SN_COLLECTIONS.SHIPMENT_BIDS));
  const expiresAt = new Date(Date.now() + (p.expiryMinutes || 30) * 60000);
  batch.set(bidRef, {
    shipmentId:           p.shipmentId,
    partnerId:            p.partnerId,
    partnerName:          p.partnerName || '',
    bidAmount:            p.bidAmount,
    proposedDeliveryHours:p.proposedDeliveryHours || 0,
    notes:                p.notes || '',
    status:               'pending',
    expiresAt,
    ...snTenantFields(p.tenantId),
    createdAt:            serverTimestamp(),
  });

  await batch.commit();
  console.log('[SNE] ✅ BID_PLACED:', { shipmentId: p.shipmentId, partnerId: p.partnerId, bidAmount: p.bidAmount });
  return { bidId: bidRef.id };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: BID_ACCEPTED — تقبل العرض → تُسند الشحنة + تُلغى باقي العروض
// ══════════════════════════════════════════════════════════════════
async function handleBidAccepted(db, p) {
  if (!p.bidId) throw new Error('[SNE] BID_ACCEPTED: bidId مطلوب');

  const bidSnap = await getDoc(doc(db, SN_COLLECTIONS.SHIPMENT_BIDS, p.bidId));
  if (!bidSnap.exists()) throw new Error('[SNE] bid غير موجود');
  const bid = bidSnap.data();

  // First: assign the shipment (via existing handler)
  await handleShipmentAssigned(db, {
    shipmentId:       bid.shipmentId,
    partnerId:        bid.partnerId,
    partnerName:      bid.partnerName,
    assignmentMethod: 'bid_won',
    userId:           p.userId,
    userName:         p.userName,
    tenantId:         p.tenantId,
  });

  // Then: mark all other bids as 'lost', this one as 'won'
  const otherBids = await getDocs(query(
    collection(db, SN_COLLECTIONS.SHIPMENT_BIDS),
    where('shipmentId', '==', bid.shipmentId)
  ));
  const batch = writeBatch(db);
  otherBids.forEach(d => {
    batch.update(d.ref, {
      status: d.id === p.bidId ? 'won' : 'lost',
      decidedAt: serverTimestamp(),
      decidedBy: p.userId || '',
    });
  });
  await batch.commit();
  console.log('[SNE] ✅ BID_ACCEPTED:', { bidId: p.bidId, shipmentId: bid.shipmentId });
  return { shipmentId: bid.shipmentId };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER: DRIVER_GPS_PING — السائق يبعت موقعه (mobile app)
// لا batch — single doc update + audit event
// ══════════════════════════════════════════════════════════════════
async function handleDriverGpsPing(db, p) {
  if (!p.driverId) throw new Error('[SNE] GPS: driverId مطلوب');
  if (!p.gps)      throw new Error('[SNE] GPS: gps مطلوب');

  const batch = writeBatch(db);

  batch.update(doc(db, SN_COLLECTIONS.DRIVERS, p.driverId), {
    lastGps:   p.gps,
    lastGpsAt: serverTimestamp(),
    isOnline:  true,
  });

  if (p.shipmentId) {
    // optional shipment lastGps update
    batch.update(doc(db, SN_COLLECTIONS.SHIPMENTS, p.shipmentId), {
      lastGps: p.gps,
      lastGpsAt: serverTimestamp(),
    });
    addShipmentEvent(batch, db, {
      shipmentId: p.shipmentId,
      eventType: 'gps_ping',
      gps: p.gps,
      partnerId: p.partnerId,
      userId: p.driverId,
      userName: p.driverName,
      tenantId: p.tenantId,
    });
  }
  await batch.commit();
  return {};
}

// ══════════════════════════════════════════════════════════════════
// Dispatcher
// ══════════════════════════════════════════════════════════════════
const HANDLERS = {
  // Partner lifecycle
  PARTNER_ONBOARDED:           handlePartnerOnboarded,
  PARTNER_KYC_APPROVED:        (db, p) => handlePartnerKycChange(db, p, PARTNER_KYC_STATUS.APPROVED),
  PARTNER_KYC_REJECTED:        (db, p) => handlePartnerKycChange(db, p, PARTNER_KYC_STATUS.REJECTED),
  PARTNER_SUSPENDED:           (db, p) => handlePartnerKycChange(db, p, PARTNER_KYC_STATUS.SUSPENDED),
  // Shipment lifecycle
  SHIPMENT_CREATED:            handleShipmentCreated,
  SHIPMENT_ASSIGNED:           handleShipmentAssigned,
  SHIPMENT_ACCEPTED:           (db, p) => handleStateTransition(db, p, SHIPMENT_STATE.ACCEPTED),
  SHIPMENT_PICKED_UP:          (db, p) => handleStateTransition(db, p, SHIPMENT_STATE.PICKED_UP),
  SHIPMENT_IN_TRANSIT:         (db, p) => handleStateTransition(db, p, SHIPMENT_STATE.IN_TRANSIT),
  SHIPMENT_OUT_FOR_DELIVERY:   (db, p) => handleStateTransition(db, p, SHIPMENT_STATE.OUT_FOR_DELIVERY),
  SHIPMENT_DELIVERED:          handleShipmentDelivered,
  SHIPMENT_DELIVERY_FAILED:    (db, p) => handleStateTransition(db, p, SHIPMENT_STATE.DELIVERY_FAILED),
  SHIPMENT_RETURNED:           (db, p) => handleStateTransition(db, p, SHIPMENT_STATE.RETURNED),
  SHIPMENT_CANCELLED:          handleShipmentCancelled,
  // Financial
  PARTNER_PAYOUT:              handlePartnerPayout,
  SLA_PENALTY:                 handleSlaPenalty,
  // Quality / Marketplace
  RATING_SUBMITTED:            handleRatingSubmitted,
  BID_PLACED:                  handleBidPlaced,
  BID_ACCEPTED:                handleBidAccepted,
  DRIVER_GPS_PING:             handleDriverGpsPing,
};

// ══════════════════════════════════════════════════════════════════
// HIGH-LEVEL: dispatchShippingNetworkEvent
// ══════════════════════════════════════════════════════════════════
export async function dispatchShippingNetworkEvent(db, eventType, payload) {
  console.log('[SNE] 📥 event received:', eventType);
  const handler = HANDLERS[eventType];
  if (!handler) throw new Error(`[SNE] Unknown event type: ${eventType}`);
  try {
    const result = await handler(db, payload);
    console.log('[SNE] ✅ completed:', eventType);
    return result;
  } catch (e) {
    console.error('[SNE] ❌ event failed:', eventType, { code: e.code, msg: e.message });
    throw e;
  }
}

// Re-export core for convenience
export {
  SNE, SNFE, SHIPMENT_STATE, SHIPMENT_STATE_META,
  PARTNER_KYC_STATUS, SN_COLLECTIONS,
  calculateShippingPrice, evaluateSLA, splitShipmentPayment,
};
