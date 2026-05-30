/**
 * Business2Card ERP — features/employee-profile/views/render-password-card.js
 *
 * ━━━ PASSWORD CARD VIEW (RULE L1.5) ━━━
 *
 * Pure HTML builder for the admin password-management card on
 * employee-profile.html. Inline onclick handlers (copyToClipboard,
 * openSetPasswordModal, openRebuildAuthModal) still resolve at click
 * time via window.* — view doesn't need closures.
 *
 * @param {object} ctx
 *   - displayPassword: string | null  (current admin-known pw, or null)
 *   - setByName: string               (who set it)
 *   - setAtStr: string                (Arabic short date, '' if unknown)
 * @returns {string} HTML
 */
/**
 * Inline modal: admin sets a new login password for the employee.
 * @param {object} ctx
 *   - employeeName: string
 * @returns {string} HTML overlay body
 */
export function buildSetPasswordModalHTML({ employeeName }) {
  return `
    <div class="modal" style="max-width:380px;width:100%">
      <div class="modal-head" style="padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center">
        <span class="txt-bold-lg">🔑 تعيين كلمة سر لـ ${employeeName || 'الموظف'}</span>
        <button type="button" class="modal-x" onclick="this.closest('.overlay').remove()">✕</button>
      </div>
      <div style="padding:18px 20px">
        <div class="fg" style="margin-bottom:12px">
          <label>كلمة السر الجديدة *</label>
          <input class="inp" id="new-emp-pw" type="text" dir="ltr" inputmode="numeric" placeholder="6 أرقام على الأقل" value="123456" autofocus>
          <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:4px">ستظهر هنا للأدمن — أبلغ الموظف بها ليدخل ويغيّرها</div>
        </div>
        <div class="fg" style="margin-bottom:12px">
          <label style="display:flex;align-items:center;gap:6px">كلمة السر الحالية <span style="color:var(--dim2);font-weight:var(--fw-normal);font-size:var(--fs-xs)">(اختياري — لو الموظف غيّرها)</span></label>
          <input class="inp" id="current-emp-pw" type="text" dir="ltr" placeholder="اتركها فارغة لو الأدمن لم يغيّرها">
          <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:4px">إن كان الموظف غيّر كلمة السر بنفسه، اكتب الكلمة الحالية هنا (إن عرفتها) ليتم التطبيق فوراً.</div>
        </div>
        <button type="button" class="btn btn-g" id="sp-save" style="width:100%" onclick="saveEmployeePassword(this)">💾 حفظ وتطبيق</button>
        <div id="sp-msg" style="font-size:var(--fs-sm);margin-top:8px;color:var(--dim2);line-height:1.6"></div>
      </div>
    </div>`;
}

/**
 * Inline modal: last-resort rebuild of Firebase Auth account for an employee.
 * @param {object} ctx
 *   - employeeName: string
 *   - employeePhone: string
 * @returns {string} HTML overlay body
 */
export function buildRebuildAuthModalHTML({ employeeName, employeePhone }) {
  return `
    <div class="modal" style="max-width:440px;width:100%">
      <div class="modal-head" style="padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center">
        <span class="txt-bold-lg">🔄 إعادة إنشاء حساب دخول لـ ${employeeName || 'الموظف'}</span>
        <button type="button" class="modal-x" onclick="this.closest('.overlay').remove()">✕</button>
      </div>
      <div style="padding:18px 20px">
        <div class="alert alert-warn" style="margin-bottom:14px">
          ⚠️ هذا الإجراء آخر حل لما تكون كلمة السر القديمة غير معروفة أو تعذّر تطبيقها.
          سيتم إنشاء حساب دخول جديد بنفس رقم الموبايل وكلمة سر تختارها.
          الموظف يدخل فوراً بـ <strong>${employeePhone}</strong> + كلمة السر الجديدة.
        </div>
        <div class="fg" style="margin-bottom:12px">
          <label>كلمة السر الجديدة</label>
          <input class="inp" id="rb-pw" type="text" dir="ltr" inputmode="numeric" placeholder="6 أرقام على الأقل" value="123456" autofocus>
        </div>
        <button type="button" class="btn btn-g" id="rb-save" style="width:100%" onclick="doRebuildEmployeeAuth(this)">🔄 إعادة الإنشاء</button>
        <div id="rb-msg" style="font-size:var(--fs-sm);margin-top:10px;color:var(--dim2);line-height:var(--lh-relaxed)"></div>
      </div>
    </div>`;
}

export function buildPasswordCardHTML({ displayPassword, setByName, setAtStr }) {
  const dp = displayPassword;
  return `
    <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--rad2);padding:14px 16px;display:flex;align-items:center;gap:var(--space-md);flex-wrap:wrap">
      <div style="flex-shrink:0;width:42px;height:42px;border-radius:50%;background:var(--tint-y-soft);display:flex;align-items:center;justify-content:center;font-size:20px">🔑</div>
      <div style="flex:1;min-width:160px">
        <div style="font-size:var(--fs-sm);color:var(--dim2);font-weight:var(--fw-bold);margin-bottom:3px">كلمة سر الدخول</div>
        ${dp
          ? `<div style="font-family:ui-monospace,monospace;font-size:17px;font-weight:var(--fw-heavy);letter-spacing:1px;user-select:all;cursor:pointer;color:var(--snow)" onclick="copyToClipboard('${dp.replace(/'/g, '')}',this)" title="اضغط للنسخ">${dp}</div>
             ${setAtStr ? `<div style="font-size:var(--fs-xs);color:var(--dim);margin-top:3px">عُيّنت بواسطة ${setByName || 'النظام'} · ${setAtStr}</div>` : ''}`
          : `<div style="font-size:var(--fs-base);color:var(--y);font-weight:var(--fw-bold)">🔒 سر شخصي — غيّرها الموظف بنفسه</div>
             <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:2px">اضغط "تعيين" لكلمة جديدة يعرفها الأدمن</div>`}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${dp ? `<button type="button" class="btn btn-ghost btn-sm" onclick="copyToClipboard('${dp.replace(/'/g, '')}',this)" style="font-size:var(--fs-sm)">📋 نسخ</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" onclick="openSetPasswordModal()" style="font-size:var(--fs-sm);color:var(--b)">✏️ تعيين كلمة جديدة</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="openRebuildAuthModal()" style="font-size:var(--fs-sm);color:var(--y)" title="إذا تعذّر تطبيق كلمة سر جديدة بأي طريقة، استخدم هذا الزر لإنشاء حساب دخول من الصفر">🔄 إعادة إنشاء حساب الدخول</button>
      </div>
    </div>`;
}
