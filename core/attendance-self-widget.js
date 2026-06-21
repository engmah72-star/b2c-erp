// ════════════════════════════════════════════════════════════════════
// core/attendance-self-widget.js
// THE single self-service attendance point for the logged-in employee —
// check-in / check-out + leave/permission request — mounted into any page
// that gives it a container. One definition, used by every role dashboard so
// attendance is central, not re-implemented per page (PC2 / RULE 1 / L1.5).
//
// View + orchestration only: every write goes through a CENTRAL action in
// employee-actions.js (H1.1) — this file performs no direct Firestore write.
// The attendance record id is owned by attendance-core.attendanceDocId (keyed
// on the auth uid); reads here filter by the employeeUid field, so the widget
// reflects a check-in made from ANY surface.
//
//   mountAttendanceSelf({ container, db, user })  → resolve · subscribe · render
//   (returns an unsubscribe/teardown function)
// ════════════════════════════════════════════════════════════════════

import {
  collection, doc, getDocs, onSnapshot, query, where, limit,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { employeeActions } from '../employee-actions.js';
import { PERMISSION_TYPES } from './attendance-core.js';

const GRACE_MIN = 15;  // single grace window (matches the central salary path)

// Self-service permission/leave types the employee can request (→ pending →
// the manager approves on attendance.html). Labels local, values central.
const REQUEST_TYPES = [
  [PERMISSION_TYPES.LATE_IN,   '⏰ إذن تأخير'],
  [PERMISSION_TYPES.EARLY_OUT, '🚪 انصراف مبكر'],
  [PERMISSION_TYPES.MISSION,   '🚗 مأمورية خارجية'],
  [PERMISSION_TYPES.REMOTE,    '🏠 عمل عن بُعد'],
  [PERMISSION_TYPES.PARTIAL,   '🕐 إذن جزئي (مدة)'],
];

const todayIso = () => new Date().toISOString().slice(0, 10);
// wall-clock 'HH:MM' (local) — compared lexicographically with workSchedule
// times (both zero-padded), so "shift ended" needs no Date math.
const nowHHMM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, type) {
  if (typeof window.toast === 'function') { try { window.toast(msg, type); return; } catch (_) {} }
  console.log('[att-self]', msg);
}

// ── one-time scoped styles (asw- prefix; tokens from shared.css) ──────
function injectStyles() {
  if (document.getElementById('asw-style')) return;
  const st = document.createElement('style');
  st.id = 'asw-style';
  st.textContent = `
    .asw-card{background:var(--bg2);border:1px solid var(--line);border-radius:var(--rad2);padding:14px 16px;display:flex;flex-direction:column;gap:12px;box-shadow:var(--shadow-card)}
    .asw-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .asw-lbl{font-size:var(--fs-xs);font-weight:var(--fw-bold);color:var(--dim2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
    .asw-time{font-size:var(--fs-lg);font-weight:var(--fw-heavy)}
    .asw-sub{font-size:var(--fs-sm);color:var(--dim2);margin-top:2px}
    .asw-cta{padding:10px 18px;border-radius:var(--r-pill);border:none;font-family:inherit;font-size:var(--fs-base);font-weight:var(--fw-extra);cursor:pointer;transition:.15s;white-space:nowrap;min-height:40px}
    .asw-cta.in{background:var(--g);color:#04130c}
    .asw-cta.out{background:var(--r);color:#fff}
    .asw-cta.done-btn{background:var(--bg4);color:var(--dim2);cursor:default}
    .asw-cta.ot{background:var(--y,#f0a020);color:#1a1205}
    .asw-cta:disabled{opacity:.6;cursor:not-allowed}
    .asw-btn-pair{display:flex;gap:8px;flex-wrap:wrap}
    .asw-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--line);padding-top:10px}
    .asw-leave-btn{background:transparent;border:1px solid var(--line);color:var(--snow);padding:7px 13px;border-radius:var(--r-pill);font-family:inherit;font-size:var(--fs-sm);font-weight:var(--fw-bold);cursor:pointer;transition:.15s}
    .asw-leave-btn:hover{border-color:var(--b);color:var(--b)}
    .asw-pend{font-size:var(--fs-xs);font-weight:var(--fw-bold);color:var(--y);background:rgba(240,160,32,.12);padding:3px 9px;border-radius:var(--r-pill)}
    .asw-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px}
    .asw-modal{background:var(--bg2);border:1px solid var(--line);border-radius:var(--rad2);width:100%;max-width:440px;box-shadow:var(--shadow-lg);overflow:hidden}
    .asw-modal-h{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line)}
    .asw-modal-h h3{margin:0;font-size:var(--fs-md);font-weight:var(--fw-heavy)}
    .asw-modal-x{background:transparent;border:none;color:var(--dim2);font-size:var(--fs-lg);cursor:pointer}
    .asw-modal-b{padding:16px;display:flex;flex-direction:column;gap:12px}
    .asw-fld{display:flex;flex-direction:column;gap:5px}
    .asw-fld>span{font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--dim2)}
    .asw-fld .inp,.asw-modal .inp{width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:var(--rad);padding:9px 11px;color:var(--snow);font-family:inherit;font-size:var(--fs-base)}
    .asw-fld-row{display:flex;gap:10px}.asw-fld-row>*{flex:1}
    .asw-modal-f{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--line)}
    .asw-btn{padding:9px 16px;border-radius:var(--rad);border:none;font-family:inherit;font-weight:var(--fw-bold);cursor:pointer}
    .asw-btn.ghost{background:transparent;border:1px solid var(--line);color:var(--dim2)}
    .asw-btn.primary{background:var(--b);color:#fff}`;
  document.head.appendChild(st);
}

export function mountAttendanceSelf({ container, db, user }) {
  if (!container || !db || !user?.uid) return () => {};
  injectStyles();

  const state = { ctx: null, att: null, pending: 0, busy: false };
  const today = todayIso();
  const unsubs = [];
  const stop = () => { unsubs.forEach(u => { try { u(); } catch (_) {} }); unsubs.length = 0; };

  // ── render ─────────────────────────────────────────────────────────
  function render() {
    if (!state.ctx) { container.innerHTML = ''; return; }
    const a = state.att;
    const dis = state.busy ? ' disabled' : '';
    let cls, time, sub, btn;
    if (!a || !a.checkIn) {
      cls = 'in'; time = 'لم تسجّل حضورك بعد'; sub = 'سجّل الحضور لتبدأ يومك';
      btn = `<button type="button" class="asw-cta in" data-att="in"${dis}>✅ تسجيل الحضور</button>`;
    } else if (!a.checkOut) {
      const late = parseInt(a.lateMinutes) || 0;
      const end = state.ctx.expectedEnd;
      const ended = end && nowHHMM() >= end;
      if (a.overtime) {
        // overtime in progress — show what they're working on + finish button
        cls = 'out'; time = '⏱️ أوفر تايم';
        sub = a.overtimeNote ? ('🛠️ ' + esc(a.overtimeNote)) : 'وقت إضافي بعد انتهاء الوردية';
        btn = `<button type="button" class="asw-cta out" data-att="out"${dis}>🔚 إنهاء الأوفر تايم</button>`;
      } else if (ended) {
        // shift end reached → auto-prompt: leave now OR continue as overtime
        cls = 'out'; time = `🏁 انتهت ورديتك (${esc(end)})`;
        sub = 'تنصرف الآن ولا تكمّل أوفر تايم؟';
        btn = `<div class="asw-btn-pair">`
            + `<button type="button" class="asw-cta out" data-att="out"${dis}>🔴 انصراف الآن</button>`
            + `<button type="button" class="asw-cta ot" data-att="overtime"${dis}>⏱️ أوفر تايم</button></div>`;
      } else {
        cls = 'out'; time = 'حاضر منذ ' + esc(a.checkInStr || '');
        sub = late > 0 ? `⏰ متأخر ${late} دقيقة` : 'اضغط عند الانتهاء لتسجيل الانصراف';
        btn = `<button type="button" class="asw-cta out" data-att="out"${dis}>🔚 تسجيل الانصراف</button>`;
      }
    } else {
      cls = 'done'; time = esc(a.checkInStr || '') + ' → ' + esc(a.checkOutStr || '');
      sub = a.overtime ? '✅ سجّلت يومك · ⏱️ مع أوفر تايم' : '✅ سجّلت يومك';
      btn = `<button type="button" class="asw-cta done-btn" disabled>تم التسجيل</button>`;
    }
    const pendChip = state.pending > 0
      ? `<span class="asw-pend">${state.pending} طلب قيد الاعتماد</span>` : '<span></span>';
    container.innerHTML = `
      <div class="asw-card">
        <div class="asw-row">
          <div><div class="asw-lbl">⏰ الحضور والانصراف</div>
            <div class="asw-time" style="color:${cls === 'out' ? 'var(--g)' : cls === 'done' ? 'var(--b)' : 'var(--snow)'}">${time}</div>
            <div class="asw-sub">${sub}</div></div>
          ${btn}
        </div>
        <div class="asw-foot">
          ${pendChip}
          <button type="button" class="asw-leave-btn" data-leave="1">📝 طلب إذن / إجازة</button>
        </div>
      </div>`;
  }

  // ── leave/permission request modal ─────────────────────────────────
  function openLeaveModal() {
    const opts = REQUEST_TYPES.map(([v, l], i) => `<option value="${esc(v)}"${i === 0 ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const host = document.createElement('div');
    host.className = 'asw-ov';
    host.innerHTML = `
      <div class="asw-modal" role="dialog" aria-modal="true">
        <div class="asw-modal-h"><h3>📝 طلب إذن / إجازة</h3><button type="button" class="asw-modal-x" data-x="1">✕</button></div>
        <div class="asw-modal-b">
          <label class="asw-fld"><span>النوع</span><select class="inp" id="asw-type">${opts}</select></label>
          <label class="asw-fld"><span>التاريخ</span><input class="inp" type="date" id="asw-date" value="${today}"></label>
          <div class="asw-fld-row">
            <label class="asw-fld"><span>من (اختياري)</span><input class="inp" type="time" id="asw-from"></label>
            <label class="asw-fld"><span>إلى (اختياري)</span><input class="inp" type="time" id="asw-to"></label>
          </div>
          <label class="asw-fld"><span>السبب</span><textarea class="inp" id="asw-reason" rows="2" placeholder="سبب الطلب (اختياري)"></textarea></label>
        </div>
        <div class="asw-modal-f">
          <button type="button" class="asw-btn ghost" data-x="1">إلغاء</button>
          <button type="button" class="asw-btn primary" id="asw-send">📤 إرسال الطلب</button>
        </div>
      </div>`;
    document.body.appendChild(host);
    const close = () => host.remove();
    host.addEventListener('click', (e) => { if (e.target === host || e.target.dataset.x) close(); });
    host.querySelector('#asw-send').addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true; const orig = btn.textContent; btn.textContent = 'جاري...';
      const fromV = host.querySelector('#asw-from').value;
      const toV = host.querySelector('#asw-to').value;
      let minutes = 0;
      if (fromV && toV) { const [fh, fm] = fromV.split(':').map(Number); const [th, tm] = toV.split(':').map(Number); minutes = Math.max(0, (th * 60 + tm) - (fh * 60 + fm)); }
      const r = await employeeActions.requestAttendancePermission({
        db, employeeId: state.ctx.empId, employeeUid: state.ctx.uid, employeeName: state.ctx.name,
        type: host.querySelector('#asw-type').value,
        date: host.querySelector('#asw-date').value || today,
        fromTime: fromV, toTime: toV, minutes,
        reason: host.querySelector('#asw-reason').value,
        requestedBy: state.ctx.uid, requestedByName: state.ctx.name,
      });
      if (r && r.ok === false) {
        toast('❌ ' + (r.errors || ['فشل الطلب']).join(' · '), 'err');
        btn.disabled = false; btn.textContent = orig; return;
      }
      toast('✅ تم إرسال الطلب — بانتظار اعتماد المدير', 'ok');
      close();
    });
  }

  // ── punch ──────────────────────────────────────────────────────────
  async function punch(kind) {
    if (state.busy || !state.ctx) return;
    state.busy = true; render();
    try {
      let r;
      if (kind === 'in') {
        r = await employeeActions.recordAttendanceCheckIn({
          db, employeeId: state.ctx.empId, employeeUid: state.ctx.uid, employeeName: state.ctx.name,
          date: today, monthKey: today.slice(0, 7),
          expectedStart: state.ctx.expectedStart, graceMinutes: GRACE_MIN, source: 'self',
          recordedBy: state.ctx.uid, recordedByName: state.ctx.name,
        });
        toast(r.ok ? (r.lateMinutes > 0 ? `⚠️ حضور متأخر ${r.lateMinutes}د` : '✅ تم تسجيل حضورك') : ('❌ ' + (r.errors || []).join(' · ')), r.ok ? 'ok' : 'err');
      } else {
        r = await employeeActions.recordAttendanceCheckOut({
          db, employeeUid: state.ctx.uid, employeeId: state.ctx.empId, date: today,
        });
        toast(r.ok ? '✅ تم تسجيل انصرافك' : ('❌ ' + (r.errors || []).join(' · ')), r.ok ? 'ok' : 'err');
      }
    } catch (err) {
      toast('❌ ' + (err?.message || 'تعذّر التسجيل'), 'err');
    } finally {
      state.busy = false; render();
    }
  }

  // ── overtime: employee writes what they'll work on (their own description) ──
  function openOvertimeModal() {
    const host = document.createElement('div');
    host.className = 'asw-ov';
    host.innerHTML = `
      <div class="asw-modal" role="dialog" aria-modal="true">
        <div class="asw-modal-h"><h3>⏱️ أوفر تايم</h3><button type="button" class="asw-modal-x" data-x="1">✕</button></div>
        <div class="asw-modal-b">
          <label class="asw-fld"><span>بتشتغل على إيه؟</span><textarea class="inp" id="asw-ot-note" rows="3" placeholder="اكتب الشغل اللي هتكمّله في الوقت الإضافي"></textarea></label>
          <div class="asw-sub">هيتسجّل إنك مكمّل بعد انتهاء ورديتك — اضغط «إنهاء الأوفر تايم» وقت ما تخلص.</div>
        </div>
        <div class="asw-modal-f">
          <button type="button" class="asw-btn ghost" data-x="1">إلغاء</button>
          <button type="button" class="asw-btn primary" id="asw-ot-send">⏱️ ابدأ الأوفر تايم</button>
        </div>
      </div>`;
    document.body.appendChild(host);
    const close = () => host.remove();
    host.addEventListener('click', (e) => { if (e.target === host || e.target.dataset.x) close(); });
    host.querySelector('#asw-ot-send').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; const o = b.textContent; b.textContent = 'جاري...';
      const r = await employeeActions.startAttendanceOvertime({
        db, employeeUid: state.ctx.uid, employeeId: state.ctx.empId, date: today,
        note: host.querySelector('#asw-ot-note').value,
        recordedBy: state.ctx.uid, recordedByName: state.ctx.name,
      });
      if (r && r.ok === false) { toast('❌ ' + (r.errors || ['فشل']).join(' · '), 'err'); b.disabled = false; b.textContent = o; return; }
      toast('⏱️ تم تسجيل بدء الأوفر تايم', 'ok'); close();
    });
  }

  // re-render exactly at shift end, so the "انصراف / أوفر تايم" prompt appears
  // on time even without a data change.
  let endTimer = null;
  function scheduleEndRerender() {
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
    const end = state.ctx?.expectedEnd; if (!end) return;
    const [eh, em] = String(end).split(':').map(Number); if (isNaN(eh)) return;
    const now = new Date();
    const endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em || 0, 0).getTime();
    const delta = endMs - now.getTime();
    if (delta > 0 && delta < 24 * 3600 * 1000) endTimer = setTimeout(render, delta + 1000);
  }
  unsubs.push(() => { if (endTimer) { clearTimeout(endTimer); endTimer = null; } });

  container.addEventListener('click', (e) => {
    const p = e.target.closest('[data-att]');
    if (p) { return p.dataset.att === 'overtime' ? openOvertimeModal() : punch(p.dataset.att); }
    if (e.target.closest('[data-leave]')) return openLeaveModal();
  });

  // ── resolve employee, then subscribe (canonical reads by employeeUid) ──
  (async () => {
    try {
      const es = await getDocs(query(collection(db, 'employees'), where('authUid', '==', user.uid), limit(1)));
      if (es.empty) { container.innerHTML = ''; return; }  // non-employee → no widget
      const emp = es.docs[0].data();
      state.ctx = {
        uid: user.uid, empId: es.docs[0].id,
        name: emp.name || user.displayName || '',
        expectedStart: emp.workSchedule?.startTime || '',
        expectedEnd: emp.workSchedule?.endTime || '',
      };
    } catch (_) { return; }
    render();
    scheduleEndRerender();
    unsubs.push(onSnapshot(
      query(collection(db, 'attendance'), where('employeeUid', '==', user.uid), where('date', '==', today), limit(3)),
      (snap) => { state.att = snap.empty ? null : snap.docs[0].data(); render(); },
      () => {}));
    unsubs.push(onSnapshot(
      query(collection(db, 'attendance_permissions'), where('employeeUid', '==', user.uid), where('status', '==', 'pending'), limit(20)),
      (snap) => { state.pending = snap.size; render(); },
      () => {}));
  })();

  return stop;
}
