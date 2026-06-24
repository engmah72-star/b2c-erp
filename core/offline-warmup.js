/**
 * core/offline-warmup.js — تسخين البيانات في الخلفية لتجربة offline كاملة
 *
 * عند فتح أي صفحة (بعد auth)، يتم تحميل بيانات كل الصفحات المرتبطة بالدور
 * في IndexedDB في الخلفية. النتيجة: المستخدم يفتح أي صفحة offline ويلاقي البيانات.
 *
 * يعمل مرة واحدة لكل جلسة (session) — لا يكرر التحميل.
 */

import { prefetch, cachedQuery } from './data-cache.js';

const ROLE_WARMUP = {
  admin: [
    'accounts.html', 'clients.html', 'orders', 'design.html',
    'shipping.html', 'production.html', 'reports.html', 'employees.html',
    'approvals.html', 'suppliers.html', 'returns.html',
  ],
  operation_manager: [
    'clients.html', 'orders', 'design.html', 'shipping.html',
    'production.html', 'reports.html', 'employees.html', 'approvals.html',
  ],
  customer_service: [
    'clients.html', 'orders', 'design.html', 'approvals.html',
  ],
  graphic_designer: [
    'design.html', 'orders',
  ],
  design_operator: [
    'design.html', 'orders',
  ],
  production_agent: [
    'production.html', 'orders', 'suppliers.html',
  ],
  shipping_officer: [
    'shipping.html', 'orders', 'shipping-accounts',
  ],
  wallet_manager: [
    'accounts.html', 'orders', 'suppliers.html', 'reports.html',
  ],
};

const COLLECTION_SPECS = {
  'clients.html': [
    () => cachedQuery('clients').orderBy('createdAt', 'desc').limit(1000),
  ],
  orders: [
    () => cachedQuery('orders').orderBy('createdAt', 'desc').limit(1500),
  ],
  'design.html': [
    () => cachedQuery('products_v2').limit(500),
  ],
  'shipping.html': [
    () => cachedQuery('shippers_v2').limit(200),
    () => cachedQuery('shipping_settlements').orderBy('createdAt', 'desc').limit(500),
  ],
  'production.html': [
    () => cachedQuery('suppliers_v2').limit(500),
  ],
  'accounts.html': [
    () => cachedQuery('wallets').limit(100),
  ],
  'reports.html': [
    () => cachedQuery('transactions_v2').orderBy('createdAt', 'desc').limit(1500),
  ],
  'employees.html': [
    () => cachedQuery('employees').limit(500),
  ],
  'approvals.html': [],
  'suppliers.html': [
    () => cachedQuery('suppliers_v2').limit(500),
  ],
  'returns.html': [
    () => cachedQuery('returns_tickets').orderBy('createdAt', 'desc').limit(500),
  ],
  'shipping-accounts': [
    () => cachedQuery('shipping_settlements').orderBy('createdAt', 'desc').limit(500),
  ],
};

let _warmedThisSession = false;

export function warmupForRole(role) {
  if (_warmedThisSession) return;
  if (!role || !ROLE_WARMUP[role]) return;
  _warmedThisSession = true;

  const pages = ROLE_WARMUP[role];
  const seen = new Set();

  requestIdleCallback(() => {
    for (const page of pages) {
      const specs = COLLECTION_SPECS[page];
      if (!specs) continue;
      for (const buildFn of specs) {
        try {
          const spec = buildFn().build();
          const key = spec.collection;
          if (seen.has(key)) continue;
          seen.add(key);
          prefetch(spec.collection, spec.descriptors, spec.firestoreConstraints).catch(() => {});
        } catch (_) {}
      }
    }
  }, { timeout: 5000 });
}

if (typeof window !== 'undefined') {
  window.__warmupForRole = warmupForRole;
}
