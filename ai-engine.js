/**
 * AI Engine — Unified Gemini caller for the whole app.
 *
 * Single source of truth for: API key, model selection, REST calls,
 * fallback logic, and Arabic error messages.
 *
 * M9 update — Cloud Function proxy:
 *   - يحاول استدعاء callGeminiProxy Cloud Function أولاً
 *     (المفتاح في Firebase Secrets — لا يُكشف للمتصفح)
 *   - لو الـ secret غير مضبوط (failed-precondition) → fallback للمفتاح المحلي
 *   - لو فشل الـ Function لأي سبب آخر → fallback أيضاً
 *
 * Usage:
 *   import { askAI, getKey, setKey } from './ai-engine.js';
 *   const reply = await askAI('سؤالك هنا', { temperature: 0.5 });
 */

const FALLBACK_MODEL = 'gemini-flash-latest';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// M9: proxy state — تُضبَط ديناميكياً (avoid network on every call)
let __proxyAvailable = null;   // true = use proxy, false = unavailable, null = unchecked
let __proxyCallableRef = null; // cached httpsCallable reference

// Sentinel error message — callers can detect and show key-entry UI.
export const KEY_NEEDED = '__AI_KEY_NEEDED__';

export const MODELS = [
  { id: 'gemini-flash-latest', label: 'Flash Latest', hint: 'موصى به', tone: 'g' },
  { id: 'gemini-2.5-flash',    label: '2.5 Flash',    hint: '',         tone: '' },
  { id: 'gemini-2.5-pro',      label: '2.5 Pro',      hint: 'تحليل عميق', tone: 'y' },
];

// ── Key + Model storage (localStorage, browser only) ──
export function getKey()   { return localStorage.getItem('gemini_key') || ''; }
export function setKey(k)  { localStorage.setItem('gemini_key', k.trim()); }
export function clearKey() { localStorage.removeItem('gemini_key'); }
export function hasKey()   { return !!getKey(); }

export function getModel() { return localStorage.getItem('gemini_model') || FALLBACK_MODEL; }
export function setModel(m){ localStorage.setItem('gemini_model', m); }

/**
 * Send a prompt to Gemini and get back text.
 *
 * @param {string} prompt
 * @param {object} [options]
 * @param {string} [options.model]        — override saved model
 * @param {number} [options.temperature]  — default 0.7
 * @param {number} [options.maxTokens]    — default 2048
 * @returns {Promise<string>}
 * @throws {Error} with message=KEY_NEEDED if no key, or friendly Arabic error otherwise
 */
/**
 * M9: Try Cloud Function proxy first. Returns null if proxy unavailable
 * (key not set in Firebase Secrets OR previous call failed with that reason).
 */
async function tryProxy(prompt, model, options) {
  if (__proxyAvailable === false) return null;
  try {
    // Lazy-load httpsCallable (avoid coupling to firebase imports in pages
    // that don't have functions SDK)
    if (!__proxyCallableRef) {
      const fnMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js');
      const appMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const app = appMod.getApp();
      const functions = fnMod.getFunctions(app, 'us-central1');
      __proxyCallableRef = fnMod.httpsCallable(functions, 'callGeminiProxy');
    }
    const result = await __proxyCallableRef({
      prompt, model,
      temperature: options.temperature,
      maxTokens:   options.maxTokens,
    });
    __proxyAvailable = true;
    return result.data?.text || '';
  } catch (e) {
    const msg = (e?.message || '').toLowerCase();
    const code = e?.code || '';
    // failed-precondition → secret not set on backend → fallback to localStorage
    // unauthenticated → user not logged in → fallback (let Firebase handle login)
    if (code === 'functions/failed-precondition' || msg.includes('غير مضبوط') ||
        code === 'functions/unauthenticated') {
      __proxyAvailable = false;
      console.log('[ai-engine] proxy unavailable — using localStorage key');
      return null;
    }
    // إذا كان خطأ كلاسيكي (network/timeout) — لا نخزن false، نعيد المحاولة عند الـ call التالي
    if (msg.includes('network') || code === 'functions/deadline-exceeded') {
      console.warn('[ai-engine] proxy transient error — falling back this call');
      return null;
    }
    // أخطاء أخرى من Gemini نفسه عبر الـ proxy — نُعيد رمي الخطأ
    throw e;
  }
}

export async function askAI(prompt, options = {}) {
  const model = options.model || getModel();

  // M9: محاولة proxy أولاً (إذا كان متاحاً)
  const proxyResult = await tryProxy(prompt, model, options);
  if (proxyResult !== null) return proxyResult;

  // Fallback: المفتاح المحلي
  const key = getKey();
  if (!key) {
    const err = new Error(KEY_NEEDED);
    err.code = KEY_NEEDED;
    throw err;
  }
  try {
    return await callModel(key, model, prompt, options);
  } catch (e) {
    // Auto-fallback for common transient model issues
    if (model !== FALLBACK_MODEL && [404, 429, 503].includes(e.httpStatus)) {
      try { return await callModel(key, FALLBACK_MODEL, prompt, options); }
      catch { throw e; }
    }
    throw e;
  }
}

async function callModel(key, model, prompt, options) {
  const url = `${ENDPOINT}/${model}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature:     options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens   ?? 2048,
      },
    }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    const apiMsg = data?.error?.message || r.statusText;
    const err = new Error(friendlyError(r.status, apiMsg, model));
    err.httpStatus = r.status;
    err.apiMsg = apiMsg;
    throw err;
  }
  const data = await r.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'لا توجد نتيجة';
}

export function friendlyError(status, apiMsg, model) {
  const raw = `\n\n<span style="font-size:var(--fs-sm);color:#5c6878;direction:ltr;display:block">[HTTP ${status}] ${apiMsg}</span>`;
  const newKeyLink = `<a href="https://aistudio.google.com/apikey" target="_blank" style="color:#4f8ef7;font-weight:700">→ مفتاح جديد من AI Studio</a>`;
  if (status === 400 && /API_KEY|invalid/i.test(apiMsg))
    return `🔑 المفتاح غير صحيح — تأكد من نسخه كاملاً.<br>${newKeyLink}${raw}`;
  if (status === 403)
    return `🚫 المفتاح مرفوض — تأكد أن Generative Language API مفعّل، أو أنشئ مفتاحاً جديداً:<br>${newKeyLink}${raw}`;
  if (status === 429 && /prepay|credit|billing|depleted|exhausted/i.test(apiMsg))
    return `💳 <strong>رصيد المفتاح نفد.</strong> أضف رصيد من <a href="https://aistudio.google.com/billing" target="_blank" style="color:#4f8ef7;font-weight:700">صفحة الفوترة</a> أو أنشئ مفتاحاً جديداً.${raw}`;
  if (status === 429)
    return `⏱️ تجاوزت الحد المسموح للموديل (${model}) — انتظر دقيقة أو اختر موديل مختلف.${raw}`;
  if (status === 503 || status === 500)
    return `🔧 خطأ مؤقت في خادم Google — حاول مرة أخرى بعد 30 ثانية.${raw}`;
  if (status === 404)
    return `🤖 الموديل ${model} غير موجود — جرّب موديل آخر.${raw}`;
  return `حدث خطأ أثناء الاتصال بـ Gemini${raw}`;
}
