/**
 * core/cost-template-actions.js
 * ──────────────────────────────────────────────────────────
 * قوالب التكلفة الثابتة — تعريف مرة واحدة ثم تطبيق دفعي
 *
 * المخزن: master_lists/cost_templates  { templates: [...] }
 * كل قالب: { id, name, qty, costItems: [{type, supplierId, supplierName, amount}], updatedAt, updatedBy }
 */

import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const TMPL_REF = (db) => doc(db, 'master_lists', 'cost_templates');

export async function getCostTemplates(db) {
  const snap = await getDoc(TMPL_REF(db));
  return snap.exists() ? (snap.data().templates || []) : [];
}

export async function saveCostTemplate(db, { id, name, qty, costItems }, userName) {
  if (!name?.trim()) return { ok: false, errors: ['اسم المنتج مطلوب'] };
  if (!costItems?.length) return { ok: false, errors: ['أضف بنداً واحداً على الأقل'] };
  const invalid = costItems.filter(c => !c.type || !c.supplierId || !(parseFloat(c.amount) > 0));
  if (invalid.length) return { ok: false, errors: ['كل بند يحتاج نوع + مورد + مبلغ'] };

  const snap = await getDoc(TMPL_REF(db));
  const templates = snap.exists() ? (snap.data().templates || []) : [];
  const templateId = id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const entry = {
    id: templateId,
    name: name.trim(),
    qty: qty ? String(qty).trim() : null,
    costItems: costItems.map(c => ({
      type: c.type,
      supplierId: c.supplierId,
      supplierName: c.supplierName || '',
      amount: parseFloat(c.amount) || 0,
    })),
    updatedAt: new Date().toISOString().slice(0, 10),
    updatedBy: userName || '',
  };
  const idx = templates.findIndex(t => t.id === templateId);
  if (idx >= 0) templates[idx] = entry; else templates.push(entry);
  await setDoc(TMPL_REF(db), { templates }, { merge: true });
  return { ok: true, templateId };
}

export async function deleteCostTemplate(db, templateId) {
  const snap = await getDoc(TMPL_REF(db));
  if (!snap.exists()) return { ok: true };
  const templates = (snap.data().templates || []).filter(t => t.id !== templateId);
  await setDoc(TMPL_REF(db), { templates });
  return { ok: true };
}
