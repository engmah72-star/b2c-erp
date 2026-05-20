/**
 * scripts/seed-materials-finishings.js
 *
 * One-time seeding للـ master_lists/materials + master_lists/finishings (RULE M1).
 *
 * الاستخدام:
 *   1. افتح Firebase Console → Firestore
 *   2. أنشئ document في `master_lists/materials` بمحتوى MATERIALS_SEED.items
 *   3. أنشئ document في `master_lists/finishings` بمحتوى FINISHINGS_SEED.items
 *
 * أو شغّل الـ script عبر Node.js (admin SDK):
 *   node scripts/seed-materials-finishings.js
 *
 * **تحذير:** يكتب فقط لو الـ docs غير موجودة (لا overwrite).
 */

// ══════════════════════════════════════════
// MATERIALS SEED — الخامات الأساسية
// ══════════════════════════════════════════

export const MATERIALS_SEED = {
  items: [
    { id: 'mat_couche',  name: 'كوشيه',   type: 'paper',  weights: [80,100,135,150,200,250,300,350], sizes: ['A4','A3','70x100','100x70'], defaultCost: 0, isActive: true, notes: 'الورق الأكثر استخداماً للكروت والبروشورات' },
    { id: 'mat_canson',  name: 'كانسون',  type: 'paper',  weights: [150,200,250,300], sizes: ['A4','A3','70x100'], defaultCost: 0, isActive: true, notes: 'ورق فاخر للملفات والـ presentation' },
    { id: 'mat_bristol', name: 'بريستول', type: 'paper',  weights: [200,250,300,350], sizes: ['A4','A3'], defaultCost: 0, isActive: true, notes: 'ورق سميك للكروت' },
    { id: 'mat_pvc',     name: 'PVC',     type: 'plastic',weights: [], sizes: ['85x55','custom'], defaultCost: 0, isActive: true, notes: 'كروت بلاستيك ذات عمر طويل' },
    { id: 'mat_sticker', name: 'استيكر',  type: 'vinyl',  weights: [], sizes: ['A4','A3','custom'], defaultCost: 0, isActive: true, notes: 'ملصقات بأنواعها' },
    { id: 'mat_foam',    name: 'فوم',     type: 'foam',   weights: [3,5,8,10], sizes: ['100x70','custom'], defaultCost: 0, isActive: true, notes: 'فوم بورد للمعارض واللوحات' },
    { id: 'mat_banner',  name: 'بنر',     type: 'vinyl',  weights: [], sizes: ['custom'], defaultCost: 0, isActive: true, notes: 'لافتات وبنرات إعلانية' },
    { id: 'mat_carton',  name: 'كرتون',   type: 'paper',  weights: [200,250,300,400,500], sizes: ['custom'], defaultCost: 0, isActive: true, notes: 'باكدج وعلب' },
  ],
};

// ══════════════════════════════════════════
// FINISHINGS SEED — التشطيبات الأساسية
// ══════════════════════════════════════════

export const FINISHINGS_SEED = {
  items: [
    { id: 'fin_cellophane',   name: 'سلوفان',         type: 'lamination', costImpact: 'percent', defaultCostModifier: 15, affectsExecution: true,  isActive: true, notes: 'يحمي السطح ويعطي لمعة' },
    { id: 'fin_uv',           name: 'UV',             type: 'coating',    costImpact: 'percent', defaultCostModifier: 20, affectsExecution: true,  isActive: true, notes: 'طلاء UV لامع' },
    { id: 'fin_gold_foil',    name: 'ذهب حراري',      type: 'foil',       costImpact: 'percent', defaultCostModifier: 35, affectsExecution: true,  isActive: true, notes: 'تأثير معدني فاخر' },
    { id: 'fin_silver_foil',  name: 'فضي حراري',      type: 'foil',       costImpact: 'percent', defaultCostModifier: 35, affectsExecution: true,  isActive: true, notes: '' },
    { id: 'fin_emboss',       name: 'طباعة بارزة',    type: 'embossing',  costImpact: 'percent', defaultCostModifier: 30, affectsExecution: true,  isActive: true, notes: '' },
    { id: 'fin_laser_cut',    name: 'قص ليزر',         type: 'cutting',    costImpact: 'fixed',   defaultCostModifier: 50, affectsExecution: true,  isActive: true, notes: 'للأشكال الخاصة' },
    { id: 'fin_die_cut',      name: 'قص داي',          type: 'cutting',    costImpact: 'fixed',   defaultCostModifier: 30, affectsExecution: true,  isActive: true, notes: '' },
    { id: 'fin_binding',      name: 'تجليد',           type: 'mounting',   costImpact: 'fixed',   defaultCostModifier: 25, affectsExecution: true,  isActive: true, notes: 'للملفات والكتالوجات' },
    { id: 'fin_staple',       name: 'دبوس',            type: 'mounting',   costImpact: 'fixed',   defaultCostModifier: 5,  affectsExecution: false, isActive: true, notes: '' },
    { id: 'fin_matte',        name: 'مات',             type: 'coating',    costImpact: 'percent', defaultCostModifier: 12, affectsExecution: false, isActive: true, notes: 'تشطيب غير لامع' },
    { id: 'fin_round_corner', name: 'تدوير زوايا',     type: 'cutting',    costImpact: 'fixed',   defaultCostModifier: 8,  affectsExecution: false, isActive: true, notes: '' },
  ],
};

// ══════════════════════════════════════════
// SEEDING FUNCTION (للاستخدام مع Firebase Admin SDK)
// ══════════════════════════════════════════
// Note: هذا للاستخدام السيرفر-سايد فقط. الـ client يقرأ فقط (لا writes).

export async function seedMasterLists(db) {
  const materialsRef = db.collection('master_lists').doc('materials');
  const finishingsRef = db.collection('master_lists').doc('finishings');

  const [matSnap, finSnap] = await Promise.all([
    materialsRef.get(),
    finishingsRef.get(),
  ]);

  const results = { materials: 'skipped', finishings: 'skipped' };

  if (!matSnap.exists) {
    await materialsRef.set({
      ...MATERIALS_SEED,
      updatedAt: new Date(),
      seededAt: new Date(),
    });
    results.materials = 'created';
  }

  if (!finSnap.exists) {
    await finishingsRef.set({
      ...FINISHINGS_SEED,
      updatedAt: new Date(),
      seededAt: new Date(),
    });
    results.finishings = 'created';
  }

  return results;
}
