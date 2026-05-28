// ════════════════════════════════════════════════════════════════════
// features/employee-control/quick-actions.js
// Quick-action modals for the Employee Control Center.
// Every submit calls a CENTRAL action in employee-actions.js (PC2 / A1).
// No direct Firestore writes here — view + orchestration only (PC1.5 / H1.1).
// ════════════════════════════════════════════════════════════════════

import { employeeActions } from '../../employee-actions.js';
import { getRoleDefaultPermissions } from '../../core/permissions-matrix.js';
import { ROLE_LABELS, esc } from './render.js';

// Local copies of the incident catalog (single concept, kept in sync with
// features/employee-profile — small constants, no logic).
const INCIDENT_TYPES = {
  design_rejected:    'تصميم مرفوض',
  order_late:         'أوردر متأخر',
  customer_complaint: 'شكوى عميل',
  attendance:         'مخالفة حضور',
  quality:            'مشكلة جودة',
  other:              'أخرى',
};
const SEVERITIES = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع' };

const HOST_ID = 'ec-modal-host';

function host() {
  let h = document.getElementById(HOST_ID);
  if (!h) { h = document.createElement('div'); h.id = HOST_ID; document.body.appendChild(h); }
  return h;
}

function closeModal() { host().innerHTML = ''; }

// Generic modal: title + body HTML + submit handler.
// onSubmit(formEl) → returns a result-contract { ok, errors[] } (or throws).
function openModal({ title, body, submitLabel = '✓ تأكيد', onSubmit, danger = false }) {
  const h = host();
  h.innerHTML = `
    <div class="ec-modal-ov" data-ov="1">
      <div class="ec-modal-card" role="dialog" aria-modal="true">
        <div class="ec-modal-head"><h3>${esc(title)}</h3>
          <button type="button" class="ec-modal-x" data-close="1">✕</button></div>
        <form class="ec-modal-body" id="ec-form">${body}</form>
        <div class="ec-modal-foot">
          <button type="button" class="btn btn-ghost" data-close="1">إلغاء</button>
          <button type="button" class="btn ${danger ? 'btn-r' : 'btn-y'}" id="ec-submit">${esc(submitLabel)}</button>
        </div>
      </div>
    </div>`;

  const ov = h.querySelector('.ec-modal-ov');
  h.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  ov.addEventListener('click', e => { if (e.target.dataset.ov) closeModal(); });

  const submit = h.querySelector('#ec-submit');
  submit.addEventListener('click', async () => {
    const form = h.querySelector('#ec-form');
    submit.disabled = true; const orig = submit.textContent; submit.textContent = 'جاري...';
    try {
      const res = await onSubmit(form);
      if (res && res.ok === false) {
        window.__ecToast?.(res.errors?.[0] || 'فشل العملية', 'err');
        submit.disabled = false; submit.textContent = orig;
        return;
      }
      window.__ecToast?.('✅ تم بنجاح', 'ok');
      closeModal();
    } catch (e) {
      window.__ecToast?.('❌ ' + (e.message || 'خطأ'), 'err');
      submit.disabled = false; submit.textContent = orig;
    }
  });
}

const fld = (label, inner) => `<label class="ec-fld"><span>${esc(label)}</span>${inner}</label>`;
const opt = (v, l, sel = false) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
const today = () => new Date().toISOString().slice(0, 10);

// ── 1) إسناد مهمة ────────────────────────────────────────────────────
function taskModal(emp, ctx) {
  openModal({
    title: `📋 إسناد مهمة — ${esc(emp.name || '')}`,
    body:
      fld('عنوان المهمة', `<input class="inp" id="f-title" placeholder="مثال: مراجعة أوردرات اليوم">`) +
      fld('الوصف', `<textarea class="inp" id="f-desc" rows="3"></textarea>`) +
      fld('الأولوية', `<select class="inp" id="f-pri">${opt('normal', 'عادي', true)}${opt('urgent', 'عاجل')}${opt('low', 'منخفض')}</select>`) +
      fld('تاريخ الاستحقاق', `<input class="inp" type="date" id="f-due">`),
    submitLabel: '📋 إسناد',
    onSubmit: (f) => employeeActions.addEmployeeTask({
      db: ctx.db,
      title: f.querySelector('#f-title').value,
      description: f.querySelector('#f-desc').value,
      priority: f.querySelector('#f-pri').value,
      dueDate: f.querySelector('#f-due').value,
      assignedToUid: emp.authUid || emp._id,
      assignedToName: emp.name || '',
      userId: ctx.me.uid, userName: ctx.me.name,
    }),
  });
}

// ── 2) تسجيل إخفاق ───────────────────────────────────────────────────
function incidentModal(emp, ctx) {
  openModal({
    title: `⚠️ تسجيل إخفاق — ${esc(emp.name || '')}`,
    danger: true,
    body:
      fld('النوع', `<select class="inp" id="f-type">${Object.entries(INCIDENT_TYPES).map(([k, v]) => opt(k, v)).join('')}</select>`) +
      fld('الخطورة', `<select class="inp" id="f-sev">${Object.entries(SEVERITIES).map(([k, v], i) => opt(k, v, i === 0)).join('')}</select>`) +
      fld('العنوان', `<input class="inp" id="f-title" placeholder="وصف مختصر">`) +
      fld('التفاصيل', `<textarea class="inp" id="f-desc" rows="3"></textarea>`) +
      fld('التاريخ', `<input class="inp" type="date" id="f-date" value="${today()}">`),
    submitLabel: '⚠️ تسجيل',
    onSubmit: (f) => employeeActions.addIncident({
      db: ctx.db,
      employeeId: emp._id, employeeName: emp.name || '', authUid: emp.authUid || '',
      date: f.querySelector('#f-date').value || today(),
      type: f.querySelector('#f-type').value,
      severity: f.querySelector('#f-sev').value,
      title: f.querySelector('#f-title').value,
      description: f.querySelector('#f-desc').value,
      userId: ctx.me.uid, userName: ctx.me.name,
    }),
  });
}

// ── 3) خصم / مكافأة (مالي عبر FSE) ──────────────────────────────────
function financeModal(emp, ctx) {
  const wopts = (ctx.wallets || []).map(w => opt(w._id, `${w.name} · ${(parseFloat(w.balance) || 0).toLocaleString('ar-EG')} ج`)).join('');
  openModal({
    title: `💰 حركة مالية — ${esc(emp.name || '')}`,
    body:
      fld('النوع', `<select class="inp" id="f-kind">${opt('bonus', '🎁 مكافأة', true)}${opt('deduction', '⚠️ خصم')}</select>`) +
      fld('المبلغ (ج)', `<input class="inp" type="number" min="1" step="any" id="f-amt">`) +
      fld('المحفظة', `<select class="inp" id="f-wallet"><option value="">— اختر —</option>${wopts}</select>`) +
      fld('ملاحظة', `<input class="inp" id="f-note">`),
    submitLabel: '💰 تسجيل',
    onSubmit: (f) => {
      const kind = f.querySelector('#f-kind').value;
      const isDeduction = kind === 'deduction';
      const walletId = f.querySelector('#f-wallet').value;
      const w = (ctx.wallets || []).find(x => x._id === walletId);
      return employeeActions.recordSalaryPayment({
        db: ctx.db,
        employeeId: emp._id, employeeName: emp.name || '',
        amount: parseFloat(f.querySelector('#f-amt').value) || 0,
        salaryType: kind, isDeduction,
        walletId, walletName: w?.name || '',
        note: f.querySelector('#f-note').value,
        month: ctx.monthKey,
        userId: ctx.me.uid, userName: ctx.me.name,
      });
    },
  });
}

// ── 4) صلاحيات / تفعيل-تعطيل ────────────────────────────────────────
function permsModal(emp, ctx) {
  const curRole = emp.role || '';
  const curStatus = emp.status || 'active';
  const roleOpts = Object.entries(ROLE_LABELS).map(([k, v]) => opt(k, v, k === curRole)).join('');
  openModal({
    title: `🔐 صلاحيات الحساب — ${esc(emp.name || '')}`,
    body:
      fld('الدور الوظيفي', `<select class="inp" id="f-role">${roleOpts}</select>`) +
      `<div class="ec-hint">تغيير الدور يطبّق الصلاحيات الافتراضية له تلقائياً.</div>` +
      fld('حالة الحساب', `<select class="inp" id="f-status">${opt('active', '✅ نشط', curStatus === 'active')}${opt('inactive', '⏸️ معطّل', curStatus !== 'active')}</select>`) +
      (emp.authUid ? '' : `<div class="ec-hint warn">⚠️ لا يوجد حساب دخول مرتبط — تغيير الدور لن يُطبَّق على صلاحيات الدخول.</div>`),
    submitLabel: '🔐 حفظ',
    onSubmit: async (f) => {
      const newRole = f.querySelector('#f-role').value;
      const newStatus = f.querySelector('#f-status').value;
      // 1) status (always on employees doc)
      const sRes = await employeeActions.setEmployeeStatus({ db: ctx.db, employeeId: emp._id, status: newStatus });
      if (sRes.ok === false) return sRes;
      // 2) role + default permissions (only if auth account exists)
      if (newRole !== curRole && emp.authUid) {
        const perms = getRoleDefaultPermissions(newRole);
        const rRes = await employeeActions.changeUserRole({ db: ctx.db, authUid: emp.authUid, newRole, newPermissions: perms });
        if (rRes.ok === false) return rRes;
      } else if (newRole !== curRole && !emp.authUid) {
        // keep employees.role in sync even without auth account
        await employeeActions.updateEmployeeProfile({ db: ctx.db, employeeId: emp._id, profileData: { role: newRole } });
      }
      return { ok: true };
    },
  });
}

const MAP = { task: taskModal, incident: incidentModal, finance: financeModal, perms: permsModal };

// Entry point used by the controller's event delegation.
export function openQuickAction(act, emp, ctx) {
  const fn = MAP[act];
  if (fn) fn(emp, ctx);
}

export { closeModal };
