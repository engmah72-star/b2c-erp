/**
 * Business2Card ERP — clients-data.js
 *
 * ━━━ PURE STATISTICS + AGGREGATIONS FOR clients.html ━━━
 *
 * God-page decomposition (RULE G5 + L1): the clients page used to
 * inline a 90-line `updateStats()` function that mixed data
 * computation with DOM writes. This module exposes the pure
 * computation; the page wrapper does the DOM writes.
 *
 * No Firestore reads, no DOM writes — pure functions over the
 * `clients` + `allOrders` arrays already loaded by clients.html.
 */

/**
 * computeClientStats({clients, orders, calcRem, ordersIndex}) → stats
 *
 * Returns the entire stats payload `updateStats` needs in one pass:
 *   - top totals (sales / remaining / count)
 *   - time-period buckets (today / yesterday / week / month / lastMonth)
 *   - month-over-month delta (count %)
 *   - quick-filter counts (all / vip / active / rem / risk / new / sleep)
 *
 * ordersIndex is the pre-built `Map<clientId, orders[]>` (page calls
 * buildClientOrdersIndex() and passes it in for O(N) quick-filter scan).
 *
 * @param {Object}  args
 * @param {Array}   args.clients      — all clients
 * @param {Array}   args.orders       — all orders (filtered to clients' own)
 * @param {(o:any)=>number} args.calcRem  — page's remaining-balance fn
 * @param {Map<string, Array>} args.ordersIndex — clientId → orders[]
 * @returns {{
 *   totals: {sales:number, rem:number, clientCount:number},
 *   periods: {today, yesterday, week, month, lastMonth: {n:number,r:number}},
 *   monthDelta: {pct:number|null, direction:'up'|'down'|null},
 *   quickFilters: {all,vip,active,rem,risk,new,sleep},
 * }}
 */
export function computeClientStats({
  clients = [],
  orders: allOrders = [],
  calcRem = () => 0,
  ordersIndex = new Map(),
} = {}) {
  // ── Top totals (client-owned orders only) ──
  const cIds = new Set(clients.map(c => c._id));
  const myOrders = (allOrders || []).filter(o =>
    cIds.has(o.clientId) ||
    (o.clientPhone && clients.find(c => c.phone1 === o.clientPhone))
  );
  const sumPaid = (arr) =>
    arr.reduce((s, o) =>
      s + (parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0), 0);
  const sumSalePrice = (arr) =>
    arr.reduce((s, o) => s + (parseFloat(o.salePrice) || 0), 0);
  const sales = sumPaid(myOrders);
  const salesGross = sumSalePrice(myOrders);
  const rem   = myOrders.reduce((s, o) => s + calcRem(o), 0);

  // ── Operational metrics (Runtime KPI strip) ──
  const nowTs = Date.now();
  const openOrders = myOrders.filter(o => o.stage !== 'archived' && o.stage !== 'cancelled');
  const lateOrders = openOrders.filter(o => o.deadline && new Date(o.deadline).getTime() < nowTs);
  // متوسط مدة التنفيذ — للأوردرات المؤرشفة فقط (دورة كاملة)
  const archivedOrders = myOrders.filter(o => o.stage === 'archived');
  let avgExecutionDays = 0;
  if (archivedOrders.length > 0) {
    const totalDays = archivedOrders.reduce((s, o) => {
      const createdSec = o.createdAt?.seconds || 0;
      const archivedSec = o.archivedAt?.seconds || o.updatedAt?.seconds || 0;
      if (!createdSec || !archivedSec || archivedSec <= createdSec) return s;
      return s + (archivedSec - createdSec) / 86400;
    }, 0);
    avgExecutionDays = +(totalDays / archivedOrders.length).toFixed(1);
  }

  // ── Time-period boundaries ──
  const now             = new Date();
  const todayStart      = new Date(); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart  = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart       = new Date(todayStart); weekStart.setDate(weekStart.getDate() - todayStart.getDay());
  const monthStart      = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd    = new Date(now.getFullYear(), now.getMonth(), 1);

  const clientInRange = (c, from, to) => {
    const ts = c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000) : null;
    if (!ts) return false;
    return ts >= from && (!to || ts < to);
  };
  const ordersInRange = (from, to) => myOrders.filter(o => {
    const t = o.createdAt?.toDate?.()?.getTime() || ((o.createdAt?.seconds || 0) * 1000);
    return t >= from.getTime() && (!to || t < to.getTime());
  });

  const todayC     = clients.filter(c => clientInRange(c, todayStart));
  const yestC      = clients.filter(c => clientInRange(c, yesterdayStart, todayStart));
  const weekC      = clients.filter(c => clientInRange(c, weekStart));
  const monthC     = clients.filter(c => clientInRange(c, monthStart));
  const lastMonthC = clients.filter(c => clientInRange(c, lastMonthStart, lastMonthEnd));

  const periods = {
    today:     { n: todayC.length,     r: sumPaid(ordersInRange(todayStart,     null)) },
    yesterday: { n: yestC.length,      r: sumPaid(ordersInRange(yesterdayStart, todayStart)) },
    week:      { n: weekC.length,      r: sumPaid(ordersInRange(weekStart,      null)) },
    month:     { n: monthC.length,     r: sumPaid(ordersInRange(monthStart,     null)) },
    lastMonth: { n: lastMonthC.length, r: sumPaid(ordersInRange(lastMonthStart, lastMonthEnd)) },
  };

  // Month-over-month count delta
  let monthDelta = { pct: null, direction: null };
  if (lastMonthC.length > 0) {
    const diff = Math.round(((monthC.length - lastMonthC.length) / lastMonthC.length) * 100);
    monthDelta = { pct: diff, direction: diff >= 0 ? 'up' : 'down' };
  }

  // ── Quick-filter counts (uses pre-built ordersIndex for O(N)) ──
  const nowSec = Date.now() / 1000;
  let nVip = 0, nActive = 0, nRem = 0, nRisk = 0, nNew = 0, nSleep = 0;
  for (const c of clients) {
    if (c.status === 'legacy') continue;
    const ords = ordersIndex.get(c._id) || [];
    let cRem = 0, hasAct = false, lastTs = 0;
    for (const o of ords) {
      cRem += calcRem(o);
      if (o.stage !== 'archived') hasAct = true;
      const t = o.createdAt?.seconds || 0;
      if (t > lastTs) lastTs = t;
    }
    const daysSince = lastTs ? Math.floor((nowSec - lastTs) / 86400) : 999;
    if (ords.length >= 3)              nVip++;
    if (hasAct)                        nActive++;
    if (cRem > 0)                      nRem++;
    if (daysSince >= 30 && daysSince < 90) nRisk++;
    if (clientInRange(c, weekStart))   nNew++;
    if (daysSince >= 90 && daysSince < 999) nSleep++;
  }

  return {
    totals: {
      sales,
      salesGross,
      rem,
      clientCount: clients.length,
      activeClientCount: nActive,
      openOrdersCount: openOrders.length,
      lateOrdersCount: lateOrders.length,
      avgExecutionDays,
    },
    periods,
    monthDelta,
    quickFilters: {
      all:    clients.filter(c => c.status !== 'legacy').length,
      vip:    nVip,
      active: nActive,
      rem:    nRem,
      risk:   nRisk,
      new:    nNew,
      sleep:  nSleep,
    },
  };
}

/**
 * parseBizCardText(text) → fields
 *
 * Smart-paste parser: takes free-form text (from WhatsApp / email /
 * business cards) and extracts business-card fields via regex +
 * heuristics. Returns an object keyed by the bcInput id suffixes
 * (e.g. 'mobile-phone', 'name-ar', 'company-en', ...) so the page can
 * directly populate the DOM via `document.getElementById('bc-' + key)`.
 *
 * Pure function. No DOM, no Firestore, no async. Idempotent.
 *
 * Detected fields:
 *   Phones (EG): mobile-phone, whatsapp, office-phone
 *   Emails:      email, email-2
 *   URLs (social): fb, ig, tw, linkedin, tiktok, yt, snap, telegram,
 *                  whatsapp, maps-link, website
 *   Names:       name-ar, name-en
 *   Job titles:  job-ar, job-en
 *   Companies:   company-ar, company-en
 *   Address:     address-ar
 *   Industry:    biz-type
 */
export function parseBizCardText(text) {
  const r = {};
  if (!text) return r;

  // Phones (Egyptian)
  const phones    = text.match(/(?:\+?20)?0?1[0125]\d{8}/g) || [];
  const landlines = text.match(/0\d{2,3}[-\s]?\d{6,8}/g) || [];
  if (phones[0]) r['mobile-phone'] = phones[0];
  if (phones[1]) r['whatsapp']     = phones[1];
  if (landlines[0] && !phones.includes(landlines[0])) r['office-phone'] = landlines[0];
  if (!r['office-phone'] && phones[0] && /تليفون.{0,15}مكتب|مكتب.{0,15}تليفون|office/i.test(text)) {
    r['office-phone'] = phones[0];
    delete r['mobile-phone'];
  }

  // Emails
  const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  if (emails[0]) r['email']   = emails[0];
  if (emails[1]) r['email-2'] = emails[1];

  // URLs (full + bare social shortcuts)
  const urls = text.match(
    /https?:\/\/[^\s,،]+|(?:facebook|instagram|twitter|x|linkedin|tiktok|youtube|snapchat)\.com\/[\w@.-]+|wa\.me\/\d+|t\.me\/\w+/gi
  ) || [];
  urls.forEach(u => {
    const url = u.startsWith('http') ? u : 'https://' + u;
    if (/facebook\.com|fb\.com/i.test(u))            r['fb']        = url;
    else if (/instagram\.com/i.test(u))              r['ig']        = url;
    else if (/(twitter\.com|^x\.com|\/x\.com)/i.test(u)) r['tw']    = url;
    else if (/linkedin\.com/i.test(u))               r['linkedin']  = url;
    else if (/tiktok\.com/i.test(u))                 r['tiktok']    = url;
    else if (/youtube\.com/i.test(u))                r['yt']        = url;
    else if (/snapchat\.com/i.test(u))               r['snap']      = url;
    else if (/t\.me/i.test(u))                       r['telegram']  = url;
    else if (/wa\.me/i.test(u))                      r['whatsapp']  = url;
    else if (/maps\.|goo\.gl\/maps|maps\.google/i.test(u)) r['maps-link'] = url;
    else if (!r['website'])                          r['website']   = url;
  });

  // Lines analysis
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const isAr           = s => /[؀-ۿ]/.test(s);
  const isEn           = s => /^[A-Za-z][A-Za-z\s.&,'-]+$/.test(s);
  const isPhoneOrEmail = s => /^[\d\s\-+()]+$/.test(s) || /@/.test(s) || /^https?:/.test(s);
  const jobKwAr        = /^(د\.|دكتور|م\.|مهندس|أ\.|أستاذ|المستشار|محامي|طبيب|محامى|كابتن|الشيف|chef|دكتورة|محاسب|مدير|مالك|رئيس|نائب)/;
  const companyKwAr    = /شركة|مكتب|مطعم|كافيه|عيادة|مركز|مؤسسة|مصنع|محل|استوديو|أكاديمية|مدرسة|للـ?(محاماة|استشارات|طباعة|تجارة|توريدات|خدمات)/;
  const companyKwEn    = /\b(company|firm|llc|inc|ltd|consulting|consultations?|services|group|studio|agency|center|clinic|restaurant|cafe|cafe|hotel|store|shop)\b/i;

  let bestNameAr = '', bestNameEn = '', bestJobAr = '', bestJobEn = '',
      bestCompAr = '', bestCompEn = '', addrLines = [];
  for (const line of lines) {
    if (isPhoneOrEmail(line)) continue;
    if (line.length < 2) continue;
    if (/^(تليفون|هاتف|واتساب|whatsapp|email|mail|بريد|عنوان|address|website|موقع|الموقع)\s*[:،.-]?\s*$/i.test(line)) continue;
    if (isAr(line)) {
      if (jobKwAr.test(line))     { if (!bestJobAr)  bestJobAr  = line; continue; }
      if (companyKwAr.test(line)) { if (!bestCompAr) bestCompAr = line; continue; }
      if (/(شارع|كمبوند|عمارة|الدور|المبنى|بجوار|أمام|حي|منطقة|المنطقة|طريق|كورنيش|ميدان)/i.test(line) || addrLines.length) {
        addrLines.push(line);
        continue;
      }
      if (!bestNameAr && line.split(/\s+/).length <= 5) { bestNameAr = line; continue; }
    } else if (isEn(line)) {
      if (companyKwEn.test(line)) { if (!bestCompEn) bestCompEn = line; continue; }
      if (/^(Mr|Mrs|Ms|Dr|Eng|Prof)\.?\s/i.test(line) || (!bestNameEn && line.split(/\s+/).length <= 5)) {
        bestNameEn = line;
        continue;
      }
      if (!bestJobEn && /(consultant|engineer|doctor|lawyer|manager|director|owner|founder|ceo|cto|cfo|attorney|chef)/i.test(line)) {
        bestJobEn = line;
        continue;
      }
    }
  }
  if (bestNameAr)   r['name-ar']    = bestNameAr;
  if (bestNameEn)   r['name-en']    = bestNameEn;
  if (bestJobAr)    r['job-ar']     = bestJobAr;
  if (bestJobEn)    r['job-en']     = bestJobEn;
  if (bestCompAr)   r['company-ar'] = bestCompAr;
  if (bestCompEn)   r['company-en'] = bestCompEn;
  if (addrLines.length) r['address-ar'] = addrLines.join(' - ');

  // Business-type inference
  if (bestCompAr || bestJobAr) {
    const allTxt = (bestCompAr || '') + ' ' + (bestJobAr || '');
    if      (/محام|قانون|استشارات قانون/i.test(allTxt)) r['biz-type'] = 'محاماة وقانون';
    else if (/طب|عياد|دكتور|طبيب/i.test(allTxt))         r['biz-type'] = 'طب وصحة';
    else if (/مطعم|كافيه|chef/i.test(allTxt))            r['biz-type'] = 'مطاعم وكافيهات';
    else if (/مهندس|engineer/i.test(allTxt))             r['biz-type'] = 'هندسة';
    else if (/محاسب|تجارة|توريد/i.test(allTxt))          r['biz-type'] = 'تجارة ومحاسبة';
  }
  return r;
}

/**
 * filterClientsForGrid({clients, criteria, getOrders, calcRem, segments})
 *   → filtered array of clients.
 *
 * Applies the full clients-grid filter stack in one pass:
 *   - tab          (legacy vs active)
 *   - text query   (name / phone1 / phone2 / intlPhone)
 *   - tag          (criteria.tag)
 *   - segment      (RFM segment from segments Map)
 *   - governorate  (gov || governorate)
 *   - source
 *   - period       (today / yesterday / week / month / lastmonth)
 *   - quick filter (vip / active / rem / atrisk / new / sleeping)
 *   - legacy financial filter (today / rem / active / inactive / vip)
 *
 * Pure: no DOM, no closure capture. The page reads filter inputs from
 * window/UI and forwards them via `criteria` + the two filter knobs.
 *
 * @param {Object} args
 * @param {Array}  args.clients
 * @param {Object} args.criteria   — { q, tag, seg, gov, src, isLegacyTab,
 *                                     periodFilter, quickFilter, clientFilter }
 * @param {(client)=>Array} args.getOrders  — client → orders[]
 * @param {(order)=>number} args.calcRem    — order → remaining balance
 * @param {Map<string,Object>} [args.segments] — clientId → segment
 * @returns {Array} matching clients
 */
export function filterClientsForGrid({
  clients = [],
  criteria = {},
  getOrders = () => [],
  calcRem = () => 0,
  segments,
} = {}) {
  const {
    q = '', tag = '', seg = '', gov = '', src = '',
    isLegacyTab = false,
    periodFilter = null,
    quickFilter = 'all',
    clientFilter = 'all',
  } = criteria;

  const qLower = (q || '').toLowerCase();

  // ── Time-period boundaries (built once per render) ──
  const now           = new Date();
  const nowSec        = Date.now() / 1000;
  const todayStart    = new Date();    todayStart.setHours(0, 0, 0, 0);
  const todayStartSec = todayStart.getTime() / 1000;
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart     = new Date(todayStart); weekStart.setDate(weekStart.getDate() - todayStart.getDay());
  const weekStartSec  = weekStart.getTime() / 1000;
  const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd  = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodOf = {
    today:     [todayStart, null],
    yesterday: [yesterdayStart, todayStart],
    week:      [weekStart, null],
    month:     [monthStart, null],
    lastmonth: [lastMonthStart, lastMonthEnd],
  };

  // Single-pass latest order — O(N), no allocation.
  const latestOrder = (arr) => {
    let best = null, bestSec = -1;
    for (const o of arr) {
      const s = o.createdAt?.seconds || 0;
      if (s > bestSec) { bestSec = s; best = o; }
    }
    return best;
  };

  return clients.filter(c => {
    // Tab
    if (isLegacyTab) { if (c.status !== 'legacy') return false; }
    else             { if (c.status === 'legacy') return false; }

    // Text query (name + 3 phone fields)
    if (qLower &&
        !(c.name || '').toLowerCase().includes(qLower) &&
        !(c.phone1 || '').includes(qLower) &&
        !(c.phone2 || '').includes(qLower) &&
        !(c.intlPhone || '').includes(qLower)) return false;

    // Tag
    if (tag && !(c.tags || []).includes(tag)) return false;

    // RFM segment
    if (seg) {
      const s = segments?.get?.(c._id);
      if (!s || s.segment !== seg) return false;
    }

    // Governorate
    if (gov && c.gov !== gov && c.governorate !== gov) return false;

    // Source
    if (src && c.source !== src) return false;

    const cSec = c.createdAt?.seconds || 0;

    // Period filter
    if (periodFilter && periodOf[periodFilter]) {
      const [from, to] = periodOf[periodFilter];
      if (!cSec || cSec * 1000 < from.getTime() || (to && cSec * 1000 >= to.getTime())) return false;
    }

    // Quick filter
    if (quickFilter && quickFilter !== 'all') {
      const cOrds = getOrders(c);
      const cRem  = cOrds.reduce((s, o) => s + calcRem(o), 0);
      const hasAct = cOrds.some(o => o.stage !== 'archived');
      const lastOrd = latestOrder(cOrds);
      const daysSince = lastOrd?.createdAt?.seconds
        ? Math.floor((nowSec - lastOrd.createdAt.seconds) / 86400)
        : 999;
      if (quickFilter === 'vip'    && cOrds.length < 3) return false;
      if (quickFilter === 'active' && !hasAct) return false;
      if (quickFilter === 'rem'    && cRem <= 0) return false;
      if (quickFilter === 'atrisk' && !(daysSince >= 30 && daysSince < 90)) return false;
      if (quickFilter === 'new') {
        if (!cSec || cSec < weekStartSec) return false;
      }
      if (quickFilter === 'sleeping' && !(daysSince >= 90 && daysSince < 999)) return false;
    }

    // Legacy financial filter
    if (clientFilter && clientFilter !== 'all') {
      const cOrds2 = getOrders(c);
      const rem2   = cOrds2.reduce((s, o) => s + (calcRem(o)), 0);
      const hasActive = cOrds2.some(o => o.stage !== 'archived');
      const lastOrd = latestOrder(cOrds2);
      const daysSinceLast = lastOrd?.createdAt?.seconds
        ? Math.floor((nowSec - lastOrd.createdAt.seconds) / 86400)
        : 999;
      if (clientFilter === 'today')    { if (!cSec || cSec < todayStartSec) return false; }
      if (clientFilter === 'rem'      && rem2 <= 0) return false;
      if (clientFilter === 'active'   && !hasActive) return false;
      if (clientFilter === 'inactive' && daysSinceLast < 90) return false;
      if (clientFilter === 'vip'      && cOrds2.length < 3) return false;
    }

    return true;
  });
}

// ════════════════════════════════════════════════════════════════════
// Control Grid (cgrid) — pure data layer for the admin grid view
// ════════════════════════════════════════════════════════════════════
// Filtering / sorting / display-status / CSV export — all pure.
// The page reads UI controls + state and delegates here.

/**
 * cgridGetDisplayStatus(order) → Arabic status label for the cgrid
 * status column. Single source of truth for "what status is this row?".
 * Pure.
 */
export function cgridGetDisplayStatus(o) {
  if (!o) return '—';
  if (o.stage === 'cancelled')                                         return 'ملغي';
  if (o.stage === 'archived')                                          return 'أرشيف';
  if (o.paymentStatus === 'returned' || o.shipStage === 'returned')    return 'مرتجع كامل';
  if (o.returnType === 'partial')                                      return 'مرتجع جزئي';
  if (o.hasProblem)                                                    return 'مشكلة';
  if ((o.paymentStatus === 'paid') && ['shipping','delivered'].includes(o.stage)) return 'تم التحصيل';
  if (o.stage === 'shipping') {
    if (o.shipStage === 'delivered') return 'تحت التحصيل';
    if (o.shipStage === 'shipped')   return 'في الشحن';
    if (o.shipStage === 'ready')     return 'جاهز للشحن';
    return 'في الشحن';
  }
  return { design:'تصميم', printing:'طباعة', production:'تنفيذ', delivered:'تم التسليم', shipping:'في الشحن' }[o.stage]
      || o.stage || '—';
}

/**
 * cgridFilter({orders, criteria, calcRem}) → filtered orders[].
 *
 * criteria = { q, stage, emp, gov, period, rem, prob }
 *   q       — search text (matches clientName / phone / orderId / business / product)
 *   stage   — display status (matches cgridGetDisplayStatus output)
 *   emp     — assignedTo / designerId / productionAgent uid
 *   gov     — shipGov / clientGov
 *   period  — '' | 'today' | 'week' | 'month'
 *   rem     — '' | 'has_rem' | 'no_rem'
 *   prob    — '' | 'has_prob' | 'has_ret'
 *
 * Pure: no DOM, no closure capture.
 */
export function cgridFilter({
  orders = [],
  criteria = {},
  calcRem = () => 0,
} = {}) {
  const {
    q = '', stage = '', emp = '', gov = '',
    period = '', rem = '', prob = '',
  } = criteria;
  const qLower = (q || '').toLowerCase().trim();

  const now      = new Date();
  const startDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek  = new Date(+startDay - (now.getDay() || 7) * 864e5);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return (orders || []).filter(o => {
    if (qLower) {
      const hay = [
        (o.clientName || ''), (o.clientPhone || ''), (o.orderId || ''),
        (o.clientBusiness || o.job || ''), (o.product || ''),
      ].join(' ').toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    if (stage && cgridGetDisplayStatus(o) !== stage) return false;
    if (emp && o.assignedTo !== emp && o.designerId !== emp && o.productionAgent !== emp) return false;
    if (gov) {
      const g = o.shipGov || o.clientGov || '';
      if (g !== gov) return false;
    }
    if (period) {
      const ts = o.createdAt?.toDate ? o.createdAt.toDate()
              : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : null);
      if (!ts) return false;
      if (period === 'today' && ts < startDay)   return false;
      if (period === 'week'  && ts < startWeek)  return false;
      if (period === 'month' && ts < startMonth) return false;
    }
    const r = calcRem(o);
    if (rem === 'has_rem' && r <= 0) return false;
    if (rem === 'no_rem'  && r >  0) return false;
    if (prob === 'has_prob' && !o.hasProblem) return false;
    if (prob === 'has_ret'  && !(o.paymentStatus === 'returned' || o.shipStage === 'returned')) return false;
    return true;
  });
}

/**
 * cgridSortRows({data, sort, calcRem}) → sorted orders[] (non-mutating).
 *
 * sort = { field, dir }   dir: 1 asc, -1 desc
 * Supported fields: createdAt, rem, cost, profit, salePrice, paid, *.
 *
 * NOTE: renamed from `cgridSort` to avoid a window-namespace clash with
 * the existing in-page `window.cgridSort=function(field){}` which is
 * called by column-header onclick handlers (`onclick="cgridSort('paid')"`)
 * and toggles the active sort field. That column-toggle is UI-state code
 * and stays in clients.html.
 */
export function cgridSortRows({
  data = [],
  sort = { field: 'createdAt', dir: -1 },
  calcRem = () => 0,
} = {}) {
  const { field, dir } = sort;
  return [...data].sort((a, b) => {
    let av, bv;
    if (field === 'createdAt') {
      av = a.createdAt?.seconds || (a.createdAt?.toDate?.().getTime() / 1000) || 0;
      bv = b.createdAt?.seconds || (b.createdAt?.toDate?.().getTime() / 1000) || 0;
    } else if (field === 'rem') {
      av = calcRem(a); bv = calcRem(b);
    } else if (field === 'cost') {
      av = (a.costItems || []).reduce((s, c) => s + (parseFloat(c.total) || 0), 0) || (parseFloat(a.totalCost) || 0);
      bv = (b.costItems || []).reduce((s, c) => s + (parseFloat(c.total) || 0), 0) || (parseFloat(b.totalCost) || 0);
    } else if (field === 'profit') {
      const costA = (a.costItems || []).reduce((s, c) => s + (parseFloat(c.total) || 0), 0) || (parseFloat(a.totalCost) || 0);
      const costB = (b.costItems || []).reduce((s, c) => s + (parseFloat(c.total) || 0), 0) || (parseFloat(b.totalCost) || 0);
      av = (parseFloat(a.totalPaid) || parseFloat(a.paid) || parseFloat(a.deposit) || 0) - costA;
      bv = (parseFloat(b.totalPaid) || parseFloat(b.paid) || parseFloat(b.deposit) || 0) - costB;
    } else if (field === 'salePrice' || field === 'paid') {
      av = parseFloat(a[field]) || 0;
      bv = parseFloat(b[field]) || 0;
    } else {
      av = (a[field] || '').toString();
      bv = (b[field] || '').toString();
    }
    return av < bv ? -dir : av > bv ? dir : 0;
  });
}

/**
 * cgridExportCSV({orders, calcRem}) → CSV string (UTF-8 BOM prefix included).
 * Caller is responsible for creating download link / triggering toast.
 *
 * Columns: orderId, client, phone, business, service, employee,
 *          total (sale + ship fee), paid, remaining, status, createdDate,
 *          hasProblem, isReturned.
 */
export function cgridExportCSV({
  orders = [],
  calcRem = () => 0,
} = {}) {
  const header = [
    'رقم الأوردر','العميل','الهاتف','الشركة','الخدمة','الموظف',
    'الإجمالي','المدفوع','المتبقي','الحالة','تاريخ الإنشاء','مشكلة؟','مرتجع؟',
  ];
  const rows = (orders || []).map(o => [
    o.orderId || o._id.slice(-6),
    o.clientName  || '',
    o.clientPhone || '',
    o.clientBusiness || o.job || '',
    o.products?.map(p => p.name).join('+') || o.product || '',
    o.csName || o.designerName || '',
    (parseFloat(o.salePrice) || 0) + (parseFloat(o.customerShipFee) || 0),
    parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0,
    calcRem(o),
    cgridGetDisplayStatus(o),
    o.createdDate || '',
    o.hasProblem ? 'نعم' : 'لا',
    (o.paymentStatus === 'returned' || o.shipStage === 'returned') ? 'نعم' : 'لا',
  ]);
  return [header, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

/**
 * computeClientPanelData({client, orders, txByOrder, calcRem}) → derived
 *
 * Aggregates everything renderPanel needs in one pass:
 *   - tot       (salePrice + customerShipFee summed across orders)
 *   - paid      (totalPaid | paid | deposit fallback chain)
 *   - rem       (sum of calcRem per order)
 *   - totalCost (sum of costItems[].total or totalCost fallback)
 *   - totalProfit, profitPct
 *   - byWallet  ({walletName: amountSum}) from in-direction tx_v2 only
 *   - memberDays  (days since first order)
 *   - pct       (paid/tot * 100, clamped)
 *   - activeOrds, lateOrds  (filtered subsets)
 *   - daysSince (days since most recent order)
 *   - tags      (client.tags fallback to [])
 *
 * Pure: no DOM, no closure capture. The page wrapper passes the
 * client's own orders array + the tx_v2 index Map + calcRem.
 */
export function computeClientPanelData({
  client,
  orders = [],
  txByOrder,
  calcRem = () => 0,
} = {}) {
  const c = client || {};
  const cOrds = orders || [];

  const tot = cOrds.reduce(
    (s, o) => s + (parseFloat(o.salePrice) || 0) + (parseFloat(o.customerShipFee) || 0),
    0
  );
  const paid = cOrds.reduce(
    (s, o) => s + (parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0),
    0
  );
  const rem = cOrds.reduce((s, o) => s + calcRem(o), 0);
  const totalCost = cOrds.reduce(
    (s, o) =>
      s + ((o.costItems || []).reduce((x, ci) => x + (parseFloat(ci.total) || 0), 0)
         || (parseFloat(o.totalCost) || 0)),
    0
  );
  const totalProfit = paid - totalCost;
  const profitPct = paid > 0 ? Math.round(totalProfit / paid * 100) : null;

  const clientTx = cOrds.flatMap(o =>
    ((txByOrder?.get?.(o._id)) || []).filter(tx => tx.type === 'in' && tx.amount > 0)
  );
  const byWallet = {};
  clientTx.forEach(tx => {
    const wn = tx.walletName || '—';
    byWallet[wn] = (byWallet[wn] || 0) + (parseFloat(tx.amount) || 0);
  });

  const firstOrd = cOrds.slice().sort(
    (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
  )[0];
  const memberDays = firstOrd?.createdAt?.seconds
    ? Math.floor((Date.now() / 1000 - firstOrd.createdAt.seconds) / 86400)
    : null;

  const pct = tot > 0 ? Math.min(paid / tot * 100, 100) : 0;
  const activeOrds = cOrds.filter(o => o.stage !== 'archived');
  const lateOrds = cOrds.filter(o =>
    o.stage !== 'archived' && o.deadline && new Date(o.deadline) < new Date()
  );
  const lastOrd = cOrds.slice().sort(
    (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
  )[0];
  const daysSince = lastOrd?.createdAt?.seconds
    ? Math.floor((Date.now() / 1000 - lastOrd.createdAt.seconds) / 86400)
    : null;
  const tags = c.tags || [];

  return {
    cOrds, activeOrds, lateOrds,
    tot, paid, rem, pct,
    totalCost, totalProfit, profitPct,
    memberDays, daysSince,
    byWallet, tags,
  };
}

/**
 * cgridEmployeeOptions(orders) → [{uid, name}, ...]
 *
 * Collects unique employee uid → name mappings from orders (admin grid
 * filter). Looks at assignedTo+csName, designerId+designerName,
 * productionAgent+productionAgentName.
 */
export function cgridEmployeeOptions(orders = []) {
  const emps = {};
  for (const o of (orders || [])) {
    if (o.assignedTo && o.csName)              emps[o.assignedTo] = o.csName;
    if (o.designerId && o.designerName)        emps[o.designerId] = o.designerName;
    if (o.productionAgent && o.productionAgentName) emps[o.productionAgent] = o.productionAgentName;
  }
  return Object.entries(emps).map(([uid, name]) => ({ uid, name }));
}

/**
 * cgridGovernorateOptions(orders) → sorted unique governorate strings
 * from orders' shipGov || clientGov field.
 */
export function cgridGovernorateOptions(orders = []) {
  return [...new Set((orders || []).map(o => o.shipGov || o.clientGov || '').filter(Boolean))].sort();
}

// ─── SIDE-EFFECT: expose to window for compat (clients.html) ─────────
if (typeof window !== 'undefined') {
  Object.assign(window, {
    computeClientStats, parseBizCardText, filterClientsForGrid,
    cgridGetDisplayStatus, cgridFilter, cgridSortRows, cgridExportCSV,
    computeClientPanelData,
    // PR-25:
    cgridEmployeeOptions, cgridGovernorateOptions,
  });
}
