// ══════════════════════════════════════════════════════════
// ai-launcher.js — Floating "اسأل AI" button (page-aware chat)
// ══════════════════════════════════════════════════════════
// زر عائم بأسفل-يمين الشاشة (مقابل زر المحادثات الداخلية على اليسار).
// يفتح modal فيه شات بـ Gemini مع context مختصر للصفحة الحالية.
// يُحقن في كل الصفحات الإدارية.
// ══════════════════════════════════════════════════════════
import { askAI, hasKey, setKey, getKey, clearKey, KEY_NEEDED } from './ai-engine.js';
import { buildToday, PAGE_FOCUS, detectOpenEntity, buildEntitySection } from './ai-today.js';
import { app, db } from "./core/firebase-init.js";
import { collection, getDocs, getDoc, doc, query, where, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

(function() {
  const PATH = (location.pathname.split('/').pop() || '').toLowerCase();
  const SKIP = [
    'login.html','client-login.html','client-portal.html',
    'order-tracking.html','waybill.html','chat.html',
    'change-password.html','',
  ];
  if (SKIP.includes(PATH)) return;

  // ── Page-aware prompt suggestions ──
  const PAGE_HINTS = {
    'accounts.html':    ['ملخص اليوم في كلمتين','ما أبرز التحديات الحالية؟','أعطني 3 أولويات للأسبوع','ما إجمالي الديون على العملاء؟','أرصدة المحافظ؟'],
    'clients.html':     ['ما العملاء الخاملون منذ 60 يوماً؟','أكثر العملاء قيمة؟','أي عميل يحتاج متابعة؟'],
    'design.html':      ['ما الأوردرات المتأخرة في التصميم؟','أكثر المنتجات طلباً؟'],
    'production.html':  ['ما الأوردرات قيد الإنتاج؟','معدل اكتمال الإنتاج آخر 30 يوم؟'],
    'print.html':       ['ما الأوردرات الجاهزة للطباعة؟'],
    'shipping.html':    ['ما الشحنات المتأخرة؟','أعطني ملخص الشحن اليوم'],
    'reports.html':     ['ما أداء آخر 30 يوم؟','مقارنة بآخر 90 يوم؟'],
    'suppliers.html':   ['أكثر الموردين تعاملاً؟'],
    'employees.html':   ['ما إجمالي الرواتب الشهر؟'],
  };
  const hints = PAGE_HINTS[PATH] || ['ملخص الأداء','أبرز الفرص الحالية','تحديات تحتاج اهتمام'];

  // ── Firebase: app/db imported from core/firebase-init.js (G2 single source) ──

  // ── Cached compact context (loaded once per session) ──
  let contextCache = '';
  let dataCache = { orders: [], clients: [] };
  let loadingContext = false;
  async function loadContext() {
    if (contextCache || loadingContext) return contextCache;
    loadingContext = true;
    try {
      const [oSnap, cSnap] = await Promise.all([
        getDocs(collection(db,'orders')).catch(() => ({ docs: [] })),
        getDocs(collection(db,'clients')).catch(() => ({ docs: [] })),
      ]);
      dataCache.orders = oSnap.docs.map(d => ({ ...d.data(), _id: d.id }));
      dataCache.clients = cSnap.docs.map(d => d.data());
      contextCache = buildCompactContext(dataCache.orders, dataCache.clients);
    } catch (e) {
      console.warn('[ai-launcher] loadContext failed:', e);
      contextCache = '— لا توجد بيانات متاحة حالياً —';
    } finally {
      loadingContext = false;
    }
    return contextCache;
  }

  // ── Today section — lazy-load today's financial_ledger then summarise ──
  let todayCache = null;
  async function loadToday() {
    if (todayCache !== null) return todayCache;
    try {
      // financial_ledger may have many docs; fetch all and filter client-side.
      // Cheap-enough: with a daily index it's ~hundreds, not thousands.
      const lSnap = await getDocs(collection(db,'financial_ledger')).catch(() => ({ docs: [] }));
      const startOfDay = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
      const tsMs = ts => ts?.toDate?.()?.getTime() || ((ts?.seconds || 0) * 1000) || 0;
      const ledger = lSnap.docs.map(d => d.data()).filter(e => tsMs(e.createdAt) >= startOfDay);
      todayCache = buildToday({
        orders: dataCache.orders,
        clients: dataCache.clients,
        ledger,
        role: (window.AppState?.currentRole || ''),
      });
    } catch (e) {
      console.warn('[ai-launcher] loadToday failed:', e);
      todayCache = '';
    }
    return todayCache;
  }

  // ── Open-entity resolver — prefers in-memory AppState, falls back to URL ──
  // We DON'T cache here: pages mutate AppState.openEntity as the user
  // navigates between modals, so we re-resolve every time the user asks.
  async function loadOpenEntity() {
    const role = window.AppState?.currentRole || '';

    // Fast path: page explicitly set the open entity (no Firestore needed).
    const mem = window.AppState?.openEntity;
    if (mem && mem.type && mem.doc) {
      const related = mem.type === 'client'
        ? dataCache.orders.filter(o => o.clientId === mem.id || o.clientName === mem.doc.name)
        : [];
      return buildEntitySection({ type: mem.type, doc: mem.doc, relatedOrders: related, role });
    }

    // Fallback: detect from URL and fetch.
    const ent = detectOpenEntity(location.pathname, location.search);
    if (!ent) return '';
    try {
      let docData = null;
      if (ent.byField) {
        const snap = await getDocs(query(collection(db, ent.collection), where(ent.byField, '==', ent.id), limit(1)))
          .catch(() => ({ docs: [] }));
        if (snap.docs.length) docData = { ...snap.docs[0].data(), _id: snap.docs[0].id };
      } else {
        const ref = doc(db, ent.collection, ent.id);
        const snap = await getDoc(ref).catch(() => null);
        if (snap?.exists()) docData = { ...snap.data(), _id: snap.id };
      }
      if (!docData) return '';

      const related = ent.type === 'client'
        ? dataCache.orders.filter(o => o.clientId === ent.id || o.clientName === docData.name)
        : [];
      return buildEntitySection({ type: ent.type, doc: docData, relatedOrders: related, role });
    } catch (e) {
      console.warn('[ai-launcher] loadOpenEntity failed:', e);
      return '';
    }
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
        border-radius:50%;background:linear-gradient(135deg,var(--g-emerald),#059669);color:#fff;
        font-size:var(--fs-3xl);border:none;cursor:pointer;padding:0;
        box-shadow:0 4px 16px rgba(16,185,129,.42);
        transition:transform .15s ease,box-shadow .15s ease;
        font-family:inherit;display:flex;align-items:center;justify-content:center;}
      #ai-fab:hover{transform:scale(1.08);box-shadow:0 6px 22px rgba(16,185,129,.55);}
      #ai-fab:active{transform:scale(.96);}
      #ai-modal{position:fixed;inset:0;background:rgba(15,17,23,.7);z-index:9999;display:none;
        align-items:flex-end;justify-content:center;padding:0;backdrop-filter:blur(4px);}
      #ai-modal.open{display:flex}
      #ai-panel{background:#161b27;color:#e8eaf0;border:1px solid var(--bg-blue);border-radius:18px 18px 0 0;
        width:100%;max-width:560px;max-height:88vh;display:flex;flex-direction:column;
        animation:ai-slide .25s ease-out;font-family:system-ui,sans-serif;direction:rtl}
      @keyframes ai-slide{from{transform:translateY(100%)}to{transform:translateY(0)}}
      #ai-head{padding:14px 18px;border-bottom:1px solid var(--bg-blue);display:flex;align-items:center;gap:var(--space-sm);font-weight:var(--fw-bold);font-size:var(--fs-lg)}
      #ai-head .dot{width:8px;height:8px;border-radius:50%;background:var(--g-emerald);box-shadow:0 0 8px var(--g-emerald)}
      #ai-head .x{margin-right:auto;background:var(--bg-card);border:1px solid var(--bg-blue);color:#8892a4;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:var(--fs-lg);display:flex;align-items:center;justify-content:center}
      #ai-msgs{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:9px;min-height:120px}
      .ai-m{max-width:88%;padding:10px 13px;border-radius:12px;font-size:var(--fs-md);line-height:1.6;white-space:pre-wrap}
      .ai-m.u{background:#4f8ef7;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
      .ai-m.b{background:var(--bg-card);color:#e8eaf0;align-self:flex-start;border-bottom-left-radius:4px}
      .ai-m.b strong{color:#34d399}
      .ai-typing{background:var(--bg-card);padding:10px 13px;border-radius:12px;align-self:flex-start;font-size:var(--fs-md);color:#5c6878;border-bottom-left-radius:4px}
      #ai-hints{padding:0 16px 8px;display:flex;gap:6px;flex-wrap:wrap}
      .ai-hint{padding:6px 10px;background:var(--bg-card);border:1px solid var(--bg-blue);color:#8892a4;border-radius:18px;font-size:var(--fs-sm);cursor:pointer;transition:.15s}
      .ai-hint:hover{border-color:var(--g-emerald);color:var(--g-emerald)}
      #ai-keyrow{padding:10px 16px;background:var(--bg-card);border-top:1px solid var(--bg-blue);display:none}
      #ai-keyrow.show{display:flex;gap:6px;align-items:center}
      #ai-keyinp{flex:1;background:#252d3e;border:1px solid var(--bg-blue);border-radius:8px;padding:8px 10px;font-size:var(--fs-base);color:#e8eaf0;direction:ltr;outline:none;font-family:inherit}
      #ai-keysave{padding:8px 12px;background:var(--g-emerald);color:#fff;border:none;border-radius:8px;font-size:var(--fs-base);cursor:pointer;font-weight:var(--fw-bold);font-family:inherit}
      #ai-keyhint{font-size:var(--fs-xs);color:#5c6878;padding:4px 16px 0}
      #ai-keyhint a{color:#4f8ef7}
      #ai-input-row{display:flex;gap:var(--space-sm);padding:12px 16px;border-top:1px solid var(--bg-blue);background:#161b27}
      #ai-input{flex:1;background:var(--bg-card);border:1px solid var(--bg-blue);border-radius:var(--rad);padding:9px 12px;font-size:var(--fs-md);color:#e8eaf0;outline:none;resize:none;font-family:inherit;direction:rtl}
      #ai-input:focus{border-color:var(--g-emerald)}
      #ai-send{width:38px;height:38px;background:var(--g-emerald);border:none;border-radius:var(--rad);color:#fff;font-size:var(--fs-xl);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:inherit}
      #ai-send:disabled{opacity:.4;cursor:not-allowed}
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
          <button type="button" class="x" onclick="window.b2cAI.close()">✕</button>
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
    // Start loading in background — today depends on orders, so chain it.
    loadContext().then(() => loadToday());
    loadOpenEntity();
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

    const [ctx, today, entity] = await Promise.all([
      loadContext(),
      loadToday(),
      loadOpenEntity(),
    ]);
    const focus = PAGE_FOCUS[PATH] || '';
    const parts = [
      ctx,
      today && today.trim() ? today : '',
      entity && entity.trim() ? entity : '',
      `الصفحة الحالية: ${PATH}${focus ? ` — ${focus}` : ''}`,
      `سؤال المستخدم: ${q}`,
      'أجب بالعربية بشكل مباشر ومختصر (جملة إلى فقرة)، استند إلى الأرقام أعلاه. إذا كان الكيان المفتوح مذكوراً فوق، اربط الإجابة به مباشرة.',
    ].filter(Boolean);
    const prompt = parts.join('\n\n');

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
