/**
 * core/data-cache.js — طبقة الكاش والمزامنة المركزية
 *
 * المبدأ: Firestore = المصدر الوحيد للحقيقة. الكاش = طبقة أداء فقط.
 *
 * الآلية (Stale-While-Revalidate):
 * 1. عند فتح النظام → عرض البيانات من الكاش فوراً (IndexedDB → Memory)
 * 2. في الخلفية → مزامنة مع Firestore عبر onSnapshot
 * 3. عند وصول بيانات جديدة → تحديث الكاش + إعلام المشتركين
 * 4. Lazy loading — جلب البيانات المطلوبة فقط عند الحاجة
 *
 * RULE G2: يعتمد على core/firebase-init.js فقط.
 * RULE G3: كل query بـ limit() إلزامي.
 */

import { db } from './firebase-init.js';
import {
  collection, doc, getDoc, getDocs, onSnapshot,
  query, where, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ═══════════════════════════════════════
// ثوابت
// ═══════════════════════════════════════
const DB_NAME = 'b2c_data_cache';
const DB_VERSION = 1;
const STORE_DOCS = 'documents';
const STORE_QUERIES = 'queries';
const STORE_META = 'meta';

const DEFAULT_MAX_AGE = 30 * 60 * 1000;     // 30 دقيقة — بعدها الكاش stale (لا يُحذف، يُعرض مع revalidation)
const DEFAULT_QUERY_LIMIT = 200;             // RULE G3

// ═══════════════════════════════════════
// IndexedDB Manager
// ═══════════════════════════════════════
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(STORE_DOCS)) {
        const docs = idb.createObjectStore(STORE_DOCS, { keyPath: '_cacheKey' });
        docs.createIndex('collection', '_collection', { unique: false });
        docs.createIndex('syncedAt', '_syncedAt', { unique: false });
      }
      if (!idb.objectStoreNames.contains(STORE_QUERIES)) {
        idb.createObjectStore(STORE_QUERIES, { keyPath: 'queryKey' });
      }
      if (!idb.objectStoreNames.contains(STORE_META)) {
        idb.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn('[data-cache] IndexedDB open failed:', req.error);
      reject(req.error);
    };
  });
  return _dbPromise;
}

function idbTx(storeName, mode = 'readonly') {
  return openDB().then(idb => {
    const tx = idb.transaction(storeName, mode);
    return tx.objectStore(storeName);
  });
}

function idbPut(storeName, value) {
  return idbTx(storeName, 'readwrite').then(store => {
    return new Promise((resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }).catch(err => console.warn('[data-cache] idbPut error:', err));
}

function idbGet(storeName, key) {
  return idbTx(storeName).then(store => {
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }).catch(err => { console.warn('[data-cache] idbGet error:', err); return null; });
}

function idbGetAll(storeName, indexName, indexValue) {
  return idbTx(storeName).then(store => {
    return new Promise((resolve, reject) => {
      const target = indexName ? store.index(indexName) : store;
      const req = indexName ? target.getAll(indexValue) : target.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }).catch(err => { console.warn('[data-cache] idbGetAll error:', err); return []; });
}

function idbDelete(storeName, key) {
  return idbTx(storeName, 'readwrite').then(store => {
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }).catch(err => console.warn('[data-cache] idbDelete error:', err));
}

function idbClearStore(storeName) {
  return idbTx(storeName, 'readwrite').then(store => {
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }).catch(err => console.warn('[data-cache] idbClear error:', err));
}

function idbBatchPut(storeName, items) {
  return openDB().then(idb => {
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const item of items) store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }).catch(err => console.warn('[data-cache] idbBatchPut error:', err));
}

// ═══════════════════════════════════════
// Query Key Hashing
// ═══════════════════════════════════════
function stableQueryKey(collectionName, constraintDescriptors) {
  const parts = [collectionName];
  if (constraintDescriptors) {
    for (const d of constraintDescriptors) {
      parts.push(d.join(':'));
    }
  }
  return parts.join('|');
}

// ═══════════════════════════════════════
// Memory Cache (L1) — أسرع طبقة
// ═══════════════════════════════════════
const _memoryCache = new Map();
const _memoryCacheMeta = new Map();

function memGet(key) {
  return _memoryCache.get(key) || null;
}

function memSet(key, value, collectionName) {
  _memoryCache.set(key, value);
  _memoryCacheMeta.set(key, { syncedAt: Date.now(), collection: collectionName });
}

function memInvalidate(key) {
  _memoryCache.delete(key);
  _memoryCacheMeta.delete(key);
}

function memClear() {
  _memoryCache.clear();
  _memoryCacheMeta.clear();
}

// ═══════════════════════════════════════
// Listener Registry — منع التكرار
// ═══════════════════════════════════════
const _activeListeners = new Map();

/**
 * @typedef {Object} ListenerEntry
 * @property {string} queryKey
 * @property {Function} unsubscribe
 * @property {Set<Function>} subscribers
 * @property {number} createdAt
 */

// ═══════════════════════════════════════
// Serialization — تحويل Firestore docs لشكل قابل للتخزين
// ═══════════════════════════════════════
function serializeDoc(docData) {
  const serialized = {};
  for (const [key, value] of Object.entries(docData)) {
    if (key.startsWith('_')) { serialized[key] = value; continue; }
    if (value && typeof value === 'object' && typeof value.toDate === 'function') {
      serialized[key] = { __ts: true, v: value.toDate().toISOString() };
    } else if (value && typeof value === 'object' && value.seconds !== undefined && value.nanoseconds !== undefined) {
      serialized[key] = { __ts: true, v: new Date(value.seconds * 1000).toISOString() };
    } else if (Array.isArray(value)) {
      serialized[key] = value.map(item =>
        (item && typeof item === 'object' && !Array.isArray(item)) ? serializeDoc(item) : item
      );
    } else if (value && typeof value === 'object' && !(value instanceof Date)) {
      serialized[key] = serializeDoc(value);
    } else {
      serialized[key] = value;
    }
  }
  return serialized;
}

function deserializeDoc(stored) {
  if (!stored || typeof stored !== 'object') return stored;
  const result = {};
  for (const [key, value] of Object.entries(stored)) {
    if (value && typeof value === 'object' && value.__ts) {
      result[key] = new Date(value.v);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        (item && typeof item === 'object' && !Array.isArray(item)) ? deserializeDoc(item) : item
      );
    } else if (value && typeof value === 'object' && !(value instanceof Date)) {
      result[key] = deserializeDoc(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ═══════════════════════════════════════
// DataCache — الواجهة الرئيسية
// ═══════════════════════════════════════
export const dataCache = {

  /**
   * جلب مستند واحد — cache-first مع background sync
   * @param {string} collectionName
   * @param {string} docId
   * @param {Object} [opts]
   * @param {number} [opts.maxAge] — أقصى عمر للكاش بالميلي ثانية
   * @returns {Promise<{data: Object|null, source: 'memory'|'cache'|'server'}>}
   */
  async getDoc(collectionName, docId, opts = {}) {
    const cacheKey = `${collectionName}/${docId}`;
    const maxAge = opts.maxAge || DEFAULT_MAX_AGE;

    // L1: Memory
    const memHit = memGet(cacheKey);
    if (memHit) {
      const meta = _memoryCacheMeta.get(cacheKey);
      if (meta && (Date.now() - meta.syncedAt) < maxAge) {
        return { data: memHit, source: 'memory' };
      }
    }

    // L2: IndexedDB
    const idbHit = await idbGet(STORE_DOCS, cacheKey);
    if (idbHit) {
      const deserialized = deserializeDoc(idbHit.data);
      deserialized._id = idbHit._id;
      memSet(cacheKey, deserialized, collectionName);

      if ((Date.now() - idbHit._syncedAt) < maxAge) {
        return { data: deserialized, source: 'cache' };
      }
      // stale — return but revalidate
      this._revalidateDoc(collectionName, docId, cacheKey);
      return { data: deserialized, source: 'cache' };
    }

    // L3: Firestore
    return this._fetchDoc(collectionName, docId, cacheKey);
  },

  async _fetchDoc(collectionName, docId, cacheKey) {
    try {
      const snap = await getDoc(doc(db, collectionName, docId));
      if (!snap.exists()) return { data: null, source: 'server' };

      const data = { ...snap.data(), _id: snap.id };
      memSet(cacheKey, data, collectionName);

      await idbPut(STORE_DOCS, {
        _cacheKey: cacheKey,
        _collection: collectionName,
        _id: snap.id,
        _syncedAt: Date.now(),
        data: serializeDoc(data),
      });

      return { data, source: 'server' };
    } catch (err) {
      console.warn('[data-cache] fetchDoc error:', err);
      return { data: null, source: 'server' };
    }
  },

  async _revalidateDoc(collectionName, docId, cacheKey) {
    try {
      const snap = await getDoc(doc(db, collectionName, docId));
      if (!snap.exists()) {
        memInvalidate(cacheKey);
        await idbDelete(STORE_DOCS, cacheKey);
        return;
      }
      const data = { ...snap.data(), _id: snap.id };
      memSet(cacheKey, data, collectionName);
      await idbPut(STORE_DOCS, {
        _cacheKey: cacheKey,
        _collection: collectionName,
        _id: snap.id,
        _syncedAt: Date.now(),
        data: serializeDoc(data),
      });
    } catch (err) {
      console.warn('[data-cache] revalidateDoc error:', err);
    }
  },

  /**
   * اشتراك في query مع cache-first
   *
   * يُعيد البيانات من الكاش فوراً (إن وُجدت)، ثم يُطلق onSnapshot
   * للمزامنة في الخلفية. عند وصول بيانات جديدة يُنادي callback مرة أخرى.
   *
   * @param {Object} spec
   * @param {string} spec.collection — اسم الـ collection
   * @param {Array}  spec.descriptors — وصف الـ constraints [[type, ...args], ...]
   * @param {Array}  spec.firestoreConstraints — constraint objects جاهزة لـ query()
   * @param {number} [spec.queryLimit] — limit (إلزامي — RULE G3)
   * @param {Function} callback — (docs, source) → void
   * @returns {Function} unsubscribe
   */
  subscribe(spec, callback) {
    const qLimit = spec.queryLimit || DEFAULT_QUERY_LIMIT;
    const queryKey = stableQueryKey(spec.collection, spec.descriptors);

    // هل يوجد listener نشط لنفس الـ query؟ → شارك
    const existing = _activeListeners.get(queryKey);
    if (existing) {
      existing.subscribers.add(callback);
      // أعطِ المشترك الجديد البيانات الحالية فوراً
      const cached = memGet(queryKey);
      if (cached) {
        try { callback(cached, 'memory'); } catch (_) {}
      }
      return () => {
        existing.subscribers.delete(callback);
        if (existing.subscribers.size === 0) {
          existing.unsubscribe();
          _activeListeners.delete(queryKey);
          _stats.activeListeners = _activeListeners.size;
        }
      };
    }

    // أولاً: عرض من الكاش
    this._hydrateFromCache(queryKey, spec.collection, callback);

    // ثانياً: listener حقيقي على Firestore
    const constraints = spec.firestoreConstraints || [];
    const hasLimit = constraints.some(c =>
      c.type === 'limit' || (c._type === 'limit') || (typeof c === 'object' && c._limit)
    );
    if (!hasLimit) constraints.push(limit(qLimit));

    const q = query(collection(db, spec.collection), ...constraints);

    const subscribers = new Set([callback]);

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
      const source = snap.metadata.fromCache ? 'firebase-cache' : 'server';

      // تحديث L1
      memSet(queryKey, docs, spec.collection);

      // تحديث L2 (async — لا يحجب الـ render)
      this._persistQueryResult(queryKey, spec.collection, docs);

      _stats.serverSyncs++;
      _stats.lastSyncAt = Date.now();

      // إعلام كل المشتركين
      for (const cb of subscribers) {
        try { cb(docs, source); } catch (err) {
          console.warn('[data-cache] subscriber error:', err);
        }
      }
    }, (err) => {
      console.warn('[data-cache] onSnapshot error:', spec.collection, err);
    });

    _activeListeners.set(queryKey, { queryKey, unsubscribe: unsub, subscribers, createdAt: Date.now() });
    _stats.activeListeners = _activeListeners.size;

    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        unsub();
        _activeListeners.delete(queryKey);
        _stats.activeListeners = _activeListeners.size;
      }
    };
  },

  async _hydrateFromCache(queryKey, collectionName, callback) {
    try {
      // L1 Memory
      const memHit = memGet(queryKey);
      if (memHit) {
        _stats.cacheHits++;
        callback(memHit, 'memory');
        return;
      }

      // L2 IndexedDB
      const idbHit = await idbGet(STORE_QUERIES, queryKey);
      if (idbHit && idbHit.docs && idbHit.docs.length > 0) {
        const docs = idbHit.docs.map(d => {
          const deserialized = deserializeDoc(d.data);
          deserialized._id = d._id;
          return deserialized;
        });
        memSet(queryKey, docs, collectionName);
        _stats.cacheHits++;
        callback(docs, 'cache');
        return;
      }

      _stats.cacheMisses++;
    } catch (err) {
      _stats.cacheMisses++;
      console.warn('[data-cache] hydrate error:', err);
    }
  },

  async _persistQueryResult(queryKey, collectionName, docs) {
    try {
      const serialized = docs.map(d => ({
        _id: d._id,
        data: serializeDoc(d),
      }));
      await idbPut(STORE_QUERIES, {
        queryKey,
        collection: collectionName,
        syncedAt: Date.now(),
        docs: serialized,
      });

      // تحديث كل مستند فردي أيضاً في store الوثائق
      const docEntries = docs.map(d => ({
        _cacheKey: `${collectionName}/${d._id}`,
        _collection: collectionName,
        _id: d._id,
        _syncedAt: Date.now(),
        data: serializeDoc(d),
      }));
      if (docEntries.length > 0) {
        await idbBatchPut(STORE_DOCS, docEntries);
      }
    } catch (err) {
      console.warn('[data-cache] persist error:', err);
    }
  },

  /**
   * Lazy load — جلب collection عند الطلب فقط (ليس في البداية)
   *
   * يُرجع البيانات من الكاش فوراً إن وُجدت، ويبدأ onSnapshot
   * في الخلفية للتحديث. الـ callback يُنادى مرة من الكاش ومرة من السيرفر.
   *
   * @param {Object} spec — نفس subscribe spec
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  lazyLoad(spec, callback) {
    return this.subscribe(spec, callback);
  },

  /**
   * إبطال كاش مستند محدد (بعد mutation)
   */
  async invalidateDoc(collectionName, docId) {
    const cacheKey = `${collectionName}/${docId}`;
    memInvalidate(cacheKey);
    await idbDelete(STORE_DOCS, cacheKey);

    // إبطال أي query يخص هذا الـ collection
    // الـ onSnapshot listeners ستُحدّث تلقائياً، لكن هذا يُعلم
    // أي getDoc قادم بأن الكاش قديم
    for (const [key, meta] of _memoryCacheMeta) {
      if (meta.collection === collectionName && key !== cacheKey) {
        // لا نحذف — الـ listener سيُحدّث. نُعلّم فقط كـ stale
        meta.syncedAt = 0;
      }
    }
  },

  /**
   * إبطال كل كاش collection كامل
   */
  async invalidateCollection(collectionName) {
    // L1
    for (const [key, meta] of _memoryCacheMeta) {
      if (meta.collection === collectionName) {
        memInvalidate(key);
      }
    }

    // L2 — حذف كل وثائق الـ collection
    try {
      const allDocs = await idbGetAll(STORE_DOCS, 'collection', collectionName);
      for (const d of allDocs) {
        await idbDelete(STORE_DOCS, d._cacheKey);
      }
      // حذف queries المرتبطة
      const allQueries = await idbGetAll(STORE_QUERIES);
      for (const q of allQueries) {
        if (q.collection === collectionName) {
          await idbDelete(STORE_QUERIES, q.queryKey);
        }
      }
    } catch (err) {
      console.warn('[data-cache] invalidateCollection error:', err);
    }
  },

  /**
   * مسح الكاش بالكامل
   */
  async clearAll() {
    memClear();
    await Promise.all([
      idbClearStore(STORE_DOCS),
      idbClearStore(STORE_QUERIES),
      idbClearStore(STORE_META),
    ]);
    _stats.cacheHits = 0;
    _stats.cacheMisses = 0;
    _stats.serverSyncs = 0;
    console.log('[data-cache] cache cleared');
  },

  /**
   * إلغاء كل الـ listeners النشطة (عند logout أو navigation)
   */
  unsubscribeAll() {
    for (const [, entry] of _activeListeners) {
      entry.unsubscribe();
    }
    _activeListeners.clear();
    _stats.activeListeners = 0;
  },

  /**
   * إحصائيات الكاش — للمراقبة والتصحيح
   */
  getStats() {
    return { ..._stats, activeListeners: _activeListeners.size };
  },

  /**
   * عدد الـ listeners النشطة
   */
  get activeListenerCount() {
    return _activeListeners.size;
  },
};

// ═══════════════════════════════════════
// إحصائيات
// ═══════════════════════════════════════
const _stats = {
  cacheHits: 0,
  cacheMisses: 0,
  serverSyncs: 0,
  activeListeners: 0,
  lastSyncAt: null,
};

// ═══════════════════════════════════════
// CachedQuery Builder — بناء spec بطريقة مقروءة
// ═══════════════════════════════════════
/**
 * مساعد لبناء query spec بطريقة واضحة:
 *
 *   const spec = cachedQuery('orders')
 *     .where('stage', '==', 'shipping')
 *     .orderBy('createdAt', 'desc')
 *     .limit(50)
 *     .build();
 *
 *   dataCache.subscribe(spec, (docs, source) => { ... });
 */
export function cachedQuery(collectionName) {
  const descriptors = [];
  const constraints = [];

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
    limit(n) {
      descriptors.push(['limit', String(n)]);
      constraints.push(limit(n));
      return this;
    },
    build() {
      return {
        collection: collectionName,
        descriptors,
        firestoreConstraints: constraints,
        queryLimit: DEFAULT_QUERY_LIMIT,
      };
    },
  };
}

// ═══════════════════════════════════════
// startListenersWithCache — بديل محسّن لـ startListeners
// ═══════════════════════════════════════
/**
 * نفس واجهة startListeners من shared.js، لكن مع cache-first:
 * - يعرض البيانات المخزنة فوراً عند فتح الصفحة
 * - يزامن في الخلفية عبر onSnapshot
 * - يدعم lazy loading (skip collections لا تحتاجها الصفحة)
 * - يدعم listener deduplication
 *
 * @param {Object} AppState — مرجع AppState من shared.js
 * @param {Object} callbacks — { onClients, onOrders, onProducts, onWallets, onSettings }
 * @param {Object} [opts] — { orderLimit, clientLimit, orderStage, skip: [...] }
 * @returns {Function} unsubscribeAll
 */
export function startListenersWithCache(AppState, callbacks = {}, opts = {}) {
  const unsubs = [];
  const orderLimitVal  = opts.orderLimit  || 200;
  const clientLimitVal = opts.clientLimit || 200;
  const productLimitVal = opts.productLimit || 500;
  const walletLimitVal = opts.walletLimit || 100;
  const skip = new Set(opts.skip || []);

  let _cacheShown = false;
  let _serverReceived = false;

  function _onSource(source) {
    if ((source === 'cache' || source === 'memory') && !_serverReceived && !_cacheShown) {
      _cacheShown = true;
      if (typeof window !== 'undefined' && window.showCacheIndicator) window.showCacheIndicator();
    }
    if (source === 'server' || source === 'firebase-cache') {
      _serverReceived = true;
      if (_cacheShown && typeof window !== 'undefined' && window.hideCacheIndicator) {
        window.hideCacheIndicator();
      }
    }
  }

  // Clients
  if (!skip.has('clients')) {
    const spec = cachedQuery('clients')
      .orderBy('createdAt', 'desc')
      .limit(clientLimitVal)
      .build();

    unsubs.push(dataCache.subscribe(spec, (docs, source) => {
      _onSource(source);
      AppState.clients = docs;
      callbacks.onClients?.(docs, source);
    }));
  }

  // Orders
  if (!skip.has('orders')) {
    const builder = cachedQuery('orders');
    if (opts.orderStage) {
      builder.where('stage', '==', opts.orderStage);
    }
    const spec = builder
      .orderBy('createdAt', 'desc')
      .limit(orderLimitVal)
      .build();

    unsubs.push(dataCache.subscribe(spec, (docs, source) => {
      _onSource(source);
      AppState.orders = docs;
      callbacks.onOrders?.(docs, source);
    }));
  }

  // Products
  if (!skip.has('products')) {
    const spec = cachedQuery('products_v2')
      .orderBy('name', 'asc')
      .limit(productLimitVal)
      .build();

    unsubs.push(dataCache.subscribe(spec, (docs, source) => {
      _onSource(source);
      AppState.products = docs;
      callbacks.onProducts?.(docs, source);
    }));
  }

  // Wallets
  if (!skip.has('wallets')) {
    const spec = cachedQuery('wallets')
      .orderBy('name', 'asc')
      .limit(walletLimitVal)
      .build();

    unsubs.push(dataCache.subscribe(spec, (docs, source) => {
      _onSource(source);
      AppState.wallets = docs;
      callbacks.onWallets?.(docs, source);
    }));
  }

  // Settings — مستند واحد (ليس query)
  if (!skip.has('settings')) {
    const settingsKey = 'settings/main';
    // hydrate من الكاش أولاً
    dataCache.getDoc('settings', 'main').then(result => {
      if (result.data) {
        AppState.settings = result.data;
        callbacks.onSettings?.(result.data, result.source);
      }
    });
    // listener للتحديث
    const unsub = onSnapshot(doc(db, 'settings', 'main'), snap => {
      if (snap.exists()) {
        const data = snap.data();
        AppState.settings = data;
        callbacks.onSettings?.(data, 'server');
        // تحديث الكاش
        memSet(settingsKey, data, 'settings');
        idbPut(STORE_DOCS, {
          _cacheKey: settingsKey,
          _collection: 'settings',
          _id: 'main',
          _syncedAt: Date.now(),
          data: serializeDoc(data),
        });
      }
    });
    unsubs.push(unsub);
  }

  // تسجيل cleanup
  AppState._unsubs = unsubs;
  return () => unsubs.forEach(u => u?.());
}

// ═══════════════════════════════════════
// Prefetch — تحميل مسبق لبيانات متوقعة
// ═══════════════════════════════════════
/**
 * تحميل مسبق لـ collection بالكامل في الكاش بدون اشتراك.
 * مفيد عند الانتقال بين الصفحات — الصفحة التالية تجد البيانات جاهزة.
 */
export async function prefetch(collectionName, constraintDescriptors, firestoreConstraints, limitVal) {
  const qLimit = limitVal || DEFAULT_QUERY_LIMIT;
  const queryKey = stableQueryKey(collectionName, constraintDescriptors);

  // لو موجود بالفعل في الكاش ولسه fresh → لا داعي
  const memHit = memGet(queryKey);
  if (memHit) return;

  const allConstraints = [...(firestoreConstraints || []), limit(qLimit)];
  const q = query(collection(db, collectionName), ...allConstraints);

  try {
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    memSet(queryKey, docs, collectionName);
    await dataCache._persistQueryResult(queryKey, collectionName, docs);
  } catch (err) {
    console.warn('[data-cache] prefetch error:', collectionName, err);
  }
}

// ═══════════════════════════════════════
// Cleanup عند إغلاق الصفحة
// ═══════════════════════════════════════
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    dataCache.unsubscribeAll();
  }, { once: true });
}

// ═══════════════════════════════════════
// تصدير للـ console (تصحيح الأخطاء)
// ═══════════════════════════════════════
if (typeof window !== 'undefined') {
  window.__dataCache = dataCache;
  window.__dataCacheStats = () => dataCache.getStats();
}

console.log('[data-cache] ✓ Cache & sync layer initialized');
