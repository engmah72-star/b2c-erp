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
  doc, collection, writeBatch,
  query, where, getDocs, limit, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { canDo } from './core/permissions-matrix.js';
import { dispatchFinancialEvent, FE } from './financial-sync-engine.js';
import { auditEntry } from './core/audit.js';

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
// CENTRALIZATION HELPERS (Supplier Charter)
// ══════════════════════════════════════════

/**
 * مفتاح موحَّد لكشف التكرار (Charter 4 + 7): trim + توحيد المسافات + lowercase.
 * يُخزَّن على المورد (nameKey) ليُستعلَم عنه server-side (Firestore لا يدعم
 * case-insensitive query، فنخزّن النسخة الموحَّدة).
 */
function _nameKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Duplicate guard (Charter principles 4 + 7): يمنع إنشاء ملف مورد مكرر.
 * يطابق على nameKey ثم phone داخل نفس الـ collection. السجلات القديمة
 * بدون nameKey ما زالت تُلتقَط عبر phone.
 * @returns {Promise<null | {id, by, name}>}
 */
async function _findDuplicate(db, col, { nameKey, phone, excludeId = null }) {
  const firstOther = (snap) => snap.docs.find(d => d.id !== excludeId) || null;
  if (nameKey) {
    const snap = await getDocs(query(
      collection(db, col), where('nameKey', '==', nameKey), limit(2)
    ));
    const hit = firstOther(snap);
    if (hit) return { id: hit.id, by: 'name', name: hit.data()?.name || '' };
  }
  const ph = phone && String(phone).trim();
  if (ph) {
    const snap = await getDocs(query(
      collection(db, col), where('phone', '==', ph), limit(2)
    ));
    const hit = firstOther(snap);
    if (hit) return { id: hit.id, by: 'phone', name: hit.data()?.name || '' };
  }
  return null;
}

/**
 * Central activity log (Charter principles 9 + 14; RULE H3).
 * يضيف entry واحد append-only إلى `supplier_activity` داخل نفس الـ batch —
 * المصدر الوحيد لأحداث دورة حياة المورد، قابل للاستعلام بـ supplierId لعرض
 * التاريخ الكامل. النشاط المالي يبقى في financial_ledger (لا تكرار — principle 13).
 */
function _logActivity(batch, db, { supplierId, supType, action, kind = 'op', userId, userName, meta }) {
  const ref = doc(collection(db, 'supplier_activity'));
  batch.set(ref, {
    supplierId: supplierId || '',
    supType: supType || '',
    ...auditEntry({ action, userId, userName, kind, meta }),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// ══════════════════════════════════════════
// PUBLIC API — CRUD ACTIONS
// ══════════════════════════════════════════

export const supplierActions = {

  /**
   * إنشاء مورد جديد (printer أو shipper).
   * @returns { ok, errors, warnings, supplierId, supType }
   */
  async create({ db, data, role, userId, userName, userPerms, allowDuplicate = false }) {
    const permErr = _checkManagePermission(role, userPerms);
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    const v = _validateSupplierData(data);
    if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings };

    const col = _collectionFor(data.supType);
    const nameKey = _nameKey(data.name);
    try {
      // Duplicate guard (Charter 4 + 7) — ملف واحد فقط لكل مورد
      if (!allowDuplicate) {
        const dup = await _findDuplicate(db, col, { nameKey, phone: data.phone });
        if (dup) {
          return {
            ok: false,
            errors: [`مورد بنفس ${dup.by === 'phone' ? 'رقم الهاتف' : 'الاسم'} موجود بالفعل ("${dup.name}") — استخدم الملف الحالي بدل إنشاء ملف مكرر`],
            warnings: [],
            duplicate: dup,
          };
        }
      }

      const batch = writeBatch(db);
      const ref = doc(collection(db, col));
      batch.set(ref, {
        ...data,
        nameKey,
        createdAt: serverTimestamp(),
        createdBy: userId || '',
        createdByName: userName || '',
      });
      _logActivity(batch, db, {
        supplierId: ref.id, supType: data.supType,
        action: `🆕 إنشاء ملف مورد: ${data.name}`,
        kind: 'op', userId, userName,
        meta: { duplicateOverride: !!allowDuplicate },
      });
      await batch.commit();
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
      const batch = writeBatch(db);
      const patch = {
        ...data,
        updatedAt: serverTimestamp(),
        updatedBy: userId || '',
        updatedByName: userName || '',
      };
      // keep nameKey in sync عند تعديل الاسم (حتى يبقى dedup دقيقاً)
      if (data.name !== undefined) patch.nameKey = _nameKey(data.name);
      batch.update(doc(db, col, supplierId), patch);
      _logActivity(batch, db, {
        supplierId, supType,
        action: `✏️ تعديل ملف مورد${data.name ? ': ' + data.name : ''}`,
        kind: 'edit', userId, userName,
      });
      await batch.commit();
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
      const batch = writeBatch(db);
      batch.delete(doc(db, col, supplierId));
      _logActivity(batch, db, {
        supplierId, supType,
        action: '🗑️ حذف ملف مورد',
        kind: 'op', userId, userName,
        meta: { forced: !!force, references: refs?.breakdown || {} },
      });
      await batch.commit();
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
      const batch = writeBatch(db);
      batch.update(doc(db, col, supplierId), {
        isArchived: true,
        status: 'archived',
        archivedAt: serverTimestamp(),
        archivedBy: userId || '',
        archivedByName: userName || '',
        archiveReason: reason || '',
        updatedAt: serverTimestamp(),
      });
      _logActivity(batch, db, {
        supplierId, supType,
        action: `📁 أرشفة مورد${reason ? ': ' + reason : ''}`,
        kind: 'op', userId, userName,
      });
      await batch.commit();
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
      const batch = writeBatch(db);
      batch.update(doc(db, col, supplierId), {
        isArchived: false,
        status: 'active',
        unarchivedAt: serverTimestamp(),
        unarchivedBy: userId || '',
        unarchivedByName: userName || '',
        updatedAt: serverTimestamp(),
      });
      _logActivity(batch, db, {
        supplierId, supType,
        action: '♻️ استعادة مورد من الأرشيف',
        kind: 'op', userId, userName,
      });
      await batch.commit();
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
    role, userId, userName, userPerms,
  }) {
    const permErr = _checkPaymentPermission(role, userPerms);
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    const v = _validatePaymentData({ amount, walletId, supplierId, supplierName });
    if (v.errors.length) return { ok: false, errors: v.errors, warnings: [] };

    try {
      const result = await dispatchFinancialEvent(db, FE.VENDOR_PAYMENT, {
        supplierId, supplierName, supplierType,
        amount: parseFloat(amount) || 0,
        walletId, walletName: walletName || '',
        note,
        userId: userId || '', userName: userName || '',
        date: new Date().toISOString().slice(0, 10),
        ...(costItemRefs.length ? { costItemRefs } : {}),
      });
      return {
        ok: true, errors: [], warnings: [],
        supplierId, action: 'createPayment',
        eventType: FE.VENDOR_PAYMENT, eventResult: result,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل تسجيل الدفعة'], warnings: [] };
    }
  },

  /**
   * عكس دفعة (reversal) — عبر FSE.
   */
  async reversePayment({
    db, paymentId, supplierId, supplierName,
    amount, walletId, walletName,
    role, userId, userName, userPerms,
    reason = '',
  }) {
    const permErr = _checkPaymentPermission(role, userPerms);
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    if (!paymentId) return { ok: false, errors: ['paymentId مطلوب'], warnings: [] };

    const v = _validatePaymentData({ amount, walletId, supplierId, supplierName });
    if (v.errors.length) return { ok: false, errors: v.errors, warnings: [] };

    try {
      const result = await dispatchFinancialEvent(db, FE.VENDOR_PAYMENT_REVERSAL, {
        paymentId,
        supplierId, supplierName,
        amount: parseFloat(amount) || 0,
        walletId, walletName: walletName || '',
        note: reason || 'إلغاء دفعة',
        userId: userId || '', userName: userName || '',
        date: new Date().toISOString().slice(0, 10),
      });
      return {
        ok: true, errors: [], warnings: [],
        supplierId, paymentId, action: 'reversePayment',
        eventType: FE.VENDOR_PAYMENT_REVERSAL, eventResult: result,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل عكس الدفعة'], warnings: [] };
    }
  },
};

export default supplierActions;
