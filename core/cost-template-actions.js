/**
 * core/cost-template-actions.js
 * ──────────────────────────────────────────────────────────
 * قوالب التكلفة الثابتة — تعريف مرة واحدة ثم تطبيق دفعي
 *
 * T6 Migration: moved from single-doc array (master_lists/cost_templates)
 * to individual docs in collection (cost_templates/{templateId}).
 * Legacy fallback reads old doc if collection is empty.
 */

import {
  doc, getDoc, setDoc, deleteDoc, writeBatch,
  collection, getDocs, query, limit,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { normalizeCostType } from './cost-type-normalize.js';

const TMPL_COL = (db) => collection(db, 'cost_templates');
const TMPL_DOC = (db, id) => doc(db, 'cost_templates', id);
const LEGACY_REF = (db) => doc(db, 'master_lists', 'cost_templates');

export async function getCostTemplates(db) {
  const colSnap = await getDocs(query(TMPL_COL(db), limit(500)));
  if (!colSnap.empty) {
    return colSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const legacySnap = await getDoc(LEGACY_REF(db));
  return legacySnap.exists() && !legacySnap.data().migrated
    ? (legacySnap.data().templates || [])
    : [];
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

  if (mergeInto) {
    const targetSnap = await getDoc(TMPL_DOC(db, mergeInto));
    if (!targetSnap.exists()) return { ok: false, errors: ['القالب المطلوب دمجه غير موجود'] };
    const target = { id: targetSnap.id, ...targetSnap.data() };
    const existTypes = new Map(target.costItems.map(c => [normalizeCostType(c.type) + '__' + c.supplierId, c]));
    costItems.forEach(c => {
      const key = normalizeCostType(c.type) + '__' + c.supplierId;
      existTypes.set(key, {
        type: c.type,
        supplierId: c.supplierId,
        supplierName: c.supplierName || '',
        amount: parseFloat(c.amount) || 0,
      });
    });
    await setDoc(TMPL_DOC(db, mergeInto), {
      ...target,
      costItems: [...existTypes.values()],
      updatedAt: new Date().toISOString().slice(0, 10),
      updatedBy: userName || '',
    });
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
  await setDoc(TMPL_DOC(db, templateId), entry);
  return { ok: true, templateId };
}

export async function mergeDuplicateTemplates(db, userName) {
  let templates = await getCostTemplates(db);
  if (!templates.length) return { ok: true, merged: 0, removed: 0 };

  const groups = {};
  templates.forEach(t => {
    const key = _normName(t.name) + '::' + (t.qty ? String(t.qty).trim() : '');
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  let merged = 0, removed = 0;
  const batch = writeBatch(db);
  let batchOps = 0;
  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (group.length <= 1) continue;
    group.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const base = { ...group[0], costItems: [...group[0].costItems] };
    const existTypes = new Map(base.costItems.map(c => [normalizeCostType(c.type) + '__' + c.supplierId, c]));
    for (let i = 1; i < group.length; i++) {
      group[i].costItems.forEach(c => {
        const ck = normalizeCostType(c.type) + '__' + c.supplierId;
        if (!existTypes.has(ck)) { existTypes.set(ck, c); }
      });
      batch.delete(TMPL_DOC(db, group[i].id));
      batchOps++;
      removed++;
    }
    base.costItems = [...existTypes.values()];
    base.updatedAt = new Date().toISOString().slice(0, 10);
    base.updatedBy = userName || '';
    batch.set(TMPL_DOC(db, base.id), base);
    batchOps++;
    merged++;
  }

  if (removed === 0) return { ok: true, merged: 0, removed: 0 };
  await batch.commit();
  return { ok: true, merged, removed };
}

export async function deleteCostTemplate(db, templateId) {
  await deleteDoc(TMPL_DOC(db, templateId));
  return { ok: true };
}

export async function migrateCostTemplates(db) {
  const legacySnap = await getDoc(LEGACY_REF(db));
  if (!legacySnap.exists() || legacySnap.data().migrated) return { ok: true, migrated: 0 };
  const templates = legacySnap.data().templates || [];
  if (!templates.length) {
    await setDoc(LEGACY_REF(db), { migrated: true, migratedAt: new Date().toISOString() }, { merge: true });
    return { ok: true, migrated: 0 };
  }
  const batch = writeBatch(db);
  for (const t of templates) {
    batch.set(TMPL_DOC(db, t.id), t);
  }
  batch.set(LEGACY_REF(db), { migrated: true, migratedAt: new Date().toISOString() }, { merge: true });
  await batch.commit();
  return { ok: true, migrated: templates.length };
}
