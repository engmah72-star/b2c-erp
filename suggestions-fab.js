// Business2Card — Employee Suggestions FAB
// ─────────────────────────────────────────────
// زر عائم 💡 يفتح modal لإرسال اقتراح على السيستم (داشبورد، صفحة،
// دورة عمل، ...). الاقتراحات تتخزن في collection employee_suggestions
// والـ admin يراجعها من suggestions-admin.html.
//
// الاستخدام: <script type="module" src="suggestions-fab.js"></script>

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const FB={apiKey:"AIzaSyDEK3I06IMrJPiYX09ULF7OIcbsMOsasUk",authDomain:"business2card-c041b.firebaseapp.com",projectId:"business2card-c041b",storageBucket:"business2card-c041b.firebasestorage.app",messagingSenderId:"235622448899",appId:"1:235622448899:web:d8652ff71082f7d003f336"};

const app = getApps().length ? getApp() : initializeApp(FB);
const auth = getAuth(app);
const db = getFirestore(app);

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
      border-radius:14px;width:100%;max-width:560px;max-height:90vh;display:flex;flex-direction:column;
      box-shadow:0 24px 80px rgba(0,0,0,.7);direction:rtl;font-family:'IBM Plex Sans Arabic',sans-serif;color:#dce5f5;}
    #${MODAL_ID} .sm-head{display:flex;align-items:center;justify-content:space-between;
      padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.07);}
    #${MODAL_ID} .sm-title{font-size:14px;font-weight:800;display:flex;align-items:center;gap:8px;}
    #${MODAL_ID} .sm-x{width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,.07);
      background:#121520;color:#647298;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;}
    #${MODAL_ID} .sm-x:hover{background:#ff3d6e;color:#fff;}
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
    #${MODAL_ID} .sm-item{padding:12px;background:#121520;border:1px solid rgba(255,255,255,.07);
      border-radius:10px;margin-bottom:8px;}
    #${MODAL_ID} .sm-item-head{display:flex;align-items:center;justify-content:space-between;
      gap:8px;margin-bottom:6px;}
    #${MODAL_ID} .sm-item-title{font-size:13px;font-weight:700;color:#dce5f5;flex:1;line-height:1.4;}
    #${MODAL_ID} .sm-item-status{font-size:10px;font-weight:800;padding:3px 8px;border-radius:9px;white-space:nowrap;}
    #${MODAL_ID} .sm-item-desc{font-size:12px;color:#647298;line-height:1.5;margin-bottom:6px;}
    #${MODAL_ID} .sm-item-meta{font-size:10px;color:#3e4a66;display:flex;gap:10px;flex-wrap:wrap;}
    #${MODAL_ID} .sm-item-note{margin-top:8px;padding:8px 10px;background:#0d0f1b;
      border-right:3px solid #ffaa00;border-radius:6px;font-size:11px;color:#dce5f5;line-height:1.5;}
    #${MODAL_ID} .sm-toast{position:absolute;top:16px;left:50%;transform:translateX(-50%);
      background:#00d97e;color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:700;
      box-shadow:0 4px 14px rgba(0,217,126,.4);animation:smFade .3s;}
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
// Modal
// ─────────────────────────────────────────────
let currentTab = 'new'; // 'new' | 'mine'
let mySuggestions = [];

function openModal(){
  let m = document.getElementById(MODAL_ID);
  if(!m){
    m = document.createElement('div');
    m.id = MODAL_ID;
    document.body.appendChild(m);
  }
  renderModal();
  m.classList.add('open');
}
function closeModal(){
  document.getElementById(MODAL_ID)?.classList.remove('open');
}

function renderModal(){
  const m = document.getElementById(MODAL_ID);
  if(!m) return;
  const currentPagePath = (location.pathname.split('/').pop()||'').toLowerCase();
  m.innerHTML = `
    <div class="sm-box" onclick="event.stopPropagation()">
      <div class="sm-head">
        <div class="sm-title">💡 اقتراحاتي للسيستم</div>
        <button class="sm-x" type="button" data-act="close">✕</button>
      </div>
      <div class="sm-tabs">
        <button class="sm-tab ${currentTab==='new'?'on':''}" data-tab="new" type="button">📝 اقتراح جديد</button>
        <button class="sm-tab ${currentTab==='mine'?'on':''}" data-tab="mine" type="button">📋 اقتراحاتي (${mySuggestions.length})</button>
      </div>
      <div class="sm-body" id="sm-body"></div>
    </div>
  `;
  m.addEventListener('click', e => {
    if(e.target === m) closeModal();
    const act = e.target.getAttribute?.('data-act');
    if(act === 'close') closeModal();
    if(act === 'submit') submitSuggestion();
    const tab = e.target.getAttribute?.('data-tab');
    if(tab){ currentTab = tab; renderModal(); }
  });
  renderBody();
}

function renderBody(){
  const body = document.getElementById('sm-body');
  if(!body) return;
  if(currentTab === 'new'){
    const currentPagePath = (location.pathname.split('/').pop()||'').toLowerCase();
    body.innerHTML = `
      <div class="sm-row">
        <label class="sm-lbl">عنوان الاقتراح *</label>
        <input id="sm-title" type="text" maxlength="120" placeholder="مثال: محتاج فلتر تاريخ في صفحة الطلبات" />
      </div>
      <div class="sm-row">
        <label class="sm-lbl">التفاصيل *</label>
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
      <div class="sm-foot" style="margin:8px -18px -16px;padding:14px 18px;">
        <button class="sm-btn sm-btn-ghost" type="button" data-act="close">إلغاء</button>
        <button class="sm-btn sm-btn-primary" type="button" data-act="submit" id="sm-submit-btn">📤 إرسال الاقتراح</button>
      </div>
    `;
  } else {
    if(!mySuggestions.length){
      body.innerHTML = `<div class="sm-empty">📭 ماعندكش اقتراحات لسه.<br><br>دوس على "اقتراح جديد" وابدأ.</div>`;
      return;
    }
    body.innerHTML = mySuggestions.map(s => {
      const st = STATUS_LABELS[s.status] || STATUS_LABELS.new;
      const cat = CATEGORIES.find(c => c.v === s.category)?.l || s.category || '';
      const dateStr = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'}) : '';
      return `
        <div class="sm-item">
          <div class="sm-item-head">
            <div class="sm-item-title">${escapeHtml(s.title || '—')}</div>
            <span class="sm-item-status" style="background:${st.col}22;color:${st.col}">${st.ico} ${st.l}</span>
          </div>
          <div class="sm-item-desc">${escapeHtml(s.description || '')}</div>
          <div class="sm-item-meta">
            <span>${cat}</span>
            ${s.targetPage ? `<span>📄 ${escapeHtml(s.targetPage)}</span>` : ''}
            ${dateStr ? `<span>🕒 ${dateStr}</span>` : ''}
          </div>
          ${s.decisionNote ? `<div class="sm-item-note"><b>رد الإدارة:</b> ${escapeHtml(s.decisionNote)}</div>` : ''}
          ${s.implementationUrl ? `<div class="sm-item-note" style="border-right-color:#22d3ee"><b>التنفيذ:</b> <a href="${escapeAttr(s.implementationUrl)}" target="_blank" rel="noopener" style="color:#22d3ee;text-decoration:underline">عرض PR</a></div>` : ''}
        </div>
      `;
    }).join('');
  }
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s){
  return escapeHtml(s);
}

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

  // Resolve submitter display name (best-effort)
  let submitterName = user.email || 'موظف';
  let submitterRole = '';
  try{
    const uDoc = await getDoc(doc(db, 'users', user.uid));
    if(uDoc.exists()){
      submitterName = uDoc.data().name || submitterName;
      submitterRole = uDoc.data().role || '';
    }
  } catch(_){}

  try{
    await addDoc(collection(db, 'employee_suggestions'), {
      title,
      description: desc,
      category: cat,
      priority: pri,
      targetPage: page,
      status: 'new',
      submittedBy: user.uid,
      submittedByName: submitterName,
      submittedByRole: submitterRole,
      createdAt: serverTimestamp(),
      sourceUrl: location.href,
    });
    showToast('✅ تم إرسال اقتراحك، شكراً!');
    currentTab = 'mine';
    setTimeout(() => renderModal(), 600);
  } catch(e){
    console.error('[suggestions]', e);
    showToast('فشل الإرسال: ' + (e.message || ''), '#ff3d6e');
    if(btn){ btn.disabled = false; btn.textContent = '📤 إرسال الاقتراح'; }
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
// Auth + listener for "my suggestions"
// ─────────────────────────────────────────────
let unsubMine = null;
onAuthStateChanged(auth, user => {
  if(unsubMine){ unsubMine(); unsubMine = null; }
  if(!user) return;
  const setup = () => {
    injectFab();
    // Listen to my own suggestions (orderBy fetched client-side to avoid composite index)
    const q = query(collection(db,'employee_suggestions'), where('submittedBy','==',user.uid));
    unsubMine = onSnapshot(q, snap => {
      mySuggestions = snap.docs
        .map(d => ({...d.data(), _id: d.id}))
        .sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
      // Badge = count of suggestions with status updates the user might want to see (approved/implemented/rejected since last view)
      const fresh = mySuggestions.filter(s => ['approved','implemented'].includes(s.status)).length;
      updateBadge(fresh > 0 && fresh < 10 ? fresh : 0);
      // If modal open on "mine" tab, refresh
      if(document.getElementById(MODAL_ID)?.classList.contains('open') && currentTab === 'mine'){
        renderBody();
      }
    }, err => console.warn('suggestions-fab:', err.message));
  };
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setup, {once:true});
  } else { setup(); }
});
