/**
 * Business2Card ERP — features/employee-profile/views/render-modals.js
 *
 * ━━━ EMPLOYEE PROFILE MODALS (RULE L1.5) ━━━
 *
 * Pure HTML builders for 6 of the 7 static modals on employee-profile.html.
 * Extracted verbatim from the page scaffold (Phase 2.3 — markup move only,
 * zero behaviour change). Markup is BYTE-IDENTICAL to the former inline
 * scaffold: same element ids, same data-close / data-act attributes, same
 * ep-* classes (defined in employee-profile.css).
 *
 * NOT included (kept in the page — out of Phase 2.3 scope):
 *   • ov-salary — financial salary modal (High risk; deferred to a later
 *     phase). It stays inline in employee-profile.html.
 *
 * INTEGRATION CONTRACT (must hold for byte-identical behaviour):
 *   • The page injects buildAllModalsHTML() into a #modal-host container
 *     SYNCHRONOUSLY at bootstrap, BEFORE the [data-close]/[data-act]
 *     wiring runs. Because the markup is identical and present before the
 *     wiring, the existing delegated/bootstrap listeners and the populate-
 *     by-id open functions (openAddTask, openAddIncident, …) keep working
 *     unchanged — no rebinding, no rehydration.
 *   • All ids preserved 1:1: task-title/desc/pri/due/order ·
 *     edit-base-salary/commission/status · skill-input/suggestions/
 *     tags-edit · sched-day-pills/start/end · lv-type/start/end/
 *     days-preview/reason · inc-type/severity/title/desc/date/order.
 *
 * Each builder returns the modal's outer <div class="overlay" id="ov-…">…
 * markup exactly as it appeared in the page.
 */

export function buildTaskModalHTML() {
  return `<!-- MODAL: إضافة مهمة -->
<div class="overlay" id="ov-task">
  <div class="modal ep-modal-460">
    <div class="modal-head">
      <span class="modal-title">✅ إضافة مهمة</span>
      <button type="button" class="modal-x" data-close="ov-task">✕</button>
    </div>
    <div class="modal-body">
      <div class="fg"><label>عنوان المهمة *</label><input class="inp" id="task-title" placeholder="مثال: تصميم كارت محمود"></div>
      <div class="fg"><label>التفاصيل</label><textarea class="inp ep-textarea-min" id="task-desc" placeholder="أي تفاصيل إضافية..."></textarea></div>
      <div class="g2">
        <div class="fg"><label>⚡ الأولوية</label>
          <select class="inp" id="task-pri">
            <option value="urgent">⚡ عاجل</option>
            <option value="normal" selected>📌 عادي</option>
            <option value="low">📎 منخفض</option>
          </select>
        </div>
        <div class="fg"><label>📅 موعد الإنجاز</label><input class="inp" id="task-due" type="date"></div>
      </div>
      <div class="fg"><label>🔗 أوردر مرتبط (اختياري)</label>
        <select class="inp" id="task-order"><option value="">— بدون أوردر —</option></select>
      </div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-close="ov-task">إلغاء</button>
      <button type="button" class="btn btn-b" data-act="save-task">✓ إضافة المهمة</button>
    </div>
  </div>
</div>`;
}

export function buildEditSalaryModalHTML() {
  return `<!-- MODAL: تعديل المرتب الأساسي -->
<div class="overlay" id="ov-edit-salary">
  <div class="modal ep-modal-400">
    <div class="modal-head">
      <span class="modal-title">✏️ تعديل بيانات المرتب</span>
      <button type="button" class="modal-x" data-close="ov-edit-salary">✕</button>
    </div>
    <div class="modal-body">
      <div class="fg">
        <label>💰 المرتب الأساسي (ج)</label>
        <input class="inp" id="edit-base-salary" type="number" placeholder="0">
      </div>
      <div class="fg">
        <label>📊 نسبة العمولة (%)</label>
        <input class="inp" id="edit-commission" type="number" placeholder="0" min="0" max="100">
      </div>
      <div class="fg">
        <label>📋 الحالة</label>
        <select class="inp" id="edit-status">
          <option value="active">✅ نشط</option>
          <option value="inactive">⏸️ غير نشط</option>
        </select>
      </div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-close="ov-edit-salary">إلغاء</button>
      <button type="button" class="btn btn-b" data-act="save-emp-data">✓ حفظ</button>
    </div>
  </div>
</div>`;
}

export function buildSkillsModalHTML() {
  return `<!-- MODAL: تعديل المهارات -->
<div class="overlay" id="ov-edit-skills">
  <div class="modal ep-modal-480">
    <div class="modal-head">
      <span class="modal-title">🏷️ المهارات والتخصصات</span>
      <button type="button" class="modal-x" data-close="ov-edit-skills">✕</button>
    </div>
    <div class="modal-body">
      <div class="fg ep-mb-10">
        <label class="txt-meta-sm">أضف مهارة أو منتج</label>
        <div class="row-gap-sm">
          <input class="inp" id="skill-input" placeholder="مثال: بطاقات عمل، سريع التسليم...">
          <button type="button" class="btn btn-b btn-sm" data-act="add-skill-tag">＋</button>
        </div>
        <div id="skill-suggestions" class="ep-skill-sug"></div>
      </div>
      <div id="skill-tags-edit" class="ep-skill-tags"></div>
      <div class="row-gap-sm">
        <button type="button" class="btn btn-g flex-1" data-act="save-skills">💾 حفظ</button>
        <button type="button" class="btn btn-ghost" data-close="ov-edit-skills">إلغاء</button>
      </div>
    </div>
  </div>
</div>`;
}

export function buildScheduleModalHTML() {
  return `<!-- MODAL: جدول العمل -->
<div class="overlay" id="ov-schedule">
  <div class="modal ep-modal-440">
    <div class="modal-head">
      <span class="modal-title">🕐 تعديل جدول العمل</span>
      <button type="button" class="modal-x" data-close="ov-schedule">✕</button>
    </div>
    <div class="modal-body">
      <div class="fg">
        <label>📅 أيام العمل</label>
        <div id="sched-day-pills" class="ep-sched-pills"></div>
      </div>
      <div class="g2">
        <div class="fg">
          <label>⏰ وقت البدء</label>
          <input class="inp" id="sched-start" type="time" value="09:00">
        </div>
        <div class="fg">
          <label>🏁 وقت الانتهاء</label>
          <input class="inp" id="sched-end" type="time" value="17:00">
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-close="ov-schedule">إلغاء</button>
      <button type="button" class="btn btn-b" data-act="save-schedule">💾 حفظ الجدول</button>
    </div>
  </div>
</div>`;
}

export function buildLeaveModalHTML() {
  return `<!-- MODAL: إضافة إجازة -->
<div class="overlay" id="ov-leave">
  <div class="modal ep-modal-440">
    <div class="modal-head">
      <span class="modal-title">🏖️ تسجيل إجازة / غياب</span>
      <button type="button" class="modal-x" data-close="ov-leave">✕</button>
    </div>
    <div class="modal-body">
      <div class="fg">
        <label>🏷️ نوع الإجازة</label>
        <select class="inp" id="lv-type">
          <option value="annual">🌴 إجازة سنوية</option>
          <option value="sick">🏥 إجازة مرضية</option>
          <option value="emergency">⚡ إجازة طارئة</option>
          <option value="official">📋 إجازة رسمية</option>
          <option value="unpaid">⚠️ غياب بدون راتب</option>
        </select>
      </div>
      <div class="g2">
        <div class="fg">
          <label>📅 من تاريخ</label>
          <input class="inp" id="lv-start" type="date">
        </div>
        <div class="fg">
          <label>📅 إلى تاريخ</label>
          <input class="inp" id="lv-end" type="date">
        </div>
      </div>
      <div id="lv-days-preview" class="ep-lv-preview"></div>
      <div class="fg">
        <label>📝 السبب / ملاحظة (اختياري)</label>
        <input class="inp" id="lv-reason" placeholder="مثال: إجازة عيد الأضحى">
      </div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-close="ov-leave">إلغاء</button>
      <button type="button" class="btn btn-b" data-act="save-leave">✓ تسجيل الإجازة</button>
    </div>
  </div>
</div>`;
}

export function buildIncidentModalHTML() {
  return `<!-- MODAL: إضافة إخفاق -->
<div class="overlay" id="ov-incident">
  <div class="modal ep-modal-480">
    <div class="modal-head">
      <span class="modal-title">⚠️ تسجيل إخفاق</span>
      <button type="button" class="modal-x" data-close="ov-incident">✕</button>
    </div>
    <div class="modal-body">
      <div class="ep-inc-notice">
        ℹ️ هذا السجل يُؤثر على نقاط الجودة في تقييم الموظف هذا الشهر (-5% لكل إخفاق، حد أقصى 60%).
      </div>
      <div class="g2">
        <div class="fg">
          <label>🏷️ النوع *</label>
          <select class="inp" id="inc-type">
            <option value="quality">⚠️ مشكلة جودة</option>
            <option value="design_rejected">🎨 تصميم مرفوض</option>
            <option value="order_late">⏰ أوردر متأخر</option>
            <option value="customer_complaint">📢 شكوى عميل</option>
            <option value="attendance">💤 مخالفة حضور</option>
            <option value="other">📌 أخرى</option>
          </select>
        </div>
        <div class="fg">
          <label>🔥 الأهمية *</label>
          <select class="inp" id="inc-severity">
            <option value="low">منخفض</option>
            <option value="medium" selected>متوسط</option>
            <option value="high">مرتفع</option>
          </select>
        </div>
      </div>
      <div class="fg ep-mt-10">
        <label>📝 العنوان</label>
        <input class="inp" id="inc-title" placeholder="مثال: تسليم متأخر يومين">
      </div>
      <div class="fg ep-mt-10">
        <label>💬 التفاصيل (اختياري)</label>
        <textarea class="inp ep-textarea-min70" id="inc-desc" placeholder="ما حصل وما الإجراء المتخذ"></textarea>
      </div>
      <div class="fg ep-mt-10">
        <label>📸 صورة المخالفة (اختياري)</label>
        <label class="ep-upload">
          <input type="file" id="inc-img" accept="image/*" hidden>
          <div class="ep-upload-empty" id="inc-img-empty">
            <span class="ep-upload-ico">📷</span>
            <span class="ep-upload-txt">اضغط لاختيار صورة أو التقاطها</span>
            <span class="ep-upload-hint">صورة واحدة · حتى 10MB</span>
          </div>
          <div class="ep-upload-preview" id="inc-img-preview" hidden>
            <img id="inc-img-thumb" alt="معاينة الصورة">
            <button type="button" class="ep-upload-clear" id="inc-img-clear">✕ إزالة</button>
          </div>
        </label>
      </div>
      <div class="g2 ep-mt-10">
        <div class="fg">
          <label>📅 التاريخ</label>
          <input class="inp" id="inc-date" type="date">
        </div>
        <div class="fg">
          <label>🔗 أوردر مرتبط (اختياري)</label>
          <select class="inp" id="inc-order"><option value="">— بدون —</option></select>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-close="ov-incident">إلغاء</button>
      <button type="button" class="btn btn-r" data-act="save-incident">✓ تسجيل الإخفاق</button>
    </div>
  </div>
</div>`;
}

/**
 * Aggregator — returns all 6 extracted modals in the SAME source order they
 * had in the page scaffold (task, edit-salary, [salary stays in page],
 * edit-skills, schedule, leave, incident). The page injects this into
 * #modal-host at bootstrap before the event wiring runs.
 */
export function buildAllModalsHTML() {
  return [
    buildTaskModalHTML(),
    buildEditSalaryModalHTML(),
    buildSkillsModalHTML(),
    buildScheduleModalHTML(),
    buildLeaveModalHTML(),
    buildIncidentModalHTML(),
  ].join('\n');
}
