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
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db as defaultDb } from './core/firebase-init.js';

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
  savePrintBriefTemplates,
  saveAppSettings,
  saveWhatsAppSettings,
  markSupplierOrderReceived,
};

export default masterListsActions;

if (typeof window !== 'undefined') {
  window.masterListsActions = masterListsActions;
}
