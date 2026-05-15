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
  OPENING_BALANCE:               'OPENING_BALANCE',
  WALLET_ADJUSTMENT:             'WALLET_ADJUSTMENT',
  GENERAL_EXPENSE_REVERSAL:      'GENERAL_EXPENSE_REVERSAL',
  VENDOR_PAYMENT:                'VENDOR_PAYMENT',
  VENDOR_PAYMENT_REVERSAL:       'VENDOR_PAYMENT_REVERSAL',
  SHIPPING_EXPENSE:              'SHIPPING_EXPENSE',
  SHIPPING_SETTLEMENT:           'SHIPPING_SETTLEMENT',
  SHIPPING_SETTLEMENT_REVERSAL:  'SHIPPING_SETTLEMENT_REVERSAL',
  SALARY_PAYMENT:                'SALARY_PAYMENT',
  SALARY_PAYMENT_REVERSAL:       'SALARY_PAYMENT_REVERSAL',
  PAYROLL:                       'PAYROLL',
  BONUS_PAYMENT:                 'BONUS_PAYMENT',
  PENALTY:                       'PENALTY',
  RETURN_LOSS:                   'RETURN_LOSS',
  GENERAL_EXPENSE:               'GENERAL_EXPENSE',
  WALLET_TRANSFER:               'WALLET_TRANSFER',
  // ─── Marketplace Events (Phase 1) — handlers في marketplace-engine.js ───
  MARKETPLACE_ORDER_CAPTURED:    'MARKETPLACE_ORDER_CAPTURED',
  MARKETPLACE_ORDER_CANCELLED:   'MARKETPLACE_ORDER_CANCELLED',
  ESCROW_HOLD:                   'ESCROW_HOLD',
  ESCROW_RELEASE:                'ESCROW_RELEASE',
  ESCROW_REFUND:                 'ESCROW_REFUND',
  COMMISSION_SETTLED:            'COMMISSION_SETTLED',
  PLATFORM_FEE_COLLECTED:        'PLATFORM_FEE_COLLECTED',
  MERCHANT_PAYOUT:               'MERCHANT_PAYOUT',
  MERCHANT_PAYOUT_REVERSAL:      'MERCHANT_PAYOUT_REVERSAL',
  CHARGEBACK:                    'CHARGEBACK',
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
  SALARY_PAYMENT:               { type:'expense',  category:'salary',              direction:'out', icon:'👤', label:'راتب' },
  SALARY_PAYMENT_REVERSAL:      { type:'reversal', category:'salary',              direction:'in',  icon:'🔄', label:'إلغاء راتب' },
  PAYROLL:                      { type:'expense',  category:'salary',              direction:'out', icon:'👥', label:'مسير رواتب' },
  BONUS_PAYMENT:                { type:'expense',  category:'bonus',               direction:'out', icon:'🎁', label:'مكافأة' },
  PENALTY:                      { type:'expense',  category:'deduction',           direction:'out', icon:'✂️', label:'خصم' },
  RETURN_LOSS:                  { type:'expense',  category:'return_loss',         direction:'out', icon:'↩️', label:'خسارة مرتجع' },
  GENERAL_EXPENSE:              { type:'expense',  category:'general_expense',     direction:'out', icon:'💸', label:'مصروف عام' },
  GENERAL_EXPENSE_REVERSAL:     { type:'reversal', category:'general_expense',     direction:'in',  icon:'🔄', label:'إلغاء مصروف عام' },
  WALLET_TRANSFER:              { type:'transfer', category:'transfer',            direction:'in',  icon:'🔄', label:'تحويل داخلي' },
  OPENING_BALANCE:              { type:'other',    category:'opening_balance',     direction:'in',  icon:'🏦', label:'رصيد افتتاحي' },
  WALLET_ADJUSTMENT:            { type:'other',    category:'adjustment',          direction:'in',  icon:'⚖️', label:'تسوية رصيد' },
  // ─── Marketplace Events (Phase 1) ───
  MARKETPLACE_ORDER_CAPTURED:   { type:'income',   category:'marketplace_order',   direction:'in',  icon:'🛒', label:'تحصيل طلب marketplace' },
  MARKETPLACE_ORDER_CANCELLED:  { type:'reversal', category:'marketplace_order',   direction:'out', icon:'🚫', label:'إلغاء طلب marketplace' },
  ESCROW_HOLD:                  { type:'other',    category:'escrow',              direction:'in',  icon:'🔒', label:'حجز Escrow' },
  ESCROW_RELEASE:               { type:'transfer', category:'escrow',              direction:'out', icon:'🔓', label:'إفراج Escrow' },
  ESCROW_REFUND:                { type:'reversal', category:'escrow',              direction:'out', icon:'↩️', label:'استرداد Escrow' },
  COMMISSION_SETTLED:           { type:'income',   category:'platform_commission', direction:'in',  icon:'💼', label:'عمولة منصة محصّلة' },
  PLATFORM_FEE_COLLECTED:       { type:'income',   category:'platform_fee',        direction:'in',  icon:'🏛️', label:'رسوم منصة' },
  MERCHANT_PAYOUT:              { type:'expense',  category:'merchant_payout',     direction:'out', icon:'💸', label:'دفعة مرشنت' },
  MERCHANT_PAYOUT_REVERSAL:     { type:'reversal', category:'merchant_payout',     direction:'in',  icon:'🔄', label:'إلغاء دفعة مرشنت' },
  CHARGEBACK:                   { type:'reversal', category:'chargeback',          direction:'out', icon:'⚠️', label:'استرداد إجباري (chargeback)' },
};

// ══════════════════════════════════════════════════════════════════
// HELPER: المعادلة الرسمية الوحيدة لحساب دفعة الأوردر
// استخدمها في كل صفحة بدل الحساب اليدوي
// delta: موجب لإضافة دفعة، سالب لعكسها
// ══════════════════════════════════════════════════════════════════
export function calcOrderPayment(order, delta) {
  const sale    = parseFloat(order.salePrice)       || 0;
  const disc    = parseFloat(order.discount)         || 0;
  const shipFee = parseFloat(order.customerShipFee)  || 0;
  const net     = Math.max(0, sale + shipFee - disc);
  const oldPaid = parseFloat(order.totalPaid) || parseFloat(order.paid) || parseFloat(order.deposit) || 0;
  // delta سالب يعني refund — لا يجب أن يتجاوز المدفوع الحالي
  if (delta < 0 && Math.abs(delta) > oldPaid + 0.01) {
    throw new Error(`[FSE] refund (${Math.abs(delta)}) أكبر من المدفوع الحالي (${oldPaid})`);
  }
  const newPaid = Math.max(0, oldPaid + delta);
  const remaining = Math.max(0, net - newPaid);
  return {
    totalPaid:     newPaid,
    remaining,
    paymentStatus: remaining <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'pending',
    ...(remaining <= 0 ? { paidAt: serverTimestamp() } : {}),
  };
}

// ══════════════════════════════════════════════════════════════════
// HELPER: حقول الاعتماد الثنائي — تُضاف لكل tx + ledger جديدة
// كل عملية تبدأ pending، تحتاج تأكيد ops manager ثم اعتماد admin
// ══════════════════════════════════════════════════════════════════
export function approvalFields() {
  return {
    approvalStatus: 'pending',  // 'pending' | 'confirmed' | 'approved' | 'rejected'
    confirmedBy: '', confirmedByName: '', confirmedAt: null,
    approvedBy:  '', approvedByName:  '', approvedAt:  null,
    rejectedBy:  '', rejectedByName:  '', rejectedAt:  null, rejectReason: '',
    isLocked:    false,
  };
}

// ══════════════════════════════════════════════════════════════════
// LOW-LEVEL: أضف إدخال ledger لـ batch موجود
// استخدمه في الوحدات التي لديها batch منطقها الخاص
// ══════════════════════════════════════════════════════════════════
export function addLedgerToBatch(batch, db, eventType, data) {
  if (!LC[eventType]) {
    console.warn(`[FSE] ⚠️ eventType غير معروف: "${eventType}" — أضفه إلى LC map أو تحقق من الاسم`);
  }
  if (!(data.amount > 0)) {
    console.warn(`[FSE] ⚠️ addLedgerToBatch: amount=${data.amount} غير صالح لـ eventType=${eventType}`);
  }
  // تحذير عند غياب أي ربط بكيان (أوردر/عميل/موظف/مورد/محفظة) — قيد يتيم بدون ربط
  const hasEntity = data.orderId || data.clientId || data.employeeId || data.vendorId || data.walletId || data.refId;
  if (!hasEntity) {
    console.warn(`[FSE] ⚠️ addLedgerToBatch: قيد بدون ربط بكيان — eventType=${eventType}`);
  }
  const lc = LC[eventType] || { type:'other', category:'unknown', direction:'in', icon:'📋', label: eventType };
  const ref = doc(collection(db, 'financial_ledger'));
  batch.set(ref, {
    ...lc,
    ...(data.direction ? {direction: data.direction} : {}),
    ...(data.categoryOverride ? {category: data.categoryOverride} : {}),
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
    ...approvalFields(),
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
    supplier: 'VENDOR_PAYMENT', printer_payment: 'VENDOR_PAYMENT', shipper_payment: 'VENDOR_PAYMENT',
    shipping_cost: 'SHIPPING_EXPENSE', shipping: 'SHIPPING_EXPENSE',
    shipping_settlement: 'SHIPPING_SETTLEMENT',
    deposit: 'CUSTOMER_PAYMENT', collection: 'CUSTOMER_PAYMENT', client_payment: 'CUSTOMER_PAYMENT',
    transfer: 'WALLET_TRANSFER',
    return_loss: 'RETURN_LOSS', return_cost: 'RETURN_LOSS',
    refund: 'CUSTOMER_REFUND',
  };
  return m[category] || (txType === 'in' ? 'CUSTOMER_PAYMENT' : 'GENERAL_EXPENSE');
}

// لكل حدث → حدث العكس المقابل (للحذف والإلغاء)
export function getReversal(eventType) {
  const REVERSAL = {
    CUSTOMER_PAYMENT:             'CUSTOMER_REFUND',
    CUSTOMER_REFUND:              'CUSTOMER_PAYMENT',
    VENDOR_PAYMENT:               'VENDOR_PAYMENT_REVERSAL',
    VENDOR_PAYMENT_REVERSAL:      'VENDOR_PAYMENT',
    SALARY_PAYMENT:               'SALARY_PAYMENT_REVERSAL',
    SALARY_PAYMENT_REVERSAL:      'SALARY_PAYMENT',
    BONUS_PAYMENT:                'SALARY_PAYMENT_REVERSAL',
    PENALTY:                      'SALARY_PAYMENT_REVERSAL',
    SHIPPING_SETTLEMENT:          'SHIPPING_SETTLEMENT_REVERSAL',
    SHIPPING_SETTLEMENT_REVERSAL: 'SHIPPING_SETTLEMENT',
    SHIPPING_EXPENSE:             'GENERAL_EXPENSE_REVERSAL',
    RETURN_LOSS:                  'GENERAL_EXPENSE_REVERSAL',
    GENERAL_EXPENSE:              'GENERAL_EXPENSE_REVERSAL',
    GENERAL_EXPENSE_REVERSAL:     'GENERAL_EXPENSE',
  };
  return REVERSAL[eventType] || eventType;
}

// ══════════════════════════════════════════════════════════════════
// Internal Handlers
// ══════════════════════════════════════════════════════════════════

async function handleVendorPayment(db, p) {
  const batch = writeBatch(db);
  const supCategory = p.supplierType === 'shipper' ? 'shipper_payment' : 'printer_payment';

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(-p.amount) });
    console.log('[FSE] 💳 balance updated:', p.walletId, '-', p.amount);
  }

  const payRef = doc(collection(db, 'supplier_payments'));
  batch.set(payRef, {
    supplierId: p.supplierId, supplierName: p.supplierName, supplierType: p.supplierType || 'printer',
    amount: p.amount, walletId: p.walletId || '',
    note: p.note || '', date: p.date || new Date().toLocaleDateString('ar-EG'),
    createdAt: serverTimestamp(), createdBy: p.userId || '',
  });

  const txRef = doc(collection(db, 'transactions_v2'));
  // description ذكي: اسم المورد دائماً + ملاحظة لو وُجدت
  const supLbl = p.supplierType === 'shipper' ? 'دفعة شركة شحن' : 'دفعة مورد';
  const supDescription = `${supLbl}${p.supplierName ? ' — ' + p.supplierName : ''}${p.note ? ' — ' + p.note : ''}`;
  batch.set(txRef, {
    walletId: p.walletId || '', walletName: p.walletName || '',
    type: 'out', amount: p.amount, fees: 0,
    description: supDescription, category: supCategory,
    supplierId: p.supplierId, supplierName: p.supplierName,
    spId: payRef.id,
    note: p.note || '',
    date: p.date || new Date().toLocaleDateString('ar-EG'),
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
    ...approvalFields(),
  });
  console.log('[FSE] 🏭 module updated: supplier_payments + transactions_v2');

  addLedgerToBatch(batch, db, 'VENDOR_PAYMENT', {
    ...p, vendorId: p.supplierId, vendorName: p.supplierName, notes: p.note,
    categoryOverride: supCategory,
  });

  await batch.commit();
  console.log('[FSE] 📊 dashboard updated via financial_ledger');
  console.log('[FSE] ✅ completed: VENDOR_PAYMENT', { payId: payRef.id });
  return { payId: payRef.id, txId: txRef.id };
}

async function handleVendorPaymentReversal(db, p) {
  const batch = writeBatch(db);
  const supCategory = p.supplierType === 'shipper' ? 'shipper_payment' : 'printer_payment';

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(p.amount) });
    console.log('[FSE] 💳 balance updated:', p.walletId, '+', p.amount);
  }

  batch.delete(doc(db, 'supplier_payments', p.paymentId));

  const revTxRef = doc(collection(db, 'transactions_v2'));
  batch.set(revTxRef, {
    walletId: p.walletId || '', walletName: p.walletName || '',
    type: 'in', amount: p.amount, fees: 0,
    description: `إلغاء دفعة — ${p.supplierName}`, category: supCategory,
    supplierId: p.supplierId, supplierName: p.supplierName,
    isReversal: true,
    date: new Date().toLocaleDateString('ar-EG'),
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
    ...approvalFields(),
  });
  console.log('[FSE] 🏭 module updated: supplier_payment deleted + reversal transactions_v2');

  addLedgerToBatch(batch, db, 'VENDOR_PAYMENT_REVERSAL', {
    ...p, vendorId: p.supplierId, vendorName: p.supplierName,
    notes: `إلغاء دفعة — ${p.supplierName}`,
    categoryOverride: supCategory,
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
  // description ذكي: نوع الحركة + اسم الموظف + الشهر + الملاحظة
  const sLabel = isDeduction ? 'خصم' : (p.salaryType === 'bonus' ? 'مكافأة' : p.salaryType === 'advance' ? 'سلفة' : 'راتب');
  const empPart = p.employeeName ? ` — ${p.employeeName}` : '';
  const monthPart = p.month ? ` (${p.month})` : '';
  const notePart = p.note ? ` — ${p.note}` : '';
  const txDescription = `${sLabel}${empPart}${monthPart}${notePart}`;
  batch.set(txRef, {
    walletId: p.walletId, walletName: p.walletName || '',
    type: isDeduction ? 'in' : 'out', amount: p.amount,
    description: txDescription, category: 'salary',
    salaryType: p.salaryType, employeeId: p.employeeId, employeeName: p.employeeName,
    baseSalary: p.baseSalary || 0, commission: p.commission || 0,
    absenceDeduction: p.absenceDeduction || 0, attendanceBonus: p.attendanceBonus || 0,
    daysPresent: p.daysPresent ?? null, daysAbsent: p.daysAbsent ?? null,
    month: p.month, isDeduction, epId: epRef.id,
    date: p.date || new Date().toLocaleDateString('ar-EG'),
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
    ...approvalFields(),
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
  // p.employees: [{employeeId, employeeName, amount,
  //                baseSalary?, commission?, daysPresent?, daysAbsent?,
  //                absenceDeduction?, attendanceBonus?}]
  // ملاحظة: snapshot fields اختيارية لكنها مهمة — تثبّت حالة الراتب وقت
  //         تشغيل المسير حتى لو عُدِّل سجل الحضور لاحقاً.
  const batch = writeBatch(db);

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(-p.totalAmount) });
    console.log('[FSE] 💳 balance updated:', p.walletId, '-', p.totalAmount);
  }

  for (const e of p.employees) {
    const epRef = doc(collection(db, 'employee_payments'));
    const txRef = doc(collection(db, 'transactions_v2'));
    // snapshot fields — نخزّنها مع الـ tx والـ ep حتى تظل صورة الراتب ثابتة
    const snap = {
      baseSalary:        e.baseSalary        ?? 0,
      commission:        e.commission        ?? 0,
      absenceDeduction:  e.absenceDeduction  ?? 0,
      attendanceBonus:   e.attendanceBonus   ?? 0,
      daysPresent:       e.daysPresent       ?? null,
      daysAbsent:        e.daysAbsent        ?? null,
    };
    batch.set(epRef, {
      employeeId: e.employeeId, employeeName: e.employeeName,
      amount: e.amount, month: p.month,
      walletId: p.walletId, walletName: p.walletName || '',
      note: p.note, date: p.date || new Date().toLocaleDateString('ar-EG'),
      txId: txRef.id,
      ...snap,
      createdAt: serverTimestamp(), createdBy: p.userId || '',
    });

    batch.set(txRef, {
      walletId: p.walletId, walletName: p.walletName || '',
      type: 'out', amount: e.amount,
      description: `${p.note} — ${e.employeeName}`, category: 'salary',
      employeeId: e.employeeId, employeeName: e.employeeName,
      month: p.month, isDeduction: false, epId: epRef.id,
      ...snap,
      date: p.date || new Date().toLocaleDateString('ar-EG'),
      createdBy: p.userId || '', createdByName: p.userName || '',
      createdAt: serverTimestamp(), source: 'payroll',
      ...approvalFields(),
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
  // p.orderData: {totalPaid, salePrice, discount, customerShipFee} — pre-fetched by caller if needed
  // p.eventType: 'CUSTOMER_PAYMENT' (دفعة → in) أو 'CUSTOMER_REFUND' (استرداد → out)
  const evtType = p.eventType || 'CUSTOMER_PAYMENT';
  const isRefund = evtType === 'CUSTOMER_REFUND';
  const sign = isRefund ? -1 : +1;
  const batch = writeBatch(db);

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(sign * p.amount) });
    console.log('[FSE] 💳 balance updated:', p.walletId, sign > 0 ? '+' : '-', p.amount);
  }

  // description ذكي: يضم اسم العميل دائماً + الملاحظة لو وُجدت
  const baseLbl = isRefund ? 'استرداد' : 'دفعة عميل';
  const clientPart = p.clientName ? ` — ${p.clientName}` : '';
  const notePart = p.note ? ` — ${p.note}` : '';
  const txDescription = `${baseLbl}${clientPart}${notePart}`;

  const txRef = doc(collection(db, 'transactions_v2'));
  batch.set(txRef, {
    walletId: p.walletId || '', walletName: p.walletName || '',
    type: isRefund ? 'out' : 'in', amount: p.amount,
    description: txDescription,
    category: p.txCategory || (isRefund ? 'refund' : 'client_payment'),
    orderId: p.orderId || null, clientId: p.clientId || null, clientName: p.clientName || '',
    note: p.note || '',
    date: p.date || new Date().toLocaleDateString('ar-EG'),
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
    ...approvalFields(),
  });
  console.log('[FSE] 🏭 module updated: transactions_v2');

  if (p.orderId && p.orderData) {
    const payment = calcOrderPayment(p.orderData, sign * p.amount);
    batch.update(doc(db, 'orders', p.orderId), {
      ...payment,
      lastPaymentDate: p.date || new Date().toLocaleDateString('ar-EG'),
    });
    console.log('[FSE] 📦 module updated: order payment fields', payment);
  }

  addLedgerToBatch(batch, db, evtType, { ...p, notes: p.note || txDescription });

  await batch.commit();
  console.log('[FSE] 📊 dashboard updated via financial_ledger');
  console.log('[FSE] ✅ completed:', evtType);
  return { txId: txRef.id };
}

async function handleShippingSettlement(db, p) {
  // p: { walletId, walletName, amount, companyName, orderIds[], expectedAmount, difference,
  //      diffReason, diffReasonLabel, diffNote, note, date, userId, userName,
  //      orderUpdates: [{orderId, totalPaid, remaining, paymentStatus, dueByCo}] }
  if (!p.walletId) throw new Error('[FSE] SHIPPING_SETTLEMENT: walletId مطلوب');
  if (!(p.amount > 0)) throw new Error('[FSE] SHIPPING_SETTLEMENT: amount غير صالح');

  const batch = writeBatch(db);
  const dateStr = p.date || new Date().toLocaleDateString('ar-EG');

  batch.update(doc(db, 'wallets', p.walletId), { balance: increment(p.amount) });

  const txRef = doc(collection(db, 'transactions_v2'));
  batch.set(txRef, {
    walletId: p.walletId, walletName: p.walletName || '',
    type: 'in', amount: p.amount, fees: 0,
    description: `تسوية شحن — ${p.companyName || ''}`,
    category: 'shipping_settlement',
    companyName: p.companyName || '', orderIds: p.orderIds || [],
    expectedAmount: p.expectedAmount || 0, difference: p.difference || 0,
    diffReason: p.diffReason || '', diffReasonLabel: p.diffReasonLabel || '',
    diffNote: p.diffNote || '',
    note: p.note || '', date: dateStr,
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
    ...approvalFields(),
  });

  const settleRef = doc(collection(db, 'shipping_settlements'));
  batch.set(settleRef, {
    companyName: p.companyName || '', amount: p.amount,
    orderIds: p.orderIds || [], expectedAmount: p.expectedAmount || 0,
    difference: p.difference || 0, diffReason: p.diffReason || '',
    diffReasonLabel: p.diffReasonLabel || '', diffNote: p.diffNote || '',
    walletId: p.walletId, walletName: p.walletName || '',
    note: p.note || '', date: dateStr, txId: txRef.id,
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
  });

  // تحديث الأوردرات في نفس الـ batch
  for (const u of (p.orderUpdates || [])) {
    if (!u.orderId) continue;
    batch.update(doc(db, 'orders', u.orderId), {
      shipSettled: true, shipSettledAmount: u.dueByCo || 0,
      shipSettledWalletId: p.walletId,
      totalPaid: u.totalPaid, remaining: u.remaining,
      paymentStatus: u.paymentStatus,
      ...(u.timelineEntry ? { timeline: u.timeline } : {}),
      updatedAt: serverTimestamp(),
    });
  }

  addLedgerToBatch(batch, db, 'SHIPPING_SETTLEMENT', {
    amount: p.amount, walletId: p.walletId, walletName: p.walletName || '',
    notes: `تسوية شحن — ${p.companyName || ''}${p.diffReasonLabel ? ' — فرق: ' + p.diffReasonLabel : ''}`,
    refId: settleRef.id,
    userId: p.userId, userName: p.userName,
  });

  await batch.commit();
  console.log('[FSE] ✅ completed: SHIPPING_SETTLEMENT', { settleId: settleRef.id });
  return { settleId: settleRef.id, txId: txRef.id };
}

async function handleShippingSettlementReversal(db, p) {
  // p: { settlementId, walletId, walletName, amount, companyName, orderIds[],
  //      orderUpdates: [{orderId, totalPaid, remaining, paymentStatus}], userId, userName, date? }
  if (!p.settlementId) throw new Error('[FSE] SHIPPING_SETTLEMENT_REVERSAL: settlementId مطلوب');
  if (!p.walletId) throw new Error('[FSE] SHIPPING_SETTLEMENT_REVERSAL: walletId مطلوب');
  if (!(p.amount > 0)) throw new Error('[FSE] SHIPPING_SETTLEMENT_REVERSAL: amount غير صالح');

  const batch = writeBatch(db);
  const dateStr = p.date || new Date().toLocaleDateString('ar-EG');

  batch.update(doc(db, 'wallets', p.walletId), { balance: increment(-p.amount) });

  const txRef = doc(collection(db, 'transactions_v2'));
  batch.set(txRef, {
    walletId: p.walletId, walletName: p.walletName || '',
    type: 'out', amount: p.amount, fees: 0,
    description: `إلغاء تسوية شحن — ${p.companyName || ''}`,
    category: 'shipping_settlement', isReversal: true,
    settlementId: p.settlementId,
    date: dateStr,
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
    ...approvalFields(),
  });

  batch.delete(doc(db, 'shipping_settlements', p.settlementId));

  for (const u of (p.orderUpdates || [])) {
    if (!u.orderId) continue;
    batch.update(doc(db, 'orders', u.orderId), {
      shipSettled: false, shipSettledAmount: 0, shipSettledWalletId: '',
      totalPaid: u.totalPaid, remaining: u.remaining,
      paymentStatus: u.paymentStatus,
      updatedAt: serverTimestamp(),
    });
  }

  addLedgerToBatch(batch, db, 'SHIPPING_SETTLEMENT_REVERSAL', {
    amount: p.amount, walletId: p.walletId, walletName: p.walletName || '',
    notes: `إلغاء تسوية شحن — ${p.companyName || ''}`,
    refId: p.settlementId,
    userId: p.userId, userName: p.userName,
  });

  await batch.commit();
  console.log('[FSE] ✅ completed: SHIPPING_SETTLEMENT_REVERSAL');
  return {};
}

async function handleWalletTransfer(db, p) {
  // p: { fromWalletId, fromWalletName, toWalletId, toWalletName, amount, note?, date?, userId, userName }
  if (!p.fromWalletId || !p.toWalletId) throw new Error('[FSE] WALLET_TRANSFER: fromWalletId و toWalletId مطلوبان');
  if (p.fromWalletId === p.toWalletId) throw new Error('[FSE] WALLET_TRANSFER: المحفظتان متماثلتان');
  if (!(p.amount > 0)) throw new Error('[FSE] WALLET_TRANSFER: amount غير صالح');

  const batch = writeBatch(db);
  batch.update(doc(db, 'wallets', p.fromWalletId), { balance: increment(-p.amount) });
  batch.update(doc(db, 'wallets', p.toWalletId),   { balance: increment(p.amount) });

  const transferGroupId = doc(collection(db, 'transactions_v2')).id;
  const dateStr = p.date || new Date().toLocaleDateString('ar-EG');

  const outRef = doc(collection(db, 'transactions_v2'));
  batch.set(outRef, {
    walletId: p.fromWalletId, walletName: p.fromWalletName || '',
    type: 'out', amount: p.amount, fees: 0,
    description: `🔄 تحويل إلى: ${p.toWalletName || ''}${p.note ? ' — ' + p.note : ''}`,
    category: 'transfer', transferGroupId, transferTo: p.toWalletId,
    date: dateStr,
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
    ...approvalFields(),
  });

  const inRef = doc(collection(db, 'transactions_v2'));
  batch.set(inRef, {
    walletId: p.toWalletId, walletName: p.toWalletName || '',
    type: 'in', amount: p.amount, fees: 0,
    description: `🔄 تحويل من: ${p.fromWalletName || ''}${p.note ? ' — ' + p.note : ''}`,
    category: 'transfer', transferGroupId, transferFrom: p.fromWalletId,
    date: dateStr,
    createdBy: p.userId || '', createdByName: p.userName || '',
    createdAt: serverTimestamp(),
    ...approvalFields(),
  });

  addLedgerToBatch(batch, db, 'WALLET_TRANSFER', {
    amount: p.amount, walletId: p.fromWalletId, walletName: p.fromWalletName || '',
    notes: `تحويل من ${p.fromWalletName || ''} إلى ${p.toWalletName || ''}${p.note ? ' — ' + p.note : ''}`,
    userId: p.userId, userName: p.userName,
  });

  await batch.commit();
  console.log('[FSE] ✅ completed: WALLET_TRANSFER');
  return { transferGroupId };
}

async function handleGeneralExpense(db, p) {
  const isReverse = p._reverse === true;
  const sign = isReverse ? +1 : -1;
  const batch = writeBatch(db);

  if (p.walletId) {
    batch.update(doc(db, 'wallets', p.walletId), { balance: increment(sign * p.amount) });
    console.log('[FSE] 💳 balance updated:', p.walletId, sign > 0 ? '+' : '-', p.amount);
  }

  if (p.walletId && p.createTx !== false) {
    const txRef = doc(collection(db, 'transactions_v2'));
    // description ذكي: لو الـcaller مرّر description نستخدمه، وإلا نبني من eventType + entity name
    const evtLabels = {
      GENERAL_EXPENSE: 'مصروف عام',
      GENERAL_EXPENSE_REVERSAL: 'إلغاء مصروف',
      SHIPPING_EXPENSE: 'تكلفة شحن',
      RETURN_LOSS: 'خسارة مرتجع',
    };
    const baseLbl = evtLabels[p.eventType] || (isReverse ? 'إلغاء مصروف' : 'مصروف');
    const entityPart = p.vendorName ? ` — ${p.vendorName}` : (p.clientName ? ` — ${p.clientName}` : (p.employeeName ? ` — ${p.employeeName}` : ''));
    const notePart = p.note ? ` — ${p.note}` : '';
    const txDescription = p.description || `${baseLbl}${entityPart}${notePart}`;
    batch.set(txRef, {
      walletId: p.walletId || '', walletName: p.walletName || '',
      type: isReverse ? 'in' : 'out', amount: p.amount,
      description: txDescription, category: p.txCategory || 'expense',
      orderId: p.orderId || null,
      vendorId: p.vendorId || null, vendorName: p.vendorName || '',
      employeeId: p.employeeId || null, employeeName: p.employeeName || '',
      clientId: p.clientId || null, clientName: p.clientName || '',
      isReversal: isReverse || undefined,
      date: p.date || new Date().toLocaleDateString('ar-EG'),
      createdBy: p.userId || '', createdByName: p.userName || '',
      createdAt: serverTimestamp(),
      ...approvalFields(),
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
  GENERAL_EXPENSE:          handleGeneralExpense,
  GENERAL_EXPENSE_REVERSAL: (db, p) => handleGeneralExpense(db, { ...p, eventType: 'GENERAL_EXPENSE_REVERSAL', txCategory: p.txCategory || 'expense_reversal', _reverse: true }),
  SHIPPING_EXPENSE:         (db, p) => handleGeneralExpense(db, { ...p, txCategory: 'shipping_cost', eventType: 'SHIPPING_EXPENSE' }),
  RETURN_LOSS:              (db, p) => handleGeneralExpense(db, { ...p, txCategory: 'return_loss', eventType: 'RETURN_LOSS' }),
  WALLET_TRANSFER:          handleWalletTransfer,
  SHIPPING_SETTLEMENT:           handleShippingSettlement,
  SHIPPING_SETTLEMENT_REVERSAL:  handleShippingSettlementReversal,
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
