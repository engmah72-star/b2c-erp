'use strict';

const DIGITAL_SHEET_SIZE_DEFAULT = '32×48';

const DIGITAL_MATERIAL_CATEGORIES = {
  STANDARD: 'standard',
  PREMIUM:  'premium',
  STICKER:  'sticker',
};

function parseSizePair(str) {
  const m = String(str || '').replace(/\s/g, '').match(/^(\d+(?:\.\d+)?)[×xX*](\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { w: parseFloat(m[1]), h: parseFloat(m[2]) };
}

function fitPiecesPerSheet(printSize, sheetSize) {
  const ps    = parseSizePair(printSize);
  const sheet = parseSizePair(sheetSize);
  if (!ps || !sheet || ps.w <= 0 || ps.h <= 0) return 0;
  const normal  = Math.floor(sheet.w / ps.w) * Math.floor(sheet.h / ps.h);
  const rotated = Math.floor(sheet.w / ps.h) * Math.floor(sheet.h / ps.w);
  return Math.max(normal, rotated, 0);
}

function sheetsNeeded(qty, piecesPerSheet) {
  if (!piecesPerSheet || piecesPerSheet <= 0 || !qty || qty <= 0) return 0;
  return Math.ceil(qty / piecesPerSheet);
}

function calcSheetCost(material, doubleSided, finishingType, config) {
  const baseCost = parseFloat(material?.baseCost) || 0;
  const category = material?.category || DIGITAL_MATERIAL_CATEGORIES.STANDARD;

  let secondSideCost = 0;
  if (doubleSided && category !== DIGITAL_MATERIAL_CATEGORIES.STICKER) {
    const secondSideCosts = config?.secondSideCosts || {};
    secondSideCost = parseFloat(secondSideCosts[category]) || 0;
  }

  let finishingCost = 0;
  const sides = doubleSided ? 2 : 1;
  if (finishingType && finishingType !== 'none') {
    const finishings = config?.finishings || [];
    const finishing = finishings.find(f => f.id === finishingType);
    if (finishing) {
      finishingCost = (parseFloat(finishing.costPerSide) || 0) * sides;
    }
  }

  return Math.max(0, baseCost + secondSideCost + finishingCost);
}

function buildDigitalCostBreakdown({ productSize, qty, material, doubleSided, finishingType, cuttingCost, config }) {
  const sheetSize = config?.sheetSize || DIGITAL_SHEET_SIZE_DEFAULT;
  const pcs = fitPiecesPerSheet(productSize, sheetSize);
  const sheets = sheetsNeeded(qty, pcs);
  const sheetCost = calcSheetCost(material, doubleSided, finishingType, config);
  const cutCost = parseFloat(cuttingCost) || 0;

  const lines = [];
  const category = material?.category || DIGITAL_MATERIAL_CATEGORIES.STANDARD;

  lines.push({
    type: 'خامة',
    label: material?.name || '—',
    qty: sheets,
    unitCost: parseFloat(material?.baseCost) || 0,
    total: sheets * (parseFloat(material?.baseCost) || 0),
    note: `${pcs} قطعة/شيت × ${sheets} شيت`,
  });

  if (doubleSided && category !== DIGITAL_MATERIAL_CATEGORIES.STICKER) {
    const secondSideCosts = config?.secondSideCosts || {};
    const ssCost = parseFloat(secondSideCosts[category]) || 0;
    lines.push({
      type: 'وجه ثاني',
      label: 'طباعة وجهين',
      qty: sheets,
      unitCost: ssCost,
      total: sheets * ssCost,
      note: '',
    });
  }

  if (finishingType && finishingType !== 'none') {
    const finishings = config?.finishings || [];
    const finishing = finishings.find(f => f.id === finishingType);
    if (finishing) {
      const sides = doubleSided ? 2 : 1;
      const fCostPerSheet = (parseFloat(finishing.costPerSide) || 0) * sides;
      lines.push({
        type: 'تشطيب',
        label: finishing.name,
        qty: sheets,
        unitCost: fCostPerSheet,
        total: sheets * fCostPerSheet,
        note: `${sides} وجه × ${finishing.costPerSide} ج`,
      });
    }
  }

  if (cutCost > 0) {
    lines.push({
      type: 'قص',
      label: 'تكلفة القص',
      qty: 1,
      unitCost: cutCost,
      total: cutCost,
      note: 'ثابت لكل منتج',
    });
  }

  const totalCost = lines.reduce((s, l) => s + l.total, 0);
  const costPerPiece = qty > 0 ? totalCost / qty : 0;

  return {
    lines,
    summary: {
      sheetSize,
      piecesPerSheet: pcs,
      totalSheets: sheets,
      sheetCost,
      cuttingCost: cutCost,
      totalCost: Math.max(0, totalCost),
      costPerPiece: Math.max(0, costPerPiece),
      qty,
    },
  };
}

if (typeof window !== 'undefined') {
  window.digitalCostEngine = {
    DIGITAL_SHEET_SIZE_DEFAULT,
    DIGITAL_MATERIAL_CATEGORIES,
    parseSizePair,
    fitPiecesPerSheet,
    sheetsNeeded,
    calcSheetCost,
    buildDigitalCostBreakdown,
  };
}
if (typeof module !== 'undefined') {
  module.exports = {
    DIGITAL_SHEET_SIZE_DEFAULT,
    DIGITAL_MATERIAL_CATEGORIES,
    parseSizePair,
    fitPiecesPerSheet,
    sheetsNeeded,
    calcSheetCost,
    buildDigitalCostBreakdown,
  };
}
