/**
 * core/env-config.js — منطق اختيار بيئة التشغيل (prod / test)
 *
 * Pure functions بلا side-effects ولا globals — قابلة للاختبار بالكامل.
 * الطبقة المُشغّلة (الوصول لـ location/localStorage/DOM) في core/firebase-init.js.
 *
 * E1: عزل بيانات التجارب — feature-flagged · fail-closed · reversible.
 */

export const ENV_KEY = 'b2c_env';

/**
 * يقرّر البيئة الفعّالة. الإنتاج هو الافتراضي الصارم.
 * @param {string|null} urlEnv    قيمة ?env= من الرابط (إن وُجدت)
 * @param {string|null} storedEnv القيمة المحفوظة في localStorage (إن وُجدت)
 * @returns {'test'|'prod'}
 */
export function resolveEnv(urlEnv, storedEnv) {
  if (urlEnv === 'test' || urlEnv === 'prod') return urlEnv;   // الرابط يفوز ويُحفظ
  if (storedEnv === 'test') return 'test';                      // ثم المحفوظ
  return 'prod';                                                // الافتراضي الصارم
}

/**
 * هل config التجارب غير مُعدّ فعلياً؟ (placeholder، أو فارغ، أو يطابق الإنتاج
 * = ليس عزلاً). يُستخدم لتفعيل الحجب fail-closed.
 * @param {object|null} cfg            FB_CONFIG_TEST
 * @param {string}      prodProjectId  projectId الإنتاج (للكشف عن التطابق)
 * @returns {boolean}
 */
export function testConfigUnset(cfg, prodProjectId) {
  return !cfg
    || !cfg.projectId
    || cfg.projectId.startsWith('REPLACE_WITH')
    || cfg.projectId === prodProjectId;
}

/**
 * يختار config المناسب للبيئة.
 * @param {'test'|'prod'} env
 * @param {object} prodCfg
 * @param {object} testCfg
 * @returns {object}
 */
export function pickConfig(env, prodCfg, testCfg) {
  return env === 'test' ? testCfg : prodCfg;
}
