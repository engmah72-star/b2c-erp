/**
 * clients-portal-requests.js — قسم «طلبات البوابة» داخل صفحة العملاء.
 *
 * نقطة استقبال ثانية لـ order_requests (status:'new') بجانب cs-dashboard،
 * فلا يبقى الطلب مرئياً في مكان واحد فقط. يعكس سلوك cs-dashboard: يسرد
 * الطلبات المنتظرة ويتيح «حوّل لأوردر» / «رفض».
 *
 * موديول مستقل (clients.html فوق حدّ الـfreeze · G5) — side-effect: يعبّئ
 * #cl-preq-host عند الإقلاع. القراءة bounded (limit · G3)؛ الكتابة عبر
 * orderActions فقط (H1.1). التوكنز/الستايل في clients.css (U1).
 */
import { auth, db } from './core/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, doc, getDoc, query, where, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { orderActions } from './order-actions.js';

const REQ_KIND = { new: '🆕 طلب جديد', reorder: '🔁 إعادة طلب', quote: '🧾 عرض سعر' };
const esc = (s) => (s || '').toString().replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const notify = (m, t) => { if (typeof window.toast === 'function') window.toast(m, t); };

let reqs = [];
let started = false;
const ctx = { role: '', uid: '', userName: '' };

const host = () => document.getElementById('cl-preq-host');

function render() {
  const h = host();
  if (!h) return;
  if (!reqs.length) { h.hidden = true; h.innerHTML = ''; return; }
  h.hidden = false;
  const cards = reqs.map((r) => {
    const meta = [r.product && esc(r.product), r.qty && ('كمية ' + esc(r.qty))].filter(Boolean).join(' · ');
    const phone = esc(r.clientPhone || '');
    return `<div class="cl-preq-card" id="cl-preq-${r._id}">
      <div class="cl-preq-head">
        <span class="cl-preq-kind">${REQ_KIND[r.type] || esc(r.type)}</span>
        <span class="cl-preq-name">${esc(r.clientName || 'عميل')}${phone ? ` · <span dir="ltr">${phone}</span>` : ''}</span>
      </div>
      ${meta ? `<div class="cl-preq-meta">${meta}</div>` : ''}
      ${r.notes ? `<div class="cl-preq-notes">${esc(r.notes)}</div>` : ''}
      <div class="cl-preq-actions">
        <button type="button" class="btn btn-g btn-sm" data-preq-act="convert" data-preq-id="${r._id}">✅ حوّل لأوردر</button>
        <button type="button" class="btn btn-ghost btn-sm" data-preq-act="reject" data-preq-id="${r._id}">🚫 رفض</button>
      </div>
    </div>`;
  }).join('');
  h.innerHTML = `<div class="cl-preq-sec">
      <span class="cl-preq-title">🆕 طلبات البوابة</span>
      <span class="cl-preq-count">${reqs.length} بانتظار التحويل</span>
    </div>
    <div class="cl-preq-list">${cards}</div>`;
}

async function convert(id, btn) {
  if (btn) btn.disabled = true;
  const r = await orderActions.createOrderFromRequest({ db, requestId: id, role: ctx.role, userId: ctx.uid, userName: ctx.userName });
  if (!r.ok) { if (btn) btn.disabled = false; return notify('❌ ' + (r.errors || ['تعذّر التحويل']).join(' · '), 'err'); }
  notify('✅ تم التحويل لأوردر ' + (r.orderId || '') + ' — سعّره من الأوردر', 'ok');
  // الـlistener يزيل البطاقة تلقائياً (status لم يعد 'new').
}

async function reject(id, btn) {
  if (btn) btn.disabled = true;
  const r = await orderActions.rejectOrderRequest({ db, requestId: id, userId: ctx.uid, userName: ctx.userName });
  if (!r.ok) { if (btn) btn.disabled = false; return notify('❌ ' + (r.errors || ['تعذّر الرفض']).join(' · '), 'err'); }
  notify('🚫 رُفض الطلب', '');
}

function wire() {
  const h = host();
  if (!h || h._preqWired) return;
  h._preqWired = true;
  h.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preq-act]');
    if (!b) return;
    const id = b.getAttribute('data-preq-id');
    if (b.getAttribute('data-preq-act') === 'convert') convert(id, b);
    else reject(id, b);
  });
}

onAuthStateChanged(auth, async (u) => {
  if (!u || started) return;
  started = true;
  ctx.uid = u.uid;
  try {
    const s = await getDoc(doc(db, 'users', u.uid));
    if (s.exists()) { const d = s.data(); ctx.role = d.role || ''; ctx.userName = d.name || u.email || ''; }
  } catch (_) { /* تجاهل */ }
  wire();
  try {
    onSnapshot(
      query(collection(db, 'order_requests'), where('status', '==', 'new'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => { reqs = snap.docs.map((d) => ({ ...d.data(), _id: d.id })); render(); },
      (err) => { console.warn('[clients] order_requests listener:', err.message); const h = host(); if (h) h.hidden = true; },
    );
  } catch (err) { console.warn('[clients] portal-requests init failed', err.message); }
});
