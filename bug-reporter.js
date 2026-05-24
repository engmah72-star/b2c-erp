/**
 * Business2Card ERP — bug-reporter.js
 *
 * Floating "🐛 إبلاغ عن مشكلة" button + modal.
 * Loaded on every page via shared.js include or direct <script src>.
 * Uses window.b2cErrorReporter (defined in core/error-reporter.js) to
 * submit user reports to the error_reports collection.
 */

(function () {
  if (typeof window === 'undefined') return;
  if (document.getElementById('b2c-bug-fab')) return; // idempotent

  // Wait for DOM ready
  function whenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  whenReady(() => {
    // ── Inject CSS ────────────────────────────────────────────────
    if (!document.getElementById('b2c-bug-style')) {
      const css = document.createElement('style');
      css.id = 'b2c-bug-style';
      css.textContent = `
        #b2c-bug-fab{position:fixed;bottom:max(70px,env(safe-area-inset-bottom,70px));left:14px;z-index:9990;
          width:48px;height:48px;border-radius:50%;background:var(--bg2,#0d0f1b);
          color:var(--snow,#dce5f5);border:1px solid var(--line,rgba(255,255,255,.13));
          font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;
          box-shadow:var(--shadow-card,0 4px 20px rgba(0,0,0,.3));transition:transform .15s,background .15s;
          font-family:inherit;-webkit-tap-highlight-color:transparent;padding:0;}
        #b2c-bug-fab:hover{transform:scale(1.05);background:var(--bg3,#121520);}
        #b2c-bug-fab[hidden]{display:none}
        #b2c-bug-ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9991;
          display:none;align-items:center;justify-content:center;padding:16px;}
        #b2c-bug-ov.open{display:flex}
        #b2c-bug-modal{background:var(--bg2,#0d0f1b);border:1px solid var(--line,rgba(255,255,255,.13));
          border-radius:var(--rad2,16px);max-width:500px;width:100%;color:var(--snow,#dce5f5);
          padding:20px;box-shadow:var(--shadow-modal,0 24px 80px rgba(0,0,0,.7));font-family:inherit;
          max-height:90vh;overflow-y:auto;}
        #b2c-bug-modal h2{font-size:18px;font-weight:800;margin:0 0 4px}
        #b2c-bug-modal p.sub{font-size:12px;color:var(--dim2,#647298);margin:0 0 16px}
        #b2c-bug-modal label{display:block;font-size:12px;font-weight:700;color:var(--snow);margin:12px 0 4px}
        #b2c-bug-modal textarea,#b2c-bug-modal select{width:100%;background:var(--bg3,#121520);
          border:1px solid var(--line,rgba(255,255,255,.13));color:var(--snow);
          border-radius:8px;padding:10px;font-family:inherit;font-size:13px;resize:vertical;}
        #b2c-bug-modal textarea{min-height:64px}
        #b2c-bug-modal .actions{display:flex;gap:8px;margin-top:16px;justify-content:flex-end;flex-wrap:wrap}
        #b2c-bug-modal button{padding:9px 18px;border-radius:8px;border:1px solid;font-weight:800;
          font-size:13px;cursor:pointer;font-family:inherit;}
        #b2c-bug-modal .btn-send{background:var(--g,#00d97e);color:#0d0f1b;border-color:var(--g);}
        #b2c-bug-modal .btn-cancel{background:transparent;color:var(--dim2);border-color:var(--line);}
        #b2c-bug-modal .ok-msg{padding:14px;background:rgba(0,217,126,.1);border:1px solid rgba(0,217,126,.3);
          border-radius:8px;color:var(--g);font-weight:700;margin-top:10px;}
      `;
      document.head.appendChild(css);
    }

    // ── Inject FAB ────────────────────────────────────────────────
    const fab = document.createElement('button');
    fab.id = 'b2c-bug-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'الإبلاغ عن مشكلة');
    fab.title = 'الإبلاغ عن مشكلة';
    fab.textContent = '🐛';
    fab.onclick = openModal;
    document.body.appendChild(fab);

    // ── Inject modal ──────────────────────────────────────────────
    const ov = document.createElement('div');
    ov.id = 'b2c-bug-ov';
    ov.innerHTML = `
      <div id="b2c-bug-modal">
        <h2>🐛 الإبلاغ عن مشكلة</h2>
        <p class="sub">ساعدنا نحسّن النظام — اكتب اللي حصل والـ admin هيراجعه.</p>
        <label>الـ severity (مدى خطورة المشكلة)</label>
        <select id="b2c-bug-sev">
          <option value="low">🟢 صغيرة (تحسين بسيط)</option>
          <option value="med" selected>🟡 متوسطة (شغل بطيء/مزعج)</option>
          <option value="high">🔴 حرجة (مش قادر أكمّل شغلي)</option>
        </select>
        <label>اللي كنت بحاول أعمله</label>
        <textarea id="b2c-bug-expected" placeholder="مثلاً: كنت بحاول أسجّل دفعة لعميل..."></textarea>
        <label>اللي حصل فعلاً</label>
        <textarea id="b2c-bug-actual" placeholder="مثلاً: ضغطت 'حفظ' ومافيش حاجة حصلت / ظهرت رسالة خطأ..."></textarea>
        <label>ملاحظات إضافية (اختياري)</label>
        <textarea id="b2c-bug-desc" placeholder="أي تفاصيل تساعدنا (وقت حصول المشكلة، أوردر معيّن، إلخ)"></textarea>
        <div class="actions">
          <button type="button" class="btn-cancel" onclick="window.b2cBugClose()">إلغاء</button>
          <button type="button" class="btn-send" onclick="window.b2cBugSend()">📤 إرسال</button>
        </div>
        <div id="b2c-bug-ok" class="ok-msg" style="display:none">
          ✅ شكراً — التقرير اتسجّل والـ admin هيراجعه قريباً.
        </div>
      </div>
    `;
    ov.onclick = (e) => { if (e.target === ov) closeModal(); };
    document.body.appendChild(ov);

    // ── Keyboard shortcut: Ctrl+Shift+B ───────────────────────────
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        openModal();
      }
    });
  });

  function openModal() {
    const ov = document.getElementById('b2c-bug-ov');
    if (ov) {
      ov.classList.add('open');
      document.getElementById('b2c-bug-expected')?.focus();
      document.getElementById('b2c-bug-ok').style.display = 'none';
    }
  }

  function closeModal() {
    document.getElementById('b2c-bug-ov')?.classList.remove('open');
    ['b2c-bug-expected', 'b2c-bug-actual', 'b2c-bug-desc'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  function send() {
    const expected = document.getElementById('b2c-bug-expected')?.value?.trim() || '';
    const actual   = document.getElementById('b2c-bug-actual')?.value?.trim()   || '';
    const desc     = document.getElementById('b2c-bug-desc')?.value?.trim()     || '';
    const sev      = document.getElementById('b2c-bug-sev')?.value || 'med';

    if (!expected && !actual) {
      alert('من فضلك اكتب اللي كنت بحاول تعمله أو اللي حصل');
      return;
    }

    const reporter = window.b2cErrorReporter;
    if (!reporter || !reporter.reportProblem) {
      alert('⚠️ نظام الإبلاغ مش جاهز بعد — حاول بعد لحظات.');
      return;
    }
    reporter.reportProblem({
      description:      desc,
      expectedBehavior: expected,
      actualBehavior:   actual,
      severity:         sev,
    });

    // Show success + close after 2s
    const ok = document.getElementById('b2c-bug-ok');
    if (ok) ok.style.display = 'block';
    setTimeout(closeModal, 2000);
  }

  // Expose for inline onclick
  window.b2cBugClose = closeModal;
  window.b2cBugSend = send;
})();
