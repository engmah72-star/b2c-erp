/**
 * Business2Card ERP — features/employee-profile/views/render-salary.js
 *
 * ━━━ SALARIES TAB VIEW (Phase-2C · god-page decomp) ━━━
 *
 * Pure HTML builder for the salaries list (reminder + quick actions + last
 * 4 months grouped by month). No DOM, no Firestore.
 */

export const SAL_TYPE_LABELS = {
  salary:    'مرتب',
  advance:   'سلفة',
  bonus:     'مكافأة',
  deduction: 'خصم',
  other:     'أخرى',
};

export const SAL_TYPE_COLS = {
  salary:    'var(--g)',
  advance:   'var(--y)',
  bonus:     'var(--p)',
  deduction: 'var(--r)',
  other:     'var(--dim2)',
};

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const defaultFormat = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// escape for JS string literal embedded in an HTML attribute
function escJs(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Build the salaries tab content (reminder banner + quick-action buttons +
 * last 4 months grouped list).
 *
 * @param {Object} args
 * @param {Array}  args.salaries        — [{_id, txId, walletId, walletName, amount, salaryType, isDeduction, month, note, date, employeeName}, ...]
 * @param {string} args.currentMonthKey — 'YYYY-MM' (now)
 * @param {number} args.currentMonthIndex — 0-11 (for MONTHS lookup)
 * @param {number} args.currentSuggested  — مرتب مقترَح للشهر الحالي
 * @param {Function} [args.format]
 *
 * @returns {string} HTML
 */
export function buildSalariesHTML({
  salaries = [],
  currentMonthKey,
  currentMonthIndex,
  currentSuggested = 0,
  format = defaultFormat,
}) {
  const curMonthPays = salaries.filter(s => s.month === currentMonthKey);
  const curMonthTotal = curMonthPays.reduce(
    (s, t) => s + (t.isDeduction ? -(parseFloat(t.amount) || 0) : (parseFloat(t.amount) || 0)),
    0
  );
  const remaining = currentSuggested - curMonthTotal;
  const curMonthLabel = MONTHS[currentMonthIndex] || '';

  // ── reminder banner ────────────────────────────────────────────
  let reminder;
  if (curMonthPays.length === 0) {
    reminder = `<div style="background:rgba(255,170,0,.08);border:1px solid rgba(255,170,0,.2);border-radius:var(--rad);padding:10px 14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:var(--fs-base);color:var(--y)">⚠️ لم يُصرف مرتب ${curMonthLabel} بعد</span>
      <button class="btn btn-g btn-xs" onclick="openSalary()">صرف الآن</button>
    </div>`;
  } else if (remaining > 0) {
    reminder = `<div style="background:rgba(59,158,255,.06);border:1px solid rgba(59,158,255,.2);border-radius:var(--rad);padding:10px 14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:var(--fs-base);color:var(--b)">💸 مدفوع ${format(curMonthTotal)} ج · متبقي <strong>${format(remaining)} ج</strong></span>
      <button class="btn btn-b btn-xs" onclick="openSalary()">＋ دفعة</button>
    </div>`;
  } else {
    reminder = `<div style="background:rgba(0,217,126,.06);border:1px solid rgba(0,217,126,.2);border-radius:var(--rad);padding:8px 14px;margin-bottom:10px;font-size:var(--fs-base);color:var(--g);font-weight:var(--fw-bold)">✅ ${curMonthLabel} مكتمل — ${format(curMonthTotal)} ج</div>`;
  }

  // ── quick action buttons ───────────────────────────────────────
  const quickBtns = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
    <button class="btn btn-ghost btn-xs" onclick="openSalary(null,'salary')">💰 مرتب</button>
    <button class="btn btn-ghost btn-xs" onclick="openSalary(null,'advance')">💸 سلفة</button>
    <button class="btn btn-ghost btn-xs" onclick="openSalary(null,'bonus')">🎁 مكافأة</button>
    <button class="btn btn-ghost btn-xs" style="color:var(--r);border-color:rgba(255,61,110,.3)" onclick="openSalary(null,'deduction')">⚠️ خصم</button>
  </div>`;

  if (!salaries.length) {
    return reminder + quickBtns +
      '<div style="font-size:var(--fs-base);color:var(--dim2);text-align:center;padding:var(--space-md)">لا توجد سجلات بعد</div>';
  }

  // ── grouped by month (last 4 months) ────────────────────────────
  const byMonth = {};
  for (const s of salaries) {
    if (!byMonth[s.month]) byMonth[s.month] = [];
    byMonth[s.month].push(s);
  }
  const monthsHtml = Object.keys(byMonth)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 4)
    .map(mk => {
      const [yr, mo] = mk.split('-');
      const pays = byMonth[mk];
      const total = pays.reduce(
        (s, t) => s + (t.isDeduction ? -(parseFloat(t.amount) || 0) : (parseFloat(t.amount) || 0)),
        0
      );
      const lbl = (MONTHS[parseInt(mo) - 1] || mo) + ' ' + yr;
      return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding:0 2px">
        <span style="font-size:var(--fs-base);font-weight:var(--fw-extra);color:var(--dim2)">${lbl}</span>
        <span style="font-size:var(--fs-md);font-weight:var(--fw-heavy);color:var(--g)">${format(total)} ج</span>
      </div>
      ${pays.map(s => {
        const typeKey = s.salaryType || 'salary';
        const typeLabel = SAL_TYPE_LABELS[typeKey] || 'مرتب';
        const typeCol   = SAL_TYPE_COLS[typeKey]   || 'var(--g)';
        const isDeduct  = s.isDeduction || s.salaryType === 'deduction';
        const amt = parseFloat(s.amount) || 0;
        return `<div class="salary-row" style="padding:8px 12px;margin-bottom:4px">
          <div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:var(--fs-sm);font-weight:var(--fw-bold);padding:2px 8px;border-radius:12px;background:${typeCol}18;color:${typeCol}">${typeLabel}</span>
              <span class="txt-meta-sm">${escAttr(s.walletName) || '—'}</span>
            </div>
            <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:2px">${escAttr(s.note || s.date) || '—'}</div>
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-sm)">
            <span style="font-size:15px;font-weight:var(--fw-heavy);color:${isDeduct ? 'var(--r)' : 'var(--g)'}">${isDeduct ? '-' : ''}${format(amt)} ج</span>
            <button onclick="deleteSalary('${escJs(s.txId || '')}','${escJs(s._id)}','${escJs(s.walletId || '')}',${amt},${!!isDeduct},'${escJs(s.employeeName || '')}','${escJs(s.walletName || '')}')" style="width:24px;height:24px;border-radius:6px;border:1px solid rgba(240,54,96,.3);background:rgba(240,54,96,.08);color:var(--r);cursor:pointer;font-size:var(--fs-base);line-height:1">✕</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
    })
    .join('');

  return reminder + quickBtns + monthsHtml;
}
