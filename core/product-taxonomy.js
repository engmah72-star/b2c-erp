/**
 * core/product-taxonomy.js
 *
 * T9: Product Type Taxonomy — structured product classification
 * for accurate cost-type matching per product.
 */

import { normalizeCostType } from './cost-type-normalize.js';

export const PRODUCT_CATEGORIES = [
  {
    id: 'paper_prints',
    label: 'مطبوعات ورقية',
    keywords: [
      'بروشور', 'فلاير', 'كارت', 'كتيب', 'مجلة', 'كتالوج', 'ظرف',
      'فولدر', 'ملصق', 'استيكر', 'دفتر', 'نوتة', 'أجندة', 'تقويم',
      'شهادة', 'دعوة', 'منيو', 'فاتورة', 'كروت', 'بوستر', 'نشرة',
      'مظروف', 'ورقة', 'ورق', 'بطاقة', 'كتاب', 'تاج', 'ليبل',
    ],
    costTypeHints: [
      'طباعة', 'ورق', 'زنكات', 'تجليد', 'سلوفان', 'يو في', 'تقطيع',
      'دبوس', 'لصق', 'تكسير', 'تصميم', 'فرز', 'تغليف',
    ],
  },
  {
    id: 'large_format',
    label: 'طباعة كبيرة',
    keywords: [
      'بانر', 'رول اب', 'ستاند', 'يافطة', 'لافتة', 'خلفية', 'فينيل',
      'ساين', 'backdrop', 'رول', 'بنر', 'لوحة', 'لوح', 'فلكس', 'مش',
      'ميش', 'واجهة', 'حروف بارزة',
    ],
    costTypeHints: ['طباعة', 'خامة', 'تركيب', 'تصميم'],
  },
  {
    id: 'packaging',
    label: 'تغليف وعلب',
    keywords: [
      'علبة', 'كرتون', 'باكج', 'تغليف', 'شنطة', 'أكياس', 'كيس',
      'صندوق', 'بوكس', 'باكيج',
    ],
    costTypeHints: [
      'طباعة', 'تقطيع', 'تجليد', 'لصق', 'خامة', 'تصميم', 'ورق',
    ],
  },
  {
    id: 'stamps',
    label: 'أختام',
    keywords: ['ختم', 'أختام', 'stamp', 'شمع'],
    costTypeHints: ['ختم', 'حبر', 'تصميم'],
  },
  {
    id: 'promotional',
    label: 'هدايا دعائية',
    keywords: [
      'تيشيرت', 'مج', 'قلم', 'ميدالية', 'شارة', 'هدايا', 'سبلميشن',
      'كوب', 'تيشرت', 'ميداليه', 'يونيفورم', 'كاب', 'شنطه', 'فلاشة',
    ],
    costTypeHints: ['طباعة', 'خامة', 'تصميم'],
  },
  {
    id: 'design_only',
    label: 'تصميم فقط',
    keywords: [
      'تصميم', 'لوجو', 'هوية', 'identity', 'موشن', 'فيديو', 'سوشيال',
      'بوست', 'اعلان', 'إعلان',
    ],
    costTypeHints: ['تصميم'],
  },
];

const _cache = new Map();

function _norm(s) {
  return normalizeCostType(s).replace(/[أإآ]/g, 'ا')
    .replace(/[ةه]/g, 'ه').replace(/[يى]/g, 'ي')
    .toLowerCase();
}

export function resolveProductCategory(productName) {
  if (!productName) return null;
  const n = _norm(productName);
  if (_cache.has(n)) return _cache.get(n);

  let best = null, bestLen = 0;
  for (const cat of PRODUCT_CATEGORIES) {
    for (const kw of cat.keywords) {
      const nk = _norm(kw);
      if (n.includes(nk) && nk.length > bestLen) {
        best = cat;
        bestLen = nk.length;
      }
    }
  }
  const result = best ? best.id : null;
  _cache.set(n, result);
  return result;
}

export function getProductCategoryById(id) {
  return PRODUCT_CATEGORIES.find(c => c.id === id) || null;
}

export function getExpectedCostTypes(product, masterCategories) {
  if (!product || !masterCategories?.length) return [];
  const pt = (product.printType || '').toLowerCase();
  const extras = Array.isArray(product.extras) ? product.extras : [];

  const seen = new Set();
  const result = [];
  const _add = label => { if (label && !seen.has(label)) { seen.add(label); result.push(label); } };

  // 1) Extras selected in printing are the primary expected cost types
  extras.forEach(ex => _add(ex));

  // 2) Lamination selected → expect سلفنة-related cost
  if (product.lamination && product.lamination !== 'بلا') {
    const lamCat = masterCategories.find(c =>
      c.isCostItem !== false && _norm(c.label).includes('سلفن')
    );
    if (lamCat) _add(lamCat.label);
  }

  // 3) Fill from masterCategories matching printType (existing logic)
  if (pt) {
    const base = masterCategories.filter(c =>
      c.isCostItem !== false &&
      (c.printTypes || []).some(x => x === pt || pt.includes(x) || x.includes(pt))
    );

    const catId = product.productCategory || resolveProductCategory(product.name);
    const cat = catId ? getProductCategoryById(catId) : null;

    if (cat?.costTypeHints?.length) {
      const hints = cat.costTypeHints.map(h => _norm(h));
      const filtered = base.filter(c => {
        const nl = _norm(c.label);
        return hints.some(h => nl.includes(h) || h.includes(nl));
      });
      (filtered.length ? filtered : base).forEach(c => _add(c.label));
    } else {
      base.forEach(c => _add(c.label));
    }
  }

  return result;
}
