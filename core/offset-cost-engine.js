'use strict';

export const OFFSET_WASTE_PCT = 0.05; // 5% هالك ثابت

// ── هوامش الطباعة الفعلية ────────────────────────────────────────
// هامش العرض فقط (الجانبان الأيمن والأيسر — علامات قص وتسجيل).
// هامش الطول = 0: الماسكة تأكل الحافة الأولى من الورق لكنها لا تُقلّص
// عدد الصفوف — القطع تُوزَّع على كامل الطول والهدر يُقطَّع في النهاية.
export const SHEET_MARGIN_W = 1.5; // سم — إجمالي الجانبين (يمين + يسار)
export const SHEET_MARGIN_H = 0;   // سم — لا خصم من الطول (الماسكة = هدر منفصل)

// ── قصات السوق المصري المعروفة ────────────────────────────────────
// مرجع خبرة السوق — يُعرض كتسمية بجانب الحساب الفعلي.
// • calcCount: العدد الهندسي الصحيح (مصدر القرار).
// • marketCount: التسمية التجارية المتعارف عليها.
// • إذا اختلفا يُشرح السبب في الواجهة.
export const KNOWN_MARKET_CUTS = [
  // ───── من ستاندر كامل 70×100 ─────
  { sizes:['50×70'],           name:'نصف فرخ (نص)',  marketCount:2,  calcCount:2,  sheet:'70×100', tier:'nus'  },
  { sizes:['35×50'],           name:'ربع فرخ',        marketCount:4,  calcCount:4,  sheet:'70×100', tier:'rub3' },
  { sizes:['25×35'],           name:'ثمن فرخ',        marketCount:8,  calcCount:8,  sheet:'70×100', tier:'tumn' },
  { sizes:['17.5×25'],         name:'ستاشر',          marketCount:16, calcCount:16, sheet:'70×100', tier:'tumn' },
  { sizes:['23×33','21×29'],   name:'تسعات',          marketCount:9,  calcCount:9,  sheet:'70×100', tier:'rub3' },
  { sizes:['20×35'],           name:'عشرات',          marketCount:10, calcCount:10, sheet:'70×100', tier:'rub3' },
  // حداشر: المقاس (20×30) يُصنَّف ضمن ماكينة التمن في السوق المصري.
  // التسمية السوقية "حداشر" (11) مشتقة من تقريب المساحة (7000÷600≈11.67).
  // التوزيع الفعلي الأمثل على ستاندر كامل: 2 عمود × 5 صف عرضي = 10 قطع.
  { sizes:['20×30'],           name:'حداشر',          marketCount:11, calcCount:10, sheet:'70×100', tier:'tumn',
    note:'التسمية السوقية "حداشر" (11) مبنية على تقريب المساحة (7000÷600≈11.67). التوزيع الفعلي الأمثل: 2 عمود × 5 صف عرضي = 10 قطع.' },
  // ───── من جاير كامل 66×88 ─────
  { sizes:['44×66'],           name:'نصف جاير',      marketCount:2,  calcCount:2,  sheet:'66×88',  tier:'nus'  },
  { sizes:['33×44'],           name:'ربع جاير',       marketCount:4,  calcCount:4,  sheet:'66×88',  tier:'rub3' },
  { sizes:['22×33'],           name:'ثمن جاير',       marketCount:8,  calcCount:8,  sheet:'66×88',  tier:'tumn' },
];

/**
 * يبحث عن اسم القصة السوقية لمقاس طباعة معيّن.
 * يجرّب الاتجاهين (طولي + عرضي).
 */
export function lookupMarketCut(printSize) {
  const ps = parseSizePair(printSize);
  if (!ps) return null;
  return KNOWN_MARKET_CUTS.find(cut =>
    cut.sizes.some(s => {
      const sz = parseSizePair(s);
      if (!sz) return false;
      const tol = 0.6; // تسامح 6mm
      return (Math.abs(sz.w - ps.w) < tol && Math.abs(sz.h - ps.h) < tol) ||
             (Math.abs(sz.w - ps.h) < tol && Math.abs(sz.h - ps.w) < tol);
    })
  ) || null;
}

export const STANDARD_PAPER_SIZES = [
  // ستاندر
  { id:'s-full',  name:'ستاندر كامل',    originalSize:'70×100', machine:'ماكينة فرخ كامل',  family:'ستاندر' },
  { id:'s-half',  name:'ستاندر نصف',     originalSize:'50×70',  machine:'ماكينة نصف فرخ',   family:'ستاندر' },
  { id:'s-qtr',   name:'ستاندر ربع',     originalSize:'35×50',  machine:'ماكينة ربع فرخ',   family:'ستاندر' },
  { id:'s-8th',   name:'ستاندر ثمن',     originalSize:'25×35',  machine:'ماكينة ثمن فرخ',   family:'ستاندر' },
  { id:'s-16th',  name:'ستاندر نصف ثمن', originalSize:'17.5×25',machine:'',                  family:'ستاندر' },
  // جاير
  { id:'g-full',  name:'جاير كامل',      originalSize:'66×88',  machine:'ماكينة جاير',       family:'جاير'   },
  { id:'g-half',  name:'جاير نصف',       originalSize:'44×66',  machine:'',                  family:'جاير'   },
  { id:'g-qtr',   name:'جاير ربع',       originalSize:'33×44',  machine:'',                  family:'جاير'   },
  { id:'g-8th',   name:'جاير ثمن',       originalSize:'22×33',  machine:'',                  family:'جاير'   },
  // تسعات / عشرات / حدشرات
  { id:'ts-a',    name:'تسعات',          originalSize:'23×33',  machine:'',                  family:'تسعات'  },
  { id:'ts-b',    name:'تسعات A4',       originalSize:'21×29',  machine:'',                  family:'تسعات'  },
  { id:'ashr',    name:'عشرات',          originalSize:'20×35',  machine:'',                  family:'عشرات'  },
  { id:'hdsh',    name:'حداشر',           originalSize:'20×30',  machine:'',                  family:'عشرات'  },
];

/**
 * يحوّل نص المقاس "70×100" أو "70x100" إلى {w, h}.
 */
export function parseSizePair(str) {
  const m = String(str || '').replace(/\s/g, '').match(/^(\d+(?:\.\d+)?)[×xX*](\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { w: parseFloat(m[1]), h: parseFloat(m[2]) };
}

/**
 * المقاس الفعلي القابل للطباعة بعد خصم الماسكة والعلامات الفنية.
 * الماكينة تأكل هامشاً من كل حافة — النتيجة هي المساحة الصالحة فعلاً للتوزيع.
 */
export function effectivePaperSize(paperSizeStr) {
  const p = parseSizePair(paperSizeStr);
  if (!p) return null;
  return {
    w: Math.max(p.w - SHEET_MARGIN_W, 0),
    h: Math.max(p.h - SHEET_MARGIN_H, 0),
  };
}

/**
 * عدد القطع داخل فرخة الورق.
 * يجرّب الاتجاهين (طبيعي + مقلوب) على المقاس الفعلي بعد خصم الهوامش.
 */
export function fitPiecesPerSheet(printSize, paperSize) {
  const ps  = parseSizePair(printSize);
  const eff = effectivePaperSize(paperSize);
  if (!ps || !eff || ps.w <= 0 || ps.h <= 0 || eff.w <= 0 || eff.h <= 0) return 0;
  // قص مباشر: الورق ≈ مقاس الطباعة (فرق ≤ 2 سم) → قطعة واحدة بالضرورة
  const pap = parseSizePair(paperSize);
  if (pap) {
    const tol = 2;
    const isDirect = (Math.abs(pap.w - ps.w) <= tol && Math.abs(pap.h - ps.h) <= tol) ||
                     (Math.abs(pap.w - ps.h) <= tol && Math.abs(pap.h - ps.w) <= tol);
    if (isDirect) return 1;
  }
  const normal  = Math.floor(eff.w / ps.w) * Math.floor(eff.h / ps.h);
  const rotated = Math.floor(eff.w / ps.h) * Math.floor(eff.h / ps.w);
  return Math.max(normal, rotated, 0);
}

/**
 * تخطيط القص التفصيلي: كام عمود × كام صف + هل مقلوب؟
 * الكفاءة تُحسب نسبة المساحة المستخدمة من المساحة الفعلية للطباعة (لا المقاس النظري).
 * cuts = عدد مراحل القص بالمقصّ الغيوتيني = (cols-1) + (rows-1)
 * @returns {{ cols, rows, pcs, rotated, cuts, efficiency, effectiveW, effectiveH }} أو null
 */
export function fitLayout(printSize, paperSize) {
  const ps  = parseSizePair(printSize);
  const eff = effectivePaperSize(paperSize);
  if (!ps || !eff || ps.w <= 0 || ps.h <= 0 || eff.w <= 0 || eff.h <= 0) return null;

  // قص مباشر: الورق ≈ مقاس الطباعة → تخطيط 1×1، لا قصات داخلية
  const pap = parseSizePair(paperSize);
  if (pap) {
    const tol = 2;
    const isDirect = (Math.abs(pap.w - ps.w) <= tol && Math.abs(pap.h - ps.h) <= tol) ||
                     (Math.abs(pap.w - ps.h) <= tol && Math.abs(pap.h - ps.w) <= tol);
    if (isDirect) return { cols:1, rows:1, pcs:1, rotated:false, cuts:0, efficiency:100, effectiveW:eff.w, effectiveH:eff.h };
  }

  const nCols = Math.floor(eff.w / ps.w), nRows = Math.floor(eff.h / ps.h);
  const rCols = Math.floor(eff.w / ps.h), rRows = Math.floor(eff.h / ps.w);
  const nPcs  = nCols * nRows, rPcs = rCols * rRows;

  const best = nPcs >= rPcs
    ? { cols: nCols, rows: nRows, pcs: nPcs, rotated: false }
    : { cols: rCols, rows: rRows, pcs: rPcs, rotated: true  };

  const usedW = best.rotated ? best.cols * ps.h : best.cols * ps.w;
  const usedH = best.rotated ? best.rows * ps.w : best.rows * ps.h;
  // الكفاءة نسبة لمساحة الطباعة الفعلية (وليس المقاس النظري)
  best.efficiency   = eff.w * eff.h > 0 ? Math.round(usedW * usedH / (eff.w * eff.h) * 100) : 0;
  best.effectiveW   = eff.w;
  best.effectiveH   = eff.h;
  // مراحل القص الغيوتيني: (عدد الأعمدة - 1) + (عدد الصفوف - 1)
  best.cuts = Math.max(0, (best.cols - 1) + (best.rows - 1));
  return best;
}

/**
 * حساب الفروخ مع الهالك 5%.
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
 * يرتّب كل المقاسات (قياسية + مُعرَّفة) حسب أعلى استغلال لمقاس طباعة معيّن.
 *
 * customSizes: من paperTypesData (فيها سعر + مورد).
 * المقاسات القياسية تظهر دائماً — إن تطابق مع custom يُدمجا ويأخذ بيانات الـ custom.
 *
 * @returns {Array<{name, originalSize, machine, family, pcs, sheetsTotal, sheetsNet, wasteSheets, costPerSheet?, supplierName?, hasPrice}>}
 */
export function rankAllSizes(printSize, qty, customSizes = []) {
  const customBySize = new Map();
  for (const cp of customSizes) {
    if (cp.originalSize) customBySize.set(cp.originalSize, cp);
  }

  const combined = STANDARD_PAPER_SIZES.map(std => {
    const c = customBySize.get(std.originalSize);
    return c ? { ...std, ...c, isStandard: true, hasPrice: !!c.costPerSheet }
             : { ...std, isStandard: true, hasPrice: false };
  });

  for (const cp of customSizes) {
    if (!STANDARD_PAPER_SIZES.some(s => s.originalSize === cp.originalSize)) {
      combined.push({ ...cp, isStandard: false, hasPrice: !!cp.costPerSheet });
    }
  }

  return combined
    .map(pm => {
      const pcs = fitPiecesPerSheet(printSize, pm.originalSize || '');
      const sc  = pcs > 0 && qty > 0 ? sheetsCalc(pcs, qty) : { sheetsNet:0, wasteSheets:0, sheetsTotal:0 };
      const szPair = parseSizePair(pm.originalSize || '');
      const _area  = szPair ? szPair.w * szPair.h : Infinity;
      return { ...pm, pcs, ...sc, _area };
    })
    .filter(pm => pm.pcs > 0)
    // القاعدة: أصغر مقاس يستوعب الشغلانة أولاً — لتقليل التكلفة والهالك
    .sort((a, b) => a._area - b._area);
}

export function calcZincCount(frontColors, backColors) {
  return (parseInt(frontColors) || 0) + (parseInt(backColors) || 0);
}
export function calcPaperCost(sheetsTotal, costPerSheet) {
  return (sheetsTotal || 0) * (parseFloat(costPerSheet) || 0);
}
export function calcZincCost(frontColors, backColors, costPerPlate) {
  return calcZincCount(frontColors, backColors) * (parseFloat(costPerPlate) || 0);
}

export function buildOffsetCostBreakdown({ product, paperMeta, zincCostPerPlate = 0, extrasCosts = [] }) {
  const lines = [];
  const qty = parseInt(product?.qty) || 0;
  const printSize = product?.printSize || product?.size || '';
  const pieces = fitPiecesPerSheet(printSize, paperMeta?.originalSize || '');
  const paperCalc = sheetsCalc(pieces, qty);

  if (paperMeta && paperCalc.sheetsTotal > 0) {
    lines.push({
      type: 'ورق', qty: paperCalc.sheetsTotal,
      unitCost: parseFloat(paperMeta.costPerSheet) || 0,
      total: calcPaperCost(paperCalc.sheetsTotal, paperMeta.costPerSheet),
      supplierId: paperMeta.supplierId || '', supplierName: paperMeta.supplierName || '',
      note: `${paperMeta.name || ''} ${paperMeta.originalSize || ''}`.trim(),
    });
  }
  const zinkCount = calcZincCount(product?.frontColors, product?.backColors);
  if (zinkCount > 0) {
    lines.push({
      type: 'زنكات', qty: zinkCount,
      unitCost: parseFloat(zincCostPerPlate) || 0,
      total: calcZincCost(product?.frontColors, product?.backColors, zincCostPerPlate),
      supplierId: '', supplierName: '',
      note: `${parseInt(product?.frontColors)||0} وجه + ${parseInt(product?.backColors)||0} ظهر`,
    });
  }
  for (const ex of extrasCosts) {
    lines.push({ type: ex.name || 'إضافة', qty: 1, unitCost: parseFloat(ex.cost)||0, total: parseFloat(ex.cost)||0, supplierId: ex.supplierId||'', supplierName: ex.supplierName||'', note: '' });
  }
  return { lines, paperCalc };
}

// ── Browser global ──────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.offsetCostEngine = {
    OFFSET_WASTE_PCT, SHEET_MARGIN_W, SHEET_MARGIN_H, STANDARD_PAPER_SIZES,
    KNOWN_MARKET_CUTS,
    parseSizePair, effectivePaperSize, fitPiecesPerSheet, fitLayout, sheetsCalc,
    rankAllSizes, lookupMarketCut,
    calcZincCount, calcPaperCost, calcZincCost,
    buildOffsetCostBreakdown,
  };
}
if (typeof module !== 'undefined') {
  module.exports = {
    OFFSET_WASTE_PCT, SHEET_MARGIN_W, SHEET_MARGIN_H, STANDARD_PAPER_SIZES,
    KNOWN_MARKET_CUTS,
    parseSizePair, effectivePaperSize, fitPiecesPerSheet, fitLayout, sheetsCalc,
    rankAllSizes, lookupMarketCut,
    calcZincCount, calcPaperCost, calcZincCost,
    buildOffsetCostBreakdown,
  };
}
