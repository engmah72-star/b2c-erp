/**
 * core/cost-library-actions.js
 * ─────────────────────────────────────────────────────────────────
 * مكتبة بنود التكلفة — طبقة الأفعال
 *
 * المبدأ:
 *  • كل بند تكلفة يُسجَّل في order يُحدَّث تلقائياً في cost_item_library
 *    (fire-and-forget من recordCostItem — لا يوقف تدفق العمل).
 *  • المكتبة قاعدة معرفة مركزية: type + productName + supplierId = مرجع فريد.
 *  • تُستخدم للاقتراح الذكي في الـ drawer ولعرض البيانات في صفحة المكتبة.
 *
 * Exports:
 *  upsertCostLibraryItem  — يُستدعى بعد كل recordCostItem (fire-and-forget)
 *  searchCostLibrary      — بحث للاقتراحات في الـ drawer
 *  getCostLibraryItems    — جلب كامل لصفحة المكتبة
 *  deleteCostLibraryItem  — حذف من المكتبة (admin only)
 */

import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, limit,
  serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ── Deterministic document ID: type + productName + supplierId ──
function _libDocId(type, productName, supplierId) {
  const norm = s => (s || '').toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9؀-ۿ-]/g, '');
  const parts = [
    norm(supplierId) || 'X',
    norm(type)       || 'X',
    norm(productName) || 'X',
  ];
  return parts.join('__').slice(0, 80);
}

// ── Recalculate avg from price history ───────────────────────────
function _calcAvg(priceHistory) {
  const valid = (priceHistory || []).filter(h => h.unitCost > 0).map(h => h.unitCost);
  if(!valid.length) return 0;
  return Math.round((valid.reduce((s, v) => s + v, 0) / valid.length) * 1000) / 1000;
}

/**
 * upsertCostLibraryItem
 * ─────────────────────
 * يُحدَّث/يُنشئ مدخل في cost_item_library بعد كل بند تكلفة.
 * Fire-and-forget — أي خطأ يُسجَّل فقط في console.
 */
export async function upsertCostLibraryItem({
  db, type, productName, supplierId, supplierName,
  qty, total, orderId, userId,
}) {
  if(!type || !db) return;

  const unitCost = qty > 0 ? Math.round((total / qty) * 1000) / 1000 : 0;
  const docId    = _libDocId(type, productName, supplierId);
  const ref      = doc(db, 'cost_item_library', docId);

  const histEntry = {
    date: new Date().toISOString().slice(0, 10),
    qty:  qty   || 0,
    total: total || 0,
    unitCost,
    orderId: orderId || '',
  };

  try {
    const snap = await getDoc(ref);

    if(!snap.exists()) {
      // ── إنشاء مدخل جديد ──
      await setDoc(ref, {
        type:         type,
        productName:  productName  || '',
        supplierId:   supplierId   || '',
        supplierName: supplierName || '',
        lastQty:      qty   || 0,
        lastTotal:    total || 0,
        lastUnitCost: unitCost,
        avgUnitCost:  unitCost,
        minUnitCost:  unitCost > 0 ? unitCost : null,
        maxUnitCost:  unitCost > 0 ? unitCost : null,
        usageCount:   1,
        priceHistory: [histEntry],
        createdAt:    serverTimestamp(),
        updatedAt:    serverTimestamp(),
        createdBy:    userId || '',
        isActive:     true,
      });
    } else {
      // ── تحديث مدخل موجود ──
      const existing = snap.data();

      // احتفظ بآخر 40 حركة فقط (منع تضخم المستند)
      const history = [...(existing.priceHistory || []), histEntry].slice(-40);
      const avg = _calcAvg(history);
      const costs = history.map(h => h.unitCost).filter(c => c > 0);

      await updateDoc(ref, {
        supplierName: supplierName || existing.supplierName || '',
        lastQty:      qty   || 0,
        lastTotal:    total || 0,
        lastUnitCost: unitCost,
        avgUnitCost:  avg,
        minUnitCost:  costs.length ? Math.min(...costs) : (existing.minUnitCost || null),
        maxUnitCost:  costs.length ? Math.max(...costs) : (existing.maxUnitCost || null),
        usageCount:   increment(1),
        priceHistory: history,
        updatedAt:    serverTimestamp(),
      });
    }
  } catch(e) {
    console.warn('[cost-library] upsert failed (non-blocking):', e?.message);
  }
}

/**
 * searchCostLibrary
 * ─────────────────
 * بحث في المكتبة — يُستخدم في الـ drawer للاقتراح الذكي.
 * يُرجع مصفوفة من المدخلات مُرتَّبة بعدد الاستخدام.
 *
 * @param {object} params
 *   type        — النوع الدقيق للبحث
 *   productName — اسم المنتج (اختياري، للتصفية الإضافية)
 *   supplierId  — فلترة بمورد محدد (اختياري)
 *   limitN      — أقصى عدد نتائج (default 20)
 */
export async function searchCostLibrary({ db, type, productName, supplierId, limitN = 20 }) {
  if(!db || !type) return [];
  try {
    // استعلام بـ type (الأكثر تحديداً)
    const q = query(
      collection(db, 'cost_item_library'),
      where('type', '==', type),
      where('isActive', '==', true),
      limit(100)
    );
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ ...d.data(), _id: d.id }));

    // فلترة إضافية بالمنتج (client-side fuzzy)
    if(productName) {
      const pn = productName.toLowerCase().trim();
      const exact = results.filter(r => (r.productName || '').toLowerCase().trim() === pn);
      const partial = results.filter(r =>
        (r.productName || '').toLowerCase().includes(pn) &&
        (r.productName || '').toLowerCase().trim() !== pn
      );
      const others = results.filter(r => !(r.productName || '').toLowerCase().includes(pn));
      results = [...exact, ...partial, ...others];
    }

    // فلترة بالمورد إن طُلب
    if(supplierId) {
      results = results.filter(r => r.supplierId === supplierId);
    }

    // ترتيب بعدد الاستخدام تنازلياً
    results.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

    return results.slice(0, limitN);
  } catch(e) {
    console.warn('[cost-library] search failed:', e?.message);
    return [];
  }
}

/**
 * getSupplierComparisons
 * ──────────────────────
 * يُرجع كل الموردين الذين سبق أن نفّذوا نفس type + productName،
 * مُرتَّبين بـ avgUnitCost تصاعدياً.
 * يُستخدم لعرض "مقارنة الموردين" في الـ drawer.
 */
export async function getSupplierComparisons({ db, type, productName }) {
  if(!db || !type) return [];
  try {
    const q = query(
      collection(db, 'cost_item_library'),
      where('type', '==', type),
      where('isActive', '==', true),
      limit(50)
    );
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ ...d.data(), _id: d.id }));

    // تصفية بالمنتج إن وُجد
    if(productName) {
      const pn = productName.toLowerCase().trim();
      const matched = results.filter(r => (r.productName || '').toLowerCase().includes(pn));
      if(matched.length) results = matched;
    }

    // فريد بالمورد (خذ الأفضل لكل مورد)
    const bySup = {};
    results.forEach(r => {
      const key = r.supplierId || r.supplierName;
      if(!key) return;
      if(!bySup[key] || (r.usageCount || 0) > (bySup[key].usageCount || 0)) {
        bySup[key] = r;
      }
    });

    return Object.values(bySup)
      .filter(r => r.avgUnitCost > 0)
      .sort((a, b) => (a.avgUnitCost || 0) - (b.avgUnitCost || 0));
  } catch(e) {
    console.warn('[cost-library] getSupplierComparisons failed:', e?.message);
    return [];
  }
}

/**
 * getCostLibraryItems
 * ─────────────────────
 * جلب كامل قائمة المكتبة لصفحة cost-items-library.html
 */
export async function getCostLibraryItems({ db, typeFilter, supplierFilter, text, limitN = 500 }) {
  if(!db) return [];
  try {
    let q;
    if(typeFilter) {
      q = query(collection(db, 'cost_item_library'), where('type', '==', typeFilter), limit(limitN));
    } else if(supplierFilter) {
      q = query(collection(db, 'cost_item_library'), where('supplierId', '==', supplierFilter), limit(limitN));
    } else {
      q = query(collection(db, 'cost_item_library'), limit(limitN));
    }
    const snap = await getDocs(q);
    let items = snap.docs.map(d => ({ ...d.data(), _id: d.id }));

    // تصفية نصية client-side
    if(text) {
      const t = text.toLowerCase().trim();
      items = items.filter(r =>
        (r.type || '').toLowerCase().includes(t) ||
        (r.productName || '').toLowerCase().includes(t) ||
        (r.supplierName || '').toLowerCase().includes(t)
      );
    }

    return items;
  } catch(e) {
    console.warn('[cost-library] getCostLibraryItems failed:', e?.message);
    return [];
  }
}

/**
 * getPriceTrend
 * ─────────────
 * يحسب اتجاه السعر من priceHistory — يُرجع { direction, pctChange, lastPrice, prevPrice }
 * direction: 'up' | 'down' | 'stable' | 'new'
 */
export function getPriceTrend(priceHistory) {
  const valid = (priceHistory || []).filter(h => h.unitCost > 0);
  if (valid.length < 2) return { direction: 'new', pctChange: 0, lastPrice: valid[0]?.unitCost || 0, prevPrice: 0 };
  const last = valid[valid.length - 1].unitCost;
  const prev = valid[valid.length - 2].unitCost;
  if (prev === 0) return { direction: 'new', pctChange: 0, lastPrice: last, prevPrice: prev };
  const pct = Math.round(((last - prev) / prev) * 100);
  const direction = pct > 3 ? 'up' : pct < -3 ? 'down' : 'stable';
  return { direction, pctChange: pct, lastPrice: last, prevPrice: prev };
}

/**
 * getSupplierRanking
 * ──────────────────
 * يُرجع ترتيب الموردين لنوع + منتج معين، مع trend لكل مورد.
 */
export async function getSupplierRanking({ db, type, productName, limitN = 10 }) {
  const comps = await getSupplierComparisons({ db, type, productName });
  return comps.slice(0, limitN).map((item, idx) => {
    const trend = getPriceTrend(item.priceHistory);
    return {
      ...item,
      rank: idx + 1,
      trend,
      isCheapest: idx === 0,
    };
  });
}

/**
 * deleteCostLibraryItem — Admin only: soft delete (isActive = false)
 */
export async function deleteCostLibraryItem({ db, itemId }) {
  if(!db || !itemId) return { ok: false, errors: ['معرّف غير صالح'] };
  try {
    await updateDoc(doc(db, 'cost_item_library', itemId), {
      isActive: false,
      deletedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch(e) {
    return { ok: false, errors: [e.message || 'فشل الحذف'] };
  }
}
