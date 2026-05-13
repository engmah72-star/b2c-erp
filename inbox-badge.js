// Business2Card — Inbox unread badge helper
// ─────────────────────────────────────────────
// يقوم بإضافة 💬 link في الـ topbar الموجود في كل الصفحات مع badge
// لعدد الرسائل غير المقروءة. يقرأ من collection conversations حيث
// المستخدم الحالي participant ويجمع unreadCount[currentUid].
//
// الاستخدام: ضع <script type="module" src="inbox-badge.js"></script>
// في أي صفحة تستخدم Firebase auth + topbar.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const FB={apiKey:"AIzaSyDEK3I06IMrJPiYX09ULF7OIcbsMOsasUk",authDomain:"business2card-c041b.firebaseapp.com",projectId:"business2card-c041b",storageBucket:"business2card-c041b.firebasestorage.app",messagingSenderId:"235622448899",appId:"1:235622448899:web:d8652ff71082f7d003f336"};

// Reuse if already initialized
const app = getApps().length ? getApp() : initializeApp(FB);
const auth = getAuth(app);
const db = getFirestore(app);

const STYLE_ID = 'inbox-badge-style';
function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');s.id=STYLE_ID;
  s.textContent=`
    .ib-tb-link{position:relative;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.04);color:var(--snow,#dce5f5);text-decoration:none;font-size:18px;transition:background .15s;border:1px solid var(--line,rgba(255,255,255,.07))}
    .ib-tb-link:hover{background:rgba(255,255,255,.08)}
    .ib-tb-badge{position:absolute;top:-3px;right:-3px;background:#ff3d6e;color:#fff;font-size:10px;font-weight:800;border-radius:10px;padding:1px 5px;min-width:18px;text-align:center;border:2px solid var(--bg2,#0d0f1b);box-shadow:0 0 0 1px rgba(255,61,110,.4)}
    .ib-tb-badge.hidden{display:none}
    @media(max-width:480px){.ib-tb-link{width:34px;height:34px;font-size:16px}}
  `;
  document.head.appendChild(s);
}

function injectIntoTopbar(){
  // Look for existing topbar-right; create one if missing.
  const tbr = document.querySelector('.topbar-right')||document.querySelector('.topbar');
  if(!tbr)return null;
  // Skip if we already injected (e.g. inbox.html itself)
  if(document.getElementById('inbox-tb-link'))return null;
  // Skip on inbox.html — don't show link to itself
  if(location.pathname.endsWith('inbox.html'))return null;
  const a=document.createElement('a');
  a.id='inbox-tb-link';
  a.className='ib-tb-link';
  a.href='inbox.html';
  a.title='المحادثات';
  a.innerHTML=`💬<span class="ib-tb-badge hidden" id="inbox-tb-badge">0</span>`;
  // Insert as the first child of topbar-right so it stays at the start
  if(tbr.classList.contains('topbar-right')){
    tbr.insertBefore(a,tbr.firstChild);
  } else {
    // Fallback: append to topbar
    tbr.appendChild(a);
  }
  return a;
}

function updateBadge(n){
  const b=document.getElementById('inbox-tb-badge');if(!b)return;
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
const __lastNotifKeys=new Set();
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
    // delay a bit so we don't prompt right at login screen
    setTimeout(()=>ensureNotifPermission(),3000);
  }
  // Defer until DOM is ready (the topbar might not be rendered yet)
  const setup=()=>{
    ensureStyle();
    if(!injectIntoTopbar()){
      // try again on next animation frame in case topbar appears later
      requestAnimationFrame(()=>{ensureStyle();injectIntoTopbar();});
    }
    const q=query(collection(db,'conversations'),where('participants','array-contains',user.uid));
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
