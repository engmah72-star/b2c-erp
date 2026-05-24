/**
 * Business2Card ERP — core/error-reporter.js
 *
 * ━━━ AUTO ERROR CAPTURE + USER REPORTS (Phase-7) ━━━
 *
 * Captures three sources and writes them to the 'error_reports'
 * Firestore collection so admins/ops can investigate:
 *
 *   1) window.onerror               — uncaught JS exceptions
 *   2) unhandledrejection           — promise rejections never caught
 *   3) console.error                — explicit error logging (wrapper)
 *   + manual:
 *   4) reportProblem({ description, expected, actual })  ← from bug widget
 *
 * Design constraints:
 *   - Rate-limit (max 10 per minute per session) — prevents loops from
 *     flooding Firestore.
 *   - Dedup window (5 min) — same message+stack collapses to one row
 *     with a counter on it.
 *   - Buffer offline — reports queued in localStorage when offline,
 *     flushed when online.
 *   - Fail-silent — the reporter itself NEVER throws (would loop forever).
 *
 * Wired in from shared.js + any page that imports this module.
 */

import { collection, addDoc, serverTimestamp, increment, doc, updateDoc, query, where, getDocs, limit }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── Configuration ──────────────────────────────────────────────────
const RATE_LIMIT_PER_MIN = 10;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;        // 5 min
const BUFFER_KEY = 'b2c.error_buffer';
const RECENT_KEY = 'b2c.error_recent';        // dedup tracker

// ─── Internal state ─────────────────────────────────────────────────
let _db = null;
let _user = null;               // { uid, name, role }
let _installed = false;
let _recentCount = 0;
let _recentWindowStart = Date.now();

function rateLimited() {
  const now = Date.now();
  if (now - _recentWindowStart > 60_000) {
    _recentWindowStart = now;
    _recentCount = 0;
  }
  if (_recentCount >= RATE_LIMIT_PER_MIN) return true;
  _recentCount++;
  return false;
}

function dedupKey(payload) {
  // Use first 200 chars of message + first 500 of stack — fingerprint
  return (payload.message || '').slice(0, 200) + '|' + (payload.stack || '').slice(0, 500);
}

function isRecentlySeen(key) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw);
    const ts = map[key];
    if (!ts) return false;
    return Date.now() - ts < DEDUP_WINDOW_MS;
  } catch { return false; }
}

function markSeen(key) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[key] = Date.now();
    // Trim old entries
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const k of Object.keys(map)) {
      if (map[k] < cutoff) delete map[k];
    }
    localStorage.setItem(RECENT_KEY, JSON.stringify(map));
  } catch {}
}

// ─── Buffer (offline) ───────────────────────────────────────────────
function bufferPush(payload) {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push({ ...payload, bufferedAt: Date.now() });
    // Cap at 50 entries — avoid runaway storage
    while (arr.length > 50) arr.shift();
    localStorage.setItem(BUFFER_KEY, JSON.stringify(arr));
  } catch {}
}

async function bufferFlush() {
  if (!_db) return;
  let arr = [];
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (!raw) return;
    arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return;
  } catch { return; }
  for (const p of arr) {
    try { await write(p); } catch {}
  }
  try { localStorage.removeItem(BUFFER_KEY); } catch {}
}

// ─── Write to Firestore ─────────────────────────────────────────────
async function write(payload) {
  if (!_db) {
    bufferPush(payload);
    return;
  }
  try {
    // Check dedup — if same fingerprint exists within window, increment count
    const fp = dedupKey(payload);
    const since = new Date(Date.now() - DEDUP_WINDOW_MS);
    const q = query(
      collection(_db, 'error_reports'),
      where('fingerprint', '==', fp.slice(0, 100)),
      where('createdAt', '>', since),
      limit(1)
    );
    let existed = null;
    try {
      const snap = await getDocs(q);
      if (!snap.empty) existed = snap.docs[0];
    } catch {
      // Firestore query may fail without index — fall back to fresh insert.
    }
    if (existed) {
      try { await updateDoc(existed.ref, { count: increment(1), lastSeenAt: serverTimestamp() }); } catch {}
      return;
    }
    await addDoc(collection(_db, 'error_reports'), {
      ...payload,
      fingerprint: fp.slice(0, 100),
      count: 1,
      status: 'new',
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    });
  } catch (e) {
    // Fail silent — but try to buffer the original
    bufferPush(payload);
  }
}

// ─── Build payload from various sources ─────────────────────────────
function buildPayload(type, fields = {}) {
  return {
    type,
    message:   String(fields.message || '').slice(0, 2000),
    stack:     String(fields.stack || '').slice(0, 4000),
    url:       location.href,
    userAgent: navigator.userAgent.slice(0, 500),
    userId:    _user?.uid || '',
    userName:  _user?.name || '',
    userRole:  _user?.role || '',
    pageTitle: document.title || '',
    // Optional user-provided fields:
    description:      fields.description || '',
    expectedBehavior: fields.expectedBehavior || '',
    actualBehavior:   fields.actualBehavior || '',
    severity:         fields.severity || 'auto',     // user can flag urgency
  };
}

function capture(type, fields) {
  if (rateLimited()) return;
  const payload = buildPayload(type, fields);
  const k = dedupKey(payload);
  if (isRecentlySeen(k) && type !== 'user_report') return;
  markSeen(k);
  // Don't await — fire-and-forget
  write(payload).catch(() => {});
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Install global hooks. Idempotent — safe to call multiple times.
 * @param {Object} ctx
 *   - db:    Firestore instance (modular SDK)
 *   - user:  { uid, name, role } — call setUser() later when auth resolves
 */
export function installErrorReporter({ db, user } = {}) {
  if (_db == null && db) _db = db;
  if (user) _user = user;
  if (_installed) {
    bufferFlush();
    return;
  }
  _installed = true;

  // 1) Uncaught exceptions
  window.addEventListener('error', (evt) => {
    capture('uncaught_exception', {
      message: evt.message || (evt.error && evt.error.message) || 'unknown error',
      stack:   (evt.error && evt.error.stack) || '',
    });
  });

  // 2) Unhandled promise rejections
  window.addEventListener('unhandledrejection', (evt) => {
    const reason = evt.reason;
    capture('promise_rejection', {
      message: reason?.message || String(reason),
      stack:   reason?.stack || '',
    });
  });

  // 3) console.error wrapper — additive, preserves original
  const origError = console.error.bind(console);
  console.error = function (...args) {
    try {
      const msg = args.map(a => {
        if (a && a.stack) return a.stack;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' ');
      capture('console_error', { message: msg });
    } catch {}
    return origError(...args);
  };

  // 4) Flush buffer when online
  if (navigator.onLine) bufferFlush();
  window.addEventListener('online', () => bufferFlush());
}

/** Update the user info attached to subsequent reports (call after auth resolves). */
export function setUser(user) {
  _user = user || null;
}

/** Manual user report from the bug widget. */
export function reportProblem({ description, expectedBehavior, actualBehavior, severity = 'med' } = {}) {
  capture('user_report', {
    message: description || '(no description)',
    description, expectedBehavior, actualBehavior, severity,
  });
}

// Also expose as window.* so the floating widget (loaded as classic script
// on classic-script pages like clients.html) can call them directly.
if (typeof window !== 'undefined') {
  window.b2cErrorReporter = {
    install: installErrorReporter,
    setUser,
    reportProblem,
  };
}
