/**
 * Business2Card ERP — shipping-service.js
 *
 * ━━━ SHIPPING QUERIES + RECONCILIATION + KPIs ━━━
 *
 * طبقة القراءة المركزية للشحن. الصفحات تستخدم هذه الدوال بدل:
 *   - filtering inline على orders
 *   - حساب أرصدة شركات الشحن inline
 *   - تكرار KPI math في كل صفحة
 *
 * كل الدوال هنا **pure** (لا تتصل بـ DB) — تعمل على orders array
 * المُحمَّل عبر AppState.orders. الأرصدة محسوبة من نفس البيانات
 * (Single Source of Truth — RULE 1).
 */

import {
  isShipTerminal, isShipReadyToClose, isShipPendingSettle,
  isShipCompanyInTransit, isShipActive,
  // PR-7 (scalable-drifting-ember): normalize legacy and canonical
  // shipStage values uniformly across the filter layer.
  normalizeShipStage,
} from './orders.js';

// ══════════════════════════════════════════
// TAB FILTERS — أوردرات كل تاب في مركز الشحن
// ══════════════════════════════════════════

/**
 * الطلبات الجاهزة للشحن:
 *   stage='shipping' + shipStage in ['', 'ready']
 *   لم يُسلَّم بعد لأي شركة/كورير/استلام.
 */
export function getOrdersReadyToDispatch(orders) {
  return (orders || []).filter(o => {
    if (!o || o.stage !== 'shipping') return false;
    if (isShipTerminal(o)) return false;
    const ss = o.shipStage || '';
    return ss === '' || ss === 'ready';
  });
}

/**
 * الطلبات قيد التوصيل:
 *   stage='shipping' + shipStage ∈ {'wait_delivery' (legacy), 'shipped' (canonical)}
 */
export function getOrdersInTransit(orders) {
  return (orders || []).filter(o => {
    if (!o || o.stage !== 'shipping') return false;
    if (isShipTerminal(o)) return false;
    return normalizeShipStage(o.shipStage) === 'shipped';
  });
}

/**
 * الطلبات الجاهزة للتحصيل (وصلت للعميل):
 *   stage='shipping' + shipStage ∈ {'wait_collection' (legacy), 'delivered' (canonical)}
 */
export function getOrdersWaitingCollection(orders) {
  return (orders || []).filter(o => {
    if (!o || o.stage !== 'shipping') return false;
    if (isShipTerminal(o)) return false;
    return normalizeShipStage(o.shipStage) === 'delivered';
  });
}

/**
 * الطلبات الجاهزة للتسوية مع شركة الشحن:
 *   shipMethod='company' + shipStage='collected' + !shipSettled
 */
export function getOrdersPendingSettlement(orders) {
  return (orders || []).filter(o => isShipPendingSettle(o));
}

/**
 * الطلبات المسوّاة (للأرشيف القريب):
 *   shipSettled=true + stage='shipping' (لم تُؤرشَف بعد)
 *   ملاحظة: عادةً صفر — الأرشفة التلقائية بعد التسوية تنقل الأوردر مباشرة
 *   لـ stage='archived' (يظهر في archive.html). هذا الـ filter لتغطية الـ
 *   edge cases (auto-archive فشل لأي سبب).
 */
export function getOrdersSettled(orders) {
  return (orders || []).filter(o => {
    if (!o || o.stage !== 'shipping') return false;
    if (isShipTerminal(o)) return false;
    return o.shipSettled === true;
  });
}

/**
 * المرتجعات الكاملة (terminal). يستثني المرتجعات الجزئية لأنها non-terminal
 * (الأوردر بيكمل عادي بعد خصم الجزء المرتجع).
 *   shipStage ∈ {'returned' (legacy), 'returned_full' (canonical)}
 */
export function getOrdersReturned(orders) {
  return (orders || []).filter(o => {
    if (!o) return false;
    return normalizeShipStage(o.shipStage) === 'returned_full';
  });
}

// ══════════════════════════════════════════
// DELAYS — المتأخرات والإنذارات
// ══════════════════════════════════════════

/**
 * يحسب عدد الأيام منذ آخر تحديث على الأوردر في مرحلة الشحن.
 * يعتمد على:
 *   shipDispatchedAt (الأولوية) → shipDate → updatedAt (fallback)
 */
function _daysSince(ts) {
  if (!ts) return 0;
  const d = ts.toDate?.() || (typeof ts === 'string' ? new Date(ts) : ts);
  if (!(d instanceof Date) || isNaN(d.getTime())) return 0;
  const diff = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff > 0 ? Math.floor(diff) : 0;
}

/**
 * يُرجع الأوردرات المتأخرة في كل مرحلة.
 *
 * Thresholds (افتراضية، قابلة للتعديل لاحقاً من إعدادات):
 *   ready          > 2 days  (لم يُسلَّم لأي شركة)
 *   wait_delivery  > 7 days  (في الطريق لكنه لم يصل)
 *   wait_collection> 3 days  (وصل لكنه لم يُحصَّل)
 *   collected      > 5 days  (مُحصَّل لكنه لم يُسوَّى)
 */
export const DELAY_THRESHOLDS = {
  ready: 2,
  wait_delivery: 7,
  wait_collection: 3,
  collected: 5,
};

export function getDelayedOrders(orders, thresholds = DELAY_THRESHOLDS) {
  const delays = [];
  for (const o of (orders || [])) {
    if (!o || o.stage !== 'shipping' || isShipTerminal(o)) continue;
    const ss = o.shipStage || 'ready';
    const threshold = thresholds[ss];
    if (typeof threshold !== 'number') continue;

    const ref = o.shipDispatchedAt || o.shipDate || o.updatedAt;
    const days = _daysSince(ref);
    if (days >= threshold) {
      delays.push({
        order: o,
        shipStage: ss,
        days,
        threshold,
        overdue: days - threshold,
        severity: days >= threshold * 2 ? 'critical' : 'warning',
      });
    }
  }
  // الأكثر تأخراً أولاً
  return delays.sort((a, b) => b.days - a.days);
}

// ══════════════════════════════════════════
// COMPANY RECONCILIATION — أرصدة شركات الشحن
// ══════════════════════════════════════════

/**
 * يُحسِب رصيد كل شركة شحن من orders + shipping_settlements.
 * المعادلة لكل شركة:
 *   expectedFromCompany = SUM(shipCollected - shippingCost) للأوردرات NOT settled
 *   alreadySettled      = SUM(shipSettledAmount) للأوردرات settled
 *
 * @param {Array} orders
 * @param {Array} shippers - shippers_v2 docs
 * @returns {Array<Object>} per-company reconciliation rows
 */
export function getCompanyReconciliation(orders, shippers) {
  const byCompany = new Map();

  // Seed with all known shippers (so empty companies show up)
  (shippers || []).forEach(s => {
    if (!s || !s._id) return;
    byCompany.set(s._id, {
      companyId: s._id,
      companyName: s.name || 'بدون اسم',
      pendingOrders: 0,
      pendingCollected: 0,
      pendingCost: 0,
      pendingExpected: 0,
      settledOrders: 0,
      settledAmount: 0,
      inTransit: 0,
      returned: 0,
      isActive: s.status !== 'inactive' && s.status !== 'suspended',
    });
  });

  for (const o of (orders || [])) {
    if (!o || o.shipMethod !== 'company') continue;
    const cid = o.shipCompanyId || '_unknown';
    if (!byCompany.has(cid)) {
      byCompany.set(cid, {
        companyId: cid,
        companyName: o.shipCompanyName || 'غير معروف',
        pendingOrders: 0, pendingCollected: 0, pendingCost: 0, pendingExpected: 0,
        settledOrders: 0, settledAmount: 0,
        inTransit: 0, returned: 0, isActive: true,
      });
    }
    const row = byCompany.get(cid);

    if (o.shipStage === 'returned') {
      row.returned++;
      continue;
    }

    const collected = parseFloat(o.shipCollected) || 0;
    const cost = parseFloat(o.shippingCost) || 0;
    const expected = Math.max(0, collected - cost);

    if (o.shipSettled === true) {
      row.settledOrders++;
      row.settledAmount += parseFloat(o.shipSettledAmount) || 0;
    } else if (o.shipStage === 'collected') {
      row.pendingOrders++;
      row.pendingCollected += collected;
      row.pendingCost += cost;
      row.pendingExpected += expected;
    } else if (['wait_delivery', 'wait_collection'].includes(o.shipStage)) {
      row.inTransit++;
    }
  }

  // Convert to array, sort by pending expected (highest first)
  return Array.from(byCompany.values()).sort((a, b) => b.pendingExpected - a.pendingExpected);
}

// ══════════════════════════════════════════
// KPI SUMMARY — الأرقام الرئيسية للوحة
// ══════════════════════════════════════════

/**
 * Aggregated KPIs لـ shipping center.
 */
export function getShippingKPIs(orders) {
  const ready = getOrdersReadyToDispatch(orders).length;
  const inTransit = getOrdersInTransit(orders).length;
  const waitCollect = getOrdersWaitingCollection(orders).length;
  const pendingSettle = getOrdersPendingSettlement(orders).length;
  const settled = getOrdersSettled(orders).length;
  const returned = getOrdersReturned(orders).length;
  const delayed = getDelayedOrders(orders).length;

  // مالي
  let totalExpectedFromCompanies = 0;
  let totalCollectedNotSettled = 0;
  for (const o of (orders || [])) {
    if (!o || o.shipMethod !== 'company' || o.shipSettled === true) continue;
    if (o.shipStage === 'returned' || o.stage === 'archived') continue;
    const collected = parseFloat(o.shipCollected) || 0;
    const cost = parseFloat(o.shippingCost) || 0;
    if (o.shipStage === 'collected') {
      totalCollectedNotSettled += collected;
      totalExpectedFromCompanies += Math.max(0, collected - cost);
    }
  }

  return {
    ready, inTransit, waitCollect, pendingSettle, settled, returned, delayed,
    totalExpectedFromCompanies, totalCollectedNotSettled,
  };
}

// ══════════════════════════════════════════
// FORMATTING HELPERS
// ══════════════════════════════════════════

// SHIP_STAGE_LABELS — Both legacy and canonical keys are listed.
// PR-7 (scalable-drifting-ember): when a stored shipStage is in legacy
// form, the lookup goes through normalizeShipStage first, so legacy data
// renders with the canonical label. Direct lookup by canonical key works
// for new data without normalization overhead.
export const SHIP_STAGE_LABELS = {
  '': { label: 'جديد', col: '#4e5672', ico: '🆕' },
  ready: { label: 'جاهز للشحن', col: '#22d3ee', ico: '📦' },
  // Canonical (post-PR-1):
  shipped:          { label: 'تم الشحن',         col: '#ffaa00', ico: '🚚' },
  delivered:        { label: 'تم التسليم',       col: '#00d97e', ico: '✅' },
  under_collection: { label: 'تحت التحصيل',      col: '#a78bfa', ico: '⏳' },
  collected:        { label: 'مُحصَّل',           col: '#00d97e', ico: '💰' },
  returned_full:    { label: 'مرتجع كامل',       col: '#ff3d6e', ico: '↩️' },
  returned_partial: { label: 'مرتجع جزئي',       col: '#f0a020', ico: '↪️' },
  closed:           { label: 'مغلق',              col: '#4e5672', ico: '🗄️' },
  // Legacy (kept as fallback so direct lookup still works on old data):
  wait_delivery:    { label: 'جاري التوصيل',     col: '#ffaa00', ico: '🚚' },
  wait_collection:  { label: 'بانتظار التحصيل',   col: '#a78bfa', ico: '🏠' },
  completed:        { label: 'مكتمل',             col: '#4e5672', ico: '✓'  },
  returned:         { label: 'مرتجع',             col: '#ff3d6e', ico: '↩️' },
};

export function shipStageBadgeHTML(shipStage) {
  // PR-7: normalize first — legacy data ('wait_delivery', 'returned', ...) maps
  // to canonical labels ('تم الشحن', 'مرتجع كامل', ...) for consistent UX.
  const key = normalizeShipStage(shipStage);
  const s = SHIP_STAGE_LABELS[key] || SHIP_STAGE_LABELS[shipStage || ''] || SHIP_STAGE_LABELS[''];
  return `<span class="ship-bdg" style="background:${s.col}1f;color:${s.col};border:1px solid ${s.col}40">
    ${s.ico} ${s.label}
  </span>`;
}

export function fmtMoney(n) {
  const v = parseFloat(n) || 0;
  return v.toLocaleString('ar-EG', { maximumFractionDigits: 0 });
}

export function fmtDays(days) {
  if (days === 0) return 'اليوم';
  if (days === 1) return 'أمس';
  return `${days} يوم`;
}
