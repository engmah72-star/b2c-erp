/**
 * Business2Card ERP — approval-actions.js
 *
 * ━━━ APPROVAL / PAYMENT-REQUEST ACTIONS LAYER (P2.6) ━━━
 *
 * طبقة الأفعال لـ approvals.html — تغطي:
 *   - دورة حياة payment_requests (create → execute → approve | reject)
 *   - دورة الاعتماد على transactions_v2 (pending → confirmed → approved | rejected)
 *   - استرداد كامل عند الرفض (cascade: tx + wallet + order + sub-collections + ledger)
 *
 * كل action atomic عبر writeBatch + addLedgerToBatch + RULE 2/3/5.
 */

import {
  doc,
  collection,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  writeBatch,
  serverTimestamp,
  arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db as defaultDb } from './core/firebase-init.js';
import {
  addLedgerToBatch,
  calcOrderPayment,
  FE,
  approvalFields,
} from './financial-sync-engine.js';
import { withIdempotency } from './core/idempotency.js';
import { auditEntry } from './core/audit.js';
import { resolveFinancialPolicy, evaluateOutflow, canApproveOutflow, checkApprovalSeparation } from './core/financial-policy.js';
import { addWalletDeltaToBatch, setWalletBalanceInBatch } from './core/wallet-ledger.js';

function _nowStr() {
  return new Date().toLocaleString('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}
function _todayDate() {
  return new Date().toLocaleDateString('ar-EG');
}

// ══════════════════════════════════════════
// PAYMENT REQUEST — create
// ══════════════════════════════════════════

/**
 * إنشاء payment_request جديد + تعليم البنود المرتبطة بـ pendingPaymentRequestId.
 * يدعم:
 *   - بند مفرد (orderId + costItemIndex)
 *   - بنود متعددة (costItemRefs[])
 *   - أنواع أخرى (salary, client_refund, general) بدون بنود
 */
export async function createPaymentRequest({
  db = defaultDb,
  requestData, // {type, amount, reason, supplierId?, employeeId?, clientId?, orderId?, costItemIndex?, costItemRefs?, ...}
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!requestData || !requestData.type) {
    return { ok: false, errors: ['⚠️ type مطلوب'], warnings: [] };
  }
  if (!((parseFloat(requestData.amount) || 0) > 0)) {
    return { ok: false, errors: ['⚠️ أدخل المبلغ'], warnings: [] };
  }
  if (!requestData.reason || !String(requestData.reason).trim()) {
    return { ok: false, errors: ['⚠️ أدخل السبب'], warnings: [] };
  }
  return withIdempotency(db, {
    actionType: 'create_payment_request',
    entityId: requestData.orderId || requestData.type,
    actorId: userId,
    actorName: userName,
    payload: {
      type: requestData.type,
      amount: parseFloat(requestData.amount) || 0,
      supplierId: requestData.supplierId || null,
      employeeId: requestData.employeeId || null,
      // هوية البنود تميّز طلبات مشروعة متعددة بنفس المبلغ/المورد على نفس
      // الأوردر خلال نافذة الـ dedupe (تجنّب false-positive يمنع طلباً صحيحاً).
      costItemIndex: requestData.costItemIndex ?? null,
      costItemRefs: (requestData.costItemRefs || []).map(r => `${r.orderId}:${r.costItemIndex}`),
    },
  }, async () => {
  try {
    const reqRef = doc(collection(db, 'payment_requests'));
    const batch = writeBatch(db);
    batch.set(reqRef, {
      ...requestData,
      requestedAt: serverTimestamp(),
    });

    // tag cost items with pendingPaymentRequestId
    if (requestData.type === 'supplier_payment') {
      const refs = (requestData.costItemRefs && requestData.costItemRefs.length)
        ? requestData.costItemRefs
        : (requestData.costItemIndex !== undefined && requestData.orderId
            ? [{ orderId: requestData.orderId, costItemIndex: requestData.costItemIndex, amount: requestData.amount }]
            : []);
      const byOrder = new Map();
      for (const r of refs) {
        if (!byOrder.has(r.orderId)) byOrder.set(r.orderId, []);
        byOrder.get(r.orderId).push(r);
      }
      for (const [oid, list] of byOrder.entries()) {
        const oSnap = await getDoc(doc(db, 'orders', oid));
        if (!oSnap.exists()) continue;
        const oData = oSnap.data();
        const items = [...(oData.costItems || [])];
        let mutated = false;
        for (const r of list) {
          const i = r.costItemIndex;
          if (items[i] && !items[i].paid && !items[i].pendingPaymentRequestId) {
            items[i] = {
              ...items[i],
              pendingPaymentRequestId: reqRef.id,
              pendingRequestedAt: _nowStr(),
              pendingRequestedBy: userName || '',
            };
            mutated = true;
          }
        }
        if (mutated) {
          const sum = list.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
          const supplierName = requestData.supplierName || '';
          const action = list.length > 1
            ? `💸 طلب دفع مُجمَّع (${list.length} بند) → ${supplierName} — ${sum.toLocaleString('ar-EG')} ج`
            : `💸 طلب دفع: ${items[list[0].costItemIndex]?.type || ''} — ${(parseFloat(requestData.amount) || 0).toLocaleString('ar-EG')} ج → ${items[list[0].costItemIndex]?.supplierName || ''}`;
          batch.update(doc(db, 'orders', oid), {
            costItems: items,
            timeline: [...(oData.timeline || []), auditEntry({
              action, userId, userName, kind: 'op',
              meta: { paymentRequestId: reqRef.id, items: list.length },
            })],
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
    await batch.commit();
    return { ok: true, errors: [], warnings: [], requestId: reqRef.id };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل إنشاء الطلب'], warnings: [] };
  }
  });
}

// ══════════════════════════════════════════
// PAYMENT REQUEST — execute (the big one)
// ══════════════════════════════════════════

/**
 * تنفيذ payment_request: يحوّل من 'requested' إلى 'pending' (أو 'awaiting_receipt').
 * يكتب في batch واحد:
 *   - خصم رصيد المحفظة
 *   - supplier_payments (لو supplier)
 *   - employee_payments (لو salary)
 *   - tx جديدة
 *   - addLedgerToBatch (الـ event حسب النوع)
 *   - orders.totalPaid (لو client_refund)
 *   - costItems[idx].paid = true (لو supplier_payment + costItemRefs)
 *   - payment_request status update + receipt URL لو موجود
 *
 * @param {Object} request — full payment_request doc (with _id)
 * @param {string} walletId, walletName
 * @param {number} walletBalance — للتحقق من الرصيد
 * @param {string} transferRef
 * @param {string} [note]
 * @param {Object} [receipt] — { url, path } لو رُفع إيصال مسبقاً (caller يرفع)
 * @param {string} [role] — دور المُنفِّذ (لبوابة سياسة الخروج)
 * @param {string} [walletType] — 'cash' | 'bank' | ... (لتشديد الكاش)
 * @param {Object} [policy] — override من master_lists/financial_policy (افتراضي advisory)
 * @param {number} [dailyWalletOutflow] — إجمالي خارج هذه المحفظة اليوم (للحدّ اليومي)
 */
export async function executePaymentRequest({
  db = defaultDb, request,
  walletId, walletName, walletBalance,
  transferRef, note = '',
  receipt = null,
  userId, userName,
  role = '', walletType = '', policy = null, dailyWalletOutflow = 0,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!request || !request._id) return { ok: false, errors: ['⚠️ request مطلوب'], warnings: [] };
  if (!walletId) return { ok: false, errors: ['⚠️ اختر المحفظة المصدر'], warnings: [] };
  if ((parseFloat(walletBalance) || 0) < request.amount) {
    return { ok: false, errors: [`⚠️ رصيد المحفظة غير كافٍ`], warnings: [] };
  }
  if (!transferRef || !transferRef.trim()) {
    return { ok: false, errors: ['⚠️ أدخل رقم/مرجع التحويل'], warnings: [] };
  }
  const r = request;

  // ── بوابة سياسة الخروج (Financial Policy) ──────────────────────────
  // افتراضياً advisory → لا تمنع (backward-compatible). في mode='escalate'
  // الحركات فوق الحدّ تتطلّب مُعتمِداً بالدور المطلوب ومختلفاً عن منشئ الطلب
  // (أربع عيون) قبل أن تتحرّك الفلوس. التحذيرات تُرفَق دائماً في النتيجة.
  const _policy = resolveFinancialPolicy(policy);
  const _polEval = evaluateOutflow({
    amount: r.amount, walletType,
    dailyWalletOutflow, policy: _policy,
  });
  if (_polEval.requiresApproval) {
    const gate = canApproveOutflow(_polEval, { role, userId }, r.requestedBy || '');
    if (!gate.ok) {
      return {
        ok: false, errors: gate.errors, warnings: _polEval.warnings,
        requiresApproval: true, policy: _polEval,
      };
    }
  }
  const _policyWarnings = _polEval.warnings;

  return withIdempotency(db, {
    actionType: 'execute_payment_request',
    entityId: r._id,
    actorId: userId,
    actorName: userName,
    payload: { amount: r.amount, walletId, transferRef },
  }, async () => {
  try {
    let orderDoc = null;
    if (r.orderId && (r.type === 'client_refund' || r.costItemIndex !== undefined)) {
      const oSnap = await getDoc(doc(db, 'orders', r.orderId));
      if (oSnap.exists()) orderDoc = { ...oSnap.data(), _id: oSnap.id };
    }

    const batch = writeBatch(db);
    addWalletDeltaToBatch(batch, db, { walletId, delta: -r.amount, event: r.type, refId: r._id });

    let spRef = null;
    if (r.type === 'supplier_payment' && r.supplierId) {
      spRef = doc(collection(db, 'supplier_payments'));
      batch.set(spRef, {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        supplierType: r.supplierType || 'printer',
        amount: r.amount,
        walletId, walletName,
        orderId: r.orderId || null,
        orderRefId: r.orderRefId || null,
        clientName: r.clientName || null,
        note: r.reason || note || '',
        transferRef,
        paymentRequestId: r._id,
        ...(r.costItemIndex !== undefined ? { costItemIndex: r.costItemIndex } : {}),
        date: _todayDate(),
        createdAt: serverTimestamp(),
        createdBy: userId,
        createdByName: userName || '',
      });
    }
    let epRef = null;
    if (r.type === 'salary' && r.employeeId) {
      epRef = doc(collection(db, 'employee_payments'));
      batch.set(epRef, {
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        amount: r.amount,
        salaryType: r.salaryType || 'salary',
        isDeduction: false,
        month: r.salaryMonth || '',
        walletId, walletName,
        note: r.reason || note || '',
        transferRef,
        paymentRequestId: r._id,
        date: _todayDate(),
        createdAt: serverTimestamp(),
        createdBy: userId,
      });
    }

    const txRef = doc(collection(db, 'transactions_v2'));
    const desc = (r.supplierName ? `دفعة مورد — ${r.supplierName}` :
                  r.employeeName ? `${r.salaryType || 'مرتب'} — ${r.employeeName}` :
                  r.type === 'client_refund' && r.clientName ? `استرداد عميل — ${r.clientName}` :
                  'مصروف عام') + (note ? ` — ${note}` : '');
    const cat = r.type === 'supplier_payment' ? (r.supplierType === 'shipper' ? 'shipper_payment' : 'printer_payment') :
                r.type === 'salary' ? 'salary' :
                r.type === 'client_refund' ? 'refund' :
                'expense';
    batch.set(txRef, {
      walletId, walletName,
      type: 'out', amount: r.amount, fees: 0,
      description: desc, category: cat,
      supplierId: r.supplierId || null, supplierName: r.supplierName || null,
      employeeId: r.employeeId || null, employeeName: r.employeeName || null,
      orderId: r.orderId || null, clientId: r.clientId || null, clientName: r.clientName || null,
      paymentRequestId: r._id,
      ...(spRef ? { spId: spRef.id } : {}),
      ...(epRef ? { epId: epRef.id } : {}),
      transferRef,
      date: _todayDate(),
      createdBy: userId, createdByName: userName || '',
      createdAt: serverTimestamp(),
      ...approvalFields(),
    });

    const evt = r.type === 'supplier_payment' ? FE.VENDOR_PAYMENT :
                r.type === 'salary' ? FE.SALARY_PAYMENT :
                r.type === 'client_refund' ? FE.CUSTOMER_REFUND :
                FE.GENERAL_EXPENSE;
    addLedgerToBatch(batch, db, evt, {
      amount: r.amount, walletId, walletName,
      vendorId: r.supplierId, vendorName: r.supplierName,
      employeeId: r.employeeId, employeeName: r.employeeName,
      orderId: r.orderId, clientId: r.clientId, clientName: r.clientName,
      notes: desc, refId: r._id,
      userId, userName: userName || '',
    });

    let orderPaymentUpdate = null;
    if (r.type === 'client_refund' && r.orderId && orderDoc) {
      orderPaymentUpdate = calcOrderPayment(orderDoc, -r.amount);
    }

    const itemsByOrder = new Map();
    if (r.type === 'supplier_payment') {
      const refs = (r.costItemRefs && r.costItemRefs.length)
        ? r.costItemRefs
        : (r.costItemIndex !== undefined && r.orderId
            ? [{ orderId: r.orderId, costItemIndex: r.costItemIndex, amount: r.amount, type: '' }]
            : []);
      const ordersCache = new Map();
      if (orderDoc) ordersCache.set(orderDoc._id, orderDoc);
      for (const ref of refs) {
        if (ordersCache.has(ref.orderId)) continue;
        const oS = await getDoc(doc(db, 'orders', ref.orderId));
        if (oS.exists()) ordersCache.set(ref.orderId, { ...oS.data(), _id: oS.id });
      }
      for (const ref of refs) {
        const oData = ordersCache.get(ref.orderId);
        if (!oData) continue;
        const arr = itemsByOrder.has(ref.orderId) ? itemsByOrder.get(ref.orderId) : [...(oData.costItems || [])];
        const idx = ref.costItemIndex;
        if (arr[idx]) {
          arr[idx] = {
            ...arr[idx],
            paid: true,
            paidTxId: txRef.id,
            paidSpId: spRef?.id || null,
            paidAt: new Date().toISOString(),
            paidVia: walletName,
            paidTransferRef: transferRef,
            paidByName: userName || '',
            paymentRequestId: r._id,
            pendingPaymentRequestId: null,
            pendingRequestedAt: null,
            pendingRequestedBy: null,
          };
        }
        itemsByOrder.set(ref.orderId, arr);
      }
    }

    const primaryOrderId = r.orderId;
    const updatedOrderIds = new Set(itemsByOrder.keys());
    if (orderPaymentUpdate && primaryOrderId) updatedOrderIds.add(primaryOrderId);
    for (const oid of updatedOrderIds) {
      const updateData = {
        ...(oid === primaryOrderId && orderPaymentUpdate ? orderPaymentUpdate : {}),
        ...(itemsByOrder.has(oid) ? { costItems: itemsByOrder.get(oid) } : {}),
        ...(oid === primaryOrderId && r.type === 'client_refund' ? { lastRefundDate: _todayDate() } : {}),
        updatedAt: serverTimestamp(),
      };
      batch.update(doc(db, 'orders', oid), updateData);
    }

    const nextStatus = receipt?.url ? 'pending' : 'awaiting_receipt';
    batch.update(doc(db, 'payment_requests', r._id), {
      status: nextStatus,
      executedBy: userId,
      executedByName: userName || '',
      executedAt: serverTimestamp(),
      sourceWalletId: walletId,
      sourceWalletName: walletName,
      txId: txRef.id,
      ...(spRef ? { supplierPaymentId: spRef.id } : {}),
      ...(epRef ? { employeePaymentId: epRef.id } : {}),
      transferRef,
      executeNote: note,
      ...(receipt?.url ? {
        receiptImageUrl: receipt.url,
        receiptImagePath: receipt.path || '',
        receivedBy: userId,
        receivedByName: userName || '',
        receivedAt: serverTimestamp(),
      } : {}),
    });

    await batch.commit();
    return {
      ok: true, errors: [], warnings: _policyWarnings,
      transactionId: txRef.id,
      supplierPaymentId: spRef?.id || null,
      employeePaymentId: epRef?.id || null,
      orderPaymentUpdate,
      itemsCount: [...itemsByOrder.values()].reduce((s, arr) => s + arr.filter(c => c.paid && c.paymentRequestId === r._id).length, 0),
    };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التنفيذ'], warnings: [] };
  }
  });
}

// ══════════════════════════════════════════
// PAYMENT REQUEST — reject (releases cost items)
// ══════════════════════════════════════════

export async function rejectPaymentRequest({
  db = defaultDb, request, reason,
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!request || !request._id) return { ok: false, errors: ['⚠️ request مطلوب'], warnings: [] };
  if (!reason || !reason.trim()) return { ok: false, errors: ['⚠️ السبب مطلوب'], warnings: [] };
  const r = request;
  return withIdempotency(db, {
    actionType: 'reject_payment_request',
    entityId: r._id,
    actorId: userId,
    actorName: userName,
    payload: { reason: reason.trim() },
  }, async () => {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'payment_requests', r._id), {
      status: 'rejected',
      rejectedBy: userId,
      rejectedByName: userName || '',
      rejectedAt: serverTimestamp(),
      rejectReason: reason.trim(),
    });
    if (r.type === 'supplier_payment') {
      const refs = (r.costItemRefs && r.costItemRefs.length)
        ? r.costItemRefs
        : (r.costItemIndex !== undefined && r.orderId
            ? [{ orderId: r.orderId, costItemIndex: r.costItemIndex }]
            : []);
      const byOrder = new Map();
      for (const ref of refs) {
        if (!byOrder.has(ref.orderId)) byOrder.set(ref.orderId, []);
        byOrder.get(ref.orderId).push(ref);
      }
      for (const [oid, list] of byOrder.entries()) {
        const oSnap = await getDoc(doc(db, 'orders', oid));
        if (!oSnap.exists()) continue;
        const oData = oSnap.data();
        const items = [...(oData.costItems || [])];
        let mutated = false;
        for (const ref of list) {
          const idx = ref.costItemIndex;
          if (items[idx] && items[idx].pendingPaymentRequestId === r._id) {
            items[idx] = { ...items[idx], pendingPaymentRequestId: null, pendingRequestedAt: null, pendingRequestedBy: null };
            mutated = true;
          }
        }
        if (mutated) {
          batch.update(doc(db, 'orders', oid), {
            costItems: items,
            timeline: [...(oData.timeline || []), auditEntry({
              action: `❌ رُفِض طلب دفع (${list.length} بند) — ${reason.trim()}`,
              userId, userName, kind: 'reversal',
              meta: { paymentRequestId: r._id, items: list.length },
            })],
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
    await batch.commit();
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الرفض'], warnings: [] };
  }
  });
}

// ══════════════════════════════════════════
// PAYMENT REQUEST — final approve (admin lock)
// ══════════════════════════════════════════

export async function approvePaymentRequest({
  db = defaultDb, requestId,
  userId, userName,
  policy = null, requestStatus = '', confirmedBy = '',
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!requestId) return { ok: false, errors: ['⚠️ requestId مطلوب'], warnings: [] };
  // الفصل الصارم على طلب الدفع (يُطبَّق فقط عند تفعيله):
  const _sep = checkApprovalSeparation({ approvalStatus: requestStatus, confirmedBy }, userId, policy);
  if (!_sep.ok) return { ok: false, errors: _sep.errors, warnings: [] };
  return withIdempotency(db, {
    actionType: 'approve_payment_request',
    entityId: requestId,
    actorId: userId,
    actorName: userName,
    payload: {},
  }, async () => {
  try {
    await updateDoc(doc(db, 'payment_requests', requestId), {
      status: 'approved',
      approvedBy: userId,
      approvedByName: userName || '',
      approvedAt: serverTimestamp(),
      isLocked: true,
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الاعتماد'], warnings: [] };
  }
  });
}

// ══════════════════════════════════════════
// PAYMENT REQUEST — attach receipt (awaiting_receipt → pending)
// ══════════════════════════════════════════

/**
 * يرفق رابط إيصال (مرفوع مسبقاً عبر الـ caller) إلى الطلب + الـ tx المرتبطة.
 * Atomic: payment_request + transactions_v2 معاً.
 */
export async function attachReceiptToRequest({
  db = defaultDb, requestId, txId = '',
  receiptUrl, receiptPath = '',
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!requestId) return { ok: false, errors: ['⚠️ requestId مطلوب'], warnings: [] };
  if (!receiptUrl) return { ok: false, errors: ['⚠️ receiptUrl مطلوب'], warnings: [] };
  return withIdempotency(db, {
    actionType: 'attach_receipt_to_request',
    entityId: requestId,
    actorId: userId,
    actorName: userName,
    payload: { receiptUrl },
  }, async () => {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'payment_requests', requestId), {
      status: 'pending',
      receiptImageUrl: receiptUrl,
      receiptImagePath: receiptPath,
      receivedBy: userId,
      receivedByName: userName || '',
      receivedAt: serverTimestamp(),
    });
    if (txId) {
      batch.update(doc(db, 'transactions_v2', txId), {
        receiptImageUrl: receiptUrl,
      });
    }
    await batch.commit();
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الإرفاق'], warnings: [] };
  }
  });
}

// ══════════════════════════════════════════
// TX APPROVAL STATE MACHINE — confirm / approve / reject
// ══════════════════════════════════════════

function _buildClientApprovalEntry(tx, stage, userId, userName) {
  return {
    txId: tx._id,
    stage, // 'confirmed' | 'approved'
    type: tx.type, category: tx.category || '',
    description: tx.description || '',
    amount: parseFloat(tx.amount) || 0,
    walletId: tx.walletId || null, walletName: tx.walletName || '',
    orderId: tx.orderId || null,
    transferRef: tx.transferRef || null,
    by: userId, byName: userName || '',
    at: new Date().toISOString(),
  };
}

/**
 * تأكيد tx (pending → confirmed). الأربع عيون: من أنشأ recovery لا يأكدها.
 */
export async function confirmTransaction({
  db = defaultDb, tx,
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!tx || !tx._id) return { ok: false, errors: ['⚠️ tx مطلوب'], warnings: [] };
  if (tx.isRecovery && tx.createdBy === userId) {
    return { ok: false, errors: ['⛔ لا يمكنك مراجعة عمليتك الخاصة (مبدأ الأربع عيون)'], warnings: [] };
  }
  return withIdempotency(db, {
    actionType: 'confirm_transaction',
    entityId: tx._id,
    actorId: userId,
    actorName: userName,
    payload: { stage: 'confirmed' },
  }, async () => {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'transactions_v2', tx._id), {
      approvalStatus: 'confirmed',
      confirmedBy: userId, confirmedByName: userName || '',
      confirmedAt: serverTimestamp(),
    });
    if (tx.paymentRequestId) {
      batch.update(doc(db, 'payment_requests', tx.paymentRequestId), {
        status: 'confirmed',
        confirmedBy: userId, confirmedByName: userName || '',
        confirmedAt: serverTimestamp(),
      });
    }
    if (tx.clientId) {
      batch.update(doc(db, 'clients', tx.clientId), {
        approvedHistory: arrayUnion(_buildClientApprovalEntry(tx, 'confirmed', userId, userName)),
        lastApprovedAt: serverTimestamp(),
        lastApprovedTxId: tx._id,
      });
    }
    await batch.commit();
    return { ok: true, errors: [], warnings: [], clientLogged: !!tx.clientId };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التأكيد'], warnings: [] };
  }
  });
}

/**
 * اعتماد نهائي (confirmed → approved + isLocked). الأربع عيون نفس confirm.
 */
export async function approveTransaction({
  db = defaultDb, tx,
  userId, userName, policy = null,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!tx || !tx._id) return { ok: false, errors: ['⚠️ tx مطلوب'], warnings: [] };
  if (tx.isRecovery && tx.createdBy === userId) {
    return { ok: false, errors: ['⛔ لا يمكنك اعتماد استردادك الخاص — admin آخر يجب أن يعتمد'], warnings: [] };
  }
  // الفصل الصارم (Segregation of Duties) — يُطبَّق فقط عند تفعيله في السياسة:
  const _sep = checkApprovalSeparation({ approvalStatus: tx.approvalStatus, confirmedBy: tx.confirmedBy }, userId, policy);
  if (!_sep.ok) return { ok: false, errors: _sep.errors, warnings: [] };
  return withIdempotency(db, {
    actionType: 'approve_transaction',
    entityId: tx._id,
    actorId: userId,
    actorName: userName,
    payload: { stage: 'approved' },
  }, async () => {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'transactions_v2', tx._id), {
      approvalStatus: 'approved',
      approvedBy: userId, approvedByName: userName || '',
      approvedAt: serverTimestamp(),
      isLocked: true,
    });
    if (tx.paymentRequestId) {
      batch.update(doc(db, 'payment_requests', tx.paymentRequestId), {
        status: 'approved',
        approvedBy: userId, approvedByName: userName || '',
        approvedAt: serverTimestamp(),
      });
    }
    if (tx.clientId) {
      batch.update(doc(db, 'clients', tx.clientId), {
        approvedHistory: arrayUnion(_buildClientApprovalEntry(tx, 'approved', userId, userName)),
        lastApprovedAt: serverTimestamp(),
        lastApprovedTxId: tx._id,
      });
    }
    await batch.commit();
    return { ok: true, errors: [], warnings: [], clientLogged: !!tx.clientId };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الاعتماد'], warnings: [] };
  }
  });
}

/**
 * رفض tx مع cascade كامل: عكس wallet + tx reversal + ledger reversal +
 * تعليم sup_payments/emp_payments محذوفة + إرجاع orders.totalPaid/costItems.paid +
 * تعليم payment_request مرفوض.
 */
export async function rejectTransaction({
  db = defaultDb, tx, paymentRequest = null,
  reason,
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!tx || !tx._id) return { ok: false, errors: ['⚠️ tx مطلوب'], warnings: [] };
  if (!reason || !reason.trim()) return { ok: false, errors: ['⚠️ السبب مطلوب'], warnings: [] };
  return withIdempotency(db, {
    actionType: 'reject_transaction',
    entityId: tx._id,
    actorId: userId,
    actorName: userName,
    payload: { reason: reason.trim() },
  }, async () => {
  try {
    let orderDoc = null;
    if (tx.orderId && (tx.category === 'refund' || tx.paymentRequestId)) {
      const oSnap = await getDoc(doc(db, 'orders', tx.orderId));
      if (oSnap.exists()) orderDoc = { ...oSnap.data(), _id: oSnap.id };
    }
    let req = paymentRequest;
    if (!req && tx.paymentRequestId) {
      const rSnap = await getDoc(doc(db, 'payment_requests', tx.paymentRequestId));
      if (rSnap.exists()) req = { ...rSnap.data(), _id: rSnap.id };
    }

    const batch = writeBatch(db);
    const isOut = tx.type === 'out';
    const reverseSign = isOut ? +1 : -1;

    batch.update(doc(db, 'transactions_v2', tx._id), {
      approvalStatus: 'rejected',
      rejectedBy: userId, rejectedByName: userName || '',
      rejectedAt: serverTimestamp(),
      rejectReason: reason.trim(),
      isReversed: true,
    });
    if (tx.walletId) {
      addWalletDeltaToBatch(batch, db, { walletId: tx.walletId, delta: reverseSign * tx.amount, event: 'reject_reversal', refId: tx._id });
    }

    const revRef = doc(collection(db, 'transactions_v2'));
    batch.set(revRef, {
      walletId: tx.walletId, walletName: tx.walletName,
      type: isOut ? 'in' : 'out', amount: tx.amount, fees: 0,
      description: `🔄 عكس رفض — ${tx.description || tx.category || ''}`,
      category: tx.category + '_reversal',
      orderId: tx.orderId || null, clientId: tx.clientId || null, clientName: tx.clientName || null,
      supplierId: tx.supplierId || null, supplierName: tx.supplierName || null,
      employeeId: tx.employeeId || null, employeeName: tx.employeeName || null,
      paymentRequestId: tx.paymentRequestId || null,
      isReversal: true, reversesTxId: tx._id,
      rejectReason: reason.trim(),
      date: _todayDate(),
      createdBy: userId, createdByName: userName || '',
      createdAt: serverTimestamp(),
      approvalStatus: 'approved', isLocked: true,
      approvedBy: userId, approvedByName: userName || '', approvedAt: serverTimestamp(),
      confirmedBy: '', confirmedByName: '', confirmedAt: null,
      rejectedBy: '', rejectedByName: '', rejectedAt: null,
    });

    const reversalEvt = (() => {
      const c = tx.category;
      if (c === 'client_payment') return 'CUSTOMER_REFUND';
      if (c === 'refund') return 'CUSTOMER_PAYMENT';
      return 'GENERAL_EXPENSE_REVERSAL';
    })();
    addLedgerToBatch(batch, db, reversalEvt, {
      amount: tx.amount, walletId: tx.walletId, walletName: tx.walletName || '',
      orderId: tx.orderId, clientId: tx.clientId, clientName: tx.clientName,
      vendorId: tx.supplierId, vendorName: tx.supplierName,
      employeeId: tx.employeeId, employeeName: tx.employeeName,
      notes: `عكس رفض: ${reason.trim()}`,
      refId: tx._id,
      userId, userName: userName || '',
    });

    if (tx.spId) {
      batch.update(doc(db, 'supplier_payments', tx.spId), {
        isVoided: true, voidedAt: serverTimestamp(), voidedBy: userId, voidReason: reason.trim(),
      });
    }
    if (tx.epId) {
      batch.update(doc(db, 'employee_payments', tx.epId), {
        isVoided: true, voidedAt: serverTimestamp(), voidedBy: userId, voidReason: reason.trim(),
      });
    }

    if (tx.orderId && orderDoc) {
      const updateData = { updatedAt: serverTimestamp() };
      if (tx.category === 'refund') {
        const payment = calcOrderPayment(orderDoc, +tx.amount);
        Object.assign(updateData, payment);
      }
      if (req?.costItemIndex !== undefined && orderDoc.costItems?.[req.costItemIndex]?.paid) {
        const items = [...(orderDoc.costItems || [])];
        const idx = req.costItemIndex;
        items[idx] = {
          ...items[idx],
          paid: false,
          paidTxId: null, paidSpId: null, paidAt: null, paidVia: null, paidTransferRef: null,
          paidByName: null, paymentRequestId: null,
          unpaidAt: new Date().toISOString(),
          unpaidReason: reason.trim(),
        };
        updateData.costItems = items;
      }
      if (Object.keys(updateData).length > 1) {
        batch.update(doc(db, 'orders', tx.orderId), updateData);
      }
    }

    if (tx.paymentRequestId) {
      batch.update(doc(db, 'payment_requests', tx.paymentRequestId), {
        status: 'rejected',
        rejectedBy: userId, rejectedByName: userName || '',
        rejectedAt: serverTimestamp(),
        rejectReason: reason.trim(),
        isReversed: true,
      });
    }

    await batch.commit();
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الرفض'], warnings: [] };
  }
  });
}

// ══════════════════════════════════════════
// WALLET RECOVERY ADJUSTMENT
// ══════════════════════════════════════════

/**
 * ضبط رصيد محفظة من approvals.html — مشابه لـ walletActions.saveReconciliation
 * لكن يضع isRecovery=true (مبدأ الأربع عيون نشط) + reconciliation type مختلف.
 */
export async function recoveryAdjustment({
  db = defaultDb,
  walletId, walletName,
  currentBalance, targetBalance,
  reason,
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!walletId) return { ok: false, errors: ['⚠️ walletId مطلوب'], warnings: [] };
  const cur = parseFloat(currentBalance) || 0;
  const target = parseFloat(targetBalance);
  if (isNaN(target)) return { ok: false, errors: ['⚠️ أدخل الرصيد الفعلي'], warnings: [] };
  if (!reason || !reason.trim()) return { ok: false, errors: ['⚠️ أدخل السبب'], warnings: [] };
  const diff = target - cur;
  if (Math.abs(diff) < 0.01) return { ok: false, errors: ['ℹ️ لا فرق — لا حاجة للضبط'], warnings: [] };
  return withIdempotency(db, {
    actionType: 'recovery_adjustment',
    entityId: walletId,
    actorId: userId,
    actorName: userName,
    payload: { target, reason: reason.trim() },
  }, async () => {
  try {
    const batch = writeBatch(db);
    setWalletBalanceInBatch(batch, db, { walletId, target, event: 'recovery_adjustment' });
    const txRef = doc(collection(db, 'transactions_v2'));
    const isIn = diff > 0;
    batch.set(txRef, {
      walletId, walletName,
      type: isIn ? 'in' : 'out', amount: Math.abs(diff), fees: 0,
      description: `⚖️ ضبط رصيد — ${reason.trim()}`,
      category: 'adjustment',
      isAdjustment: true, isRecovery: true,
      adjustReason: reason.trim(),
      adjustFrom: cur, adjustTo: target,
      date: _todayDate(),
      createdBy: userId, createdByName: userName || '',
      createdAt: serverTimestamp(),
      ...approvalFields(),
    });
    addLedgerToBatch(batch, db, FE.WALLET_ADJUSTMENT, {
      amount: Math.abs(diff), walletId, walletName,
      direction: isIn ? 'in' : 'out',
      notes: `ضبط رصيد: ${cur} → ${target} (${diff >= 0 ? '+' : ''}${diff.toFixed(2)}) — ${reason.trim()}`,
      userId, userName: userName || '',
    });
    const recRef = doc(collection(db, 'reconciliations'));
    batch.set(recRef, {
      walletId, walletName,
      type: 'adjustment_from_approvals',
      sysBal: cur, actualBal: target, diff,
      note: reason.trim(),
      date: _todayDate(),
      createdBy: userId, createdByName: userName || '',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return { ok: true, errors: [], warnings: [], diff };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الضبط'], warnings: [] };
  }
  });
}

// ══════════════════════════════════════════
// APPROVAL ESCALATION NOTIFICATION (P4)
// ══════════════════════════════════════════

/**
 * يُخطر الأدمن أن دفعة تجاوزت حدّ السياسة وتنتظر اعتماده (تصعيد).
 * dedupe عبر استعلام الإشعارات (refPaymentRequestId) — لا يُكرّر لنفس الطلب،
 * ولا يلمس قاعدة payment_requests. غير مالي (لا idempotency reservation).
 *
 * @param {Object} request — payment_request doc (with _id, amount, ...)
 */
export async function notifyApprovalEscalation({
  db = defaultDb, request, userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!request || !request._id) return { ok: false, errors: ['⚠️ request مطلوب'], warnings: [] };
  const r = request;
  try {
    // dedupe (best-effort): لو سبق إخطار لنفس الطلب → لا تُكرّر. فشل القراءة
    // (صلاحية) لا يُجهض الإخطار — أسوأ حالة تكرار إشعار، غير ضار.
    try {
      const prior = await getDocs(query(
        collection(db, 'notifications'),
        where('refPaymentRequestId', '==', r._id),
        limit(10),
      ));
      if (prior.docs.some(d => d.data().type === 'approval_escalation')) {
        return { ok: true, errors: [], warnings: [], alreadyNotified: true, notified: 0 };
      }
    } catch (_) { /* skip dedupe on read-denied */ }
    const admins = await getDocs(query(
      collection(db, 'users'), where('role', '==', 'admin'), limit(20),
    ));
    const amount = parseFloat(r.amount) || 0;
    const who = r.supplierName || r.employeeName || r.clientName || 'مصروف عام';
    const batch = writeBatch(db);
    let count = 0;
    admins.forEach(d => {
      if (d.id === userId) return; // لا تُخطر المُنفّذ نفسه لو كان admin
      const notRef = doc(collection(db, 'notifications'));
      batch.set(notRef, {
        toUid: d.id, toName: d.data().name || '',
        type: 'approval_escalation',
        severity: 'high',
        title: '🔒 دفعة كبيرة تنتظر اعتمادك',
        message: `${amount.toLocaleString('ar-EG')} ج — ${who}\nتجاوزت حدّ السياسة وتحتاج موافقة أدمن قبل التنفيذ.`,
        refPaymentRequestId: r._id,
        refOrderId: r.orderId || null,
        createdBy: userId, createdByName: userName || '',
        createdAt: serverTimestamp(),
        seenAt: null,
      });
      count++;
    });
    if (count === 0) return { ok: true, errors: [], warnings: ['لا يوجد أدمن لإخطاره'], notified: 0 };
    await batch.commit();
    return { ok: true, errors: [], warnings: [], notified: count };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل إخطار التصعيد'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════

export const approvalActions = {
  createPaymentRequest,
  executePaymentRequest,
  rejectPaymentRequest,
  approvePaymentRequest,
  attachReceiptToRequest,
  confirmTransaction,
  approveTransaction,
  rejectTransaction,
  recoveryAdjustment,
  notifyApprovalEscalation,
};

export default approvalActions;

if (typeof window !== 'undefined') {
  window.approvalActions = approvalActions;
}
