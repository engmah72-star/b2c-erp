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
  if (!pt) return [];

  const catId = product.productCategory || resolveProductCategory(product.name);
  const cat = catId ? getProductCategoryById(catId) : null;

  const base = masterCategories.filter(c =>
    c.isCostItem !== false &&
    (c.printTypes || []).some(x => x === pt || pt.includes(x) || x.includes(pt))
  );

  if (!cat || !cat.costTypeHints?.length) {
    return base.map(c => c.label);
  }

  const hints = cat.costTypeHints.map(h => _norm(h));
  const filtered = base.filter(c => {
    const nl = _norm(c.label);
    return hints.some(h => nl.includes(h) || h.includes(nl));
  });

  return filtered.length ? filtered.map(c => c.label) : base.map(c => c.label);
}
