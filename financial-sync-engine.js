/**
 * financial-sync-engine.js — محرك المزامنة المالية المركزي
 * Central Financial Event Bus — v2
 *
 * كل حركة مالية من أي شاشة تمر عبر هذا المحرك:
 *   1. تسجيل في financial_ledger — atomic في نفس الـ batch
 *   2. تحديث الأرصدة والسجلات المرتبطة
 *   3. مزامنة تلقائية مع لوحة الحسابات عبر onSnapshot
 *
 * الاستخدام:
 *   - dispatchFinancialEvent(db, FE.VENDOR_PAYMENT, payload)
 *       يُنشئ batch كامل ويُنفذ كل الكتابات ذريًا
 *   - addLedgerToBatch(batch, db, eventType, data)
 *       يُضيف إدخال ledger لـ batch موجود (للوحدات ذات المنطق المعقد)
 */
import {
  writeBatch, doc, collection, serverTimestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log('[FSE] 🚀 Financial Sync Engine v2 loaded — all atomic writes active');

// ══════════════════════════════════════════════════════════════════
// Event Type Constants
// ══════════════════════════════════════════════════════════════════
export const FE = {
  CUSTOMER_PAYMENT:              'CUSTOMER_PAYMENT',
  CUSTOMER_REFUND:               'CUSTOMER_REFUND',
  VENDOR_PAYMENT:                'VENDOR_PAYMENT',
  VENDOR_PAYMENT_REVERSAL:       'VENDOR_PAYMENT_REVERSAL',
  SHIPPING_EXPENSE:              'SHIPPING_EXPENSE',
  SHIPPING_SETTLEMENT:           'SHIPPING_SETTLEMENT',
  SHIPPING_SETTLEMENT_REVERSAL:  'SHIPPING_SETTLEMENT_REVERSAL',
  SHIPPING_RETURN:               'SHIPPING_RETURN',
  SALARY_PAYMENT:                'SALARY_PAYMENT',
  SALARY_PAYMENT_REVERSAL:       'SALARY_PAYMENT_REVERSAL',
  PAYROLL:                       'PAYROLL',
  BONUS_PAYMENT:                 'BONUS_PAYMENT',
  PENALTY:                       'PENALTY',
  RETURN_LOSS:                   'RETURN_LOSS',
  GENERAL_EXPENSE:               'GENERAL_EXPENSE',
  WALLET_TRANSFER:               'WALLET_TRANSFER',
};

// ══════════════════════════════════════════════════════════════════
// Ledger Category Map — يحدد نوع وأيقونة كل حركة في financial_ledger
// ══════════════════════════════════════════════════════════════════
const LC = {
  CUSTOMER_PAYMENT:             { type:'income',   category:'client_payment',      direction:'in',  icon:'💰', label:'دفعة عميل' },
  CUSTOMER_REFUND:              { type:'expense',  category:'refund',              direction:'out', icon:'↩️', label:'استرداد عميل' },
  VENDOR_PAYMENT:               { type:'expense',  category:'vendor_payment',      direction:'out', icon:'🏭', label:'دفعة مورد' },
  VENDOR_PAYMENT_REVERSAL:      { type:'reversal', category:'vendor_payment',      direction:'in',  icon:'🔄', label:'إلغاء دفعة مورد' },
  SHIPPING_EXPENSE:             { type:'expense',  category:'shipping_cost',       direction:'out', icon:'🚚', label:'تكلفة شحن' },
  SHIPPING_SETTLEMENT:          { type:'income',   category:'shipping_collection', direction:'in',  icon:'📦', label:'تسوية شحن' },
  SHIPPING_SETTLEMENT_REVERSAL: { type:'reversal', category:'shipping_collection', direction:'out', icon:'🔄', label:'إلغاء تسوية شحن' },
  SHIPPING_RETURN:              { type:'reversal', category:'shipping_return',     direction:'out', icon:'↩️', label:'مرتجع شحن' },
  SALARY_PAYMENT:               { type:'expense',  category:'salary',              direction:'out', icon:'👤', label:'راتب' },
  SALARY_PAYMENT_REVERSAL:      { type:'reversal', category:'salary',              direction:'in',  icon:'🔄', label:'إلغاء راتب' },
  PAYROLL:                      { type:'expense',  category:'salary',              direction:'out', icon:'👥', label:'مسير رواتب' },
  BONUS_PAYMENT:                { type:'expense',  category:'bonus',               direction:'out', icon:'🎁', label:'مكافأة' },
  PENALTY:                      { type:'expense',  category:'deduction',           direction:'out', icon:'✂️', label:'خصم' },
  RETURN_LOSS:                  { type:'expense',  category:'return_loss',         direction:'out', icon:'↩️', label:'خسارة مرتجع' },
  GENERAL_EXPENSE:              { type:'expense',  category:'general_expense',     direction:'out', icon:'💸', label:'مصروف عام' },
  WALLET_TRANSFER:              { type:'transfer', category:'transfer',            direction:'in',  icon:'🔄', label:'تحويل داخلي' },
};

// ══════════════════════════════════════════════════════════════════
// LOW-LEVEL: أضف إدخال ledger لـ batch موجود
// استخدمه في الوحدات التي لديها batch منطقها الخاص
// ══════════════════════════════════════════════════════════════════
export function addLedgerToBatch(batch, db, eventType, data) {
  const lc = LC[eventType] || { type:'other', category:'unknown', direction:'in', icon:'📋', label: eventType };
  const ref = doc(collection(db, 'financial_ledger'));
  batch.set(ref, {
    ...lc,
    ...(data.direction ? {direction: data.direction} : {}),
    eventType,
    amount:       data.amount       || 0,
    orderId:      data.orderId      || null,
    clientId:     data.clientId     || null,
    clientName:   data.clientName   || null,
    employeeId:   data.employeeId   || null,
    employeeName: data.employeeName || null,
    vendorId:     data.vendorId     || null,
    vendorName:   data.vendorName   || null,
    walletId:     data.walletId     || null,
    walletName:   data.walletName   || '',
    notes:        data.notes || data.note || '',
    refId:        data.refId        || null,
    createdBy:     data.userId      || data.createdBy     || '',
    createdByName: data.userName    || data.createdByName || '',
    createdAt:    serverTimestamp(),
    isDeleted:    false,
    editHistory:  [],
  });
  console.log('[FSE] 📝 ledger added to batch:', eventType, data.amount);
  return ref;
}

// ══════════════════════════════════════════════════════════════════
// HELPER: استنتج نوع الحدث من نوع المعاملة والفئة
// مفيد لـ accounts.html حيث الفئة متغيرة
// ══════════════════════════════════════════════════════════════════
export function inferEventType(txType, category) {
  const m = {
    salary: 'SALARY_PAYMENT', designer_fee: 'SALARY_PAYMENT', advance: 'SALARY_PAYMENT',
    bonus: 'BONUS_PAYMENT',
    deduction: 'PENALTY',
    supplier: 'VENDOR_PAYMENT',
    shipping_cost: 'SHIPPING_EXPENSE', shipping: 'SHIPPING_EXPENSE',
    shipping_settlement: 'SHIPPING_SETTLEMENT',
    shipping_return: 'SHIPPING_RETURN',
    deposit: 'CUSTOMER_PAYMENT', collection: 'CUSTOMER_PAYMENT', client_payment: 'CUSTOMER_PAYMENT',
    transfer: 'WALLET_TRANSFER',
    return_loss: 'RETURN_LOSS', return_cost: 'RETURN_LOSS',
    refund: 'CUSTOMER_REFUND',
  };
  return m[category] || (txType === 'in' ? 'CUSTOMER_PAYMENT' : 'GENERAL_EXPENSE');
}

// ══════════════════════════════════════════════════════════════════
// Internal Handlers
// ══════════════════════════════════════════════════════════════════

async function handleVendorPayment(db, p) {
  const batch = writeBatch(db);

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(-p.amount) });
    console.log('[FSE] 💳 balance updated:', p.walletId, '-', p.amount);
  }

  const payRef = doc(collection(db, 'supplier_payments'));
  batch.set(payRef, {
    supplierId: p.supplierId, supplierName: p.supplierName,
    amount: p.amount, walletId: p.walletId || '',
    note: p.note || '', date: p.date || new Date().toLocaleDateString('ar-EG'),
    createdAt: serverTimestamp(), createdBy: p.userId || '',
  });

  const txRef = doc(collection(db, 'transactions_v2'));
  batch.set(txRef, {
    walletId: p.walletId || '', walletName: p.walletName || '',
    type: 'out', amount: p.amount, fees: 0,
    description: p.note || `دفعة مورد — ${p.supplierName}`, category: 'supplier',
    supplierId: p.supplierId, supplierName: p.supplierName,
    spId: payRef.id,
    date: p.date || new Date().toLocaleDateString('ar-EG'),
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
  });
  console.log('[FSE] 🏭 module updated: supplier_payments + transactions_v2');

  addLedgerToBatch(batch, db, 'VENDOR_PAYMENT', {
    ...p, vendorId: p.supplierId, vendorName: p.supplierName, notes: p.note,
  });

  await batch.commit();
  console.log('[FSE] 📊 dashboard updated via financial_ledger');
  console.log('[FSE] ✅ completed: VENDOR_PAYMENT', { payId: payRef.id });
  return { payId: payRef.id, txId: txRef.id };
}

async function handleVendorPaymentReversal(db, p) {
  const batch = writeBatch(db);

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(p.amount) });
    console.log('[FSE] 💳 balance updated:', p.walletId, '+', p.amount);
  }

  batch.delete(doc(db, 'supplier_payments', p.paymentId));

  const revTxRef = doc(collection(db, 'transactions_v2'));
  batch.set(revTxRef, {
    walletId: p.walletId || '', walletName: p.walletName || '',
    type: 'in', amount: p.amount, fees: 0,
    description: `إلغاء دفعة — ${p.supplierName}`, category: 'supplier',
    supplierId: p.supplierId, supplierName: p.supplierName,
    isReversal: true,
    date: new Date().toLocaleDateString('ar-EG'),
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
  });
  console.log('[FSE] 🏭 module updated: supplier_payment deleted + reversal transactions_v2');

  addLedgerToBatch(batch, db, 'VENDOR_PAYMENT_REVERSAL', {
    ...p, vendorId: p.supplierId, vendorName: p.supplierName,
    notes: `إلغاء دفعة — ${p.supplierName}`,
  });

  await batch.commit();
  console.log('[FSE] 📊 dashboard updated via financial_ledger');
  console.log('[FSE] ✅ completed: VENDOR_PAYMENT_REVERSAL');
  return {};
}

async function handleSalaryPaymentReversal(db, p) {
  const isDeduction = p.isDeduction;
  const batch = writeBatch(db);

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(isDeduction ? -p.amount : p.amount) });
    console.log('[FSE] 💳 balance restored:', isDeduction ? '-' : '+', p.amount);
  }

  if (p.txId) {
    batch.delete(doc(db, 'transactions_v2', p.txId));
  }

  if (p.epId) {
    batch.delete(doc(db, 'employee_payments', p.epId));
  }

  addLedgerToBatch(batch, db, 'SALARY_PAYMENT_REVERSAL', {
    ...p, employeeId: p.employeeId, employeeName: p.employeeName,
    notes: `إلغاء راتب — ${p.employeeName}`,
  });

  await batch.commit();
  console.log('[FSE] ✅ completed: SALARY_PAYMENT_REVERSAL');
  return {};
}

async function handleSalaryPayment(db, p) {
  const isDeduction = p.salaryType === 'deduction';
  const batch = writeBatch(db);

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(isDeduction ? p.amount : -p.amount) });
    console.log('[FSE] 💳 balance updated:', isDeduction ? '+' : '-', p.amount);
  }

  const epRef = doc(collection(db, 'employee_payments'));
  const txRef = doc(collection(db, 'transactions_v2'));
  batch.set(txRef, {
    walletId: p.walletId, walletName: p.walletName || '',
    type: isDeduction ? 'in' : 'out', amount: p.amount,
    description: p.note || '', category: 'salary',
    salaryType: p.salaryType, employeeId: p.employeeId, employeeName: p.employeeName,
    baseSalary: p.baseSalary || 0, commission: p.commission || 0,
    month: p.month, isDeduction, epId: epRef.id,
    date: p.date || new Date().toLocaleDateString('ar-EG'),
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
  });

  batch.set(epRef, {
    employeeId: p.employeeId, employeeName: p.employeeName,
    amount: p.amount, salaryType: p.salaryType, isDeduction,
    month: p.month, walletId: p.walletId, walletName: p.walletName || '',
    note: p.note || '', date: p.date || new Date().toLocaleDateString('ar-EG'),
    txId: txRef.id,
    createdAt: serverTimestamp(), createdBy: p.userId || '',
  });
  console.log('[FSE] 🏭 module updated: transactions_v2 + employee_payments');

  const evtType = isDeduction ? 'PENALTY' : (p.salaryType === 'bonus' ? 'BONUS_PAYMENT' : 'SALARY_PAYMENT');
  addLedgerToBatch(batch, db, evtType, { ...p, notes: p.note });

  await batch.commit();
  console.log('[FSE] 📊 dashboard updated via financial_ledger');
  console.log('[FSE] ✅ completed:', evtType);
  return { txId: txRef.id, epId: epRef.id };
}

async function handlePayroll(db, p) {
  // p.employees: [{employeeId, employeeName, amount}]
  const batch = writeBatch(db);

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(-p.totalAmount) });
    console.log('[FSE] 💳 balance updated:', p.walletId, '-', p.totalAmount);
  }

  for (const e of p.employees) {
    const epRef = doc(collection(db, 'employee_payments'));
    const txRef = doc(collection(db, 'transactions_v2'));
    batch.set(epRef, {
      employeeId: e.employeeId, employeeName: e.employeeName,
      amount: e.amount, month: p.month,
      walletId: p.walletId, walletName: p.walletName || '',
      note: p.note, date: p.date || new Date().toLocaleDateString('ar-EG'),
      txId: txRef.id,
      createdAt: serverTimestamp(), createdBy: p.userId || '',
    });

    batch.set(txRef, {
      walletId: p.walletId, walletName: p.walletName || '',
      type: 'out', amount: e.amount,
      description: `${p.note} — ${e.employeeName}`, category: 'salary',
      employeeId: e.employeeId, employeeName: e.employeeName,
      month: p.month, isDeduction: false, epId: epRef.id,
      date: p.date || new Date().toLocaleDateString('ar-EG'),
      createdBy: p.userId || '', createdByName: p.userName || '',
      createdAt: serverTimestamp(), source: 'payroll',
    });

    addLedgerToBatch(batch, db, 'SALARY_PAYMENT', {
      ...p, amount: e.amount, employeeId: e.employeeId, employeeName: e.employeeName,
      notes: `${p.note} — ${e.employeeName}`,
    });
    console.log('[FSE] 👤 payroll entry:', e.employeeName, e.amount);
  }

  console.log('[FSE] 🏭 module updated: transactions_v2 + employee_payments ×', p.employees.length);
  await batch.commit();
  console.log('[FSE] 📊 dashboard updated via financial_ledger');
  console.log('[FSE] ✅ completed: PAYROLL', { count: p.employees.length, total: p.totalAmount });
  return { count: p.employees.length };
}

async function handleCustomerPayment(db, p) {
  // p.orderData: {totalPaid, salePrice, discount} — pre-fetched by caller if needed
  const batch = writeBatch(db);

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(p.amount) });
    console.log('[FSE] 💳 balance updated:', p.walletId, '+', p.amount);
  }

  const txRef = doc(collection(db, 'transactions_v2'));
  batch.set(txRef, {
    walletId: p.walletId || '', walletName: p.walletName || '',
    type: 'in', amount: p.amount, category: p.txCategory || 'client_payment',
    orderId: p.orderId || null, clientId: p.clientId || null, clientName: p.clientName || '',
    note: p.note || '',
    date: p.date || new Date().toLocaleDateString('ar-EG'),
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
  });
  console.log('[FSE] 🏭 module updated: transactions_v2');

  if (p.orderId && p.orderData) {
    const newPaid = (parseFloat(p.orderData.totalPaid) || 0) + p.amount;
    const newRem  = Math.max(0, (parseFloat(p.orderData.salePrice) || 0) - (parseFloat(p.orderData.discount) || 0) - newPaid);
    batch.update(doc(db, 'orders', p.orderId), {
      totalPaid: newPaid, remaining: newRem,
      paymentStatus: newRem <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'pending',
      lastPaymentDate: p.date || new Date().toLocaleDateString('ar-EG'),
    });
    console.log('[FSE] 📦 module updated: order payment fields');
  }

  const evtType = p.eventType || 'CUSTOMER_PAYMENT';
  addLedgerToBatch(batch, db, evtType, { ...p, notes: p.note });

  await batch.commit();
  console.log('[FSE] 📊 dashboard updated via financial_ledger');
  console.log('[FSE] ✅ completed:', evtType);
  return { txId: txRef.id };
}

async function handleGeneralExpense(db, p) {
  const batch = writeBatch(db);

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(-p.amount) });
    console.log('[FSE] 💳 balance updated:', p.walletId, '-', p.amount);
  }

  if (p.walletId || p.createTx !== false) {
    const txRef = doc(collection(db, 'transactions_v2'));
    batch.set(txRef, {
      walletId: p.walletId || '', walletName: p.walletName || '',
      type: 'out', amount: p.amount,
      description: p.note || '', category: p.txCategory || 'expense',
      orderId: p.orderId || null,
      date: p.date || new Date().toLocaleDateString('ar-EG'),
      createdBy: p.userId || '', createdByName: p.userName || '',
      createdAt: serverTimestamp(),
    });
    console.log('[FSE] 🏭 module updated: transactions_v2');
  }

  addLedgerToBatch(batch, db, p.eventType || 'GENERAL_EXPENSE', { ...p, notes: p.note });

  await batch.commit();
  console.log('[FSE] 📊 dashboard updated via financial_ledger');
  console.log('[FSE] ✅ completed:', p.eventType || 'GENERAL_EXPENSE');
  return {};
}

// ══════════════════════════════════════════════════════════════════
// Dispatcher Map
// ══════════════════════════════════════════════════════════════════
const HANDLERS = {
  CUSTOMER_PAYMENT:        handleCustomerPayment,
  CUSTOMER_REFUND:         (db, p) => handleCustomerPayment(db, { ...p, eventType: 'CUSTOMER_REFUND' }),
  VENDOR_PAYMENT:          handleVendorPayment,
  VENDOR_PAYMENT_REVERSAL: handleVendorPaymentReversal,
  SALARY_PAYMENT:          handleSalaryPayment,
  SALARY_PAYMENT_REVERSAL: handleSalaryPaymentReversal,
  BONUS_PAYMENT:           (db, p) => handleSalaryPayment(db, { ...p, salaryType: 'bonus' }),
  PENALTY:                 (db, p) => handleSalaryPayment(db, { ...p, salaryType: 'deduction' }),
  PAYROLL:                 handlePayroll,
  GENERAL_EXPENSE:         handleGeneralExpense,
  SHIPPING_EXPENSE:        (db, p) => handleGeneralExpense(db, { ...p, txCategory: 'shipping_cost', eventType: 'SHIPPING_EXPENSE', createTx: false }),
  SHIPPING_RETURN:         (db, p) => handleGeneralExpense(db, { ...p, txCategory: 'shipping_return', eventType: 'SHIPPING_RETURN', createTx: false }),
};

// ══════════════════════════════════════════════════════════════════
// HIGH-LEVEL: dispatchFinancialEvent
// كل الشاشات ترسل events هنا — المحرك يُنفذ كل الكتابات ذريًا
// ══════════════════════════════════════════════════════════════════
export async function dispatchFinancialEvent(db, eventType, payload) {
  console.log('[FSE] 📥 event received:', eventType, { amount: payload.amount });
  const handler = HANDLERS[eventType];
  if (!handler) throw new Error(`[FSE] Unknown event type: ${eventType}`);
  try {
    const result = await handler(db, payload);
    console.log('[FSE] ✅ completed:', eventType);
    return result;
  } catch(e) {
    console.error('[FSE] ❌ event failed:', eventType, { code: e.code, msg: e.message });
    throw e;
  }
}
