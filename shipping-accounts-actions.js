/**
 * Business2Card ERP — shipping-accounts-actions.js
 *
 * ━━━ EXTRACTED ACTIONS FROM shipping-accounts.html (H1.1 compliance) ━━━
 *
 * All Firestore write operations that were inline in shipping-accounts.html
 * are now centralised here. The HTML page calls these actions and handles
 * only UI feedback (toasts, DOM updates).
 *
 * Each action returns { ok, errors, warnings } per H1.5 contract.
 *
 * Extracted operations:
 *   - processFullReturn          : full-order return with settlement/deposit/collection reversal
 *   - processPartialReturn       : partial return (by product) with optional wallet refund
 *   - healSingleOrder            : self-heal one order (fix drift flags)
 *   - healOrdersBulk             : self-heal multiple orders in chunked batches
 *   - markOrderManualSettled     : flag an order as manually settled (no wallet movement)
 *   - saveShippingFeeEdit        : edit shipCost / customerShipFee with ledger delta
 */

import {
  doc, getDoc, getDocs, writeBatch, increment,
  serverTimestamp, collection, query, where,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  addLedgerToBatch, FE, approvalFields,
} from "./financial-sync-engine.js";

import {
  detectOrderIssues, applyOrderHealPatch,
} from "./orders.js";

import { withIdempotency } from "./core/idempotency.js";

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

/** Simple date string — mirrors the inline nowStr() usage. */
function _nowStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

// ══════════════════════════════════════════
// 1. processFullReturn
// ══════════════════════════════════════════

/**
 * Full-order return: creates shipping_returns record, updates order,
 * reverses settlement (if settled), reverses deposit, reverses all
 * collection transactions, and records return shipping cost.
 *
 * All operations are atomic (single writeBatch) and idempotency-guarded.
 *
 * @param {object} params
 * @param {object} params.db               - Firestore instance
 * @param {object} params.order            - Full order object (with _id)
 * @param {string} params.companyName      - Shipping company name
 * @param {string} params.reason           - Return reason key
 * @param {string} params.reasonLabel      - Return reason display label
 * @param {string} params.lossParty        - Who bears the loss: 'client'|'company'|'shipper'
 * @param {number} params.cost             - Return shipping cost
 * @param {string} params.note             - Additional note
 * @param {string} params.userId           - Current user UID
 * @param {string} params.userName         - Current user display name
 * @param {Array}  params.wallets          - Array of wallet objects [{_id, name, balance, ...}]
 * @returns {{ ok: boolean, errors: string[], warnings: string[], idempotent?: boolean }}
 */
export async function processFullReturn({
  db, order, companyName,
  reason, reasonLabel, lossParty, cost, note,
  userId, userName, wallets = [],
}) {
  const ordId = order?._id;
  if (!db || !ordId) return { ok: false, errors: ['بيانات ناقصة (db أو orderId)'], warnings: [] };

  const now = _nowStr();
  const byName = userName || '';

  try {
    // pre-fetch: walletId for deposit reversal (must read before write)
    // subtract settlement amount because it is reversed separately in step 3
    const settledAmt = parseFloat(order.shipSettledAmount) || 0;
    const depAmt = Math.max(0, (parseFloat(order.totalPaid) || parseFloat(order.deposit) || 0) - settledAmt);
    let depWalletId = order.depositWalletId || order.walletId || '';
    if (!depWalletId && depAmt > 0) {
      const depSnap = await getDocs(query(collection(db, 'transactions_v2'), where('orderId', '==', ordId), where('category', '==', 'deposit')));
      depWalletId = depSnap.docs[0]?.data()?.walletId || '';
    }

    // pre-fetch: collection + collection_adjustment transactions to reverse from wallets
    const colSnap = await getDocs(query(collection(db, 'transactions_v2'), where('orderId', '==', ordId), where('category', '==', 'collection')));
    const adjSnap = await getDocs(query(collection(db, 'transactions_v2'), where('orderId', '==', ordId), where('category', '==', 'collection_adjustment')));
    const colTxDocs = [...colSnap.docs, ...adjSnap.docs];

    // H1.2: wrapped in withIdempotency to prevent double-spend on double-click
    const __idemRes = await withIdempotency(db, {
      actionType: 'shipacc_return_full',
      entityId: ordId,
      actorId: userId || '',
      payload: { settledAmt, depAmt, cost: Number(cost) || 0 },
    }, async () => {
      const batch = writeBatch(db);

      // 1. Return record
      const retRef = doc(collection(db, 'shipping_returns'));
      const fullNote = [reasonLabel, note].filter(Boolean).join(' — ');
      batch.set(retRef, {
        orderId: ordId, companyName,
        clientName: order.clientName || '', cost, note: fullNote,
        reason, reasonLabel, lossParty, returnType: 'full',
        status: 'returned', date: now,
        createdBy: userId, createdByName: byName,
        createdAt: serverTimestamp()
      });

      // 2. Update order
      const lossLabel = lossParty === 'client' ? 'العميل' : lossParty === 'company' ? 'الشركة' : 'شركة الشحن';
      batch.update(doc(db, 'orders', ordId), {
        shipStage: 'returned',
        totalPaid: 0, deposit: 0, remaining: 0, paymentStatus: 'returned',
        ...(order.shipSettled ? { shipSettled: false, shipSettledAmount: 0, shipSettledManual: false } : {}),
        timeline: [...(order.timeline || []), { date: now, action: `↩️ مرتجع من ${companyName} — ${reasonLabel} — يتحمل: ${lossLabel}${note ? ' — ' + note : ''}`, by: byName }],
        updatedAt: serverTimestamp()
      });

      // 3. Reverse settlement if it was settled (wallet + transaction + ledger)
      if (order.shipSettled && settledAmt > 0 && !order.shipSettledManual) {
        const settledWId = order.shipSettledWalletId || '';
        if (settledWId) {
          batch.update(doc(db, 'wallets', settledWId), { balance: increment(-settledAmt) });
        }
        batch.set(doc(collection(db, 'transactions_v2')), {
          type: 'out', amount: settledAmt,
          description: `↩️ عكس تسوية مرتجع — ${order.clientName || ''} — ${order.orderId || ''}`,
          category: 'settlement_reversal', orderId: ordId,
          clientName: order.clientName, shipCompanyName: companyName,
          walletId: settledWId,
          date: now, createdBy: userId, createdByName: byName,
          createdAt: serverTimestamp()
        });
        addLedgerToBatch(batch, db, FE.SHIPPING_SETTLEMENT_REVERSAL, {
          amount: settledAmt, walletId: settledWId,
          walletName: wallets.find(w => w._id === settledWId)?.name || '',
          notes: `عكس تسوية مرتجع — ${order.clientName || ''} — ${companyName}`,
          orderId: ordId, clientName: order.clientName || '',
          userId, userName: byName
        });
      } else if (order.shipSettled && order.shipSettledManual && settledAmt > 0) {
        // Manual settlement (did not go through wallet) — ledger entry for flag-only reversal
        addLedgerToBatch(batch, db, FE.SHIPPING_SETTLEMENT_REVERSAL, {
          amount: settledAmt, walletId: '', walletName: '',
          notes: `عكس تسوية يدوية (manual) لمرتجع — ${order.clientName || ''} — ${companyName}`,
          orderId: ordId, clientName: order.clientName || '',
          vendorId: '', vendorName: companyName || '',
          userId, userName: byName
        });
      }

      // 4. Reverse deposit + deduct from wallet
      if (depAmt > 0 && depWalletId) {
        batch.update(doc(db, 'wallets', depWalletId), { balance: increment(-depAmt) });
        batch.set(doc(collection(db, 'transactions_v2')), {
          type: 'out', amount: depAmt,
          description: `استرداد عربون مرتجع — ${order.clientName || ''}`,
          category: 'deposit_reversal', orderId: ordId,
          clientName: order.clientName, walletId: depWalletId,
          date: now, createdBy: userId, createdByName: byName,
          createdAt: serverTimestamp()
        });
        addLedgerToBatch(batch, db, FE.CUSTOMER_REFUND, {
          amount: depAmt, walletId: depWalletId,
          walletName: wallets.find(w => w._id === depWalletId)?.name || '',
          notes: `استرداد عربون مرتجع — ${order.clientName || ''} — ${companyName}`,
          orderId: ordId, clientName: order.clientName || '',
          userId, userName: byName
        });
      }

      // 4b. Reverse collections + adjustments (type-aware so downward adjustments reverse correctly)
      colTxDocs.forEach(tx => {
        const d = tx.data(); const amt = parseFloat(d.amount) || 0; const wid = d.walletId;
        if (amt > 0 && wid) {
          const isIn = d.type === 'in';
          batch.update(doc(db, 'wallets', wid), { balance: increment(isIn ? -amt : amt) });
          const rRef = doc(collection(db, 'transactions_v2'));
          batch.set(rRef, {
            type: isIn ? 'out' : 'in', amount: amt,
            description: `↩️ عكس ${d.category === 'collection_adjustment' ? 'تعديل تحصيل' : 'تحصيل'} مرتجع — ${order.clientName || ''} — ${order.orderId || ''}`,
            category: 'collection_reversal', orderId: ordId,
            clientName: order.clientName || '',
            walletId: wid, walletName: d.walletName || '',
            isReversal: true, reversesTxId: tx.id,
            date: now, createdBy: userId, createdByName: byName,
            createdAt: serverTimestamp(),
            ...approvalFields()
          });
          // FIX (RULE 5): every reversal must also be reflected in financial_ledger
          addLedgerToBatch(batch, db, isIn ? FE.CUSTOMER_REFUND : FE.CUSTOMER_PAYMENT, {
            amount: amt, walletId: wid, walletName: d.walletName || '',
            orderId: ordId, clientName: order.clientName || '',
            notes: `عكس ${d.category || 'collection'} (مرتجع) — ${order.clientName || ''} — ${companyName}`,
            userId, userName: byName,
          });
        }
      });

      // 5. Return shipping cost
      if (cost > 0) {
        batch.set(doc(collection(db, 'transactions_v2')), {
          type: 'out', amount: cost,
          description: `تكلفة مرتجع — ${order.clientName || ''} — ${companyName}`,
          category: 'return_cost', orderId: ordId, clientName: order.clientName,
          date: now, createdBy: userId, createdByName: byName,
          createdAt: serverTimestamp()
        });
        addLedgerToBatch(batch, db, FE.RETURN_LOSS, {
          amount: cost,
          notes: `تكلفة مرتجع — ${order.clientName || ''} — ${companyName}`,
          orderId: ordId, clientName: order.clientName || '',
          userId, userName: byName
        });
      }

      await batch.commit();
      return { ok: true };
    }); // end withIdempotency

    if (__idemRes && __idemRes.idempotent) {
      return { ok: true, errors: [], warnings: [], idempotent: true };
    }
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل تسجيل المرتجع'], warnings: [] };
  }
}


// ══════════════════════════════════════════
// 2. processPartialReturn
// ══════════════════════════════════════════

/**
 * Partial return at product level: the customer returns some products,
 * the rest of the order stays active. Creates shipping_returns record,
 * updates order products/prices, optionally refunds to a wallet.
 *
 * @param {object} params
 * @param {object} params.db               - Firestore instance
 * @param {object} params.order            - Full order object (with _id)
 * @param {string} params.companyName      - Shipping company name
 * @param {string} params.reason           - Return reason key
 * @param {string} params.reasonLabel      - Return reason display label
 * @param {string} params.lossParty        - Who bears the loss
 * @param {number} params.cost             - Return shipping cost
 * @param {string} params.note             - Additional note
 * @param {Array}  params.returnedItems    - [{prodIdx, name, productId, unitPrice, returnedQty, lineTotal}]
 * @param {Array}  params.newProducts      - Updated products array after removing returned items
 * @param {number} params.refundAmount     - Total value of returned products
 * @param {number} params.newSale          - New salePrice after return
 * @param {number} params.newPaid          - New totalPaid after refund
 * @param {number} params.newRem           - New remaining amount
 * @param {number} params.refundFromWallet - Amount to refund from wallet
 * @param {string} params.refWalletId      - Wallet ID for refund
 * @param {object} params.refWallet        - Wallet object {_id, name, balance, ...}
 * @param {string} params.userId           - Current user UID
 * @param {string} params.userName         - Current user display name
 * @returns {{ ok: boolean, errors: string[], warnings: string[], idempotent?: boolean }}
 */
export async function processPartialReturn({
  db, order, companyName,
  reason, reasonLabel, lossParty, cost, note,
  returnedItems, newProducts,
  refundAmount, newSale, newPaid, newRem,
  refundFromWallet, refWalletId, refWallet,
  userId, userName,
}) {
  const ordId = order?._id;
  if (!db || !ordId) return { ok: false, errors: ['بيانات ناقصة (db أو orderId)'], warnings: [] };

  const now = _nowStr();
  const byName = userName || '';
  const refBb = parseFloat(refWallet?.balance) || 0;

  try {
    // H1.2: wrapped in withIdempotency to prevent double-spend on double-click
    const __idemRes = await withIdempotency(db, {
      actionType: 'shipacc_return_partial',
      entityId: ordId,
      actorId: userId || '',
      payload: { refundAmount, refundFromWallet, cost: Number(cost) || 0, items: returnedItems.length },
    }, async () => {
      const batch = writeBatch(db);

      // 1. shipping_returns
      const retRef = doc(collection(db, 'shipping_returns'));
      const fullNote = [reasonLabel, note].filter(Boolean).join(' — ');
      batch.set(retRef, {
        orderId: ordId, companyName: order.shipCompanyName || companyName || '',
        clientName: order.clientName || '', cost, note: fullNote,
        reason, reasonLabel, lossParty,
        returnType: 'partial',
        returnedItems,
        refundAmount, refundFromWallet,
        walletId: refWalletId || '',
        status: 'returned', date: now,
        createdBy: userId, createdByName: byName,
        createdAt: serverTimestamp()
      });

      // 2. Update order — stays active (not shipStage='returned')
      const lossLabel = lossParty === 'client' ? 'العميل' : lossParty === 'company' ? 'الشركة' : 'شركة الشحن';
      batch.update(doc(db, 'orders', ordId), {
        products: newProducts,
        salePrice: newSale,
        totalPaid: newPaid,
        remaining: newRem,
        paymentStatus: newRem <= 0 ? (newPaid > 0 ? 'paid' : 'pending') : newPaid > 0 ? 'partial' : 'pending',
        timeline: [...(order.timeline || []), {
          date: now,
          action: `↩️ مرتجع جزئي (${returnedItems.length} منتج · ${_fmtNum(refundAmount)} ج) — ${reasonLabel} — ${lossLabel}${note ? ' — ' + note : ''}`,
          by: byName,
        }],
        updatedAt: serverTimestamp(),
      });

      // 3. wallet refund (if there are funds to refund)
      if (refundFromWallet > 0 && refWallet) {
        batch.update(doc(db, 'wallets', refWalletId), { balance: increment(-refundFromWallet) });
        batch.set(doc(collection(db, 'transactions_v2')), {
          walletId: refWalletId, walletName: refWallet.name || '',
          type: 'out', amount: refundFromWallet,
          description: `↩️ استرداد مرتجع جزئي — ${order.clientName || ''} — ${order.orderId || ''}`,
          category: 'partial_return_refund',
          orderId: ordId, clientName: order.clientName || '',
          balanceBefore: refBb, balanceAfter: refBb - refundFromWallet,
          date: now, createdBy: userId, createdByName: byName,
          createdAt: serverTimestamp(),
          ...approvalFields()
        });
        addLedgerToBatch(batch, db, FE.CUSTOMER_REFUND, {
          amount: refundFromWallet,
          walletId: refWalletId, walletName: refWallet.name || '',
          orderId: ordId, clientId: order.clientId || '', clientName: order.clientName || '',
          notes: `استرداد مرتجع جزئي — ${returnedItems.length} منتج (${_fmtNum(refundAmount)} ج)`,
          userId, userName: byName,
        });
      }

      // 4. Return shipping cost (unrelated to client refund)
      if (cost > 0) {
        batch.set(doc(collection(db, 'transactions_v2')), {
          type: 'out', amount: cost,
          description: `تكلفة مرتجع جزئي — ${order.clientName || ''}`,
          category: 'partial_return_cost', orderId: ordId, clientName: order.clientName || '',
          date: now, createdBy: userId, createdByName: byName,
          createdAt: serverTimestamp()
        });
        addLedgerToBatch(batch, db, FE.RETURN_LOSS, {
          amount: cost, walletId: '', walletName: '',
          orderId: ordId, clientName: order.clientName || '',
          notes: `تكلفة مرتجع جزئي — ${returnedItems.length} منتج`,
          userId, userName: byName,
        });
      }

      await batch.commit();
      return { ok: true };
    }); // end withIdempotency

    if (__idemRes && __idemRes.idempotent) {
      return { ok: true, errors: [], warnings: [], idempotent: true };
    }
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل المرتجع الجزئي'], warnings: [] };
  }
}


// ══════════════════════════════════════════
// 3. healSingleOrder
// ══════════════════════════════════════════

/**
 * Self-heal a single order: detect drift issues and apply fixes atomically.
 *
 * @param {object} params
 * @param {object} params.db       - Firestore instance
 * @param {object} params.order    - Full order object (with _id)
 * @param {string} params.userName - Current user display name
 * @returns {{ ok: boolean, errors: string[], warnings: string[], issueCount: number }}
 */
export async function healSingleOrder({ db, order, userName }) {
  if (!db || !order?._id) return { ok: false, errors: ['بيانات ناقصة'], warnings: [], issueCount: 0 };

  const issues = detectOrderIssues(order);
  if (!issues.length) return { ok: true, errors: [], warnings: [], issueCount: 0 };

  try {
    const batch = writeBatch(db);
    applyOrderHealPatch(batch, doc(db, 'orders', order._id), order, issues, userName);
    await batch.commit();
    return { ok: true, errors: [], warnings: [], issueCount: issues.length };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الإصلاح'], warnings: [], issueCount: 0 };
  }
}


// ══════════════════════════════════════════
// 4. healOrdersBulk
// ══════════════════════════════════════════

/**
 * Self-heal multiple orders in chunked batches (max 400 per batch to stay
 * under the Firestore 500-write limit).
 *
 * @param {object} params
 * @param {object} params.db        - Firestore instance
 * @param {Array}  params.orders    - Array of order objects (with _id)
 * @param {string} params.userName  - Current user display name
 * @returns {{ ok: boolean, errors: string[], warnings: string[], totalIssues: number, healedOrders: number }}
 */
export async function healOrdersBulk({ db, orders, userName }) {
  if (!db || !orders?.length) return { ok: false, errors: ['لا توجد أوردرات'], warnings: [], totalIssues: 0, healedOrders: 0 };

  const candidates = orders.map(o => ({ o, issues: detectOrderIssues(o) })).filter(x => x.issues.length);
  if (!candidates.length) return { ok: true, errors: [], warnings: [], totalIssues: 0, healedOrders: 0 };

  const totalIssues = candidates.reduce((s, x) => s + x.issues.length, 0);

  try {
    const CHUNK = 400;
    let done = 0;
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const slice = candidates.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      slice.forEach(({ o, issues }) => {
        applyOrderHealPatch(batch, doc(db, 'orders', o._id), o, issues, userName);
      });
      await batch.commit();
      done += slice.length;
    }
    return { ok: true, errors: [], warnings: [], totalIssues, healedOrders: done };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الإصلاح'], warnings: [], totalIssues: 0, healedOrders: 0 };
  }
}


// ══════════════════════════════════════════
// 5. markOrderManualSettled
// ══════════════════════════════════════════

/**
 * Mark an order as manually settled (shipSettled=true) without any wallet
 * movement. Used when the order was settled outside the system (e.g. cash).
 * Includes a ledger entry for audit trail.
 *
 * @param {object} params
 * @param {object} params.db          - Firestore instance
 * @param {object} params.order       - Full order object (with _id)
 * @param {string} params.reason      - Manual settle reason (min 5 chars, enforced by caller)
 * @param {string} params.userId      - Current user UID
 * @param {string} params.userName    - Current user display name
 * @returns {{ ok: boolean, errors: string[], warnings: string[], totalPaidUpdated?: boolean }}
 */
export async function markOrderManualSettled({ db, order, reason, userId, userName }) {
  const ordId = order?._id;
  if (!db || !ordId) return { ok: false, errors: ['بيانات ناقصة'], warnings: [] };

  const now = _nowStr();
  const sale = parseFloat(order.salePrice) || 0;
  const cust = parseFloat(order.customerShipFee) || 0;
  const totalDue = sale + cust - (parseFloat(order.discount) || 0);
  const paid = _getPaid(order);

  const auditEntryObj = {
    type: 'manual_settle',
    changedBy: userName, changedById: userId || '',
    date: now, reason,
    changes: [{ field: 'shipSettled', label: 'تسوية شركة الشحن', before: 'false', after: 'true (يدوي)' }],
    requiresReview: true,
  };

  // If totalPaid < totalDue, raise it to totalDue for consistency
  const needsTotalPaidUpdate = paid + 0.01 < totalDue;
  const newTotalPaid = needsTotalPaidUpdate ? totalDue : paid;
  const newRemaining = Math.max(0, totalDue - newTotalPaid);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'orders', ordId), {
      shipSettled: true,
      shipSettledAmount: Math.max(totalDue, paid),
      shipSettledManual: true,
      shipSettledManualBy: userName,
      shipSettledManualByUid: userId || '',
      shipSettledManualAt: now,
      shipSettledManualReason: reason,
      ...(needsTotalPaidUpdate ? {
        totalPaid: newTotalPaid,
        remaining: newRemaining,
        paymentStatus: 'paid',
      } : {}),
      auditLog: [...(order.auditLog || []), auditEntryObj],
      hasUnreviewedAudit: true,
      timeline: [...(order.timeline || []), { date: now, action: `🏁 تسوية يدوية (مسوّى من بره النظام) — ${reason}${needsTotalPaidUpdate ? ` · ضبط المحصّل ${_fmtNum(paid)} → ${_fmtNum(newTotalPaid)} ج` : ''}`, by: userName }],
      updatedAt: serverTimestamp(),
    });

    // FIX (RULE 5): manual settle = financial event from outside the system — ledger entry for audit trail
    addLedgerToBatch(batch, db, FE.SHIPPING_SETTLEMENT, {
      amount: Math.max(totalDue, paid),
      walletId: '', walletName: '',
      orderId: ordId, clientId: order.clientId || '', clientName: order.clientName || '',
      vendorId: '', vendorName: order.shipCompanyName || '',
      notes: `🏁 تسوية يدوية (manual): ${reason}${needsTotalPaidUpdate ? ` · totalPaid ${_fmtNum(paid)}→${_fmtNum(newTotalPaid)}` : ''}`,
      userId: userId || '', userName,
    });

    await batch.commit();
    return { ok: true, errors: [], warnings: [], totalPaidUpdated: needsTotalPaidUpdate, newTotalPaid };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التسوية اليدوية'], warnings: [] };
  }
}


// ══════════════════════════════════════════
// 6. saveShippingFeeEdit
// ══════════════════════════════════════════

/**
 * Edit the shipping cost (shipCost) and customer shipping fee (customerShipFee)
 * for an order. Records a delta transaction and ledger entry for cost changes.
 *
 * @param {object} params
 * @param {object} params.db          - Firestore instance
 * @param {object} params.order       - Full order object (with _id)
 * @param {number} params.newCost     - New shipCost value
 * @param {number} params.newCust     - New customerShipFee value
 * @param {string} params.userId      - Current user UID
 * @param {string} params.userName    - Current user display name
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export async function saveShippingFeeEdit({ db, order, newCost, newCust, userId, userName }) {
  const ordId = order?._id;
  if (!db || !ordId) return { ok: false, errors: ['بيانات ناقصة'], warnings: [] };

  const oldCost = parseFloat(order.shipCost) || 0;
  const oldCust = parseFloat(order.customerShipFee) || 0;
  if (newCost === oldCost && newCust === oldCust) return { ok: false, errors: ['لا توجد تغييرات'], warnings: [] };

  const sale = parseFloat(order.salePrice) || 0;
  const paid = _getPaid(order);
  const newDue = sale + newCust - (parseFloat(order.discount) || 0);
  const newRem = Math.max(0, newDue - paid);
  const costDelta = newCost - oldCost;
  const now = _nowStr();

  try {
    const batch = writeBatch(db);

    // delta tx for shipCost
    if (costDelta !== 0) {
      const adjRef = doc(collection(db, 'transactions_v2'));
      batch.set(adjRef, {
        type: costDelta > 0 ? 'out' : 'in',
        amount: Math.abs(costDelta),
        description: `تعديل تكلفة الشحن (${costDelta > 0 ? '+' : '-'}${_fmtNum(Math.abs(costDelta))} ج) — ${order.clientName || ''} — ${order.shipCompanyName || ''}`,
        category: costDelta > 0 ? 'shipping_cost' : 'shipping_cost_reversal',
        orderId: ordId, clientName: order.clientName || '', walletId: '',
        date: now, createdBy: userId || '', createdByName: userName,
        createdAt: serverTimestamp(), ...approvalFields()
      });
      addLedgerToBatch(batch, db, FE.SHIPPING_EXPENSE, {
        amount: Math.abs(costDelta), walletId: '', walletName: '',
        orderId: ordId, clientId: order.clientId || '', clientName: order.clientName || '',
        notes: `تعديل تكلفة شحن (${costDelta > 0 ? '+' : '-'}${_fmtNum(Math.abs(costDelta))} ج) — ${order.shipCompanyName || ''}`,
        userId: userId || '', userName,
        direction: costDelta > 0 ? 'out' : 'in',
      });
    }

    // Update order
    const tlEntry = `✏️ تعديل شحن: ${oldCost !== newCost ? `تكلفة ${_fmtNum(oldCost)}→${_fmtNum(newCost)} ج` : ''}${oldCost !== newCost && oldCust !== newCust ? ' · ' : ''}${oldCust !== newCust ? `رسوم العميل ${_fmtNum(oldCust)}→${_fmtNum(newCust)} ج` : ''}`;
    batch.update(doc(db, 'orders', ordId), {
      shipCost: newCost,
      customerShipFee: newCust,
      remaining: newRem,
      paymentStatus: newRem <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending',
      timeline: [...(order.timeline || []), { date: now, action: tlEntry, by: userName }],
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل تعديل تكلفة الشحن'], warnings: [] };
  }
}


// ══════════════════════════════════════════
// INTERNAL UTILITIES (mirror the HTML's inline helpers)
// ══════════════════════════════════════════

/** getPaid — same logic as FC.getPaid in the HTML */
function _getPaid(o) {
  return parseFloat(o?.totalPaid) || parseFloat(o?.paid) || parseFloat(o?.deposit) || 0;
}

/** Simple number formatter — thousands separator */
function _fmtNum(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
