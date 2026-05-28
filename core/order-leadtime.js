// ════════════════════════════════════════════════════════════════════
// core/order-leadtime.js
// Pure lead-time / completion-time helpers — "أهم KPI": متوسط وقت إنجاز
// الأوردر من الإنشاء حتى التسليم. No Firestore, no DOM — testable (G8).
//
// التسليم = deliveredAt، وإلا archivedAt، وإلا shipCollectedAt (fallback).
// البداية = createdAt.
// ════════════════════════════════════════════════════════════════════

// Robustly convert a timestamp-ish value → epoch ms (or null).
// يتعامل مع: Firestore Timestamp (.toMillis / {seconds} / {_seconds}),
// Date, ISO string, رقم ms.
export function tsToMillis(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000; // ms أو seconds
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch (_) { return null; } }
  const s = (v.seconds ?? v._seconds);
  if (typeof s === 'number') return s * 1000;
  return null;
}

const HOUR = 3600 * 1000;

// نقطة التسليم (أول قيمة متاحة بالترتيب).
export function completionMillis(order) {
  if (!order) return null;
  return tsToMillis(order.deliveredAt) ?? tsToMillis(order.archivedAt) ?? tsToMillis(order.shipCollectedAt);
}

// وقت الإنجاز بالساعات (createdAt → التسليم)، أو null لو غير مكتمل/بيانات ناقصة.
export function orderCompletionHours(order) {
  if (!order) return null;
  const start = tsToMillis(order.createdAt);
  const end = completionMillis(order);
  if (start == null || end == null) return null;
  const h = (end - start) / HOUR;
  return h >= 0 ? h : null; // نتجاهل القيم السالبة (بيانات فاسدة)
}

// ملخّص لمجموعة أوردرات: عدد المكتمل، المتوسط، الوسيط، الأسرع/الأبطأ (بالساعات).
export function summarizeCompletion(orders) {
  const hrs = (orders || []).map(orderCompletionHours).filter(h => h != null);
  if (!hrs.length) return { count: 0, avgHours: null, medianHours: null, minHours: null, maxHours: null };
  const sorted = hrs.slice().sort((a, b) => a - b);
  const sum = hrs.reduce((s, h) => s + h, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    count: hrs.length,
    avgHours: sum / hrs.length,
    medianHours: median,
    minHours: sorted[0],
    maxHours: sorted[sorted.length - 1],
  };
}

// تنسيق المدة بالعربي: ساعات لو < يوم، وإلا أيام بكسر عشري.
export function formatDuration(hours) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} د`;
  if (hours < 24) return `${hours.toFixed(1)} س`;
  return `${(hours / 24).toFixed(1)} يوم`;
}
