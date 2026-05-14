/**
 * AI Context Builder — Role-aware data summarization for Gemini prompts.
 *
 * Pure module: takes data + role/perms, returns markdown context string.
 * No Firebase coupling — caller passes in already-loaded arrays.
 *
 * Each domain builder respects DEFAULT_PERMISSIONS from shared.js so that
 * (e.g.) a designer never sees finance figures in their AI context.
 */

// ── Domain → Role access map ──
// Which AI domains each role can access (subset of what they can read in UI).
export const DOMAIN_ACCESS = {
  admin:             ['orders','clients','finance','employees','suppliers','shipping','production'],
  operation_manager: ['orders','clients','suppliers','shipping','production'],
  customer_service:  ['orders','clients'],
  graphic_designer:  ['orders'],
  design_operator:   ['orders','suppliers','production'],
  production_agent:  ['orders','production','suppliers'],
  shipping_officer:  ['orders','shipping'],
  wallet_manager:    ['finance','clients','suppliers'],
};

export const DOMAIN_LABELS = {
  orders:     { ico:'📦', label:'الأوردرات' },
  clients:    { ico:'👤', label:'العملاء' },
  finance:    { ico:'💰', label:'الماليات' },
  employees:  { ico:'👥', label:'الموظفين' },
  suppliers:  { ico:'▣',  label:'الموردين' },
  shipping:   { ico:'🚚', label:'الشحن' },
  production: { ico:'🏭', label:'الإنتاج' },
};

export function getAccessibleDomains(role) {
  return DOMAIN_ACCESS[role] || ['orders'];
}

// ── Helpers ──
const fn = n => Math.round(parseFloat(n) || 0).toLocaleString('ar-EG');
const tsMs = ts => ts?.toDate?.()?.getTime() || ((ts?.seconds || 0) * 1000) || 0;
const within = (orders, days) => {
  const cutoff = Date.now() - days * 864e5;
  return orders.filter(o => tsMs(o.createdAt) >= cutoff);
};
const paidOf = o => parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;
const totalOf = o => parseFloat(o.totalPrice) || parseFloat(o.price) || 0;

// ── Builders ──

function buildOrders({ orders, role, userId }) {
  let scope = orders;
  // Designer sees only own orders
  if (role === 'graphic_designer') scope = scope.filter(o => o.designerId === userId);
  // Production sees production-stage orders only
  if (role === 'production_agent') scope = scope.filter(o => ['production','printing','ready'].includes(o.stage));
  // Shipping sees shipping-stage orders only
  if (role === 'shipping_officer') scope = scope.filter(o => ['ready','shipped','delivered'].includes(o.stage));

  const recent = within(scope, 90);
  const stageCnt = {};
  recent.forEach(o => { stageCnt[o.stage] = (stageCnt[o.stage] || 0) + 1; });

  const prodCnt = {};
  recent.forEach(o => {
    const p = o.productName || o.product || 'غير محدد';
    prodCnt[p] = (prodCnt[p] || 0) + 1;
  });
  const topProd = Object.entries(prodCnt).sort((a,b) => b[1]-a[1]).slice(0, 8);

  const now = Date.now();
  const late = scope.filter(o => {
    if (['delivered','archived','cancelled'].includes(o.stage)) return false;
    const dd = tsMs(o.deliveryDate);
    return dd && dd < now;
  });

  return `
📦 الأوردرات (${role === 'graphic_designer' ? 'أوردراتك فقط' : 'حسب صلاحيتك'}):
- إجمالي آخر 90 يوم: ${recent.length}
- إجمالي كل الأوردرات: ${scope.length}
- المتأخرة عن موعد التسليم: ${late.length}

توزيع المراحل:
${Object.entries(stageCnt).map(([s,n]) => `- ${s}: ${n}`).join('\n')}

أكثر المنتجات طلباً:
${topProd.map(([p,n],i) => `${i+1}. ${p}: ${n}`).join('\n')}
`.trim();
}

function buildClients({ clients, orders, role }) {
  const showFinancial = ['admin','operation_manager','customer_service','wallet_manager'].includes(role);
  const recent = within(orders, 90);

  const clientCnt = {};
  recent.forEach(o => {
    const name = o.clientName || o.client || 'غير محدد';
    if (!clientCnt[name]) clientCnt[name] = { count: 0, revenue: 0 };
    clientCnt[name].count++;
    if (showFinancial) clientCnt[name].revenue += paidOf(o);
  });
  const top = Object.entries(clientCnt)
    .sort((a,b) => b[1].count - a[1].count)
    .slice(0, 10);

  // Inactive clients (no orders in 60 days)
  const cutoff60 = Date.now() - 60 * 864e5;
  const activeClientNames = new Set(
    orders.filter(o => tsMs(o.createdAt) >= cutoff60).map(o => o.clientName || o.client)
  );
  const inactive = clients.filter(c => !activeClientNames.has(c.name)).length;

  return `
👤 العملاء:
- إجمالي العملاء: ${clients.length}
- نشطون (طلبوا آخر 60 يوم): ${clients.length - inactive}
- خاملون (لم يطلبوا منذ 60 يوم): ${inactive}

أكثر العملاء طلباً (آخر 90 يوم):
${top.map(([n,d],i) => `${i+1}. ${n}: ${d.count} طلب${showFinancial ? ` — إيراد ${fn(d.revenue)} ج` : ''}`).join('\n')}
`.trim();
}

function buildFinance({ orders, wallets }) {
  const recent = within(orders, 90);
  const rev = recent.reduce((s,o) => s + paidOf(o), 0);
  const rem = orders.reduce((s,o) => s + Math.max(0, totalOf(o) - paidOf(o)), 0);
  const costTotal = recent.reduce((s,o) =>
    s + (o.costItems || []).reduce((cs,c) => cs + (parseFloat(c.total) || 0), 0), 0);
  const margin = rev > 0 ? Math.round(((rev - costTotal) / rev) * 100) : 0;

  const walletLines = (wallets || [])
    .filter(w => !w.isDeleted)
    .sort((a,b) => (parseFloat(b.balance)||0) - (parseFloat(a.balance)||0))
    .slice(0, 8)
    .map(w => `- ${w.name}: ${fn(w.balance)} ج`);

  return `
💰 الماليات (آخر 90 يوم):
- الإيرادات المحصّلة: ${fn(rev)} ج
- المتبقي على العملاء (ديون): ${fn(rem)} ج
- تكاليف الإنتاج: ${fn(costTotal)} ج
- هامش الربح التقديري: ${margin}%
- متوسط قيمة الأوردر: ${recent.length ? fn(rev/recent.length) : 0} ج

أرصدة المحافظ:
${walletLines.join('\n') || '- لا توجد محافظ'}
`.trim();
}

function buildEmployees({ employees, payments }) {
  const totalPaid = (payments || []).reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
  const byEmp = {};
  (payments || []).forEach(p => {
    const k = p.employeeName || p.employeeId || 'غير محدد';
    if (!byEmp[k]) byEmp[k] = 0;
    byEmp[k] += parseFloat(p.amount) || 0;
  });
  const top = Object.entries(byEmp).sort((a,b) => b[1]-a[1]).slice(0, 8);

  return `
👥 الموظفين:
- إجمالي الموظفين: ${(employees || []).length}
- إجمالي ما تم دفعه (كل الفترة): ${fn(totalPaid)} ج

أعلى المدفوعات للموظفين:
${top.map(([n,a],i) => `${i+1}. ${n}: ${fn(a)} ج`).join('\n') || '- لا توجد بيانات'}
`.trim();
}

function buildSuppliers({ suppliers, payments }) {
  const totalPaid = (payments || []).reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
  const bySup = {};
  (payments || []).forEach(p => {
    const k = p.vendorName || p.supplierName || p.vendorId || 'غير محدد';
    if (!bySup[k]) bySup[k] = { paid: 0, count: 0 };
    bySup[k].paid += parseFloat(p.amount) || 0;
    bySup[k].count++;
  });
  const top = Object.entries(bySup).sort((a,b) => b[1].paid - a[1].paid).slice(0, 8);

  return `
▣ الموردين:
- إجمالي الموردين: ${(suppliers || []).length}
- إجمالي المدفوع للموردين: ${fn(totalPaid)} ج

أعلى الموردين تعاملاً:
${top.map(([n,d],i) => `${i+1}. ${n}: ${fn(d.paid)} ج (${d.count} دفعة)`).join('\n') || '- لا توجد بيانات'}
`.trim();
}

function buildShipping({ orders, settlements }) {
  const shipped = orders.filter(o => ['shipped','delivered'].includes(o.stage));
  const inTransit = orders.filter(o => o.stage === 'shipped').length;
  const delivered = orders.filter(o => o.stage === 'delivered').length;

  const totalSettled = (settlements || []).reduce((s,x) => s + (parseFloat(x.amount)||0), 0);

  // Late shipments (in 'ready' or 'shipped' past delivery date)
  const now = Date.now();
  const late = orders.filter(o => {
    if (!['ready','shipped'].includes(o.stage)) return false;
    const dd = tsMs(o.deliveryDate);
    return dd && dd < now;
  }).length;

  return `
🚚 الشحن:
- جاهز للشحن: ${orders.filter(o => o.stage === 'ready').length}
- قيد التوصيل: ${inTransit}
- تم التسليم (إجمالي): ${delivered}
- متأخر عن موعد التسليم: ${late}
- إجمالي تسويات الشحن: ${fn(totalSettled)} ج
- إجمالي الشحنات (shipped + delivered): ${shipped.length}
`.trim();
}

function buildProduction({ orders }) {
  const inProd = orders.filter(o => ['production','printing'].includes(o.stage));
  const recent = within(orders, 30);
  const completedRecent = recent.filter(o => ['ready','shipped','delivered'].includes(o.stage)).length;

  // Avg time from production → ready (rough)
  const cycleTimes = orders
    .filter(o => o.stage_production_at && o.stage_ready_at)
    .map(o => {
      const start = new Date(o.stage_production_at).getTime();
      const end = new Date(o.stage_ready_at).getTime();
      return (end - start) / (1000 * 60 * 60 * 24);
    })
    .filter(d => d > 0 && d < 60);
  const avgCycle = cycleTimes.length
    ? (cycleTimes.reduce((a,b) => a+b, 0) / cycleTimes.length).toFixed(1)
    : '—';

  return `
🏭 الإنتاج:
- قيد التنفيذ والطباعة الآن: ${inProd.length}
- اكتمل خلال آخر 30 يوم: ${completedRecent}
- متوسط زمن الدورة (إنتاج → جاهز): ${avgCycle} يوم
`.trim();
}

const BUILDERS = {
  orders:     buildOrders,
  clients:    buildClients,
  finance:    buildFinance,
  employees:  buildEmployees,
  suppliers:  buildSuppliers,
  shipping:   buildShipping,
  production: buildProduction,
};

/**
 * Build a multi-domain context string. Caller filters domains by role first.
 *
 * @param {object} args
 * @param {string[]} args.domains   — domain keys to include
 * @param {string} args.role
 * @param {string} [args.userId]
 * @param {object} args.data        — { orders, clients, wallets, employees, suppliers, payments, settlements, employeePayments }
 * @returns {string} markdown context
 */
export function buildContext({ domains, role, userId, data = {} }) {
  const accessible = getAccessibleDomains(role);
  const valid = (domains || accessible).filter(d => accessible.includes(d));

  const sections = valid.map(d => {
    const builder = BUILDERS[d];
    if (!builder) return '';
    const args = {
      orders:    data.orders || [],
      clients:   data.clients || [],
      wallets:   data.wallets || [],
      employees: data.employees || [],
      suppliers: data.suppliers || [],
      payments:  data.payments || [],          // generic — used for suppliers/employees
      settlements: data.settlements || [],
      role, userId,
    };
    // Specific overrides
    if (d === 'employees') args.payments = data.employeePayments || data.payments || [];
    if (d === 'suppliers') args.payments = data.supplierPayments || data.payments || [];
    return builder(args);
  }).filter(Boolean);

  const header = `أنت مساعد ذكاء اصطناعي لشركة طباعة مصرية (B2C ERP). البيانات التالية حقيقية من النظام، تظهر حسب صلاحية المستخدم (دور: ${role}).`;
  return `${header}\n\n${sections.join('\n\n')}`.trim();
}
