/**
 * VIEWS · partials — تركيب عرضي مشترك بين الشاشات (تركيب مكوّنات + توكنز فقط).
 * صفر منطق أعمال/حساب — يقرأ حقول الطلب ويعرضها. (STANDARDS §6 · L1)
 */
import { escapeHtml } from '../utils/dom.js';
import { Badge, Button } from '../components/index.js';
import { stageLabel, stageTone, money } from '../utils/format.js';

// ترتيب المراحل للعرض فقط (Stepper) — ليس مصدر حقيقة الحالة.
const FLOW = [
  { key: 'design', label: 'تصميم' },
  { key: 'printing', label: 'طباعة' },
  { key: 'production', label: 'تنفيذ' },
  { key: 'shipping', label: 'شحن' },
  { key: 'archived', label: 'تسليم' },
];

/** شارة حالة الطلب. */
export const stageBadge = (stage) => Badge({ text: stageLabel(stage), tone: stageTone(stage) });

/** شريط المراحل — يبرز المرحلة الحالية ويعلّم المنجزة. */
export function Stepper(stage) {
  if (stage === 'cancelled') return `<div class="cp-muted cp-text-c">${escapeHtml(stageLabel(stage))}</div>`;
  const idx = FLOW.findIndex((s) => s.key === stage);
  const cur = idx < 0 ? 0 : idx;
  const nodes = FLOW.map((s, i) => {
    const cls = i < cur ? 'is-done' : i === cur ? 'is-active' : '';
    const mark = i < cur ? '✓' : String(i + 1);
    return `<div class="cp-steps__node ${cls}">
      <div class="cp-steps__dot">${mark}</div>
      <div class="cp-steps__label">${escapeHtml(s.label)}</div>
    </div>`;
  }).join('');
  return `<div class="cp-steps">${nodes}</div>`;
}

/**
 * نداء الفعل المطلوب من العميل الآن (قراءة حقول الطلب → عرض).
 * يُرجع { label, hint, action } أو null إن لا يلزم فعل.
 */
export function nextActionOf(order) {
  if (order.stage === 'cancelled' || order.stage === 'archived') return null;
  const ap = order.approvalStatus;
  if (order.stage === 'design' && (ap === 'pending' || ap === 'awaiting' || !ap)) {
    return { label: 'اعتمِد التصميم', hint: 'بانتظار موافقتك على البروفة', action: 'approve' };
  }
  return null;
}

/** لافتة نداء الفعل (تُعرض أعلى الشاشة عند وجود فعل مطلوب). */
export function CtaBanner({ title, body }) {
  return `<div class="cp-cta-banner"><div class="cp-cta-banner__title">${escapeHtml(title)}</div>${body}</div>`;
}

/** سطر فاتورة مختصر (مفتاح/قيمة). */
export const kv = (k, v, mod = '') =>
  `<div class="cp-kv ${mod}"><span class="cp-kv__k">${escapeHtml(k)}</span><span class="cp-kv__v">${escapeHtml(v)}</span></div>`;

/** زر «إعادة الطلب» — أعلى رافعة للطلبات المتكررة. */
export const ReorderBtn = (orderId, size = 'sm') =>
  Button({ label: 'اطلب تاني', icon: '🔁', variant: 'ghost', size, block: false, action: `reorder:${orderId}` });

export { money };
