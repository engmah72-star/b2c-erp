/**
 * Business2Card ERP — core/gallery-browse.js
 *
 * ━━━ GALLERY BROWSE ENGINE (pure logic) ━━━
 *
 * منطق تصفّح المعرض العام (`gallery`) — بحث/فلترة/ترتيب/تصاميم مشابهة —
 * كدوال نقية بلا اعتمادية Firebase/DOM، يخدم الصفحتين معاً:
 *   - portal-designs.html (إدارة داخلية)
 *   - portal.html         (المعرض العام للعملاء)
 *
 * "تجربة Freepik": تصنيف + بحث نصّي + فلترة باللون + وسوم + ترتيب +
 * "تصاميم مشابهة" مبنية على التصنيف/الألوان/الوسوم/المجموعة.
 *
 * كل الدوال pure (نفس الإدخال ⇒ نفس الإخراج) → قابلة للاختبار بالكامل.
 */

/** ألوان العنصر (من tags=[{hex,name}]) — موحَّدة lowercase. */
export function itemColors(item) {
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  return tags
    .filter((t) => t && typeof t.hex === 'string' && t.hex)
    .map((t) => ({ hex: t.hex.toLowerCase(), name: t.name || '' }));
}

/** كلمات/وسوم العنصر النصية (keywords[]) — موحَّدة lowercase. */
export function itemKeywords(item) {
  const kw = Array.isArray(item?.keywords) ? item.keywords : [];
  return kw.map((k) => String(k).trim().toLowerCase()).filter(Boolean);
}

/** طابع زمني للعنصر (يدعم Firestore Timestamp + ISO string). */
export function tsOf(item) {
  const p = item?.publishedAt ?? item?.createdAt;
  if (p && typeof p === 'object' && typeof p.seconds === 'number') return p.seconds * 1000;
  if (p) { const t = new Date(p).getTime(); return Number.isNaN(t) ? 0 : t; }
  return 0;
}

/**
 * استخراج الـ facets للفلترة (تصنيفات/ألوان/وسوم) مع العدّادات.
 * @param {Array} items
 * @returns {{categories, colors, keywords}}
 */
export function extractFacets(items = []) {
  const cats = new Map();      // label → count
  const colors = new Map();    // hex → {hex,name,count}
  const keywords = new Map();  // label → count
  for (const it of items) {
    const c = (it?.productType || '').trim();
    if (c) cats.set(c, (cats.get(c) || 0) + 1);
    for (const col of itemColors(it)) {
      const cur = colors.get(col.hex) || { hex: col.hex, name: col.name, count: 0 };
      cur.count += 1;
      if (!cur.name && col.name) cur.name = col.name;
      colors.set(col.hex, cur);
    }
    for (const k of itemKeywords(it)) keywords.set(k, (keywords.get(k) || 0) + 1);
  }
  const byCountThenLabel = (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ar');
  return {
    categories: [...cats.entries()].map(([label, count]) => ({ label, count })).sort(byCountThenLabel),
    colors: [...colors.values()].sort((a, b) => b.count - a.count),
    keywords: [...keywords.entries()].map(([label, count]) => ({ label, count }))
      .sort(byCountThenLabel).slice(0, 40),
  };
}

/**
 * فلترة المعرض بأبعاد متعددة (كلها AND).
 * @param {Array}  items
 * @param {Object} f — { q, category, color, keyword }
 */
export function filterGallery(items = [], f = {}) {
  const qq = String(f.q || '').trim().toLowerCase();
  const cat = String(f.category || 'all');
  const col = String(f.color || '').trim().toLowerCase();
  const kw = String(f.keyword || '').trim().toLowerCase();

  return items.filter((it) => {
    if (cat && cat !== 'all' && (it.productType || '').trim() !== cat) return false;
    if (col && !itemColors(it).some((c) => c.hex === col)) return false;
    if (kw && !itemKeywords(it).includes(kw)) return false;
    if (qq) {
      const hay = [it.title, it.productType, it.designerName, ...itemKeywords(it)]
        .join(' ').toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  });
}

export const SORT_MODES = Object.freeze({
  NEWEST:  'newest',
  POPULAR: 'popular',   // المرحلة 4 — يحتاج viewCount
  TITLE:   'title',
});

/** ترتيب المعرض. لا يطفر (يُرجع نسخة جديدة). */
export function sortGallery(items = [], by = SORT_MODES.NEWEST) {
  const arr = items.slice();
  if (by === SORT_MODES.POPULAR) {
    arr.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0) || tsOf(b) - tsOf(a));
  } else if (by === SORT_MODES.TITLE) {
    arr.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ar'));
  } else {
    arr.sort((a, b) => tsOf(b) - tsOf(a));
  }
  return arr;
}

/**
 * "تصاميم مشابهة" — score مبني على:
 *   نفس المجموعة (+10) · نفس التصنيف (+4) · كل كلمة مشتركة (+2) · كل لون مشترك (+1)
 *
 * @param {Object} item — التصميم المرجعي
 * @param {Array}  all  — كل التصاميم
 * @param {Object} opts — { n=8, includeHidden=false }
 * @returns {Array} أعلى n تصميماً تشابهاً (تنازلياً)
 */
export function relatedDesigns(item, all = [], opts = {}) {
  if (!item) return [];
  const n = opts.n || 8;
  const includeHidden = !!opts.includeHidden;

  const refId = item._id;
  const cat = (item.productType || '').trim();
  const cols = new Set(itemColors(item).map((c) => c.hex));
  const kws = new Set(itemKeywords(item));
  const colId = item.collectionId || null;

  const scored = [];
  for (const o of all) {
    if (!o || o._id === refId) continue;
    if (!includeHidden && o.isVisible === false) continue;
    let s = 0;
    if (colId && o.collectionId === colId) s += 10;
    if (cat && (o.productType || '').trim() === cat) s += 4;
    for (const k of itemKeywords(o)) if (kws.has(k)) s += 2;
    for (const c of itemColors(o)) if (cols.has(c.hex)) s += 1;
    if (s > 0) scored.push({ o, s });
  }
  scored.sort((a, b) => b.s - a.s || tsOf(b.o) - tsOf(a.o));
  return scored.slice(0, n).map((x) => x.o);
}

/** تطبيق فلترة + ترتيب معاً (helper للصفحات). */
export function browseGallery(items = [], { filter = {}, sort = SORT_MODES.NEWEST } = {}) {
  return sortGallery(filterGallery(items, filter), sort);
}
