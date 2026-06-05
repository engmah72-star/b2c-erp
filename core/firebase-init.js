/**
 * core/firebase-init.js — المصدر الوحيد لـ Firebase initialization
 *
 * RULE G2: لا يُكرَّر FB_CONFIG في أي ملف آخر.
 * كل ملف جديد يستورد من هنا:
 *   import { app, db, auth, storage } from './core/firebase-init.js';
 *
 * الصفحات القديمة (60+ ملف) تستمر بتعريف FB_CONFIG محلياً مؤقتاً —
 * Migration تدريجي على مدى 3 أشهر (REGRESSION_PREVENTION.md §6.2).
 *
 * هذا الملف Stable Core (RULE G1) — يحتاج 2-reviewer approval لأي تعديل.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, initializeFirestore,
  persistentLocalCache, persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ═══════════════════════════════════════
// FIREBASE CONFIG — المصدر الوحيد
// ═══════════════════════════════════════
// ⚠️ هذا الـ config مكرر حالياً في عدة ملفات legacy. الـ migration يهدف لتوحيدها.
// لا تنسخ هذا الـ config إلى مكان آخر — استورد من هنا.
//
// الـ API key على Firebase Web آمن للنشر (الـ Firestore rules تحكم الوصول)
// لكن التكرار = maintenance nightmare.
export const FB_CONFIG_PROD = {
  apiKey:            "AIzaSyDEK3I06IMrJPiYX09ULF7OIcbsMOsasUk",
  authDomain:        "business2card-c041b.firebaseapp.com",
  projectId:         "business2card-c041b",
  storageBucket:     "business2card-c041b.firebasestorage.app",
  messagingSenderId: "235622448899",
  appId:             "1:235622448899:web:d8652ff71082f7d003f336",
};

// ═══════════════════════════════════════
// TEST ENVIRONMENT — عزل بيانات التجارب (E1: feature-flagged + reversible)
// ═══════════════════════════════════════
// مشروع Firebase تجريبي منفصل تماماً عن الإنتاج. التجربة عليه لا تلمس بيانات
// الإنتاج (orders / wallets / financial_ledger / transactions_v2 ...) نهائياً.
//
// ▸ كيف تدخل بيئة التجارب؟
//     - أضِف ?env=test على أي صفحة  (يُحفظ في localStorage ويبقى أثناء التنقّل)
//     - أو من الـ console:  b2cSwitchEnv('test')
//   وللخروج:  ?env=prod  أو  b2cSwitchEnv('prod')  أو اضغط الشريط الأحمر بالأعلى.
//
// ▸ الإعداد لمرة واحدة (راجع docs/testing-environment.md):
//     1) أنشئ مشروع Firebase ثانٍ (مثلاً business2card-test).
//     2) فعّل Auth + Firestore + Storage بنفس إعدادات الإنتاج.
//     3) انشر نفس القواعد:  firebase deploy --only firestore:rules,storage --project test
//     4) املأ FB_CONFIG_TEST بالأسفل من إعدادات المشروع التجريبي.
//
// ▸ Fail-closed: طالما FB_CONFIG_TEST لسه placeholder (أو نفس projectId الإنتاج)
//   فالدخول لبيئة التجارب يُحجَب بالكامل — النظام لا يكتب على الإنتاج بالخطأ.
export const FB_CONFIG_TEST = {
  apiKey:            "REPLACE_WITH_TEST_API_KEY",
  authDomain:        "REPLACE_WITH_TEST_PROJECT.firebaseapp.com",
  projectId:         "REPLACE_WITH_TEST_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_TEST_PROJECT.firebasestorage.app",
  messagingSenderId: "REPLACE_WITH_TEST_SENDER_ID",
  appId:             "REPLACE_WITH_TEST_APP_ID",
};

const ENV_KEY = 'b2c_env';

// يقرأ البيئة المطلوبة: ?env=... (يُحفظ) > localStorage > 'prod' (افتراضي صارم).
function resolveEnv() {
  try {
    const q = new URL(location.href).searchParams.get('env');
    if (q === 'test' || q === 'prod') {
      try { localStorage.setItem(ENV_KEY, q); } catch (_) {}
      return q;
    }
  } catch (_) {}
  try {
    if (localStorage.getItem(ENV_KEY) === 'test') return 'test';
  } catch (_) {}
  return 'prod';
}

// هل config التجارب لسه غير مُفعّل (placeholder أو يطابق الإنتاج = ليس عزلاً)؟
function testConfigUnset(cfg) {
  return !cfg
    || !cfg.projectId
    || cfg.projectId.startsWith('REPLACE_WITH')
    || cfg.projectId === FB_CONFIG_PROD.projectId;
}

export const APP_ENV = resolveEnv();

// لو طُلبت بيئة التجارب وهي غير مُعدّة → احجب تماماً (fail-closed) بدل الكتابة على الإنتاج.
if (APP_ENV === 'test' && testConfigUnset(FB_CONFIG_TEST)) {
  blockUnconfiguredTestEnv();
}

export const IS_TEST_ENV = APP_ENV === 'test';
export const FB_CONFIG = IS_TEST_ENV ? FB_CONFIG_TEST : FB_CONFIG_PROD;

// تبديل البيئة (يعيد التحميل لإعادة التهيئة على المشروع الصحيح).
export function switchEnv(env) {
  if (env !== 'test' && env !== 'prod') return;
  try { localStorage.setItem(ENV_KEY, env); } catch (_) {}
  try {
    const url = new URL(location.href);
    url.searchParams.delete('env');
    location.href = url.toString();
  } catch (_) { location.reload(); }
}
if (typeof window !== 'undefined') window.b2cSwitchEnv = switchEnv;

// ═══════════════════════════════════════
// SINGLETON EXPORTS
// ═══════════════════════════════════════
// الـ initializeApp safe-by-default: لو app بنفس الاسم موجود (مثلاً صفحة قديمة
// هيّأته بالفعل)، يُلتقَط ويُعاد بدلاً من رمي خطأ.
//
// بيئة التجارب تستخدم اسم تطبيق منفصل ('b2c-test') حتى لا تلتقط بالخطأ تطبيق
// الإنتاج الافتراضي الذي قد تكون هيّأته صفحة legacy قبلنا — ضمان عزل صارم.
const APP_NAME = IS_TEST_ENV ? 'b2c-test' : undefined;

let _app;
try {
  _app = APP_NAME ? initializeApp(FB_CONFIG, APP_NAME) : initializeApp(FB_CONFIG);
} catch (e) {
  // App already initialized — استرجعه بنفس الاسم (لا fallback عبر البيئات).
  const { getApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
  _app = APP_NAME ? getApp(APP_NAME) : getApp();
}
export const app = _app;

export const auth = getAuth(app);
export const storage = getStorage(app);

// Firestore مع persistent cache (IndexedDB) — يضمن الزيارة الثانية من cache.
let _db;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn('[core/firebase-init] persistent cache unavailable, fallback to default:', e?.message);
  _db = getFirestore(app);
}
export const db = _db;

// شريط تحذير دائم أحمر في بيئة التجارب — حتى لا تختلط البيئتان أبداً.
if (IS_TEST_ENV) injectTestEnvBanner();

console.log(`[core/firebase-init] ✓ Firebase initialized via core (G2 compliant) — ENV=${APP_ENV} project=${FB_CONFIG.projectId}`);

// ═══════════════════════════════════════
// UI helpers لبيئة التجارب
// ═══════════════════════════════════════
function injectTestEnvBanner() {
  if (typeof document === 'undefined') return;
  const add = () => {
    if (!document.body || document.getElementById('b2c-test-env-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'b2c-test-env-banner';
    bar.textContent = '🧪 بيئة تجريبية — TEST ENVIRONMENT — البيانات معزولة عن الإنتاج (اضغط للخروج)';
    bar.title = 'الخروج إلى بيئة الإنتاج';
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'background:#b91c1c', 'color:#fff', 'font:600 13px/1.6 system-ui,sans-serif',
      'text-align:center', 'padding:4px 8px', 'cursor:pointer',
      'box-shadow:0 1px 6px rgba(0,0,0,.3)', 'letter-spacing:.2px',
    ].join(';');
    bar.addEventListener('click', () => switchEnv('prod'));
    document.body.appendChild(bar);
  };
  if (document.body) add();
  else document.addEventListener('DOMContentLoaded', add);
}

// fail-closed: بيئة التجارب مطلوبة لكن غير مُعدّة → نعرض شاشة حجب ونوقف التهيئة
// كي لا تُكتب أي بيانات على الإنتاج بالخطأ.
function blockUnconfiguredTestEnv() {
  const msg = 'بيئة التجارب (TEST) مطلوبة لكنها غير مُعدّة بعد.\n\n'
    + 'املأ FB_CONFIG_TEST في core/firebase-init.js بإعدادات مشروع Firebase التجريبي '
    + '(راجع docs/testing-environment.md)، أو ارجع لبيئة الإنتاج.';
  try {
    if (typeof document !== 'undefined') {
      const show = () => {
        if (!document.body) return;
        document.body.innerHTML = '';
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0b1220;color:#e5e7eb;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;font:15px/1.8 system-ui,sans-serif;text-align:center';
        box.innerHTML = '<div style="font-size:44px">🧪⛔</div>'
          + '<div style="font-weight:700;font-size:18px">بيئة التجارب غير مُعدّة</div>'
          + '<div style="max-width:520px;white-space:pre-line;opacity:.9">' + msg + '</div>';
        const btn = document.createElement('button');
        btn.textContent = '⟵ العودة إلى الإنتاج';
        btn.style.cssText = 'background:#2563eb;color:#fff;border:0;border-radius:8px;padding:10px 18px;font:600 14px system-ui;cursor:pointer';
        btn.addEventListener('click', () => switchEnv('prod'));
        box.appendChild(btn);
        document.body.appendChild(box);
      };
      if (document.body) show();
      else document.addEventListener('DOMContentLoaded', show);
    }
  } catch (_) {}
  throw new Error('[core/firebase-init] TEST environment requested but FB_CONFIG_TEST is unconfigured (fail-closed). See docs/testing-environment.md');
}
