/**
 * Business2Card ERP — supplier-actions.js
 *
 * ━━━ CENTRAL SUPPLIER ACTIONS (RULE A1 + P1) ━━━
 *
 * طبقة الأفعال المركزية لإدارة الموردين + دفعاتهم.
 *
 * Two-collection model (لا duplicate — قرار معماري):
 *   - suppliers_v2  → printers فقط (supType:'printer')
 *   - shippers_v2   → shippers فقط (supType:'shipper')
 *
 * كل CRUD يمر من هنا — لا inline writes في suppliers.html.
 *
 * Capability separation (RULE P1):
 *   - manage_suppliers           → CRUD على master data
 *   - manage_supplier_payments   → financial (payments + reversals)
 *
 * Financial integrity (RULE 1 + 2 + G6):
 *   كل payment يمر عبر financial-sync-engine.js
 *   (FE.VENDOR_PAYMENT / FE.VENDOR_PAYMENT_REVERSAL)
 */

import {
  doc, getDoc, addDoc, updateDoc, deleteDoc, collection,
  query, where, getDocs, limit, serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { canDo } from './core/permissions-matrix.js';
import { dispatchFinancialEvent, FE } from './financial-sync-engine.js';
import { withIdempotency } from './core/idempotency.js';
import { auditEntry, persistAuditLog } from './core/audit.js';

// ══════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════

export const SUPPLIER_TYPES = Object.freeze({
  PRINTER: 'printer',
  SHIPPER: 'shipper',
});

/** يرجّع اسم الـ collection حسب النوع */
function _collectionFor(supType) {
  return supType === 'shipper' ? 'shippers_v2' : 'suppliers_v2';
}

// ══════════════════════════════════════════
// VALIDATION
// ══════════════════════════════════════════

function _validateSupplierData(data) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object') {
    errors.push('بيانات المورد مفقودة');
    return { errors, warnings };
  }
  if (!data.name || !String(data.name).trim()) errors.push('اسم المورد مطلوب');
  if (!data.supType || !['printer', 'shipper'].includes(data.supType)) {
    errors.push(`supType غير معروف — المسموح: printer | shipper`);
  }
  // printer-specific
  if (data.supType === 'printer') {
    if (data.creditLimit !== undefined && parseFloat(data.creditLimit) < 0) {
      errors.push('creditLimit لا يمكن أن يكون سالباً');
    }
    if (data.minQty !== undefined && parseInt(data.minQty) < 0) {
      errors.push('minQty لا يمكن أن يكون سالباً');
    }
  }
  // shipper-specific
  if (data.supType === 'shipper') {
    if (data.shipFee !== undefined && parseFloat(data.shipFee) < 0) {
      errors.push('shipFee لا يمكن أن يكون سالباً');
    }
  }
  return { errors, warnings };
}

function _validatePaymentData({ amount, walletId, supplierId, supplierName }) {
  const errors = [];
  const amt = parseFloat(amount) || 0;
  if (amt <= 0) errors.push('قيمة الدفعة يجب أن تكون أكبر من صفر');
  if (!walletId) errors.push('يجب اختيار المحفظة');
  if (!supplierId) errors.push('supplierId مطلوب');
  if (!supplierName) errors.push('supplierName مطلوب (للـ audit trail)');
  return { errors, warnings: [] };
}

function _checkManagePermission(role, userPerms) {
  if (!canDo('manage_suppliers', role, userPerms)) {
    return 'ليس لديك صلاحية إدارة الموردين (manage_suppliers)';
  }
  return null;
}

function _checkPaymentPermission(role, userPerms) {
  if (!canDo('manage_supplier_payments', role, userPerms)) {
    return 'ليس لديك صلاحية تسجيل دفعات الموردين (manage_supplier_payments)';
  }
  return null;
}

// ══════════════════════════════════════════
// PUBLIC API — CRUD ACTIONS
// ══════════════════════════════════════════

export const supplierActions = {

  /**
   * إنشاء مورد جديد (printer أو shipper).
   * @returns { ok, errors, warnings, supplierId, supType }
   */
  async create({ db, data, role, userId, userName, userPerms }) {
    const permErr = _checkManagePermission(role, userPerms);
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    const v = _validateSupplierData(data);
    if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings };

    const col = _collectionFor(data.supType);
    try {
      const ref = await addDoc(collection(db, col), {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: userId || '',
        createdByName: userName || '',
      });
      auditEntry({ action: 'supplier.create', userId, userName, kind: 'op', meta: { supplierId: ref.id, supType: data.supType, name: data.name } });
      persistAuditLog(db);
      return {
        ok: true, errors: [], warnings: v.warnings,
        supplierId: ref.id, supType: data.supType, collection: col,
        action: 'create',
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الإنشاء'], warnings: [] };
    }
  },

  /**
   * تحديث مورد موجود.
   * @param {string} supType — مطلوب لمعرفة الـ collection الصحيحة
   */
  async update({ db, supplierId, supType, data, role, userId, userName, userPerms }) {
    const permErr = _checkManagePermission(role, userPerms);
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    if (!supplierId) return { ok: false, errors: ['supplierId مطلوب'], warnings: [] };
    if (!supType) return { ok: false, errors: ['supType مطلوب (printer/shipper)'], warnings: [] };

    const v = _validateSupplierData({ ...data, supType });
    if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings };

    const col = _collectionFor(supType);
    try {
      await updateDoc(doc(db, col, supplierId), {
        ...data,
        updatedAt: serverTimestamp(),
        updatedBy: userId || '',
        updatedByName: userName || '',
      });
      auditEntry({ action: 'supplier.update', userId, userName, kind: 'edit', meta: { supplierId, supType } });
      persistAuditLog(db);
      return {
        ok: true, errors: [], warnings: v.warnings,
        supplierId, supType, action: 'update',
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [] };
    }
  },

  /**
   * فحص استخدام المورد في النظام (Delete Safety).
   * يبحث في:
   *  - orders (cost items)
   *  - supplier_payments
   *  - supplier_orders
   *
   * Note: orders.costItems[] هي array of objects — Firestore لا يدعم
   * array-contains على field داخل object، لذا نستخدم where('supplierId', '==', id)
   * إذا كان denormalized، وإلا نرفع warning.
   */
  async checkReferences({ db, supplierId, sampleLimit = 5 }) {
    if (!db || !supplierId) return { count: 0, breakdown: {}, sample: [] };
    const breakdown = {};
    const sample = [];

    try {
      // 1. supplier_payments — حقل مباشر
      const paySnap = await getDocs(query(
        collection(db, 'supplier_payments'),
        where('supplierId', '==', supplierId),
        limit(sampleLimit + 1)
      ));
      if (paySnap.size > 0) {
        breakdown.payments = paySnap.size;
        sample.push(...paySnap.docs.slice(0, 2).map(d => ({ type: 'payment', id: d.id })));
      }

      // 2. supplier_orders — حقل مباشر
      const soSnap = await getDocs(query(
        collection(db, 'supplier_orders'),
        where('supplierId', '==', supplierId),
        limit(sampleLimit + 1)
      ));
      if (soSnap.size > 0) {
        breakdown.supplier_orders = soSnap.size;
        sample.push(...soSnap.docs.slice(0, 2).map(d => ({ type: 'supplier_order', id: d.id })));
      }

      // 3. orders.costItems[].supplierId — لا fast query
      //    نُرجع warning لأن الفحص الكامل يحتاج اجتياز كل orders
      const totalCount = (breakdown.payments || 0) + (breakdown.supplier_orders || 0);
      return {
        count: totalCount,
        breakdown,
        sample,
        warning: totalCount === 0
          ? 'لا يمكن التحقق من orders.costItems[] (يحتاج اجتياز كامل) — احذف بحذر أو استخدم archive'
          : null,
        method: 'direct-fields',
      };
    } catch (e) {
      return { count: 0, breakdown: {}, sample: [], error: e.message };
    }
  },

  /**
   * حذف مورد — مع Delete Safety.
   * إذا كان مستخدماً، يرفض ويقترح archive.
   *
   * @param {boolean} [force=false] — تجاوز الـ safety (admin override)
   */
  async delete({ db, supplierId, supType, role, userId, userName, userPerms, force = false }) {
    const permErr = _checkManagePermission(role, userPerms);
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    if (!supplierId) return { ok: false, errors: ['supplierId مطلوب'], warnings: [] };
    if (!supType) return { ok: false, errors: ['supType مطلوب'], warnings: [] };

    // Delete Safety
    const refs = await supplierActions.checkReferences({ db, supplierId });
    if (refs.count > 0 && !force) {
      const breakdown = Object.entries(refs.breakdown)
        .map(([k, v]) => `${k}: ${v}+`).join(', ');
      return {
        ok: false,
        errors: [`المورد مستخدم في النظام (${breakdown}) — استخدم archive بدل delete، أو مرّر force:true`],
        warnings: [],
        references: refs,
      };
    }
    if (refs.warning && !force) {
      return {
        ok: false, errors: [], warnings: [refs.warning],
        needsConfirmation: true, references: refs,
      };
    }

    const col = _collectionFor(supType);
    try {
      await deleteDoc(doc(db, col, supplierId));
      auditEntry({ action: 'supplier.delete', userId, userName, kind: 'op', meta: { supplierId, supType, forced: !!force } });
      persistAuditLog(db);
      return {
        ok: true, errors: [], warnings: [],
        supplierId, supType, action: 'delete',
        forced: !!force, references: refs,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [] };
    }
  },

  /**
   * Soft-archive للمورد (بديل آمن للحذف).
   */
  async archive({ db, supplierId, supType, role, userId, userName, userPerms, reason = '' }) {
    const permErr = _checkManagePermission(role, userPerms);
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    if (!supplierId) return { ok: false, errors: ['supplierId مطلوب'], warnings: [] };
    if (!supType) return { ok: false, errors: ['supType مطلوب'], warnings: [] };

    const col = _collectionFor(supType);
    try {
      await updateDoc(doc(db, col, supplierId), {
        isArchived: true,
        status: 'archived',
        archivedAt: serverTimestamp(),
        archivedBy: userId || '',
        archivedByName: userName || '',
        archiveReason: reason || '',
        updatedAt: serverTimestamp(),
      });
      auditEntry({ action: 'supplier.archive', userId, userName, kind: 'op', meta: { supplierId, supType, reason } });
      persistAuditLog(db);
      return {
        ok: true, errors: [], warnings: [],
        supplierId, supType, action: 'archive',
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الأرشفة'], warnings: [] };
    }
  },

  /**
   * إلغاء الأرشفة.
   */
  async unarchive({ db, supplierId, supType, role, userId, userName, userPerms }) {
    const permErr = _checkManagePermission(role, userPerms);
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    if (!supplierId || !supType) {
      return { ok: false, errors: ['supplierId + supType مطلوبان'], warnings: [] };
    }

    const col = _collectionFor(supType);
    try {
      await updateDoc(doc(db, col, supplierId), {
        isArchived: false,
        status: 'active',
        unarchivedAt: serverTimestamp(),
        unarchivedBy: userId || '',
        updatedAt: serverTimestamp(),
      });
      auditEntry({ action: 'supplier.unarchive', userId, userName, kind: 'op', meta: { supplierId, supType } });
      persistAuditLog(db);
      return { ok: true, errors: [], warnings: [], supplierId, action: 'unarchive' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الاستعادة'], warnings: [] };
    }
  },

  // ══════════════════════════════════════════
  // FINANCIAL ACTIONS (RULE 1 + 2 + G6)
  // ══════════════════════════════════════════

  /**
   * تسجيل دفعة لمورد — عبر FSE (atomic).
   * يفحص manage_supplier_payments capability (مفصول عن manage_suppliers).
   *
   * @param {Array} [args.costItemRefs] — مراجع cost items المرتبطة (اختياري)
   */
  async createPayment({
    db, supplierId, supplierName, supplierType,
    amount, walletId, walletName, note = '',
    costItemRefs = [],
    supplierOrderIds = [],
    role, userId, userName, userPerms,
  }) {
    const permErr = _checkPaymentPermission(role, userPerms);
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    const v = _validatePaymentData({ amount, walletId, supplierId, supplierName });
    if (v.errors.length) return { ok: false, errors: v.errors, warnings: [] };

    const parsedAmount = parseFloat(amount) || 0;
    return withIdempotency(db, {
      actionType: 'supplier_create_payment',
      entityId: supplierId,
      actorId: userId || '',
      payload: { amount: parsedAmount, walletId },
    }, async (operationId) => {
    try {
      const result = await dispatchFinancialEvent(db, FE.VENDOR_PAYMENT, {
        supplierId, supplierName, supplierType,
        amount: parsedAmount,
        walletId, walletName: walletName || '',
        note,
        userId: userId || '', userName: userName || '',
        date: new Date().toISOString().slice(0, 10),
        ...(costItemRefs.length ? { costItemRefs } : {}),
        ...(supplierOrderIds.length ? { supplierOrderIds } : {}),
        operationId,
      });

      // Update linked supplier_orders paidAmount (best-effort, non-financial)
      if (supplierOrderIds.length) {
        const soUpdates = supplierOrderIds.map(soId =>
          updateDoc(doc(db, 'supplier_orders', soId), {
            paidAmount: increment(parsedAmount),
            lastPaymentAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch(e => console.warn('[supplierActions.createPayment] supplier_orders update failed:', soId, e?.message))
        );
        await Promise.all(soUpdates);
      }

      auditEntry({ action: 'supplier.createPayment', userId, userName, kind: 'op', meta: { supplierId, supplierName, amount: parsedAmount, walletId, operationId } });
      persistAuditLog(db);

      return {
        ok: true, errors: [], warnings: [],
        supplierId, action: 'createPayment',
        eventType: FE.VENDOR_PAYMENT, eventResult: result,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل تسجيل الدفعة'], warnings: [] };
    }
    }); // end withIdempotency
  },

  /**
   * عكس دفعة (reversal) — عبر FSE.
   */
  async reversePayment({
    db, paymentId, supplierId, supplierName,
    amount, walletId, walletName,
    supplierOrderIds = [],
    role, userId, userName, userPerms,
    reason = '',
  }) {
    const permErr = _checkPaymentPermission(role, userPerms);
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    if (!paymentId) return { ok: false, errors: ['paymentId مطلوب'], warnings: [] };

    const v = _validatePaymentData({ amount, walletId, supplierId, supplierName });
    if (v.errors.length) return { ok: false, errors: v.errors, warnings: [] };

    const parsedAmount = parseFloat(amount) || 0;
    return withIdempotency(db, {
      actionType: 'supplier_reverse_payment',
      entityId: paymentId,
      actorId: userId || '',
      payload: { amount: parsedAmount, walletId },
    }, async (operationId) => {
    try {
      const result = await dispatchFinancialEvent(db, FE.VENDOR_PAYMENT_REVERSAL, {
        paymentId,
        supplierId, supplierName,
        amount: parsedAmount,
        walletId, walletName: walletName || '',
        note: reason || 'إلغاء دفعة',
        userId: userId || '', userName: userName || '',
        date: new Date().toISOString().slice(0, 10),
        operationId,
      });

      // Decrement linked supplier_orders paidAmount (best-effort, non-financial)
      if (supplierOrderIds.length) {
        const soUpdates = supplierOrderIds.map(soId =>
          updateDoc(doc(db, 'supplier_orders', soId), {
            paidAmount: increment(-parsedAmount),
            updatedAt: serverTimestamp(),
          }).catch(e => console.warn('[supplierActions.reversePayment] supplier_orders update failed:', soId, e?.message))
        );
        await Promise.all(soUpdates);
      }

      auditEntry({ action: 'supplier.reversePayment', userId, userName, kind: 'reversal', meta: { paymentId, supplierId, supplierName, amount: parsedAmount, walletId, reason, operationId } });
      persistAuditLog(db);

      return {
        ok: true, errors: [], warnings: [],
        supplierId, paymentId, action: 'reversePayment',
        eventType: FE.VENDOR_PAYMENT_REVERSAL, eventResult: result,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل عكس الدفعة'], warnings: [] };
    }
    }); // end withIdempotency
  },
};

export default supplierActions;
