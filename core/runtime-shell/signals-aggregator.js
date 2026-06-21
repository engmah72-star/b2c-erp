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

import { db, auth } from '../firebase-init.js';
import { collection, query, where, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import * as signals from './signals.js';

const _unsubscribers = [];
let _started = false;

// ── Aggregator definitions ──
// كل entry: { domain, key, build() → unsubscribe function }
// build() يعمل subscribe + بيـ emit signals.setMetric(domain, key, count)
const AGGREGATORS = [
  // ── Production (merged: late + no-supplier + problem in single listener) ──
  {
    domain: 'production', key: 'all',
    desc: 'Production signals: overdue (>3d), missing supplier, and problem-flagged orders — single listener',
    build() {
      const q = query(
        collection(db, 'orders'),
        where('stage', '==', 'production'),
        limit(500),
      );
      return onSnapshot(q, snap => {
        const threshold = Date.now() - 3 * 24 * 60 * 60 * 1000;
        let lateCount = 0, noSupCount = 0, probCount = 0;
        snap.forEach(doc => {
          const o = doc.data();
          // late: overdue > 3 days
          const ts = o.stageEnteredAt?.seconds || o.createdAt?.seconds || 0;
          if (ts && ts * 1000 < threshold) lateCount++;
          // shared products array for no-supplier + problem
          const products = Array.isArray(o.products) ? o.products : [];
          // no-supplier
          if (products.some(p => !p.supplierId && !p.supplierName)) noSupCount++;
          // problem
          if (products.some(p => p.productStatus === 'problem')) probCount++;
          else if (o.productionStatus === 'problem') probCount++;
        });
        signals.setMetric('production', 'late', lateCount);
        signals.setMetric('production', 'no-supplier', noSupCount);
        signals.setMetric('production', 'problem', probCount);
      }, err => {
        console.warn('[signals:production:all]', err);
        signals.setMetric('production', 'late', 0);
        signals.setMetric('production', 'no-supplier', 0);
        signals.setMetric('production', 'problem', 0);
      });
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
    desc: 'Pending financial approvals (payment requests + transactions awaiting approval)',
    build() {
      // المصدر الفعلي للموافقات المعلّقة: payment_requests في حالات تحتاج
      // إجراء + transactions_v2 بانتظار اعتماد. (الكود القديم كان يستعلم من
      // collection اسمه 'approvals' غير موجود في نموذج البيانات → العدّاد
      // كان يبتلع not-found ويُظهر 0 دائماً — bug.)
      let reqCount = 0, txCount = 0;
      const emit = () => signals.setMetric('accounts', 'pending-approvals', reqCount + txCount);
      const onErr = (label) => (err) => {
        // غير المخوَّلين مالياً (مثل graphic_designer) سيرون permission-denied —
        // نتجاهله بصمت ونُبقي العدّاد كما هو (0 لتلك الفئة).
        if (err?.code !== 'permission-denied' && err?.code !== 'not-found') {
          console.warn(`[signals:accounts:pending-approvals:${label}]`, err);
        }
        emit();
      };
      const reqQ = query(
        collection(db, 'payment_requests'),
        where('status', 'in', ['requested', 'awaiting_receipt', 'pending', 'confirmed']),
        limit(200),
      );
      const txQ = query(
        collection(db, 'transactions_v2'),
        where('approvalStatus', 'in', ['pending', 'confirmed']),
        limit(200),
      );
      const u1 = onSnapshot(reqQ, snap => { reqCount = snap.size; emit(); }, onErr('requests'));
      const u2 = onSnapshot(txQ,  snap => { txCount  = snap.size; emit(); }, onErr('transactions'));
      // عزل كل إلغاء: فشل أحدهما لا يمنع الآخر (تجنّب تسرّب مستمع).
      return () => { try { u1(); } catch (_) {} try { u2(); } catch (_) {} };
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

  // ── Returns ──
  {
    domain: 'shipping', key: 'returns-open',
    desc: 'Open return tickets needing action (requested/inspecting/approved)',
    build() {
      const q = query(
        collection(db, 'returns_tickets'),
        where('status', 'in', ['requested', 'inspecting', 'approved']),
        limit(500),
      );
      return onSnapshot(q, snap => {
        signals.setMetric('shipping', 'returns-open', snap.size);
      }, err => {
        if (err?.code !== 'permission-denied' && err?.code !== 'failed-precondition') {
          console.warn('[signals:returns:open]', err);
        }
        signals.setMetric('shipping', 'returns-open', 0);
      });
    },
  },

  // ── Suppliers ──
  {
    domain: 'suppliers', key: 'pending',
    desc: 'Supplier payment requests still active (requested/awaiting_receipt/pending/confirmed)',
    build() {
      // query single-field (type) — نفلتر status في JS لتجنّب composite index
      const q = query(
        collection(db, 'payment_requests'),
        where('type', '==', 'supplier_payment'),
        limit(500),
      );
      const ACTIVE = ['requested', 'awaiting_receipt', 'pending', 'confirmed'];
      return onSnapshot(q, snap => {
        let count = 0;
        snap.forEach(d => { if (ACTIVE.includes(d.data().status)) count++; });
        signals.setMetric('suppliers', 'pending', count);
      }, err => {
        if (err?.code !== 'permission-denied' && err?.code !== 'failed-precondition') {
          console.warn('[signals:suppliers:pending]', err);
        }
        signals.setMetric('suppliers', 'pending', 0);
      });
    },
  },

  // ── Admin Requests (مركزية طلبات الإدارة — الأنواع البشرية + طلبات البوابة) ──
  // المالي والمرتجعات يُعاد استخدام عدّاديهما (accounts/pending-approvals +
  // shipping/returns-open). هنا نضيف الأنواع غير المغطّاة. غير المخوَّلين
  // (لا يقرؤون هذه الـ collections) يحصلون على permission-denied ⇒ صفر بصمت.
  {
    domain: 'admin-requests', key: 'appeals',
    desc: 'Incident appeals awaiting admin decision (appeal.status == pending)',
    build() {
      const q = query(
        collection(db, 'employee_incidents'),
        where('appeal.status', '==', 'pending'),
        limit(200),
      );
      return onSnapshot(q, snap => {
        signals.setMetric('admin-requests', 'appeals', snap.size);
      }, err => {
        if (err?.code !== 'permission-denied' && err?.code !== 'failed-precondition') {
          console.warn('[signals:admin-requests:appeals]', err);
        }
        signals.setMetric('admin-requests', 'appeals', 0);
      });
    },
  },
  {
    domain: 'admin-requests', key: 'attendance',
    desc: 'Attendance permissions awaiting decision (status == pending)',
    build() {
      const q = query(
        collection(db, 'attendance_permissions'),
        where('status', '==', 'pending'),
        limit(200),
      );
      return onSnapshot(q, snap => {
        signals.setMetric('admin-requests', 'attendance', snap.size);
      }, err => {
        if (err?.code !== 'permission-denied' && err?.code !== 'failed-precondition') {
          console.warn('[signals:admin-requests:attendance]', err);
        }
        signals.setMetric('admin-requests', 'attendance', 0);
      });
    },
  },
  {
    domain: 'admin-requests', key: 'leaves',
    desc: 'Leave requests awaiting decision (status == pending)',
    build() {
      const q = query(
        collection(db, 'employee_leaves'),
        where('status', '==', 'pending'),
        limit(200),
      );
      return onSnapshot(q, snap => {
        signals.setMetric('admin-requests', 'leaves', snap.size);
      }, err => {
        if (err?.code !== 'permission-denied' && err?.code !== 'failed-precondition') {
          console.warn('[signals:admin-requests:leaves]', err);
        }
        signals.setMetric('admin-requests', 'leaves', 0);
      });
    },
  },
  {
    domain: 'admin-requests', key: 'order-requests',
    desc: 'Portal order requests awaiting convert/reject (status new/requested)',
    build() {
      const q = query(
        collection(db, 'order_requests'),
        where('status', 'in', ['new', 'requested']),
        limit(200),
      );
      return onSnapshot(q, snap => {
        signals.setMetric('admin-requests', 'order-requests', snap.size);
      }, err => {
        if (err?.code !== 'permission-denied' && err?.code !== 'failed-precondition') {
          console.warn('[signals:admin-requests:order-requests]', err);
        }
        signals.setMetric('admin-requests', 'order-requests', 0);
      });
    },
  },

  // ── Inbox ──
  {
    domain: 'inbox', key: 'unread',
    desc: 'Unread messages for the current user (conversations.unreadCount[uid])',
    build() {
      // نفس مصدر inbox-badge.js: conversations حيث المستخدم participant،
      // ونجمع unreadCount[uid]. يُبنى بعد auth (start() يُستدعى post-auth).
      const uid = (auth && auth.currentUser && auth.currentUser.uid) || null;
      if (!uid) { signals.setMetric('inbox', 'unread', 0); return () => {}; }
      const q = query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', uid),
        limit(200),
      );
      return onSnapshot(q, snap => {
        let total = 0;
        snap.forEach(d => {
          const data = d.data();
          total += (data.unreadCount && data.unreadCount[uid]) || 0;
        });
        signals.setMetric('inbox', 'unread', total);
      }, err => {
        if (err?.code !== 'permission-denied' && err?.code !== 'failed-precondition') {
          console.warn('[signals:inbox:unread]', err);
        }
        signals.setMetric('inbox', 'unread', 0);
      });
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
