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

function _normName(s) {
  return (s || '').replace(/[\d٠-٩,،]+\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function findDuplicateTemplate(templates, name, qty, excludeId) {
  const nn = _normName(name);
  const nq = qty ? String(qty).trim() : '';
  return templates.find(t => {
    if (excludeId && t.id === excludeId) return false;
    const tn = _normName(t.name);
    const tq = t.qty ? String(t.qty).trim() : '';
    return tn === nn && tq === nq;
  }) || null;
}

export async function saveCostTemplate(db, { id, name, qty, costItems, mergeInto }, userName) {
  if (!name?.trim()) return { ok: false, errors: ['اسم المنتج مطلوب'] };
  if (!costItems?.length) return { ok: false, errors: ['أضف بنداً واحداً على الأقل'] };
  const invalid = costItems.filter(c => !c.type || !c.supplierId || !(parseFloat(c.amount) > 0));
  if (invalid.length) return { ok: false, errors: ['كل بند يحتاج نوع + مورد + مبلغ'] };

  const snap = await getDoc(TMPL_REF(db));
  const templates = snap.exists() ? (snap.data().templates || []) : [];

  // mergeInto: merge costItems into existing template (update prices, add new types)
  if (mergeInto) {
    const target = templates.find(t => t.id === mergeInto);
    if (!target) return { ok: false, errors: ['القالب المطلوب دمجه غير موجود'] };
    const existTypes = new Map(target.costItems.map(c => [c.type + '__' + c.supplierId, c]));
    costItems.forEach(c => {
      const key = c.type + '__' + c.supplierId;
      existTypes.set(key, {
        type: c.type,
        supplierId: c.supplierId,
        supplierName: c.supplierName || '',
        amount: parseFloat(c.amount) || 0,
      });
    });
    target.costItems = [...existTypes.values()];
    target.updatedAt = new Date().toISOString().slice(0, 10);
    target.updatedBy = userName || '';
    await setDoc(TMPL_REF(db), { templates }, { merge: true });
    return { ok: true, templateId: mergeInto, merged: true };
  }

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

export async function mergeDuplicateTemplates(db, userName) {
  const snap = await getDoc(TMPL_REF(db));
  if (!snap.exists()) return { ok: true, merged: 0, removed: 0 };
  const templates = snap.data().templates || [];
  if (!templates.length) return { ok: true, merged: 0, removed: 0 };

  const groups = {};
  templates.forEach(t => {
    const key = _normName(t.name) + '::' + (t.qty ? String(t.qty).trim() : '');
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  let merged = 0, removed = 0;
  const result = [];
  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (group.length <= 1) { result.push(group[0]); continue; }
    // keep the newest as base, merge others into it
    group.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const base = { ...group[0], costItems: [...group[0].costItems] };
    const existTypes = new Map(base.costItems.map(c => [c.type + '__' + c.supplierId, c]));
    for (let i = 1; i < group.length; i++) {
      group[i].costItems.forEach(c => {
        const ck = c.type + '__' + c.supplierId;
        if (!existTypes.has(ck)) { existTypes.set(ck, c); }
      });
      removed++;
    }
    base.costItems = [...existTypes.values()];
    base.updatedAt = new Date().toISOString().slice(0, 10);
    base.updatedBy = userName || '';
    result.push(base);
    merged++;
  }

  if (removed === 0) return { ok: true, merged: 0, removed: 0 };
  await setDoc(TMPL_REF(db), { templates: result });
  return { ok: true, merged, removed };
}

export async function deleteCostTemplate(db, templateId) {
  const snap = await getDoc(TMPL_REF(db));
  if (!snap.exists()) return { ok: true };
  const templates = (snap.data().templates || []).filter(t => t.id !== templateId);
  await setDoc(TMPL_REF(db), { templates });
  return { ok: true };
}
