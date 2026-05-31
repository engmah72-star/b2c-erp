/**
 * Business2Card ERP — features/employees/views/render-employees-modals.js
 *
 * ━━━ EMPLOYEES NON-FINANCIAL MODAL SCAFFOLD (RULE L1.5 + Phase 2.3 pattern) ━━━
 *
 * Static HTML scaffold for the two NON-FINANCIAL overlays on employees.html —
 * the absent-WhatsApp reminder modal (#ov-absent-wa) and the new/edit employee
 * form modal (#ov-emp). Extracted VERBATIM from the former inline markup
 * (Phase 3C). Output is BYTE-IDENTICAL to the former inline HTML (verified by
 * tests/employees-views-byte-identical.mjs).
 *
 * These overlays carry no dynamic inputs — they are pure scaffold whose inner
 * fields are populated at runtime by the page (openAbsentWa / openEditEmp).
 * The page injects buildAllEmployeeModalsHTML() into a #modal-host div at
 * bootstrap, SYNCHRONOUSLY, BEFORE the [data-close]/[data-act] wiring runs — so
 * the data-close="ov-absent-wa"/"ov-emp" and data-act="save-emp" handlers wire
 * up exactly as they did when the markup was inline.
 *
 * FINANCIAL overlays (#ov-payroll, #ov-pay-one) are intentionally NOT here —
 * they remain inline in employees.html (out of scope).
 */

/* ── WhatsApp reminder for absentees (former inline lines 122–138) ── */
export function buildAbsentWaModalHTML() {
  return `<!-- MODAL: واتساب للغائبين -->
<div class="overlay" id="ov-absent-wa">
  <div class="modal emp2-modal-480">
    <div class="modal-head">
      <span class="modal-title">💬 إرسال تذكير للغائبين</span>
      <button type="button" class="modal-x" data-close="ov-absent-wa">✕</button>
    </div>
    <div class="modal-body">
      <div class="fg emp2-mb-12">
        <label class="txt-meta-sm">نص الرسالة</label>
        <textarea class="inp emp2-wa-textarea" id="wa-msg-text" rows="3">مرحباً {الاسم}، نذكرك بتسجيل حضورك اليوم 🙏
إدارة Business2Card</textarea>
      </div>
      <div id="absent-emp-list"></div>
    </div>
  </div>
</div>`;
}

/* ── New / edit employee form (former inline lines 140–199) ── */
export function buildEmployeeFormModalHTML() {
  return `<!-- MODAL: موظف جديد / تعديل -->
<div class="overlay" id="ov-emp">
  <div class="modal emp2-modal-520">
    <div class="modal-head"><span class="modal-title" id="emp-title">＋ موظف جديد</span><button type="button" class="modal-x" data-close="ov-emp">✕</button></div>
    <div class="modal-body">
      <div class="g2">
        <div class="fg"><label>الاسم *</label><input class="inp" id="e-name" placeholder="اسم الموظف"></div>
        <div class="fg"><label>الهاتف *</label><input class="inp" id="e-phone" placeholder="01xxxxxxxxx" maxlength="11"></div>
      </div>
      <div class="g2">
        <div class="fg"><label>الدور الوظيفي *</label>
          <select class="inp" id="e-role">
            <option value="">— اختر —</option>
            <option value="admin">👑 Admin</option>
            <option value="operation_manager">📋 مدير عمليات</option>
            <option value="customer_service">💬 خدمة عملاء</option>
            <option value="graphic_designer">🎨 مصمم جرافيك</option>
            <option value="design_operator">⚙️ مشغل تصميم</option>
            <option value="production_agent">🏭 مندوب تنفيذ</option>
            <option value="shipping_officer">🚚 موظف شحن</option>
            <option value="wallet_manager">💰 محاسب</option>
          </select>
        </div>
        <div class="fg"><label>الرقم القومي</label><input class="inp" id="e-nid" placeholder="14 رقم"></div>
      </div>
      <div class="g2">
        <div class="fg"><label>تاريخ التعيين</label><input class="inp" id="e-start" type="date"></div>
        <div class="fg"><label>الحالة</label><select class="inp" id="e-status"><option value="active">✅ نشط</option><option value="inactive">⏸️ غير نشط</option></select></div>
      </div>
      <div class="emp2-box-green">
        <div class="emp2-box-green-title">💰 المالية والإجازات</div>
        <div class="g2">
          <div class="fg"><label>المرتب الشهري (ج) *</label><input class="inp" id="e-salary" type="number" placeholder="3000"></div>
          <div class="fg hide" id="e-commission-row">
            <label>نسبة العمولة %</label>
            <input class="inp" id="e-commission" type="number" placeholder="5" step="0.5">
          </div>
        </div>
        <div class="g2 emp2-mt-10">
          <div class="fg"><label>رصيد الإجازة السنوية (يوم)</label><input class="inp" id="e-leave-quota" type="number" placeholder="21" min="0" max="365"></div>
          <div class="fg"><label>عمولة لكل أوردر (ج)</label><input class="inp" id="e-commission-order" type="number" placeholder="0" min="0"></div>
        </div>
        <div id="e-commission-info" class="emp2-commission-info">
          💡 العمولة تُحسب على إجمالي البيع لكل أوردر طباعة يسحبه المصمم
        </div>
      </div>
      <div class="emp2-box-blue">
        <div class="emp2-box-blue-title">🔐 بيانات الدخول (تُنشأ تلقائياً)</div>
        <div class="emp2-login-hint">
          • اسم المستخدم: <strong class="text-snow" id="e-preview-email">—</strong><br>
          • كلمة السر المبدئية: <strong class="text-y">123456</strong>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-close="ov-emp">إلغاء</button>
      <button type="button" class="btn btn-g" id="save-btn" data-act="save-emp">✓ حفظ</button>
    </div>
  </div>
</div>`;
}

/* ── Aggregator: both non-financial modals, joined exactly as they sat inline ── */
export function buildAllEmployeeModalsHTML() {
  return buildAbsentWaModalHTML() + '\n\n' + buildEmployeeFormModalHTML();
}
