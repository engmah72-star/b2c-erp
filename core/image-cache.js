/**
 * core/image-cache.js — تسخين كاش الصور عبر Service Worker
 *
 * الاستخدام:
 *   import { warmImages, extractOrderImageUrls } from './core/image-cache.js';
 *   warmImages(extractOrderImageUrls(orders));
 */

const IMAGE_FIELDS = [
  'designImageUrl', 'printFinalUrl', 'mockupUrl', 'designFileUrl',
  'imageUrl', 'logoUrl', 'coverUrl', 'avatarUrl', 'finalImageUrl',
];

const IMAGE_ARRAY_FIELDS = ['designImages', 'designFiles', 'images'];

function _extractUrls(docs, maxUrls) {
  const urls = new Set();
  for (const doc of docs) {
    if (urls.size >= maxUrls) break;
    for (const f of IMAGE_FIELDS) {
      const v = doc[f];
      if (v && typeof v === 'string' && v.startsWith('http')) urls.add(v);
    }
    for (const f of IMAGE_ARRAY_FIELDS) {
      const arr = doc[f];
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (urls.size >= maxUrls) break;
        const u = typeof item === 'string' ? item : item?.url;
        if (u && typeof u === 'string' && u.startsWith('http')) urls.add(u);
      }
    }
  }
  return [...urls];
}

export function extractOrderImageUrls(orders, maxUrls = 30) {
  const urls = new Set();
  for (const o of orders) {
    if (urls.size >= maxUrls) break;
    for (const f of IMAGE_FIELDS) {
      const v = o[f];
      if (v && typeof v === 'string' && v.startsWith('http')) urls.add(v);
    }
    for (const p of (o.products || [])) {
      if (urls.size >= maxUrls) break;
      if (p.designImageUrl) urls.add(p.designImageUrl);
      if (p.imageUrl) urls.add(p.imageUrl);
      if (Array.isArray(p.designImages)) {
        for (const u of p.designImages) {
          if (urls.size >= maxUrls) break;
          if (u && typeof u === 'string' && u.startsWith('http')) urls.add(u);
        }
      }
    }
  }
  return [...urls];
}

export function extractClientImageUrls(clients, maxUrls = 20) {
  return _extractUrls(clients, maxUrls);
}

export function warmImages(urls) {
  if (!urls?.length || !navigator.serviceWorker?.controller) return;
  const valid = urls.filter(u => u && typeof u === 'string');
  if (!valid.length) return;
  navigator.serviceWorker.controller.postMessage({
    type: 'WARM_IMAGES',
    urls: valid.slice(0, 50),
  });
}

export function purgeImageCache() {
  if (!navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage('PURGE_IMAGE_CACHE');
}
