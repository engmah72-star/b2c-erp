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
  });
}
