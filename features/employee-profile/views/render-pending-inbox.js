/**
 * Business2Card ERP — features/employee-profile/views/render-pending-inbox.js
 *
 * ━━━ «جسر القرارات» — PENDING DECISIONS INBOX (البند 1 من الخطة المركزية) ━━━
 *
 * Pure HTML builder لشريط الطلبات المعلّقة الخاصة بموظفٍ واحد، يُعرض أعلى
 * البروفايل ليرى الأدمن — من حيث يدير الموظف — ما ينتظر قراره دون مغادرة الصفحة.
 *
 * يجمع من بيانات مُحمَّلة أصلاً في الذاكرة (صفر استعلام جديد لثلاثة منها):
 *   - تظلّمات الإخفاقات   (employee_incidents · appeal.status === 'pending')
 *   - طلبات الإجازات      (employee_leaves · status === 'pending')
 *   - أذونات الحضور       (attendance_permissions · status === 'pending')
 *   - الطلبات المالية     (payment_requests — عرض فقط + رابط لطلبات الإدارة)
 *
 * عرض فقط (L1): القرار يبقى في employee-actions.js عبر window.decide* القائمة؛
 * هذا الملف لا يكتب ولا يحسب أرصدة/تواريخ — يبني HTML فقط.
 *
 * الطلبات المالية متعددة الخطوات (execute→receipt→confirm→approve في
 * approval-actions.js) فلا تُقرَّر inline هنا — تُعرض كعدّاد + رابط عميق إلى
 * admin-requests.html (طابور القرارات المركزي الموجود).
 */

// Single source لتسميات أنواع الإجازات (تفادي التكرار — يُعاد استخدامها من تبويب الحضور).
import { LEAVE_TYPES } from './render-attendance.js';

const PERM_TYPES = {
  late_in: { lbl: 'تأخير صباحي', ico: '🕒' },
  mission: { lbl: 'مأمورية',     ico: '🚗' },
  remote:  { lbl: 'عمل عن بُعد',  ico: '🏠' },
  partial: { lbl: 'إذن جزئي',    ico: '⏳' },
  break_extension: { lbl: 'تمديد راحة', ico: '☕' },
};

const PAY_TYPES = {
  salary:           { lbl: 'مرتب',          ico: '💰' },
  advance:          { lbl: 'سلفة',          ico: '💵' },
  bonus:            { lbl: 'مكافأة',        ico: '🎁' },
  deduction:        { lbl: 'خصم',           ico: '➖' },
  supplier_payment: { lbl: 'دفعة مورد',     ico: '🏭' },
  client_return:    { lbl: 'مرتجع عميل',    ico: '↩️' },
  other:            { lbl: 'طلب مالي',      ico: '💸' },
};

const PAY_STATUS = {
  requested:        'بانتظار التنفيذ',
  awaiting_receipt: 'بانتظار الإيصال',
  pending:          'بانتظار التأكيد',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtNum(n) {
  return (parseFloat(n) || 0).toLocaleString('ar-EG');
}

// صفّ قابل للقرار: عنوان + سطر فرعي + زرّا موافقة/رفض يستدعيان window.decide*.
function decidableRow({ ico, title, sub, onApprove, onReject, approveLbl = '✅ موافقة', rejectLbl = '🚫 رفض' }) {
  return `<div class="ep-pi-row">
    <div class="ep-pi-row-main">
      <div class="ep-pi-row-title">${ico} ${esc(title)}</div>
      ${sub ? `<div class="ep-pi-row-sub">${esc(sub)}</div>` : ''}
    </div>
    <div class="ep-pi-row-acts">
      <button type="button" class="btn btn-g btn-xs" onclick="${onApprove}">${approveLbl}</button>
      <button type="button" class="btn btn-r btn-xs" onclick="${onReject}">${rejectLbl}</button>
    </div>
  </div>`;
}

/**
 * يبني شريط الطلبات المعلّقة. يُرجع '' (صفر ضوضاء) عند عدم وجود أي معلّق.
 *
 * @param {Object} args
 * @param {Array}  args.appeals         — إخفاقات appeal.status==='pending' [{_id,title,reasonLabel,date,appeal:{reason}}]
 * @param {Array}  args.leaves          — إجازات status==='pending' [{_id,type,startDate,endDate,days,reason}]
 * @param {Array}  args.permissions     — أذونات status==='pending' [{_id,type,date,minutes,reason}]
 * @param {Array}  args.paymentRequests — طلبات مالية معلّقة [{_id,type,amount,status}]
 * @returns {string} HTML
 */
export function buildPendingInboxHTML({
  appeals = [], leaves = [], permissions = [], paymentRequests = [],
} = {}) {
  const total = appeals.length + leaves.length + permissions.length + paymentRequests.length;
  if (!total) return '';

  const sections = [];

  if (appeals.length) {
    sections.push(`<div class="ep-pi-sec">
      <div class="ep-pi-sec-h">⚖️ تظلّمات على إخفاقات <span class="ep-pi-n">${appeals.length}</span></div>
      ${appeals.map(a => decidableRow({
        ico: '⚖️',
        title: 'تظلّم على: ' + (a.title || a.reasonLabel || 'ملاحظة'),
        sub: [a.date, a.appeal?.reason ? 'السبب: ' + a.appeal.reason : ''].filter(Boolean).join(' · '),
        onApprove: `decideAppeal('${a._id}','accepted')`,
        onReject: `decideAppeal('${a._id}','rejected')`,
        approveLbl: '✅ قبول', rejectLbl: '🚫 رفض',
      })).join('')}
    </div>`);
  }

  if (leaves.length) {
    sections.push(`<div class="ep-pi-sec">
      <div class="ep-pi-sec-h">🌴 طلبات إجازة <span class="ep-pi-n">${leaves.length}</span></div>
      ${leaves.map(l => {
        const t = LEAVE_TYPES[l.type] || { lbl: l.type || 'إجازة', ico: '🌴' };
        const range = l.endDate && l.endDate !== l.startDate ? `${l.startDate} → ${l.endDate}` : (l.startDate || '');
        return decidableRow({
          ico: t.ico,
          title: `${t.lbl} — ${range} (${fmtNum(l.days)} يوم)`,
          sub: l.reason || '',
          onApprove: `decideLeave('${l._id}','approved')`,
          onReject: `decideLeave('${l._id}','rejected')`,
        });
      }).join('')}
    </div>`);
  }

  if (permissions.length) {
    sections.push(`<div class="ep-pi-sec">
      <div class="ep-pi-sec-h">🕒 أذونات حضور <span class="ep-pi-n">${permissions.length}</span></div>
      ${permissions.map(p => {
        const t = PERM_TYPES[p.type] || { lbl: p.type || 'إذن', ico: '🕒' };
        const mins = p.minutes ? ` (${fmtNum(p.minutes)} د)` : '';
        return decidableRow({
          ico: t.ico,
          title: `${t.lbl} — ${p.date || ''}${mins}`,
          sub: p.reason || '',
          onApprove: `decidePermission('${p._id}','approved')`,
          onReject: `decidePermission('${p._id}','rejected')`,
        });
      }).join('')}
    </div>`);
  }

  // الطلبات المالية: عرض فقط + رابط عميق (القرار متعدد الخطوات في admin-requests).
  if (paymentRequests.length) {
    sections.push(`<div class="ep-pi-sec">
      <div class="ep-pi-sec-h">💸 طلبات مالية <span class="ep-pi-n">${paymentRequests.length}</span></div>
      ${paymentRequests.map(pr => {
        const t = PAY_TYPES[pr.type] || PAY_TYPES.other;
        const st = PAY_STATUS[pr.status] || pr.status || '';
        return `<div class="ep-pi-row">
          <div class="ep-pi-row-main">
            <div class="ep-pi-row-title">${t.ico} ${esc(t.lbl)} — ${fmtNum(pr.amount)} ج</div>
            <div class="ep-pi-row-sub">${esc(st)}</div>
          </div>
          <div class="ep-pi-row-acts">
            <a class="btn btn-b btn-xs" href="admin-requests.html" data-page="admin-requests">فتح في طلبات الإدارة ←</a>
          </div>
        </div>`;
      }).join('')}
    </div>`);
  }

  return `<div class="ep-pi-card" id="ep-pending-inbox-card">
    <div class="ep-pi-head">
      <span class="ep-pi-title">🔔 معلّق على هذا الموظف</span>
      <span class="ep-pi-badge">${total}</span>
    </div>
    <div class="ep-pi-body">${sections.join('')}</div>
  </div>`;
}
