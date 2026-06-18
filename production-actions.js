/**
 * Business2Card ERP — production-actions.js
 *
 * ━━━ PRODUCTION ACTIONS LAYER (Phase-0 production decomp) ━━━
 *
 * Actions specific to the production page:
 *   - requestSupplierPayment   — create payment_request + mark cost item pending
 *   - adminDeletePaidCostItem  — admin-only: cascade-delete a paid cost item
 *                                 (wallet reversal + supplier_payment void +
 *                                  supplier_order delete + payment_request reject +
 *                                  notifications)
 *
 * All operations are wrapped in atomic writeBatch (RULE 3) + idempotency (H1.2)
 * + ledger entries via addLedgerToBatch (RULE G6).
 *
 * Each action returns: { ok, errors[], warnings[], ... }
 */

import {
  doc, collection, getDoc, addDoc, updateDoc, writeBatch,
  serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db as defaultDb } from './core/firebase-init.js';
import { addLedgerToBatch, FE } from './financial-sync-engine.js';
import { withIdempotency } from './core/idempotency.js';
import { nowStr, auditEntry } from './core/audit.js';

const ALLOWED_REQUESTERS = ['admin', 'operation_manager', 'production_agent'];

/**
 * Create a supplier payment request from a cost item.
 * Marks the cost item as `pendingPaymentRequestId` so UI shows "pending" state.
 *
 * @param {Object} args
 * @param {Object} [args.db=defaultDb]
 * @param {string} args.orderId
 * @param {number} args.costItemIdx
 * @param {Object} args.order            — full order (for snapshot data)
 * @param {string} args.role             — requester role (must be admin/ops_manager/production_agent)
 * @param {string} args.userId
 * @param {string} args.userName
 *
 * @returns {{ok, errors, warnings, paymentRequestId?, idempotent?}}
 */
export async function requestSupplierPayment({
  db = defaultDb,
  orderId, costItemIdx, order,
  role, userId, userName,
}) {
  if (!orderId)  return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
  if (!userId)   return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!order)    return { ok: false, errors: ['الأوردر غير موجود'], warnings: [] };
  if (!ALLOWED_REQUESTERS.includes(role)) {
    return { ok: false, errors: ['⛔ ليس لديك صلاحية إنشاء طلب دفع'], warnings: [] };
  }
  const item = (order.costItems || [])[costItemIdx];
  if (!item) return { ok: false, errors: ['البند غير موجود'], warnings: [] };
  if (item.paid) return { ok: false, errors: ['⛔ هذا البند مدفوع بالفعل'], warnings: [] };
  if (item.paymentRequestId) return { ok: false, errors: ['⛔ يوجد طلب دفع مُرسَل بالفعل لهذا البند'], warnings: [] };
  if (!item.supplierId) return { ok: false, errors: ['⚠️ لا يمكن طلب دفع لبند بدون مورد محدد'], warnings: [] };
  const amount = parseFloat(item.total) || 0;
  if (!(amount > 0)) return { ok: false, errors: ['⚠️ قيمة البند غير صالحة'], warnings: [] };

  return withIdempotency(db, {
    actionType: 'request_supplier_payment',
    entityId: `${orderId}|${costItemIdx}`,
    actorId: userId,
    actorName: userName,
    payload: { amount, supplierId: item.supplierId },
  }, async () => {
    try {
      const reqRef = doc(collection(db, 'payment_requests'));
      const reqData = {
        type: 'supplier_payment',
        status: 'requested',
        amount,
        reason: `سداد بند تكلفة: ${item.type || '—'}${item.note ? ' — ' + item.note : ''} · ${order.clientName || ''}`,
        supplierId: item.supplierId,
        supplierName: item.supplierName || '',
        orderId,
        orderRefId: order.orderId || '',
        clientId: order.clientId || '',
        clientName: order.clientName || '',
        orderStage: order.stage || '',
        orderProducts: (order.products || []).map(p => ({ name: p.name || '', qty: p.qty || 1 })),
        orderCostItems: (order.costItems || []).map(c => ({ type: c.type || '', total: parseFloat(c.total) || 0, supplierName: c.supplierName || '' })),
        orderTotalCost: (order.costItems || []).reduce((s, c) => s + (parseFloat(c.total) || 0), 0),
        costItemIndex: costItemIdx,
        requestedBy: userId,
        requestedByName: userName || '',
        requesterRole: role,
        requestedAt: serverTimestamp(),
        source: 'production_quick_request',
      };
      const batch = writeBatch(db);
      batch.set(reqRef, reqData);

      const ci = [...(order.costItems || [])];
      ci[costItemIdx] = {
        ...ci[costItemIdx],
        pendingPaymentRequestId: reqRef.id,
        pendingRequestedAt: nowStr(),
        pendingRequestedBy: userName || '',
      };
      batch.update(doc(db, 'orders', orderId), {
        costItems: ci,
        timeline: [
          ...(order.timeline || []),
          auditEntry({
            action: `💸 طلب دفع: ${item.type || ''} — ${amount} ج → ${item.supplierName || ''}`,
            userId, userName,
            kind: 'op',
            meta: { paymentRequestId: reqRef.id, costItemIndex: costItemIdx, amount },
          }),
        ],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { ok: true, errors: [], warnings: [], paymentRequestId: reqRef.id };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الإرسال'], warnings: [] };
    }
  });
}

/**
 * Admin-only: cascade-delete a PAID cost item from an order.
 *
 * Flow (atomic batch + idempotent):
 *   1. Remove the item from order.costItems
 *   2. Refund wallet (item.total → wallet)
 *   3. Create reversal tx (isReversal:true, approved:auto)
 *   4. Ledger entry (FE.GENERAL_EXPENSE_REVERSAL)
 *   5. Void linked supplier_payments doc
 *   6. Mark linked supplier_orders doc as isDeleted
 *   7. Reject linked payment_requests doc
 *   8. Notify the requester + (optionally) the supplier user
 *
 * @returns {{ok, errors, warnings, refundedAmount?, idempotent?}}
 */
export async function adminDeletePaidCostItem({
  db = defaultDb,
  orderId, costItemIdx, order, reason,
  role, userId, userName,
}) {
  if (!['admin', 'operation_manager'].includes(role)) {
    return { ok: false, errors: ['⛔ هذا البند مدفوع بالفعل — أدمن فقط يقدر يحذف/يعدل'], warnings: [] };
  }
  if (!orderId) return { ok: false, errors: ['⚠️ orderId مطلوب'], warnings: [] };
  if (!userId)  return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!order)   return { ok: false, errors: ['الأوردر غير موجود'], warnings: [] };
  if (!reason || !reason.trim()) {
    return { ok: false, errors: ['⚠️ سبب الحذف مطلوب'], warnings: [] };
  }
  const item = (order.costItems || [])[costItemIdx];
  if (!item) return { ok: false, errors: ['البند غير موجود'], warnings: [] };
  if (!item.paid) return { ok: false, errors: ['البند غير مدفوع — استخدم الحذف العادي'], warnings: [] };

  const reasonTrim = reason.trim();
  const amount = parseFloat(item.total) || 0;

  return withIdempotency(db, {
    actionType: 'admin_delete_paid_cost_item',
    entityId: `${orderId}|${costItemIdx}`,
    actorId: userId,
    actorName: userName,
    payload: { amount, reason: reasonTrim },
  }, async () => {
    try {
      const batch = writeBatch(db);

      // 1) Remove from costItems
      const ci = [...(order.costItems || [])];
      ci.splice(costItemIdx, 1);
      batch.update(doc(db, 'orders', orderId), {
        costItems: ci,
        timeline: [
          ...(order.timeline || []),
          auditEntry({
            action: `🗑️ [أدمن] حذف بند تكلفة مدفوع: ${item.type || ''} — ${amount} ج · سبب: ${reasonTrim}`,
            userId, userName,
            kind: 'reversal',
            meta: {
              costItemIndex: costItemIdx, amount,
              supplierId: item.supplierId || '',
              reason: reasonTrim,
              paidTxId: item.paidTxId || '',
              paidSpId: item.paidSpId || '',
            },
          }),
        ],
        updatedAt: serverTimestamp(),
      });

      // 2-4) Wallet reversal + tx + ledger
      if (item.paidTxId && item.walletId) {
        batch.update(doc(db, 'wallets', item.walletId), { balance: increment(amount) });
        const revRef = doc(collection(db, 'transactions_v2'));
        batch.set(revRef, {
          walletId: item.walletId, walletName: item.walletName || '',
          type: 'in', amount, fees: 0,
          description: `🔄 إلغاء بند تكلفة (admin) — ${item.type || ''}${item.supplierName ? ' — ' + item.supplierName : ''}`,
          category: 'expense_reversal',
          orderId, supplierId: item.supplierId || null, supplierName: item.supplierName || null,
          isReversal: true, reversesTxId: item.paidTxId,
          reversedBy: userId, reversedByName: userName || '',
          reversedReason: reasonTrim,
          date: new Date().toLocaleDateString('ar-EG'),
          createdBy: userId, createdByName: userName || '',
          createdAt: serverTimestamp(),
          approvalStatus: 'approved', isLocked: true,
          approvedBy: userId, approvedByName: userName || '',
          approvedAt: serverTimestamp(),
          confirmedBy: '', confirmedByName: '', confirmedAt: null,
          rejectedBy: '', rejectedByName: '', rejectedAt: null, rejectReason: '',
        });
        addLedgerToBatch(batch, db, FE.GENERAL_EXPENSE_REVERSAL, {
          amount,
          walletId: item.walletId, walletName: item.walletName || '',
          orderId, vendorId: item.supplierId, vendorName: item.supplierName,
          notes: `إلغاء بند تكلفة (admin): ${reasonTrim}`,
          refId: item.paidTxId,
          userId, userName: userName || '',
        });
      }

      // 5) Void supplier_payment
      if (item.paidSpId) {
        batch.update(doc(db, 'supplier_payments', item.paidSpId), {
          isVoided: true, voidedAt: serverTimestamp(), voidedBy: userId,
          voidReason: `حذف بند تكلفة: ${reasonTrim}`,
        });
      }

      // 6) Mark supplier_order as deleted
      if (item.supplierOrderId) {
        batch.update(doc(db, 'supplier_orders', item.supplierOrderId), {
          isDeleted: true, voidedAt: serverTimestamp(), voidedBy: userId,
          voidReason: `حذف بند (admin): ${reasonTrim}`,
        });
      }

      // 7) Reject payment_request
      if (item.paymentRequestId) {
        batch.update(doc(db, 'payment_requests', item.paymentRequestId), {
          status: 'rejected', isReversed: true,
          rejectedBy: userId, rejectedByName: userName || '',
          rejectedAt: serverTimestamp(),
          rejectReason: `حذف بند تكلفة (admin): ${reasonTrim}`,
        });
      }

      // 8) Notify requester + supplier (best-effort)
      if (item.paymentRequestId) {
        try {
          const rSnap = await getDoc(doc(db, 'payment_requests', item.paymentRequestId));
          if (rSnap.exists()) {
            const toUid = rSnap.data().requestedBy;
            const toName = rSnap.data().requestedByName;
            if (toUid) {
              const notRef = doc(collection(db, 'notifications'));
              batch.set(notRef, {
                toUid, toName,
                type: 'cost_item_deleted_paid',
                severity: 'high',
                title: '⚠️ حُذف بند تكلفة كنت قد طلبت دفعه',
                message: `${item.type || 'بند'} — ${amount} ج — المورد: ${item.supplierName || '—'}\nالأوردر: ${order.orderId || orderId.slice(-8)}\nالسبب: ${reasonTrim}`,
                refOrderId: orderId, refOrderRefId: order.orderId || '',
                refSupplierId: item.supplierId || null, refSupplierName: item.supplierName || null,
                refPaymentRequestId: item.paymentRequestId || null,
                createdBy: userId, createdByName: userName || '',
                createdAt: serverTimestamp(),
                seenAt: null,
              });
            }
          }
        } catch (notifErr) {
          console.warn('[productionActions.deletePaidCostItem] wallet_manager notification failed:', notifErr?.message);
        }
      }
      if (item.supplierId) {
        try {
          const sSnap = await getDoc(doc(db, 'suppliers_v2', item.supplierId));
          const sData = sSnap.exists() ? sSnap.data() : null;
          if (sData?.authUid) {
            const notRef2 = doc(collection(db, 'notifications'));
            batch.set(notRef2, {
              toUid: sData.authUid, toName: sData.name,
              type: 'cost_item_deleted_paid_supplier',
              severity: 'high',
              title: '⚠️ أُلغيَت دفعة كانت لك',
              message: `${item.type || 'بند'} — ${amount} ج\nالأوردر: ${order.orderId || orderId.slice(-8)}\nالسبب: ${reasonTrim}\nيرجى التواصل مع الإدارة.`,
              refOrderId: orderId, refOrderRefId: order.orderId || '',
              refSupplierId: item.supplierId, refSupplierName: item.supplierName,
              createdBy: userId, createdByName: userName || '',
              createdAt: serverTimestamp(),
              seenAt: null,
            });
          }
        } catch (notifErr) {
          console.warn('[productionActions.deletePaidCostItem] supplier notification failed:', notifErr?.message);
        }
      }

      await batch.commit();
      return { ok: true, errors: [], warnings: [], refundedAmount: amount };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [] };
    }
  });
}

export const productionActions = {
  requestSupplierPayment,
  adminDeletePaidCostItem,
};

export default productionActions;
