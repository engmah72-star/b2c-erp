/**
 * finance-engine.js — محرك الحسابات المالي المركزي
 * Firebase v10 ES module
 *
 * يُسجّل كل حركة مالية في مجموعة financial_ledger
 * ويوفّر builders جاهزة لكل نوع حركة في النظام
 */
import {
  addDoc, collection, doc, updateDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ══════════════════════════════════════════
// LEDGER CATEGORIES — تصنيفات دفتر الأستاذ
// ══════════════════════════════════════════
export const LC = {
  // دخل
  ORDER_REVENUE:    { type:'order_revenue',    dir:'income',  icon:'📋', catAr:'إيراد أوردر' },
  COLLECTION:       { type:'collection',        dir:'income',  icon:'💰', catAr:'تحصيل دفعة' },
  EXTRA_CHARGE:     { type:'extra_charge',      dir:'income',  icon:'➕', catAr:'رسوم إضافية' },
  RETURN_RECOVERY:  { type:'return_recovery',   dir:'income',  icon:'↩️', catAr:'استرداد مرتجع' },
  // مصروف
  VENDOR_PAYMENT:   { type:'vendor_payment',    dir:'expense', icon:'🏭', catAr:'دفعة مورّد' },
  PRINTING_COST:    { type:'printing_cost',     dir:'expense', icon:'🖨️', catAr:'تكلفة طباعة' },
  SHIPPING_COST:    { type:'shipping_cost',     dir:'expense', icon:'🚚', catAr:'تكلفة شحن' },
  RETURN_LOSS:      { type:'return_loss',       dir:'expense', icon:'⚠️', catAr:'خسارة مرتجع' },
  SALARY:           { type:'salary',            dir:'expense', icon:'👤', catAr:'مرتب موظف' },
  ADVANCE:          { type:'advance',           dir:'expense', icon:'💸', catAr:'سلفة موظف' },
  BONUS:            { type:'bonus',             dir:'expense', icon:'🎁', catAr:'مكافأة موظف' },
  COMMISSION:       { type:'commission',        dir:'expense', icon:'📈', catAr:'عمولة' },
  DEDUCTION:        { type:'deduction',         dir:'income',  icon:'✂️', catAr:'خصم موظف' },
  REFUND:           { type:'refund',            dir:'expense', icon:'🔄', catAr:'استرداد للعميل' },
  OFFICE_EXPENSE:   { type:'office_expense',    dir:'expense', icon:'🏢', catAr:'مصروف إداري' },
  MARKETING:        { type:'marketing',         dir:'expense', icon:'📢', catAr:'تسويق' },
  EQUIPMENT:        { type:'equipment',         dir:'expense', icon:'🔧', catAr:'معدات' },
};

// خريطة تحويل من transactions_v2 categories → LC
export const CATEGORY_MAP = {
  collection:           LC.COLLECTION,
  deferred_collection:  LC.COLLECTION,
  shipping_cost:        LC.SHIPPING_COST,
  salary:               LC.SALARY,
  advance:              LC.ADVANCE,
  bonus:                LC.BONUS,
  commission:           LC.COMMISSION,
  deduction:            LC.DEDUCTION,
  office:               LC.OFFICE_EXPENSE,
  marketing:            LC.MARKETING,
  equipment:            LC.EQUIPMENT,
};

// ══════════════════════════════════════════
// CORE: recordLedger — تسجيل قيد في الدفتر
// ══════════════════════════════════════════
/**
 * يضيف قيد جديد لـ financial_ledger
 * entry: { lc, amount, orderId?, clientId?, clientName?, employeeId?, employeeName?,
 *          vendorId?, vendorName?, shippingCompanyId?, shippingCompanyName?,
 *          notes?, walletId?, walletName?, ref? }
 * لا يرمي exception — يرجع { id } أو { error }
 */
export async function recordLedger(db, entry) {
  try {
    const lc = entry.lc || LC.OFFICE_EXPENSE;
    const docData = {
      // تصنيف
      type:        lc.type,
      category:    lc.catAr,
      direction:   lc.dir,
      icon:        lc.icon,
      // مبلغ
      amount:      parseFloat(entry.amount) || 0,
      // روابط الكيانات
      orderId:           entry.orderId           || '',
      clientId:          entry.clientId          || '',
      clientName:        entry.clientName        || '',
      employeeId:        entry.employeeId        || '',
      employeeName:      entry.employeeName      || '',
      vendorId:          entry.vendorId          || '',
      vendorName:        entry.vendorName        || '',
      shippingCompanyId: entry.shippingCompanyId || '',
      shippingCompanyName: entry.shippingCompanyName || '',
      // دفع
      walletId:    entry.walletId   || '',
      walletName:  entry.walletName || '',
      paymentRef:  entry.ref        || '',
      // وصف
      notes:       entry.notes      || '',
      // حالة
      isDeleted:   false,
      editHistory: [],
      // metadata
      createdBy:   entry.createdBy   || '',
      createdByName: entry.createdByName || '',
      createdAt:   serverTimestamp(),
    };
    const ref = await addDoc(collection(db, 'financial_ledger'), docData);
    return { id: ref.id };
  } catch (e) {
    console.warn('[finance-engine] recordLedger error:', e.message);
    return { error: e.message };
  }
}

// ══════════════════════════════════════════
// ADMIN: edit / delete قيد في الدفتر
// ══════════════════════════════════════════
export async function editLedgerEntry(db, entryId, changes, adminName, adminId) {
  try {
    const snap = await getDoc(doc(db, 'financial_ledger', entryId));
    if (!snap.exists()) return { error: 'القيد غير موجود' };
    const before = snap.data();
    const diff = Object.entries(changes).map(([field, after]) => ({
      field, before: before[field] ?? null, after
    }));
    await updateDoc(doc(db, 'financial_ledger', entryId), {
      ...changes,
      editHistory: [...(before.editHistory || []), {
        editedBy: adminName, editedById: adminId,
        editedAt: new Date().toISOString(), changes: diff
      }],
    });
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

export async function deleteLedgerEntry(db, entryId, adminName, adminId) {
  try {
    const snap = await getDoc(doc(db, 'financial_ledger', entryId));
    if (!snap.exists()) return { error: 'القيد غير موجود' };
    const before = snap.data();
    await updateDoc(doc(db, 'financial_ledger', entryId), {
      isDeleted: true,
      editHistory: [...(before.editHistory || []), {
        editedBy: adminName, editedById: adminId,
        editedAt: new Date().toISOString(), changes: [{ field:'isDeleted', before:false, after:true }]
      }],
    });
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ══════════════════════════════════════════
// ENTRY BUILDERS — بناة القيود الجاهزة
// ══════════════════════════════════════════

/** تحصيل دفعة على أوردر */
export function entryCollection(order, amount, userName, uid, walletId, walletName, ref) {
  return {
    lc: LC.COLLECTION,
    amount,
    orderId:    order._id || order.id || '',
    clientId:   order.clientId   || '',
    clientName: order.clientName || '',
    walletId:   walletId  || '',
    walletName: walletName || '',
    ref:        ref || '',
    notes:      `تحصيل — ${order.clientName || ''} — ${order.orderId || ''}`,
    createdBy: uid, createdByName: userName,
  };
}

/** إيراد أوردر جديد (عند إنشاء الأوردر) */
export function entryOrderRevenue(order, userName, uid) {
  return {
    lc: LC.ORDER_REVENUE,
    amount:     parseFloat(order.salePrice) || parseFloat(order.totalSale) || 0,
    orderId:    order._id || order.id || '',
    clientId:   order.clientId   || '',
    clientName: order.clientName || '',
    notes:      `إيراد أوردر — ${order.clientName || ''} — ${order.orderId || ''}`,
    createdBy: uid, createdByName: userName,
  };
}

/** تكلفة شحن أوردر */
export function entryShippingCost(order, shipCost, companyName, userName, uid) {
  return {
    lc: LC.SHIPPING_COST,
    amount:              shipCost,
    orderId:             order._id || order.id || '',
    clientName:          order.clientName || '',
    shippingCompanyName: companyName || '',
    notes:               `تكلفة شحن — ${order.clientName || ''} — ${companyName || ''}`,
    createdBy: uid, createdByName: userName,
  };
}

/** تكلفة تنفيذ / طباعة من قسم الإنتاج */
export function entryProductionCost(order, costItem, userName, uid) {
  return {
    lc: costItem.type === 'printing' ? LC.PRINTING_COST : LC.VENDOR_PAYMENT,
    amount:      parseFloat(costItem.total) || parseFloat(costItem.totalCost) || 0,
    orderId:     order._id || order.id || '',
    clientName:  order.clientName || '',
    vendorId:    costItem.supplierId   || '',
    vendorName:  costItem.supplierName || '',
    notes:       `تكلفة تنفيذ — ${costItem.type || ''} — ${order.clientName || ''}`,
    createdBy: uid, createdByName: userName,
  };
}

/** خسارة مرتجع */
export function entryReturnLoss(order, lostAmount, reason, userName, uid) {
  return {
    lc: LC.RETURN_LOSS,
    amount:     lostAmount,
    orderId:    order._id || order.id || '',
    clientId:   order.clientId   || '',
    clientName: order.clientName || '',
    notes:      `خسارة مرتجع — ${reason || ''} — ${order.clientName || ''}`,
    createdBy: uid, createdByName: userName,
  };
}

/** استرداد كامل للعميل */
export function entryRefund(order, amount, reason, userName, uid) {
  return {
    lc: LC.REFUND,
    amount,
    orderId:    order._id || order.id || '',
    clientId:   order.clientId   || '',
    clientName: order.clientName || '',
    notes:      `استرداد للعميل — ${reason || ''} — ${order.clientName || ''}`,
    createdBy: uid, createdByName: userName,
  };
}

/** دفعة لمورّد */
export function entryVendorPayment(supplierId, supplierName, amount, note, userName, uid, walletId, walletName) {
  return {
    lc: LC.VENDOR_PAYMENT,
    amount,
    vendorId:   supplierId   || '',
    vendorName: supplierName || '',
    walletId:   walletId     || '',
    walletName: walletName   || '',
    notes:      note || `دفعة مورّد — ${supplierName || ''}`,
    createdBy: uid, createdByName: userName,
  };
}

/** مرتب موظف */
export function entrySalary(empId, empName, amount, salType, month, note, userName, uid, walletId, walletName) {
  const lcMap = {
    salary:    LC.SALARY,
    advance:   LC.ADVANCE,
    bonus:     LC.BONUS,
    commission:LC.COMMISSION,
    deduction: LC.DEDUCTION,
  };
  return {
    lc: lcMap[salType] || LC.SALARY,
    amount,
    employeeId:   empId   || '',
    employeeName: empName || '',
    walletId:     walletId  || '',
    walletName:   walletName || '',
    notes:        note || `${salType || 'مرتب'} — ${empName || ''} — ${month || ''}`,
    createdBy: uid, createdByName: userName,
  };
}

/** مصروف عام (إداري / تسويق / معدات) */
export function entryGeneralExpense(lc, amount, note, userName, uid, walletId, walletName) {
  return {
    lc: lc || LC.OFFICE_EXPENSE,
    amount,
    walletId:  walletId  || '',
    walletName: walletName || '',
    notes:     note || '',
    createdBy: uid, createdByName: userName,
  };
}
