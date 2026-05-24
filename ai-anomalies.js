/**
 * AI Anomalies — Rule-based detection over ERP data.
 *
 * Pure module. Returns a list of anomaly objects ranked by severity,
 * which the digest page renders as cards and feeds into a Gemini prompt
 * for narrative explanation.
 *
 * Each rule should be cheap (pure JS, no I/O) and fail-safe (returns []
 * instead of throwing on unexpected data shapes).
 */

const tsMs = ts => ts?.toDate?.()?.getTime() || ((ts?.seconds || 0) * 1000) || 0;
const fn   = n => Math.round(parseFloat(n) || 0).toLocaleString('ar-EG');
const paid = o => parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;
const total = o => parseFloat(o.totalPrice) || parseFloat(o.price) || 0;

export const SEVERITY = {
  high:   { label: 'عالٍ',   color: '#f87171', ico: '🔴' },
  medium: { label: 'متوسط', color: 'var(--y-amber)', ico: '🟡' },
  low:    { label: 'منخفض', color: 'var(--g-emerald)', ico: '🟢' },
  info:   { label: 'معلومة', color: '#4f8ef7', ico: 'ℹ️' },
};

// ── Rules ──

function checkLateOrdersSpike({ orders }) {
  const now = Date.now();
  const late = orders.filter(o =>
    !['delivered','archived','cancelled'].includes(o.stage) &&
    tsMs(o.deliveryDate) && tsMs(o.deliveryDate) < now
  );
  if (late.length === 0) return null;
  const sev = late.length >= 10 ? 'high' : late.length >= 5 ? 'medium' : 'low';
  return {
    id: 'late-orders',
    severity: sev,
    title: `${late.length} أوردر متأخر عن موعد التسليم`,
    detail: `أوردرات في مراحل: ${[...new Set(late.map(o => o.stage))].join(', ')}.`,
    metric: late.length,
    suggestion: 'راجع شاشة Production / Shipping وحدّد سبب التأخير.',
  };
}

function checkRevenueDrop({ orders }) {
  // Compare last 7 days vs prior 7 days
  const now = Date.now();
  const d7  = now - 7  * 864e5;
  const d14 = now - 14 * 864e5;
  const cur = orders.filter(o => tsMs(o.createdAt) >= d7).reduce((s,o) => s + paid(o), 0);
  const prv = orders.filter(o => { const t = tsMs(o.createdAt); return t >= d14 && t < d7; }).reduce((s,o) => s + paid(o), 0);
  if (prv < 1000) return null; // not enough baseline
  const dropPct = ((prv - cur) / prv) * 100;
  if (dropPct < 20) return null;
  const sev = dropPct >= 50 ? 'high' : dropPct >= 35 ? 'medium' : 'low';
  return {
    id: 'revenue-drop',
    severity: sev,
    title: `الإيراد الأسبوعي نزل ${Math.round(dropPct)}%`,
    detail: `هذا الأسبوع: ${fn(cur)} ج · الأسبوع السابق: ${fn(prv)} ج.`,
    metric: Math.round(dropPct),
    suggestion: 'راجع نشاط العملاء + المراحل المتأخرة + قنوات البيع.',
  };
}

function checkInactiveTopClients({ orders, clients }) {
  // Top 10 clients by lifetime revenue who haven't ordered in 60 days
  const byClient = {};
  orders.forEach(o => {
    const name = o.clientName || o.client;
    if (!name) return;
    if (!byClient[name]) byClient[name] = { revenue: 0, lastOrder: 0 };
    byClient[name].revenue += paid(o);
    const t = tsMs(o.createdAt);
    if (t > byClient[name].lastOrder) byClient[name].lastOrder = t;
  });
  const cutoff60 = Date.now() - 60 * 864e5;
  const topInactive = Object.entries(byClient)
    .filter(([_, d]) => d.revenue > 1000 && d.lastOrder && d.lastOrder < cutoff60)
    .sort((a,b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);
  if (topInactive.length === 0) return null;
  const sev = topInactive.length >= 4 ? 'medium' : 'low';
  return {
    id: 'inactive-clients',
    severity: sev,
    title: `${topInactive.length} عميل قيّم خامل أكثر من 60 يوم`,
    detail: 'الأعلى: ' + topInactive.slice(0,3).map(([n,d]) => `${n} (${fn(d.revenue)} ج)`).join(' · '),
    metric: topInactive.length,
    suggestion: 'قرّر متابعة شخصية أو عرض مخصص لهؤلاء العملاء.',
  };
}

function checkHighReceivables({ orders }) {
  const rem = orders.reduce((s,o) => s + Math.max(0, total(o) - paid(o)), 0);
  if (rem < 50000) return null;
  const sev = rem >= 200000 ? 'high' : rem >= 100000 ? 'medium' : 'low';
  return {
    id: 'high-receivables',
    severity: sev,
    title: `ديون العملاء وصلت ${fn(rem)} جنيه`,
    detail: 'مبلغ كبير غير محصّل قد يؤثر على الكاش فلو.',
    metric: rem,
    suggestion: 'ابدأ حملة تحصيل للعملاء الأقدم في القائمة.',
  };
}

function checkProductionBottleneck({ orders }) {
  const stageCnt = {};
  orders.forEach(o => { if (!['delivered','archived','cancelled'].includes(o.stage)) {
    stageCnt[o.stage] = (stageCnt[o.stage] || 0) + 1;
  }});
  const total = Object.values(stageCnt).reduce((a,b) => a+b, 0);
  if (total < 10) return null;
  // Find stage with > 50% of active orders
  const max = Object.entries(stageCnt).reduce((m,e) => e[1] > m[1] ? e : m, ['',0]);
  if (max[1] / total < 0.5) return null;
  return {
    id: 'bottleneck',
    severity: 'medium',
    title: `اختناق في مرحلة "${max[0]}" (${max[1]} أوردر = ${Math.round(max[1]/total*100)}%)`,
    detail: 'أكثر من نصف الأوردرات النشطة عالقة في مرحلة واحدة.',
    metric: max[1],
    suggestion: `راجع فريق ${max[0]} وحدّد سبب البطء.`,
  };
}

function checkNewClientsTrend({ clients, orders }) {
  // Positive signal: new clients in last 7 days
  const cutoff7 = Date.now() - 7 * 864e5;
  const newClients = clients.filter(c => tsMs(c.createdAt) >= cutoff7);
  if (newClients.length === 0) return null;
  return {
    id: 'new-clients',
    severity: 'info',
    title: `${newClients.length} عميل جديد هذا الأسبوع 🎉`,
    detail: 'تعرّف عليهم وابنِ علاقة مبكراً.',
    metric: newClients.length,
    suggestion: 'تواصل ترحيبي + استكشف احتياجاتهم.',
  };
}

function checkCashFlowPositive({ orders }) {
  const now = Date.now();
  const d7 = now - 7 * 864e5;
  const cur = orders.filter(o => tsMs(o.createdAt) >= d7).reduce((s,o) => s + paid(o), 0);
  if (cur < 10000) return null;
  return {
    id: 'cash-positive',
    severity: 'info',
    title: `حصّلت ${fn(cur)} جنيه آخر 7 أيام`,
    detail: 'أداء تحصيل جيد.',
    metric: cur,
    suggestion: '',
  };
}

const RULES = [
  checkLateOrdersSpike,
  checkRevenueDrop,
  checkInactiveTopClients,
  checkHighReceivables,
  checkProductionBottleneck,
  checkNewClientsTrend,
  checkCashFlowPositive,
];

const SEVERITY_RANK = { high: 0, medium: 1, low: 2, info: 3 };

/**
 * Run all rules over the data and return ranked anomalies.
 *
 * @param {object} data — { orders, clients, wallets }
 * @returns {Array<{id, severity, title, detail, metric, suggestion}>}
 */
export function detectAnomalies(data) {
  const out = [];
  for (const rule of RULES) {
    try {
      const r = rule(data);
      if (r) out.push(r);
    } catch (e) {
      console.warn('[anomalies] rule failed:', e);
    }
  }
  out.sort((a,b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
  return out;
}
