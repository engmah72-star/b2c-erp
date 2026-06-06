// ════════════════════════════════════════════════════════════════════
// Business2Card ERP — Admin Requests Utils (pure, testable)
// ════════════════════════════════════════════════════════════════════
//
// مركزية طلبات الإدارة: هذا الموديول pure — بلا DOM، بلا Firestore writes،
// بلا side-effects. مسؤوليته الوحيدة: توحيد (normalize) كل مصادر الطلبات
// التي تحتاج قرار أدمن في شكل واحد موحَّد، وحساب التقادم/العدّادات.
//
// المصادر (RULE 1 — كل مصدر يبقى مصدر الحقيقة لنفسه؛ هنا قراءة/توحيد فقط):
//   • payment_requests   (طلبات الدفع)            → قرار في approvals.html
//   • transactions_v2     (المعاملات المالية)      → قرار في approvals.html
//   • employee_incidents  (التظلمات — appeal)      → قرار فوري (decideIncidentAppeal)
//   • attendance_permissions (تصاريح الحضور)        → قرار فوري (decideAttendancePermission)
//   • returns_tickets     (المرتجعات)              → قرار في returns.html
//   • employee_leaves     (الإجازات)               → قرار فوري (decideEmployeeLeave)
//
// الشكل الموحَّد (normalized item):
//   { id, kind, group, icon, title, subtitle, amount, who, whenMs,
//     ageHours, ageLabel, status, decidable, deepLink, lines, raw }
//   - decidable: قرار فوري ممكن من الصفحة المركزية (true) أو تحويل لصفحة أخرى.
//   - deepLink:  { page, query } للحالات التي تحتاج صفحتها الأصلية (مالي/مرتجعات).
//   - lines:     [{ label, value }] تفاصيل للعرض.

'use strict';

// ── أنواع الطلبات (kinds) — مصدر الحقيقة للتسميات/الأيقونات/المجموعات ──
export const REQUEST_KINDS = Object.freeze({
  payment:    { label: 'طلبات الدفع',     icon: '💸', group: 'financial' },
  transaction:{ label: 'معاملات للاعتماد', icon: '🔐', group: 'financial' },
  appeal:     { label: 'التظلمات',         icon: '🛡️', group: 'hr' },
  attendance: { label: 'تصاريح الحضور',    icon: '🕐', group: 'hr' },
  leave:      { label: 'الإجازات',         icon: '🌴', group: 'hr' },
  return:     { label: 'المرتجعات',        icon: '↩️', group: 'ops' },
  orderRequest:{ label: 'طلبات البوابة',    icon: '🌐', group: 'ops' },
});

export const KIND_ORDER = Object.freeze(['payment', 'transaction', 'return', 'orderRequest', 'appeal', 'attendance', 'leave']);

// تسميات أنواع طلبات الدفع (تطابق my-requests/approvals)
const PAYMENT_TYPE_LBL = Object.freeze({
  supplier_payment: '🏭 دفعة مورد',
  salary:           '👤 مرتب/سلفة',
  client_refund:    '↩️ استرداد عميل',
  general:          '💸 مصروف عام',
});

const ATTENDANCE_TYPE_LBL = Object.freeze({
  permission:   'إذن',
  late:         'تأخير',
  early_leave:  'انصراف مبكر',
  absence:      'غياب',
});

const LEAVE_TYPE_LBL = Object.freeze({
  annual:    'سنوية',
  sick:      'مرضية',
  casual:    'عارضة',
  unpaid:    'بدون أجر',
  emergency: 'طارئة',
});

// ── حوّل أي طابع زمني (Firestore Timestamp / string / number) إلى ms ──
export function tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') { try { return ts.toMillis(); } catch (_) { return 0; } }
  if (ts.seconds != null) return ts.seconds * 1000;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? 0 : t;
}

// ── حساب التقادم (aging) ──
export function computeAging(whenMs, now = Date.now()) {
  if (!whenMs) return { hours: 0, label: '—' };
  const hours = Math.max(0, (now - whenMs) / 3_600_000);
  let label;
  if (hours < 1)       label = 'منذ أقل من ساعة';
  else if (hours < 24) label = `منذ ${Math.floor(hours)} ساعة`;
  else                 label = `منذ ${Math.floor(hours / 24)} يوم`;
  return { hours, label };
}

const num = (v) => parseFloat(v) || 0;
const str = (v) => (v == null ? '' : String(v));

// ════════════════════════════════════════════════════════════════════
// Normalizers — كل واحد ياخد (data, id) ويرجّع item موحَّد، أو null لو
// الـ doc مش في حالة تحتاج قرار (دفاع إضافي فوق فلترة الـ query).
// ════════════════════════════════════════════════════════════════════

export function normalizePayment(data = {}, id = '', now = Date.now()) {
  const PENDING = ['requested', 'awaiting_receipt', 'pending'];
  const status = str(data.status) || 'requested';
  if (!PENDING.includes(status)) return null;
  const whenMs = tsToMs(data.requestedAt) || tsToMs(data.createdAt);
  const aging = computeAging(whenMs, now);
  const partyName = data.supplierName || data.employeeName || data.clientName || '';
  return {
    id, kind: 'payment', group: 'financial',
    icon: REQUEST_KINDS.payment.icon,
    title: PAYMENT_TYPE_LBL[data.type] || data.type || 'طلب دفع',
    subtitle: partyName,
    amount: num(data.amount),
    who: str(data.requestedByName) || str(data.requestedBy),
    whenMs, ageHours: aging.hours, ageLabel: aging.label,
    status,
    decidable: false,
    deepLink: { page: 'approvals.html', query: { focus: id } },
    lines: [
      { label: 'السبب', value: str(data.reason) },
      { label: 'الأوردر', value: str(data.orderId) },
    ].filter(l => l.value),
    raw: data,
  };
}

export function normalizeTransaction(data = {}, id = '', now = Date.now()) {
  const PENDING = ['pending', 'confirmed'];
  const status = str(data.approvalStatus);
  if (!PENDING.includes(status)) return null;
  if (data.isLocked) return null;
  const whenMs = tsToMs(data.createdAt) || tsToMs(data.date);
  const aging = computeAging(whenMs, now);
  return {
    id, kind: 'transaction', group: 'financial',
    icon: REQUEST_KINDS.transaction.icon,
    title: PAYMENT_TYPE_LBL[data.type] || data.type || 'معاملة',
    subtitle: data.supplierName || data.employeeName || data.clientName || data.partyName || '',
    amount: num(data.amount),
    who: str(data.createdByName) || str(data.createdBy),
    whenMs, ageHours: aging.hours, ageLabel: aging.label,
    status,
    decidable: false,
    deepLink: { page: 'approvals.html', query: { focus: id } },
    lines: [
      { label: 'الحالة', value: status === 'pending' ? 'بانتظار التأكيد' : 'بانتظار الاعتماد النهائي' },
      { label: 'البيان', value: str(data.note || data.reason) },
    ].filter(l => l.value),
    raw: data,
  };
}

export function normalizeAppeal(data = {}, id = '', now = Date.now()) {
  const ap = data.appeal;
  if (!ap || ap.status !== 'pending') return null;
  const whenMs = tsToMs(ap.submittedAt) || tsToMs(data.createdAt);
  const aging = computeAging(whenMs, now);
  return {
    id, kind: 'appeal', group: 'hr',
    icon: REQUEST_KINDS.appeal.icon,
    title: `تظلّم — ${str(data.reasonLabel) || str(data.title) || str(data.type) || 'إخفاق'}`,
    subtitle: str(data.employeeName),
    amount: null,
    who: str(data.employeeName),
    whenMs, ageHours: aging.hours, ageLabel: aging.label,
    status: 'pending',
    decidable: true,
    deepLink: null,
    lines: [
      { label: 'الإخفاق', value: str(data.title || data.reasonLabel) },
      { label: 'الخطورة', value: str(data.severity) },
      { label: 'سبب التظلّم', value: str(ap.reason) },
    ].filter(l => l.value),
    raw: data,
  };
}

export function normalizeAttendance(data = {}, id = '', now = Date.now()) {
  if (str(data.status) !== 'pending') return null;
  const whenMs = tsToMs(data.requestedAt) || tsToMs(data.createdAt);
  const aging = computeAging(whenMs, now);
  const typeLbl = ATTENDANCE_TYPE_LBL[data.type] || data.type || 'إذن';
  const timeRange = data.fromTime && data.toTime ? `${data.fromTime} → ${data.toTime}` : '';
  return {
    id, kind: 'attendance', group: 'hr',
    icon: REQUEST_KINDS.attendance.icon,
    title: `${typeLbl}${data.date ? ' — ' + str(data.date) : ''}`,
    subtitle: str(data.employeeName),
    amount: null,
    who: str(data.requestedByName) || str(data.employeeName),
    whenMs, ageHours: aging.hours, ageLabel: aging.label,
    status: 'pending',
    decidable: true,
    deepLink: null,
    lines: [
      { label: 'الفترة', value: timeRange },
      { label: 'الدقائق', value: data.minutes ? str(data.minutes) : '' },
      { label: 'السبب', value: str(data.reason) },
    ].filter(l => l.value),
    raw: data,
  };
}

export function normalizeLeave(data = {}, id = '', now = Date.now()) {
  if (str(data.status) !== 'pending') return null;
  const whenMs = tsToMs(data.requestedAt) || tsToMs(data.createdAt);
  const aging = computeAging(whenMs, now);
  const typeLbl = LEAVE_TYPE_LBL[data.type] || data.type || 'إجازة';
  const range = data.startDate
    ? (data.endDate && data.endDate !== data.startDate ? `${data.startDate} → ${data.endDate}` : str(data.startDate))
    : '';
  return {
    id, kind: 'leave', group: 'hr',
    icon: REQUEST_KINDS.leave.icon,
    title: `إجازة ${typeLbl}`,
    subtitle: str(data.employeeName),
    amount: null,
    who: str(data.requestedByName) || str(data.employeeName) || str(data.createdBy),
    whenMs, ageHours: aging.hours, ageLabel: aging.label,
    status: 'pending',
    decidable: true,
    deepLink: null,
    lines: [
      { label: 'الفترة', value: range },
      { label: 'الأيام', value: data.days ? str(data.days) : '' },
      { label: 'السبب', value: str(data.reason) },
    ].filter(l => l.value),
    raw: data,
  };
}

export function normalizeReturn(data = {}, id = '', now = Date.now()) {
  const PENDING = ['requested', 'inspecting'];
  const status = str(data.status);
  if (!PENDING.includes(status)) return null;
  const whenMs = tsToMs(data.createdAt) || tsToMs(data.requestedAt);
  const aging = computeAging(whenMs, now);
  return {
    id, kind: 'return', group: 'ops',
    icon: REQUEST_KINDS.return.icon,
    title: `مرتجع ${str(data.ticketNo) || ''}`.trim(),
    subtitle: str(data.clientName),
    amount: num(data.refundAmount) || null,
    who: str(data.createdByName) || str(data.createdBy),
    whenMs, ageHours: aging.hours, ageLabel: aging.label,
    status,
    decidable: false,
    deepLink: { page: 'returns.html', query: { focus: id } },
    lines: [
      { label: 'الحالة', value: status === 'requested' ? 'بانتظار الفحص' : 'قيد الفحص' },
      { label: 'الأوردر', value: str(data.orderId) },
      { label: 'السبب', value: str(data.reason) },
    ].filter(l => l.value),
    raw: data,
  };
}

export function normalizeOrderRequest(data = {}, id = '', now = Date.now()) {
  // الحالة المعلّقة قد تكون 'new' (cs-dashboard) أو 'requested' — أي شيء غير
  // نهائي (converted/rejected) = بانتظار قرار.
  const PENDING = ['new', 'requested'];
  const status = str(data.status);
  if (!PENDING.includes(status)) return null;
  const whenMs = tsToMs(data.createdAt) || tsToMs(data.requestedAt);
  const aging = computeAging(whenMs, now);
  const items = Array.isArray(data.items) ? data.items.length : 0;
  return {
    id, kind: 'orderRequest', group: 'ops',
    icon: REQUEST_KINDS.orderRequest.icon,
    title: `طلب بوابة — ${str(data.clientName) || str(data.name) || 'عميل'}`,
    subtitle: str(data.clientPhone) || str(data.phone) || '',
    amount: num(data.total) || num(data.amount) || null,
    who: str(data.clientName) || str(data.name),
    whenMs, ageHours: aging.hours, ageLabel: aging.label,
    status,
    decidable: false,
    deepLink: { page: 'portal-orders.html', query: { focus: id } },
    lines: [
      { label: 'المنتجات', value: items ? String(items) : '' },
      { label: 'ملاحظة', value: str(data.notes || data.reason || data.description) },
    ].filter(l => l.value),
    raw: data,
  };
}

// خريطة kind → normalizer (لاستخدام الصفحة عند ربط كل listener)
export const NORMALIZERS = Object.freeze({
  payment:     normalizePayment,
  transaction: normalizeTransaction,
  appeal:      normalizeAppeal,
  attendance:  normalizeAttendance,
  leave:       normalizeLeave,
  return:      normalizeReturn,
  orderRequest:normalizeOrderRequest,
});

// ════════════════════════════════════════════════════════════════════
// القرارات المتخذة مؤخراً (تبويب «تم مؤخراً») — للأنواع البشرية فقط
// (تظلمات/تصاريح/إجازات) لأنها هي التي تُقرَّر من هذه الصفحة. read-only.
// ════════════════════════════════════════════════════════════════════

const DECISION_LBL = Object.freeze({
  approved: '✅ موافَق', accepted: '✅ مقبول', rejected: '❌ مرفوض',
});

// شكل موحَّد لعنصر «تم»: { id, kind, title, subtitle, decision, decisionLabel,
//   decidedBy, decidedAtMs, note }
export function normalizeDecidedAppeal(data = {}, id = '') {
  const ap = data.appeal || {};
  if (!['accepted', 'rejected'].includes(ap.status)) return null;
  return {
    id, kind: 'appeal',
    title: `تظلّم — ${str(data.reasonLabel) || str(data.title) || str(data.type) || 'إخفاق'}`,
    subtitle: str(data.employeeName),
    decision: ap.status, decisionLabel: DECISION_LBL[ap.status] || ap.status,
    decidedBy: str(ap.decidedByName), decidedAtMs: tsToMs(ap.decidedAt),
    note: str(ap.decisionNote),
  };
}

export function normalizeDecidedAttendance(data = {}, id = '') {
  if (!['approved', 'rejected'].includes(str(data.status))) return null;
  return {
    id, kind: 'attendance',
    title: `تصريح — ${str(data.type)}${data.date ? ' — ' + str(data.date) : ''}`,
    subtitle: str(data.employeeName),
    decision: data.status, decisionLabel: DECISION_LBL[data.status] || data.status,
    decidedBy: str(data.decidedByName), decidedAtMs: tsToMs(data.decidedAt),
    note: str(data.decisionNote),
  };
}

export function normalizeDecidedLeave(data = {}, id = '') {
  if (!['approved', 'rejected'].includes(str(data.status))) return null;
  // استبعاد تسجيلات الأدمن المباشرة (بلا requestedBy) — مش «قرارات» على طلب
  if (!data.requestedBy && !data.requestedByName) return null;
  return {
    id, kind: 'leave',
    title: `إجازة — ${str(data.type)}`,
    subtitle: str(data.employeeName),
    decision: data.status, decisionLabel: DECISION_LBL[data.status] || data.status,
    decidedBy: str(data.decidedByName), decidedAtMs: tsToMs(data.decidedAt),
    note: str(data.decisionNote),
  };
}

export const DONE_NORMALIZERS = Object.freeze({
  appeal:     normalizeDecidedAppeal,
  attendance: normalizeDecidedAttendance,
  leave:      normalizeDecidedLeave,
});

export function sortByDecidedDesc(items = []) {
  return [...items].filter(Boolean).sort((a, b) => (b.decidedAtMs || 0) - (a.decidedAtMs || 0));
}

// ── بحث نصّي بسيط على العنوان/التفصيل/المسؤول ──
export function matchesSearch(item, term) {
  if (!term) return true;
  const t = String(term).trim().toLowerCase();
  if (!t) return true;
  const hay = [item.title, item.subtitle, item.who].map(x => String(x || '').toLowerCase()).join(' ');
  return hay.includes(t);
}

// ── عدّ الطلبات لكل نوع ──
export function summarizeCounts(items = []) {
  const counts = {};
  for (const k of KIND_ORDER) counts[k] = 0;
  let total = 0;
  for (const it of items) {
    if (!it) continue;
    counts[it.kind] = (counts[it.kind] || 0) + 1;
    total++;
  }
  counts.all = total;
  return counts;
}

// ── ترتيب: الأقدم أولاً (الأكثر تقادماً يحتاج قرار أسرع) ──
export function sortByAgeDesc(items = []) {
  return [...items].filter(Boolean).sort((a, b) => (b.ageHours || 0) - (a.ageHours || 0));
}

// ── فلترة حسب النوع (أو 'all') ──
export function filterByKind(items = [], kind = 'all') {
  if (kind === 'all') return items.filter(Boolean);
  return items.filter(it => it && it.kind === kind);
}

// تصدير افتراضي مُجمَّع (يسهّل الاستيراد + استخدام window في الصفحات)
const adminRequestsUtils = {
  REQUEST_KINDS, KIND_ORDER, NORMALIZERS, DONE_NORMALIZERS,
  tsToMs, computeAging,
  normalizePayment, normalizeTransaction, normalizeAppeal,
  normalizeAttendance, normalizeLeave, normalizeReturn, normalizeOrderRequest,
  normalizeDecidedAppeal, normalizeDecidedAttendance, normalizeDecidedLeave,
  summarizeCounts, sortByAgeDesc, sortByDecidedDesc, filterByKind, matchesSearch,
};

export default adminRequestsUtils;

if (typeof window !== 'undefined') {
  window.adminRequestsUtils = adminRequestsUtils;
}
