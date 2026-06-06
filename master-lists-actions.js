/**
 * Business2Card ERP — master-lists-actions.js
 *
 * ━━━ MASTER LISTS + APP CONFIG ACTIONS LAYER (P2.11) ━━━
 *
 * طبقة الأفعال لـ master_lists/* و settings/* — قوائم وإعدادات النظام:
 *   - supplier_categories (تخصصات الموردين)
 *   - print_brief_templates (قوالب بيانات الإنتاج)
 *   - settings/main (الإعدادات الرئيسية)
 *   - settings/whatsapp (إعدادات الواتساب)
 *
 * كل actions admin-only metadata — لا تأثير مالي.
 */

import {
  doc,
  collection,
  setDoc,
  updateDoc,
  getDoc,
  writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db as defaultDb } from './core/firebase-init.js';
import { resolveFinancialPolicy } from './core/financial-policy.js';

// ══════════════════════════════════════════
// SUPPLIER CATEGORIES (master_lists/supplier_categories)
// ══════════════════════════════════════════

/**
 * استبدال كامل لـ master_lists/supplier_categories.items
 * (merge:true يحافظ على أي حقول إضافية في الـ doc).
 */
export async function saveSupplierCategories({ db = defaultDb, items }) {
  if (!Array.isArray(items)) {
    return { ok: false, errors: ['⚠️ items مطلوب (array)'], warnings: [] };
  }
  try {
    await setDoc(
      doc(db, 'master_lists', 'supplier_categories'),
      { items, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return { ok: true, errors: [], warnings: [], count: items.length };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// INCIDENT REASONS (master_lists/incident_reasons)
// ══════════════════════════════════════════

/**
 * استبدال كامل لـ master_lists/incident_reasons.items
 * items: [{ code, label, type, disabled? }] — الأسباب المُصنّفة للإخفاقات،
 * وهي ما يُحصر به تكرار «نفس الإخفاق». admin-only metadata — لا أثر مالي.
 */
export async function saveIncidentReasons({ db = defaultDb, items }) {
  if (!Array.isArray(items)) {
    return { ok: false, errors: ['⚠️ items مطلوب (array)'], warnings: [] };
  }
  try {
    await setDoc(
      doc(db, 'master_lists', 'incident_reasons'),
      { items, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return { ok: true, errors: [], warnings: [], count: items.length };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// PRODUCTION SERVICES — Unified source (RULE M1 + C1.5)
// ══════════════════════════════════════════
//
// `master_lists/supplier_categories` extended schema:
//   {
//     id?, label, group,
//     printTypes: ['digital','offset']?,  // أنواع الطباعة اللي يظهر فيها كبند تكلفة
//     isCostItem: bool,                    // يظهر في بنود تكلفة print.html
//     isSupplierService: bool,             // يظهر في تخصصات الموردين
//     isActive: bool, order: number
//   }
//
// قبل الـ migration: items.length=N, كلها isSupplierService=true (implicit), بدون cost flags.
// بعد الـ migration: نفس الـ items مع flags كاملة + بنود مدموجة من costTypesDigital/Offset.

function _norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

/**
 * Migration idempotent: يقرأ من 3 مصادر (costTypesDigital + costTypesOffset + supplier_categories)
 * ويدمج كلها في master_lists/supplier_categories.items مع flags كاملة.
 * يضع marker `_schemaVersion: 2` لمنع إعادة التشغيل.
 */
export async function migrateProductionServices({ db = defaultDb } = {}) {
  try {
    const catRef = doc(db, 'master_lists', 'supplier_categories');
    const setRef = doc(db, 'settings', 'main');
    const [catSnap, setSnap] = await Promise.all([getDoc(catRef), getDoc(setRef)]);

    const catData = catSnap.exists() ? catSnap.data() : {};
    if (catData._schemaVersion >= 2) {
      return { ok: true, errors: [], warnings: [], skipped: true, reason: 'already migrated' };
    }

    const existingItems = Array.isArray(catData.items) ? catData.items.slice() : [];
    const settings = setSnap.exists() ? setSnap.data() : {};
    const digital = Array.isArray(settings.costTypesDigital) ? settings.costTypesDigital : [];
    const offset = Array.isArray(settings.costTypesOffset) ? settings.costTypesOffset : [];

    // Map existing items by normalized label
    const byLabel = new Map();
    existingItems.forEach((it, i) => {
      const lbl = it && it.label;
      if (!lbl) return;
      const key = _norm(lbl);
      byLabel.set(key, {
        ...it,
        label: lbl,
        group: it.group || '🔧 أخرى',
        printTypes: Array.isArray(it.printTypes) ? it.printTypes.slice() : [],
        isCostItem: it.isCostItem === true,
        isSupplierService: it.isSupplierService !== false, // default true for legacy
        isActive: it.isActive !== false,
        order: typeof it.order === 'number' ? it.order : i,
      });
    });

    const upsertCost = (label, printType, defaultGroup) => {
      const key = _norm(label);
      if (!key) return;
      const cur = byLabel.get(key);
      if (cur) {
        cur.isCostItem = true;
        if (!cur.printTypes.includes(printType)) cur.printTypes.push(printType);
      } else {
        byLabel.set(key, {
          label: String(label).trim(),
          group: defaultGroup,
          printTypes: [printType],
          isCostItem: true,
          isSupplierService: false,
          isActive: true,
          order: byLabel.size,
        });
      }
    };

    digital.forEach(s => upsertCost(s, 'digital', '💻 بنود ديجيتال'));
    offset.forEach(s => upsertCost(s, 'offset', '🖨️ بنود أوفست'));

    const items = Array.from(byLabel.values())
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((it, i) => ({ ...it, order: i }));

    await setDoc(catRef, {
      items,
      _schemaVersion: 2,
      _migratedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return {
      ok: true,
      errors: [],
      warnings: [],
      migrated: true,
      counts: { total: items.length, costDigital: digital.length, costOffset: offset.length, existing: existingItems.length },
    };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الـ migration'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// PRINT BRIEF TEMPLATES (master_lists/print_brief_templates)
// ══════════════════════════════════════════

/**
 * Upsert template في master_lists/print_brief_templates.items[].
 * إذا الـ doc موجود → update items. إذا لا → set initial.
 * الـ caller يبني الـ items array بنفسه (يدمج/يستبدل).
 */
export async function savePrintBriefTemplates({ db = defaultDb, items }) {
  if (!Array.isArray(items)) {
    return { ok: false, errors: ['⚠️ items مطلوب (array)'], warnings: [] };
  }
  try {
    const ref = doc(db, 'master_lists', 'print_brief_templates');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { items, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, {
        items,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return { ok: true, errors: [], warnings: [], count: items.length, created: !snap.exists() };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// APP SETTINGS (settings/main)
// ══════════════════════════════════════════

export async function saveAppSettings({ db = defaultDb, settings }) {
  if (!settings || typeof settings !== 'object') {
    return { ok: false, errors: ['⚠️ settings مطلوب'], warnings: [] };
  }
  try {
    await setDoc(doc(db, 'settings', 'main'), settings, { merge: true });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// FINANCIAL CONTROL POLICY (master_lists/financial_policy)
// ══════════════════════════════════════════

/**
 * حفظ سياسة الرقابة المالية. يُطبَّع المُدخل عبر resolveFinancialPolicy
 * (دمج فوق الافتراضي + رفض mode غير صالح) قبل التخزين — فلا يُكتب شكل فاسد.
 * القاعدة (master_lists/{listId}) تفرض الكتابة على admin فقط.
 *
 * @param {Object} args
 * @param {Object} args.policy — { mode, outflow{...}, inflow{...}, walletOverrides{...} }
 * @param {string} [args.userId] — للتدقيق (من غيّر السياسة)
 */
/** لقطة نظيفة من حقول السياسة (للمقارنة قبل/بعد في السجلّ). */
function _policySnap(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    mode: p.mode ?? null,
    outflow: p.outflow ?? null,
    inflow: p.inflow ?? null,
    walletOverrides: p.walletOverrides ?? null,
    approval: p.approval ?? null,
  };
}

export async function saveFinancialPolicy({ db = defaultDb, policy, userId = '', userName = '' }) {
  if (!policy || typeof policy !== 'object') {
    return { ok: false, errors: ['⚠️ policy مطلوب'], warnings: [] };
  }
  const resolved = resolveFinancialPolicy(policy);
  try {
    const ref = doc(db, 'master_lists', 'financial_policy');
    // اقرأ الحالة الحالية (قبل) للسجلّ — فشل القراءة لا يمنع الحفظ
    let before = null;
    try { const s = await getDoc(ref); if (s.exists()) before = s.data(); } catch (_) {}

    const batch = writeBatch(db);
    batch.set(ref, { ...resolved, updatedAt: serverTimestamp(), updatedBy: userId || '' }, { merge: true });
    // سجلّ تغيير غير قابل للتعديل (append-only) — financial_policy_audit
    const auditRef = doc(collection(db, 'financial_policy_audit'));
    batch.set(auditRef, {
      changedBy: userId || '',
      changedByName: userName || '',
      changedAt: serverTimestamp(),
      before: _policySnap(before),
      after: _policySnap(resolved),
    });
    await batch.commit();
    return { ok: true, errors: [], warnings: [], policy: resolved };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل حفظ السياسة المالية'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// WHATSAPP SETTINGS (settings/whatsapp)
// ══════════════════════════════════════════

export async function saveWhatsAppSettings({ db = defaultDb, settings }) {
  if (!settings || typeof settings !== 'object') {
    return { ok: false, errors: ['⚠️ settings مطلوب'], warnings: [] };
  }
  try {
    await setDoc(doc(db, 'settings', 'whatsapp'), settings, { merge: true });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل الحفظ'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// SUPPLIER ORDER STATUS (supplier_orders/{id}) — single field update
// ══════════════════════════════════════════

/**
 * تحديث حالة الاستلام لـ supplier_order.
 */
export async function markSupplierOrderReceived({
  db = defaultDb, supplierOrderId, userId,
}) {
  if (!supplierOrderId) return { ok: false, errors: ['⚠️ supplierOrderId مطلوب'], warnings: [] };
  try {
    await updateDoc(doc(db, 'supplier_orders', supplierOrderId), {
      deliveryStatus: 'received',
      receivedAt: serverTimestamp(),
      receivedBy: userId || '',
    });
    return { ok: true, errors: [], warnings: [] };
  } catch (e) {
    return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [] };
  }
}

// ══════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════

export const masterListsActions = {
  saveSupplierCategories,
  saveIncidentReasons,
  savePrintBriefTemplates,
  saveAppSettings,
  saveWhatsAppSettings,
  saveFinancialPolicy,
  markSupplierOrderReceived,
  migrateProductionServices,
};

export default masterListsActions;

if (typeof window !== 'undefined') {
  window.masterListsActions = masterListsActions;
}
