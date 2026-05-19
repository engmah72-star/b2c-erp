/**
 * AI Today — "What happened today" summarizer for page-aware agents.
 *
 * Pure module: takes already-loaded ERP data, returns a markdown section
 * describing today's events (new orders, stage transitions, payments,
 * new clients, etc.). No Firebase coupling.
 *
 * "Today" = since local midnight in the user's browser timezone.
 */

const fn   = n => Math.round(parseFloat(n) || 0).toLocaleString('ar-EG');
const tsMs = ts => ts?.toDate?.()?.getTime() || ((ts?.seconds || 0) * 1000) || (typeof ts === 'string' ? Date.parse(ts) : 0);
const paid = o => parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;

function startOfToday() {
  const d = new Date(); d.setHours(0,0,0,0); return d.getTime();
}

// Parse a timeline-entry date — may be ISO, "YYYY-MM-DD HH:mm", or just "YYYY-MM-DD".
function parseTimelineDate(s) {
  if (!s) return 0;
  const ms = Date.parse(s);
  if (!isNaN(ms)) return ms;
  // Fallback: "YYYY-MM-DD" with space → ISO
  const fixed = String(s).replace(' ', 'T');
  const ms2 = Date.parse(fixed);
  return isNaN(ms2) ? 0 : ms2;
}

const isToday = t => t >= startOfToday();

/**
 * Build "Today's activity" section.
 *
 * @param {object} data
 * @param {Array}  data.orders          — full orders array (with timeline)
 * @param {Array}  [data.clients]
 * @param {Array}  [data.ledger]        — financial_ledger entries (today only is enough)
 * @param {Array}  [data.jobOrders]
 * @param {Array}  [data.paymentRequests]
 * @param {string} [data.role]          — used to redact financial figures from low-roles
 * @returns {string} markdown section, or '' if nothing happened today
 */
export function buildToday({ orders = [], clients = [], ledger = [], jobOrders = [], paymentRequests = [], role = '' } = {}) {
  const showMoney = !['graphic_designer','production_agent','design_operator','shipping_officer'].includes(role);
  const t0 = startOfToday();

  // 1) New orders today
  const newOrders = orders.filter(o => tsMs(o.createdAt) >= t0);
  const newOrderValue = newOrders.reduce((s,o) => s + (parseFloat(o.totalPrice) || parseFloat(o.price) || 0), 0);

  // 2) Stage transitions today (from timeline array)
  const transitions = {}; // stage -> count
  let totalTransitions = 0;
  orders.forEach(o => {
    (o.timeline || []).forEach(t => {
      const ms = parseTimelineDate(t.date || t.at);
      if (!ms || ms < t0) return;
      const target = t.stage || t.toStage || '';
      if (!target) return;
      transitions[target] = (transitions[target] || 0) + 1;
      totalTransitions++;
    });
  });

  // 3) New clients today
  const newClients = clients.filter(c => tsMs(c.createdAt) >= t0);

  // 4) Financial events today (income vs expense)
  let inAmt = 0, outAmt = 0, ledgerCount = 0;
  const topTx = [];
  ledger.forEach(e => {
    if (e.isDeleted) return;
    const ms = tsMs(e.createdAt);
    if (ms && ms < t0) return; // ledger may be pre-filtered to today by caller
    const amt = parseFloat(e.amount) || 0;
    if (!amt) return;
    ledgerCount++;
    if (e.direction === 'in' || e.type === 'income')   inAmt  += amt;
    if (e.direction === 'out' || e.type === 'expense') outAmt += amt;
    topTx.push({ amt, type: e.eventType || e.type || '', name: e.clientName || e.vendorName || e.employeeName || '' });
  });
  topTx.sort((a,b) => b.amt - a.amt);

  // 5) New / completed job orders today
  const newJobs = jobOrders.filter(j => tsMs(j.createdAt) >= t0).length;
  // "completed today" is best-effort — uses updatedAt + status flip; not 100% reliable
  const completedJobs = jobOrders.filter(j => j.status === 'completed' && tsMs(j.updatedAt) >= t0).length;

  // 6) Pending payment requests created today
  const newPayReqs = paymentRequests.filter(p => tsMs(p.createdAt) >= t0).length;

  // Assemble — skip silent days
  const lines = [];
  if (newOrders.length) {
    lines.push(`- 🆕 أوردرات جديدة: ${newOrders.length}${showMoney && newOrderValue ? ` (إجمالي ${fn(newOrderValue)} ج)` : ''}`);
  }
  if (totalTransitions) {
    const parts = Object.entries(transitions).map(([s,n]) => `${s}=${n}`).join(', ');
    lines.push(`- 🔄 تنقلات بين المراحل: ${totalTransitions} (${parts})`);
  }
  if (newClients.length) lines.push(`- 👤 عملاء جدد: ${newClients.length}`);
  if (showMoney && ledgerCount) {
    lines.push(`- 💰 حركات مالية: ${ledgerCount} — دخل ${fn(inAmt)} ج · مصروف ${fn(outAmt)} ج`);
    if (topTx.length) {
      const top = topTx.slice(0, 3).map(x => `${x.type}${x.name ? ` · ${x.name}` : ''}: ${fn(x.amt)} ج`);
      lines.push(`  أكبر العمليات: ${top.join(' | ')}`);
    }
  }
  if (newJobs)        lines.push(`- ⚙️ أوامر تشغيل جديدة: ${newJobs}`);
  if (completedJobs)  lines.push(`- ✅ أوامر تشغيل اكتملت: ${completedJobs}`);
  if (newPayReqs && showMoney) lines.push(`- 📋 طلبات صرف جديدة: ${newPayReqs}`);

  if (!lines.length) return '';

  const dateStr = new Date().toLocaleDateString('ar-EG', { weekday:'long', day:'numeric', month:'long' });
  return `📅 أحداث اليوم (${dateStr}):\n${lines.join('\n')}`;
}

// ── Page focus: tells the AI what to prioritise per page ────────────────────
// The launcher injects the matching focus line into the prompt so answers
// stay tied to what the user is actually looking at.
export const PAGE_FOCUS = {
  'index.html':                'لوحة المدير. ركّز على ملخّص الأداء والتنبيهات الحرجة.',
  'exec-dashboard.html':       'لوحة المدير التنفيذي. ركّز على الإيراد، الهامش، اتجاهات الأسبوع.',
  'financial-dashboard.html':  'لوحة الماليات. ركّز على التدفق النقدي، الذمم، أكبر العمليات اليوم.',
  'ops-dashboard.html':        'لوحة العمليات. ركّز على المراحل النشطة والأوردرات المتأخرة.',
  'production-dashboard.html': 'لوحة الإنتاج. ركّز على ما هو قيد الإنتاج/الطباعة، الجاهز، الاختناقات.',
  'shipping-dashboard.html':   'لوحة الشحن. ركّز على الجاهز للشحن، قيد التوصيل، المتأخر.',
  'designer-dashboard.html':   'لوحة المصمم. ركّز على الأوردرات المسندة وتأخيراتها.',
  'cs-dashboard.html':         'لوحة خدمة العملاء. ركّز على المتابعات والعملاء الجدد/الخاملين.',

  'orders.html':       'صفحة الأوردرات. ركّز على المراحل والمتأخرات.',
  'clients.html':      'صفحة العملاء. ركّز على RFM، الخاملين، أعلى العملاء قيمة.',
  'suppliers.html':    'صفحة الموردين. ركّز على الموردين النشطين والمدفوعات لهم.',
  'employees.html':    'صفحة الموظفين. ركّز على الحضور، الرواتب، آخر نشاط.',
  'materials.html':    'صفحة الخامات. ركّز على التوزيع، السعر، مخاطرة المورد الواحد.',

  'design.html':       'صفحة التصميم. ركّز على ما عالق في التصميم وآخر تحديثات اليوم.',
  'design-workspace.html': 'مساحة عمل المصمم. ركّز على الأوردرات المسندة لك واليوم.',
  'production.html':   'صفحة الإنتاج. ركّز على قيد التنفيذ والمنتقلة اليوم وزمن الدورة.',
  'print.html':        'صفحة الطباعة. ركّز على الجاهز للطباعة والمنتقل للتنفيذ اليوم.',
  'shipping.html':     'صفحة الشحن. ركّز على الجاهز/قيد التوصيل والمتأخر.',
  'shipping-accounts.html': 'تسويات الشحن. ركّز على المعلّق، الدفعات، الفروقات.',

  'accounts.html':     'صفحة الحسابات. ركّز على أرصدة المحافظ، الذمم، آخر حركات.',
  'reports.html':      'صفحة التقارير. ركّز على الاتجاهات والمقارنات الزمنية.',
  'approvals.html':    'الموافقات. ركّز على الطلبات المعلّقة وأقدمها.',
  'inbox.html':        'صندوق الرسائل. ركّز على الإشعارات غير المقروءة والعاجلة.',
  'ledger.html':       'دفتر الحركات. ركّز على آخر العمليات وفلتر الفترة المعروضة.',
};

// ── Entity detection from URL ────────────────────────────────────────────────
// Returns { type, id } or null. Lets the launcher know if the user is "deep
// in" a specific entity vs. just browsing a list.
export function detectOpenEntity(pathname, search) {
  const path = (pathname.split('/').pop() || '').toLowerCase();
  const qs   = new URLSearchParams(search || '');

  // Direct entity-detail pages
  if (path === 'employee-profile.html') {
    const id = qs.get('id');
    if (id) return { type: 'employee', id, collection: 'users' };
  }
  if (path === 'my-profile.html') {
    return { type: 'self', id: null };
  }

  // List pages that can open a focused entity via URL
  if (path === 'clients.html') {
    const id = qs.get('openClient');
    if (id) return { type: 'client', id, collection: 'clients' };
  }
  if (path === 'shipping-accounts.html' || path === 'shipping.html') {
    const orderId = qs.get('orderId');
    if (orderId) return { type: 'order', id: orderId, collection: 'orders' };
  }
  if (path === 'order-tracking.html') {
    const ref = qs.get('ref') || qs.get('order') || qs.get('id');
    if (ref) return { type: 'order', id: ref, collection: 'orders', byField: 'orderId' };
  }

  return null;
}

/**
 * Build a short markdown summary of an open entity for the AI prompt.
 *
 * @param {object} args
 * @param {string} args.type
 * @param {object} args.doc              — the entity document
 * @param {Array}  [args.relatedOrders]  — orders belonging to this entity
 * @param {string} [args.role]
 * @returns {string}
 */
export function buildEntitySection({ type, doc, relatedOrders = [], role = '' }) {
  if (!doc) return '';
  const showMoney = !['graphic_designer','production_agent','design_operator','shipping_officer'].includes(role);

  if (type === 'client') {
    const total = relatedOrders.length;
    const totalPaid = relatedOrders.reduce((s,o) => s + paid(o), 0);
    const totalOwed = relatedOrders.reduce((s,o) => s + Math.max(0,(parseFloat(o.totalPrice)||0) - paid(o)), 0);
    const last = relatedOrders
      .map(o => tsMs(o.createdAt))
      .filter(Boolean)
      .sort((a,b) => b - a)[0];
    const lastDays = last ? Math.floor((Date.now()-last)/864e5) : null;
    return `🎯 العميل المفتوح حالياً: ${doc.name || '—'}\n` +
      `- إجمالي الطلبات: ${total}\n` +
      (showMoney ? `- مدفوع: ${fn(totalPaid)} ج · متبقّ: ${fn(totalOwed)} ج\n` : '') +
      (lastDays !== null ? `- آخر طلب: منذ ${lastDays} يوم\n` : '') +
      (doc.phone1 ? `- الموبايل: ${doc.phone1}\n` : '');
  }

  if (type === 'order') {
    const t = (doc.timeline || []).slice(-3).map(x => `  · ${x.date || ''} — ${x.action || x.stage || ''}`).join('\n');
    return `🎯 الأوردر المفتوح حالياً: ${doc.orderId || doc._id || '—'}\n` +
      `- العميل: ${doc.clientName || '—'}\n` +
      `- المنتج: ${doc.productName || doc.product || '—'}\n` +
      `- المرحلة الحالية: ${doc.stage || '—'}\n` +
      (showMoney && doc.totalPrice ? `- السعر: ${fn(doc.totalPrice)} ج · مدفوع: ${fn(paid(doc))} ج\n` : '') +
      (t ? `- آخر 3 خطوات:\n${t}\n` : '');
  }

  if (type === 'employee') {
    return `🎯 الموظف المفتوح حالياً: ${doc.name || doc.displayName || '—'}\n` +
      `- الدور: ${doc.role || '—'}\n` +
      (doc.phone ? `- الموبايل: ${doc.phone}\n` : '');
  }

  return '';
}
