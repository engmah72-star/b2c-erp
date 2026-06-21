/**
 * Business2Card ERP — wallet-actions.js
 *
 * ━━━ WALLET / TREASURY ACTIONS LAYER (P2.5) ━━━
 *
 * طبقة الأفعال المالية للحسابات (accounts.html):
 *   - تسجيل/تعديل/حذف الحركات (transactions_v2)
 *   - تسوية الأرصدة (reconciliations)
 *   - تحويلات بين المحافظ
 *   - دفعات الموردين
 *   - إنشاء/تعديل metadata المحافظ
 *
 * كل action atomic عبر writeBatch + addLedgerToBatch (FSE) + RULE 2/3/5.
 * النتيجة الموحَّدة: { ok, errors[], warnings[], ... }
 */

import {
  doc,
  collection,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  getDoc,
  writeBatch,
  serverTimestamp,
  increment,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db as defaultDb } from './core/firebase-init.js';
import {
  addLedgerToBatch,
  inferEventType,
  getReversal,
  calcOrderPayment,
  FE,
  approvalFields,
} from './financial-sync-engine.js';
import { auditEntry, persistAuditLog } from './core/audit.js';

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

function _nowStr() {
  return new Date().toLocaleString('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ══════════════════════════════════════════
// WALLET METADATA
// ══════════════════════════════════════════

/**
 * تعديل مزود المحفظة فقط (metadata — ليست حركة مالية).
 */
export async function updateWalletProvider({
  db = defaultDb, walletId,
  provider, previousProvider = '',
  userId, userName,
}) {
  if (!walletId) return { ok: false, errors: ['⚠️ walletId مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'wallets', walletId), {
      provider,
      previousProvider,
      providerChangedBy: userId || '',
      providerChangedByName: userName || '',
      providerChangedAt: serverTimestamp(),
    });
    auditEntry({ action: 'wallet.updateProvider', userId, userName, kind: 'edit', meta: { walletId, provider, previousProvider } });
    persistAuditLog(db);
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [] };
  }
}

/**
 * إنشاء محفظة جديدة. لو bal > 0 يُسجَّل tx افتتاحي + ledger.
 */
export async function createWallet({
  db = defaultDb,
  name, type, provider = '',
  managerId = '',
  openingBalance = 0,
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!name || !name.trim()) return { ok: false, errors: ['⚠️ أدخل اسم الحساب'], warnings: [] };
  const bal = parseFloat(openingBalance) || 0;
  try {
    const batch = writeBatch(db);
    const walletRef = doc(collection(db, 'wallets'));
    batch.set(walletRef, {
      name: name.trim(),
      type,
      provider,
      balance: bal,
      managerId,
      createdAt: serverTimestamp(),
    });
    if (bal > 0) {
      const txRef = doc(collection(db, 'transactions_v2'));
      batch.set(txRef, {
        walletId: walletRef.id,
        type: 'in', amount: bal, fees: 0,
        description: 'رصيد افتتاحي — ' + name,
        category: 'opening_balance',
        balanceBefore: 0, balanceAfter: bal,
        date: _nowStr(),
        createdBy: userId, createdByName: userName || '',
        createdAt: serverTimestamp(),
        ...approvalFields(),
      });
      addLedgerToBatch(batch, db, FE.OPENING_BALANCE, {
        amount: bal,
        walletId: walletRef.id,
        walletName: name,
        notes: 'رصيد افتتاحي — ' + name,
        userId, userName: userName || '',
      });
    }
    await batch.commit();
    auditEntry({ action: 'wallet.create', userId, userName, kind: 'op', meta: { walletId: walletRef.id, name: name.trim(), type, openingBalance: bal } });
    persistAuditLog(db);
    return { ok: true, errors: [], warnings: [], walletId: walletRef.id, openingBalance: bal };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الإنشاء'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// RECONCILIATION
// ══════════════════════════════════════════

/**
 * تسوية رصيد محفظة — يكتب الرصيد الفعلي ويُسجِّل tx تسوية + reconciliation
 * record + ledger adjustment لو في فرق.
 */
export async function saveReconciliation({
  db = defaultDb, walletId,
  systemBalance, actualBalance,
  walletName,
  userId, userName,
}) {
  if (!walletId) return { ok: false, errors: ['⚠️ walletId مطلوب'], warnings: [] };
  if (isNaN(parseFloat(actualBalance))) return { ok: false, errors: ['⚠️ رقم غير صحيح'], warnings: [] };
  const sysBal = parseFloat(systemBalance) || 0;
  const actual = parseFloat(actualBalance);
  const diff = actual - sysBal;
  const dateStr = _nowStr();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'wallets', walletId), { balance: actual });
    if (diff !== 0) {
      const type = diff > 0 ? 'in' : 'out';
      const amount = Math.abs(diff);
      const txRef = doc(collection(db, 'transactions_v2'));
      batch.set(txRef, {
        walletId, type, amount, fees: 0,
        description: (diff > 0 ? 'تسوية — زيادة' : 'تسوية — عجز') + ' · ' + walletName,
        category: 'adjustment',
        adjustmentType: diff > 0 ? 'surplus' : 'deficit',
        balanceBefore: sysBal, balanceAfter: actual,
        date: dateStr,
        createdBy: userId,
        createdByName: userName || '',
        createdAt: serverTimestamp(),
        ...approvalFields(),
      });
      addLedgerToBatch(batch, db, FE.WALLET_ADJUSTMENT, {
        amount, walletId, walletName,
        notes: (diff > 0 ? 'تسوية — زيادة' : 'تسوية — عجز') + ' · ' + walletName,
        direction: diff > 0 ? 'in' : 'out',
        userId, userName: userName || '',
      });
    }
    const recRef = doc(collection(db, 'reconciliations'));
    batch.set(recRef, {
      walletId, walletName,
      sysBal, actualBal: actual, diff,
      adjustmentType: diff > 0 ? 'surplus' : diff < 0 ? 'deficit' : 'match',
      date: dateStr,
      createdBy: userId,
      createdByName: userName || '',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    auditEntry({ action: 'wallet.reconcile', userId, userName, kind: 'op', meta: { walletId, diff, systemBalance: sysBal, actualBalance: actual } });
    persistAuditLog(db);
    return { ok: true, errors: [], warnings: [], diff, newBalance: actual };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التسوية'], warnings: [] };
  }
}

/**
 * تعيين رصيد افتتاحي صريح — يستبدل القديم + يسجِّل reconciliation record.
 */
export async function setOpeningBalance({
  db = defaultDb, walletId, walletName,
  newBalance, oldBalance,
  dateStr = '', note = '',
  userId, userName,
}) {
  if (!walletId) return { ok: false, errors: ['⚠️ walletId مطلوب'], warnings: [] };
  if (isNaN(parseFloat(newBalance))) return { ok: false, errors: ['⚠️ أدخل الرصيد'], warnings: [] };
  const newBal = parseFloat(newBalance);
  const oldBal = parseFloat(oldBalance) || 0;
  const diff = newBal - oldBal;
  const displayDate = dateStr ? new Date(dateStr).toLocaleDateString('ar-EG') : _nowStr();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'wallets', walletId), { balance: newBal });
    const txRef = doc(collection(db, 'transactions_v2'));
    batch.set(txRef, {
      walletId,
      type: diff >= 0 ? 'in' : 'out',
      amount: Math.abs(diff) || newBal, fees: 0,
      description: 'رصيد افتتاحي' + (note ? ' — ' + note : '') + ' · ' + displayDate,
      category: 'opening_balance',
      balanceBefore: oldBal, balanceAfter: newBal,
      date: displayDate,
      createdBy: userId,
      createdByName: userName || '',
      createdAt: serverTimestamp(),
      ...approvalFields(),
    });
    const recRef = doc(collection(db, 'reconciliations'));
    batch.set(recRef, {
      walletId, walletName,
      type: 'opening_balance',
      sysBal: oldBal, actualBal: newBal, diff,
      note, date: displayDate,
      createdBy: userId,
      createdByName: userName || '',
      createdAt: serverTimestamp(),
    });
    if (Math.abs(diff) > 0) {
      addLedgerToBatch(batch, db, FE.WALLET_ADJUSTMENT, {
        amount: Math.abs(diff),
        walletId, walletName,
        notes: 'رصيد افتتاحي — ' + (note || displayDate),
        direction: diff > 0 ? 'in' : 'out',
        userId, userName: userName || '',
      });
    }
    await batch.commit();
    auditEntry({ action: 'wallet.setOpeningBalance', userId, userName, kind: 'op', meta: { walletId, oldBalance: oldBal, newBalance: newBal, diff } });
    persistAuditLog(db);
    return { ok: true, errors: [], warnings: [], diff };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التعيين'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// TRANSACTIONS — delete / edit / record
// ══════════════════════════════════════════

/**
 * حذف حركة مع reversal كامل: wallet + order (لو مرتبط) + sub-collections + ledger reversal.
 */
export async function deleteTransaction({
  db = defaultDb, transactionId,
  walletId, walletName,
  amount, type, balanceBefore,
  userId, userName,
}) {
  if (!transactionId) return { ok: false, errors: ['⚠️ transactionId مطلوب'], warnings: [] };
  if (!walletId) return { ok: false, errors: ['⚠️ walletId مطلوب'], warnings: [] };
  try {
    const txSnap = await getDoc(doc(db, 'transactions_v2', transactionId));
    const txData = txSnap.exists() ? txSnap.data() : {};
    const orderId = txData.orderId || '';
    const batch = writeBatch(db);
    batch.update(doc(db, 'wallets', walletId), {
      balance: increment(type === 'in' ? -amount : amount),
    });
    if (orderId) {
      const ordSnap = await getDoc(doc(db, 'orders', orderId));
      if (ordSnap.exists()) {
        const ord = ordSnap.data();
        const { totalPaid: newPaid, remaining: newRem, paymentStatus } = calcOrderPayment(ord, -amount);
        batch.update(doc(db, 'orders', orderId), {
          totalPaid: newPaid, remaining: newRem, paymentStatus,
        });
      }
    }
    if (txData.spId) batch.delete(doc(db, 'supplier_payments', txData.spId));
    if (txData.epId) batch.delete(doc(db, 'employee_payments', txData.epId));
    batch.delete(doc(db, 'transactions_v2', transactionId));
    addLedgerToBatch(batch, db, getReversal(inferEventType(type, txData.category || '')), {
      amount, walletId, walletName,
      orderId: orderId || null,
      notes: `حذف دفعة — ${txData.description || txData.category || ''}`,
      userId, userName: userName || '',
    });
    await batch.commit();
    auditEntry({ action: 'wallet.deleteTransaction', userId, userName, kind: 'op', meta: { transactionId, walletId, amount, type } });
    persistAuditLog(db);
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [] };
  }
}

/**
 * تسجيل حركة مالية جديدة. يدير كل الـ side-effects:
 *   - wallet balance + tx record + ledger
 *   - order.totalPaid (لو in + orderId)
 *   - supplier_payments (لو cat∈supCats + supplierId)
 *   - employee_payments (لو cat∈empCats + employeeId)
 */
export async function recordTransaction({
  db = defaultDb,
  walletId, walletName,
  type, amount, description = '', category,
  orderId = '', clientName = '',
  supplierId = '', supplierName = '',
  employeeId = '', employeeName = '',
  paymentMethod = '',
  balanceBefore, balanceAfter,
  orderData = null, // لو in + orderId — caller يجيب الـ order data للـ calcOrderPayment
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!walletId) return { ok: false, errors: ['⚠️ اختر المحفظة'], warnings: [] };
  const amt = parseFloat(amount) || 0;
  if (amt <= 0) return { ok: false, errors: ['⚠️ أدخل المبلغ'], warnings: [] };
  if (type === 'out' && balanceAfter < 0) {
    return { ok: false, errors: ['⚠️ الرصيد غير كافٍ'], warnings: [] };
  }
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'wallets', walletId), {
      balance: increment(type === 'in' ? amt : -amt),
    });
    if (orderData && type === 'in' && orderId) {
      const { totalPaid: newPaid, remaining: newRem, paymentStatus } = calcOrderPayment(orderData, amt);
      const tl = [
        ...(orderData.timeline || []),
        {
          date: _nowStr(),
          action: `💰 دفعة: ${amt.toLocaleString('ar-EG')} ج — باقي: ${newRem.toLocaleString('ar-EG')} ج`,
          by: userName || '',
        },
      ];
      batch.update(doc(db, 'orders', orderId), {
        totalPaid: newPaid, remaining: newRem, paymentStatus,
        lastPaymentDate: _nowStr(),
        timeline: tl,
      });
    }
    const n2 = new Date();
    const curMonthKey = n2.getFullYear() + '-' + String(n2.getMonth() + 1).padStart(2, '0');
    const supCats = ['supplier', 'printer_payment', 'shipper_payment'];
    const empCats = ['salary', 'designer_fee'];
    const spRef = supCats.includes(category) && supplierId ? doc(collection(db, 'supplier_payments')) : null;
    const epRef = empCats.includes(category) && employeeId ? doc(collection(db, 'employee_payments')) : null;
    const txRef = doc(collection(db, 'transactions_v2'));
    batch.set(txRef, {
      walletId, type, amount: amt, fees: 0,
      description, category,
      clientName, supplierId, supplierName, employeeId, employeeName,
      orderId: orderId || '',
      balanceBefore, balanceAfter,
      paymentMethod,
      ...(empCats.includes(category) && employeeId ? {
        month: curMonthKey,
        salaryType: category === 'designer_fee' ? 'designer_fee' : 'salary',
      } : {}),
      ...(spRef ? { spId: spRef.id } : {}),
      ...(epRef ? { epId: epRef.id } : {}),
      date: _nowStr(),
      createdBy: userId,
      createdByName: userName || '',
      createdAt: serverTimestamp(),
    });
    if (spRef) {
      batch.set(spRef, {
        supplierId, supplierName, supplierType: 'printer',
        amount: amt, walletId,
        note: description || '',
        date: _nowStr(),
        createdBy: userId,
        createdAt: serverTimestamp(),
      });
    }
    if (epRef) {
      batch.set(epRef, {
        employeeId, employeeName,
        amount: amt, walletId,
        category,
        salaryType: category === 'designer_fee' ? 'designer_fee' : 'salary',
        month: curMonthKey,
        note: description || '',
        date: _nowStr(),
        txId: txRef.id,
        createdBy: userId,
        createdAt: serverTimestamp(),
      });
    }
    addLedgerToBatch(batch, db, inferEventType(type, category), {
      amount: amt, walletId, walletName,
      orderId: orderId || null, clientName,
      vendorId: supplierId || null, vendorName: supplierName || null,
      employeeId: employeeId || null, employeeName: employeeName || null,
      notes: description,
      userId, userName: userName || '',
    });
    await batch.commit();
    auditEntry({ action: 'wallet.recordTransaction', userId, userName, kind: 'op', meta: { transactionId: txRef.id, walletId, type, amount: amt, category } });
    persistAuditLog(db);
    return { ok: true, errors: [], warnings: [], transactionId: txRef.id };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [] };
  }
}

/**
 * تعديل حركة موجودة — atomic: reverse old + apply new in same batch.
 */
export async function editTransaction({
  db = defaultDb, transactionId,
  oldData, // { type, amount, walletId, category, supplierId, employeeId, spId, epId, description }
  newData, // { walletId, type, amount, description, category, supplierId, supplierName, employeeId, employeeName, orderId, clientName, paymentMethod }
  walletsList = [],
  userId, userName,
}) {
  if (!transactionId) return { ok: false, errors: ['⚠️ transactionId مطلوب'], warnings: [] };
  if (!oldData || !newData) return { ok: false, errors: ['⚠️ oldData/newData مطلوب'], warnings: [] };
  const old = oldData;
  const oldType = old.type || 'in';
  const oldAmount = parseFloat(old.amount) || 0;
  const oldWalletId = old.walletId || '';
  const oldCat = old.category || '';
  const oldSupplierId = old.supplierId || '';
  const oldEmployeeId = old.employeeId || '';
  const { walletId, type, amount, description, category,
          supplierId, supplierName, employeeId, employeeName,
          orderId = '', clientName = '', paymentMethod = '' } = newData;
  try {
    const batch = writeBatch(db);
    // wallet adjustments
    if (oldWalletId === walletId) {
      const adj = (type === 'in' ? amount : -amount) - (oldType === 'in' ? oldAmount : -oldAmount);
      if (adj !== 0) batch.update(doc(db, 'wallets', walletId), { balance: increment(adj) });
    } else {
      const reversal = oldType === 'in' ? -oldAmount : oldAmount;
      const apply = type === 'in' ? amount : -amount;
      if (reversal !== 0) batch.update(doc(db, 'wallets', oldWalletId), { balance: increment(reversal) });
      if (apply !== 0) batch.update(doc(db, 'wallets', walletId), { balance: increment(apply) });
    }
    // sub-collection cross-refs
    const supCats = ['supplier', 'printer_payment', 'shipper_payment'];
    const empCats = ['salary', 'designer_fee'];
    const supChanged = category !== oldCat || supplierId !== oldSupplierId || amount !== oldAmount || walletId !== oldWalletId;
    const empChanged = category !== oldCat || employeeId !== oldEmployeeId || amount !== oldAmount || walletId !== oldWalletId;
    const needNewSp = supCats.includes(category) && supplierId && supChanged;
    const needNewEp = empCats.includes(category) && employeeId && empChanged;
    const newSpRef = needNewSp ? doc(collection(db, 'supplier_payments')) : null;
    const newEpRef = needNewEp ? doc(collection(db, 'employee_payments')) : null;
    // tx update
    batch.update(doc(db, 'transactions_v2', transactionId), {
      walletId, type, amount, description, category,
      clientName, supplierId, supplierName, employeeId, employeeName,
      orderId: orderId || '',
      date: _nowStr(),
      paymentMethod,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
      ...(supChanged ? { spId: newSpRef?.id || null } : {}),
      ...(empChanged ? { epId: newEpRef?.id || null } : {}),
    });
    // supplier_payments handling
    if (supCats.includes(oldCat) && oldSupplierId && supChanged) {
      if (old.spId) batch.delete(doc(db, 'supplier_payments', old.spId));
    }
    if (newSpRef) {
      batch.set(newSpRef, {
        supplierId, supplierName, supplierType: 'printer',
        amount, walletId,
        note: description || '',
        date: _nowStr(),
        createdBy: userId,
        createdAt: serverTimestamp(),
      });
    }
    // employee_payments handling
    if (empCats.includes(oldCat) && oldEmployeeId && empChanged) {
      if (old.epId) batch.delete(doc(db, 'employee_payments', old.epId));
    }
    if (newEpRef) {
      const mk = new Date().toISOString().slice(0, 7);
      batch.set(newEpRef, {
        employeeId, employeeName,
        amount, walletId,
        category,
        salaryType: category === 'designer_fee' ? 'designer_fee' : 'salary',
        month: mk,
        note: description || '',
        date: _nowStr(),
        txId: transactionId,
        createdBy: userId,
        createdAt: serverTimestamp(),
      });
    }
    // ledger pair: reverse old + record new
    addLedgerToBatch(batch, db, inferEventType(oldType === 'in' ? 'out' : 'in', oldCat), {
      amount: oldAmount,
      walletId: oldWalletId,
      walletName: walletsList.find(x => x._id === oldWalletId)?.name || '',
      notes: `تعديل — عكس القديم: ${old.description || oldCat || ''}`,
      userId, userName: userName || '',
    });
    addLedgerToBatch(batch, db, inferEventType(type, category), {
      amount, walletId,
      walletName: walletsList.find(x => x._id === walletId)?.name || '',
      orderId: orderId || null, clientName,
      vendorId: supplierId || null, vendorName: supplierName || null,
      employeeId: employeeId || null, employeeName: employeeName || null,
      notes: `تعديل — جديد: ${description}`,
      userId, userName: userName || '',
    });
    await batch.commit();
    auditEntry({ action: 'wallet.editTransaction', userId, userName, kind: 'edit', meta: { transactionId, walletId, type, amount, category } });
    persistAuditLog(db);
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التعديل'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// SUPPLIER PAYMENT (quick pay)
// ══════════════════════════════════════════

export async function recordSupplierPayment({
  db = defaultDb,
  walletId, walletName,
  supplierId, supplierName, supplierType = 'printer',
  amount, note = '',
  balanceBefore, balanceAfter,
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!walletId) return { ok: false, errors: ['⚠️ اختر المحفظة'], warnings: [] };
  if (!supplierId) return { ok: false, errors: ['⚠️ اختر المورد'], warnings: [] };
  const amt = parseFloat(amount) || 0;
  if (amt <= 0) return { ok: false, errors: ['⚠️ أدخل المبلغ'], warnings: [] };
  if (balanceAfter < 0) return { ok: false, errors: ['⚠️ الرصيد غير كافٍ'], warnings: [] };
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'wallets', walletId), { balance: increment(-amt) });
    const spRef = doc(collection(db, 'supplier_payments'));
    batch.set(spRef, {
      supplierId, supplierName, supplierType,
      amount: amt, walletId,
      note,
      date: _nowStr(),
      createdBy: userId,
      createdAt: serverTimestamp(),
    });
    const txRef = doc(collection(db, 'transactions_v2'));
    batch.set(txRef, {
      walletId, type: 'out', amount: amt, fees: 0,
      description: 'دفع لمورد: ' + supplierName,
      category: supplierType === 'shipper' ? 'shipper_payment' : 'printer_payment',
      supplierId, supplierName,
      spId: spRef.id,
      balanceBefore, balanceAfter,
      date: _nowStr(),
      createdBy: userId,
      createdByName: userName || '',
      createdAt: serverTimestamp(),
      ...approvalFields(),
    });
    addLedgerToBatch(batch, db, FE.VENDOR_PAYMENT, {
      amount: amt, walletId, walletName,
      vendorId: supplierId, vendorName: supplierName,
      notes: note || `دفعة مورد — ${supplierName}`,
      userId, userName: userName || '',
    });
    await batch.commit();
    auditEntry({ action: 'wallet.recordSupplierPayment', userId, userName, kind: 'op', meta: { paymentId: spRef.id, walletId, supplierId, supplierName, amount: amt } });
    persistAuditLog(db);
    return { ok: true, errors: [], warnings: [], paymentId: spRef.id };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التسجيل'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// WALLET TRANSFER
// ══════════════════════════════════════════

/**
 * تحويل بين محفظتين مع رسوم اختيارية.
 * يكتب 2 tx (out/in) + tx ثالث للرسوم لو > 0 + ledger entries.
 */
export async function walletTransfer({
  db = defaultDb,
  fromWalletId, fromWalletName,
  toWalletId, toWalletName,
  amount, fee = 0, feeLabel = '',
  kind = 'transfer', // 'transfer' | 'withdrawal'
  note = '',
  fromBalance, toBalance,
  userId, userName,
}) {
  if (!userId) return { ok: false, errors: ['⚠️ userId مطلوب'], warnings: [] };
  if (!fromWalletId || !toWalletId) return { ok: false, errors: ['⚠️ اختر حسابي التحويل'], warnings: [] };
  if (fromWalletId === toWalletId) return { ok: false, errors: ['⚠️ الحسابان متماثلان'], warnings: [] };
  const amt = parseFloat(amount) || 0;
  if (amt <= 0) return { ok: false, errors: ['⚠️ أدخل المبلغ'], warnings: [] };
  const totalDeducted = amt + (parseFloat(fee) || 0);
  const fromBal = parseFloat(fromBalance) || 0;
  const toBal = parseFloat(toBalance) || 0;
  if (fromBal < totalDeducted) {
    return { ok: false, errors: [`⚠️ الرصيد غير كافٍ — تحتاج ${totalDeducted.toLocaleString('ar-EG')} ج`], warnings: [] };
  }
  const isWithdrawal = kind === 'withdrawal';
  const dateStr = _nowStr();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'wallets', fromWalletId), { balance: increment(-totalDeducted) });
    batch.update(doc(db, 'wallets', toWalletId), { balance: increment(amt) });
    const transferGroupId = doc(collection(db, 'transactions_v2')).id;
    const txCategory = isWithdrawal ? 'withdrawal' : 'transfer';
    const outDescPrefix = isWithdrawal ? '💵 سحب إلى: ' : '🔄 تحويل إلى: ';
    const inDescPrefix = isWithdrawal ? '💵 سحب من: ' : '🔄 تحويل من: ';
    const outRef = doc(collection(db, 'transactions_v2'));
    batch.set(outRef, {
      walletId: fromWalletId, type: 'out', amount: amt, fees: fee,
      description: outDescPrefix + toWalletName + (note ? ' — ' + note : ''),
      category: txCategory, transferGroupId, transferTo: toWalletId,
      balanceBefore: fromBal, balanceAfter: fromBal - amt,
      date: dateStr,
      createdBy: userId, createdByName: userName || '',
      createdAt: serverTimestamp(),
      ...approvalFields(),
    });
    const inRef = doc(collection(db, 'transactions_v2'));
    batch.set(inRef, {
      walletId: toWalletId, type: 'in', amount: amt, fees: 0,
      description: inDescPrefix + fromWalletName + (note ? ' — ' + note : ''),
      category: txCategory, transferGroupId, transferFrom: fromWalletId,
      balanceBefore: toBal, balanceAfter: toBal + amt,
      date: dateStr,
      createdBy: userId, createdByName: userName || '',
      createdAt: serverTimestamp(),
      ...approvalFields(),
    });
    if (fee > 0) {
      const feeRef = doc(collection(db, 'transactions_v2'));
      const feeCat = isWithdrawal ? 'withdrawal_fee' : 'transfer_fee';
      const feeDesc = (isWithdrawal ? '💰 رسوم سحب — ' : '💰 رسوم تحويل — ') +
        `${fromWalletName} → ${toWalletName}` + (note ? ' — ' + note : '');
      batch.set(feeRef, {
        walletId: fromWalletId, walletName: fromWalletName, type: 'out',
        amount: fee, fees: 0,
        description: feeDesc, category: feeCat, transferGroupId,
        balanceBefore: fromBal - amt, balanceAfter: fromBal - totalDeducted,
        date: dateStr,
        createdBy: userId, createdByName: userName || '',
        createdAt: serverTimestamp(),
        ...approvalFields(),
      });
      addLedgerToBatch(batch, db, FE.GENERAL_EXPENSE, {
        amount: fee,
        walletId: fromWalletId, walletName: fromWalletName,
        notes: `${isWithdrawal ? 'رسوم سحب' : 'رسوم تحويل'} ${fromWalletName} → ${toWalletName}: ${feeLabel}`,
        userId, userName: userName || '',
        categoryOverride: feeCat,
      });
    }
    addLedgerToBatch(batch, db, FE.WALLET_TRANSFER, {
      amount: amt,
      walletId: fromWalletId, walletName: fromWalletName,
      notes: `تحويل من ${fromWalletName} إلى ${toWalletName}` + (note ? ' — ' + note : ''),
      userId, userName: userName || '',
    });
    await batch.commit();
    auditEntry({ action: 'wallet.transfer', userId, userName, kind: 'op', meta: { transferGroupId, fromWalletId, toWalletId, amount: amt, fee, kind } });
    persistAuditLog(db);
    return { ok: true, errors: [], warnings: [], transferGroupId, fee, isWithdrawal };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التحويل'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════

/**
 * حذف محفظة (admin-only). الـ caller يتحقق إن المحفظة فاضية + يأخذ confirm.
 */
export async function deleteWallet({ db = defaultDb, walletId, userId, userName }) {
  if (!walletId) return { ok: false, errors: ['⚠️ walletId مطلوب'], warnings: [] };
  try {
    await deleteDoc(doc(db, 'wallets', walletId));
    if (userId) {
      auditEntry({ action: 'wallet.delete', userId, userName, kind: 'op', meta: { walletId } });
      persistAuditLog(db);
    }
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [] };
  }
}

export const walletActions = {
  updateWalletProvider,
  createWallet,
  deleteWallet,
  saveReconciliation,
  setOpeningBalance,
  deleteTransaction,
  recordTransaction,
  editTransaction,
  recordSupplierPayment,
  walletTransfer,
};

export default walletActions;

if (typeof window !== 'undefined') {
  window.walletActions = walletActions;
}
