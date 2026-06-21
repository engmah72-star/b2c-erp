/**
 * returns-core.js — نظام المرتجعات والـ After-Sales
 * Returns / After-Sales Module — v1 (Phase 1: Foundation)
 *
 * مرجع التعريف الكامل: AUDIT_REPORT.md §C6 + RULE 7 module definition.
 *
 * هذا الـ module يلتزم بـ:
 *   - RULE 2 + 3: كل عملية في writeBatch ذرّي
 *   - RULE 5: كل refund يُسجَّل في financial_ledger
 *   - RULE 6: لا يلمس orders.js الموجود — يقرأ منه ويضيف بجواره
 *   - RULE 7: تم تعريف 5 أقسام للموافقة قبل التطوير
 *   - RULE 8: clientPhone في الـ ticket محمي بنفس الأدوار (canSeeCustomerPhone)
 *
 * الـ events المالية (RETURN_REFUNDED + REVERSAL) تستخدم addLedgerToBatch
 * من financial-sync-engine.js (LC + FE معرَّفة هناك).
 *
 * الـ events غير المالية (REQUEST/INSPECT/APPROVE/...) تكتب في:
 *   - returns_tickets (مصدر الحقيقة الوحيد)
 *   - audit_logs (لكل تحوّل state)
 *
 * Idempotency: كل dispatch يأخذ idempotencyKey اختياري.
 *   لو موجود في marketplace_idempotency → skip (نُعيد استخدام نفس الـ collection).
 */
import {
  writeBatch, doc, collection, getDoc, serverTimestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { addLedgerToBatch, FE } from "./financial-sync-engine.js";
import { addAuditToBatch as _centralAudit } from './core/audit.js';

console.log('[RET] ↩️ Returns Core v1 loaded');

// ══════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════

export const RT_STATUS = {
  REQUESTED:           'requested',
  INSPECTING:          'inspecting',
  APPROVED:            'approved',
  REJECTED:            'rejected',
  REFUNDED:            'refunded',
  REPLACEMENT_ISSUED:  'replacement_issued',
  CANCELLED:           'cancelled',
  CLOSED:              'closed',
};

export const RT_REASON = {
  DAMAGED:               'damaged',
  WRONG_DESIGN:          'wrong_design',
  LATE_DELIVERY:         'late_delivery',
  QUALITY_LOW:           'quality_low',
  WRONG_PRODUCT:         'wrong_product',
  CUSTOMER_CHANGED_MIND: 'customer_changed_mind',
  OTHER:                 'other',
};

export const RT_DECISION = {
  FULL_REFUND:    'full_refund',
  PARTIAL_REFUND: 'partial_refund',
  REPLACEMENT:    'replacement',
  REJECTED:       'rejected',
};

export const RT_BLAMED_PARTY = {
  DESIGNER: 'designer',
  PRINTER:  'printer',
  SHIPPING: 'shipping',
  CUSTOMER: 'customer',
  UNKNOWN:  'unknown',
};

export const RT_REFUND_DEST = {
  CASH:             'cash',              // كاش لليد
  CUSTOMER_WALLET:  'customer_wallet',   // رصيد على customer_wallets للشراء التالي
  ORIGINAL_PAYMENT: 'original_payment',  // تحويل بنكي خارجي
};

export const SLA_HOURS = {
  INSPECT: 24,   // من requested → approved/rejected
  REFUND:  168,  // 7 أيام من approved → refunded
};

export const RT_RETURN_TYPE = {
  FULL:     'full',
  PARTIAL:  'partial',
  WARRANTY: 'warranty',
};

// terminal states — لا يمكن تعديل tickets فيها إلا عبر reversal مخصص
const TERMINAL_STATES = new Set([
  RT_STATUS.REFUNDED,    // عكسها يحتاج RETURN_REFUNDED_REVERSAL
  RT_STATUS.CANCELLED,
  RT_STATUS.CLOSED,
]);

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

/**
 * مرجع: تعريف ticketNo human-readable.
 * النمط: RT-YYYYMMDD-XXXXXX حيث XXXXXX آخر 6 حروف من docId.
 */
export function makeTicketNo(docId, dateObj) {
  const d   = dateObj || new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const tail = String(docId).slice(-6).toUpperCase();
  return `RT-${yyyy}${mm}${dd}-${tail}`;
}

/**
 * يحسب slaInspectDeadline من requestedAt.
 * يُمرَّر كـ Date (يتحول لـ ISO string في document) لأن serverTimestamp
 * لا يمكن جمعه/طرحه قبل الـ commit.
 */
export function calcInspectDeadline(fromDate) {
  const d = fromDate ? new Date(fromDate) : new Date();
  d.setHours(d.getHours() + SLA_HOURS.INSPECT);
  return d.toISOString();
}

export function calcRefundDeadline(fromDate) {
  const d = fromDate ? new Date(fromDate) : new Date();
  d.setHours(d.getHours() + SLA_HOURS.REFUND);
  return d.toISOString();
}

/**
 * reversal map للأحداث non-financial — المالية في getReversal بـ FSE.
 */
export function getReturnReversal(eventType) {
  const MAP = {
    RETURN_REQUESTED:          'RETURN_CANCELLED',
    RETURN_APPROVED:           'RETURN_CANCELLED',
    RETURN_REJECTED:           'RETURN_INSPECTED',   // reopen خلال 24h
    RETURN_REFUNDED:           'RETURN_REFUNDED_REVERSAL',
    RETURN_REFUNDED_REVERSAL:  'RETURN_REFUNDED',
    RETURN_REPLACEMENT_ISSUED: 'RETURN_CANCELLED',
  };
  return MAP[eventType] || null;
}

async function isAlreadyProcessed(db, idempotencyKey) {
  if (!idempotencyKey) return false;
  const snap = await getDoc(doc(db, 'marketplace_idempotency', idempotencyKey));
  return snap.exists();
}

function markIdempotency(batch, db, idempotencyKey, eventType) {
  if (!idempotencyKey) return;
  batch.set(doc(db, 'marketplace_idempotency', idempotencyKey), {
    eventType,
    processedAt: serverTimestamp(),
  });
}

function addAuditToBatch(batch, db, action, p) {
  return _centralAudit(batch, {
    db, action,
    userId:  p.userId  || '',
    userName: p.userName || '',
    entity: 'returns_ticket',
    details: {
      entityId: p.ticketId || null,
      orderId:  p.orderId  || null,
      clientId: p.clientId || null,
      payload:  p.payload  || {},
      notes:    p.notes    || '',
    },
  });
}

function makeTimelineEntry(action, p) {
  return {
    action,
    date: new Date().toISOString(),
    by:   p.userId || '',
    byName: p.userName || '',
    note: p.note || p.notes || '',
  };
}

async function loadTicket(db, ticketId) {
  const snap = await getDoc(doc(db, 'returns_tickets', ticketId));
  if (!snap.exists()) throw new Error('[RET] ticket غير موجود: ' + ticketId);
  return { ...snap.data(), _id: snap.id };
}

function assertStatusTransition(ticket, allowedFrom, eventType) {
  if (!allowedFrom.includes(ticket.status)) {
    throw new Error(`[RET] ${eventType} لا يمكن من status=${ticket.status} (مطلوب: ${allowedFrom.join('|')})`);
  }
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 1 — RETURN REQUESTED (إنشاء ticket جديد)
// payload: { orderId, clientId, clientName, clientPhone, returnType,
//            reason, reasonDetails, productIds, evidenceUrls,
//            requestedByPortal?, userId, userName, tenantId?, idempotencyKey }
// ══════════════════════════════════════════════════════════════════
async function handleReturnRequest(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.orderId)  throw new Error('[RET] orderId مطلوب');
  if (!p.clientId) throw new Error('[RET] clientId مطلوب');
  if (!p.reason)   throw new Error('[RET] reason مطلوب');

  // اقرأ الـ order للحصول على orderRef + التحقق من وجوده
  const orderSnap = await getDoc(doc(db, 'orders', p.orderId));
  if (!orderSnap.exists()) throw new Error('[RET] order غير موجود');
  const order = orderSnap.data();

  const now = new Date();
  const inspectDeadline = calcInspectDeadline(now);

  const batch = writeBatch(db);
  const ticketRef = doc(collection(db, 'returns_tickets'));
  const ticketNo  = makeTicketNo(ticketRef.id, now);

  const ticketData = {
    ticketNo,
    tenantId:           p.tenantId || 'merchant_001',
    orderId:            p.orderId,
    orderRef:           order.orderId || p.orderId.slice(-6),
    productIds:         p.productIds || [],
    returnType:         p.returnType || RT_RETURN_TYPE.FULL,
    clientId:           p.clientId,
    clientName:         p.clientName || order.clientName || '',
    clientPhone:        p.clientPhone || order.clientPhone || '',  // RULE 8 protected on read
    reason:             p.reason,
    reasonDetails:      p.reasonDetails || '',
    evidenceUrls:       p.evidenceUrls || [],
    blamedParty:        p.blamedParty || RT_BLAMED_PARTY.UNKNOWN,
    status:             RT_STATUS.REQUESTED,
    requestedBy:        p.requestedByPortal ? 'client_portal' : (p.userId || ''),
    requestedByName:    p.userName || (p.requestedByPortal ? p.clientName : ''),
    requestedAt:        serverTimestamp(),
    slaInspectDeadline: inspectDeadline,
    slaBreached:        false,
    decision:           null,
    refundAmount:       0,
    refundDest:         null,
    refundWalletId:     null,
    createdAt:          serverTimestamp(),
    createdBy:          p.userId || '',
    updatedAt:          serverTimestamp(),
    isDeleted:          false,
    editHistory:        [],
    timeline:           [makeTimelineEntry('🆕 طلب مرتجع', p)],
  };

  batch.set(ticketRef, ticketData);

  // ضع علامة على الـ order أن له ticket نشط (للـ UI)
  batch.update(doc(db, 'orders', p.orderId), {
    hasReturn:        true,
    activeReturnId:   ticketRef.id,
    updatedAt:        serverTimestamp(),
  });

  addAuditToBatch(batch, db, FE.RETURN_REQUESTED, {
    ...p, ticketId: ticketRef.id,
    payload: { ticketNo, reason: p.reason, returnType: ticketData.returnType },
  });
  markIdempotency(batch, db, p.idempotencyKey, FE.RETURN_REQUESTED);

  await batch.commit();
  console.log('[RET] ✅ RETURN_REQUESTED:', ticketNo, 'order:', p.orderId);
  return { ticketId: ticketRef.id, ticketNo };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 2 — RETURN INSPECTED (move to inspecting state)
// payload: { ticketId, userId, userName, inspectionNote?, idempotencyKey }
// ══════════════════════════════════════════════════════════════════
async function handleReturnInspect(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.ticketId) throw new Error('[RET] ticketId مطلوب');

  const ticket = await loadTicket(db, p.ticketId);
  // يُسمح من requested (بداية الفحص) أو rejected (reopen خلال 24h)
  assertStatusTransition(ticket, [RT_STATUS.REQUESTED, RT_STATUS.REJECTED], FE.RETURN_INSPECTED);

  const batch = writeBatch(db);
  batch.update(doc(db, 'returns_tickets', p.ticketId), {
    status:          RT_STATUS.INSPECTING,
    inspectedBy:     p.userId || '',
    inspectedByName: p.userName || '',
    inspectedAt:     serverTimestamp(),
    inspectionNote:  p.inspectionNote || '',
    timeline:        [...(ticket.timeline || []), makeTimelineEntry('🔍 بدء الفحص', p)],
    updatedAt:       serverTimestamp(),
  });

  addAuditToBatch(batch, db, FE.RETURN_INSPECTED, {
    ...p, orderId: ticket.orderId, clientId: ticket.clientId,
    payload: { ticketNo: ticket.ticketNo, prevStatus: ticket.status },
  });
  markIdempotency(batch, db, p.idempotencyKey, FE.RETURN_INSPECTED);

  await batch.commit();
  console.log('[RET] 🔍 RETURN_INSPECTED:', ticket.ticketNo);
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 3 — RETURN APPROVED (set decision + amount)
// payload: { ticketId, decision (RT_DECISION.*), refundAmount, refundDest,
//            refundWalletId?, blamedParty?, userId, userName, idempotencyKey }
// ══════════════════════════════════════════════════════════════════
async function handleReturnApprove(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.ticketId)  throw new Error('[RET] ticketId مطلوب');
  if (!p.decision)  throw new Error('[RET] decision مطلوب');

  const validDecisions = [RT_DECISION.FULL_REFUND, RT_DECISION.PARTIAL_REFUND, RT_DECISION.REPLACEMENT];
  if (!validDecisions.includes(p.decision)) {
    throw new Error('[RET] decision غير صالح للـ approve: ' + p.decision + ' (استخدم rejectReturn للرفض)');
  }

  const isRefund = p.decision === RT_DECISION.FULL_REFUND || p.decision === RT_DECISION.PARTIAL_REFUND;
  if (isRefund) {
    if (!(p.refundAmount > 0)) throw new Error('[RET] refundAmount مطلوب وموجب');
    if (!p.refundDest)         throw new Error('[RET] refundDest مطلوب لقرار refund');
    if (p.refundDest === RT_REFUND_DEST.CASH && !p.refundWalletId) {
      throw new Error('[RET] refundWalletId مطلوب لـ refundDest=cash');
    }
  }

  const ticket = await loadTicket(db, p.ticketId);
  assertStatusTransition(ticket, [RT_STATUS.INSPECTING], FE.RETURN_APPROVED);

  const now = new Date();
  const batch = writeBatch(db);
  batch.update(doc(db, 'returns_tickets', p.ticketId), {
    status:             RT_STATUS.APPROVED,
    decision:           p.decision,
    refundAmount:       isRefund ? +p.refundAmount : 0,
    refundDest:         isRefund ? p.refundDest : null,
    refundWalletId:     isRefund ? (p.refundWalletId || null) : null,
    blamedParty:        p.blamedParty || ticket.blamedParty,
    approvedBy:         p.userId || '',
    approvedByName:     p.userName || '',
    approvedAt:         serverTimestamp(),
    slaRefundDeadline:  isRefund ? calcRefundDeadline(now) : null,
    timeline:           [...(ticket.timeline || []), makeTimelineEntry(`✅ موافقة — ${p.decision}`, p)],
    updatedAt:          serverTimestamp(),
  });

  addAuditToBatch(batch, db, FE.RETURN_APPROVED, {
    ...p, orderId: ticket.orderId, clientId: ticket.clientId,
    payload: { ticketNo: ticket.ticketNo, decision: p.decision, refundAmount: p.refundAmount },
  });
  markIdempotency(batch, db, p.idempotencyKey, FE.RETURN_APPROVED);

  await batch.commit();
  console.log('[RET] ✅ RETURN_APPROVED:', ticket.ticketNo, '→', p.decision);
  return { decision: p.decision, requiresRefund: isRefund };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 4 — RETURN REJECTED
// payload: { ticketId, rejectionReason, userId, userName, idempotencyKey }
// ══════════════════════════════════════════════════════════════════
async function handleReturnReject(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.ticketId) throw new Error('[RET] ticketId مطلوب');
  if (!p.rejectionReason) throw new Error('[RET] rejectionReason مطلوب');

  const ticket = await loadTicket(db, p.ticketId);
  assertStatusTransition(ticket, [RT_STATUS.INSPECTING], FE.RETURN_REJECTED);

  const batch = writeBatch(db);
  batch.update(doc(db, 'returns_tickets', p.ticketId), {
    status:           RT_STATUS.REJECTED,
    decision:         RT_DECISION.REJECTED,
    rejectionReason:  p.rejectionReason,
    rejectedBy:       p.userId || '',
    rejectedByName:   p.userName || '',
    rejectedAt:       serverTimestamp(),
    timeline:         [...(ticket.timeline || []), makeTimelineEntry(`❌ رفض — ${p.rejectionReason}`, p)],
    updatedAt:        serverTimestamp(),
  });

  // ارفع الـ active flag عن الـ order — لكن hasReturn نسيبه true (history)
  batch.update(doc(db, 'orders', ticket.orderId), {
    activeReturnId: null,
    updatedAt:      serverTimestamp(),
  });

  addAuditToBatch(batch, db, FE.RETURN_REJECTED, {
    ...p, orderId: ticket.orderId, clientId: ticket.clientId,
    payload: { ticketNo: ticket.ticketNo, reason: p.rejectionReason },
  });
  markIdempotency(batch, db, p.idempotencyKey, FE.RETURN_REJECTED);

  await batch.commit();
  console.log('[RET] ❌ RETURN_REJECTED:', ticket.ticketNo);
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 5 — RETURN REFUNDED (FINANCIAL)
// تنفيذ الـ refund: يحرك أموال + يسجل في financial_ledger.
// payload: { ticketId, userId, userName, idempotencyKey }
// المبلغ ووجهة الـ refund يُقرَأَنِ من الـ ticket المُعتمَد.
// ══════════════════════════════════════════════════════════════════
async function handleReturnRefund(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.ticketId) throw new Error('[RET] ticketId مطلوب');

  const ticket = await loadTicket(db, p.ticketId);
  assertStatusTransition(ticket, [RT_STATUS.APPROVED], FE.RETURN_REFUNDED);

  const amount = +ticket.refundAmount;
  if (!(amount > 0)) throw new Error('[RET] refundAmount غير صالح في الـ ticket');
  if (!ticket.refundDest) throw new Error('[RET] refundDest غير محدد في الـ ticket');
  if (ticket.refundDest === RT_REFUND_DEST.CASH && !ticket.refundWalletId) {
    throw new Error('[RET] refundWalletId غير محدد');
  }

  const orderSnap = await getDoc(doc(db, 'orders', ticket.orderId));
  if (!orderSnap.exists()) throw new Error('[RET] order مرتبط بالـ ticket غير موجود');
  const order = orderSnap.data();

  // اقرأ المحفظة لو الـ refund cash (للـ balanceBefore الصحيح)
  let walletName = '';
  let walletId   = ticket.refundWalletId;
  let bb         = 0;
  if (ticket.refundDest === RT_REFUND_DEST.CASH) {
    const walletSnap = await getDoc(doc(db, 'wallets', walletId));
    if (!walletSnap.exists()) throw new Error('[RET] المحفظة غير موجودة');
    walletName = walletSnap.data().name || '';
    bb         = parseFloat(walletSnap.data().balance) || 0;
  }

  const batch = writeBatch(db);

  // 1. خصم من المحفظة (لو cash)
  if (ticket.refundDest === RT_REFUND_DEST.CASH) {
    batch.update(doc(db, 'wallets', walletId), { balance: increment(-amount) });
  }

  // 2. إذا customer_wallet → نضيف للعميل
  if (ticket.refundDest === RT_REFUND_DEST.CUSTOMER_WALLET && ticket.clientId) {
    batch.set(doc(db, 'customer_wallets', ticket.clientId), {
      balance:   increment(amount),
      currency:  'EGP',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  // 3. transactions_v2 entry (للـ audit + approval workflow)
  const txRef = doc(collection(db, 'transactions_v2'));
  batch.set(txRef, {
    walletId:        walletId || null,
    walletName,
    type:            'out',
    amount,
    fees:            0,
    description:     `استرداد مرتجع — ${ticket.ticketNo} — ${ticket.clientName}`,
    category:        'return_refund',
    orderId:         ticket.orderId,
    clientId:        ticket.clientId,
    clientName:      ticket.clientName,
    returnTicketId:  p.ticketId,
    refundDest:      ticket.refundDest,
    balanceBefore:   bb,
    balanceAfter:    bb - amount,
    date:            new Date().toISOString().slice(0, 10),
    createdBy:       p.userId || '',
    createdByName:   p.userName || '',
    createdAt:       serverTimestamp(),
    // approvalFields() — للـ approval workflow
    approvalStatus:  'pending',
    isLocked:        false,
  });

  // 4. financial_ledger (RULE 5)
  const ledgerRef = addLedgerToBatch(batch, db, FE.RETURN_REFUNDED, {
    amount,
    walletId:   walletId || null,
    walletName,
    orderId:    ticket.orderId,
    clientId:   ticket.clientId,
    clientName: ticket.clientName,
    refId:      p.ticketId,
    notes:      `استرداد ${ticket.ticketNo} → ${ticket.refundDest} — ${ticket.reason}`,
    userId:     p.userId,
    userName:   p.userName,
  });

  // 5. تحديث الـ ticket — terminal state
  batch.update(doc(db, 'returns_tickets', p.ticketId), {
    status:         RT_STATUS.REFUNDED,
    refundedAt:     serverTimestamp(),
    refundedBy:     p.userId || '',
    refundedByName: p.userName || '',
    refundTxId:     txRef.id,
    refundLedgerId: ledgerRef.id,
    timeline:       [...(ticket.timeline || []), makeTimelineEntry(`💸 تم الاسترداد — ${amount} ج → ${ticket.refundDest}`, p)],
    updatedAt:      serverTimestamp(),
  });

  // 6. تحديث الـ order
  batch.update(doc(db, 'orders', ticket.orderId), {
    refundedAmount: increment(amount),
    activeReturnId: null,  // ticket مغلق الآن
    hasReturn:      true,
    updatedAt:      serverTimestamp(),
  });

  markIdempotency(batch, db, p.idempotencyKey, FE.RETURN_REFUNDED);

  await batch.commit();
  console.log('[RET] 💸 RETURN_REFUNDED:', ticket.ticketNo, '-', amount, '→', ticket.refundDest);
  return { amount, txId: txRef.id, ledgerId: ledgerRef.id };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 6 — RETURN REFUNDED REVERSAL (FINANCIAL)
// عكس refund — admin فقط، خلال 30 يوم، يحتاج reason إجباري.
// payload: { ticketId, reason, userId, userName, idempotencyKey }
// ══════════════════════════════════════════════════════════════════
async function handleReturnRefundReversal(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.ticketId) throw new Error('[RET] ticketId مطلوب');
  if (!p.reason)   throw new Error('[RET] reason إجباري للعكس');

  const ticket = await loadTicket(db, p.ticketId);
  if (ticket.status !== RT_STATUS.REFUNDED) {
    throw new Error('[RET] الـ ticket ليس في status=refunded — لا يمكن عكسه');
  }

  // تحقق من النافذة الزمنية: 30 يوم
  const refundedAtMs = ticket.refundedAt?.toMillis?.() || ticket.refundedAt?.seconds * 1000 || 0;
  const ageDays = (Date.now() - refundedAtMs) / (1000 * 60 * 60 * 24);
  if (refundedAtMs > 0 && ageDays > 30) {
    throw new Error(`[RET] الـ refund أقدم من 30 يوم (${Math.floor(ageDays)} يوم) — يحتاج قيد يدوي بدل العكس`);
  }

  const amount = +ticket.refundAmount;
  if (!(amount > 0)) throw new Error('[RET] refundAmount غير صالح');

  // اقرأ المحفظة لـ balanceBefore الصحيح (لو cash refund)
  let walletName = '';
  let bb         = 0;
  if (ticket.refundDest === RT_REFUND_DEST.CASH && ticket.refundWalletId) {
    const walletSnap = await getDoc(doc(db, 'wallets', ticket.refundWalletId));
    if (walletSnap.exists()) {
      walletName = walletSnap.data().name || '';
      bb         = parseFloat(walletSnap.data().balance) || 0;
    }
  }

  const batch = writeBatch(db);

  // 1. أعد المبلغ للمحفظة (لو cash)
  if (ticket.refundDest === RT_REFUND_DEST.CASH && ticket.refundWalletId) {
    batch.update(doc(db, 'wallets', ticket.refundWalletId), { balance: increment(amount) });
  }

  // 2. اخصم من customer_wallet لو الـ refund راح هناك
  if (ticket.refundDest === RT_REFUND_DEST.CUSTOMER_WALLET && ticket.clientId) {
    // تحقق رصيد كافٍ
    const cwSnap = await getDoc(doc(db, 'customer_wallets', ticket.clientId));
    const cwBalance = parseFloat(cwSnap.data()?.balance) || 0;
    if (cwBalance < amount) {
      throw new Error(`[RET] رصيد العميل ${cwBalance} ج أقل من المبلغ المطلوب عكسه (${amount} ج) — العميل أنفقه`);
    }
    batch.set(doc(db, 'customer_wallets', ticket.clientId), {
      balance:   increment(-amount),
      currency:  'EGP',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  // 3. transactions_v2 reversal entry
  const txRef = doc(collection(db, 'transactions_v2'));
  batch.set(txRef, {
    walletId:        ticket.refundWalletId || null,
    walletName,
    type:            'in',  // عكس الـ out
    amount,
    fees:            0,
    description:     `إلغاء استرداد مرتجع — ${ticket.ticketNo} — ${p.reason}`,
    category:        'return_refund_reversal',
    orderId:         ticket.orderId,
    clientId:        ticket.clientId,
    clientName:      ticket.clientName,
    returnTicketId:  p.ticketId,
    reverseOfTxId:   ticket.refundTxId || null,
    balanceBefore:   bb,
    balanceAfter:    bb + amount,
    date:            new Date().toISOString().slice(0, 10),
    createdBy:       p.userId || '',
    createdByName:   p.userName || '',
    createdAt:       serverTimestamp(),
    approvalStatus:  'pending',
    isLocked:        false,
  });

  // 4. financial_ledger (RULE 5)
  addLedgerToBatch(batch, db, FE.RETURN_REFUNDED_REVERSAL, {
    amount,
    walletId:   ticket.refundWalletId || null,
    walletName,
    orderId:    ticket.orderId,
    clientId:   ticket.clientId,
    clientName: ticket.clientName,
    refId:      p.ticketId,
    notes:      `إلغاء استرداد ${ticket.ticketNo} — ${p.reason}`,
    userId:     p.userId,
    userName:   p.userName,
  });

  // 5. الـ ticket يرجع لـ approved (يمكن إعادة معالجته أو إغلاقه يدوياً)
  batch.update(doc(db, 'returns_tickets', p.ticketId), {
    status:         RT_STATUS.APPROVED,
    reversedAt:     serverTimestamp(),
    reversedBy:     p.userId || '',
    reverseReason:  p.reason,
    timeline:       [...(ticket.timeline || []), makeTimelineEntry(`🔄 إلغاء استرداد — ${p.reason}`, p)],
    updatedAt:      serverTimestamp(),
  });

  // 6. خصم من order.refundedAmount
  batch.update(doc(db, 'orders', ticket.orderId), {
    refundedAmount: increment(-amount),
    activeReturnId: p.ticketId,  // الـ ticket عاد نشطًا
    updatedAt:      serverTimestamp(),
  });

  markIdempotency(batch, db, p.idempotencyKey, FE.RETURN_REFUNDED_REVERSAL);

  await batch.commit();
  console.log('[RET] 🔄 RETURN_REFUNDED_REVERSAL:', ticket.ticketNo, '+', amount);
  return { amount };
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 7 — RETURN REPLACEMENT ISSUED
// تم إنشاء order بديل — يربطه بالـ ticket. لا تكلفة مالية مباشرة هنا
// (تكلفة الـ replacement order نفسه تأتي عبر مساره الطبيعي).
// payload: { ticketId, replacementOrderId, userId, userName, idempotencyKey }
// ══════════════════════════════════════════════════════════════════
async function handleReturnReplacement(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.ticketId)            throw new Error('[RET] ticketId مطلوب');
  if (!p.replacementOrderId)  throw new Error('[RET] replacementOrderId مطلوب');

  const ticket = await loadTicket(db, p.ticketId);
  assertStatusTransition(ticket, [RT_STATUS.APPROVED], FE.RETURN_REPLACEMENT_ISSUED);
  if (ticket.decision !== RT_DECISION.REPLACEMENT) {
    throw new Error('[RET] قرار الـ ticket ليس replacement — استخدم refund handler');
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'returns_tickets', p.ticketId), {
    status:               RT_STATUS.REPLACEMENT_ISSUED,
    replacementOrderId:   p.replacementOrderId,
    replacementIssuedAt:  serverTimestamp(),
    replacementIssuedBy:  p.userId || '',
    timeline:             [...(ticket.timeline || []), makeTimelineEntry(`🔁 إصدار بديل — order ${p.replacementOrderId.slice(-6)}`, p)],
    updatedAt:            serverTimestamp(),
  });

  // اربط الـ replacement order بالـ original
  batch.update(doc(db, 'orders', p.replacementOrderId), {
    isReplacementOf:    ticket.orderId,
    replacementTicket:  p.ticketId,
    updatedAt:          serverTimestamp(),
  });

  addAuditToBatch(batch, db, FE.RETURN_REPLACEMENT_ISSUED, {
    ...p, orderId: ticket.orderId, clientId: ticket.clientId,
    payload: { ticketNo: ticket.ticketNo, replacementOrderId: p.replacementOrderId },
  });
  markIdempotency(batch, db, p.idempotencyKey, FE.RETURN_REPLACEMENT_ISSUED);

  await batch.commit();
  console.log('[RET] 🔁 RETURN_REPLACEMENT_ISSUED:', ticket.ticketNo, '→', p.replacementOrderId);
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 8 — RETURN CANCELLED (قبل الـ refund فقط)
// payload: { ticketId, reason, userId, userName, idempotencyKey }
// ══════════════════════════════════════════════════════════════════
async function handleReturnCancel(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.ticketId) throw new Error('[RET] ticketId مطلوب');

  const ticket = await loadTicket(db, p.ticketId);
  // يُسمح الإلغاء قبل التنفيذ المالي
  if (TERMINAL_STATES.has(ticket.status)) {
    throw new Error(`[RET] لا يمكن إلغاء ticket في status=${ticket.status}`);
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'returns_tickets', p.ticketId), {
    status:           RT_STATUS.CANCELLED,
    cancelledAt:      serverTimestamp(),
    cancelledBy:      p.userId || '',
    cancellationReason: p.reason || '',
    timeline:         [...(ticket.timeline || []), makeTimelineEntry(`🚫 إلغاء — ${p.reason || ''}`, p)],
    updatedAt:        serverTimestamp(),
  });

  // ارفع الـ active flag عن الـ order
  batch.update(doc(db, 'orders', ticket.orderId), {
    activeReturnId: null,
    updatedAt:      serverTimestamp(),
  });

  addAuditToBatch(batch, db, FE.RETURN_CANCELLED, {
    ...p, orderId: ticket.orderId, clientId: ticket.clientId,
    payload: { ticketNo: ticket.ticketNo, prevStatus: ticket.status, reason: p.reason },
  });
  markIdempotency(batch, db, p.idempotencyKey, FE.RETURN_CANCELLED);

  await batch.commit();
  console.log('[RET] 🚫 RETURN_CANCELLED:', ticket.ticketNo);
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 9 — RETURN CLOSED (إغلاق نهائي)
// يُستدعى تلقائياً بعد refunded/rejected/replacement_delivered.
// payload: { ticketId, userId, userName, idempotencyKey }
// ══════════════════════════════════════════════════════════════════
async function handleReturnClose(db, p) {
  if (await isAlreadyProcessed(db, p.idempotencyKey)) return { skipped: true };
  if (!p.ticketId) throw new Error('[RET] ticketId مطلوب');

  const ticket = await loadTicket(db, p.ticketId);
  // أي state غير cancelled/closed يمكن إغلاقه (refunded/rejected/replacement)
  if (ticket.status === RT_STATUS.CLOSED) return { skipped: true, reason: 'already closed' };
  if (ticket.status === RT_STATUS.CANCELLED) {
    throw new Error('[RET] cancelled tickets لا تُغلَق — هي terminal بالفعل');
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'returns_tickets', p.ticketId), {
    status:        RT_STATUS.CLOSED,
    closedAt:      serverTimestamp(),
    closedBy:      p.userId || '',
    finalStatus:   ticket.status,  // احتفظ بالحالة السابقة (refunded/rejected/replacement_issued)
    timeline:      [...(ticket.timeline || []), makeTimelineEntry(`📦 إغلاق — كان: ${ticket.status}`, p)],
    updatedAt:     serverTimestamp(),
  });

  addAuditToBatch(batch, db, FE.RETURN_CLOSED, {
    ...p, orderId: ticket.orderId, clientId: ticket.clientId,
    payload: { ticketNo: ticket.ticketNo, finalStatus: ticket.status },
  });
  markIdempotency(batch, db, p.idempotencyKey, FE.RETURN_CLOSED);

  await batch.commit();
  console.log('[RET] 📦 RETURN_CLOSED:', ticket.ticketNo);
  return {};
}

// ══════════════════════════════════════════════════════════════════
// HANDLER 10 — WARRANTY CLAIM OPENED
// نوع خاص من الـ return — returnType=warranty. يُنشئ ticket بنفس flow
// الـ request لكن مع marker.
// payload: { كل payload لـ handleReturnRequest + warrantyDetails }
// ══════════════════════════════════════════════════════════════════
async function handleWarrantyClaimOpen(db, p) {
  // delegate إلى handleReturnRequest مع returnType=warranty
  return handleReturnRequest(db, {
    ...p,
    returnType: RT_RETURN_TYPE.WARRANTY,
    reason:     p.reason || RT_REASON.QUALITY_LOW,
    reasonDetails: `[WARRANTY] ${p.warrantyDetails || p.reasonDetails || ''}`,
  });
}

// ══════════════════════════════════════════════════════════════════
// PUBLIC DISPATCHER
// ══════════════════════════════════════════════════════════════════
export async function dispatchReturnEvent(db, eventType, payload) {
  console.log('[RET] 📥 dispatch:', eventType);
  switch (eventType) {
    case FE.RETURN_REQUESTED:           return handleReturnRequest(db, payload);
    case FE.RETURN_INSPECTED:           return handleReturnInspect(db, payload);
    case FE.RETURN_APPROVED:            return handleReturnApprove(db, payload);
    case FE.RETURN_REJECTED:            return handleReturnReject(db, payload);
    case FE.RETURN_REFUNDED:            return handleReturnRefund(db, payload);
    case FE.RETURN_REFUNDED_REVERSAL:   return handleReturnRefundReversal(db, payload);
    case FE.RETURN_REPLACEMENT_ISSUED:  return handleReturnReplacement(db, payload);
    case FE.RETURN_CANCELLED:           return handleReturnCancel(db, payload);
    case FE.RETURN_CLOSED:              return handleReturnClose(db, payload);
    case FE.WARRANTY_CLAIM_OPENED:      return handleWarrantyClaimOpen(db, payload);
    default:
      throw new Error('[RET] eventType غير مدعوم: ' + eventType);
  }
}

// Named exports للاستخدام المباشر بدون dispatcher
export {
  handleReturnRequest,
  handleReturnInspect,
  handleReturnApprove,
  handleReturnReject,
  handleReturnRefund,
  handleReturnRefundReversal,
  handleReturnReplacement,
  handleReturnCancel,
  handleReturnClose,
  handleWarrantyClaimOpen,
};
