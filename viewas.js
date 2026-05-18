/**
 * Business2Card ERP — View-As Runtime
 * تشغيل وضع المعاينة: admin يستعرض الموقع كأنه موظف آخر.
 *
 * كيف يشتغل:
 *  - role-viewer.html بيحط في sessionStorage الـ identity المستهدف
 *  - viewas.js يقرأ الـ sessionStorage عند تحميل أي صفحة
 *  - لو موجود → يحقن banner ثابت + يقفل الكتابة (toast تحذيري)
 *  - يحاول يحقن الـ identity على AppState (للصفحات اللي بتستخدم shared.js)
 *
 * ملاحظة مهمة: ده simulator بصري. الـ Firestore reads بترجع
 * بيانات الـ admin الحقيقي (مش الموظف المستهدف)، عشان كده الكتابة مقفولة
 * لتجنب أي ضرر. للمعاينة العميقة، صفحة role-viewer.html فيها
 * "Permissions Matrix" و "Role Preview" بيوريك بالظبط الفروقات.
 *
 * Storage Schema:
 *   sessionStorage.b2c_view_as = JSON {
 *     uid, name, role, permissions, empId, source
 *   }
 */
(function(){
  'use strict';

  const KEY = 'b2c_view_as';
  const ADMIN_UID_KEY = 'b2c_view_as_admin_uid'; // الـ uid الحقيقي للأدمن

  function safeParse(s){ try { return JSON.parse(s); } catch(_) { return null; } }

  function getState(){ return safeParse(sessionStorage.getItem(KEY)); }
  function setState(v){
    if (v) sessionStorage.setItem(KEY, JSON.stringify(v));
    else   sessionStorage.removeItem(KEY);
  }
  function getAdminUid(){ return sessionStorage.getItem(ADMIN_UID_KEY) || ''; }
  function setAdminUid(uid){ sessionStorage.setItem(ADMIN_UID_KEY, uid || ''); }

  // ── Public API ──
  window.__b2cViewAs = {
    get: getState,
    /**
     * Start view-as mode.
     * @param {Object} target - {uid,name,role,permissions,empId}
     * @param {String} adminUid - the real admin uid (for verification)
     * @param {String} [openUrl] - optional url to navigate to after starting
     */
    start(target, adminUid, openUrl){
      if (!target?.uid || !target?.role) {
        console.warn('[viewas] target must include uid and role');
        return;
      }
      setState(target);
      setAdminUid(adminUid || '');
      if (openUrl) window.location.href = openUrl;
    },
    clear(reload=true){
      setState(null);
      sessionStorage.removeItem(ADMIN_UID_KEY);
      if (reload) window.location.reload();
    },
    isActive(){ return !!getState(); },
  };

  // ── Run only if state is active ──
  const va = getState();
  if (!va) return;

  // ── Inject styles + banner ──
  function injectBanner(){
    if (document.getElementById('b2c-va-banner')) return;
    const css = document.createElement('style');
    css.id = 'b2c-va-style';
    css.textContent = `
      #b2c-va-banner{position:fixed;top:0;left:0;right:0;z-index:99999;
        background:linear-gradient(90deg,#ff3d6e,#a78bfa,#22d3ee);
        color:#fff;padding:9px 16px;direction:rtl;
        font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;font-size:13px;
        font-weight:800;display:flex;justify-content:space-between;align-items:center;
        gap:12px;box-shadow:0 2px 10px rgba(0,0,0,.35);
        border-bottom:2px solid rgba(255,255,255,.25)}
      #b2c-va-banner .va-msg{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;flex:1}
      #b2c-va-banner .va-tag{background:rgba(0,0,0,.25);padding:3px 10px;border-radius:20px;font-size:11px}
      #b2c-va-banner button{background:#fff;color:#ff3d6e;border:none;padding:6px 14px;
        border-radius:20px;font-weight:800;cursor:pointer;font-family:inherit;font-size:12px;
        white-space:nowrap;flex-shrink:0}
      #b2c-va-banner button:hover{background:#ffe3e9}
      body{padding-top:46px !important}
      .topbar{top:46px !important}
      .sidenav{top:46px !important;height:calc(100vh - 46px) !important}
      @media(max-width:700px){
        #b2c-va-banner{font-size:11px;padding:7px 10px}
        body{padding-top:60px !important}
        .topbar{top:60px !important}
        .sidenav{top:60px !important;height:calc(100vh - 60px) !important}
      }
      .va-write-blocked-toast{position:fixed;bottom:24px;right:24px;z-index:99998;
        background:#ff3d6e;color:#fff;padding:12px 18px;border-radius:10px;
        font-family:inherit;font-weight:800;font-size:13px;
        box-shadow:0 8px 22px rgba(255,61,110,.4);animation:vaToast .25s ease-out;
        max-width:320px;direction:rtl}
      @keyframes vaToast{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    `;
    document.head.appendChild(css);

    const b = document.createElement('div');
    b.id = 'b2c-va-banner';
    b.innerHTML = `
      <div class="va-msg">
        <span>🔍 وضع المعاينة — أنت تتصفح كأنك:</span>
        <strong>${escHtml(va.name||'موظف')}</strong>
        <span class="va-tag">${escHtml(va.role||'')}</span>
        <span style="font-size:11px;opacity:.85">· الكتابة مُعطّلة</span>
      </div>
      <button onclick="window.__b2cViewAs.clear()">✕ خروج من المعاينة</button>
    `;
    if (document.body) document.body.prepend(b);
    else document.addEventListener('DOMContentLoaded', () => document.body.prepend(b));
  }
  function escHtml(s){return String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);}

  injectBanner();

  // ── Apply identity override to common globals (best effort) ──
  // Pages that use shared.js → AppState gets overridden
  // Pages with their own currentRole need to opt in via window.__b2cApplyViewAs()
  function applyIdentity(){
    if (window.AppState) {
      try {
        window.AppState.currentRole = va.role;
        window.AppState.userPerms   = va.permissions || {};
        window.AppState.userName    = va.name;
      } catch(_){}
    }
    // Provide a helper that pages can call after they load their own user doc
    window.__b2cApplyViewAs = function(userDataLike){
      // Returns a merged user-data object using the view-as identity
      if (!va) return userDataLike;
      return {
        ...userDataLike,
        role:        va.role,
        permissions: va.permissions || {},
        name:        va.name,
        viewAs:      true,
        viewAsUid:   va.uid,
      };
    };
  }
  applyIdentity();
  // Retry a few times in case AppState is loaded asynchronously
  let n = 0;
  const tick = setInterval(()=>{
    n++;
    applyIdentity();
    if (n >= 20) clearInterval(tick);
  }, 250);

  // ── Block writes (defensive — visible signal) ──
  // We can't intercept Firestore SDK methods directly (they're ESM-imported),
  // but we can intercept the high-level operations admins typically click.
  function blockClickToast(msg){
    let t = document.querySelector('.va-write-blocked-toast');
    if (t) t.remove();
    t = document.createElement('div');
    t.className = 'va-write-blocked-toast';
    t.textContent = msg || '⛔ الكتابة معطّلة في وضع المعاينة';
    document.body.appendChild(t);
    setTimeout(()=>t.remove(), 2600);
  }
  // Intercept form submits
  document.addEventListener('submit', e => {
    e.preventDefault(); e.stopPropagation();
    blockClickToast('⛔ النموذج معطّل — أنت في وضع المعاينة');
  }, true);
  // Intercept clicks on common write buttons (save/delete/pay/...)
  const WRITE_SIGNAL = /\b(حفظ|حذف|دفع|صرف|إرسال|أضف|إضافة|اعتماد|تأكيد|تسجيل|delete|save|submit|pay|confirm|approve|add)\b/i;
  document.addEventListener('click', e => {
    const target = e.target.closest('button, [role="button"], .btn');
    if (!target) return;
    if (target.id === 'b2c-va-banner' || target.closest('#b2c-va-banner')) return;
    const txt = (target.textContent || '').trim();
    const onclick = target.getAttribute('onclick') || '';
    if (WRITE_SIGNAL.test(txt) || WRITE_SIGNAL.test(onclick)) {
      e.preventDefault(); e.stopPropagation();
      blockClickToast('⛔ "' + txt.slice(0,40) + '" معطّل في المعاينة');
    }
  }, true);

  // expose state on window for debugging
  window.__b2cViewAs.adminUid = getAdminUid();
})();
