/**
 * core/prefetch-map.js — خريطة التحميل المسبق عند التنقل
 *
 * عند الانتقال من صفحة لأخرى عبر navigatePage()، يتم تحميل
 * الـ collections المتوقعة للصفحة التالية في الكاش قبل التحميل.
 * النتيجة: الصفحة تفتح ببيانات جاهزة من L1/L2 بدلاً من انتظار Firestore.
 */

import { prefetch, cachedQuery } from './data-cache.js';
import { warmImages, extractOrderImageUrls, extractClientImageUrls } from './image-cache.js';

const PAGE_COLLECTIONS = {
  'shipping.html': [
    () => cachedQuery('orders').where('stage', '==', 'shipping').orderBy('createdAt', 'desc').limit(500),
    () => cachedQuery('orders').where('stage', '==', 'production').limit(300),
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
    () => cachedQuery('shippers_v2').limit(200),
    () => cachedQuery('shipping_settlements').orderBy('createdAt', 'desc').limit(500),
  ],
  'production.html': [
    () => cachedQuery('orders').where('stage', 'in', ['production', 'shipping']).orderBy('createdAt', 'desc').limit(1000),
    () => cachedQuery('products_v2').orderBy('name', 'asc').limit(500),
    () => cachedQuery('suppliers_v2').limit(500),
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
    () => cachedQuery('shippers_v2').limit(200),
  ],
  'print.html': [
    () => cachedQuery('orders').where('stage', '==', 'printing').orderBy('createdAt', 'desc').limit(500),
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
    () => cachedQuery('shippers_v2').limit(200),
    () => cachedQuery('products_v2').orderBy('name', 'asc').limit(500),
    () => cachedQuery('suppliers_v2').limit(500),
  ],
  'design.html': [
    () => cachedQuery('orders').where('stage', '==', 'design').orderBy('createdAt', 'desc').limit(500),
    () => cachedQuery('clients').orderBy('createdAt', 'desc').limit(200),
    () => cachedQuery('products_v2').orderBy('name', 'asc').limit(500),
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
  ],
  'clients.html': [
    () => cachedQuery('clients').orderBy('createdAt', 'desc').limit(1500),
    () => cachedQuery('orders').orderBy('createdAt', 'desc').limit(1500),
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
    () => cachedQuery('products_v2').orderBy('name', 'asc').limit(500),
  ],
  'accounts.html': [
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
    () => cachedQuery('orders').orderBy('createdAt', 'desc').limit(500),
    () => cachedQuery('suppliers_v2').limit(500),
  ],
  'returns.html': [
    () => cachedQuery('returns_tickets').orderBy('createdAt', 'desc').limit(500),
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
  ],
  'suppliers.html': [
    () => cachedQuery('suppliers_v2').limit(500),
    () => cachedQuery('shippers_v2').limit(200),
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
  ],
  'approvals.html': [
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
    () => cachedQuery('orders').orderBy('createdAt', 'desc').limit(500),
    () => cachedQuery('suppliers_v2').limit(500),
  ],
  'order-rail.html': [
    () => cachedQuery('orders').orderBy('createdAt', 'desc').limit(500),
    () => cachedQuery('clients').orderBy('createdAt', 'desc').limit(200),
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
  ],
  'employees.html': [
    () => cachedQuery('employees').limit(200),
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
  ],
  'exec-workspace.html': [
    () => cachedQuery('orders').where('stage', '==', 'production').orderBy('createdAt', 'desc').limit(500),
    () => cachedQuery('suppliers_v2').limit(500),
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
  ],
  'inbox.html': [
    () => cachedQuery('conversations').orderBy('updatedAt', 'desc').limit(100),
  ],
  'reports.html': [
    () => cachedQuery('orders').orderBy('createdAt', 'desc').limit(1500),
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
  ],
  'settings.html': [
    () => cachedQuery('wallets').orderBy('name', 'asc').limit(100),
  ],
  'employee-profile.html': [
    () => cachedQuery('employees').limit(200),
  ],
};

export function prefetchForPage(url) {
  if (!url) return;
  const file = url.split('?')[0].split('/').pop();
  const builders = PAGE_COLLECTIONS[file];
  if (!builders) return;

  for (const buildFn of builders) {
    try {
      const spec = buildFn().build();
      prefetch(spec.collection, spec.descriptors, spec.firestoreConstraints).catch(() => {});
    } catch (_) {}
  }
}

export function prefetchImagesFromDocs(docs) {
  if (!docs?.length || typeof window === 'undefined') return;
  const orderUrls = extractOrderImageUrls(docs);
  const clientUrls = extractClientImageUrls(docs);
  const all = [...new Set([...orderUrls, ...clientUrls])];
  if (all.length) warmImages(all);
}

// تسجيل الـ hook العالمي — shell-navigate.js يستدعيه عند التنقل
if (typeof window !== 'undefined') {
  window.__prefetchForPage = prefetchForPage;
  window.__prefetchImagesFromDocs = prefetchImagesFromDocs;
}
