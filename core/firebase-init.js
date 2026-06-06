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
// ⚠️ هذا الـ config مكرر حالياً في 60+ ملف. الـ migration يهدف لتوحيدها.
// لا تنسخ هذا الـ config إلى مكان آخر — استورد من هنا.
//
// الـ API key على Firebase Web آمن للنشر (الـ Firestore rules تحكم الوصول)
// لكن التكرار = maintenance nightmare.
export const FB_CONFIG = {
  apiKey:            "AIzaSyDEK3I06IMrJPiYX09ULF7OIcbsMOsasUk",
  authDomain:        "business2card-c041b.firebaseapp.com",
  projectId:         "business2card-c041b",
  storageBucket:     "business2card-c041b.firebasestorage.app",
  messagingSenderId: "235622448899",
  appId:             "1:235622448899:web:d8652ff71082f7d003f336",
};

// ═══════════════════════════════════════
// SINGLETON EXPORTS
// ═══════════════════════════════════════
// الـ initializeApp safe-by-default: لو app اسمها '[DEFAULT]' موجود
// (مثلاً صفحة قديمة هيّأته بالفعل)، يُلتقَط ويُعاد بدلاً من رمي خطأ.

let _app;
try {
  _app = initializeApp(FB_CONFIG);
} catch (e) {
  // App already initialized by legacy page — استرجعه
  const { getApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
  _app = getApp();
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

console.log('[core/firebase-init] ✓ Firebase initialized via core (G2 compliant)');

// ── Phase 0 RUM: Web Vitals collector (fire-and-forget) ──
// تحميل غير معطِّل ومعزول تماماً: لا يؤثر على التهيئة، ويبتلع كل خطأ داخلياً.
// تعطيل لكل جهاز: localStorage.setItem('PERF_VITALS','0'). تعطيل عام: احذف هذا السطر.
try { import('./perf-vitals.js').catch(() => {}); } catch (_) {}
