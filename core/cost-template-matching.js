/**
 * core/cost-template-matching.js
 * ──────────────────────────────────────────────────────────
 * Unified template matching & scoring for cost templates.
 * Used by exec-cost-entry.html and exec-workspace.html.
 */

// ── Arabic-aware normalisation ──────────────────────────────
export function normAr(s) {
  return (s || '')
    .replace(/[أإآ]/g, 'ا').replace(/[ةه]/g, 'ه').replace(/[يى]/g, 'ي')
    .replace(/\s+/g, '').replace(/[٠-٩0-9]+/g, '').toLowerCase();
}

function _similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const wa = a.match(/.{2,}/g) || [];
  const wb = b.match(/.{2,}/g) || [];
  const shared = wa.filter(w => wb.some(x => x.includes(w) || w.includes(x)));
  return wa.length ? shared.length / Math.max(wa.length, wb.length) : 0;
}

function _extractQtyFromProd(p) {
  return String(p.qty || '').replace(/[^0-9]/g, '') || '';
}

/**
 * Score a template against a product (0–1).
 * Weights: name 40%, qty 30%, extras coverage 25%, print type 5%.
 */
export function scoreTmpl(template, product) {
  let score = 0;
  const reasons = [];

  // 1. Name (40%)
  const ns = _similarity(normAr(product.name), normAr(template.name));
  score += ns * 0.4;
  if (ns >= 0.85) reasons.push('اسم مطابق');
  else if (ns >= 0.5) reasons.push('اسم مشابه');

  // 2. Quantity (30%)
  const pQty = parseInt(_extractQtyFromProd(product)) || 0;
  const tQty = parseInt(template.qty || 0);
  if (pQty && tQty) {
    const r = Math.min(pQty, tQty) / Math.max(pQty, tQty);
    score += r * 0.3;
    if (r === 1) reasons.push(`كمية ×${pQty} مطابقة`);
    else if (r >= 0.6) reasons.push('كمية قريبة');
  } else if (!tQty) {
    score += 0.12;
  }

  // 3. Extras coverage (25%)
  const extras = product.extras || [];
  if (extras.length) {
    const ctypes = (template.costItems || []).map(c => normAr(c.type || ''));
    const covered = extras.filter(e => ctypes.some(ct => ct.includes(normAr(e)) || normAr(e).includes(ct)));
    score += covered.length / extras.length * 0.25;
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
 *   matched: score ≥ 0.55 (strong suggestion)
 *   library: 0.15 ≤ score < 0.55 (related)
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
    matched: ranked.filter(r => r.score >= 0.55),
    library: ranked.filter(r => r.score >= 0.15 && r.score < 0.55),
  };
}
