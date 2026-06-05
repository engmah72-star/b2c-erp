// core/feature-flags.js
// Lightweight, opt-in feature flag system.
//
// Resolution order (highest priority first):
//   1. URL param        ?feat.<name>=1  (or =0)
//   2. localStorage     feat.<name>     ('1' / '0')
//   3. Default          (passed by caller, usually false)
//
// Used to gate Phase-2+ UX evolution per RULE E1.8 — every new feature
// ships behind a flag with default false; rollout is gradual and revertible.
//
// Example:
//   import { isFeatureEnabled, setFeatureFlag } from './core/feature-flags.js';
//   if (isFeatureEnabled('clients.smartActions')) { ... }

const PREFIX = 'feat.';

// ── Known flags (documentation + single source for names) ────────────────────
// أسماء الأعلام المعروفة تُجمَّع هنا لتفادي الـ magic strings (C2) وتوثيق النوايا.
//
// `messaging.memberToMember` — محادثة عضو↔عضو (عميل↔عميل) من على الكارت الشخصي.
//   استثناء دستوري محدود النطاق: الـ BUSINESS DNA «نظام ERP داخلي، ليس Marketplace».
//   لذلك الافتراضي OFF (الوضع الدستوري الآمن)؛ تفعيله = موافقة صريحة على نطاق محدود
//   ومراقَب (rollout تدريجي قابل للتراجع — E1). راجع
//   docs/CONSTITUTIONAL_EXCEPTION_MEMBER_MESSAGING.md.
export const FLAGS = Object.freeze({
  MESSAGING_MEMBER_TO_MEMBER: 'messaging.memberToMember',
});

let __urlCache = null;
function readUrlFlags() {
  if (__urlCache) return __urlCache;
  __urlCache = new Map();
  try {
    const qs = new URLSearchParams(window.location.search);
    qs.forEach((v, k) => {
      if (k.startsWith(PREFIX)) __urlCache.set(k.slice(PREFIX.length), v);
    });
  } catch (_) { /* SSR/test envs */ }
  return __urlCache;
}

export function isFeatureEnabled(name, defaultValue = false) {
  if (!name || typeof name !== 'string') return defaultValue;
  const url = readUrlFlags().get(name);
  if (url === '1' || url === 'true') return true;
  if (url === '0' || url === 'false') return false;
  try {
    const ls = window.localStorage.getItem(PREFIX + name);
    if (ls === '1' || ls === 'true') return true;
    if (ls === '0' || ls === 'false') return false;
  } catch (_) { /* private mode */ }
  return defaultValue;
}

export function setFeatureFlag(name, enabled) {
  if (!name) return;
  try {
    window.localStorage.setItem(PREFIX + name, enabled ? '1' : '0');
  } catch (_) { /* private mode */ }
}

export function clearFeatureFlag(name) {
  if (!name) return;
  try { window.localStorage.removeItem(PREFIX + name); } catch (_) {}
}

export function listFeatureFlags() {
  const out = {};
  try {
    const keys = Object.keys(window.localStorage);
    for (const k of keys) {
      if (k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = window.localStorage.getItem(k);
    }
  } catch (_) {}
  return out;
}

// Make available globally for inline event handlers + console debugging.
try {
  window.__featureFlags = { isFeatureEnabled, setFeatureFlag, clearFeatureFlag, listFeatureFlags };
} catch (_) {}
