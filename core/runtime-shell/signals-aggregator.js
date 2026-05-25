// ════════════════════════════════════════════════════════════════════
// Business2Card Runtime Shell — Signals Aggregator (Phase 4)
// ════════════════════════════════════════════════════════════════════
//
// يـ subscribe لـ Firestore collections ويعكس counts كـ runtime signals.
// كل signal له:
//   - key: identifier ثابت (مطابق للـ id في domain sidebar config)
//   - query: bounded Firestore query
//   - count: عدد الـ docs المطابقة
//
// النتيجة: signals.setMetric(domainId, key, count) → الـ rail dot
// + الـ sidebar item بيتحدّثوا live.
//
// Bounded listeners (RULE G3): كل query بـ limit() محسوب.
//
// API:
//   start()  → يبدأ كل الـ aggregators (بعد auth)
//   stop()   → يقفل كل الـ subscriptions
// ════════════════════════════════════════════════════════════════════

import { db } from '../firebase-init.js';
import { collection, query, where, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import * as signals from './signals.js';

const _unsubscribers = [];
let _started = false;

// ── Aggregator definitions ──
// كل entry: { domain, key, build() → unsubscribe function }
// build() يعمل subscribe + بيـ emit signals.setMetric(domain, key, count)
const AGGREGATORS = [
  // ── Production ──
  {
    domain: 'production', key: 'late',
    desc: 'Production orders overdue (>3 days in production stage)',
    build() {
      // الـ overdue threshold = 3 أيام في production stage
      // queries by stage فقط (cheaper) ثم نفلتر date في الـ JS لتجنب composite index
      const q = query(
        collection(db, 'orders'),
        where('stage', '==', 'production'),
        limit(500),
      );
      return onSnapshot(q, snap => {
        const threshold = Date.now() - 3 * 24 * 60 * 60 * 1000;
        let count = 0;
        snap.forEach(doc => {
          const o = doc.data();
          const ts = o.stageEnteredAt?.seconds || o.createdAt?.seconds || 0;
          if (ts && ts * 1000 < threshold) count++;
        });
        signals.setMetric('production', 'late', count);
      }, err => console.warn('[signals:production:late]', err));
    },
  },
  {
    domain: 'production', key: 'no-supplier',
    desc: 'Production orders without assigned supplier',
    build() {
      const q = query(
        collection(db, 'orders'),
        where('stage', '==', 'production'),
        limit(500),
      );
      return onSnapshot(q, snap => {
        let count = 0;
        snap.forEach(doc => {
          const o = doc.data();
          const products = Array.isArray(o.products) ? o.products : [];
          // عداد لكل أوردر فيه على الأقل منتج بدون مورد
          if (products.some(p => !p.supplierId && !p.supplierName)) count++;
        });
        signals.setMetric('production', 'no-supplier', count);
      }, err => console.warn('[signals:production:no-supplier]', err));
    },
  },
  {
    domain: 'production', key: 'problem',
    desc: 'Production orders flagged with problems',
    build() {
      const q = query(
        collection(db, 'orders'),
        where('stage', '==', 'production'),
        limit(500),
      );
      return onSnapshot(q, snap => {
        let count = 0;
        snap.forEach(doc => {
          const o = doc.data();
          const products = Array.isArray(o.products) ? o.products : [];
          if (products.some(p => p.productStatus === 'problem')) count++;
          else if (o.productionStatus === 'problem') count++;
        });
        signals.setMetric('production', 'problem', count);
      }, err => console.warn('[signals:production:problem]', err));
    },
  },

  // ── Shipping ──
  {
    domain: 'shipping', key: 'late',
    desc: 'Shipping orders overdue (>2 days in shipping stage)',
    build() {
      const q = query(
        collection(db, 'orders'),
        where('stage', '==', 'shipping'),
        limit(500),
      );
      return onSnapshot(q, snap => {
        const threshold = Date.now() - 2 * 24 * 60 * 60 * 1000;
        let count = 0;
        snap.forEach(doc => {
          const o = doc.data();
          const ts = o.stageEnteredAt?.seconds || o.shipDate?.seconds || 0;
          if (ts && ts * 1000 < threshold) count++;
        });
        signals.setMetric('shipping', 'late', count);
      }, err => console.warn('[signals:shipping:late]', err));
    },
  },

  // ── Accounts ──
  {
    domain: 'accounts', key: 'pending-approvals',
    desc: 'Pending financial approvals',
    build() {
      // لو في approvals collection
      const q = query(
        collection(db, 'approvals'),
        where('status', '==', 'pending'),
        limit(200),
      );
      return onSnapshot(q, snap => {
        signals.setMetric('accounts', 'pending-approvals', snap.size);
      }, err => {
        // لو الـ collection مش موجود أو لا permission → فقط console
        if (err?.code !== 'permission-denied' && err?.code !== 'not-found') {
          console.warn('[signals:accounts:pending-approvals]', err);
        }
        signals.setMetric('accounts', 'pending-approvals', 0);
      });
    },
  },

  // ── Clients ──
  {
    domain: 'clients', key: 'delayed',
    desc: 'Clients with overdue balances',
    build() {
      const q = query(
        collection(db, 'clients'),
        where('hasBalance', '==', true),
        limit(500),
      );
      return onSnapshot(q, snap => {
        signals.setMetric('clients', 'delayed', snap.size);
      }, err => {
        if (err?.code !== 'permission-denied' && err?.code !== 'failed-precondition') {
          console.warn('[signals:clients:delayed]', err);
        }
        signals.setMetric('clients', 'delayed', 0);
      });
    },
  },

  // ── Inbox ──
  {
    domain: 'inbox', key: 'unread',
    desc: 'Unread messages count (placeholder — uses user-specific subcollection later)',
    build() {
      // Phase 4 placeholder — يحتاج user context
      signals.setMetric('inbox', 'unread', 0);
      return () => {};
    },
  },
];

export function start() {
  if (_started) return;
  _started = true;
  for (const agg of AGGREGATORS) {
    try {
      const unsub = agg.build();
      if (typeof unsub === 'function') _unsubscribers.push(unsub);
    } catch (e) {
      console.warn('[signals-aggregator] failed to build', agg.domain, agg.key, e);
    }
  }
  console.info('[signals-aggregator] started ' + _unsubscribers.length + ' subscriptions');
}

export function stop() {
  for (const u of _unsubscribers) {
    try { u(); } catch (_) {}
  }
  _unsubscribers.length = 0;
  _started = false;
}
