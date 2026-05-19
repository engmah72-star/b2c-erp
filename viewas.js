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
     * Start view-as mode (LIGHT — DOM masking only, auth stays as admin).
     * @param {Object} target - {uid,name,role,permissions,empId}
     * @param {String} adminUid - the real admin uid (for verification)
     * @param {String} [openUrl] - optional url to navigate to after starting
     */
    start(target, adminUid, openUrl){
      if (!target?.uid || !target?.role) {
        console.warn('[viewas] target must include uid and role');
        return;
      }
      setState({ ...target, mode: 'light' });
      setAdminUid(adminUid || '');
      if (openUrl) window.location.href = openUrl;
    },
    /**
     * Mark active state as DEEP (real auth swap). Called by role-viewer
     * after signInWithCustomToken succeeds.
     */
    markDeep(meta){
      const cur = getState() || {};
      setState({ ...cur, ...meta, mode: 'deep' });
    },
    /**
     * Clear view-as state. For deep mode, also signs out (caller's job).
     */
    clear(reload=true){
      const cur = getState();
      setState(null);
      sessionStorage.removeItem(ADMIN_UID_KEY);
      // For deep mode, the caller is expected to sign out & redirect to login.
      // For light mode, just reload to drop the AppState override.
      if (cur?.mode === 'deep') {
        // Force redirect to login (deep mode session is the target's, admin needs to re-auth)
        window.location.href = 'login.html?after_deep=1';
        return;
      }
      if (reload) window.location.reload();
    },
    isActive(){ return !!getState(); },
    isDeep(){ return getState()?.mode === 'deep'; },
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

    const isDeep = va.mode === 'deep';
    const expiresAt = va.expiresAt || 0;
    const b = document.createElement('div');
    b.id = 'b2c-va-banner';
    if (isDeep) {
      // Deep mode → different gradient + countdown
      b.style.background = 'linear-gradient(90deg,#00d97e,#22d3ee,#3b9eff)';
    }
    b.innerHTML = `
      <div class="va-msg">
        <span>${isDeep ? '🔐 Deep Mode — مُسجَّل دخول فعلي كـ' : '🔍 وضع المعاينة — أنت تتصفح كأنك:'}</span>
        <strong>${escHtml(va.name||'موظف')}</strong>
        <span class="va-tag">${escHtml(va.role||'')}</span>
        ${isDeep ? `<span class="va-tag" id="va-countdown" style="background:rgba(255,255,255,.2);font-weight:800">⏱ —</span>` : `<span style="font-size:11px;opacity:.85">· الكتابة مُعطّلة</span>`}
      </div>
      <button onclick="window.__b2cViewAs.clear()">✕ ${isDeep ? 'إنهاء وتسجيل دخول كأدمن' : 'خروج من المعاينة'}</button>
    `;
    if (document.body) document.body.prepend(b);
    else document.addEventListener('DOMContentLoaded', () => document.body.prepend(b));

    // Deep mode: countdown timer + auto-expire
    if (isDeep && expiresAt) {
      const updateCountdown = () => {
        const el = document.getElementById('va-countdown');
        if (!el) return;
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) {
          el.textContent = '⏱ انتهت';
          // Auto sign out
          if (!window.__b2cExpiring) {
            window.__b2cExpiring = true;
            blockClickToast('⏱ انتهت جلسة Deep Mode — جاري التسجيل خروج...');
            setTimeout(() => window.__b2cViewAs.clear(), 1200);
          }
          return;
        }
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        el.textContent = `⏱ ${mins}:${String(secs).padStart(2,'0')}`;
      };
      updateCountdown();
      setInterval(updateCountdown, 1000);
    }
  }
  function escHtml(s){return String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);}

  injectBanner();

  // ── Defensive role-gate (P0 security) ─────────────────────────────
  // قبل تطبيق أي override على AppState، نتحقق أن المستخدم الحقيقي (قبل
  // المعاينة) هو admin أو operation_manager. هذا يمنع أي محاولة لرفع
  // الصلاحيات عبر ضبط sessionStorage يدوياً من DevTools.
  //
  // viewas.js يعمل كـ IIFE قبل shared.js initAuth، لذلك currentRole لا
  // يكون متوفراً فوراً. نلتقط أول قيمة نراها كـ "real role" قبل أي override.
  let __vaAborted = false;
  function gateAdminOrAbort(){
    if (__vaAborted) return false;
    if (!window.AppState) return null; // غير جاهز بعد — نُعيد المحاولة
    // ألتقط الدور الحقيقي مرة واحدة قبل أي override
    if (window.AppState._realRole === undefined) {
      const cur = window.AppState.currentRole;
      // إذا كان الدور الحالي مطابقاً للـ target → ربما override طُبِّق سابقاً
      // أو لا يزال غير محمَّل. نتجاهل ونعيد المحاولة.
      if (!cur || cur === va.role) return null;
      window.AppState._realRole = cur;
    }
    const realRole = window.AppState._realRole;
    if (['admin', 'operation_manager'].includes(realRole)) return true;
    // غير مصرّح → امسح الحالة وأخفِ البانر
    console.warn('[viewas] non-admin role detected:', realRole, '— clearing state');
    __vaAborted = true;
    setState(null);
    sessionStorage.removeItem(ADMIN_UID_KEY);
    document.getElementById('b2c-va-banner')?.remove();
    document.getElementById('b2c-va-style')?.remove();
    try { obs?.disconnect?.(); } catch(_){}
    return false;
  }

  // ── Apply identity override to common globals (best effort) ──
  // Pages that use shared.js → AppState gets overridden
  // Pages with their own currentRole need to opt in via window.__b2cApplyViewAs()
  function applyIdentity(){
    if (window.AppState) {
      try {
        const gate = gateAdminOrAbort();
        if (gate === false) return; // غير مصرّح
        if (gate === null) return;  // غير جاهز — انتظر التكرار التالي
        window.AppState.currentRole = va.role;
        window.AppState.userPerms   = va.permissions || {};
        window.AppState.userName    = va.name;
      } catch(_){}
    }
    // Provide a helper that pages can call after they load their own user doc
    window.__b2cApplyViewAs = function(userDataLike){
      // Returns a merged user-data object using the view-as identity
      if (!va || __vaAborted) return userDataLike;
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
    if (n >= 20 || __vaAborted) clearInterval(tick);
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
  // الكتابة معطّلة في:
  //   - Light Mode دائماً (admin's auth ما لازمش يكتب باسم الموظف)
  //   - Deep Mode + dryRun (للاختبار الآمن)
  // الكتابة مسموحة في Deep Mode (real session) — Firestore rules بتطبّق صلاحيات الموظف.
  const blockWrites = !isDeepMode || va.dryRun === true;

  if (blockWrites) {
    document.addEventListener('submit', e => {
      e.preventDefault(); e.stopPropagation();
      blockClickToast('⛔ النموذج معطّل — أنت في وضع المعاينة');
    }, true);
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
  }

  // ──────────────────────────────────────────────────────────────
  // DOM MASKING — defense-in-depth field hiding by target role
  // ──────────────────────────────────────────────────────────────
  // الـ Firestore reads بترجع بيانات الـ admin (لأن الـ auth uid لسه admin).
  // عشان نخلي المعاينة تشبه الواقع، بنطبق masking على الـ DOM:
  //   - أرقام التليفون → 012****567 لو الدور المستهدف مش له client_phone
  //   - روابط tel:/wa.me/whatsapp → معطّلة
  //   - عناصر فيها data-perm="X" → مخفية لو الدور مش له صلاحية X
  //   - أزرار/أيقونات اتصال + واتساب → مخفية
  //
  // مصدر صلاحيات الدور: نسخة محلية من DEFAULT_PERMISSIONS (matches shared.js)
  // — لو تحدّث shared.js، حدّث هنا.

  // RULE 8.1 — الأدوار اللي تشوف رقم العميل
  const ROLE_CAN_SEE_PHONE = new Set([
    'admin', 'operation_manager', 'customer_service', 'shipping_officer'
  ]);
  // RULE 8.2 — الأدوار اللي تشوف بيانات التصميم
  const ROLE_CAN_SEE_DESIGN = new Set([
    'admin', 'customer_service', 'graphic_designer', 'design_operator', 'production_agent'
  ]);
  // أدوار تشوف التكلفة الداخلية
  const ROLE_CAN_SEE_COST = new Set([
    'admin', 'operation_manager', 'production_agent', 'wallet_manager'
  ]);
  // أدوار تشوف الهامش/الإيرادات
  const ROLE_CAN_SEE_MARGIN = new Set([
    'admin', 'operation_manager', 'wallet_manager'
  ]);
  // أدوار تشوف الأسعار (بيع/مدفوع)
  const ROLE_CAN_SEE_PRICES = new Set([
    'admin', 'operation_manager', 'customer_service', 'wallet_manager'
  ]);

  const targetRole = va.role || '';
  const isDeepMode = va.mode === 'deep';
  // في Deep Mode، الـ auth الفعلي هو للموظف نفسه، فالـ Firestore rules بتحجب
  // البيانات على مستوى الـ network — DOM masking غير ضروري (والـ data أصلاً
  // مش بتوصل للـ client). لكن نخليه شغال كـ safety net لو حد عمل query
  // واسعة قبل ما الـ rules تترفض جزء منها.
  const masks = {
    phone:    !ROLE_CAN_SEE_PHONE.has(targetRole),
    design:   !ROLE_CAN_SEE_DESIGN.has(targetRole),
    cost:     !ROLE_CAN_SEE_COST.has(targetRole),
    margin:   !ROLE_CAN_SEE_MARGIN.has(targetRole),
    prices:   !ROLE_CAN_SEE_PRICES.has(targetRole),
  };

  // ── Phone masking: 012****567 ──
  // يطابق الأرقام المصرية: 010/011/012/015 + 8 أرقام (11 رقم إجمالاً)
  // وكذلك +20 و 0020 و الأرقام بدون كود.
  const PHONE_RE = /(\+?20|0020)?\s*0?1[0125]\d{8}\b/g;
  function maskPhoneStr(s){
    const digits = String(s||'').replace(/\D/g, '');
    if (digits.length < 6) return '****';
    return digits.slice(0, 3) + '****' + digits.slice(-3);
  }
  function maskPhonesInText(text){
    return text.replace(PHONE_RE, m => maskPhoneStr(m));
  }

  // ── Hide elements based on data-perm attributes ──
  // أي عنصر فيه data-perm="client_phone" أو ".client_phone" بيتخفي تلقائياً.
  const PERM_HIDE_MAP = {
    'client_phone':  masks.phone,
    'design_data':   masks.design,
    'price_cost':    masks.cost,
    'price_margin':  masks.margin,
    'price_sale':    masks.prices,
    'price_paid':    masks.prices,
    'supplier_cost': masks.cost,
  };

  function applyMaskingToNode(root){
    if (!root || !root.nodeType) return;

    // 1) Hide elements with data-perm attribute that's masked
    if (root.querySelectorAll) {
      root.querySelectorAll('[data-perm]').forEach(el => {
        const perm = el.getAttribute('data-perm');
        if (PERM_HIDE_MAP[perm]) {
          el.style.visibility = 'hidden';
          el.dataset.vaHidden = '1';
        }
      });

      // 2) Disable tel: and wa.me/whatsapp links if phone is masked
      if (masks.phone) {
        root.querySelectorAll('a[href^="tel:"],a[href*="wa.me/"],a[href*="api.whatsapp.com"],a[href*="whatsapp://"]').forEach(a => {
          if (a.dataset.vaDisabled) return;
          a.dataset.vaDisabled = '1';
          a.dataset.vaOrigHref = a.getAttribute('href') || '';
          a.removeAttribute('href');
          a.style.opacity = '.35';
          a.style.cursor = 'not-allowed';
          a.title = 'معطّل في وضع المعاينة (الدور لا يرى رقم العميل)';
          a.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            blockClickToast('⛔ روابط الاتصال معطّلة في وضع المعاينة');
          }, true);
        });

        // 3) Mask phone numbers in text nodes
        maskPhoneTextNodes(root);
      }
    }
  }

  // Walk text nodes — replace phone numbers
  // نتجنب inputs/textarea/contenteditable عشان ميحصلش conflict مع المستخدم
  function maskPhoneTextNodes(root){
    if (!root.nodeType) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        if (p.closest('#b2c-va-banner')) return NodeFilter.FILTER_REJECT;
        if (p.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (!PHONE_RE.test(node.nodeValue)) {
          PHONE_RE.lastIndex = 0;
          return NodeFilter.FILTER_REJECT;
        }
        PHONE_RE.lastIndex = 0;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const targets = [];
    let n; while ((n = walker.nextNode())) targets.push(n);
    targets.forEach(t => {
      const masked = maskPhonesInText(t.nodeValue);
      if (masked !== t.nodeValue) t.nodeValue = masked;
    });
  }

  // Also mask phone values in input/textarea elements (read-only display)
  function maskPhoneInputs(root){
    if (!root.querySelectorAll) return;
    root.querySelectorAll('input[value],input[readonly],input[disabled]').forEach(inp => {
      if (inp.dataset.vaMasked) return;
      const v = inp.value || inp.getAttribute('value') || '';
      if (PHONE_RE.test(v)) {
        PHONE_RE.lastIndex = 0;
        inp.dataset.vaMasked = '1';
        inp.dataset.vaOrig = v;
        inp.value = maskPhonesInText(v);
      }
      PHONE_RE.lastIndex = 0;
    });
  }

  // Initial pass + observe DOM changes (real-time apps re-render constantly)
  function runMaskPass(){
    if (!document.body) { setTimeout(runMaskPass, 50); return; }
    applyMaskingToNode(document.body);
    if (masks.phone) maskPhoneInputs(document.body);
  }
  runMaskPass();

  const obs = new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          applyMaskingToNode(node);
          if (masks.phone) maskPhoneInputs(node);
        } else if (node.nodeType === 3 && masks.phone) {
          // text node added directly — mask if needed
          if (PHONE_RE.test(node.nodeValue)) {
            PHONE_RE.lastIndex = 0;
            const p = node.parentElement;
            if (p && !p.closest('#b2c-va-banner') && p.tagName !== 'SCRIPT' && p.tagName !== 'STYLE') {
              node.nodeValue = maskPhonesInText(node.nodeValue);
            }
          }
          PHONE_RE.lastIndex = 0;
        }
      });
      // For attribute changes (value changes on inputs, href changes), re-check
      if (m.type === 'attributes' && masks.phone) {
        if (m.target.tagName === 'A' && (m.attributeName === 'href')) {
          applyMaskingToNode(m.target.parentNode || m.target);
        }
        if ((m.target.tagName === 'INPUT' || m.target.tagName === 'TEXTAREA') && m.attributeName === 'value') {
          maskPhoneInputs(m.target.parentNode || document.body);
        }
      }
    }
  });
  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href','value','data-perm'] });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href','value','data-perm'] });
      runMaskPass();
    });
  }

  // Add a debug badge to the banner showing what's masked
  function addMaskingBadges(){
    const banner = document.getElementById('b2c-va-banner');
    if (!banner || banner.dataset.maskBadged) return;
    const active = Object.entries(masks).filter(([,v])=>v).map(([k])=>k);
    if (active.length === 0) return;
    banner.dataset.maskBadged = '1';
    const msg = banner.querySelector('.va-msg');
    if (msg) {
      const badge = document.createElement('span');
      badge.style.cssText = 'background:rgba(0,0,0,.25);padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700';
      badge.title = 'حقول مُقنّعة: ' + active.join(', ');
      badge.textContent = '🛡 مُقنّع: ' + active.length + ' حقل';
      msg.appendChild(badge);
    }
  }
  if (document.body) addMaskingBadges();
  else document.addEventListener('DOMContentLoaded', addMaskingBadges);

  // expose state on window for debugging
  window.__b2cViewAs.adminUid = getAdminUid();
  window.__b2cViewAs.masks    = masks;
})();
