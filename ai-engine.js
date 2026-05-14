/**
 * AI Engine — Unified Gemini caller for the whole app.
 *
 * Single source of truth for: API key, model selection, REST calls,
 * fallback logic, and Arabic error messages.
 *
 * Usage:
 *   import { askAI, getKey, setKey } from './ai-engine.js';
 *   const reply = await askAI('سؤالك هنا', { temperature: 0.5 });
 */

const FALLBACK_MODEL = 'gemini-flash-latest';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

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
export async function askAI(prompt, options = {}) {
  const key = getKey();
  if (!key) {
    const err = new Error(KEY_NEEDED);
    err.code = KEY_NEEDED;
    throw err;
  }
  const model = options.model || getModel();
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
  const raw = `\n\n<span style="font-size:11px;color:#5c6878;direction:ltr;display:block">[HTTP ${status}] ${apiMsg}</span>`;
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
