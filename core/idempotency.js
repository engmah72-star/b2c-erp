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
  // PR-7.5 BUGFIX (Chaos Test 2): The previous getDoc+setDoc pattern had a
  // TOCTOU race — two tabs could both see "doesn't exist" and both setDoc,
  // resulting in double mutation. runTransaction makes this atomic.
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
    // Transaction error itself — fall through and try once more without the
    // idempotency guard. NEVER throw without finalize() (telemetry).
    console.warn('[IDEMPOTENCY] transaction failed — proceeding without guard', e);
    reservation = { kind: 'reserved' };
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

  // 4) record completed
  try {
    await updateDoc(opRef, {
      status: 'completed',
      result: sanitizeResult(result),
      completedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[IDEMPOTENCY] فشل تسجيل completed (العملية تمت):', e);
  }

  return finalize({ ...result, operationId, idempotent: false });
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
