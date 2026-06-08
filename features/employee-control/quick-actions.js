// ════════════════════════════════════════════════════════════════════
// features/employee-control/quick-actions.js
// Quick-action modals for the Employee Control Center.
// Every submit calls a CENTRAL action in employee-actions.js (PC2 / A1).
// No direct Firestore writes here — view + orchestration only (PC1.5 / H1.1).
// ════════════════════════════════════════════════════════════════════

import { employeeActions } from '../../employee-actions.js';
import { getRoleDefaultPermissions } from '../../core/permissions-matrix.js';
import { uploadEmployeeFile, EMPLOYEE_FILE_KINDS } from '../../core/storage-helpers.js';
import { resolveReasons, REASON_TYPE_META } from '../../core/incident-reasons.js';
import { ROLE_LABELS, esc } from './render.js';

// الأسباب تأتي من core/incident-reasons.js (السبب يُحصر به التكرار) — مُجمّعة
// بالنوع. الخطورة قائمة ثابتة صغيرة.
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
function openModal({ title, body, submitLabel = '✓ تأكيد', onSubmit, onMount, danger = false }) {
  const h = host();
  h.innerHTML = `
    <div class="ec-modal-ov" data-ov="1">
      <div class="ec-modal-card${danger ? ' danger' : ''}" role="dialog" aria-modal="true">
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

  if (typeof onMount === 'function') onMount(h.querySelector('#ec-form'));

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
const fldRow = (...fields) => `<div class="ec-fld-row">${fields.join('')}</div>`;
const opt = (v, l, sel = false) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
const today = () => new Date().toISOString().slice(0, 10);

// ── Image upload dropzone (view markup + behaviour wiring) ──────────────
// المعاينة محلية (object URL) قبل الرفع؛ الرفع الفعلي يتم وقت الـ submit.
const MAX_IMG_BYTES = 10 * 1024 * 1024; // 10MB

function imageField(label, hint = 'صورة واحدة · حتى 10MB') {
  return `
    <div class="ec-fld">
      <span>${esc(label)}</span>
      <label class="ec-upload">
        <input type="file" id="f-img" accept="image/*" hidden>
        <div class="ec-upload-empty" id="f-img-empty">
          <span class="ec-upload-ico">📷</span>
          <span class="ec-upload-txt">اضغط لاختيار صورة أو التقاطها</span>
          <span class="ec-upload-hint">${esc(hint)}</span>
        </div>
        <div class="ec-upload-preview" id="f-img-preview" hidden>
          <img id="f-img-thumb" alt="معاينة الصورة">
          <button type="button" class="ec-upload-clear" id="f-img-clear">✕ إزالة</button>
        </div>
      </label>
    </div>`;
}

function wireImageUpload(form) {
  if (!form) return;
  const input   = form.querySelector('#f-img');
  const empty   = form.querySelector('#f-img-empty');
  const preview = form.querySelector('#f-img-preview');
  const thumb   = form.querySelector('#f-img-thumb');
  const clear   = form.querySelector('#f-img-clear');
  if (!input) return;
  let objUrl = null;
  const reset = () => {
    input.value = '';
    if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
    preview.hidden = true; empty.hidden = false; thumb.removeAttribute('src');
  };
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return reset();
    if (!(file.type || '').startsWith('image/')) {
      window.__ecToast?.('الملف يجب أن يكون صورة', 'err'); return reset();
    }
    if (file.size > MAX_IMG_BYTES) {
      window.__ecToast?.('حجم الصورة أكبر من 10MB', 'err'); return reset();
    }
    if (objUrl) URL.revokeObjectURL(objUrl);
    objUrl = URL.createObjectURL(file);
    thumb.src = objUrl; preview.hidden = false; empty.hidden = true;
  });
  clear?.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation(); reset();
  });
}

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
// خيارات «السبب/التصنيف» مجمّعة بالنوع عبر optgroup (موحّدة مع بروفايل الموظف).
function reasonOptionsHTML(ctx) {
  const reasons = resolveReasons(ctx.incidentReasons || []);
  const byType = new Map();
  reasons.forEach(r => { (byType.get(r.type) || byType.set(r.type, []).get(r.type)).push(r); });
  let html = '';
  for (const [type, list] of byType) {
    const m = REASON_TYPE_META[type] || REASON_TYPE_META.other;
    html += `<optgroup label="${esc(m.ico + ' ' + m.lbl)}">` +
      list.map(r => `<option value="${esc(r.code)}" data-type="${esc(r.type)}" data-label="${esc(r.label)}">${esc(r.label)}</option>`).join('') +
      `</optgroup>`;
  }
  return html;
}

function incidentModal(emp, ctx) {
  openModal({
    title: `⚠️ تسجيل إخفاق — ${esc(emp.name || '')}`,
    danger: true,
    onMount: wireImageUpload,
    body:
      fld('السبب / التصنيف', `<select class="inp" id="f-reason">${reasonOptionsHTML(ctx)}</select>`) +
      fldRow(
        fld('الخطورة', `<select class="inp" id="f-sev">${Object.entries(SEVERITIES).map(([k, v], i) => opt(k, v, i === 1)).join('')}</select>`),
        fld('التاريخ', `<input class="inp" type="date" id="f-date" value="${today()}">`),
      ) +
      fld('العنوان (اختياري)', `<input class="inp" id="f-title" placeholder="تفصيل إضافي للمخالفة">`) +
      fld('التفاصيل (اختياري)', `<textarea class="inp" id="f-desc" rows="3" placeholder="اشرح ما حدث"></textarea>`) +
      imageField('📸 صورة المخالفة (اختياري)'),
    submitLabel: '⚠️ تسجيل',
    onSubmit: async (f) => {
      // 1) ارفع صورة المخالفة أولاً (إن وُجدت) عبر الـ storage helper المركزي
      const file = f.querySelector('#f-img')?.files?.[0] || null;
      let imageUrl = '', imagePath = '';
      if (file) {
        try {
          const up = await uploadEmployeeFile({
            employeeId: emp._id, file, kind: EMPLOYEE_FILE_KINDS.INCIDENTS,
          });
          imageUrl = up.url; imagePath = up.path;
        } catch (e) {
          return { ok: false, errors: ['فشل رفع الصورة: ' + (e.message || 'خطأ')], warnings: [] };
        }
      }
      // 2) اشتقّ السبب/النوع من الخيار المختار
      const reasonSel = f.querySelector('#f-reason');
      const reasonOpt = reasonSel?.selectedOptions?.[0];
      const reasonCode = reasonSel?.value || '';
      const reasonLabel = reasonOpt?.dataset?.label || '';
      const type = reasonOpt?.dataset?.type || 'other';
      const title = f.querySelector('#f-title').value;
      // 3) سجّل الإخفاق عبر الـ action المركزي
      return employeeActions.addIncident({
        db: ctx.db,
        employeeId: emp._id, employeeName: emp.name || '', authUid: emp.authUid || '',
        date: f.querySelector('#f-date').value || today(),
        type, severity: f.querySelector('#f-sev').value,
        reasonCode, reasonLabel,
        title: title || reasonLabel,
        description: f.querySelector('#f-desc').value,
        imageUrl, imagePath,
        userId: ctx.me.uid, userName: ctx.me.name,
      });
    },
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

// ── 5) جدول العمل (مواعيد العمل) — set days + start/end from the board ──
const DAY_NAMES_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
function scheduleModal(emp, ctx) {
  const ws = emp.workSchedule || {};
  const sel = new Set(Array.isArray(ws.days) && ws.days.length ? ws.days : [0, 1, 2, 3, 4]);
  const pills = `<div class="ec-day-pills" id="f-days">${[0,1,2,3,4,5,6]
    .map(d => `<button type="button" class="ec-day-pill${sel.has(d) ? ' on' : ''}" data-d="${d}">${DAY_NAMES_AR[d]}</button>`).join('')}</div>`;
  openModal({
    title: `🕐 جدول العمل — ${esc(emp.name || '')}`,
    body:
      fld('📅 أيام العمل', pills) +
      fldRow(
        fld('⏰ وقت البدء', `<input class="inp" type="time" id="f-start" value="${esc(ws.startTime || '09:00')}">`),
        fld('🏁 وقت الانتهاء', `<input class="inp" type="time" id="f-end" value="${esc(ws.endTime || '17:00')}">`),
      ) +
      `<div class="ec-hint">يُستخدم لحساب التأخير (سماح 15د)، أيام الغياب، والوقت الإضافي.</div>`,
    submitLabel: '💾 حفظ الجدول',
    onMount: (form) => {
      form.querySelector('#f-days')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-d]'); if (!b) return;
        const d = parseInt(b.dataset.d);
        if (sel.has(d)) sel.delete(d); else sel.add(d);
        b.classList.toggle('on');
      });
    },
    onSubmit: (f) => {
      if (!sel.size) return { ok: false, errors: ['اختر يوم عمل واحد على الأقل'], warnings: [] };
      return employeeActions.updateEmployeeSchedule({
        db: ctx.db, employeeId: emp._id,
        days: [...sel].sort((a, b) => a - b),
        startTime: f.querySelector('#f-start').value || '09:00',
        endTime: f.querySelector('#f-end').value || '17:00',
      });
    },
  });
}

const MAP = { task: taskModal, incident: incidentModal, finance: financeModal, perms: permsModal, schedule: scheduleModal };

// Entry point used by the controller's event delegation.
export function openQuickAction(act, emp, ctx) {
  const fn = MAP[act];
  if (fn) fn(emp, ctx);
}

export { closeModal };
