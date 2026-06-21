/**
 * core/perf-vitals.js — Real-User Web Vitals collector (Phase 0 / RUM)
 *
 * يقيس تجربة السرعة الحقيقية للمستخدمين على كل صفحة، ويكتب عينة واحدة
 * لكل page-view في collection `perf_vitals` (append-only) — عشان نعرف
 * **فين** البطء الفعلي بالأرقام بدل التخمين.
 *
 * المقاييس:
 *   - TTFB  (Time To First Byte)        — استجابة السيرفر
 *   - FCP   (First Contentful Paint)     — أول رسم مرئي
 *   - LCP   (Largest Contentful Paint)   — أكبر عنصر مرئي (أهم مقياس تحميل)
 *   - CLS   (Cumulative Layout Shift)    — استقرار التخطيط
 *   - INP   (تقديري — أطول event/أول input) — استجابة التفاعل
 *
 * مبادئ الأمان (E1):
 *   • كل شيء ملفوف في try/catch — **مستحيل** يرمي خطأ داخل الصفحة.
 *   • كتابة واحدة فقط عند إخفاء الصفحة (hidden/pagehide) — لا ضغط متكرر.
 *   • يكتب فقط لو المستخدم مُسجَّل دخول (firestore.rules تتطلب auth).
 *   • opt-out فوري لأي جهاز: localStorage.setItem('PERF_VITALS','0').
 *   • التعطيل الكامل = حذف سطر الاستيراد في core/firebase-init.js (reversible).
 *
 * H1.1: ملف داخل core/ — مسموح له بالكتابة المباشرة (allowlist).
 */

import { db, auth } from './firebase-init.js';
import { collection, addDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// نسبة أخذ العينات — ERP داخلي بعدد مستخدمين محدود، فنجمع الكل (قابل للضبط).
const SAMPLE_RATE = 1.0;

function isEnabled() {
  try {
    if (localStorage.getItem('PERF_VITALS') === '0') return false; // opt-out يدوي
  } catch (_) { /* localStorage محجوب — كمّل */ }
  return Math.random() < SAMPLE_RATE;
}

(function initPerfVitals() {
  try {
    if (typeof window === 'undefined') return;
    if (typeof PerformanceObserver === 'undefined') return; // متصفح قديم — تجاهل بأمان
    if (!isEnabled()) return;

    const vitals = { lcp: null, cls: 0, inp: null, fcp: null, ttfb: null };
    let clsValue = 0;
    let maxEventDur = 0;
    const observers = [];

    function safeObserve(type, cb, extra) {
      try {
        const po = new PerformanceObserver(cb);
        po.observe(Object.assign({ type, buffered: true }, extra || {}));
        observers.push(po);
      } catch (_) { /* النوع غير مدعوم في هذا المتصفح — تجاهل */ }
    }

    // ── TTFB من Navigation Timing ──
    try {
      const nav0 = performance.getEntriesByType('navigation')[0];
      if (nav0) vitals.ttfb = Math.round(nav0.responseStart);
    } catch (_) {}

    // ── FCP ──
    safeObserve('paint', list => {
      for (const e of list.getEntries()) {
        if (e.name === 'first-contentful-paint') vitals.fcp = Math.round(e.startTime);
      }
    });

    // ── LCP (نحتفظ بأحدث قيمة) ──
    safeObserve('largest-contentful-paint', list => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) vitals.lcp = Math.round(last.startTime);
    });

    // ── CLS (تجميعي، باستثناء الإزاحات الناتجة عن تفاعل) ──
    safeObserve('layout-shift', list => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) clsValue += e.value;
      }
      vitals.cls = Math.round(clsValue * 1000) / 1000;
    });

    // ── INP تقديري: أطول مدة event ──
    safeObserve('event', list => {
      for (const e of list.getEntries()) {
        if (e.duration > maxEventDur) maxEventDur = e.duration;
      }
      vitals.inp = Math.round(maxEventDur);
    }, { durationThreshold: 40 });

    // ── fallback: First Input Delay لو مفيش events بعد ──
    safeObserve('first-input', list => {
      for (const e of list.getEntries()) {
        const fid = e.processingStart - e.startTime;
        if (vitals.inp == null) vitals.inp = Math.round(fid);
      }
    });

    let flushed = false;
    async function flush() {
      if (flushed) return;
      flushed = true;
      // التقاط أي سجلات معلّقة ثم فصل المراقبين.
      observers.forEach(o => {
        try { if (o.takeRecords) o.takeRecords(); o.disconnect(); } catch (_) {}
      });
      try {
        const user = auth && auth.currentUser;
        if (!user) return; // القواعد تتطلب auth — تجاهل الزيارات غير المُسجَّلة

        let conn = null;
        try {
          const c = navigator.connection;
          if (c) conn = {
            effectiveType: c.effectiveType || null,
            downlink: (typeof c.downlink === 'number') ? c.downlink : null,
            rtt: (typeof c.rtt === 'number') ? c.rtt : null,
            saveData: !!c.saveData,
          };
        } catch (_) {}

        let nav = null;
        try { nav = performance.getEntriesByType('navigation')[0] || null; } catch (_) {}

        const payload = {
          actorId: user.uid,
          route: (location.pathname.replace(/^\//, '') || 'index'),
          lcp: vitals.lcp,
          cls: vitals.cls,
          inp: vitals.inp,
          fcp: vitals.fcp,
          ttfb: vitals.ttfb,
          domInteractive: nav ? Math.round(nav.domInteractive) : null,
          loadComplete: nav ? Math.round(nav.loadEventEnd) : null,
          connection: conn,
          deviceMemory: (typeof navigator.deviceMemory === 'number') ? navigator.deviceMemory : null,
          viewport: { w: window.innerWidth || null, h: window.innerHeight || null },
          userAgent: navigator.userAgent,
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, 'perf_vitals'), payload);
      } catch (_) {
        // القياس لا يجوز أن يعطّل الصفحة أبداً — نبتلع كل خطأ.
      }
    }

    // الـ flush مرة واحدة عند تغييب/إغلاق الصفحة (أدق توقيت لـ LCP/CLS/INP).
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    }, { passive: true });
    addEventListener('pagehide', flush, { passive: true });
  } catch (_) {
    // أي فشل في الإعداد يُبتلَع — القياس اختياري بحت.
  }
})();
