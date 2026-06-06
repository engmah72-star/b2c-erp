/**
 * Business2Card ERP — features/employee-profile/views/render-admin-tab.js
 *
 * ━━━ ADMIN TAB + TASKS VIEWS (Phase-2E1 · god-page decomp) ━━━
 *
 * Pure HTML builders for:
 *   - buildTasksHTML        (Tasks tab — open + done tasks + live workload)
 *   - buildIncidentsHTML    (Admin tab — incidents log)
 *   - buildClientsHTML      (Admin tab — linked clients aggregated)
 *
 * Plus constants:
 *   - INCIDENT_TYPES / INCIDENT_SEVERITY  (re-imported in page for modal)
 *   - TASK_PRIORITIES                     (priority badges)
 *   - LIVE_STAGE_MAP                      (live workload stage icons)
 *
 * Pure: no DOM, no Firestore, no globals.
 */

import { isRecurringDue, recurrenceLabel } from '../../../core/task-recurrence.js';
import { annotateRecurrence, recurrenceInfo, isVoided, APPEAL_STATUS } from '../../../core/incident-reasons.js';

export const INCIDENT_TYPES = {
  design_rejected:    { lbl: 'تصميم مرفوض',   ico: '🎨', col: 'var(--p)' },
  order_late:         { lbl: 'أوردر متأخر',    ico: '⏰', col: 'var(--y)' },
  customer_complaint: { lbl: 'شكوى عميل',     ico: '📢', col: 'var(--r)' },
  attendance:         { lbl: 'مخالفة حضور',   ico: '💤', col: 'var(--dim2)' },
  quality:            { lbl: 'مشكلة جودة',    ico: '⚠️', col: 'var(--y)' },
  other:              { lbl: 'أخرى',          ico: '📌', col: 'var(--dim2)' },
};

export const INCIDENT_SEVERITY = {
  low:    { lbl: 'منخفض',  col: 'var(--dim2)', bg: 'rgba(78,86,114,.15)' },
  medium: { lbl: 'متوسط',  col: 'var(--y)',    bg: 'rgba(255,170,0,.15)' },
  high:   { lbl: 'مرتفع',  col: 'var(--r)',    bg: 'rgba(255,61,110,.15)' },
};

const TASK_PRIORITIES = {
  urgent: { lbl: '⚡ عاجل',  cls: 'pri-urgent' },
  normal: { lbl: '📌 عادي',  cls: 'pri-normal' },
  low:    { lbl: '📎 منخفض', cls: 'pri-low' },
};

const LIVE_STAGE_MAP = {
  design_pending:  { ico: '✏️',  lbl: 'تصميم',  col: 'var(--p)' },
  design_approved: { ico: '✅',  lbl: 'اعتمد',   col: 'var(--p)' },
  production:      { ico: '🏭',  lbl: 'تنفيذ',  col: 'var(--r)' },
  printing:        { ico: '🖨️', lbl: 'طباعة',  col: 'var(--y)' },
  ready:           { ico: '📦',  lbl: 'جاهز',    col: 'var(--b-bright)' },
  shipped:         { ico: '🚚',  lbl: 'شحن',    col: 'var(--c-bright)' },
};

const defaultFormat = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── TASKS + LIVE WORKLOAD ───────────────────────────────────────────

/**
 * Build the Tasks tab content (live workload card + tasks list).
 *
 * @param {Object} args
 * @param {Array}  args.tasks     — [{ _id, title, description?, dueDate?, priority?, status }]
 * @param {Array}  args.liveOrders — pre-filtered active orders for this employee
 * @param {string} args.today
 *
 * @returns {{ html: string, openCount: number }}
 */
export function buildTasksHTML({ tasks = [], liveOrders = [], today }) {
  // المهام الدائمة (المتكرّرة) تبقى دائماً «مفتوحة» — حالتها تُشتقّ من الفترة لا من status
  const recurring = tasks.filter(t => t.taskType === 'recurring' && t.status !== 'cancelled');
  const fixed = tasks.filter(t => t.taskType !== 'recurring');
  const open = fixed.filter(t => t.status === 'pending');
  const done = fixed.filter(t => t.status === 'done').slice(0, 3);

  // Live workload card
  const liveHtml = liveOrders.length
    ? `<div style="background:rgba(124,92,255,.05);border:1px solid rgba(124,92,255,.2);border-radius:var(--rad);padding:10px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-size:var(--fs-base);font-weight:var(--fw-extra);color:var(--p)">🏃 الأوردرات الحية (${liveOrders.length})</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px">
      ${liveOrders.slice(0, 12).map(o => {
        const s = LIVE_STAGE_MAP[o.stage] || { ico: '•', lbl: o.stage, col: '#888' };
        const upd = o.updatedAt?.toDate?.() || o.createdAt?.toDate?.();
        const ageH = upd ? Math.max(0, Math.floor((Date.now() - upd.getTime()) / 3600000)) : 0;
        const ageCol = ageH >= 48 ? 'var(--r)' : ageH >= 24 ? 'var(--y)' : 'var(--g)';
        const ageLbl = ageH < 1 ? 'الآن' : ageH < 24 ? ageH + 'س' : Math.round(ageH / 24) + ' يوم';
        return `<div style="background:var(--bg2);border:1px solid var(--line);border-right:3px solid ${s.col};border-radius:8px;padding:8px 10px">
          <div class="txt-strong-base">${escAttr(o.clientName) || '—'}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px">
            <span style="font-size:var(--fs-xs);color:${s.col};font-weight:var(--fw-bold)">${s.ico} ${s.lbl}</span>
            <span style="font-size:var(--fs-xs);color:${ageCol};font-weight:var(--fw-bold)">⏱ ${ageLbl}</span>
          </div>
        </div>`;
      }).join('')}
    </div>
    ${liveOrders.length > 12 ? `<div style="text-align:center;font-size:var(--fs-xs);color:var(--dim2);margin-top:6px">+ ${liveOrders.length - 12} أوردر آخر</div>` : ''}
  </div>`
    : `<div style="background:var(--bg2);border:1px dashed var(--line);border-radius:var(--rad);padding:14px;text-align:center;margin-bottom:14px"><div class="txt-meta-sm">💤 لا توجد أوردرات نشطة في إيد الموظف حالياً</div></div>`;

  // المهام الدائمة أولاً (مرتّبة)، ثم المحدّدة المفتوحة، ثم آخر المنجزة
  const allTasks = [...recurring, ...open, ...done];
  const tasksHtml = allTasks.length
    ? allTasks.map(t => {
        const p = TASK_PRIORITIES[t.priority] || TASK_PRIORITIES.normal;
        const isRecurring = t.taskType === 'recurring';
        // المتكرّرة: «منجزة» = مختومة لهذه الفترة؛ المحدّدة: status === done
        const due = isRecurring ? isRecurringDue(t) : t.status !== 'done';
        const isDone = !due;
        const isLate = !isRecurring && t.dueDate && t.dueDate < today && !isDone;
        const recLbl = isRecurring ? recurrenceLabel(t.recurrence) : '';
        return `<div class="task-item${isDone ? ' done-task' : ''}">
      <div class="task-check${isDone ? ' checked' : ''}" onclick="toggleTask('${escAttr(t._id)}','${escAttr(t.status)}')">${isDone ? '✓' : ''}</div>
      <div class="flex-1 min-w-0">
        <div style="font-size:var(--fs-md);font-weight:var(--fw-bold);${isDone ? 'text-decoration:line-through' : ''}">${escAttr(t.title)}</div>
        ${t.description ? `<div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:2px">${escAttr(t.description)}</div>` : ''}
        ${isRecurring
          ? `<div style="font-size:var(--fs-xs);color:var(--p);margin-top:2px">${recLbl} · ${isDone ? '✓ تمّت لهذه الفترة' : '⏳ مستحقّة'}</div>`
          : (t.dueDate ? `<div style="font-size:var(--fs-xs);color:${isLate ? 'var(--r)' : 'var(--dim2)'};margin-top:2px">📅 ${escAttr(t.dueDate)}${isLate ? ' ⚠️ متأخرة' : ''}</div>` : '')}
      </div>
      <span class="pri-badge ${p.cls}">${p.lbl}</span>
      <button type="button" onclick="deleteTask('${escAttr(t._id)}')" style="background:none;border:none;color:var(--dim2);cursor:pointer;font-size:var(--fs-lg);padding:var(--space-2xs)">🗑</button>
    </div>`;
      }).join('')
    : `<div class="empty-cta">
    <div class="empty-icon">✅</div>
    <div class="empty-text">لا توجد مهام مسجّلة</div>
    <button type="button" class="btn btn-b btn-sm" onclick="openAddTask()">＋ إضافة أول مهمة</button>
  </div>`;

  return {
    html: liveHtml + tasksHtml,
    openCount: open.length + recurring.filter(t => isRecurringDue(t)).length,
  };
}

// ── INCIDENTS ───────────────────────────────────────────────────────

/**
 * Build the incidents list (admin tab).
 *
 * @param {Object} args
 * @param {Array} args.incidents — [{ _id, type, severity, title, description, date, orderId, clientName, createdByName }]
 * @returns {{ html: string, count: number }}
 */
export function buildIncidentsHTML({ incidents = [] }) {
  if (!incidents.length) {
    return {
      html: '<div class="empty-cta"><div class="empty-icon">✨</div><div class="empty-text">لا توجد إخفاقات مسجّلة</div></div>',
      count: 0,
    };
  }
  const recur = annotateRecurrence(incidents); // id → {ordinal,total}
  const html = incidents.slice(0, 20).map(i => {
    const t = INCIDENT_TYPES[i.type] || INCIDENT_TYPES.other;
    const s = INCIDENT_SEVERITY[i.severity] || INCIDENT_SEVERITY.low;
    const voided = isVoided(i);
    const rc = recur.get(i._id);
    const info = rc ? recurrenceInfo(rc.total) : { level: 'none' };
    // شارة حصر التكرار: «المرة N من M» + اقتراح تصعيد
    const recurBadge = (rc && rc.total > 1)
      ? `<span style="font-size:var(--fs-tiny);font-weight:var(--fw-extra);padding:2px 8px;border-radius:var(--rad);background:${info.level === 'high' ? 'rgba(255,61,110,.15)' : 'rgba(255,170,0,.15)'};color:${info.level === 'high' ? 'var(--r)' : 'var(--y)'}">🔁 المرة ${rc.ordinal} من ${rc.total}</span>`
      : '';
    const escalateHint = (rc && rc.ordinal === rc.total && info.level !== 'none')
      ? `<div style="font-size:var(--fs-xs);color:${info.level === 'high' ? 'var(--r)' : 'var(--y)'};margin-top:3px">⚠️ ${escAttr(info.text)}</div>`
      : '';
    // التظلّم
    const ap = i.appeal;
    let appealBlock = '';
    if (ap && ap.status === 'pending') {
      appealBlock = `<div style="margin-top:6px;background:rgba(255,170,0,.07);border:1px solid rgba(255,170,0,.22);border-radius:var(--rad);padding:7px 10px">
        <div style="font-size:var(--fs-xs);color:var(--y);font-weight:var(--fw-bold);margin-bottom:4px">⏳ تظلّم الموظف: <span style="color:var(--dim2);font-weight:var(--fw-normal)">${escAttr(ap.reason) || ''}</span></div>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn btn-g btn-sm" onclick="decideAppeal('${escAttr(i._id)}','accepted')">✓ قبول (إلغاء الأثر)</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="decideAppeal('${escAttr(i._id)}','rejected')">✕ رفض</button>
        </div>
      </div>`;
    } else if (ap && (ap.status === 'accepted' || ap.status === 'rejected')) {
      const a = APPEAL_STATUS[ap.status];
      appealBlock = `<div style="font-size:var(--fs-xs);color:${a.col};margin-top:5px">${a.lbl}${ap.decisionNote ? ' — ' + escAttr(ap.decisionNote) : ''}</div>`;
    }
    return `<div style="background:var(--bg3);border:1px solid var(--line);border-right:3px solid ${t.col};border-radius:var(--rad);padding:10px 12px;margin-bottom:6px;display:flex;align-items:flex-start;gap:10px;${voided ? 'opacity:.6' : ''}">
      <span style="font-size:var(--fs-2xl);flex-shrink:0">${t.ico}</span>
      <div class="flex-1 min-w-0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px">
          <span class="txt-bold-md"${voided ? ' style="text-decoration:line-through"' : ''}>${escAttr(i.reasonLabel || i.title) || t.lbl}</span>
          <span style="font-size:var(--fs-tiny);font-weight:var(--fw-extra);padding:2px 8px;border-radius:var(--rad);background:${s.bg};color:${s.col}">${s.lbl}</span>
          ${recurBadge}
        </div>
        ${i.description ? `<div style="font-size:var(--fs-sm);color:var(--dim2);line-height:var(--lh-base)">${escAttr(i.description)}</div>` : ''}
        ${escalateHint}
        ${i.imageUrl ? `<a href="${escAttr(i.imageUrl)}" target="_blank" rel="noopener" title="عرض صورة المخالفة" style="display:inline-block;margin-top:6px"><img src="${escAttr(i.imageUrl)}" alt="صورة المخالفة" loading="lazy" style="max-width:120px;max-height:90px;border-radius:var(--rad);border:1px solid var(--line2);object-fit:cover;display:block"></a>` : ''}
        ${i.orderId ? `<a href="order-tracking.html?id=${escAttr(i.orderId)}" style="font-size:var(--fs-xs);color:var(--b);text-decoration:none;display:block;margin-top:3px">🔗 أوردر مرتبط${i.clientName ? ' — ' + escAttr(i.clientName) : ''}</a>` : ''}
        <div class="txt-meta-xs" style="margin-top:3px">${escAttr(i.date) || ''} · ${escAttr(i.createdByName) || ''}</div>
        ${appealBlock}
      </div>
      <button type="button" onclick="deleteIncident('${escAttr(i._id)}')" style="background:none;border:none;color:var(--dim2);cursor:pointer;font-size:var(--fs-lg);padding:var(--space-xs)" title="حذف">🗑</button>
    </div>`;
  }).join('');
  return { html, count: incidents.length };
}

// ── CLIENTS (admin tab) ─────────────────────────────────────────────

/**
 * Build the linked-clients list (aggregated from employee orders).
 *
 * @param {Object} args
 * @param {Array}  args.orders   — employee orders for the period
 * @param {Function} [args.format]
 * @returns {{ html: string, count: number }}
 */
export function buildClientsHTML({ orders = [], format = defaultFormat }) {
  if (!orders.length) {
    return {
      html: '<div class="empty-cta"><div class="empty-icon">👤</div><div class="empty-text">لا يوجد عملاء مرتبطون بعد</div></div>',
      count: 0,
    };
  }
  const map = {};
  for (const o of orders) {
    const key = o.clientPhone || o.clientId || o.clientName || '?';
    if (!map[key]) map[key] = { name: o.clientName || '—', phone: o.clientPhone || '', orders: [], revenue: 0, lastDate: null };
    map[key].orders.push(o);
    map[key].revenue += parseFloat(o.salePrice) || 0;
    const d = o.createdAt?.toDate?.();
    if (d && (!map[key].lastDate || d > map[key].lastDate)) map[key].lastDate = d;
  }
  const clients = Object.values(map).sort((a, b) => b.revenue - a.revenue);

  const html = clients.map((c, i) => {
    const archived = c.orders.filter(o => o.stage === 'archived').length;
    const rate = c.orders.length > 0 ? Math.round(archived / c.orders.length * 100) : 0;
    const rateCol = rate >= 70 ? 'var(--g)' : rate >= 40 ? 'var(--y)' : 'var(--r)';
    const lastStr = c.lastDate ? c.lastDate.toLocaleDateString('ar-EG') : '—';
    const waHref = c.phone ? `https://wa.me/2${c.phone.replace(/^0/, '')}` : '';
    const isTop = i === 0 && clients.length > 1;
    const isRepeat = c.orders.length > 1;
    return `<div style="display:flex;gap:var(--space-md);align-items:center;padding:11px 14px;background:var(--bg3);border-radius:var(--rad);margin-bottom:7px;border-right:3px solid ${rateCol};${isTop ? 'box-shadow:0 2px 8px rgba(0,217,126,.12)' : ''}">
      <div style="width:38px;height:38px;border-radius:50%;background:${isTop ? 'rgba(0,217,126,.15)' : 'var(--bg2)'};color:${isTop ? 'var(--g)' : 'var(--dim)'};display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:var(--fw-heavy);flex-shrink:0">${(c.name || '?')[0].toUpperCase()}</div>
      <div class="flex-1 min-w-0">
        <div style="font-size:var(--fs-md);font-weight:var(--fw-extra);margin-bottom:3px;display:flex;gap:6px;align-items:center">
          ${escAttr(c.name)}
          ${isTop ? '<span class="bdg-mini bdg-mini-g">★ الأعلى</span>' : ''}
          ${isRepeat ? '<span class="bdg-mini bdg-mini-b">↩ متكرر</span>' : ''}
        </div>
        <div class="txt-meta-xs">${escAttr(c.phone) || '—'} · آخر أوردر: ${lastStr}</div>
      </div>
      <div style="display:flex;gap:14px;align-items:center;flex-shrink:0">
        <div class="text-center">
          <div style="font-size:var(--fs-lg);font-weight:var(--fw-heavy)">${c.orders.length}</div>
          <div class="txt-meta-tiny">أوردر</div>
        </div>
        <div class="text-center">
          <div style="font-size:var(--fs-lg);font-weight:var(--fw-heavy);color:var(--g)">${format(c.revenue)}</div>
          <div class="txt-meta-tiny">ج</div>
        </div>
        <div class="text-center">
          <div style="font-size:var(--fs-lg);font-weight:var(--fw-heavy);color:${rateCol}">${rate}%</div>
          <div class="txt-meta-tiny">مكتمل</div>
        </div>
        ${waHref ? `<a href="${waHref}" target="_blank" style="font-size:var(--fs-2xl);text-decoration:none;opacity:.8" onclick="event.stopPropagation()">💬</a>` : ''}
      </div>
    </div>`;
  }).join('');

  return { html, count: clients.length };
}
