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
  return `<div style="background:var(--bg3);border-radius:8px;padding:8px 10px"><div style="font-size:var(--fs-tiny);color:var(--dim2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${l}</div><div class="txt-strong-base">${v}</div></div>`;
}

/** input داخل تبويب البطاقة الشخصية. */
export function bcInput(id, label, ph, val, type) {
  type = type || 'text';
  return `<div style="margin-bottom:8px"><label style="display:block;font-size:var(--fs-xs);font-weight:var(--fw-bold);color:var(--dim2);margin-bottom:3px">${label}</label><input type="${type}" id="bc-${id}" placeholder="${ph || ''}" value="${(val || '').toString().replace(/"/g, '&quot;')}" style="width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--snow);font-family:inherit;font-size:var(--fs-base);outline:none"></div>`;
}

/** textarea داخل تبويب البطاقة الشخصية. */
export function bcTextarea(id, label, ph, val) {
  return `<div style="margin-bottom:8px"><label style="display:block;font-size:var(--fs-xs);font-weight:var(--fw-bold);color:var(--dim2);margin-bottom:3px">${label}</label><textarea id="bc-${id}" placeholder="${ph || ''}" style="width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--snow);font-family:inherit;font-size:var(--fs-base);outline:none;min-height:60px;resize:vertical">${(val || '').toString().replace(/</g, '&lt;')}</textarea></div>`;
}

/** قسم داخل تبويب البطاقة (title + body). */
export function bcSection(title, body) {
  return `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:var(--space-md);margin-bottom:10px">
    <div style="font-size:var(--fs-base);font-weight:var(--fw-extra);color:var(--snow);margin-bottom:10px;display:flex;align-items:center;gap:6px">${title}</div>
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
    return '<div style="color:var(--dim2);text-align:center;padding:var(--space-xl)">لا توجد بيانات</div>';
  }
  const priorityCol = { high: 'var(--r)', medium: 'var(--y)', low: 'var(--g)' };
  const priorityIco = { high: '🔥', medium: '⚡', low: '🌱' };
  const actions = (d.recommendedActions || []).map(a => `
    <div style="background:var(--bg3);border-right:3px solid ${priorityCol[a.priority] || 'var(--dim)'};border-radius:8px;padding:10px 12px;margin-bottom:6px">
      <div style="font-weight:var(--fw-bold);color:var(--snow);font-size:var(--fs-md);margin-bottom:4px">${priorityIco[a.priority] || '•'} ${escapeHtml(a.action || '')}</div>
      <div style="font-size:var(--fs-sm);color:var(--dim);line-height:1.6">${escapeHtml(a.reason || '')}</div>
    </div>`).join('');
  const opps = (d.opportunities || []).map(o => `<li style="margin-bottom:4px">${escapeHtml(o)}</li>`).join('');

  return `
    <div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:var(--rad);padding:12px 14px;margin-bottom:12px">
      <div style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:var(--ai,var(--g-emerald));text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">ملخّص</div>
      <div style="color:var(--snow);font-size:var(--fs-md);line-height:var(--lh-relaxed)">${escapeHtml(d.summary || '')}</div>
    </div>

    <div style="background:var(--bg3);border:1px solid var(--line);border-radius:var(--rad);padding:12px 14px;margin-bottom:12px">
      <div style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">⚠️ تقييم خطر الفقد</div>
      <div style="color:var(--snow);font-size:var(--fs-md);line-height:var(--lh-relaxed)">${escapeHtml(d.churnRiskAssessment || '')}</div>
    </div>

    ${d.predictedNextProduct ? `
    <div style="background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.2);border-radius:var(--rad);padding:12px 14px;margin-bottom:12px">
      <div style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:var(--pu,var(--p));text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">🔮 المنتج المتوقع للطلب القادم</div>
      <div style="color:var(--snow);font-size:var(--fs-lg);font-weight:var(--fw-bold)">${escapeHtml(d.predictedNextProduct)}</div>
    </div>` : ''}

    ${opps ? `
    <div style="background:var(--bg3);border:1px solid var(--line);border-radius:var(--rad);padding:12px 14px;margin-bottom:12px">
      <div style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">💡 فرص</div>
      <ul style="margin:0;padding-right:18px;color:var(--snow);font-size:var(--fs-md)">${opps}</ul>
    </div>` : ''}

    ${actions ? `
    <div>
      <div style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📋 الإجراءات المقترحة</div>
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
      `<div style="color:var(--dim2);font-size:var(--fs-base);text-align:center;padding:var(--space-xl);background:var(--bg2);border:1px dashed var(--line);border-radius:var(--rad)">📭 لا يوجد متابعات بعد — اضغط <b>＋ متابعة جديدة</b> لتسجيل أول تواصل.</div>`;
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
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-sm);margin-bottom:6px">
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <span style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:${col}">${typeLbl}</span>
          ${outLbl ? `<span style="font-size:var(--fs-xs);padding:2px 8px;border-radius:20px;background:var(--bg3);color:var(--dim2);font-weight:var(--fw-bold)">${outLbl}</span>` : ''}
          ${overdue ? '<span style="font-size:var(--fs-xs);padding:2px 8px;border-radius:20px;background:rgba(255,61,110,.15);color:var(--r);font-weight:var(--fw-extra)">⚠️ متأخر</span>' : ''}
          ${upcoming ? '<span style="font-size:var(--fs-xs);padding:2px 8px;border-radius:20px;background:rgba(59,158,255,.15);color:var(--b);font-weight:var(--fw-extra)">⏰ قادم</span>' : ''}
          ${f.nextActionDone ? '<span style="font-size:var(--fs-xs);padding:2px 8px;border-radius:20px;background:rgba(0,217,126,.15);color:var(--g);font-weight:var(--fw-extra)">✅ تم</span>' : ''}
        </div>
        <div style="display:flex;gap:var(--space-xs);flex-shrink:0">
          ${!f.nextActionDone && f.nextActionDate ? `<button type="button" class="btn btn-g btn-sm" style="padding:3px 8px;font-size:var(--fs-xs)" onclick="markFollowupDone('${f._id}')">✓ تم</button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:var(--fs-xs)" onclick="editFollowup('${f._id}')">✏️</button>
          <button type="button" class="btn btn-danger btn-sm" style="padding:3px 8px;font-size:var(--fs-xs)" onclick="deleteFollowup('${f._id}')">🗑</button>
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
          return `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:4px">🔗 <a href="${href}" style="color:var(--b);text-decoration:none;font-weight:var(--fw-bold)">${code}${pn ? ' · ' + escapeHtml(pn) : ''}</a></div>`;
        })() : ''}
        ${f.productRating > 0 ? `<div style="font-size:var(--fs-md);color:var(--y);letter-spacing:2px;margin-bottom:${f.productReview ? '4' : '0'}px">${'★'.repeat(f.productRating)}<span style="color:var(--line2)">${'★'.repeat(5 - f.productRating)}</span></div>` : ''}
        ${f.productReview ? `<div style="font-size:var(--fs-sm);color:var(--snow);line-height:var(--lh-base);font-style:italic">"${escapeHtml(f.productReview)}"</div>` : ''}
      </div>` : ''}
      ${f.nextActionDate ? `<div style="margin-top:6px;font-size:var(--fs-xs);color:${overdue ? 'var(--r)' : 'var(--dim2)'};font-weight:var(--fw-bold)">📅 المتابعة القادمة: ${fuFmtDate(f.nextActionDate)}</div>` : ''}
      <div style="margin-top:6px;display:flex;justify-content:space-between;font-size:var(--fs-tiny);color:var(--dim2)">
        <span>👤 ${f.createdByName || '—'}</span>
        <span>${fuTimeAgo(f.createdAt)}</span>
      </div>
    </div>`;
  }).join('');

  return errBanner + rendered;
}

/**
 * panelOrdersHTML({orders, filter, calcRem, fn, STAGE_COL, STAGE_HREF, STAGE_AR})
 * → HTML string for the "Orders" tab inside a client panel.
 *
 * Filtering done internally:
 *   'active' → !archived
 *   'rem'    → calcRem(o) > 0
 *   'late'   → !archived && deadline in past
 *
 * Each row carries inline action buttons (waybill / share / comments /
 * return). Visibility of price columns is gated by window.canSee()
 * (compat field-level permissions — global, RULE 8).
 */
export function panelOrdersHTML({
  orders = [],
  filter = 'all',
  calcRem = () => 0,
  fn = (n) => String(parseFloat(n) || 0),
  STAGE_COL = {},
  STAGE_HREF = {},
  STAGE_AR = {},
} = {}) {
  let data = orders.slice().sort(
    (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
  );
  if (filter === 'active')    data = data.filter(o => o.stage !== 'archived');
  else if (filter === 'rem')  data = data.filter(o => calcRem(o) > 0);
  else if (filter === 'late') data = data.filter(o => o.stage !== 'archived' && o.deadline && new Date(o.deadline) < new Date());

  if (!data.length) {
    return `<div style="color:var(--dim2);font-size:var(--fs-base);text-align:center;padding:var(--space-lg)">لا توجد أوردرات</div>`;
  }

  // canSee is the compat field-permission helper exposed on window.
  const canSee = (typeof window !== 'undefined' && window.canSee)
    ? window.canSee
    : () => true;

  return data.map(o => {
    const sc    = STAGE_COL[o.stage] || 'var(--dim2)';
    const href  = (STAGE_HREF[o.stage] || 'index') + '.html';
    const rem2  = calcRem(o);
    const paid2 = parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;
    const nm    = o.product || (o.products || []).map(p => p.name + '×' + p.qty).join(' + ') || '—';
    const isLate = o.stage !== 'archived' && o.deadline && new Date(o.deadline) < new Date();
    return `<div class="ord-row" style="margin-bottom:8px;border-radius:var(--rad);overflow:hidden">
      <div onclick="location.href='${href}'" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--rad)">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
              <span style="font-size:var(--fs-xs);font-weight:var(--fw-bold);padding:2px 7px;border-radius:20px;background:${sc}15;color:${sc}">${STAGE_AR[o.stage] || o.stage}</span>
              ${isLate ? '<span style="font-size:var(--fs-xs);color:var(--r);font-weight:var(--fw-extra)">⚠️ متأخر</span>' : ''}
            </div>
            <div class="txt-bold-md">${nm}</div>
            <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:2px">${o.orderId || o._id.slice(-6)} · ${o.createdDate || '—'}</div>
            ${o.deadline ? `<div style="font-size:var(--fs-xs);color:${isLate ? 'var(--r)' : 'var(--dim2)'};margin-top:1px">📅 ${o.deadline}</div>` : ''}
          </div>
          <div style="text-align:left;margin-right:8px;flex-shrink:0">
            ${canSee('price_sale') && parseFloat(o.salePrice) > 0 ? `<div style="font-size:var(--fs-lg);font-weight:var(--fw-heavy);color:var(--b)">${fn(parseFloat(o.salePrice))} ج</div>` : ''}
            ${canSee('price_paid') && paid2 > 0 ? `<div style="font-size:var(--fs-sm);color:var(--g);font-weight:var(--fw-bold)">محصّل: ${fn(paid2)} ج</div>` : ''}
            ${canSee('price_remaining') && rem2 > 0 ? `<div style="font-size:var(--fs-base);color:var(--r);font-weight:var(--fw-heavy)">باقي: ${fn(rem2)} ج</div>` : ''}
            ${canSee('price_remaining') && rem2 <= 0 && paid2 > 0 ? `<div style="font-size:var(--fs-sm);color:var(--g);font-weight:var(--fw-extra)">✅ مكتمل</div>` : ''}
          </div>
        </div>
        ${canSee('price_sale') && parseFloat(o.salePrice) > 0 ? `<div style="height:4px;background:var(--bg3);margin-top:-1px"><div style="height:100%;width:${Math.min(100, paid2 / parseFloat(o.salePrice) * 100)}%;background:${rem2 <= 0 ? 'var(--g)' : paid2 > 0 ? 'var(--b)' : 'var(--line)'}"></div></div>` : ''}
      </div>
      <div style="display:flex;gap:6px;padding:6px 8px;background:var(--bg2);border:1px solid var(--line);border-top:0;border-radius:0 0 10px 10px;flex-wrap:wrap">
        <a href="waybill.html?id=${o._id}" target="_blank" onclick="event.stopPropagation()" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(59,158,255,.3);background:rgba(59,158,255,.08);color:var(--b);font-size:var(--fs-xs);font-weight:var(--fw-extra);text-decoration:none">🧾 البوليصة</a>
        <button type="button" onclick="event.stopPropagation();shareOrderToInbox('${o._id}')" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(0,168,132,.3);background:rgba(0,168,132,.08);color:var(--g-mint);font-size:var(--fs-xs);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit">📤 إرسال</button>
        <button type="button" onclick="event.stopPropagation();openOrderCommentsFromHere('${o._id}')" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(167,139,250,.3);background:rgba(167,139,250,.08);color:var(--p);font-size:var(--fs-xs);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit">💬 تعليقات</button>
        ${['shipping', 'archived'].includes(o.stage) && !o.hasReturn ? `<a href="returns.html?newTicket=${o._id}" onclick="event.stopPropagation()" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,170,0,.3);background:rgba(255,170,0,.08);color:var(--y);font-size:var(--fs-xs);font-weight:var(--fw-extra);text-decoration:none">↩️ مرتجع</a>` : ''}
        ${o.hasReturn ? `<a href="returns.html" onclick="event.stopPropagation()" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,61,110,.3);background:rgba(255,61,110,.08);color:var(--r);font-size:var(--fs-xs);font-weight:var(--fw-extra);text-decoration:none">↩️ له مرتجع</a>` : ''}
      </div>
    </div>`;
  }).join('');
}

/**
 * bizCardTabHTML(client) → HTML string for the business-card tab in
 * the client panel. The whole tab is a static template populated from
 * `client.businessCard`. All controls call `window.*` action handlers
 * defined in clients.html (bizCardSmartPaste / saveBizCard / etc.).
 *
 * The caller is responsible for setting `window._bizCardClientId` before
 * mounting the HTML, since the action handlers rely on it. The wrapper
 * in clients.html (`renderBizCardTab`) does both.
 *
 * Internally composes bcSection/bcInput/bcTextarea from this module.
 */
export function bizCardTabHTML(client) {
  const c  = client || {};
  const bc = c.businessCard || {};
  const updatedTxt = bc.updatedAt
    ? new Date(bc.updatedAt.seconds * 1000).toLocaleDateString('ar-EG')
    : '';
  return `
    <!-- Smart Paste -->
    <div style="background:linear-gradient(135deg,rgba(168,85,247,.1),rgba(6,182,212,.05));border:1px solid rgba(168,85,247,.3);border-radius:12px;padding:var(--space-md);margin-bottom:14px">
      <div style="font-size:var(--fs-base);font-weight:var(--fw-heavy);color:#a855f7;margin-bottom:6px">🧠 لزق ذكي — Smart Paste</div>
      <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:8px;line-height:var(--lh-base)">الصق هنا أي نص فيه بيانات العميل (من واتساب، إيميل، نص حر) وضغطة "استخرج" تملأ كل الحقول تلقائياً.</div>
      <textarea id="bc-paste-area" placeholder="مثال: ايمن شوق المشد&#10;المستشار&#10;للمحاماة والاستشارات القانونية&#10;Ayman Shawky Al-Mashad&#10;Law Firm and Legal Consultations&#10;01022662220&#10;Aymanshawkylawfirm@gmail.com&#10;كمبوند فاليو 2 - القاهرة الجديدة" style="width:100%;background:var(--bg3);border:1px solid rgba(168,85,247,.3);border-radius:8px;padding:10px;color:var(--snow);font-family:inherit;font-size:var(--fs-base);outline:none;min-height:90px;resize:vertical"></textarea>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button type="button" class="btn btn-p btn-sm" onclick="window.bizCardSmartPaste()" style="flex:1">🧠 استخرج البيانات</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('bc-paste-area').value=''" title="مسح">✕</button>
      </div>
      <div id="bc-paste-result" style="font-size:var(--fs-xs);color:var(--g);margin-top:6px;min-height:14px"></div>
    </div>

    ${bcSection('📝 الهوية',
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${bcInput('prefix','اللقب','د. / م. / أ. / المستشار',bc.prefix)}
        ${bcInput('nickname','اسم مختصر','أبو محمد',bc.nickname)}
      </div>
      ${bcInput('name-ar','الاسم الكامل (عربي)','الاسم بالعربي',bc.nameAr)}
      ${bcInput('name-en','Full Name (English)','Name in English',bc.nameEn)}`
    )}

    ${bcSection('💼 المهنة والشركة',
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${bcInput('job-ar','المسمى الوظيفي (AR)','المستشار / محامي',bc.jobTitleAr)}
        ${bcInput('job-en','Job Title (EN)','Legal Consultant',bc.jobTitleEn)}
      </div>
      ${bcInput('company-ar','اسم الشركة (AR)','للمحاماة والاستشارات القانونية',bc.companyAr)}
      ${bcInput('company-en','Company Name (EN)','Law Firm and Legal Consultations',bc.companyEn)}
      ${bcInput('biz-type','نوع النشاط','محاماة / طب / مطعم / مهندس',bc.businessType)}`
    )}

    ${bcSection('📞 وسائل التواصل',
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${bcInput('office-phone','تليفون مكتب','011xxxxxxxx',bc.officePhone,'tel')}
        ${bcInput('mobile-phone','موبايل','01xxxxxxxxx',bc.mobilePhone,'tel')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${bcInput('whatsapp','واتساب (لو مختلف)','01xxxxxxxxx',bc.whatsapp,'tel')}
        ${bcInput('fax','فاكس (اختياري)','',bc.fax,'tel')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${bcInput('email','إيميل','example@gmail.com',bc.email,'email')}
        ${bcInput('email-2','إيميل بديل','',bc.email2,'email')}
      </div>
      ${bcInput('website','الموقع الإلكتروني','https://example.com',bc.website,'url')}`
    )}

    ${bcSection('📍 العنوان',
      `${bcTextarea('address-ar','العنوان (AR)','العنوان الكامل بالعربي',bc.addressAr)}
      ${bcTextarea('address-en','Address (EN)','Address in English',bc.addressEn)}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
        ${bcInput('city','المدينة/الحي','القاهرة الجديدة',bc.city)}
        ${bcInput('gov','المحافظة','القاهرة',bc.gov)}
        ${bcInput('country','الدولة','مصر',bc.country)}
      </div>
      ${bcInput('maps-link','رابط Google Maps','https://maps.app.goo.gl/...',bc.mapsLink,'url')}`
    )}

    ${bcSection('🌐 السوشيال ميديا',
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${bcInput('fb','Facebook','facebook.com/...',bc.facebook,'url')}
        ${bcInput('ig','Instagram','instagram.com/...',bc.instagram,'url')}
        ${bcInput('tw','Twitter / X','x.com/...',bc.twitter,'url')}
        ${bcInput('linkedin','LinkedIn','linkedin.com/in/...',bc.linkedin,'url')}
        ${bcInput('tiktok','TikTok','tiktok.com/@...',bc.tiktok,'url')}
        ${bcInput('yt','YouTube','youtube.com/@...',bc.youtube,'url')}
        ${bcInput('snap','Snapchat','snapchat.com/add/...',bc.snapchat,'url')}
        ${bcInput('telegram','Telegram','t.me/...',bc.telegram,'url')}
      </div>`
    )}

    ${bcSection('⏰ ساعات العمل',
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${bcInput('hours-week','أيام الأسبوع','9 ص - 5 م',bc.hoursWeek)}
        ${bcInput('hours-weekend','الإجازات','مغلق / 10 ص - 2 م',bc.hoursWeekend)}
      </div>
      ${bcInput('closed-days','أيام الإغلاق','الجمعة',bc.closedDays)}`
    )}

    ${bcSection('🎨 الهوية البصرية',
      `${bcInput('logo-url','رابط اللوجو','https://...',bc.logoUrl,'url')}
      ${bc.logoUrl ? `<div style="margin-bottom:8px"><img src="${bc.logoUrl}" loading="lazy" decoding="async" alt="logo" style="max-width:120px;max-height:80px;border-radius:8px;border:1px solid var(--line);background:#fff;padding:var(--space-xs)"></div>` : ''}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        ${bcInput('color-1','اللون الأساسي','#000000',bc.color1)}
        ${bcInput('color-2','اللون الثاني','#ffffff',bc.color2)}
        ${bcInput('color-3','اللون الثالث','',bc.color3)}
      </div>
      ${bcInput('fonts','الخطوط المفضلة','Cairo / Tajawal',bc.fonts)}`
    )}

    ${bcSection('📅 تواريخ مهمة',
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${bcInput('founded','تاريخ التأسيس','',bc.founded,'date')}
        ${bcInput('birthday','يوم الميلاد','',bc.birthday,'date')}
      </div>
      ${bcInput('anniversary','مناسبة سنوية','',bc.anniversary,'date')}`
    )}

    ${bcSection('🎯 تفضيلات التصميم',
      `<div style="margin-bottom:8px">
        <label style="display:block;font-size:var(--fs-xs);font-weight:var(--fw-bold);color:var(--dim2);margin-bottom:3px">الأسلوب المفضل</label>
        <select id="bc-style" style="width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--snow);font-family:inherit;font-size:var(--fs-base);outline:none">
          <option value="">— اختر —</option>
          <option value="classic" ${bc.style==='classic'?'selected':''}>كلاسيكي</option>
          <option value="modern" ${bc.style==='modern'?'selected':''}>مودرن</option>
          <option value="minimal" ${bc.style==='minimal'?'selected':''}>بسيط/ميني-ميل</option>
          <option value="bold" ${bc.style==='bold'?'selected':''}>جريء/Bold</option>
          <option value="elegant" ${bc.style==='elegant'?'selected':''}>أنيق/Elegant</option>
          <option value="playful" ${bc.style==='playful'?'selected':''}>مرح/Playful</option>
        </select>
      </div>
      ${bcInput('avoid-colors','ألوان لا يفضلها','',bc.avoidColors)}
      ${bcTextarea('design-notes','ملاحظات إضافية للمصمم','أي تفاصيل خاصة، تفضيلات، أو متطلبات...',bc.designNotes)}`
    )}

    <!-- Actions -->
    <div style="display:flex;gap:6px;margin-top:14px;padding-top:14px;border-top:1px solid var(--line);position:sticky;bottom:0;background:var(--bg);padding-bottom:10px">
      <button type="button" class="btn btn-g" onclick="window.saveBizCard()" style="flex:1">💾 حفظ</button>
      <button type="button" class="btn btn-b" onclick="window.applyBizCardToNewOrder()">🚀 طبّق على أوردر جديد</button>
      <button type="button" class="btn btn-ghost" onclick="window.exportBizCardText()" title="تصدير نص">📋</button>
    </div>
    ${updatedTxt ? `<div style="font-size:var(--fs-xs);color:var(--dim2);text-align:center;margin-top:6px">آخر تحديث: ${updatedTxt}</div>` : ''}
  `;
}

/**
 * clientCardHTML(client, idx, ctx) — يبني كرت عميل واحد في الـ grid.
 * Pure function — does all derivation (rem/active/lastTs/pills/health)
 * internally so the caller only loops.
 *
 * ctx = {
 *   color,            // background color for the card
 *   getOrders,        // (client) -> orders[]
 *   calcRem,          // (order) -> number
 *   fn,               // number formatter
 *   countOpenReminders, // (clientId) -> number
 *   getSegment,       // (clientId) -> segment | null
 *   SEG_STYLE,        // segment label-color map
 *   TAG_LABELS,       // tag-name → display label map
 *   nowMs, nowSec,    // pre-computed time refs (caller computes once)
 * }
 *
 * canSee() is read from window (compat field permissions — global per RULE 8).
 */
export function clientCardHTML(client, idx, ctx = {}) {
  const c = client || {};
  const {
    color,
    getOrders = () => [],
    calcRem = () => 0,
    fn = (n) => String(parseFloat(n) || 0),
    countOpenReminders = () => 0,
    getSegment = () => null,
    SEG_STYLE = {},
    TAG_LABELS = {},
    nowMs = Date.now(),
    nowSec = Date.now() / 1000,
  } = ctx;
  const canSee = (typeof window !== 'undefined' && window.canSee)
    ? window.canSee : () => true;

  const cOrds = getOrders(c);
  let rem = 0, active = 0, hasLate = false, lastTs = 0;
  for (const o of cOrds) {
    rem += calcRem(o);
    if (o.stage !== 'archived') {
      active++;
      if (o.deadline && new Date(o.deadline).getTime() < nowMs) hasLate = true;
    }
    const t = o.createdAt?.seconds || 0;
    if (t > lastTs) lastTs = t;
  }
  const tags = c.tags || [];
  const daysSince = lastTs ? Math.floor((nowSec - lastTs) / 86400) : null;
  const isVip      = cOrds.length >= 3;
  const isInactive = daysSince !== null && daysSince >= 90;
  const atRisk     = daysSince !== null && daysSince >= 30 && daysSince < 90;
  const isNew      = cOrds.length === 0 ||
                     (c.createdAt?.seconds && (Date.now() / 1000 - c.createdAt.seconds) < 7 * 86400);
  const openReminders = countOpenReminders(c._id);

  // Status pills
  const pills = [];
  if (openReminders > 0) pills.push(`<span class="cs-pill purple">⏰ ${openReminders} متابعة</span>`);
  if (hasLate) pills.push(`<span class="cs-pill danger">⚠️ متأخر</span>`);
  if (rem > 0) pills.push(`<span class="cs-pill danger">💰 ${fn(rem)} ج</span>`);
  if (isVip && !hasLate && rem <= 0) pills.push(`<span class="cs-pill gold">⭐ VIP</span>`);
  if (atRisk) pills.push(`<span class="cs-pill warning">⚠️ يحتاج اهتمام</span>`);
  if (isInactive) pills.push(`<span class="cs-pill grey">😴 نايم ${daysSince}ي</span>`);
  if (isNew && !isVip && !atRisk && !isInactive) pills.push(`<span class="cs-pill success">🌱 جديد</span>`);

  // RFM segment chip
  const seg = getSegment(c._id);
  if (seg && seg.segment && seg.segment !== 'normal') {
    const st = SEG_STYLE[seg.segment] || SEG_STYLE.normal || { bg: 'var(--bg3)', fg: 'var(--dim2)' };
    const riskTxt = (seg.churnRisk >= 60) ? ` · ${seg.churnRisk}%` : '';
    pills.push(`<span title="RFM: ${seg.rfmCode || ''} · ${seg.recencyDays}d منذ آخر طلب" style="font-size:10.5px;padding:4px 10px;border-radius:99px;background:${st.bg};color:${st.fg};font-weight:var(--fw-extra);border:1px solid ${st.fg}30">${seg.segmentIco || '•'} ${seg.segmentLabel || seg.segment}${riskTxt}</span>`);
  }
  if (tags.length && pills.length === 0) pills.push(`<span class="cs-pill info">${TAG_LABELS[tags[0]] || tags[0]}</span>`);

  // Customer Health Score
  let health = { dot: 'green', txt: 'نشط جداً' };
  if (hasLate || rem > 1000)                  health = { dot: 'red',    txt: 'يحتاج تدخل' };
  else if (atRisk)                            health = { dot: 'yellow', txt: `آخر طلب قبل ${daysSince}ي` };
  else if (isInactive)                        health = { dot: 'grey',   txt: `بدون نشاط ${daysSince}ي` };
  else if (isVip)                             health = { dot: 'green',  txt: '⭐ من المميزين' };
  else if (daysSince !== null && daysSince < 7) health = { dot: 'green',txt: 'تواصل حديث' };
  else if (daysSince !== null)                health = { dot: 'green',  txt: `نشط · قبل ${daysSince}ي` };
  else                                        health = { dot: 'grey',   txt: 'لا توجد طلبات' };

  const avBg = `linear-gradient(135deg,${color},${color}99)`;
  return `<div class="cc" style="--cc:${color}" onclick="openClient('${c._id}')">
      <div style="display:flex;gap:11px;align-items:center;margin-bottom:${pills.length ? '10' : '12'}px">
        <div class="cc-av" style="background:${avBg}">${(c.name || '?')[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="cc-name">${c.name || '—'} ${c.intlPhone && canSee('client_phone') ? `<span title="${c.intlPhone}" style="font-size:var(--fs-sm);color:var(--y-amber);margin-right:4px">🌍</span>` : ''}</div>
          <div class="cc-phone">${canSee('client_phone') ? `📞 ${c.phone1 || '—'}` : ''}${c.job ? (canSee('client_phone') ? ' · ' : '') + c.job : ''}</div>
        </div>
        ${canSee('client_phone') && c.phone1 ? `<a href="https://wa.me/20${(c.phone1 || '').replace(/^0/, '')}" target="_blank" onclick="event.stopPropagation()" class="wa-btn">💬</a>` : ''}
      </div>
      ${pills.length ? `<div style="margin-bottom:10px;display:flex;gap:5px;flex-wrap:wrap">${pills.join('')}</div>` : ''}
      <div style="display:grid;grid-template-columns:${canSee('price_remaining') ? '1fr 1fr 1fr' : '1fr 1fr'};gap:6px">
        <div class="cc-stat">
          <div class="cc-stat-val" style="color:#3b82f6">${active || '—'}</div>
          <div class="cc-stat-lbl">نشط</div>
        </div>
        <div class="cc-stat">
          <div class="cc-stat-val" style="color:var(--o-purple)">${cOrds.length}</div>
          <div class="cc-stat-lbl">إجمالي</div>
        </div>
        ${canSee('price_remaining') ? `<div class="cc-stat">
          <div class="cc-stat-val" style="color:${rem > 0 ? 'var(--r)' : '#10d27e'};font-size:${rem > 0 && rem >= 10000 ? '12px' : rem > 0 ? '14px' : '18px'}">${rem > 0 ? fn(rem) : '✓'}</div>
          <div class="cc-stat-lbl">${rem > 0 ? 'باقي' : 'مسدد'}</div>
        </div>` : ''}
      </div>
      <div class="cc-health">
        <span class="cc-health-dot ${health.dot}"></span>
        <span>${health.txt}</span>
      </div>
    </div>`;
}

/**
 * clientListRowHTML(client, idx, ctx) — يبني صف عميل في الـ list view.
 * Pure function. ctx = { color, getOrders, calcRem, fn, TAG_LABELS, TAG_COL }.
 * canSee() read from window.
 */
export function clientListRowHTML(client, idx, ctx = {}) {
  const c = client || {};
  const {
    color,
    getOrders = () => [],
    calcRem = () => 0,
    fn = (n) => String(parseFloat(n) || 0),
    TAG_LABELS = {},
    TAG_COL = {},
  } = ctx;
  const canSee = (typeof window !== 'undefined' && window.canSee)
    ? window.canSee : () => true;

  const cOrds = getOrders(c);
  const tot   = cOrds.reduce((s, o) => s + (parseFloat(o.salePrice) || 0), 0);
  const paid2 = cOrds.reduce((s, o) => s + (parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0), 0);
  const rem   = cOrds.reduce((s, o) => s + (calcRem(o)), 0);
  const active = cOrds.filter(o => o.stage !== 'archived').length;
  const tags  = c.tags || [];

  return `<div class="list-row" onclick="openClient('${c._id}')">
      <div class="list-av" style="background:${color}18;color:${color}">${(c.name || '?')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="txt-bold-lg">${c.name || '—'}
          ${c.intlPhone && canSee('client_phone') ? `<span title="${c.intlPhone}" style="font-size:var(--fs-sm);color:var(--y);margin-right:4px">🌍</span>` : ''}
          ${tags.map(t => `<span class="tag" style="background:${TAG_COL[t] || 'var(--hover)'};font-size:var(--fs-tiny)">${TAG_LABELS[t] || t}</span>`).join('')}
        </div>
        <div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:2px">${canSee('client_phone') ? `📞 ${c.phone1 || '—'} ` : ''}${c.intlPhone && canSee('client_phone') ? `· 🌍 ${c.intlPhone} ` : ''}${c.job ? '· 💼 ' + c.job : ''} ${c.governorate ? '· 📍 ' + c.governorate : ''}</div>
      </div>
      <div style="display:flex;gap:var(--space-lg);align-items:center;flex-shrink:0">
        <div style="text-align:center">
          <div style="font-size:var(--fs-md);font-weight:var(--fw-extra);color:var(--b)">${active}</div>
          <div class="txt-meta-tiny">نشط</div>
        </div>
        ${canSee('price_sale') ? `<div style="text-align:center">
          <div style="font-size:var(--fs-md);font-weight:var(--fw-extra);color:var(--g)">${fn(tot)}</div>
          <div class="txt-meta-tiny">مبيعات ج</div>
        </div>` : ''}
        ${canSee('price_remaining') ? `<div style="text-align:center;min-width:60px">
          <div style="font-size:var(--fs-md);font-weight:var(--fw-extra);color:${rem > 0 ? 'var(--r)' : 'var(--g)'}">${rem > 0 ? fn(rem) : '✅'}</div>
          <div class="txt-meta-tiny">${rem > 0 ? 'باقي ج' : 'محصّل'}</div>
        </div>` : ''}
        ${canSee('client_phone') ? `<a href="https://wa.me/20${(c.phone1 || '').replace(/^0/, '')}" target="_blank" onclick="event.stopPropagation()" class="wa-btn">💬</a>` : ''}
      </div>
    </div>`;
}

/**
 * clientPanelHeaderHTML({client, color}) — يبني هيدر لوحة العميل
 * (الصورة الأولية + الاسم + التليفون + المهنة).
 */
export function clientPanelHeaderHTML({ client, color } = {}) {
  const c = client || {};
  const canSee = (typeof window !== 'undefined' && window.canSee)
    ? window.canSee : () => true;
  return `
    <div style="display:flex;align-items:center;gap:var(--space-md)">
      <div style="width:48px;height:48px;border-radius:50%;background:${color}18;color:${color};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:var(--fw-heavy)">${(c.name || '?')[0]}</div>
      <div>
        <div style="font-size:var(--fs-xl);font-weight:var(--fw-extra)">${c.name} ${c.status === 'legacy' ? '<span style="font-size:var(--fs-xs);padding:2px 8px;border-radius:20px;background:rgba(150,150,170,.15);color:#aaa;font-weight:var(--fw-extra);margin-right:6px">📁 قديم</span>' : ''}</div>
        <div class="txt-meta-sm">${canSee('client_phone') ? (c.phone1 || '') : ''} ${c.job ? '· ' + c.job : ''}</div>
      </div>
    </div>`;
}

/**
 * clientPanelBodyHTML(ctx) — يبني محتوى لوحة العميل بكامل التبويبات.
 * pure function: ياخد الـ derived data + الـ sub-renderers via ctx.
 *
 * ctx = {
 *   client, id,
 *   cOrds, activeOrds, lateOrds,
 *   tot, paid, rem, pct,
 *   totalCost, totalProfit, profitPct,
 *   memberDays, daysSince,
 *   byWallet,            // {walletName: amount}
 *   tags,
 *   lastFuLine,          // pre-built HTML or ''
 *   segments,            // Map<clientId, segment>
 *   SEG_STYLE, FU_TYPES, FU_OUTCOMES, TAG_LABELS, TAG_COL,
 *   // sub-renderers (already on window from prior PRs):
 *   renderClientFollowups, renderPanelOrders, renderBizCardTab,
 *   // pure helpers (already on window from PR-1):
 *   fn, pRow, fmtOccasion,
 * }
 */
export function clientPanelBodyHTML(ctx = {}) {
  const {
    client = {}, id,
    cOrds = [], activeOrds = [], lateOrds = [],
    tot = 0, paid = 0, rem = 0, pct = 0,
    totalCost = 0, totalProfit = 0, profitPct = null,
    memberDays = null, daysSince = null,
    byWallet = {},
    tags = [],
    lastFuLine = '',
    segments,
    SEG_STYLE = {},
    TAG_LABELS = {}, TAG_COL = {},
    renderClientFollowups = () => '',
    renderPanelOrders = () => '',
    renderBizCardTab = () => '',
    fn: fmtNum = (n) => String(parseFloat(n) || 0),
    pRow: pRowHelper = (l, v) => `<div>${l}: ${v}</div>`,
    fmtOccasion: fmtOcc = (s) => s,
  } = ctx;
  const c = client;
  const canSee = (typeof window !== 'undefined' && window.canSee)
    ? window.canSee : () => true;

  // RFM segment block (IIFE preserved for behavior parity)
  const segBlock = (() => {
    const seg = segments?.get?.(c._id);
    if (!seg) return '';
    const st = SEG_STYLE[seg.segment] || SEG_STYLE.normal || { bg: 'var(--bg3)', fg: 'var(--dim2)' };
    const allClvs = segments
      ? Array.from(segments.values()).map(s => s.totalRevenue || 0).filter(v => v > 0).sort((a, b) => b - a)
      : [];
    const myClv = seg.totalRevenue || 0;
    let pctRank = null;
    if (myClv > 0 && allClvs.length > 0) {
      const rank = allClvs.findIndex(v => v <= myClv);
      pctRank = rank >= 0 ? Math.round((rank / allClvs.length) * 100) : 100;
    }
    const risk = seg.churnRisk || 0;
    const rColor = risk >= 70 ? 'var(--r)' : risk >= 40 ? 'var(--y)' : 'var(--g)';
    const rText  = risk >= 70 ? 'مرتفع 🚨' : risk >= 40 ? 'متوسط ⚠️' : 'منخفض ✓';
    return `<div style="background:linear-gradient(135deg,${st.bg},var(--row-hover));border:1px solid ${st.fg}40;border-right:3px solid ${st.fg};border-radius:var(--rad);padding:var(--space-md);margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:var(--fs-md);font-weight:var(--fw-heavy);color:${st.fg}">${seg.segmentIco || '•'} ${seg.segmentLabel || seg.segment}</span>
          <span style="font-size:var(--fs-xs);color:var(--dim2);font-family:monospace;background:var(--bg3);padding:3px 8px;border-radius:6px" title="RFM Code (Recency · Frequency · Monetary)">RFM: ${seg.rfmCode || '—'}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">
          <div style="background:var(--bg3);border-radius:6px;padding:6px 8px;text-align:center">
            <div style="font-size:var(--fs-tiny);color:var(--dim2);margin-bottom:2px">آخر شراء</div>
            <div style="font-size:var(--fs-md);font-weight:var(--fw-extra);color:var(--snow)">${seg.recencyDays ?? '—'} <span style="font-size:var(--fs-tiny);color:var(--dim2);font-weight:var(--fw-semi)">يوم</span></div>
          </div>
          <div style="background:var(--bg3);border-radius:6px;padding:6px 8px;text-align:center">
            <div style="font-size:var(--fs-tiny);color:var(--dim2);margin-bottom:2px">عدد الأوردرات</div>
            <div style="font-size:var(--fs-md);font-weight:var(--fw-extra);color:var(--snow)">${seg.orderCount ?? '—'}</div>
          </div>
          <div style="background:var(--bg3);border-radius:6px;padding:6px 8px;text-align:center">
            <div style="font-size:var(--fs-tiny);color:var(--dim2);margin-bottom:2px">CLV</div>
            <div style="font-size:var(--fs-md);font-weight:var(--fw-extra);color:var(--g)">${fmtNum(myClv)} <span style="font-size:var(--fs-tiny);color:var(--dim2);font-weight:var(--fw-semi)">ج</span></div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--fs-sm)">
          ${pctRank !== null ? `<span style="color:var(--dim2)">🏆 ضمن أعلى <b style="color:${pctRank <= 10 ? 'var(--y)' : pctRank <= 25 ? 'var(--b)' : 'var(--snow)'}">${pctRank || 1}%</b> من العملاء</span>` : '<span></span>'}
          <span style="color:var(--dim2)">احتمال الفقد: <b style="color:${rColor}">${rText}${risk ? ' ' + risk + '%' : ''}</b></span>
        </div>
      </div>`;
  })();

  return `
    <!-- ── ملخص ── -->
    <div id="ptab-pane-summary" style="display:block">
      <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-bottom:16px">
        ${canSee('client_phone') ? `<a href="tel:${c.phone1}" class="qact">📞 اتصال</a>` : ''}
        ${canSee('client_phone') ? `<a href="https://wa.me/20${(c.phone1 || '').replace(/^0/, '')}" target="_blank" class="qact">💬 واتساب</a>` : ''}
        ${canSee('client_phone') ? `<a href="https://wa.me/20${(c.phone1 || '').replace(/^0/, '')}?text=${encodeURIComponent('أهلاً ' + c.name + ' 👋، طلبك جاهز 🎉')}" target="_blank" class="qact">📨 رسالة</a>` : ''}
        ${canSee('client_phone') && c.intlPhone ? `<a href="tel:${c.intlPhone}" class="qact" style="background:rgba(255,170,0,.12);color:var(--y);border-color:rgba(255,170,0,.3)">🌍 اتصال دولي</a>` : ''}
        ${canSee('client_phone') && c.intlPhone ? `<a href="https://wa.me/${c.intlPhone.replace(/[^\d]/g, '')}" target="_blank" class="qact" style="background:rgba(255,170,0,.12);color:var(--y);border-color:rgba(255,170,0,.3)">🌍 واتساب دولي</a>` : ''}
        <a href="javascript:void(0)" class="qact" onclick="openFollowupModal('${id}')" style="background:rgba(167,139,250,.12);color:var(--p);border-color:rgba(167,139,250,.3)">📞 سجّل متابعة</a>
        ${cOrds.length > 0 ? `<a href="javascript:void(0)" class="qact" onclick="reorderLastOrder('${id}')" style="background:rgba(0,217,126,.12);color:var(--g);border-color:rgba(0,217,126,.3)" title="نسخ المنتجات والكميات من آخر أوردر — التصميم يبدأ جديد">🔁 كرّر آخر أوردر</a>` : ''}
      </div>
      ${lastFuLine}
      ${segBlock}
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-sm);margin-bottom:16px">
        <div onclick="filterPanelOrders('all')" style="background:var(--bg2);border:1.5px solid var(--line);border-radius:12px;padding:12px 8px;text-align:center;cursor:pointer;transition:var(--trans)">
          <div style="font-size:20px;font-weight:var(--fw-heavy);color:var(--b)">${cOrds.length}</div>
          <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-top:2px">كل الأوردرات</div>
        </div>
        <div onclick="filterPanelOrders('active')" style="background:var(--bg2);border:1.5px solid var(--line);border-radius:12px;padding:12px 8px;text-align:center;cursor:pointer;transition:var(--trans)">
          <div style="font-size:20px;font-weight:var(--fw-heavy);color:var(--g)">${activeOrds.length}</div>
          <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-top:2px">🔄 نشط</div>
        </div>
        <div onclick="filterPanelOrders('rem')" style="background:${rem > 0 ? 'rgba(255,61,110,.08)' : 'var(--bg2)'};border:1.5px solid ${rem > 0 ? 'rgba(255,61,110,.3)' : 'var(--line)'};border-radius:12px;padding:12px 8px;text-align:center;cursor:pointer;transition:var(--trans)">
          <div style="font-size:20px;font-weight:var(--fw-heavy);color:${rem > 0 ? 'var(--r)' : 'var(--g)'};">${rem > 0 ? fmtNum(rem) : '✅'}</div>
          <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-top:2px">💰 باقي ج</div>
        </div>
        <div onclick="filterPanelOrders('late')" style="background:${lateOrds.length ? 'rgba(255,61,110,.08)' : 'var(--bg2)'};border:1.5px solid ${lateOrds.length ? 'rgba(255,61,110,.3)' : 'var(--line)'};border-radius:12px;padding:12px 8px;text-align:center;cursor:pointer;transition:var(--trans)">
          <div style="font-size:20px;font-weight:var(--fw-heavy);color:${lateOrds.length ? 'var(--r)' : 'var(--dim2)'};">${lateOrds.length || '—'}</div>
          <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-top:2px">⚠️ متأخر</div>
        </div>
      </div>
      ${tot > 0 ? `<div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);color:var(--dim2);margin-bottom:4px">
          <span>التحصيل</span><span>${Math.round(pct)}% — محصّل ${fmtNum(paid)} من ${fmtNum(tot)} ج</span>
        </div>
        <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${pct >= 100 ? 'var(--g)' : pct > 50 ? 'var(--b)' : 'var(--y)'};border-radius:4px;transition:width .4s"></div>
        </div>
      </div>` : ''}
      ${(totalCost > 0 || Object.keys(byWallet).length > 0 || memberDays !== null) ? `
      <div style="background:rgba(59,158,255,.04);border:1px solid rgba(59,158,255,.15);border-radius:var(--rad);padding:var(--space-md)">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--b);margin-bottom:10px">💼 حياته في الشركة</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-sm);margin-bottom:${Object.keys(byWallet).length ? '10' : '0'}px">
          ${memberDays !== null ? pRowHelper('📅 عميل منذ', memberDays + ' يوم') : ''}
          ${pRowHelper('📦 إجمالي الأوردرات', cOrds.length + ' أوردر')}
          ${pRowHelper('💵 إجمالي المبيعات', fmtNum(tot) + ' ج')}
          ${totalCost > 0 ? pRowHelper('🔴 التكلفة الإجمالية', fmtNum(totalCost) + ' ج') : ''}
          ${totalCost > 0 ? pRowHelper('🟢 إجمالي الربح', fmtNum(totalProfit) + ' ج' + (profitPct !== null ? ' (' + profitPct + '%)' : '')) : ''}
        </div>
        ${Object.keys(byWallet).length ? `
        <div style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:6px">💳 توزيع المدفوعات على المحافظ</div>
        <div style="display:flex;flex-direction:column;gap:var(--space-xs)">
          ${Object.entries(byWallet).sort((a, b) => b[1] - a[1]).map(([wn, amt]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--bg3);border-radius:6px">
            <span class="txt-meta-sm">${wn}</span>
            <span style="font-size:var(--fs-base);font-weight:var(--fw-extra);color:var(--g)">${fmtNum(amt)} ج</span>
          </div>`).join('')}
        </div>` : ''}
      </div>` : ''}
    </div>

    <!-- ── متابعات ── -->
    <div id="ptab-pane-followups" class="hide">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:var(--fs-base);font-weight:var(--fw-extra);color:var(--dim2)">📞 سجل المتابعة</div>
        <button type="button" class="btn btn-b btn-sm" onclick="openFollowupModal('${id}')">＋ متابعة جديدة</button>
      </div>
      <div id="panel-followups-list">${renderClientFollowups(id)}</div>
    </div>

    <!-- ── أوردرات ── -->
    <div id="ptab-pane-orders" class="hide">
      <div id="panel-orders-list">
        ${renderPanelOrders(cOrds, 'all')}
      </div>
    </div>

    <!-- ── 📇 بطاقة الأعمال ── -->
    <div id="ptab-pane-bizcard" class="hide">
      ${renderBizCardTab(c)}
    </div>

    <!-- ── بيانات ── -->
    <div id="ptab-pane-data" class="hide">
      <div style="margin-bottom:14px">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--dim2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">📋 بيانات العميل</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-sm)">
          ${canSee('client_phone') ? pRowHelper('📞 هاتف', c.phone1 || '—') : ''}
          ${canSee('client_phone') && c.phone2 ? pRowHelper('📞 هاتف 2', c.phone2) : ''}
          ${canSee('client_phone') && c.intlPhone ? pRowHelper('🌍 رقم دولي', c.intlPhone) : ''}
          ${c.governorate ? pRowHelper('📍 العنوان', c.governorate + (c.city ? ' · ' + c.city : '')) : ''}
          ${c.source ? pRowHelper('📣 المصدر', c.source) : ''}
          ${c.job ? pRowHelper('💼 المهنة', c.job) : ''}
          ${c.email ? pRowHelper('📧 إيميل', c.email) : ''}
          ${c.birthday ? pRowHelper('🎂 الميلاد', fmtOcc(c.birthday)) : ''}
          ${c.anniversary ? pRowHelper('🏢 تأسيس النشاط', fmtOcc(c.anniversary)) : ''}
          ${daysSince !== null ? pRowHelper('🕐 آخر نشاط', 'منذ ' + daysSince + ' يوم') : ''}
        </div>
        ${tags.length ? `<div style="margin-top:8px;display:flex;gap:var(--space-xs);flex-wrap:wrap">${tags.map(t => `<span class="tag" style="background:${TAG_COL[t] || 'var(--hover)'}">${TAG_LABELS[t] || t}</span>`).join('')}</div>` : ''}
        ${c.notes ? `<div style="margin-top:8px;padding:var(--space-sm);background:var(--bg3);border-radius:var(--rad);font-size:var(--fs-base);color:var(--dim2)">📝 ${c.notes}</div>` : ''}
        ${c.internalNotes ? `<div style="margin-top:8px;padding:10px 12px;background:rgba(255,61,110,.06);border:1px solid rgba(255,61,110,.2);border-right:3px solid var(--r);border-radius:var(--rad);font-size:var(--fs-base);color:var(--snow);line-height:var(--lh-relaxed)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:var(--space-sm)">
            <span style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:var(--r)">🔒 ملاحظات داخلية</span>
            ${c.internalNotesLastEdit ? `<span style="font-size:var(--fs-tiny);color:var(--dim2);font-weight:var(--fw-bold)">${c.internalNotesLastEdit.byName || ''}${c.internalNotesLastEdit.at?.toDate ? ' · ' + c.internalNotesLastEdit.at.toDate().toLocaleDateString('ar-EG') : ''}</span>` : ''}
          </div>
          <div style="white-space:pre-wrap">${c.internalNotes.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch])}</div>
        </div>` : ''}
      </div>
      ${c.status === 'legacy' ? `
      <div style="margin-bottom:14px;background:rgba(150,150,170,.06);border:1px solid rgba(150,150,170,.2);border-radius:var(--rad);padding:var(--space-md)">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:#aaa;margin-bottom:10px">📁 بيانات العميل القديم</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-sm)">
          ${c.totalSpentLegacy > 0 ? pRowHelper('💰 إجمالي الإنفاق', fmtNum(c.totalSpentLegacy) + ' ج') : ''}
          ${c.lastOrderDateLegacy ? pRowHelper('📅 آخر طلب', c.lastOrderDateLegacy) : ''}
          ${c.legacyProjects ? pRowHelper('📦 مشاريع سابقة', c.legacyProjects) : ''}
        </div>
        ${c.legacyNotes ? `<div style="margin-top:8px;padding:var(--space-sm);background:var(--bg3);border-radius:var(--rad);font-size:var(--fs-base);color:var(--dim2)">📝 ${c.legacyNotes}</div>` : ''}
      </div>` : ''}
      <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--line)">
        <button type="button" class="btn btn-ghost btn-sm" onclick="editClient('${id}')">✏️ تعديل</button>
        ${c.status === 'legacy' ? `<button type="button" class="btn btn-g btn-sm" onclick="window.convertToActive('${id}')">🟢 تحويل لنشط</button>` : ''}
        <button type="button" class="btn btn-danger btn-sm" onclick="deleteClient('${id}')" style="margin-right:auto">🗑 حذف</button>
      </div>
    </div>`;
}

/**
 * segmentStripHTML({clients, segments, currentSeg, SEG_STYLE, fn})
 *   → HTML string for the RFM-segment counts strip, or '' if nothing
 *     to show (caller hides the container in that case).
 *
 * Pure: no DOM writes, no closure capture.
 */
export function segmentStripHTML({
  clients = [],
  segments,
  currentSeg = '',
  SEG_STYLE = {},
  fn: fmtNum = (n) => String(parseFloat(n) || 0),
} = {}) {
  if (!segments || segments.size === 0) return '';
  const counts = {};
  let totalClv = 0;
  for (const c of clients) {
    if (c.status === 'legacy') continue;
    const seg = segments.get(c._id);
    if (!seg) continue;
    counts[seg.segment] = (counts[seg.segment] || 0) + 1;
    totalClv += (seg.totalRevenue || 0);
  }
  const order  = ['champion','cant_lose','loyal','new','needs_attention','at_risk','about_to_sleep','lost'];
  const labels = {
    champion:        '🏆 أبطال',
    cant_lose:       '🚨 لا يجب فقدهم',
    loyal:           '💎 أوفياء',
    new:             '🌱 جدد',
    needs_attention: '👀 يحتاجون اهتمام',
    at_risk:         '⚠️ مهدّدون',
    about_to_sleep:  '😴 على وشك الفقد',
    lost:            '💤 فُقدوا',
  };
  const visible = order.filter(s => (counts[s] || 0) > 0);
  if (visible.length === 0) return '';

  return `
    <div style="background:rgba(167,139,250,.06);border:1px solid rgba(167,139,250,.2);border-radius:var(--rad2);padding:10px 12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--p)">📊 توزيع العملاء حسب الشريحة (RFM)</div>
        <div class="txt-meta-sm">إجمالي CLV: <b style="color:var(--g)">${fmtNum(totalClv)} ج</b></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${visible.map(s => {
          const st = SEG_STYLE[s] || SEG_STYLE.normal || { bg: 'var(--bg3)', fg: 'var(--dim2)' };
          const active = currentSeg === s;
          return `<button type="button" onclick="filterBySegment('${active ? '' : s}')" style="padding:5px 10px;border-radius:20px;border:1.5px solid ${active ? st.fg : st.fg + '40'};background:${active ? st.fg + '25' : st.bg};color:${st.fg};font-size:var(--fs-xs);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit;transition:var(--trans)">${labels[s] || s} <span style="background:${active ? 'var(--bg1)' : st.fg + '18'};padding:1px 6px;border-radius:var(--rad);margin-right:3px">${counts[s]}</span></button>`;
        }).join('')}
        ${currentSeg ? `<button type="button" onclick="filterBySegment('')" style="padding:5px 10px;border-radius:20px;border:1px solid var(--line);background:var(--bg3);color:var(--dim2);font-size:var(--fs-xs);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit">✕ مسح الفلتر</button>` : ''}
      </div>
    </div>`;
}

/**
 * prodOptsHTML(products) — يبني <option> tags لقائمة المنتجات.
 * Trivial — extracted for consistency with the other renderers.
 */
export function prodOptsHTML(products = []) {
  return '<option value="">— اختر المنتج —</option>' +
    (products || []).map(p =>
      `<option value="${p._id}" data-name="${(p.name || '').replace(/"/g, '')}" data-price="${p.defaultPrice || 0}">${p.name}</option>`
    ).join('');
}

/**
 * controlGridStatsHTML({data, calcRem, fn, selectedCount}) → HTML
 *
 * KPI cards above the admin control grid. Computes:
 *   - count, total revenue (sale + ship fee), paid, remaining,
 *     cost (sum of costItems[].total or totalCost), profit (paid - cost),
 *     selected (echoes input)
 *
 * Profit/cost KPIs render only when totalCost > 0.
 * Selected KPI renders only when selectedCount > 0.
 *
 * Pure — no DOM writes, no closure capture.
 */
export function controlGridStatsHTML({
  data = [],
  calcRem = () => 0,
  fn: fmtNum = (n) => String(parseFloat(n) || 0),
  selectedCount = 0,
} = {}) {
  const totalRev   = data.reduce((s, o) => s + (parseFloat(o.salePrice) || 0) + (parseFloat(o.customerShipFee) || 0), 0);
  const totalPaid  = data.reduce((s, o) => s + (parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0), 0);
  const totalRem   = data.reduce((s, o) => s + calcRem(o), 0);
  const totalCost  = data.reduce((s, o) => s + ((o.costItems || []).reduce((x, c) => x + (parseFloat(c.total) || 0), 0) || (parseFloat(o.totalCost) || 0)), 0);
  const totalProfit = data.reduce((s, o) => {
    const cost  = (o.costItems || []).reduce((x, c) => x + (parseFloat(c.total) || 0), 0) || (parseFloat(o.totalCost) || 0);
    const opaid = parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;
    return s + (opaid - cost);
  }, 0);

  return `
    <div class="cg-kpi">
      <div class="cg-kpi-val" style="color:var(--snow)">${data.length}</div>
      <div class="cg-kpi-lbl">📋 أوردر</div>
    </div>
    <div class="cg-kpi">
      <div class="cg-kpi-val" style="color:var(--b)">${fmtNum(totalRev)}</div>
      <div class="cg-kpi-lbl">💵 الإجمالي (ج)</div>
    </div>
    <div class="cg-kpi">
      <div class="cg-kpi-val" style="color:var(--g)">${fmtNum(totalPaid)}</div>
      <div class="cg-kpi-lbl">✅ المحصّل (ج)</div>
    </div>
    <div class="cg-kpi">
      <div class="cg-kpi-val" style="color:${totalRem > 0 ? 'var(--r)' : 'var(--dim2)'}">${fmtNum(totalRem)}</div>
      <div class="cg-kpi-lbl">⏳ المتبقي (ج)</div>
    </div>
    ${totalCost > 0 ? `
    <div class="cg-kpi">
      <div class="cg-kpi-val" style="color:var(--r)">${fmtNum(totalCost)}</div>
      <div class="cg-kpi-lbl">🔴 التكلفة (ج)</div>
    </div>
    <div class="cg-kpi">
      <div class="cg-kpi-val" style="color:${totalProfit >= 0 ? 'var(--g)' : 'var(--r)'}">${fmtNum(totalProfit)}</div>
      <div class="cg-kpi-lbl">🟢 الربح (ج)</div>
    </div>` : ''}
    ${selectedCount > 0 ? `
    <div class="cg-kpi" style="border-color:rgba(59,158,255,.4);background:rgba(59,158,255,.07)">
      <div class="cg-kpi-val" style="color:var(--b)">${selectedCount}</div>
      <div class="cg-kpi-lbl">☑ محدد</div>
    </div>` : ''}
  `;
}

/**
 * controlGridRowHTML(order, ctx) → HTML <tr> string for one admin
 * control-grid row. Switches per-cell between display and edit mode
 * based on `ctx.isEdit`.
 *
 * ctx = {
 *   isSel, isEdit,            // selection / edit-mode flags
 *   status,                   // pre-computed display status (string)
 *   txList,                   // pre-filtered + sorted tx_v2 entries
 *   designers,                // employees array for assignedTo dropdown
 *   calcRem, fn, fmtDate,     // helpers
 *   CGRID_STATUS_BG, CGRID_STATUS_CLR, CGRID_STATUS_MAP,
 * }
 */
export function controlGridRowHTML(order, ctx = {}) {
  const o = order || {};
  const {
    isSel = false,
    isEdit = false,
    status = '',
    txList = [],
    designers = [],
    calcRem = () => 0,
    fn: fmtNum = (n) => String(parseFloat(n) || 0),
    fmtDate = () => '—',
    CGRID_STATUS_BG = {},
    CGRID_STATUS_CLR = {},
    CGRID_STATUS_MAP = {},
  } = ctx;

  const rem       = calcRem(o);
  const sale      = (parseFloat(o.salePrice) || 0) + (parseFloat(o.customerShipFee) || 0);
  const paid      = parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;
  const cost      = (o.costItems || []).reduce((s, c) => s + (parseFloat(c.total) || 0), 0)
                    || (parseFloat(o.totalCost) || 0);
  const profit    = paid - cost;
  const profitPct = paid > 0 ? Math.round(profit / paid * 100) : null;
  const isRet     = o.paymentStatus === 'returned' || o.shipStage === 'returned';
  const isProb    = !!o.hasProblem;
  const sbg       = CGRID_STATUS_BG[status] || '';
  const stxt      = CGRID_STATUS_CLR[status] || 'var(--dim2)';
  const service   = o.products?.length ? o.products.map(p => p.name).join('+') : (o.product || '—');
  const empName   = o.csName || o.designerName || o.productionAgentName || '—';
  const empUid    = o.assignedTo || o.designerId || o.productionAgent || '';
  const safeClientName = (o.clientName || '').replace(/"/g, '&quot;');
  const safeBiz        = (o.clientBusiness || o.job || '').replace(/"/g, '&quot;');

  const txHtml = txList.length
    ? `<div class="cg-tx-list">${txList.map(tx => `<div class="cg-tx-item"><b>${fmtNum(tx.amount)} ج</b> ← ${tx.walletName || '—'}</div>`).join('')}</div>`
    : `<span class="txt-meta-xs">—</span>`;

  const empOptions = designers.map(e =>
    `<option value="${e._id || e.uid || ''}"${(e._id === empUid || e.uid === empUid) ? ' selected' : ''}>${e.name || e.displayName || ''}</option>`
  ).join('');

  const clientNameCell = isEdit
    ? `<td><input class="cg-inp" data-field="clientName" value="${safeClientName}" style="width:110px"></td>`
    : `<td onclick="cgridOpenClient('${o._id}')" style="cursor:pointer" title="عرض بطاقة العميل"><span style="font-weight:var(--fw-bold);color:var(--b);text-decoration:underline dotted">${o.clientName || '—'}</span></td>`;
  const bizCell = isEdit
    ? `<td><input class="cg-inp" data-field="clientBusiness" value="${safeBiz}" style="width:100px"></td>`
    : `<td><span class="txt-meta-xs">${o.clientBusiness || o.job || '—'}</span></td>`;
  const empCell = isEdit
    ? `<td><select class="cg-sel" data-field="assignedTo" style="width:90px"><option value="">— بدون —</option>${empOptions}</select></td>`
    : `<td><span style="font-size:var(--fs-xs)">${empName}</span></td>`;
  const salePriceCell = isEdit
    ? `<td><input class="cg-inp" data-field="salePrice" type="number" value="${parseFloat(o.salePrice) || 0}" style="width:80px"></td>`
    : `<td><span style="font-weight:var(--fw-extra);color:var(--b)">${fmtNum(sale)} ج</span></td>`;
  const paidCell = isEdit
    ? `<td><input class="cg-inp" data-field="totalPaid" type="number" value="${paid}" style="width:80px"></td>`
    : `<td><span style="color:var(--g);font-weight:var(--fw-bold)">${fmtNum(paid)} ج</span></td>`;
  const editBtnCell = isEdit
    ? `<td style="text-align:center;white-space:nowrap">
         <button type="button" class="cg-edit-btn saving" onclick="cgridSaveRowEdit('${o._id}')">✅ حفظ</button>
         <button type="button" class="cg-cancel-btn" onclick="cgridCancelEdit('${o._id}')" style="margin-right:4px">✕</button>
       </td>`
    : `<td style="text-align:center">
         <button type="button" class="cg-edit-btn" onclick="cgridStartEdit('${o._id}')">✏️ تعديل</button>
       </td>`;

  return `<tr class="${isSel ? 'sel-row' : ''}${isEdit ? ' edit-mode' : ''}" data-id="${o._id}">
      <td style="text-align:center"><input type="checkbox" ${isSel ? 'checked' : ''} onchange="cgridToggleSel('${o._id}',this.checked)" style="accent-color:var(--p)"></td>
      <td style="font-weight:var(--fw-bold);color:var(--dim2);font-size:var(--fs-xs)">${o.orderId || o._id.slice(-6)}</td>
      ${clientNameCell}
      <td style="color:var(--dim2)">${o.clientPhone || '—'}</td>
      ${bizCell}
      <td style="color:var(--dim2);font-size:var(--fs-xs);max-width:110px;overflow:hidden;text-overflow:ellipsis">${service}</td>
      ${empCell}
      ${salePriceCell}
      ${paidCell}
      <td style="color:${rem > 0 ? 'var(--r)' : 'var(--dim2)'};font-weight:${rem > 0 ? 800 : 400}">${rem > 0 ? fmtNum(rem) + ' ج' : '—'}</td>
      <td style="font-size:var(--fs-xs);color:${cost > 0 ? 'var(--r)' : 'var(--dim2)'};font-weight:${cost > 0 ? 700 : 400}">${cost > 0 ? fmtNum(cost) + ' ج' : '—'}</td>
      <td style="font-size:var(--fs-xs);font-weight:${cost > 0 ? 800 : 400};color:${cost > 0 ? (profit >= 0 ? 'var(--g)' : 'var(--r)') : 'var(--dim2)'}">
        ${cost > 0 ? fmtNum(profit) + ' ج' + (profitPct !== null ? ` <span style="font-size:8px;opacity:.7">${profitPct}%</span>` : '') : '—'}
      </td>
      <td>${txHtml}</td>
      <td>
        <select class="cg-sel" onchange="cgridSaveStatus('${o._id}',this.value,'${status}')" style="background:${sbg};color:${stxt};font-size:var(--fs-xs);padding:2px 5px">
          ${Object.keys(CGRID_STATUS_MAP).map(s => `<option value="${s}"${s === status ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td class="txt-meta-xs">${fmtDate(o.createdAt)}</td>
      <td class="txt-meta-xs">${fmtDate(o.updatedAt)}</td>
      <td>
        <button type="button" onclick="cgridToggleProblem('${o._id}',${!isProb})" style="padding:2px 8px;border-radius:20px;border:none;cursor:pointer;font-size:var(--fs-tiny);font-weight:var(--fw-extra);background:${isProb ? 'rgba(255,61,110,.15)' : 'var(--hover)'};color:${isProb ? 'var(--r)' : 'var(--dim2)'}">
          ${isProb ? '⚠️ نعم' : 'لا'}
        </button>
      </td>
      <td style="text-align:center">${isRet ? '<span style="color:var(--r);font-size:var(--fs-sm)">↩️ نعم</span>' : '<span class="txt-meta-xs">لا</span>'}</td>
      ${editBtnCell}
      <td style="text-align:center">
        <button type="button" onclick="cgridDeleteOrder('${o._id}')" style="padding:3px 9px;border-radius:6px;border:1px solid rgba(255,61,110,.4);background:rgba(255,61,110,.08);color:var(--r);font-size:var(--fs-xs);font-weight:var(--fw-extra);cursor:pointer" title="حذف نهائي">🗑</button>
      </td>
    </tr>`;
}

/**
 * occasionsBannerHTML(clients) → HTML string for the top-of-page
 * birthday + business-anniversary banner. Returns '' when nothing to
 * show (caller hides the container in that case).
 *
 * Categorizes occasions into "today" and "soon (within 7 days)" using
 * the page-attached helpers `isOccasionToday` / `isOccasionSoon` /
 * `fmtOccasion` (also exported from this module).
 *
 * Pure — no DOM writes, no closure capture.
 */
export function occasionsBannerHTML(clients = []) {
  const today = [], soon = [];
  for (const c of (clients || [])) {
    if (c.status === 'legacy') continue;
    if      (isOccasionToday(c.birthday))       today.push({ c, type: 'birthday' });
    else if (isOccasionSoon(c.birthday, 7))     soon.push({ c, type: 'birthday' });
    if      (isOccasionToday(c.anniversary))    today.push({ c, type: 'anniversary' });
    else if (isOccasionSoon(c.anniversary, 7))  soon.push({ c, type: 'anniversary' });
  }
  if (!today.length && !soon.length) return '';

  const ico = (t) => t === 'birthday' ? '🎂' : '🏢';
  const waMsg = (c, t) => {
    const baseB = `أهلاً ${c.name} 👋، كل سنة وحضرتك طيب 🎂 من فريق العمل — عرض خاص بمناسبة عيد ميلادك!`;
    const baseA = `مبروك سنة جديدة على تأسيس "${c.name}" 🏢🎉 — عرض خاص بمناسبة الذكرى!`;
    return encodeURIComponent(t === 'birthday' ? baseB : baseA);
  };
  const waNum = (c) => (c.phone1 || '').replace(/^0/, '');
  const chip = (item, isToday) => `<a href="https://wa.me/20${waNum(item.c)}?text=${waMsg(item.c, item.type)}" target="_blank" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;background:${isToday ? 'rgba(255,170,0,.15)' : 'rgba(59,158,255,.1)'};border:1px solid ${isToday ? 'rgba(255,170,0,.35)' : 'rgba(59,158,255,.25)'};color:${isToday ? 'var(--y)' : 'var(--b)'};font-size:var(--fs-sm);font-weight:var(--fw-extra);text-decoration:none;margin:2px 0;cursor:pointer" title="فتح واتساب لإرسال تهنئة">
    ${ico(item.type)} ${item.c.name} ${isToday ? '' : '· ' + fmtOccasion(item.type === 'birthday' ? item.c.birthday : item.c.anniversary).replace(/[^()]*\(/, '(')}
  </a>`;

  return `
    <div style="background:linear-gradient(90deg,rgba(255,170,0,.08),rgba(167,139,250,.06));border:1px solid rgba(255,170,0,.25);border-radius:var(--rad2);padding:12px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:${today.length || soon.length ? '8' : '0'}px">
        <div style="font-size:var(--fs-base);font-weight:var(--fw-extra);color:var(--y)">${today.length ? `🎉 اليوم: ${today.length} مناسبة` : '📅 مناسبات قريبة'}${soon.length && today.length ? ` · ${soon.length} خلال 7 أيام` : soon.length ? `${soon.length} خلال 7 أيام` : ''}</div>
        <button type="button" onclick="this.parentElement.parentElement.parentElement.style.display='none'" style="background:none;border:none;color:var(--dim2);font-size:var(--fs-lg);cursor:pointer">✕</button>
      </div>
      ${today.length ? `<div style="display:flex;flex-wrap:wrap;gap:var(--space-xs);margin-bottom:${soon.length ? '8' : '0'}px">${today.map(it => chip(it, true)).join('')}</div>` : ''}
      ${soon.length ? `<div style="display:flex;flex-wrap:wrap;gap:var(--space-xs)">${soon.map(it => chip(it, false)).join('')}</div>` : ''}
      <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:6px">💡 اضغط على أي عميل لفتح واتساب برسالة تهنئة جاهزة</div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════════
// Stats Drawer — top-of-page KPI cards that open a detail drawer
// ════════════════════════════════════════════════════════════════════
// The drawer has 6 types (total / today / month / sales / rem / orders).
// Each builds its own body HTML. The drawer header (title) and the
// container open/close stay in clients.html.

const _DRAWER_TITLES = {
  total:  '👥 كل العملاء',
  today:  '📅 عملاء اليوم',
  month:  '🆕 عملاء هذا الشهر',
  sales:  '🚀 رحلة العملاء — تفاصيل المبيعات',
  rem:    '💳 باقي التحصيل',
  orders: '📦 الأوردرات النشطة',
};

// Customer-journey config (shared between 'sales' + 'rem' drawer branches).
const _JOURNEY = [
  { key: 'design',     label: 'تصميم',  ico: '✏️', page: 'design.html',     col: 'var(--o-purple)' },
  { key: 'printing',   label: 'طباعة',  ico: '🖨️', page: 'print.html',      col: 'var(--y-amber)' },
  { key: 'production', label: 'تنفيذ',  ico: '🏭', page: 'production.html', col: 'var(--p-pink)' },
  { key: 'shipping',   label: 'شحن',    ico: '🚚', page: 'shipping.html',   col: '#06b6d4' },
  { key: 'done',       label: 'تسليم',  ico: '✅', page: 'archive.html',    col: '#10d27e' },
];
function _stageIdx(o) {
  if (['archived', 'delivered'].includes(o.stage)) return 4;
  if (o.stage === 'shipping')   return 3;
  if (o.stage === 'production') return 2;
  if (o.stage === 'printing')   return 1;
  return 0;
}
function _lastStageChange(o) {
  const ts = o.stageChangedAt?.seconds || o.lastUpdate?.seconds || o.updatedAt?.seconds || o.createdAt?.seconds || 0;
  return ts ? Math.floor((Date.now() / 1000 - ts) / 86400) : null;
}
function _isLate(o) {
  return o.deadline && new Date(o.deadline).getTime() < Date.now() && !['archived', 'delivered'].includes(o.stage);
}
function _lateDays(o) {
  return o.deadline ? Math.max(0, Math.floor((Date.now() - new Date(o.deadline).getTime()) / 86400000)) : 0;
}

/** Customer-journey timeline block (5 stage circles + label + days badge). */
function _journeyHTML(o) {
  const idx  = _stageIdx(o);
  const days = _lastStageChange(o);
  const late = _isLate(o);
  const cur  = _JOURNEY[idx];

  const stages = _JOURNEY.map((s, i) => {
    const done   = i < idx;
    const active = i === idx;
    const bg     = done ? '#10d27e' : active ? s.col : 'var(--line)';
    const txt    = done ? '#fff'    : active ? '#fff' : 'var(--dim)';
    const ring   = active ? `box-shadow:0 0 0 3px ${s.col}30;` : '';
    const pulse  = active ? 'animation:journeyPulse 2s infinite;' : '';
    return `<div title="${s.label}" style="width:28px;height:28px;border-radius:50%;background:${bg};color:${txt};display:flex;align-items:center;justify-content:center;font-size:var(--fs-md);font-weight:var(--fw-heavy);flex-shrink:0;${ring}${pulse}">${done ? '✓' : s.ico}</div>`;
  });
  const lines = _JOURNEY.slice(0, -1).map((_, i) => {
    const done = i < idx;
    return `<div style="flex:1;height:3px;background:${done ? '#10d27e' : 'var(--line)'};margin:0 -2px;align-self:center;border-radius:99px"></div>`;
  });
  const merged = [];
  for (let i = 0; i < stages.length; i++) {
    merged.push(stages[i]);
    if (i < lines.length) merged.push(lines[i]);
  }

  const lateBadge = late ? `<span style="font-size:var(--fs-xs);font-weight:var(--fw-heavy);color:var(--r);background:rgba(255,61,110,.12);padding:3px 9px;border-radius:99px;border:1px solid rgba(255,61,110,.3)">⚠️ متأخر ${_lateDays(o)}ي</span>` : '';
  const daysBadge = days !== null ? `<span style="font-size:var(--fs-xs);font-weight:var(--fw-bold);color:var(--dim2)">في ${cur.label} منذ ${days === 0 ? 'اليوم' : days + ' يوم'}</span>` : '';
  return `<div style="margin:10px 0 6px">
      <div style="display:flex;align-items:center;gap:0;padding:0 4px">${merged.join('')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:6px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px;font-size:var(--fs-sm);font-weight:var(--fw-extra);color:${cur.col}">
          ${cur.ico} ${cur.label}
        </div>
        ${daysBadge}
        ${lateBadge}
      </div>
    </div>`;
}

/**
 * statsDrawerTitle(type) → الـ title النصي للـ drawer header.
 */
export function statsDrawerTitle(type) {
  return _DRAWER_TITLES[type] || 'التفاصيل';
}

/**
 * statsDrawerHTML({type, clients, allOrders, calcRem, salesStageFilter, remStageFilter})
 *   → HTML body for the drawer content area.
 *
 * Pure: no DOM writes. The page wrapper sets title + assigns the
 * returned HTML to `#drawer-content`.
 *
 * Filter state (`salesStageFilter`, `remStageFilter`) is passed in;
 * the rendered HTML embeds onclick handlers that set those flags and
 * call back into `window.showStatsDrawer(...)` for the re-render.
 */
export function statsDrawerHTML({
  type,
  clients = [],
  allOrders = [],
  calcRem = () => 0,
  salesStageFilter,
  remStageFilter,
} = {}) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const fn = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

  if (type === 'total') {
    return `<div style="text-align:center;padding:var(--space-md);color:var(--dim2);font-size:var(--fs-xl);font-weight:var(--fw-extra)">${clients.length} عميل</div>` +
      clients.slice(0, 30).map(c2 => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)">
        <div><div class="txt-bold-md">${c2.name || '—'}</div><div class="txt-meta-sm">${c2.phone1 || '—'} · ${c2.job || '—'}</div></div>
        <a href="https://wa.me/20${(c2.phone1 || '').replace(/^0/, '')}" target="_blank" style="color:var(--g);font-size:20px">💬</a>
      </div>`).join('');
  }

  if (type === 'today') {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayC = clients.filter(c2 => {
      const d = c2.createdAt?.seconds ? new Date(c2.createdAt.seconds * 1000) : null;
      return d && d >= today;
    });
    return `<div style="text-align:center;padding:var(--space-md);color:var(--b);font-size:var(--fs-2xl);font-weight:var(--fw-heavy)">${todayC.length} عميل اليوم</div>` +
      (todayC.length ? todayC.map(c2 => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)">
        <div><div style="font-size:var(--fs-lg);font-weight:var(--fw-heavy)">${c2.name || '—'}</div>
        <div class="txt-meta-sm">${c2.phone1 || '—'} · ${c2.job || '—'}</div>
        <div class="txt-meta-xs">${c2.source || ''}</div></div>
        <a href="https://wa.me/20${(c2.phone1 || '').replace(/^0/, '')}" target="_blank" style="font-size:var(--fs-3xl);text-decoration:none">💬</a>
      </div>`).join('') : '<div style="color:var(--dim2);text-align:center;padding:30px;font-size:var(--fs-lg)">لا يوجد عملاء اليوم</div>');
  }

  if (type === 'month') {
    const monthC = clients.filter(c2 => {
      const d = c2.createdAt?.seconds ? new Date(c2.createdAt.seconds * 1000) : null;
      return d && d.getFullYear() === y && d.getMonth() === m;
    });
    return `<div style="text-align:center;padding:var(--space-md);color:var(--g);font-size:var(--fs-2xl);font-weight:var(--fw-heavy)">${monthC.length} عميل جديد</div>` +
      (monthC.length ? monthC.map(c2 => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)">
        <div><div class="txt-bold-md">${c2.name || '—'}</div><div class="txt-meta-sm">${c2.phone1 || '—'}</div></div>
        <a href="https://wa.me/20${(c2.phone1 || '').replace(/^0/, '')}" target="_blank" style="color:var(--g);font-size:20px">💬</a>
      </div>`).join('') : '<div style="color:var(--dim2);text-align:center;padding:var(--space-xl)">لا يوجد عملاء جدد</div>');
  }

  if (type === 'sales') {
    const allSales  = allOrders.filter(o => parseFloat(o.salePrice) > 0);
    const activeIdx = (typeof salesStageFilter === 'number') ? salesStageFilter : -1;

    const byStageCount = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    const byStageSales = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    allSales.forEach(o => {
      const i = _stageIdx(o);
      byStageCount[i] = (byStageCount[i] || 0) + 1;
      byStageSales[i] = (byStageSales[i] || 0) + (parseFloat(o.salePrice) || 0);
    });

    const ords = (activeIdx === -1 ? allSales : allSales.filter(o => _stageIdx(o) === activeIdx))
                 .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const tot       = ords.reduce((s, o) => s + (parseFloat(o.salePrice) || 0), 0);
    const totPaid   = ords.reduce((s, o) => s + (parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0), 0);
    const totRem    = ords.reduce((s, o) => s + calcRem(o), 0);
    const lateCount = ords.filter(o => _isLate(o)).length;
    const titleLabel = activeIdx === -1 ? 'إجمالي المبيعات' : `مبيعات مرحلة ${_JOURNEY[activeIdx].label}`;

    const header = `
      <div style="background:linear-gradient(135deg,rgba(124,92,255,.1),rgba(6,182,212,.05));border:1px solid rgba(124,92,255,.2);border-radius:14px;padding:14px;margin-bottom:14px">
        <div style="text-align:center;margin-bottom:12px">
          <div style="font-size:var(--fs-sm);color:var(--dim2);font-weight:var(--fw-extra);margin-bottom:4px">${titleLabel}</div>
          <div style="font-size:26px;font-weight:var(--fw-heavy);background:linear-gradient(135deg,#10d27e,#06b6d4);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">${fn(tot)} ج</div>
          <div style="display:flex;justify-content:center;gap:14px;margin-top:8px;font-size:var(--fs-sm);flex-wrap:wrap">
            <span style="color:var(--g);font-weight:var(--fw-extra)">✓ تم: ${fn(totPaid)} ج</span>
            ${totRem > 0 ? `<span style="color:var(--r);font-weight:var(--fw-extra)">⏳ باقي: ${fn(totRem)} ج</span>` : ''}
            ${lateCount > 0 ? `<span style="color:var(--y-amber);font-weight:var(--fw-extra)">⚠️ ${lateCount} متأخر</span>` : ''}
            <span style="color:var(--snow-soft);font-weight:var(--fw-extra)">${ords.length} أوردر</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">
          <div onclick="window.__salesStageFilter=-1;window.showStatsDrawer('sales')"
            style="background:${activeIdx === -1 ? 'rgba(167,139,250,.2)' : 'var(--row-hover)'};border:1px solid ${activeIdx === -1 ? 'var(--p)' : 'var(--line)'};border-radius:var(--rad);padding:8px 4px;text-align:center;cursor:pointer;transition:.15s">
            <div style="font-size:var(--fs-lg);margin-bottom:2px">🌐</div>
            <div style="font-size:var(--fs-xl);font-weight:var(--fw-heavy);color:${activeIdx === -1 ? 'var(--p)' : 'var(--snow-soft)'};line-height:1">${allSales.length}</div>
            <div style="font-size:var(--fs-tiny);color:var(--dim2);font-weight:var(--fw-bold);margin-top:2px">الكل</div>
          </div>
          ${_JOURNEY.map((s, i) => {
            const isOn = activeIdx === i;
            const c = byStageCount[i] || 0;
            return `<div onclick="window.__salesStageFilter=${i};window.showStatsDrawer('sales')"
              style="background:${isOn ? s.col + '30' : 'var(--row-hover)'};border:1px solid ${isOn ? s.col : 'var(--line)'};border-radius:var(--rad);padding:8px 4px;text-align:center;cursor:pointer;transition:.15s;opacity:${c === 0 ? '.45' : '1'}">
              <div style="font-size:var(--fs-lg);margin-bottom:2px">${s.ico}</div>
              <div style="font-size:var(--fs-xl);font-weight:var(--fw-heavy);color:${s.col};line-height:1">${c}</div>
              <div style="font-size:var(--fs-tiny);color:var(--dim2);font-weight:var(--fw-bold);margin-top:2px">${s.label}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;

    const cards = ords.slice(0, 25).map(o => {
      const paid    = parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;
      const rem     = calcRem(o);
      const sale    = parseFloat(o.salePrice) || 0;
      const pct     = sale > 0 ? Math.min(100, paid / sale * 100) : 0;
      const idx     = _stageIdx(o);
      const cur     = _JOURNEY[idx];
      const late    = _isLate(o);
      const phone   = (o.clientPhone || '').replace(/^0/, '');
      const product = o.product || (o.products || []).map(p => p.name).join(' + ') || '—';

      return `<div style="background:var(--bg2);border:1px solid ${late ? 'rgba(255,61,110,.25)' : 'var(--hover)'};border-radius:14px;padding:14px;margin-bottom:10px;position:relative;overflow:hidden">
        ${late ? '<div style="position:absolute;top:0;right:0;left:0;height:2px;background:linear-gradient(90deg,var(--r),transparent)"></div>' : ''}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--fs-lg);font-weight:var(--fw-heavy);color:var(--snow);letter-spacing:-.2px">${o.clientName || '—'}</div>
            <div style="font-size:var(--fs-sm);color:var(--snow-soft);margin-top:2px">${product}</div>
            <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:1px">${o.clientPhone || '—'} · ${o.createdDate || '—'}</div>
          </div>
          <div style="text-align:left;flex-shrink:0">
            <div style="font-size:15px;font-weight:var(--fw-heavy);color:${cur.col}">${fn(sale)} ج</div>
            ${rem > 0 ? `<div style="font-size:var(--fs-sm);color:var(--r);font-weight:var(--fw-extra);margin-top:2px">باقي ${fn(rem)} ج</div>` : '<div style="font-size:var(--fs-sm);color:var(--g);font-weight:var(--fw-extra);margin-top:2px">✓ مسدد</div>'}
          </div>
        </div>
        ${_journeyHTML(o)}
        <div style="margin-top:10px">
          <div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-bottom:4px">
            <span>التحصيل</span>
            <span>${Math.round(pct)}%</span>
          </div>
          <div style="height:5px;background:var(--hover);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${rem <= 0 ? '#10d27e' : '#3b82f6'},${rem <= 0 ? '#06b6d4' : cur.col});border-radius:99px;transition:width .4s"></div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <a href="${cur.page}?orderId=${encodeURIComponent(o._id)}" style="flex:1;min-width:80px;text-align:center;padding:7px 10px;border-radius:var(--rad);background:${cur.col}18;color:${cur.col};font-size:var(--fs-sm);font-weight:var(--fw-extra);text-decoration:none;border:1px solid ${cur.col}40">${cur.ico} افتح في ${cur.label}</a>
          ${phone ? `<a href="https://wa.me/20${phone}" target="_blank" style="padding:7px 12px;border-radius:var(--rad);background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;font-size:var(--fs-sm);font-weight:var(--fw-extra);text-decoration:none">💬</a>` : ''}
          ${phone ? `<a href="tel:${o.clientPhone}" style="padding:7px 12px;border-radius:var(--rad);background:var(--row-hover);color:var(--snow-soft);font-size:var(--fs-sm);font-weight:var(--fw-extra);text-decoration:none;border:1px solid var(--line)">📞</a>` : ''}
        </div>
      </div>`;
    }).join('');

    return header + cards + (ords.length > 25 ? `<div style="text-align:center;color:var(--dim2);padding:14px;font-size:var(--fs-sm)">عرض 25 من إجمالي ${ords.length} أوردر</div>` : '');
  }

  if (type === 'rem') {
    const allRem      = allOrders.filter(o => calcRem(o) > 0);
    const activeStage = remStageFilter || 'all';
    const stageCfg = [
      { key: 'design',     label: 'تصميم',  ico: '✏️', col: 'var(--o-purple)' },
      { key: 'printing',   label: 'طباعة',  ico: '🖨️', col: 'var(--y-amber)' },
      { key: 'production', label: 'تنفيذ',  ico: '🏭', col: 'var(--p-pink)' },
      { key: 'shipping',   label: 'شحن',    ico: '🚚', col: '#06b6d4' },
    ];
    const perStage = {};
    stageCfg.forEach(s => {
      const ords = allRem.filter(o => o.stage === s.key);
      perStage[s.key] = { count: ords.length, total: ords.reduce((a, o) => a + calcRem(o), 0) };
    });
    const allCount = allRem.length;
    const remOrds = (activeStage === 'all' ? allRem : allRem.filter(o => o.stage === activeStage))
                    .sort((a, b) => calcRem(b) - calcRem(a));
    const totRem    = remOrds.reduce((s, o) => s + calcRem(o), 0);
    const lateRem   = remOrds.filter(o => _isLate(o)).reduce((s, o) => s + calcRem(o), 0);
    const lateCount = remOrds.filter(o => _isLate(o)).length;
    const allActive = activeStage === 'all';

    const tabs = `
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:10px;-ms-overflow-style:none;scrollbar-width:none">
        <button type="button" onclick="window.__remStageFilter='all';window.showStatsDrawer('rem')"
          style="flex-shrink:0;padding:7px 13px;border-radius:20px;border:1px solid ${allActive ? 'var(--p)' : 'var(--line2)'};
                 background:${allActive ? 'rgba(167,139,250,.2)' : 'var(--row-hover)'};
                 color:${allActive ? 'var(--p)' : 'var(--snow-soft)'};
                 font-family:inherit;font-size:var(--fs-sm);font-weight:var(--fw-extra);cursor:pointer;white-space:nowrap">
          🌐 الكل · ${allCount}
        </button>
        ${stageCfg.map(s => {
          const d = perStage[s.key];
          const isOn = activeStage === s.key;
          return `<button type="button" onclick="window.__remStageFilter='${s.key}';window.showStatsDrawer('rem')"
            style="flex-shrink:0;padding:7px 13px;border-radius:20px;border:1px solid ${isOn ? s.col : 'var(--line2)'};
                   background:${isOn ? s.col + '30' : 'var(--row-hover)'};
                   color:${isOn ? s.col : 'var(--snow-soft)'};
                   font-family:inherit;font-size:var(--fs-sm);font-weight:var(--fw-extra);cursor:pointer;white-space:nowrap;
                   opacity:${d.count === 0 ? '.4' : '1'}">
            ${s.ico} ${s.label} · ${d.count}
          </button>`;
        }).join('')}
      </div>`;

    const headerLabel = allActive ? 'إجمالي باقي التحصيل' : `باقي التحصيل — مرحلة ${stageCfg.find(s => s.key === activeStage)?.label || activeStage}`;
    const header = `
      ${tabs}
      <div style="background:linear-gradient(135deg,rgba(255,61,110,.1),rgba(251,191,36,.05));border:1px solid rgba(255,61,110,.25);border-radius:14px;padding:14px;margin-bottom:14px;text-align:center">
        <div style="font-size:var(--fs-sm);color:var(--dim2);font-weight:var(--fw-extra);margin-bottom:4px">${headerLabel}</div>
        <div style="font-size:26px;font-weight:var(--fw-heavy);background:linear-gradient(135deg,var(--r),var(--y-amber));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">${fn(totRem)} ج</div>
        <div style="display:flex;justify-content:center;gap:14px;margin-top:8px;font-size:var(--fs-sm);font-weight:var(--fw-extra)">
          <span style="color:var(--snow-soft)">${remOrds.length} أوردر</span>
          ${lateCount > 0 ? `<span style="color:var(--r)">⚠️ ${lateCount} متأخر · ${fn(lateRem)} ج</span>` : ''}
        </div>
      </div>`;

    if (!remOrds.length) {
      return header + '<div style="color:var(--g);text-align:center;padding:30px;font-weight:var(--fw-extra);font-size:var(--fs-xl)">✅ كل الفواتير محصّلة</div>';
    }

    const cards = remOrds.slice(0, 25).map(o => {
      const rem     = calcRem(o);
      const sale    = parseFloat(o.salePrice) || 0;
      const paid    = parseFloat(o.totalPaid) || parseFloat(o.paid) || parseFloat(o.deposit) || 0;
      const pct     = sale > 0 ? Math.min(100, paid / sale * 100) : 0;
      const idx     = _stageIdx(o);
      const cur     = _JOURNEY[idx];
      const late    = _isLate(o);
      const phone   = (o.clientPhone || '').replace(/^0/, '');
      const product = o.product || (o.products || []).map(p => p.name).join(' + ') || '—';

      return `<div style="background:var(--bg2);border:1px solid ${late ? 'rgba(255,61,110,.35)' : 'var(--hover)'};border-radius:14px;padding:14px;margin-bottom:10px;position:relative;overflow:hidden">
        ${late ? '<div style="position:absolute;top:0;right:0;left:0;height:2px;background:linear-gradient(90deg,var(--r),var(--y-amber))"></div>' : ''}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--fs-lg);font-weight:var(--fw-heavy);color:var(--snow)">${o.clientName || '—'}</div>
            <div style="font-size:var(--fs-sm);color:var(--snow-soft);margin-top:2px">${product}</div>
            <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:1px">${o.clientPhone || '—'} · ${o.orderId || o._id.slice(-6)}</div>
          </div>
          <div style="text-align:left;flex-shrink:0">
            <div style="font-size:var(--fs-2xl);font-weight:var(--fw-heavy);color:var(--r)">${fn(rem)} ج</div>
            <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-top:2px">من ${fn(sale)} ج</div>
          </div>
        </div>
        ${_journeyHTML(o)}
        <div style="margin-top:10px">
          <div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-bottom:4px">
            <span>تم تحصيل ${fn(paid)} ج</span>
            <span>${Math.round(pct)}%</span>
          </div>
          <div style="height:5px;background:var(--hover);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#3b82f6,${cur.col});border-radius:99px"></div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          ${phone ? `<a href="https://wa.me/20${phone}?text=${encodeURIComponent(`السلام عليكم أ. ${o.clientName || ''}، تذكير ودي — رصيد متبقي ${fn(rem)} ج على طلب ${o.orderId || ''}. شكراً 🌹`)}" target="_blank" style="flex:1;text-align:center;padding:7px 10px;border-radius:var(--rad);background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;font-size:var(--fs-sm);font-weight:var(--fw-extra);text-decoration:none">💬 ذكّره بالباقي</a>` : ''}
          ${phone ? `<a href="tel:${o.clientPhone}" style="padding:7px 12px;border-radius:var(--rad);background:var(--row-hover);color:var(--snow-soft);font-size:var(--fs-sm);font-weight:var(--fw-extra);text-decoration:none;border:1px solid var(--line)">📞</a>` : ''}
          <a href="${cur.page}?orderId=${encodeURIComponent(o._id)}" style="padding:7px 12px;border-radius:var(--rad);background:${cur.col}18;color:${cur.col};font-size:var(--fs-sm);font-weight:var(--fw-extra);text-decoration:none;border:1px solid ${cur.col}40">${cur.ico}</a>
        </div>
      </div>`;
    }).join('');

    return header + cards + (remOrds.length > 25 ? `<div style="text-align:center;color:var(--dim2);padding:14px;font-size:var(--fs-sm)">عرض 25 من إجمالي ${remOrds.length}</div>` : '');
  }

  if (type === 'orders') {
    const activeOrds = allOrders.filter(o => o.stage !== 'archived').sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const stageMap = { design: '✏️ تصميم', printing: '🖨️ طباعة', production: '🏭 تنفيذ', shipping: '🚚 شحن' };
    const byStage = {};
    activeOrds.forEach(o => { if (!byStage[o.stage]) byStage[o.stage] = []; byStage[o.stage].push(o); });
    return `<div style="text-align:center;padding:var(--space-md);color:var(--p);font-size:var(--fs-2xl);font-weight:var(--fw-heavy)">${activeOrds.length} أوردر نشط</div>` +
      Object.entries(byStage).map(([stage, ords]) => `
        <div style="margin-bottom:12px">
          <div style="font-size:var(--fs-base);font-weight:var(--fw-extra);color:var(--dim2);padding:6px 10px;background:var(--bg2);border-radius:8px;margin-bottom:6px">${stageMap[stage] || stage} — ${ords.length} أوردر</div>
          ${ords.map(o => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--fs-md);font-weight:var(--fw-bold)">${o.clientName || '—'}</div>
              <div class="txt-meta-sm">${o.product || (o.products || []).map(p => p.name).join('+') || '—'}</div>
              ${o.deadline && new Date(o.deadline) < new Date() ? '<div style="font-size:var(--fs-xs);color:var(--r);font-weight:var(--fw-bold)">⚠️ متأخر</div>' : ''}
            </div>
            <span style="font-size:var(--fs-base);font-weight:var(--fw-extra);color:var(--b);flex-shrink:0">${fn(parseFloat(o.salePrice) || 0)} ج</span>
          </div>`).join('')}
        </div>`).join('');
  }

  return '';
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
    // PR-3:
    panelOrdersHTML,
    // PR-4:
    bizCardTabHTML,
    // PR-5:
    clientCardHTML, clientListRowHTML,
    // PR-6:
    clientPanelHeaderHTML, clientPanelBodyHTML,
    // PR-7:
    segmentStripHTML, prodOptsHTML,
    // PR-10:
    controlGridStatsHTML,
    // PR-11:
    controlGridRowHTML,
    // PR-12:
    statsDrawerHTML, statsDrawerTitle,
    // PR-20:
    occasionsBannerHTML,
  });
}
