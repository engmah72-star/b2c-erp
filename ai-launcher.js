// ══════════════════════════════════════════════════════════
// ai-launcher.js — Floating "اسأل AI" button (page-aware chat)
// ══════════════════════════════════════════════════════════
// زر عائم بأسفل-يمين الشاشة (مقابل wa-launcher على اليسار).
// يفتح modal فيه شات بـ Gemini مع context مختصر للصفحة الحالية.
// يُحقن في كل الصفحات الإدارية. ai-insights.html له واجهته الكاملة.
// ══════════════════════════════════════════════════════════
import { askAI, hasKey, setKey, getKey, clearKey, KEY_NEEDED } from './ai-engine.js';
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

(function() {
  const PATH = (location.pathname.split('/').pop() || '').toLowerCase();
  const SKIP = [
    'login.html','client-login.html','client-portal.html',
    'order-tracking.html','waybill.html','whatsapp.html','chat.html',
    'ai-insights.html','change-password.html','',
  ];
  if (SKIP.includes(PATH)) return;

  // ── Page-aware prompt suggestions ──
  const PAGE_HINTS = {
    'index.html':       ['ملخص اليوم في كلمتين','ما أبرز التحديات الحالية؟','أعطني 3 أولويات للأسبوع'],
    'clients.html':     ['ما العملاء الخاملون منذ 60 يوماً؟','أكثر العملاء قيمة؟','أي عميل يحتاج متابعة؟'],
    'design.html':      ['ما الأوردرات المتأخرة في التصميم؟','أكثر المنتجات طلباً؟'],
    'production.html':  ['ما الأوردرات قيد الإنتاج؟','معدل اكتمال الإنتاج آخر 30 يوم؟'],
    'print.html':       ['ما الأوردرات الجاهزة للطباعة؟'],
    'shipping.html':    ['ما الشحنات المتأخرة؟','أعطني ملخص الشحن اليوم'],
    'accounts.html':    ['ما إجمالي الديون على العملاء؟','أرصدة المحافظ؟'],
    'reports.html':     ['ما أداء آخر 30 يوم؟','مقارنة بآخر 90 يوم؟'],
    'suppliers.html':   ['أكثر الموردين تعاملاً؟'],
    'employees.html':   ['ما إجمالي الرواتب الشهر؟'],
    'job-orders.html':  ['ما الأوردرات المتأخرة؟','أكثر المنتجات طلباً؟'],
  };
  const hints = PAGE_HINTS[PATH] || ['ملخص الأداء','أبرز الفرص الحالية','تحديات تحتاج اهتمام'];

  // ── Firebase (reuse existing app if shared.js already initialized one) ──
  const FB_CONFIG = {
    apiKey:"AIzaSyDEK3I06IMrJPiYX09ULF7OIcbsMOsasUk",authDomain:"business2card-c041b.firebaseapp.com",
    projectId:"business2card-c041b",storageBucket:"business2card-c041b.firebasestorage.app",
    messagingSenderId:"235622448899",appId:"1:235622448899:web:d8652ff71082f7d003f336",
  };
  let app, db;
  try { app = getApp(); } catch { app = initializeApp(FB_CONFIG); }
  db = getFirestore(app);

  // ── Cached compact context (loaded once per session) ──
  let contextCache = '';
  let loadingContext = false;
  async function loadContext() {
    if (contextCache || loadingContext) return contextCache;
    loadingContext = true;
    try {
      const [oSnap, cSnap] = await Promise.all([
        getDocs(collection(db,'orders')).catch(() => ({ docs: [] })),
        getDocs(collection(db,'clients')).catch(() => ({ docs: [] })),
      ]);
      const orders = oSnap.docs.map(d => d.data());
      const clients = cSnap.docs.map(d => d.data());
      contextCache = buildCompactContext(orders, clients);
    } catch (e) {
      console.warn('[ai-launcher] loadContext failed:', e);
      contextCache = '— لا توجد بيانات متاحة حالياً —';
    } finally {
      loadingContext = false;
    }
    return contextCache;
  }

  function buildCompactContext(orders, clients) {
    const fn = n => Math.round(parseFloat(n)||0).toLocaleString('ar-EG');
    const tsMs = ts => ts?.toDate?.()?.getTime() || ((ts?.seconds||0)*1000) || 0;
    const cutoff = Date.now() - 90*864e5;
    const recent = orders.filter(o => tsMs(o.createdAt) >= cutoff);
    const paid = o => parseFloat(o.totalPaid)||parseFloat(o.paid)||parseFloat(o.deposit)||0;
    const rev = recent.reduce((s,o) => s + paid(o), 0);
    const rem = orders.reduce((s,o) => s + Math.max(0,(parseFloat(o.totalPrice)||parseFloat(o.price)||0)-paid(o)), 0);
    const now = Date.now();
    const late = orders.filter(o => !['delivered','archived','cancelled'].includes(o.stage) && tsMs(o.deliveryDate) && tsMs(o.deliveryDate)<now).length;
    const stageCnt = {};
    recent.forEach(o => { stageCnt[o.stage] = (stageCnt[o.stage]||0)+1; });
    const prodCnt = {};
    recent.forEach(o => {
      const p = o.productName || o.product || 'غير محدد';
      prodCnt[p] = (prodCnt[p]||0)+1;
    });
    const topProd = Object.entries(prodCnt).sort((a,b) => b[1]-a[1]).slice(0,5);
    return `بيانات شركة طباعة (B2C ERP) — آخر 90 يوم:
- أوردرات: ${recent.length} (إجمالي ${orders.length})
- إيراد محصّل: ${fn(rev)} ج
- متبقّ على العملاء: ${fn(rem)} ج
- متأخرة عن التسليم: ${late}
- العملاء: ${clients.length}
المراحل: ${Object.entries(stageCnt).map(([s,n])=>`${s}=${n}`).join(', ')}
أكثر المنتجات: ${topProd.map(([p,n])=>`${p}(${n})`).join(', ')}`;
  }

  // ── DOM ──
  function inject() {
    if (document.getElementById('ai-fab')) return;

    const style = document.createElement('style');
    style.id = 'ai-fab-style';
    style.textContent = `
      #ai-fab{position:fixed;bottom:22px;right:22px;z-index:9998;width:54px;height:54px;
        border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);color:#fff;
        font-size:22px;border:none;cursor:pointer;padding:0;
        box-shadow:0 4px 16px rgba(16,185,129,.42);
        transition:transform .15s ease,box-shadow .15s ease;
        font-family:inherit;display:flex;align-items:center;justify-content:center;}
      #ai-fab:hover{transform:scale(1.08);box-shadow:0 6px 22px rgba(16,185,129,.55);}
      #ai-fab:active{transform:scale(.96);}
      #ai-modal{position:fixed;inset:0;background:rgba(15,17,23,.7);z-index:9999;display:none;
        align-items:flex-end;justify-content:center;padding:0;backdrop-filter:blur(4px);}
      #ai-modal.open{display:flex}
      #ai-panel{background:#161b27;color:#e8eaf0;border:1px solid #2a3348;border-radius:18px 18px 0 0;
        width:100%;max-width:560px;max-height:88vh;display:flex;flex-direction:column;
        animation:ai-slide .25s ease-out;font-family:system-ui,sans-serif;direction:rtl}
      @keyframes ai-slide{from{transform:translateY(100%)}to{transform:translateY(0)}}
      #ai-head{padding:14px 18px;border-bottom:1px solid #2a3348;display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px}
      #ai-head .dot{width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981}
      #ai-head .x{margin-right:auto;background:#1e2535;border:1px solid #2a3348;color:#8892a4;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}
      #ai-msgs{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:9px;min-height:120px}
      .ai-m{max-width:88%;padding:10px 13px;border-radius:12px;font-size:13px;line-height:1.6;white-space:pre-wrap}
      .ai-m.u{background:#4f8ef7;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
      .ai-m.b{background:#1e2535;color:#e8eaf0;align-self:flex-start;border-bottom-left-radius:4px}
      .ai-m.b strong{color:#34d399}
      .ai-typing{background:#1e2535;padding:10px 13px;border-radius:12px;align-self:flex-start;font-size:13px;color:#5c6878;border-bottom-left-radius:4px}
      #ai-hints{padding:0 16px 8px;display:flex;gap:6px;flex-wrap:wrap}
      .ai-hint{padding:6px 10px;background:#1e2535;border:1px solid #2a3348;color:#8892a4;border-radius:18px;font-size:11px;cursor:pointer;transition:.15s}
      .ai-hint:hover{border-color:#10b981;color:#10b981}
      #ai-keyrow{padding:10px 16px;background:#1e2535;border-top:1px solid #2a3348;display:none}
      #ai-keyrow.show{display:flex;gap:6px;align-items:center}
      #ai-keyinp{flex:1;background:#252d3e;border:1px solid #2a3348;border-radius:8px;padding:8px 10px;font-size:12px;color:#e8eaf0;direction:ltr;outline:none;font-family:inherit}
      #ai-keysave{padding:8px 12px;background:#10b981;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-weight:700;font-family:inherit}
      #ai-keyhint{font-size:10px;color:#5c6878;padding:4px 16px 0}
      #ai-keyhint a{color:#4f8ef7}
      #ai-input-row{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #2a3348;background:#161b27}
      #ai-input{flex:1;background:#1e2535;border:1px solid #2a3348;border-radius:10px;padding:9px 12px;font-size:13px;color:#e8eaf0;outline:none;resize:none;font-family:inherit;direction:rtl}
      #ai-input:focus{border-color:#10b981}
      #ai-send{width:38px;height:38px;background:#10b981;border:none;border-radius:10px;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:inherit}
      #ai-send:disabled{opacity:.4;cursor:not-allowed}
      #ai-foot{padding:6px 16px 8px;font-size:10px;color:#5c6878;text-align:center;border-top:1px solid #2a3348}
      #ai-foot a{color:#4f8ef7}
      @media (max-width:768px){#ai-fab{bottom:80px;right:14px;width:50px;height:50px}}
    `;
    document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.id = 'ai-fab';
    fab.type = 'button';
    fab.title = 'اسأل AI';
    fab.setAttribute('aria-label','اسأل الذكاء الاصطناعي');
    fab.innerHTML = '<span style="line-height:1">🧠</span>';
    fab.addEventListener('click', open);
    document.body.appendChild(fab);

    const modal = document.createElement('div');
    modal.id = 'ai-modal';
    modal.innerHTML = `
      <div id="ai-panel" onclick="event.stopPropagation()">
        <div id="ai-head">
          <span class="dot"></span>
          <span>اسأل AI</span>
          <button class="x" onclick="window.b2cAI.close()">✕</button>
        </div>
        <div id="ai-msgs"></div>
        <div id="ai-hints"></div>
        <div id="ai-keyrow">
          <input id="ai-keyinp" type="password" placeholder="AIza... (مفتاح Gemini)" autocomplete="off">
          <button id="ai-keysave">حفظ</button>
        </div>
        <div id="ai-keyhint" style="display:none">احصل على مفتاح من <a href="https://aistudio.google.com/apikey" target="_blank">AI Studio ←</a> · يُخزَّن في متصفحك فقط</div>
        <div id="ai-input-row">
          <textarea id="ai-input" rows="1" placeholder="اسأل أي سؤال عن الشركة..."></textarea>
          <button id="ai-send">↑</button>
        </div>
        <div id="ai-foot">للتحليل الكامل: <a href="ai-insights.html">افتح AI Insights ←</a></div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.body.appendChild(modal);

    document.getElementById('ai-keysave').addEventListener('click', saveKeyClick);
    document.getElementById('ai-send').addEventListener('click', send);
    document.getElementById('ai-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  function open() {
    const modal = document.getElementById('ai-modal');
    if (!modal) return;
    modal.classList.add('open');
    setTimeout(() => document.getElementById('ai-input')?.focus(), 200);

    const msgs = document.getElementById('ai-msgs');
    if (!msgs.children.length) {
      msgs.innerHTML = `<div class="ai-m b">أهلاً! اختر سؤال من الأسفل أو اكتب سؤالك.</div>`;
      const hintsEl = document.getElementById('ai-hints');
      hintsEl.innerHTML = hints.map(h => `<span class="ai-hint">${h}</span>`).join('');
      hintsEl.querySelectorAll('.ai-hint').forEach(el => {
        el.addEventListener('click', () => {
          document.getElementById('ai-input').value = el.textContent;
          send();
        });
      });
    }
    refreshKeyRow();
    loadContext(); // start loading in background
  }

  function close() {
    document.getElementById('ai-modal')?.classList.remove('open');
  }

  function refreshKeyRow() {
    const row = document.getElementById('ai-keyrow');
    const hint = document.getElementById('ai-keyhint');
    const has = hasKey();
    row.classList.toggle('show', !has);
    hint.style.display = has ? 'none' : 'block';
  }

  function saveKeyClick() {
    const inp = document.getElementById('ai-keyinp');
    const k = inp.value.trim();
    if (!k.startsWith('AIza')) { alert('المفتاح غير صحيح — يجب أن يبدأ بـ AIza'); return; }
    setKey(k);
    inp.value = '';
    refreshKeyRow();
    appendMsg('b','✅ تم حفظ المفتاح. اسأل أي سؤال!');
  }

  async function send() {
    if (!hasKey()) {
      refreshKeyRow();
      document.getElementById('ai-keyinp')?.focus();
      return;
    }
    const inp = document.getElementById('ai-input');
    const q = inp.value.trim();
    if (!q) return;
    inp.value = '';
    appendMsg('u', q);

    const sendBtn = document.getElementById('ai-send');
    sendBtn.disabled = true;
    const typing = document.createElement('div');
    typing.className = 'ai-typing';
    typing.id = 'ai-typing';
    typing.textContent = '✦ جاري التفكير...';
    document.getElementById('ai-msgs').appendChild(typing);
    scrollDown();

    const ctx = await loadContext();
    const prompt = `${ctx}\n\nالصفحة الحالية: ${PATH}\nسؤال المستخدم: ${q}\n\nأجب بالعربية بشكل مباشر ومختصر (جملة إلى فقرة)، استند إلى الأرقام أعلاه.`;

    try {
      const ans = await askAI(prompt, { maxTokens: 700 });
      document.getElementById('ai-typing')?.remove();
      appendMsg('b', formatText(ans));
    } catch (e) {
      document.getElementById('ai-typing')?.remove();
      if (e.code === KEY_NEEDED) {
        refreshKeyRow();
        appendMsg('b', 'محتاج مفتاح Gemini أولاً — أضفه أعلى الإدخال.');
      } else {
        appendMsg('b', `<span style="color:#f87171">${e.message}</span>`);
      }
    } finally {
      sendBtn.disabled = false;
    }
  }

  function appendMsg(type, html) {
    const m = document.createElement('div');
    m.className = `ai-m ${type}`;
    m.innerHTML = html;
    document.getElementById('ai-msgs').appendChild(m);
    scrollDown();
  }
  function scrollDown() {
    const msgs = document.getElementById('ai-msgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }
  function formatText(t) {
    return t
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  window.b2cAI = { open, close, isOpen: () => document.getElementById('ai-modal')?.classList.contains('open') };
})();
