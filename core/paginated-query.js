/**
 * core/paginated-query.js — محرك التحميل التدريجي (Cursor-Based Pagination)
 *
 * يحمّل البيانات صفحة بصفحة بدلاً من دفعة واحدة. كل صفحة تُخزَّن في الكاش
 * (Memory + IndexedDB). RULE G3: كل query بـ limit() إلزامي.
 *
 * الاستخدام:
 *   const pager = paginatedQuery('orders')
 *     .where('stage', '==', 'archived')
 *     .orderBy('createdAt', 'desc')
 *     .pageSize(50)
 *     .create();
 *
 *   const page1 = await pager.loadFirst();   // أول صفحة
 *   const page2 = await pager.loadNext();    // الصفحة التالية
 *   pager.onUpdate(allDocs => render(allDocs)); // تحديث مستمر
 *   pager.destroy();                          // تنظيف
 */

import { db } from './firebase-init.js';
import {
  collection, getDocs, onSnapshot,
  query, where, orderBy, limit, startAfter,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGES_IN_MEMORY = 20;

// ═══════════════════════════════════════
// PaginatedQuery Class
// ═══════════════════════════════════════

class PaginatedQuery {
  constructor(collectionName, constraints, descriptors, pageSize) {
    this._collection = collectionName;
    this._constraints = constraints;
    this._descriptors = descriptors;
    this._pageSize = pageSize || DEFAULT_PAGE_SIZE;
    this._pages = [];
    this._allDocs = [];
    this._lastDoc = null;
    this._hasMore = true;
    this._loading = false;
    this._listeners = new Set();
    this._unsub = null;
    this._firstPageRealtime = false;
  }

  /**
   * تحميل الصفحة الأولى — مع listener للتحديث الحي
   * @param {Object} [opts]
   * @param {boolean} [opts.realtime=false] — listener حي على الصفحة الأولى
   * @returns {Promise<{docs: Array, hasMore: boolean, total: number, page: number}>}
   */
  async loadFirst(opts = {}) {
    this._pages = [];
    this._allDocs = [];
    this._lastDoc = null;
    this._hasMore = true;
    this._firstPageRealtime = opts.realtime || false;

    if (this._unsub) { this._unsub(); this._unsub = null; }

    const q = query(
      collection(db, this._collection),
      ...this._constraints,
      limit(this._pageSize)
    );

    if (this._firstPageRealtime) {
      return this._loadFirstRealtime(q);
    }

    return this._loadPage(q, 0);
  }

  async _loadFirstRealtime(q) {
    return new Promise((resolve) => {
      let resolved = false;
      this._unsub = onSnapshot(q, (snap) => {
        const docs = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
        this._pages[0] = { docs, lastSnap: snap.docs[snap.docs.length - 1] || null };
        this._lastDoc = this._pages[0].lastSnap;
        this._hasMore = docs.length === this._pageSize;
        this._rebuildAllDocs();
        this._notify();
        if (!resolved) { resolved = true; resolve(this._pageResult(0)); }
      });
    });
  }

  /**
   * تحميل الصفحة التالية
   * @returns {Promise<{docs: Array, hasMore: boolean, total: number, page: number}|null>}
   */
  async loadNext() {
    if (!this._hasMore || this._loading) return null;
    if (!this._lastDoc) return null;

    const q = query(
      collection(db, this._collection),
      ...this._constraints,
      startAfter(this._lastDoc),
      limit(this._pageSize)
    );

    return this._loadPage(q, this._pages.length);
  }

  /**
   * تحميل صفحة محددة بالرقم (0-indexed)
   * إذا كانت محمّلة مسبقاً → يعيدها من الذاكرة
   */
  async loadPage(pageIndex) {
    if (pageIndex < this._pages.length) {
      return this._pageResult(pageIndex);
    }
    while (this._pages.length <= pageIndex && this._hasMore) {
      const result = await this.loadNext();
      if (!result) break;
    }
    if (pageIndex < this._pages.length) {
      return this._pageResult(pageIndex);
    }
    return null;
  }

  async _loadPage(q, pageIndex) {
    this._loading = true;
    try {
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ ...d.data(), _id: d.id }));

      this._pages[pageIndex] = {
        docs,
        lastSnap: snap.docs[snap.docs.length - 1] || null,
      };

      this._lastDoc = this._pages[pageIndex].lastSnap;
      this._hasMore = docs.length === this._pageSize;

      // LRU: احتفظ بآخر MAX_PAGES_IN_MEMORY صفحة فقط في الذاكرة
      if (this._pages.length > MAX_PAGES_IN_MEMORY) {
        this._pages[this._pages.length - MAX_PAGES_IN_MEMORY - 1] = null;
      }

      this._rebuildAllDocs();
      this._notify();

      return this._pageResult(pageIndex);
    } catch (err) {
      console.warn('[paginated-query] loadPage error:', err);
      return null;
    } finally {
      this._loading = false;
    }
  }

  _rebuildAllDocs() {
    this._allDocs = [];
    for (const page of this._pages) {
      if (page && page.docs) {
        this._allDocs.push(...page.docs);
      }
    }
  }

  _pageResult(pageIndex) {
    const page = this._pages[pageIndex];
    return {
      docs: page?.docs || [],
      hasMore: this._hasMore,
      total: this._allDocs.length,
      page: pageIndex,
      pageCount: this._pages.length,
    };
  }

  /**
   * الاشتراك في التحديثات — يُنادى عند كل تغيير في البيانات
   * @param {Function} callback — (allDocs, meta) => void
   * @returns {Function} unsubscribe
   */
  onUpdate(callback) {
    this._listeners.add(callback);
    if (this._allDocs.length > 0) {
      try { callback(this._allDocs, this._meta()); } catch (_) {}
    }
    return () => this._listeners.delete(callback);
  }

  _notify() {
    const meta = this._meta();
    for (const cb of this._listeners) {
      try { cb(this._allDocs, meta); } catch (_) {}
    }
  }

  _meta() {
    return {
      hasMore: this._hasMore,
      total: this._allDocs.length,
      pageCount: this._pages.length,
      pageSize: this._pageSize,
      loading: this._loading,
    };
  }

  /** هل توجد صفحات إضافية؟ */
  get hasMore() { return this._hasMore; }

  /** هل يتم التحميل حالياً؟ */
  get loading() { return this._loading; }

  /** كل الوثائق المحمّلة حتى الآن */
  get allDocs() { return this._allDocs; }

  /** عدد الصفحات المحمّلة */
  get pageCount() { return this._pages.length; }

  /** إجمالي الوثائق المحمّلة */
  get totalLoaded() { return this._allDocs.length; }

  /**
   * تنظيف — إلغاء الـ listener وتحرير الذاكرة
   */
  destroy() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    this._pages = [];
    this._allDocs = [];
    this._listeners.clear();
    this._lastDoc = null;
    this._hasMore = false;
  }
}

// ═══════════════════════════════════════
// Builder — واجهة بناء مقروءة
// ═══════════════════════════════════════

export function paginatedQuery(collectionName) {
  const constraints = [];
  const descriptors = [];
  let _pageSize = DEFAULT_PAGE_SIZE;

  return {
    where(field, op, value) {
      descriptors.push(['where', field, op, String(value)]);
      constraints.push(where(field, op, value));
      return this;
    },
    orderBy(field, direction = 'asc') {
      descriptors.push(['orderBy', field, direction]);
      constraints.push(orderBy(field, direction));
      return this;
    },
    pageSize(n) {
      _pageSize = Math.max(1, Math.min(n, 500));
      return this;
    },
    create() {
      return new PaginatedQuery(collectionName, constraints, descriptors, _pageSize);
    },
  };
}
