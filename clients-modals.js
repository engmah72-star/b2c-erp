/**
 * Business2Card ERP — clients-modals.js
 *
 * ━━━ MODAL MARKUP FOR clients.html ━━━
 *
 * God-page decomposition PR-17 (RULE G5):
 * The 5 overlay modals (ov-client / ov-order / ov-ai / ov-followup /
 * ov-dup) previously inlined in clients.html (~364 lines of markup)
 * now live here. The module exposes a single side-effect:
 * on DOMContentLoaded it appends the modal HTML to <body>.
 *
 * Why not keep them inline?
 *   - Keeps clients.html focused on layout/top-of-fold content
 *   - Allows future preloading / lazy injection variants
 *   - Already the established pattern: clients-render.js (templates),
 *     clients-data.js (computations), clients.css (styles), and now
 *     clients-modals.js (markup).
 *
 * Timing:
 *   - Module scripts are deferred → execute after DOM parse + before
 *     DOMContentLoaded fires.
 *   - All inline handlers reference modals by id (`getElementById('ov-...')`)
 *     and are only called AFTER user interaction, so injection ordering
 *     is safe.
 */

export const CLIENTS_MODALS_HTML = `
<div class="overlay" id="ov-client">
  <div class="modal" style="max-width:560px">
    <div class="modal-head">
      <span class="modal-title" id="client-title">＋ عميل جديد</span>
      <button class="modal-x" onclick="closeClientModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="divider"><div class="div-line"></div><div class="div-text">البيانات الأساسية</div><div class="div-line"></div></div>
      <div class="fg"><label>الاسم الكامل *</label><input class="inp" id="c-name" placeholder="محمد أحمد"></div>
      <div class="g2">
        <div class="fg">
          <label>هاتف 1 (واتساب) *</label>
          <input class="inp" id="c-phone1" placeholder="01xxxxxxxxx" type="tel" oninput="checkPhone(this)">
          <div class="field-hint" id="hint-phone1"></div>
        </div>
        <div class="fg">
          <label>هاتف 2 (اختياري)</label>
          <input class="inp" id="c-phone2" placeholder="01xxxxxxxxx" type="tel" oninput="checkPhone(this)">
        </div>
      </div>
      <div class="g2">
        <div class="fg">
          <label>🌍 الدولة (لرقم دولي)</label>
          <select class="inp" id="c-intl-cc">
            <option value="">— لا يوجد —</option>
            <option value="+966">🇸🇦 السعودية (+966)</option>
            <option value="+971">🇦🇪 الإمارات (+971)</option>
            <option value="+965">🇰🇼 الكويت (+965)</option>
            <option value="+974">🇶🇦 قطر (+974)</option>
            <option value="+973">🇧🇭 البحرين (+973)</option>
            <option value="+968">🇴🇲 عُمان (+968)</option>
            <option value="+962">🇯🇴 الأردن (+962)</option>
            <option value="+961">🇱🇧 لبنان (+961)</option>
            <option value="+964">🇮🇶 العراق (+964)</option>
            <option value="+963">🇸🇾 سوريا (+963)</option>
            <option value="+967">🇾🇪 اليمن (+967)</option>
            <option value="+218">🇱🇾 ليبيا (+218)</option>
            <option value="+216">🇹🇳 تونس (+216)</option>
            <option value="+213">🇩🇿 الجزائر (+213)</option>
            <option value="+212">🇲🇦 المغرب (+212)</option>
            <option value="+249">🇸🇩 السودان (+249)</option>
            <option value="+970">🇵🇸 فلسطين (+970)</option>
            <option value="+90">🇹🇷 تركيا (+90)</option>
            <option value="+1">🇺🇸 الولايات المتحدة / كندا (+1)</option>
            <option value="+44">🇬🇧 المملكة المتحدة (+44)</option>
            <option value="+33">🇫🇷 فرنسا (+33)</option>
            <option value="+49">🇩🇪 ألمانيا (+49)</option>
            <option value="+39">🇮🇹 إيطاليا (+39)</option>
            <option value="+34">🇪🇸 إسبانيا (+34)</option>
          </select>
        </div>
        <div class="fg">
          <label>🌍 رقم دولي (بدون كود الدولة)</label>
          <input class="inp" id="c-intl-phone" placeholder="501234567" type="tel" oninput="checkIntlPhone()">
          <div class="field-hint" id="hint-intl"></div>
        </div>
      </div>
      <div class="g2">
        <div class="fg"><label>الوظيفة / النشاط</label><input class="inp" id="c-job" placeholder="محامي / طبيب / مطعم..."></div>
        <div class="fg"><label>إيميل (اختياري)</label><input class="inp" id="c-email" type="email" placeholder="example@gmail.com"></div>
      </div>

      <!-- ══ مناسبات (اختياري — تولّد متابعات تلقائية) ══ -->
      <div class="g2">
        <div class="fg"><label>🎂 تاريخ الميلاد (اختياري)</label><input class="inp" id="c-birthday" type="date"></div>
        <div class="fg"><label>🏢 تاريخ تأسيس النشاط (اختياري)</label><input class="inp" id="c-anniversary" type="date"></div>
      </div>

      <div class="divider"><div class="div-line"></div><div class="div-text">📍 العنوان</div><div class="div-line"></div></div>
      <div class="g2">
        <div class="fg"><label>المحافظة</label><select class="inp" id="c-gov" onchange="fillCities()"><option value="">— اختر —</option></select></div>
        <div class="fg"><label>المدينة / الحي</label><select class="inp" id="c-city"><option value="">— اختر —</option></select></div>
      </div>

      <div class="divider"><div class="div-line"></div><div class="div-text">🏷️ التصنيف والمصدر</div><div class="div-line"></div></div>
      <div class="g2">
        <div class="fg"><label>مصدر العميل</label>
          <select class="inp" id="c-source">
            <option value="">— اختر —</option>
            <option value="facebook">📘 فيسبوك</option>
            <option value="whatsapp">💬 واتساب</option>
            <option value="instagram">📸 إنستجرام</option>
            <option value="referral">🤝 إحالة</option>
            <option value="walk_in">🚶 زيارة مباشرة</option>
            <option value="other">📌 أخرى</option>
          </select>
        </div>
        <div class="fg"><label>نوع النشاط</label>
          <select class="inp" id="c-sector">
            <option value="">— اختر —</option>
            <option value="medical">🏥 طبي</option>
            <option value="legal">⚖️ قانوني</option>
            <option value="corporate">🏢 شركات</option>
            <option value="retail">🛍️ تجاري</option>
            <option value="restaurant">🍽️ مطاعم</option>
            <option value="education">🎓 تعليم</option>
            <option value="individual">👤 أفراد</option>
            <option value="other">📌 أخرى</option>
          </select>
        </div>
      </div>
      <div class="fg"><label>تصنيف العميل</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <div class="tag-btn" onclick="this.classList.toggle('on')" data-tag="vip">⭐ VIP</div>
          <div class="tag-btn" onclick="this.classList.toggle('on')" data-tag="regular">🔄 دوري</div>
          <div class="tag-btn" onclick="this.classList.toggle('on')" data-tag="new">🆕 جديد</div>
          <div class="tag-btn" onclick="this.classList.toggle('on')" data-tag="wholesale">📦 جملة</div>
          <div class="tag-btn" onclick="this.classList.toggle('on')" data-tag="delayed">⏳ آجل</div>
          <div class="tag-btn" onclick="this.classList.toggle('on')" data-tag="blocked">🚫 محظور</div>
        </div>
      </div>
      <div class="fg"><label>ملاحظات</label><textarea class="inp" id="c-notes" placeholder="أي تفاصيل إضافية..." style="min-height:70px"></textarea></div>

      <!-- ══ ملاحظات داخلية خاصة بالموظفين فقط ══ -->
      <div style="background:rgba(255,61,110,.05);border:1px solid rgba(255,61,110,.18);border-radius:var(--rad);padding:var(--space-md);margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:var(--space-sm)">
          <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--r);display:flex;align-items:center;gap:6px">🔒 ملاحظات داخلية — لا تظهر للعميل</div>
          <span id="c-internal-meta" style="font-size:var(--fs-tiny);color:var(--dim2);font-weight:var(--fw-bold)"></span>
        </div>
        <textarea class="inp" id="c-internal-notes" placeholder="ملاحظات خاصة بالموظفين فقط&#10;مثال: العميل صعب الإرضاء — يحتاج صبر / يدفع متأخر / صديق المدير / يفضّل الاتصال صباحاً..." style="min-height:70px;background:rgba(255,61,110,.03)"></textarea>
        <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:6px;line-height:1.6">💡 المعرفة هنا تنتقل بين الموظفين — لا تُعرض في بوابة العميل أو الرسائل التلقائية</div>
      </div>

      <!-- حقول خاصة بالعميل القديم — تظهر فقط في وضع قديم -->
      <div id="legacy-fields-section" class="hide">
        <div class="divider" style="margin-top:8px"><div class="div-line"></div><div class="div-text">📁 بيانات العميل القديم</div><div class="div-line"></div></div>
        <div class="g2">
          <div class="fg"><label>إجمالي ما أنفقه تقريباً (ج)</label><input class="inp" id="c-legacy-spent" type="number" placeholder="0" min="0"></div>
          <div class="fg"><label>تاريخ آخر طلب قديم</label><input class="inp" id="c-legacy-last-order" type="date"></div>
        </div>
        <div class="fg"><label>المشاريع / المنتجات السابقة</label><input class="inp" id="c-legacy-projects" placeholder="بطاقات عمل، ليتر هيد، بروشور..."></div>
        <div class="fg"><label>ملاحظات خاصة</label><textarea class="inp" id="c-legacy-notes" placeholder="سبب التسجيل، أولويات التواصل..." style="min-height:60px"></textarea></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeClientModal()">إلغاء</button>
      <button class="btn btn-b" id="save-client-btn" onclick="saveClient()">✓ حفظ العميل</button>
    </div>
  </div>
</div>

<div class="overlay" id="ov-order">
  <div class="modal" style="max-width:600px">
    <div class="modal-head">
      <span class="modal-title" id="order-modal-title">✏️ طلب جديد</span>
      <button class="modal-x" onclick="closeOrderModal()">✕</button>
    </div>
    <div class="modal-body">

      <!-- العميل — عرض ثابت -->
      <div style="background:var(--bg3);border:1px solid var(--line);border-radius:var(--rad);padding:12px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:2px">العميل</div>
          <div style="font-size:15px;font-weight:var(--fw-extra)" id="no-client-name">—</div>
          <div style="font-size:var(--fs-sm);color:var(--dim2)" id="no-client-job"></div>
        </div>
        <div style="text-align:left">
          <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:2px">الهاتف</div>
          <a id="no-client-phone-link" href="#" style="font-size:var(--fs-md);font-weight:var(--fw-bold);color:var(--b);text-decoration:none">—</a>
        </div>
      </div>

      <!-- نوع الأوردر -->
      <div style="margin-bottom:14px">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--dim2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">نوع الأوردر *</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="type-card" id="tc-design" onclick="selectOrderType('design')">
            <div class="type-card-ico">✏️</div>
            <div class="type-card-lbl">تصميم فقط</div>
            <div class="type-card-sub">تصميم جرافيك</div>
          </div>
          <div class="type-card" id="tc-printing" onclick="selectOrderType('printing')">
            <div class="type-card-ico">🖨️</div>
            <div class="type-card-lbl">تصميم + طباعة</div>
            <div class="type-card-sub">تصميم وطباعة معاً</div>
          </div>
        </div>
        <input type="hidden" id="no-stage" value="">
      </div>

      <!-- المنتجات — نفس design.html -->
      <div class="fg">
        <label>📦 المنتجات * <span style="color:var(--dim2);font-weight:var(--fw-normal);font-size:var(--fs-sm)">(ممكن أكثر من منتج)</span></label>
        <div id="no-prod-rows"></div>
        <button type="button" class="btn btn-ghost btn-xs" onclick="addNoProdRow()" style="margin-top:6px">＋ إضافة منتج</button>
      </div>

      <!-- الموعد والمصمم -->
      <div class="g2">
        <div class="fg"><label>📅 موعد التسليم</label><input class="inp" id="no-deadline" type="date"></div>
        <div class="fg" id="designer-field-wrap"><label>🎨 المصمم</label><select class="inp" id="no-designer"><option value="">— بدون مصمم —</option></select></div>
      </div>

      <!-- المالية -->
      <div style="background:rgba(0,217,126,.06);border:1px solid rgba(0,217,126,.2);border-radius:var(--rad);padding:var(--space-md);margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-size:var(--fs-base);font-weight:var(--fw-bold);color:var(--g)">💰 المالية</div>
          <div style="font-size:var(--fs-xs);color:var(--dim2)">المقدم اختياري — يمكن تركه فارغاً</div>
        </div>
        <div class="fg" style="margin-bottom:10px">
          <label>السعر الكلي (ج) <span id="no-sale-price-hint" style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-semi)"></span></label>
          <input class="inp" id="no-sale-price" type="number" placeholder="0" value="0" oninput="calcNoRemaining()">
        </div>
        <div class="g2">
          <div class="fg" style="margin:0"><label>العربون / المقدم (ج) <span style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-medium)">— اختياري</span></label><input class="inp" id="no-deposit" type="number" placeholder="0 — اتركه فارغاً لو بدون مقدم" value="0" oninput="calcNoRemaining()"></div>
          <div class="fg" style="margin:0"><label>المحفظة <span style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-medium)">— لو يوجد مقدم</span></label><select class="inp" id="no-wallet"><option value="">— لا يلزم بدون مقدم —</option></select></div>
        </div>
        <div id="no-remaining-preview" style="display:flex;justify-content:space-between;margin-top:8px;padding:8px 10px;background:rgba(0,0,0,.1);border-radius:8px;font-size:var(--fs-base);display:none">
          <span style="color:var(--dim2)">الباقي على العميل</span>
          <span id="no-rem-val" style="font-weight:var(--fw-heavy);color:var(--r)">0 ج</span>
        </div>
      </div>

      <!-- الملاحظات -->
      <div class="fg"><label>📝 تعليمات العميل</label><textarea class="inp" id="no-notes" style="min-height:65px" placeholder="النص / الألوان / التفاصيل..."></textarea></div>

      <!-- ملفات التصميم -->
      <div style="border:1px solid var(--line);border-radius:var(--rad);padding:var(--space-md);margin-top:2px">
        <div style="font-size:var(--fs-base);font-weight:var(--fw-bold);color:var(--dim2);margin-bottom:10px">🖼️ ملفات التصميم (اختياري)</div>
        <div onclick="document.getElementById('no-design-img-inp').click()" style="border:2px dashed var(--line);border-radius:var(--rad);padding:var(--space-md);text-align:center;cursor:pointer;margin-bottom:8px;transition:border-color .2s;color:var(--dim2);font-size:var(--fs-md)" onmouseover="this.style.borderColor='var(--b)'" onmouseout="this.style.borderColor='var(--line)'">
          ＋ إضافة صور أو PDF
        </div>
        <input type="file" id="no-design-img-inp" accept="image/*,application/pdf" multiple class="hide" onchange="addDesignFiles(this)">
        <div id="no-design-files-list" style="margin-bottom:8px"></div>
        <div id="no-upload-progress" style="display:none;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);color:var(--dim2);margin-bottom:4px">
            <span id="no-upload-lbl">جاري الرفع...</span><span id="no-upload-pct">0%</span>
          </div>
          <div style="height:6px;background:var(--bg3);border-radius:99px;overflow:hidden">
            <div id="no-upload-bar" style="height:100%;width:0%;background:linear-gradient(90deg,var(--b),var(--p));border-radius:99px;transition:width .2s"></div>
          </div>
        </div>
        <div class="fg" style="margin-bottom:8px"><label style="font-size:var(--fs-sm)">أو رابط مباشر</label><input class="inp" id="no-design-url" type="url" placeholder="https://..."></div>
        <div class="fg" style="margin:0">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
            <label style="font-size:var(--fs-sm)">📋 بيانات التصميم / ملاحظة</label>
            <button type="button" id="bc-fill-btn" onclick="window.fillFromBizCard()" style="display:none;padding:4px 10px;border-radius:8px;border:1px solid rgba(168,85,247,.3);background:rgba(168,85,247,.1);color:#a855f7;font-size:var(--fs-xs);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit">📇 تعبئة من بطاقة العميل</button>
          </div>
          <textarea class="inp" id="no-design-note" placeholder="وصف التصميم أو بيانات الكارت..." style="min-height:60px;resize:vertical;font-family:inherit"></textarea>
        </div>
      </div>

    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeOrderModal()">إلغاء</button>
      <button class="btn btn-p" id="no-save-btn" onclick="saveNewOrder()">✓ إنشاء الطلب</button>
    </div>
  </div>
</div>

<div class="modal-ov" id="ov-ai" onclick="closeAiAnalysis()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center;padding:14px">
  <div onclick="event.stopPropagation()" style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;max-width:680px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden">
    <div style="padding:14px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
      <span style="font-size:var(--fs-2xl)">🤖</span>
      <div style="flex:1">
        <div style="font-size:var(--fs-lg);font-weight:var(--fw-extra)">تحليل ذكي بـ AI</div>
        <div id="ai-subtitle" style="font-size:var(--fs-sm);color:var(--dim2);font-weight:var(--fw-semi)">—</div>
      </div>
      <button class="modal-x" onclick="closeAiAnalysis()">✕</button>
    </div>
    <div id="ai-body" style="padding:16px 18px;overflow-y:auto;flex:1;font-size:var(--fs-md);line-height:var(--lh-relaxed)"></div>
  </div>
</div>

<div class="overlay" id="ov-followup">
  <div class="modal" style="max-width:480px">
    <div class="modal-head">
      <span class="modal-title" id="fu-title">＋ متابعة جديدة</span>
      <button class="modal-x" onclick="closeFollowupModal()">✕</button>
    </div>
    <div class="modal-body">
      <input type="hidden" id="fu-client-id">
      <input type="hidden" id="fu-id">
      <div style="background:rgba(167,139,250,.06);border:1px solid rgba(167,139,250,.2);border-radius:var(--rad);padding:8px 12px;margin-bottom:14px;font-size:var(--fs-base);color:var(--dim2)">
        👤 العميل: <span id="fu-client-name" style="color:var(--snow);font-weight:var(--fw-extra)">—</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div class="fg"><label>نوع المتابعة *</label>
          <select class="inp" id="fu-type">
            <option value="call">📞 مكالمة</option>
            <option value="whatsapp">💬 واتساب</option>
            <option value="email">📧 إيميل</option>
            <option value="visit">🏠 زيارة</option>
            <option value="note">📝 ملاحظة</option>
            <option value="reminder">⏰ تذكير</option>
          </select>
        </div>
        <div class="fg"><label>النتيجة (اختياري)</label>
          <select class="inp" id="fu-outcome">
            <option value="">—</option>
            <option value="answered">✅ ردّ</option>
            <option value="no_answer">📵 لم يردّ</option>
            <option value="interested">🎯 مهتم</option>
            <option value="not_interested">🚫 غير مهتم</option>
            <option value="order_placed">🛒 طلب جديد</option>
            <option value="follow_later">⏳ متابعة لاحقاً</option>
          </select>
        </div>
      </div>
      <div class="fg"><label>الملاحظة / تفاصيل التواصل</label>
        <textarea class="inp" id="fu-note" rows="3" placeholder="اكتب ما دار في التواصل، الاتفاقات، الطلبات..."></textarea>
      </div>

      <!-- ══ مراجعة المنتج ورأي العميل (اختياري) ══ -->
      <div style="background:rgba(255,170,0,.05);border:1px solid rgba(255,170,0,.2);border-radius:var(--rad);padding:var(--space-md);margin-bottom:14px">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--y);margin-bottom:10px">⭐ مراجعة المنتج ورأي العميل (اختياري)</div>
        <div class="fg" style="margin-bottom:10px"><label>الأوردر / المنتج المُراجَع</label>
          <select class="inp" id="fu-order">
            <option value="">— لا يخص أوردر معيّن —</option>
          </select>
        </div>
        <div class="fg" style="margin-bottom:10px">
          <label>تقييم المنتج</label>
          <div id="fu-rating-stars" style="display:flex;gap:6px;align-items:center;padding:8px 0">
            <span class="fu-star" data-val="1" onclick="setFuRating(1)" style="font-size:24px;cursor:pointer;color:var(--line2);transition:var(--trans)">★</span>
            <span class="fu-star" data-val="2" onclick="setFuRating(2)" style="font-size:24px;cursor:pointer;color:var(--line2);transition:var(--trans)">★</span>
            <span class="fu-star" data-val="3" onclick="setFuRating(3)" style="font-size:24px;cursor:pointer;color:var(--line2);transition:var(--trans)">★</span>
            <span class="fu-star" data-val="4" onclick="setFuRating(4)" style="font-size:24px;cursor:pointer;color:var(--line2);transition:var(--trans)">★</span>
            <span class="fu-star" data-val="5" onclick="setFuRating(5)" style="font-size:24px;cursor:pointer;color:var(--line2);transition:var(--trans)">★</span>
            <span id="fu-rating-label" style="margin-right:auto;font-size:var(--fs-sm);color:var(--dim2);font-weight:var(--fw-bold)">— غير مُقيَّم —</span>
            <button type="button" onclick="setFuRating(0)" style="background:none;border:none;color:var(--dim2);font-size:var(--fs-sm);cursor:pointer;text-decoration:underline">مسح</button>
          </div>
          <input type="hidden" id="fu-rating" value="0">
        </div>
        <div class="fg" style="margin-bottom:0"><label>رأي العميل في المنتج</label>
          <textarea class="inp" id="fu-review" rows="2" placeholder="مثال: العميل أبدى إعجابه بالخامة، اشتكى من تأخر التسليم، طلب تعديل المقاس..."></textarea>
        </div>
      </div>

      <div class="fg"><label>📅 موعد المتابعة القادمة (اختياري — يولّد تذكير)</label>
        <input type="datetime-local" class="inp" id="fu-next-date">
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:14px">
        <input type="checkbox" id="fu-done" style="width:16px;height:16px;cursor:pointer">
        <label for="fu-done" style="font-size:var(--fs-base);color:var(--dim2);cursor:pointer">✅ التذكير منفّذ بالفعل</label>
      </div>
      <div style="display:flex;gap:var(--space-sm)">
        <button class="btn btn-b" id="save-followup-btn" onclick="saveFollowup()" style="flex:1">💾 حفظ</button>
        <button class="btn btn-ghost" onclick="closeFollowupModal()">إلغاء</button>
      </div>
    </div>
  </div>
</div>

<div class="overlay" id="ov-dup">
  <div class="modal" style="max-width:400px">
    <div class="modal-head">
      <span class="modal-title">⚠️ رقم الهاتف موجود بالفعل</span>
      <button class="modal-x" onclick="document.getElementById('ov-dup').classList.remove('open')">✕</button>
    </div>
    <div class="modal-body">
      <div style="background:rgba(255,170,0,.08);border:1px solid rgba(255,170,0,.2);border-radius:var(--rad);padding:14px;margin-bottom:14px">
        <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:4px">العميل الموجود</div>
        <div style="font-size:var(--fs-2xl);font-weight:var(--fw-extra)" id="dup-name">—</div>
        <div style="font-size:var(--fs-md);color:var(--b)" id="dup-phone">—</div>
        <div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:4px" id="dup-orders">—</div>
      </div>
      <p style="font-size:var(--fs-md);color:var(--dim2);margin-bottom:14px">
        هل تريد إضافة أوردر تصميم جديد لهذا العميل؟
      </p>
      <div style="display:flex;flex-direction:column;gap:var(--space-sm)">
        <button class="btn btn-p" onclick="dupAddOrder()">✏️ إضافة أوردر تصميم</button>
        <button class="btn btn-b btn-sm" onclick="dupViewClient()">👤 عرض بيانات العميل</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('ov-dup').classList.remove('open')">إلغاء</button>
      </div>
    </div>
  </div>
</div>`;

function mount() {
  // Idempotent — bail if already mounted.
  if (document.getElementById('ov-client')) return;
  const host = document.createElement('div');
  host.id = 'clients-modals-host';
  host.innerHTML = CLIENTS_MODALS_HTML;
  // Append as a fragment so each top-level <div> becomes a body child.
  while (host.firstChild) document.body.appendChild(host.firstChild);
}

// Mount immediately if DOM is ready, else wait.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}
