/**
 * Business2Card ERP — product-actions.js
 *
 * ━━━ CENTRAL PRODUCT ACTIONS (RULE A1 + P1) ━━━
 *
 * طبقة الأفعال المركزية لإدارة المنتجات.
 *
 * الـ products.html (وأي صفحة أخرى) لا تكتب على Firestore مباشرة —
 * تنادي action واحد:
 *   const r = await productActions.create({ db, data, role, userId, userName });
 *   if (!r.ok) toast(r.errors[0], 'err');
 *
 * كل action:
 *   1. يتحقق من الصلاحية (canDo('manage_products', role))
 *   2. يتحقق من validation (required fields، positive prices)
 *   3. يحفظ priceHistory تلقائياً عند تغيير السعر
 *   4. يفحص references قبل الحذف (delete safety)
 *   5. يُرجع { ok, errors, warnings, productId, ... }
 */

import {
  doc, getDoc, addDoc, updateDoc, deleteDoc, collection,
  query, where, getDocs, limit, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { canDo } from './core/permissions-matrix.js';

// ══════════════════════════════════════════
// CONSTANTS (C2 — لا magic strings)
// ══════════════════════════════════════════

/** أنماط التسعير المدعومة للمنتج. */
export const PRICING_MODES = {
  SIMPLE: 'simple',     // سعر واحد (defaultPrice)
  VARIANTS: 'variants', // سعر أساسي + إضافات (basePrice + variantOptions)
  MATRIX: 'matrix',     // مصفوفة (مقاس × نوع طباعة × كمية) = سعر صريح
};
const _PRICING_MODE_VALUES = Object.values(PRICING_MODES);

// ══════════════════════════════════════════
// INTERNAL HELPERS
// ══════════════════════════════════════════

/**
 * استنتاج نمط التسعير من بيانات المنتج (backward-compatible).
 * المستندات القديمة بلا pricingMode → variants لو hasVariants، وإلا simple.
 */
function _resolvePricingMode(data) {
  if (data && _PRICING_MODE_VALUES.includes(data.pricingMode)) return data.pricingMode;
  return data && data.hasVariants ? PRICING_MODES.VARIANTS : PRICING_MODES.SIMPLE;
}

/** validation لنمط المصفوفة (يُضيف على errors/warnings الممرّرة). */
function _validateMatrix(data, errors) {
  const sizes = Array.isArray(data.matrixSizes) ? data.matrixSizes.filter(s => String(s || '').trim()) : [];
  const types = Array.isArray(data.matrixPrintTypes) ? data.matrixPrintTypes.filter(Boolean) : [];
  const qtys = Array.isArray(data.matrixQuantities) ? data.matrixQuantities.map(q => parseFloat(q)).filter(q => q > 0) : [];
  if (!sizes.length) errors.push('أضف مقاساً واحداً على الأقل');
  if (!types.length) errors.push('اختر نوع طباعة واحداً على الأقل');
  if (!qtys.length) errors.push('أضف كمية واحدة على الأقل');
  const matrix = Array.isArray(data.priceMatrix) ? data.priceMatrix : [];
  if (matrix.some(r => (parseFloat(r.price) || 0) < 0)) errors.push('السعر لا يمكن أن يكون سالباً');
  const priced = matrix.filter(r => (parseFloat(r.price) || 0) > 0);
  if (!priced.length) errors.push('أدخل سعراً واحداً على الأقل في جدول الأسعار');
}

/**
 * الحقول المشتقة لمنتج المصفوفة — للتوافق الخلفي مع المستهلكين
 * (design.html / print.html يقرؤون defaultPrice فقط).
 * defaultPrice = أقل سعر في الجدول → يظهر كـ "يبدأ من".
 */
function _deriveMatrixFields(data) {
  if (_resolvePricingMode(data) !== PRICING_MODES.MATRIX) return {};
  const priced = (data.priceMatrix || []).map(r => parseFloat(r.price) || 0).filter(p => p > 0);
  const minPrice = priced.length ? Math.min(...priced) : 0;
  const maxPrice = priced.length ? Math.max(...priced) : 0;
  return { defaultPrice: minPrice, matrixMinPrice: minPrice, matrixMaxPrice: maxPrice };
}

/** validation موحَّد لبيانات المنتج */
function _validateProductData(data) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object') {
    errors.push('بيانات المنتج مفقودة');
    return { errors, warnings };
  }
  if (!data.name || !String(data.name).trim()) errors.push('اسم المنتج مطلوب');
  if (data.printType && !['digital', 'offset'].includes(data.printType)) {
    errors.push(`printType غير معروف "${data.printType}" — المسموح: digital | offset`);
  }
  const mode = _resolvePricingMode(data);
  if (mode === PRICING_MODES.MATRIX) {
    _validateMatrix(data, errors);
  } else {
    const price = parseFloat(data.hasVariants ? data.basePrice : data.defaultPrice) || 0;
    if (price <= 0) errors.push('السعر يجب أن يكون أكبر من صفر');
    // variants validation
    if (data.hasVariants) {
      if (!data.variantOptions || typeof data.variantOptions !== 'object') {
        errors.push('variantOptions مطلوبة لو hasVariants=true');
      }
    }
  }
  if (data.weight && parseFloat(data.weight) < 0) errors.push('الوزن لا يمكن أن يكون سالباً');
  return { errors, warnings };
}

/** فحص الصلاحية المركزي */
function _checkPermission(role, userPerms, action) {
  if (!canDo('manage_products', role, userPerms)) {
    return `ليس لديك صلاحية ${action} المنتجات`;
  }
  return null;
}

/** بناء priceHistory entry عند تغيير السعر */
function _buildPriceHistoryEntry({ oldPrice, newPrice, field, userId, userName }) {
  return {
    oldPrice: parseFloat(oldPrice) || 0,
    newPrice: parseFloat(newPrice) || 0,
    field,
    changedBy: userId || '',
    changedByName: userName || '',
    changedAt: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════
// PUBLIC API — Actions
// ══════════════════════════════════════════

export const productActions = {

  /**
   * إنشاء منتج جديد.
   * @returns { ok, errors, warnings, productId }
   */
  async create({ db, data, role, userId, userName, userPerms }) {
    const permErr = _checkPermission(role, userPerms, 'إنشاء');
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    const v = _validateProductData(data);
    if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings };

    try {
      const ref = await addDoc(collection(db, 'products_v2'), {
        ...data,
        ..._deriveMatrixFields(data),
        createdAt: serverTimestamp(),
        createdBy: userId || '',
        createdByName: userName || '',
      });
      return { ok: true, errors: [], warnings: v.warnings, productId: ref.id, action: 'create' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الإنشاء'], warnings: [] };
    }
  },

  /**
   * تحديث منتج موجود.
   * يحفظ priceHistory تلقائياً لو تغيّر defaultPrice أو basePrice.
   * @returns { ok, errors, warnings, productId }
   */
  async update({ db, productId, data, currentProduct, role, userId, userName, userPerms }) {
    const permErr = _checkPermission(role, userPerms, 'تعديل');
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    if (!productId) return { ok: false, errors: ['productId مطلوب'], warnings: [] };

    const v = _validateProductData(data);
    if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings };

    // priceHistory أوتوماتيك — السعر المرجعي يختلف حسب نمط التسعير
    let priceHistory = currentProduct?.priceHistory || [];
    const mode = _resolvePricingMode(data);
    const derived = _deriveMatrixFields(data);
    let oldRefPrice, newRefPrice, refField;
    if (mode === PRICING_MODES.MATRIX) {
      oldRefPrice = parseFloat(currentProduct?.matrixMinPrice ?? currentProduct?.defaultPrice) || 0;
      newRefPrice = derived.defaultPrice || 0;
      refField = 'matrixMinPrice';
    } else if (mode === PRICING_MODES.VARIANTS) {
      oldRefPrice = parseFloat(currentProduct?.basePrice) || 0;
      newRefPrice = parseFloat(data.basePrice) || 0;
      refField = 'basePrice';
    } else {
      oldRefPrice = parseFloat(currentProduct?.defaultPrice) || 0;
      newRefPrice = parseFloat(data.defaultPrice) || 0;
      refField = 'defaultPrice';
    }
    if (currentProduct && oldRefPrice !== newRefPrice) {
      priceHistory = [
        ...priceHistory,
        _buildPriceHistoryEntry({
          oldPrice: oldRefPrice, newPrice: newRefPrice,
          field: refField, userId, userName,
        }),
      ];
    }

    try {
      await updateDoc(doc(db, 'products_v2', productId), {
        ...data,
        ...derived,
        priceHistory,
        updatedAt: serverTimestamp(),
        updatedBy: userId || '',
        updatedByName: userName || '',
      });
      return { ok: true, errors: [], warnings: v.warnings, productId, action: 'update' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [] };
    }
  },

  /**
   * فحص استخدام منتج في orders قبل الحذف (Delete Safety).
   * يبحث في orders حيث products[].productId == productId.
   * @returns { count, sampleOrderIds }
   */
  async checkReferences({ db, productId, sampleLimit = 5 }) {
    if (!db || !productId) return { count: 0, sampleOrderIds: [] };
    // Firestore array-contains على مصفوفة كائنات لا يدعم field path
    // فنبحث بـ where + getDocs + filter client-side
    try {
      // محاولة: لو الـ orders فيها productIds[] flat (denormalized)
      const flatQ = query(
        collection(db, 'orders'),
        where('productIds', 'array-contains', productId),
        limit(sampleLimit + 1)
      );
      const flatSnap = await getDocs(flatQ);
      if (flatSnap.size > 0) {
        return {
          count: flatSnap.size, // ≥ count (we limited)
          sampleOrderIds: flatSnap.docs.slice(0, sampleLimit).map(d => d.id),
          method: 'productIds-flat',
        };
      }
      // fallback: لا يوجد productIds flat. علامة "لا نعرف يقيناً".
      return {
        count: 0, sampleOrderIds: [],
        method: 'productIds-flat-empty',
        warning: 'لا يوجد productIds[] flat على orders — لم يتم فحص كل orders, ' +
                 'الحذف قد يخلق orphan references.',
      };
    } catch (e) {
      return { count: 0, sampleOrderIds: [], error: e.message };
    }
  },

  /**
   * حذف منتج — مع Delete Safety check.
   * إذا كان المنتج مستخدماً في orders، يرفض الحذف ويقترح archive.
   *
   * @param {boolean} [force=false] — تجاوز delete safety (admin override)
   * @returns { ok, errors, warnings, productId, references }
   */
  async delete({ db, productId, role, userId, userName, userPerms, force = false }) {
    const permErr = _checkPermission(role, userPerms, 'حذف');
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    if (!productId) return { ok: false, errors: ['productId مطلوب'], warnings: [] };

    // Delete Safety
    const refs = await productActions.checkReferences({ db, productId });
    if (refs.count > 0 && !force) {
      return {
        ok: false,
        errors: [`المنتج مستخدم في ${refs.count}+ أوردر — استخدم archive بدل delete أو مرّر force:true`],
        warnings: [],
        references: refs,
      };
    }
    if (refs.warning) {
      // لو ما نقدرش نتحقق يقيناً، نرفع warning
      // (admin يمكنه التجاوز عبر force:true)
      if (!force) {
        return {
          ok: false,
          errors: [],
          warnings: [refs.warning],
          needsConfirmation: true,
          references: refs,
        };
      }
    }

    try {
      await deleteDoc(doc(db, 'products_v2', productId));
      return {
        ok: true, errors: [], warnings: [], productId,
        action: 'delete', forced: !!force, references: refs,
      };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [] };
    }
  },

  /**
   * Soft-archive للمنتج (بديل آمن للحذف).
   * يضع `archivedAt` و `isArchived:true` ولا يحذف.
   * المنتج المؤرشف يبقى مرئياً في الـ orders السابقة، لكن مخفي من القوائم النشطة.
   */
  async archive({ db, productId, role, userId, userName, userPerms, reason = '' }) {
    const permErr = _checkPermission(role, userPerms, 'أرشفة');
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    if (!productId) return { ok: false, errors: ['productId مطلوب'], warnings: [] };

    try {
      await updateDoc(doc(db, 'products_v2', productId), {
        isArchived: true,
        archivedAt: serverTimestamp(),
        archivedBy: userId || '',
        archivedByName: userName || '',
        archiveReason: reason || '',
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], productId, action: 'archive' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الأرشفة'], warnings: [] };
    }
  },

  /**
   * إلغاء الأرشفة (restore).
   */
  async unarchive({ db, productId, role, userId, userName, userPerms }) {
    const permErr = _checkPermission(role, userPerms, 'استعادة');
    if (permErr) return { ok: false, errors: [permErr], warnings: [] };

    if (!productId) return { ok: false, errors: ['productId مطلوب'], warnings: [] };

    try {
      await updateDoc(doc(db, 'products_v2', productId), {
        isArchived: false,
        unarchivedAt: serverTimestamp(),
        unarchivedBy: userId || '',
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], productId, action: 'unarchive' };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الاستعادة'], warnings: [] };
    }
  },

  // ─── Cost History (P2.11) ─────────────────

  /**
   * استبدال costHistory كاملاً + lastCostTotal لـ product بعينه.
   * يستخدم من products.html لإضافة/تعديل/حذف بنود التاريخ يدوياً.
   *
   * @param {Array} history — array كامل بعد التعديل (caller يبنيه)
   */
  async setCostHistory({ db, productId, history }) {
    if (!productId) return { ok: false, errors: ['⚠️ productId مطلوب'], warnings: [] };
    if (!Array.isArray(history)) {
      return { ok: false, errors: ['⚠️ history مطلوب (array)'], warnings: [] };
    }
    try {
      await updateDoc(doc(db, 'products_v2', productId), {
        costHistory: history,
        lastCostTotal: history.length ? (parseFloat(history[history.length - 1].total) || 0) : 0,
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], productId, count: history.length };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [] };
    }
  },

  /**
   * Seed-mode: bulk create default products (admin tool — لو الـ catalog فاضي).
   *
   * @param {Array<Object>} defaults — قوائم منتجات افتراضية
   */
  async seedDefaults({ db, defaults }) {
    if (!Array.isArray(defaults) || !defaults.length) {
      return { ok: false, errors: ['⚠️ defaults مطلوب'], warnings: [] };
    }
    try {
      const ids = [];
      for (const p of defaults) {
        const ref = await addDoc(collection(db, 'products_v2'), {
          ...p,
          createdAt: serverTimestamp(),
        });
        ids.push(ref.id);
      }
      return { ok: true, errors: [], warnings: [], count: ids.length, productIds: ids };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل الإنشاء'], warnings: [] };
    }
  },
};

// ══════════════════════════════════════════
// PRICE LOOKUP (للمستهلكين: design / print / order)
// ══════════════════════════════════════════

/**
 * جلب سعر خلية محددة من مصفوفة المنتج.
 * @param {Object} product — مستند المنتج (products_v2)
 * @param {{size:string, printType:string, qty:number|string}} sel — التركيبة المطلوبة
 * @returns {number|null} السعر، أو null لو المنتج ليس matrix أو التركيبة غير مُسعّرة
 */
export function getMatrixPrice(product, { size, printType, qty } = {}) {
  if (!product || _resolvePricingMode(product) !== PRICING_MODES.MATRIX) return null;
  const rows = Array.isArray(product.priceMatrix) ? product.priceMatrix : [];
  const row = rows.find(r =>
    r.size === size &&
    r.printType === printType &&
    Number(r.qty) === Number(qty)
  );
  if (!row) return null;
  const p = parseFloat(row.price);
  return Number.isFinite(p) ? p : null;
}

export default productActions;
