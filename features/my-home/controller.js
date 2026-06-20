// ════════════════════════════════════════════════════════════════════
// features/my-home/controller.js
// Personal employee home ("صفحتي"): the daily operational landing that
// expresses the logged-in employee — their tasks, orders, attendance,
// alerts. Reads only; writes go through employee-actions.js (PC1/A1/H1.1).
// Person-scoped: every query is filtered to the current user (RULE 8).
// ════════════════════════════════════════════════════════════════════

import { auth, db } from '../../core/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { isFeatureEnabled, FLAGS } from '../../core/feature-flags.js';
import { employeeActions } from '../../employee-actions.js';
import { currentPeriodKey } from '../../core/task-recurrence.js';
import { renderHero, renderTasks, renderOrders, renderAlerts, renderLinks, renderCommHub } from './render.js';

// البند 3 (جهة الموظف) — بطاقة التواصل الموحّدة: مُفعّلة افتراضياً؛ إيقاف فوري ?feat.myHome.commHub=0
const COMM_HUB_ON = isFeatureEnabled(FLAGS.MY_HOME_COMM_HUB, true);
const REQ_OPEN = new Set(['requested', 'awaiting_receipt', 'pending', 'confirmed']);

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

// role → order assignment field + role dashboard (reuses existing routing)
const ROLE_ORDER_FIELD = {
  graphic_designer: 'designerId', design_operator: 'designerId',
  production_agent: 'productionAgent', shipping_officer: 'shippingOfficerId',
};
const ROLE_DASH = {
  admin: 'accounts.html', operation_manager: 'ops-dashboard.html', customer_service: 'cs-dashboard.html',
  graphic_designer: 'designer-dashboard.html', design_operator: 'designer-dashboard.html',
  production_agent: 'production-dashboard.html', shipping_officer: 'shipping-dashboard.html',
  wallet_manager: 'accounts.html',
};
const ACTIVE_STAGES = (s) => s && s !== 'archived' && s !== 'cancelled' && s !== 'completed';

window.__mhToast = function (msg, type = 'ok') {
  if (typeof window.toast === 'function') { try { return window.toast(msg, type); } catch (_) {} }
  const t = document.createElement('div');
  t.className = 'mh-toast ' + (type === 'err' ? 'err' : 'ok');
  t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
};

const S = {
  me: { uid: '', name: '' }, role: '', empId: '', emp: {}, mustChangePassword: false,
  tasks: [], orders: null, attToday: null, incidents: 0, incidentList: [],
  payReqOpen: 0, leavesPending: 0,
};

function notice(html) { const r = document.getElementById('mh-root'); if (r) r.innerHTML = `<div class="mh-notice">${html}</div>`; }

function render() {
  const root = document.getElementById('mh-root');
  if (!root) return;
  const today = todayStr();
  const lateTasks = S.tasks.filter(t => t.status === 'pending' && t.dueDate && t.dueDate < today).length;
  root.innerHTML =
    renderHero({ name: S.me.name, role: S.role, attToday: S.attToday }) +
    `<div class="mh-grid">
      <div class="mh-col">${renderTasks(S.tasks, today)}${renderOrders(S.orders)}</div>
      <div class="mh-col">${renderAlerts({ lateTasks, incidents: S.incidents, incidentList: S.incidentList, mustChangePassword: S.mustChangePassword })}${COMM_HUB_ON ? renderCommHub({ requests: S.payReqOpen + S.leavesPending, incidents: S.incidents }) : ''}${renderLinks(ROLE_DASH[S.role])}</div>
    </div>`;
}

// ── quick actions (event delegation) ─────────────────────────────────
function wireActions() {
  document.getElementById('mh-root').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;

    if (act === 'open-order') {
      const url = 'order.html?id=' + encodeURIComponent(el.dataset.id);
      if (typeof window.navigatePage === 'function') window.navigatePage(url); else window.location.href = url;
      return;
    }
    if (act === 'task-done') {
      el.disabled = true;
      const r = await employeeActions.setTaskStatus({ db, taskId: el.dataset.id, status: 'done' });
      window.__mhToast(r.ok === false ? (r.errors?.[0] || 'فشل') : '✅ تم إنجاز المهمة', r.ok === false ? 'err' : 'ok');
      return;
    }
    if (act === 'task-recur-done') {
      el.disabled = true;
      const r = await employeeActions.completeRecurringTask({
        db, taskId: el.dataset.id, periodKey: currentPeriodKey(el.dataset.rec),
      });
      window.__mhToast(r.ok === false ? (r.errors?.[0] || 'فشل') : '✅ تم إنجاز المهمة لهذه الفترة', r.ok === false ? 'err' : 'ok');
      return;
    }
    if (act === 'checkin') {
      el.disabled = true;
      const r = await employeeActions.recordAttendanceCheckIn({
        db, employeeId: S.empId, employeeUid: S.me.uid, employeeName: S.me.name,
        date: todayStr(), monthKey: monthKey(),
        expectedStart: S.emp?.workSchedule?.startTime || '', graceMinutes: 15, source: 'self',
        recordedBy: S.me.uid, recordedByName: S.me.name,
      });
      window.__mhToast(r.ok === false ? (r.errors?.[0] || 'فشل') : '🟢 تم تسجيل حضورك', r.ok === false ? 'err' : 'ok');
      return;
    }
    if (act === 'checkout') {
      el.disabled = true;
      const r = await employeeActions.recordAttendanceCheckOut({ db, attendanceId: S.attToday?._id });
      window.__mhToast(r.ok === false ? (r.errors?.[0] || 'فشل') : '✅ تم تسجيل انصرافك', r.ok === false ? 'err' : 'ok');
    }
  });
}

// ── bounded, person-scoped listeners (RULE G3 + RULE 8) ──────────────
let __mhUnsubs = [];
function stopListeners() {
  __mhUnsubs.forEach(u => { try { u(); } catch (_) {} });
  __mhUnsubs = [];
}
function startListeners() {
  stopListeners();
  __mhUnsubs.push(onSnapshot(query(collection(db, 'tasks'), where('assignedTo', '==', S.me.uid), limit(100)), snap => {
    S.tasks = snap.docs.map(d => ({ ...d.data(), _id: d.id })); render();
  }));
  __mhUnsubs.push(onSnapshot(query(collection(db, 'attendance'), where('employeeUid', '==', S.me.uid), where('date', '==', todayStr()), limit(3)), snap => {
    S.attToday = snap.empty ? null : { ...snap.docs[0].data(), _id: snap.docs[0].id }; render();
  }));
  if (S.empId) {
    // فلتر بـ authUid (مش employeeId) عشان يطابق rule employee_incidents
    // (allow read if authUid == request.auth.uid) — زي ما my-profile.html بيعمل.
    // الـ query بـ employeeId كان بيسبّب permission-denied (الـ rule بيتحقق authUid).
    __mhUnsubs.push(onSnapshot(query(collection(db, 'employee_incidents'), where('authUid', '==', S.me.uid), where('monthKey', '==', monthKey()), limit(100)), snap => {
      // المُلغى أثره (تم قبول تظلّمه) لا يُحتسب ولا يُعرض كتنبيه نشط
      const active = snap.docs.map(d => ({ ...d.data(), _id: d.id }))
        .filter(i => !(i.appeal && i.appeal.status === 'accepted'));
      S.incidents = active.length;
      S.incidentList = active;
      render();
    }));
  }
  // البند 3 — عدّادات «التواصل»: تطابق استعلامات my-requests (requestedBy==uid).
  // خلف العلم: لا قراءة إضافية ما لم تُفعَّل البطاقة.
  if (COMM_HUB_ON) {
    __mhUnsubs.push(onSnapshot(query(collection(db, 'payment_requests'), where('requestedBy', '==', S.me.uid), limit(200)), snap => {
      S.payReqOpen = snap.docs.map(d => d.data()).filter(r => REQ_OPEN.has(r.status)).length;
      render();
    }, err => console.warn('commhub-pay:', err.message)));
    __mhUnsubs.push(onSnapshot(query(collection(db, 'employee_leaves'), where('requestedBy', '==', S.me.uid), limit(100)), snap => {
      S.leavesPending = snap.docs.map(d => d.data()).filter(l => l.status === 'pending').length;
      render();
    }, err => console.warn('commhub-leave:', err.message)));
  }
  const field = ROLE_ORDER_FIELD[S.role];
  if (field) {
    __mhUnsubs.push(onSnapshot(query(collection(db, 'orders'), where(field, '==', S.me.uid), limit(100)), snap => {
      S.orders = snap.docs.map(d => ({ ...d.data(), _id: d.id })).filter(o => ACTIVE_STAGES(o.stage));
      render();
    }));
  }
  window.addEventListener('beforeunload', stopListeners, { once: true });
}

export function initMyHome() {
  onAuthStateChanged(auth, async (u) => {
    if (!u) { window.location.href = 'login.html'; return; }
    S.me = { uid: u.uid, name: u.displayName || '' };
    let perms = {};
    try {
      const ud = await getDoc(doc(db, 'users', u.uid));
      const d = ud.exists() ? ud.data() : {};
      S.role = d.role || '';
      perms = d.permissions || {};
      S.mustChangePassword = !!d.mustChangePassword;
      S.me.name = d.name || d.displayName || u.email || 'موظف';
    } catch (_) {}

    // sidebar chrome
    try { if (window.B2CSidebar?.build) window.B2CSidebar.build({ role: S.role, permissions: perms }, 'my-home.html'); } catch (_) {}
    const nn = document.getElementById('nav-name'); if (nn) nn.textContent = S.me.name;
    const na = document.getElementById('nav-av'); if (na) na.textContent = (S.me.name || 'U').slice(0, 1);
    const rb = document.getElementById('role-badge'); if (rb) rb.textContent = S.role || 'ERP';

    // feature flag (E1.8/E1.9) — enabled by default, instant kill switch retained
    if (!isFeatureEnabled('myHome', true)) {
      notice('⏸️ صفحتي معطّلة عبر flag.<br>لإعادة التفعيل: احذف <code>feat.myHome=0</code> من الرابط/الـ localStorage ثم أعد التحميل.');
      return;
    }

    // resolve the employee doc for this user (for empId / attendance / incidents)
    try {
      const es = await getDocs(query(collection(db, 'employees'), where('authUid', '==', u.uid), limit(1)));
      if (!es.empty) { S.empId = es.docs[0].id; S.emp = es.docs[0].data(); if (!S.me.name) S.me.name = S.emp.name || S.me.name; }
    } catch (_) {}

    wireActions();
    startListeners();
    render();
  });
}
