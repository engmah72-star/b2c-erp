// Business2Card — Inbox unread badge helper
// ─────────────────────────────────────────────
// يُحقن floating action button دائري بأسفل-يسار الشاشة (نفس مكان زرار
// الواتساب القديم) — يفتح inbox.html ويعرض badge للرسائل غير المقروءة
// من collection conversations حيث المستخدم الحالي participant.
//
// الاستخدام: ضع <script type="module" src="inbox-badge.js"></script>
// في أي صفحة تستخدم Firebase auth.

import { app, auth, db } from "./core/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// RULE G3: cap the conversations subscription. The FAB only renders an
// unread badge — a user with 200+ active threads is a corner case the
// badge can over-count without breaking the UX.
const CONVERSATIONS_LIMIT = 200;

const STYLE_ID = 'inbox-fab-style';
const FAB_ID   = 'inbox-fab';
const BADGE_ID = 'inbox-fab-badge';
const LABEL_ID = 'inbox-fab-lbl';

// Skip on pages that shouldn't show the FAB (public/redirect-only/login)
function shouldSkipFab(){
  const path = (location.pathname.split('/').pop()||'').toLowerCase();
  if(path === 'inbox.html') return true; // don't link to self
  const SKIP = ['login.html','client-login.html','client-portal.html','order-tracking.html','waybill.html','chat.html',''];
  return SKIP.includes(path);
}

function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');s.id=STYLE_ID;
  s.textContent=`
    #${FAB_ID}{position:fixed;bottom:22px;left:22px;z-index:9998;width:54px;height:54px;
      border-radius:50%;background:linear-gradient(135deg,var(--b),var(--o-purple));color:#fff;
      font-size:24px;text-align:center;border:none;cursor:pointer;padding:0;
      box-shadow:0 4px 16px rgba(74,142,245,.42);
      transition:transform .15s ease,box-shadow .15s ease;
      font-family:inherit;display:flex;align-items:center;justify-content:center;
      text-decoration:none;gap:0;}
    #${FAB_ID}:hover{transform:scale(1.08);box-shadow:0 6px 22px rgba(124,92,255,.55);}
    #${FAB_ID}:active{transform:scale(.96);}
    #${BADGE_ID}{position:absolute;top:-3px;right:-3px;background:var(--r);color:#fff;
      font-size:var(--fs-sm);font-weight:var(--fw-extra);border-radius:11px;padding:2px 6px;min-width:20px;
      text-align:center;border:2px solid #07080f;
      box-shadow:0 0 0 1px rgba(255,61,110,.4);line-height:1;}
    #${BADGE_ID}.hidden{display:none;}
    #${LABEL_ID}{display:none;font-size:13px;font-weight:700;letter-spacing:.2px;}
    @media (max-width:768px){
      #${FAB_ID}{
        bottom:calc(var(--mob-nav-h,64px) + 14px + env(safe-area-inset-bottom,0px));
        left:14px;width:auto;height:50px;
        border-radius:25px;padding:0 16px 0 12px;gap:7px;font-size:22px;}
      #${LABEL_ID}{display:inline;}
    }
  `;
  document.head.appendChild(s);
}

function injectFab(){
  if(shouldSkipFab())return null;
  if(document.getElementById(FAB_ID))return document.getElementById(FAB_ID);
  ensureStyle();
  const a=document.createElement('a');
  a.id=FAB_ID;
  a.href='inbox.html';
  a.title='المحادثات الداخلية';
  a.setAttribute('aria-label','المحادثات الداخلية');
  a.innerHTML=`<span style="line-height:1">💬</span><span id="${LABEL_ID}">رسائل</span><span id="${BADGE_ID}" class="hidden">0</span>`;
  document.body.appendChild(a);
  return a;
}

function updateBadge(n){
  const b=document.getElementById(BADGE_ID);if(!b)return;
  if(n>0){
    b.textContent=n>99?'99+':String(n);
    b.classList.remove('hidden');
  } else {
    b.classList.add('hidden');
  }
  // also update document title with prefix
  const base=document.title.replace(/^\(\d+\)\s*/,'');
  document.title=n>0?`(${n>99?'99+':n}) ${base}`:base;
}

// ─────────────────────────────────────────────
//  Notification helpers
// ─────────────────────────────────────────────
// We use the browser Notification API for foreground / recently-closed
// tab notifications. True background push (when the tab is fully closed)
// requires Firebase Cloud Messaging + a VAPID key configured in the
// Firebase Console — not added here. The Notification API works on
// installed PWAs on both desktop and Android. iOS Safari supports it
// when the site is added to home screen on iOS 16.4+.
async function ensureNotifPermission(){
  if(!('Notification' in window))return false;
  if(Notification.permission==='granted')return true;
  if(Notification.permission==='denied')return false;
  try{const p=await Notification.requestPermission();return p==='granted';}
  catch(_){return false;}
}
function spawnNotif(title,body,convId){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  if(document.visibilityState==='visible'&&location.pathname.endsWith('inbox.html'))return;
  try{
    const n=new Notification(title,{body,icon:'icon-192.png',badge:'icon-192.png',tag:convId||'inbox'});
    n.onclick=()=>{window.focus();location.href='inbox.html#'+convId;};
    setTimeout(()=>n.close(),8000);
  }catch(_){}
}

let unsubConv=null;
let lastConvSnapshot=null;
onAuthStateChanged(auth, user=>{
  if(unsubConv){unsubConv();unsubConv=null;}
  if(!user)return;
  // Ask permission once per session (silent if already granted/denied)
  if('Notification' in window&&Notification.permission==='default'){
    setTimeout(()=>ensureNotifPermission(),3000);
  }
  const setup=()=>{
    injectFab();
    const q=query(collection(db,'conversations'),where('participants','array-contains',user.uid),limit(CONVERSATIONS_LIMIT));
    unsubConv=onSnapshot(q,snap=>{
      let total=0;
      const newMap=new Map();
      snap.docs.forEach(d=>{
        const data=d.data();
        const id=d.id;
        if((data.archivedBy||[]).includes(user.uid))return;
        const u=data.unreadCount?.[user.uid]||0;
        total+=u;
        newMap.set(id,{u,lastSenderId:data.lastSenderId,lastMessagePreview:data.lastMessagePreview,name:data.name||'',type:data.type,lastSenderName:data.lastSenderName,muted:(data.mutedBy||[]).includes(user.uid),participants:data.participants||[]});
      });
      // Detect newly-incremented unread → fire notification (skip on first snapshot)
      if(lastConvSnapshot){
        newMap.forEach((cur,id)=>{
          const prev=lastConvSnapshot.get(id);
          const prevU=prev?.u||0;
          if(cur.u>prevU&&cur.lastSenderId&&cur.lastSenderId!==user.uid&&!cur.muted){
            const senderName=cur.lastSenderName||'موظف';
            const title=cur.type==='channel'?`${cur.name} — ${senderName}`:senderName;
            spawnNotif(title,cur.lastMessagePreview||'رسالة جديدة',id);
          }
        });
      }
      lastConvSnapshot=newMap;
      updateBadge(total);
    },err=>console.warn('inbox-badge:',err.message));
  };
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',setup,{once:true});
  } else { setup(); }
});

