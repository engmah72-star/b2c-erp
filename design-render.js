/**
 * Business2Card ERP — design-render.js
 *
 * ━━━ PURE HTML BUILDERS FOR design.html ━━━
 *
 * God-page decomposition PR-2 (RULE G5 + L1) for design.html.
 * Extracts the 240-line renderPanel template + the small pure helpers
 * (iRow / tlHtml / delay / escapeNotes / fn) it uses.
 *
 * Design.html uses Modular SDK + ES module scripts, so this is a real
 * named-import (not the compat window.* attachment used in clients.html).
 */

import {
  stageProgressBar,
  productStatusBadge,
  PRODUCT_STATUS,
  resolveDesigner,
} from './orders.js';

// ─── PURE HELPERS ─────────────────────────────────────────────────────

/** Currency-formatted number in Arabic locale. */
export const fn = (n) => (parseFloat(n) || 0).toLocaleString('ar-EG');

/** Days past deadline (0 if not late or no deadline). */
export const delay = (dl) =>
  dl ? Math.max(0, Math.floor((new Date() - new Date(dl)) / 864e5)) : 0;

/** HTML-escape user note text (handles &<>"'). */
export const escapeNotes = (s) =>
  (s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

/** Info-row card: label + value (optional color override). */
export const iRow = (lbl, val, col = null) =>
  `<div style="background:var(--bg3);border-radius:8px;padding:8px 10px"><div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:2px">${lbl}</div><div style="font-size:var(--fs-base);font-weight:var(--fw-bold)${col ? ';color:' + col : ''}">${val}</div></div>`;

/** Timeline list (oldest at bottom) — used in admin order log. */
export const tlHtml = (tl) =>
  (tl || []).slice().reverse().map(t =>
    `<div style="font-size:var(--fs-sm);color:var(--dim2);padding:4px 0;border-bottom:1px solid var(--line)">${t.date} — ${t.action}</div>`
  ).join('') || '—';

// ─── PANEL BUILDER ────────────────────────────────────────────────────

/**
 * renderPanelHTML(order, ctx) → HTML string for the order panel.
 *
 * ctx = {
 *   currentRole,         // role string of the current user
 *   currentUserUid,      // for the "accept order" guard
 *   designers,           // array (for resolveDesigner)
 *   canSeePhone,         // () => boolean
 *   showPhone,           // (phone) => masked-or-not string
 * }
 *
 * Pure: no DOM mutation, no closure capture. Caller assigns the result
 * to `#panel-body` and then calls showAdminSection().
 */
export function renderPanelHTML(o, ctx = {}) {
  const {
    currentRole = '',
    currentUserUid = '',
    designers = [],
    canSeePhone = () => false,
    showPhone = (p) => p,
  } = ctx;

  const dep = parseFloat(o.deposit) || 0;
  const prods = o.products || [];
  const d = delay(o.deadline);

  return `
    <div style="padding:10px 14px 0">
      ${stageProgressBar(o)}
      <a href="order-tracking.html?id=${o._id}" class="chip-track">📋 تتبع كامل للأوردر</a>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        <button type="button" onclick="shareOrderToInbox('${o._id}')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(0,168,132,.3);background:rgba(0,168,132,.08);color:var(--g-mint);font-size:var(--fs-sm);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit">📤 إرسال لموظف</button>
        <button type="button" onclick="openOrderCommentsFromHere('${o._id}')" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(167,139,250,.3);background:rgba(167,139,250,.08);color:var(--p);font-size:var(--fs-sm);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit">💬 تعليقات الأوردر</button>
      </div>
    </div>
    <!-- بيانات العميل والأوردر -->
    <div class="section">
      <div class="section-title" style="margin-bottom:10px">👤 العميل والطلب</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-sm)">
        ${iRow('العميل', o.clientName || '—')}
        ${canSeePhone()
          ? iRow('الهاتف', `<a href="tel:${o.clientPhone}" style="color:var(--b);text-decoration:none">${o.clientPhone || '—'}</a>`)
          : iRow('الهاتف', `<span style="color:var(--dim2)">${showPhone(o.clientPhone)} <small>(محجوب — تواصل عبر خدمة العملاء)</small></span>`)}
        ${iRow('الأوردر', o.orderId || '—')}
        ${iRow('تاريخ الطلب', o.createdDate || '—')}
        ${iRow('موعد التسليم', o.deadline || 'لم يُحدد', d > 0 ? 'var(--r)' : null)}
        ${(() => {
          const _can = resolveDesigner(designers, o.designerId, o.designerName);
          const _nm = _can ? _can.name : '';
          const canAssign = ['admin','operation_manager','customer_service'].includes(currentRole);
          if (canAssign) {
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:var(--bg3);border-radius:var(--rad);margin-bottom:4px">
              <span style="font-size:var(--fs-base);color:var(--dim2);font-weight:var(--fw-bold)">المصمم</span>
              <div style="display:flex;align-items:center;gap:var(--space-sm)">
                <span style="font-size:var(--fs-md);font-weight:var(--fw-bold);color:${_nm ? 'var(--snow)' : 'var(--r)'}">${_nm || '⚠️ لم يُعيَّن'}</span>
                <button type="button" onclick="openAssignDesigner()" style="padding:3px 10px;border-radius:6px;border:1px solid rgba(59,158,255,.4);background:rgba(59,158,255,.1);color:var(--b);font-size:var(--fs-sm);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit">تعيين ✏️</button>
              </div>
            </div>`;
          }
          return iRow('المصمم', _nm || '—');
        })()}
      </div>
    </div>

    <!-- المنتجات + حالة كل منتج -->
    <div class="section">
      <div class="section-title" style="margin-bottom:8px">📦 المنتجات المطلوبة</div>
      <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:8px">اضغط على الأزرار لتحديد حالة كل منتج — الجاهز فقط هو الذي يظهر في صفحة الطباعة</div>
      ${prods.length ? prods.map((p, idx) => {
        const status = p.productStatus || 'pending';
        const sConf = PRODUCT_STATUS[status] || PRODUCT_STATUS.pending;
        const mkBtn = (s, lbl, col) => {
          const active = status === s;
          const baseStyle = `padding:7px 12px;border-radius:8px;font-size:var(--fs-base);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit;border:2px solid ${col};transition:all .15s`;
          const activeStyle = `background:${col};color:#fff;box-shadow:0 2px 8px ${col}66`;
          const inactiveStyle = `background:transparent;color:${col};opacity:.55`;
          return `<button type="button" onclick="setProductStatus(${idx},'${s}')" style="${baseStyle};${active ? activeStyle : inactiveStyle}">${active ? '✓ ' : ''}${lbl}</button>`;
        };
        return `<div style="padding:10px;background:var(--bg3);border-radius:var(--rad);margin-bottom:6px;border:1px solid var(--line);border-left:3px solid ${sConf.col}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-size:var(--fs-md);font-weight:var(--fw-bold)">${p.name} <span style="color:var(--dim2);font-weight:var(--fw-semi)">× ${p.qty}</span></span>
            ${productStatusBadge(status)}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${mkBtn('in_progress', '✏️ جاري', '#4a8ef5')}
            ${mkBtn('ready', '✅ جاهز للطباعة', 'var(--g-mint)')}
            ${mkBtn('on_hold', '⏸ مؤجَّل', 'var(--y-gold)')}
            ${mkBtn('pending', '↩ إعادة', '#647298')}
          </div>
        </div>`;
      }).join('') : `<div style="font-size:var(--fs-md);padding:var(--space-sm);background:var(--bg3);border-radius:var(--rad)">${o.product || '—'}</div>`}
      ${(() => {
        const hasReady = prods.some(p => (p.productStatus || 'pending') === 'ready');
        const hasNotReady = prods.some(p => { const s = p.productStatus || 'pending'; return s !== 'ready' && s !== 'printed' && s !== 'done'; });
        if (hasReady && hasNotReady) {
          return `<button type="button" onclick="openSplitOrder()" style="width:100%;margin-top:8px;padding:10px;border-radius:var(--rad);border:1px dashed var(--p);background:rgba(167,139,250,.08);color:var(--p);font-size:var(--fs-base);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit">✂️ افصل المنتجات الجاهزة وأرسلها للطباعة</button>`;
        }
        return '';
      })()}
    </div>

    <!-- صور التصميم المرفوعة -->
    ${(() => {
      const imgs = [...(o.products || []).filter(p => p.designImageUrl).map(p => ({ url: p.designImageUrl, name: p.name }))];
      if (o.designImageUrl && !imgs.length) imgs.push({ url: o.designImageUrl, name: 'التصميم' });
      if (!imgs.length) return '';
      return `<div class="section">
        <div class="section-title" style="margin-bottom:10px">🖼️ صور التصميم</div>
        ${imgs.map(img => `
          <div style="margin-bottom:10px">
            ${imgs.length > 1 ? `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:4px;font-weight:var(--fw-bold)">📦 ${img.name}</div>` : ''}
            <img src="${img.url}" loading="lazy" decoding="async" onclick="window.open('${img.url}','_blank')"
              style="width:100%;border-radius:var(--rad);border:1px solid var(--line);cursor:zoom-in;max-height:220px;object-fit:contain;background:var(--bg3);display:block" alt="">
          </div>`).join('')}
      </div>`;
    })()}

    <!-- ملف التصميم -->
    <div class="section">
      <div class="section-title" style="margin-bottom:10px">📎 ملفات التصميم</div>
      ${(() => {
        const files = o.designFiles && o.designFiles.length ? o.designFiles
          : (o.designFileUrl ? [{ url: o.designFileUrl, name: 'ملف التصميم', type: '' }] : []);
        if (!files.length) return `<button type="button" class="btn btn-b btn-sm" onclick="openUpload()">📎 رفع ملف التصميم</button>
          <div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:6px">لم يُرفع ملف التصميم بعد</div>`;
        const fileUrls = files.map(f => f.url);
        return files.map((f, i) => {
          const isPdf = f.type === 'application/pdf' || f.url?.includes('.pdf') || f.name?.endsWith('.pdf');
          const isImg = !isPdf && (f.type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(f.url || f.name || ''));
          const preview = isImg
            ? `<div onclick="event.preventDefault();event.stopPropagation();window.openImageViewer&&window.openImageViewer(${i},${JSON.stringify(fileUrls).replace(/"/g, '&quot;')})" style="width:64px;height:64px;border-radius:var(--rad);flex-shrink:0;background:var(--bg2) url('${f.url}') center/cover no-repeat;cursor:zoom-in;border:1px solid rgba(59,158,255,.2);position:relative;overflow:hidden"><span style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,.6);color:#fff;font-size:var(--fs-tiny);padding:1px 5px;border-radius:5px">🔍</span></div>`
            : `<div style="width:64px;height:64px;border-radius:var(--rad);flex-shrink:0;background:rgba(59,158,255,.08);display:flex;align-items:center;justify-content:center;font-size:var(--fs-4xl);border:1px solid rgba(59,158,255,.2)">${isPdf ? '📄' : '📎'}</div>`;
          return `<div style="display:flex;align-items:center;gap:10px;padding:var(--space-sm);background:rgba(59,158,255,.05);border:1px solid rgba(59,158,255,.15);border-radius:12px;margin-bottom:8px">
            ${preview}
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--fs-base);font-weight:var(--fw-bold);color:var(--snow);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:right">${f.name || 'ملف'}</div>
              <a href="${f.url}" target="_blank" style="font-size:var(--fs-sm);color:var(--b);text-decoration:none;font-weight:var(--fw-bold);display:inline-flex;align-items:center;gap:3px;margin-top:3px">فتح ↗</a>
            </div>
          </div>`;
        }).join('')
          + (o.designFileNote ? `<div style="font-size:var(--fs-sm);color:var(--y);margin-top:4px;margin-bottom:8px">📝 ${o.designFileNote}</div>` : '')
          + `<button type="button" class="btn btn-ghost btn-sm" onclick="openUpload()">✏️ تعديل</button>`;
      })()}
    </div>

    <!-- 🖼️ نشر في المعرض — للمصممين -->
    ${['graphic_designer', 'design_operator'].includes(currentRole) ? `
    <div class="section" style="background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.2)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:var(--fs-base);font-weight:var(--fw-extra);color:var(--p)">🖼️ المعرض العام</div>
          <div style="font-size:var(--fs-sm);color:var(--dim2);margin-top:3px">انشر الموك أب ليراه الجميع</div>
        </div>
        <button type="button" class="btn btn-p btn-sm" onclick="openGallery()">＋ نشر موك أب</button>
      </div>
    </div>` : ''}

    <!-- العربون — للإدارة وخدمة العملاء فقط -->
    ${(dep > 0 && ['admin', 'operation_manager', 'customer_service'].includes(currentRole)) ? `<div class="section" style="background:rgba(0,217,126,.04);border:1px solid rgba(0,217,126,.15)">
      <div class="section-title" style="color:var(--g);margin-bottom:8px">💰 العربون المدفوع</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-sm)">
        <div class="fin-box"><div class="fin-box-lbl">العربون</div><div class="fin-box-val" style="color:var(--g)">${fn(dep)} ج</div></div>
        <div class="fin-box"><div class="fin-box-lbl">المحفظة</div><div class="fin-box-val" style="font-size:var(--fs-base)">${o.depositWallet || '—'}</div></div>
      </div>
    </div>` : ''}

    ${(() => {
      const canEditNotes = ['admin', 'operation_manager', 'customer_service', 'design_operator', 'graphic_designer'].includes(currentRole);
      const hasContent = o.notes || o.refFileUrl;
      if (!hasContent && !canEditNotes) return '';
      return `<div class="section" id="sec-design-notes" style="background:rgba(255,170,0,.05);border:1px solid rgba(255,170,0,.15)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:var(--space-sm)">
          <div class="section-title" style="color:var(--y);margin:0">📋 بيانات التصميم</div>
          ${canEditNotes ? `<button type="button" id="btn-edit-notes" onclick="toggleEditNotes('${o._id}')" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,170,0,.4);background:rgba(255,170,0,.1);color:var(--y);font-size:var(--fs-sm);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit">✏️ ${o.notes ? 'تعديل' : 'إضافة'}</button>` : ''}
        </div>
        <div id="design-notes-view">
          ${o.notes ? `<div style="font-size:var(--fs-md);line-height:1.9;white-space:pre-wrap;margin-bottom:${o.refFileUrl ? '10px' : '0'}">${escapeNotes(o.notes)}</div>` : (canEditNotes ? `<div style="font-size:var(--fs-base);color:var(--dim2);font-style:italic;margin-bottom:${o.refFileUrl ? '10px' : '0'}">لم تُضَف بيانات بعد — اضغط ✏️ لإضافتها</div>` : '')}
          ${o.refFileUrl ? `<a href="${o.refFileUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.3);border-radius:8px;color:var(--p);font-size:var(--fs-base);font-weight:var(--fw-bold);text-decoration:none">${o.refFileType?.includes('pdf') ? '📄' : '🖼️'} عرض الملف المرجعي</a>` : ''}
        </div>
        <div id="design-notes-edit" class="hide">
          <textarea id="design-notes-input" class="inp" style="min-height:120px;font-family:inherit;line-height:1.8" placeholder="اكتب بيانات التصميم...">${o.notes || ''}</textarea>
          <div style="display:flex;gap:var(--space-sm);margin-top:8px">
            <button type="button" id="btn-save-notes" class="btn btn-g btn-sm" onclick="saveDesignNotes('${o._id}')">💾 حفظ</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="toggleEditNotes('${o._id}',true)">إلغاء</button>
          </div>
        </div>
      </div>`;
    })()}

    <!-- تأكيد الاستلام — للمصمم المعيَّن -->
    ${(['graphic_designer', 'design_operator'].includes(currentRole) && o.designerId === currentUserUid && !o.designerAcceptedAt) ? `
    <div class="section" style="background:rgba(240,160,32,.08);border:1px dashed var(--y)">
      <div class="section-title" style="color:var(--y);margin-bottom:8px">⏳ بانتظار تأكيد استلام الأوردر</div>
      <div style="font-size:var(--fs-base);color:var(--dim2);margin-bottom:10px">تم تعيين هذا الأوردر لك. أكّد استلامه قبل بدء العمل.</div>
      <button type="button" class="btn btn-y btn-sm" style="font-weight:var(--fw-extra)" onclick="acceptOrder('${o._id}')">✓ استلمت الأوردر — ابدأ العمل</button>
    </div>` : ''}

    ${(o.designerAcceptedAt && ['admin', 'operation_manager', 'customer_service', 'design_operator'].includes(currentRole)) ? `
    <div class="section" style="background:rgba(0,217,126,.05);border:1px solid rgba(0,217,126,.15)">
      <div style="font-size:var(--fs-base);color:var(--g);font-weight:var(--fw-bold)">✓ تم تأكيد استلام المصمم للأوردر</div>
    </div>` : ''}

    <!-- حالة التصميم -->
    <div class="section">
      <div class="section-title" style="margin-bottom:10px">🔄 حالة التصميم</div>
      <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap">
        <button type="button" class="btn btn-sm ${o.designStage === 'pending' ? 'btn-y' : 'btn-ghost'}" onclick="setDS('pending')">⏳ انتظار</button>
        <button type="button" class="btn btn-sm ${o.designStage === 'wip' ? 'btn-b' : 'btn-ghost'}" onclick="setDS('wip')">🎨 جاري التصميم</button>
        <button type="button" class="btn btn-sm ${o.designStage === 'awaiting_payment' ? 'btn-ghost' : 'btn-ghost'}" style="${o.designStage === 'awaiting_payment' ? 'background:rgba(255,153,51,.18);color:#ff9933;border-color:#ff9933' : ''}" onclick="setDS('awaiting_payment')">📤 انتظار التحويل</button>
      </div>
    </div>

    ${o.rejectReason ? `<div class="section" style="border:1px solid rgba(255,61,110,.2)"><div class="section-title" style="color:var(--r)">✕ سبب الرفض</div><div style="font-size:var(--fs-md);margin-top:8px">${o.rejectReason}</div></div>` : ''}
    ${['admin', 'operation_manager'].includes(currentRole) ? `<div class="section"><div class="section-title" style="margin-bottom:8px">📋 سجل الأوردر</div>${tlHtml(o.timeline)}</div>` : ''}

    <!-- ⚙️ إدارة الأوردر — للأدمن فقط -->
    <div id="admin-mgmt-section" style="display:none;margin-top:12px;background:rgba(255,61,110,.05);border:1px solid rgba(255,61,110,.2);border-radius:12px;padding:14px">
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-extra);color:var(--r);margin-bottom:12px">⚙️ إدارة الأوردر (أدمن)</div>

      <!-- نقل المرحلة -->
      <div style="margin-bottom:10px">
        <div style="font-size:var(--fs-sm);color:var(--dim2);margin-bottom:6px;font-weight:var(--fw-bold)">🔄 نقل لمرحلة أخرى</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button type="button" onclick="moveStage('design')"   style="padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--snow);font-size:var(--fs-sm);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit">✏️ تصميم</button>
          <button type="button" onclick="moveStage('printing')"  style="padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--snow);font-size:var(--fs-sm);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit">🖨️ طباعة</button>
          <button type="button" onclick="moveStage('production')" style="padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--snow);font-size:var(--fs-sm);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit">🏭 تنفيذ</button>
          <button type="button" onclick="moveStage('shipping')"  style="padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--snow);font-size:var(--fs-sm);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit">🚚 شحن</button>
          <button type="button" onclick="moveStage('archived')"  style="padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--dim2);font-size:var(--fs-sm);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit">📁 أرشيف</button>
        </div>
      </div>

      <!-- تعديل مالي -->
      <div style="margin-bottom:10px">
        <div style="font-size:var(--fs-sm);color:var(--dim2);margin-bottom:6px;font-weight:var(--fw-bold)">💰 تعديل مالي</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
          <div>
            <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:3px">السعر الكلي (ج)</div>
            <input id="adm-sale-price" type="number" style="width:100%;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:8px;color:var(--snow);font-size:var(--fs-md);font-family:inherit" placeholder="0">
          </div>
          <div>
            <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:3px">المدفوع (ج)</div>
            <input id="adm-paid" type="number" style="width:100%;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:8px;color:var(--snow);font-size:var(--fs-md);font-family:inherit" placeholder="0">
          </div>
        </div>
        <div style="margin-bottom:6px">
          <div style="font-size:var(--fs-xs);color:var(--dim2);margin-bottom:3px">الخصم (ج)</div>
          <input id="adm-discount" type="number" style="width:100%;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:8px;color:var(--snow);font-size:var(--fs-md);font-family:inherit" placeholder="0" oninput="calcAdmRemaining()">
        </div>
        <div id="adm-remaining-preview" style="font-size:var(--fs-base);color:var(--dim2);margin-bottom:8px"></div>
        <button type="button" onclick="saveAdminFinance()" style="width:100%;padding:9px;background:rgba(0,217,126,.12);border:1px solid rgba(0,217,126,.3);border-radius:8px;color:var(--g);font-size:var(--fs-base);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit">✓ حفظ التعديل المالي</button>
      </div>

      <!-- حذف نهائي -->
      <button type="button" onclick="deleteOrderFull()" style="width:100%;padding:10px;background:rgba(255,61,110,.1);border:1px solid rgba(255,61,110,.3);border-radius:8px;color:var(--r);font-size:var(--fs-base);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit">🗑 حذف الأوردر نهائياً</button>
    </div>
  `;
}

// ─── SIDE-EFFECT: expose to window for non-module callers ────────────
// (Design Control Center reads it via window.renderPanelHTML.)
if (typeof window !== 'undefined') {
  Object.assign(window, {
    renderPanelHTML,
    iRow, tlHtml, fn, delay, escapeNotes,
  });
}
