// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Entity Tracker (Phase 6)
// ════════════════════════════════════════════════════════════════════
//
// يستمع لـ iframe loads ويستخرج الـ entity (لو موجود في URL params)
// ويـ record في runtime-memory للعرض في "الأخيرة".
//
// لا تعديل على god pages — يقرأ URL من iframe.contentWindow.location
// (same-origin permits) ويـ extracts الـ entity من query params.
//
// Recognized entity patterns:
//   order.html?id=X            → { domain:'production', type:'order',  id:X }
//   order-tracking.html?id=X   → { domain:'production', type:'tracking', id:X }
//   exec-cost-entry.html?id=X  → { domain:'production', type:'cost',   id:X }
//   waybill.html?id=X          → { domain:'shipping',   type:'waybill',id:X }
//   employee-profile.html?id=X → { domain:'admin',      type:'employee',id:X }
//
// API:
//   trackIframeLoad(domainId, iframe)  → call على iframe load event
// ════════════════════════════════════════════════════════════════════

import * as memory from './runtime-memory.js';

// Page → entity type/domain mapping
const PAGE_PATTERNS = [
  { match: /\border\.html(\?|$)/,            type: 'order',    domain: 'production', idParams: ['id'] },
  { match: /\border-tracking\.html(\?|$)/,   type: 'tracking', domain: 'production', idParams: ['id', 'orderId'] },
  { match: /\bexec-cost-entry\.html(\?|$)/,  type: 'cost',     domain: 'production', idParams: ['id', 'orderId'] },
  { match: /\bwaybill\.html(\?|$)/,          type: 'waybill',  domain: 'shipping',   idParams: ['id'] },
  { match: /\bemployee-profile\.html(\?|$)/, type: 'employee', domain: 'admin',      idParams: ['id', 'uid'] },
];

function _parseEntity(url) {
  if (!url) return null;
  for (const p of PAGE_PATTERNS) {
    if (!p.match.test(url)) continue;
    try {
      const u = new URL(url, location.origin);
      for (const key of p.idParams) {
        const id = u.searchParams.get(key);
        if (id) {
          return { type: p.type, domain: p.domain, id };
        }
      }
    } catch (_) {}
  }
  return null;
}

function _extractTitle(iframe, fallback) {
  try {
    const t = iframe?.contentDocument?.title || '';
    if (!t) return fallback;
    // strip "— Business2Card" suffix
    return t.replace(/\s*—\s*Business2Card\s*$/i, '').trim() || fallback;
  } catch (_) {
    return fallback;
  }
}

export function trackIframeLoad(domainId, iframe) {
  if (!iframe) return;
  try {
    let url = '';
    try { url = iframe.contentWindow?.location?.href || iframe.src; }
    catch (_) { url = iframe.src; }
    const entity = _parseEntity(url);
    if (!entity) return;
    // الـ domain من الـ entity pattern (مش الـ active domain) — لأن
    // order.html ممكن يفتح من shipping أو production
    const recordDomain = entity.domain || domainId;
    const label = _extractTitle(iframe, entity.type + ' · ' + entity.id);
    memory.recordRecent(recordDomain, {
      id: entity.id,
      label,
      url,
      type: entity.type,
    });
  } catch (e) {
    console.warn('[entity-tracker] error', e);
  }
}
