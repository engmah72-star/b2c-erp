/**
 * Business2Card ERP — clients-render.js
 *
 * ━━━ PURE RENDER + FORMATTING HELPERS FOR clients.html ━━━
 *
 * God-page decomposition PR-1 (RULE G5 + L1):
 * Extracts the pure, side-effect-free formatters and HTML builders out of
 * clients.html (4793 lines → smaller) into a focused module. clients.html
 * keeps using the same function names — they're attached to `window`
 * because clients.html is compat-style (no ES `import`).
 *
 * Contracts kept identical to the in-page originals so behavior is unchanged.
 */

// ─── DATE / TIME FORMATTERS ──────────────────────────────────────────

/**
 * fmtOccasion(dateStr) — يحوّل تاريخ مناسبة لنص ودود بالعربي مع
 * مؤشر "اليوم / غداً / بعد N أيام" حسب القرب.
 */
export function fmtOccasion(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr); if (isNaN(d)) return dateStr;
  const now = new Date();
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    next.setFullYear(now.getFullYear() + 1);
  const daysAway = Math.ceil(
    (next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  );
  const md = d.toLocaleDateString('ar-EG', { month: 'long', day: 'numeric' });
  let label = md;
  if (daysAway === 0)      label += ' 🎉 اليوم!';
  else if (daysAway === 1) label += ' (غداً)';
  else if (daysAway <= 7)  label += ` (بعد ${daysAway} أيام)`;
  return label;
}

/** هل التاريخ موافق اليوم (شهر + يوم فقط، يتجاهل السنة)؟ */
export function isOccasionToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr); if (isNaN(d)) return false;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** هل المناسبة خلال N أيام قادمة؟ */
export function isOccasionSoon(dateStr, withinDays = 7) {
  if (!dateStr) return false;
  const d = new Date(dateStr); if (isNaN(d)) return false;
  const now = new Date();
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    next.setFullYear(now.getFullYear() + 1);
  const daysAway = Math.ceil(
    (next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  );
  return daysAway >= 0 && daysAway <= withinDays;
}

/** هل الـ Firestore timestamp ضمن الشهر الحالي؟ */
export function isThisMonth(ts) {
  if (!ts?.toDate) return false;
  const d = ts.toDate();
  const n = new Date();
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

/** "منذ X" بصياغة عربية مختصرة. يقبل Firestore Timestamp أو Date أو string. */
export function fuTimeAgo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60)        return 'الآن';
  if (diff < 3600)      return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400)     return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 86400 * 30) return `منذ ${Math.floor(diff / 86400)} يوم`;
  return d.toLocaleDateString('ar-EG');
}

/** تنسيق تاريخ ISO إلى "DD/MM/YYYY HH:mm" بالعربي. */
export function fuFmtDate(s) {
  if (!s) return '';
  const d = new Date(s); if (isNaN(d)) return s;
  return d.toLocaleDateString('ar-EG') + ' ' +
    d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

/** يحوّل ISO string إلى قيمة datetime-local input (YYYY-MM-DDTHH:mm). */
export function toLocalDT(s) {
  const d = new Date(s); if (isNaN(d)) return '';
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

// ─── HTML / TEXT ESCAPING ────────────────────────────────────────────

/**
 * escapeHtml(s) — HTML-escape canonical helper.
 * Replaces both inline duplicates in clients.html (lines ~1753 & ~2519).
 */
export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ─── HTML BUILDERS (return strings, no DOM) ──────────────────────────

/** صف key/value داخل لوحة عميل (label + value). */
export function pRow(l, v) {
  return `<div style="background:var(--bg3);border-radius:8px;padding:8px 10px"><div style="font-size:var(--fs-tiny);color:var(--dim2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${l}</div><div style="font-size:var(--fs-base);font-weight:700">${v}</div></div>`;
}

/** input داخل تبويب البطاقة الشخصية. */
export function bcInput(id, label, ph, val, type) {
  type = type || 'text';
  return `<div style="margin-bottom:8px"><label style="display:block;font-size:var(--fs-xs);font-weight:700;color:var(--dim2);margin-bottom:3px">${label}</label><input type="${type}" id="bc-${id}" placeholder="${ph || ''}" value="${(val || '').toString().replace(/"/g, '&quot;')}" style="width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--snow);font-family:inherit;font-size:var(--fs-base);outline:none"></div>`;
}

/** textarea داخل تبويب البطاقة الشخصية. */
export function bcTextarea(id, label, ph, val) {
  return `<div style="margin-bottom:8px"><label style="display:block;font-size:var(--fs-xs);font-weight:700;color:var(--dim2);margin-bottom:3px">${label}</label><textarea id="bc-${id}" placeholder="${ph || ''}" style="width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--snow);font-family:inherit;font-size:var(--fs-base);outline:none;min-height:60px;resize:vertical">${(val || '').toString().replace(/</g, '&lt;')}</textarea></div>`;
}

/** قسم داخل تبويب البطاقة (title + body). */
export function bcSection(title, body) {
  return `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px">
    <div style="font-size:var(--fs-base);font-weight:800;color:var(--snow);margin-bottom:10px;display:flex;align-items:center;gap:6px">${title}</div>
    ${body}
  </div>`;
}

// ─── SECTION-LEVEL HTML BUILDERS (PR-2) ──────────────────────────────
// Larger HTML blocks moved out of clients.html — each one is a pure
// function: takes data (+ a small ctx object for refs that aren't part
// of the data itself), returns an HTML string. The page does its own
// DOM insertion. No closure state assumed.

/**
 * aiAnalysisHTML(d) — يبني HTML للوحة تحليل العميل بالذكاء الاصطناعي.
 * d: { summary, churnRiskAssessment, predictedNextProduct,
 *      opportunities[], recommendedActions[{priority, action, reason}] }
 *
 * Returns HTML string. Caller writes into the target element:
 *   document.getElementById('ai-body').innerHTML = aiAnalysisHTML(d);
 */
export function aiAnalysisHTML(d) {
  if (!d) {
    return '<div style="color:var(--dim2);text-align:center;padding:20px">لا توجد بيانات</div>';
  }
  const priorityCol = { high: 'var(--r)', medium: 'var(--y)', low: 'var(--g)' };
  const priorityIco = { high: '🔥', medium: '⚡', low: '🌱' };
  const actions = (d.recommendedActions || []).map(a => `
    <div style="background:var(--bg3);border-right:3px solid ${priorityCol[a.priority] || 'var(--dim)'};border-radius:8px;padding:10px 12px;margin-bottom:6px">
      <div style="font-weight:700;color:var(--snow);font-size:var(--fs-md);margin-bottom:4px">${priorityIco[a.priority] || '•'} ${escapeHtml(a.action || '')}</div>
      <div style="font-size:var(--fs-sm);color:var(--dim);line-height:1.6">${escapeHtml(a.reason || '')}</div>
    </div>`).join('');
  const opps = (d.opportunities || []).map(o => `<li style="margin-bottom:4px">${escapeHtml(o)}</li>`).join('');

  return `
    <div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:10px;padding:12px 14px;margin-bottom:12px">
      <div style="font-size:var(--fs-xs);font-weight:800;color:var(--ai,#10b981);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">ملخّص</div>
      <div style="color:var(--snow);font-size:var(--fs-md);line-height:1.7">${escapeHtml(d.summary || '')}</div>
    </div>

    <div style="background:var(--bg3);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:12px">
      <div style="font-size:var(--fs-xs);font-weight:800;color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">⚠️ تقييم خطر الفقد</div>
      <div style="color:var(--snow);font-size:var(--fs-md);line-height:1.7">${escapeHtml(d.churnRiskAssessment || '')}</div>
    </div>

    ${d.predictedNextProduct ? `
    <div style="background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.2);border-radius:10px;padding:12px 14px;margin-bottom:12px">
      <div style="font-size:var(--fs-xs);font-weight:800;color:var(--pu,var(--p));text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">🔮 المنتج المتوقع للطلب القادم</div>
      <div style="color:var(--snow);font-size:var(--fs-lg);font-weight:700">${escapeHtml(d.predictedNextProduct)}</div>
    </div>` : ''}

    ${opps ? `
    <div style="background:var(--bg3);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:12px">
      <div style="font-size:var(--fs-xs);font-weight:800;color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">💡 فرص</div>
      <ul style="margin:0;padding-right:18px;color:var(--snow);font-size:var(--fs-md)">${opps}</ul>
    </div>` : ''}

    ${actions ? `
    <div>
      <div style="font-size:var(--fs-xs);font-weight:800;color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📋 الإجراءات المقترحة</div>
      ${actions}
    </div>` : ''}

    <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--line);font-size:var(--fs-xs);color:var(--dim2);text-align:center">
      🤖 توليد بـ Genkit + Gemini · هذا تحليل آلي، راجع قبل التنفيذ
    </div>
  `;
}

/**
 * clientFollowupsHTML({followups, err, orders, FU_TYPE_COL, FU_TYPES,
 *                      FU_OUTCOMES, STAGE_HREF}) — يبني HTML لتبويب
 * المتابعات داخل لوحة العميل. كل الـ refs الخارجية تمرَّر صراحةً.
 *
 * Returns HTML string. Caller writes the result into the panel container.
 */
export function clientFollowupsHTML({
  followups = [],
  err = '',
  orders = [],
  FU_TYPE_COL = {},
  FU_TYPES = {},
  FU_OUTCOMES = {},
  STAGE_HREF = {},
} = {}) {
  const errBanner = err
    ? `<div style="background:rgba(255,61,110,.08);border:1px solid rgba(255,61,110,.3);border-radius:var(--rad);padding:10px 12px;margin-bottom:10px;font-size:var(--fs-sm);color:var(--r)">⚠️ تعذّر تحميل سجل المتابعات: ${escapeHtml(err)}<div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:4px">قد يكون نظام الأذونات يحتاج تحديث — راجع الأدمن لتفعيل صلاحية المتابعات.</div></div>`
    : '';

  if (!followups.length) {
    return errBanner +
      `<div style="color:var(--dim2);font-size:var(--fs-base);text-align:center;padding:20px;background:var(--bg2);border:1px dashed var(--line);border-radius:var(--rad)">📭 لا يوجد متابعات بعد — اضغط <b>＋ متابعة جديدة</b> لتسجيل أول تواصل.</div>`;
  }

  const rendered = followups.map(f => {
    const col      = FU_TYPE_COL[f.type] || 'var(--dim2)';
    const typeLbl  = FU_TYPES[f.type] || f.type;
    const outLbl   = f.outcome ? (FU_OUTCOMES[f.outcome] || f.outcome) : '';
    const overdue  = !f.nextActionDone && f.nextActionDate &&
                     new Date(f.nextActionDate).getTime() < Date.now();
    const upcoming = !f.nextActionDone && f.nextActionDate &&
                     new Date(f.nextActionDate).getTime() >= Date.now();
    return `<div style="background:var(--bg2);border:1px solid var(--line);border-right:3px solid ${col};border-radius:var(--rad);padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <span style="font-size:var(--fs-sm);font-weight:800;color:${col}">${typeLbl}</span>
          ${outLbl ? `<span style="font-size:var(--fs-xs);padding:2px 8px;border-radius:20px;background:var(--bg3);color:var(--dim2);font-weight:700">${outLbl}</span>` : ''}
          ${overdue ? '<span style="font-size:var(--fs-xs);padding:2px 8px;border-radius:20px;background:rgba(255,61,110,.15);color:var(--r);font-weight:800">⚠️ متأخر</span>' : ''}
          ${upcoming ? '<span style="font-size:var(--fs-xs);padding:2px 8px;border-radius:20px;background:rgba(59,158,255,.15);color:var(--b);font-weight:800">⏰ قادم</span>' : ''}
          ${f.nextActionDone ? '<span style="font-size:var(--fs-xs);padding:2px 8px;border-radius:20px;background:rgba(0,217,126,.15);color:var(--g);font-weight:800">✅ تم</span>' : ''}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${!f.nextActionDone && f.nextActionDate ? `<button class="btn btn-g btn-sm" style="padding:3px 8px;font-size:var(--fs-xs)" onclick="markFollowupDone('${f._id}')">✓ تم</button>` : ''}
          <button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:var(--fs-xs)" onclick="editFollowup('${f._id}')">✏️</button>
          <button class="btn btn-danger btn-sm" style="padding:3px 8px;font-size:var(--fs-xs)" onclick="deleteFollowup('${f._id}')">🗑</button>
        </div>
      </div>
      ${f.note ? `<div style="font-size:var(--fs-base);color:var(--snow);line-height:1.6;white-space:pre-wrap">${escapeHtml(f.note)}</div>` : ''}
      ${(f.orderId || f.productRating || f.productReview) ? `
      <div style="margin-top:8px;padding:8px 10px;background:rgba(255,170,0,.05);border:1px solid rgba(255,170,0,.18);border-radius:8px">
        ${f.orderId ? (() => {
          const o = orders.find(x => x._id === f.orderId);
          const code = f.orderCode || o?.orderId || (o?._id || '').slice(-6);
          const pn   = f.productName || o?.product ||
                       (o?.products || []).map(p => p.name + '×' + p.qty).join(' + ') || '';
          const href = o ? (STAGE_HREF[o.stage] || 'index') + '.html' : '#';
          return `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:4px">🔗 <a href="${href}" style="color:var(--b);text-decoration:none;font-weight:700">${code}${pn ? ' · ' + escapeHtml(pn) : ''}</a></div>`;
        })() : ''}
        ${f.productRating > 0 ? `<div style="font-size:var(--fs-md);color:var(--y);letter-spacing:2px;margin-bottom:${f.productReview ? '4' : '0'}px">${'★'.repeat(f.productRating)}<span style="color:var(--line2)">${'★'.repeat(5 - f.productRating)}</span></div>` : ''}
        ${f.productReview ? `<div style="font-size:var(--fs-sm);color:var(--snow);line-height:1.5;font-style:italic">"${escapeHtml(f.productReview)}"</div>` : ''}
      </div>` : ''}
      ${f.nextActionDate ? `<div style="margin-top:6px;font-size:var(--fs-xs);color:${overdue ? 'var(--r)' : 'var(--dim2)'};font-weight:700">📅 المتابعة القادمة: ${fuFmtDate(f.nextActionDate)}</div>` : ''}
      <div style="margin-top:6px;display:flex;justify-content:space-between;font-size:var(--fs-tiny);color:var(--dim2)">
        <span>👤 ${f.createdByName || '—'}</span>
        <span>${fuTimeAgo(f.createdAt)}</span>
      </div>
    </div>`;
  }).join('');

  return errBanner + rendered;
}

// ─── SIDE-EFFECT: expose to window for compat (clients.html) ─────────
// clients.html is compat-style (no ES `import`). Module loads as
// `<script type="module">` and attaches the helpers to `window` so the
// in-page code keeps calling them by name without changes.

if (typeof window !== 'undefined') {
  Object.assign(window, {
    fmtOccasion, isOccasionToday, isOccasionSoon, isThisMonth,
    fuTimeAgo, fuFmtDate, toLocalDT,
    escapeHtml,
    pRow, bcInput, bcTextarea, bcSection,
    // PR-2:
    aiAnalysisHTML, clientFollowupsHTML,
  });
}
