/**
 * financial-guard.js — حارس الأخطاء المالية
 *
 * يعرض modal بارز عند فشل عملية مالية بسبب أذونات/شبكة/قاعدة validation
 * بدل toast صغير سهل تفويته.
 *
 * الاستخدام:
 *   1. أضف <script src="financial-guard.js"></script> في الصفحة
 *   2. تلقائياً: يلتقط كل unhandledrejection ويفحصها
 *   3. يدوياً (مفضّل في catch handlers):
 *        catch(e) { window.financialGuard(e, {operation:'تسجيل عربون', amount:500, walletName:'كاش'}); }
 *
 * vanilla JS — يعمل مع Firebase v8 compat و v9 modular
 */
(function(){
  'use strict';

  const FINANCIAL_COLLECTIONS = [
    'wallets', 'transactions_v2', 'financial_ledger',
    'employee_payments', 'supplier_payments', 'shipping_settlements',
    'shipping_returns', 'reconciliations'
  ];

  function isFinancialError(err){
    if (!err) return false;
    const code = err.code || err.errorCode || '';
    const msg = (err.message || err.toString() || '').toLowerCase();
    if (code === 'permission-denied') return true;
    if (msg.includes('permission') && msg.includes('insufficient')) return true;
    if (msg.includes('missing or insufficient permissions')) return true;
    // فشل validation من Firestore rules
    if (msg.includes('firestore') && msg.includes('rule')) return true;
    return false;
  }

  function injectStyles(){
    if (document.getElementById('fg-styles')) return;
    const s = document.createElement('style');
    s.id = 'fg-styles';
    s.textContent = `
      #fg-overlay { position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:99999;
        display:none; align-items:center; justify-content:center; padding:var(--space-xl);
        font-family:Arial,sans-serif; direction:rtl; backdrop-filter:blur(4px); }
      #fg-overlay.show { display:flex; }
      #fg-modal { background:#1a1d2e; border:2px solid var(--r); border-radius:var(--rad2);
        max-width:560px; width:100%; padding:var(--space-2xl); box-shadow:0 20px 60px rgba(255,61,110,.3); }
      #fg-modal h2 { color:var(--r); margin:0 0 14px; font-size:20px; display:flex; align-items:center; gap:10px; }
      #fg-modal .fg-warn { background:rgba(255,170,0,.12); border:1px solid rgba(255,170,0,.4);
        color:var(--y); padding:12px 14px; border-radius:8px; font-size:var(--fs-md); margin-bottom:14px; line-height:var(--lh-relaxed); }
      #fg-modal .fg-row { display:flex; gap:var(--space-sm); padding:8px 0; border-bottom:1px solid #2a2d3e; font-size:var(--fs-md); }
      #fg-modal .fg-row:last-child { border-bottom:none; }
      #fg-modal .fg-lbl { color:#888; min-width:100px; }
      #fg-modal .fg-val { color:#fff; word-break:break-word; flex:1; }
      #fg-modal .fg-actions { display:flex; gap:10px; margin-top:18px; flex-wrap:wrap; }
      #fg-modal button { padding:11px 20px; border-radius:8px; border:none; cursor:pointer;
        font-weight:var(--fw-bold); font-size:var(--fs-lg); font-family:inherit; }
      #fg-modal .fg-copy { background:rgba(59,158,255,.2); color:#3b9eff; border:1px solid rgba(59,158,255,.4); }
      #fg-modal .fg-close { background:rgba(255,61,110,.2); color:var(--r); border:1px solid rgba(255,61,110,.4); flex:1; }
      #fg-modal .fg-tech { background:#0a0c1a; border-radius:6px; padding:8px 10px; font-family:monospace;
        font-size:var(--fs-sm); color:#aaa; margin-top:8px; max-height:80px; overflow-y:auto; }
    `;
    document.head.appendChild(s);
  }

  function injectModal(){
    if (document.getElementById('fg-overlay')) return;
    const div = document.createElement('div');
    div.id = 'fg-overlay';
    div.innerHTML = `
      <div id="fg-modal" role="alertdialog" aria-labelledby="fg-title">
        <h2 id="fg-title">⛔ فشلت عملية مالية</h2>
        <div class="fg-warn">
          <strong>⚠️ العملية لم تُحفظ.</strong> الرصيد لم يتغير، ولن تظهر في حركة المحافظ.
          <br>أبلغ الأدمن قبل تكرار المحاولة.
        </div>
        <div id="fg-details"></div>
        <div class="fg-tech" id="fg-tech"></div>
        <div class="fg-actions">
          <button class="fg-copy" id="fg-copy-btn">📋 نسخ التفاصيل للأدمن</button>
          <button class="fg-close" id="fg-close-btn">حسناً، فهمت</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    document.getElementById('fg-close-btn').onclick = () => {
      document.getElementById('fg-overlay').classList.remove('show');
    };
    document.getElementById('fg-copy-btn').onclick = () => {
      const txt = document.getElementById('fg-details').innerText + '\n\nFirebase:\n' +
                  document.getElementById('fg-tech').innerText;
      navigator.clipboard?.writeText(txt).then(
        () => { document.getElementById('fg-copy-btn').textContent = '✅ نُسخ'; },
        () => { document.getElementById('fg-copy-btn').textContent = '❌ تعذّر النسخ'; }
      );
    };
  }

  function show(err, context){
    injectStyles();
    injectModal();
    const ctx = context || {};
    const rows = [
      { lbl: 'العملية', val: ctx.operation || 'عملية مالية' },
      ...(ctx.amount != null    ? [{ lbl: 'المبلغ',    val: ctx.amount + ' ج' }] : []),
      ...(ctx.walletName        ? [{ lbl: 'المحفظة',   val: ctx.walletName     }] : []),
      ...(ctx.clientName        ? [{ lbl: 'العميل',    val: ctx.clientName     }] : []),
      ...(ctx.orderId           ? [{ lbl: 'الأوردر',   val: ctx.orderId        }] : []),
      { lbl: 'السبب', val: 'الأذونات في قاعدة البيانات لا تسمح لك بهذه العملية، أو فشل تحقق من القاعدة.' },
    ];
    document.getElementById('fg-details').innerHTML = rows
      .map(r => `<div class="fg-row"><span class="fg-lbl">${r.lbl}</span><span class="fg-val">${r.val}</span></div>`)
      .join('');
    document.getElementById('fg-tech').textContent =
      `code: ${err?.code || '—'}\nmessage: ${err?.message || err?.toString() || '—'}\nuser: ${(window.firebase?.auth?.()?.currentUser?.email || '—')}\ntime: ${new Date().toLocaleString('ar-EG')}\nurl: ${location.pathname}`;
    document.getElementById('fg-overlay').classList.add('show');
  }

  // الواجهة العامة — يدعو من catch handler
  // يعرض modal لو الخطأ مالي ويعيد true. خلاف ذلك يعيد false (تابع toast العادي)
  window.financialGuard = function(err, context){
    if (!isFinancialError(err)) return false;
    show(err, context);
    return true;
  };

  // وضع تشخيص — اختبر بدون رمي خطأ حقيقي
  window.financialGuardTest = function(){
    show({ code:'permission-denied', message:'TEST — Missing or insufficient permissions.' },
         { operation:'اختبار', amount:100, walletName:'محفظة-اختبار' });
  };

  // الالتقاط التلقائي لأي promise rejection غير معالج
  window.addEventListener('unhandledrejection', function(e){
    if (isFinancialError(e.reason)){
      e.preventDefault();
      show(e.reason, { operation: 'عملية مالية (لم تُلتقط في catch)' });
    }
  });

  console.log('[financial-guard] ✅ loaded — catches permission-denied on financial collections');
})();
