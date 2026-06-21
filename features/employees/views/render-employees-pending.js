/**
 * Business2Card ERP — features/employees/views/render-employees-pending.js
 *
 * Pure HTML builder for the Pending Actions Strip on employees.html.
 * Surfaces leave requests, incident appeals, and attendance permissions
 * awaiting manager decision — with inline approve/reject buttons.
 */

const LEAVE_TYPE = {
  annual: 'سنوية', sick: 'مرضية', casual: 'عارضة', unpaid: 'بدون أجر',
};

const PERM_TYPE = {
  late_in: 'تأخير', early_out: 'انصراف مبكر',
  mission: 'مأمورية', remote: 'عن بُعد', partial: 'جزئي',
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * @param {Object} args
 * @param {Array}  args.pendingLeaves     — employee_leaves with status==='pending'
 * @param {Array}  args.pendingAppeals    — employee_incidents with appeal.status==='pending'
 * @param {Array}  args.pendingPerms      — attendance_permissions with status==='pending'
 * @param {Map}    args.empNameMap        — empId/uid → employee name
 * @returns {string} HTML
 */
export function buildPendingStripHTML({ pendingLeaves = [], pendingAppeals = [], pendingPerms = [], empNameMap = new Map() }) {
  const total = pendingLeaves.length + pendingAppeals.length + pendingPerms.length;
  if (!total) return '';

  const getName = (item) => item.employeeName || empNameMap.get(item.employeeId) || empNameMap.get(item.employeeUid) || '—';

  const leaveItems = pendingLeaves.map(lv => {
    const name = getName(lv);
    const typeLbl = LEAVE_TYPE[lv.type] || lv.type || 'إجازة';
    const dateRange = lv.startDate === lv.endDate
      ? lv.startDate
      : `${lv.startDate} → ${lv.endDate}`;
    return `<div class="pend-item">
      <div class="pend-info">
        <span class="pend-ico">🌴</span>
        <div class="min-w-0">
          <div class="pend-name">${esc(name)}</div>
          <div class="pend-detail">${esc(typeLbl)} · ${esc(dateRange)}${lv.days ? ' · ' + lv.days + 'ي' : ''}${lv.reason ? ' · ' + esc(lv.reason) : ''}</div>
        </div>
      </div>
      <div class="pend-btns">
        <button type="button" class="btn btn-g btn-xs" data-act="pend-approve-leave" data-id="${esc(lv._id)}" title="موافقة">✅</button>
        <button type="button" class="btn btn-ghost btn-xs" data-act="pend-reject-leave" data-id="${esc(lv._id)}" title="رفض">🚫</button>
      </div>
    </div>`;
  });

  const appealItems = pendingAppeals.map(inc => {
    const name = inc.employeeName || empNameMap.get(inc.employeeId) || empNameMap.get(inc.authUid) || '—';
    return `<div class="pend-item">
      <div class="pend-info">
        <span class="pend-ico">🛡️</span>
        <div class="min-w-0">
          <div class="pend-name">${esc(name)}</div>
          <div class="pend-detail">تظلّم: ${esc(inc.reason || inc.type || '—')}${inc.appeal?.reason ? ' · ' + esc(inc.appeal.reason) : ''}</div>
        </div>
      </div>
      <div class="pend-btns">
        <button type="button" class="btn btn-g btn-xs" data-act="pend-accept-appeal" data-id="${esc(inc._id)}" title="قبول التظلّم">✅</button>
        <button type="button" class="btn btn-ghost btn-xs" data-act="pend-reject-appeal" data-id="${esc(inc._id)}" title="رفض التظلّم">🚫</button>
      </div>
    </div>`;
  });

  const permItems = pendingPerms.map(p => {
    const name = getName(p);
    const typeLbl = PERM_TYPE[p.type] || p.type || 'إذن';
    const mins = parseInt(p.minutes) || 0;
    return `<div class="pend-item">
      <div class="pend-info">
        <span class="pend-ico">🟡</span>
        <div class="min-w-0">
          <div class="pend-name">${esc(name)}</div>
          <div class="pend-detail">${esc(typeLbl)}${mins ? ' · ' + mins + 'د' : ''}${p.reason ? ' · ' + esc(p.reason) : ''}</div>
        </div>
      </div>
      <div class="pend-btns">
        <button type="button" class="btn btn-g btn-xs" data-act="pend-approve-perm" data-id="${esc(p._id)}" title="اعتماد">✅</button>
        <button type="button" class="btn btn-ghost btn-xs" data-act="pend-reject-perm" data-id="${esc(p._id)}" title="رفض">🚫</button>
      </div>
    </div>`;
  });

  return `<div class="pend-strip">
    <div class="pend-strip-hdr">
      <span class="pend-strip-title">⏳ إجراءات معلّقة</span>
      <span class="pend-strip-count">${total}</span>
    </div>
    <div class="pend-strip-list">
      ${leaveItems.join('')}${appealItems.join('')}${permItems.join('')}
    </div>
  </div>`;
}
