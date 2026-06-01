/**
 * Business2Card ERP — core/idempotency.js
 *
 * ━━━ FINANCIAL OPERATIONS IDEMPOTENCY LAYER (PR-7 G1) ━━━
 *
 * المشكلة:
 *   الـ actions أصبحت centralized. أي double-click / refresh-submit /
 *   retry storm / stale modal قد يسبب double financial writes.
 *
 * الحل:
 *   كل financial action تمر عبر `withIdempotency(...)` يسجّل العملية في
 *   `financial_operations/{operationId}` قبل التنفيذ.
 *
 *   لو نفس fingerprint (نفس entity + نفس actor + نفس payload + نفس minute)
 *   موجودة قبل كده:
 *     - status='completed' → نُعيد الـ result المحفوظ (no-op)
 *     - status='pending'   → نرفض (عملية قيد التنفيذ)
 *     - status='failed'    → نعيد المحاولة (السابق فشل)
 *
 * Schema:
 *   financial_operations/{operationId}:
 *     operationId         (deterministic hash of fingerprint inputs)
 *     actionType          'settle' | 'collect' | 'refund' | ...
 *     entityId            orderId / settlementId / orderIds-join
 *     actorId             userId
 *     fingerprint         hash(entityId + actionType + payloadKey + dateBucket)
 *     status              'pending' | 'completed' | 'failed'
 *     createdAt
 *     completedAt
 *     result              { ok, ... } cached on completion
 *     error               string-if-failed
 *
 * كل operationId مبني من fingerprint deterministic. نفس inputs = نفس id.
 */

import { runTransaction, doc, getDoc, updateDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { startActionTrace } from './telemetry.js';

// ─── DETERMINISTIC HASH (browser-safe, sync) ──────────────────────────────
// djb2 + xor — 32-bit hash → hex. ليس cryptographic لكن كافٍ للـ deduplication.
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * يُولّد fingerprint deterministic من payload + actor + minute bucket.
 * نستخدم minute bucket عشان double-clicks (متباعدة بـ ms) تُكتشف،
 * لكن إعادة محاولة بعد دقيقة كاملة تُعتبر عملية مختلفة.
 *
 * @param {Object} args
 * @param {string} args.actionType
 * @param {string} args.entityId      — orderId/settlementId/orderIds-join
 * @param {string} args.actorId
 * @param {Object} args.payload       — الـ fields المعتبرة من العملية
 * @param {number} [args.windowMs=60000] — window للـ dedupe (افتراضي 60 ثانية)
 * @returns {string} operationId (16 hex chars)
 */
export function mintOperationId({ actionType, entityId, actorId, payload, windowMs = 60000 }) {
  const bucket = Math.floor(Date.now() / windowMs);
  const payloadJson = stableStringify(payload || {});
  const key = `${actionType}|${entityId || ''}|${actorId || ''}|${bucket}|${payloadJson}`;
  return hashString(key) + hashString(key.split('').reverse().join(''));
}

/**
 * stable stringify — يضمن نفس output لنفس object بصرف النظر عن ترتيب keys.
 * idempotency تحتاج deterministic serialization.
 */
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/**
 * يلف financial action بـ idempotency guard.
 *
 * Flow:
 *   1. حسب operationId من fingerprint inputs
 *   2. اقرأ financial_operations/{operationId}
 *   3a. لو completed → ارجع result السابق (no-op)
 *   3b. لو pending  → ارفض (في تنفيذ)
 *   3c. لو failed   → امسح + أعد المحاولة
 *   4. سجّل pending (atomic via setDoc — لو موجود يفشل)
 *   5. نفّذ fn()
 *   6. سجّل completed + result
 *   7. لو خطأ → سجّل failed
 *
 * @param {Object} db — Firestore instance
 * @param {Object} opMeta — { actionType, entityId, actorId, payload }
 * @param {Function} fn   — async function يُنفّذ العملية، يُرجع { ok, ... }
 * @returns {Promise<Object>} نفس result الـ fn (مع operationId + idempotent flag)
 */
export async function withIdempotency(db, opMeta, fn) {
  const operationId = mintOperationId(opMeta);
  const opRef = doc(db, 'financial_operations', operationId);

  // PR-7.5 R6 — auto-telemetry for every wrapped action
  const trace = startActionTrace({
    actionType: opMeta.actionType,
    actorId:    opMeta.actorId,
    actorName:  opMeta.actorName,
    entityId:   opMeta.entityId,
  });
  const finalize = async (result) => {
    try { await trace.finish(db, { ...result, operationId }); } catch {}
    return result;
  };

  // 1+2) Atomic check-and-reserve via Firestore transaction.
  // CHAOS HOTFIX (T1/T2): The previous "transaction failed → proceed as
  // reserved" fallback was FAIL-OPEN — under contention, network blip, or
  // rule rejection, both parallel tabs would treat themselves as the
  // winner and double-execute the mutation. Now FAIL-CLOSED: any
  // reservation error returns a rejected result; user can retry
  // immediately and the next try sees the persisted state.
  //
  // Outcomes:
  //   { kind:'reserved'  } → we own this op, proceed to execute
  //   { kind:'completed' } → another caller already finished, return cached
  //   { kind:'pending'   } → another caller is in-flight, reject
  let reservation;
  try {
    reservation = await runTransaction(db, async (tx) => {
      const snap = await tx.get(opRef);
      if (snap.exists()) {
        const d = snap.data();
        if (d.status === 'completed') return { kind: 'completed', data: d };
        if (d.status === 'pending')   return { kind: 'pending',   data: d };
        // status === 'failed' → overwrite & retry
      }
      // create or retry-after-failure: write pending
      tx.set(opRef, {
        operationId,
        actionType: opMeta.actionType,
        entityId:   opMeta.entityId || '',
        actorId:    opMeta.actorId  || '',
        fingerprint: operationId,
        status:     'pending',
        createdAt:  serverTimestamp(),
        payload:    opMeta.payload || {},
      });
      return { kind: 'reserved' };
    });
  } catch (e) {
    // FAIL-CLOSED — never silently proceed without the guard.
    // Under contention/abort/rule-rejection, return a deterministic
    // failure so the caller (and chaos runner) sees a clear signal
    // and can retry. The other tab's reservation, if any, persists.
    console.warn('[IDEMPOTENCY] reservation transaction failed — failing closed', e);
    return finalize({
      ok: false,
      errors: [`عملية مزدحمة — حاول بعد لحظات (reservation failed: ${e.message || e})`],
      warnings: [],
      operationId,
      idempotent: true,
      pending: true,
      reservationError: true,
    });
  }

  if (reservation.kind === 'completed') {
    const d = reservation.data;
    console.log('[IDEMPOTENCY] ✅ no-op: cached completed result', operationId);
    return finalize({
      ...(d.result || {}),
      ok: d.result?.ok ?? true,
      operationId,
      idempotent: true,
      cachedFrom: d.completedAt || d.createdAt,
    });
  }
  if (reservation.kind === 'pending') {
    console.warn('[IDEMPOTENCY] ⏳ rejected: pending operation', operationId);
    return finalize({
      ok: false,
      errors: ['⏳ نفس العملية قيد التنفيذ — انتظر بضع ثواني وأعد المحاولة'],
      warnings: [],
      operationId,
      idempotent: true,
      pending: true,
    });
  }
  // reservation.kind === 'reserved' — we own this op, proceed below.

  // 3) execute
  let result;
  try {
    result = await fn(operationId);
  } catch (e) {
    // mark failed
    try {
      await updateDoc(opRef, {
        status: 'failed',
        error: e.message || String(e),
        completedAt: serverTimestamp(),
      });
    } catch (_) {}
    await finalize({ ok: false, errors: [e.message || String(e)], operationId });
    throw e;
  }

  // 4) record completed — fire-and-forget (bookkeeping, NOT user-visible).
  //    The real mutation already committed inside fn(). Awaiting this extra
  //    Firestore round-trip (plus the telemetry write below) on slow/flaky
  //    networks was pushing callers past their 15s save budget and surfacing
  //    a false "انتهت مهلة الحفظ (15ث)" even though the order/payment WAS
  //    saved. We still issue the write — we just stop blocking the result on
  //    it. Idempotency stays correct: a retry of the same op before this
  //    lands sees status='pending' (rejected → no double-write); after it
  //    lands sees 'completed' (cached no-op).
  updateDoc(opRef, {
    status: 'completed',
    result: sanitizeResult(result),
    completedAt: serverTimestamp(),
  }).catch((e) => console.warn('[IDEMPOTENCY] فشل تسجيل completed (العملية تمت):', e));

  // Telemetry finish is observability only → also fire-and-forget so it can
  // never delay or fail the user-visible result.
  const finalResult = { ...result, operationId, idempotent: false };
  trace.finish(db, finalResult).catch(() => {});
  return finalResult;
}

/**
 * يُنظّف الـ result قبل التخزين — يُزيل Firestore refs / functions / circular.
 * Firestore يرفض تخزين أنواع غير serializable.
 */
function sanitizeResult(r) {
  if (!r || typeof r !== 'object') return r;
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (v === undefined || typeof v === 'function') continue;
    if (v && typeof v === 'object' && (v._ref || v.constructor?.name === 'DocumentReference')) continue;
    if (Array.isArray(v)) {
      out[k] = v.map(item => (item && typeof item === 'object' ? sanitizeResult(item) : item));
    } else if (v && typeof v === 'object') {
      out[k] = sanitizeResult(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
