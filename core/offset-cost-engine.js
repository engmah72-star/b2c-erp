'use strict';

export const OFFSET_WASTE_PCT = 0.05; // 5% هالك ثابت

/**
 * يحوّل نص المقاس "70×100" أو "70x100" إلى {w, h}.
 * يدعم الفاصل × أو x أو *.
 */
export function parseSizePair(str) {
  const m = String(str || '').replace(/\s/g, '').match(/^(\d+(?:\.\d+)?)[×xX*](\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { w: parseFloat(m[1]), h: parseFloat(m[2]) };
}

/**
 * عدد القطع (pieces) داخل فرخة الورق — يجرّب الاتجاهين.
 * printSize: "9×5" بالسم.
 * paperSize: "70×100" بالسم.
 */
export function fitPiecesPerSheet(printSize, paperSize) {
  const ps    = parseSizePair(printSize);
  const paper = parseSizePair(paperSize);
  if (!ps || !paper || ps.w <= 0 || ps.h <= 0) return 0;
  const normal  = Math.floor(paper.w / ps.w) * Math.floor(paper.h / ps.h);
  const rotated = Math.floor(paper.w / ps.h) * Math.floor(paper.h / ps.w);
  return Math.max(normal, rotated, 0);
}

/**
 * حساب الفروخ المطلوبة مع الهالك 5%.
 * @returns {{ sheetsNet, wasteSheets, sheetsTotal, piecesPerSheet }}
 */
export function sheetsCalc(piecesPerSheet, qty) {
  if (!piecesPerSheet || !qty || piecesPerSheet <= 0 || qty <= 0) {
    return { sheetsNet: 0, wasteSheets: 0, sheetsTotal: 0, piecesPerSheet: 0 };
  }
  const sheetsNet   = Math.ceil(qty / piecesPerSheet);
  const wasteSheets = Math.ceil(sheetsNet * OFFSET_WASTE_PCT);
  const sheetsTotal = sheetsNet + wasteSheets;
  return { sheetsNet, wasteSheets, sheetsTotal, piecesPerSheet };
}

/**
 * إجمالي عدد ألواح الزنك = ألوان الوجه + ألوان الظهر.
 */
export function calcZincCount(frontColors, backColors) {
  return (parseInt(frontColors) || 0) + (parseInt(backColors) || 0);
}

/**
 * تكلفة الورق: sheetsTotal × costPerSheet.
 */
export function calcPaperCost(sheetsTotal, costPerSheet) {
  return (sheetsTotal || 0) * (parseFloat(costPerSheet) || 0);
}

/**
 * تكلفة الزنكات: zincCount × costPerPlate.
 */
export function calcZincCost(frontColors, backColors, costPerPlate) {
  return calcZincCount(frontColors, backColors) * (parseFloat(costPerPlate) || 0);
}

/**
 * يبني مصفوفة بنود التكلفة المقترحة لمنتج أوفست واحد.
 * القيم المالية للعرض فقط — الحفظ يتم عبر orderActions.recordCostItem.
 *
 * @param {object} opts
 * @param {object} opts.product        — كيان المنتج (qty, printSize/size, frontColors, backColors, extras)
 * @param {object} opts.paperMeta      — {name, originalSize, costPerSheet, supplierId, supplierName}
 * @param {number} opts.zincCostPerPlate
 * @param {Array}  opts.extrasCosts    — [{name, cost, supplierId, supplierName}]
 * @returns {{ lines: costLine[], paperCalc: sheetsCalcResult }}
 */
export function buildOffsetCostBreakdown({ product, paperMeta, zincCostPerPlate = 0, extrasCosts = [] }) {
  const lines = [];
  const qty = parseInt(product?.qty) || 0;
  const printSize = product?.printSize || product?.size || '';
  const paperSize = paperMeta?.originalSize || '';

  const pieces = fitPiecesPerSheet(printSize, paperSize);
  const paperCalc = sheetsCalc(pieces, qty);

  if (paperMeta && paperCalc.sheetsTotal > 0) {
    lines.push({
      type:         'ورق',
      qty:          paperCalc.sheetsTotal,
      unitCost:     parseFloat(paperMeta.costPerSheet) || 0,
      total:        calcPaperCost(paperCalc.sheetsTotal, paperMeta.costPerSheet),
      supplierId:   paperMeta.supplierId  || '',
      supplierName: paperMeta.supplierName || '',
      note:         `${paperMeta.name || ''} ${paperMeta.originalSize || ''}`.trim(),
    });
  }

  const zinkCount = calcZincCount(product?.frontColors, product?.backColors);
  if (zinkCount > 0) {
    lines.push({
      type:         'زنكات',
      qty:          zinkCount,
      unitCost:     parseFloat(zincCostPerPlate) || 0,
      total:        calcZincCost(product?.frontColors, product?.backColors, zincCostPerPlate),
      supplierId:   '',
      supplierName: '',
      note:         `${parseInt(product?.frontColors)||0} وجه + ${parseInt(product?.backColors)||0} ظهر`,
    });
  }

  for (const ex of extrasCosts) {
    lines.push({
      type:         ex.name  || 'إضافة',
      qty:          1,
      unitCost:     parseFloat(ex.cost) || 0,
      total:        parseFloat(ex.cost) || 0,
      supplierId:   ex.supplierId   || '',
      supplierName: ex.supplierName || '',
      note:         '',
    });
  }

  return { lines, paperCalc };
}

// ── Browser global ──────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.offsetCostEngine = {
    OFFSET_WASTE_PCT,
    parseSizePair,
    fitPiecesPerSheet,
    sheetsCalc,
    calcZincCount,
    calcPaperCost,
    calcZincCost,
    buildOffsetCostBreakdown,
  };
}

// ── Node/tests ───────────────────────────────────────────────
if (typeof module !== 'undefined') {
  module.exports = {
    OFFSET_WASTE_PCT,
    parseSizePair,
    fitPiecesPerSheet,
    sheetsCalc,
    calcZincCount,
    calcPaperCost,
    calcZincCost,
    buildOffsetCostBreakdown,
  };
}
