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
    return `<div style="color:var(--dim2);font-size:var(--fs-base);text-align:center;padding:16px">لا توجد أوردرات</div>`;
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
    return `<div class="ord-row" style="margin-bottom:8px;border-radius:10px;overflow:hidden">
      <div onclick="location.href='${href}'" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:10px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
              <span style="font-size:var(--fs-xs);font-weight:700;padding:2px 7px;border-radius:20px;background:${sc}15;color:${sc}">${STAGE_AR[o.stage] || o.stage}</span>
              ${isLate ? '<span style="font-size:var(--fs-xs);color:var(--r);font-weight:800">⚠️ متأخر</span>' : ''}
            </div>
            <div style="font-size:var(--fs-md);font-weight:800">${nm}</div>
            <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:2px">${o.orderId || o._id.slice(-6)} · ${o.createdDate || '—'}</div>
            ${o.deadline ? `<div style="font-size:var(--fs-xs);color:${isLate ? 'var(--r)' : 'var(--dim2)'};margin-top:1px">📅 ${o.deadline}</div>` : ''}
          </div>
          <div style="text-align:left;margin-right:8px;flex-shrink:0">
            ${canSee('price_sale') && parseFloat(o.salePrice) > 0 ? `<div style="font-size:var(--fs-lg);font-weight:900;color:var(--b)">${fn(parseFloat(o.salePrice))} ج</div>` : ''}
            ${canSee('price_paid') && paid2 > 0 ? `<div style="font-size:var(--fs-sm);color:var(--g);font-weight:700">محصّل: ${fn(paid2)} ج</div>` : ''}
            ${canSee('price_remaining') && rem2 > 0 ? `<div style="font-size:var(--fs-base);color:var(--r);font-weight:900">باقي: ${fn(rem2)} ج</div>` : ''}
            ${canSee('price_remaining') && rem2 <= 0 && paid2 > 0 ? `<div style="font-size:var(--fs-sm);color:var(--g);font-weight:800">✅ مكتمل</div>` : ''}
          </div>
        </div>
        ${canSee('price_sale') && parseFloat(o.salePrice) > 0 ? `<div style="height:4px;background:var(--bg3);margin-top:-1px"><div style="height:100%;width:${Math.min(100, paid2 / parseFloat(o.salePrice) * 100)}%;background:${rem2 <= 0 ? 'var(--g)' : paid2 > 0 ? 'var(--b)' : 'var(--line)'}"></div></div>` : ''}
      </div>
      <div style="display:flex;gap:6px;padding:6px 8px;background:var(--bg2);border:1px solid var(--line);border-top:0;border-radius:0 0 10px 10px;flex-wrap:wrap">
        <a href="waybill.html?id=${o._id}" target="_blank" onclick="event.stopPropagation()" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(59,158,255,.3);background:rgba(59,158,255,.08);color:var(--b);font-size:var(--fs-xs);font-weight:800;text-decoration:none">🧾 البوليصة</a>
        <button onclick="event.stopPropagation();shareOrderToInbox('${o._id}')" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(0,168,132,.3);background:rgba(0,168,132,.08);color:#00c87a;font-size:var(--fs-xs);font-weight:800;cursor:pointer;font-family:inherit">📤 إرسال</button>
        <button onclick="event.stopPropagation();openOrderCommentsFromHere('${o._id}')" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(167,139,250,.3);background:rgba(167,139,250,.08);color:var(--p);font-size:var(--fs-xs);font-weight:800;cursor:pointer;font-family:inherit">💬 تعليقات</button>
        ${['shipping', 'archived'].includes(o.stage) && !o.hasReturn ? `<a href="returns.html?newTicket=${o._id}" onclick="event.stopPropagation()" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,170,0,.3);background:rgba(255,170,0,.08);color:var(--y);font-size:var(--fs-xs);font-weight:800;text-decoration:none">↩️ مرتجع</a>` : ''}
        ${o.hasReturn ? `<a href="returns.html" onclick="event.stopPropagation()" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,61,110,.3);background:rgba(255,61,110,.08);color:var(--r);font-size:var(--fs-xs);font-weight:800;text-decoration:none">↩️ له مرتجع</a>` : ''}
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
    <div style="background:linear-gradient(135deg,rgba(168,85,247,.1),rgba(6,182,212,.05));border:1px solid rgba(168,85,247,.3);border-radius:12px;padding:12px;margin-bottom:14px">
      <div style="font-size:var(--fs-base);font-weight:900;color:#a855f7;margin-bottom:6px">🧠 لزق ذكي — Smart Paste</div>
      <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:8px;line-height:1.5">الصق هنا أي نص فيه بيانات العميل (من واتساب، إيميل، نص حر) وضغطة "استخرج" تملأ كل الحقول تلقائياً.</div>
      <textarea id="bc-paste-area" placeholder="مثال: ايمن شوق المشد&#10;المستشار&#10;للمحاماة والاستشارات القانونية&#10;Ayman Shawky Al-Mashad&#10;Law Firm and Legal Consultations&#10;01022662220&#10;Aymanshawkylawfirm@gmail.com&#10;كمبوند فاليو 2 - القاهرة الجديدة" style="width:100%;background:var(--bg3);border:1px solid rgba(168,85,247,.3);border-radius:8px;padding:10px;color:var(--snow);font-family:inherit;font-size:var(--fs-base);outline:none;min-height:90px;resize:vertical"></textarea>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-p btn-sm" onclick="window.bizCardSmartPaste()" style="flex:1">🧠 استخرج البيانات</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('bc-paste-area').value=''" title="مسح">✕</button>
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
      ${bc.logoUrl ? `<div style="margin-bottom:8px"><img src="${bc.logoUrl}" loading="lazy" decoding="async" alt="logo" style="max-width:120px;max-height:80px;border-radius:8px;border:1px solid var(--line);background:#fff;padding:4px"></div>` : ''}
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
        <label style="display:block;font-size:var(--fs-xs);font-weight:700;color:var(--dim2);margin-bottom:3px">الأسلوب المفضل</label>
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
      <button class="btn btn-g" onclick="window.saveBizCard()" style="flex:1">💾 حفظ</button>
      <button class="btn btn-b" onclick="window.applyBizCardToNewOrder()">🚀 طبّق على أوردر جديد</button>
      <button class="btn btn-ghost" onclick="window.exportBizCardText()" title="تصدير نص">📋</button>
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
    pills.push(`<span title="RFM: ${seg.rfmCode || ''} · ${seg.recencyDays}d منذ آخر طلب" style="font-size:10.5px;padding:4px 10px;border-radius:99px;background:${st.bg};color:${st.fg};font-weight:800;border:1px solid ${st.fg}30">${seg.segmentIco || '•'} ${seg.segmentLabel || seg.segment}${riskTxt}</span>`);
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
          <div class="cc-name">${c.name || '—'} ${c.intlPhone && canSee('client_phone') ? `<span title="${c.intlPhone}" style="font-size:var(--fs-sm);color:#fbbf24;margin-right:4px">🌍</span>` : ''}</div>
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
          <div class="cc-stat-val" style="color:#7c5cff">${cOrds.length}</div>
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
        <div style="font-size:var(--fs-lg);font-weight:800">${c.name || '—'}
          ${c.intlPhone && canSee('client_phone') ? `<span title="${c.intlPhone}" style="font-size:var(--fs-sm);color:var(--y);margin-right:4px">🌍</span>` : ''}
          ${tags.map(t => `<span class="tag" style="background:${TAG_COL[t] || 'var(--hover)'};font-size:var(--fs-tiny)">${TAG_LABELS[t] || t}</span>`).join('')}
        </div>
        <div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:2px">${canSee('client_phone') ? `📞 ${c.phone1 || '—'} ` : ''}${c.intlPhone && canSee('client_phone') ? `· 🌍 ${c.intlPhone} ` : ''}${c.job ? '· 💼 ' + c.job : ''} ${c.governorate ? '· 📍 ' + c.governorate : ''}</div>
      </div>
      <div style="display:flex;gap:16px;align-items:center;flex-shrink:0">
        <div style="text-align:center">
          <div style="font-size:var(--fs-md);font-weight:800;color:var(--b)">${active}</div>
          <div style="font-size:var(--fs-tiny);color:var(--dim2)">نشط</div>
        </div>
        ${canSee('price_sale') ? `<div style="text-align:center">
          <div style="font-size:var(--fs-md);font-weight:800;color:var(--g)">${fn(tot)}</div>
          <div style="font-size:var(--fs-tiny);color:var(--dim2)">مبيعات ج</div>
        </div>` : ''}
        ${canSee('price_remaining') ? `<div style="text-align:center;min-width:60px">
          <div style="font-size:var(--fs-md);font-weight:800;color:${rem > 0 ? 'var(--r)' : 'var(--g)'}">${rem > 0 ? fn(rem) : '✅'}</div>
          <div style="font-size:var(--fs-tiny);color:var(--dim2)">${rem > 0 ? 'باقي ج' : 'محصّل'}</div>
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
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:48px;height:48px;border-radius:50%;background:${color}18;color:${color};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900">${(c.name || '?')[0]}</div>
      <div>
        <div style="font-size:var(--fs-xl);font-weight:800">${c.name} ${c.status === 'legacy' ? '<span style="font-size:var(--fs-xs);padding:2px 8px;border-radius:20px;background:rgba(150,150,170,.15);color:#aaa;font-weight:800;margin-right:6px">📁 قديم</span>' : ''}</div>
        <div style="font-size:var(--fs-sm);color:var(--dim2)">${canSee('client_phone') ? (c.phone1 || '') : ''} ${c.job ? '· ' + c.job : ''}</div>
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
    return `<div style="background:linear-gradient(135deg,${st.bg},var(--row-hover));border:1px solid ${st.fg}40;border-right:3px solid ${st.fg};border-radius:var(--rad);padding:12px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:var(--fs-md);font-weight:900;color:${st.fg}">${seg.segmentIco || '•'} ${seg.segmentLabel || seg.segment}</span>
          <span style="font-size:var(--fs-xs);color:var(--dim2);font-family:monospace;background:var(--bg3);padding:3px 8px;border-radius:6px" title="RFM Code (Recency · Frequency · Monetary)">RFM: ${seg.rfmCode || '—'}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">
          <div style="background:var(--bg3);border-radius:6px;padding:6px 8px;text-align:center">
            <div style="font-size:var(--fs-tiny);color:var(--dim2);margin-bottom:2px">آخر شراء</div>
            <div style="font-size:var(--fs-md);font-weight:800;color:var(--snow)">${seg.recencyDays ?? '—'} <span style="font-size:var(--fs-tiny);color:var(--dim2);font-weight:600">يوم</span></div>
          </div>
          <div style="background:var(--bg3);border-radius:6px;padding:6px 8px;text-align:center">
            <div style="font-size:var(--fs-tiny);color:var(--dim2);margin-bottom:2px">عدد الأوردرات</div>
            <div style="font-size:var(--fs-md);font-weight:800;color:var(--snow)">${seg.orderCount ?? '—'}</div>
          </div>
          <div style="background:var(--bg3);border-radius:6px;padding:6px 8px;text-align:center">
            <div style="font-size:var(--fs-tiny);color:var(--dim2);margin-bottom:2px">CLV</div>
            <div style="font-size:var(--fs-md);font-weight:800;color:var(--g)">${fmtNum(myClv)} <span style="font-size:var(--fs-tiny);color:var(--dim2);font-weight:600">ج</span></div>
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
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
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
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
        <div onclick="filterPanelOrders('all')" style="background:var(--bg2);border:1.5px solid var(--line);border-radius:12px;padding:12px 8px;text-align:center;cursor:pointer;transition:var(--trans)">
          <div style="font-size:20px;font-weight:900;color:var(--b)">${cOrds.length}</div>
          <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:700;margin-top:2px">كل الأوردرات</div>
        </div>
        <div onclick="filterPanelOrders('active')" style="background:var(--bg2);border:1.5px solid var(--line);border-radius:12px;padding:12px 8px;text-align:center;cursor:pointer;transition:var(--trans)">
          <div style="font-size:20px;font-weight:900;color:var(--g)">${activeOrds.length}</div>
          <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:700;margin-top:2px">🔄 نشط</div>
        </div>
        <div onclick="filterPanelOrders('rem')" style="background:${rem > 0 ? 'rgba(255,61,110,.08)' : 'var(--bg2)'};border:1.5px solid ${rem > 0 ? 'rgba(255,61,110,.3)' : 'var(--line)'};border-radius:12px;padding:12px 8px;text-align:center;cursor:pointer;transition:var(--trans)">
          <div style="font-size:20px;font-weight:900;color:${rem > 0 ? 'var(--r)' : 'var(--g)'};">${rem > 0 ? fmtNum(rem) : '✅'}</div>
          <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:700;margin-top:2px">💰 باقي ج</div>
        </div>
        <div onclick="filterPanelOrders('late')" style="background:${lateOrds.length ? 'rgba(255,61,110,.08)' : 'var(--bg2)'};border:1.5px solid ${lateOrds.length ? 'rgba(255,61,110,.3)' : 'var(--line)'};border-radius:12px;padding:12px 8px;text-align:center;cursor:pointer;transition:var(--trans)">
          <div style="font-size:20px;font-weight:900;color:${lateOrds.length ? 'var(--r)' : 'var(--dim2)'};">${lateOrds.length || '—'}</div>
          <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:700;margin-top:2px">⚠️ متأخر</div>
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
      <div style="background:rgba(59,158,255,.04);border:1px solid rgba(59,158,255,.15);border-radius:var(--rad);padding:12px">
        <div style="font-size:var(--fs-sm);font-weight:800;color:var(--b);margin-bottom:10px">💼 حياته في الشركة</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:${Object.keys(byWallet).length ? '10' : '0'}px">
          ${memberDays !== null ? pRowHelper('📅 عميل منذ', memberDays + ' يوم') : ''}
          ${pRowHelper('📦 إجمالي الأوردرات', cOrds.length + ' أوردر')}
          ${pRowHelper('💵 إجمالي المبيعات', fmtNum(tot) + ' ج')}
          ${totalCost > 0 ? pRowHelper('🔴 التكلفة الإجمالية', fmtNum(totalCost) + ' ج') : ''}
          ${totalCost > 0 ? pRowHelper('🟢 إجمالي الربح', fmtNum(totalProfit) + ' ج' + (profitPct !== null ? ' (' + profitPct + '%)' : '')) : ''}
        </div>
        ${Object.keys(byWallet).length ? `
        <div style="font-size:var(--fs-xs);font-weight:800;color:var(--dim2);margin-bottom:6px">💳 توزيع المدفوعات على المحافظ</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${Object.entries(byWallet).sort((a, b) => b[1] - a[1]).map(([wn, amt]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--bg3);border-radius:6px">
            <span style="font-size:var(--fs-sm);color:var(--dim2)">${wn}</span>
            <span style="font-size:var(--fs-base);font-weight:800;color:var(--g)">${fmtNum(amt)} ج</span>
          </div>`).join('')}
        </div>` : ''}
      </div>` : ''}
    </div>

    <!-- ── متابعات ── -->
    <div id="ptab-pane-followups" class="hide">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:var(--fs-base);font-weight:800;color:var(--dim2)">📞 سجل المتابعة</div>
        <button class="btn btn-b btn-sm" onclick="openFollowupModal('${id}')">＋ متابعة جديدة</button>
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
        <div style="font-size:var(--fs-sm);font-weight:800;color:var(--dim2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">📋 بيانات العميل</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
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
        ${tags.length ? `<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">${tags.map(t => `<span class="tag" style="background:${TAG_COL[t] || 'var(--hover)'}">${TAG_LABELS[t] || t}</span>`).join('')}</div>` : ''}
        ${c.notes ? `<div style="margin-top:8px;padding:8px;background:var(--bg3);border-radius:var(--rad);font-size:var(--fs-base);color:var(--dim2)">📝 ${c.notes}</div>` : ''}
        ${c.internalNotes ? `<div style="margin-top:8px;padding:10px 12px;background:rgba(255,61,110,.06);border:1px solid rgba(255,61,110,.2);border-right:3px solid var(--r);border-radius:var(--rad);font-size:var(--fs-base);color:var(--snow);line-height:1.7">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px">
            <span style="font-size:var(--fs-xs);font-weight:800;color:var(--r)">🔒 ملاحظات داخلية</span>
            ${c.internalNotesLastEdit ? `<span style="font-size:var(--fs-tiny);color:var(--dim2);font-weight:700">${c.internalNotesLastEdit.byName || ''}${c.internalNotesLastEdit.at?.toDate ? ' · ' + c.internalNotesLastEdit.at.toDate().toLocaleDateString('ar-EG') : ''}</span>` : ''}
          </div>
          <div style="white-space:pre-wrap">${c.internalNotes.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch])}</div>
        </div>` : ''}
      </div>
      ${c.status === 'legacy' ? `
      <div style="margin-bottom:14px;background:rgba(150,150,170,.06);border:1px solid rgba(150,150,170,.2);border-radius:var(--rad);padding:12px">
        <div style="font-size:var(--fs-sm);font-weight:800;color:#aaa;margin-bottom:10px">📁 بيانات العميل القديم</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${c.totalSpentLegacy > 0 ? pRowHelper('💰 إجمالي الإنفاق', fmtNum(c.totalSpentLegacy) + ' ج') : ''}
          ${c.lastOrderDateLegacy ? pRowHelper('📅 آخر طلب', c.lastOrderDateLegacy) : ''}
          ${c.legacyProjects ? pRowHelper('📦 مشاريع سابقة', c.legacyProjects) : ''}
        </div>
        ${c.legacyNotes ? `<div style="margin-top:8px;padding:8px;background:var(--bg3);border-radius:var(--rad);font-size:var(--fs-base);color:var(--dim2)">📝 ${c.legacyNotes}</div>` : ''}
      </div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--line)">
        <button class="btn btn-ghost btn-sm" onclick="editClient('${id}')">✏️ تعديل</button>
        ${c.status === 'legacy' ? `<button class="btn btn-g btn-sm" onclick="window.convertToActive('${id}')">🟢 تحويل لنشط</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="deleteClient('${id}')" style="margin-right:auto">🗑 حذف</button>
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
        <div style="font-size:var(--fs-sm);font-weight:800;color:var(--p)">📊 توزيع العملاء حسب الشريحة (RFM)</div>
        <div style="font-size:var(--fs-sm);color:var(--dim2)">إجمالي CLV: <b style="color:var(--g)">${fmtNum(totalClv)} ج</b></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${visible.map(s => {
          const st = SEG_STYLE[s] || SEG_STYLE.normal || { bg: 'var(--bg3)', fg: 'var(--dim2)' };
          const active = currentSeg === s;
          return `<button onclick="filterBySegment('${active ? '' : s}')" style="padding:5px 10px;border-radius:20px;border:1.5px solid ${active ? st.fg : st.fg + '40'};background:${active ? st.fg + '25' : st.bg};color:${st.fg};font-size:var(--fs-xs);font-weight:800;cursor:pointer;font-family:inherit;transition:var(--trans)">${labels[s] || s} <span style="background:${active ? 'var(--bg1)' : st.fg + '18'};padding:1px 6px;border-radius:10px;margin-right:3px">${counts[s]}</span></button>`;
        }).join('')}
        ${currentSeg ? `<button onclick="filterBySegment('')" style="padding:5px 10px;border-radius:20px;border:1px solid var(--line);background:var(--bg3);color:var(--dim2);font-size:var(--fs-xs);font-weight:700;cursor:pointer;font-family:inherit">✕ مسح الفلتر</button>` : ''}
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
  });
}
