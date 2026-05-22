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
  const sales = sumPaid(myOrders);
  const rem   = myOrders.reduce((s, o) => s + calcRem(o), 0);

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
    totals: { sales, rem, clientCount: clients.length },
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

// ─── SIDE-EFFECT: expose to window for compat (clients.html) ─────────
if (typeof window !== 'undefined') {
  Object.assign(window, { computeClientStats, parseBizCardText });
}
