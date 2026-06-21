/**
 * Business2Card ERP — core/telemetry.js
 *
 * ━━━ ACTION TELEMETRY FABRIC (PR-7.5 R6) ━━━
 *
 * كل financial/operational action يجب أن تُسجَّل في:
 *   1. console (warn/log) — للـ debugging الفوري
 *   2. action_telemetry collection — للـ analytics & forensic audit
 *   3. window.dispatchEvent — للـ UI listeners (banner, badge)
 *
 * Schema:
 *   action_telemetry/{auto-id}:
 *     operationId         (from idempotency layer)
 *     actionType          'settle_from_company' | ...
 *     actorId, actorName
 *     entityId            orderId / settlementId
 *     sourcePage          'shipping.html' | 'shipping-accounts.html' | ...
 *     duration            ms
 *     result              'success' | 'failure' | 'idempotent_noop'
 *     warningLevel        'none' | 'warn' | 'error' | 'critical'
 *     repairable          boolean
 *     retryCount          number (lifetime retries for this fingerprint)
 *     errorMessage        string (if failed)
 *     errorCode           string (if failed — extract from validators)
 *     userAgent           navigator.userAgent
 *     createdAt
 *
 * NOTE: لتقليل cost على Firestore، نكتب telemetry فقط للـ:
 *   - failures (دائماً)
 *   - actions تجاوزت threshold زمني (>2s)
 *   - operations مهمة (settle, reverse, returns)
 *   - أو لو DEBUG_TELEMETRY=true في localStorage
 */

import { collection, addDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// خواص localStorage للتحكم
function isDebugMode() {
  try { return localStorage.getItem('DEBUG_TELEMETRY') === '1'; } catch { return false; }
}

// Actions اللي نسجّلها دائماً (حتى في success path)
const ALWAYS_LOG = new Set([
  'settle_from_company',
  'reverse_settlement',
  'mark_full_return',
  'mark_partial_return',
  'manual_settle',
]);

// In-memory counter للـ retries (per fingerprint, current session فقط)
const retryCounters = new Map();

/**
 * يبدأ tracking لـ action. ارجع `tracker` يستدعي `.finish(result)` بعد التنفيذ.
 *
 * @param {Object} args
 * @param {string} args.actionType
 * @param {string} args.actorId
 * @param {string} [args.actorName]
 * @param {string} [args.entityId]
 * @param {string} [args.sourcePage] — يُحسب تلقائياً من location.pathname لو غير محدد
 */
export function startActionTrace({ actionType, actorId, actorName, entityId, sourcePage }) {
  const startTs = performance.now();
  const fingerprint = `${actionType}|${entityId || ''}|${actorId || ''}`;
  const retryCount = (retryCounters.get(fingerprint) || 0);

  return {
    actionType,
    actorId,
    actorName,
    entityId,
    sourcePage: sourcePage || (typeof location !== 'undefined' ? location.pathname.split('/').pop() : ''),
    fingerprint,
    retryCount,
    startTs,
    /**
     * يُنهي الـ trace ويُسجّل النتيجة.
     * @param {Object} db
     * @param {Object} result — { ok, errors, warnings, idempotent, ... }
     */
    async finish(db, result) {
      const duration = Math.round(performance.now() - startTs);
      const success = result?.ok === true;
      const isNoop = result?.idempotent === true && !result?.pending;

      const event = {
        actionType,
        actorId: actorId || '',
        actorName: actorName || '',
        entityId: entityId || '',
        sourcePage: this.sourcePage,
        operationId: result?.operationId || '',
        duration,
        result: success ? (isNoop ? 'idempotent_noop' : 'success') : 'failure',
        warningLevel: success ? (result?.warnings?.length ? 'warn' : 'none') : (result?.pending ? 'warn' : 'error'),
        retryCount,
        errorMessage: success ? '' : (result?.errors || [])[0] || '',
        errorCode: success ? '' : extractErrorCode(result?.errors),
      };

      // Console — دائماً
      const tag = `[${actionType}]`;
      if (success && !isNoop) {
        console.log(tag, `✅ ${duration}ms`, event);
      } else if (isNoop) {
        console.log(tag, `↩ no-op (idempotent)`, event);
      } else if (result?.pending) {
        console.warn(tag, `⏳ pending`, event);
      } else {
        console.warn(tag, `❌ ${duration}ms`, event, result);
      }

      // فقط نسجل لـ Firestore لو فشل، slow، critical action، أو DEBUG mode
      const shouldPersist =
        !success ||
        duration > 2000 ||
        ALWAYS_LOG.has(actionType) ||
        isDebugMode();

      if (!shouldPersist) return;

      // counter للـ retries لو فشل
      if (!success && !isNoop) {
        retryCounters.set(this.fingerprint, retryCount + 1);
      }

      try {
        await addDoc(collection(db, 'action_telemetry'), {
          ...event,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        // telemetry فشل ≠ action فشل. لا نرمي.
        console.warn('[telemetry] failed to persist event', e);
      }

      // Window event — للـ UI listeners
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('b2c:action', { detail: event }));
        }
      } catch {}
    },
  };
}

function extractErrorCode(errors) {
  if (!Array.isArray(errors) || !errors.length) return '';
  const msg = errors[0] || '';
  // محاولة استخراج kod من بداية الـ message
  const m = msg.match(/^[⛔⚠️↻⏳]?\s*([A-Z_]+):/);
  return m ? m[1] : '';
}

/**
 * Helper بسيط: يلف action call ويُنفّذ trace تلقائياً.
 *
 *   const r = await traceAction(db, { actionType, actorId, entityId }, () =>
 *     orderActions.settleFromCompany(args)
 *   );
 */
export async function traceAction(db, meta, fn) {
  const trace = startActionTrace(meta);
  let result;
  try {
    result = await fn();
    await trace.finish(db, result);
    return result;
  } catch (e) {
    await trace.finish(db, { ok: false, errors: [e.message || String(e)] });
    throw e;
  }
}
