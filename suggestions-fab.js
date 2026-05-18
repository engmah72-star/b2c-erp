// Business2Card — Employee Suggestions FAB
// ─────────────────────────────────────────────
// زر عائم 💡 يفتح modal لإرسال اقتراح على السيستم. الاقتراحات تتخزن في
// collection employee_suggestions:
//   - الموظف يشوف اقتراحاته + اقتراحات الصفحات اللي عنده صلاحيتها
//   - AI تلقائي يولّد تحليل (pros/cons/خطة) لما الموظف يبعت اقتراح
//   - thread محادثة بين الموظف والإدارة + AI
//
// الاستخدام: <script type="module" src="suggestions-fab.js"></script>

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, query, where, orderBy, onSnapshot,
  serverTimestamp, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const FB={apiKey:"AIzaSyDEK3I06IMrJPiYX09ULF7OIcbsMOsasUk",authDomain:"business2card-c041b.firebaseapp.com",projectId:"business2card-c041b",storageBucket:"business2card-c041b.firebasestorage.app",messagingSenderId:"235622448899",appId:"1:235622448899:web:d8652ff71082f7d003f336"};

const app = getApps().length ? getApp() : initializeApp(FB);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

const STYLE_ID = 'sugg-fab-style';
const FAB_ID   = 'sugg-fab';
const BADGE_ID = 'sugg-fab-badge';
const MODAL_ID = 'sugg-modal';

// Pages to hide the FAB on (public/redirect-only)
function shouldSkipFab(){
  const path = (location.pathname.split('/').pop()||'').toLowerCase();
  const SKIP = ['login.html','client-login.html','client-portal.html','order-tracking.html','waybill.html','suggestions-admin.html',''];
  return SKIP.includes(path);
}

// ─────────────────────────────────────────────
// Page → Roles mapping (يطابق ROLE_PAGES في shared.js)
// لو الاقتراح على صفحة X، نخلي الأدوار اللي عندها صلاحية X يشوفوه.
// ─────────────────────────────────────────────
const ROLE_PAGES = {
  admin:            ['index','clients','design','production','print','shipping','accounts','approvals','products','suppliers','reports','employees','workforce-live','suggestions-admin','settings'],
  operation_manager:['index','clients','design','production','print','shipping','approvals','suppliers','reports','employees','workforce-live','suggestions-admin'],
  customer_service: ['index','clients','design','approvals'],
  graphic_designer: ['design','approvals'],
  design_operator:  ['index','design','approvals','suppliers'],
  production_agent: ['index','production','print','approvals'],
  shipping_officer: ['index','print','shipping','approvals'],
  wallet_manager:   ['index','accounts','approvals'],
};

function pageKeyFromHtml(targetPage){
  if(!targetPage) return '';
  // 'design.html' → 'design'، 'other' → 'other'
  return String(targetPage).replace(/\.html$/i, '').toLowerCase();
}

function rolesForPage(targetPage){
  const key = pageKeyFromHtml(targetPage);
  const set = new Set(['admin','operation_manager']); // دايماً مرئي للإدارة
  if(!key || key === 'other'){
    // اقتراح على السيستم كله → كل الأدوار تشوفه
    Object.keys(ROLE_PAGES).forEach(r => set.add(r));
  } else {
    Object.entries(ROLE_PAGES).forEach(([role, pages]) => {
      if(pages.includes(key) || pages.includes('*')) set.add(role);
    });
  }
  return [...set];
}

const PAGE_OPTIONS = [
  {v:'',                  l:'— حدد صفحة —'},
  {v:'index.html',        l:'لوحة التحكم الرئيسية'},
  {v:'clients.html',      l:'العملاء'},
  {v:'design.html',       l:'التصميم'},
  {v:'production.html',   l:'التنفيذ'},
  {v:'print.html',        l:'الطباعة'},
  {v:'shipping.html',     l:'الشحن'},
  {v:'accounts.html',     l:'الحسابات'},
  {v:'approvals.html',    l:'الاعتمادات'},
  {v:'products.html',     l:'المنتجات'},
  {v:'suppliers.html',    l:'الموردين'},
  {v:'employees.html',    l:'الموظفين'},
  {v:'reports.html',      l:'التقارير'},
  {v:'settings.html',     l:'الإعدادات'},
  {v:'inbox.html',        l:'الرسائل'},
  {v:'my-profile.html',   l:'بروفايل الموظف'},
  {v:'my-requests.html',  l:'طلباتي'},
  {v:'other',             l:'أخرى / السيستم كله'},
];

const CATEGORIES = [
  {v:'dashboard',  l:'⬡ داشبورد / إحصائيات'},
  {v:'page',       l:'📄 تحسين صفحة معينة'},
  {v:'workflow',   l:'🔄 دورة عمل / خطوات'},
  {v:'report',     l:'📊 تقرير جديد / فلتر'},
  {v:'notification',l:'🔔 تنبيه / إشعار'},
  {v:'bug',        l:'🐞 مشكلة / خطأ'},
  {v:'other',      l:'💬 أخرى'},
];

const PRIORITIES = [
  {v:'low',    l:'🟢 تحسين'},
  {v:'medium', l:'🟡 مهم'},
  {v:'high',   l:'🔴 عاجل'},
];

const STATUS_LABELS = {
  new:                   {l:'جديد',           col:'#3b9eff', ico:'🆕'},
  under_review:          {l:'تحت المراجعة',   col:'#ffaa00', ico:'🔍'},
  approved:              {l:'مقبول',          col:'#00d97e', ico:'✅'},
  pending_implementation:{l:'عند Claude',     col:'#a78bfa', ico:'🤖'},
  implemented:           {l:'تم التنفيذ',     col:'#22d3ee', ico:'🎯'},
  rejected:              {l:'مرفوض',          col:'#ff3d6e', ico:'❌'},
};

const COMPLEXITY_LABELS = { low:'🟢 سهل', medium:'🟡 متوسط', high:'🔴 معقد' };
const IMPACT_LABELS = { low:'تأثير محدود', medium:'تأثير متوسط', high:'تأثير عالي' };
const REC_LABELS = {
  proceed:               {l:'تنفيذ مباشر',         col:'#00d97e', ico:'✅'},
  needs_clarification:   {l:'يحتاج توضيح',         col:'#ffaa00', ico:'❓'},
  reconsider:            {l:'يحتاج مراجعة',        col:'#ff3d6e', ico:'⚠️'},
};

function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');s.id=STYLE_ID;
  s.textContent=`
    #${FAB_ID}{position:fixed;bottom:84px;left:22px;z-index:9998;width:48px;height:48px;
      border-radius:50%;background:linear-gradient(135deg,#ffaa00,#ff7e3a);color:#fff;
      font-size:22px;text-align:center;border:none;cursor:pointer;padding:0;
      box-shadow:0 4px 14px rgba(255,170,0,.38);
      transition:transform .15s ease,box-shadow .15s ease;
      font-family:inherit;display:flex;align-items:center;justify-content:center;}
    #${FAB_ID}:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(255,126,58,.55);}
    #${FAB_ID}:active{transform:scale(.96);}
    #${BADGE_ID}{position:absolute;top:-3px;right:-3px;background:#00d97e;color:#fff;
      font-size:10px;font-weight:800;border-radius:10px;padding:1px 5px;min-width:18px;
      text-align:center;border:2px solid #07080f;line-height:1;}
    #${BADGE_ID}.hidden{display:none;}
    @media (max-width:768px){
      #${FAB_ID}{bottom:140px;left:14px;width:44px;height:44px;font-size:20px;}
    }

    /* Modal */
    #${MODAL_ID}{position:fixed;inset:0;background:rgba(0,0,0,.62);backdrop-filter:blur(6px);
      z-index:9999;display:none;align-items:center;justify-content:center;padding:16px;}
    #${MODAL_ID}.open{display:flex;}
    #${MODAL_ID} .sm-box{background:#0d0f1b;border:1px solid rgba(255,255,255,.13);
      border-radius:14px;width:100%;max-width:640px;max-height:92vh;display:flex;flex-direction:column;
      box-shadow:0 24px 80px rgba(0,0,0,.7);direction:rtl;font-family:'IBM Plex Sans Arabic',sans-serif;color:#dce5f5;position:relative;}
    #${MODAL_ID} .sm-head{display:flex;align-items:center;justify-content:space-between;
      padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.07);}
    #${MODAL_ID} .sm-title{font-size:14px;font-weight:800;display:flex;align-items:center;gap:8px;}
    #${MODAL_ID} .sm-x{width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,.07);
      background:#121520;color:#647298;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;}
    #${MODAL_ID} .sm-x:hover{background:#ff3d6e;color:#fff;}
    #${MODAL_ID} .sm-back{font-size:11px;color:#647298;cursor:pointer;padding:4px 10px;background:#121520;border:1px solid rgba(255,255,255,.07);border-radius:8px;}
    #${MODAL_ID} .sm-back:hover{color:#dce5f5;}
    #${MODAL_ID} .sm-tabs{display:flex;gap:2px;background:#121520;padding:4px;margin:14px 18px 0;border-radius:9px;}
    #${MODAL_ID} .sm-tab{flex:1;padding:8px;border:none;background:transparent;color:#647298;cursor:pointer;
      font-size:12px;font-weight:700;border-radius:7px;font-family:inherit;}
    #${MODAL_ID} .sm-tab.on{background:#0d0f1b;color:#dce5f5;}
    #${MODAL_ID} .sm-body{padding:16px 18px;overflow-y:auto;flex:1;}
    #${MODAL_ID} .sm-row{margin-bottom:12px;}
    #${MODAL_ID} .sm-lbl{font-size:11px;font-weight:700;color:#647298;margin-bottom:5px;display:block;}
    #${MODAL_ID} input,#${MODAL_ID} textarea,#${MODAL_ID} select{
      width:100%;padding:10px 12px;background:#171a28;border:1px solid rgba(255,255,255,.07);
      border-radius:8px;color:#dce5f5;font-family:inherit;font-size:13px;outline:none;}
    #${MODAL_ID} textarea{min-height:90px;resize:vertical;}
    #${MODAL_ID} input:focus,#${MODAL_ID} textarea:focus,#${MODAL_ID} select:focus{
      border-color:#ffaa00;background:#1c2030;}
    #${MODAL_ID} .sm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    #${MODAL_ID} .sm-foot{display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;
      border-top:1px solid rgba(255,255,255,.07);}
    #${MODAL_ID} .sm-btn{padding:9px 16px;border-radius:8px;border:1px solid transparent;
      font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:.18s;}
    #${MODAL_ID} .sm-btn-ghost{background:#121520;border-color:rgba(255,255,255,.07);color:#647298;}
    #${MODAL_ID} .sm-btn-ghost:hover{color:#dce5f5;}
    #${MODAL_ID} .sm-btn-primary{background:linear-gradient(135deg,#ffaa00,#ff7e3a);color:#fff;}
    #${MODAL_ID} .sm-btn-primary:hover{filter:brightness(1.08);}
    #${MODAL_ID} .sm-btn:disabled{opacity:.55;cursor:not-allowed;}
    #${MODAL_ID} .sm-empty{text-align:center;padding:32px 16px;color:#647298;font-size:13px;}

    /* List items */
    #${MODAL_ID} .sm-item{padding:12px;background:#121520;border:1px solid rgba(255,255,255,.07);
      border-radius:10px;margin-bottom:8px;cursor:pointer;transition:.15s;}
    #${MODAL_ID} .sm-item:hover{border-color:rgba(255,170,0,.4);transform:translateY(-1px);}
    #${MODAL_ID} .sm-item-head{display:flex;align-items:center;justify-content:space-between;
      gap:8px;margin-bottom:6px;}
    #${MODAL_ID} .sm-item-title{font-size:13px;font-weight:700;color:#dce5f5;flex:1;line-height:1.4;}
    #${MODAL_ID} .sm-item-status{font-size:10px;font-weight:800;padding:3px 8px;border-radius:9px;white-space:nowrap;}
    #${MODAL_ID} .sm-item-desc{font-size:12px;color:#647298;line-height:1.5;margin-bottom:6px;}
    #${MODAL_ID} .sm-item-meta{font-size:10px;color:#3e4a66;display:flex;gap:10px;flex-wrap:wrap;}

    /* Detail view */
    #${MODAL_ID} .sm-detail-title{font-size:15px;font-weight:800;color:#dce5f5;margin-bottom:6px;line-height:1.4;}
    #${MODAL_ID} .sm-detail-meta{font-size:11px;color:#647298;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
    #${MODAL_ID} .sm-detail-meta span{display:inline-flex;align-items:center;gap:3px;}
    #${MODAL_ID} .sm-detail-desc{padding:12px;background:#121520;border-radius:8px;font-size:13px;
      color:#dce5f5;line-height:1.6;white-space:pre-wrap;margin-bottom:14px;}
    #${MODAL_ID} .sm-section{margin-bottom:14px;}
    #${MODAL_ID} .sm-section-title{font-size:12px;font-weight:800;color:#ffaa00;margin-bottom:8px;
      display:flex;align-items:center;gap:6px;}
    #${MODAL_ID} .sm-ai-tldr{padding:10px 12px;background:linear-gradient(135deg,rgba(167,139,250,.12),rgba(74,142,245,.08));
      border:1px solid rgba(167,139,250,.25);border-radius:8px;font-size:13px;line-height:1.6;margin-bottom:10px;}
    #${MODAL_ID} .sm-ai-badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;}
    #${MODAL_ID} .sm-ai-badge{font-size:10px;font-weight:700;padding:4px 8px;border-radius:8px;background:#171a28;color:#dce5f5;border:1px solid rgba(255,255,255,.07);}
    #${MODAL_ID} .sm-ai-list{list-style:none;padding:0;margin:0;}
    #${MODAL_ID} .sm-ai-list li{padding:6px 10px;font-size:12px;line-height:1.5;background:#171a28;
      border-radius:6px;margin-bottom:4px;}
    #${MODAL_ID} .sm-ai-list.pros li{border-right:3px solid #00d97e;}
    #${MODAL_ID} .sm-ai-list.cons li{border-right:3px solid #ff3d6e;}
    #${MODAL_ID} .sm-ai-step{padding:8px 10px;background:#171a28;border-radius:6px;margin-bottom:5px;
      border-right:3px solid #ffaa00;}
    #${MODAL_ID} .sm-ai-step-t{font-size:12px;font-weight:700;color:#dce5f5;margin-bottom:2px;}
    #${MODAL_ID} .sm-ai-step-d{font-size:11px;color:#647298;line-height:1.4;}
    #${MODAL_ID} .sm-ai-pending{padding:14px;text-align:center;background:#171a28;border-radius:8px;color:#647298;font-size:12px;}

    /* Comments thread */
    #${MODAL_ID} .sm-cmt{padding:10px 12px;background:#121520;border-radius:8px;margin-bottom:6px;}
    #${MODAL_ID} .sm-cmt.ai{background:linear-gradient(135deg,rgba(167,139,250,.10),rgba(74,142,245,.06));border:1px solid rgba(167,139,250,.18);}
    #${MODAL_ID} .sm-cmt.admin{background:rgba(0,217,126,.06);border:1px solid rgba(0,217,126,.15);}
    #${MODAL_ID} .sm-cmt-head{display:flex;justify-content:space-between;font-size:10px;color:#647298;margin-bottom:4px;}
    #${MODAL_ID} .sm-cmt-name{font-weight:700;color:#dce5f5;}
    #${MODAL_ID} .sm-cmt-text{font-size:12px;color:#dce5f5;line-height:1.6;white-space:pre-wrap;}
    #${MODAL_ID} .sm-cmt-text strong{color:#ffaa00;}
    #${MODAL_ID} .sm-cmt-form{display:flex;gap:6px;margin-top:8px;}
    #${MODAL_ID} .sm-cmt-form textarea{min-height:42px;padding:8px 10px;font-size:12px;flex:1;}
    #${MODAL_ID} .sm-cmt-send{align-self:flex-end;}

    #${MODAL_ID} .sm-toast{position:absolute;top:16px;left:50%;transform:translateX(-50%);
      background:#00d97e;color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:700;
      box-shadow:0 4px 14px rgba(0,217,126,.4);animation:smFade .3s;z-index:10;}
    @keyframes smFade{from{opacity:0;transform:translate(-50%,-10px);}to{opacity:1;transform:translate(-50%,0);}}
  `;
  document.head.appendChild(s);
}

function injectFab(){
  if(shouldSkipFab())return null;
  if(document.getElementById(FAB_ID))return document.getElementById(FAB_ID);
  ensureStyle();
  const btn=document.createElement('button');
  btn.id=FAB_ID;
  btn.type='button';
  btn.title='اقتراح تحسين على السيستم';
  btn.setAttribute('aria-label','اقتراح تحسين على السيستم');
  btn.innerHTML=`<span style="line-height:1">💡</span><span id="${BADGE_ID}" class="hidden">0</span>`;
  btn.addEventListener('click',openModal);
  document.body.appendChild(btn);
  return btn;
}

function updateBadge(n){
  const b=document.getElementById(BADGE_ID);if(!b)return;
  if(n>0){
    b.textContent=String(n);
    b.classList.remove('hidden');
  } else {
    b.classList.add('hidden');
  }
}

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
let view = 'list';      // 'list' | 'new' | 'detail'
let activeTab = 'mine'; // 'mine' | 'department'
let mySuggestions = [];
let deptSuggestions = [];
let activeDetailId = null;
let activeDetailDoc = null;
let activeDetailComments = [];
let unsubDetail = null;
let unsubComments = null;
let currentUserName = '';
let currentUserRole = '';

function openModal(){
  let m = document.getElementById(MODAL_ID);
  if(!m){
    m = document.createElement('div');
    m.id = MODAL_ID;
    document.body.appendChild(m);
  }
  view = 'list';
  renderModal();
  m.classList.add('open');
}
function closeModal(){
  document.getElementById(MODAL_ID)?.classList.remove('open');
  cleanupDetail();
}
function cleanupDetail(){
  if(unsubDetail){ unsubDetail(); unsubDetail = null; }
  if(unsubComments){ unsubComments(); unsubComments = null; }
  activeDetailId = null;
  activeDetailDoc = null;
  activeDetailComments = [];
}

function handleAct(act){
  if(act === 'close')        return closeModal();
  if(act === 'back')         { view = 'list'; cleanupDetail(); return renderModal(); }
  if(act === 'goto-new')     { view = 'new'; return renderModal(); }
  if(act === 'submit')       return submitSuggestion();
  if(act === 'rerun-ai')     return rerunAi();
  if(act === 'send-comment') return sendComment();
}

function bindHandlers(root){
  if(!root) return;
  // Direct onclick on each interactive element — guaranteed to fire even if
  // some ancestor stops propagation.
  root.querySelectorAll('[data-act]').forEach(el => {
    el.onclick = (ev) => { ev.stopPropagation(); handleAct(el.getAttribute('data-act')); };
  });
  root.querySelectorAll('[data-tab]').forEach(el => {
    el.onclick = (ev) => { ev.stopPropagation(); activeTab = el.getAttribute('data-tab'); renderBody(); };
  });
  root.querySelectorAll('[data-open]').forEach(el => {
    el.onclick = (ev) => { ev.stopPropagation(); openDetail(el.getAttribute('data-open')); };
  });
}

function renderModal(){
  const m = document.getElementById(MODAL_ID);
  if(!m) return;
  const showTabs = view === 'list';
  const showBack = view !== 'list';
  m.innerHTML = `
    <div class="sm-box">
      <div class="sm-head">
        <div style="display:flex;align-items:center;gap:8px;">
          ${showBack ? `<button class="sm-back" type="button" data-act="back">← رجوع</button>` : ''}
          <div class="sm-title">💡 ${titleFor(view)}</div>
        </div>
        <button class="sm-x" type="button" data-act="close">✕</button>
      </div>
      ${showTabs ? `
      <div class="sm-tabs">
        <button class="sm-tab ${activeTab==='mine'?'on':''}" data-tab="mine" type="button">📋 اقتراحاتي (${mySuggestions.length})</button>
        <button class="sm-tab ${activeTab==='department'?'on':''}" data-tab="department" type="button">🏢 قسمي (${deptSuggestions.length})</button>
        <button class="sm-tab" data-act="goto-new" type="button">➕ جديد</button>
      </div>` : ''}
      <div class="sm-body" id="sm-body"></div>
    </div>
  `;
  // Backdrop click closes — only when target is the wrapper itself
  m.onclick = (ev) => { if(ev.target === m) closeModal(); };
  bindHandlers(m);
  renderBody();
}

function titleFor(v){
  if(v === 'new') return 'اقتراح جديد';
  if(v === 'detail') return 'تفاصيل الاقتراح';
  return 'اقتراحاتي للسيستم';
}

function renderBody(){
  const body = document.getElementById('sm-body');
  if(!body) return;
  if(view === 'new') renderNewForm(body);
  else if(view === 'detail') renderDetail(body);
  else renderList(body);
  bindHandlers(body);
}

function renderList(body){
  const list = activeTab === 'mine' ? mySuggestions : deptSuggestions;
  if(!list.length){
    body.innerHTML = `<div class="sm-empty">📭 ${activeTab==='mine'?'ماعندكش اقتراحات لسه':'مفيش اقتراحات على صفحات قسمك'}.<br><br>دوس على "➕ جديد" وابدأ.</div>`;
    return;
  }
  body.innerHTML = list.map(s => {
    const st = STATUS_LABELS[s.status] || STATUS_LABELS.new;
    const cat = CATEGORIES.find(c => c.v === s.category)?.l || s.category || '';
    const dateStr = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'}) : '';
    return `
      <div class="sm-item" data-open="${s._id}">
        <div class="sm-item-head">
          <div class="sm-item-title">${escapeHtml(s.title || '—')}</div>
          <span class="sm-item-status" style="background:${st.col}22;color:${st.col}">${st.ico} ${st.l}</span>
        </div>
        <div class="sm-item-desc">${escapeHtml((s.description||'').slice(0, 140))}${s.description?.length > 140 ? '...' : ''}</div>
        <div class="sm-item-meta">
          <span>${cat}</span>
          ${activeTab === 'department' && s.submittedByName ? `<span>👤 ${escapeHtml(s.submittedByName)}</span>` : ''}
          ${s.targetPage ? `<span>📄 ${escapeHtml(s.targetPage)}</span>` : ''}
          ${dateStr ? `<span>🕒 ${dateStr}</span>` : ''}
          ${s.aiAnalysis ? `<span>🤖 محلَّل</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderNewForm(body){
  const currentPagePath = (location.pathname.split('/').pop()||'').toLowerCase();
  body.innerHTML = `
    <div class="sm-row">
      <label class="sm-lbl">عنوان الاقتراح *</label>
      <input id="sm-title" type="text" maxlength="120" placeholder="مثال: محتاج فلتر تاريخ في صفحة الطلبات" />
    </div>
    <div class="sm-row">
      <label class="sm-lbl">التفاصيل * (إيه؟ ليه؟ إيه الفايدة؟)</label>
      <textarea id="sm-desc" maxlength="2000" placeholder="اشرح إيه اللي محتاج يتعمل، وليه، وإيه الفايدة..."></textarea>
    </div>
    <div class="sm-grid">
      <div class="sm-row">
        <label class="sm-lbl">النوع</label>
        <select id="sm-cat">
          ${CATEGORIES.map(c => `<option value="${c.v}">${c.l}</option>`).join('')}
        </select>
      </div>
      <div class="sm-row">
        <label class="sm-lbl">الأولوية</label>
        <select id="sm-pri">
          ${PRIORITIES.map(p => `<option value="${p.v}" ${p.v==='medium'?'selected':''}>${p.l}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="sm-row">
      <label class="sm-lbl">الصفحة المقصودة</label>
      <select id="sm-page">
        ${PAGE_OPTIONS.map(p => `<option value="${p.v}" ${p.v===currentPagePath?'selected':''}>${p.l}</option>`).join('')}
      </select>
    </div>
    <div style="font-size:11px;color:#647298;margin-bottom:8px;padding:8px;background:#121520;border-radius:6px;line-height:1.6;">
      🤖 <b>AI Claude</b> هيقرا اقتراحك ويولّد تحليل بمميزات وعيوب وخطة عمل، وممكن يسألك توضيح لو محتاج.
    </div>
    <div class="sm-foot" style="margin:8px -18px -16px;padding:14px 18px;">
      <button class="sm-btn sm-btn-ghost" type="button" data-act="back">إلغاء</button>
      <button class="sm-btn sm-btn-primary" type="button" data-act="submit" id="sm-submit-btn">📤 إرسال الاقتراح</button>
    </div>
  `;
}

function renderDetail(body){
  const s = activeDetailDoc;
  if(!s){
    body.innerHTML = `<div class="sm-empty">⏳ جاري التحميل...</div>`;
    return;
  }
  const st = STATUS_LABELS[s.status] || STATUS_LABELS.new;
  const cat = CATEGORIES.find(c => c.v === s.category)?.l || s.category || '';
  const pri = PRIORITIES.find(p => p.v === s.priority)?.l || s.priority || '';
  const dateStr = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'}) : '';
  const isOwner = s.submittedBy === auth.currentUser?.uid;
  const isAdminRole = ['admin','operation_manager'].includes(currentUserRole);
  const canRunAi = (isOwner || isAdminRole) && !!localStorage.getItem('gemini_key');

  let aiHtml = '';
  if(s.aiAnalysis){
    const a = s.aiAnalysis;
    const rec = REC_LABELS[a.recommendation] || REC_LABELS.proceed;
    aiHtml = `
      <div class="sm-section">
        <div class="sm-section-title">🤖 تحليل AI</div>
        ${a.tldr ? `<div class="sm-ai-tldr"><b>الخلاصة:</b> ${escapeHtml(a.tldr)}</div>` : ''}
        <div class="sm-ai-badges">
          <span class="sm-ai-badge">التعقيد: ${COMPLEXITY_LABELS[a.estimatedComplexity] || a.estimatedComplexity}</span>
          <span class="sm-ai-badge">الأثر: ${IMPACT_LABELS[a.estimatedImpact] || a.estimatedImpact}</span>
          <span class="sm-ai-badge" style="background:${rec.col}22;color:${rec.col};border-color:${rec.col}40;">${rec.ico} ${rec.l}</span>
        </div>
        ${a.clarifyingQuestion ? `<div class="sm-ai-tldr" style="background:rgba(255,170,0,.10);border-color:rgba(255,170,0,.25);"><b>❓ سؤال للموظف:</b> ${escapeHtml(a.clarifyingQuestion)}</div>` : ''}
        ${a.pros?.length ? `
          <div style="font-size:11px;font-weight:700;color:#00d97e;margin:8px 0 4px;">✓ المميزات</div>
          <ul class="sm-ai-list pros">${a.pros.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
        ` : ''}
        ${a.cons?.length ? `
          <div style="font-size:11px;font-weight:700;color:#ff3d6e;margin:8px 0 4px;">⚠ العيوب / المخاطر</div>
          <ul class="sm-ai-list cons">${a.cons.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
        ` : ''}
        ${a.actionPlan?.length ? `
          <div style="font-size:11px;font-weight:700;color:#ffaa00;margin:8px 0 4px;">📋 خطة التنفيذ</div>
          ${a.actionPlan.map((step, i) => `
            <div class="sm-ai-step">
              <div class="sm-ai-step-t">${i+1}. ${escapeHtml(step.step || '')}</div>
              <div class="sm-ai-step-d">${escapeHtml(step.detail || '')}</div>
            </div>
          `).join('')}
        ` : ''}
        ${a.affectedAreas?.length ? `
          <div style="font-size:10px;color:#647298;margin-top:6px;">📂 ${a.affectedAreas.map(escapeHtml).join(' • ')}</div>
        ` : ''}
      </div>
    `;
  } else if(canRunAi){
    aiHtml = `<div class="sm-section">
      <div class="sm-ai-pending">🤖 لسه ماتمش تحليل AI<br><button class="sm-btn sm-btn-primary" type="button" data-act="rerun-ai" style="margin-top:8px;">شغّل التحليل دلوقتي</button></div>
    </div>`;
  } else {
    aiHtml = `<div class="sm-section">
      <div class="sm-ai-pending">🤖 لسه ماتمش تحليل AI<br><span style="font-size:10px;">${!localStorage.getItem('gemini_key')?'(محتاج مفتاح Gemini في ai-insights.html)':'الإدارة هتشغّله بعد المراجعة'}</span></div>
    </div>`;
  }

  const commentsHtml = activeDetailComments.length ? activeDetailComments.map(c => {
    const cdate = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'}) : '';
    const cls = c.senderType === 'ai' ? 'ai' : (c.senderType === 'admin' ? 'admin' : '');
    return `
      <div class="sm-cmt ${cls}">
        <div class="sm-cmt-head">
          <span class="sm-cmt-name">${c.senderType==='ai'?'🤖 ':(c.senderType==='admin'?'👑 ':'👤 ')}${escapeHtml(c.senderName || '—')}</span>
          <span>${cdate}</span>
        </div>
        <div class="sm-cmt-text">${formatComment(c.text || '')}</div>
      </div>
    `;
  }).join('') : `<div style="font-size:11px;color:#647298;text-align:center;padding:12px;">مفيش محادثة لسه — اكتب أول رد.</div>`;

  body.innerHTML = `
    <div class="sm-detail-title">${escapeHtml(s.title || '—')}</div>
    <div class="sm-detail-meta">
      <span><span class="sm-item-status" style="background:${st.col}22;color:${st.col}">${st.ico} ${st.l}</span></span>
      <span>👤 ${escapeHtml(s.submittedByName || '—')}</span>
      <span>${cat}</span>
      <span>${pri}</span>
      ${s.targetPage ? `<span>📄 ${escapeHtml(s.targetPage)}</span>` : ''}
      ${dateStr ? `<span>🕒 ${dateStr}</span>` : ''}
    </div>
    <div class="sm-detail-desc">${escapeHtml(s.description || '')}</div>

    ${aiHtml}

    ${s.decisionNote ? `
      <div class="sm-section">
        <div class="sm-section-title">👑 ملاحظة الإدارة</div>
        <div class="sm-ai-tldr" style="background:rgba(0,217,126,.06);border-color:rgba(0,217,126,.18);">
          ${s.reviewedByName ? `<b>${escapeHtml(s.reviewedByName)}:</b><br>` : ''}
          ${escapeHtml(s.decisionNote)}
        </div>
      </div>
    ` : ''}

    ${s.implementationUrl ? `
      <div class="sm-section">
        <div class="sm-section-title">🔗 رابط التنفيذ</div>
        <a href="${escapeAttr(s.implementationUrl)}" target="_blank" rel="noopener" style="color:#22d3ee;font-size:12px;">${escapeHtml(s.implementationUrl)}</a>
      </div>
    ` : ''}

    <div class="sm-section">
      <div class="sm-section-title">💬 المحادثة</div>
      ${commentsHtml}
      <div class="sm-cmt-form">
        <textarea id="sm-cmt-input" maxlength="2000" placeholder="اكتب رد أو سؤال..."></textarea>
        <button class="sm-btn sm-btn-primary sm-cmt-send" type="button" data-act="send-comment">إرسال</button>
      </div>
    </div>
  `;
}

function formatComment(text){
  // **bold** → <strong>
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s){
  return escapeHtml(s);
}

// ─────────────────────────────────────────────
// Submit suggestion
// ─────────────────────────────────────────────
async function submitSuggestion(){
  const user = auth.currentUser;
  if(!user){ showToast('يجب تسجيل الدخول', '#ff3d6e'); return; }
  const title = document.getElementById('sm-title')?.value?.trim() || '';
  const desc  = document.getElementById('sm-desc')?.value?.trim() || '';
  const cat   = document.getElementById('sm-cat')?.value || 'other';
  const pri   = document.getElementById('sm-pri')?.value || 'medium';
  const page  = document.getElementById('sm-page')?.value || '';
  if(title.length < 3){ showToast('العنوان قصير جداً', '#ff3d6e'); return; }
  if(desc.length < 10){ showToast('التفاصيل قصيرة جداً', '#ff3d6e'); return; }

  const btn = document.getElementById('sm-submit-btn');
  if(btn){ btn.disabled = true; btn.textContent = 'جاري الإرسال...'; }

  const visibleToRoles = rolesForPage(page);

  try{
    const ref = await addDoc(collection(db, 'employee_suggestions'), {
      title,
      description: desc,
      category: cat,
      priority: pri,
      targetPage: page,
      status: 'new',
      submittedBy: user.uid,
      submittedByName: currentUserName || user.email,
      submittedByRole: currentUserRole,
      visibleToRoles,
      createdAt: serverTimestamp(),
      sourceUrl: location.href,
    });
    showToast('✅ تم الإرسال — AI بيحلل الاقتراح دلوقتي...');

    // Best-effort: trigger AI analysis (only if user has key set)
    const key = localStorage.getItem('gemini_key');
    if(key){
      triggerAiAnalysis(ref.id).catch(e => console.warn('[ai-analysis] failed:', e.message));
    }

    // Open detail view of the new suggestion
    setTimeout(() => { openDetail(ref.id); }, 600);
  } catch(e){
    console.error('[suggestions]', e);
    showToast('فشل الإرسال: ' + (e.message || ''), '#ff3d6e');
    if(btn){ btn.disabled = false; btn.textContent = '📤 إرسال الاقتراح'; }
  }
}

async function triggerAiAnalysis(suggestionId){
  const key = localStorage.getItem('gemini_key');
  if(!key) return;
  const fn = httpsCallable(functions, 'analyzeSuggestionWithAI');
  await fn({ suggestionId, apiKey: key });
}

async function rerunAi(){
  if(!activeDetailId) return;
  const key = localStorage.getItem('gemini_key');
  if(!key){
    showToast('محتاج تضبط مفتاح Gemini في ai-insights.html', '#ff3d6e');
    return;
  }
  showToast('🤖 جاري التحليل...');
  try{
    await triggerAiAnalysis(activeDetailId);
    showToast('✅ تم التحليل');
  } catch(e){
    showToast('فشل: ' + (e.message || ''), '#ff3d6e');
  }
}

// ─────────────────────────────────────────────
// Detail view
// ─────────────────────────────────────────────
async function openDetail(suggestionId){
  cleanupDetail();
  activeDetailId = suggestionId;
  view = 'detail';
  renderModal();

  // Listen to suggestion doc
  unsubDetail = onSnapshot(doc(db, 'employee_suggestions', suggestionId), snap => {
    if(snap.exists()){
      activeDetailDoc = {...snap.data(), _id: snap.id};
      if(view === 'detail') renderBody();
    }
  }, err => console.warn('detail:', err.message));

  // Listen to comments
  unsubComments = onSnapshot(
    query(collection(db, 'employee_suggestions', suggestionId, 'comments'), orderBy('createdAt','asc')),
    snap => {
      activeDetailComments = snap.docs.map(d => ({...d.data(), _id: d.id}));
      if(view === 'detail') renderBody();
    },
    err => console.warn('comments:', err.message)
  );
}

async function sendComment(){
  const user = auth.currentUser;
  if(!user || !activeDetailId) return;
  const input = document.getElementById('sm-cmt-input');
  const text = (input?.value || '').trim();
  if(!text) return;
  const isAdminRole = ['admin','operation_manager'].includes(currentUserRole);
  try{
    await addDoc(collection(db, 'employee_suggestions', activeDetailId, 'comments'), {
      senderId: user.uid,
      senderName: currentUserName || user.email,
      senderType: isAdminRole ? 'admin' : 'employee',
      text,
      createdAt: serverTimestamp(),
    });
    if(input) input.value = '';
  } catch(e){
    console.error(e);
    showToast('فشل الإرسال: ' + (e.message || ''), '#ff3d6e');
  }
}

function showToast(msg, bg='#00d97e'){
  const m = document.getElementById(MODAL_ID);
  if(!m) return;
  const t = document.createElement('div');
  t.className = 'sm-toast';
  t.style.background = bg;
  t.textContent = msg;
  m.querySelector('.sm-box')?.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

// ─────────────────────────────────────────────
// Auth + listeners
// ─────────────────────────────────────────────
let unsubMine = null;
let unsubDept = null;

onAuthStateChanged(auth, async user => {
  if(unsubMine){ unsubMine(); unsubMine = null; }
  if(unsubDept){ unsubDept(); unsubDept = null; }
  if(!user) return;

  // Load user role + name
  try{
    const uDoc = await getDoc(doc(db, 'users', user.uid));
    if(uDoc.exists()){
      currentUserName = uDoc.data().name || user.email;
      currentUserRole = uDoc.data().role || '';
    }
  } catch(_){ currentUserName = user.email || ''; }

  const setup = () => {
    injectFab();

    // Listen to my own suggestions
    const qMine = query(collection(db,'employee_suggestions'), where('submittedBy','==',user.uid));
    unsubMine = onSnapshot(qMine, snap => {
      mySuggestions = snap.docs
        .map(d => ({...d.data(), _id: d.id}))
        .sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
      updateBadgeAndList();
    }, err => console.warn('suggestions-fab mine:', err.message));

    // Listen to department suggestions (visible to my role) — exclude my own
    if(currentUserRole){
      const qDept = query(collection(db,'employee_suggestions'), where('visibleToRoles','array-contains',currentUserRole));
      unsubDept = onSnapshot(qDept, snap => {
        deptSuggestions = snap.docs
          .map(d => ({...d.data(), _id: d.id}))
          .filter(d => d.submittedBy !== user.uid)
          .sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
        updateBadgeAndList();
      }, err => console.warn('suggestions-fab dept:', err.message));
    }
  };
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setup, {once:true});
  } else { setup(); }
});

function updateBadgeAndList(){
  // Badge: count of my suggestions with status updates (approved/implemented)
  const fresh = mySuggestions.filter(s => ['approved','implemented'].includes(s.status)).length;
  updateBadge(fresh > 0 && fresh < 10 ? fresh : 0);
  // Refresh list view if open
  if(document.getElementById(MODAL_ID)?.classList.contains('open') && view === 'list'){
    renderBody();
  }
}
