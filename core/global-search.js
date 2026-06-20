// ════════════════════════════════════════════════════════════════════
// core/global-search.js — Cross-Stage Order Search
// ════════════════════════════════════════════════════════════════════
// Provides a global search that queries orders across ALL stages.
// Returns results with stage info so the user can navigate directly.
//
// Used by app-sidebar.js to power the sidebar order search.
// All Firestore queries use limit() per G3.
// ════════════════════════════════════════════════════════════════════
import { db } from './firebase-init.js';
import { collection, query, where, getDocs, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const STAGE_PAGES = {
  design:     'design.html',
  printing:   'print.html',
  production: 'production.html',
  shipping:   'shipping.html',
  archived:   'archive.html',
  cancelled:  'archive.html',
};

const STAGE_LABELS = {
  design:     'تصميم',
  printing:   'طباعة',
  production: 'تنفيذ',
  shipping:   'شحن',
  archived:   'أرشيف',
  cancelled:  'ملغي',
};

const STAGE_ICONS = {
  design:     '✏️',   // ✏️
  printing:   '🖨️', // 🖨️
  production: '🏭',  // 🏭
  shipping:   '🚚',  // 🚚
  archived:   '📁',  // 📁
  cancelled:  '❌',        // ❌
};

/**
 * Search orders by orderId, orderNumber, or clientPhone.
 * Returns up to 10 results across all stages.
 *
 * @param {string} searchTerm - The search term (min 2 chars)
 * @returns {Promise<Array<{id,orderId,clientName,stage,stageLabel,stageIcon,page,url,salePrice,createdDate}>>}
 */
export async function searchOrders(searchTerm) {
  if (!searchTerm || searchTerm.trim().length < 2) return [];
  const term = searchTerm.trim();
  const results = [];
  const seen = new Set();

  const addResults = (snap) => {
    snap.forEach(d => {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        results.push({ ...d.data(), _id: d.id });
      }
    });
  };

  try {
    // Query 1: orderId exact match
    const q1 = query(
      collection(db, 'orders'),
      where('orderId', '==', term),
      limit(5)
    );
    addResults(await getDocs(q1));

    // Query 2: orderNumber exact match (some orders use this)
    if (!results.length) {
      const q2 = query(
        collection(db, 'orders'),
        where('orderNumber', '==', term),
        limit(5)
      );
      addResults(await getDocs(q2));
    }

    // Query 3: clientPhone exact match (digits only)
    if (!results.length && /^\d+$/.test(term)) {
      const q3 = query(
        collection(db, 'orders'),
        where('clientPhone', '==', term),
        limit(10)
      );
      addResults(await getDocs(q3));
    }
  } catch (e) {
    console.warn('[global-search] query error:', e);
  }

  return results.map(o => {
    const stage = o.stage || 'design';
    const page = STAGE_PAGES[stage] || 'order.html';
    return {
      id: o._id,
      orderId: o.orderId || o.orderNumber || o._id.slice(0, 8),
      clientName: o.clientName || '—',
      stage,
      stageLabel: STAGE_LABELS[stage] || stage,
      stageIcon: STAGE_ICONS[stage] || '•',
      page,
      url: page + '?orderId=' + encodeURIComponent(o._id),
      salePrice: o.salePrice || 0,
      createdDate: o.createdDate || '',
    };
  });
}

// Expose on window for non-module pages
if (typeof window !== 'undefined') {
  window.globalSearchOrders = searchOrders;
}
