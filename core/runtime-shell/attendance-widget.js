// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Self Attendance Widget (topbar punch clock)
// ════════════════════════════════════════════════════════════════════
//
// A universal check-in / check-out control for the logged-in employee,
// mounted in the shell topbar so it is reachable from ANY domain — not only
// the "صفحتي" (my-home) landing.
//
// Consistency (no duplicate rows): the attendance record id is derived ONLY by
// the central attendance-core.attendanceDocId (keyed on the auth uid), so this
// widget, my-home, the role dashboards and the control center all share ONE
// idempotent record per day. We read by the employeeUid field and let the
// central action own the id — never reconstruct a key here.
//
// All writes go through employeeActions (H1.1) with source:'self' and a
// schedule-derived lateMinutes (expectedStart + 15-min grace — single source
// attendance-core.computeLateMinutes, applied inside the action).
//
//   init({ container, user })  → resolve employee, subscribe, render
//   stop()                     → detach the listener
// ════════════════════════════════════════════════════════════════════

import { db } from '../firebase-init.js';
import {
  collection, doc, getDocs, onSnapshot, query, where, limit,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { employeeActions } from '../../employee-actions.js';

const GRACE_MIN = 15;  // matches the employee-profile central path

let _container = null;
let _unsub = null;
let _busy = false;
let _ctx = null;   // { uid, name, empId, expectedStart }
let _today = '';
let _att = null;   // today's attendance record (or null)

const todayIso = () => new Date().toISOString().slice(0, 10);

export async function init({ container, user }) {
  if (!container || !user?.uid) return;
  _container = container;
  _container.hidden = true;  // hidden until we confirm this user is an employee

  // resolve the employee doc (for empId + schedule); hide for non-employees
  let empId = '', emp = null;
  try {
    const es = await getDocs(query(
      collection(db, 'employees'), where('authUid', '==', user.uid), limit(1),
    ));
    if (es.empty) return;  // admin / non-employee → no punch widget
    empId = es.docs[0].id;
    emp = es.docs[0].data();
  } catch (e) {
    console.warn('[rt-att] employee lookup failed', e);
    return;
  }

  _ctx = {
    uid: user.uid,
    name: emp.name || user.name || '',
    empId,
    expectedStart: emp.workSchedule?.startTime || '',
  };
  _today = todayIso();
  _container.hidden = false;
  _container.addEventListener('click', _onClick);

  // live subscription to today's record — query by the employeeUid FIELD (not a
  // reconstructed doc id), so it resolves the canonical `${uid}_${date}` record
  // every surface now writes, independent of the old empId-keyed scheme.
  _unsub = onSnapshot(
    query(collection(db, 'attendance'),
      where('employeeUid', '==', user.uid), where('date', '==', _today), limit(3)),
    (snap) => { _att = snap.empty ? null : snap.docs[0].data(); _render(); },
    (e) => { console.warn('[rt-att] snapshot error', e); });

  _render();
}

export function stop() {
  if (_unsub) { try { _unsub(); } catch (_) {} _unsub = null; }
  if (_container) { try { _container.removeEventListener('click', _onClick); } catch (_) {} }
}

function _render() {
  if (!_container || !_ctx) return;
  const dis = _busy ? ' disabled' : '';
  let html;
  if (!_att || !_att.checkIn) {
    html = `<button type="button" class="rt-att-pill rt-att-in" data-att="in"${dis}>🟢 حضور</button>`;
  } else if (!_att.checkOut) {
    const lateMin = parseInt(_att.lateMinutes) || 0;
    const since = _esc(_att.checkInStr || '');
    const tip = `حاضر منذ ${since}${lateMin > 0 ? ' · متأخر ' + lateMin + 'د' : ''}`;
    html = `<button type="button" class="rt-att-pill rt-att-out" data-att="out"${dis} title="${tip}">`
         + `🔴 انصراف${lateMin > 0 ? '<span class="rt-att-late" aria-hidden="true">⏰</span>' : ''}</button>`;
  } else {
    const tip = `${_esc(_att.checkInStr || '')} → ${_esc(_att.checkOutStr || '')}`;
    html = `<span class="rt-att-pill rt-att-done" title="${tip}">✓ تم</span>`;
  }
  _container.innerHTML = html;
}

async function _onClick(e) {
  const btn = e.target.closest('[data-att]');
  if (!btn || _busy || !_ctx) return;
  const kind = btn.dataset.att;
  _busy = true; _render();
  try {
    if (kind === 'in') {
      const r = await employeeActions.recordAttendanceCheckIn({
        db,
        employeeId: _ctx.empId, employeeUid: _ctx.uid, employeeName: _ctx.name,
        date: _today, monthKey: _today.slice(0, 7),
        expectedStart: _ctx.expectedStart, graceMinutes: GRACE_MIN, source: 'self',
        recordedBy: _ctx.uid, recordedByName: _ctx.name,
      });
      if (!r.ok) _toast('❌ ' + (r.errors || []).join(' · '), 'err');
      else _toast(r.lateMinutes > 0 ? `⚠️ حضور متأخر ${r.lateMinutes}د` : '✅ تم تسجيل حضورك',
                  r.lateMinutes > 0 ? 'err' : 'ok');
    } else if (kind === 'out') {
      const r = await employeeActions.recordAttendanceCheckOut({
        db, employeeUid: _ctx.uid, employeeId: _ctx.empId, date: _today,
      });
      _toast(r.ok ? '✅ تم تسجيل انصرافك' : '❌ ' + (r.errors || []).join(' · '), r.ok ? 'ok' : 'err');
    }
  } catch (err) {
    _toast('❌ ' + (err?.message || 'تعذّر تسجيل الحضور'), 'err');
  } finally {
    _busy = false; _render();
  }
}

function _toast(msg, type) {
  if (typeof window.toast === 'function') { try { window.toast(msg, type); return; } catch (_) {} }
  console.log('[rt-att]', msg);
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
