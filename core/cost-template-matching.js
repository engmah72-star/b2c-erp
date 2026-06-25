/**
 * core/cost-template-matching.js
 * ──────────────────────────────────────────────────────────
 * Unified template matching & scoring for cost templates.
 * Used by exec-cost-entry.html and exec-workspace.html.
 */

import { normalizeCostType } from './cost-type-normalize.js';

// ── Arabic-aware normalisation (extended — includes hamza/ta-marbuta) ──
export function normAr(s) {
  let n = normalizeCostType(s);
  return n
    .replace(/[أإآ]/g, 'ا').replace(/[ةه]/g, 'ه').replace(/[يى]/g, 'ي')
    .replace(/\s+/g, ' ').replace(/[٠-٩0-9]+/g, '').trim().toLowerCase();
}

function _similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // substring match: scale by length ratio (short inside long = weaker match)
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return 0.5 + ratio * 0.4;
  }
  // trigram overlap (more precise than bigrams for Arabic)
  const ga = _trigrams(a);
  const gb = _trigrams(b);
  if (!ga.length || !gb.length) return 0;
  const shared = ga.filter(g => gb.includes(g));
  return shared.length / Math.max(ga.length, gb.length);
}

function _trigrams(s) {
  const t = [];
  for (let i = 0; i <= s.length - 3; i++) t.push(s.slice(i, i + 3));
  return t;
}

function _extractQtyFromProd(p) {
  return String(p.qty || '').replace(/[^0-9]/g, '') || '';
}

/**
 * Score a template against a product (0–1).
 * Weights: name 50%, qty 25%, extras coverage 20%, print type 5%.
 */
export function scoreTmpl(template, product) {
  let score = 0;
  const reasons = [];

  // 1. Name (50% — dominant signal)
  const ns = _similarity(normAr(product.name), normAr(template.name));
  score += ns * 0.5;
  if (ns >= 0.85) reasons.push('اسم مطابق');
  else if (ns >= 0.6) reasons.push('اسم مشابه');

  // 2. Quantity (25%)
  const pQty = parseInt(_extractQtyFromProd(product)) || 0;
  const tQty = parseInt(template.qty || 0);
  if (pQty && tQty) {
    const r = Math.min(pQty, tQty) / Math.max(pQty, tQty);
    score += r * 0.25;
    if (r === 1) reasons.push(`كمية ×${pQty} مطابقة`);
    else if (r >= 0.6) reasons.push('كمية قريبة');
  } else if (!tQty) {
    score += 0.08;
  }

  // 3. Extras coverage (20%)
  const extras = product.extras || [];
  if (extras.length) {
    const ctypes = (template.costItems || []).map(c => normAr(c.type || ''));
    const covered = extras.filter(e => ctypes.some(ct => ct.includes(normAr(e)) || normAr(e).includes(ct)));
    score += covered.length / extras.length * 0.20;
    if (covered.length) reasons.push('يشمل ' + covered.join('+'));
  }

  // 4. Print type (5%)
  if (product.printType) {
    const ptn = product.printType === 'digital' ? 'ديجيتال' : 'اوفست';
    if ((template.costItems || []).some(c => normAr(c.type || '').includes(normAr(ptn)))) {
      score += 0.05;
      reasons.push(product.printType === 'digital' ? 'ديجيتال' : 'أوفست');
    }
  }

  return { score, reasons };
}

/**
 * Match templates against all products in an order.
 * Returns { matched: [...], library: [...] } sorted by score.
 *   matched: score ≥ 0.65 (strong suggestion)
 *   library: 0.30 ≤ score < 0.65 (related)
 */
export function getTmplMatches(templates, order) {
  if (!templates.length) return { matched: [], library: [] };
  const all = [];
  const seen = new Set();
  (order.products || []).forEach((prod, prodIdx) => {
    templates.forEach(t => {
      const key = t.id + '|' + prodIdx;
      if (seen.has(key)) return;
      seen.add(key);
      const { score, reasons } = scoreTmpl(t, prod);
      all.push({ template: t, prod, prodIdx, score, reasons });
    });
  });
  const byId = {};
  all.forEach(r => {
    if (!byId[r.template.id] || r.score > byId[r.template.id].score) byId[r.template.id] = r;
  });
  const ranked = Object.values(byId).sort((a, b) => b.score - a.score);
  return {
    matched: ranked.filter(r => r.score >= 0.65),
    library: ranked.filter(r => r.score >= 0.30 && r.score < 0.65),
  };
}
