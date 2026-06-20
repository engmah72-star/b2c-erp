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

function calcSheetCost(material, doubleSided, finishingType, finishingSides, config) {
  const baseCost = parseFloat(material?.baseCost) || 0;
  const category = material?.category || DIGITAL_MATERIAL_CATEGORIES.STANDARD;

  let secondSideCost = 0;
  if (doubleSided && category !== DIGITAL_MATERIAL_CATEGORIES.STICKER) {
    const secondSideCosts = config?.secondSideCosts || {};
    secondSideCost = parseFloat(secondSideCosts[category]) || 0;
  }

  let finishingCost = 0;
  const fSides = parseInt(finishingSides) || 0;
  if (finishingType && finishingType !== 'none' && fSides > 0) {
    const finishings = config?.finishings || [];
    const finishing = finishings.find(f => f.id === finishingType);
    if (finishing) {
      finishingCost = (parseFloat(finishing.costPerSide) || 0) * fSides;
    }
  }

  return Math.max(0, baseCost + secondSideCost + finishingCost);
}

function buildDigitalCostBreakdown({ productSize, qty, material, doubleSided, finishingType, finishingSides, cuttingCost, config }) {
  const sheetSize = config?.sheetSize || DIGITAL_SHEET_SIZE_DEFAULT;
  const pcs = fitPiecesPerSheet(productSize, sheetSize);
  const sheets = sheetsNeeded(qty, pcs);
  const fSides = parseInt(finishingSides) || 0;
  const sheetCost = calcSheetCost(material, doubleSided, finishingType, fSides, config);
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

  if (finishingType && finishingType !== 'none' && fSides > 0) {
    const finishings = config?.finishings || [];
    const finishing = finishings.find(f => f.id === finishingType);
    if (finishing) {
      const fCostPerSheet = (parseFloat(finishing.costPerSide) || 0) * fSides;
      lines.push({
        type: 'تشطيب',
        label: finishing.name,
        qty: sheets,
        unitCost: fCostPerSheet,
        total: sheets * fCostPerSheet,
        note: `${fSides} وجه × ${finishing.costPerSide} ج`,
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

function buildBookletCostBreakdown({ pageCount, qty, spreadSize, coverMaterial, coverFinishing, coverFinishingSides, innerMaterial, innerFinishing, innerFinishingSides, bindingId, cuttingCost, config }) {
  const inputPages = parseInt(pageCount) || 4;
  const pages = Math.max(4, Math.ceil(inputPages / 4) * 4);
  const blankPages = pages - inputPages;
  const copies = parseInt(qty) || 0;
  if (!copies || !spreadSize) return { lines: [], summary: { totalCost: 0, costPerCopy: 0, qty: copies, pageCount: pages, blankPages } };

  const sheetSize = config?.sheetSize || DIGITAL_SHEET_SIZE_DEFAULT;
  const spreadsPerSheet = fitPiecesPerSheet(spreadSize, sheetSize);
  if (!spreadsPerSheet) return { lines: [], summary: { totalCost: 0, costPerCopy: 0, qty: copies, pageCount: pages, blankPages } };

  const coverSpreadsPerCopy = 1;
  const innerSpreadsPerCopy = (pages / 4) - 1;

  const coverSheets = sheetsNeeded(copies * coverSpreadsPerCopy, spreadsPerSheet);
  const innerSheets = innerSpreadsPerCopy > 0 ? sheetsNeeded(copies * innerSpreadsPerCopy, spreadsPerSheet) : 0;

  const lines = [];

  if (coverSheets > 0 && coverMaterial) {
    lines.push({
      type: 'غلاف — خامة',
      label: coverMaterial.name || '—',
      qty: coverSheets,
      unitCost: parseFloat(coverMaterial.baseCost) || 0,
      total: coverSheets * (parseFloat(coverMaterial.baseCost) || 0),
      note: `${spreadsPerSheet} فرخة/شيت × ${coverSheets} شيت`,
    });
    const coverCat = coverMaterial.category || 'standard';
    if (coverCat !== DIGITAL_MATERIAL_CATEGORIES.STICKER) {
      const ssCost = parseFloat((config?.secondSideCosts || {})[coverCat]) || 0;
      if (ssCost > 0) {
        lines.push({
          type: 'غلاف — وجه ثاني',
          label: 'طباعة وجهين',
          qty: coverSheets,
          unitCost: ssCost,
          total: coverSheets * ssCost,
          note: '',
        });
      }
    }
    const cFS = parseInt(coverFinishingSides) || 0;
    if (coverFinishing && coverFinishing !== 'none' && cFS > 0) {
      const fin = (config?.finishings || []).find(f => f.id === coverFinishing);
      if (fin) {
        const fCost = (parseFloat(fin.costPerSide) || 0) * cFS;
        lines.push({
          type: 'غلاف — تشطيب',
          label: fin.name,
          qty: coverSheets,
          unitCost: fCost,
          total: coverSheets * fCost,
          note: `${cFS} وجه × ${fin.costPerSide} ج`,
        });
      }
    }
  }

  if (innerSheets > 0 && innerMaterial) {
    lines.push({
      type: 'داخلي — خامة',
      label: innerMaterial.name || '—',
      qty: innerSheets,
      unitCost: parseFloat(innerMaterial.baseCost) || 0,
      total: innerSheets * (parseFloat(innerMaterial.baseCost) || 0),
      note: `${innerSpreadsPerCopy} فرخة/نسخة × ${copies} نسخة`,
    });
    const innerCat = innerMaterial.category || 'standard';
    if (innerCat !== DIGITAL_MATERIAL_CATEGORIES.STICKER) {
      const ssCost = parseFloat((config?.secondSideCosts || {})[innerCat]) || 0;
      if (ssCost > 0) {
        lines.push({
          type: 'داخلي — وجه ثاني',
          label: 'طباعة وجهين',
          qty: innerSheets,
          unitCost: ssCost,
          total: innerSheets * ssCost,
          note: '',
        });
      }
    }
    const iFS = parseInt(innerFinishingSides) || 0;
    if (innerFinishing && innerFinishing !== 'none' && iFS > 0) {
      const fin = (config?.finishings || []).find(f => f.id === innerFinishing);
      if (fin) {
        const fCost = (parseFloat(fin.costPerSide) || 0) * iFS;
        lines.push({
          type: 'داخلي — تشطيب',
          label: fin.name,
          qty: innerSheets,
          unitCost: fCost,
          total: innerSheets * fCost,
          note: `${iFS} وجه × ${fin.costPerSide} ج`,
        });
      }
    }
  }

  if (bindingId && bindingId !== 'none') {
    const binding = (config?.bindings || []).find(b => b.id === bindingId);
    if (binding) {
      const bCost = parseFloat(binding.costPerCopy) || 0;
      lines.push({
        type: 'تجليد',
        label: binding.name,
        qty: copies,
        unitCost: bCost,
        total: copies * bCost,
        note: `${bCost} ج/نسخة`,
      });
    }
  }

  const cutCost = parseFloat(cuttingCost) || 0;
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
  const costPerCopy = copies > 0 ? totalCost / copies : 0;

  return {
    lines,
    summary: {
      sheetSize,
      spreadsPerSheet,
      coverSheets,
      innerSheets,
      totalSheets: coverSheets + innerSheets,
      pageCount: pages,
      blankPages,
      totalCost: Math.max(0, totalCost),
      costPerCopy: Math.max(0, costPerCopy),
      qty: copies,
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
    buildBookletCostBreakdown,
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
    buildBookletCostBreakdown,
  };
}
